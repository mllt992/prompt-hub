import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { authOptional } from './auth.js';
import { UPLOAD_DIR, getSetting } from './db.js';
import db from './db.js';
import { rateLimit } from './ratelimit.js';
import authRoutes from './routes/auth.js';
import promptRoutes from './routes/prompts.js';
import userRoutes from './routes/users.js';
import uploadRoutes from './routes/upload.js';
import adminRoutes from './routes/admin.js';
import postRoutes from './routes/posts.js';
import notificationRoutes from './routes/notifications.js';
import reportRoutes from './routes/reports.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 14021;

await import('./seed.js');

const app = express();
// 限流键依赖 req.ip：反向代理后需配置 trust proxy 才能拿到真实 IP
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);
app.use(express.json({ limit: '2mb' }));

// 基础安全响应头
app.use((_req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use('/api', authOptional, (_req, _res, next) => next());

// 敏感接口限流（登录防爆破、注册防刷号、上传防灌盘）
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60_000, max: 15, message: '登录尝试过于频繁，请 15 分钟后再试' }));
app.use('/api/auth/register', rateLimit({ windowMs: 60 * 60_000, max: 5, message: '注册请求过于频繁，请稍后再试' }));
app.use('/api/upload', rateLimit({ windowMs: 60 * 60_000, max: 40, message: '上传过于频繁，请稍后再试' }));
app.use('/api/reports', rateLimit({ windowMs: 60 * 60_000, max: 15, message: '举报提交过于频繁，请稍后再试' }));

app.use('/api/auth', authRoutes);
app.use('/api/prompts', promptRoutes);
app.use('/api/users', userRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);

// 健康检查（供负载均衡 / 监控探活）
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uptime: Math.round(process.uptime()), now: new Date().toISOString() });
});

// 公开站点设置（注册页据此展示开放状态与是否需要邀请码，不泄露邀请码本身）
app.get('/api/settings', (_req, res) => {
  res.json({
    registration_open: getSetting('registration_open', '1') === '1',
    require_invite: getSetting('invite_code', '').trim() !== ''
  });
});

// 未匹配的 API 路径统一 404 JSON（避免落入 SPA 回退返回 HTML）
app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在' }));

// 上传文件静态托管：nosniff 防止浏览器嗅探执行
app.use(
  '/uploads',
  express.static(UPLOAD_DIR, {
    maxAge: '30d',
    setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff')
  })
);

// 为提示词详情页注入 OG meta（分享到社交平台有标题/封面预览）
function sendWithPromptMeta(req, res) {
  const distIndex = path.join(distDir, 'index.html');
  let html = fs.readFileSync(distIndex, 'utf8');
  try {
    const p = db
      .prepare(
        `SELECT p.title, p.description,
           (SELECT url FROM prompt_images pi WHERE pi.prompt_id = p.id ORDER BY pi.sort, pi.id LIMIT 1) AS cover
         FROM prompts p JOIN users u ON u.id = p.user_id
         WHERE p.id = ? AND p.visibility = 'public' AND u.status = 'active'`
      )
      .get(Number(req.params.id));
    if (p) {
      const host = req.headers.host || `localhost:${PORT}`;
      const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      const desc = esc((p.description || 'PromptHub 提示词分享').slice(0, 160));
      const cover = p.cover
        ? p.cover.startsWith('http') ? p.cover : `https://${host}${p.cover}`
        : '';
      const meta = [
        `<meta property="og:type" content="article">`,
        `<meta property="og:title" content="${esc(p.title)} — PromptHub">`,
        `<meta property="og:description" content="${desc}">`,
        `<meta property="og:url" content="https://${host}/prompt/${req.params.id}">`,
        `<meta name="twitter:card" content="${cover ? 'summary_large_image' : 'summary'}">`,
        cover ? `<meta property="og:image" content="${esc(cover)}">` : '',
        `<title>${esc(p.title)} — PromptHub</title>`
      ].filter(Boolean).join('\n    ');
    html = html.replace(/<title>[\s\S]*?<\/title>/, meta);
    }
  } catch {
    /* meta 注入失败则回退原始页面 */
  }
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

// 生产模式：托管前端构建产物（SPA 回退到 index.html）
const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { maxAge: '1h', index: false }));
  app.get('/prompt/:id(\\d+)', sendWithPromptMeta);
  app.get(/^(?!\/api|\/uploads).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`[prompt-hub] API 服务已启动: http://localhost:${PORT}`);
});
