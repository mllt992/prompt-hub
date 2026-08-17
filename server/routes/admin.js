import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db, { getSetting, setSetting, logAdmin, deleteUploadFiles } from '../db.js';
import { adminRequired } from '../auth.js';

const router = Router();
router.use(adminRequired);

const CATEGORIES = ['text', 'image', 'video', 'project', 'other'];

function paginate(req, def = 20) {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || def));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

// ---------- 概览统计 ----------
router.get('/stats', (_req, res) => {
  const one = (sql) => db.prepare(sql).get().c;
  res.json({
    users: one('SELECT COUNT(*) AS c FROM users'),
    admins: one("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'"),
    banned: one("SELECT COUNT(*) AS c FROM users WHERE status = 'banned'"),
    prompts: one('SELECT COUNT(*) AS c FROM prompts'),
    publicPrompts: one("SELECT COUNT(*) AS c FROM prompts WHERE visibility = 'public'"),
    privatePrompts: one("SELECT COUNT(*) AS c FROM prompts WHERE visibility = 'private'"),
    posts: one('SELECT COUNT(*) AS c FROM posts'),
    views: one('SELECT COALESCE(SUM(views), 0) AS c FROM prompts'),
    likes: one('SELECT COUNT(*) AS c FROM likes'),
    todayUsers: one("SELECT COUNT(*) AS c FROM users WHERE created_at >= datetime('now','localtime','start of day')"),
    todayPosts: one("SELECT COUNT(*) AS c FROM posts WHERE created_at >= datetime('now','localtime','start of day')"),
    openReports: one("SELECT COUNT(*) AS c FROM reports WHERE status = 'open'")
  });
});

// ---------- 操作日志 ----------
router.get('/logs', (req, res) => {
  const { page = 1, pageSize = 50 } = paginate(req);
  const action = String(req.query.action || '').trim();
  const where = action ? 'WHERE l.action LIKE ?' : '';
  const params = action ? [`%${action}%`] : [];
  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM admin_logs l ${where}`)
    .get(...params).c;
  const rows = db
    .prepare(
      `SELECT l.id, l.action, l.detail, l.created_at, u.username AS admin_name
       FROM admin_logs l JOIN users u ON u.id = l.admin_id
       ${where} ORDER BY l.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize);
  res.json({ items: rows, total, page, pageSize });
});

// ---------- 用户管理 ----------
const userSelect = `
  SELECT u.id, u.username, u.display_name, u.email, u.role, u.status, u.avatar, u.created_at,
    (SELECT COUNT(*) FROM prompts p WHERE p.user_id = u.id) AS prompt_count,
    (SELECT COUNT(*) FROM posts po WHERE po.user_id = u.id) AS post_count
  FROM users u
`;

router.get('/users', (req, res) => {
  const { page, pageSize, offset } = paginate(req);
  const q = String(req.query.q || '').trim();
  const where = q ? 'WHERE u.username LIKE ? OR u.email LIKE ? OR u.display_name LIKE ?' : '';
  const params = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];
  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM users u ${where}`)
    .get(...params).c;
  const rows = db
    .prepare(`${userSelect} ${where} ORDER BY u.id DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset);
  res.json({ items: rows, total, page, pageSize });
});

// 用户详情：资料 + 统计 + 近期内容
router.get('/users/:id(\\d+)', (req, res) => {
  const u = db
    .prepare('SELECT id, username, display_name, email, bio, avatar, website, role, status, created_at FROM users WHERE id = ?')
    .get(req.params.id);
  if (!u) return res.status(404).json({ error: '用户不存在' });

  const stats = {
    promptsTotal: db.prepare('SELECT COUNT(*) AS c FROM prompts WHERE user_id = ?').get(u.id).c,
    promptsPublic: db.prepare("SELECT COUNT(*) AS c FROM prompts WHERE user_id = ? AND visibility = 'public'").get(u.id).c,
    posts: db.prepare('SELECT COUNT(*) AS c FROM posts WHERE user_id = ?').get(u.id).c,
    followers: db.prepare('SELECT COUNT(*) AS c FROM follows WHERE followee_id = ?').get(u.id).c,
    following: db.prepare('SELECT COUNT(*) AS c FROM follows WHERE follower_id = ?').get(u.id).c,
    likesReceived: db
      .prepare('SELECT COUNT(*) AS c FROM likes l JOIN prompts p ON p.id = l.prompt_id WHERE p.user_id = ?')
      .get(u.id).c
  };
  const recentPrompts = db
    .prepare(
      'SELECT id, title, category, visibility, nsfw, views, created_at FROM prompts WHERE user_id = ? ORDER BY id DESC LIMIT 5'
    )
    .all(u.id);
  const recentPosts = db
    .prepare('SELECT id, content, created_at FROM posts WHERE user_id = ? ORDER BY id DESC LIMIT 5')
    .all(u.id);
  res.json({ user: u, stats, recentPrompts, recentPosts });
});

// 修改用户角色 / 状态（不能对自己操作，避免自锁）
router.put('/users/:id(\\d+)', (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: '用户不存在' });
  if (target.id === req.user.id) {
    return res.status(400).json({ error: '不能修改自己的角色或状态' });
  }
  const { role, status } = req.body || {};
  if (role !== undefined) {
    if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: '角色不合法' });
    // 撤销管理员时必须保证系统仍有其他管理员，否则后台将无人可管
    if (role === 'user' && target.role === 'admin') {
      const adminCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get().c;
      if (adminCount <= 1) {
        return res.status(400).json({ error: '系统至少需要保留一名管理员，请先指定其他管理员' });
      }
    }
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, target.id);
    logAdmin(req.user.id, 'set_role', `${target.username} → ${role}`);
  }
  if (status !== undefined) {
    if (!['active', 'banned'].includes(status)) return res.status(400).json({ error: '状态不合法' });
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, target.id);
    logAdmin(req.user.id, status === 'banned' ? 'ban_user' : 'unban_user', target.username);
  }
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(target.id);
  res.json({
    user: {
      id: updated.id, username: updated.username, email: updated.email,
      role: updated.role, status: updated.status, created_at: updated.created_at
    }
  });
});

// 管理员重置用户密码（同时吊销该用户全部已登录会话）
router.put('/users/:id(\\d+)/password', (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: '用户不存在' });
  const newPassword = String(req.body?.newPassword || '');
  if (newPassword.length < 6 || newPassword.length > 72) {
    return res.status(400).json({ error: '新密码需为 6-72 位' });
  }
  db.prepare('UPDATE users SET password_hash = ?, pwd_version = pwd_version + 1 WHERE id = ?').run(
    bcrypt.hashSync(newPassword, 10),
    target.id
  );
  logAdmin(req.user.id, 'reset_password', target.username);
  res.json({ ok: true });
});

// 删除用户（外键级联删除其提示词、动态、点赞、收藏、关注；并回收其上传文件）
router.delete('/users/:id(\\d+)', (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: '用户不存在' });
  if (target.id === req.user.id) return res.status(400).json({ error: '不能删除自己' });
  if (target.role === 'admin') {
    const adminCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get().c;
    if (adminCount <= 1) {
      return res.status(400).json({ error: '系统至少需要保留一名管理员' });
    }
  }
  const prompts = db.prepare('SELECT COUNT(*) AS c FROM prompts WHERE user_id = ?').get(target.id).c;
  const posts = db.prepare('SELECT COUNT(*) AS c FROM posts WHERE user_id = ?').get(target.id).c;
  const uploadUrls = db
    .prepare(
      `SELECT pi.url FROM prompt_images pi JOIN prompts p ON p.id = pi.prompt_id WHERE p.user_id = ? AND pi.url LIKE '/uploads/%'
       UNION SELECT avatar AS url FROM users WHERE id = ? AND avatar LIKE '/uploads/%'`
    )
    .all(target.id, target.id)
    .map((r) => r.url);
  db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
  deleteUploadFiles(uploadUrls);
  logAdmin(req.user.id, 'delete_user', `${target.username}（提示词 ${prompts}、动态 ${posts}）`);
  res.json({ ok: true, deletedPrompts: prompts, deletedPosts: posts });
});

// ---------- 提示词管理（含私密） ----------
router.get('/prompts', (req, res) => {
  const { page, pageSize, offset } = paginate(req);
  const { q, visibility, category, username, sort } = req.query;
  const where = [];
  const params = [];
  if (q) {
    where.push('(p.title LIKE ? OR p.tags LIKE ? OR u.username LIKE ?)');
    const kw = `%${String(q).slice(0, 60)}%`;
    params.push(kw, kw, kw);
  }
  if (visibility === 'public' || visibility === 'private') {
    where.push('p.visibility = ?');
    params.push(visibility);
  }
  if (category && CATEGORIES.includes(category)) {
    where.push('p.category = ?');
    params.push(category);
  }
  if (username) {
    where.push('u.username = ?');
    params.push(String(username).slice(0, 30));
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderBy = sort === 'hot' ? 'p.views DESC, p.id DESC' : 'p.id DESC';

  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM prompts p JOIN users u ON u.id = p.user_id ${whereSql}`)
    .get(...params).c;
  const rows = db
    .prepare(
      `SELECT p.id, p.title, p.category, p.visibility, p.nsfw, p.views, p.created_at, p.user_id, u.username,
        (SELECT COUNT(*) FROM likes l WHERE l.prompt_id = p.id) AS like_count
       FROM prompts p JOIN users u ON u.id = p.user_id
       ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);
  res.json({ items: rows, total, page, pageSize });
});

// 提示词完整内容（预览）
router.get('/prompts/:id(\\d+)', (req, res) => {
  const row = db
    .prepare(
      `SELECT p.*, u.username,
        (SELECT COUNT(*) FROM likes l WHERE l.prompt_id = p.id) AS like_count
       FROM prompts p JOIN users u ON u.id = p.user_id WHERE p.id = ?`
    )
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: '提示词不存在' });
  const images = db
    .prepare('SELECT url FROM prompt_images WHERE prompt_id = ? ORDER BY sort, id')
    .all(row.id)
    .map((i) => i.url);
  res.json({ prompt: { ...row, images } });
});

// 强制切换任意提示词可见性
router.patch('/prompts/:id(\\d+)/visibility', (req, res) => {
  const row = db.prepare('SELECT * FROM prompts WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '提示词不存在' });
  const next = row.visibility === 'public' ? 'private' : 'public';
  db.prepare('UPDATE prompts SET visibility = ? WHERE id = ?').run(next, row.id);
  logAdmin(req.user.id, 'prompt_visibility', `#${row.id} ${row.title} → ${next === 'public' ? '公开' : '私密'}`);
  res.json({ visibility: next });
});

// 强制设置 NSFW 标记（作者漏标时管理员兜底）
router.patch('/prompts/:id(\\d+)/nsfw', (req, res) => {
  const row = db.prepare('SELECT * FROM prompts WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '提示词不存在' });
  const nsfw = req.body?.nsfw ? 1 : 0;
  db.prepare('UPDATE prompts SET nsfw = ? WHERE id = ?').run(nsfw, row.id);
  logAdmin(req.user.id, 'prompt_nsfw', `#${row.id} ${row.title} → ${nsfw ? 'NSFW' : '非 NSFW'}`);
  res.json({ nsfw: !!nsfw });
});

// 删除任意提示词（并回收其上传的图片文件）
router.delete('/prompts/:id(\\d+)', (req, res) => {
  const row = db.prepare('SELECT * FROM prompts WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '提示词不存在' });
  const uploadUrls = db
    .prepare("SELECT url FROM prompt_images WHERE prompt_id = ? AND url LIKE '/uploads/%'")
    .all(row.id)
    .map((r) => r.url);
  db.prepare('DELETE FROM prompts WHERE id = ?').run(row.id);
  deleteUploadFiles(uploadUrls);
  logAdmin(req.user.id, 'delete_prompt', `#${row.id} ${row.title}`);
  res.json({ ok: true });
});

// ---------- 动态管理 ----------
router.get('/posts', (req, res) => {
  const { page, pageSize, offset } = paginate(req);
  const q = String(req.query.q || '').trim();
  const where = [];
  const params = [];
  if (q) {
    where.push('(p.content LIKE ? OR u.username LIKE ?)');
    const kw = `%${q.slice(0, 60)}%`;
    params.push(kw, kw);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM posts p JOIN users u ON u.id = p.user_id ${whereSql}`)
    .get(...params).c;
  const rows = db
    .prepare(
      `SELECT p.id, p.user_id, p.content, p.created_at, u.username,
        (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS like_count,
        (SELECT pr.title FROM prompts pr WHERE pr.id = p.prompt_id) AS prompt_title
       FROM posts p JOIN users u ON u.id = p.user_id
       ${whereSql} ORDER BY p.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);
  res.json({ items: rows, total, page, pageSize });
});

router.delete('/posts/:id(\\d+)', (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: '动态不存在' });
  db.prepare('DELETE FROM posts WHERE id = ?').run(post.id);
  logAdmin(req.user.id, 'delete_post', `#${post.id} ${post.content.slice(0, 30)}`);
  res.json({ ok: true });
});

// ---------- 举报管理 ----------
router.get('/reports', (req, res) => {
  const { page, pageSize, offset } = paginate(req);
  const status = ['open', 'resolved', 'dismissed'].includes(req.query.status)
    ? req.query.status
    : '';
  const where = status ? 'WHERE r.status = ?' : '';
  const params = status ? [status] : [];
  const total = db.prepare(`SELECT COUNT(*) AS c FROM reports r ${where}`).get(...params).c;
  const rows = db
    .prepare(
      `SELECT r.*, u.username AS reporter,
        (SELECT title FROM prompts WHERE id = r.target_id) AS prompt_title,
        (SELECT content FROM posts WHERE id = r.target_id) AS post_content,
        (SELECT username FROM users WHERE id = r.target_id) AS target_username,
        (SELECT visibility FROM prompts WHERE id = r.target_id) AS target_visibility
       FROM reports r JOIN users u ON u.id = r.user_id
       ${where} ORDER BY (r.status = 'open') DESC, r.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);
  const openCount = db.prepare("SELECT COUNT(*) AS c FROM reports WHERE status = 'open'").get().c;
  res.json({ items: rows, total, page, pageSize, openCount });
});

// 处理举报：resolved（已处置）/ dismissed（驳回）
router.put('/reports/:id(\\d+)', (req, res) => {
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!report) return res.status(404).json({ error: '举报不存在' });
  const status = req.body?.status;
  if (!['resolved', 'dismissed'].includes(status)) {
    return res.status(400).json({ error: '状态不合法' });
  }
  db.prepare('UPDATE reports SET status = ? WHERE id = ?').run(status, report.id);
  logAdmin(req.user.id, `report_${status}`, `#${report.id} ${report.target_type}#${report.target_id} ${report.reason}`);
  res.json({ ok: true });
});

// ---------- 站点设置 ----------
router.get('/settings', (_req, res) => {
  res.json({
    registration_open: getSetting('registration_open', '1') === '1',
    invite_code: getSetting('invite_code', '')
  });
});

router.put('/settings', (req, res) => {
  const { registration_open, invite_code } = req.body || {};
  if (registration_open !== undefined) {
    setSetting('registration_open', registration_open ? '1' : '0');
  }
  if (invite_code !== undefined) {
    const code = String(invite_code).trim().slice(0, 32);
    setSetting('invite_code', code);
  }
  logAdmin(req.user.id, 'update_settings', `注册${getSetting('registration_open') === '1' ? '开放' : '关闭'} · 邀请码${getSetting('invite_code') ? '已设置' : '无'}`);
  res.json({
    registration_open: getSetting('registration_open', '1') === '1',
    invite_code: getSetting('invite_code', '')
  });
});

export default router;
