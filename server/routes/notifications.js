import { Router } from 'express';
import db from '../db.js';
import { authRequired } from '../auth.js';

const router = Router();

const NOTIF_SELECT = `
  SELECT n.id, n.type, n.target_id, n.read, n.created_at,
    a.id AS actor_id, a.username AS actor_username, a.display_name AS actor_display_name, a.avatar AS actor_avatar,
    (SELECT title FROM prompts WHERE id = n.target_id AND n.type IN ('prompt_like','comment')) AS prompt_title,
    (SELECT content FROM posts WHERE id = n.target_id AND n.type = 'post_like') AS post_content
  FROM notifications n
  JOIN users a ON a.id = n.actor_id
`;

router.get('/', authRequired, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 20));
  const unread = db
    .prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0')
    .get(req.user.id).c;
  const rows = db
    .prepare(`${NOTIF_SELECT} WHERE n.user_id = ? ORDER BY n.id DESC LIMIT ? OFFSET ?`)
    .all(req.user.id, pageSize, (page - 1) * pageSize);
  res.json({ items: rows, unread, page, pageSize });
});

// 未读数（供导航栏轮询）
router.get('/unread-count', authRequired, (req, res) => {
  const c = db
    .prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0')
    .get(req.user.id).c;
  res.json({ unread: c });
});

// 全部已读
router.post('/read-all', authRequired, (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

export default router;
