import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import path from 'node:path';
import db, { DATA_DIR } from './db.js';

const secretFile = path.join(DATA_DIR, '.jwt-secret');
let secret;
try {
  secret = fs.readFileSync(secretFile, 'utf8').trim();
} catch {
  secret = crypto.randomUUID() + '-' + Date.now();
  fs.writeFileSync(secretFile, secret, { encoding: 'utf8' });
}
export const JWT_SECRET = secret;

export function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, pv: user.pwd_version ?? 0 },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// 从数据库读取用户最新状态（角色 / 封禁 / 密码版本），封禁后已有 token 立即失效
function loadFreshUser(id) {
  return db.prepare('SELECT id, username, role, status, pwd_version FROM users WHERE id = ?').get(id);
}

// 校验 token 里的密码版本是否仍与库中一致（改密后旧会话全部失效）
function isTokenFresh(payload, user) {
  return (payload.pv ?? 0) === (user.pwd_version ?? 0);
}

// 可选认证：有有效 token 就解析出 user（含角色），没有也放行
export function authOptional(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const user = loadFreshUser(payload.id);
      if (user && user.status === 'active' && isTokenFresh(payload, user)) req.user = user;
    } catch {
      /* token 过期或无效则视为未登录 */
    }
  }
  next();
}

// 强制认证：每次都回库校验状态，被封禁的账号直接拒绝
export function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: '请先登录' });
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
  const user = loadFreshUser(payload.id);
  if (!user) return res.status(401).json({ error: '用户不存在' });
  if (user.status === 'banned') return res.status(403).json({ error: '账号已被封禁，请联系管理员' });
  if (!isTokenFresh(payload, user)) {
    return res.status(401).json({ error: '登录状态已失效（密码已变更），请重新登录' });
  }
  req.user = user;
  next();
}

// 管理员强制认证
export function adminRequired(req, res, next) {
  authRequired(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
    next();
  });
}
