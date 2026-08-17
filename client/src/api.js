const TOKEN_KEY = 'ph_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* 空响应 */
  }
  if (!res.ok) {
    // token 失效（过期/被改密吊销）：清除本地凭证并广播事件，由 AuthContext 重置登录态
    if (res.status === 401 && token) {
      clearToken();
      window.dispatchEvent(new Event('ph:auth-expired'));
    }
    throw new Error(data?.error || `请求失败 (${res.status})`);
  }
  return data;
}

export const CATEGORIES = {
  text: { label: '文本对话' },
  image: { label: '图像生成' },
  video: { label: '视频生成' },
  project: { label: '项目工作流' },
  other: { label: '其他' }
};

export const catLabel = (c) => CATEGORIES[c]?.label || '其他';

// 展示名：优先昵称，无则回退用户名
export const displayName = (u) => (u?.display_name?.trim() || u?.username || '');

export const avatarUrl = (user) =>
  user?.avatar?.trim() ||
  `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${encodeURIComponent(user?.username || 'guest')}`;

export function timeAgo(str) {
  if (!str) return '';
  const diff = (Date.now() - new Date(str.replace(' ', 'T') + 'Z').getTime()) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} 天前`;
  return str.slice(0, 10);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }
}
