import React, { useEffect, useState } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { ArrowLeft, Loader2, X } from 'lucide-react';
import { redlineVerificationApi } from '../../../clients/redlineVerification';
import type { RedlineReportHistory } from '../../../clients/redlineVerification';

const mdComponents: Components = {
  p: ({ children }) => <p className="mb-3 last:mb-0 text-theme-text-primary">{children}</p>,
  a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-cyan-400 underline">{children}</a>,
  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0 text-theme-text-primary">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0 text-theme-text-primary">{children}</ol>,
  h1: ({ children }) => <h1 className="mb-3 text-xl font-bold text-theme-text-primary last:mb-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-3 text-lg font-bold text-theme-text-primary last:mb-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 text-base font-bold text-theme-text-primary last:mb-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mb-2 text-sm font-bold text-theme-text-primary last:mb-0">{children}</h4>,
  blockquote: ({ children }) => <blockquote className="mb-3 border-l-4 border-slate-500 bg-theme-surface px-4 py-2 italic text-theme-text-secondary last:mb-0">{children}</blockquote>,
  table: ({ children }) => <div className="mb-3 overflow-x-auto last:mb-0"><table className="min-w-full border-collapse text-left text-xs">{children}</table></div>,
  thead: ({ children }) => <thead className="bg-theme-surface">{children}</thead>,
  th: ({ children }) => <th className="border border-theme-border px-3 py-2 font-bold text-theme-text-primary">{children}</th>,
  td: ({ children }) => <td className="border border-theme-border px-3 py-2 align-top text-theme-text-primary">{children}</td>,
  code: ({ children, className }) => className
    ? <code className="block overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900">{children}</code>
    : <code className="rounded bg-theme-surface px-1.5 py-0.5 font-mono text-[0.9em] text-theme-text-primary">{children}</code>,
  pre: ({ children }) => <pre className="mb-3 last:mb-0">{children}</pre>,
  hr: () => <hr className="my-4 border-theme-border" />,
};

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
 <div className="h-full w-[600px] bg-theme-surface border-l border-theme-border overflow-y-auto" onClick={e => e.stopPropagation()}>
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
            <div className="break-words leading-6">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {selectedReport.reportContent || '无报告内容'}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
