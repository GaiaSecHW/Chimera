import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, ChevronDown, ChevronRight, Loader2, Plus, RefreshCw, RotateCcw, Trash2, X, XCircle } from 'lucide-react';

import { api } from '../../clients/api';
import { AppSaClusterCapacity, AppSaClusterCapacitySummary, AppSaTaskListItem, AppSaTaskListStats } from '../../types/types';
import { showConfirm } from '../../components/DialogService';
import { ExecutionTable, ExecutionTableHead, ExecutionTableTh, ExecutionTableTd, executionTableRowClassName } from '../../components/execution/ExecutionTable';
import { ServicePageTitle, useServiceBuildVersion } from '../../components/execution/ServiceBuildVersion';
import { useUiFeedback } from '../../components/UiFeedback';
import { buildDefaultSystemAnalysisTaskForm, SystemAnalysisTaskFormModal, SystemAnalysisTaskFormState } from './SystemAnalysisTaskFormModal';
import { SlotResourceBlock } from './slotResourceBlock';
import { saveExecutionReturnContext } from '../../utils/executionReturnContext';

const LEASE_REFRESH_INTERVAL_MS = 30_000;

const STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  running: '分析中',
  passed: '通过',
  failed: '失败',
  error: '错误',
  cancelled: '已取消',
};

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-theme-elevated text-theme-text-secondary',
  running: 'bg-blue-500/15 text-blue-400',
  passed: 'bg-emerald-500/15 text-emerald-400',
  failed: 'bg-red-500/15 text-red-400',
  error: 'bg-orange-500/15 text-orange-400',
  cancelled: 'bg-theme-elevated text-theme-text-muted',
};

function formatDuration(startedAt: string | null | undefined, finishedAt: string | null | undefined, nowSecs = Math.floor(Date.now() / 1000)): string {
  if (!startedAt) return '-';
  const startSecs = Math.floor(new Date(startedAt).getTime() / 1000);
  const endSecs = finishedAt ? Math.floor(new Date(finishedAt).getTime() / 1000) : nowSecs;
  const secs = Math.max(0, endSecs - startSecs);
  if (secs < 60) return`${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return`${m}m${s}s`;
}

const SORT_OPTIONS = [
  { value: 'created_at', label: '创建时间' },
  { value: 'updated_at', label: '更新时间' },
  { value: 'started_at', label: '开始时间' },
  { value: 'finished_at', label: '结束时间' },
  { value: 'status', label: '任务状态' },
  { value: 'task_name', label: '任务名称' },
];

const HEADER_SORT_FIELDS: Partial<Record<'task' | 'status' | 'created_at' | 'duration', string>> = {
  task: 'task_name',
  status: 'status',
  created_at: 'created_at',
  duration: 'started_at',
};

type SortableHeaderProps = {
  label: string;
  active: boolean;
  direction: 'asc' | 'desc';
  onClick?: () => void;
  className?: string;
};

const SortableHeader: React.FC<SortableHeaderProps> = ({ label, active, direction, onClick, className }) => {
  if (!onClick) return <ExecutionTableTh className={className}>{label}</ExecutionTableTh>;
  return (
    <ExecutionTableTh className={className}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 transition-colors ${active ? 'text-theme-text-primary' : 'text-theme-text-muted hover:text-theme-text-primary'}`}
        title={`按${label}排序`}
      >
        <span>{label}</span>
        <ArrowDownUp size={13} className={active ? 'text-sky-400' : 'text-theme-text-muted'} />
        {active ? <span className="text-[10px] text-sky-400">{direction === 'asc' ? '升序' : '降序'}</span> : null}
      </button>
    </ExecutionTableTh>
  );
};

function getModeBadgeClassName(mode: string): string {
  return mode === 'source' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-cyan-500/15 text-cyan-400';
}

function getQuickFilterButtonClassName(active: boolean, baseClassName: string): string {
  return`${baseClassName} transition-all ${active ? 'ring-2 ring-cyan-500/20 ring-offset-1' : 'hover:opacity-80'}`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN');
}

function parseHostName(ownerId?: string | null): string {
  const normalized = String(ownerId || '').trim();
  if (!normalized) return '';
  const separator = normalized.indexOf(':');
  return separator >= 0 ? normalized.slice(0, separator) : normalized;
}

function getExecutionSlotPresentation(
  task: AppSaTaskListItem,
  workerState?: Pick<AppSaClusterCapacity['workers'][number], 'healthy' | 'source' | 'worker_id'> | null,
): {
  label: string;
  tone: string;
  ownerText: string;
  detailText: string;
} {
  const ownerId = String(task.dispatcher_instance_id || '').trim();
  const hostName = parseHostName(ownerId);
  if (['passed', 'failed', 'error', 'cancelled'].includes(task.status)) {
    return {
      label: '已释放',
      tone: 'bg-theme-elevated text-theme-text-secondary',
      ownerText: ownerId || '-',
      detailText: '任务已结束',
    };
  }
  if (task.status === 'running' && ownerId && workerState && !workerState.healthy) {
    return {
      label: '状态过期',
      tone: 'bg-rose-500/15 text-rose-400',
      ownerText: hostName || ownerId,
      detailText: workerState.source === 'task_lease_fallback'
        ? '服务端已判定 owner 状态异常'
        : '服务端已判定 worker 不健康',
    };
  }
  if (task.status === 'running' && ownerId) {
    return {
      label: '运行中',
      tone: 'bg-cyan-500/15 text-cyan-400',
      ownerText: hostName || ownerId,
      detailText: task.lease_expires_at ?`lease ${formatDateTime(task.lease_expires_at)}` :`dispatch ${formatDateTime(task.dispatch_started_at)}`,
    };
  }
  if (task.status === 'pending' && !ownerId) {
    return {
      label: '未占用槽位',
      tone: 'bg-amber-500/15 text-amber-400',
      ownerText: '-',
      detailText: '排队中',
    };
  }
  return {
    label: ownerId ? '占用中' : '未占用槽位',
    tone: ownerId ? 'bg-cyan-500/15 text-cyan-400' : 'bg-amber-500/15 text-amber-400',
    ownerText: hostName || ownerId || '-',
    detailText: ownerId ?`dispatch ${formatDateTime(task.dispatch_started_at)}` : '等待调度',
  };
}

export const SystemAnalysisTaskPage: React.FC<{ projectId: string; onOpenTask: (taskId: string) => void }> = ({ projectId, onOpenTask }) => {
  const appApi = api.domains.execution.appSystemAnalyse;
  const buildVersion = useServiceBuildVersion(appApi.getHealth);
  const { notify, feedbackNodes } = useUiFeedback();
  const autoRefreshStorageKey =`chimera:systemAnalysis:autoRefresh:${projectId || 'default'}`;
  const refreshIntervalStorageKey =`chimera:systemAnalysis:refreshInterval:${projectId || 'default'}`;

  const [loading, setLoading] = useState(true);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchCancelling, setBatchCancelling] = useState(false);
  const [batchRestarting, setBatchRestarting] = useState(false);
  const [tasks, setTasks] = useState<AppSaTaskListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [taskStats, setTaskStats] = useState<AppSaTaskListStats>({ total: 0, pending: 0, running: 0, passed: 0, failed: 0, error: 0, cancelled: 0 });
  const [taskStatsError, setTaskStatsError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [statusFilter, setStatusFilter] = useState('');
  const [analysisModeFilter, setAnalysisModeFilter] = useState<'' | 'binary' | 'source'>('');
  const [parentTaskIdFilter, setParentTaskIdFilter] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createModalInitialForm, setCreateModalInitialForm] = useState<SystemAnalysisTaskFormState>(() => buildDefaultSystemAnalysisTaskForm(projectId));
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [refreshIntervalSec, setRefreshIntervalSec] = useState(10);
  const [clockNow, setClockNow] = useState(() => Math.floor(Date.now() / 1000));
  const [slotLoading, setSlotLoading] = useState(false);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [clusterCapacitySummary, setClusterCapacitySummary] = useState<AppSaClusterCapacitySummary | null>(null);
  const [clusterCapacityDetail, setClusterCapacityDetail] = useState<AppSaClusterCapacity | null>(null);
  const [showSlotDetailModal, setShowSlotDetailModal] = useState(false);
  const [expandedSlotWorkerIds, setExpandedSlotWorkerIds] = useState<string[]>([]);
  const [slotOverviewExpanded, setSlotOverviewExpanded] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible');
  const [lastStatsLoadedAt, setLastStatsLoadedAt] = useState<number>(0);
  const [lastClusterSummaryLoadedAt, setLastClusterSummaryLoadedAt] = useState<number>(0);
  const previewWorkers = useMemo(() => (clusterCapacityDetail?.workers || []).slice(0, 2), [clusterCapacityDetail]);
  const slotRegistryCount = useMemo(
    () => (clusterCapacityDetail?.workers || []).filter((worker) => (worker.source || '').trim() === 'runner_registry').length,
    [clusterCapacityDetail],
  );
  const slotLivePodCount = useMemo(
    () => (clusterCapacityDetail?.workers || []).filter((worker) => Boolean((worker.pod_name || '').trim())).length,
    [clusterCapacityDetail],
  );
  const slotFallbackWorkerCount = useMemo(
    () => (clusterCapacityDetail?.workers || []).filter((worker) => (worker.source || '').trim() === 'task_lease_fallback').length,
    [clusterCapacityDetail],
  );
  const slotWorkerById = useMemo(() => {
    const mapping = new Map<string, AppSaClusterCapacity['workers'][number]>();
    for (const worker of clusterCapacityDetail?.workers || []) {
      const workerId = String(worker.worker_id || '').trim();
      if (workerId) {
        mapping.set(workerId, worker);
      }
      const podName = String(worker.pod_name || '').trim();
      if (podName) {
        mapping.set(podName, worker);
      }
    }
    return mapping;
  }, [clusterCapacityDetail]);

  const handleHeaderSort = (field: 'task' | 'status' | 'created_at' | 'duration') => {
    const mapped = HEADER_SORT_FIELDS[field];
    if (!mapped) return;
    if (sortBy === mapped) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(mapped);
      setSortOrder(field === 'task' || field === 'status' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const toggleStatusQuickFilter = (status: string) => {
    setStatusFilter((current) => (current === status ? '' : status));
    setPage(1);
  };

  const toggleModeQuickFilter = (mode: '' | 'binary' | 'source') => {
    if (!mode) return;
    setAnalysisModeFilter((current) => (current === mode ? '' : mode));
    setPage(1);
  };

  const toggleParentTaskQuickFilter = (parentTaskId: string) => {
    if (!parentTaskId) return;
    setParentTaskIdFilter((current) => (current === parentTaskId ? '' : parentTaskId));
    setPage(1);
  };

  // Pre-fill input_path from FileExplorer right-click
  useEffect(() => {
    const stored = sessionStorage.getItem('chimera:systemAnalysisInputPath');
    if (stored) {
      sessionStorage.removeItem('chimera:systemAnalysisInputPath');
      setCreateModalOpen(true);
      setCreateModalInitialForm({
        ...buildDefaultSystemAnalysisTaskForm(projectId),
        input_path: stored,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const storedTaskId = sessionStorage.getItem('chimera:systemAnalysisTaskId');
    if (!storedTaskId) return;
    sessionStorage.removeItem('chimera:systemAnalysisTaskId');
    onOpenTask(storedTaskId);
  }, [onOpenTask]);

  // ── Load task list ────────────────────────────────────────────────────────

  const loadTasks = useCallback(async (p = page, options?: { silent?: boolean }) => {
    if (!projectId) return;
    const silent = options?.silent === true;
    if (!silent) setLoading(true);
    try {
      const resp = await appApi.listTasks({
        project_id: projectId,
        page: p,
        per_page: perPage,
        status: statusFilter,
        analysis_mode: analysisModeFilter,
        parent_task_id: parentTaskIdFilter.trim() || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      setTasks(resp.items || []);
      setTotal(resp.total || 0);
    } catch (err: any) {
      if (!silent) {
        notify(`加载任务列表失败: ${err?.message || err}`, 'error');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [projectId, page, perPage, statusFilter, analysisModeFilter, parentTaskIdFilter, sortBy, sortOrder]);

  const loadTaskStats = useCallback(async () => {
    if (!projectId) return;
    try {
      const resp = await appApi.getTaskStats({
        project_id: projectId,
        status: statusFilter,
        analysis_mode: analysisModeFilter,
        parent_task_id: parentTaskIdFilter.trim() || undefined,
      });
      setTaskStats(resp);
      setTaskStatsError(null);
      setLastStatsLoadedAt(Date.now());
    } catch (err: any) {
      setTaskStatsError(err?.message || '加载任务统计失败');
    }
  }, [appApi, projectId, statusFilter, analysisModeFilter, parentTaskIdFilter, notify]);

  const loadClusterCapacity = useCallback(async () => {
    setSlotLoading(true);
    try {
      const payload = await appApi.getWorkerClusterCapacitySummary();
      setClusterCapacitySummary(payload);
      setSlotError(null);
      setLastClusterSummaryLoadedAt(Date.now());
    } catch (err: any) {
      setSlotError(err?.message || '读取执行槽位失败');
      setClusterCapacitySummary(null);
    } finally {
      setSlotLoading(false);
    }
  }, [appApi]);

  const loadClusterCapacityDetail = useCallback(async () => {
    setSlotLoading(true);
    try {
      const payload = await appApi.getWorkerClusterCapacity();
      setClusterCapacityDetail(payload);
      setSlotError(null);
    } catch (err: any) {
      setSlotError(err?.message || '读取执行槽位失败');
      setClusterCapacityDetail(null);
    } finally {
      setSlotLoading(false);
    }
  }, [appApi]);

  useEffect(() => { void loadTasks(page); }, [projectId, page, perPage, statusFilter, analysisModeFilter, parentTaskIdFilter, sortBy, sortOrder]);

  useEffect(() => {
    if (!projectId) return;
    const timer = window.setTimeout(() => {
      void loadTaskStats();
      void loadClusterCapacity();
      void loadClusterCapacityDetail();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [projectId, statusFilter, analysisModeFilter, parentTaskIdFilter, loadTaskStats, loadClusterCapacity]);

  useEffect(() => {
    const storedEnabled = localStorage.getItem(autoRefreshStorageKey);
    const storedInterval = localStorage.getItem(refreshIntervalStorageKey);
    setAutoRefreshEnabled(storedEnabled === 'true');
    if (storedInterval) {
      const parsed = Number(storedInterval);
      if (Number.isFinite(parsed)) {
        setRefreshIntervalSec(Math.max(5, Math.floor(parsed)));
      }
    } else {
      setRefreshIntervalSec(10);
    }
  }, [autoRefreshStorageKey, refreshIntervalStorageKey]);

  useEffect(() => {
    localStorage.setItem(autoRefreshStorageKey, String(autoRefreshEnabled));
  }, [autoRefreshEnabled, autoRefreshStorageKey]);

  useEffect(() => {
    localStorage.setItem(refreshIntervalStorageKey, String(refreshIntervalSec));
  }, [refreshIntervalSec, refreshIntervalStorageKey]);

  useEffect(() => {
    setSelectedTaskIds((current) => {
      const next = new Set<string>();
      const validIds = new Set(tasks.map((task) => task.task_id));
      current.forEach((taskId) => {
        if (validIds.has(taskId)) next.add(taskId);
      });
      return next;
    });
  }, [tasks]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setPageVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // ── Auto-poll when tasks are running or pending ───────────────────────────
  const hasActiveTasks = tasks.some((t) => t.status === 'running' || t.status === 'pending');
  useEffect(() => {
    if (!hasActiveTasks) return;
    const timer = window.setInterval(() => setClockNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [hasActiveTasks]);

  useEffect(() => {
    if (!autoRefreshEnabled) return;
    if (!hasActiveTasks) return;
    if (!pageVisible) return;
    const timer = setInterval(() => {
      void loadTasks(page);
      const now = Date.now();
      if (now - lastClusterSummaryLoadedAt >= 30_000) {
        void loadClusterCapacity();
        void loadClusterCapacityDetail();
      }
      if (now - lastStatsLoadedAt >= 30_000) {
        void loadTaskStats();
      }
    }, Math.max(5, refreshIntervalSec) * 1000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefreshEnabled, refreshIntervalSec, hasActiveTasks, pageVisible, projectId, page, lastClusterSummaryLoadedAt, lastStatsLoadedAt]);

  useEffect(() => {
    if (autoRefreshEnabled) return;
    if (!hasActiveTasks) return;
    if (!pageVisible) return;
    const timer = window.setInterval(() => {
      void loadTasks(page, { silent: true });
      void loadClusterCapacity();
      void loadClusterCapacityDetail();
    }, LEASE_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [autoRefreshEnabled, hasActiveTasks, pageVisible, loadTasks, loadClusterCapacity, page]);

  const toggleSlotWorkerExpanded = (workerId: string) => {
    setExpandedSlotWorkerIds((current) => (
      current.includes(workerId) ? current.filter((value) => value !== workerId) : current.concat(workerId)
    ));
  };

  const pagedTasks = useMemo(() => tasks, [tasks]);

  const handleDelete = async (taskId: string, taskName: string) => {
    const confirmed = await showConfirm({
      title: '删除任务',
      message:`确定要删除任务「${taskName}」及其所有输出文件吗？此操作不可撤销。`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await appApi.deleteTask(taskId, true);
      notify('任务已删除', 'success');
      setSelectedTaskIds((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
      await loadTasks(page);
    } catch (err: any) {
      notify(`删除失败: ${err?.message || err}`, 'error');
    }
  };

  const toggleTaskSelection = (taskId: string, checked: boolean) => {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (checked) next.add(taskId);
      else next.delete(taskId);
      return next;
    });
  };

  const toggleAllPageSelection = (checked: boolean) => {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (checked) tasks.forEach((task) => next.add(task.task_id));
      else tasks.forEach((task) => next.delete(task.task_id));
      return next;
    });
  };

  const handleBatchDelete = async () => {
    const taskIds = Array.from(selectedTaskIds);
    if (taskIds.length === 0) {
      notify('请先选择要删除的任务', 'error');
      return;
    }
    const confirmed = await showConfirm({
      title: '批量删除任务',
      message:`确定要批量删除 ${taskIds.length} 个任务及其输出文件吗？此操作不可撤销。`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;

    setBatchDeleting(true);
    let success = 0;
    let failed = 0;
    let firstError = '';

    for (const taskId of taskIds) {
      try {
        await appApi.deleteTask(taskId, true);
        success += 1;
      } catch (err: any) {
        failed += 1;
        if (!firstError) firstError = err?.message || String(err);
      }
    }

    setBatchDeleting(false);
    setSelectedTaskIds(new Set());
    await loadTasks(page);

    if (failed === 0) {
      notify(`批量删除成功，共 ${success} 个任务`, 'success');
    } else if (success > 0) {
      notify(`批量删除完成，成功 ${success} / ${taskIds.length}，首个错误：${firstError}`, 'warning');
    } else {
      notify(`批量删除失败：${firstError || '未知错误'}`, 'error');
    }
  };

  const handleBatchCancel = async () => {
    const activeIds = tasks
      .filter((task) => selectedTaskIds.has(task.task_id) && (task.status === 'pending' || task.status === 'running'))
      .map((task) => task.task_id);
    if (activeIds.length === 0) {
      notify('已选择任务中没有可停止的等待中或运行中任务', 'error');
      return;
    }
    const confirmed = await showConfirm({
      title: '批量停止任务',
      message:`确定要停止 ${activeIds.length} 个等待中/运行中的系统分析任务吗？任务记录和输出文件会保留。`,
      confirmText: '确认停止',
      cancelText: '取消',
    });
    if (!confirmed) return;

    setBatchCancelling(true);
    let success = 0;
    let failed = 0;
    let firstError = '';
    for (const taskId of activeIds) {
      try {
        await appApi.cancelTask(taskId);
        success += 1;
      } catch (err: any) {
        failed += 1;
        if (!firstError) firstError = err?.message || String(err);
      }
    }
    setBatchCancelling(false);
    await loadTasks(page);

    if (failed === 0) {
      notify(`批量停止成功，共 ${success} 个任务`, 'success');
    } else if (success > 0) {
      notify(`批量停止完成，成功 ${success} / ${activeIds.length}，首个错误：${firstError}`, 'warning');
    } else {
      notify(`批量停止失败：${firstError || '未知错误'}`, 'error');
    }
  };

  const handleBatchRestart = async () => {
    const restartableIds = tasks
      .filter((task) => selectedTaskIds.has(task.task_id) && task.status !== 'pending' && task.status !== 'running')
      .map((task) => task.task_id);
    if (restartableIds.length === 0) {
      notify('已选择任务中没有可重试的终态任务', 'error');
      return;
    }
    const skipped = selectedTaskIds.size - restartableIds.length;
    const confirmed = await showConfirm({
      title: '批量重试任务',
      message:`确定要重试 ${restartableIds.length} 个系统分析任务吗？${skipped > 0 ?`将跳过 ${skipped} 个等待中/运行中的任务。` : ''}`,
      confirmText: '确认重试',
      cancelText: '取消',
    });
    if (!confirmed) return;

    setBatchRestarting(true);
    let success = 0;
    let failed = 0;
    let firstError = '';
    for (const taskId of restartableIds) {
      try {
        await appApi.restartTask(taskId);
        success += 1;
      } catch (err: any) {
        failed += 1;
        if (!firstError) firstError = err?.message || String(err);
      }
    }
    setBatchRestarting(false);
    await loadTasks(page);

    if (failed === 0) {
      notify(`批量重试成功，共 ${success} 个任务`, 'success');
    } else if (success > 0) {
      notify(`批量重试完成，成功 ${success} / ${restartableIds.length}，首个错误：${firstError}`, 'warning');
    } else {
      notify(`批量重试失败：${firstError || '未知错误'}`, 'error');
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pageStart = total === 0 ? 0 : (page - 1) * perPage + 1;
  const pageEnd = total === 0 ? 0 : Math.min(total, (page - 1) * perPage + tasks.length);
  const allPageSelected = tasks.length > 0 && tasks.every((task) => selectedTaskIds.has(task.task_id));
  const hasSelection = selectedTaskIds.size > 0;

  return (
    <div className="px-8 pt-8 pb-10 space-y-6">
      {feedbackNodes}

 <section className="rounded-xl border border-theme-border bg-theme-surface p-6">
        <ServicePageTitle title="分析任务" version={buildVersion} />
        <p className="mt-2 text-sm text-theme-text-muted">指定分析路径，启动安全分析任务。</p>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: '总任务', value: taskStats.total, bg: 'bg-theme-surface', text: 'text-theme-text-primary', border: 'border-theme-border' },
              { label: '运行中', value: taskStats.running + taskStats.pending, bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/20' },
              { label: '已通过', value: taskStats.passed, bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/20' },
              { label: '失败/取消', value: taskStats.failed + taskStats.error + taskStats.cancelled, bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/20' },
          ].map((s) => (
            <div key={s.label} className={`min-w-[96px] rounded-xl border ${s.border} ${s.bg} px-3 py-2`}>
              <p className={`text-lg font-semibold ${s.text}`}>{s.value}</p>
              <p className="mt-1 text-[11px] text-theme-text-muted">{s.label}</p>
            </div>
          ))}
        </div>
        {taskStatsError ? (
          <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/15 px-4 py-3 text-sm text-amber-400">
            统计摘要暂不可用：{taskStatsError}
          </div>
        ) : null}
      </section>

 <section className="rounded-xl border border-theme-border bg-theme-surface">
        <button
          type="button"
          onClick={() => setSlotOverviewExpanded((current) => !current)}
          className="flex w-full flex-wrap items-start justify-between gap-3 px-5 pb-4 pt-5 text-left"
        >
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-theme-text-muted">EXECUTION SLOTS</h2>
            <div className="mt-2 text-lg font-semibold text-theme-text-primary">执行槽位总览</div>
            <p className="mt-1 text-xs text-theme-text-muted">对齐入口分析的运行态展示方式，先给出集群槽位摘要，再按需查看 worker 和活跃任务详情。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setExpandedSlotWorkerIds([]);
                setShowSlotDetailModal(true);
                void loadClusterCapacityDetail();
              }}
              className="rounded-xl border border-theme-border bg-theme-surface px-4 py-2 text-xs font-bold text-theme-text-secondary hover:bg-theme-elevated"
            >
              查看槽位详情
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void loadClusterCapacity();
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-xs font-bold text-theme-text-secondary hover:bg-theme-elevated"
              title="手动刷新执行槽位"
              aria-label="手动刷新执行槽位"
            >
              <RefreshCw size={14} className={slotLoading ? 'animate-spin' : ''} />
              手动刷新
            </button>
            <span className="rounded-full border border-theme-border bg-theme-elevated px-3 py-1 text-[11px] font-bold text-theme-text-secondary">
              {clusterCapacitySummary ?`${clusterCapacitySummary.busy_slots} / ${clusterCapacitySummary.total_capacity} 槽位运行中` : '槽位摘要待加载'}
            </span>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-theme-border bg-theme-surface text-theme-text-muted">
              {slotOverviewExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </span>
          </div>
        </button>
        {slotOverviewExpanded ? (
          <>
            <div className="border-t border-theme-border" />
            {slotLoading && !clusterCapacitySummary ? (
          <div className="flex items-center justify-center gap-2 px-5 py-8 text-sm text-theme-text-muted">
            <Loader2 size={15} className="animate-spin" />
            加载执行槽位摘要中...
          </div>
        ) : clusterCapacitySummary ? (
          <div className="px-5 py-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: '总槽位', value: clusterCapacitySummary.total_capacity, bg: 'bg-theme-surface', text: 'text-theme-text-primary', border: 'border-theme-border' },
                { label: '占用槽位', value: clusterCapacitySummary.busy_slots, bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20' },
                { label: '空闲槽位', value: clusterCapacitySummary.available_slots, bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
                { label: '排队任务', value: clusterCapacitySummary.queued_jobs, bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
                { label: 'Worker', value: clusterCapacitySummary.worker_count, bg: 'bg-theme-surface', text: 'text-theme-text-primary', border: 'border-theme-border' },
                { label: 'Healthy', value: clusterCapacitySummary.healthy_workers, bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
                { label: 'Stale', value: clusterCapacitySummary.stale_workers, bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20' },
                { label: 'Live Pod', value: clusterCapacityDetail ? slotLivePodCount : '-', bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/20' },
              ].map((item) => (
                <div key={item.label} className={`rounded-xl border ${item.border} ${item.bg} px-4 py-4`}>
                  <div className={`text-2xl font-bold leading-none ${item.text}`}>{item.value}</div>
                  <div className="mt-2 text-xs font-bold text-theme-text-muted">{item.label}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-theme-text-muted">
              <span className="rounded-full border border-theme-border bg-theme-elevated px-3 py-1 font-bold text-theme-text-secondary">
                Healthy {clusterCapacitySummary.healthy_workers}
              </span>
              <span className="rounded-full border border-theme-border bg-theme-elevated px-3 py-1 font-bold text-theme-text-secondary">
                Worker {clusterCapacitySummary.worker_count}
              </span>
              <span className="rounded-full border border-theme-border bg-theme-elevated px-3 py-1 font-bold text-theme-text-secondary">
                Live Pod {clusterCapacityDetail ? slotLivePodCount : '-'}
              </span>
              <span className="rounded-full border border-theme-border bg-theme-elevated px-3 py-1 font-bold text-theme-text-secondary">
                Registry Worker {clusterCapacityDetail ? slotRegistryCount : '-'}
              </span>
              <span className="rounded-full border border-theme-border bg-theme-elevated px-3 py-1 font-bold text-theme-text-secondary">
                Fallback {clusterCapacityDetail ? slotFallbackWorkerCount : '-'}
              </span>
              <span className="rounded-full border border-theme-border bg-theme-elevated px-3 py-1 font-bold text-theme-text-secondary">
                Stale {clusterCapacitySummary.stale_workers}
              </span>
              <span className="rounded-full border border-theme-border bg-theme-elevated px-3 py-1 font-bold text-theme-text-secondary">
                Updated {formatDateTime(clusterCapacitySummary.updated_at)}
              </span>
            </div>
            {clusterCapacitySummary.stale_workers > 0 ? (
              <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/15 px-4 py-3 text-xs text-amber-400">
                当前检测到 {clusterCapacitySummary.stale_workers} 个异常或过期 worker，建议打开“查看槽位详情”定位具体节点。
              </div>
            ) : null}
            {clusterCapacitySummary.busy_slots > 0 ? (
              <div className="mt-4 text-xs text-theme-text-muted">
                当前存在正在占用槽位的系统分析任务，进入详情弹窗可继续查看具体 worker、资源使用和任务映射。
              </div>
            ) : clusterCapacitySummary.queued_jobs > 0 ? (
              <div className="mt-4 text-xs text-theme-text-muted">
                当前没有运行中的槽位，但存在排队任务，可继续观察调度情况。
              </div>
            ) : null}
            <div className="mt-5 border-t border-theme-border pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">当前运行槽位</div>
                  <div className="mt-1 text-sm text-theme-text-muted">这里直接前置展示两个 worker 槽位，完整明细继续在“查看槽位详情”中展开。</div>
                </div>
                <span className="rounded-full border border-theme-border bg-theme-elevated px-3 py-1 text-[11px] font-bold text-theme-text-secondary">
                  预览 {previewWorkers.length} / {clusterCapacitySummary.worker_count} 个 worker
                </span>
              </div>
              {previewWorkers.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-theme-border bg-theme-surface px-4 py-8 text-center text-sm text-theme-text-muted">
                  当前没有可预览的执行槽位 worker。
                </div>
              ) : (
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  {previewWorkers.map((worker) => {
                    const activeJobs = worker.active_jobs || [];
                    return (
                      <section
                        key={worker.worker_id}
                        className={`overflow-hidden rounded-xl border ${worker.healthy ? 'border-theme-border bg-theme-surface' : 'border-rose-500/20 bg-rose-500/10'}`}
                      >
                        <div className="px-5 py-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-sm font-semibold text-theme-text-primary">{worker.host_name || worker.worker_id}</div>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${worker.healthy ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                                  {worker.healthy ? 'healthy' : 'unhealthy'}
                                </span>
                                <span className="rounded-full bg-theme-elevated px-2 py-0.5 text-[10px] font-bold text-theme-text-secondary">活动任务 {activeJobs.length}</span>
                              </div>
                              <div className="mt-1 break-all font-mono text-[11px] text-theme-text-muted">{worker.worker_id}</div>
                              <div className="mt-2 flex flex-wrap gap-3 text-xs text-theme-text-muted">
                                <span>槽位 {worker.running_jobs}/{worker.max_concurrent_jobs}</span>
                                <span>空闲 {worker.available_slots}</span>
                                <span>来源 {worker.source || 'runner_registry'}</span>
                                <span>心跳 {formatDateTime(worker.last_heartbeat_at)}</span>
                              </div>
                              <div className="mt-3 max-w-md">
                                <SlotResourceBlock
                                  cpuUsage={worker.pod_cpu_usage_millicores}
                                  cpuLimit={worker.pod_cpu_limit_millicores}
                                  cpuRequest={worker.pod_cpu_request_millicores}
                                  memoryUsage={worker.pod_memory_usage_bytes}
                                  memoryLimit={worker.pod_memory_limit_bytes}
                                  memoryRequest={worker.pod_memory_request_bytes}
                                  metricsAt={worker.pod_metrics_at}
                                  formatDateTime={formatDateTime}
                                />
                              </div>
                            </div>
                          </div>
                          {!worker.healthy ? (
                            <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm text-rose-400">
                              Worker 当前不可用。{worker.error ?`原因：${worker.error}` : ''}
                            </div>
                          ) : activeJobs.length > 0 ? (
                            <div className="mt-4 space-y-3">
                              {activeJobs.slice(0, 2).map((job) => (
                                <div key={`${worker.worker_id}:${job.task_id}`} className={`rounded-2xl border px-4 py-4 ${job.mapped ? 'border-theme-border bg-theme-elevated' : 'border-amber-500/20 bg-amber-500/10'}`}>
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <div className="truncate text-sm font-semibold text-theme-text-primary" title={job.task_name}>{job.task_name}</div>
                                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${job.mapped ? 'bg-cyan-500/15 text-cyan-400' : 'bg-amber-500/15 text-amber-400'}`}>
                                          {job.mapped ? '已关联任务' : '未关联任务'}
                                        </span>
                                        <span className="rounded-full bg-theme-elevated px-2 py-0.5 text-[10px] font-bold text-theme-text-secondary">{job.status}</span>
                                      </div>
                                      <div className="mt-1 break-all font-mono text-[11px] text-theme-text-muted">{job.input_path || '-'}</div>
                                    </div>
                                    <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-[11px] text-theme-text-muted">
                                      <div className="font-semibold text-theme-text-secondary">task id</div>
                                      <div className="mt-1 font-mono">{job.task_id}</div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                              {activeJobs.length > 2 ? (
                                <div className="text-xs text-theme-text-muted">
                                  当前 worker 还有 {activeJobs.length - 2} 个活跃任务未在总览区展开，可点击“查看槽位详情”查看完整列表。
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="px-5 py-10 text-center text-sm text-theme-text-muted">
            <div>当前尚未加载执行槽位摘要。</div>
            <button
              type="button"
              onClick={() => void loadClusterCapacity()}
              className="mt-4 rounded-xl border border-theme-border bg-theme-surface px-4 py-2 text-xs font-bold text-theme-text-secondary hover:bg-theme-elevated"
            >
              加载执行槽位摘要
            </button>
          </div>
        )}
          </>
        ) : null}
        {slotOverviewExpanded && slotLoading && clusterCapacitySummary ? (
          <div className="px-5 pb-5 text-xs text-theme-text-muted">正在刷新执行槽位摘要...</div>
        ) : null}
        {slotOverviewExpanded && slotError ? (
          <div className="mx-5 mb-5 rounded-2xl border border-amber-500/20 bg-amber-500/15 px-4 py-3 text-sm text-amber-400">
            暂无槽位数据：{slotError}
          </div>
        ) : null}
      </section>

      {/* Task list */}
 <section className="rounded-2xl border border-theme-border bg-theme-surface p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-theme-text-primary">任务列表 <span className="text-sm font-normal text-theme-text-muted">({total})</span></h2>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="inline-flex items-center gap-2 rounded-lg border border-theme-border bg-theme-elevated px-3 py-1.5 text-xs text-theme-text-secondary">
              <input
                type="checkbox"
                checked={autoRefreshEnabled}
                onChange={(e) => setAutoRefreshEnabled(e.target.checked)}
              />
              自动刷新
            </label>
            <label className="inline-flex items-center gap-2 rounded-lg border border-theme-border bg-theme-elevated px-3 py-1.5 text-xs text-theme-text-secondary">
              间隔
              <input
                type="number"
                min={5}
                step={1}
                value={refreshIntervalSec}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setRefreshIntervalSec(Number.isFinite(value) ? Math.max(5, Math.floor(value)) : 5);
                }}
                className="w-16 rounded border border-theme-border bg-theme-elevated px-2 py-1 text-xs text-theme-text-secondary"
              />
              秒
            </label>
            <select
              value={analysisModeFilter}
              onChange={(e) => { setAnalysisModeFilter(e.target.value as '' | 'binary' | 'source'); setPage(1); }}
              className="form-select text-xs"
              title="分析模式筛选"
            >
              <option value="">全部模式</option>
              <option value="binary">二进制模式</option>
              <option value="source">源码模式</option>
            </select>
            <input
              value={parentTaskIdFilter}
              onChange={(e) => { setParentTaskIdFilter(e.target.value); setPage(1); }}
              placeholder="筛选主任务ID"
              className="w-44 rounded-lg border border-theme-border bg-theme-elevated px-3 py-1.5 text-xs text-theme-text-secondary placeholder:text-theme-text-muted"
              title="按主任务 ID 筛选"
            />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="form-select text-xs"
              title="任务状态筛选"
            >
              <option value="">全部状态</option>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
              className="form-select text-xs"
              title="排序字段"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>按{option.label}排序</option>
              ))}
            </select>
            <select
              value={sortOrder}
              onChange={(e) => { setSortOrder(e.target.value === 'asc' ? 'asc' : 'desc'); setPage(1); }}
              className="form-select text-xs"
              title="排序方向"
            >
              <option value="desc">降序</option>
              <option value="asc">升序</option>
            </select>
            <button onClick={() => { void loadTasks(page); void loadTaskStats(); void loadClusterCapacity(); }} className="rounded-lg border border-theme-border p-2 text-theme-text-muted hover:bg-theme-elevated">
              <RefreshCw size={14} />
            </button>
            <button onClick={() => { setCreateModalInitialForm(buildDefaultSystemAnalysisTaskForm(projectId)); setCreateModalOpen(true); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-theme-surface px-3 py-1.5 text-xs font-semibold text-white hover:bg-theme-elevated">
              <Plus size={13} />新建任务
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-theme-text-muted">
          <span>
            自动刷新：{autoRefreshEnabled ?`开启（${Math.max(5, refreshIntervalSec)}s）` : '关闭'}
          </span>
          {autoRefreshEnabled && !hasActiveTasks ? (
            <span className="text-amber-400">当前无运行中任务，自动刷新暂不触发</span>
          ) : null}
          {autoRefreshEnabled && !pageVisible ? (
            <span className="text-theme-text-muted">页面不可见时暂停自动刷新</span>
          ) : null}
          {autoRefreshEnabled && hasActiveTasks ? (
            <span className="text-cyan-400">检测到活跃任务，按设定间隔自动刷新</span>
          ) : null}
        </div>

        {hasSelection ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/15 px-4 py-3">
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-theme-text-secondary">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={(e) => toggleAllPageSelection(e.target.checked)}
                />
                全选当前页（{tasks.length} 条）
              </label>
              <span className="text-sm font-semibold text-cyan-400">已选择 {selectedTaskIds.size} 个任务</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => void handleBatchCancel()}
                disabled={batchCancelling || batchDeleting || batchRestarting}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-500/20 bg-theme-surface px-4 py-2 text-sm font-semibold text-amber-400 hover:bg-amber-500/15 disabled:opacity-50"
              >
                {batchCancelling ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                批量停止
              </button>
              <button
                onClick={() => void handleBatchRestart()}
                disabled={batchRestarting || batchCancelling || batchDeleting}
                className="inline-flex items-center gap-2 rounded-xl border border-violet-500/20 bg-theme-surface px-4 py-2 text-sm font-semibold text-violet-400 hover:bg-violet-500/15 disabled:opacity-50"
              >
                {batchRestarting ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                批量重试
              </button>
              <button
                onClick={() => setSelectedTaskIds(new Set())}
                disabled={batchDeleting || batchCancelling || batchRestarting}
                className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-4 py-2 text-sm font-semibold text-theme-text-secondary hover:bg-theme-elevated disabled:opacity-50"
              >
                清除选择
              </button>
              <button
                onClick={() => void handleBatchDelete()}
                disabled={batchDeleting || batchCancelling || batchRestarting}
                className="inline-flex items-center gap-2 rounded-xl border border-red-500/20 bg-theme-surface px-4 py-2 text-sm font-semibold text-red-400 hover:bg-red-500/15 disabled:opacity-50"
              >
                {batchDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                批量删除（{selectedTaskIds.size}）
              </button>
            </div>
          </div>
        ) : null}

        {loading && tasks.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-theme-text-muted">
            <Loader2 size={20} className="mr-2 animate-spin" /> 加载中...
          </div>
        ) : tasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-theme-border bg-theme-surface py-10 text-center text-xs text-theme-text-muted">
            暂无任务，点击右上角「新建任务」创建
          </div>
        ) : (
          <ExecutionTable minWidth={1200}>
            <ExecutionTableHead>
              <tr>
                <ExecutionTableTh className="w-12">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={(e) => toggleAllPageSelection(e.target.checked)}
                    aria-label="全选当前页任务"
                  />
                </ExecutionTableTh>
                <SortableHeader
                  label="任务"
                  active={sortBy === 'task_name'}
                  direction={sortOrder}
                  onClick={() => handleHeaderSort('task')}
                />
                <ExecutionTableTh>分析模式</ExecutionTableTh>
                <SortableHeader
                  label="状态"
                  active={sortBy === 'status'}
                  direction={sortOrder}
                  onClick={() => handleHeaderSort('status')}
                />
                <ExecutionTableTh>执行槽位</ExecutionTableTh>
                <ExecutionTableTh>来源</ExecutionTableTh>
                <SortableHeader
                  label="创建时间"
                  active={sortBy === 'created_at'}
                  direction={sortOrder}
                  onClick={() => handleHeaderSort('created_at')}
                />
                <SortableHeader
                  label="耗时"
                  active={sortBy === 'started_at'}
                  direction={sortOrder}
                  onClick={() => handleHeaderSort('duration')}
                />
                <ExecutionTableTh className="text-right">操作</ExecutionTableTh>
              </tr>
            </ExecutionTableHead>
            <tbody>
              {pagedTasks.map((t) => (
                <tr
                  key={t.task_id}
                  className={`${executionTableRowClassName} ${selectedTaskIds.has(t.task_id) ? 'bg-cyan-500/10' : ''}`.trim()}
                >
                  <ExecutionTableTd>
                    <input
                      type="checkbox"
                      checked={selectedTaskIds.has(t.task_id)}
                      onChange={(e) => toggleTaskSelection(t.task_id, e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`选择任务 ${t.task_name}`}
                    />
                  </ExecutionTableTd>
                  <ExecutionTableTd className="min-w-[180px]">
                    <button
                      type="button"
                      onClick={() => {
                        saveExecutionReturnContext({ view: 'system-analysis-task' });
                        onOpenTask(t.task_id);
                      }}
                      className="text-left text-sm font-bold text-theme-text-primary hover:text-cyan-400"
                      title={`查看任务 ${t.task_name}`}
                    >
                      {t.task_name}
                    </button>
                    {t.abnormal_reason_title && ['failed', 'error', 'cancelled'].includes(t.status) ? (
                      <div className="mt-1 text-xs text-red-400">
                        <span className="font-bold">{t.abnormal_reason_title}</span>
                        {t.abnormal_reason_code ? <span className="ml-2 font-mono uppercase tracking-[0.12em] text-red-500">{t.abnormal_reason_code}</span> : null}
                      </div>
                    ) : null}
                  </ExecutionTableTd>
                  <ExecutionTableTd className="whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleModeQuickFilter((t.analysis_mode || 'binary') as 'binary' | 'source')}
                      className={getQuickFilterButtonClassName(
                        analysisModeFilter === (t.analysis_mode || 'binary'),`rounded-full px-2.5 py-1 text-xs font-semibold ${getModeBadgeClassName(t.analysis_mode === 'source' ? 'source' : 'binary')}`
                      )}
                      title={analysisModeFilter === (t.analysis_mode || 'binary') ? '再次点击取消模式筛选' : '点击按模式快速筛选'}
                    >
                      {t.analysis_mode_label || (t.analysis_mode === 'binary' ? '二进制' : t.analysis_mode === 'source' ? '源码' : '-')}
                    </button>
                  </ExecutionTableTd>
                  <ExecutionTableTd>
                    <button
                      type="button"
                      onClick={() => toggleStatusQuickFilter(t.status)}
                      className={getQuickFilterButtonClassName(
                        statusFilter === t.status,`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${STATUS_COLOR[t.status] ?? 'bg-theme-elevated text-theme-text-secondary'}`
                      )}
                      title={statusFilter === t.status ? '再次点击取消状态筛选' : '点击按状态快速筛选'}
                    >
                      {STATUS_LABEL[t.status] ?? t.status}
                    </button>
                  </ExecutionTableTd>
                  <ExecutionTableTd className="min-w-[190px]">
                    {(() => {
                      const slot = getExecutionSlotPresentation(
                        t,
                        slotWorkerById.get(String(t.dispatcher_instance_id || '').trim()) || null,
                      );
                      return (
                        <div className="space-y-1">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${slot.tone}`}>{slot.label}</span>
                          <div className="truncate text-xs font-semibold text-theme-text-secondary" title={t.dispatcher_instance_id || slot.ownerText}>
                            {slot.ownerText}
                          </div>
                          <div className="truncate text-[11px] text-theme-text-muted" title={slot.detailText}>{slot.detailText}</div>
                        </div>
                      );
                    })()}
                  </ExecutionTableTd>
                  <ExecutionTableTd className="min-w-[150px]">
                    {t.parent_task_id ? (
                      <button
                        type="button"
                        onClick={() => toggleParentTaskQuickFilter(t.parent_task_id || '')}
                        className={getQuickFilterButtonClassName(
                          parentTaskIdFilter === t.parent_task_id,
                          'inline-flex max-w-full items-center rounded-md border border-theme-border bg-theme-elevated px-2.5 py-1 font-mono text-xs font-semibold text-theme-text-secondary'
                        )}
                        title={parentTaskIdFilter === t.parent_task_id ? '再次点击取消主任务筛选' : '点击按主任务 ID 快速筛选'}
                      >
                        <span className="truncate" title={t.parent_task_id}>{t.parent_task_id}</span>
                      </button>
                    ) : (
                      <span className="text-xs text-theme-text-muted">-</span>
                    )}
                  </ExecutionTableTd>
                  <ExecutionTableTd className="whitespace-nowrap text-xs text-theme-text-muted">
                    {t.created_at ? new Date(t.created_at).toLocaleString('zh-CN') : '-'}
                  </ExecutionTableTd>
                  <ExecutionTableTd className="whitespace-nowrap text-xs text-theme-text-muted">
                    {formatDuration(t.started_at, t.finished_at, clockNow)}
                  </ExecutionTableTd>
                  <ExecutionTableTd className="text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); void handleDelete(t.task_id, t.task_name); }}
                      title="删除任务及输出文件"
                      className="inline-flex items-center justify-center rounded-lg p-1.5 text-theme-text-muted hover:bg-red-500/15 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </ExecutionTableTd>
                </tr>
              ))}
            </tbody>
          </ExecutionTable>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-theme-border pt-3">
          <div className="text-xs text-theme-text-muted">
            共 {total} 条，当前显示 {pageStart}-{pageEnd}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs text-theme-text-muted">
              每页
              <select
                value={perPage}
                onChange={(e) => {
                  const nextSize = Number(e.target.value) || 50;
                  setPerPage(nextSize);
                  setPage(1);
                }}
                className="form-select text-xs"
              >
                {[10, 50, 100, 200, 500, 1000].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              条
            </label>
            <button
              disabled={page <= 1}
              onClick={() => setPage(1)}
              className="rounded-lg border border-theme-border px-2.5 py-1.5 text-xs font-semibold text-theme-text-secondary disabled:opacity-40 hover:bg-theme-elevated"
            >
              首页
            </button>
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-theme-border px-3 py-1.5 text-xs font-semibold text-theme-text-secondary disabled:opacity-40 hover:bg-theme-elevated"
            >
              上一页
            </button>
            <span className="min-w-16 text-center text-xs text-theme-text-muted">{page} / {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg border border-theme-border px-3 py-1.5 text-xs font-semibold text-theme-text-secondary disabled:opacity-40 hover:bg-theme-elevated"
            >
              下一页
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(totalPages)}
              className="rounded-lg border border-theme-border px-2.5 py-1.5 text-xs font-semibold text-theme-text-secondary disabled:opacity-40 hover:bg-theme-elevated"
            >
              末页
            </button>
          </div>
        </div>
      </section>

      <SystemAnalysisTaskFormModal
        projectId={projectId}
        isOpen={createModalOpen}
        title="新建任务"
        submitLabel="创建分析任务"
        initialForm={createModalInitialForm}
        loadProjectDefaultsOnOpen
        onClose={() => setCreateModalOpen(false)}
        onCreated={async (task) => {
          notify(`任务创建成功: ${task.task_id}`, 'success');
          setCreateModalOpen(false);
          setCreateModalInitialForm(buildDefaultSystemAnalysisTaskForm(projectId));
          setPage(1);
          await loadTasks(1);
        }}
        onError={(message) => notify(message, 'error')}
      />

      {showSlotDetailModal ? (
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm" onClick={() => setShowSlotDetailModal(false)}>
          <div className="w-full max-w-5xl rounded-2xl border border-theme-border bg-theme-surface" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-theme-border px-6 py-5">
              <div>
                <h3 className="mt-2 text-2xl font-bold tracking-tight text-theme-text-primary">执行槽位详情</h3>
                <p className="mt-2 text-sm text-theme-text-muted">按 worker 展示当前系统分析任务执行情况；点击每个 worker 头部展开或收起详细信息。</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right text-xs text-theme-text-muted">
                  <div>最近同步</div>
                  <div className="mt-1 font-semibold text-theme-text-muted">{formatDateTime(clusterCapacityDetail?.updated_at || clusterCapacitySummary?.updated_at)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSlotDetailModal(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-theme-border bg-theme-surface text-theme-text-secondary hover:bg-theme-elevated"
                  aria-label="关闭执行槽位详情"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="max-h-[75vh] overflow-auto px-6 py-5">
              {(clusterCapacityDetail?.workers || []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-theme-border bg-theme-surface px-4 py-10 text-center text-sm text-theme-text-muted">
                  当前未发现可用的系统分析 worker。
                </div>
              ) : (
                <div className="space-y-4">
                  {(clusterCapacityDetail?.workers || []).map((worker) => {
                    const expanded = expandedSlotWorkerIds.includes(worker.worker_id);
                    const activeJobs = worker.active_jobs || [];
                    return (
                      <section
                        key={worker.worker_id}
                        className={`overflow-hidden rounded-xl border ${worker.healthy ? 'border-theme-border bg-theme-surface' : 'border-rose-500/20 bg-rose-500/10'}`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSlotWorkerExpanded(worker.worker_id)}
                          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-theme-elevated"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-semibold text-theme-text-primary">{worker.host_name || worker.worker_id}</div>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${worker.healthy ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                                {worker.healthy ? 'healthy' : 'unhealthy'}
                              </span>
                              <span className="rounded-full bg-theme-elevated px-2 py-0.5 text-[10px] font-bold text-theme-text-secondary">活动任务 {activeJobs.length}</span>
                            </div>
                            <div className="mt-1 break-all font-mono text-[11px] text-theme-text-muted">{worker.worker_id}</div>
                            <div className="mt-2 flex flex-wrap gap-3 text-xs text-theme-text-muted">
                              <span>槽位 {worker.running_jobs}/{worker.max_concurrent_jobs}</span>
                              <span>空闲 {worker.available_slots}</span>
                              <span>来源 {worker.source || 'runner_registry'}</span>
                              <span>心跳 {formatDateTime(worker.last_heartbeat_at)}</span>
                            </div>
                            <div className="mt-2 max-w-md">
                              <SlotResourceBlock
                                cpuUsage={worker.pod_cpu_usage_millicores}
                                cpuLimit={worker.pod_cpu_limit_millicores}
                                cpuRequest={worker.pod_cpu_request_millicores}
                                memoryUsage={worker.pod_memory_usage_bytes}
                                memoryLimit={worker.pod_memory_limit_bytes}
                                memoryRequest={worker.pod_memory_request_bytes}
                                metricsAt={worker.pod_metrics_at}
                                formatDateTime={formatDateTime}
                              />
                            </div>
                          </div>
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-theme-border bg-theme-surface text-theme-text-muted">
                            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </div>
                        </button>
                        {expanded ? (
                          <div className="border-t border-theme-border px-5 py-4">
                            {!worker.healthy ? (
                              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm text-rose-400">
                                Worker 当前不可用。{worker.error ?`原因：${worker.error}` : ''}
                              </div>
                            ) : activeJobs.length === 0 ? (
                              <div className="rounded-2xl border border-dashed border-theme-border bg-theme-surface px-4 py-8 text-center text-sm text-theme-text-muted">
                                当前无活跃系统分析任务。
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {activeJobs.map((job) => (
                                  <div key={`${worker.worker_id}:${job.task_id}`} className={`rounded-2xl border px-4 py-4 ${job.mapped ? 'border-theme-border bg-theme-elevated' : 'border-amber-500/20 bg-amber-500/10'}`}>
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <div className="truncate text-sm font-semibold text-theme-text-primary" title={job.task_name}>{job.task_name}</div>
                                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${job.mapped ? 'bg-cyan-500/15 text-cyan-400' : 'bg-amber-500/15 text-amber-400'}`}>
                                            {job.mapped ? '已关联任务' : '未关联任务'}
                                          </span>
                                          <span className="rounded-full bg-theme-elevated px-2 py-0.5 text-[10px] font-bold text-theme-text-secondary">{job.status}</span>
                                        </div>
                                        <div className="mt-1 break-all font-mono text-[11px] text-theme-text-muted">{job.input_path || '-'}</div>
                                      </div>
                                      <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-[11px] text-theme-text-muted">
                                        <div className="font-semibold text-theme-text-secondary">task id</div>
                                        <div className="mt-1 font-mono">{job.task_id}</div>
                                      </div>
                                    </div>
                                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
 <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-3">
                                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">分析模式</div>
                                        <div className="mt-1 text-sm font-semibold text-theme-text-secondary">{job.analysis_mode === 'source' ? '源码' : job.analysis_mode === 'binary' ? '二进制' : '-'}</div>
                                      </div>
 <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-3">
                                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">主任务</div>
                                        <div className="mt-1 break-all font-mono text-[11px] text-theme-text-secondary">{job.parent_task_id || '-'}</div>
                                      </div>
 <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-3">
                                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">租约</div>
                                        <div className="mt-1 text-sm font-semibold text-theme-text-secondary">{formatDateTime(job.execution_lease_until)}</div>
                                      </div>
 <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-3">
                                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">调度开始</div>
                                        <div className="mt-1 text-sm font-semibold text-theme-text-secondary">{formatDateTime(job.dispatch_started_at)}</div>
                                      </div>
 <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-3">
                                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">最近更新</div>
                                        <div className="mt-1 text-sm font-semibold text-theme-text-secondary">{formatDateTime(job.updated_at)}</div>
                                      </div>
 <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-3">
                                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">映射结果</div>
                                        <div className="mt-1 text-sm font-semibold text-theme-text-secondary">{job.mapping_reason}</div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
