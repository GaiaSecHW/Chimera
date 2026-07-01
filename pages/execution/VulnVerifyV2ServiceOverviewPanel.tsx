import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CircleHelp, Loader2, PanelRightClose, RefreshCw, Server, SquareCheck } from 'lucide-react';

import { projectsApi } from '../../clients/projects';
import { vulnVerifyV2Api, VulnVerifyV2AdminOverview } from '../../clients/vulnVerifyV2';
import type { SecurityProject } from '../../types/types';

interface VulnVerifyV2ServiceOverviewPanelProps {
  projects?: SecurityProject[];
  currentProjectId: string;
  onClose: () => void;
}

function fmtNum(value: unknown): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function fmtTime(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN') : value;
}

function fmtDurationMs(value?: number | null): string {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return '-';
  if (n < 1000) return '<1s';
  const seconds = Math.round(n / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

function projectLabel(projectId: string, projectNameById: Map<string, string>): string {
  return projectNameById.get(projectId) || projectId;
}

const MetricCard: React.FC<{ label: string; value: React.ReactNode; tone?: 'red' | 'cyan' | 'amber' | 'blue' | 'slate'; Icon?: React.ElementType }> = ({ label, value, tone = 'slate', Icon }) => {
  const color = tone === 'red' ? 'text-[var(--color-signal-red)]' : tone === 'cyan' ? 'text-[var(--color-signal-cyan)]' : tone === 'amber' ? 'text-[var(--color-signal-amber)]' : tone === 'blue' ? 'text-[var(--color-signal-blue)]' : 'text-theme-text-primary';
  return (
    <div className="rounded-xl border border-theme-border bg-theme-surface px-4 py-3">
      <div className={`inline-flex items-center gap-2 text-xs font-semibold ${color}`}>{Icon ? <Icon size={17} strokeWidth={2.5} /> : null}{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${color}`}>{value}</div>
    </div>
  );
};

export const VulnVerifyV2ServiceOverviewPanel: React.FC<VulnVerifyV2ServiceOverviewPanelProps> = ({ projects = [], currentProjectId, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<VulnVerifyV2AdminOverview | null>(null);
  const [knownProjects, setKnownProjects] = useState<SecurityProject[]>(projects);
  const [panelOpen, setPanelOpen] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewResult, projectSource] = await Promise.all([
        vulnVerifyV2Api.getAdminOverview(),
        projects.length ? Promise.resolve(projects) : projectsApi.list({ page: 1, page_size: 500 }).then((res) => res.projects || []).catch(() => []),
      ]);
      setOverview(overviewResult);
      setKnownProjects(projectSource.length ? projectSource : [{ id: currentProjectId, name: currentProjectId, description: '' } as SecurityProject]);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [currentProjectId, projects]);

  useEffect(() => { void loadOverview(); }, [loadOverview]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setPanelOpen(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const handleClose = useCallback(() => {
    setPanelOpen(false);
    window.setTimeout(onClose, 300);
  }, [onClose]);

  const projectNameById = useMemo(() => new Map(knownProjects.map((project) => [project.id, project.name || project.id])), [knownProjects]);
  const totals = overview?.totals;
  const statusCounts = totals?.status_counts;
  const verdictCounts = totals?.verdict_counts;
  const serviceJson = overview ? { service: overview.service, generated_at: overview.generated_at, warnings: overview.warnings } : null;

  return (
    <div className={`fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] transition-opacity duration-300 ${panelOpen ? 'opacity-100' : 'opacity-0'}`} onClick={handleClose} role="presentation">
      <aside
        className={`absolute right-0 top-0 flex h-full w-full max-w-[1080px] transform flex-col overflow-visible border-l border-theme-border bg-theme-bg-app shadow-2xl transition-transform duration-300 ease-out xl:w-[62vw] 2xl:max-w-[1180px] ${panelOpen ? 'translate-x-0' : 'translate-x-full'}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="漏洞验证 v2 全局概览"
      >
        <button
          onClick={handleClose}
          aria-label="收起全局概览"
          title="收起全局概览"
          className="absolute left-0 top-1/2 z-10 inline-flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-theme-border bg-theme-bg-app text-theme-text-secondary shadow-md transition hover:bg-theme-elevated hover:text-theme-text-primary"
        >
          <PanelRightClose size={14} strokeWidth={2.1} />
        </button>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-8 py-8 lg:px-10 lg:py-10">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-theme-border pb-4">
            <div className="min-w-0 space-y-1">
              <div className="inline-flex items-center gap-2 text-lg font-bold text-theme-text-primary"><Server size={18} />漏洞验证 v2 全局概览</div>
              <div className="text-xs text-theme-text-muted">后端聚合展示服务状态、项目统计和最近失败 Attempt</div>
            </div>
            <button type="button" onClick={() => void loadOverview()} disabled={loading} className="inline-flex h-8 items-center gap-2 rounded-lg border border-theme-border bg-theme-surface px-3 text-xs text-theme-text-secondary transition hover:bg-theme-elevated disabled:opacity-50">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />刷新
            </button>
          </div>
          {error ? <div className="rounded-lg border border-[var(--color-signal-red-border)] bg-[var(--color-signal-red-bg)] px-4 py-3 text-xs text-[var(--color-signal-red)]">{error}</div> : null}

          <section className="grid gap-4 md:grid-cols-4">
            <MetricCard label="项目数" value={fmtNum(totals?.project_count)} tone="blue" />
            <MetricCard label="任务总数" value={fmtNum(totals?.task_count)} />
            <MetricCard label="运行中" value={fmtNum(statusCounts?.running)} tone="blue" />
            <MetricCard label="失败" value={fmtNum(statusCounts?.failed)} tone="red" />
            <MetricCard label="已确认" value={fmtNum(verdictCounts?.confirmed)} tone="red" Icon={AlertTriangle} />
            <MetricCard label="已排除" value={fmtNum(verdictCounts?.ruled_out)} tone="cyan" Icon={SquareCheck} />
            <MetricCard label="不可证" value={fmtNum(verdictCounts?.unresolved)} tone="amber" Icon={CircleHelp} />
            <MetricCard label="失败 Attempt" value={fmtNum(totals?.recent_failed_attempt_count)} tone="red" />
          </section>

          <section className="rounded-2xl border border-theme-border bg-theme-surface p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-theme-text-primary">项目统计</h3>
              {loading ? <span className="inline-flex items-center gap-2 text-xs text-theme-text-muted"><Loader2 size={14} className="animate-spin" />加载中</span> : null}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-theme-border text-theme-text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">项目</th>
                    <th className="px-3 py-2 font-medium">project_id</th>
                    <th className="px-3 py-2 text-right font-medium">总数</th>
                    <th className="px-3 py-2 text-right font-medium">等待</th>
                    <th className="px-3 py-2 text-right font-medium">运行</th>
                    <th className="px-3 py-2 text-right font-medium">成功</th>
                    <th className="px-3 py-2 text-right font-medium">失败</th>
                    <th className="px-3 py-2 text-right font-medium">已确认</th>
                    <th className="px-3 py-2 text-right font-medium">已排除</th>
                    <th className="px-3 py-2 text-right font-medium">不可证</th>
                    <th className="px-3 py-2 text-right font-medium">失败 Attempt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme-border text-theme-text-secondary">
                  {(overview?.projects || []).map((row) => (
                    <tr key={row.project_id}>
                      <td className="max-w-[220px] truncate px-3 py-2 text-theme-text-primary" title={projectLabel(row.project_id, projectNameById)}>{projectLabel(row.project_id, projectNameById)}</td>
                      <td className="px-3 py-2 font-mono text-theme-text-muted">{row.project_id}</td>
                      <td className="px-3 py-2 text-right">{fmtNum(row.task_count)}</td>
                      <td className="px-3 py-2 text-right">{fmtNum(row.status_counts?.pending)}</td>
                      <td className="px-3 py-2 text-right">{fmtNum(row.status_counts?.running)}</td>
                      <td className="px-3 py-2 text-right">{fmtNum(row.status_counts?.success)}</td>
                      <td className="px-3 py-2 text-right">{fmtNum(row.status_counts?.failed)}</td>
                      <td className="px-3 py-2 text-right">{fmtNum(row.verdict_counts?.confirmed)}</td>
                      <td className="px-3 py-2 text-right">{fmtNum(row.verdict_counts?.ruled_out)}</td>
                      <td className="px-3 py-2 text-right">{fmtNum(row.verdict_counts?.unresolved)}</td>
                      <td className="px-3 py-2 text-right text-[var(--color-signal-red)]">{fmtNum(row.failed_attempt_count)}</td>
                    </tr>
                  ))}
                  {!overview?.projects?.length && !loading ? <tr><td colSpan={11} className="px-3 py-8 text-center text-theme-text-muted">暂无项目统计</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-theme-border bg-theme-surface p-4">
            <div className="mb-3 space-y-1">
              <h3 className="text-sm font-semibold text-theme-text-primary">失败 Attempt</h3>
              <div className="text-xs text-theme-text-muted">按失败时间倒序展示最近 30 条；任务最终成功也会显示中间失败 attempt。</div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-theme-border text-theme-text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">时间</th>
                    <th className="px-3 py-2 font-medium">项目</th>
                    <th className="px-3 py-2 font-medium">任务</th>
                    <th className="px-3 py-2 font-medium">Attempt</th>
                    <th className="px-3 py-2 font-medium">耗时</th>
                    <th className="px-3 py-2 font-medium">错误</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme-border text-theme-text-secondary">
                  {(overview?.failed_attempts || []).map((attempt) => {
                    const taskTitle = attempt.task_name || attempt.vuln_id || attempt.case_id || attempt.task_id;
                    return (
                      <tr key={`${attempt.task_id}-${attempt.attempt_id}`}>
                        <td className="whitespace-nowrap px-3 py-2 text-theme-text-muted">{fmtTime(attempt.finished_at || attempt.started_at)}</td>
                        <td className="max-w-[160px] truncate px-3 py-2" title={projectLabel(attempt.project_id, projectNameById)}>{projectLabel(attempt.project_id, projectNameById)}</td>
                        <td className="max-w-[300px] px-3 py-2">
                          <div className="truncate text-theme-text-primary" title={taskTitle}>{taskTitle}</div>
                          <div className="mt-1 truncate font-mono text-theme-text-faint" title={attempt.vuln_id || attempt.case_id || attempt.task_id}>{attempt.vuln_id || attempt.case_id || attempt.task_id}</div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-[var(--color-signal-red)]">#{attempt.attempt_no || '-'} failed</td>
                        <td className="whitespace-nowrap px-3 py-2">{fmtDurationMs(attempt.duration_ms)}</td>
                        <td className="max-w-[420px] truncate px-3 py-2 text-theme-text-muted" title={attempt.error || ''}>{attempt.error || '-'}</td>
                      </tr>
                    );
                  })}
                  {!overview?.failed_attempts?.length && !loading ? <tr><td colSpan={6} className="px-3 py-8 text-center text-theme-text-muted">暂无失败 Attempt</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>

          {overview?.warnings?.length ? (
            <div className="rounded-lg border border-[var(--color-signal-amber-border)] bg-[var(--color-signal-amber-bg)] px-4 py-3 text-xs text-[var(--color-signal-amber)]">
              {overview.warnings.join('；')}
            </div>
          ) : null}

          {serviceJson ? (
            <details className="group rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-xs">
              <summary className="cursor-pointer select-none text-theme-text-secondary transition hover:text-theme-text-primary">Service Raw JSON</summary>
              <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words font-mono leading-5 text-theme-text-secondary">{JSON.stringify(serviceJson, null, 2)}</pre>
            </details>
          ) : null}
        </div>
      </aside>
    </div>
  );
};
