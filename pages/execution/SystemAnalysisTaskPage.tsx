import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, ChevronDown, ChevronRight, Loader2, Plus, RefreshCw, RotateCcw, Trash2, X, XCircle } from 'lucide-react';

import { api } from '../../clients/api';
import { AppSaClusterCapacity, AppSaTaskItem } from '../../types/types';
import { showConfirm } from '../../components/DialogService';
import { ExecutionTable, ExecutionTableHead, ExecutionTableTh, ExecutionTableTd, executionTableRowClassName } from '../../components/execution/ExecutionTable';
import { ServiceBuildVersion } from '../../components/execution/ServiceBuildVersion';
import { useUiFeedback } from '../../components/UiFeedback';
import { buildDefaultSystemAnalysisTaskForm, SystemAnalysisTaskFormModal, SystemAnalysisTaskFormState } from './SystemAnalysisTaskFormModal';
import { saveExecutionReturnContext } from '../../utils/executionReturnContext';

const STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  running: '分析中',
  passed: '通过',
  failed: '失败',
  error: '错误',
  cancelled: '已取消',
};

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  running: 'bg-blue-100 text-blue-700',
  passed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  error: 'bg-orange-100 text-orange-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

function formatDuration(startedAt: string | null | undefined, finishedAt: string | null | undefined, nowSecs = Math.floor(Date.now() / 1000)): string {
  if (!startedAt) return '-';
  const startSecs = Math.floor(new Date(startedAt).getTime() / 1000);
  const endSecs = finishedAt ? Math.floor(new Date(finishedAt).getTime() / 1000) : nowSecs;
  const secs = Math.max(0, endSecs - startSecs);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m${s}s`;
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
        className={`inline-flex items-center gap-1 transition-colors ${active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}
        title={`按${label}排序`}
      >
        <span>{label}</span>
        <ArrowDownUp size={13} className={active ? 'text-sky-600' : 'text-slate-400'} />
        {active ? <span className="text-[10px] text-sky-600">{direction === 'asc' ? '升序' : '降序'}</span> : null}
      </button>
    </ExecutionTableTh>
  );
};

function getModeBadgeClassName(mode: string): string {
  return mode === 'source' ? 'bg-emerald-50 text-emerald-700' : 'bg-cyan-50 text-cyan-700';
}

function getQuickFilterButtonClassName(active: boolean, baseClassName: string): string {
  return `${baseClassName} transition-all ${active ? 'ring-2 ring-cyan-200 ring-offset-1' : 'hover:opacity-80'}`;
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

function isLeaseExpired(leaseUntil?: string | null): boolean {
  if (!leaseUntil) return false;
  const ts = new Date(leaseUntil).getTime();
  if (!Number.isFinite(ts)) return false;
  return ts < Date.now();
}

function getExecutionSlotPresentation(task: AppSaTaskItem): {
  label: string;
  tone: string;
  ownerText: string;
  detailText: string;
} {
  const ownerId = String(task.dispatcher_instance_id || '').trim();
  const hostName = parseHostName(ownerId);
  const leaseExpired = isLeaseExpired(task.lease_expires_at);
  if (['passed', 'failed', 'error', 'cancelled'].includes(task.status)) {
    return {
      label: '已释放',
      tone: 'bg-slate-100 text-slate-600',
      ownerText: ownerId || '-',
      detailText: '任务已结束',
    };
  }
  if (task.status === 'running' && ownerId && !leaseExpired) {
    return {
      label: '运行中',
      tone: 'bg-cyan-100 text-cyan-700',
      ownerText: hostName || ownerId,
      detailText: task.lease_expires_at ? `lease ${formatDateTime(task.lease_expires_at)}` : `dispatch ${formatDateTime(task.dispatch_started_at)}`,
    };
  }
  if (task.status === 'running' && ownerId && leaseExpired) {
    return {
      label: '状态过期',
      tone: 'bg-rose-100 text-rose-700',
      ownerText: hostName || ownerId,
      detailText: task.lease_expires_at ? `lease ${formatDateTime(task.lease_expires_at)}` : '租约已过期',
    };
  }
  if (task.status === 'pending' && !ownerId) {
    return {
      label: '未占用槽位',
      tone: 'bg-amber-100 text-amber-700',
      ownerText: '-',
      detailText: '排队中',
    };
  }
  return {
    label: ownerId ? '占用中' : '未占用槽位',
    tone: ownerId ? 'bg-cyan-100 text-cyan-700' : 'bg-amber-100 text-amber-700',
    ownerText: hostName || ownerId || '-',
    detailText: ownerId ? `dispatch ${formatDateTime(task.dispatch_started_at)}` : '等待调度',
  };
}

export const SystemAnalysisTaskPage: React.FC<{ projectId: string; onOpenTask: (taskId: string) => void }> = ({ projectId, onOpenTask }) => {
  const appApi = api.domains.execution.appSystemAnalyse;
  const { notify, feedbackNodes } = useUiFeedback();
  const autoRefreshStorageKey = `secflow:systemAnalysis:autoRefresh:${projectId || 'default'}`;
  const refreshIntervalStorageKey = `secflow:systemAnalysis:refreshInterval:${projectId || 'default'}`;

  const [loading, setLoading] = useState(true);
  const [buildVersion, setBuildVersion] = useState<string | null>(null);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchCancelling, setBatchCancelling] = useState(false);
  const [batchRestarting, setBatchRestarting] = useState(false);
  const [tasks, setTasks] = useState<AppSaTaskItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(100);
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
  const [clusterCapacity, setClusterCapacity] = useState<AppSaClusterCapacity | null>(null);
  const [showSlotDetailModal, setShowSlotDetailModal] = useState(false);
  const [slotsPanelExpanded, setSlotsPanelExpanded] = useState(false);
  const [expandedSlotWorkerIds, setExpandedSlotWorkerIds] = useState<string[]>([]);

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
    const stored = sessionStorage.getItem('secflow:systemAnalysisInputPath');
    if (stored) {
      sessionStorage.removeItem('secflow:systemAnalysisInputPath');
      setCreateModalOpen(true);
      setCreateModalInitialForm({
        ...buildDefaultSystemAnalysisTaskForm(projectId),
        input_path: stored,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const storedTaskId = sessionStorage.getItem('secflow:systemAnalysisTaskId');
    if (!storedTaskId) return;
    sessionStorage.removeItem('secflow:systemAnalysisTaskId');
    onOpenTask(storedTaskId);
  }, [onOpenTask]);

  useEffect(() => {
    let active = true;
    void appApi.getHealth()
      .then((payload: any) => {
        if (active) setBuildVersion(payload.build_version || null);
      })
      .catch(() => {
        if (active) setBuildVersion(null);
      });
    return () => {
      active = false;
    };
  }, [appApi]);

  // ── Load task list ────────────────────────────────────────────────────────

  const loadTasks = useCallback(async (p = page) => {
    if (!projectId) return;
    setLoading(true);
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
      notify(`加载任务列表失败: ${err?.message || err}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [projectId, page, perPage, statusFilter, analysisModeFilter, parentTaskIdFilter, sortBy, sortOrder]);

  const loadClusterCapacity = useCallback(async () => {
    if (!projectId) return;
    setSlotLoading(true);
    try {
      const payload = await appApi.getWorkerClusterCapacity(projectId);
      setClusterCapacity(payload);
      setSlotError(null);
    } catch (err: any) {
      setSlotError(err?.message || '读取执行槽位失败');
      setClusterCapacity(null);
    } finally {
      setSlotLoading(false);
    }
  }, [appApi, projectId]);

  useEffect(() => { void loadTasks(page); }, [projectId, page, perPage, statusFilter, analysisModeFilter, parentTaskIdFilter, sortBy, sortOrder]);
  useEffect(() => { void loadClusterCapacity(); }, [loadClusterCapacity]);

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
    const timer = setInterval(() => {
      void loadTasks(page);
      void loadClusterCapacity();
    }, Math.max(5, refreshIntervalSec) * 1000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefreshEnabled, refreshIntervalSec, hasActiveTasks, projectId, page]);

  const toggleSlotWorkerExpanded = (workerId: string) => {
    setExpandedSlotWorkerIds((current) => (
      current.includes(workerId) ? current.filter((value) => value !== workerId) : current.concat(workerId)
    ));
  };

  const pagedTasks = useMemo(() => tasks, [tasks]);

  const handleDelete = async (taskId: string, taskName: string) => {
    const confirmed = await showConfirm({
      title: '删除任务',
      message: `确定要删除任务「${taskName}」及其所有输出文件吗？此操作不可撤销。`,
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
      message: `确定要批量删除 ${taskIds.length} 个任务及其输出文件吗？此操作不可撤销。`,
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
      message: `确定要停止 ${activeIds.length} 个等待中/运行中的系统分析任务吗？任务记录和输出文件会保留。`,
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
      message: `确定要重试 ${restartableIds.length} 个系统分析任务吗？${skipped > 0 ? `将跳过 ${skipped} 个等待中/运行中的任务。` : ''}`,
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

      <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-600">System Analysis</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">分析任务</h1>
        <p className="mt-2 text-sm text-slate-500">指定分析路径，启动安全分析任务。</p>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: '总任务', value: total, bg: 'bg-slate-50', text: 'text-slate-800', border: 'border-slate-200' },
            { label: '运行中', value: tasks.filter((t) => t.status === 'running' || t.status === 'pending').length, bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
            { label: '已通过', value: tasks.filter((t) => t.status === 'passed').length, bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
            { label: '失败/取消', value: tasks.filter((t) => t.status === 'failed' || t.status === 'error' || t.status === 'cancelled').length, bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
          ].map((s) => (
            <div key={s.label} className={`min-w-[96px] rounded-xl border ${s.border} ${s.bg} px-3 py-2`}>
              <p className={`text-lg font-black ${s.text}`}>{s.value}</p>
              <p className="mt-1 text-[11px] text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <button
            type="button"
            onClick={() => setSlotsPanelExpanded((current) => !current)}
            className="flex flex-1 items-start justify-between gap-4 text-left"
          >
            <div>
              <h2 className="text-xl font-black text-slate-900">执行槽位</h2>
              <p className="mt-1 text-sm text-slate-500">展示当前系统分析 worker 集群的实时执行槽位、运行中的任务数量和各 worker 健康度。</p>
            </div>
            <span className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500">
              {slotsPanelExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </span>
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xs text-slate-400">最近同步 {formatDateTime(clusterCapacity?.updated_at)}</div>
            <button
              type="button"
              onClick={() => setShowSlotDetailModal(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              查看详情
            </button>
          </div>
        </div>
        {slotsPanelExpanded ? (
          <>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-3">
            <div className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-700">Worker 数</div>
            <div className="mt-2 text-2xl font-black text-slate-900">{clusterCapacity?.worker_count ?? '-'}</div>
          </div>
          <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3">
            <div className="text-[11px] font-black uppercase tracking-[0.24em] text-sky-700">总槽位</div>
            <div className="mt-2 text-2xl font-black text-slate-900">{clusterCapacity?.total_capacity ?? '-'}</div>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
            <div className="text-[11px] font-black uppercase tracking-[0.24em] text-amber-700">运行中</div>
            <div className="mt-2 text-2xl font-black text-slate-900">{clusterCapacity?.busy_slots ?? '-'}</div>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
            <div className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-700">空闲 / 排队</div>
            <div className="mt-2 text-2xl font-black text-slate-900">{clusterCapacity ? `${clusterCapacity.available_slots} / ${clusterCapacity.queued_jobs}` : '-'}</div>
          </div>
        </div>
        {slotLoading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" />
            正在读取执行槽位...
          </div>
        ) : null}
        {slotError ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            暂无槽位数据：{slotError}
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-3">
          {(clusterCapacity?.workers || []).map((worker) => (
            <div
              key={worker.worker_id}
              className={`min-w-[220px] rounded-2xl border px-4 py-3 ${
                worker.healthy ? 'border-slate-200 bg-slate-50' : 'border-rose-200 bg-rose-50'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-black text-slate-900">{worker.host_name || worker.worker_id}</div>
                <div className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${worker.healthy ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                  {worker.healthy ? 'healthy' : 'unhealthy'}
                </div>
              </div>
              <div className="mt-1 break-all font-mono text-[11px] text-slate-400">{worker.worker_id}</div>
              <div className="mt-2 text-xs text-slate-600">槽位 {worker.running_jobs}/{worker.max_concurrent_jobs} · 空闲 {worker.available_slots}</div>
              <div className="mt-1 text-xs text-slate-400">来源 {worker.source || 'runner_registry'} · 心跳 {formatDateTime(worker.last_heartbeat_at)}</div>
              {worker.error ? <div className="mt-2 break-all text-[11px] text-rose-600">{worker.error}</div> : null}
            </div>
          ))}
          {clusterCapacity && (clusterCapacity.workers || []).length === 0 && !slotError ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-400">
              当前未发现可用的系统分析 worker。
            </div>
          ) : null}
        </div>
          </>
        ) : null}
      </section>

      {/* Task list */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-900">任务列表 <span className="text-sm font-normal text-slate-400">({total})</span></h2>
              <ServiceBuildVersion version={buildVersion} />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={autoRefreshEnabled}
                onChange={(e) => setAutoRefreshEnabled(e.target.checked)}
              />
              自动刷新
            </label>
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
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
                className="w-16 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
              />
              秒
            </label>
            <select
              value={analysisModeFilter}
              onChange={(e) => { setAnalysisModeFilter(e.target.value as '' | 'binary' | 'source'); setPage(1); }}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 bg-white"
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
              className="w-44 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 placeholder:text-slate-400"
              title="按主任务 ID 筛选"
            />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 bg-white"
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
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 bg-white"
              title="排序字段"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>按{option.label}排序</option>
              ))}
            </select>
            <select
              value={sortOrder}
              onChange={(e) => { setSortOrder(e.target.value === 'asc' ? 'asc' : 'desc'); setPage(1); }}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 bg-white"
              title="排序方向"
            >
              <option value="desc">降序</option>
              <option value="asc">升序</option>
            </select>
            <button onClick={() => { void loadTasks(page); void loadClusterCapacity(); }} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
              <RefreshCw size={14} />
            </button>
            <button onClick={() => { setCreateModalInitialForm(buildDefaultSystemAnalysisTaskForm(projectId)); setCreateModalOpen(true); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">
              <Plus size={13} />新建任务
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>
            自动刷新：{autoRefreshEnabled ? `开启（${Math.max(5, refreshIntervalSec)}s）` : '关闭'}
          </span>
          {autoRefreshEnabled && !hasActiveTasks ? (
            <span className="text-amber-600">当前无运行中任务，自动刷新暂不触发</span>
          ) : null}
          {autoRefreshEnabled && hasActiveTasks ? (
            <span className="text-cyan-600">检测到活跃任务，按设定间隔自动刷新</span>
          ) : null}
        </div>

        {hasSelection ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3">
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={(e) => toggleAllPageSelection(e.target.checked)}
                />
                全选当前页（{tasks.length} 条）
              </label>
              <span className="text-sm font-semibold text-cyan-700">已选择 {selectedTaskIds.size} 个任务</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => void handleBatchCancel()}
                disabled={batchCancelling || batchDeleting || batchRestarting}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
              >
                {batchCancelling ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                批量停止
              </button>
              <button
                onClick={() => void handleBatchRestart()}
                disabled={batchRestarting || batchCancelling || batchDeleting}
                className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"
              >
                {batchRestarting ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                批量重试
              </button>
              <button
                onClick={() => setSelectedTaskIds(new Set())}
                disabled={batchDeleting || batchCancelling || batchRestarting}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                清除选择
              </button>
              <button
                onClick={() => void handleBatchDelete()}
                disabled={batchDeleting || batchCancelling || batchRestarting}
                className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                {batchDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                批量删除（{selectedTaskIds.size}）
              </button>
            </div>
          </div>
        ) : null}

        {loading && tasks.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader2 size={20} className="mr-2 animate-spin" /> 加载中...
          </div>
        ) : tasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-xs text-slate-400">
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
                  className={`${executionTableRowClassName} ${selectedTaskIds.has(t.task_id) ? 'bg-cyan-50/60' : ''}`.trim()}
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
                      className="text-left text-sm font-bold text-slate-900 hover:text-cyan-700"
                      title={`查看任务 ${t.task_name}`}
                    >
                      {t.task_name}
                    </button>
                    {t.abnormal_reason_title && ['failed', 'error', 'cancelled'].includes(t.status) ? (
                      <div className="mt-1 text-xs text-red-600">
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
                        analysisModeFilter === (t.analysis_mode || 'binary'),
                        `rounded-full px-2.5 py-1 text-xs font-semibold ${getModeBadgeClassName(t.analysis_mode === 'source' ? 'source' : 'binary')}`
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
                        statusFilter === t.status,
                        `shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${STATUS_COLOR[t.status] ?? 'bg-slate-100 text-slate-600'}`
                      )}
                      title={statusFilter === t.status ? '再次点击取消状态筛选' : '点击按状态快速筛选'}
                    >
                      {STATUS_LABEL[t.status] ?? t.status}
                    </button>
                  </ExecutionTableTd>
                  <ExecutionTableTd className="min-w-[190px]">
                    {(() => {
                      const slot = getExecutionSlotPresentation(t);
                      return (
                        <div className="space-y-1">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${slot.tone}`}>{slot.label}</span>
                          <div className="truncate text-xs font-semibold text-slate-700" title={t.dispatcher_instance_id || slot.ownerText}>
                            {slot.ownerText}
                          </div>
                          <div className="truncate text-[11px] text-slate-400" title={slot.detailText}>{slot.detailText}</div>
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
                          'inline-flex max-w-full items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs font-semibold text-slate-700'
                        )}
                        title={parentTaskIdFilter === t.parent_task_id ? '再次点击取消主任务筛选' : '点击按主任务 ID 快速筛选'}
                      >
                        <span className="truncate" title={t.parent_task_id}>{t.parent_task_id}</span>
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </ExecutionTableTd>
                  <ExecutionTableTd className="whitespace-nowrap text-xs text-slate-500">
                    {t.created_at ? new Date(t.created_at).toLocaleString('zh-CN') : '-'}
                  </ExecutionTableTd>
                  <ExecutionTableTd className="whitespace-nowrap text-xs text-slate-500">
                    {formatDuration(t.started_at, t.finished_at, clockNow)}
                  </ExecutionTableTd>
                  <ExecutionTableTd className="text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); void handleDelete(t.task_id, t.task_name); }}
                      title="删除任务及输出文件"
                      className="inline-flex items-center justify-center rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </ExecutionTableTd>
                </tr>
              ))}
            </tbody>
          </ExecutionTable>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="text-xs text-slate-500">
            共 {total} 条，当前显示 {pageStart}-{pageEnd}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              每页
              <select
                value={perPage}
                onChange={(e) => {
                  const nextSize = Number(e.target.value) || 50;
                  setPerPage(nextSize);
                  setPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none"
              >
                {[50, 100, 200, 500, 1000].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              条
            </label>
            <button
              disabled={page <= 1}
              onClick={() => setPage(1)}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50"
            >
              首页
            </button>
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50"
            >
              上一页
            </button>
            <span className="min-w-16 text-center text-xs text-slate-500">{page} / {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50"
            >
              下一页
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(totalPages)}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50"
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
          <div className="w-full max-w-5xl rounded-[2rem] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] shadow-[0_30px_100px_rgba(15,23,42,0.35)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-700">Slot Detail</div>
                <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-900">执行槽位详情</h3>
                <p className="mt-2 text-sm text-slate-500">按 worker 展示当前系统分析任务执行情况；点击每个 worker 头部展开或收起详细信息。</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right text-xs text-slate-400">
                  <div>最近同步</div>
                  <div className="mt-1 font-semibold text-slate-500">{formatDateTime(clusterCapacity?.updated_at)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSlotDetailModal(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  aria-label="关闭执行槽位详情"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="max-h-[75vh] overflow-auto px-6 py-5">
              {(clusterCapacity?.workers || []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-400">
                  当前未发现可用的系统分析 worker。
                </div>
              ) : (
                <div className="space-y-4">
                  {(clusterCapacity?.workers || []).map((worker) => {
                    const expanded = expandedSlotWorkerIds.includes(worker.worker_id);
                    const activeJobs = worker.active_jobs || [];
                    return (
                      <section
                        key={worker.worker_id}
                        className={`overflow-hidden rounded-[1.5rem] border ${worker.healthy ? 'border-slate-200 bg-white' : 'border-rose-200 bg-rose-50/70'}`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSlotWorkerExpanded(worker.worker_id)}
                          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50/70"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-black text-slate-900">{worker.host_name || worker.worker_id}</div>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${worker.healthy ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                {worker.healthy ? 'healthy' : 'unhealthy'}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">活动任务 {activeJobs.length}</span>
                            </div>
                            <div className="mt-1 break-all font-mono text-[11px] text-slate-400">{worker.worker_id}</div>
                            <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                              <span>槽位 {worker.running_jobs}/{worker.max_concurrent_jobs}</span>
                              <span>空闲 {worker.available_slots}</span>
                              <span>来源 {worker.source || 'runner_registry'}</span>
                              <span>心跳 {formatDateTime(worker.last_heartbeat_at)}</span>
                            </div>
                          </div>
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500">
                            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </div>
                        </button>
                        {expanded ? (
                          <div className="border-t border-slate-100 px-5 py-4">
                            {!worker.healthy ? (
                              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                                Worker 当前不可用。{worker.error ? `原因：${worker.error}` : ''}
                              </div>
                            ) : activeJobs.length === 0 ? (
                              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
                                当前无活跃系统分析任务。
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {activeJobs.map((job) => (
                                  <div key={`${worker.worker_id}:${job.task_id}`} className={`rounded-2xl border px-4 py-4 ${job.mapped ? 'border-slate-200 bg-slate-50/70' : 'border-amber-200 bg-amber-50/80'}`}>
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <div className="truncate text-sm font-black text-slate-900" title={job.task_name}>{job.task_name}</div>
                                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${job.mapped ? 'bg-cyan-100 text-cyan-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {job.mapped ? '已关联任务' : '未关联任务'}
                                          </span>
                                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{job.status}</span>
                                        </div>
                                        <div className="mt-1 break-all font-mono text-[11px] text-slate-500">{job.input_path || '-'}</div>
                                      </div>
                                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
                                        <div className="font-semibold text-slate-700">task id</div>
                                        <div className="mt-1 font-mono">{job.task_id}</div>
                                      </div>
                                    </div>
                                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                      <div className="rounded-xl border border-white/80 bg-white px-3 py-3">
                                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">分析模式</div>
                                        <div className="mt-1 text-sm font-semibold text-slate-700">{job.analysis_mode === 'source' ? '源码' : job.analysis_mode === 'binary' ? '二进制' : '-'}</div>
                                      </div>
                                      <div className="rounded-xl border border-white/80 bg-white px-3 py-3">
                                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">主任务</div>
                                        <div className="mt-1 break-all font-mono text-[11px] text-slate-600">{job.parent_task_id || '-'}</div>
                                      </div>
                                      <div className="rounded-xl border border-white/80 bg-white px-3 py-3">
                                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">租约</div>
                                        <div className="mt-1 text-sm font-semibold text-slate-700">{formatDateTime(job.execution_lease_until)}</div>
                                      </div>
                                      <div className="rounded-xl border border-white/80 bg-white px-3 py-3">
                                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">调度开始</div>
                                        <div className="mt-1 text-sm font-semibold text-slate-700">{formatDateTime(job.dispatch_started_at)}</div>
                                      </div>
                                      <div className="rounded-xl border border-white/80 bg-white px-3 py-3">
                                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">最近更新</div>
                                        <div className="mt-1 text-sm font-semibold text-slate-700">{formatDateTime(job.updated_at)}</div>
                                      </div>
                                      <div className="rounded-xl border border-white/80 bg-white px-3 py-3">
                                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">映射结果</div>
                                        <div className="mt-1 text-sm font-semibold text-slate-700">{job.mapping_reason}</div>
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
