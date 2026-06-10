import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { ArrowLeft, Loader2, X } from 'lucide-react';
import { redlineVerificationApi } from '../../../clients/redlineVerification';
import type { RedlineReportHistory } from '../../../clients/redlineVerification';

interface Props {
  taskId: string;
  visible: boolean;
  onClose: () => void;
}

export const ReportHistoryPanel: React.FC<Props> = ({ taskId, visible, onClose }) => {
  const [history, setHistory] = useState<RedlineReportHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedReport, setSelectedReport] = useState<RedlineReportHistory | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setSelectedReport(null);
    redlineVerificationApi.getReportHistory(taskId)
      .then(res => { if (res.code === 200) setHistory(res.data || []); })
      .finally(() => setLoading(false));
  }, [visible, taskId]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[120] flex" onClick={onClose}>
      <div className="flex-1" />
      <div className="h-full w-[600px] bg-theme-surface border-l border-theme-border shadow-xl overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-theme-surface border-b border-theme-border px-6 py-4 flex items-center justify-between">
          {selectedReport ? (
            <button onClick={() => setSelectedReport(null)} className="flex items-center gap-2 text-sm text-theme-text-secondary hover:text-theme-text-primary">
              <ArrowLeft className="w-4 h-4" /> 返回列表
            </button>
          ) : (
            <h3 className="text-base font-semibold text-theme-text-primary">历史报告</h3>
          )}
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-theme-surface-hover">
            <X className="w-4 h-4 text-theme-text-tertiary" />
          </button>
        </div>
        <div className="p-6">
          {loading && (
            <div className="flex justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-theme-text-secondary" />
            </div>
          )}
          {!loading && !selectedReport && history.length === 0 && (
            <p className="text-sm text-theme-text-tertiary text-center py-12">暂无历史报告</p>
          )}
          {!loading && !selectedReport && history.map(h => (
            <button
              key={h.id}
              onClick={() => setSelectedReport(h)}
              className="w-full text-left p-4 rounded-lg hover:bg-theme-surface-hover border border-theme-border mb-3 transition-colors"
            >
              <div className="text-sm font-medium text-theme-text-primary">执行记录 #{h.executionId?.slice(0, 8)}</div>
              <div className="text-xs text-theme-text-tertiary mt-1">{new Date(h.createdAt).toLocaleString('zh-CN')}</div>
            </button>
          ))}
          {!loading && selectedReport && (
            <div className="prose prose-sm prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                {selectedReport.reportContent || '无报告内容'}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
