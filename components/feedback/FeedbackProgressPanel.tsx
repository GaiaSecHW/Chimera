import { useState, useEffect, useCallback } from 'react';
import { feedbackApi } from '../../clients/feedback';
import type { FeedbackItem } from '../../clients/feedback';
import { FeedbackDetailDialog } from './FeedbackDetailDialog';
import { useUiFeedback } from '../UiFeedback';

interface FeedbackProgressPanelProps {
  open: boolean;
  onClose: () => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim();

export function FeedbackProgressPanel({ open, onClose }: FeedbackProgressPanelProps) {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<FeedbackItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const ui = useUiFeedback();

  const loadData = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const result = await feedbackApi.listMine(p, 10);
      setFeedbacks(result.records);
      setTotal(result.total);
      setPage(p);
    } catch (err) {
      ui.notify(err instanceof Error ? err.message : '加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [ui]);

  useEffect(() => {
    if (open) loadData(1);
  }, [open, loadData]);

  const handleView = async (fb: FeedbackItem) => {
    setSelected(fb);
    setDetailOpen(true);
    // Mark as read if there's an unread reply
    if (fb.replyAt && !fb.replyReadAt) {
      try {
        await feedbackApi.markRead(fb.id);
      } catch { /* silent */ }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这条反馈意见吗？')) return;
    try {
      await feedbackApi.delete(id);
      ui.notify('删除成功', 'success');
      loadData(page);
    } catch (err) {
      ui.notify(err instanceof Error ? err.message : '删除失败', 'error');
    }
  };

  if (!open) return null;
  const totalPages = Math.ceil(total / 10);

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={onClose}>
        <div
          className="w-full max-w-3xl max-h-[80vh] flex flex-col rounded-2xl border border-theme-border bg-theme-surface shadow-panel"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-4 border-b border-theme-border">
            <h3 className="text-lg font-semibold text-theme-text">我的意见进展</h3>
            <button onClick={onClose} className="text-theme-muted hover:text-theme-text">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="text-center py-8 text-theme-muted">加载中...</div>
            ) : feedbacks.length === 0 ? (
              <div className="text-center py-8 text-theme-muted">暂无意见反馈</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-theme-border text-theme-muted">
                    <th className="text-left py-2 px-2">意见内容</th>
                    <th className="text-left py-2 px-2">提交时间</th>
                    <th className="text-left py-2 px-2">答复内容</th>
                    <th className="text-left py-2 px-2">答复时间</th>
                    <th className="text-center py-2 px-2">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {feedbacks.map((fb) => (
                    <tr key={fb.id} className="border-b border-theme-border/50">
                      <td className="py-2 px-2 max-w-[200px] truncate">{stripHtml(fb.content).slice(0, 50) || '—'}</td>
                      <td className="py-2 px-2 whitespace-nowrap">{formatDate(fb.createdAt)}</td>
                      <td className="py-2 px-2 max-w-[200px] truncate">
                        {fb.replyContent ? stripHtml(fb.replyContent).slice(0, 50) : '—'}
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap">{formatDate(fb.replyAt)}</td>
                      <td className="py-2 px-2 text-center whitespace-nowrap">
                        <button onClick={() => handleView(fb)} className="text-theme-primary hover:underline mr-2">查看</button>
                        <button onClick={() => handleDelete(fb.id)} className="text-red-500 hover:underline">删除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-theme-border">
              <span className="text-sm text-theme-muted">共 {total} 条</span>
              <div className="flex gap-2">
                <button
                  onClick={() => loadData(page - 1)}
                  disabled={page <= 1}
                  className="px-3 py-1 rounded border border-theme-border disabled:opacity-50"
                >
                  上一页
                </button>
                <span className="px-3 py-1 text-sm">{page} / {totalPages}</span>
                <button
                  onClick={() => loadData(page + 1)}
                  disabled={page >= totalPages}
                  className="px-3 py-1 rounded border border-theme-border disabled:opacity-50"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <FeedbackDetailDialog feedback={selected} open={detailOpen} onClose={() => setDetailOpen(false)} />
    </>
  );
}
