import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CircleHelp, Loader2, PanelRightClose, RefreshCw, Server, SquareCheck } from 'lucide-react';

import { projectsApi } from '../../clients/projects';
import { vulnVerifyV2Api, VulnVerifyV2ProjectStats, VulnVerifyV2Task } from '../../clients/vulnVerifyV2';
import type { SecurityProject } from '../../types/types';

interface VulnVerifyV2ServiceOverviewPanelProps {
  projects?: SecurityProject[];
  currentProjectId: string;
  onClose: () => void;
}

interface ProjectOverviewRow {
  project: SecurityProject;
  stats: VulnVerifyV2ProjectStats | null;
  error?: string | null;
}

interface RecentFailedTaskRow {
  project: SecurityProject;
  task: VulnVerifyV2Task;
}

async function mapLimit<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function fmtNum(value: unknown): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function verdictCount(stats: VulnVerifyV2ProjectStats | null | undefined, key: 'confirmed' | 'ruled_out' | 'unresolved'): number {
  if (!stats) return 0;
  const direct = (stats as any)[key];
  const count = (stats as any)[`${key}_count`];
  const nested = stats.verdict_counts?.[key];
  return fmtNum(direct ?? count ?? nested ?? 0);
}

function fmtTime(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN') : value;
}

function projectName(project: SecurityProject): string {
  return project.name || project.id;
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

const HealthJson: React.FC<{ value: unknown }> = ({ value }) => (
  <details className="group rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-xs">
    <summary className="cursor-pointer select-none text-theme-text-secondary transition hover:text-theme-text-primary">Health Raw JSON</summary>
    <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words font-mono leading-5 text-theme-text-secondary">{JSON.stringify(value, null, 2)}</pre>
  </details>
);

export const VulnVerifyV2ServiceOverviewPanel: React.FC<VulnVerifyV2ServiceOverviewPanelProps> = ({ projects = [], currentProjectId, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<any | null>(null);
  const [projectRows, setProjectRows] = useState<ProjectOverviewRow[]>([]);
  const [recentFailedTasks, setRecentFailedTasks] = useState<RecentFailedTaskRow[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthResult, projectSource] = await Promise.all([
        vulnVerifyV2Api.getHealth().catch((e) => ({ status: 'error', error: e?.message || String(e) })),
        projects.length ? Promise.resolve(projects) : projectsApi.list({ page: 1, page_size: 200 }).then((res) => res.projects || []),
      ]);
      const normalizedProjects = projectSource.length ? projectSource : [{ id: currentProjectId, name: currentProjectId, description: '' } as SecurityProject];
      const rows = await mapLimit(normalizedProjects, 4, async (project): Promise<ProjectOverviewRow> => {
        try {
          const stats = await vulnVerifyV2Api.getProjectStats(project.id);
          return { project, stats };
        } catch (e: any) {
          return { project, stats: null, error: e?.message || String(e) };
        }
      });
      const failedGroups = await mapLimit(normalizedProjects, 4, async (project): Promise<RecentFailedTaskRow[]> => {
        try {
          const list = await vulnVerifyV2Api.listTasks(project.id, { status: 'failed', limit: 3, offset: 0 });
          return (list.items || []).map((task) => ({ project, task }));
        } catch {
          return [];
        }
      });
      const recent = failedGroups.flat().sort((a, b) => {
        const at = new Date(a.task.updated_at || a.task.created_at || 0).getTime();
        const bt = new Date(b.task.updated_at || b.task.created_at || 0).getTime();
        return bt - at;
      }).slice(0, 20);
      setHealth(healthResult);
      setProjectRows(rows);
      setRecentFailedTasks(recent);
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

  const totals = useMemo(() => projectRows.reduce((acc, row) => {
    const s = row.stats;
    acc.projects += 1;
    acc.total += fmtNum(s?.total_tasks);
    acc.pending += fmtNum(s?.pending);
    acc.running += fmtNum(s?.running);
    acc.failed += fmtNum(s?.failed);
    acc.confirmed += verdictCount(s, 'confirmed');
    acc.ruledOut += verdictCount(s, 'ruled_out');
    acc.unresolved += verdictCount(s, 'unresolved');
    return acc;
  }, { projects: 0, total: 0, pending: 0, running: 0, failed: 0, confirmed: 0, ruledOut: 0, unresolved: 0 }), [projectRows]);

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
              <div className="text-xs text-theme-text-muted">跨项目聚合展示服务健康、任务状态和最近失败任务</div>
            </div>
            <button type="button" onClick={() => void loadOverview()} disabled={loading} className="inline-flex h-8 items-center gap-2 rounded-lg border border-theme-border bg-theme-surface px-3 text-xs text-theme-text-secondary transition hover:bg-theme-elevated disabled:opacity-50">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />刷新
            </button>
          </div>
          {error ? <div className="rounded-lg border border-[var(--color-signal-red-border)] bg-[var(--color-signal-red-bg)] px-4 py-3 text-xs text-[var(--color-signal-red)]">{error}</div> : null}

          <section className="grid gap-4 md:grid-cols-4">
            <MetricCard label="项目数" value={totals.projects} tone="blue" />
            <MetricCard label="任务总数" value={totals.total} />
            <MetricCard label="运行中" value={totals.running} tone="blue" />
            <MetricCard label="失败" value={totals.failed} tone="red" />
            <MetricCard label="已确认" value={totals.confirmed} tone="red" Icon={AlertTriangle} />
            <MetricCard label="已排除" value={totals.ruledOut} tone="cyan" Icon={SquareCheck} />
            <MetricCard label="不可证" value={totals.unresolved} tone="amber" Icon={CircleHelp} />
            <MetricCard label="等待中" value={totals.pending} />
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme-border text-theme-text-secondary">
                  {projectRows.map((row) => (
                    <tr key={row.project.id}>
                      <td className="max-w-[220px] truncate px-3 py-2 text-theme-text-primary" title={projectName(row.project)}>{projectName(row.project)}{row.error ? <span className="ml-2 text-[var(--color-signal-red)]">加载失败</span> : null}</td>
                      <td className="px-3 py-2 font-mono text-theme-text-muted">{row.project.id}</td>
                      <td className="px-3 py-2 text-right">{fmtNum(row.stats?.total_tasks)}</td>
                      <td className="px-3 py-2 text-right">{fmtNum(row.stats?.pending)}</td>
                      <td className="px-3 py-2 text-right">{fmtNum(row.stats?.running)}</td>
                      <td className="px-3 py-2 text-right">{fmtNum(row.stats?.success)}</td>
                      <td className="px-3 py-2 text-right">{fmtNum(row.stats?.failed)}</td>
                      <td className="px-3 py-2 text-right">{verdictCount(row.stats, 'confirmed')}</td>
                      <td className="px-3 py-2 text-right">{verdictCount(row.stats, 'ruled_out')}</td>
                      <td className="px-3 py-2 text-right">{verdictCount(row.stats, 'unresolved')}</td>
                    </tr>
                  ))}
                  {!projectRows.length && !loading ? <tr><td colSpan={10} className="px-3 py-8 text-center text-theme-text-muted">暂无项目统计</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-theme-border bg-theme-surface p-4">
            <h3 className="mb-3 text-sm font-semibold text-theme-text-primary">最近失败任务</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-theme-border text-theme-text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">更新时间</th>
                    <th className="px-3 py-2 font-medium">项目</th>
                    <th className="px-3 py-2 font-medium">任务</th>
                    <th className="px-3 py-2 font-medium">结论</th>
                    <th className="px-3 py-2 font-medium">模型</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme-border text-theme-text-secondary">
                  {recentFailedTasks.map(({ project, task }) => (
                    <tr key={`${project.id}-${task.id}`}>
                      <td className="whitespace-nowrap px-3 py-2 text-theme-text-muted">{fmtTime(task.updated_at || task.created_at)}</td>
                      <td className="max-w-[180px] truncate px-3 py-2" title={projectName(project)}>{projectName(project)}</td>
                      <td className="max-w-[360px] truncate px-3 py-2 text-theme-text-primary" title={task.name}>{task.name}</td>
                      <td className="px-3 py-2">{task.verdict || '-'}</td>
                      <td className="px-3 py-2">{task.runtime?.resolved_model || task.model || '-'}</td>
                    </tr>
                  ))}
                  {!recentFailedTasks.length && !loading ? <tr><td colSpan={5} className="px-3 py-8 text-center text-theme-text-muted">暂无失败任务</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>

          {health ? <HealthJson value={health} /> : null}
        </div>
      </aside>
    </div>
  );
};
