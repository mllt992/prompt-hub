import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api, getToken, CATEGORIES } from '../api.js';
import { toast } from '../components/toast.jsx';
import Icon, { CATEGORY_ICONS } from '../components/Icon.jsx';

export default function PromptEdit() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [form, setForm] = useState({
    title: '',
    category: 'text',
    model: '',
    visibility: 'public',
    nsfw: false,
    description: '',
    content: ''
  });
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [images, setImages] = useState([]);
  const [imgUrl, setImgUrl] = useState('');
  const [links, setLinks] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loaded, setLoaded] = useState(!isEdit);

  useEffect(() => {
    if (!isEdit) return;
    api(`/prompts/${id}`)
      .then((p) => {
        setForm({
          title: p.title, category: p.category, model: p.model || '',
          visibility: p.visibility, nsfw: !!p.nsfw, description: p.description || '', content: p.content
        });
        setTags(p.tags || []);
        setImages(p.images || []);
        setLinks(p.links || []);
        setLoaded(true);
      })
      .catch((e) => setError(e.message));
  }, [id, isEdit]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, '');
    if (t && !tags.includes(t) && tags.length < 8) setTags((ts) => [...ts, t]);
    setTagInput('');
  };

  const uploadFile = async (file) => {
    if (!file) return;
    setUploading(true);
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
      setImages((arr) => [...arr, d.url]);
      toast('图片已上传');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const addImageUrl = () => {
    const u = imgUrl.trim();
    if (!/^https?:\/\/.+/.test(u)) return toast('请输入合法的图片 URL', 'error');
    if (images.length >= 12) return toast('最多 12 张效果图', 'error');
    setImages((arr) => [...arr, u]);
    setImgUrl('');
  };

  const setLink = (i, k, v) =>
    setLinks((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim() || !form.content.trim()) {
      return setError('标题和提示词内容不能为空');
    }
    setBusy(true);
    try {
      const body = { ...form, tags, images, links };
      const saved = isEdit
        ? await api(`/prompts/${id}`, { method: 'PUT', body })
        : await api('/prompts', { method: 'POST', body });
      toast(isEdit ? '已保存' : '发布成功');
      navigate(`/prompt/${saved.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!loaded && error) {
    return (
      <div className="container page">
        <div className="empty">
          <div className="empty-icon"><Icon name="info" size={20} /></div>
          {error}
          <div style={{ marginTop: 12 }}><Link to="/mine" className="btn btn-sm">返回我的提示词</Link></div>
        </div>
      </div>
    );
  }
  if (!loaded) return <span className="spinner" />;

  return (
    <div className="container page" style={{ maxWidth: 860 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link to={isEdit ? `/prompt/${id}` : '/'} className="btn btn-ghost btn-sm" aria-label="返回">
          <Icon name="arrowLeft" size={15} />
        </Link>
        <h1 style={{ fontSize: 21, margin: '4px 0' }}>{isEdit ? '编辑提示词' : '新建提示词'}</h1>
      </div>
      <form className="panel form" style={{ marginTop: 16 }} onSubmit={submit}>
        {error && <div className="form-error">{error}</div>}

        <div className="field">
          <label htmlFor="pe-title">标题 <span className="hint">必填 · 100 字以内</span></label>
          <input id="pe-title" type="text" value={form.title} onChange={set('title')} maxLength={100}
            placeholder="例如：赛博朋克城市夜景 - 电影级质感" required />
        </div>

        <div className="form-row">
          <div className="field">
            <label htmlFor="pe-cat">分类</label>
            <select id="pe-cat" value={form.category} onChange={set('category')}>
              {Object.entries(CATEGORIES).map(([key, c]) => (
                <option key={key} value={key}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="pe-model">适用模型 <span className="hint">选填，如 Midjourney / Claude</span></label>
            <input id="pe-model" type="text" value={form.model} onChange={set('model')} maxLength={60} placeholder="Midjourney v6" />
          </div>
        </div>

        <div className="field">
          <label>可见性</label>
          <div className="radio-group">
            <label className={`radio-card ${form.visibility === 'public' ? 'active' : ''}`}>
              <input type="radio" name="visibility" checked={form.visibility === 'public'}
                onChange={() => setForm((f) => ({ ...f, visibility: 'public' }))} />
              <span>
                <span className="rc-title"><Icon name="globe" size={15} /> 公开</span>
                <span className="rc-sub">所有人可见，出现在探索页</span>
              </span>
            </label>
            <label className={`radio-card ${form.visibility === 'private' ? 'active' : ''}`}>
              <input type="radio" name="visibility" checked={form.visibility === 'private'}
                onChange={() => setForm((f) => ({ ...f, visibility: 'private' }))} />
              <span>
                <span className="rc-title"><Icon name="lock" size={15} /> 私密</span>
                <span className="rc-sub">仅自己可见</span>
              </span>
            </label>
          </div>
        </div>

        <div className="field">
          <label>内容标记</label>
          <label className="switch-row" htmlFor="pe-nsfw">
            <input
              id="pe-nsfw"
              type="checkbox"
              checked={!!form.nsfw}
              onChange={(e) => setForm((f) => ({ ...f, nsfw: e.target.checked }))}
            />
            <span>
              标记为 NSFW 敏感内容
              <span className="hint">开启后效果图将默认模糊显示，读者需手动点击查看</span>
            </span>
          </label>
        </div>

        <div className="field">
          <label htmlFor="pe-content">提示词内容 <span className="hint">必填 · 支持多行，可含变量占位符</span></label>
          <textarea id="pe-content" className="mono" rows={10} value={form.content} onChange={set('content')}
            placeholder={'在这里粘贴或编写提示词正文…\n\n可以用 {{变量}} 标记需要替换的部分'} required />
        </div>

        <div className="field">
          <label htmlFor="pe-desc">简介 <span className="hint">说明用法、效果与技巧</span></label>
          <textarea id="pe-desc" rows={3} maxLength={2000} value={form.description} onChange={set('description')}
            placeholder="这个提示词适用什么场景？效果如何？有什么使用技巧？" />
        </div>

        <div className="field">
          <label htmlFor="pe-tag">标签 <span className="hint">回车添加，最多 8 个</span></label>
          <input id="pe-tag" type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); }
            }} placeholder="输入标签后按回车" />
          {tags.length > 0 && (
            <div className="chips">
              {tags.map((t) => (
                <span key={t} className="chip">
                  #{t}
                  <button type="button" onClick={() => setTags((ts) => ts.filter((x) => x !== t))} aria-label={`删除标签 ${t}`}>
                    <Icon name="x" size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="field">
          <label>效果图 <span className="hint">上传图片或粘贴图片 URL，最多 12 张</span></label>
          <div className="img-list">
            {images.map((src, i) => (
              <div key={i} className="img-item">
                <img src={src} alt={`效果图 ${i + 1}`} />
                <button type="button" className="remove" onClick={() => setImages((arr) => arr.filter((_, x) => x !== i))} aria-label={`删除效果图 ${i + 1}`}>
                  <Icon name="x" size={12} />
                </button>
                <div className="img-src" title={src}>{src.startsWith('/uploads/') ? '本地上传' : src.slice(0, 34)}</div>
              </div>
            ))}
            <button type="button" className="img-add" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Icon name="upload" size={20} />
              {uploading ? '上传中…' : '上传图片'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden
              onChange={(e) => uploadFile(e.target.files?.[0])} />
          </div>
          <div className="link-row" style={{ marginTop: 8 }}>
            <input type="url" value={imgUrl} onChange={(e) => setImgUrl(e.target.value)}
              placeholder="或粘贴图片 URL，如 https://…/demo.png" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addImageUrl())} />
            <button type="button" className="btn" onClick={addImageUrl}>添加</button>
          </div>
        </div>

        <div className="field">
          <label>相关链接 <span className="hint">工具官网、参考文章、在线体验地址等</span></label>
          {links.map((l, i) => (
            <div className="link-row" key={i}>
              <input type="url" value={l.url} onChange={(e) => setLink(i, 'url', e.target.value)} placeholder="https://…" />
              <input type="text" value={l.title} onChange={(e) => setLink(i, 'title', e.target.value)} placeholder="链接标题" />
              <button type="button" className="btn btn-danger" onClick={() => setLinks((ls) => ls.filter((_, x) => x !== i))} aria-label="删除链接">
                <Icon name="trash" size={14} />
              </button>
            </div>
          ))}
          <div>
            <button type="button" className="btn btn-sm" onClick={() => setLinks((ls) => [...ls, { url: '', title: '' }])}>
              <Icon name="plus" size={13} /> 添加链接
            </button>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn" onClick={() => navigate(-1)}>取消</button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? '保存中…' : isEdit ? '保存修改' : '发布提示词'}
          </button>
        </div>
      </form>
    </div>
  );
}
