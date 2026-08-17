import { Router } from 'express';
import db, { notify, deleteUploadFiles } from '../db.js';
import { authRequired, authOptional } from '../auth.js';
import { rateLimit } from '../ratelimit.js';

const router = Router();

const CATEGORIES = ['text', 'image', 'video', 'project', 'other'];
const MAX_CONTENT_LEN = 50000;

const baseSelect = `
  SELECT p.*, u.username, u.display_name, u.avatar,
    (SELECT COUNT(*) FROM likes l WHERE l.prompt_id = p.id) AS like_count,
    (SELECT COUNT(*) FROM bookmarks b WHERE b.prompt_id = p.id) AS bookmark_count,
    (SELECT COUNT(*) FROM comments c WHERE c.prompt_id = p.id) AS comment_count,
    (SELECT url FROM prompt_images pi WHERE pi.prompt_id = p.id ORDER BY pi.sort, pi.id LIMIT 1) AS cover
  FROM prompts p JOIN users u ON u.id = p.user_id
`;

function attachExtras(rows, userId) {
  const imgStmt = db.prepare('SELECT url FROM prompt_images WHERE prompt_id = ? ORDER BY sort, id');
  const linkStmt = db.prepare('SELECT url, title FROM prompt_links WHERE prompt_id = ? ORDER BY id');
  const likedStmt = userId
    ? db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND prompt_id = ?')
    : null;
  const markedStmt = userId
    ? db.prepare('SELECT 1 FROM bookmarks WHERE user_id = ? AND prompt_id = ?')
    : null;

  return rows.map((r) => ({
    ...r,
    tags: r.tags ? r.tags.split(',').filter(Boolean) : [],
    images: imgStmt.all(r.id).map((i) => i.url),
    links: linkStmt.all(r.id),
    liked: likedStmt ? !!likedStmt.get(userId, r.id) : false,
    bookmarked: markedStmt ? !!markedStmt.get(userId, r.id) : false
  }));
}

function existingUploadUrls(promptId) {
  return db
    .prepare('SELECT url FROM prompt_images WHERE prompt_id = ?')
    .all(promptId)
    .map((r) => r.url)
    .filter((u) => u.startsWith('/uploads/'));
}

function saveAttachments(id, { images = [], links = [] }) {
  const stale = existingUploadUrls(id);
  db.prepare('DELETE FROM prompt_images WHERE prompt_id = ?').run(id);
  db.prepare('DELETE FROM prompt_links WHERE prompt_id = ?').run(id);
  const insImg = db.prepare('INSERT INTO prompt_images (prompt_id, url, sort) VALUES (?, ?, ?)');
  const insLink = db.prepare('INSERT INTO prompt_links (prompt_id, url, title) VALUES (?, ?, ?)');
  const kept = images
    .filter((u) => typeof u === 'string' && /^https?:\/\/|^\//.test(u.trim()))
    .slice(0, 12)
    .map((u) => u.trim());
  kept.forEach((u, i) => insImg.run(id, u, i));
  links
    .filter((l) => l && typeof l.url === 'string' && /^https?:\/\//.test(l.url.trim()))
    .slice(0, 12)
    .forEach((l) => insLink.run(id, l.url.trim(), String(l.title || '').slice(0, 100)));
  // 回收不再被引用的本站上传文件
  deleteUploadFiles(stale.filter((u) => !kept.includes(u)));
}

// 保存快照（版本历史：发布与每次编辑各存一份）
function snapshotVersion(promptId, v) {
  db.prepare(
    `INSERT INTO prompt_versions (prompt_id, version, title, description, content, category, model, tags, nsfw)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(promptId, v.version, v.title, v.description, v.content, v.category, v.model, v.tags, v.nsfw);
}

function nextVersion(promptId) {
  const row = db
    .prepare('SELECT COALESCE(MAX(version), 0) AS v FROM prompt_versions WHERE prompt_id = ?')
    .get(promptId);
  return row.v + 1;
}

function validateBody(body) {
  const title = String(body.title || '').trim();
  const content = String(body.content || '');
  if (!title || title.length > 100) return { error: '标题不能为空且不超过 100 字' };
  if (!content.trim()) return { error: '提示词内容不能为空' };
  if (content.length > MAX_CONTENT_LEN) {
    return { error: `提示词内容过长（上限 ${MAX_CONTENT_LEN} 字符）` };
  }
  const category = CATEGORIES.includes(body.category) ? body.category : 'other';
  const visibility = body.visibility === 'private' ? 'private' : 'public';
  const tags = (Array.isArray(body.tags) ? body.tags : String(body.tags || '').split(','))
    .map((t) => String(t).trim())
    .filter(Boolean)
    .slice(0, 8)
    .join(',');
  return {
    value: {
      title,
      content,
      category,
      visibility,
      tags,
      description: String(body.description || '').slice(0, 2000),
      model: String(body.model || '').slice(0, 60),
      nsfw: body.nsfw ? 1 : 0
    }
  };
}

// 浏览量去重：同一访问者（登录用户或 IP）对同一提示词 1 小时内只计一次
const viewSeen = new Map();
const VIEW_TTL = 3600_000;
function countView(promptId, viewerKey) {
  const key = `${promptId}:${viewerKey}`;
  const last = viewSeen.get(key);
  const now = Date.now();
  if (viewSeen.size > 50000) {
    for (const [k, t] of viewSeen) if (now - t > VIEW_TTL) viewSeen.delete(k);
  }
  if (last && now - last < VIEW_TTL) return false;
  viewSeen.set(key, now);
  return true;
}

// 公开信息流：支持搜索 / 分类 / 标签 / 用户 / 排序 / 分页
router.get('/', (req, res) => {
  const { q, category, tag, username, sort } = req.query;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(48, Math.max(1, parseInt(req.query.pageSize) || 12));

  const where = ["p.visibility = 'public'", "u.status = 'active'"];
  const params = [];
  if (q) {
    where.push('(p.title LIKE ? OR p.description LIKE ? OR p.content LIKE ? OR p.tags LIKE ?)');
    const kw = `%${String(q).slice(0, 60)}%`;
    params.push(kw, kw, kw, kw);
  }
  if (category && CATEGORIES.includes(category)) {
    where.push('p.category = ?');
    params.push(category);
  }
  if (tag) {
    where.push("(',' || p.tags || ',') LIKE ?");
    params.push(`%,${String(tag).slice(0, 30)},%`);
  }
  if (username) {
    where.push('u.username = ?');
    params.push(String(username).slice(0, 30));
  }

  // 最热 = 互动量时间衰减（浏览 + 8×点赞），避免老内容永久霸榜 / 刷量操纵
  const orderBy =
    sort === 'hot'
      ? `(p.views + like_count * 8 + 1) / ((julianday('now') - julianday(p.created_at)) * 24 + 6) DESC, p.id DESC`
      : sort === 'likes'
        ? 'like_count DESC, p.views DESC, p.id DESC'
        : 'p.id DESC';

  const whereSql = where.join(' AND ');
  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM prompts p JOIN users u ON u.id = p.user_id WHERE ${whereSql}`)
    .get(...params).c;
  const rows = db
    .prepare(`${baseSelect} WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize);

  res.json({ items: attachExtras(rows, req.user?.id), total, page, pageSize });
});

router.get('/mine', authRequired, (req, res) => {
  const rows = db
    .prepare(`${baseSelect} WHERE p.user_id = ? AND u.status != 'banned' ORDER BY p.id DESC`)
    .all(req.user.id);
  res.json({ items: attachExtras(rows, req.user.id) });
});

// 收藏列表：已删除 / 被作者设为私密的条目返回占位（而不是静默消失）
router.get('/bookmarks', authRequired, (req, res) => {
  const rows = db
    .prepare(
      `SELECT b.created_at AS bookmarked_at,
         p.id, p.user_id, p.visibility, p.title
       FROM bookmarks b
       JOIN prompts p ON p.id = b.prompt_id
       JOIN users u ON u.id = p.user_id
       ORDER BY b.created_at DESC`
    )
    .all();
  const unavailable = rows.filter((r) => r.visibility !== 'public');
  const availableIds = rows.filter((r) => r.visibility === 'public').map((r) => r.id);
  const items = [];
  if (availableIds.length) {
    const placeholders = availableIds.map(() => '?').join(',');
    const list = db
      .prepare(`${baseSelect} WHERE p.id IN (${placeholders}) AND u.status = 'active' ORDER BY p.id DESC`)
      .all(...availableIds);
    items.push(...attachExtras(list, req.user.id));
  }
  res.json({
    items,
    unavailable: unavailable.map((r) => ({
      id: r.id,
      title: r.user_id === req.user.id ? r.title : '内容已失效',
      bookmarked_at: r.bookmarked_at
    }))
  });
});

// 导出我的全部提示词（JSON 备份 / 迁移）
router.get('/export', authRequired, (req, res) => {
  const rows = db
    .prepare(`${baseSelect} WHERE p.user_id = ? ORDER BY p.id`)
    .all(req.user.id);
  const items = attachExtras(rows, req.user.id).map(({ liked, bookmarked, username, display_name, avatar, ...rest }) => rest);
  res.setHeader('Content-Disposition', `attachment; filename="prompthub-export-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({
    format: 'prompthub.export/v1',
    exported_at: new Date().toISOString(),
    count: items.length,
    prompts: items
  });
});

// 批量导入（兼容导出格式；单次上限 100 条）
router.post('/import', authRequired, (req, res) => {
  const list = Array.isArray(req.body?.prompts) ? req.body.prompts.slice(0, 100) : [];
  if (!list.length) return res.status(400).json({ error: '未检测到可导入的提示词' });
  let created = 0;
  let skipped = 0;
  for (const item of list) {
    const { error, value } = validateBody(item);
    if (error) {
      skipped++;
      continue;
    }
    const info = db
      .prepare(
        'INSERT INTO prompts (user_id, title, description, content, category, model, tags, visibility, nsfw) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(req.user.id, value.title, value.description, value.content, value.category, value.model, value.tags, value.visibility, value.nsfw);
    snapshotVersion(info.lastInsertRowid, { ...value, version: 1 });
    created++;
  }
  res.status(201).json({ created, skipped });
});

router.post('/', authRequired, (req, res) => {
  const { error, value } = validateBody(req.body || {});
  if (error) return res.status(400).json({ error });
  const info = db
    .prepare(
      'INSERT INTO prompts (user_id, title, description, content, category, model, tags, visibility, nsfw) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(req.user.id, value.title, value.description, value.content, value.category, value.model, value.tags, value.visibility, value.nsfw);
  snapshotVersion(info.lastInsertRowid, { ...value, version: 1 });
  saveAttachments(info.lastInsertRowid, req.body || {});
  const row = db.prepare(`${baseSelect} WHERE p.id = ?`).get(info.lastInsertRowid);
  res.status(201).json(attachExtras([row], req.user.id)[0]);
});

router.get('/:id(\\d+)', authOptional, (req, res) => {
  const full = db
    .prepare(
      `SELECT p.*, u.username, u.display_name, u.avatar, u.status AS author_status,
        (SELECT COUNT(*) FROM likes l WHERE l.prompt_id = p.id) AS like_count,
        (SELECT COUNT(*) FROM bookmarks b WHERE b.prompt_id = p.id) AS bookmark_count,
        (SELECT COUNT(*) FROM comments c WHERE c.prompt_id = p.id) AS comment_count,
        (SELECT url FROM prompt_images pi WHERE pi.prompt_id = p.id ORDER BY pi.sort, pi.id LIMIT 1) AS cover
       FROM prompts p JOIN users u ON u.id = p.user_id WHERE p.id = ?`
    )
    .get(req.params.id);
  const isOwner = req.user && full && full.user_id === req.user.id;
  if (!full || full.author_status === 'banned' || (full.visibility === 'private' && !isOwner)) {
    return res.status(404).json({ error: '提示词不存在或未公开' });
  }
  if (!isOwner) {
    const viewerKey = req.user ? `u${req.user.id}` : `ip${req.ip || 'anon'}`;
    if (countView(full.id, viewerKey)) {
      db.prepare('UPDATE prompts SET views = views + 1 WHERE id = ?').run(full.id);
      full.views += 1;
    }
  }
  res.json(attachExtras([full], req.user?.id)[0]);
});

function getOwnedPrompt(req, res) {
  const row = db.prepare('SELECT * FROM prompts WHERE id = ?').get(req.params.id);
  if (!row) {
    res.status(404).json({ error: '提示词不存在' });
    return null;
  }
  if (row.user_id !== req.user.id) {
    res.status(403).json({ error: '只能操作自己的提示词' });
    return null;
  }
  return row;
}

router.put('/:id(\\d+)', authRequired, (req, res) => {
  const row = getOwnedPrompt(req, res);
  if (!row) return;
  const { error, value } = validateBody(req.body || {});
  if (error) return res.status(400).json({ error });
  db.prepare(
    `UPDATE prompts SET title=?, description=?, content=?, category=?, model=?, tags=?, visibility=?, nsfw=?, updated_at=datetime('now') WHERE id=?`
  ).run(value.title, value.description, value.content, value.category, value.model, value.tags, value.visibility, value.nsfw, row.id);
  snapshotVersion(row.id, { ...value, version: nextVersion(row.id) });
  saveAttachments(row.id, req.body || {});
  const updated = db.prepare(`${baseSelect} WHERE p.id = ?`).get(row.id);
  res.json(attachExtras([updated], req.user.id)[0]);
});

router.patch('/:id(\\d+)/visibility', authRequired, (req, res) => {
  const row = getOwnedPrompt(req, res);
  if (!row) return;
  const next = row.visibility === 'public' ? 'private' : 'public';
  db.prepare('UPDATE prompts SET visibility = ? WHERE id = ?').run(next, row.id);
  res.json({ visibility: next });
});

router.delete('/:id(\\d+)', authRequired, (req, res) => {
  const row = getOwnedPrompt(req, res);
  if (!row) return;
  const stale = existingUploadUrls(row.id);
  db.prepare('DELETE FROM prompts WHERE id = ?').run(row.id);
  deleteUploadFiles(stale);
  res.json({ ok: true });
});

// ---------- 版本历史（仅作者） ----------

router.get('/:id(\\d+)/versions', authRequired, (req, res) => {
  const row = getOwnedPrompt(req, res);
  if (!row) return;
  const versions = db
    .prepare(
      'SELECT id, version, title, description, content, category, model, tags, nsfw, created_at FROM prompt_versions WHERE prompt_id = ? ORDER BY version DESC LIMIT 50'
    )
    .all(row.id);
  res.json({ current: { title: row.title, updated_at: row.updated_at }, versions });
});

// 恢复历史版本：应用旧内容并生成新的版本快照（历史不可变）
router.post('/:id(\\d+)/restore/:versionId(\\d+)', authRequired, (req, res) => {
  const row = getOwnedPrompt(req, res);
  if (!row) return;
  const ver = db
    .prepare('SELECT * FROM prompt_versions WHERE id = ? AND prompt_id = ?')
    .get(req.params.versionId, row.id);
  if (!ver) return res.status(404).json({ error: '版本不存在' });
  db.prepare(
    `UPDATE prompts SET title=?, description=?, content=?, category=?, model=?, tags=?, nsfw=?, updated_at=datetime('now') WHERE id=?`
  ).run(ver.title, ver.description, ver.content, ver.category, ver.model, ver.tags, ver.nsfw, row.id);
  snapshotVersion(row.id, {
    title: ver.title, description: ver.description, content: ver.content,
    category: ver.category, model: ver.model, tags: ver.tags, nsfw: ver.nsfw,
    version: nextVersion(row.id)
  });
  const updated = db.prepare(`${baseSelect} WHERE p.id = ?`).get(row.id);
  res.json(attachExtras([updated], req.user.id)[0]);
});

// ---------- 评论 ----------

function serializeComments(rows) {
  return rows.map((r) => ({
    id: r.id,
    prompt_id: r.prompt_id,
    content: r.content,
    created_at: r.created_at,
    user: { id: r.user_id, username: r.username, display_name: r.display_name || '', avatar: r.avatar || '' }
  }));
}

const commentSelect = `
  SELECT c.*, u.username, u.display_name, u.avatar
  FROM comments c JOIN users u ON u.id = c.user_id
`;

router.get('/:id(\\d+)/comments', authOptional, (req, res) => {
  const prompt = db
    .prepare('SELECT p.id, p.user_id, p.visibility FROM prompts p JOIN users u ON u.id = p.user_id WHERE p.id = ? AND u.status = \'active\'')
    .get(req.params.id);
  const isOwner = req.user && prompt && prompt.user_id === req.user.id;
  if (!prompt || (prompt.visibility === 'private' && !isOwner)) {
    return res.status(404).json({ error: '提示词不存在或未公开' });
  }
  const rows = db
    .prepare(`${commentSelect} WHERE c.prompt_id = ? ORDER BY c.id DESC LIMIT 100`)
    .all(prompt.id);
  res.json({ items: serializeComments(rows) });
});

router.post('/:id(\\d+)/comments', authRequired, rateLimit({ windowMs: 60 * 60_000, max: 60, message: '评论过于频繁，请稍后再试' }), (req, res) => {
  const content = String(req.body?.content || '').trim();
  if (!content || content.length > 1000) {
    return res.status(400).json({ error: '评论内容需为 1-1000 字' });
  }
  const prompt = db
    .prepare("SELECT p.id, p.user_id, p.visibility FROM prompts p JOIN users u ON u.id = p.user_id WHERE p.id = ? AND u.status = 'active'")
    .get(req.params.id);
  const isOwner = prompt && prompt.user_id === req.user.id;
  if (!prompt || (prompt.visibility === 'private' && !isOwner)) {
    return res.status(404).json({ error: '提示词不存在或未公开' });
  }
  const info = db
    .prepare('INSERT INTO comments (prompt_id, user_id, content) VALUES (?, ?, ?)')
    .run(prompt.id, req.user.id, content);
  notify(prompt.user_id, req.user.id, 'comment', prompt.id);
  const row = db.prepare(`${commentSelect} WHERE c.id = ?`).get(info.lastInsertRowid);
  res.status(201).json(serializeComments([row])[0]);
});

router.delete('/comments/:commentId(\\d+)', authRequired, (req, res) => {
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.commentId);
  if (!comment) return res.status(404).json({ error: '评论不存在' });
  const prompt = db.prepare('SELECT user_id FROM prompts WHERE id = ?').get(comment.prompt_id);
  const canDelete =
    comment.user_id === req.user.id ||
    req.user.role === 'admin' ||
    (prompt && prompt.user_id === req.user.id); // 提示词作者可管理其评论区
  if (!canDelete) return res.status(403).json({ error: '无权删除该评论' });
  db.prepare('DELETE FROM comments WHERE id = ?').run(comment.id);
  res.json({ ok: true });
});

// ---------- 点赞 / 收藏 ----------

function toggleTable(table, req, res) {
  const prompt = db
    .prepare('SELECT p.* FROM prompts p JOIN users u ON u.id = p.user_id WHERE p.id = ?')
    .get(req.params.id);
  if (!prompt) {
    return res.status(404).json({ error: '提示词不存在或未公开' });
  }
  const exists = db
    .prepare(`SELECT 1 FROM ${table} WHERE user_id = ? AND prompt_id = ?`)
    .get(req.user.id, prompt.id);
  if (exists) {
    // 已存在则一律允许取消（内容转私密后也能清掉旧点赞/收藏）
    db.prepare(`DELETE FROM ${table} WHERE user_id = ? AND prompt_id = ?`).run(req.user.id, prompt.id);
  } else {
    // 新增仅对公开且作者正常的提示词开放
    const author = db.prepare('SELECT status FROM users WHERE id = ?').get(prompt.user_id);
    if (prompt.visibility !== 'public' || author.status !== 'active') {
      return res.status(404).json({ error: '提示词不存在或未公开' });
    }
    db.prepare(`INSERT INTO ${table} (user_id, prompt_id) VALUES (?, ?)`).run(req.user.id, prompt.id);
    if (table === 'likes') notify(prompt.user_id, req.user.id, 'prompt_like', prompt.id);
  }
  const count = db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE prompt_id = ?`).get(prompt.id).c;
  res.json({ active: !exists, count });
}

router.post('/:id(\\d+)/like', authRequired, (req, res) => toggleTable('likes', req, res));
router.post('/:id(\\d+)/bookmark', authRequired, (req, res) => toggleTable('bookmarks', req, res));

export default router;
