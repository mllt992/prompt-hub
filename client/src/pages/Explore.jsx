import { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, CATEGORIES } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import PromptCard from '../components/PromptCard.jsx';
import Icon, { CATEGORY_ICONS } from '../components/Icon.jsx';

const SORTS = [
  { key: 'new', label: '最新' },
  { key: 'hot', label: '最热' },
  { key: 'likes', label: '最多点赞' }
];

export default function Explore() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const category = params.get('category') || '';
  const tag = params.get('tag') || '';
  const sort = params.get('sort') || 'new';

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const query = new URLSearchParams();
  if (q) query.set('q', q);
  if (category) query.set('category', category);
  if (tag) query.set('tag', tag);
  if (sort !== 'new') query.set('sort', sort);
  query.set('pageSize', 12);

  useEffect(() => {
    setLoading(true);
    setError('');
    fetch(`/api/prompts?${query.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items || []);
        setTotal(d.total || 0);
        setPage(1);
      })
      .catch(() => setError('加载失败，请刷新重试'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, category, tag, sort]);

  const loadMore = useCallback(async () => {
    const next = page + 1;
    const qs = new URLSearchParams(query);
    qs.set('page', next);
    const d = await fetch(`/api/prompts?${qs.toString()}`).then((r) => r.json());
    setItems((prev) => [...prev, ...(d.items || [])]);
    setPage(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, q, category, tag, sort]);

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'sort') next.delete('page');
    setParams(next);
  };

  const filtered = q || category || tag;
  const hasMore = items.length < total;

  return (
    <div className="container page">
      {!filtered && (
        <section className="hero">
          <div className="kicker">PromptHub</div>
          <h1>管理并分享你的高质量提示词</h1>
          <p>
            像管理代码一样管理 Prompt：支持私密收藏与公开分享，拥有独立个人主页；
            覆盖文本对话、图像生成、视频生成与项目工作流场景，可为每条提示词附加效果图与参考链接。
          </p>
          <div className="hero-actions">
            {user ? (
              <Link to="/create" className="btn btn-primary">
                <Icon name="plus" size={15} /> 新建提示词
              </Link>
            ) : (
              <>
                <Link to="/register" className="btn btn-primary">免费注册</Link>
                <Link to="/login" className="btn">登录</Link>
              </>
            )}
          </div>
        </section>
      )}

      <div className="filter-bar">
        <div className="cat-tabs" role="group" aria-label="按分类筛选">
          <button className={`cat-chip ${!category ? 'active' : ''}`} onClick={() => setFilter('category', '')}>
            全部
          </button>
          {Object.entries(CATEGORIES).map(([key, c]) => (
            <button
              key={key}
              className={`cat-chip ${category === key ? 'active' : ''}`}
              onClick={() => setFilter('category', key)}
            >
              <Icon name={CATEGORY_ICONS[key]} size={14} />
              {c.label}
            </button>
          ))}
          {tag && (
            <span className="tag" style={{ alignSelf: 'center' }} onClick={() => setFilter('tag', '')}>
              #{tag} <Icon name="x" size={12} />
            </span>
          )}
        </div>
        <div className="sort-tabs" role="group" aria-label="排序方式">
          {SORTS.map((s) => (
            <button
              key={s.key}
              className={`cat-chip ${sort === s.key ? 'active' : ''}`}
              onClick={() => setFilter('sort', s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {filtered && <div className="result-meta">{q ? `「${q}」的搜索结果，共 ${total} 条` : `共 ${total} 条`}</div>}

      {loading ? (
        <span className="spinner" />
      ) : error ? (
        <div className="empty">
          <div className="empty-icon"><Icon name="info" size={20} /></div>
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"><Icon name="search" size={20} /></div>
          没有找到相关提示词
          <div style={{ marginTop: 12 }}>
            <Link to="/" className="btn btn-sm">清除筛选条件</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="prompt-grid">
            {items.map((p) => (
              <PromptCard key={p.id} prompt={p} />
            ))}
          </div>
          {hasMore && (
            <div className="load-more">
              <button className="btn" onClick={loadMore} disabled={loading}>
                加载更多（{items.length}/{total}）
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
