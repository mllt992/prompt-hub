import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db, { getSetting } from '../db.js';
import { signToken, authRequired } from '../auth.js';

const router = Router();

// 保留用户名：防止仿冒官方 / 关键路径造成钓鱼
const RESERVED_NAMES = new Set([
  'admin', 'administrator', 'root', 'system', 'official', 'support', 'staff',
  'moderator', 'mod', 'help', 'api', 'site', 'www', 'mail', 'noreply', 'prompthub',
  'me', 'login', 'register', 'settings', 'admin1', 'test'
]);

const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  display_name: u.display_name || '',
  website: u.website || '',
  email: u.email,
  bio: u.bio || '',
  avatar: u.avatar || '',
  role: u.role || 'user',
  status: u.status || 'active',
  created_at: u.created_at
});

// 头像只允许 http(s) 外链或本站上传路径
const validAvatar = (v) =>
  !v || /^https?:\/\/\S+\.\S+/.test(v) || /^\/uploads\/[\w.-]+$/.test(v);

// 注册：受站点设置控制（是否开放、是否需要邀请码）
router.post('/register', async (req, res) => {
  if (getSetting('registration_open', '1') !== '1') {
    return res.status(403).json({ error: '注册已关闭，请联系管理员' });
  }
  const { username, email, password, inviteCode } = req.body || {};
  const requiredCode = getSetting('invite_code', '').trim();
  if (requiredCode && String(inviteCode || '').trim() !== requiredCode) {
    return res.status(400).json({ error: '邀请码不正确' });
  }
  if (!username || !/^[a-zA-Z0-9_-]{2,20}$/.test(username)) {
    return res.status(400).json({ error: '用户名需为 2-20 位字母、数字、下划线或短横线' });
  }
  if (RESERVED_NAMES.has(username.toLowerCase())) {
    return res.status(400).json({ error: '该用户名为系统保留名，请换一个' });
  }
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: '邮箱格式不正确' });
  }
  if (!password || password.length < 6 || password.length > 72) {
    return res.status(400).json({ error: '密码需为 6-72 位' });
  }
  const exists = db
    .prepare('SELECT id FROM users WHERE username = ? OR email = ?')
    .get(username, email);
  if (exists) return res.status(409).json({ error: '用户名或邮箱已被注册' });

  const hash = await bcrypt.hash(password, 10);
  const info = db
    .prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)')
    .run(username, email, hash);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  const user = db
    .prepare('SELECT * FROM users WHERE username = ? OR email = ?')
    .get(username || '', username || '');
  const ok = user ? await bcrypt.compare(password || '', user.password_hash) : false;
  if (!user || !ok) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  if (user.status === 'banned') {
    return res.status(403).json({ error: '账号已被封禁，请联系管理员' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', authRequired, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(401).json({ error: '用户不存在' });
  res.json({ user: publicUser(user) });
});

router.put('/me', authRequired, (req, res) => {
  const { bio, avatar, display_name, website } = req.body || {};
  const name = typeof display_name === 'string' ? display_name.trim().slice(0, 30) : '';
  const site = typeof website === 'string' ? website.trim() : '';
  if (site && !/^https?:\/\/\S+\.\S+/.test(site)) {
    return res.status(400).json({ error: '个人网站需为合法 URL（以 http/https 开头）' });
  }
  const avatarVal = typeof avatar === 'string' ? avatar.trim().slice(0, 500) : '';
  if (!validAvatar(avatarVal)) {
    return res.status(400).json({ error: '头像需为合法图片 URL' });
  }
  db.prepare('UPDATE users SET bio = ?, avatar = ?, display_name = ?, website = ? WHERE id = ?').run(
    typeof bio === 'string' ? bio.slice(0, 200) : '',
    avatarVal,
    name,
    site.slice(0, 200),
    req.user.id
  );
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(user) });
});

// 修改自己的密码：成功后 pwd_version +1，所有旧 token 立即失效
router.put('/password', authRequired, async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  const ok = await bcrypt.compare(String(oldPassword || ''), row.password_hash);
  if (!ok) {
    return res.status(400).json({ error: '原密码不正确' });
  }
  if (!newPassword || String(newPassword).length < 6 || String(newPassword).length > 72) {
    return res.status(400).json({ error: '新密码需为 6-72 位' });
  }
  const hash = await bcrypt.hash(String(newPassword), 10);
  db.prepare('UPDATE users SET password_hash = ?, pwd_version = pwd_version + 1 WHERE id = ?').run(
    hash,
    req.user.id
  );
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ ok: true, token: signToken(user) });
});

export default router;
