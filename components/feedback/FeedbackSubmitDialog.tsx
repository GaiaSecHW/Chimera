import { useState, useEffect } from 'react';
import { RichTextEditor } from './RichTextEditor';
import { feedbackApi } from '../../clients/feedback';
import { useUiFeedback } from '../UiFeedback';

interface FeedbackSubmitDialogProps {
  open: boolean;
  onClose: () => void;
}

export function FeedbackSubmitDialog({ open, onClose }: FeedbackSubmitDialogProps) {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { notify } = useUiFeedback();

  useEffect(() => {
    if (open) setContent('');
  }, [open]);

  if (!open) return null;

  const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim();

  const handleSubmit = async () => {
    if (!stripHtml(content)) {
      notify('请输入意见内容', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      await feedbackApi.submit(content);
      notify('提交成功', 'success');
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
          <h3 className="text-lg font-semibold text-theme-text-primary">意见反馈</h3>
          <button onClick={onClose} className="text-theme-text-muted hover:text-theme-text-primary">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <RichTextEditor value={content} onChange={setContent} placeholder="请输入您的意见..." />
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
            {submitting ? '提交中...' : '提交'}
          </button>
        </div>
      </div>
    </div>
  );
}
