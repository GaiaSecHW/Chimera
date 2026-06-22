import React, { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { redlineVerificationApi } from '../../../clients/redlineVerification';

interface Props {
  taskId: string;
  visible: boolean;
  onClose: () => void;
}

export const ShareDialog: React.FC<Props> = ({ taskId, visible, onClose }) => {
  const [username, setUsername] = useState('');
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');

  if (!visible) return null;

  const handleShare = async () => {
    if (!username.trim()) return;
    setSharing(true);
    setError('');
    try {
      const res = await redlineVerificationApi.shareTask(taskId, username.trim());
      if (res.code === 200) {
        onClose();
        setUsername('');
      } else {
        setError(res.message || '分享失败');
      }
    } catch (e: any) {
      setError(e.message || '分享失败');
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50" onClick={onClose}>
 <div className="bg-theme-surface rounded-2xl p-6 w-96 border border-theme-border" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-theme-text-primary">分享任务</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-theme-surface-hover">
            <X className="w-4 h-4 text-theme-text-tertiary" />
          </button>
        </div>
        <div className="mb-4">
          <label className="block text-sm text-theme-text-secondary mb-1">用户名</label>
          <input
            value={username}
            onChange={e => { setUsername(e.target.value); setError(''); }}
            placeholder="请输入要分享的用户名"
            className="form-input w-full"
            onKeyDown={e => { if (e.key === 'Enter') handleShare(); }}
          />
          {error && <p className="text-xs text-rose-500 mt-1">{error}</p>}
        </div>
        <button
          onClick={handleShare}
          disabled={!username.trim() || sharing}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {sharing && <Loader2 className="w-4 h-4 animate-spin" />}
          {sharing ? '分享中...' : '确认分享'}
        </button>
      </div>
    </div>
  );
};
