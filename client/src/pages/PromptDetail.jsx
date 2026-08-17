import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, catLabel, avatarUrl, timeAgo, copyText, displayName } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { toast } from '../components/toast.jsx';
import Icon, { CATEGORY_ICONS } from '../components/Icon.jsx';
import ReportModal from '../components/ReportModal.jsx';
import ShareModal from '../components/ShareModal.jsx';

export default function PromptDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState(null);
  const [error, setError] = useState('');
  const [lightbox, setLightbox] = useState(null);
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState({});
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);
  const [showShare, setShowShare] = useState(false);
  const [versions, setVersions] = useState(null); // null = 未加载；数组 = 已展开

  useEffect(() => {
    window.scrollTo(0, 0);
    setPrompt(null);
    setComments([]);
    setVersions(null);
    api(`/prompts/${id}`)
      .then(setPrompt)
      .catch((e) => setError(e.message));
  }, [id]);

  // ---------- 评论 ----------
  const loadComments = (pid) => {
    api(`/prompts/${pid}/comments`)
      .then((d) => setComments(d.items || []))
      .catch(() => {});
  };

  useEffect(() => {
    if (prompt) loadComments(prompt.id);
  }, [prompt?.id]);

  if (error) {
    return (
      <div className="container page">
        <div className="empty">
          <div className="empty-icon"><Icon name="info" size={20} /></div>
          {error}
          <div style={{ marginTop: 12 }}><Link to="/" className="btn btn-sm">返回首页</Link></div>
        </div>
      </div>
    );
  }
  if (!prompt) return <span className="spinner" />;

  const isOwner = user && user.id === prompt.user_id;

  const doCopy = async () => {
    const ok = await copyText(prompt.content);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } else {
      toast('复制失败，请手动选择复制', 'error');
    }
  };

  const toggleLike = async () => {
    if (!user) return toast('请先登录后再点赞', 'error');
    try {
      const d = await api(`/prompts/${prompt.id}/like`, { method: 'POST' });
      setPrompt((p) => ({ ...p, liked: d.active, like_count: d.count }));
    } catch (e) { toast(e.message, 'error'); }
  };

  const toggleBookmark = async () => {
    if (!user) return toast('请先登录后再收藏', 'error');
    try {
      const d = await api(`/prompts/${prompt.id}/bookmark`, { method: 'POST' });
      setPrompt((p) => ({ ...p, bookmarked: d.active, bookmark_count: d.count }));
      toast(d.active ? '已加入收藏' : '已取消收藏');
    } catch (e) { toast(e.message, 'error'); }
  };

  const doDelete = async () => {
    if (!window.confirm(`确定删除「${prompt.title}」吗？此操作不可恢复。`)) return;
    try {
      await api(`/prompts/${prompt.id}`, { method: 'DELETE' });
      toast('已删除');
      navigate(isOwner ? '/mine' : '/');
    } catch (e) { toast(e.message, 'error'); }
  };

  // ---------- 评论 ----------
  const submitComment = async (e) => {
    e.preventDefault();
    const text = commentText.trim();
    if (!text) return;
    if (!user) return toast('请先登录后再评论', 'error');
    setCommentBusy(true);
    try {
      const c = await api(`/prompts/${prompt.id}/comments`, { method: 'POST', body: { content: text } });
      setComments((arr) => [c, ...arr]);
      setCommentText('');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setCommentBusy(false);
    }
  };

  const deleteComment = async (c) => {
    if (!window.confirm('确定删除这条评论吗？')) return;
    try {
      await api(`/prompts/comments/${c.id}`, { method: 'DELETE' });
      setComments((arr) => arr.filter((x) => x.id !== c.id));
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  // ---------- 版本历史 ----------
  const toggleVersions = async () => {
    if (versions) return setVersions(null);
    try {
      const d = await api(`/prompts/${prompt.id}/versions`);
      setVersions(d.versions || []);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const restoreVersion = async (v) => {
    if (!window.confirm(`确定恢复到版本 v${v.version}（${v.title}）吗？当前内容会保存为一个新版本，不会丢失。`)) return;
    try {
      const updated = await api(`/prompts/${prompt.id}/restore/${v.id}`, { method: 'POST' });
      setPrompt(updated);
      setVersions(null);
      toast(`已恢复到 v${v.version}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <div className="container page">
      <div className="detail-wrap">
        <div className="detail-main">
          <div className="panel detail-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className={`badge cat-${prompt.category}`}>
                <Icon name={CATEGORY_ICONS[prompt.category] || 'package'} size={12} />
                {catLabel(prompt.category)}
              </span>
              {prompt.nsfw && (
                <span className="badge badge-nsfw"><Icon name="eye" size={11} /> NSFW 敏感内容</span>
              )}
              {prompt.visibility === 'private' && (
                <span className="badge badge-private"><Icon name="lock" size={11} /> 私密 · 仅自己可见</span>
              )}
              {prompt.model && <span className="badge badge-model">{prompt.model}</span>}
            </div>
            <h1>{prompt.title}</h1>
            <div className="detail-meta">
              <Link to={`/u/${prompt.username}`} className="author">
                <img src={avatarUrl(prompt)} alt="" />
                <b>{displayName(prompt)}</b>
              </Link>
              <span>@{prompt.username}</span>
              <span>发布于 {timeAgo(prompt.created_at)}</span>
              {prompt.updated_at !== prompt.created_at && <span>更新于 {timeAgo(prompt.updated_at)}</span>}
              <div className="detail-actions">
                <button className="btn btn-primary btn-sm" onClick={doCopy}>
                  <Icon name={copied ? 'check' : 'copy'} size={14} />
                  {copied ? '已复制' : '复制提示词'}
                </button>
                <button className={`btn btn-sm ${prompt.liked ? 'btn-liked' : ''}`} onClick={toggleLike}>
                  <Icon name={prompt.liked ? 'heartFilled' : 'heart'} size={14} /> {prompt.like_count}
                </button>
                <button className={`btn btn-sm ${prompt.bookmarked ? 'btn-marked' : ''}`} onClick={toggleBookmark}>
                  <Icon name={prompt.bookmarked ? 'bookmarkFilled' : 'bookmark'} size={14} /> {prompt.bookmark_count}
                </button>
                {prompt.visibility === 'public' && (
                  <button className="btn btn-sm" title="分享" onClick={() => setShowShare(true)}>
                    <Icon name="share" size={14} /> 分享
                  </button>
                )}
                {!isOwner && (
                  <button
                    className="btn btn-sm"
                    title="举报"
                    onClick={() => setReportTarget({ type: 'prompt', id: prompt.id, label: prompt.title })}
                  >
                    <Icon name="flag" size={14} />
                  </button>
                )}
                {isOwner && (
                  <>
                    <Link to={`/edit/${prompt.id}`} className="btn btn-sm"><Icon name="pencil" size={14} /> 编辑</Link>
                    <button className="btn btn-danger btn-sm" onClick={doDelete}><Icon name="trash" size={14} /> 删除</button>
                  </>
                )}
              </div>
            </div>
          </div>

          {prompt.description && (
            <div className="panel">
              <h3 className="section-title"><Icon name="fileText" size={16} /> 简介</h3>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--text-2)' }}>{prompt.description}</p>
            </div>
          )}

          <div className="panel">
            <h3 className="section-title"><Icon name="terminal" size={16} /> 提示词内容</h3>
            <div className="prompt-block">
              <button className="btn btn-sm copy-btn" onClick={doCopy}>
                <Icon name={copied ? 'check' : 'copy'} size={13} /> {copied ? '已复制' : '复制'}
              </button>
              <pre>{prompt.content}</pre>
            </div>
          </div>

          {prompt.images?.length > 0 && (
            <div className="panel">
              <h3 className="section-title">
                <Icon name="image" size={16} /> 效果图（{prompt.images.length}）
                {prompt.nsfw && (
                  <span className="badge badge-nsfw" style={{ marginLeft: 4 }}>
                    <Icon name="eye" size={11} /> 已模糊 · 点击图片显示
                  </span>
                )}
              </h3>
              <div className="gallery">
                {prompt.images.map((src, i) => {
                  const hidden = prompt.nsfw && !revealed[i];
                  return (
                    <div className="gallery-item" key={i}>
                      <img
                        src={src}
                        alt={`效果图 ${i + 1}`}
                        loading="lazy"
                        title={hidden ? '点击显示敏感内容' : `效果图 ${i + 1}`}
                        className={hidden ? 'nsfw-hidden' : ''}
                        onClick={() => {
                          if (hidden) setRevealed((m) => ({ ...m, [i]: true }));
                          else setLightbox(src);
                        }}
                      />
                      {hidden && (
                        <span
                          className="nsfw-overlay"
                          role="button"
                          tabIndex={0}
                          aria-label="显示敏感内容"
                          onClick={() => setRevealed((m) => ({ ...m, [i]: true }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') setRevealed((m) => ({ ...m, [i]: true }));
                          }}
                        >
                          <span className="badge badge-nsfw"><Icon name="eye" size={12} /> 敏感内容 · 点击显示</span>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {prompt.links?.length > 0 && (
            <div className="panel">
              <h3 className="section-title"><Icon name="link" size={16} /> 相关链接</h3>
              <div className="link-list">
                {prompt.links.map((l, i) => (
                  <a key={i} className="link-item" href={l.url} target="_blank" rel="noreferrer" title={l.url}>
                    <span className="link-icon"><Icon name="link" size={14} /></span>
                    <span className="link-info">
                      <span className="link-title">{l.title || l.url}</span>
                      <span className="link-url">{l.url}</span>
                    </span>
                    <Icon name="externalLink" size={14} className="link-ext" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* 评论区 */}
          <div className="panel">
            <h3 className="section-title">
              <Icon name="messageSquare" size={16} /> 评论（{comments.length}）
            </h3>
            {user ? (
              <form className="comment-form" onSubmit={submitComment}>
                <img className="c-avatar" src={avatarUrl(user)} alt="" />
                <div className="c-main">
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value.slice(0, 1000))}
                    placeholder="说说这个提示词的效果、适用模型或使用技巧…"
                    aria-label="评论内容"
                    rows={2}
                  />
                  <div className="c-toolbar">
                    <span className={`c-count ${commentText.length >= 980 ? 'over' : ''}`}>{commentText.length}/1000</span>
                    <button className="btn btn-primary btn-sm" disabled={commentBusy || !commentText.trim()}>
                      <Icon name="send" size={13} /> {commentBusy ? '发布中…' : '评论'}
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: 13.5 }}>
                <Link to="/login">登录</Link> 后参与评论
              </p>
            )}
            {comments.length > 0 ? (
              <div className="comment-list">
                {comments.map((c) => {
                  const canDelete = user && (user.id === c.user.id || user.role === 'admin' || isOwner);
                  return (
                    <div className="comment-item" key={c.id}>
                      <Link to={`/u/${c.user.username}`}>
                        <img className="comment-avatar" src={avatarUrl(c.user)} alt="" />
                      </Link>
                      <div className="comment-body">
                        <div className="comment-head">
                          <Link to={`/u/${c.user.username}`} className="comment-author">
                            {displayName({ username: c.user.username, display_name: c.user.display_name })}
                          </Link>
                          <span className="comment-time">{timeAgo(c.created_at)}</span>
                          {canDelete && (
                            <button className="p-del" onClick={() => deleteComment(c)} aria-label="删除评论" title="删除评论">
                              <Icon name="trash" size={13} />
                            </button>
                          )}
                        </div>
                        <p className="comment-content">{c.content}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>还没有评论，来抢沙发～</p>
            )}
          </div>

          {/* 版本历史（仅作者可见） */}
          {isOwner && (
            <div className="panel">
              <h3 className="section-title" style={{ cursor: 'pointer' }} onClick={toggleVersions}>
                <Icon name="history" size={16} /> 版本历史
                <span className="hint" style={{ marginLeft: 6 }}>
                  {versions ? '收起' : '展开（每次编辑自动存档，可随时恢复）'}
                </span>
              </h3>
              {versions && (
                <div className="version-list">
                  {versions.map((v) => (
                    <div className="version-item" key={v.id}>
                      <span className="v-badge">v{v.version}</span>
                      <span className="v-title" title={v.title}>{v.title}</span>
                      <span className="v-time">{timeAgo(v.created_at)}</span>
                      <button className="btn btn-sm" onClick={() => restoreVersion(v)}>
                        <Icon name="history" size={13} /> 恢复
                      </button>
                    </div>
                  ))}
                  {versions.length === 0 && <p style={{ margin: 0, color: 'var(--muted)' }}>暂无历史版本</p>}
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="detail-side">
          <div className="panel side-card">
            <div className="author-card">
              <img src={avatarUrl(prompt)} alt={prompt.username} />
              <div>
                <Link to={`/u/${prompt.username}`} className="name">{displayName(prompt)}</Link>
                <div className="bio">@{prompt.username}</div>
              </div>
            </div>
            <div className="stat-row">
              <div className="stat-item"><div className="num">{prompt.views}</div><div className="lbl">浏览</div></div>
              <div className="stat-item"><div className="num">{prompt.like_count}</div><div className="lbl">点赞</div></div>
              <div className="stat-item"><div className="num">{prompt.bookmark_count}</div><div className="lbl">收藏</div></div>
            </div>
          </div>

          {prompt.tags?.length > 0 && (
            <div className="panel side-card">
              <h3 className="section-title" style={{ margin: 0 }}><Icon name="tag" size={16} /> 标签</h3>
              <div className="p-tags">
                {prompt.tags.map((t) => (
                  <Link key={t} to={`/?tag=${encodeURIComponent(t)}`} className="tag">#{t}</Link>
                ))}
              </div>
            </div>
          )}

          <div className="panel side-card">
            <h3 className="section-title" style={{ margin: 0 }}><Icon name="info" size={16} /> 信息</h3>
            <div className="meta-list">
              <div className="row"><span className="k">分类</span><span className="v">{catLabel(prompt.category)}</span></div>
              {prompt.model && <div className="row"><span className="k">适用模型</span><span className="v">{prompt.model}</span></div>}
              <div className="row"><span className="k">可见性</span><span className="v">{prompt.visibility === 'public' ? '公开' : '私密'}</span></div>
              <div className="row"><span className="k">敏感内容</span><span className="v" style={{ color: prompt.nsfw ? 'var(--danger)' : undefined }}>{prompt.nsfw ? 'NSFW' : '非 NSFW'}</span></div>
              <div className="row"><span className="k">创建时间</span><span className="v">{prompt.created_at?.slice(0, 16).replace('T', ' ')}</span></div>
            </div>
          </div>
        </aside>
      </div>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="效果图预览" />
        </div>
      )}

      <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} />
      <ShareModal prompt={showShare ? prompt : null} onClose={() => setShowShare(false)} />
    </div>
  );
}
