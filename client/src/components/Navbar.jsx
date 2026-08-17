import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { avatarUrl, displayName, getToken } from '../api.js';
import Icon from './Icon.jsx';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    setQ(new URLSearchParams(location.search).get('q') || '');
  }, [location.search]);

  useEffect(() => {
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  // 未读通知数轮询（每 60s，进入通知页后自动清零）
  useEffect(() => {
    if (!user) return setUnread(0);
    let stopped = false;
    const tick = () =>
      fetch('/api/notifications/unread-count', {
        headers: { Authorization: `Bearer ${getToken() || ''}` }
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => !stopped && d && setUnread(d.unread || 0))
        .catch(() => {});
    tick();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') tick();
    }, 60000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [user, location.pathname]);

  const submitSearch = (e) => {
    e.preventDefault();
    navigate(q.trim() ? `/?q=${encodeURIComponent(q.trim())}` : '/');
  };

  return (
    <header className="navbar">
      <div className="nav-inner">
        <Link to="/" className="nav-logo">
          <span className="logo-mark"><Icon name="terminal" size={15} /></span>
          <span className="logo-text">PromptHub</span>
        </Link>
        <nav style={{ display: 'flex', gap: 4 }} aria-label="主导航">
          <Link to="/feed" className="btn btn-ghost btn-sm" style={{ color: 'var(--text-2)' }}>
            <Icon name="activity" size={15} /> <span className="logo-text">动态</span>
          </Link>
        </nav>
        <form className="nav-search" onSubmit={submitSearch}>
          <Icon name="search" size={15} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索提示词、标签、模型…"
            aria-label="搜索提示词"
          />
        </form>
        <div className="nav-actions">
          {user ? (
            <>
              <Link to="/notifications" className="btn btn-ghost btn-sm nav-bell" aria-label={`通知${unread ? `（${unread} 条未读）` : ''}`} title="通知">
                <Icon name="bell" size={16} />
                {unread > 0 && <span className="bell-badge">{unread > 99 ? '99+' : unread}</span>}
              </Link>
              <Link to="/create" className="btn btn-primary btn-sm">
                <Icon name="plus" size={14} /> 新建提示词
              </Link>
              <div style={{ position: 'relative' }} ref={menuRef}>
                <button
                  className="nav-user"
                  style={{ border: 'none', background: 'none', cursor: 'pointer', font: 'inherit', padding: 4 }}
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label="用户菜单"
                >
                  <img src={avatarUrl(user)} alt={user.username} />
                </button>
                {menuOpen && (
                  <div
                    className="panel"
                    style={{
                      position: 'absolute', right: 0, top: 'calc(100% + 8px)', minWidth: 172,
                      padding: '6px', zIndex: 100, boxShadow: 'var(--shadow-md)'
                    }}
                  >
                    <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                      <b>{displayName(user)}</b>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>@{user.username}</div>
                    </div>
                    {user.role === 'admin' && (
                      <Link to="/admin" className="btn btn-ghost btn-sm btn-block" style={{ justifyContent: 'flex-start', color: 'var(--accent)' }} onClick={() => setMenuOpen(false)}>
                        <Icon name="shield" size={14} /> 后台管理
                      </Link>
                    )}
                    <Link to={`/u/${user.username}`} className="btn btn-ghost btn-sm btn-block" style={{ justifyContent: 'flex-start' }} onClick={() => setMenuOpen(false)}>
                      <Icon name="user" size={14} /> 我的主页
                    </Link>
                    <Link to="/mine" className="btn btn-ghost btn-sm btn-block" style={{ justifyContent: 'flex-start' }} onClick={() => setMenuOpen(false)}>
                      <Icon name="folder" size={14} /> 我的提示词
                    </Link>
                    <button className="btn btn-ghost btn-sm btn-block" style={{ justifyContent: 'flex-start', color: 'var(--danger)' }} onClick={() => { setMenuOpen(false); logout(); }}>
                      <Icon name="logOut" size={14} /> 退出登录
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-sm">登录</Link>
              <Link to="/register" className="btn btn-primary btn-sm">注册</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
