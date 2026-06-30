import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileText, Loader2, RefreshCw, RotateCcw, X, XCircle } from 'lucide-react';

import { api } from '../../clients/api';
import { AppEaDebugReport } from '../../types/types';
import { ExecutionTable, ExecutionTableHead, ExecutionTableTh, ExecutionTableTd, executionTableRowClassName } from '../../components/execution/ExecutionTable';
import { ServicePageTitle } from '../../components/execution/ServiceBuildVersion';
import { useUiFeedback } from '../../components/UiFeedback';

const STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  running: '诊断中',
  passed: '已完成',
  failed: '失败',
  error: '错误',
};

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-theme-elevated text-theme-text-secondary',
  running: 'bg-blue-500/15 text-blue-400',
  passed: 'bg-emerald-500/15 text-emerald-400',
  failed: 'bg-red-500/15 text-red-400',
  error: 'bg-orange-500/15 text-orange-400',
};

const FIELD_LABELS: { key: keyof AppEaDebugReport; label: string }[] = [
  { key: 'phenomenon', label: '问题现象' },
  { key: 'root_cause', label: '问题根因' },
  { key: 'solution', label: '解决方法' },
  { key: 'code_scene', label: '代码现场' },
  { key: 'patch_code', label: '补丁代码' },
];

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLOR[status] || 'bg-theme-elevated text-theme-text-secondary'}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

function MarkdownBlock({ content }: { content: string | null | undefined }) {
  if (!content || !content.trim()) {
    return <span className="text-theme-text-muted italic">(未生成)</span>;
  }
  // 简易 markdown 渲染：保留换行 + 代码块
  const html = content
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```([\s\S]*?)```/g, '<pre class="bg-theme-elevated rounded p-3 overflow-x-auto my-2 text-xs"><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-theme-elevated px-1 rounded text-xs">$1</code>')
    .replace(/\n/g, '<br/>');
  return <div className="text-sm leading-relaxed text-theme-text" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function EntryAnalysisEvolutionPage({ projectId }: { projectId: string }) {
  const [reports, setReports] = useState<AppEaDebugReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<AppEaDebugReport | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;
  const { notify } = useUiFeedback();
  const appApi = api.domains.execution.appEntryAnalyse;

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      // 微服务级界面：不按项目过滤，展示全部失败诊断报告
      const resp = await appApi.listDebugReports({ page, page_size: pageSize });
      setReports(resp.items || []);
      setTotal(resp.total || 0);
    } catch (e: any) {
      notify(e?.message || '加载失败诊断报告失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [appApi, page, notify]);

  useEffect(() => { loadList(); }, [loadList]);

  // 自动刷新（诊断中/等待中的报告）
  useEffect(() => {
    const hasActive = reports.some(r => r.status === 'running' || r.status === 'pending');
    if (!hasActive) return;
    const t = setInterval(loadList, 8000);
    return () => clearInterval(t);
  }, [reports, loadList]);

  const openDetail = useCallback(async (reportId: string) => {
    setDetailLoading(true);
    setSelected(null);
    try {
      const detail = await appApi.getDebugReport(reportId);
      setSelected(detail);
    } catch (e: any) {
      notify(e?.message || '加载报告详情失败', 'error');
    } finally {
      setDetailLoading(false);
    }
  }, [appApi, notify]);

  const reanalyze = useCallback(async (reportId: string) => {
    try {
      await appApi.reanalyzeDebugReport(reportId);
      notify('已重新提交诊断', 'success');
      loadList();
    } catch (e: any) {
      notify(e?.message || '重新诊断失败', 'error');
    }
  }, [appApi, notify, loadList]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-6 space-y-4">
      <ServicePageTitle title="入口分析进化" />
      <p className="text-sm text-theme-text-secondary -mt-2">任务失败时由 LLM 自动诊断产出的问题定位报告</p>

      <div className="flex items-center justify-between">
        <div className="text-sm text-theme-text-secondary">共 {total} 条诊断报告</div>
        <button onClick={loadList} disabled={loading}
          className="flex items-center gap-1 px-3 py-1.5 text-sm rounded border border-theme-border hover:bg-theme-elevated disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> 刷新
        </button>
      </div>

      <ExecutionTable>
        <ExecutionTableHead>
          <ExecutionTableTh>任务</ExecutionTableTh>
          <ExecutionTableTh>状态</ExecutionTableTh>
          <ExecutionTableTh>诊断模型</ExecutionTableTh>
          <ExecutionTableTh>原任务状态</ExecutionTableTh>
          <ExecutionTableTh>生成时间</ExecutionTableTh>
          <ExecutionTableTh>操作</ExecutionTableTh>
        </ExecutionTableHead>
        <tbody>
          {loading && reports.length === 0 ? (
            <tr><ExecutionTableTd colSpan={6}><div className="flex items-center justify-center py-8 text-theme-text-muted"><Loader2 className="w-5 h-5 animate-spin mr-2" />加载中…</div></ExecutionTableTd></tr>
          ) : reports.length === 0 ? (
            <tr><ExecutionTableTd colSpan={6}><div className="text-center py-8 text-theme-text-muted">暂无失败诊断报告（任务失败后将自动生成）</div></ExecutionTableTd></tr>
          ) : reports.map(r => (
            <tr key={r.report_id} className={`${executionTableRowClassName} cursor-pointer`} onClick={() => openDetail(r.report_id)}>
              <ExecutionTableTd>
                <div className="font-medium text-theme-text">{r.task_name || r.task_id}</div>
                <div className="text-xs text-theme-text-muted font-mono">{r.task_id}</div>
              </ExecutionTableTd>
              <ExecutionTableTd><StatusBadge status={r.status} /></ExecutionTableTd>
              <ExecutionTableTd><span className="text-xs text-theme-text-secondary font-mono">{r.model || '-'}</span></ExecutionTableTd>
              <ExecutionTableTd><span className="text-xs text-theme-text-secondary">{r.task_status || '-'}</span></ExecutionTableTd>
              <ExecutionTableTd><span className="text-xs text-theme-text-secondary">{r.finished_at || r.created_at || '-'}</span></ExecutionTableTd>
              <ExecutionTableTd onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2">
                  {r.report_path && (
                    <a href={appApi.debugReportDownloadUrl(r.report_id)} download
                       className="text-blue-400 hover:text-blue-300" title="下载报告">
                      <Download className="w-4 h-4" />
                    </a>
                  )}
                  {(r.status === 'passed' || r.status === 'failed' || r.status === 'error') && (
                    <button onClick={() => reanalyze(r.report_id)} title="重新诊断"
                      className="text-theme-text-secondary hover:text-theme-text">
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </ExecutionTableTd>
            </tr>
          ))}
        </tbody>
      </ExecutionTable>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="px-3 py-1 text-sm rounded border border-theme-border disabled:opacity-50 hover:bg-theme-elevated">上一页</button>
          <span className="text-sm text-theme-text-secondary">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="px-3 py-1 text-sm rounded border border-theme-border disabled:opacity-50 hover:bg-theme-elevated">下一页</button>
        </div>
      )}

      {/* 详情弹窗 */}
      {(selected || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !detailLoading && setSelected(null)}>
          <div className="bg-theme-panel border border-theme-border rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-theme-border">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" />
                <h2 className="text-lg font-semibold text-theme-text">失败诊断报告</h2>
                {selected && <StatusBadge status={selected.status} />}
              </div>
              <button onClick={() => setSelected(null)} className="text-theme-text-muted hover:text-theme-text"><X className="w-5 h-5" /></button>
            </div>
            {detailLoading || !selected ? (
              <div className="flex items-center justify-center py-16 text-theme-text-muted"><Loader2 className="w-6 h-6 animate-spin mr-2" />加载中…</div>
            ) : (
              <div className="overflow-y-auto px-6 py-4 space-y-5">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-theme-text-muted">任务：</span><span className="text-theme-text">{selected.task_name || selected.task_id}</span></div>
                  <div><span className="text-theme-text-muted">模型：</span><span className="text-theme-text font-mono text-xs">{selected.model || '-'}</span></div>
                  <div className="col-span-2"><span className="text-theme-text-muted">任务ID：</span><span className="text-theme-text font-mono text-xs">{selected.task_id}</span></div>
                </div>
                {selected.error && (
                  <div className="flex items-start gap-2 p-3 rounded bg-red-500/10 border border-red-500/30 text-sm text-red-300">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /><span>{selected.error}</span>
                  </div>
                )}
                {FIELD_LABELS.map(({ key, label }) => (
                  <div key={key}>
                    <h3 className="text-sm font-semibold text-theme-text mb-1.5 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-blue-400" />{label}
                    </h3>
                    <div className="pl-5"><MarkdownBlock content={selected[key]} /></div>
                  </div>
                ))}
                {selected.report_path && (
                  <div className="pt-2 border-t border-theme-border">
                    <a href={appApi.debugReportDownloadUrl(selected.report_id)} download
                       className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border border-theme-border hover:bg-theme-elevated text-blue-400">
                      <Download className="w-4 h-4" /> 下载完整报告 (Markdown)
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
