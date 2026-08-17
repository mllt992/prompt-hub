// 分享海报生成：Canvas 绘制 750×1200 海报（标题 + 作者 + 预览图/内容摘录 + 二维码）
// 外部图片跨域加载失败或画布被污染时自动降级为纯文本卡片
import QRCode from 'qrcode';
import { catLabel, displayName, avatarUrl } from './api.js';

const W = 750;
const H = 1200;
const PAD = 48;
const CW = W - PAD * 2;

const C = {
  bg: '#ffffff',
  text: '#191f28',
  text2: '#454c57',
  muted: '#5d6572',
  border: '#e3e6ea',
  accent: '#0b5cc4',
  accentSubtle: '#edf4fd',
  surface2: '#f5f6f8',
  danger: '#c13f3f',
  dangerSubtle: '#fdf0f0'
};
const FONT = `'Inter','PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif`;
const MONO = `'JetBrains Mono','SFMono-Regular',Consolas,'Courier New',monospace`;
const ZAP = 'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 逐字换行（中英文混排安全），超出行数时末行省略号
function clampLines(ctx, text, maxW, maxLines) {
  const all = [];
  let line = '';
  for (const ch of String(text ?? '')) {
    if (ch === '\n') {
      all.push(line);
      line = '';
      continue;
    }
    if (line && ctx.measureText(line + ch).width > maxW) {
      all.push(line);
      line = ch;
    } else {
      line += ch;
    }
  }
  all.push(line);
  if (all.length <= maxLines) return all;
  const kept = all.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
  kept[maxLines - 1] = (last || '') + '…';
  return kept;
}

function loadImage(url, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => {
      img.src = '';
      reject(new Error('timeout'));
    }, timeout);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error('load failed'));
    };
    img.src = url;
  });
}

function drawCover(ctx, img, x, y, w, h) {
  const ir = img.width / img.height;
  const r = w / h;
  let sw;
  let sh;
  let sx = 0;
  let sy = 0;
  if (ir > r) {
    sh = img.height;
    sw = sh * r;
    sx = (img.width - sw) / 2;
  } else {
    sw = img.width;
    sh = sw / r;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function drawLogo(ctx, x, y, size) {
  rr(ctx, x, y, size, size, size * 0.28);
  ctx.fillStyle = C.accent;
  ctx.fill();
  const icon = size * 0.58;
  ctx.save();
  ctx.translate(x + (size - icon) / 2, y + (size - icon) / 2);
  ctx.scale(icon / 24, icon / 24);
  ctx.lineWidth = 2.2 / (icon / 24);
  ctx.strokeStyle = '#ffffff';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke(new Path2D(ZAP));
  ctx.restore();
}

function drawAvatar(ctx, img, name, x, y, d) {
  if (img) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2);
    ctx.clip();
    drawCover(ctx, img, x, y, d, d);
    ctx.restore();
    return;
  }
  ctx.beginPath();
  ctx.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2);
  ctx.fillStyle = C.accentSubtle;
  ctx.fill();
  ctx.fillStyle = C.accent;
  ctx.font = `bold ${d * 0.42}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((name || '?').slice(0, 1).toUpperCase(), x + d / 2, y + d / 2 + 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function fmtNum(n) {
  n = Number(n) || 0;
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, '')}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

/**
 * 生成提示词分享海报
 * @param {object} prompt 提示词详情（同 GET /api/prompts/:id 返回）
 * @param {string} shareUrl 二维码指向的页面链接
 * @returns {Promise<string>} PNG dataURL
 */
export async function generatePoster(prompt, shareUrl) {
  // NSFW 提示词不在海报中展示效果图，避免敏感内容外泄
  const wantImage = !prompt.nsfw && prompt.images?.length > 0;

  const [qrUrl, avatarImg, previewImg] = await Promise.all([
    QRCode.toDataURL(shareUrl, {
      margin: 0,
      width: 320,
      errorCorrectionLevel: 'M',
      color: { dark: C.accent, light: '#ffffff' }
    }).catch(() => null),
    loadImage(avatarUrl(prompt)).catch(() => null),
    wantImage ? loadImage(prompt.images[0]).catch(() => null) : Promise.resolve(null)
  ]);

  const qrImg = qrUrl ? await loadImage(qrUrl).catch(() => null) : null;

  try {
    return drawPoster(prompt, shareUrl, qrImg, avatarImg, previewImg);
  } catch {
    // 画布被跨域图片污染（toDataURL 抛 SecurityError）→ 去掉外部图片重绘
    return drawPoster(prompt, shareUrl, qrImg, null, null);
  }
}

function drawPoster(prompt, shareUrl, qrImg, avatarImg, previewImg) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.text;
  ctx.textBaseline = 'alphabetic';

  // ---- 头部：logo + 站名 + 分类徽章 ----
  drawLogo(ctx, PAD, 44, 44);
  ctx.font = `bold 24px ${FONT}`;
  ctx.fillStyle = C.text;
  ctx.fillText('PromptHub', PAD + 44 + 14, 44 + 19);
  ctx.font = `14px ${FONT}`;
  ctx.fillStyle = C.muted;
  ctx.fillText('提示词管理平台', PAD + 44 + 14, 44 + 37);

  const cat = catLabel(prompt.category);
  ctx.font = `15px ${FONT}`;
  const catW = ctx.measureText(cat).width + 30;
  rr(ctx, W - PAD - catW, 48, catW, 34, 17);
  ctx.fillStyle = C.surface2;
  ctx.fill();
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = C.text2;
  ctx.textAlign = 'center';
  ctx.fillText(cat, W - PAD - catW / 2, 48 + 23);
  ctx.textAlign = 'left';

  // ---- 标题（最多 2 行）----
  ctx.font = `bold 40px ${FONT}`;
  ctx.fillStyle = C.text;
  const titleLines = clampLines(ctx, prompt.title, CW, 2);
  let y = 138;
  for (const l of titleLines) {
    ctx.fillText(l, PAD, y);
    y += 56;
  }

  // ---- 作者行 ----
  const ay = y + 12;
  drawAvatar(ctx, avatarImg, displayName(prompt) || prompt.username, PAD, ay, 40);
  ctx.font = `600 19px ${FONT}`;
  ctx.fillStyle = C.text;
  const name = displayName(prompt) || prompt.username || '匿名';
  ctx.fillText(name, PAD + 40 + 14, ay + 26);
  const nameW = ctx.measureText(name).width;
  ctx.font = `15px ${FONT}`;
  ctx.fillStyle = C.muted;
  const date = String(prompt.created_at || '').slice(0, 10);
  const dateTxt = `发布于 ${date}`;
  if (PAD + 40 + 14 + nameW + 14 + ctx.measureText(dateTxt).width < W - PAD - catW) {
    ctx.fillText(dateTxt, PAD + 40 + 14 + nameW + 14, ay + 26);
  }

  // ---- 分割线 ----
  const divY = ay + 40 + 28;
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, divY);
  ctx.lineTo(W - PAD, divY);
  ctx.stroke();

  // ---- 中部：预览图 + 内容摘录，或纯内容卡片 ----
  const midY = divY + 28;
  const footerTop = 956;
  const midH = footerTop - 24 - midY;

  if (previewImg) {
    ctx.save();
    rr(ctx, PAD, midY, CW, 380, 16);
    ctx.clip();
    drawCover(ctx, previewImg, PAD, midY, CW, 380);
    ctx.restore();
    rr(ctx, PAD, midY, CW, 380, 16);
    ctx.strokeStyle = C.border;
    ctx.stroke();

    ctx.font = `15px ${FONT}`;
    ctx.fillStyle = C.muted;
    ctx.fillText('内容预览', PAD, midY + 380 + 34);
    ctx.font = `19px ${MONO}`;
    ctx.fillStyle = C.text2;
    const lines = clampLines(ctx, prompt.content, CW, 3);
    let ly = midY + 380 + 64;
    for (const l of lines) {
      ctx.fillText(l, PAD, ly);
      ly += 31;
    }
  } else {
    const cardH = midH;
    rr(ctx, PAD, midY, CW, cardH, 16);
    ctx.fillStyle = C.surface2;
    ctx.fill();
    ctx.strokeStyle = C.border;
    ctx.stroke();

    if (prompt.nsfw) {
      const tag = 'NSFW 敏感内容';
      ctx.font = `600 14px ${FONT}`;
      const tw = ctx.measureText(tag).width + 24;
      rr(ctx, W - PAD - 14 - tw, midY + 16, tw, 28, 14);
      ctx.fillStyle = C.dangerSubtle;
      ctx.fill();
      ctx.strokeStyle = C.danger;
      ctx.stroke();
      ctx.fillStyle = C.danger;
      ctx.textAlign = 'center';
      ctx.fillText(tag, W - PAD - 14 - tw / 2, midY + 35);
      ctx.textAlign = 'left';
    }

    ctx.font = `600 15px ${FONT}`;
    ctx.fillStyle = C.muted;
    ctx.fillText('提示词内容', PAD + 26, midY + 40);
    ctx.font = `20px ${MONO}`;
    ctx.fillStyle = C.text2;
    const maxLines = Math.max(1, Math.floor((cardH - 40 - 24 - 20) / 34));
    const lines = clampLines(ctx, prompt.content, CW - 52, maxLines);
    let ly = midY + 82;
    for (const l of lines) {
      ctx.fillText(l, PAD + 26, ly);
      ly += 34;
    }
  }

  // ---- 底部：二维码 + 引导语 + 数据 ----
  ctx.strokeStyle = C.border;
  ctx.beginPath();
  ctx.moveTo(PAD, footerTop);
  ctx.lineTo(W - PAD, footerTop);
  ctx.stroke();

  const qrSize = 156;
  const qrY = footerTop + 36;
  if (qrImg) {
    rr(ctx, PAD, qrY, qrSize, qrSize, 12);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = C.border;
    ctx.stroke();
    ctx.drawImage(qrImg, PAD + 8, qrY + 8, qrSize - 16, qrSize - 16);
  } else {
    rr(ctx, PAD, qrY, qrSize, qrSize, 12);
    ctx.fillStyle = C.surface2;
    ctx.fill();
    ctx.strokeStyle = C.border;
    ctx.stroke();
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = C.muted;
    ctx.textAlign = 'center';
    ctx.fillText('二维码生成失败', PAD + qrSize / 2, qrY + qrSize / 2);
    ctx.textAlign = 'left';
  }

  const rx = PAD + qrSize + 32;
  ctx.font = `bold 24px ${FONT}`;
  ctx.fillStyle = C.text;
  ctx.fillText('扫码查看完整提示词', rx, qrY + 34);
  let host = '';
  try {
    host = new URL(shareUrl).host;
  } catch { /* ignore */ }
  ctx.font = `16px ${FONT}`;
  ctx.fillStyle = C.accent;
  ctx.fillText(host ? `PromptHub · ${host}` : 'PromptHub', rx, qrY + 66);
  ctx.font = `16px ${FONT}`;
  ctx.fillStyle = C.muted;
  ctx.fillText(
    `浏览 ${fmtNum(prompt.views)} · 点赞 ${fmtNum(prompt.like_count)} · 收藏 ${fmtNum(prompt.bookmark_count)}`,
    rx,
    qrY + 96
  );

  return canvas.toDataURL('image/png');
}
