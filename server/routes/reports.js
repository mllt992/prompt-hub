import { Router } from 'express';
import db from '../db.js';
import { authRequired } from '../auth.js';

const router = Router();

const REASONS = ['违规内容', '垃圾信息 / 广告', 'NSFW 未标记', '侵权 / 抄袭', '其他'];

// 提交举报（登录用户）
router.post('/', authRequired, (req, res) => {
  const { target_type, target_id, reason, detail } = req.body || {};
  if (!['prompt', 'post', 'user'].includes(target_type)) {
    return res.status(400).json({ error: '举报对象类型不合法' });
  }
  const id = parseInt(target_id);
  if (!id || id < 1) return res.status(400).json({ error: '举报对象不合法' });

  const exists =
    target_type === 'prompt'
      ? db.prepare('SELECT id, user_id FROM prompts WHERE id = ?').get(id)
      : target_type === 'post'
        ? db.prepare('SELECT id, user_id FROM posts WHERE id = ?').get(id)
        : db.prepare("SELECT id FROM users WHERE id = ? AND role != 'admin'").get(id);
  if (!exists) return res.status(404).json({ error: '举报对象不存在' });

  if (!REASONS.includes(reason)) return res.status(400).json({ error: '请选择举报理由' });

  // 同一用户对同一对象只保留一条未处理举报
  const dup = db
    .prepare("SELECT id FROM reports WHERE user_id = ? AND target_type = ? AND target_id = ? AND status = 'open'")
    .get(req.user.id, target_type, id);
  if (dup) return res.status(409).json({ error: '你已举报过该内容，管理员会尽快处理' });

  db.prepare(
    'INSERT INTO reports (user_id, target_type, target_id, reason, detail) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, target_type, id, reason, String(detail || '').slice(0, 500));
  res.status(201).json({ ok: true });
});

export const REPORT_REASONS = REASONS;
export default router;
