import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { UPLOAD_DIR } from '../db.js';
import { authRequired } from '../auth.js';

const router = Router();

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }
});

// 不再接受 SVG：SVG 可内嵌脚本，经同源静态托管会成为存储型 XSS
const ALLOWED_MIME = /^image\/(png|jpe?g|gif|webp|avif)$/;

// 文件魔数校验：mimetype 由客户端提供可伪造，必须验证真实文件头
function detectImageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.toString('ascii', 0, 3) === 'GIF') return 'gif';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    if (brand.startsWith('avi')) return 'avif';
  }
  return null;
}

const EXT_BY_TYPE = { png: '.png', jpg: '.jpg', gif: '.gif', webp: '.webp', avif: '.avif' };

router.post('/image', authRequired, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未收到文件' });
  if (!ALLOWED_MIME.test(req.file.mimetype || '')) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: '仅支持 PNG / JPG / GIF / WebP / AVIF 图片' });
  }
  // 魔数校验 + 扩展名按真实类型重写（防止 polyglot 文件与双扩展名）
  let type = null;
  try {
    const fd = fs.openSync(req.file.path, 'r');
    const buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    type = detectImageType(buf);
  } catch {
    type = null;
  }
  if (!type) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: '文件内容不是有效图片' });
  }
  const finalName = req.file.filename.replace(/\.[^.]*$/, '') + EXT_BY_TYPE[type];
  if (finalName !== req.file.filename) {
    fs.renameSync(req.file.path, path.join(UPLOAD_DIR, finalName));
  }
  res.json({ url: `/uploads/${finalName}` });
});

router.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.message || '上传失败' });
});

export default router;
