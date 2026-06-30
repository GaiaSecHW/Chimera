import React, { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, RefreshCw, Trash2 } from 'lucide-react';

import { api } from '../../clients/api';
import { SaFailureDebugReportDetail, SaFailureDebugReportListItem } from '../../types/types';
import { ExecutionTable, ExecutionTableHead, ExecutionTableTh, ExecutionTableTd, executionTableRowClassName } from '../../components/execution/ExecutionTable';
import { ServicePageTitle } from '../../components/execution/ServiceBuildVersion';
import { useUiFeedback } from '../../components/UiFeedback';
import { showConfirm } from '../../components/DialogService';
import { Modal } from '../../design-system/primitives';

const REFRESH_INTERVAL_MS = 30_000;

const STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  running: '调试中',
  done: '已完成',
  error: '调试失败',
};

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-theme-elevated text-theme-text-secondary',
  running: 'bg-blue-500/15 text-blue-400',
  done: 'bg-emerald-500/15 text-emerald-400',
  error: 'bg-red-500/15 text-red-400',
};

function formatTime(ts: string | null | undefined): string {
  if (!ts) return '-';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

interface SystemAnalysisEvolutionPageProps {}

export const SystemAnalysisEvolutionPage: React.FC<SystemAnalysisEvolutionPageProps> = () => {
  const appApi = api.domains.execution.appSystemAnalyse;
  const { notify } = useUiFeedback();

  const [reports, setReports] = useState<SaFailureDebugReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<SaFailureDebugReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const loadReports = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const resp = await appApi.listFailureDebugReports({
        page: 1,
        per_page: 100,
      });
      setReports(resp.items || []);
    } catch (err: any) {
      notify(`加载失败调试报告失败: ${err?.message || err}`, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [appApi, notify]);

  useEffect(() => {
    void loadReports();
    const timer = setInterval(() => loadReports(true), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loadReports]);

  const handleViewDetail = async (report: SaFailureDebugReportListItem) => {
    setDetailLoading(true);
    setDetailOpen(true);
    setDetail(null);
    try {
      const d = await appApi.getFailureDebugReport(report.id);
      setDetail(d);
    } catch (err: any) {
      notify(`加载详情失败: ${err?.message || err}`, 'error');
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDownload = async (report: SaFailureDebugReportListItem) => {
    setDownloadingId(report.id);
    try {
      const blob = await appApi.downloadFailureDebugReport(report.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `failure_debug_${report.task_id}.md`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      notify(`下载失败: ${err?.message || err}`, 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (report: SaFailureDebugReportListItem) => {
    const ok = await showConfirm({
      title: '删除报告',
      message: `确认删除报告 #${report.id}（任务 ${report.task_name || report.task_id}）？\n删除后表示已处理，不可恢复。`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await appApi.deleteFailureDebugReport(report.id);
      notify('已删除', 'success');
      await loadReports(true);
    } catch (err: any) {
      notify(`删除失败: ${err?.message || err}`, 'error');
    }
  };

  return (
    <div className="min-h-full">
      <ServicePageTitle title="bug修复" />
      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-theme-text-muted">
          任务失败时，系统自动使用 LLM 对失败原因进行调试，生成问题现象 / 根因 / 解决方法 / 代码现场 / 补丁代码报告。
        </p>
        <button
          className="btn-secondary"
          onClick={() => loadReports()}
          disabled={refreshing}
        >
          {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          <span className="ml-1.5">刷新</span>
        </button>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-theme-text-muted">
            <Loader2 size={24} className="animate-spin" />
            <span className="ml-2">加载中…</span>
          </div>
        ) : reports.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-theme-text-muted">
            暂无失败调试报告
          </div>
        ) : (
          <ExecutionTable>
            <ExecutionTableHead>
              <ExecutionTableTh>序号</ExecutionTableTh>
              <ExecutionTableTh>项目</ExecutionTableTh>
              <ExecutionTableTh>任务名称</ExecutionTableTh>
              <ExecutionTableTh>状态</ExecutionTableTh>
              <ExecutionTableTh>失败阶段</ExecutionTableTh>
              <ExecutionTableTh>错误类型</ExecutionTableTh>
              <ExecutionTableTh>问题摘要</ExecutionTableTh>
              <ExecutionTableTh>生成时间</ExecutionTableTh>
              <ExecutionTableTh className="text-right">操作</ExecutionTableTh>
            </ExecutionTableHead>
            <tbody>
              {reports.map((r, idx) => (
                <tr key={r.id} className={executionTableRowClassName}>
                  <ExecutionTableTd className="font-mono text-xs">#{idx + 1}</ExecutionTableTd>
                  <ExecutionTableTd className="text-xs text-theme-text-muted">{r.project_id || '-'}</ExecutionTableTd>
                  <ExecutionTableTd>
                    <button
                      className="text-left text-theme-text-primary hover:text-blue-400"
                      onClick={() => handleViewDetail(r)}
                      title={r.task_id}
                    >
                      {r.task_name || r.task_id}
                    </button>
                  </ExecutionTableTd>
                  <ExecutionTableTd>
                    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[r.status] || 'bg-theme-elevated text-theme-text-muted'}`}>
                      {STATUS_LABEL[r.status] || r.status}
                    </span>
                  </ExecutionTableTd>
                  <ExecutionTableTd className="text-sm">{r.failing_stage || '-'}</ExecutionTableTd>
                  <ExecutionTableTd className="text-sm">{r.error_kind || '-'}</ExecutionTableTd>
                  <ExecutionTableTd className="max-w-md truncate text-sm text-theme-text-secondary">
                    {r.summary || '-'}
                  </ExecutionTableTd>
                  <ExecutionTableTd className="whitespace-nowrap text-sm text-theme-text-muted">{formatTime(r.created_at)}</ExecutionTableTd>
                  <ExecutionTableTd className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        className="btn-icon-sm"
                        title="查看详情"
                        onClick={() => handleViewDetail(r)}
                      >
                        详情
                      </button>
                      <button
                        className="btn-icon-sm"
                        title="下载报告"
                        onClick={() => handleDownload(r)}
                        disabled={downloadingId === r.id || r.status !== 'done'}
                      >
                        {downloadingId === r.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                      </button>
                      <button
                        className="btn-icon-sm text-red-400 hover:text-red-300"
                        title="删除（标记已处理）"
                        onClick={() => handleDelete(r)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </ExecutionTableTd>
                </tr>
              ))}
            </tbody>
          </ExecutionTable>
        )}
      </div>

      {/* 详情弹窗 */}
      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        size="xl"
        title={detail ? `失败调试报告` : '失败调试报告'}
        description={detail ? `任务: ${detail.task_name} (${detail.task_id})` : undefined}
      >
        {detailLoading ? (
          <div className="flex items-center justify-center py-12 text-theme-text-muted">
            <Loader2 size={20} className="animate-spin" />
            <span className="ml-2">加载中…</span>
          </div>
        ) : detail ? (
          <FailureDebugReportView detail={detail} onDownload={() => handleDownload(detail)} downloading={downloadingId === detail.id} />
        ) : null}
      </Modal>
    </div>
  );
};

interface ReportViewProps {
  detail: SaFailureDebugReportDetail;
  onDownload: () => void;
  downloading: boolean;
}

const FailureDebugReportView: React.FC<ReportViewProps> = ({ detail, onDownload, downloading }) => {
  const r = detail.report_json || {};
  const sections: { title: string; content: string }[] = [
    { title: '问题现象', content: r.phenomenon || '' },
    { title: '问题根因', content: r.root_cause || '' },
    { title: '解决方法', content: r.solution || '' },
    { title: '代码现场', content: r.code_scene || '' },
    { title: '补丁代码', content: r.patch_code || '' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 text-xs text-theme-text-muted">
        <span>状态: <span className="text-theme-text-secondary">{STATUS_LABEL[detail.status] || detail.status}</span></span>
        <span>失败阶段: <span className="text-theme-text-secondary">{detail.failing_stage || '-'}</span></span>
        <span>模型: <span className="text-theme-text-secondary">{r._model || '-'}</span></span>
        <span>生成时间: <span className="text-theme-text-secondary">{formatTime(detail.created_at)}</span></span>
        <button className="btn-icon-sm ml-auto" onClick={onDownload} disabled={downloading || detail.status !== 'done'}>
          {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          <span className="ml-1">下载 .md</span>
        </button>
      </div>

      {detail.status === 'error' && detail.debug_error && (
        <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          调试失败: {detail.debug_error}
        </div>
      )}

      {sections.map((s) => (
        <div key={s.title} className="rounded border border-theme-border bg-theme-elevated/40 p-4">
          <h4 className="mb-2 text-sm font-semibold text-theme-text-primary">{s.title}</h4>
          <div className="overflow-auto text-sm text-theme-text-secondary">
            <ReportContent text={s.content} />
          </div>
        </div>
      ))}
    </div>
  );
};

/** 简单渲染：代码块用 <pre> 包裹，其余按段落。 */
const ReportContent: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return <span className="text-theme-text-muted">（无）</span>;
  // 分割代码块（``` 包裹）
  const parts = text.split(/```/);
  return (
    <div className="space-y-2">
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          // 代码块
          const firstNewline = part.indexOf('\n');
          const code = firstNewline >= 0 ? part.slice(firstNewline + 1) : part;
          return (
            <pre key={i} className="overflow-auto rounded bg-theme-background/60 p-3 text-xs text-theme-text-secondary">
              <code>{code.trimEnd()}</code>
            </pre>
          );
        }
        return part.trim() ? <p key={i} className="whitespace-pre-wrap">{part.trim()}</p> : null;
      })}
    </div>
  );
};
