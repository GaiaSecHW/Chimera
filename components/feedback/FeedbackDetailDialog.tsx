import { RichTextViewer } from './RichTextViewer';
import type { FeedbackItem } from '../../clients/feedback';

interface FeedbackDetailDialogProps {
  feedback: FeedbackItem | null;
  open: boolean;
  onClose: () => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function FeedbackDetailDialog({ feedback, open, onClose }: FeedbackDetailDialogProps) {
  if (!open || !feedback) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-3xl max-h-[80vh] overflow-y-auto rounded-2xl border border-theme-border bg-theme-surface shadow-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-theme-border">
          <h3 className="text-lg font-semibold text-theme-text-primary">反馈详情</h3>
          <button onClick={onClose} className="text-theme-text-muted hover:text-theme-text-primary">✕</button>
        </div>
        <div className="p-4 space-y-4">
          {/* User feedback */}
          <div>
            <div className="text-sm text-theme-text-muted mb-1">
              用户意见 · {formatDate(feedback.createdAt)}
            </div>
            <RichTextViewer html={feedback.content} />
          </div>
          {/* Admin reply */}
          {feedback.replyContent && (
            <div className="border-t border-theme-border pt-4">
              <div className="text-sm text-green-600 mb-1">
                管理员答复 · {formatDate(feedback.replyAt)}
              </div>
              <RichTextViewer html={feedback.replyContent} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
