import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Briefcase,
  Bug,
  Building2,
  CheckCircle2,
  Clock,
  HardDrive,
  HelpCircle,
  Layers,
  ListChecks,
  Loader,
  Monitor,
  Package,
  Server,
  ShieldCheck,
  Workflow,
  XCircle,
} from 'lucide-react';
import { api } from '../clients/api';
import { PageHeader } from '../design-system';
import { SuspectVulnTaskBreakdownDialog } from '../components/SuspectVulnTaskBreakdownDialog';
import { API_BASE, getHeaders, handleResponse } from '../clients/base';
import {
  AdminDashboardStats,
  Agent,
  AiGatewayProviderStat,
  EnvTemplate,
  PackageStats,
  SecurityProject,
  StaticPackage,
} from '../types/types';

interface DashboardPageProps {
  projects: SecurityProject[];
  agents: Agent[];
  staticPackages: StaticPackage[];
  templates: EnvTemplate[];
  servicesCount: number;
  packageStats: PackageStats | null;
  adminStats: AdminDashboardStats | null;
  adminStatsLoading: boolean;
  fetchAdminStats: () => Promise<void>;
  setCurrentView: (view: string) => void;
}

// LOKI design tokens (DESIGN.md) — dashboard-local palette.
const LK = {
  primary: 'var(--brand-primary)',
  primarySoft: '#7590ff',
  primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'var(--brand-primary-mask)',
  canvas: 'var(--bg-app)',
  surface: 'var(--bg-surface)',
  surfaceRaised: 'var(--bg-app)',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: 'var(--border-default)',
  borderSoft: 'var(--border-default)',
  ink: 'var(--text-primary)',
  inkSoft: 'var(--text-secondary)',
  body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)',
  mutedSoft: '#8b95a8',
  success: '#45c06f',
  warning: '#d5a13a',
  error: '#f15d5d',
  info: '#4f8cff',
} as const;

const WORKFLOW_STATUS_STYLE: Record<string, { label: string; color: string }> = {
  running: { label: '运行中', color: LK.primary },
  active: { label: '运行中', color: LK.primary },
  pending: { label: '等待中', color: LK.warning },
  queued: { label: '排队中', color: LK.warning },
  waiting: { label: '等待中', color: LK.warning },
  completed: { label: '已完成', color: LK.success },
  succeeded: { label: '已完成', color: LK.success },
  success: { label: '已完成', color: LK.success },
  done: { label: '已完成', color: LK.success },
  finished: { label: '已完成', color: LK.success },
  failed: { label: '失败', color: LK.error },
  failure: { label: '失败', color: LK.error },
  error: { label: '失败', color: LK.error },
  cancelled: { label: '已取消', color: LK.muted },
  canceled: { label: '已取消', color: LK.muted },
  stopped: { label: '已停止', color: LK.muted },
  paused: { label: '已暂停', color: LK.muted },
};

const SERVICE_STATUS_ORDER = ['healthy', 'degraded', 'unhealthy', 'stale', 'unregistered', 'unknown'];

const SERVICE_STATUS_META: Record<string, { label: string; color: string }> = {
  healthy: { label: '健康', color: LK.success },
  degraded: { label: '降级', color: LK.warning },
  unhealthy: { label: '异常', color: LK.error },
  stale: { label: '失联', color: LK.muted },
  unregistered: { label: '未注册', color: LK.mutedSoft },
  unknown: { label: '未知', color: LK.mutedSoft },
};

const pickWorkflowStyle = (status: string) =>
  WORKFLOW_STATUS_STYLE[status] || { label: status || '未知', color: LK.muted };

const pickServiceMeta = (status: string) =>
  SERVICE_STATUS_META[status] || { label: status || '未知', color: LK.mutedSoft };

const formatNumber = (n: number) => {
  if (typeof n !== 'number' || Number.isNaN(n)) return '--';
  return n.toLocaleString('zh-CN');
};

const formatMs = (ms?: number) => {
  if (typeof ms !== 'number' || Number.isNaN(ms)) return '--';
  if (ms < 1) return`${(ms * 1000).toFixed(0)}μs`;
  if (ms < 1000) return`${ms.toFixed(0)}ms`;
  return`${(ms / 1000).toFixed(2)}s`;
};

const formatPercent = (rate?: number) => {
  if (typeof rate !== 'number' || Number.isNaN(rate)) return '--';
  const pct = rate <= 1 ? rate * 100 : rate;
  return`${pct.toFixed(1)}%`;
};

interface KpiCardProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  value: React.ReactNode;
  label: string;
  caption: string;
  accent?: string;
  onClick?: () => void;
}

const KpiCard: React.FC<KpiCardProps> = ({ icon: Icon, value, label, caption, accent = LK.primary, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="group flex flex-col gap-3 rounded-xl p-4 text-left transition-colors"
    style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
    onMouseEnter={(e) => {
      e.currentTarget.style.borderColor = LK.primary;
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.borderColor = LK.border;
    }}
  >
    <div className="flex items-center justify-between">
      <div
        className="flex h-8 w-8 items-center justify-center rounded-[10px]"
        style={{ backgroundColor: LK.primaryMuted, color: accent }}
      >
        <Icon size={16} />
      </div>
      <ArrowUpRight size={14} style={{ color: LK.muted }} className="transition-colors group-hover:opacity-100" />
    </div>
    <div>
      <div className="text-2xl font-bold leading-8 tracking-tight" style={{ color: accent }}>
        {value}
      </div>
      <div className="mt-0.5 text-sm font-semibold" style={{ color: LK.inkSoft }}>
        {label}
      </div>
      <div className="mt-1 text-xs" style={{ color: LK.muted }}>
        {caption}
      </div>
    </div>
  </button>
);

const CardShell: React.FC<{
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, right, children, className }) => (
  <section
    className={`overflow-hidden rounded-xl ${className || ''}`}
    style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
  >
    <div
      className="flex items-start justify-between gap-3 px-4 py-3"
      style={{ borderBottom:`1px solid ${LK.borderSoft}` }}
    >
      <div>
        <h2 className="text-base font-semibold leading-6" style={{ color: LK.ink }}>
          {title}
        </h2>
        {subtitle && (
          <p className="mt-0.5 text-xs" style={{ color: LK.muted }}>
            {subtitle}
          </p>
        )}
      </div>
      {right}
    </div>
    <div className="px-4 py-4">{children}</div>
  </section>
);

const Placeholder: React.FC<{ text: string }> = ({ text }) => (
  <div className="py-8 text-center text-sm" style={{ color: LK.muted }}>
    {text}
  </div>
);

const MiniStat: React.FC<{ label: string; value: React.ReactNode; accent?: string }> = ({
  label,
  value,
  accent = LK.ink,
}) => (
  <div className="rounded-[10px] px-3 py-2.5" style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.borderSoft}` }}>
    <div className="text-xs" style={{ color: LK.muted }}>
      {label}
    </div>
    <div className="mt-1 text-lg font-semibold leading-6" style={{ color: accent }}>
      {value}
    </div>
  </div>
);

const BarRow: React.FC<{ label: string; count: number; total: number; color?: string }> = ({
  label,
  count,
  total,
  color = LK.primary,
}) => (
  <div className="flex items-center justify-between gap-3 text-xs">
    <span className="truncate" style={{ color: LK.body }}>
      {label}
    </span>
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full" style={{ backgroundColor: LK.surfaceRaised }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${total > 0 ? (count / total) * 100 : 0}%`, backgroundColor: color }}
        />
      </div>
      <span className="font-semibold tabular-nums" style={{ color: LK.inkSoft }}>
        {count.toLocaleString('zh-CN')}
      </span>
    </div>
  </div>
);

export const DashboardPage: React.FC<DashboardPageProps> = ({
  projects,
  agents,
  staticPackages,
  packageStats,
  adminStats,
  adminStatsLoading,
  setCurrentView,
}) => {
  const [providerStats, setProviderStats] = useState<AiGatewayProviderStat[]>([]);
  const [providerStatsLoading, setProviderStatsLoading] = useState(false);

  const [taskCount, setTaskCount] = useState<number | null>(null);
  const [taskQueued, setTaskQueued] = useState<number | null>(null);
  const [taskRunning, setTaskRunning] = useState<number | null>(null);
  const [taskFailed, setTaskFailed] = useState<number | null>(null);
  const [envCount, setEnvCount] = useState<number | null>(null);
  const [vulnTotal, setVulnTotal] = useState<number | null>(null);
  const [vulnSuspect, setVulnSuspect] = useState<number | null>(null);
  const [vulnSuspectLoading, setVulnSuspectLoading] = useState(true);
  const [algoHover, setAlgoHover] = useState<string | null>(null);
  const [vulnConfirmed, setVulnConfirmed] = useState<number | null>(null);
  const [vulnRuledOut, setVulnRuledOut] = useState<number | null>(null);
  const [suspectBreakdownOpen, setSuspectBreakdownOpen] = useState(false);
  const [suspectCardHover, setSuspectCardHover] = useState(false);

  useEffect(() => {
    let mounted = true;
    setProviderStatsLoading(true);
    api.domains.platform.aigw
      .listProviderStats()
      .then((items: any) => {
        if (mounted) setProviderStats(Array.isArray(items) ? items : []);
      })
      .catch((e) => console.error('Failed to fetch aigw provider stats', e))
      .finally(() => {
        if (mounted) setProviderStatsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const scheduleApi = api.domains.platform.scheduleCenter;
    const vulnApi = api.domains.vuln.vuln;
    const loadStats = async () => {
      if (mounted) setVulnSuspectLoading(true);
      const perProject = (projects || []).map((p) =>
        Promise.allSettled([
          scheduleApi.listUserTasks(p.id, { page_size: 1 }),
          fetch(`${API_BASE}/api/agent/agents/stats?project_id=${encodeURIComponent(p.id)}`, { headers: getHeaders() })
            .then((r) => handleResponse(r))
            .catch(() => null),
        ]),
      );
      const [vulnRes, ...projectResults] = await Promise.allSettled([
        vulnApi.getOverview(),
        ...perProject,
      ]);
      if (!mounted) return;
      let taskTotalSum = 0;
      let taskQueuedSum = 0;
      let taskRunningSum = 0;
      let taskFailedSum = 0;
      let envTotal = 0;
      let anyTaskOk = false;
      let anyEnvOk = false;
      projectResults.forEach((res) => {
        if (res.status !== 'fulfilled') return;
        const [taskR, envR] = res.value;
        if (taskR.status === 'fulfilled' && taskR.value?.stats) {
          anyTaskOk = true;
          taskTotalSum += Number(taskR.value.stats.total || 0);
          taskQueuedSum += Number(taskR.value.stats.queued || 0);
          taskRunningSum += Number(taskR.value.stats.running || 0);
          taskFailedSum += Number(taskR.value.stats.failed || 0);
        }
        if (envR.status === 'fulfilled' && envR.value) {
          anyEnvOk = true;
          envTotal += Number(envR.value?.summary?.total_agents || 0);
        }
      });
      setTaskCount(anyTaskOk ? taskTotalSum : null);
      setTaskQueued(anyTaskOk ? taskQueuedSum : null);
      setTaskRunning(anyTaskOk ? taskRunningSum : null);
      setTaskFailed(anyTaskOk ? taskFailedSum : null);
      setEnvCount(anyEnvOk ? envTotal : null);
      const vulnOverview = vulnRes.status === 'fulfilled' ? vulnRes.value : null;
      setVulnTotal(vulnOverview ? Number(vulnOverview?.metrics?.total_cases || 0) : null);
      setVulnConfirmed(vulnOverview ? Number(vulnOverview?.human_finished_reason_counts?.vulnerable || 0) : null);
      setVulnRuledOut(vulnOverview ? Number(vulnOverview?.human_finished_reason_counts?.not_vulnerable || 0) : null);

      // 疑似漏洞 = A (引擎工具且 finished_reason=vulnerable) + B (无引擎工具的所有上报)
      // engines 拉取失败时按"无引擎"降级：所有 case 都计入 B
      const engineTools = new Set<string>();
      try {
        const enginesRes = await vulnApi.listConfirmEngines();
        (enginesRes?.engines || []).forEach((eng: any) => {
          (eng?.bind_tools || []).forEach((t: string) => engineTools.add(t));
        });
      } catch (e) {
        console.error('[Dashboard] listConfirmEngines failed, fallback to no-engines', e);
      }
      try {
        let aCount = 0;
        let bCount = 0;
        let page = 1;
        const pageSize = 200;
        while (true) {
          const resp = await vulnApi.listCases({ page, page_size: pageSize });
          const items: any[] = resp?.items || [];
          for (const c of items) {
            const reporterName: string = c?.reporter?.name || c?.source_meta?.reporter?.name || '';
            if (reporterName && engineTools.has(reporterName)) {
              if (c?.finished_reason === 'vulnerable') aCount += 1;
            } else {
              bCount += 1;
            }
          }
          if (items.length < pageSize || page * pageSize >= (resp?.total || 0)) break;
          page += 1;
        }
        if (mounted) setVulnSuspect(aCount + bCount);
      } catch (e) {
        console.error('[Dashboard] listCases failed', e);
        if (mounted) setVulnSuspect(null);
      } finally {
        if (mounted) setVulnSuspectLoading(false);
      }
    };
    void loadStats();
    return () => {
      mounted = false;
    };
  }, [projects.length]);

  const localProjectsCount = (projects || []).length;
  const localAgentsTotal = (agents || []).length;
  const localAgentsOnline = (agents || []).filter((a) => a.status === 'online').length;

  const adminAgents = adminStats?.agents;
  const adminWorkflows = adminStats?.workflows;
  const adminResources = adminStats?.resources;
  const adminServices = adminStats?.services || [];

  const effectiveProjectsCount = adminStats?.projects?.total ?? localProjectsCount;
  const effectiveAgentsTotal = adminAgents?.total ?? localAgentsTotal;
  const effectiveAgentsOnline = adminAgents?.online ?? localAgentsOnline;

  const workflowTotal = adminWorkflows?.totalInstances ?? 0;
  const workflowEntries = Object.entries(adminWorkflows?.statusDistribution || {}).map(([status, count]) => ({
    status,
    count: Number(count || 0),
    ...pickWorkflowStyle(status),
  }));
  const workflowAppTemplates = adminWorkflows?.templates?.appTemplates ?? 0;
  const workflowJobTemplates = adminWorkflows?.templates?.jobTemplates ?? 0;
  const workflowTemplateCount = workflowAppTemplates + workflowJobTemplates;

  const servicesByStatus = new Map<string, number>();
  adminServices.forEach((svc) => {
    servicesByStatus.set(svc.status, (servicesByStatus.get(svc.status) || 0) + 1);
  });
  const serviceEntries: Array<{ status: string; count: number }> = [];
  SERVICE_STATUS_ORDER.forEach((status) => {
    const count = servicesByStatus.get(status) || 0;
    if (count > 0) serviceEntries.push({ status, count });
  });
  Array.from(servicesByStatus.entries()).forEach(([status, count]) => {
    if (!SERVICE_STATUS_ORDER.includes(status) && count > 0) {
      serviceEntries.push({ status, count });
    }
  });
  const serviceTotal = adminServices.length;
  const serviceHealthy = servicesByStatus.get('healthy') || 0;

  const pvcTotal = adminResources?.totalPvcs ?? 0;
  const storageGi = adminResources?.totalStorageGi ?? 0;
  const storageHuman =
    storageGi >= 1024 ?`${(storageGi / 1024).toFixed(2)} Ti` :`${storageGi.toFixed(0)} Gi`;
  const resourceStatusEntries = Object.entries(adminResources?.statusCounts || {}).map(([status, count]) => ({
    status,
    count: Number(count || 0),
  }));
  const resourceStatusTotal = resourceStatusEntries.reduce((sum, e) => sum + e.count, 0);

  const pkgTotal = packageStats?.summary?.total_packages ?? (staticPackages || []).length;
  const pkgSize = packageStats?.summary?.total_size_human ?? '--';
  const pkgDownloads = packageStats?.summary?.total_downloads ?? 0;
  const archEntries = (packageStats?.by_architecture || [])
    .map((a) => ({ arch: a.architecture, count: a.package_count }))
    .sort((a, b) => b.count - a.count);
  const archTotal = archEntries.reduce((sum, a) => sum + a.count, 0);

  const topProviders = [...providerStats]
    .filter((p) => p && typeof p.request_count === 'number')
    .sort((a, b) => (b.request_count || 0) - (a.request_count || 0))
    .slice(0, 6);
  const totalProviderRequests = providerStats.reduce((sum, p) => sum + (p.request_count || 0), 0);

  const adminUnavailable = !adminStats && !adminStatsLoading;

  return (
    <div
      className="min-h-full px-5 py-5 md:px-6 2xl:px-8"
      style={{ backgroundColor: LK.canvas, color: LK.inkSoft }}
    >
      <div className="mx-auto w-full max-w-[1600px] space-y-4">
        <PageHeader
          title={<div className="flex flex-col gap-1"><span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium" style={{ backgroundColor: LK.primaryMuted, color: LK.primary }}><BarChart3 size={13} /> 平台结果看板</span><span>Chimera 平台结果看板</span></div>}
          description="汇总各模块的结果性数据：交付范围、节点状态、工作流执行、服务健康、资源占用与 AI 网关调用。"
          actions={
          <button
            type="button"
            onClick={() => setCurrentView('aigw-dashboard')}
            className="btn btn-primary"
          >
            AI 网关详情 <ArrowUpRight size={16} />
          </button>
        }
        />

        <section className="grid grid-cols-3 gap-3">
          {[
            { label: '项目', value: projects.length, icon: Building2, color: LK.primary },
            { label: '任务', value: taskCount !== null ? taskCount : '-', icon: Layers, color: LK.success },
            { label: '环境', value: envCount !== null ? envCount : '-', icon: Server, color: LK.warning },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex items-center justify-between rounded-xl px-4 py-3"
              style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
            >
              <div>
                <div className="text-xs" style={{ color: LK.muted }}>
                  {stat.label}
                </div>
                <div className="mt-1 text-2xl font-semibold leading-7 tabular-nums" style={{ color: stat.color }}>
                  {stat.value}
                </div>
              </div>
              <div
                className="flex h-9 w-9 items-center justify-center rounded-md"
                style={{ backgroundColor: `${stat.color}22`, color: stat.color }}
              >
                <stat.icon size={18} />
              </div>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-4 gap-3">
          {[
            { label: '系统中总的任务', value: taskCount !== null ? taskCount : '-', icon: ListChecks, color: LK.primary },
            { label: '排队中任务', value: taskQueued !== null ? taskQueued : '-', icon: Clock, color: LK.warning },
            { label: '运行中的任务', value: taskRunning !== null ? taskRunning : '-', icon: Loader, color: LK.info },
            { label: '失败的任务', value: taskFailed !== null ? taskFailed : '-', icon: XCircle, color: LK.error },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex items-center justify-between rounded-xl px-4 py-3"
              style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
            >
              <div>
                <div className="text-xs" style={{ color: LK.muted }}>
                  {stat.label}
                </div>
                <div className="mt-1 text-2xl font-semibold leading-7 tabular-nums" style={{ color: stat.color }}>
                  {stat.value}
                </div>
              </div>
              <div
                className="flex h-9 w-9 items-center justify-center rounded-md"
                style={{ backgroundColor: `${stat.color}22`, color: stat.color }}
              >
                <stat.icon size={18} />
              </div>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-4 gap-3">
          {[
            {
              label: '告警总数',
              value: vulnTotal !== null ? vulnTotal : '-',
              icon: Bug,
              color: LK.primary,
              algorithm: '漏洞中心接收到的全部 case 数量，包含所有阶段（receive / triage / validation / finished）。',
              onClick: undefined,
            },
            {
              label: '疑似漏洞',
              value: vulnSuspectLoading ? '加载中' : (vulnSuspect !== null ? vulnSuspect : '-'),
              icon: CheckCircle2,
              color: LK.primaryDeep,
              algorithm: 'A + B\n\nA：上报工具（reporter.name）被任一漏洞确认引擎的 bind_tools 包含，且 finished_reason="vulnerable" 的 case 数。\nB：上报工具未被任何引擎 bind_tools 包含的全部 case 数（任意阶段都计入）。',
              onClick: () => setSuspectBreakdownOpen(true),
            },
            {
              label: '确认是漏洞',
              value: vulnConfirmed !== null ? vulnConfirmed : '-',
              icon: AlertTriangle,
              color: LK.error,
              algorithm: '经过人工终审且判定为漏洞的 case 数。\n\n人工终审指 StageHistory 中存在 to_stage="finished" 且 source_type="human" 的记录；判定取 finished_reason="vulnerable"。',
              onClick: undefined,
            },
            {
              label: '确认非漏洞',
              value: vulnRuledOut !== null ? vulnRuledOut : '-',
              icon: ShieldCheck,
              color: LK.success,
              algorithm: '经过人工终审且判定为非漏洞的 case 数。\n\n人工终审指 StageHistory 中存在 to_stage="finished" 且 source_type="human" 的记录；判定取 finished_reason="not_vulnerable"。',
              onClick: undefined,
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`flex flex-col rounded-xl px-3 py-3 relative${stat.onClick ? ' cursor-pointer transition-colors' : ''}`}
              style={{
                backgroundColor: LK.surface,
                border: `1px solid ${stat.onClick && suspectCardHover ? LK.primarySoft : LK.border}`,
              }}
              onClick={stat.onClick}
              role={stat.onClick ? 'button' : undefined}
              tabIndex={stat.onClick ? 0 : undefined}
              onMouseEnter={stat.onClick ? () => setSuspectCardHover(true) : undefined}
              onMouseLeave={stat.onClick ? () => setSuspectCardHover(false) : undefined}
              onKeyDown={
                stat.onClick
                  ? (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        stat.onClick?.();
                      }
                    }
                  : undefined
              }
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <span className="text-[11px]" style={{ color: LK.muted }}>
                    {stat.label}
                  </span>
                  <button
                    type="button"
                    onMouseEnter={() => setAlgoHover(stat.label)}
                    onMouseLeave={() => setAlgoHover(null)}
                    className="p-0.5 rounded transition-colors hover:bg-white/5"
                    style={{ color: LK.mutedSoft }}
                    aria-label="查看统计算法"
                  >
                    <HelpCircle size={11} />
                  </button>
                </div>
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-md"
                  style={{ backgroundColor: `${stat.color}22`, color: stat.color }}
                >
                  <stat.icon size={14} />
                </div>
              </div>
              <div className="mt-2 text-2xl font-semibold leading-7 tabular-nums" style={{ color: stat.color }}>
                {stat.value}
              </div>
              {algoHover === stat.label && (
                <div
                  className="absolute z-50 top-full right-0 mt-1 p-3 rounded-lg max-w-[300px] shadow-xl"
                  style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}` }}
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: LK.mutedSoft }}>
                    统计算法
                  </div>
                  <div className="text-[11px] leading-relaxed whitespace-pre-line" style={{ color: LK.body }}>
                    {stat.algorithm}
                  </div>
                </div>
              )}
            </div>
          ))}
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            icon={Briefcase}
            accent={LK.primary}
            value={formatNumber(effectiveProjectsCount)}
            label="项目空间"
            caption="平台纳管交付范围"
            onClick={() => setCurrentView('project-mgmt')}
          />
          <KpiCard
            icon={Monitor}
            accent={LK.success}
            value={
              <>
                {formatNumber(effectiveAgentsOnline)}
                <span className="ml-1 text-base font-medium" style={{ color: LK.muted }}>
                  / {formatNumber(effectiveAgentsTotal)}
                </span>
              </>
            }
            label="执行节点"
            caption="在线 / 注册"
            onClick={() => setCurrentView('env-agent')}
          />
          <KpiCard
            icon={Workflow}
            accent={LK.info}
            value={formatNumber(workflowTotal)}
            label="工作流实例"
            caption={`App+Job 模板 ${workflowTemplateCount} 套`}
            onClick={() => setCurrentView('workflow-instances')}
          />
          <KpiCard
            icon={Package}
            accent={LK.primarySoft}
            value={formatNumber(pkgTotal)}
            label="静态资产"
            caption={`总大小 ${pkgSize}`}
            onClick={() => setCurrentView('static-packages')}
          />
          <KpiCard
            icon={Activity}
            accent={LK.success}
            value={
              serviceTotal === 0 ? (
                <span style={{ color: LK.muted }}>--</span>
              ) : (
                <>
                  {formatNumber(serviceHealthy)}
                  <span className="ml-1 text-base font-medium" style={{ color: LK.muted }}>
                    / {formatNumber(serviceTotal)}
                  </span>
                </>
              )
            }
            label="服务健康度"
            caption="healthy / 全部"
            onClick={() => setCurrentView('admin-dashboard')}
          />
          <KpiCard
            icon={HardDrive}
            accent={LK.warning}
            value={
              <>
                {formatNumber(pvcTotal)}
                <span className="ml-1 text-base font-medium" style={{ color: LK.muted }}>
                  PVC
                </span>
              </>
            }
            label="资源池"
            caption={`总存储 ${storageHuman}`}
            onClick={() => setCurrentView('public-resource-pvc-management')}
          />
        </section>

        <div className="grid gap-4 xl:grid-cols-2">
          <CardShell title="工作流执行结果" subtitle={`实例总数 ${formatNumber(workflowTotal)}`}>
            {adminUnavailable ? (
              <Placeholder text="需要管理员权限查看" />
            ) : workflowEntries.length === 0 ? (
              <Placeholder text={adminStatsLoading ? '加载中...' : '暂无工作流实例'} />
            ) : (
              <>
                <div className="flex h-2.5 overflow-hidden rounded-full" style={{ backgroundColor: LK.surfaceRaised }}>
                  {workflowEntries.map((entry) => (
                    <div
                      key={entry.status}
                      style={{
                        width: `${workflowTotal > 0 ? (entry.count / workflowTotal) * 100 : 0}%`,
                        backgroundColor: entry.color,
                      }}
                      title={`${entry.label} ${entry.count}`}
                    />
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {workflowEntries.map((entry) => (
                    <div
                      key={entry.status}
                      className="flex items-center justify-between rounded-[10px] px-3 py-2 text-xs"
                      style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.borderSoft}` }}
                    >
                      <span className="inline-flex items-center gap-2" style={{ color: LK.body }}>
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                        {entry.label}
                      </span>
                      <span className="font-semibold tabular-nums" style={{ color: LK.inkSoft }}>
                        {formatNumber(entry.count)}
                        <span className="ml-1" style={{ color: LK.muted }}>
                          {workflowTotal > 0 ?`${((entry.count / workflowTotal) * 100).toFixed(0)}%` : ''}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 text-xs" style={{ borderTop:`1px solid ${LK.borderSoft}`, color: LK.muted }}>
                  App 模板 {formatNumber(workflowAppTemplates)} 套 · Job 模板 {formatNumber(workflowJobTemplates)} 套
                </div>
              </>
            )}
          </CardShell>

          <CardShell title="服务健康" subtitle={`注册服务 ${formatNumber(serviceTotal)}`}>
            {adminUnavailable ? (
              <Placeholder text="需要管理员权限查看" />
            ) : serviceEntries.length === 0 ? (
              <Placeholder text={adminStatsLoading ? '加载中...' : '暂无注册服务'} />
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {serviceEntries.map((entry) => {
                  const meta = pickServiceMeta(entry.status);
                  return (
                    <div
                      key={entry.status}
                      className="rounded-[10px] px-3 py-3"
                      style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.borderSoft}` }}
                    >
                      <div className="inline-flex items-center gap-2 text-xs" style={{ color: meta.color }}>
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
                        {meta.label}
                      </div>
                      <div className="mt-2 flex items-baseline gap-1">
                        <span className="text-xl font-semibold tabular-nums" style={{ color: LK.ink }}>
                          {formatNumber(entry.count)}
                        </span>
                        <span className="text-xs" style={{ color: LK.muted }}>
                          {serviceTotal > 0 ?`${((entry.count / serviceTotal) * 100).toFixed(0)}%` : ''}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardShell>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <CardShell title="资源池" subtitle="PVC 与存储使用情况">
            {adminUnavailable ? (
              <Placeholder text="需要管理员权限查看" />
            ) : pvcTotal === 0 && storageGi === 0 ? (
              <Placeholder text={adminStatsLoading ? '加载中...' : '暂无 PVC 资源'} />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="PVC 总数" value={formatNumber(pvcTotal)} accent={LK.warning} />
                  <MiniStat label="总存储" value={storageHuman} accent={LK.warning} />
                </div>
                {resourceStatusEntries.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="text-xs font-medium" style={{ color: LK.mutedSoft }}>
                      PVC 状态分布
                    </div>
                    {resourceStatusEntries.slice(0, 5).map((entry) => (
                      <BarRow
                        key={entry.status}
                        label={entry.status}
                        count={entry.count}
                        total={resourceStatusTotal}
                        color={LK.warning}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </CardShell>

          <CardShell title="静态资产" subtitle="软件包库存与下载">
            {pkgTotal === 0 ? (
              <Placeholder text="暂无资产数据" />
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <MiniStat label="包总数" value={formatNumber(pkgTotal)} accent={LK.primarySoft} />
                  <MiniStat label="总大小" value={pkgSize} accent={LK.primarySoft} />
                  <MiniStat label="总下载" value={formatNumber(pkgDownloads)} accent={LK.primarySoft} />
                </div>
                {archEntries.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="text-xs font-medium" style={{ color: LK.mutedSoft }}>
                      架构分布
                    </div>
                    {archEntries.slice(0, 5).map((entry) => (
                      <BarRow
                        key={entry.arch}
                        label={entry.arch || '未知'}
                        count={entry.count}
                        total={archTotal}
                        color={LK.primary}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </CardShell>
        </div>

        <CardShell
          title="AI 网关调用结果"
          subtitle={`累计请求 ${formatNumber(totalProviderRequests)}`}
          right={
            <button
              type="button"
              onClick={() => setCurrentView('aigw-dashboard')}
              className="hidden items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors md:inline-flex"
              style={{ backgroundColor: LK.surfaceRaised, color: LK.body, border: `1px solid ${LK.border}` }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = LK.primarySoft;
                e.currentTarget.style.borderColor = LK.primary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = LK.body;
                e.currentTarget.style.borderColor = LK.border;
              }}
            >
              详情 <ArrowUpRight size={12} />
            </button>
          }
        >
          {providerStatsLoading ? (
            <Placeholder text="加载中..." />
          ) : topProviders.length === 0 ? (
            <Placeholder text="暂无调用记录" />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider" style={{ color: LK.mutedSoft }}>
                    <th className="px-3 py-2.5 font-medium" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>
                      模型 / 后端
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>
                      请求数
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>
                      平均响应
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>
                      成功率
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>
                      活跃并发
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topProviders.map((p, idx) => (
                    <tr key={`${p.model_name}-${idx}`}>
                      <td
                        className="px-3 py-2.5 font-medium"
                        style={{ borderBottom:`1px solid ${LK.borderSoft}`, color: LK.ink, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}
                      >
                        {p.model_name || '--'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ borderBottom:`1px solid ${LK.borderSoft}`, color: LK.body }}>
                        {formatNumber(p.request_count || 0)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ borderBottom:`1px solid ${LK.borderSoft}`, color: LK.body }}>
                        {formatMs(p.avg_response_time)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ borderBottom:`1px solid ${LK.borderSoft}`, color: LK.body }}>
                        {p.success_rate !== undefined && p.success_rate !== null
                          ? formatPercent(p.success_rate)
                          : '--'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ borderBottom:`1px solid ${LK.borderSoft}`, color: LK.body }}>
                        {formatNumber(p.active_requests || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardShell>
        <SuspectVulnTaskBreakdownDialog
          open={suspectBreakdownOpen}
          onClose={() => setSuspectBreakdownOpen(false)}
          projects={projects}
        />
      </div>
    </div>
  );
};