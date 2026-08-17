import { useState } from 'react';
import { Link } from 'react-router-dom';
import { avatarUrl, catLabel, displayName } from '../api.js';
import Icon, { CATEGORY_ICONS } from './Icon.jsx';

export default function PromptCard({ prompt, children }) {
  const [revealed, setRevealed] = useState(false);
  const blurred = prompt.nsfw && prompt.cover && !revealed;

  return (
    <article className="p-card">
      <Link to={`/prompt/${prompt.id}`} className="p-cover">
        {prompt.cover ? (
          <img src={prompt.cover} alt={prompt.title} loading="lazy" className={blurred ? 'nsfw-hidden' : ''} />
        ) : (
          <div className="cover-placeholder">
            <Icon name={CATEGORY_ICONS[prompt.category] || 'package'} size={34} strokeWidth={1.5} />
          </div>
        )}
        <span className={`badge cat-${prompt.category} corner-badge`}>
          <Icon name={CATEGORY_ICONS[prompt.category] || 'package'} size={12} />
          {catLabel(prompt.category)}
        </span>
        {prompt.visibility === 'private' && (
          <span className="badge badge-private corner-private">
            <Icon name="lock" size={11} /> 私密
          </span>
        )}
        {blurred && (
          <span
            className="nsfw-overlay"
            role="button"
            tabIndex={0}
            aria-label="显示敏感内容"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setRevealed(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                setRevealed(true);
              }
            }}
          >
            <span className="badge badge-nsfw"><Icon name="eye" size={12} /> NSFW · 点击显示</span>
          </span>
        )}
      </Link>
      <div className="p-body">
        <Link to={`/prompt/${prompt.id}`} className="p-title" title={prompt.title}>{prompt.title}</Link>
        <p className="p-desc">{prompt.description || '（暂无简介）'}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {prompt.nsfw && <span className="badge badge-nsfw"><Icon name="eye" size={11} /> NSFW</span>}
          {prompt.tags?.length > 0 && (
            <div className="p-tags" style={{ margin: 0 }}>
              {prompt.tags.slice(0, 4).map((t) => (
                <Link key={t} to={`/?tag=${encodeURIComponent(t)}`} className="tag">#{t}</Link>
              ))}
            </div>
          )}
        </div>
        <div className="p-foot">
          <Link to={`/u/${prompt.username}`} className="author" title={`@${prompt.username}`}>
            <img src={avatarUrl(prompt)} alt="" />
            <span className="name">{displayName(prompt)}</span>
          </Link>
          <div className="stats">
            <span title={`${prompt.views ?? 0} 次浏览`}><Icon name="eye" size={14} /> {prompt.views ?? 0}</span>
            <span title={`${prompt.like_count ?? 0} 个点赞`}><Icon name="heart" size={14} /> {prompt.like_count ?? 0}</span>
          </div>
        </div>
        {children}
      </div>
    </article>
  );
}
