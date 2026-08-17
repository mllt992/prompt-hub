import { useEffect, useState } from 'react';
import { copyText } from '../api.js';
import { toast } from './toast.jsx';
import Icon from './Icon.jsx';
import { generatePoster } from '../poster.js';

/**
 * 分享弹窗：复制链接 + 生成分享海报（预览图 + 二维码）
 * prompt 为 null 时不渲染（同 ReportModal 的 target 模式）
 */
export default function ShareModal({ prompt, onClose }) {
  const [urlCopied, setUrlCopied] = useState(false);
  const [posterUrl, setPosterUrl] = useState(null);
  const [posterBusy, setPosterBusy] = useState(true);
  const [posterError, setPosterError] = useState(false);
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const shareUrl = prompt ? `${window.location.origin}/prompt/${prompt.id}` : '';

  useEffect(() => {
    if (!prompt) return;
    let alive = true;
    setPosterUrl(null);
    setPosterError(false);
    setPosterBusy(true);
    generatePoster(prompt, shareUrl)
      .then((d) => alive && setPosterUrl(d))
      .catch(() => alive && setPosterError(true))
      .finally(() => alive && setPosterBusy(false));
    return () => {
      alive = false;
    };
  }, [shareUrl, prompt]);

  if (!prompt) return null;

  const copyUrl = async () => {
    const ok = await copyText(shareUrl);
    if (ok) {
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 1600);
    } else {
      toast('复制失败，请手动选择复制', 'error');
    }
  };

  const downloadPoster = () => {
    if (!posterUrl) return;
    const a = document.createElement('a');
    const name = (prompt.title || 'prompt').replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim().slice(0, 30) || 'prompt';
    a.href = posterUrl;
    a.download = `PromptHub-${name}.png`;
    a.click();
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title: prompt.title, text: prompt.description || prompt.title, url: shareUrl });
    } catch {
      /* 用户取消分享 */
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-share" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="分享提示词">
        <h3><Icon name="share" size={18} /> 分享提示词</h3>
        <p className="share-target" title={prompt.title}>{prompt.title}</p>

        <div className="share-url">
          <input type="text" readOnly value={shareUrl} aria-label="分享链接" onFocus={(e) => e.target.select()} />
          <button type="button" className="btn btn-sm" onClick={copyUrl}>
            <Icon name={urlCopied ? 'check' : 'link'} size={14} />
            {urlCopied ? '已复制' : '复制'}
          </button>
        </div>

        <div className="share-poster">
          <div className="share-poster-head">
            <span><Icon name="image" size={14} /> 分享海报</span>
            <span className="hint">含预览图与二维码</span>
          </div>
          {posterBusy && (
            <div className="share-poster-loading"><span className="spinner" /> 海报生成中…</div>
          )}
          {posterError && !posterBusy && (
            <div className="share-poster-loading">
              海报生成失败
              <button type="button" className="btn btn-sm" style={{ marginLeft: 10 }} onClick={onClose}>
                关闭
              </button>
            </div>
          )}
          {posterUrl && !posterBusy && (
            <img className="share-poster-img" src={posterUrl} alt="分享海报预览" />
          )}
        </div>

        <div className="modal-actions">
          {canNativeShare && (
            <button type="button" className="btn" onClick={nativeShare}>
              <Icon name="send" size={14} /> 系统分享
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={downloadPoster} disabled={!posterUrl}>
            <Icon name="download" size={14} /> 下载海报
          </button>
        </div>
      </div>
    </div>
  );
}
