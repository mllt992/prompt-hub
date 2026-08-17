// 简单滑动窗口限流（单实例内存版；多实例部署需换 Redis 等共享存储）
const buckets = new Map();
const MAX_KEYS = 20000;

function hit(key, windowMs) {
  const now = Date.now();
  let arr = buckets.get(key);
  if (!arr) {
    arr = [];
    buckets.set(key, arr);
  }
  const expired = now - windowMs;
  while (arr.length && arr[0] <= expired) arr.shift();
  arr.push(now);
  if (buckets.size > MAX_KEYS) {
    // 粗略清理：全表扫一遍过期桶，防止 key 无限增长
    for (const [k, v] of buckets) {
      if (!v.length || v[v.length - 1] <= expired) buckets.delete(k);
    }
  }
  return arr.length;
}

/**
 * 用法：rateLimit({ windowMs: 15 * 60_000, max: 10 })
 * key 优先取登录用户 id，否则取客户端 IP
 */
export function rateLimit({ windowMs, max, message = '操作过于频繁，请稍后再试' }) {
  return (req, res, next) => {
    const who = req.user?.id ?? req.ip ?? 'unknown';
    const key = `${req.path}:${who}`;
    if (hit(key, windowMs) > max) {
      res.set('Retry-After', Math.ceil(windowMs / 1000));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

export default rateLimit;
