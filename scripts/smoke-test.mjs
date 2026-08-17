/**
 * 冒烟测试：端到端验证核心 API 流程。
 * 用法：node scripts/smoke-test.mjs
 * 在独立端口 + 临时数据目录上运行，不影响开发数据。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PORT = 15111;
const BASE = `http://localhost:${PORT}`;
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-test-'));

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(`${name}${extra ? ` — ${extra}` : ''}`);
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

async function api(pathname, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  return { status: res.status, data, headers: res.headers };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitServer(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return true;
    } catch { /* not yet */ }
    await sleep(300);
  }
  return false;
}

async function main() {
  console.log(`[smoke] 临时数据目录: ${TMP_DIR}`);
  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR: TMP_DIR,
      ADMIN_PASSWORD: 'test-admin-pass-1',
      SEED_DEMO: '1',
      DISABLE_SELF_UPDATE: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
  server.stderr.on('data', (d) => process.stderr.write(`[server!] ${d}`));

  try {
    check('服务启动 + 健康检查', await waitServer());

    // ---------- 基础 ----------
    console.log('\n[1] 公开接口与安全头');
    let r = await fetch(`${BASE}/api/health`);
    const health = await r.json();
    check('health 返回 ok', health.ok === true);
    check('health 包含版本号', typeof health.version === 'string' && /^\d+\.\d+\.\d+/.test(health.version));
    r = await fetch(`${BASE}/api/prompts`);
    check('安全头 nosniff', r.headers.get('x-content-type-options') === 'nosniff');
    r = await fetch(`${BASE}/api/not-exist`);
    check('未知 API 返回 404 JSON', r.status === 404 && (await r.json()).error);

    // ---------- 认证 ----------
    console.log('\n[2] 注册 / 登录 / 会话吊销');
    r = await api('/api/auth/register', { method: 'POST', body: { username: 'admin', email: 'a@x.com', password: '123456' } });
    check('保留用户名被拒', r.status === 400);
    r = await api('/api/auth/register', {
      method: 'POST',
      body: { username: 'alice', email: 'alice@test.com', password: 'pass123456' }
    });
    check('注册成功', r.status === 201 && r.data.token);
    const alice = r.data;
    r = await api('/api/auth/register', {
      method: 'POST',
      body: { username: 'bob', email: 'bob@test.com', password: 'pass123456' }
    });
    const bob = r.data;
    check('第二个用户注册', r.status === 201);

    r = await api('/api/auth/login', { method: 'POST', body: { username: 'alice', password: 'wrong!' } });
    check('错误密码被拒', r.status === 401);
    r = await api('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'test-admin-pass-1' } });
    check('ADMIN_PASSWORD 环境变量管理员可登录', r.status === 200 && r.data.user.role === 'admin');
    const admin = r.data;

    // 改密后旧 token 失效
    r = await api('/api/auth/password', {
      method: 'PUT',
      token: bob.token,
      body: { oldPassword: 'pass123456', newPassword: 'newpass999' }
    });
    check('改密成功并返回新 token', r.status === 200 && r.data.token);
    const bobNewToken = r.data.token;
    r = await api('/api/auth/me', { token: bob.token });
    check('改密后旧 token 失效', r.status === 401);
    r = await api('/api/auth/me', { token: bobNewToken });
    check('新 token 可用', r.status === 200);

    // ---------- 提示词 ----------
    console.log('\n[3] 提示词 CRUD / 版本 / 评论');
    r = await api('/api/prompts', {
      method: 'POST',
      token: alice.token,
      body: { title: '测试提示词', content: '你是测试助手', category: 'text', tags: ['t1'], visibility: 'public' }
    });
    check('创建提示词', r.status === 201);
    const pid = r.data.id;
    r = await api(`/api/prompts/${pid}`, { method: 'PUT', token: alice.token, body: { title: '测试提示词 v2', content: '改后内容', category: 'text' } });
    check('编辑提示词', r.status === 200 && r.data.title === '测试提示词 v2');
    r = await api(`/api/prompts/${pid}/versions`, { token: alice.token });
    check('版本历史 2 条', r.status === 200 && r.data.versions.length === 2);
    const v1 = r.data.versions.find((v) => v.version === 1);
    r = await api(`/api/prompts/${pid}/restore/${v1.id}`, { method: 'POST', token: alice.token });
    check('恢复 v1（内容回滚）', r.status === 200 && r.data.content === '你是测试助手');
    r = await api(`/api/prompts/${pid}/versions`, { token: alice.token });
    check('恢复后生成 v3', r.data.versions.length === 3 && r.data.versions[0].version === 3);
    r = await api(`/api/prompts/${pid}/versions`, { token: bobNewToken });
    check('他人不能看版本历史', r.status === 403);

    r = await api(`/api/prompts/${pid}/comments`, { method: 'POST', token: bobNewToken, body: { content: '很好用！' } });
    check('发表评论', r.status === 201);
    const commentId = r.data?.id;
    r = await api(`/api/prompts/${pid}/comments`);
    check('评论列表', r.status === 200 && r.data.items.length === 1);
    r = await api(`/api/prompts/comments/${commentId}`, { method: 'DELETE', token: bobNewToken });
    check('删除自己的评论', r.status === 200);

    // ---------- 互动 ----------
    console.log('\n[4] 点赞 / 收藏 / 关注 / 通知');
    r = await api(`/api/prompts/${pid}/like`, { method: 'POST', token: bobNewToken });
    check('点赞', r.status === 200 && r.data.active === true);
    r = await api('/api/notifications', { token: alice.token });
    check('作者收到点赞通知', r.data.items?.length === 2 && r.data.items[0].type === 'prompt_like');
    r = await api(`/api/prompts/${pid}/bookmark`, { method: 'POST', token: bobNewToken });
    check('收藏', r.status === 200 && r.data.active === true);

    // 转私密：作者可见，他人 404，收藏列表出现失效占位，可取消收藏
    r = await api(`/api/prompts/${pid}/visibility`, { method: 'PATCH', token: alice.token });
    check('切换为私密', r.status === 200 && r.data.visibility === 'private');
    r = await api(`/api/prompts/${pid}`, { token: bobNewToken });
    check('他人访问私密 404', r.status === 404);
    r = await api(`/api/prompts/${pid}`, { token: alice.token });
    check('作者访问私密 OK', r.status === 200);
    r = await api('/api/prompts/bookmarks', { token: bobNewToken });
    check('收藏列表出现失效占位', r.data.unavailable.length === 1 && r.data.items.length === 0);
    r = await api(`/api/prompts/${pid}/bookmark`, { method: 'POST', token: bobNewToken });
    check('可以取消失效收藏', r.status === 200 && r.data.active === false);
    r = await api(`/api/prompts/${pid}/visibility`, { method: 'PATCH', token: alice.token });
    check('切回公开', r.data.visibility === 'public');

    r = await api('/api/users/alice/follow', { method: 'POST', token: bobNewToken });
    check('关注', r.status === 200 && r.data.following === true);
    r = await api('/api/notifications', { token: alice.token });
    check('收到关注通知', r.data.items.some((n) => n.type === 'follow'));

    // ---------- 浏览量去重 ----------
    console.log('\n[5] 浏览量去重');
    const before = (await api(`/api/prompts/${pid}`, { token: bobNewToken })).data.views;
    const after = (await api(`/api/prompts/${pid}`, { token: bobNewToken })).data.views;
    check('同一用户重复访问不重复计数', before === after);

    // ---------- 动态 ----------
    console.log('\n[6] 动态 / feed');
    r = await api('/api/posts', {
      method: 'POST',
      token: alice.token,
      body: { content: '发布了新提示词！', prompt_id: pid }
    });
    check('发布动态（关联提示词）', r.status === 201 && r.data.prompt);
    const postId = r.data.id;
    r = await api('/api/posts/feed?tab=recommend', { token: bobNewToken });
    check('推荐流返回动态', r.data.items.some((p) => p.id === postId));
    r = await api(`/api/posts/${postId}/like`, { method: 'POST', token: bobNewToken });
    check('动态点赞', r.status === 200);
    r = await api('/api/notifications', { token: alice.token });
    check('动态点赞通知', r.data.items.some((n) => n.type === 'post_like'));

    // 私密提示词卡片对他人隐藏
    await api(`/api/prompts/${pid}/visibility`, { method: 'PATCH', token: alice.token });
    r = await api('/api/posts/feed?tab=recommend', { token: bobNewToken });
    const hiddenPost = r.data.items.find((p) => p.id === postId);
    check('私密关联卡片对他人隐藏', hiddenPost && hiddenPost.prompt === null);
    r = await api('/api/posts/feed?tab=recommend', { token: alice.token });
    check('推荐流过滤自帖（作者视角）', !r.data.items.some((p) => p.id === postId));
    r = await api('/api/users/alice/posts', { token: alice.token });
    check('作者在个人动态里仍可见关联卡片', r.data.items.find((p) => p.id === postId)?.prompt);
    await api(`/api/prompts/${pid}/visibility`, { method: 'PATCH', token: alice.token });

    // ---------- 导入导出 ----------
    console.log('\n[7] 导入 / 导出');
    r = await fetch(`${BASE}/api/prompts/export`, { headers: { Authorization: `Bearer ${alice.token}` } });
    const exported = await r.json();
    check('导出包含创建的提示词', r.status === 200 && exported.count >= 1);
    check('导出带下载头', (r.headers.get('content-disposition') || '').includes('attachment'));
    r = await api('/api/prompts/import', {
      method: 'POST',
      token: alice.token,
      body: { prompts: [{ title: '导入的提示词', content: '内容', category: 'other' }, { title: '', content: '' }] }
    });
    check('导入 1 成功 1 跳过', r.status === 201 && r.data.created === 1 && r.data.skipped === 1);

    // ---------- 举报 ----------
    console.log('\n[8] 举报与审核');
    r = await api('/api/reports', {
      method: 'POST',
      token: bobNewToken,
      body: { target_type: 'prompt', target_id: pid, reason: 'NSFW 未标记', detail: '封面辣眼睛' }
    });
    check('提交举报', r.status === 201);
    r = await api('/api/reports', {
      method: 'POST',
      token: bobNewToken,
      body: { target_type: 'prompt', target_id: pid, reason: '垃圾信息 / 广告' }
    });
    check('重复举报被拒', r.status === 409);
    r = await api('/api/admin/reports?status=open', { token: admin.token });
    check('管理端看到待处理举报', r.status === 200 && r.data.openCount === 1 && r.data.items[0].prompt_title);
    const reportId = r.data.items[0].id;
    r = await api('/api/admin/prompts/' + pid + '/nsfw', { method: 'PATCH', token: admin.token, body: { nsfw: true } });
    check('管理员强制 NSFW', r.status === 200 && r.data.nsfw === true);
    r = await api(`/api/admin/reports/${reportId}`, { method: 'PUT', token: admin.token, body: { status: 'resolved' } });
    check('处置举报', r.status === 200);
    r = await api('/api/admin/reports?status=open', { token: admin.token });
    check('待处理清零', r.data.openCount === 0);

    // ---------- 管理端 ----------
    console.log('\n[9] 管理端保护逻辑');
    r = await api('/api/admin/stats', { token: alice.token });
    check('普通用户无权访问管理端', r.status === 403);
    r = await api(`/api/admin/users/${admin.user.id}`, { method: 'PUT', token: admin.token, body: { role: 'user' } });
    check('不能修改自己的角色', r.status === 400);
    r = await api(`/api/admin/users/${admin.user.id}`, { method: 'DELETE', token: admin.token });
    check('不能删除自己', r.status === 400);
    // 唯一管理员不能被另一个管理员撤销（先让 alice 成为管理员）
    r = await api(`/api/admin/users/${alice.user.id}`, { method: 'PUT', token: admin.token, body: { role: 'admin' } });
    check('授予 alice 管理员', r.status === 200);
    r = await api(`/api/admin/users/${admin.user.id}`, { method: 'PUT', token: alice.token, body: { role: 'user' } });
    check('可撤销其他管理员（非最后一个）', r.status === 200);
    // 现在 alice 是唯一管理员，她不能自撤，但 bob 也不是管理员 —— 用 alice 撤自己应失败
    r = await api(`/api/admin/users/${alice.user.id}`, { method: 'PUT', token: alice.token, body: { role: 'user' } });
    check('最后一个管理员不可自撤（防自锁）', r.status === 400);
    // 恢复 admin
    r = await api('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'test-admin-pass-1' } });
    const admin2 = r.data;
    await api(`/api/admin/users/${admin2.user.id}`, { method: 'PUT', token: alice.token, body: { role: 'admin' } });

    // 封禁：内容全链路隐藏
    console.log('\n[10] 封禁用户内容过滤');
    r = await api(`/api/admin/users/${bob.user.id}`, { method: 'PUT', token: admin2.token, body: { status: 'banned' } });
    check('封禁 bob', r.status === 200);
    r = await api('/api/prompts');
    // bob 没有公开提示词，验证列表正常 + 主页 404
    r = await api('/api/users/bob');
    check('被封禁用户主页 404', r.status === 404);
    r = await api('/api/auth/me', { token: bobNewToken });
    check('被封禁用户 token 立即失效', r.status === 403);
    await api(`/api/admin/users/${bob.user.id}`, { method: 'PUT', token: admin2.token, body: { status: 'active' } });

    // ---------- 上传安全 ----------
    console.log('\n[11] 上传安全');
    const pngBuf = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f5f0000000049454e44ae426082',
      'hex'
    );
    const form = new FormData();
    form.append('image', new Blob([pngBuf], { type: 'image/png' }), 'x.png');
    r = await fetch(`${BASE}/api/upload/image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${alice.token}` },
      body: form
    });
    const uploaded = await r.json();
    check('合法 PNG 上传成功', r.status === 200 && uploaded.url?.startsWith('/uploads/'));

    // SVG 伪装成 PNG 上传（魔数校验应拒绝）
    const svgBuf = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const form2 = new FormData();
    form2.append('image', new Blob([svgBuf], { type: 'image/png' }), 'evil.png');
    r = await fetch(`${BASE}/api/upload/image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${alice.token}` },
      body: form2
    });
    check('伪装 PNG 的脚本内容被魔数校验拒绝', r.status === 400);

    const form3 = new FormData();
    form3.append('image', new Blob([svgBuf], { type: 'image/svg+xml' }), 'evil.svg');
    r = await fetch(`${BASE}/api/upload/image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${alice.token}` },
      body: form3
    });
    check('SVG MIME 被拒绝', r.status === 400);
    r = await fetch(`${BASE}${uploaded.url}`);
    check('上传文件带 nosniff 头', r.headers.get('x-content-type-options') === 'nosniff');

    // ---------- OG meta ----------
    console.log('\n[12] SPA 与 OG 注入');
    const distIndex = path.resolve(import.meta.dirname, '..', 'dist', 'index.html');
    if (!fs.existsSync(distIndex)) {
      console.log('  – 跳过（未找到 dist/，请先 npm run build）');
    } else {
      r = await fetch(`${BASE}/prompt/${pid}`);
      const html = await r.text();
      check('提示词页注入 og:title', html.includes('og:title') && html.includes('og:description'));
      r = await fetch(`${BASE}/feed`);
      check('SPA 回退正常', r.status === 200 && (await r.text()).includes('<div id="root">'));
    }

    // ---------- 日志 ----------
    r = await api('/api/admin/logs?page=1&pageSize=5', { token: admin2.token });
    check('管理日志分页', r.status === 200 && r.data.total >= 5 && r.data.items.length <= 5);
    r = await api('/api/admin/logs?action=nsfw', { token: admin2.token });
    check('日志按动作筛选', r.data.items.every((l) => l.action.includes('nsfw')));

    console.log('\n[13] 在线更新');
    r = await api('/api/admin/update', { token: bobNewToken });
    check('普通用户不能检查更新', r.status === 403);
    r = await api('/api/admin/update', { token: admin2.token });
    check('管理员可检查更新', r.status === 200 && r.data.current === health.version && r.data.disabled === true);
    r = await api('/api/admin/update', { method: 'POST', token: admin2.token });
    check('禁用自更新时拒绝一键更新', r.status === 403);
    r = await api('/api/admin/update/status', { token: admin2.token });
    check('更新状态可查询', r.status === 200 && typeof r.data.state === 'string');

    console.log(`\n========== 结果：${passed} 通过 / ${failed} 失败 ==========`);
    if (failures.length) {
      console.log('失败项：');
      failures.forEach((f) => console.log(`  - ${f}`));
      process.exitCode = 1;
    }
  } finally {
    server.kill();
    await sleep(500);
    try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch { /* Windows 文件锁，忽略 */ }
  }
}

main().catch((e) => {
  console.error('[smoke] 运行异常：', e);
  process.exitCode = 1;
});
