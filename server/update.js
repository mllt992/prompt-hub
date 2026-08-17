import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { DATA_DIR } from './db.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = path.resolve(__dirname, '..');
const UPDATE_DIR = path.join(DATA_DIR, 'updates');
const STATUS_FILE = path.join(DATA_DIR, 'update-status.json');
const DEFAULT_REPO = 'mllt992/prompt-hub';
const MAX_ARCHIVE_BYTES = 80 * 1024 * 1024;
const BUSY_STATES = new Set(['checking', 'downloading', 'extracting', 'installing', 'building', 'restarting']);

let applyInFlight = false;
let latestCache = { at: 0, data: null };

export function currentVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8'));
    return String(pkg.version || '0.0.0');
  } catch {
    return '0.0.0';
  }
}

export function configuredRepo() {
  const raw = String(process.env.GITHUB_REPO || DEFAULT_REPO).trim();
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(raw) ? raw : DEFAULT_REPO;
}

export function isWatchMode() {
  return process.execArgv.some((a) => a === '--watch' || a.startsWith('--watch='));
}

export function updatesDisabled() {
  const v = String(process.env.DISABLE_SELF_UPDATE || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function parseVersion(v) {
  const core = String(v || '')
    .trim()
    .replace(/^v/i, '')
    .split(/[-+]/)[0];
  const parts = core.split('.').map((n) => parseInt(n, 10) || 0);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

export function cmpVersion(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

export function readStatus() {
  try {
    return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
  } catch {
    return { state: 'idle', message: '', log: [] };
  }
}

function writeStatus(patch) {
  const prev = readStatus();
  const next = {
    ...prev,
    ...patch,
    log: Array.isArray(patch.log) ? patch.log : prev.log || [],
    updatedAt: new Date().toISOString()
  };
  fs.mkdirSync(path.dirname(STATUS_FILE), { recursive: true });
  fs.writeFileSync(STATUS_FILE, JSON.stringify(next, null, 2));
  return next;
}

function pushLog(line) {
  const prev = readStatus();
  const log = [...(prev.log || []), `[${new Date().toISOString().slice(11, 19)}] ${line}`].slice(-80);
  return writeStatus({ log, message: line });
}

export function finalizeUpdateStatus() {
  const s = readStatus();
  if (s.state === 'restarting') {
    writeStatus({
      state: 'done',
      message: `已更新到 ${s.to || currentVersion()}`,
      finishedAt: new Date().toISOString()
    });
  }
}

function githubHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'PromptHub-Updater',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

export async function fetchLatestRelease({ force = false } = {}) {
  if (!force && latestCache.data && Date.now() - latestCache.at < 60_000) {
    return latestCache.data;
  }
  const repo = configuredRepo();
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: githubHeaders()
  });
  if (res.status === 404) {
    latestCache = { at: Date.now(), data: { missing: true, repo } };
    return latestCache.data;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status}${body ? `: ${body.slice(0, 180)}` : ''}`);
  }
  const json = await res.json();
  const data = {
    missing: false,
    repo,
    tag: json.tag_name || '',
    version: String(json.tag_name || json.name || '').replace(/^v/i, ''),
    name: json.name || json.tag_name || '',
    notes: json.body || '',
    htmlUrl: json.html_url || `https://github.com/${repo}/releases`,
    publishedAt: json.published_at || '',
    zipballUrl: json.zipball_url || '',
    prerelease: !!json.prerelease,
    draft: !!json.draft
  };
  latestCache = { at: Date.now(), data };
  return data;
}

export async function getUpdateInfo() {
  const current = currentVersion();
  const repo = configuredRepo();
  const base = {
    current,
    latest: null,
    hasUpdate: false,
    publishedAt: '',
    notes: '',
    htmlUrl: `https://github.com/${repo}/releases`,
    name: '',
    repo,
    disabled: updatesDisabled(),
    watchMode: isWatchMode(),
    status: readStatus()
  };
  try {
    const latest = await fetchLatestRelease();
    if (latest.missing) {
      return { ...base, error: null, message: '尚未在 GitHub 发布正式版本' };
    }
    return {
      ...base,
      latest: latest.version,
      hasUpdate: cmpVersion(latest.version, current) > 0,
      publishedAt: latest.publishedAt,
      notes: latest.notes,
      htmlUrl: latest.htmlUrl,
      name: latest.name,
      error: null
    };
  } catch (err) {
    return { ...base, error: err.message || '无法连接 GitHub' };
  }
}

function assertOfficialUrl(raw, repo) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('更新包地址无效');
  }
  const allowed = new Set([
    'github.com',
    'api.github.com',
    'codeload.github.com',
    'release-assets.githubusercontent.com',
    'objects.githubusercontent.com'
  ]);
  if (!allowed.has(u.hostname)) throw new Error('更新包来源不合法');
  if ((u.hostname === 'github.com' || u.hostname === 'api.github.com' || u.hostname === 'codeload.github.com')
    && !u.pathname.includes(`/${repo}/`) && !u.pathname.startsWith(`/repos/${repo}/`)) {
    throw new Error('更新包不属于当前仓库');
  }
}

function shouldSkip(rel) {
  const n = String(rel).replace(/\\/g, '/');
  const top = n.split('/')[0];
  if (['node_modules', '.git', 'dist', 'gui-test-screenshots'].includes(top)) return true;
  if (n === 'server/data' || n.startsWith('server/data/')) return true;
  if (n === '.env' || n.startsWith('.env.')) return true;
  return false;
}

function copyOverlay(srcRoot, destRoot) {
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const from = path.join(dir, e.name);
      const rel = path.relative(srcRoot, from);
      if (shouldSkip(rel)) continue;
      const to = path.join(destRoot, rel);
      if (e.isDirectory()) {
        fs.mkdirSync(to, { recursive: true });
        walk(from);
      } else if (e.isFile()) {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to);
      }
    }
  };
  walk(srcRoot);
}

function findExtractRoot(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  if (entries.length === 1 && entries[0].isDirectory()) {
    return path.join(dir, entries[0].name);
  }
  return dir;
}

async function extractArchive(archivePath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  try {
    await execFileAsync('tar', ['-xf', archivePath, '-C', destDir], { timeout: 60_000, windowsHide: true });
    return;
  } catch (err) {
    if (process.platform !== 'win32') throw err;
    const ps = `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`;
    await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      timeout: 60_000,
      windowsHide: true
    });
  }
}

async function runNpm(args, timeout) {
  const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return execFileAsync(cmd, args, {
    cwd: APP_ROOT,
    env: process.env,
    timeout,
    windowsHide: true,
    maxBuffer: 12 * 1024 * 1024
  });
}

async function downloadToFile(url, dest, repo) {
  assertOfficialUrl(url, repo);
  const res = await fetch(url, { headers: githubHeaders(), redirect: 'follow' });
  if (!res.ok) throw new Error(`下载更新包失败 (${res.status})`);
  if (res.url) assertOfficialUrl(res.url, repo);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_ARCHIVE_BYTES) throw new Error('更新包过大');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_ARCHIVE_BYTES) throw new Error('更新包过大');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
}

function writeRestartHelper() {
  const helper = path.join(UPDATE_DIR, 'restart.mjs');
  const source = `import { spawn } from 'node:child_process';
import net from 'node:net';

const port = Number(process.env.PORT || 14021);
const root = process.env.PROMPT_HUB_ROOT;
const node = process.execPath;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function canListen() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}

await delay(1200);
for (let i = 0; i < 50; i++) {
  if (await canListen()) break;
  await delay(200);
}

const child = spawn(node, ['server/index.js'], {
  cwd: root,
  detached: true,
  stdio: 'ignore',
  env: process.env,
  windowsHide: true
});
child.unref();
`;
  fs.mkdirSync(UPDATE_DIR, { recursive: true });
  fs.writeFileSync(helper, source);
  return helper;
}

function scheduleRestart() {
  const helper = writeRestartHelper();
  const child = spawn(process.execPath, [helper], {
    cwd: APP_ROOT,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, PROMPT_HUB_ROOT: APP_ROOT },
    windowsHide: true
  });
  child.unref();
  setTimeout(() => process.exit(0), 400);
}

export function isUpdateBusy() {
  if (applyInFlight) return true;
  const s = readStatus();
  if (!BUSY_STATES.has(s.state)) return false;
  const t = Date.parse(s.updatedAt || '') || 0;
  return Date.now() - t < 20 * 60_000;
}

export async function applyLatestUpdate() {
  if (updatesDisabled()) {
    const err = new Error('当前部署已禁用自更新（DISABLE_SELF_UPDATE）');
    err.status = 403;
    throw err;
  }
  if (isWatchMode()) {
    const err = new Error('开发模式（--watch）不支持一键更新，请使用生产模式 npm start');
    err.status = 400;
    throw err;
  }
  if (isUpdateBusy()) {
    const err = new Error('更新正在进行中');
    err.status = 409;
    throw err;
  }

  const current = currentVersion();
  let latest;
  try {
    latest = await fetchLatestRelease({ force: true });
  } catch (err) {
    const e = new Error(err.message || '无法连接 GitHub');
    e.status = 502;
    throw e;
  }
  if (latest.missing || !latest.version) {
    const err = new Error('尚未在 GitHub 发布正式版本');
    err.status = 400;
    throw err;
  }
  if (cmpVersion(latest.version, current) <= 0) {
    const err = new Error('当前已是最新版本');
    err.status = 400;
    throw err;
  }
  if (!latest.zipballUrl) {
    const err = new Error('发布包缺少下载地址');
    err.status = 400;
    throw err;
  }

  applyInFlight = true;
  writeStatus({
    state: 'downloading',
    message: `开始下载 ${latest.version}`,
    from: current,
    to: latest.version,
    log: [],
    error: '',
    startedAt: new Date().toISOString(),
    finishedAt: ''
  });
  pushLog(`发现新版本 ${latest.version}，当前 ${current}`);

  const stamp = Date.now();
  const zipPath = path.join(UPDATE_DIR, `prompt-hub-${latest.version}.zip`);
  const extractDir = path.join(UPDATE_DIR, `extract-${stamp}`);
  const backupDir = path.join(UPDATE_DIR, `backup-${stamp}`);

  try {
    pushLog('正在下载更新包…');
    await downloadToFile(latest.zipballUrl, zipPath, latest.repo);
    pushLog('下载完成，正在解压…');
    writeStatus({ state: 'extracting' });
    await extractArchive(zipPath, extractDir);
    const srcRoot = findExtractRoot(extractDir);
    const pkgPath = path.join(srcRoot, 'package.json');
    if (!fs.existsSync(pkgPath)) throw new Error('更新包缺少 package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg.name && pkg.name !== 'prompt-hub') throw new Error('更新包不是 PromptHub');

    pushLog('备份当前源码…');
    fs.rmSync(backupDir, { recursive: true, force: true });
    copyOverlay(APP_ROOT, backupDir);

    pushLog('覆盖应用文件（保留数据目录）…');
    copyOverlay(srcRoot, APP_ROOT);

    writeStatus({ state: 'installing' });
    pushLog('安装依赖 npm install…');
    await runNpm(['install', '--no-audit', '--no-fund'], 5 * 60_000);

    writeStatus({ state: 'building' });
    pushLog('构建前端 npm run build…');
    await runNpm(['run', 'build'], 3 * 60_000);

    pushLog('准备重启服务…');
    writeStatus({ state: 'restarting', message: `即将重启并切换到 ${latest.version}` });
    try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch { /* ignore */ }
    try { fs.rmSync(zipPath, { force: true }); } catch { /* ignore */ }
    scheduleRestart();
    return { started: true, from: current, to: latest.version };
  } catch (err) {
    pushLog(`更新失败：${err.message}`);
    try {
      if (fs.existsSync(backupDir)) {
        pushLog('正在回滚源码…');
        copyOverlay(backupDir, APP_ROOT);
        pushLog('源码已回滚');
      }
    } catch (rollbackErr) {
      pushLog(`回滚失败：${rollbackErr.message}`);
    }
    writeStatus({
      state: 'error',
      message: err.message || '更新失败',
      error: err.message || '更新失败',
      finishedAt: new Date().toISOString()
    });
    throw err;
  } finally {
    applyInFlight = false;
    try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

