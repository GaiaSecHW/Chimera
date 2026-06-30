import { useState, useEffect, useCallback } from 'react';
import { feedbackApi } from '../../clients/feedback';
import type { FeedbackItem } from '../../clients/feedback';
import { FeedbackReplyDialog } from '../../components/feedback/FeedbackReplyDialog';
import { useUiFeedback } from '../../components/UiFeedback';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim();

export function FeedbackMgmtPage() {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [replyTarget, setReplyTarget] = useState<FeedbackItem | null>(null);
  const [replyOpen, setReplyOpen] = useState(false);
  const ui = useUiFeedback();

  const loadData = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const result = await feedbackApi.listAll(p, 10);
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
    loadData(1);
  }, [loadData]);

  const handleReply = (fb: FeedbackItem) => {
    setReplyTarget(fb);
    setReplyOpen(true);
  };

  const totalPages = Math.ceil(total / 10);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-theme-text mb-4">意见管理</h1>
      <div className="bg-theme-surface border border-theme-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-theme-border text-theme-muted bg-theme-muted/50">
              <th className="text-left py-3 px-4">意见内容</th>
              <th className="text-left py-3 px-4">提交时间</th>
              <th className="text-left py-3 px-4">答复内容</th>
              <th className="text-left py-3 px-4">答复时间</th>
              <th className="text-left py-3 px-4 w-28">提交人</th>
              <th className="text-center py-3 px-4 w-20">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-theme-muted">加载中...</td></tr>
            ) : feedbacks.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-theme-muted">暂无意见反馈</td></tr>
            ) : (
              feedbacks.map((fb) => (
                <tr key={fb.id} className="border-b border-theme-border/50 hover:bg-theme-muted/30">
                  <td className="py-3 px-4 max-w-[200px] truncate">{stripHtml(fb.content).slice(0, 50) || '—'}</td>
                  <td className="py-3 px-4 whitespace-nowrap">{formatDate(fb.createdAt)}</td>
                  <td className="py-3 px-4 max-w-[200px] truncate">
                    {fb.replyContent ? stripHtml(fb.replyContent).slice(0, 50) : '—'}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">{formatDate(fb.replyAt)}</td>
                  <td className="py-3 px-4">{fb.createdBy}</td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => handleReply(fb)}
                      className="px-3 py-1 rounded text-theme-primary border border-theme-primary/30 hover:bg-theme-primary/10"
                    >
                      处理
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
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
      <FeedbackReplyDialog
        feedback={replyTarget}
        open={replyOpen}
        onClose={() => setReplyOpen(false)}
        onReplied={() => loadData(page)}
      />
    </div>
  );
}
