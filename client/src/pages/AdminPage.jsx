import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api, avatarUrl, catLabel, timeAgo, displayName } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { toast } from '../components/toast.jsx';
import Icon, { CATEGORY_ICONS } from '../components/Icon.jsx';

/* ================= 通用组件 ================= */

function ConfirmModal({ confirm, onClose }) {
  if (!confirm) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3 className={confirm.danger ? 'danger' : ''}>
          <Icon name={confirm.danger ? 'trash' : 'info'} size={18} />
          {confirm.title}
        </h3>
        <p>{confirm.message}</p>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>取消</button>
          <button
            className={`btn ${confirm.danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => { onClose(); confirm.onOk(); }}
          >
            {confirm.confirmText || '确认'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Drawer({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={title}>
        <div className="drawer-head">
          <h3>{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="关闭">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </>
  );
}

function Pagination({ page, pageSize, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="admin-pagination">
      <span>共 {total} 条 · 第 {page}/{pages} 页</span>
      <div className="pager">
        <button className="btn btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>上一页</button>
        <button className="btn btn-sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>下一页</button>
      </div>
    </div>
  );
}

function TableWrap({ children }) {
  return <div className="table-wrap"><table className="table">{children}</table></div>;
}

/* ================= 概览 ================= */

function OverviewSection({ stats }) {
  const [recents, setRecents] = useState({ users: [], prompts: [], posts: [] });
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    Promise.all([
      api('/admin/users?pageSize=5'),
      api('/admin/prompts?pageSize=5'),
      api('/admin/posts?pageSize=5'),
      api('/admin/logs?limit=20')
    ])
      .then(([u, p, po, l]) => setRecents({ users: u.items, prompts: p.items, posts: po.items, logs: l.items }))
      .catch((e) => toast(e.message, 'error'));
  }, []);

  const kpis = [
    { icon: 'users', t: 't-blue', num: stats?.users ?? '–', lbl: '用户总数' },
    { icon: 'user', t: 't-teal', num: stats?.todayUsers ?? '–', lbl: '今日新增用户' },
    { icon: 'shield', t: 't-amber', num: stats?.admins ?? '–', lbl: '管理员' },
    { icon: 'lock', t: 't-rose', num: stats?.banned ?? '–', lbl: '已封禁' },
    { icon: 'folder', t: 't-blue', num: stats?.prompts ?? '–', lbl: '提示词总数' },
    { icon: 'eye', t: 't-teal', num: stats?.views ?? '–', lbl: '总浏览量' },
    { icon: 'heart', t: 't-rose', num: stats?.likes ?? '–', lbl: '总点赞' },
    { icon: 'activity', t: 't-green', num: stats?.posts ?? '–', lbl: '动态总数' }
  ];

  return (
    <>
      <div className="kpi-grid">
        {kpis.map((k) => (
          <div className="kpi" key={k.lbl}>
            <span className={`kpi-icon ${k.t}`}><Icon name={k.icon} size={18} /></span>
            <span>
              <span className="num">{k.num}</span>
              <div className="lbl">{k.lbl}</div>
            </span>
          </div>
        ))}
      </div>

      <div className="admin-recent-grid">
        <div className="panel">
          <h3 className="section-title"><Icon name="users" size={15} /> 最新用户</h3>
          <div className="recent-list">
            {recents.users.map((u) => (
              <div className="recent-item" key={u.id}>
                <img src={avatarUrl(u)} alt="" style={{ width: 26, height: 26, borderRadius: '50%' }} />
                <span className="r-main">
                  <span className="r-title">{displayName(u)} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>@{u.username}</span></span>
                  <span className="r-sub">{u.email}</span>
                </span>
                <span className="r-time">{timeAgo(u.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <h3 className="section-title"><Icon name="folder" size={15} /> 最新提示词</h3>
          <div className="recent-list">
            {recents.prompts.map((p) => (
              <div className="recent-item" key={p.id}>
                <span className={`badge cat-${p.category}`}><Icon name={CATEGORY_ICONS[p.category] || 'package'} size={11} /></span>
                <span className="r-main">
                  <Link to={`/prompt/${p.id}`} className="r-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</Link>
                  <span className="r-sub">@{p.username} · {p.visibility === 'private' ? '私密' : '公开'}</span>
                </span>
                <span className="r-time">{timeAgo(p.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <h3 className="section-title"><Icon name="activity" size={15} /> 最新动态</h3>
          <div className="recent-list">
            {recents.posts.map((p) => (
              <div className="recent-item" key={p.id}>
                <span className="r-main">
                  <span className="r-title" style={{ fontWeight: 400 }}>{p.content}</span>
                  <span className="r-sub">@{p.username}</span>
                </span>
                <span className="r-time">{timeAgo(p.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h3 className="section-title"><Icon name="clock" size={15} /> 管理操作日志</h3>
        <div className="log-list">
          {(recents.logs || []).map((l) => (
            <div className="log-item" key={l.id}>
              <span className="log-action">{l.action}</span>
              <span className="log-detail" title={`${l.admin_name} · ${l.detail}`}>{l.detail}</span>
              <span className="log-meta">{l.admin_name} · {timeAgo(l.created_at)}</span>
            </div>
          ))}
          {(recents.logs || []).length === 0 && (
            <div className="log-item" style={{ color: 'var(--muted)' }}>暂无操作记录</div>
          )}
        </div>
      </div>
    </>
  );
}

/* ================= 用户管理 ================= */

function UsersSection({ askConfirm, refreshCounts }) {
  const { user: me } = useAuth();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [newPwd, setNewPwd] = useState('');

  const load = useCallback(async (query = q, p = page) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (query) qs.set('q', query);
      qs.set('page', p);
      const d = await api(`/admin/users?${qs}`);
      setData(d);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [q, page]);

  useEffect(() => { load('', 1); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const openDetail = async (id) => {
    setDetailId(id);
    setDetail(null);
    setNewPwd('');
    try {
      setDetail(await api(`/admin/users/${id}`));
    } catch (e) {
      toast(e.message, 'error');
      setDetailId(null);
    }
  };

  const reloadDetail = async () => detailId && openDetail(detailId);

  const update = async (u, body, message) => {
    try {
      await api(`/admin/users/${u.id}`, { method: 'PUT', body });
      toast(message);
      reloadDetail();
      load();
      refreshCounts?.();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const resetPassword = async (u) => {
    if (newPwd.length < 6) return toast('新密码至少 6 位', 'error');
    try {
      await api(`/admin/users/${u.id}/password`, { method: 'PUT', body: { newPassword: newPwd } });
      setNewPwd('');
      toast(`已重置 ${u.username} 的密码`);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const removeUser = (u) => {
    askConfirm(
      '删除用户',
      `确定删除用户「${u.username}」？\n其名下 ${detail?.stats.promptsTotal ?? u.prompt_count} 条提示词、${detail?.stats.posts ?? u.post_count} 条动态将一并删除，此操作不可恢复。`,
      async () => {
        try {
          await api(`/admin/users/${u.id}`, { method: 'DELETE' });
          toast('用户已删除');
          setDetailId(null);
          load();
          refreshCounts?.();
        } catch (e) {
          toast(e.message, 'error');
        }
      }
    );
  };

  const u = detail?.user;
  const isSelf = u && u.id === me?.id;

  return (
    <>
      <form
        className="admin-toolbar"
        onSubmit={(e) => { e.preventDefault(); setPage(1); load(q, 1); }}
      >
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索用户名、昵称或邮箱…"
          aria-label="搜索用户"
        />
        <button className="btn" type="submit"><Icon name="search" size={14} /> 搜索</button>
      </form>

      {loading ? <span className="spinner" /> : (
        <>
          <TableWrap>
            <thead>
              <tr>
                <th>用户</th><th>邮箱</th><th>角色</th><th>状态</th>
                <th>提示词</th><th>动态</th><th>注册时间</th>
                <th className="cell-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(row.id)}>
                  <td>
                    <span className="mini-user">
                      <img src={avatarUrl(row)} alt="" />
                      <span className="name">{displayName(row)}{row.id === me?.id ? '（我）' : ''}</span>
                    </span>
                  </td>
                  <td className="cell-muted">{row.email}</td>
                  <td><span className={`badge ${row.role === 'admin' ? 'cat-text' : 'cat-other'}`}>{row.role === 'admin' ? '管理员' : '用户'}</span></td>
                  <td><span className={`badge ${row.status === 'banned' ? 'cat-video' : 'cat-project'}`}>{row.status === 'banned' ? '已封禁' : '正常'}</span></td>
                  <td className="cell-muted">{row.prompt_count}</td>
                  <td className="cell-muted">{row.post_count}</td>
                  <td className="cell-muted">{timeAgo(row.created_at)}</td>
                  <td className="cell-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-sm" onClick={() => openDetail(row.id)}>
                      <Icon name="eye" size={13} /> 详情
                    </button>
                  </td>
                </tr>
              ))}
              {data.items.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 28 }}>没有匹配的用户</td></tr>
              )}
            </tbody>
          </TableWrap>
          <Pagination page={page} pageSize={20} total={data.total} onChange={(p) => { setPage(p); load(q, p); }} />
        </>
      )}

      {detailId && (
        <Drawer title="用户详情" onClose={() => setDetailId(null)}>
          {!detail ? <span className="spinner" /> : (
            <>
              <div className="drawer-profile">
                <img src={avatarUrl(u)} alt="" />
                <div>
                  <div className="dp-name">
                    {displayName(u)}
                    <span className={`badge ${u.role === 'admin' ? 'cat-text' : 'cat-other'}`}>{u.role === 'admin' ? '管理员' : '用户'}</span>
                    <span className={`badge ${u.status === 'banned' ? 'cat-video' : 'cat-project'}`}>{u.status === 'banned' ? '已封禁' : '正常'}</span>
                  </div>
                  <div className="dp-sub">@{u.username}{isSelf ? ' · 这是你自己' : ''}</div>
                </div>
              </div>

              <div className="mini-stats">
                <div className="ms"><b>{detail.stats.promptsPublic}/{detail.stats.promptsTotal}</b><span>提示词 公/总</span></div>
                <div className="ms"><b>{detail.stats.posts}</b><span>动态</span></div>
                <div className="ms"><b>{detail.stats.likesReceived}</b><span>获赞</span></div>
                <div className="ms"><b>{detail.stats.followers}</b><span>粉丝</span></div>
                <div className="ms"><b>{detail.stats.following}</b><span>关注</span></div>
                <div className="ms"><b>{timeAgo(u.created_at).replace('前', '')}</b><span>注册于</span></div>
              </div>

              <div>
                <h4 className="drawer-sec-title">资料</h4>
                <div className="info-rows">
                  <div className="row"><span className="k">邮箱</span><span className="v">{u.email}</span></div>
                  {u.website && <div className="row"><span className="k">网站</span><span className="v"><a href={u.website} target="_blank" rel="noreferrer">{u.website}</a></span></div>}
                  <div className="row"><span className="k">简介</span><span className="v">{u.bio || '—'}</span></div>
                </div>
              </div>

              {detail.recentPrompts.length > 0 && (
                <div>
                  <h4 className="drawer-sec-title">近期提示词</h4>
                  <div className="recent-list">
                    {detail.recentPrompts.map((p) => (
                      <div className="recent-item" key={p.id}>
                        <span className={`badge cat-${p.category}`}><Icon name={CATEGORY_ICONS[p.category] || 'package'} size={11} /></span>
                        <Link to={`/prompt/${p.id}`} className="r-title" style={{ flex: 1, minWidth: 0 }}>{p.title}</Link>
                        {p.visibility === 'private' && <span className="badge badge-private">私密</span>}
                        {!!p.nsfw && <span className="badge badge-nsfw">NSFW</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.recentPosts.length > 0 && (
                <div>
                  <h4 className="drawer-sec-title">近期动态</h4>
                  <div className="recent-list">
                    {detail.recentPosts.map((p) => (
                      <div className="recent-item" key={p.id}>
                        <span className="r-title" style={{ fontWeight: 400, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.content}</span>
                        <span className="r-time">{timeAgo(p.created_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="drawer-actions">
                <h4 className="drawer-sec-title" style={{ marginBottom: 0 }}>管理操作</h4>
                {!isSelf ? (
                  <>
                    <div className="da-row">
                      <button className="btn" onClick={() => update(u, { role: u.role === 'admin' ? 'user' : 'admin' }, u.role === 'admin' ? '已撤销管理员' : '已设为管理员')}>
                        <Icon name="shield" size={14} /> {u.role === 'admin' ? '撤销管理员' : '设为管理员'}
                      </button>
                      <button className="btn" onClick={() => update(u, { status: u.status === 'banned' ? 'active' : 'banned' }, u.status === 'banned' ? '已解封' : '已封禁')}>
                        <Icon name={u.status === 'banned' ? 'check' : 'lock'} size={14} /> {u.status === 'banned' ? '解封账号' : '封禁账号'}
                      </button>
                    </div>
                    <div className="pw-reset-row">
                      <input type="text" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="重置密码：输入新密码（≥6位）" autoComplete="new-password" />
                      <button className="btn" onClick={() => resetPassword(u)}><Icon name="pencil" size={14} /> 重置</button>
                    </div>
                    <button className="btn btn-danger" onClick={() => removeUser(u)}>
                      <Icon name="trash" size={14} /> 删除用户
                    </button>
                  </>
                ) : (
                  <div className="settings-hint">
                    <Icon name="info" size={15} /> 不能对自己执行角色、封禁或删除操作；修改自己的密码请前往个人主页。
                  </div>
                )}
              </div>
            </>
          )}
        </Drawer>
      )}
    </>
  );
}

/* ================= 提示词管理 ================= */

function PromptsSection({ askConfirm, refreshCounts }) {
  const [f, setF] = useState({ q: '', visibility: '', category: '', sort: 'new' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [preview, setPreview] = useState(null);

  const load = useCallback(async (filters = f, p = page) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filters.q) qs.set('q', filters.q);
      if (filters.visibility) qs.set('visibility', filters.visibility);
      if (filters.category) qs.set('category', filters.category);
      if (filters.sort === 'hot') qs.set('sort', 'hot');
      qs.set('page', p);
      const d = await api(`/admin/prompts?${qs}`);
      setData(d);
      setSelected(new Set());
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [f, page]);

  useEffect(() => { load({ q: '', visibility: '', category: '', sort: 'new' }, 1); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const applyFilters = (next) => {
    setF(next);
    setPage(1);
    load(next, 1);
  };

  const toggleSelect = (id) => {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const allSelected = data.items.length > 0 && data.items.every((p) => selected.has(p.id));
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(data.items.map((p) => p.id)));
  };

  const openPreview = async (id) => {
    setPreview({ loading: true });
    try {
      const d = await api(`/admin/prompts/${id}`);
      setPreview(d.prompt);
    } catch (e) {
      toast(e.message, 'error');
      setPreview(null);
    }
  };

  const toggleVisibility = async (p) => {
    try {
      const d = await api(`/admin/prompts/${p.id}/visibility`, { method: 'PATCH' });
      setData((prev) => ({ ...prev, items: prev.items.map((x) => (x.id === p.id ? { ...x, visibility: d.visibility } : x)) }));
      toast(d.visibility === 'public' ? '已设为公开' : '已设为私密');
      refreshCounts?.();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  // 管理员强制 NSFW 标记（作者漏标时兜底）
  const toggleNsfw = async (p) => {
    try {
      const d = await api(`/admin/prompts/${p.id}/nsfw`, {
        method: 'PATCH',
        body: { nsfw: !p.nsfw }
      });
      setData((prev) => ({ ...prev, items: prev.items.map((x) => (x.id === p.id ? { ...x, nsfw: d.nsfw ? 1 : 0 } : x)) }));
      setPreview((prev) => (prev && prev.id === p.id ? { ...prev, nsfw: d.nsfw } : prev));
      toast(d.nsfw ? '已强制标记为 NSFW' : '已取消 NSFW 标记');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const removeOne = (p) => {
    askConfirm('删除提示词', `确定删除「${p.title}」？此操作不可恢复。`, async () => {
      try {
        await api(`/admin/prompts/${p.id}`, { method: 'DELETE' });
        toast('已删除');
        setPreview(null);
        load();
        refreshCounts?.();
      } catch (e) {
        toast(e.message, 'error');
      }
    });
  };

  // 批量：设为公开/私密（仅切换需要变更的），或删除
  const batchSetVisibility = (target) => {
    const targets = data.items.filter((p) => selected.has(p.id) && p.visibility !== target);
    if (targets.length === 0) return toast('所选提示词已全部是该可见性');
    askConfirm(
      `批量设为${target === 'public' ? '公开' : '私密'}`,
      `将对 ${targets.length} 条提示词执行操作。`,
      async () => {
        try {
          for (const p of targets) {
            await api(`/admin/prompts/${p.id}/visibility`, { method: 'PATCH' });
          }
          toast(`已将 ${targets.length} 条设为${target === 'public' ? '公开' : '私密'}`);
          load();
          refreshCounts?.();
        } catch (e) {
          toast(e.message, 'error');
        }
      },
      true,
      `设为${target === 'public' ? '公开' : '私密'}`
    );
  };

  const batchDelete = () => {
    const targets = data.items.filter((p) => selected.has(p.id));
    askConfirm('批量删除提示词', `确定删除选中的 ${targets.length} 条提示词？此操作不可恢复。`, async () => {
      try {
        for (const p of targets) {
          await api(`/admin/prompts/${p.id}`, { method: 'DELETE' });
        }
        toast(`已删除 ${targets.length} 条提示词`);
        load();
        refreshCounts?.();
      } catch (e) {
        toast(e.message, 'error');
      }
    });
  };

  return (
    <>
      <form
        className="admin-toolbar"
        onSubmit={(e) => { e.preventDefault(); applyFilters(f); }}
      >
        <input type="text" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="搜索标题、标签或作者…" aria-label="搜索提示词" />
        <select value={f.visibility} onChange={(e) => applyFilters({ ...f, visibility: e.target.value })} aria-label="可见性">
          <option value="">全部可见性</option><option value="public">公开</option><option value="private">私密</option>
        </select>
        <select value={f.category} onChange={(e) => applyFilters({ ...f, category: e.target.value })} aria-label="分类">
          <option value="">全部分类</option><option value="text">文本对话</option><option value="image">图像生成</option>
          <option value="video">视频生成</option><option value="project">项目工作流</option><option value="other">其他</option>
        </select>
        <select value={f.sort} onChange={(e) => applyFilters({ ...f, sort: e.target.value })} aria-label="排序">
          <option value="new">按时间</option><option value="hot">按浏览量</option>
        </select>
        <button className="btn" type="submit"><Icon name="search" size={14} /> 筛选</button>
      </form>

      {selected.size > 0 && (
        <div className="batch-bar">
          <span className="b-count">已选 {selected.size} 项</span>
          <span className="spacer" />
          <button className="btn btn-sm" onClick={() => batchSetVisibility('public')}><Icon name="globe" size={13} /> 批量设为公开</button>
          <button className="btn btn-sm" onClick={() => batchSetVisibility('private')}><Icon name="lock" size={13} /> 批量设为私密</button>
          <button className="btn btn-danger btn-sm" onClick={batchDelete}><Icon name="trash" size={13} /> 批量删除</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}><Icon name="x" size={13} /> 取消</button>
        </div>
      )}

      {loading ? <span className="spinner" /> : (
        <>
          <TableWrap>
            <thead>
              <tr>
                <th style={{ width: 36 }}><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="全选本页" /></th>
                <th>标题</th><th>作者</th><th>分类</th><th>可见性</th><th>浏览</th><th>点赞</th><th>时间</th>
                <th className="cell-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.id}>
                  <td><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} aria-label={`选择 ${p.title}`} /></td>
                  <td className="cell-title" title={p.title}>
                    <a href="#" onClick={(e) => { e.preventDefault(); openPreview(p.id); }} style={{ color: 'var(--text)' }}>{p.title}</a>
                    {!!p.nsfw && <span className="badge badge-nsfw" style={{ marginLeft: 6 }}>NSFW</span>}
                  </td>
                  <td className="cell-muted">{p.username}</td>
                  <td><span className={`badge cat-${p.category}`}><Icon name={CATEGORY_ICONS[p.category] || 'package'} size={11} /> {catLabel(p.category)}</span></td>
                  <td>
                    <span className={`badge ${p.visibility === 'private' ? 'badge-private' : 'cat-project'}`}>
                      <Icon name={p.visibility === 'private' ? 'lock' : 'globe'} size={11} />
                      {p.visibility === 'private' ? '私密' : '公开'}
                    </span>
                  </td>
                  <td className="cell-muted">{p.views}</td>
                  <td className="cell-muted">{p.like_count}</td>
                  <td className="cell-muted">{timeAgo(p.created_at)}</td>
                  <td className="cell-actions">
                    <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn btn-sm" onClick={() => openPreview(p.id)} title="查看详情"><Icon name="eye" size={13} /></button>
                      <button className="btn btn-sm" onClick={() => toggleVisibility(p)} title={p.visibility === 'public' ? '设为私密' : '设为公开'}>
                        <Icon name={p.visibility === 'public' ? 'lock' : 'globe'} size={13} />
                      </button>
                      <button
                        className={`btn btn-sm ${p.nsfw ? 'btn-danger' : ''}`}
                        onClick={() => toggleNsfw(p)}
                        title={p.nsfw ? '取消 NSFW 标记' : '强制标记为 NSFW'}
                      >
                        <Icon name="eye" size={13} />
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => removeOne(p)} title="删除"><Icon name="trash" size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.items.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 28 }}>没有匹配的提示词</td></tr>
              )}
            </tbody>
          </TableWrap>
          <Pagination page={page} pageSize={20} total={data.total} onChange={(p) => { setPage(p); load(f, p); }} />
        </>
      )}

      {preview && (
        <Drawer title="提示词详情" onClose={() => setPreview(null)}>
          {preview.loading ? <span className="spinner" /> : (
            <>
              <div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span className={`badge cat-${preview.category}`}><Icon name={CATEGORY_ICONS[preview.category] || 'package'} size={12} /> {catLabel(preview.category)}</span>
                  <span className={`badge ${preview.visibility === 'private' ? 'badge-private' : 'cat-project'}`}>
                    <Icon name={preview.visibility === 'private' ? 'lock' : 'globe'} size={11} /> {preview.visibility === 'private' ? '私密' : '公开'}
                  </span>
                  {!!preview.nsfw && <span className="badge badge-nsfw"><Icon name="eye" size={11} /> NSFW</span>}
                  {preview.model && <span className="badge badge-model">{preview.model}</span>}
                </div>
                <h3 style={{ margin: '0 0 6px', fontSize: 17 }}>{preview.title}</h3>
                <div className="dp-sub" style={{ marginBottom: 10 }}>@{preview.username} · {timeAgo(preview.created_at)} · {preview.views} 浏览 · {preview.like_count} 点赞</div>
                {preview.description && <p style={{ margin: '0 0 12px', color: 'var(--text-2)', fontSize: 13.5 }}>{preview.description}</p>}
              </div>
              <div>
                <h4 className="drawer-sec-title">提示词内容</h4>
                <div className="prompt-preview">{preview.content}</div>
              </div>
              {preview.images?.length > 0 && (
                <div>
                  <h4 className="drawer-sec-title">效果图（{preview.images.length}）</h4>
                  <div className="gallery" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                    {preview.images.map((src, i) => (
                      <img key={i} src={src} alt="" loading="lazy" className={preview.nsfw ? 'nsfw-hidden' : ''} />
                    ))}
                  </div>
                </div>
              )}
              <div className="drawer-actions">
                <h4 className="drawer-sec-title" style={{ marginBottom: 0 }}>管理操作</h4>
                <div className="da-row">
                  <Link to={`/prompt/${preview.id}`} className="btn"><Icon name="externalLink" size={14} /> 打开前台页面</Link>
                  <button className="btn" onClick={() => { toggleVisibility(preview); setPreview({ ...preview, visibility: preview.visibility === 'public' ? 'private' : 'public' }); }}>
                    <Icon name={preview.visibility === 'public' ? 'lock' : 'globe'} size={14} /> 设为{preview.visibility === 'public' ? '私密' : '公开'}
                  </button>
                  <button className={`btn ${preview.nsfw ? 'btn-danger' : ''}`} onClick={() => toggleNsfw(preview)}>
                    <Icon name="eye" size={14} /> {preview.nsfw ? '取消 NSFW' : '标记 NSFW'}
                  </button>
                </div>
                <button className="btn btn-danger" onClick={() => removeOne(preview)}><Icon name="trash" size={14} /> 删除提示词</button>
              </div>
            </>
          )}
        </Drawer>
      )}
    </>
  );
}

/* ================= 动态管理 ================= */

function PostsSection({ askConfirm, refreshCounts }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (query = q, p = page) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (query) qs.set('q', query);
      qs.set('page', p);
      const d = await api(`/admin/posts?${qs}`);
      setData(d);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [q, page]);

  useEffect(() => { load('', 1); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const removePost = (p) => {
    askConfirm('删除动态', `确定删除 @${p.username} 的这条动态？\n「${p.content.slice(0, 60)}${p.content.length > 60 ? '…' : ''}」`, async () => {
      try {
        await api(`/admin/posts/${p.id}`, { method: 'DELETE' });
        toast('已删除');
        load();
        refreshCounts?.();
      } catch (e) {
        toast(e.message, 'error');
      }
    });
  };

  return (
    <>
      <form className="admin-toolbar" onSubmit={(e) => { e.preventDefault(); setPage(1); load(q, 1); }}>
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索动态内容或作者…" aria-label="搜索动态" />
        <button className="btn" type="submit"><Icon name="search" size={14} /> 搜索</button>
      </form>

      {loading ? <span className="spinner" /> : (
        <>
          <TableWrap>
            <thead>
              <tr><th>动态内容</th><th>作者</th><th>关联提示词</th><th>点赞</th><th>时间</th><th className="cell-actions">操作</th></tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.id}>
                  <td style={{ maxWidth: 360 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.content}>{p.content}</span>
                  </td>
                  <td className="cell-muted">@{p.username}</td>
                  <td className="cell-muted" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.prompt_title || '—'}
                  </td>
                  <td className="cell-muted">{p.like_count}</td>
                  <td className="cell-muted">{timeAgo(p.created_at)}</td>
                  <td className="cell-actions">
                    <button className="btn btn-danger btn-sm" onClick={() => removePost(p)}><Icon name="trash" size={13} /> 删除</button>
                  </td>
                </tr>
              ))}
              {data.items.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 28 }}>没有匹配的动态</td></tr>
              )}
            </tbody>
          </TableWrap>
          <Pagination page={page} pageSize={20} total={data.total} onChange={(p) => { setPage(p); load(q, p); }} />
        </>
      )}
    </>
  );
}

/* ================= 举报管理 ================= */

function ReportsSection({ askConfirm, refreshCounts }) {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, openCount: 0 });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (s = status, p = page) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (s) qs.set('status', s);
      qs.set('page', p);
      const d = await api(`/admin/reports?${qs}`);
      setData(d);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => { load('', 1); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const handle = (r, next) => {
    const label = next === 'resolved' ? '标记为已处置' : '驳回该举报';
    askConfirm(label, `举报对象：${r.target_type === 'prompt' ? `提示词「${r.prompt_title || r.target_id}」` : r.target_type === 'post' ? `动态「${(r.post_content || '').slice(0, 40)}」` : `用户 @${r.target_username || r.target_id}`}\n举报理由：${r.reason}`, async () => {
      try {
        await api(`/admin/reports/${r.id}`, { method: 'PUT', body: { status: next } });
        toast(next === 'resolved' ? '已标记处置' : '已驳回');
        load();
        refreshCounts?.();
      } catch (e) {
        toast(e.message, 'error');
      }
    }, next !== 'resolved');
  };

  const targetLink = (r) => {
    if (r.target_type === 'prompt') return <Link to={`/prompt/${r.target_id}`}>{r.prompt_title || `#${r.target_id}`}</Link>;
    if (r.target_type === 'user') return <Link to={`/u/${r.target_username || ''}`}>@{r.target_username || r.target_id}</Link>;
    return <span title={r.post_content}>{(r.post_content || `动态 #${r.target_id}`).slice(0, 26)}</span>;
  };

  return (
    <>
      <div className="admin-toolbar" style={{ gap: 8 }}>
        {[
          { v: '', l: `全部（${data.total}）` },
          { v: 'open', l: `待处理（${data.openCount}）` },
          { v: 'resolved', l: '已处置' },
          { v: 'dismissed', l: '已驳回' }
        ].map((s) => (
          <button
            key={s.v}
            className={`btn btn-sm ${status === s.v ? 'btn-primary' : ''}`}
            onClick={() => { setStatus(s.v); setPage(1); load(s.v, 1); }}
          >
            {s.l}
          </button>
        ))}
      </div>

      {loading ? <span className="spinner" /> : (
        <>
          <TableWrap>
            <thead>
              <tr><th>类型</th><th>对象</th><th>理由</th><th>说明</th><th>举报人</th><th>状态</th><th>时间</th><th className="cell-actions">操作</th></tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id} className={r.status === 'open' ? 'report-open-row' : ''}>
                  <td><span className="badge cat-other">{r.target_type === 'prompt' ? '提示词' : r.target_type === 'post' ? '动态' : '用户'}</span></td>
                  <td className="cell-title" style={{ maxWidth: 200 }}>{targetLink(r)}</td>
                  <td><span className={`badge ${r.reason.includes('NSFW') ? 'cat-video' : 'cat-text'}`}>{r.reason}</span></td>
                  <td className="cell-muted" style={{ maxWidth: 200 }} title={r.detail}>{r.detail || '—'}</td>
                  <td className="cell-muted">@{r.reporter}</td>
                  <td>
                    <span className={`badge ${r.status === 'open' ? 'cat-video' : r.status === 'resolved' ? 'cat-project' : 'cat-other'}`}>
                      {r.status === 'open' ? '待处理' : r.status === 'resolved' ? '已处置' : '已驳回'}
                    </span>
                  </td>
                  <td className="cell-muted">{timeAgo(r.created_at)}</td>
                  <td className="cell-actions">
                    {r.status === 'open' && (
                      <div className="row-actions">
                        <button className="btn btn-sm" onClick={() => handle(r, 'resolved')}>处置完成</button>
                        <button className="btn btn-sm" onClick={() => handle(r, 'dismissed')}>驳回</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {data.items.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 28 }}>暂无举报</td></tr>
              )}
            </tbody>
          </TableWrap>
          <Pagination page={page} pageSize={20} total={data.total} onChange={(p) => { setPage(p); load(status, p); }} />
        </>
      )}
    </>
  );
}

/* ================= 站点设置 ================= */

function SettingsSection({ refreshCounts }) {
  const [settings, setSettings] = useState({ registration_open: true, invite_code: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api('/admin/settings').then(setSettings).catch((e) => toast(e.message, 'error'));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const d = await api('/admin/settings', { method: 'PUT', body: settings });
      setSettings(d);
      toast('设置已保存');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="panel form" style={{ maxWidth: 560 }} onSubmit={save}>
      <div className="field">
        <label className="switch-row" htmlFor="set-reg">
          <input id="set-reg" type="checkbox" checked={settings.registration_open}
            onChange={(e) => setSettings((s) => ({ ...s, registration_open: e.target.checked }))} />
          <span>
            开放注册
            <span className="hint">关闭后，新用户将无法注册账号</span>
          </span>
        </label>
      </div>
      <div className="field">
        <label htmlFor="set-invite">注册邀请码 <span className="hint">填写后注册时必须提供该邀请码；留空则无需邀请码</span></label>
        <input id="set-invite" type="text" value={settings.invite_code}
          onChange={(e) => setSettings((s) => ({ ...s, invite_code: e.target.value }))}
          maxLength={32} placeholder="留空表示注册无需邀请码" autoComplete="off" />
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" disabled={saving}>{saving ? '保存中…' : '保存设置'}</button>
      </div>
      <div className="settings-hint" style={{ marginTop: 6 }}>
        <Icon name="info" size={15} />
        所有管理操作（封禁、删除、设置变更等）都会记录在概览页的操作日志中。
      </div>
    </form>
  );
}

/* ================= 主页面 ================= */

const SECTIONS = [
  { key: 'overview', label: '概览', icon: 'layers' },
  { key: 'users', label: '用户管理', icon: 'users' },
  { key: 'prompts', label: '提示词管理', icon: 'folder' },
  { key: 'posts', label: '动态管理', icon: 'activity' },
  { key: 'reports', label: '举报处理', icon: 'flag' },
  { key: 'settings', label: '站点设置', icon: 'shield' }
];

const SECTION_DESC = {
  overview: '全站数据总览、最新动态与管理操作日志',
  users: '查看用户详情、封禁/解封、角色管理与密码重置',
  prompts: '全站提示词（含私密）的检索、批量可见性、NSFW 标记与删除',
  posts: '全站动态的检索与删除',
  reports: '处理用户举报：查看对象、处置或驳回',
  settings: '注册开放开关与邀请码控制'
};

export default function AdminPage() {
  const [section, setSection] = useState('overview');
  const [stats, setStats] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const refreshCounts = useCallback(() => {
    api('/admin/stats').then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  const askConfirm = (title, message, onOk, danger = true, confirmText = '确认') =>
    setConfirm({ title, message, onOk, danger, confirmText });

  const counts = stats
    ? { users: stats.users, prompts: stats.prompts, posts: stats.posts, reports: stats.openReports }
    : {};

  return (
    <div className="container page">
      <div className="admin-layout">
        <aside className="admin-side">
          <div className="admin-side-title">
            <Icon name="shield" size={17} /> 后台管理
          </div>
          <nav>
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                className={`admin-nav-item ${section === s.key ? 'active' : ''}`}
                onClick={() => setSection(s.key)}
              >
                <Icon name={s.icon} size={16} /> {s.label}
                {counts[s.key] !== undefined && <span className="count">{counts[s.key]}</span>}
              </button>
            ))}
          </nav>
          <div className="admin-side-foot">
            <Link to="/"><Icon name="arrowLeft" size={15} /> 返回前台</Link>
          </div>
        </aside>

        <main className="admin-main">
          <h1>{SECTIONS.find((s) => s.key === section)?.label}</h1>
          <p className="sub">{SECTION_DESC[section]}</p>

          {section === 'overview' && (stats ? <OverviewSection stats={stats} /> : <span className="spinner" />)}
          {section === 'users' && <UsersSection askConfirm={askConfirm} refreshCounts={refreshCounts} />}
          {section === 'prompts' && <PromptsSection askConfirm={askConfirm} refreshCounts={refreshCounts} />}
          {section === 'posts' && <PostsSection askConfirm={askConfirm} refreshCounts={refreshCounts} />}
          {section === 'reports' && <ReportsSection askConfirm={askConfirm} refreshCounts={refreshCounts} />}
          {section === 'settings' && <SettingsSection refreshCounts={refreshCounts} />}
        </main>
      </div>

      <ConfirmModal confirm={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
