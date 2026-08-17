import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import Icon from '../components/Icon.jsx';

export default function AuthPage({ mode }) {
  const isLogin = mode === 'login';
  const { login, register } = useAuth();
  const location = useLocation();
  // 登录/注册成功后回到来源页（如被登录拦截的编辑页）
  const from = location.state?.from?.pathname + (location.state?.from?.search || '');
  const [form, setForm] = useState({ username: '', email: '', password: '', inviteCode: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [siteSettings, setSiteSettings] = useState(null);

  // 注册页需要知道站点是否开放注册、是否需要邀请码
  useEffect(() => {
    if (isLogin) return;
    fetch('/api/settings')
      .then((r) => r.json())
      .then(setSiteSettings)
      .catch(() => setSiteSettings({ registration_open: true, require_invite: false }));
  }, [isLogin]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (isLogin) await login(form.username, form.password, from);
      else await register(form.username, form.email, form.password, form.inviteCode, from);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const fillDemo = () => {
    if (isLogin) setForm({ ...form, username: 'demo', password: 'demo123456' });
  };

  const registrationClosed = !isLogin && siteSettings && !siteSettings.registration_open;

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo"><Icon name="terminal" size={19} /></div>
        {registrationClosed ? (
          <>
            <h1>注册暂未开放</h1>
            <p className="sub">管理员已关闭新用户注册，如需账号请联系管理员。</p>
            <Link to="/login" className="btn btn-primary btn-block">返回登录</Link>
          </>
        ) : (
          <>
            <h1>{isLogin ? '欢迎回来' : '创建账号'}</h1>
            <p className="sub">{isLogin ? '登录你的提示词仓库' : '开始管理并分享你的提示词'}</p>
            <form className="form" onSubmit={submit}>
              {error && <div className="form-error">{error}</div>}
              <div className="field">
                <label htmlFor="au-name">{isLogin ? '用户名或邮箱' : '用户名'}</label>
                <input id="au-name" type="text" value={form.username} onChange={set('username')} required
                  placeholder={isLogin ? 'demo' : '2-20 位字母数字'} autoFocus autoComplete="username" />
              </div>
              {!isLogin && (
                <div className="field">
                  <label htmlFor="au-email">邮箱</label>
                  <input id="au-email" type="email" value={form.email} onChange={set('email')} required
                    placeholder="you@example.com" autoComplete="email" />
                </div>
              )}
              <div className="field">
                <label htmlFor="au-pass">密码</label>
                <input id="au-pass" type="password" value={form.password} onChange={set('password')} required
                  placeholder={isLogin ? 'demo123456' : '至少 6 位'} autoComplete={isLogin ? 'current-password' : 'new-password'} />
              </div>
              {!isLogin && siteSettings?.require_invite && (
                <div className="field">
                  <label htmlFor="au-invite">邀请码 <span className="hint">当前站点开启邀请码注册</span></label>
                  <input id="au-invite" type="text" value={form.inviteCode} onChange={set('inviteCode')} required
                    placeholder="请输入邀请码" autoComplete="off" />
                </div>
              )}
              <button className="btn btn-primary btn-block" disabled={busy}>
                {busy ? '请稍候…' : isLogin ? '登录' : '注册'}
              </button>
            </form>
            {isLogin && (
              <button className="demo-tip" onClick={fillDemo}>
                演示账号 <span className="cred">demo / demo123456</span>，点击自动填充
              </button>
            )}
            <div className="switch">
              {isLogin ? (
                <>还没有账号？<Link to="/register">免费注册</Link></>
              ) : (
                <>已有账号？<Link to="/login">直接登录</Link></>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
