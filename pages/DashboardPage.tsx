import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock,
  HelpCircle,
  ListChecks,
  Loader,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { api } from '../clients/api';
import { DropdownSelect, PageHeader } from '../design-system';
import {
  AdminDashboardStats,
  Agent,
  Department,
  EnvTemplate,
  PackageStats,
  SecurityProject,
  StaticPackage,
} from '../types/types';
import { orgApi } from '../clients/org';

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

const LK = {
  primary: '#2563EB',
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
  success: '#30A46C',
  warning: '#D97706',
  error: '#DC2626',
  info: '#4f8cff',
} as const;

const TASK_TYPES: readonly { value: string; label: string }[] = [
  { value: 'binary_firmware_e2e', label: '盖亚-二进制固件' },
  { value: 'source_scan_e2e', label: '盖亚-源码' },
  { value: 'kg_source_vuln_scan_e2e', label: '知识图谱-漏洞挖掘' },
  { value: 'binary_module_e2e', label: '盖亚-二进制模块' },
  { value: 'ai4app_fast', label: 'AI4APP 扫描（快速）' },
  { value: 'ai4web_fast', label: 'AI4WEB 扫描（快速）' },
  { value: 'ai4app_deep', label: 'AI4APP 扫描（深度）' },
  { value: 'ai4web_deep', label: 'AI4WEB 扫描（深度）' },
  { value: 'ai4red', label: 'AI4RED 红线验证' },
  { value: 'sechps_tool', label: 'Agent Harness 任务' },
];

const getTaskTypeLabel = (t: string) => TASK_TYPES.find(i => i.value === t)?.label || t;
const getTaskHarnessLabel = (task: any) =>
  task.task_type === 'sechps_tool' ? (task.agent_app_name || 'Agent Harness') : getTaskTypeLabel(String(task.task_type || ''));
const getTaskTestObjectLabel = (task: any) => String(task.inputs?.[0]?.display_name || '').trim() || '—';
const getDisplayStatus = (task: any) => task.display_status || task.business_status || task.dispatch_status || task.create_status || 'unknown';

const TASK_STATUS_TO_LABEL: Record<string, string> = {
  success: '成功', partial_success: '成功', completed: '成功',
  failed: '失败',
  cancelled: '已取消',
  pending: '等待中', stopped: '等待中', queued: '等待中',
};
const getTaskStatusLabel = (task: any) => TASK_STATUS_TO_LABEL[getDisplayStatus(task)] ?? '运行中';
const TASK_STATUS_COLOR: Record<string, string> = {
  '等待中': LK.warning, '运行中': LK.info, '成功': LK.success, '失败': LK.error, '已取消': LK.muted,
};

const getCaseConclusion = (item: any): string => {
  const raw = String(item?.finished_reason || item?.validation_result || '').trim();
  if (raw === 'vulnerable' || raw === 'not_vulnerable') return raw;
  if (raw === 'non_vulnerable') return 'not_vulnerable';
  return '';
};
const CONCLUSION_TEXT: Record<string, string> = { vulnerable: '是漏洞', not_vulnerable: '不是漏洞' };
const conclusionLabel = (c: string) => c ? (CONCLUSION_TEXT[c] || c) : '—';
const conclusionClass = (c: string) => c === 'vulnerable' ? 'yes' : c === 'not_vulnerable' ? 'no' : 'pending';

const softBg = (color: string) => `color-mix(in srgb, ${color} 13%, transparent)`;

const formatNumber = (n: number) => {
  if (typeof n !== 'number' || Number.isNaN(n)) return '--';
  return n.toLocaleString('zh-CN');
};
const formatDateTime = (v?: string | null) => v ? new Date(v).toLocaleString('zh-CN') : '—';

type MetricKey = 'projects' | 'taskTotal' | 'taskQueued' | 'taskRunning' | 'taskFailed' | 'vulnSuspect' | 'vulnConfirmed' | 'vulnRuledOut';

const ALGO: Record<string, string> = {
  '疑似漏洞': 'A + B\n\nA：上报工具（reporter.name）被任一漏洞确认引擎的 bind_tools 包含，且 finished_reason="vulnerable" 的 case 数。\nB：上报工具未被任何引擎 bind_tools 包含的全部 case 数（任意阶段都计入）。',
  '确认是漏洞': '经过人工终审且判定为漏洞的 case 数。\n\n人工终审指 StageHistory 中存在 to_stage="finished" 且 source_type="human" 的记录；判定取 finished_reason="vulnerable"。',
  '确认非漏洞': '经过人工终审且判定为非漏洞的 case 数。\n\n人工终审指 StageHistory 中存在 to_stage="finished" 且 source_type="human" 的记录；判定取 finished_reason="not_vulnerable"。',
};

const SEVERITY_LABELS: Record<string, string> = { critical: '严重', high: '高危', medium: '中危', low: '低危' };
const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];
const SEVERITY_COLORS: Record<string, string> = { critical: LK.error, high: '#ff8b3d', medium: LK.warning, low: LK.success };

const DONUT_PALETTE = [
  '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e',
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
];

const tipEnter = (e: React.MouseEvent<HTMLElement>, text: string) => {
  const el = e.currentTarget;
  if (el.offsetWidth >= el.scrollWidth && el.offsetHeight >= el.scrollHeight) return;
  const tip = document.createElement('div');
  tip.textContent = text;
  tip.style.cssText = `position:fixed;z-index:9999;padding:6px 10px;border-radius:6px;font-size:12px;font-weight:500;line-height:1.5;white-space:normal;word-break:break-all;max-width:400px;background:var(--bg-elevated);color:var(--text-primary);border:1px solid var(--border-default);box-shadow:0 4px 16px rgba(0,0,0,.25);pointer-events:none;left:${e.clientX + 12}px;top:${e.clientY + 12}px;`;
  tip.id = 'dash-tip';
  document.body.appendChild(tip);
};
const tipMove = (e: React.MouseEvent) => {
  const tip = document.getElementById('dash-tip');
  if (tip) { tip.style.left = `${e.clientX + 12}px`; tip.style.top = `${e.clientY + 12}px`; }
};
const tipLeave = () => { document.getElementById('dash-tip')?.remove(); };

const SWR_TTL = 60_000;
const SWR_PREFIX = 'dash:swr:';
const swrGet = <T,>(key: string): T | null => {
  try {
    const raw = sessionStorage.getItem(SWR_PREFIX + key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > SWR_TTL) return null;
    return data as T;
  } catch { return null; }
};
const swrSet = (key: string, data: unknown) => {
  try { sessionStorage.setItem(SWR_PREFIX + key, JSON.stringify({ ts: Date.now(), data })); } catch { /* quota */ }
};

async function runWithConcurrency<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency = 6,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      try { results[idx] = { status: 'fulfilled', value: await fn(items[idx], idx) }; }
      catch (e) { results[idx] = { status: 'rejected', reason: e }; }
    }
  });
  await Promise.all(workers);
  return results;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  projects,
  setCurrentView,
}) => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null);
  const [selectedSubDeptId, setSelectedSubDeptId] = useState<number | null>(null);
  const [curMetric, setCurMetric] = useState<MetricKey>('projects');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [taskCount, setTaskCount] = useState<number | null>(null);
  const [taskQueued, setTaskQueued] = useState<number | null>(null);
  const [taskRunning, setTaskRunning] = useState<number | null>(null);
  const [taskFailed, setTaskFailed] = useState<number | null>(null);
  const [vulnSuspectLoading, setVulnSuspectLoading] = useState(true);
  const [vulnConfirmed, setVulnConfirmed] = useState<number | null>(null);
  const [vulnRuledOut, setVulnRuledOut] = useState<number | null>(null);
  const [algoHover, setAlgoHover] = useState<string | null>(null);

  const [taskItems, setTaskItems] = useState<any[]>([]);
  const [allCases, setAllCases] = useState<any[]>([]);
  const [perProjectTaskStats, setPerProjectTaskStats] = useState<Record<string, any>>({});
  const [stageCountsAgg, setStageCountsAgg] = useState<Record<string, number>>({});
  const [severityCountsAgg, setSeverityCountsAgg] = useState<Record<string, number>>({});
  const [statsLoading, setStatsLoading] = useState(true);
  const [engineTools, setEngineTools] = useState<Set<string>>(new Set());

  const taskCacheRef = useRef<Map<string, { stats: any; items: any[]; ts: number }>>(new Map());
  const overviewCacheRef = useRef<Map<string, { data: any; ts: number }>>(new Map());

  const getReporterName = (item: any) => String(item?.reporter?.name || '').trim();
  const hasConfiguredConfirmEngine = (item: any, tools: Set<string>) => {
    const name = getReporterName(item);
    return !!name && tools.has(name);
  };
  const isHumanFinishedCase = (item: any) => item?.is_human_finished === true;
  const getEffectiveResult = (item: any) => String(item?.finished_reason || item?.validation_result || '').trim();
  const shouldEnterVulnCenter = (item: any, tools: Set<string>) => {
    if (item?.engine_confirmed_vulnerable === true) return true;
    if (isHumanFinishedCase(item)) return true;
    return !hasConfiguredConfirmEngine(item, tools);
  };
  const matchesSuspect = (item: any, tools: Set<string>) => {
    if (isHumanFinishedCase(item)) return true;
    if (hasConfiguredConfirmEngine(item, tools)) return getEffectiveResult(item) === 'vulnerable';
    return true;
  };

  useEffect(() => {
    orgApi.listDepartments()
      .then((data) => setDepartments(data || []))
      .catch((e) => console.error('Failed to fetch departments', e));
  }, []);

  useEffect(() => {
    setSelectedSubDeptId(null);
  }, [selectedDepartmentId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [curMetric, selectedDepartmentId, selectedSubDeptId]);

  const rootDepartments = useMemo(() => departments.filter(d => !d.parent_id), [departments]);
  const subDepartments = useMemo(() => {
    if (!selectedDepartmentId) return [];
    return departments.filter(d => d.parent_id === selectedDepartmentId);
  }, [selectedDepartmentId, departments]);
  const selectedDeptIds = useMemo(() => {
    const rootId = selectedSubDeptId ?? selectedDepartmentId;
    if (!rootId) return null;
    const ids = new Set<number>([rootId]);
    const walk = (parentId: number) => {
      departments.filter(d => d.parent_id === parentId).forEach(d => { ids.add(d.id); walk(d.id); });
    };
    walk(rootId);
    return ids;
  }, [selectedDepartmentId, selectedSubDeptId, departments]);
  const filteredProjects = useMemo(() => {
    if (!selectedDeptIds) return projects;
    return projects.filter(p => p.department_id != null && selectedDeptIds.has(p.department_id));
  }, [projects, selectedDeptIds]);

  const filteredProjectIdSet = useMemo(() => new Set(filteredProjects.map(p => p.id)), [filteredProjects]);

  const deptName = useMemo(() => {
    if (selectedSubDeptId) return departments.find(d => d.id === selectedSubDeptId)?.name || '全部部门';
    if (selectedDepartmentId) return departments.find(d => d.id === selectedDepartmentId)?.name || '全部部门';
    return '全部部门';
  }, [selectedDepartmentId, selectedSubDeptId, departments]);

  const projectById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);

  const taskNameById = useMemo(() => new Map(taskItems.map(t => [t.id || t.task_id, t.name?.trim() || t.id || t.task_id])), [taskItems]);

  const dashGetTaskName = (item: any) => {
    const taskId = String(item?.source_task_id || item?.display_summary?.source_task?.task_id || item?.source_task?.task_id || '').trim();
    return taskId ? (taskNameById.get(taskId) || taskId) : '未提供';
  };

  // ── 全局数据：cases + engines（只加载一次，SWR模式）──
  useEffect(() => {
    let mounted = true;
    const vulnApi = api.domains.vuln.vuln;

    // SWR: 先从 sessionStorage 恢复
    const cachedCases = swrGet<any[]>('cases');
    const cachedTools = swrGet<string[]>('engineTools');
    if (cachedCases) setAllCases(cachedCases);
    if (cachedTools && cachedTools.length >= 0) setEngineTools(new Set(cachedTools));
    if (cachedCases && cachedTools) setVulnSuspectLoading(false);

    const loadGlobal = async () => {
      if (mounted && !cachedCases) setVulnSuspectLoading(true);

      const enginesPromise = vulnApi.listConfirmEngines().catch(() => ({ engines: [] }));
      const casesPromise = (async () => {
        const cachedTotal = swrGet<number>('casesTotal');
        if (cachedTotal) {
          const pages = Math.ceil(cachedTotal / 200);
          const allBatches = await runWithConcurrency(
            Array.from({ length: pages }, (_, i) => i + 1),
            (pg) => vulnApi.listCases({ page: pg, page_size: 200 }),
            6,
          );
          const allItems: any[] = [];
          allBatches.forEach(r => { if (r.status === 'fulfilled' && r.value?.items) allItems.push(...r.value.items); });
          return allItems;
        }
        const first = await vulnApi.listCases({ page: 1, page_size: 200 });
        const total = Number(first?.total || 0);
        swrSet('casesTotal', total);
        const allItems: any[] = [...(first?.items || [])];
        const pages = Math.ceil(total / 200);
        if (pages > 1) {
          const rest = await runWithConcurrency(
            Array.from({ length: pages - 1 }, (_, i) => i + 2),
            (pg) => vulnApi.listCases({ page: pg, page_size: 200 }),
            6,
          );
          rest.forEach(r => { if (r.status === 'fulfilled' && r.value?.items) allItems.push(...r.value.items); });
        }
        return allItems;
      })().catch(() => []);

      const [enginesRes, casesItems] = await Promise.all([enginesPromise, casesPromise]);
      if (!mounted) return;

      const tools = new Set<string>();
      (enginesRes?.engines || []).forEach((eng: any) => {
        (eng?.bind_tools || []).forEach((t: string) => tools.add(t));
      });
      setEngineTools(tools);
      setAllCases(casesItems);
      setVulnSuspectLoading(false);

      swrSet('engineTools', Array.from(tools));
      swrSet('cases', casesItems);
    };
    void loadGlobal();
    return () => { mounted = false; };
  }, []);

  // ── 按项目数据：tasks + overviews（随部门筛选变化，带缓存+并发控制）──
  useEffect(() => {
    let mounted = true;
    const scheduleApi = api.domains.platform.scheduleCenter;
    const vulnApi = api.domains.vuln.vuln;

    const loadPerProject = async () => {
      if (mounted) setStatsLoading(true);

      const isGlobal = !selectedDeptIds;
      const projectIds = filteredProjects.map(p => p.id);
      const now = Date.now();

      // SWR: 先从缓存恢复已缓存的项目数据
      const cachedTaskResults: Record<string, { stats: any; items: any[] }> = {};
      const cachedOverviewResults: Record<string, any> = {};
      for (const pid of projectIds) {
        const tc = taskCacheRef.current.get(pid);
        if (tc && now - tc.ts < SWR_TTL) cachedTaskResults[pid] = { stats: tc.stats, items: tc.items };
        const oc = overviewCacheRef.current.get(pid);
        if (oc && now - oc.ts < SWR_TTL) cachedOverviewResults[pid] = oc.data;
      }

      // 确定需要拉取的项目
      const tasksToFetch = projectIds.filter(pid => !cachedTaskResults[pid]);
      const overviewsToFetch = isGlobal ? [] : projectIds.filter(pid => !cachedOverviewResults[pid]);

      // 并发控制：分批拉取
      const [taskResults, overviewResults] = await Promise.all([
        runWithConcurrency(tasksToFetch, (pid) => scheduleApi.listUserTasks(pid, { page_size: 200 }), 6),
        isGlobal
          ? Promise.resolve([] as PromiseSettledResult<any>[])
          : runWithConcurrency(overviewsToFetch, (pid) => vulnApi.getOverview(pid), 6),
      ]);

      if (!mounted) return;

      // 合并缓存 + 新数据
      taskResults.forEach((res, i) => {
        if (res.status !== 'fulfilled' || !res.value) return;
        const pid = tasksToFetch[i];
        const stats = res.value.stats || {};
        const items = res.value.items || [];
        cachedTaskResults[pid] = { stats, items };
        taskCacheRef.current.set(pid, { stats, items, ts: now });
        swrSet('task:' + pid, { stats, items });
      });

      if (!isGlobal) {
        overviewResults.forEach((res, i) => {
          if (res.status !== 'fulfilled' || !res.value) return;
          const pid = overviewsToFetch[i];
          cachedOverviewResults[pid] = res.value;
          overviewCacheRef.current.set(pid, { data: res.value, ts: now });
          swrSet('overview:' + pid, res.value);
        });
      }

      // 全局 overview（1次调用替代N次）
      let globalOverview: any = null;
      if (isGlobal) {
        const cachedGlobalOv = swrGet<any>('globalOverview');
        if (cachedGlobalOv) globalOverview = cachedGlobalOv;
        try {
          globalOverview = await vulnApi.getOverview();
          swrSet('globalOverview', globalOverview);
        } catch { /* keep cached or null */ }
        if (!mounted) return;
      }

      // 聚合任务数据
      let taskTotalSum = 0, taskQueuedSum = 0, taskRunningSum = 0, taskFailedSum = 0;
      let anyTaskOk = false;
      const allTaskItems: any[] = [];
      const pStats: Record<string, any> = {};

      for (const pid of projectIds) {
        const tr = cachedTaskResults[pid];
        if (!tr) continue;
        anyTaskOk = true;
        pStats[pid] = tr.stats;
        taskTotalSum += Number(tr.stats.total || 0);
        taskQueuedSum += Number(tr.stats.queued ?? tr.stats.pending ?? 0);
        taskRunningSum += Number(tr.stats.running || 0);
        taskFailedSum += Number(tr.stats.failed || 0);
        allTaskItems.push(...tr.items);
      }

      setTaskCount(anyTaskOk ? taskTotalSum : null);
      setTaskQueued(anyTaskOk ? taskQueuedSum : null);
      setTaskRunning(anyTaskOk ? taskRunningSum : null);
      setTaskFailed(anyTaskOk ? taskFailedSum : null);
      setTaskItems(allTaskItems);
      setPerProjectTaskStats(pStats);

      // 聚合 overview 数据
      let confirmedSum = 0, ruledOutSum = 0;
      let anyOverviewOk = false;
      const sAgg: Record<string, number> = {};
      const sevAgg: Record<string, number> = {};

      if (isGlobal && globalOverview) {
        anyOverviewOk = true;
        confirmedSum = Number(globalOverview?.human_finished_reason_counts?.vulnerable || 0);
        ruledOutSum = Number(globalOverview?.human_finished_reason_counts?.not_vulnerable || 0);
        const sc = globalOverview?.stage_counts || {};
        for (const [k, v] of Object.entries(sc)) sAgg[k] = Number(v || 0);
        const sevc = globalOverview?.severity_counts || {};
        for (const [k, v] of Object.entries(sevc)) sevAgg[k] = Number(v || 0);
      } else {
        for (const pid of projectIds) {
          const ov = cachedOverviewResults[pid];
          if (!ov) continue;
          anyOverviewOk = true;
          confirmedSum += Number(ov?.human_finished_reason_counts?.vulnerable || 0);
          ruledOutSum += Number(ov?.human_finished_reason_counts?.not_vulnerable || 0);
          const sc = ov?.stage_counts || {};
          for (const [k, v] of Object.entries(sc)) sAgg[k] = (sAgg[k] || 0) + Number(v || 0);
          const sevc = ov?.severity_counts || {};
          for (const [k, v] of Object.entries(sevc)) sevAgg[k] = (sevAgg[k] || 0) + Number(v || 0);
        }
      }

      setVulnConfirmed(anyOverviewOk ? confirmedSum : null);
      setVulnRuledOut(anyOverviewOk ? ruledOutSum : null);
      setStageCountsAgg(sAgg);
      setSeverityCountsAgg(sevAgg);
      setStatsLoading(false);
    };
    void loadPerProject();
    return () => { mounted = false; };
  }, [filteredProjects]);

  // ── 客户端部门筛选（即时，无API调用）──
  const caseItems = useMemo(() => {
    if (!selectedDeptIds) return allCases;
    return allCases.filter(c => filteredProjectIdSet.has(c?.project_id));
  }, [allCases, selectedDeptIds, filteredProjectIdSet]);

  const vulnSuspect = useMemo<number | null>(() => {
    if (vulnSuspectLoading) return null;
    return caseItems.filter(c => shouldEnterVulnCenter(c, engineTools) && matchesSuspect(c, engineTools)).length;
  }, [caseItems, engineTools, vulnSuspectLoading]);

  const cardValues: Record<MetricKey, number | null> = useMemo(() => ({
    projects: filteredProjects.length,
    taskTotal: taskCount,
    taskQueued: taskQueued,
    taskRunning: taskRunning,
    taskFailed: taskFailed,
    vulnSuspect: vulnSuspect,
    vulnConfirmed: vulnConfirmed,
    vulnRuledOut: vulnRuledOut,
  }), [filteredProjects, taskCount, taskQueued, taskRunning, taskFailed, vulnSuspect, vulnConfirmed, vulnRuledOut]);

  const taskStatusAgg = useMemo(() => {
    const agg: Record<string, number> = { '等待中': 0, '运行中': 0, '成功': 0, '失败': 0, '已取消': 0 };
    taskItems.forEach(t => {
      const label = getTaskStatusLabel(t);
      agg[label] = (agg[label] || 0) + 1;
    });
    return Object.entries(agg)
      .filter(([, c]) => c > 0)
      .map(([name, count]) => ({ name, count, color: TASK_STATUS_COLOR[name] || LK.primary }));
  }, [taskItems]);

  const taskStatusAggFromStats = useMemo(() => {
    const agg: Record<string, number> = { '等待中': 0, '运行中': 0, '成功': 0, '失败': 0, '已取消': 0 };
    for (const stats of Object.values(perProjectTaskStats)) {
      agg['等待中'] += Number(stats.queued ?? stats.pending ?? 0);
      agg['运行中'] += Number(stats.running ?? 0);
      agg['成功'] += Number(stats.success ?? 0);
      agg['失败'] += Number(stats.failed ?? 0);
      agg['已取消'] += Number(stats.cancelled ?? 0);
    }
    return Object.entries(agg)
      .filter(([, c]) => c > 0)
      .map(([name, count]) => ({ name, count, color: TASK_STATUS_COLOR[name] || LK.primary }));
  }, [perProjectTaskStats]);

  const reporterAgg = useMemo(() => {
    const m = new Map<string, number>();
    caseItems.forEach(c => {
      const reporterName = c?.reporter?.name || c?.source_meta?.reporter?.name || 'unknown';
      if (shouldEnterVulnCenter(c, engineTools) && matchesSuspect(c, engineTools)) {
        m.set(reporterName, (m.get(reporterName) || 0) + 1);
      }
    });
    return Array.from(m.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [caseItems, engineTools]);

  const projectTaskRows = useMemo(() => {
    const rows = filteredProjects.map(p => {
      const stats = perProjectTaskStats[p.id] || {};
      return {
        project: p,
        total: Number(stats.total || 0),
        queued: Number(stats.queued ?? stats.pending ?? 0),
        running: Number(stats.running || 0),
        failed: Number(stats.failed || 0),
      };
    });
    rows.sort((a, b) => b.total - a.total);
    return rows;
  }, [filteredProjects, perProjectTaskStats]);

  const filteredTaskItems = useMemo(() => {
    const m = curMetric;
    let items = [...taskItems];
    if (m === 'taskQueued') items = items.filter(t => ['pending', 'queued', 'stopped'].includes(getDisplayStatus(t)));
    else if (m === 'taskRunning') items = items.filter(t => getDisplayStatus(t) === 'running');
    else if (m === 'taskFailed') items = items.filter(t => getDisplayStatus(t) === 'failed');
    items.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    return items;
  }, [taskItems, curMetric]);

  const filteredCaseItems = useMemo(() => {
    const m = curMetric;
    let items = [...caseItems];
    if (m === 'vulnConfirmed') items = items.filter(c => c?.is_human_finished === true && getCaseConclusion(c) === 'vulnerable');
    else if (m === 'vulnRuledOut') items = items.filter(c => c?.is_human_finished === true && getCaseConclusion(c) === 'not_vulnerable');
    else if (m === 'vulnSuspect') items = items.filter(c => shouldEnterVulnCenter(c, engineTools) && matchesSuspect(c, engineTools));
    items.sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''));
    return items;
  }, [caseItems, curMetric]);

  const panelRows = useMemo(() => {
    if (curMetric === 'projects') return projectTaskRows;
    if (curMetric === 'vulnSuspect' || curMetric === 'vulnConfirmed' || curMetric === 'vulnRuledOut') return filteredCaseItems;
    return filteredTaskItems;
  }, [curMetric, projectTaskRows, filteredCaseItems, filteredTaskItems]);

  const totalRows = panelRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const normalizedPage = Math.min(currentPage, totalPages);
  const pagedRows = useMemo(
    () => panelRows.slice((normalizedPage - 1) * pageSize, normalizedPage * pageSize),
    [panelRows, normalizedPage, pageSize],
  );

  const distItems = useMemo(() => {
    const m = curMetric;
    if (m === 'projects' || m === 'taskTotal') return taskStatusAggFromStats;
    if (m === 'vulnSuspect') {
      return reporterAgg.map(r => ({ name: r.name, count: r.count, color: LK.primaryDeep }));
    }
    if (m === 'vulnConfirmed') {
      const sevAgg: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
      filteredCaseItems.forEach(c => {
        const s = String(c?.severity || '').trim().toLowerCase();
        if (s && sevAgg.hasOwnProperty(s)) sevAgg[s] += 1;
      });
      return SEVERITY_ORDER.map(sev => ({
        name: SEVERITY_LABELS[sev] || sev,
        count: sevAgg[sev] || 0,
        color: SEVERITY_COLORS[sev] || LK.primary,
      })).filter(i => i.count > 0);
    }
    return [];
  }, [curMetric, taskStatusAggFromStats, reporterAgg, severityCountsAgg]);

  const dist2Items = useMemo(() => {
    const m = curMetric;
    if (m === 'vulnConfirmed') {
      const agg = new Map<string, number>();
      filteredCaseItems.forEach(c => {
        const cat = String(c?.confirmed_category || '').trim();
        if (cat) agg.set(cat, (agg.get(cat) || 0) + 1);
      });
      return Array.from(agg.entries())
        .map(([name, count], i) => ({ name, count, color: DONUT_PALETTE[i % DONUT_PALETTE.length] }))
        .sort((a, b) => b.count - a.count);
    }
    if (m === 'vulnRuledOut') {
      const agg = new Map<string, number>();
      filteredCaseItems.forEach(c => {
        const reason = String(c?.false_positive_reason || '').trim();
        if (reason) agg.set(reason, (agg.get(reason) || 0) + 1);
      });
      return Array.from(agg.entries())
        .map(([name, count], i) => ({ name, count, color: DONUT_PALETTE[i % DONUT_PALETTE.length] }))
        .sort((a, b) => b.count - a.count);
    }
    return [];
  }, [curMetric, filteredCaseItems]);

  const panelTitle = useMemo(() => {
    const m = curMetric;
    if (m === 'projects') return '项目';
    if (m === 'taskTotal') return '系统中总的任务';
    if (m === 'taskQueued') return '排队中任务';
    if (m === 'taskRunning') return '运行中的任务';
    if (m === 'taskFailed') return '失败的任务';
    if (m === 'vulnSuspect') return '疑似漏洞';
    if (m === 'vulnConfirmed') return '确认是漏洞';
    if (m === 'vulnRuledOut') return '确认非漏洞';
    return '—';
  }, [curMetric]);

  const panelSub = useMemo(() => {
    const m = curMetric;
    const val = cardValues[m];
    const vStr = val !== null ? formatNumber(val) : '—';
    if (m === 'projects') return `${deptName} · 共 ${vStr} 个项目`;
    if (m === 'taskTotal' || m === 'taskQueued' || m === 'taskRunning' || m === 'taskFailed') {
      return `${deptName} · 共 ${vStr} 个任务`;
    }
    if (m === 'vulnSuspect' || m === 'vulnConfirmed' || m === 'vulnRuledOut') {
      return `${deptName} · 累计 ${vStr} 条`;
    }
    return '';
  }, [curMetric, cardValues, deptName]);

  const handleMetricClick = useCallback((m: MetricKey) => {
    setCurMetric(m);
  }, []);

  const row1 = useMemo(() => [
    { label: '项目', metric: 'projects' as MetricKey, Icon: Building2, color: LK.primary, algo: '' },
    { label: '疑似漏洞', metric: 'vulnSuspect' as MetricKey, Icon: CheckCircle2, color: LK.primaryDeep, algo: ALGO['疑似漏洞'] },
    { label: '确认是漏洞', metric: 'vulnConfirmed' as MetricKey, Icon: AlertTriangle, color: LK.error, algo: ALGO['确认是漏洞'] },
    { label: '确认非漏洞', metric: 'vulnRuledOut' as MetricKey, Icon: ShieldCheck, color: LK.success, algo: ALGO['确认非漏洞'] },
  ], []);

  const row2 = useMemo(() => [
    { label: '系统中总的任务', metric: 'taskTotal' as MetricKey, Icon: ListChecks, color: LK.primary, algo: '' },
    { label: '排队中任务', metric: 'taskQueued' as MetricKey, Icon: Clock, color: LK.warning, algo: '' },
    { label: '运行中的任务', metric: 'taskRunning' as MetricKey, Icon: Loader, color: LK.info, algo: '' },
    { label: '失败的任务', metric: 'taskFailed' as MetricKey, Icon: XCircle, color: LK.error, algo: '' },
  ], []);

  const isSingle = curMetric === 'taskQueued' || curMetric === 'taskRunning' || curMetric === 'taskFailed';

  return (
    <div className="min-h-full px-5 py-5 md:px-6 2xl:px-8" style={{ backgroundColor: LK.canvas, color: LK.inkSoft }}>
      <div className="mx-auto w-full max-w-[1600px] space-y-4">
        <PageHeader
          title={
            <div className="flex flex-col gap-1">
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium" style={{ backgroundColor: LK.primaryMuted, color: LK.primary }}>
                <BarChart3 size={13} /> 平台结果看板
              </span>
              <span>Chimera 平台结果看板</span>
            </div>
          }
          description="汇总各模块的结果性数据：交付范围、节点状态、工作流执行、服务健康、资源占用与 AI 网关调用。"
          actions={
            <div className="flex items-center gap-3">
              <div className="w-36">
                <DropdownSelect
                  value={selectedDepartmentId ? String(selectedDepartmentId) : ''}
                  onChange={(v) => setSelectedDepartmentId(v ? Number(v) : null)}
                  options={rootDepartments.map((d) => ({ value: String(d.id), label: d.name }))}
                  placeholder="全部部门"
                />
              </div>
              {subDepartments.length > 0 && (
                <div className="w-36">
                  <DropdownSelect
                    value={selectedSubDeptId ? String(selectedSubDeptId) : ''}
                    onChange={(v) => setSelectedSubDeptId(v ? Number(v) : null)}
                    options={subDepartments.map((d) => ({ value: String(d.id), label: d.name }))}
                    placeholder="全部子部门"
                  />
                </div>
              )}
              <button type="button" onClick={() => setCurrentView('aigw-dashboard')} className="btn btn-primary">
                AI 网关详情 <ArrowUpRight size={16} />
              </button>
            </div>
          }
        />

        <div className="sticky top-0 z-30 py-2 space-y-3" style={{ backgroundColor: LK.canvas }}>
          {[row1, row2].map((row, ri) => (
            <section key={ri} className="grid grid-cols-4 gap-3">
              {row.map(c => {
                const val = cardValues[c.metric];
                const sel = curMetric === c.metric;
                const isLoading = c.metric === 'vulnSuspect' && vulnSuspectLoading;
                return (
                  <div
                    key={c.metric}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleMetricClick(c.metric)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleMetricClick(c.metric); } }}
                    className={`dash-vuln-card ${sel ? 'sel' : ''} flex flex-col rounded-xl px-3 py-3 relative cursor-pointer transition-colors`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <span className="text-[11px]" style={{ color: LK.muted }}>{c.label}</span>
                        {c.algo && (
                          <span className="relative inline-flex">
                            <button
                              type="button"
                              onMouseEnter={() => setAlgoHover(c.label)}
                              onMouseLeave={() => setAlgoHover(null)}
                              className="p-0.5 rounded transition-colors hover:bg-white/5"
                              style={{ color: LK.mutedSoft }}
                              aria-label="查看统计算法"
                            >
                              <HelpCircle size={11} />
                            </button>
                            {algoHover === c.label && (
                              <div
                                className="absolute z-50 top-full right-0 mt-1 p-3 rounded-lg max-w-[300px] shadow-xl"
                                style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}` }}
                              >
                                <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: LK.mutedSoft }}>统计算法</div>
                                <div className="text-[11px] leading-relaxed whitespace-pre-line" style={{ color: LK.body }}>{c.algo}</div>
                              </div>
                            )}
                          </span>
                        )}
                      </div>
                      <div className="flex h-7 w-7 items-center justify-center rounded-md" style={{ backgroundColor: softBg(c.color), color: c.color }}>
                        <c.Icon size={14} />
                      </div>
                    </div>
                    <div className="mt-2 text-2xl font-semibold leading-7 tabular-nums" style={{ color: c.color }}>
                      {isLoading ? '加载中' : (statsLoading && val === null ? '—' : (val !== null ? formatNumber(val) : '—'))}
                    </div>
                  </div>
                );
              })}
            </section>
          ))}
        </div>

        <section className="dash-panel">
          <div className="dash-panel-h">
            <div className="flex items-center flex-wrap gap-3.5 w-full">
              <h2>{panelTitle}</h2>
              <span className="text-xs" style={{ color: LK.muted }}>{panelSub}</span>
            </div>
          </div>
          <div className={`dash-panel-b ${isSingle ? 'single' : ''}`}>
            <div>
            <div className="dash-ptbl-wrap tight">
              <table className="dash-ptable tight">
                {curMetric === 'projects' && (
                  <>
                    <thead>
                      <tr>
                        <th>项目</th>
                        <th>归属部门</th>
                        <th>产品版本</th>
                        <th>创建人</th>
                        <th>创建时间</th>
                        <th className="r">任务数</th>
                        <th className="r">排队</th>
                        <th className="r">运行</th>
                        <th className="r">失败</th>
                        <th className="r">占比</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedRows.length === 0 ? (
                        <tr><td colSpan={10} className="text-center py-8" style={{ color: LK.muted }}>{statsLoading ? '加载中...' : '暂无数据'}</td></tr>
                      ) : pagedRows.map((r: any) => {
                        const totalSum = projectTaskRows.reduce((s, x) => s + x.total, 0) || 1;
                        return (
                          <tr key={r.project.id}>
                            <td><span className="nm">{r.project.name}</span></td>
                            <td>{r.project.department_name || '—'}</td>
                            <td>{r.project.product_version || '—'}</td>
                            <td>{r.project.owner_name || '—'}</td>
                            <td className="n" style={{ color: LK.mutedSoft }}>{formatDateTime(r.project.created_at)}</td>
                            <td className="n r" style={{ color: LK.primary }}>{formatNumber(r.total)}</td>
                            <td className="n r" style={{ color: LK.warning }}>{formatNumber(r.queued)}</td>
                            <td className="n r" style={{ color: LK.info }}>{formatNumber(r.running)}</td>
                            <td className="n r" style={{ color: LK.error }}>{formatNumber(r.failed)}</td>
                            <td className="n r" style={{ color: LK.mutedSoft }}>{totalSum > 0 ? `${(r.total / totalSum * 100).toFixed(1)}%` : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </>
                )}

                {(curMetric === 'taskTotal' || curMetric === 'taskQueued' || curMetric === 'taskRunning' || curMetric === 'taskFailed') && (
                  <>
                    <thead>
                      <tr>
                        <th>任务名称</th>
                        <th>工具</th>
                        <th>测试对象</th>
                        <th>任务状态</th>
                        <th>创建时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedRows.length === 0 ? (
                        <tr><td colSpan={5} className="text-center py-8" style={{ color: LK.muted }}>{statsLoading ? '加载中...' : '暂无数据'}</td></tr>
                      ) : pagedRows.map((t: any, idx: number) => {
                        const statusLabel = getTaskStatusLabel(t);
                        const statusColor = TASK_STATUS_COLOR[statusLabel] || LK.muted;
                        const isRunning = statusLabel === '运行中';
                        return (
                          <tr key={t.id || idx}>
                            <td><span className="nm">{t.name || '—'}</span></td>
                            <td>{getTaskHarnessLabel(t)}</td>
                            <td>{getTaskTestObjectLabel(t)}</td>
                            <td><span className={`dash-status-pill ${isRunning ? 'pulse' : ''}`} style={{ '--sc': statusColor } as any}>{statusLabel}</span></td>
                            <td className="n" style={{ color: LK.mutedSoft }}>{formatDateTime(t.created_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </>
                )}

                {(curMetric === 'vulnSuspect' || curMetric === 'vulnConfirmed' || curMetric === 'vulnRuledOut') && (
                  <>
                    <thead>
                      <tr>
                        <th>任务名称</th>
                        <th>标题 / 摘要</th>
                        <th>严重程度</th>
                        <th>人工确认状态</th>
                        <th>{curMetric === 'vulnRuledOut' ? '误报原因' : '漏洞种类'}</th>
                        <th>工具</th>
                        <th>更新时间</th>
                        <th>创建时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedRows.length === 0 ? (
                        <tr><td colSpan={8} className="text-center py-8" style={{ color: LK.muted }}>{statsLoading ? '加载中...' : '暂无数据'}</td></tr>
                      ) : pagedRows.map((c: any, idx: number) => {
                        const conc = getCaseConclusion(c);
                        const cLabel = conclusionLabel(conc);
                        const cClass = conclusionClass(conc);
                        const reporterName = c?.reporter?.name || c?.source_meta?.reporter?.name || 'unknown';
                        const reporterVer = c?.reporter?.version || c?.source_meta?.reporter?.version || '';
                        const sev = String(c?.severity || '').trim().toLowerCase();
                        const sevLabel = SEVERITY_LABELS[sev] || sev || '—';
                        const sevColor = SEVERITY_COLORS[sev] || LK.muted;
                        const categoryLabel = curMetric === 'vulnRuledOut'
                          ? (c?.false_positive_reason || '—')
                          : (c?.confirmed_category || '—');
                        return (
                          <tr key={c.id || idx}>
                            <td style={{ maxWidth: '200px' }}>
                              <span className="nm" style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: 'block',
                                whiteSpace: 'nowrap',
                                userSelect: 'all',
                                WebkitUserSelect: 'all',
                                cursor: 'text',
                              }}
                              onMouseEnter={(e) => tipEnter(e, dashGetTaskName(c))}
                              onMouseMove={tipMove}
                              onMouseLeave={tipLeave}
                              >
                                {dashGetTaskName(c)}
                              </span>
                            </td>
                            <td className="wrap">
                              <span className="vtitle"
                                onMouseEnter={(e) => tipEnter(e, c.title || '—')}
                                onMouseMove={tipMove}
                                onMouseLeave={tipLeave}
                              >{c.title || '—'}</span>
                              <span className="vsum"
                                onMouseEnter={(e) => tipEnter(e, c?.subtitle || c?.summary || '暂无摘要')}
                                onMouseMove={tipMove}
                                onMouseLeave={tipLeave}
                              >{c?.subtitle || c?.summary || '暂无摘要'}</span>
                            </td>
                            <td><span className="dash-status-pill" style={{ '--sc': sevColor } as any}>{sevLabel}</span></td>
                            <td><span className={`dash-vconc ${cClass}`}>{cLabel}</span></td>
                            <td><span style={{ color: LK.inkSoft, fontSize: '12px' }}>{categoryLabel}</span></td>
                            <td>
                              <span className="vtool">{reporterName}</span>
                              {reporterVer && <span className="vtoolv">{reporterVer}</span>}
                            </td>
                            <td className="n" style={{ color: LK.mutedSoft }}>{formatDateTime(c.updated_at)}</td>
                            <td className="n" style={{ color: LK.mutedSoft }}>{formatDateTime(c.created_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </>
                )}
              </table>
            </div>

            <div className="flex items-center justify-between gap-3 mt-3 text-xs" style={{ color: LK.muted }}>
              <span>共 {formatNumber(totalRows)} 条</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={normalizedPage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="px-2 py-1 rounded transition-colors disabled:opacity-30"
                  style={{ border: `1px solid ${LK.border}`, color: LK.inkSoft }}
                >上一页</button>
                <span className="tabular-nums">{normalizedPage} / {totalPages}</span>
                <button
                  type="button"
                  disabled={normalizedPage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="px-2 py-1 rounded transition-colors disabled:opacity-30"
                  style={{ border: `1px solid ${LK.border}`, color: LK.inkSoft }}
                >下一页</button>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                  className="px-2 py-1 rounded text-xs outline-none"
                  style={{ backgroundColor: LK.surface, color: LK.ink, border: `1px solid ${LK.border}` }}
                >
                  {[20, 50, 100, 200, 500].map(s => <option key={s} value={s}>{s} 条/页</option>)}
                </select>
              </div>
            </div>
            </div>

            {(distItems.length > 0 || dist2Items.length > 0) && (
              <div className="flex flex-col gap-0" style={{ minWidth: 0 }}>
                {distItems.length > 0 && (
                  <div className="flex flex-col gap-0 py-1">
                    <div className="dash-dist-h" style={{ marginBottom: 10 }}>
                      {curMetric === 'vulnSuspect' ? '上报来源分布'
                        : curMetric === 'vulnConfirmed' ? '严重度分布'
                        : '任务状态分布'}
                    </div>
                    {(() => {
                      const max = Math.max(1, ...distItems.map(i => i.count));
                      return distItems.map(item => (
                        <div key={item.name} className="flex items-center justify-between gap-1.5 text-xs" style={{ padding: '4px 0' }}>
                          <span className="dash-bar-label" title={item.name}>{item.name}</span>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <div className="dash-bar-trk">
                              <span className="dash-bar-fl" style={{ width: `${(item.count / max * 100).toFixed(1)}%`, background: `linear-gradient(90deg, ${item.color}, color-mix(in srgb, ${item.color} 55%, transparent))` }} />
                            </div>
                            <span className="dash-bar-ct">{formatNumber(item.count)}</span>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                )}

                {dist2Items.length > 0 && (
                  <div className={`flex flex-col gap-0 ${curMetric === 'vulnConfirmed' ? 'pt-4' : ''}`} style={curMetric === 'vulnConfirmed' ? { borderTop: `1px solid ${LK.borderSoft}` } : undefined}>
                    <div className="dash-dist-h" style={{ marginBottom: 10 }}>
                      {curMetric === 'vulnConfirmed' ? '漏洞种类分布' : '误报原因分布'}
                    </div>
                    {(() => {
                      const total = dist2Items.reduce((s, i) => s + i.count, 0);
                      const R = 42;
                      const C = 2 * Math.PI * R;
                      let offset = 0;
                      return (
                        <div className="dash-donut-wrap">
                          <div className="dash-donut">
                            <svg viewBox="0 0 100 100">
                              <circle cx="50" cy="50" r={R} fill="none" stroke="var(--bg-app)" strokeWidth="14" />
                              {dist2Items.map((item) => {
                                const pct = total > 0 ? item.count / total : 0;
                                const dash = pct * C;
                                const seg = (
                                  <circle
                                    key={item.name}
                                    cx="50" cy="50" r={R}
                                    className="dash-donut-seg"
                                    stroke={item.color}
                                    strokeDasharray={`${dash} ${C - dash}`}
                                    strokeDashoffset={-offset}
                                    transform="rotate(-90 50 50)"
                                  />
                                );
                                offset += dash;
                                return seg;
                              })}
                            </svg>
                            <div className="dash-donut-center">
                              <span className="dc-num">{formatNumber(total)}</span>
                              <span className="dc-label">总计</span>
                            </div>
                          </div>
                          <div className="dash-donut-legend">
                            {dist2Items.slice(0, 6).map(item => {
                              const pct = total > 0 ? (item.count / total * 100).toFixed(1) : '0.0';
                              return (
                                <div key={item.name} className="dash-donut-legend-item" title={item.name}>
                                  <span className="dl-dot" style={{ background: item.color }} />
                                  <span className="dl-name">{item.name}</span>
                                  <span className="dl-pct">{pct}%</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                    {(() => {
                      const max = Math.max(1, ...dist2Items.map(i => i.count));
                      return dist2Items.map(item => (
                        <div key={item.name} className="flex items-center justify-between gap-1.5 text-xs" style={{ padding: '4px 0' }}>
                          <span className="dash-bar-label" title={item.name}>{item.name}</span>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <div className="dash-bar-trk">
                              <span className="dash-bar-fl" style={{ width: `${(item.count / max * 100).toFixed(1)}%`, background: `linear-gradient(90deg, ${item.color}, color-mix(in srgb, ${item.color} 55%, transparent))` }} />
                            </div>
                            <span className="dash-bar-ct">{formatNumber(item.count)}</span>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
