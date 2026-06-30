import { useState, useEffect } from 'react';
import { RichTextEditor } from './RichTextEditor';
import { RichTextViewer } from './RichTextViewer';
import { feedbackApi } from '../../clients/feedback';
import type { FeedbackItem } from '../../clients/feedback';
import { useUiFeedback } from '../UiFeedback';

interface FeedbackReplyDialogProps {
  feedback: FeedbackItem | null;
  open: boolean;
  onClose: () => void;
  onReplied: () => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}:${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim();

export function FeedbackReplyDialog({ feedback, open, onClose, onReplied }: FeedbackReplyDialogProps) {
  const [replyContent, setReplyContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { notify } = useUiFeedback();

  useEffect(() => {
    if (open && feedback) {
      setReplyContent(feedback.replyContent || '');
    }
  }, [open, feedback]);

  if (!open || !feedback) return null;

  const handleSubmit = async () => {
    if (!stripHtml(replyContent)) {
      notify('请输入答复内容', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      await feedbackApi.reply(feedback.id, replyContent);
      notify('答复已提交', 'success');
      onReplied();
      onClose();
    } catch (err) {
      notify(err instanceof Error ? err.message : '提交失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl border border-theme-border bg-theme-surface shadow-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-theme-border">
          <h3 className="text-lg font-semibold text-theme-text-primary">处理反馈</h3>
          <button onClick={onClose} className="text-theme-text-muted hover:text-theme-text-primary">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Original feedback */}
          <div>
            <div className="text-sm text-theme-text-muted mb-1">
              用户意见 · {formatDate(feedback.createdAt)} · {feedback.createdBy}
            </div>
            <RichTextViewer html={feedback.content} />
          </div>
          {/* Reply editor */}
          <div className="border-t border-theme-border pt-4">
            <div className="text-sm text-green-600 mb-2">管理员答复</div>
            <RichTextEditor
              value={replyContent}
              onChange={setReplyContent}
              placeholder="请输入答复内容..."
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-theme-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-theme-border text-theme-text-primary hover:bg-theme-elevated"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? '提交中...' : '提交答复'}
          </button>
        </div>
      </div>
    </div>
  );
}
