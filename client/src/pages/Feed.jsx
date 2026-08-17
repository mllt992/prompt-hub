import { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, avatarUrl } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import PostCard from '../components/PostCard.jsx';
import { toast } from '../components/toast.jsx';
import Icon from '../components/Icon.jsx';

const PAGE_SIZE = 20;
const PULL_THRESHOLD = 60; // 触发下拉刷新的拉动距离（px）
const POLL_INTERVAL = 60000; // 新动态轮询间隔

const isFormControl = (t) =>
  !!(t && t.closest && t.closest('input, textarea, select, button, [contenteditable="true"]'));

export default function Feed() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'following' ? 'following' : 'recommend';

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [booting, setBooting] = useState(true); // 首次加载（无可保留内容时才显示大 spinner）
  const [refreshing, setRefreshing] = useState(false); // 软刷新：保留旧内容 + 顶部进度条
  const [loadingMore, setLoadingMore] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);
  const [newCount, setNewCount] = useState(0);

  // 发布框
  const [content, setContent] = useState('');
  const [promptId, setPromptId] = useState('');
  const [myPrompts, setMyPrompts] = useState([]);
  const [posting, setPosting] = useState(false);

  // 交互状态
  const sinceIdRef = useRef(0); // 当前列表最大动态 id，用于增量轮询
  const pullRef = useRef({ startY: 0, pulling: false });
  const [pullDist, setPullDist] = useState(0);
  const [ptrBusy, setPtrBusy] = useState(false); // 下拉/手动刷新进行中
  const sentinelRef = useRef(null);

  const busy = refreshing || ptrBusy;
  const hasMore = items.length < total;

  const loadFeed = useCallback(async (t, opts = {}) => {
    const { silent = false, scrollTop = false } = opts;
    if (silent) setRefreshing(true);
    else setBooting(true);
    try {
      const d = await fetch(`/api/posts/feed?tab=${t}&pageSize=${PAGE_SIZE}`).then((r) => r.json());
      const list = d.items || [];
      setItems(list);
      setTotal(d.total || 0);
      setPage(1);
      setNeedLogin(!!d.needLogin);
      setNewCount(0);
      sinceIdRef.current = list.length ? Math.max(...list.map((p) => p.id)) : 0;
      if (scrollTop) window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      toast('加载失败，请稍后重试', 'error');
    } finally {
      setBooting(false);
      setRefreshing(false);
      setPtrBusy(false);
    }
  }, []);

  useEffect(() => {
    loadFeed(tab);
  }, [tab, user?.id, loadFeed]);

  useEffect(() => {
    if (!user) return setMyPrompts([]);
    api('/prompts/mine')
      .then((d) => setMyPrompts(d.items || []))
      .catch(() => {});
  }, [user]);

  // 新动态轮询：仅页面可见时执行
  useEffect(() => {
    if (booting || needLogin || sinceIdRef.current <= 0) return;
    const timer = setInterval(async () => {
      if (document.visibilityState !== 'visible' || refreshing || ptrBusy) return;
      try {
        const d = await fetch(`/api/posts/feed?tab=${tab}&since_id=${sinceIdRef.current}`).then((r) => r.json());
        if (d.new_count > 0) setNewCount(d.new_count);
      } catch {
        /* 静默失败，等下一轮 */
      }
    }, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [tab, booting, needLogin, items.length, refreshing, ptrBusy]);

  const loadMore = useCallback(async () => {
    if (loadingMore || booting || items.length >= total) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const d = await fetch(`/api/posts/feed?tab=${tab}&page=${next}&pageSize=${PAGE_SIZE}`).then((r) => r.json());
      setItems((prev) => [...prev, ...(d.items || [])]);
      setPage(next);
    } catch {
      toast('加载失败，请重试', 'error');
    } finally {
      setLoadingMore(false);
    }
  }, [page, tab, loadingMore, booting, items.length, total]);

  // 滚动到底自动加载（IntersectionObserver 兜底失败时仍有按钮）
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '600px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  // 移动端下拉刷新：仅从页面顶部开始、避开表单控件时接管手势
  useEffect(() => {
    const onStart = (e) => {
      if (e.touches.length !== 1 || window.scrollY > 0 || ptrBusy) return;
      if (isFormControl(e.target)) return;
      pullRef.current = { startY: e.touches[0].clientY, pulling: true };
    };
    const onMove = (e) => {
      if (!pullRef.current.pulling) return;
      const dy = e.touches[0].clientY - pullRef.current.startY;
      if (dy > 8 && window.scrollY <= 0) {
        e.preventDefault(); // 阻止浏览器原生下拉刷新/滚动链
        setPullDist(Math.min(dy * 0.4, 90));
      } else if (dy < 0) {
        setPullDist(0);
      }
    };
    const onEnd = () => {
      pullRef.current.pulling = false;
      setPullDist((dist) => {
        if (dist >= PULL_THRESHOLD && !ptrBusy) {
          setPtrBusy(true);
          loadFeed(tab, { silent: true });
        }
        return 0;
      });
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [ptrBusy, tab, loadFeed]);

  const switchTab = (t) => {
    if (t === tab) return;
    const next = new URLSearchParams(params);
    if (t === 'recommend') next.delete('tab');
    else next.set('tab', t);
    setParams(next);
    window.scrollTo({ top: 0 });
  };

  const manualRefresh = () => {
    if (busy) return;
    setPtrBusy(true);
    loadFeed(tab, { silent: true, scrollTop: true });
  };

  const showNewPosts = () => {
    setNewCount(0);
    loadFeed(tab, { silent: true, scrollTop: true });
  };

  const submitPost = async (e) => {
    e.preventDefault();
    const text = content.trim();
    if (!text) return toast('写点什么再发布吧', 'error');
    setPosting(true);
    try {
      const post = await api('/posts', {
        method: 'POST',
        body: { content: text, prompt_id: promptId ? Number(promptId) : null }
      });
      setItems((arr) => [post, ...arr]);
      setTotal((n) => n + 1);
      sinceIdRef.current = Math.max(sinceIdRef.current, post.id);
      setContent('');
      setPromptId('');
      toast('已发布');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setPosting(false);
    }
  };

  const onPostDelete = (id) => {
    setItems((arr) => arr.filter((p) => p.id !== id));
    setTotal((n) => Math.max(0, n - 1));
  };

  const onPostLike = (id, active, count) => {
    setItems((arr) => arr.map((p) => (p.id === id ? { ...p, liked: active, like_count: count } : p)));
  };

  return (
    <div className="container page">
      <div className="feed-layout">
        {busy && <div className="feed-progress" aria-hidden="true" />}

        <div className="feed-bar">
          <div className="tabs" style={{ flex: 1, marginTop: 0 }}>
            <button className={`tab ${tab === 'recommend' ? 'active' : ''}`} onClick={() => switchTab('recommend')}>
              <Icon name="activity" size={15} /> 推荐
            </button>
            <button className={`tab ${tab === 'following' ? 'active' : ''}`} onClick={() => switchTab('following')}>
              <Icon name="users" size={15} /> 关注
            </button>
          </div>
          <button
            className="btn btn-sm feed-refresh"
            onClick={manualRefresh}
            disabled={busy}
            aria-label="刷新动态"
            title="刷新动态"
          >
            <Icon name="refreshCw" size={15} className={busy ? 'icon-spin' : ''} />
          </button>
        </div>

        {/* 下拉刷新指示器（移动端） */}
        <div className="ptr" style={{ height: pullDist }} aria-hidden="true">
          {pullDist > 0 && !ptrBusy && (
            <span className="ptr-dot" style={{ transform: `rotate(${pullDist * 4}deg)` }}>
              <Icon name="chevronDown" size={15} />
            </span>
          )}
          {ptrBusy && (
            <span className="ptr-dot busy">
              <Icon name="refreshCw" size={15} className="icon-spin" />
            </span>
          )}
        </div>

        {/* 新动态提示胶囊 */}
        {newCount > 0 && !busy && (
          <button className="new-posts-pill" onClick={showNewPosts}>
            <Icon name="arrowUp" size={14} />
            {newCount} 条新动态
          </button>
        )}

        {user ? (
          <form className="panel composer" style={{ marginTop: 12 }} onSubmit={submitPost}>
            <img className="c-avatar" src={avatarUrl(user)} alt="" />
            <div className="c-main">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value.slice(0, 500))}
                placeholder="分享一条新动态：用法心得、效果展示、新提示词上线…"
                aria-label="动态内容"
              />
              <div className="c-toolbar">
                <select value={promptId} onChange={(e) => setPromptId(e.target.value)} aria-label="关联提示词">
                  <option value="">不关联提示词</option>
                  {myPrompts.map((p) => (
                    <option key={p.id} value={p.id}>
                      关联：{p.title}
                    </option>
                  ))}
                </select>
                <span className={`c-count ${content.length >= 480 ? 'over' : ''}`}>{content.length}/500</span>
                <button className="btn btn-primary btn-sm" disabled={posting || !content.trim()}>
                  <Icon name="send" size={14} /> {posting ? '发布中…' : '发布'}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="settings-hint" style={{ marginTop: 12 }}>
            <Icon name="info" size={16} />
            登录后可以发布动态、关注创作者，获得个性化推荐。
            <Link to="/login" style={{ marginLeft: 'auto' }}>去登录</Link>
          </div>
        )}

        <div className="panel" style={{ marginTop: 12, padding: 0, overflow: 'hidden' }}>
          {booting ? (
            <span className="spinner" />
          ) : needLogin ? (
            <div className="empty" style={{ border: 'none', marginTop: 0 }}>
              <div className="empty-icon"><Icon name="users" size={20} /></div>
              登录后可查看你关注创作者的动态
              <div style={{ marginTop: 12 }}>
                <Link to="/login" className="btn btn-primary btn-sm">去登录</Link>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="empty" style={{ border: 'none', marginTop: 0 }}>
              <div className="empty-icon"><Icon name="activity" size={20} /></div>
              {tab === 'following'
                ? '你关注的人还没有发布动态，去推荐页逛逛吧'
                : '还没有动态，发布第一条吧'}
              {tab === 'following' && (
                <div style={{ marginTop: 12 }}>
                  <button className="btn btn-sm" onClick={() => switchTab('recommend')}>去看推荐</button>
                </div>
              )}
            </div>
          ) : (
            <>
              {items.map((p) => (
                <PostCard key={p.id} post={p} onDelete={onPostDelete} onLike={onPostLike} />
              ))}
            </>
          )}
        </div>

        {items.length > 0 && !booting && (
          <>
            <div ref={sentinelRef} style={{ height: 1 }} aria-hidden="true" />
            {hasMore ? (
              <div className="feed-more">
                <button className="btn btn-sm" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? '加载中…' : `加载更多（${items.length}/${total}）`}
                </button>
              </div>
            ) : (
              <div className="feed-end">· 已经到底了 ·</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
