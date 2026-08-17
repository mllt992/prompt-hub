import { Router } from 'express';
import db, { notify } from '../db.js';
import { authRequired, authOptional } from '../auth.js';

const router = Router();

// ---------- 动态序列化（与 posts 路由保持一致的精简版） ----------
const postSelect = `
  SELECT p.id, p.user_id, p.content, p.created_at,
    u.username, u.display_name, u.avatar,
    (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS like_count,
    pr.id AS pr_id, pr.title AS pr_title, pr.category AS pr_category, pr.visibility AS pr_visibility, pr.nsfw AS pr_nsfw,
    (SELECT url FROM prompt_images pi WHERE pi.prompt_id = pr.id ORDER BY pi.sort, pi.id LIMIT 1) AS pr_cover
  FROM posts p
  JOIN users u ON u.id = p.user_id
  LEFT JOIN prompts pr ON pr.id = p.prompt_id
`;

function serializePosts(rows, userId) {
  const likedStmt = userId
    ? db.prepare('SELECT 1 FROM post_likes WHERE user_id = ? AND post_id = ?')
    : null;
  return rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    username: r.username,
    display_name: r.display_name || '',
    avatar: r.avatar,
    content: r.content,
    created_at: r.created_at,
    like_count: r.like_count,
    liked: likedStmt ? !!likedStmt.get(userId, r.id) : false,
    prompt: r.pr_id
      ? { id: r.pr_id, title: r.pr_title, category: r.pr_category, visibility: r.pr_visibility, nsfw: !!r.pr_nsfw, cover: r.pr_cover || '' }
      : null
  }));
}

// ---------- 个人主页：信息 + 汇总统计 ----------
router.get('/:username', authOptional, (req, res) => {
  const user = db
    .prepare(
      "SELECT id, username, display_name, website, bio, avatar, created_at, status FROM users WHERE username = ?"
    )
    .get(String(req.params.username).slice(0, 30));
  if (!user || user.status === 'banned') return res.status(404).json({ error: '用户不存在' });
  const { status, ...publicInfo } = user;

  const me = req.user?.id;
  const stats = {
    prompts: db
      .prepare("SELECT COUNT(*) AS c FROM prompts WHERE user_id = ? AND visibility = 'public'")
      .get(user.id).c,
    likes: db
      .prepare('SELECT COUNT(*) AS c FROM likes l JOIN prompts p ON p.id = l.prompt_id WHERE p.user_id = ?')
      .get(user.id).c,
    views: db
      .prepare("SELECT COALESCE(SUM(views), 0) AS c FROM prompts WHERE user_id = ? AND visibility = 'public'")
      .get(user.id).c,
    posts: db.prepare('SELECT COUNT(*) AS c FROM posts WHERE user_id = ?').get(user.id).c,
    followers: db.prepare('SELECT COUNT(*) AS c FROM follows WHERE followee_id = ?').get(user.id).c,
    following: db.prepare('SELECT COUNT(*) AS c FROM follows WHERE follower_id = ?').get(user.id).c,
    is_following: me
      ? !!db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?').get(me, user.id)
      : false
  };
  res.json({ user: publicInfo, stats });
});

// ---------- 关注 / 取关（toggle） ----------
router.post('/:username/follow', authRequired, (req, res) => {
  const target = db
    .prepare('SELECT id, username FROM users WHERE username = ?')
    .get(String(req.params.username).slice(0, 30));
  if (!target) return res.status(404).json({ error: '用户不存在' });
  if (target.id === req.user.id) {
    return res.status(400).json({ error: '不能关注自己' });
  }
  const exists = db
    .prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?')
    .get(req.user.id, target.id);
  if (exists) {
    db.prepare('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?').run(req.user.id, target.id);
  } else {
    db.prepare('INSERT INTO follows (follower_id, followee_id) VALUES (?, ?)').run(req.user.id, target.id);
    notify(target.id, req.user.id, 'follow', req.user.id);
  }
  const followers = db.prepare('SELECT COUNT(*) AS c FROM follows WHERE followee_id = ?').get(target.id).c;
  res.json({ following: !exists, followers });
});

// ---------- 某用户的动态列表（个人主页动态标签页） ----------
router.get('/:username/posts', authOptional, (req, res) => {
  const user = db
    .prepare("SELECT id, status FROM users WHERE username = ?")
    .get(String(req.params.username).slice(0, 30));
  if (!user || user.status === 'banned') return res.status(404).json({ error: '用户不存在' });

  const rows = db
    .prepare(`${postSelect} WHERE p.user_id = ? ORDER BY p.id DESC LIMIT 100`)
    .all(user.id);
  res.json({ items: serializePosts(rows, req.user?.id) });
});

export default router;
