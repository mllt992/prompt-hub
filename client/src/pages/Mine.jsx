import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api, getToken } from '../api.js';
import PromptCard from '../components/PromptCard.jsx';
import { toast } from '../components/toast.jsx';
import Icon from '../components/Icon.jsx';

export default function Mine() {
  const [tab, setTab] = useState('all');
  const [items, setItems] = useState([]);
  const [unavailable, setUnavailable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const importRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'all') {
        const d = await api('/prompts/mine');
        setItems(d.items || []);
        setUnavailable([]);
      } else {
        const d = await api('/prompts/bookmarks');
        setItems(d.items || []);
        setUnavailable(d.unavailable || []);
      }
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleVisibility = async (p) => {
    try {
      const d = await api(`/prompts/${p.id}/visibility`, { method: 'PATCH' });
      setItems((arr) => arr.map((x) => (x.id === p.id ? { ...x, visibility: d.visibility } : x)));
      toast(d.visibility === 'public' ? '已设为公开' : '已设为私密，仅自己可见');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const doDelete = async (p) => {
    if (!window.confirm(`确定删除「${p.title}」吗？此操作不可恢复。`)) return;
    try {
      await api(`/prompts/${p.id}`, { method: 'DELETE' });
      setItems((arr) => arr.filter((x) => x.id !== p.id));
      toast('已删除');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const publicCount = items.filter((p) => p.visibility === 'public').length;

  // 导出：带鉴权拉取 JSON 并触发下载
  const doExport = async () => {
    try {
      const res = await fetch('/api/prompts/export', {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (!res.ok) throw new Error('导出失败');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `prompthub-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast('已导出全部提示词');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const onImportFile = async (file) => {
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const list = Array.isArray(data) ? data : data.prompts;
      if (!Array.isArray(list)) throw new Error('文件格式不正确，请使用本站导出的 JSON');
      const d = await api('/prompts/import', { method: 'POST', body: { prompts: list } });
      toast(`导入完成：成功 ${d.created} 条${d.skipped ? `，跳过 ${d.skipped} 条（格式不符）` : ''}`);
      if (d.created > 0) {
        if (tab === 'all') load();
        else setTab('all'); // 切回全部标签，useEffect 会自动重载
      }
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = '';
    }
  };

  const cancelBookmark = async (b) => {
    if (!window.confirm('移除这条失效收藏吗？')) return;
    try {
      await api(`/prompts/${b.id}/bookmark`, { method: 'POST' });
      setUnavailable((arr) => arr.filter((x) => x.id !== b.id));
      toast('已移除');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <div className="container page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 21, margin: '4px 0' }}>我的提示词</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {tab === 'all' && (
            <>
              <button className="btn btn-sm" onClick={doExport} title="导出全部提示词为 JSON 备份">
                <Icon name="download" size={14} /> 导出
              </button>
              <button className="btn btn-sm" onClick={() => importRef.current?.click()} disabled={importing} title="从本站导出的 JSON 批量导入">
                <Icon name="upload" size={14} /> {importing ? '导入中…' : '导入'}
              </button>
              <input
                ref={importRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => onImportFile(e.target.files?.[0])}
              />
            </>
          )}
          <Link to="/create" className="btn btn-primary btn-sm">
            <Icon name="plus" size={14} /> 新建提示词
          </Link>
        </div>
      </div>

      <div className="tabs" style={{ marginTop: 16 }}>
        <button className={`tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
          <Icon name="folder" size={15} /> 全部
        </button>
        <button className={`tab ${tab === 'bookmarks' ? 'active' : ''}`} onClick={() => setTab('bookmarks')}>
          <Icon name="bookmark" size={15} /> 收藏
        </button>
      </div>

      {loading ? (
        <span className="spinner" />
      ) : items.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"><Icon name="inbox" size={20} /></div>
          {tab === 'all'
            ? '还没有提示词，去创建第一条吧'
            : '还没有收藏，去探索页发现好用的提示词'}
          <div style={{ marginTop: 12 }}>
            <Link to={tab === 'all' ? '/create' : '/'} className="btn btn-primary btn-sm">
              {tab === 'all' ? '新建提示词' : '去探索'}
            </Link>
          </div>
        </div>
      ) : (
        <>
          {tab === 'all' && (
            <div className="result-meta">共 {items.length} 条 · 公开 {publicCount} 条 · 私密 {items.length - publicCount} 条</div>
          )}
          <div className="prompt-grid">
            {items.map((p) => (
              <PromptCard key={p.id} prompt={p}>
                {tab === 'all' ? (
                  <div className="manage-actions">
                    <button className="btn btn-sm" onClick={() => toggleVisibility(p)}>
                      <Icon name={p.visibility === 'public' ? 'lock' : 'globe'} size={13} />
                      {p.visibility === 'public' ? '设为私密' : '设为公开'}
                    </button>
                    <Link to={`/edit/${p.id}`} className="btn btn-sm"><Icon name="pencil" size={13} /> 编辑</Link>
                    <button className="btn btn-danger btn-sm" onClick={() => doDelete(p)}><Icon name="trash" size={13} /> 删除</button>
                  </div>
                ) : (
                  <div className="manage-actions">
                    <span style={{ fontSize: 12.5, color: 'var(--muted)', alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <Icon name="user" size={13} /> {p.username}
                    </span>
                  </div>
                )}
              </PromptCard>
            ))}
          </div>
          {tab === 'bookmarks' && unavailable.length > 0 && (
            <div className="unavailable-bookmarks">
              {unavailable.map((b) => (
                <div className="unavailable-item" key={b.id}>
                  <Icon name="lock" size={14} />
                  <span className="u-title">{b.title || '内容已失效'}</span>
                  <span className="u-note">作者已设为私密或内容已不可见</span>
                  <button className="btn btn-sm" onClick={() => cancelBookmark(b)}>移除收藏</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
