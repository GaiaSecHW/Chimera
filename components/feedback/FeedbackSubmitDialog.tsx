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
  const ui = useUiFeedback();

  useEffect(() => {
    if (open) setContent('');
  }, [open]);

  if (!open) return null;

  const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim();

  const handleSubmit = async () => {
    if (!stripHtml(content)) {
      ui.notify('请输入意见内容', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      await feedbackApi.submit(content);
      ui.notify('提交成功', 'success');
      onClose();
    } catch (err) {
      ui.notify(err instanceof Error ? err.message : '提交失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl border border-theme-border bg-theme-surface shadow-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-theme-border">
          <h3 className="text-lg font-semibold text-theme-text">意见反馈</h3>
          <button onClick={onClose} className="text-theme-muted hover:text-theme-text">✕</button>
        </div>
        <div className="p-4">
          <RichTextEditor value={content} onChange={setContent} placeholder="请输入您的意见..." />
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-theme-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-theme-border text-theme-text hover:bg-theme-muted"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-theme-primary text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? '提交中...' : '提交'}
          </button>
        </div>
      </div>
    </div>
  );
}
