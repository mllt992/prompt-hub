import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { toast } from './toast.jsx';
import Icon from './Icon.jsx';

const REASONS = ['违规内容', '垃圾信息 / 广告', 'NSFW 未标记', '侵权 / 抄袭', '其他'];

/**
 * 举报弹窗：target 形如 { type: 'prompt' | 'post' | 'user', id, label }
 */
export default function ReportModal({ target, onClose }) {
  const { user } = useAuth();
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);

  if (!target) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!user) {
      onClose();
      return toast('请先登录后再举报', 'error');
    }
    if (!reason) return toast('请选择举报理由', 'error');
    setBusy(true);
    try {
      await api('/reports', {
        method: 'POST',
        body: { target_type: target.type, target_id: target.id, reason, detail }
      });
      toast('举报已提交，管理员会尽快处理');
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit} role="dialog" aria-modal="true">
        <h3>
          <Icon name="flag" size={18} /> 举报{target.type === 'prompt' ? '提示词' : target.type === 'post' ? '动态' : '用户'}
        </h3>
        <p className="report-target" title={target.label}>对象：{target.label}</p>
        <div className="report-reasons">
          {REASONS.map((r) => (
            <label key={r} className={`report-reason ${reason === r ? 'active' : ''}`}>
              <input
                type="radio"
                name="report-reason"
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
              />
              {r}
            </label>
          ))}
        </div>
        <textarea
          className="report-detail"
          rows={2}
          maxLength={500}
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="补充说明（选填）"
          aria-label="举报补充说明"
        />
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>取消</button>
          <button className="btn btn-danger" disabled={busy}>
            {busy ? '提交中…' : '提交举报'}
          </button>
        </div>
      </form>
    </div>
  );
}
