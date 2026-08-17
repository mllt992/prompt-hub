import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { avatarUrl, timeAgo, api, displayName, getToken, setToken } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import PromptCard from '../components/PromptCard.jsx';
import PostCard from '../components/PostCard.jsx';
import { toast } from '../components/toast.jsx';
import Icon from '../components/Icon.jsx';

export default function Profile() {
  const { username } = useParams();
  const { user, updateUser } = useAuth();
  const isSelf = user && user.username.toLowerCase() === username.toLowerCase();

  const [info, setInfo] = useState(null);
  const [prompts, setPrompts] = useState([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ bio: '', avatar: '', display_name: '', website: '' });
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarFileRef = useRef(null);
  const [pwd, setPwd] = useState({ old: '', next: '', confirm: '' });
  const [pwdBusy, setPwdBusy] = useState(false);

  // 动态标签页
  const [tab, setTab] = useState('prompts');
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    setInfo(null);
    setEditing(false);
    setTab('prompts');
    Promise.all([
      fetch(`/api/users/${encodeURIComponent(username)}`).then((r) => {
        if (!r.ok) throw new Error('用户不存在');
        return r.json();
      }),
      fetch(`/api/prompts?username=${encodeURIComponent(username)}&pageSize=48`).then((r) => r.json())
    ])
      .then(([u, p]) => {
        setInfo(u);
        setPrompts(p.items || []);
        setDraft({
          bio: u.user.bio || '',
          avatar: u.user.avatar || '',
          display_name: u.user.display_name || '',
          website: u.user.website || ''
        });
      })
      .catch((e) => setError(e.message));
  }, [username]);

  useEffect(() => {
    if (tab !== 'posts') return;
    setPostsLoading(true);
    fetch(`/api/users/${encodeURIComponent(username)}/posts`)
      .then((r) => r.json())
      .then((d) => setPosts(d.items || []))
      .catch(() => toast('动态加载失败', 'error'))
      .finally(() => setPostsLoading(false));
  }, [tab, username]);

  const uploadAvatar = async (file) => {
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch('/api/upload/image', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '上传失败');
      setDraft((dr) => ({ ...dr, avatar: d.url }));
      toast('头像已上传，保存后生效');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setUploadingAvatar(false);
      if (avatarFileRef.current) avatarFileRef.current.value = '';
    }
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    try {
      const d = await api('/auth/me', { method: 'PUT', body: draft });
      updateUser(d.user);
      setInfo((prev) => ({ ...prev, user: d.user }));
      setEditing(false);
      toast('资料已更新');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const toggleFollow = async () => {
    if (!user) return toast('请先登录后再关注', 'error');
    try {
      const d = await api(`/users/${encodeURIComponent(username)}/follow`, { method: 'POST' });
      setInfo((prev) => ({
        ...prev,
        stats: { ...prev.stats, is_following: d.following, followers: d.followers }
      }));
      toast(d.following ? `已关注 ${username}` : '已取消关注');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (!pwd.next || pwd.next.length < 6) return toast('新密码至少 6 位', 'error');
    if (pwd.next !== pwd.confirm) return toast('两次输入的新密码不一致', 'error');
      setPwdBusy(true);
      try {
        const d = await api('/auth/password', {
          method: 'PUT',
          body: { oldPassword: pwd.old, newPassword: pwd.next }
        });
        if (d.token) setToken(d.token); // 服务端已吊销旧会话，换用新 token 保持当前登录
        setPwd({ old: '', next: '', confirm: '' });
        toast('密码已更新，其他设备的登录已全部下线');
      } catch (err) {
      toast(err.message, 'error');
    } finally {
      setPwdBusy(false);
    }
  };

  const onPostDelete = (id) => setPosts((arr) => arr.filter((p) => p.id !== id));
  const onPostLike = (id, active, count) =>
    setPosts((arr) => arr.map((p) => (p.id === id ? { ...p, liked: active, like_count: count } : p)));

  if (error) {
    return (
      <div className="container page">
        <div className="empty">
          <div className="empty-icon"><Icon name="user" size={20} /></div>
          {error}
          <div style={{ marginTop: 12 }}><Link to="/" className="btn btn-sm">返回首页</Link></div>
        </div>
      </div>
    );
  }
  if (!info) return <span className="spinner" />;

  const { user: u, stats } = info;

  return (
    <div className="container page">
      <div className="panel profile-header">
        <img className="avatar-xl" src={avatarUrl(u)} alt={u.username} />
        <div className="profile-info">
          <h1>
            {displayName(u)}
            {isSelf && <span className="badge cat-other">这是你</span>}
          </h1>
          <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--muted)' }}>
            @{u.username}
            {u.website && (
              <>
                {' · '}
                <a href={u.website} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <Icon name="link" size={12} /> {u.website.replace(/^https?:\/\//, '').slice(0, 40)}
                </a>
              </>
            )}
          </p>
          <p className="bio">{u.bio || '这个人很懒，什么都没写~'}</p>
          <div className="profile-stats">
            <div className="item"><b>{stats.prompts}</b><span>公开提示词</span></div>
            <div className="item"><b>{stats.posts}</b><span>动态</span></div>
            <div className="item"><b>{stats.following}</b><span>关注</span></div>
            <div className="item"><b>{stats.followers}</b><span>粉丝</span></div>
            <div className="item"><b>{stats.likes}</b><span>获赞</span></div>
            <div className="item"><b>{stats.views}</b><span>浏览量</span></div>
          </div>
        </div>
        <div className="profile-actions">
          {isSelf ? (
            !editing && (
              <>
                <button className="btn" onClick={() => setEditing(true)}>
                  <Icon name="pencil" size={14} /> 编辑资料
                </button>
                <Link to="/mine" className="btn btn-primary">
                  <Icon name="folder" size={14} /> 管理全部提示词
                </Link>
              </>
            )
          ) : (
            <button
              className={`btn ${stats.is_following ? 'follow-btn-following' : 'btn-primary'}`}
              onClick={toggleFollow}
            >
              <Icon name={stats.is_following ? 'check' : 'plus'} size={14} />
              {stats.is_following ? '已关注' : '关注'}
            </button>
          )}
        </div>
      </div>

      {isSelf && editing && (
        <form className="panel form" style={{ marginTop: 16 }} onSubmit={saveProfile}>
          <div className="field">
            <label>头像</label>
            <div className="avatar-edit-row">
              <img src={avatarUrl({ username: u.username, avatar: draft.avatar })} alt="头像预览" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
                <div>
                  <button type="button" className="btn btn-sm" onClick={() => avatarFileRef.current?.click()} disabled={uploadingAvatar}>
                    <Icon name="upload" size={13} /> {uploadingAvatar ? '上传中…' : '上传头像图片'}
                  </button>
                  <input
                    ref={avatarFileRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => uploadAvatar(e.target.files?.[0])}
                  />
                </div>
                <input
                  type="url"
                  value={draft.avatar}
                  onChange={(e) => setDraft((d) => ({ ...d, avatar: e.target.value }))}
                  placeholder="或粘贴头像图片 URL（留空使用默认头像）"
                  aria-label="头像 URL"
                />
              </div>
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="pf-name">昵称 <span className="hint">展示用名称，可不填</span></label>
              <input id="pf-name" type="text" value={draft.display_name} maxLength={30}
                onChange={(e) => setDraft((d) => ({ ...d, display_name: e.target.value }))}
                placeholder="别人看到的名字，留空则显示用户名" />
            </div>
            <div className="field">
              <label htmlFor="pf-site">个人网站 <span className="hint">选填</span></label>
              <input id="pf-site" type="url" value={draft.website} maxLength={200}
                onChange={(e) => setDraft((d) => ({ ...d, website: e.target.value }))}
                placeholder="https://your-site.com" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="pf-bio">个人简介</label>
            <textarea id="pf-bio" rows={2} maxLength={200} value={draft.bio}
              onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value }))} placeholder="介绍一下你自己…" />
          </div>
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setEditing(false)}>取消</button>
            <button className="btn btn-primary">保存</button>
          </div>
        </form>
      )}

      {isSelf && (
        <form className="panel form" style={{ marginTop: 16 }} onSubmit={changePassword}>
          <h3 className="section-title"><Icon name="lock" size={16} /> 账号安全</h3>
          <div className="form-row">
            <div className="field">
              <label htmlFor="pw-old">原密码</label>
              <input id="pw-old" type="password" value={pwd.old} required autoComplete="current-password"
                onChange={(e) => setPwd((p) => ({ ...p, old: e.target.value }))} placeholder="输入当前密码" />
            </div>
            <div className="field">
              <label htmlFor="pw-new">新密码 <span className="hint">至少 6 位</span></label>
              <input id="pw-new" type="password" value={pwd.next} required minLength={6} autoComplete="new-password"
                onChange={(e) => setPwd((p) => ({ ...p, next: e.target.value }))} placeholder="输入新密码" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="pw-confirm">确认新密码</label>
            <input id="pw-confirm" type="password" value={pwd.confirm} required autoComplete="new-password"
              onChange={(e) => setPwd((p) => ({ ...p, confirm: e.target.value }))} placeholder="再次输入新密码" />
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" disabled={pwdBusy}>
              {pwdBusy ? '更新中…' : '更新密码'}
            </button>
          </div>
        </form>
      )}

      <div className="tabs" style={{ marginTop: 28 }}>
        <button className={`tab ${tab === 'prompts' ? 'active' : ''}`} onClick={() => setTab('prompts')}>
          <Icon name="folder" size={15} /> 公开提示词（{stats.prompts}）
        </button>
        <button className={`tab ${tab === 'posts' ? 'active' : ''}`} onClick={() => setTab('posts')}>
          <Icon name="activity" size={15} /> 动态（{stats.posts}）
        </button>
      </div>

      {tab === 'prompts' ? (
        prompts.length === 0 ? (
          <div className="empty">
            <div className="empty-icon"><Icon name="folder" size={20} /></div>
            {isSelf ? '你还没有公开的提示词' : 'TA 还没有公开的提示词'}
            {isSelf && (
              <div style={{ marginTop: 12 }}>
                <Link to="/create" className="btn btn-primary btn-sm"><Icon name="plus" size={13} /> 新建提示词</Link>
              </div>
            )}
          </div>
        ) : (
          <div className="prompt-grid">
            {prompts.map((p) => (
              <PromptCard key={p.id} prompt={p} />
            ))}
          </div>
        )
      ) : postsLoading ? (
        <span className="spinner" />
      ) : posts.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"><Icon name="activity" size={20} /></div>
          {isSelf ? '你还没有发布动态' : 'TA 还没有发布动态'}
        </div>
      ) : (
        <div className="panel" style={{ marginTop: 16, padding: 0, overflow: 'hidden' }}>
          {posts.map((p) => (
            <PostCard key={p.id} post={p} onDelete={onPostDelete} onLike={onPostLike} />
          ))}
        </div>
      )}

      <div className="result-meta" style={{ marginTop: 4 }}>
        加入于 {timeAgo(u.created_at)}
      </div>
    </div>
  );
}
