import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, avatarUrl, timeAgo, displayName } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import Icon from '../components/Icon.jsx';

const PAGE_SIZE = 30;

function describe(n) {
  const who = <Link to={`/u/${n.actor_username}`}>{displayName({ username: n.actor_username, display_name: n.actor_display_name })}</Link>;
  switch (n.type) {
    case 'prompt_like':
      return (
        <>
          {who} 赞了你的提示词
          {n.prompt_title ? <Link to={`/prompt/${n.target_id}`}>「{n.prompt_title}」</Link> : null}
        </>
      );
    case 'comment':
      return (
        <>
          {who} 评论了你的提示词
          {n.prompt_title ? <Link to={`/prompt/${n.target_id}`}>「{n.prompt_title}」</Link> : null}
        </>
      );
    case 'post_like':
      return (
        <>
          {who} 赞了你的动态{n.post_content ? <span className="notif-excerpt">「{n.post_content.slice(0, 30)}」</span> : null}
        </>
      );
    case 'follow':
      return <>{who} 关注了你</>;
    default:
      return null;
  }
}

export default function Notifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (markRead) => {
    try {
      const d = await api(`/notifications?page=1&pageSize=${PAGE_SIZE}`);
      setItems(d.items || []);
      setTotal(d.total || 0);
      if (markRead && d.unread > 0) {
        api('/notifications/read-all', { method: 'POST' }).then(() => setUnread(0));
      } else {
        setUnread(d.unread || 0);
      }
    } catch {
      /* 静默失败 */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return navigate('/login', { state: { from: { pathname: '/notifications' } } });
    load(true);
  }, [user, navigate, load]);

  const loadMore = async () => {
    const next = page + 1;
    try {
      const d = await api(`/notifications?page=${next}&pageSize=${PAGE_SIZE}`);
      setItems((prev) => [...prev, ...(d.items || [])]);
      setPage(next);
    } catch {
      /* 忽略 */
    }
  };

  return (
    <div className="container page" style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ fontSize: 21, margin: '4px 0' }}>
          <Icon name="bell" size={20} style={{ verticalAlign: -3 }} /> 我的通知
        </h1>
        {unread > 0 && <span className="badge cat-video">{unread} 条未读</span>}
      </div>

      <div className="panel" style={{ marginTop: 16, padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <span className="spinner" />
        ) : items.length === 0 ? (
          <div className="empty" style={{ border: 'none', marginTop: 0 }}>
            <div className="empty-icon"><Icon name="bell" size={20} /></div>
            还没有通知，去 <Link to="/">探索页</Link> 逛逛吧
          </div>
        ) : (
          items.map((n) => (
            <div key={n.id} className={`notif-item ${!n.read ? 'unread' : ''}`}>
              <Link to={`/u/${n.actor_username}`}>
                <img className="notif-avatar" src={avatarUrl({ username: n.actor_username, avatar: n.actor_avatar })} alt="" />
              </Link>
              <div className="notif-body">
                <div className="notif-text">{describe(n)}</div>
                <div className="notif-time">{timeAgo(n.created_at)}</div>
              </div>
              {!n.read && <span className="notif-dot" aria-label="未读" />}
            </div>
          ))
        )}
      </div>

      {items.length > 0 && items.length < total && (
        <div className="load-more">
          <button className="btn" onClick={loadMore}>加载更多（{items.length}/{total}）</button>
        </div>
      )}
    </div>
  );
}
