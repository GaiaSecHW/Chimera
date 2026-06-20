import React, { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Clock3,
  Copy,
  FolderKanban,
  Layers3,
  Waypoints,
  RefreshCw,
  Search,
  ServerCog,
  Eye,
  ListChecks,
  RotateCcw,
  Trash2,
  ExternalLink,
  TimerReset,
  Workflow,
  X,
} from 'lucide-react';
import { api } from '../../clients/api';
import { showAlert, showConfirm } from '../../components/DialogService';
import {
  ScheduleCenterUserTaskBulkDeleteResult,
  ScheduleCenterUserTask,
  ScheduleUserTaskEvent,
  ScheduleUserTaskEventListResponse,
  ScheduleCenterUserTaskListResponse,
  ScheduleGlobalTaskDetail,
  ScheduleGlobalTaskListItem,
  ScheduleGlobalTaskOverview,
  ScheduleRuntimeQueuePreview,
  ScheduleRuntimeQueuePreviewGroup,
  ScheduleRuntimeQueuePreviewItem,
  ScheduleRuntimeOverview,
  SecurityProject,
} from '../../types/types';

interface ChimeraScheduleCenterPageProps {
  projects: SecurityProject[];
  initialProjectId?: string;
}

type SortDirection = 'asc' | 'desc';

type TaskFilters = {
  status: string;
  taskType: string;
  projectId: string;
  isRetrying: boolean;
  hasError: boolean;
  search: string;
};

type TaskEventFilters = {
  scope: 'project' | 'global';
  projectId: string;
  taskId: string;
  taskType: string;
  eventCategory: string;
  resultStatus: string;
  eventSource: string;
  downstreamTaskId: string;
  search: string;
  onlyFailed: boolean;
};

type BackendSortField =
  | 'updated_at'
  | 'created_at'
  | 'name'
  | 'task_type'
  | 'dispatch_status'
  | 'business_status'
  | 'downstream_status_mapped'
  | 'created_by'
  | 'downstream_task_id';

type ColumnFilterKey = 'taskType' | 'status' | 'hasError';

type OverviewNav = 'overview' | 'queue-preview' | 'job-templates' | 'execution-log' | 'task-event-log' | 'key-vault';

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'created', label: '未处理' },
  { value: 'scheduled', label: '计划中' },
  { value: 'queued', label: '排队中' },
  { value: 'retry_wait', label: '重试中' },
  { value: 'running', label: '进行中' },
  { value: 'succeeded', label: '成功' },
  { value: 'partial_success', label: '部分成功' },
  { value: 'failed', label: '失败' },
  { value: 'cancelled', label: '已取消' },
];

const TASK_TYPE_OPTIONS = [
  { value: '', label: '全部任务类型' },
  { value: 'binary_firmware_e2e', label: '二进制固件端到端' },
  { value: 'source_scan_e2e', label: '源码扫描端到端' },
  { value: 'binary_module_e2e', label: '二进制模块端到端' },
];

const PAGE_SIZE_OPTIONS = [20, 50, 100];

type ColumnKey = 'name' | 'taskType' | 'status' | 'project' | 'queueState' | 'retryCount' | 'createdBy' | 'createdAt' | 'updatedAt' | 'timeRange' | 'actions';

const ALL_COLUMNS: Array<{ key: ColumnKey; label: string; defaultVisible: boolean }> = [
  { key: 'name', label: '任务名称', defaultVisible: true },
  { key: 'taskType', label: '任务类型', defaultVisible: true },
  { key: 'status', label: '状态', defaultVisible: true },
  { key: 'project', label: '项目', defaultVisible: true },
  { key: 'queueState', label: '当前主队列', defaultVisible: true },
  { key: 'retryCount', label: '重试次数', defaultVisible: false },
  { key: 'createdBy', label: '创建人', defaultVisible: true },
  { key: 'createdAt', label: '创建时间', defaultVisible: false },
  { key: 'updatedAt', label: '更新时间', defaultVisible: false },
  { key: 'timeRange', label: '开始 / 结束时间', defaultVisible: true },
  { key: 'actions', label: '操作', defaultVisible: true },
];

const DEFAULT_VISIBLE_COLUMNS = new Set<ColumnKey>(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key));

const NAV_ITEMS: Array<{ key: OverviewNav; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = [
  { key: 'overview', label: '全局任务', icon: Workflow },
  { key: 'queue-preview', label: '调度队列', icon: Clock3 },
  { key: 'job-templates', label: '作业模板', icon: FolderKanban },
  { key: 'execution-log', label: '执行记录', icon: Activity },
  { key: 'task-event-log', label: '调度日志', icon: Layers3 },
  { key: 'key-vault', label: 'Key 管理', icon: ServerCog },
];

const createEmptyOverview = (): ScheduleGlobalTaskOverview => ({
  stats: {
    total_tasks: 0,
    unprocessed_tasks: 0,
    scheduled_tasks: 0,
    queued_tasks: 0,
    retry_wait_tasks: 0,
    running_tasks: 0,
    succeeded_tasks: 0,
    failed_tasks: 0,
    cancelled_tasks: 0,
  },
  queue: {
    depth: 0,
    oldest_age_seconds: 0,
    backend: 'unknown',
  },
  workers: {
    active: 0,
    concurrency: 0,
    inflight: 0,
  },
  health: {
    status: 'unknown',
    redis_available: false,
  },
  refreshed_at: null,
});

const formatTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN');
};

const renderTaskTimeRange = (startedAt?: string | null, finishedAt?: string | null) => (
  <div className="space-y-1 text-xs font-medium text-theme-text-secondary">
    <div>开始：{formatTime(startedAt)}</div>
    <div>结束：{formatTime(finishedAt)}</div>
  </div>
);

const formatCount = (value?: number | null) =>`${Number(value || 0)}`;

const formatDurationSeconds = (value?: number | null) => {
  const seconds = Number(value || 0);
  if (!seconds) return '0s';
  if (seconds < 60) return`${seconds}s`;
  if (seconds < 3600) return`${Math.floor(seconds / 60)}m`;
  return`${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
};

const queueStatusTone = (status?: string | null) => {
  if (status === 'healthy') return 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400';
  if (status === 'scheduled') return 'border-cyan-500/20 bg-cyan-500/15 text-cyan-400';
  if (status === 'degraded') return 'border-rose-500/20 bg-rose-500/15 text-rose-400';
  if (status === 'disabled') return 'border-theme-border bg-theme-elevated text-theme-text-muted';
  return 'border-amber-500/20 bg-amber-500/15 text-amber-400';
};

const queueKindLabel = (kind?: string | null) => {
  if (kind === 'fifo_ready') return 'FIFO';
  if (kind === 'delayed_zset') return 'Delay';
  if (kind === 'sync_ready') return 'Sync';
  return kind || '-';
};

const summarizeStatus = (item: Partial<ScheduleGlobalTaskListItem> | null | undefined) => {
  return (
    item?.display_status_group ||
    item?.current_status ||
    item?.business_status ||
    item?.dispatch_status ||
    item?.create_status ||
    '-'
  );
};

const getTaskKeyValue = (item: Partial<ScheduleGlobalTaskListItem> | null | undefined) => {
  return item?.root_task_key_prefix || item?.dispatched_task_key_prefix || item?.parent_task_key_prefix || '-';
};

const statusTone = (label?: string | null) => {
  if (label === '成功' || label === 'succeeded') return 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400';
  if (label === '部分成功' || label === 'partial_success') return 'border-amber-500/20 bg-amber-500/15 text-amber-400';
  if (label === '失败' || label === 'failed' || label === 'timeout') return 'border-rose-500/20 bg-rose-500/15 text-rose-400';
  if (label === '重试中' || label === 'retry_wait') return 'border-amber-500/20 bg-amber-500/15 text-amber-400';
  if (label === '进行中' || label === 'running' || label === 'dispatching') return 'border-sky-500/20 bg-sky-500/15 text-sky-400';
  if (label === '排队中' || label === 'queued' || label === 'leased') return 'border-cyan-500/20 bg-cyan-500/15 text-cyan-400';
  return 'border-theme-border bg-theme-elevated text-theme-text-secondary';
};

const normalizeTaskTypeLabel = (taskType?: string | null) => {
  if (taskType === 'binary_firmware_e2e') return '盖亚-二进制固件';
  if (taskType === 'source_scan_e2e') return '盖亚-源码';
  if (taskType === 'binary_module_e2e') return '盖亚-二进制模块';
  return taskType || '-';
};

const formatMainSyncQueue = (queue?: string | null) => {
  if (queue === 'dispatching') return '分发队列';
  if (queue === 'running') return '运行队列';
  if (queue === 'paused') return '暂停队列';
  if (queue === 'retry_wait') return '重试等待队列';
  if (queue === 'terminal_verify') return '终态校验队列';
  return queue || null;
};

const mapUserTaskToGlobalTaskItem = (
  task: ScheduleCenterUserTask,
  projectNameMap: Map<string, string>,
): ScheduleGlobalTaskListItem => ({
  task_id: task.id,
  project_id: task.project_id,
  project_name: projectNameMap.get(task.project_id) || task.project_id,
  task_name: task.name,
  task_type: normalizeTaskTypeLabel(task.task_type),
  root_task_key_prefix: task.root_task_key_prefix,
  parent_task_key_prefix: task.parent_task_key_prefix,
  dispatched_task_key_prefix: task.dispatched_task_key_prefix,
  create_status: task.create_status,
  dispatch_status: task.dispatch_status,
  business_status: task.business_status,
  queue_state: formatMainSyncQueue(task.sync_queue),
  current_status: task.display_status || task.downstream_status_mapped || task.business_status || task.dispatch_status || task.create_status,
  display_status_group: task.display_status || task.downstream_status_mapped || task.business_status || task.dispatch_status || task.create_status,
  retry_count: 0,
  downstream_task_id: task.downstream_task_id,
  downstream_detail_view: task.downstream_detail_view,
  created_by: task.created_by,
  created_at: task.created_at,
  updated_at: task.updated_at,
  started_at: task.started_at || null,
  finished_at: task.finished_at || null,
  last_error: task.last_error,
});

const mapUserTaskToGlobalTaskDetail = (
  task: ScheduleCenterUserTask,
  projectNameMap: Map<string, string>,
): ScheduleGlobalTaskDetail => {
  const item = mapUserTaskToGlobalTaskItem(task, projectNameMap);
  return {
    ...item,
    project_display_name: item.project_name,
    status_summary: {
      display_status: task.display_status,
      sync_status: task.sync_status,
      create_status: task.create_status,
      dispatch_status: task.dispatch_status,
      business_status: task.business_status,
      downstream_status_raw: task.downstream_status_raw,
      downstream_status_mapped: task.downstream_status_mapped,
      last_synced_at: task.last_synced_at,
      next_sync_at: task.next_sync_at,
      last_sync_error: task.last_sync_error,
    },
    current_dispatch: {
      downstream_task_id: task.downstream_task_id,
      downstream_detail_view: task.downstream_detail_view,
      dispatched_task_key_prefix: task.dispatched_task_key_prefix,
      root_task_key_prefix: task.root_task_key_prefix,
      parent_task_key_prefix: task.parent_task_key_prefix,
    },
    latest_dispatch: {
      downstream_task_id: task.downstream_task_id,
      downstream_detail_view: task.downstream_detail_view,
      downstream_status_raw: task.downstream_status_raw,
      downstream_status_mapped: task.downstream_status_mapped,
      sync_status: task.sync_status,
    },
    current_execution: {
      inputs: task.inputs,
      module_name: task.module_name,
      input_upload_count: task.input_upload_count,
    },
    latest_execution: {
      inputs: task.inputs,
      module_name: task.module_name,
      input_upload_count: task.input_upload_count,
    },
    recent_events: [],
    latest_failure: task.last_error ? { message: task.last_error } : null,
  };
};

const fallbackOverviewFromRuntime = (
  runtime: ScheduleRuntimeOverview | null,
  healthStatus?: string | null,
): ScheduleGlobalTaskOverview => ({
  stats: {
    total_tasks: runtime?.stats?.jobs_total ?? 0,
    unprocessed_tasks: 0,
    scheduled_tasks: 0,
    queued_tasks: runtime?.queue?.length ?? 0,
    retry_wait_tasks: 0,
    running_tasks: runtime?.workers?.inflight_executions ?? runtime?.stats?.active_jobs ?? 0,
    succeeded_tasks: runtime?.stats?.succeeded_total ?? 0,
    failed_tasks: runtime?.stats?.failed_total ?? 0,
    cancelled_tasks: 0,
  },
  queue: {
    depth: runtime?.queue?.length ?? 0,
    oldest_age_seconds: runtime?.queue?.oldest_age_seconds ?? 0,
    backend: runtime?.queue?.backend ?? 'unknown',
  },
  workers: {
    active: runtime?.workers?.local_pod ? 1 : 0,
    concurrency: runtime?.workers?.concurrency ?? 0,
    inflight: runtime?.workers?.inflight_executions ?? 0,
  },
  health: {
    status: healthStatus || 'unknown',
    redis_available: Boolean(runtime?.redis_available),
  },
  refreshed_at: new Date().toISOString(),
});

const normalizeOverviewPayload = (
  payload: Partial<ScheduleGlobalTaskOverview> | null | undefined,
  runtime: ScheduleRuntimeOverview | null,
  healthStatus?: string | null,
): ScheduleGlobalTaskOverview => {
  const fallback = fallbackOverviewFromRuntime(runtime, healthStatus);
  return {
    stats: {
      ...fallback.stats,
      ...(payload?.stats || {}),
    },
    queue: {
      ...fallback.queue,
      ...(payload?.queue || {}),
    },
    workers: {
      ...fallback.workers,
      ...(payload?.workers || {}),
    },
    health: {
      ...fallback.health,
      ...(payload?.health || {}),
    },
    refreshed_at: payload?.refreshed_at ?? fallback.refreshed_at,
  };
};

const sortIndicator = (sortField: BackendSortField, activeField: BackendSortField, direction: SortDirection) => {
  if (sortField !== activeField) return <ArrowUpDown size={14} className="text-theme-text-muted" />;
  return (
    direction === 'asc'
      ? <ArrowUp size={14} className="text-theme-text-secondary" />
      : <ArrowDown size={14} className="text-theme-text-secondary" />
  );
};

const DetailDrawer: React.FC<{
  detail: ScheduleGlobalTaskDetail | null;
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onViewTimeline: () => void;
  onRetryDispatch: () => void;
  onDeleteTask: () => void;
}> = ({ detail, open, loading, onClose, onViewTimeline, onRetryDispatch, onDeleteTask }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[2px]">
      <button className="flex-1" aria-label="关闭详情抽屉" onClick={onClose} />
      <aside className="relative h-full w-full max-w-[540px] overflow-y-auto border-l border-theme-border bg-theme-bg-app">
 <div className="sticky top-0 z-10 border-b border-theme-border bg-theme-bg-app px-6 py-5 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="mt-2 text-2xl font-bold text-theme-text-primary">{detail?.task_name || '加载任务详情'}</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${statusTone(detail?.display_status_group)}`}>
                  {summarizeStatus(detail || {})}
                </span>
                {detail?.task_type ? (
                  <span className="rounded-full border border-theme-border bg-theme-bg-app px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-secondary">
                    {detail.task_type}
                  </span>
                ) : null}
              </div>
            </div>
            <button onClick={onClose} className="rounded-lg border border-theme-border p-2 text-theme-text-muted transition hover:bg-theme-elevated hover:text-theme-text-primary">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="space-y-6 px-6 py-6">
          {loading ? (
            <div className="rounded-xl border border-theme-border bg-theme-surface px-6 py-10 text-center text-sm font-bold text-theme-text-muted">
              任务详情加载中...
            </div>
          ) : detail ? (
            <>
              <section className="rounded-xl border border-theme-border bg-theme-surface p-5">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-theme-text-muted">基本信息</div>
                <div className="mt-4 grid gap-3 text-sm text-theme-text-secondary">
                  <div><span className="font-semibold text-theme-text-primary">任务 ID：</span>{detail.task_id}</div>
                  <div><span className="font-semibold text-theme-text-primary">项目：</span>{detail.project_name || detail.project_display_name || detail.project_id || '-'}</div>
                  <div><span className="font-semibold text-theme-text-primary">创建人：</span>{detail.created_by || '-'}</div>
                  <div><span className="font-semibold text-theme-text-primary">Root Task Key：</span>{getTaskKeyValue(detail)}</div>
                  <div><span className="font-semibold text-theme-text-primary">下游任务：</span>{detail.downstream_task_id || '-'}</div>
                </div>
              </section>

              <section className="rounded-xl border border-theme-border bg-theme-surface p-5">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-theme-text-muted">状态摘要</div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 text-sm"><span className="font-semibold text-theme-text-primary">创建态：</span>{detail.create_status || '-'}</div>
                  <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 text-sm"><span className="font-semibold text-theme-text-primary">分发态：</span>{detail.dispatch_status || '-'}</div>
                  <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 text-sm"><span className="font-semibold text-theme-text-primary">业务态：</span>{detail.business_status || '-'}</div>
                  <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 text-sm"><span className="font-semibold text-theme-text-primary">当前态：</span>{detail.current_status || '-'}</div>
                  <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 text-sm"><span className="font-semibold text-theme-text-primary">重试次数：</span>{detail.retry_count ?? 0}</div>
                  <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 text-sm"><span className="font-semibold text-theme-text-primary">最近尝试：</span>{detail.attempt_no ?? '-'}</div>
                </div>
              </section>

              <section className="rounded-xl border border-theme-border bg-theme-surface p-5">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-theme-text-muted">执行窗口</div>
                <div className="mt-4 grid gap-3 text-sm text-theme-text-secondary">
                  <div><span className="font-semibold text-theme-text-primary">计划时间：</span>{formatTime(detail.scheduled_at)}</div>
                  <div><span className="font-semibold text-theme-text-primary">开始时间：</span>{formatTime(detail.started_at)}</div>
                  <div><span className="font-semibold text-theme-text-primary">结束时间：</span>{formatTime(detail.finished_at)}</div>
                  <div><span className="font-semibold text-theme-text-primary">最近失败：</span>{detail.last_error || detail.latest_failure?.message || '-'}</div>
                </div>
              </section>

              <section className="rounded-xl border border-theme-border bg-theme-surface p-5">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-theme-text-muted">最近调度与执行</div>
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 text-sm">
                    <div className="font-semibold text-theme-text-primary">最近 Dispatch</div>
                    <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all text-xs text-theme-text-secondary">{JSON.stringify(detail.latest_dispatch || detail.current_dispatch || {}, null, 2)}</pre>
                  </div>
                  <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 text-sm">
                    <div className="font-semibold text-theme-text-primary">最近 Execution</div>
                    <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all text-xs text-theme-text-secondary">{JSON.stringify(detail.latest_execution || detail.current_execution || {}, null, 2)}</pre>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-theme-border bg-theme-surface p-5">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-theme-text-muted">最近事件摘要</div>
                <div className="mt-4 space-y-3">
                  {(detail.recent_events || []).length ? (
                    (detail.recent_events || []).map((event, index) => (
                      <div key={`${event.id || event.created_at || index}`} className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 text-sm text-theme-text-secondary">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold text-theme-text-primary">{event.event_type || event.type || 'event'}</span>
                          <span className="text-xs text-theme-text-muted">{formatTime(event.created_at || event.ts)}</span>
                        </div>
                        <div className="mt-2 text-xs text-theme-text-secondary">{event.message || JSON.stringify(event.payload || event)}</div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-theme-border bg-theme-surface px-4 py-6 text-center text-sm font-bold text-theme-text-muted">
                      暂无可展示的事件摘要
                    </div>
                  )}
                </div>
              </section>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={onViewTimeline}
                  className="inline-flex items-center gap-2 rounded-2xl border border-theme-border px-4 py-3 text-sm font-medium text-theme-text-secondary transition hover:bg-theme-elevated"
                >
                  <Layers3 size={16} />
                  查看时间线
                </button>
                <button
                  onClick={onRetryDispatch}
                  className="inline-flex items-center gap-2 rounded-2xl bg-theme-surface px-4 py-3 text-sm font-medium text-white transition hover:bg-theme-elevated"
                >
                  <TimerReset size={16} />
                  重试分发
                </button>
                <button
                  onClick={onDeleteTask}
                  className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-rose-700"
                >
                  删除任务
                </button>
                {detail.downstream_detail_view ? (
                  <button
                    onClick={() => window.open(detail.downstream_detail_view || '', '_blank', 'noopener,noreferrer')}
                    className="inline-flex items-center gap-2 rounded-2xl border border-theme-border px-4 py-3 text-sm font-medium text-theme-text-secondary transition hover:bg-theme-elevated"
                  >
                    <Waypoints size={16} />
                    跳转下游任务
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-theme-border bg-theme-surface px-6 py-10 text-center text-sm font-bold text-theme-text-muted">
              当前任务详情暂不可用
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};

const TaskTimelineModal: React.FC<{
  open: boolean;
  loading: boolean;
  taskLabel: string;
  events: ScheduleUserTaskEvent[];
  onClose: () => void;
}> = ({ open, loading, taskLabel, events, onClose }) => {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelectedEventId(null);
    }
  }, [open]);

  if (!open) return null;

  const selectedEvent = events.find((item) => item.id === selectedEventId) || events[0] || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-[2px]">
      <button className="absolute inset-0" aria-label="关闭任务时间线" onClick={onClose} />
      <div className="relative mx-4 flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-theme-border bg-theme-bg-app shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-theme-border px-6 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-theme-text-muted">任务时间线</div>
            <div className="mt-1 text-lg font-semibold text-theme-text-primary">{taskLabel}</div>
          </div>
          <button onClick={onClose} className="rounded-lg border border-theme-border p-2 text-theme-text-muted transition hover:bg-theme-elevated hover:text-theme-text-primary">
            <X size={18} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[1.2fr_0.9fr]">
          <div className="min-h-0 overflow-y-auto border-r border-theme-border">
            {loading ? (
              <div className="px-6 py-12 text-center text-sm font-bold text-theme-text-muted">任务时间线加载中...</div>
            ) : events.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm font-bold text-theme-text-muted">当前任务暂无可展示的时间线事件</div>
            ) : (
              <div className="divide-y divide-theme-border">
                {events.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => setSelectedEventId(event.id)}
                    className={`w-full px-6 py-4 text-left transition hover:bg-slate-100/80 ${selectedEvent?.id === event.id ? 'bg-slate-100/80' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-theme-text-primary">{event.event_type}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${statusTone(event.result_status)}`}>
                            {event.result_status}
                          </span>
                          {event.event_category ? (
                            <span className="rounded-full border border-theme-border bg-theme-surface px-2 py-0.5 text-[11px] font-semibold text-theme-text-secondary">
                              {event.event_category}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 text-sm text-theme-text-secondary">{event.message || '-'}</div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-theme-text-muted">
                          <span>时间：{formatTime(event.created_at)}</span>
                          <span>来源：{event.event_source}{event.actor ? ` / ${event.actor}` : ''}</span>
                          <span>队列：{formatMainSyncQueue(event.sync_queue) || event.sync_queue || '-'}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="min-h-0 overflow-y-auto bg-theme-surface px-6 py-5">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-theme-text-muted">事件详情</div>
            {selectedEvent ? (
              <>
                <div className="mt-4 space-y-2 text-sm text-theme-text-secondary">
                  <div><span className="font-semibold text-theme-text-primary">事件类型：</span>{selectedEvent.event_type}</div>
                  <div><span className="font-semibold text-theme-text-primary">结果：</span>{selectedEvent.result_status}</div>
                  <div><span className="font-semibold text-theme-text-primary">发生时间：</span>{formatTime(selectedEvent.created_at)}</div>
                  <div><span className="font-semibold text-theme-text-primary">下游任务：</span>{selectedEvent.downstream_task_id || '-'}</div>
                  <div><span className="font-semibold text-theme-text-primary">Dispatch ID：</span>{selectedEvent.dispatch_id || '-'}</div>
                </div>
                <div className="mt-4 rounded-2xl border border-theme-border bg-theme-bg-app p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-theme-text-muted">Payload</div>
                  <pre className="mt-3 overflow-auto whitespace-pre-wrap break-all text-xs text-theme-text-secondary">
                    {JSON.stringify(selectedEvent.payload || {}, null, 2)}
                  </pre>
                </div>
              </>
            ) : (
              <div className="mt-4 text-sm font-medium text-theme-text-muted">请选择左侧事件查看详情。</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const ChimeraScheduleCenterPage: React.FC<ChimeraScheduleCenterPageProps> = ({ projects }) => {
  const scheduleApi = api.domains.platform.scheduleCenter;
  const [nav, setNav] = useState<OverviewNav>('overview');
  const [health, setHealth] = useState<{ status?: string; service_name?: string } | null>(null);
  const [runtimeOverview, setRuntimeOverview] = useState<ScheduleRuntimeOverview | null>(null);
  const [queuePreview, setQueuePreview] = useState<ScheduleRuntimeQueuePreview | null>(null);
  const [overview, setOverview] = useState<ScheduleGlobalTaskOverview>(createEmptyOverview());
  const [tableItems, setTableItems] = useState<ScheduleGlobalTaskListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortField, setSortField] = useState<BackendSortField>('updated_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [openColumnFilter, setOpenColumnFilter] = useState<ColumnFilterKey | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(DEFAULT_VISIBLE_COLUMNS);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [errorPopupText, setErrorPopupText] = useState<string | null>(null);
  const [filters, setFilters] = useState<TaskFilters>({
    status: '',
    taskType: '',
    projectId: '',
    isRetrying: false,
    hasError: false,
    search: '',
  });
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<ScheduleGlobalTaskDetail | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [taskTimelineOpen, setTaskTimelineOpen] = useState(false);
  const [taskTimelineLoading, setTaskTimelineLoading] = useState(false);
  const [taskTimelineEvents, setTaskTimelineEvents] = useState<ScheduleUserTaskEvent[]>([]);
  const [taskTimelineTaskLabel, setTaskTimelineTaskLabel] = useState('');
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [loadingTable, setLoadingTable] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [taskEventItems, setTaskEventItems] = useState<ScheduleUserTaskEvent[]>([]);
  const [taskEventTotal, setTaskEventTotal] = useState(0);
  const [taskEventPage, setTaskEventPage] = useState(1);
  const [taskEventPageSize, setTaskEventPageSize] = useState(50);
  const [taskEventLoading, setTaskEventLoading] = useState(false);
  const [selectedTaskEvent, setSelectedTaskEvent] = useState<ScheduleUserTaskEvent | null>(null);
  const [queuePreviewLoading, setQueuePreviewLoading] = useState(false);
  const [queuePreviewAutoRefresh, setQueuePreviewAutoRefresh] = useState(true);
  const [taskEventFilters, setTaskEventFilters] = useState<TaskEventFilters>({
    scope: 'global',
    projectId: '',
    taskId: '',
    taskType: '',
    eventCategory: '',
    resultStatus: '',
    eventSource: '',
    downstreamTaskId: '',
    search: '',
    onlyFailed: false,
  });
  const deferredQuery = useDeferredValue(filters.search);
  const deferredTaskEventQuery = useDeferredValue(taskEventFilters.search);

  const projectNameMap = useMemo(() => {
    const map = new Map<string, string>();
    projects.forEach((project) => {
      map.set(project.id, project.name || project.id);
    });
    return map;
  }, [projects]);

  const projectOptions = useMemo(
    () => [{ id: '', label: '全部项目' }, ...projects.map((project) => ({ id: project.id, label: project.name || project.id }))],
    [projects],
  );

  const queuePreviewItems = useMemo(
    () => (queuePreview?.groups || []).flatMap((group) => group.items || []),
    [queuePreview],
  );

  const queuePreviewSummary = useMemo(() => {
    const readyItem = queuePreviewItems.find((item) => item.queue_key === 'ready');
    const deleteItem = queuePreviewItems.find((item) => item.queue_key === 'delete:ready');
    const delayItem = queuePreviewItems.find((item) => item.queue_key === 'delay');
    const syncTotal = queuePreviewItems
      .filter((item) => item.queue_group === 'user_task_sync')
      .reduce((sum, item) => sum + Number(item.length || 0), 0);
    return {
      readyLength: Number(readyItem?.length || 0),
      deleteLength: Number(deleteItem?.length || 0),
      delayLength: Number(delayItem?.length || 0),
      syncTotal,
    };
  }, [queuePreviewItems]);

  const taskEventStats = useMemo(() => {
    const countBy = (predicate: (event: ScheduleUserTaskEvent) => boolean) =>
      taskEventItems.filter(predicate).length;
    return {
      total: taskEventTotal,
      currentPage: taskEventItems.length,
      succeeded: countBy((event) => event.result_status === 'succeeded'),
      failed: countBy((event) => event.result_status === 'failed' || event.result_status === 'timeout'),
      dispatch: countBy((event) => event.event_category === 'dispatch'),
      sync: countBy((event) => event.event_category === 'sync'),
      delete: countBy((event) => event.event_category === 'delete'),
      stateRefresh: countBy((event) => event.event_category === 'state_refresh'),
    };
  }, [taskEventItems, taskEventTotal]);

  const taskEventStatCards = useMemo(() => [
    { key: 'neutral', label: '事件总数', value: taskEventStats.total, hint: '当前筛选命中的调度日志总数' },
    { key: 'success', label: '成功', value: taskEventStats.succeeded, hint: 'result_status=succeeded 的本页事件' },
    { key: 'failed', label: '失败/超时', value: taskEventStats.failed, hint: 'result_status=failed/timeout 的本页事件' },
    { key: 'running', label: '调度事件', value: taskEventStats.dispatch, hint: 'event_category=dispatch 的本页事件' },
    { key: 'queue', label: '同步事件', value: taskEventStats.sync, hint: 'event_category=sync 的本页事件' },
    { key: 'retry', label: '删除事件', value: taskEventStats.delete, hint: 'event_category=delete 的本页事件' },
    { key: 'neutral', label: '状态刷新', value: taskEventStats.stateRefresh, hint: 'event_category=state_refresh 的本页事件' },
    { key: 'neutral', label: '本页事件', value: taskEventStats.currentPage, hint: '当前页实际加载的事件条数' },
  ], [taskEventStats]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const allVisibleSelected = tableItems.length > 0 && tableItems.every((item) => selectedTaskIds.includes(item.task_id));

  const handleSortChange = (field: BackendSortField) => {
    setSortDirection((current) => (sortField === field ? (current === 'desc' ? 'asc' : 'desc') : 'desc'));
    setSortField(field);
    setPage(1);
  };

  const statCards = useMemo(() => {
    const items = [
      { key: 'total', label: '任务总数', value: overview.stats.total_tasks, hint: '系统中所有调度任务的数量' },
      { key: 'neutral', label: '未处理', value: overview.stats.unprocessed_tasks, hint: '已创建但尚未开始执行的任务' },
      { key: 'neutral', label: '计划中', value: overview.stats.scheduled_tasks, hint: '已安排计划，等待执行的任务' },
      { key: 'queue', label: '排队中', value: overview.stats.queued_tasks, hint: '已进入队列，等待被分配执行' },
      { key: 'retry', label: '重试中', value: overview.stats.retry_wait_tasks, hint: '执行失败后等待自动重试的任务' },
      { key: 'running', label: '进行中', value: overview.stats.running_tasks, hint: '正在执行中的任务' },
      { key: 'success', label: '成功', value: overview.stats.succeeded_tasks, hint: '已成功完成的任务' },
      { key: 'failed', label: '失败', value: overview.stats.failed_tasks, hint: '执行失败或超时的任务' },
      { key: 'queue', label: '当前队列深度', value: overview.queue.depth, hint: '队列中等待执行的任务积压数量' },
      { key: 'neutral', label: '最老等待时长', value: formatDurationSeconds(overview.queue.oldest_age_seconds), hint: '队列中等待最久的任务已等待的时间' },
      { key: 'neutral', label: '活跃 worker 数', value: overview.workers.active, hint: '当前在线可执行任务的调度器数量' },
      { key: 'neutral', label: 'worker 并发总量', value: overview.workers.concurrency, hint: '所有调度器可同时执行的任务上限' },
      { key: 'running', label: '当前 inflight', value: overview.workers.inflight, hint: '正在被调度器执行中的任务数' },
      { key: 'neutral', label: '已取消', value: overview.stats.cancelled_tasks, hint: '被手动取消的任务' },
      { key: 'neutral', label: '最近刷新时间', value: overview.refreshed_at ? formatTime(overview.refreshed_at) : '-', hint: '上次获取统计数据的时间' },
      { key: overview.health.status === 'ok' ? 'success' : 'failed', label: '服务健康', value: overview.health.status || 'unknown', hint: overview.health.redis_available ? '缓存服务正常，调度系统运行良好' : '缓存服务不可用，部分功能可能降级' },
    ];
    return items;
  }, [overview]);

  const loadHealthAndOverview = async (manual = false) => {
    setLoadingOverview(true);
    if (manual) setRefreshing(true);
    try {
      const [healthPayload, runtimePayload, overviewPayload] = await Promise.all([
        scheduleApi.getHealth().catch(() => null),
        scheduleApi.getRuntimeOverview().catch(() => null),
        scheduleApi.getTaskOverview().catch(() => null),
      ]);
      setHealth(healthPayload);
      setRuntimeOverview(runtimePayload);
      if (overviewPayload && typeof overviewPayload === 'object') {
        setOverview(
          normalizeOverviewPayload(
            overviewPayload as Partial<ScheduleGlobalTaskOverview>,
            runtimePayload as ScheduleRuntimeOverview | null,
            healthPayload?.status,
          ),
        );
        setNotice('');
      } else {
        setOverview(fallbackOverviewFromRuntime(runtimePayload as ScheduleRuntimeOverview | null, healthPayload?.status));
        setNotice('全局统计接口尚未就绪，当前展示的是运行时降级视图。');
      }
    } catch (err: any) {
      setOverview(fallbackOverviewFromRuntime(runtimeOverview, health?.status));
      setNotice('调度中心全局统计暂时不可用，已退回基础运行时信息。');
      setError(err?.message || '加载调度中心统计失败');
    } finally {
      setLoadingOverview(false);
      if (manual) setRefreshing(false);
    }
  };

  const loadTasks = async (manual = false) => {
    setLoadingTable(true);
    if (manual) setRefreshing(true);
    try {
      const payload = await scheduleApi.listGlobalTasks({
        search: deferredQuery || undefined,
        status: filters.status || undefined,
        task_type: filters.taskType || undefined,
        has_error: filters.hasError || undefined,
        is_retrying: filters.isRetrying || undefined,
        project_id: filters.projectId || undefined,
        page,
        page_size: pageSize,
        sort_by: sortField,
        sort_direction: sortDirection,
      }) as ScheduleCenterUserTaskListResponse;
      const rawItems = payload.items || [];
      const items = rawItems.map((item) => mapUserTaskToGlobalTaskItem(item, projectNameMap));
      setTableItems(items);
      setTotal(Number(payload.total || 0));
      setSelectedTaskIds((current) => current.filter((taskId) => items.some((item) => item.task_id === taskId)));
      setNotice(filters.projectId ?`当前按项目过滤: ${projectNameMap.get(filters.projectId) || filters.projectId}` : '');
    } catch (err: any) {
      setTableItems([]);
      setTotal(0);
      setNotice('全局任务列表暂时不可用。');
      setError(err?.message || '加载全局任务列表失败');
    } finally {
      setLoadingTable(false);
      if (manual) setRefreshing(false);
    }
  };

  const loadTaskEventLogs = async () => {
    setTaskEventLoading(true);
    try {
      const effectiveProjectId = taskEventFilters.projectId || filters.projectId;
      if (taskEventFilters.scope === 'project' && !effectiveProjectId) {
        setTaskEventItems([]);
        setTaskEventTotal(0);
        setError('');
        setNotice('查看项目级调度日志前，请先选择项目。');
        return;
      }
      const params = {
        task_id: taskEventFilters.taskId || undefined,
        task_type: taskEventFilters.taskType || undefined,
        event_category: taskEventFilters.eventCategory || undefined,
        result_status: taskEventFilters.resultStatus || undefined,
        event_source: taskEventFilters.eventSource || undefined,
        downstream_task_id: taskEventFilters.downstreamTaskId || undefined,
        search: deferredTaskEventQuery || undefined,
        only_failed: taskEventFilters.onlyFailed || undefined,
        page: taskEventPage,
        page_size: taskEventPageSize,
      };
      const payload = taskEventFilters.scope === 'global'
        ? await scheduleApi.listGlobalUserTaskEvents({
            ...params,
            project_id: taskEventFilters.projectId || undefined,
          }) as ScheduleUserTaskEventListResponse
        : await scheduleApi.listProjectUserTaskEvents(effectiveProjectId, params) as ScheduleUserTaskEventListResponse;
      setTaskEventItems(payload.items || []);
      setTaskEventTotal(Number(payload.total || 0));
      if (taskEventFilters.scope === 'project') {
        setNotice(`当前查看项目级调度日志: ${projectNameMap.get(effectiveProjectId) || effectiveProjectId}`);
      }
    } catch (err: any) {
      setTaskEventItems([]);
      setTaskEventTotal(0);
      setError(err?.message || '加载调度日志失败');
    } finally {
      setTaskEventLoading(false);
    }
  };

  const loadQueuePreview = async () => {
    setQueuePreviewLoading(true);
    try {
      const payload = await scheduleApi.getRuntimeQueuePreview() as ScheduleRuntimeQueuePreview;
      setQueuePreview(payload);
    } catch (err: any) {
      setError(err?.message || '加载调度队列预览失败');
    } finally {
      setQueuePreviewLoading(false);
    }
  };

  const handleToggleTaskSelection = (taskId: string, checked: boolean) => {
    setSelectAllMatching(false);
    setSelectedTaskIds((current) => (
      checked ? Array.from(new Set([...current, taskId])) : current.filter((id) => id !== taskId)
    ));
  };

  const handleToggleSelectVisible = (checked: boolean) => {
    setSelectAllMatching(false);
    if (!checked) {
      setSelectedTaskIds((current) => current.filter((taskId) => !tableItems.some((item) => item.task_id === taskId)));
      return;
    }
    setSelectedTaskIds((current) => Array.from(new Set([...current, ...tableItems.map((item) => item.task_id)])));
  };

  useEffect(() => {
    void loadHealthAndOverview();
    void loadQueuePreview();
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [page, pageSize, sortField, sortDirection, filters.status, filters.taskType, filters.projectId, filters.isRetrying, filters.hasError, deferredQuery, projectNameMap]);

  useEffect(() => {
    if (nav !== 'task-event-log') return;
    void loadTaskEventLogs();
  }, [
    nav,
    taskEventFilters.scope,
    taskEventFilters.projectId,
    taskEventFilters.taskId,
    taskEventFilters.taskType,
    taskEventFilters.eventCategory,
    taskEventFilters.resultStatus,
    taskEventFilters.eventSource,
    taskEventFilters.downstreamTaskId,
    taskEventFilters.onlyFailed,
    deferredTaskEventQuery,
    taskEventPage,
    taskEventPageSize,
    filters.projectId,
  ]);

  useEffect(() => {
    if (nav !== 'queue-preview' || !queuePreviewAutoRefresh) return;
    const timer = window.setInterval(() => {
      void loadQueuePreview();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [nav, queuePreviewAutoRefresh]);

  const handleRefresh = async () => {
    setError('');
    await Promise.all([loadHealthAndOverview(true), loadTasks(true), loadQueuePreview()]);
    if (detailOpen && selectedTaskId) {
      await (async () => {
        try {
          setLoadingDetail(true);
          const selected = tableItems.find((item) => item.task_id === selectedTaskId);
          if (!selected?.project_id) return;
          const detail = await scheduleApi.getUserTask(selected.project_id, selectedTaskId) as ScheduleCenterUserTask;
          setSelectedTaskDetail(mapUserTaskToGlobalTaskDetail(detail, projectNameMap));
        } catch {
          // Keep current detail snapshot when refresh detail fails.
        } finally {
          setLoadingDetail(false);
        }
      })();
    }
  };

  const openTaskDetail = async (item: ScheduleGlobalTaskListItem) => {
    startTransition(() => {
      setSelectedTaskId(item.task_id);
      setDetailOpen(true);
      setLoadingDetail(true);
    });
    try {
      if (!item.project_id) {
        throw new Error('缺少 project_id，无法加载项目任务详情');
      }
      const detail = await scheduleApi.getUserTask(item.project_id, item.task_id) as ScheduleCenterUserTask;
      setSelectedTaskDetail(mapUserTaskToGlobalTaskDetail(detail, projectNameMap));
    } catch (err: any) {
      setSelectedTaskDetail(null);
      setError(err?.message || '加载任务详情失败');
    } finally {
      setLoadingDetail(false);
    }
  };

  const openTaskTimeline = async (item: Pick<ScheduleGlobalTaskListItem, 'project_id' | 'task_id' | 'task_name'>) => {
    if (!item.project_id || !item.task_id) {
      setError('缺少 project_id 或 task_id，暂时无法加载任务时间线');
      return;
    }
    startTransition(() => {
      setTaskTimelineTaskLabel(item.task_name || item.task_id);
      setTaskTimelineOpen(true);
      setTaskTimelineLoading(true);
    });
    try {
      const payload = await scheduleApi.listUserTaskEvents(item.project_id, item.task_id, {
        page: 1,
        page_size: 200,
        only_failed: false,
      }) as ScheduleUserTaskEventListResponse;
      setTaskTimelineEvents(payload.items || []);
    } catch (err: any) {
      setTaskTimelineEvents([]);
      setError(err?.message || '加载任务时间线失败');
    } finally {
      setTaskTimelineLoading(false);
    }
  };

  const handleRetryDispatch = async (item: ScheduleGlobalTaskListItem | ScheduleGlobalTaskDetail | null) => {
    if (!item?.project_id || !item.task_id) {
      await showAlert({
        title: '缺少任务上下文',
        message: '当前任务缺少 project_id 或 task_id，暂时无法发起重试分发。',
        tone: 'warning',
      });
      return;
    }
    try {
      await scheduleApi.retryDispatchUserTask(item.project_id, item.task_id, {});
      await showAlert({
        title: '重试已提交',
        message:`任务 ${item.task_name || item.task_id} 的重试分发请求已提交。`,
        tone: 'success',
      });
      await handleRefresh();
    } catch (err: any) {
      setError(err?.message || '重试分发失败');
    }
  };

  const handleLegacyNav = (target: OverviewNav) => {
    setNav(target);
    setDetailOpen(false);
  };

  const handleViewExecution = async (item: ScheduleGlobalTaskListItem) => {
    try {
      if (!item.project_id) {
        throw new Error('缺少 project_id，无法加载执行摘要');
      }
      const detail = await scheduleApi.getUserTask(item.project_id, item.task_id) as ScheduleCenterUserTask;
      await showAlert({
        title:`${item.task_name} 最近执行摘要`,
        message: JSON.stringify({
          inputs: detail.inputs || [],
          module_name: detail.module_name,
          downstream_task_id: detail.downstream_task_id,
          downstream_status_raw: detail.downstream_status_raw,
          downstream_status_mapped: detail.downstream_status_mapped,
        }, null, 2),
        confirmText: '关闭',
        tone: 'info',
      });
    } catch (err: any) {
      setError(err?.message || '加载执行摘要失败');
    }
  };

  const handleDeleteTasks = async (mode: 'selected' | 'filtered', singleItem?: ScheduleGlobalTaskListItem | ScheduleGlobalTaskDetail | null) => {
    if (mode === 'filtered' && !filters.projectId) {
      await showAlert({ title: '缺少项目', message: '全局总览中的批量删除仅支持当前项目范围，请先选择项目过滤。', tone: 'warning' });
      return;
    }
    const targetProjectId = singleItem?.project_id || filters.projectId;
    if (!targetProjectId) {
      await showAlert({ title: '缺少项目', message: '请先选择项目，再执行任务删除。', tone: 'warning' });
      return;
    }
    const targetCount = mode === 'filtered' ? total : singleItem ? 1 : selectedTaskIds.length;
    if (!targetCount) {
      await showAlert({ title: '未选择任务', message: '请先勾选任务，或选择按当前筛选结果批量删除。', tone: 'warning' });
      return;
    }
    const confirmed = await showConfirm({
      title: '确认删除任务',
      message:`当前项目：${projectNameMap.get(targetProjectId) || targetProjectId}\n删除范围：${mode === 'filtered' ?`当前筛选命中的 ${targetCount} 条任务` :`${targetCount} 条任务`}\n\n删除会先同步删除下游任务；失败项不会删除父任务。`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    try {
      const payload = mode === 'filtered'
        ? {
            select_all_matching: true,
            filters: {
              status: filters.status || undefined,
              task_type: filters.taskType || undefined,
              search: deferredQuery || undefined,
              has_error: filters.hasError,
              is_retrying: filters.isRetrying,
            },
          }
        : {
            task_ids: singleItem?.task_id ? [singleItem.task_id] : selectedTaskIds,
            select_all_matching: false,
          };
      const result = await scheduleApi.bulkDeleteUserTasks(targetProjectId, payload) as ScheduleCenterUserTaskBulkDeleteResult;
      const failedLines = (result.results || [])
        .filter((item) => !['queued', 'already_queued', 'already_deleted'].includes(item.status))
        .slice(0, 10)
        .map((item) =>`${item.task_id}: ${item.message}`)
        .join('\n');
      await showAlert({
        title: '删除任务结果',
        message:`请求 ${result.total_requested} 条，已入队 ${result.queued_count} 条，已在队列中 ${result.already_queued_count} 条，失败 ${result.failed_count} 条。${failedLines ?`\n\n失败详情：\n${failedLines}` : ''}`,
        tone: result.failed_count ? 'warning' : 'success',
      });
      setSelectedTaskIds([]);
      setSelectAllMatching(false);
      if (singleItem?.task_id && selectedTaskId === singleItem.task_id) {
        setDetailOpen(false);
        setSelectedTaskDetail(null);
        setSelectedTaskId('');
      }
      await handleRefresh();
    } catch (err: any) {
      setError(err?.message || '删除任务失败');
    }
  };

  const legacySectionContent: Record<Exclude<OverviewNav, 'overview'>, { title: string; summary: string; bullets: string[] }> = {
    'job-templates': {
      title: '作业模板',
      summary: '原首页中的项目内调度作业控制台已从主视图下沉。当前首页专注全局任务监控，模板编辑能力作为二级能力保留。',
      bullets: [
        '这里后续承接项目级 job 配置、触发策略和目标编排编辑。',
        '本轮首页已经把跨项目任务监控与项目内模板编辑彻底拆开，避免同页混合。',
        '旧接口能力保持兼容，后续可在独立子页恢复完整编辑台。',
      ],
    },
    'queue-preview': {
      title: '调度队列',
      summary: '集中查看调度执行、删除维护和用户任务同步队列的长度、等待时长和消费运行时。',
      bullets: [
        '只展示真实队列，不展示 leader、lease 和 bucket 计数器。',
        '同步队列按固定优先级展示，便于排查状态收敛顺序。',
        '页面支持独立自动刷新，不影响其他调度前台视图。',
      ],
    },
    'execution-log': {
      title: '执行记录',
      summary: '执行记录和完整事件流不再占据首页主布局，避免首页退回到旧三栏控制台模式。',
      bullets: [
        '首页保留“查看详情”和“查看执行记录”入口，用于快速定位单任务运行态。',
        '完整 execution timeline 后续建议收敛到独立执行记录子页。',
        '当前全局任务详情抽屉已经承接最近 dispatch、execution 和事件摘要。',
      ],
    },
    'task-event-log': {
      title: '调度日志',
      summary: '查看 user task 维度的调度、同步、删除和状态刷新事件，支持项目范围与全局范围切换。',
      bullets: [
        '所有筛选都走后端查询与分页。',
        '默认项目范围，也可切换到跨项目全局日志。',
        '点击事件行可查看完整 payload 细节。',
      ],
    },
    'key-vault': {
      title: 'Key 管理',
      summary: 'Key 管理能力仍保留，但不再和全局任务监控并排混布，避免首页信息层级失衡。',
      bullets: [
        '首页只展示与任务实例直接相关的 Root Task Key 摘要。',
        '完整 key 生命周期、同步和禁用操作建议保留在专门的二级管理页。',
        '现有接口路径不变，后续可直接挂接独立的 Key 管理子页。',
      ],
    },
  };

  const renderNavButtons = () => (
    <div className="flex flex-wrap gap-2">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = item.key === nav;
        return (
          <button
            key={item.key}
            onClick={() => handleLegacyNav(item.key)}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition ${
              active
 ? 'bg-theme-surface text-white '
                : 'border border-theme-border bg-theme-bg-app text-theme-text-secondary hover:bg-theme-elevated'
            }`}
          >
            <Icon size={16} />
            {item.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-full bg-theme-bg-app px-4 py-5 md:px-6 2xl:px-8">
      <div className="w-full space-y-4">
        {notice ? (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/15 px-5 py-4 text-sm font-bold text-amber-400">
            {notice}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/15 px-5 py-4 text-sm font-bold text-rose-400">
            {error}
          </div>
        ) : null}

        {nav === 'overview' ? (
          <>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {renderNavButtons()}
              <div className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-bold text-theme-text-secondary">
                <Layers3 size={16} />
                总计 {formatCount(total)}
              </div>
              <button
                onClick={() => void handleRefresh()}
                className="inline-flex items-center gap-2 rounded-xl bg-theme-surface px-3 py-2 text-sm font-medium text-white transition hover:bg-theme-elevated disabled:opacity-60"
                disabled={refreshing}
              >
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                刷新
              </button>
            </div>

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
              {statCards.map((card, index) => (
                <article
                  key={`${card.label}-${index}`}
 className={`rounded-xl border border-theme-border bg-theme-surface p-4`}
                >
                  <div className="truncate text-center text-xs font-bold text-theme-text-muted" title={card.hint}>{card.label}</div>
                  <div className={`mt-1.5 truncate text-center font-semibold tabular-nums text-theme-text-primary ${card.label === '最近刷新时间' ? 'text-[10px]' : 'text-sm'}`} title={`${card.value}`}>{typeof card.value === 'string' ? card.value : formatCount(card.value as number)}</div>
                </article>
              ))}
            </section>

 <section className="overflow-hidden rounded-2xl border border-theme-border bg-theme-surface">

              <div className="border-b border-theme-border bg-slate-50/70 px-4 py-4 md:px-5">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.5fr_repeat(4,minmax(0,0.9fr))] 2xl:grid-cols-[1.7fr_repeat(4,minmax(0,0.85fr))_auto] xl:items-end">
                  <div className="block">
                    <div className="flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2">
                      <Search size={16} className="text-theme-text-muted" />
                      <input
                        value={filters.search}
                        onChange={(event) => {
                          const next = event.target.value;
                          setFilters((current) => ({ ...current, search: next }));
                          if (page !== 1) setPage(1);
                        }}
                        placeholder="任务名 / 下游任务 ID / 创建人"
                        className="w-full bg-transparent text-sm font-medium text-theme-text-primary outline-none placeholder:text-theme-text-muted"
                      />
                    </div>
                  </div>

                  <div className="block">
                    <select
                      value={filters.status}
                      onChange={(event) => {
                        setFilters((current) => ({ ...current, status: event.target.value }));
                        setPage(1);
                      }}
                      className="w-full rounded-xl border border-theme-border bg-theme-bg-app px-3 py-2 text-sm font-medium text-theme-text-primary outline-none"
                    >
                      {STATUS_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="block">
                    <select
                      value={filters.taskType}
                      onChange={(event) => {
                        setFilters((current) => ({ ...current, taskType: event.target.value }));
                        setPage(1);
                      }}
                      className="w-full rounded-xl border border-theme-border bg-theme-bg-app px-3 py-2 text-sm font-medium text-theme-text-primary outline-none"
                    >
                      {TASK_TYPE_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="block">
                    <select
                      value={filters.projectId}
                      onChange={(event) => {
                        setFilters((current) => ({ ...current, projectId: event.target.value }));
                        setPage(1);
                      }}
                      className="w-full rounded-xl border border-theme-border bg-theme-bg-app px-3 py-2 text-sm font-medium text-theme-text-primary outline-none"
                    >
                      {projectOptions.map((item) => (
                        <option key={item.id} value={item.id}>{item.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="block">
                    <select
                      value={pageSize}
                      onChange={(event) => {
                        setPageSize(Number(event.target.value));
                        setPage(1);
                      }}
                      className="w-full rounded-xl border border-theme-border bg-theme-bg-app px-3 py-2 text-sm font-medium text-theme-text-primary outline-none"
                    >
                      {PAGE_SIZE_OPTIONS.map((value) => (
                        <option key={value} value={value}>{value}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 md:col-span-2 xl:col-span-5 2xl:col-span-1 2xl:justify-end">
                    <label className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-medium text-theme-text-secondary">
                      <input
                        type="checkbox"
                        checked={selectAllMatching}
                        onChange={(event) => {
                          setSelectAllMatching(event.target.checked);
                          if (event.target.checked) setSelectedTaskIds([]);
                        }}
                        className="h-4 w-4 rounded border-theme-border"
                      />
                      删除全部筛选结果
                    </label>
                    <label className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-medium text-theme-text-secondary">
                      <input
                        type="checkbox"
                        checked={filters.isRetrying}
                        onChange={(event) => {
                          setFilters((current) => ({ ...current, isRetrying: event.target.checked }));
                          setPage(1);
                        }}
                        className="h-4 w-4 rounded border-theme-border"
                      />
                      仅重试中
                    </label>
                    <label className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-medium text-theme-text-secondary">
                      <input
                        type="checkbox"
                        checked={filters.hasError}
                        onChange={(event) => {
                          setFilters((current) => ({ ...current, hasError: event.target.checked }));
                          setPage(1);
                        }}
                        className="h-4 w-4 rounded border-theme-border"
                      />
                      仅失败
                    </label>
                    <button
                      type="button"
                      onClick={() => void handleDeleteTasks(selectAllMatching ? 'filtered' : 'selected')}
                      disabled={(selectAllMatching && !filters.projectId) || (!selectAllMatching && selectedTaskIds.length === 0)}
                      className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      删除任务
                    </button>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto px-4 py-4 md:px-5">
                <table className="min-w-full border-separate border-spacing-0 text-sm">
                  <thead className="bg-theme-bg-app">
                    <tr className="text-left text-xs font-bold text-theme-text-muted">
                      <th className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={(event) => handleToggleSelectVisible(event.target.checked)}
                          className="h-4 w-4 rounded border-theme-border"
                        />
                      </th>
                      {visibleColumns.has('name') ? (
                        <th className="px-4 py-2">
                          <button type="button" onClick={() => handleSortChange('name')} className="inline-flex items-center gap-2">
                            任务名称
                            {sortIndicator('name', sortField, sortDirection)}
                          </button>
                        </th>
                      ) : null}
                      {visibleColumns.has('taskType') ? (
                        <th className="relative px-4 py-2">
                          <div className="inline-flex items-center gap-2">
                            <button type="button" onClick={() => handleSortChange('task_type')} className="inline-flex items-center gap-2">
                              任务类型
                              {sortIndicator('task_type', sortField, sortDirection)}
                            </button>
                            <button type="button" onClick={() => setOpenColumnFilter((current) => current === 'taskType' ? null : 'taskType')} className="text-theme-text-muted hover:text-theme-text-secondary">
                              <ChevronDown size={14} />
                            </button>
                          </div>
                          {openColumnFilter === 'taskType' ? (
 <div className="absolute left-0 top-full z-20 mt-2 w-56 rounded-xl border border-theme-border bg-theme-surface p-2">
                              {TASK_TYPE_OPTIONS.map((item) => (
                                <button
                                  key={item.value}
                                  type="button"
                                  onClick={() => {
                                    setFilters((current) => ({ ...current, taskType: item.value }));
                                    setOpenColumnFilter(null);
                                    setPage(1);
                                  }}
                                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium text-theme-text-secondary hover:bg-theme-elevated"
                                >
                                  <span>{item.label}</span>
                                  {filters.taskType === item.value ? <Check size={14} className="text-theme-text-secondary" /> : null}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </th>
                      ) : null}
                      {visibleColumns.has('status') ? (
                        <th className="relative px-4 py-2">
                          <div className="inline-flex items-center gap-2">
                            <button type="button" onClick={() => handleSortChange('downstream_status_mapped')} className="inline-flex items-center gap-2">
                              状态
                              {sortIndicator('downstream_status_mapped', sortField, sortDirection)}
                            </button>
                            <button type="button" onClick={() => setOpenColumnFilter((current) => current === 'status' ? null : 'status')} className="text-theme-text-muted hover:text-theme-text-secondary">
                              <ChevronDown size={14} />
                            </button>
                          </div>
                          {openColumnFilter === 'status' ? (
 <div className="absolute left-0 top-full z-20 mt-2 w-56 rounded-xl border border-theme-border bg-theme-surface p-2">
                              {STATUS_OPTIONS.map((item) => (
                                <button
                                  key={item.value}
                                  type="button"
                                  onClick={() => {
                                    setFilters((current) => ({ ...current, status: item.value }));
                                    setOpenColumnFilter(null);
                                    setPage(1);
                                  }}
                                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium text-theme-text-secondary hover:bg-theme-elevated"
                                >
                                  <span>{item.label}</span>
                                  {filters.status === item.value ? <Check size={14} className="text-theme-text-secondary" /> : null}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </th>
                      ) : null}
                      {visibleColumns.has('project') ? <th className="px-4 py-2">项目</th> : null}
                      {visibleColumns.has('queueState') ? (
                        <th className="px-4 py-2">
                          <button type="button" onClick={() => handleSortChange('business_status')} className="inline-flex items-center gap-2">
                            队列状态
                            {sortIndicator('business_status', sortField, sortDirection)}
                          </button>
                        </th>
                      ) : null}
                      {visibleColumns.has('retryCount') ? <th className="px-4 py-2">重试次数</th> : null}
                      {visibleColumns.has('createdBy') ? (
                        <th className="px-4 py-2">
                          <button type="button" onClick={() => handleSortChange('created_by')} className="inline-flex items-center gap-2">
                            创建人
                            {sortIndicator('created_by', sortField, sortDirection)}
                          </button>
                        </th>
                      ) : null}
                      {visibleColumns.has('createdAt') ? (
                        <th className="px-4 py-2">
                          <button type="button" onClick={() => handleSortChange('created_at')} className="inline-flex items-center gap-2">
                            创建时间
                            {sortIndicator('created_at', sortField, sortDirection)}
                          </button>
                        </th>
                      ) : null}
                      {visibleColumns.has('updatedAt') ? (
                        <th className="px-4 py-2">
                          <button type="button" onClick={() => handleSortChange('updated_at')} className="inline-flex items-center gap-2">
                            更新时间
                            {sortIndicator('updated_at', sortField, sortDirection)}
                          </button>
                        </th>
                      ) : null}
                      {visibleColumns.has('timeRange') ? <th className="px-4 py-2">开始 / 结束时间</th> : null}
                      {visibleColumns.has('actions') ? <th className="px-4 py-2">操作</th> : null}
                      <th className="relative px-4 py-2">
                        <button type="button" onClick={() => setColumnPickerOpen((v) => !v)} className="inline-flex items-center gap-1 text-theme-text-muted hover:text-theme-text-secondary" title="选择列">
                          <Waypoints size={14} />
                        </button>
                        {columnPickerOpen ? (
 <div className="absolute right-0 top-full z-30 mt-2 w-48 rounded-xl border border-theme-border bg-theme-surface p-2">
                            {ALL_COLUMNS.map((col) => (
                              <label key={col.key} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-theme-text-secondary hover:bg-theme-elevated">
                                <input
                                  type="checkbox"
                                  checked={visibleColumns.has(col.key)}
                                  onChange={() => {
                                    setVisibleColumns((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(col.key)) next.delete(col.key); else next.add(col.key);
                                      return next;
                                    });
                                  }}
                                  className="h-4 w-4 rounded border-theme-border"
                                />
                                {col.label}
                              </label>
                            ))}
                          </div>
                        ) : null}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingTable ? (
                      <tr>
                        <td colSpan={2 + visibleColumns.size} className="px-4 py-12 text-center text-sm font-bold text-theme-text-muted">
                          全局任务列表加载中...
                        </td>
                      </tr>
                    ) : tableItems.length ? (
                      tableItems.map((item) => (
                        <tr key={item.task_id} className="border-b border-theme-border hover:bg-slate-100/80">
                          <td className="px-4 py-3 align-top">
                            <input
                              type="checkbox"
                              checked={selectedTaskIds.includes(item.task_id)}
                              onChange={(event) => handleToggleTaskSelection(item.task_id, event.target.checked)}
                              className="h-4 w-4 rounded border-theme-border"
                            />
                          </td>
                          {visibleColumns.has('name') ? (
                            <td className="px-4 py-3 align-top">
                              <div className="font-bold text-theme-text-primary">{item.task_name || item.task_id}</div>
                              <div className="mt-1 max-w-[260px] truncate text-xs text-theme-text-muted" title={item.task_id}>{item.task_id}</div>
                            </td>
                          ) : null}
                          {visibleColumns.has('taskType') ? <td className="px-4 py-3 align-top text-sm font-medium text-theme-text-secondary">{item.task_type || '-'}</td> : null}
                          {visibleColumns.has('status') ? (
                            <td className="px-4 py-3 align-top">
                              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusTone(item.display_status_group)}`}>
                                {summarizeStatus(item)}
                              </span>
                            </td>
                          ) : null}
                          {visibleColumns.has('project') ? <td className="px-4 py-3 align-top text-sm font-medium text-theme-text-secondary">{item.project_name || item.project_id || '-'}</td> : null}
                          {visibleColumns.has('queueState') ? (
                            <td className="px-4 py-3 align-top text-sm font-medium text-theme-text-secondary" title={item.queue_state || undefined}>
                              {item.queue_state || '-'}
                            </td>
                          ) : null}
                          {visibleColumns.has('retryCount') ? <td className="px-4 py-3 align-top text-sm font-medium text-theme-text-secondary">{item.retry_count ?? 0}</td> : null}
                          {visibleColumns.has('createdBy') ? <td className="max-w-[100px] truncate px-4 py-3 align-top text-sm font-medium text-theme-text-secondary" title={item.created_by || undefined}>{item.created_by || '-'}</td> : null}
                          {visibleColumns.has('createdAt') ? <td className="px-4 py-3 align-top text-xs font-medium text-theme-text-secondary">{formatTime(item.created_at)}</td> : null}
                          {visibleColumns.has('updatedAt') ? <td className="px-4 py-3 align-top text-xs font-medium text-theme-text-secondary">{formatTime(item.updated_at)}</td> : null}
                          {visibleColumns.has('timeRange') ? <td className="px-4 py-3 align-top">{renderTaskTimeRange(item.started_at, item.finished_at)}</td> : null}
                          {visibleColumns.has('actions') ? (
                            <td className="px-4 py-3 align-top">
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => void openTaskDetail(item)}
                                  title="查看详情"
                                  aria-label="查看详情"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-theme-border text-theme-text-secondary transition hover:bg-theme-bg-app"
                                >
                                  <Eye size={15} />
                                </button>
                                <button
                                  onClick={() => void handleViewExecution(item)}
                                  title="查看执行记录"
                                  aria-label="查看执行记录"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-theme-border text-theme-text-secondary transition hover:bg-theme-bg-app"
                                >
                                  <ListChecks size={15} />
                                </button>
                                <button
                                  onClick={() => void openTaskTimeline(item)}
                                  title="查看时间线"
                                  aria-label="查看时间线"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-theme-border text-theme-text-secondary transition hover:bg-theme-bg-app"
                                >
                                  <Layers3 size={15} />
                                </button>
                                <button
                                  onClick={() => void handleRetryDispatch(item)}
                                  title="重试分发"
                                  aria-label="重试分发"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-theme-surface text-white transition hover:bg-theme-elevated"
                                >
                                  <RotateCcw size={15} />
                                </button>
                                <button
                                  onClick={() => void handleDeleteTasks('selected', item)}
                                  title="删除任务"
                                  aria-label="删除任务"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-rose-600 text-white transition hover:bg-rose-700"
                                >
                                  <Trash2 size={15} />
                                </button>
                                {item.downstream_detail_view ? (
                                  <button
                                    onClick={() => window.open(item.downstream_detail_view || '', '_blank', 'noopener,noreferrer')}
                                    title="跳转下游任务"
                                    aria-label="跳转下游任务"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-theme-border text-theme-text-secondary transition hover:bg-theme-bg-app"
                                  >
                                    <ExternalLink size={15} />
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          ) : null}
                          <td />
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={2 + visibleColumns.size} className="px-4 py-12">
                          <div className="rounded-2xl border border-dashed border-theme-border bg-theme-surface px-6 py-10 text-center">
 <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-theme-bg-app">
                              <AlertCircle className="text-theme-text-muted" size={24} />
                            </div>
                            <div className="mt-4 text-lg font-semibold text-theme-text-primary">当前没有可展示的全局任务</div>
                            <div className="mt-2 text-sm font-semibold text-theme-text-muted">
                              当前项目下没有命中筛选条件的任务，或任务已被批量删除。
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-theme-border bg-slate-50/70 px-4 py-3 md:px-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="text-sm font-semibold text-theme-text-muted">
                    第 {page} / {totalPages} 页，共 {formatCount(total)} 条
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                      disabled={page <= 1}
                      className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-bold text-theme-text-secondary transition hover:bg-theme-elevated disabled:opacity-50"
                    >
                      <ChevronLeft size={16} />
                      上一页
                    </button>
                    <button
                      onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                      disabled={page >= totalPages}
                      className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-bold text-theme-text-secondary transition hover:bg-theme-elevated disabled:opacity-50"
                    >
                      下一页
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </>
        ) : nav === 'task-event-log' ? (
          <>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {renderNavButtons()}
              <div className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-bold text-theme-text-secondary">
                <Layers3 size={16} />
                总计 {formatCount(taskEventTotal)}
              </div>
              <button onClick={() => void loadTaskEventLogs()} className="inline-flex items-center gap-2 rounded-xl bg-theme-surface px-3 py-2 text-sm font-medium text-white transition hover:bg-theme-elevated">
                <RefreshCw size={16} className={taskEventLoading ? 'animate-spin' : ''} />
                刷新日志
              </button>
            </div>

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
              {taskEventStatCards.map((card, index) => (
                <article
                  key={`${card.label}-${index}`}
 className={`rounded-xl border border-theme-border bg-theme-surface p-4`}
                >
                  <div className="truncate text-center text-xs font-bold text-theme-text-muted" title={card.hint}>{card.label}</div>
                  <div className="mt-1.5 truncate text-center text-sm font-semibold tabular-nums text-theme-text-primary" title={`${card.value}`}>{formatCount(card.value as number)}</div>
                </article>
              ))}
            </section>


 <section className="overflow-hidden rounded-2xl border border-theme-border bg-theme-surface">
              <div className="border-b border-theme-border bg-slate-50/70 px-4 py-4 md:px-5">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-theme-text-primary">调度日志</h2>
                  <p className="mt-1 text-sm font-medium text-theme-text-muted">查看任务级调度、同步、删除与状态刷新事件。</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                  <label className="text-sm font-bold text-theme-text-secondary">
                  范围
                  <select value={taskEventFilters.scope} onChange={(e) => { setTaskEventFilters((current) => ({ ...current, scope: e.target.value as 'project' | 'global' })); setTaskEventPage(1); }} className="mt-2 w-full rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text-primary">
                    <option value="project">当前项目</option>
                    <option value="global">全局</option>
                  </select>
                </label>
                  <label className="text-sm font-bold text-theme-text-secondary">
                  项目
                  <select value={taskEventFilters.projectId} onChange={(e) => { setTaskEventFilters((current) => ({ ...current, projectId: e.target.value })); setTaskEventPage(1); }} className="mt-2 w-full rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text-primary">
                    <option value="">
                      {taskEventFilters.scope === 'global'
                        ? '全部项目'
                        : (filters.projectId ? '跟随当前项目' : '请选择项目')}
                    </option>
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.name || project.id}</option>)}
                  </select>
                </label>
                <label className="text-sm font-bold text-theme-text-secondary">
                  任务类型
                  <input value={taskEventFilters.taskType} onChange={(e) => { setTaskEventFilters((current) => ({ ...current, taskType: e.target.value })); setTaskEventPage(1); }} className="mt-2 w-full rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text-primary" placeholder="binary_firmware_e2e" />
                </label>
                <label className="text-sm font-bold text-theme-text-secondary">
                  事件分类
                  <input value={taskEventFilters.eventCategory} onChange={(e) => { setTaskEventFilters((current) => ({ ...current, eventCategory: e.target.value })); setTaskEventPage(1); }} className="mt-2 w-full rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text-primary" placeholder="dispatch / sync / delete" />
                </label>
                <label className="text-sm font-bold text-theme-text-secondary">
                  结果
                  <input value={taskEventFilters.resultStatus} onChange={(e) => { setTaskEventFilters((current) => ({ ...current, resultStatus: e.target.value })); setTaskEventPage(1); }} className="mt-2 w-full rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text-primary" placeholder="failed / succeeded" />
                </label>
                <label className="text-sm font-bold text-theme-text-secondary">
                  来源
                  <input value={taskEventFilters.eventSource} onChange={(e) => { setTaskEventFilters((current) => ({ ...current, eventSource: e.target.value })); setTaskEventPage(1); }} className="mt-2 w-full rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text-primary" placeholder="api / worker / sync_worker" />
                </label>
                <label className="text-sm font-bold text-theme-text-secondary xl:col-span-2">
                  关键词
                  <div className="mt-2 flex items-center rounded-xl border border-theme-border bg-theme-surface px-3 py-2">
                    <Search size={14} className="text-theme-text-muted" />
                    <input value={taskEventFilters.search} onChange={(e) => { setTaskEventFilters((current) => ({ ...current, search: e.target.value })); setTaskEventPage(1); }} className="ml-2 w-full bg-transparent text-sm text-theme-text-primary outline-none" placeholder="任务ID / message / actor / 下游任务ID" />
                  </div>
                </label>
                <label className="text-sm font-bold text-theme-text-secondary">
                  任务 ID
                  <input value={taskEventFilters.taskId} onChange={(e) => { setTaskEventFilters((current) => ({ ...current, taskId: e.target.value })); setTaskEventPage(1); }} className="mt-2 w-full rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text-primary" />
                </label>
                <label className="text-sm font-bold text-theme-text-secondary">
                  下游任务 ID
                  <input value={taskEventFilters.downstreamTaskId} onChange={(e) => { setTaskEventFilters((current) => ({ ...current, downstreamTaskId: e.target.value })); setTaskEventPage(1); }} className="mt-2 w-full rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text-primary" />
                </label>
                <label className="inline-flex items-center gap-2 text-sm font-bold text-theme-text-secondary xl:self-end">
                  <input type="checkbox" checked={taskEventFilters.onlyFailed} onChange={(e) => { setTaskEventFilters((current) => ({ ...current, onlyFailed: e.target.checked })); setTaskEventPage(1); }} />
                  仅失败
                </label>
              </div>
            </div>

              <div className="overflow-x-auto px-4 py-4 md:px-5">
                <table className="min-w-full border-separate border-spacing-0 text-sm">
                  <thead className="bg-theme-bg-app text-left text-xs font-bold text-theme-text-muted">
                    <tr>
                      <th className="px-4 py-3">时间</th>
                      <th className="px-4 py-3">项目</th>
                      <th className="px-4 py-3">任务 ID</th>
                      <th className="px-4 py-3">任务类型</th>
                      <th className="px-4 py-3">事件分类</th>
                      <th className="px-4 py-3">事件类型</th>
                      <th className="px-4 py-3">结果</th>
                      <th className="px-4 py-3">来源</th>
                      <th className="px-4 py-3">下游任务 ID</th>
                      <th className="px-4 py-3">摘要</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taskEventLoading ? <tr><td colSpan={10} className="px-4 py-10 text-center text-sm text-theme-text-muted">调度日志加载中...</td></tr> : null}
                    {!taskEventLoading && taskEventItems.length === 0 ? <tr><td colSpan={10} className="px-4 py-10 text-center text-sm text-theme-text-muted">暂无调度日志</td></tr> : null}
                    {taskEventItems.map((event) => (
                      <tr key={event.id} className="cursor-pointer border-b border-theme-border hover:bg-slate-100/80" onClick={() => setSelectedTaskEvent(event)}>
                        <td className="px-4 py-3 text-xs">{formatTime(event.created_at)}</td>
                        <td className="px-4 py-3 text-xs">{event.project_id}</td>
                        <td className="px-4 py-3 font-mono text-xs">{event.user_task_id}</td>
                        <td className="px-4 py-3 text-xs">{event.task_type}</td>
                        <td className="px-4 py-3 text-xs">{event.event_category}</td>
                        <td className="px-4 py-3 text-xs font-semibold">{event.event_type}</td>
                        <td className="px-4 py-3 text-xs">{event.result_status}</td>
                        <td className="px-4 py-3 text-xs">{event.event_source}{event.actor ?`/${event.actor}` : ''}</td>
                        <td className="px-4 py-3 font-mono text-xs">{event.downstream_task_id || '-'}</td>
                        <td className="max-w-[320px] px-4 py-3 text-xs text-theme-text-secondary">{event.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-theme-border bg-slate-50/70 px-4 py-3 md:px-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="text-sm font-semibold text-theme-text-muted">第 {taskEventPage} 页，共 {Math.max(1, Math.ceil(taskEventTotal / taskEventPageSize))} 页，共 {formatCount(taskEventTotal)} 条</div>
                  <div className="flex items-center gap-3">
                  <select value={taskEventPageSize} onChange={(e) => { setTaskEventPageSize(Number(e.target.value)); setTaskEventPage(1); }} className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-semibold text-theme-text-secondary">
                    {[20, 50, 100, 200, 500, 1000].map((size) => <option key={size} value={size}>{size} / 页</option>)}
                  </select>
                  <button onClick={() => setTaskEventPage((current) => Math.max(1, current - 1))} disabled={taskEventPage <= 1} className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-bold text-theme-text-secondary transition hover:bg-theme-elevated disabled:opacity-50">
                    <ChevronLeft size={16} />
                    上一页
                  </button>
                  <button onClick={() => setTaskEventPage((current) => current + 1)} disabled={taskEventPage * taskEventPageSize >= taskEventTotal} className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-bold text-theme-text-secondary transition hover:bg-theme-elevated disabled:opacity-50">
                    下一页
                    <ChevronRight size={16} />
                  </button>
                  </div>
                </div>
              </div>

              {selectedTaskEvent ? (
                <div className="border-t border-theme-border bg-slate-50/70 px-4 py-4 md:px-5">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-theme-text-primary">事件详情：{selectedTaskEvent.event_type}</div>
                    <button onClick={() => setSelectedTaskEvent(null)} className="rounded-lg p-1 text-theme-text-muted hover:bg-theme-elevated"><X size={16} /></button>
                  </div>
                  <pre className="mt-4 overflow-auto whitespace-pre-wrap break-all rounded-2xl border border-theme-border bg-theme-surface p-4 text-xs text-theme-text-secondary">{JSON.stringify(selectedTaskEvent, null, 2)}</pre>
                </div>
              ) : null}
            </section>
          </>
        ) : nav === 'queue-preview' ? (
          <>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {renderNavButtons()}
              <div className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-bold text-theme-text-secondary">
                <Layers3 size={16} />
                总计 {formatCount(queuePreviewItems.length)} 队列
              </div>
              <label className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-bold text-theme-text-secondary">
                <input
                  type="checkbox"
                  checked={queuePreviewAutoRefresh}
                  onChange={(event) => setQueuePreviewAutoRefresh(event.target.checked)}
                  className="h-4 w-4 rounded border-theme-border"
                />
                自动刷新
              </label>
              <button
                onClick={() => void loadQueuePreview()}
                className="inline-flex items-center gap-2 rounded-xl bg-theme-surface px-3 py-2 text-sm font-medium text-white transition hover:bg-theme-elevated disabled:opacity-60"
                disabled={queuePreviewLoading}
              >
                <RefreshCw size={16} className={queuePreviewLoading ? 'animate-spin' : ''} />
                刷新
              </button>
            </div>

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
 <article className="rounded-xl border border-theme-border bg-theme-surface p-4">
                <div className="truncate text-center text-xs font-bold text-theme-text-muted">Redis 状态</div>
                <div className="mt-1.5 truncate text-center text-sm font-semibold text-theme-text-primary">{queuePreview?.redis_available ? 'Available' : 'Fallback'}</div>
                <div className="mt-1 truncate text-center text-xs font-bold text-theme-text-muted">Backend {queuePreview?.backend || 'unknown'}</div>
              </article>
 <article className="rounded-xl border border-theme-border bg-theme-surface p-4">
                <div className="truncate text-center text-xs font-bold text-theme-text-muted">主执行 / 删除</div>
                <div className="mt-1.5 truncate text-center text-sm font-semibold text-theme-text-primary">{formatCount(queuePreviewSummary.readyLength)} / {formatCount(queuePreviewSummary.deleteLength)}</div>
                <div className="mt-1 truncate text-center text-xs font-bold text-theme-text-muted">同步总排队 {formatCount(queuePreviewSummary.syncTotal)}</div>
              </article>
 <article className="rounded-xl border border-theme-border bg-theme-surface p-4">
                <div className="truncate text-center text-xs font-bold text-theme-text-muted">延迟队列</div>
                <div className="mt-1.5 truncate text-center text-sm font-semibold text-theme-text-primary">{formatCount(queuePreviewSummary.delayLength)}</div>
                <div className="mt-1 truncate text-center text-xs font-bold text-theme-text-muted">最近刷新 {formatTime(queuePreview?.refreshed_at)}</div>
              </article>
            </section>

 <section className="overflow-hidden rounded-2xl border border-theme-border bg-theme-surface">
              <div className="border-b border-theme-border bg-slate-50/70 px-4 py-4 md:px-5">
                <h2 className="text-lg font-semibold text-theme-text-primary">调度队列预览</h2>
                <p className="mt-1 text-sm font-medium text-theme-text-muted">查看调度执行、删除维护和用户任务同步队列的当前积压与等待时长。</p>
              </div>

              {queuePreviewLoading && !queuePreview ? (
                <div className="px-4 py-12 text-center text-sm font-bold text-theme-text-muted">
                  调度队列预览加载中...
                </div>
              ) : (
                <div className="space-y-4 px-4 py-4 md:px-5">
                  {(queuePreview?.groups || []).map((group: ScheduleRuntimeQueuePreviewGroup) => (
                    <section key={group.group_key} className="overflow-hidden rounded-2xl border border-theme-border bg-theme-surface">
                      <div className="border-b border-theme-border bg-slate-50/70 px-4 py-3">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-theme-text-muted">{group.group_key}</div>
                        <h3 className="mt-1 text-base font-semibold text-theme-text-primary">{group.group_name}</h3>
                      </div>
                      <div className="overflow-x-auto px-4 py-4">
                      <table className="min-w-full border-separate border-spacing-0 text-sm">
                        <thead className="bg-theme-bg-app">
                          <tr className="text-left text-xs font-bold text-theme-text-muted">
                            <th className="px-4 py-2">队列名称</th>
                            <th className="px-4 py-2">队列键</th>
                            <th className="px-4 py-2">类型</th>
                            <th className="px-4 py-2">当前长度</th>
                            <th className="px-4 py-2">最老等待</th>
                            <th className="px-4 py-2">消费者</th>
                            <th className="px-4 py-2">优先级</th>
                            <th className="px-4 py-2">状态</th>
                            <th className="px-4 py-2">说明</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.map((item: ScheduleRuntimeQueuePreviewItem) => (
                            <tr key={item.queue_key} className="border-b border-theme-border hover:bg-slate-100/80">
                              <td className="px-4 py-3 align-top">
                                <div className="font-semibold text-theme-text-primary">{item.queue_name}</div>
                                <div className="mt-1 text-xs text-theme-text-muted">{item.backend || 'unknown'}</div>
                              </td>
                              <td className="px-4 py-3 align-top text-xs font-semibold text-theme-text-secondary">{item.queue_key}</td>
                              <td className="px-4 py-3 align-top text-sm font-semibold text-theme-text-secondary">{queueKindLabel(item.queue_kind)}</td>
                              <td className="px-4 py-3 align-top text-sm font-semibold text-theme-text-secondary">{formatCount(item.length)}</td>
                              <td className="px-4 py-3 align-top text-sm font-semibold text-theme-text-secondary">{formatDurationSeconds(item.oldest_age_seconds)}</td>
                              <td className="px-4 py-3 align-top text-xs font-semibold text-theme-text-secondary">{item.consumer_runtime}</td>
                              <td className="px-4 py-3 align-top text-sm font-semibold text-theme-text-secondary">{item.priority ?? '-'}</td>
                              <td className="px-4 py-3 align-top">
                                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${queueStatusTone(item.status)}`}>
                                  {item.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 align-top text-xs font-semibold text-theme-text-secondary">
                                {item.description}
                                {item.queue_key === 'delay' && item.next_due_in_seconds !== null && item.next_due_in_seconds !== undefined ? (
                                  <div className="mt-2 text-[11px] font-bold text-theme-text-muted">next due {formatDurationSeconds(item.next_due_in_seconds)}</div>
                                ) : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {renderNavButtons()}
              <div className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-bold text-theme-text-secondary">
                <Layers3 size={16} />
                总计 {formatCount(overview.stats.total_tasks)}
              </div>
              <button
                onClick={() => void handleRefresh()}
                className="inline-flex items-center gap-2 rounded-xl bg-theme-surface px-3 py-2 text-sm font-medium text-white transition hover:bg-theme-elevated"
              >
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                刷新总览数据
              </button>
            </div>

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
              {[
                { key: 'total', label: '任务总数', value: formatCount(overview.stats.total_tasks), hint: '系统中所有调度任务的数量' },
                { key: 'running', label: '进行中', value: formatCount(overview.stats.running_tasks), hint: '正在执行中的任务' },
                { key: 'success', label: '成功', value: formatCount(overview.stats.succeeded_tasks), hint: '已成功完成的任务' },
                { key: 'failed', label: '失败', value: formatCount(overview.stats.failed_tasks), hint: '执行失败或超时的任务' },
                { key: 'queue', label: '队列深度', value: formatCount(overview.queue.depth), hint: '队列中等待执行的任务积压数量' },
                { key: 'retry', label: '重试中', value: formatCount(overview.stats.retry_wait_tasks), hint: '执行失败后等待自动重试的任务' },
                { key: overview.health.status === 'ok' ? 'success' : 'failed', label: '服务健康', value: overview.health.status || health?.status || 'unknown', hint: '调度系统当前健康状态' },
                { key: 'neutral', label: '最近刷新', value: overview.refreshed_at ? formatTime(overview.refreshed_at) : '-', hint: '上次获取统计数据的时间' },
              ].map((card, index) => (
                <article
                  key={`${card.label}-${index}`}
 className={`rounded-xl border border-theme-border bg-theme-surface p-4`}
                >
                  <div className="truncate text-center text-xs font-bold text-theme-text-muted" title={card.hint}>{card.label}</div>
                  <div className={`mt-1.5 truncate text-center font-semibold tabular-nums text-theme-text-primary ${card.label === '最近刷新' ? 'text-[10px]' : 'text-sm'}`} title={`${card.value}`}>{card.value}</div>
                </article>
              ))}
            </section>

 <section className="overflow-hidden rounded-2xl border border-theme-border bg-theme-surface">
              <div className="border-b border-theme-border bg-slate-50/70 px-4 py-4 md:px-5">
                <h2 className="text-lg font-semibold text-theme-text-primary">{legacySectionContent[nav as Exclude<OverviewNav, 'overview'>].title}</h2>
                <p className="mt-1 text-sm font-medium leading-6 text-theme-text-muted">
                  {legacySectionContent[nav as Exclude<OverviewNav, 'overview'>].summary}
                </p>
              </div>

              <div className="px-4 py-4 md:px-5">
                <div className="rounded-2xl border border-dashed border-theme-border bg-theme-surface px-6 py-10">
 <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-theme-bg-app">
                    <AlertCircle className="text-theme-text-muted" size={24} />
                  </div>
                  <div className="mt-4 text-center text-lg font-semibold text-theme-text-primary">能力已下沉，子页建设中</div>
                  <div className="mx-auto mt-4 max-w-2xl space-y-2">
                    {legacySectionContent[nav as Exclude<OverviewNav, 'overview'>].bullets.map((bullet) => (
                      <div key={bullet} className="rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-sm font-semibold text-theme-text-secondary">
                        {bullet}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </div>

      <DetailDrawer
        detail={selectedTaskDetail}
        open={detailOpen}
        loading={loadingDetail}
        onClose={() => {
          setDetailOpen(false);
          setSelectedTaskDetail(null);
          setSelectedTaskId('');
        }}
        onViewTimeline={() => {
          if (selectedTaskDetail) void openTaskTimeline(selectedTaskDetail);
        }}
        onRetryDispatch={() => void handleRetryDispatch(selectedTaskDetail)}
        onDeleteTask={() => void handleDeleteTasks('selected', selectedTaskDetail)}
      />

      <TaskTimelineModal
        open={taskTimelineOpen}
        loading={taskTimelineLoading}
        taskLabel={taskTimelineTaskLabel}
        events={taskTimelineEvents}
        onClose={() => {
          setTaskTimelineOpen(false);
          setTaskTimelineEvents([]);
          setTaskTimelineTaskLabel('');
        }}
      />

      {errorPopupText !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setErrorPopupText(null)}>
 <div className="mx-4 w-full max-w-lg rounded-2xl border border-theme-border bg-theme-surface p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-rose-400">
                <AlertCircle size={18} />
                失败原因
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(errorPopupText); }}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-theme-text-secondary hover:bg-theme-elevated hover:text-theme-text-primary"
                  title="复制内容"
                >
                  <Copy size={14} />
                  复制
                </button>
                <button type="button" onClick={() => setErrorPopupText(null)} className="rounded-lg p-1 text-theme-text-muted hover:bg-theme-elevated hover:text-theme-text-secondary">
                  <X size={18} />
                </button>
              </div>
            </div>
            <pre className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-theme-border bg-theme-surface p-4 text-sm font-medium text-theme-text-primary">{errorPopupText}</pre>
          </div>
        </div>
      ) : null}

      {(loadingOverview || refreshing) ? (
 <div className="fixed bottom-6 right-6 inline-flex items-center gap-3 rounded-full bg-theme-bg-app px-5 py-3 text-sm font-medium text-white">
          <RefreshCw className="animate-spin" size={16} />
          同步全局调度总览中
        </div>
      ) : null}
    </div>
  );
};
