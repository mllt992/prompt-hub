import { useState } from 'react';
import { Link } from 'react-router-dom';
import { avatarUrl, timeAgo, api, displayName } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { toast } from './toast.jsx';
import Icon, { CATEGORY_ICONS } from './Icon.jsx';
import ReportModal from './ReportModal.jsx';

export default function PostCard({ post, onDelete, onLike }) {
  const { user } = useAuth();
  const isOwn = user && user.id === post.user_id;
  const [reportTarget, setReportTarget] = useState(null);

  const like = async () => {
    if (!user) return toast('请先登录后再点赞', 'error');
    try {
      const d = await api(`/posts/${post.id}/like`, { method: 'POST' });
      onLike?.(post.id, d.active, d.count);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const remove = async () => {
    if (!window.confirm('确定删除这条动态吗？')) return;
    try {
      await api(`/posts/${post.id}`, { method: 'DELETE' });
      onDelete?.(post.id);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <article className="post-card">
      <img className="p-avatar" src={avatarUrl(post)} alt={post.username} />
      <div className="post-main">
        <header className="post-head">
          <Link to={`/u/${post.username}`} className="p-author">{displayName(post)}</Link>
          <span className="p-time">@{post.username} · {timeAgo(post.created_at)}</span>
          {!isOwn && (
            <button
              className="p-del"
              onClick={() => setReportTarget({ type: 'post', id: post.id, label: post.content.slice(0, 40) })}
              aria-label="举报动态"
              title="举报"
            >
              <Icon name="flag" size={14} />
            </button>
          )}
          {isOwn && (
            <button className="p-del" onClick={remove} aria-label="删除动态" title="删除动态">
              <Icon name="trash" size={14} />
            </button>
          )}
        </header>
        <p className="post-content">{post.content}</p>
        {post.prompt && (
          <Link to={`/prompt/${post.prompt.id}`} className="post-prompt" title={post.prompt.title}>
            {post.prompt.cover ? (
              <span className="pp-thumb-wrap">
                <img
                  className="pp-cover"
                  src={post.prompt.cover}
                  alt=""
                  loading="lazy"
                  style={post.prompt.nsfw ? { filter: 'blur(10px)', transform: 'scale(1.1)' } : undefined}
                />
                {post.prompt.nsfw && (
                  <span className="nsfw-overlay" aria-hidden="true">
                    <span className="badge badge-nsfw" style={{ padding: '1px 7px', fontSize: 10.5 }}>
                      <Icon name="eye" size={10} /> NSFW
                    </span>
                  </span>
                )}
              </span>
            ) : (
              <span className="pp-icon"><Icon name={CATEGORY_ICONS[post.prompt.category] || 'package'} size={18} /></span>
            )}
            <span className="pp-info">
              <span className="pp-title">{post.prompt.title}</span>
              <span className="pp-meta">
                <span className={`badge cat-${post.prompt.category}`}>
                  <Icon name={CATEGORY_ICONS[post.prompt.category] || 'package'} size={11} />
                  关联提示词
                </span>
                {post.prompt.visibility === 'private' && (
                  <span className="badge badge-private"><Icon name="lock" size={10} /> 私密</span>
                )}
                {post.prompt.nsfw && (
                  <span className="badge badge-nsfw"><Icon name="eye" size={10} /> NSFW</span>
                )}
              </span>
            </span>
          </Link>
        )}
        <div className="post-actions">
          <button className={post.liked ? 'liked' : ''} onClick={like} title={post.liked ? '取消点赞' : '点赞'}>
            <Icon name={post.liked ? 'heartFilled' : 'heart'} size={15} />
            {post.like_count > 0 ? post.like_count : '点赞'}
          </button>
        </div>
      </div>

      <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} />
    </article>
  );
}
