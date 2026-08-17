import { Router } from 'express';
import db, { notify } from '../db.js';
import { authRequired, authOptional } from '../auth.js';
import { rateLimit } from '../ratelimit.js';

const router = Router();

/* ============================================================
   动态推荐流水线（参考 xai-org/x-algorithm，即 X 平台 For You）
   在 SQLite 规模上还原其阶段化架构，以真实互动统计替代 ML 预测：

   1. Candidate Sourcing（双候选源）
      - In-Network（对应 Thunder）：关注作者的动态
      - Out-of-Network（对应 Phoenix 检索）：非关注作者的公开动态
   2. Pre-Scoring Filters
      - 过滤被封禁作者；登录用户过滤自己的动态（对应自帖过滤）
   3. Scoring（多行为概率 × 权重，对应 WeightedScorer）
      score = Σ weight_i × P(action_i)，行为概率由统计估计：
      - P(like)      = like_count / (like_count + 4)      点赞倾向（饱和归一）
      - P(link)      = 关联提示词 ? 1 : 0                  点击/互动代理
      - P(follow)    = author_followers / (followers + 5) 作者吸引力代理
      - P(fresh)     = exp(-age_hours / HALF_LIFE_H)      时间衰减
   4. Author Diversity Scorer
      - 按分数排序后，同一作者第 n 次出现 score × DIVERSITY^(n-1)
   5. Selection：取分页窗口
   ============================================================ */
const WEIGHTS = { like: 3, link: 1.5, follow: 2, fresh: 6 };
const HALF_LIFE_H = 48; // 两天热度半衰期
const DIVERSITY = 0.6; // 同作者重复出现衰减系数
const CANDIDATE_WINDOW = 800; // 推荐候选窗口：只取最近 N 条参与打分，避免全表扫描

const candidateSelect = `
  SELECT p.id, p.user_id, p.content, p.created_at,
    u.username, u.display_name, u.avatar,
    (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS like_count,
    pr.id AS pr_id, pr.user_id AS pr_user_id, pr.title AS pr_title, pr.category AS pr_category, pr.visibility AS pr_visibility, pr.nsfw AS pr_nsfw,
    (SELECT url FROM prompt_images pi WHERE pi.prompt_id = pr.id ORDER BY pi.sort, pi.id LIMIT 1) AS pr_cover,
    (SELECT COUNT(*) FROM follows f WHERE f.followee_id = p.user_id) AS author_followers
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
    // 关联的私密提示词只对作者本人展示，避免他人点击后 404
    prompt:
      r.pr_id && (r.pr_visibility === 'public' || userId === r.pr_user_id)
        ? {
            id: r.pr_id,
            title: r.pr_title,
            category: r.pr_category,
            visibility: r.pr_visibility,
            nsfw: !!r.pr_nsfw,
            cover: r.pr_cover || ''
          }
        : null
  }));
}

const ageHours = (createdAt) =>
  Math.max(0, (Date.now() - new Date(createdAt.replace(' ', 'T') + 'Z').getTime()) / 3600000);

function scoreCandidates(rows, { excludeUserId }) {
  return rows
    .filter((r) => r.user_id !== excludeUserId) // 自帖过滤
    .map((r) => {
      const pLike = r.like_count / (r.like_count + 4);
      const pLink = r.pr_id ? 1 : 0;
      const pFollow = r.author_followers / (r.author_followers + 5);
      const pFresh = Math.exp(-ageHours(r.created_at) / HALF_LIFE_H);
      return {
        row: r,
        score:
          WEIGHTS.like * pLike +
          WEIGHTS.link * pLink +
          WEIGHTS.follow * pFollow +
          WEIGHTS.fresh * pFresh
      };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ row, score }, _idx, arr) => {
      // Author Diversity Scorer：对同作者重复出现做分数衰减
      const seen = arr.slice(0, _idx).filter((x) => x.row.user_id === row.user_id).length;
      return { row, score: score * Math.pow(DIVERSITY, seen) };
    })
    .sort((a, b) => b.score - a.score);
}

// ---------- 信息流 ----------
router.get('/feed', authOptional, (req, res) => {
  const tab = req.query.tab === 'following' ? 'following' : 'recommend';
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 20));
  const me = req.user?.id;

  // 增量检查：返回比 since_id 更新的动态数量（用于“N 条新动态”提示）
  if (req.query.since_id) {
    const since = parseInt(req.query.since_id) || 0;
    let newCount;
    if (tab === 'following' && me) {
      newCount = db
        .prepare(
          `SELECT COUNT(*) AS c FROM posts p JOIN users u ON u.id = p.user_id
           WHERE p.id > ? AND u.status = 'active'
             AND p.user_id IN (SELECT followee_id FROM follows WHERE follower_id = ?)`
        )
        .get(since, me).c;
    } else {
      newCount = db
        .prepare(
          `SELECT COUNT(*) AS c FROM posts p JOIN users u ON u.id = p.user_id
           WHERE p.id > ? AND u.status = 'active' AND p.user_id != ?`
        )
        .get(since, me || -1).c;
    }
    return res.json({ new_count: newCount });
  }

  if (tab === 'following') {
    if (!me) return res.json({ items: [], total: 0, page, pageSize, needLogin: true });
    const where = `p.user_id IN (SELECT followee_id FROM follows WHERE follower_id = ?) AND u.status = 'active'`;
    const total = db
      .prepare(`SELECT COUNT(*) AS c FROM posts p JOIN users u ON u.id = p.user_id WHERE ${where}`)
      .get(me).c;
    const rows = db
      .prepare(`${candidateSelect} WHERE ${where} ORDER BY p.id DESC LIMIT ? OFFSET ?`)
      .all(me, pageSize, (page - 1) * pageSize);
    return res.json({ items: serializePosts(rows, me), total, page, pageSize });
  }

  // 推荐流：最近候选窗口 → 打分 → 多样性衰减 → 分页
  const rows = db
    .prepare(`${candidateSelect} WHERE u.status = 'active' ORDER BY p.id DESC LIMIT ${CANDIDATE_WINDOW}`)
    .all();
  const ranked = scoreCandidates(rows, { excludeUserId: me || -1 });
  const total = ranked.length;
  const slice = ranked.slice((page - 1) * pageSize, page * pageSize).map((x) => x.row);
  res.json({ items: serializePosts(slice, me), total, page, pageSize });
});

// ---------- 发布 / 删除 ----------
router.post('/', authRequired, rateLimit({ windowMs: 60 * 60_000, max: 60, message: '发布过于频繁，请稍后再试' }), (req, res) => {
  const content = String(req.body?.content || '').trim();
  if (!content || content.length > 500) {
    return res.status(400).json({ error: '动态内容需为 1-500 字' });
  }
  let promptId = null;
  if (req.body?.prompt_id) {
    const p = db.prepare('SELECT id, user_id FROM prompts WHERE id = ?').get(req.body.prompt_id);
    if (!p || p.user_id !== req.user.id) {
      return res.status(400).json({ error: '只能关联自己的提示词' });
    }
    promptId = p.id;
  }
  const info = db
    .prepare('INSERT INTO posts (user_id, content, prompt_id) VALUES (?, ?, ?)')
    .run(req.user.id, content, promptId);
  const row = db.prepare(`${candidateSelect} WHERE p.id = ?`).get(info.lastInsertRowid);
  res.status(201).json(serializePosts([row], req.user.id)[0]);
});

router.delete('/:id(\\d+)', authRequired, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: '动态不存在' });
  if (post.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: '只能删除自己的动态' });
  }
  db.prepare('DELETE FROM posts WHERE id = ?').run(post.id);
  res.json({ ok: true });
});

// ---------- 点赞 ----------
router.post('/:id(\\d+)/like', authRequired, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: '动态不存在' });
  const exists = db
    .prepare('SELECT 1 FROM post_likes WHERE user_id = ? AND post_id = ?')
    .get(req.user.id, post.id);
  if (exists) {
    db.prepare('DELETE FROM post_likes WHERE user_id = ? AND post_id = ?').run(req.user.id, post.id);
  } else {
    db.prepare('INSERT INTO post_likes (user_id, post_id) VALUES (?, ?)').run(req.user.id, post.id);
    notify(post.user_id, req.user.id, 'post_like', post.id);
  }
  const count = db.prepare('SELECT COUNT(*) AS c FROM post_likes WHERE post_id = ?').get(post.id).c;
  res.json({ active: !exists, count });
});

export default router;
