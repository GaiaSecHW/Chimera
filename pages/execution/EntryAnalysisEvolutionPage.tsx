import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Download, Loader2, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';

import { api } from '../../clients/api';
import { AppEaDebugReport } from '../../types/types';
import { ServicePageTitle } from '../../components/execution/ServiceBuildVersion';
import { useUiFeedback } from '../../components/UiFeedback';
import { showConfirm } from '../../components/DialogService';

const STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  running: '诊断中',
  passed: '已完成',
  failed: '失败',
  error: '错误',
  skipped: '已跳过',
};

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-theme-elevated text-theme-text-secondary',
  running: 'bg-blue-500/15 text-blue-400',
  passed: 'bg-emerald-500/15 text-emerald-400',
  failed: 'bg-red-500/15 text-red-400',
  error: 'bg-orange-500/15 text-orange-400',
  skipped: 'bg-zinc-500/15 text-zinc-400',
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
  const html = content
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```([\s\S]*?)```/g, '<pre class="bg-theme-elevated rounded p-3 overflow-x-auto my-2 text-xs"><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-theme-elevated px-1 rounded text-xs">$1</code>')
    .replace(/\n/g, '<br/>');
  return <div className="text-sm leading-relaxed text-theme-text" dangerouslySetInnerHTML={{ __html: html }} />;
}

// ════════════════════════════════════════════════════════════════════════════
// 列表页
// ════════════════════════════════════════════════════════════════════════════
export function EntryAnalysisEvolutionPage({
  projectId: _projectId,
  onOpenDetail,
}: {
  projectId: string;
  onOpenDetail: (reportId: string) => void;
}) {
  const [reports, setReports] = useState<AppEaDebugReport[]>([]);
  const [loading, setLoading] = useState(false);
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

  useEffect(() => {
    const hasActive = reports.some(r => r.status === 'running' || r.status === 'pending');
    if (!hasActive) return;
    const t = setInterval(loadList, 8000);
    return () => clearInterval(t);
  }, [reports, loadList]);

  const reanalyze = useCallback(async (reportId: string) => {
    try {
      await appApi.reanalyzeDebugReport(reportId);
      notify('已重新提交诊断', 'success');
      loadList();
    } catch (e: any) {
      notify(e?.message || '重新诊断失败', 'error');
    }
  }, [appApi, notify, loadList]);

  const deleteReport = useCallback(async (reportId: string, taskName: string) => {
    const ok = await showConfirm({
      title: '删除诊断报告',
      message: `确认删除报告「${taskName}」？删除后不再显示（标记为已处理）。`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await appApi.deleteDebugReport(reportId);
      notify('已删除', 'success');
      loadList();
    } catch (e: any) {
      notify(e?.message || '删除失败', 'error');
    }
  }, [appApi, notify, loadList]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-6 space-y-4">
      <ServicePageTitle title="入口分析进化" />
      <p className="text-sm text-theme-text-secondary -mt-2">任务失败时由 LLM 自动诊断产出的问题定位报告（不区分项目）</p>

      <div className="flex items-center justify-between">
        <div className="text-sm text-theme-text-secondary">共 {total} 条诊断报告</div>
        <button onClick={loadList} disabled={loading}
          className="flex items-center gap-1 px-3 py-1.5 text-sm rounded border border-theme-border hover:bg-theme-elevated disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> 刷新
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-theme-border">
        <table className="w-full text-sm">
          <thead className="bg-theme-elevated text-theme-text-secondary text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">任务</th>
              <th className="px-4 py-3 text-left">状态</th>
              <th className="px-4 py-3 text-left">诊断模型</th>
              <th className="px-4 py-3 text-left">原任务状态</th>
              <th className="px-4 py-3 text-left">生成时间</th>
              <th className="px-4 py-3 text-left">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-theme-border">
            {loading && reports.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-theme-text-muted"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />加载中…</td></tr>
            ) : reports.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-theme-text-muted">暂无失败诊断报告（任务失败后将自动生成）</td></tr>
            ) : reports.map(r => (
              <tr key={r.report_id} className="cursor-pointer hover:bg-theme-elevated/50 transition-colors"
                onClick={() => onOpenDetail(r.report_id)}>
                <td className="px-4 py-3">
                  <div className="font-medium text-theme-text">{r.task_name || r.task_id}</div>
                  <div className="text-xs text-theme-text-muted font-mono">{r.task_id}</div>
                </td>
                <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-3"><span className="text-xs text-theme-text-secondary font-mono">{r.model || '-'}</span></td>
                <td className="px-4 py-3"><span className="text-xs text-theme-text-secondary">{r.task_status || '-'}</span></td>
                <td className="px-4 py-3"><span className="text-xs text-theme-text-secondary">{r.finished_at || r.created_at || '-'}</span></td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
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
                    <button onClick={() => deleteReport(r.report_id, r.task_name || r.task_id)} title="删除(标记已处理)"
                      className="text-theme-text-secondary hover:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="px-3 py-1 text-sm rounded border border-theme-border disabled:opacity-50 hover:bg-theme-elevated">上一页</button>
          <span className="text-sm text-theme-text-secondary">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="px-3 py-1 text-sm rounded border border-theme-border disabled:opacity-50 hover:bg-theme-elevated">下一页</button>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 详情页（独立页面，非弹窗）
// ════════════════════════════════════════════════════════════════════════════
export function EntryAnalysisEvolutionDetailPage({
  reportId,
  onBack,
}: {
  reportId: string;
  onBack: () => void;
}) {
  const [report, setReport] = useState<AppEaDebugReport | null>(null);
  const [loading, setLoading] = useState(true);
  const { notify } = useUiFeedback();
  const appApi = api.domains.execution.appEntryAnalyse;

  const load = useCallback(async () => {
    if (!reportId) return;
    setLoading(true);
    try {
      const detail = await appApi.getDebugReport(reportId);
      setReport(detail);
    } catch (e: any) {
      notify(e?.message || '加载报告详情失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [appApi, reportId, notify]);

  useEffect(() => { load(); }, [load]);

  // 诊断中/等待中自动刷新
  useEffect(() => {
    if (!report || (report.status !== 'running' && report.status !== 'pending')) return;
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [report, load]);

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="flex items-center gap-1 px-3 py-1.5 text-sm rounded border border-theme-border hover:bg-theme-elevated text-theme-text">
          <ArrowLeft className="w-4 h-4" /> 返回列表
        </button>
        <h1 className="text-lg font-semibold text-theme-text">失败诊断报告详情</h1>
        {report && <StatusBadge status={report.status} />}
      </div>

      {loading || !report ? (
        <div className="flex items-center justify-center py-16 text-theme-text-muted">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />加载中…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 text-sm p-4 rounded-lg border border-theme-border bg-theme-panel">
            <div><span className="text-theme-text-muted">任务：</span><span className="text-theme-text">{report.task_name || report.task_id}</span></div>
            <div><span className="text-theme-text-muted">模型：</span><span className="text-theme-text font-mono text-xs">{report.model || '-'}</span></div>
            <div className="col-span-2"><span className="text-theme-text-muted">任务ID：</span><span className="text-theme-text font-mono text-xs">{report.task_id}</span></div>
            <div><span className="text-theme-text-muted">原任务状态：</span><span className="text-theme-text">{report.task_status || '-'}</span></div>
            <div><span className="text-theme-text-muted">生成时间：</span><span className="text-theme-text">{report.finished_at || report.created_at || '-'}</span></div>
          </div>

          {report.error && (
            <div className="p-3 rounded bg-red-500/10 border border-red-500/30 text-sm text-red-300">
              {report.error}
            </div>
          )}

          <div className="space-y-5">
            {FIELD_LABELS.map(({ key, label }) => (
              <section key={key} className="p-4 rounded-lg border border-theme-border bg-theme-panel">
                <h2 className="text-base font-semibold text-theme-text mb-2">{label}</h2>
                <div className="text-theme-text"><MarkdownBlock content={report[key]} /></div>
              </section>
            ))}
          </div>

          {report.report_path && (
            <div className="pt-2">
              <a href={appApi.debugReportDownloadUrl(report.report_id)} download
                 className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded border border-theme-border hover:bg-theme-elevated text-blue-400">
                <Download className="w-4 h-4" /> 下载完整报告 (Markdown)
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}
