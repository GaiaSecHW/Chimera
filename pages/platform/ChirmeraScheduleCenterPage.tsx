import React, { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Layers3,
  Waypoints,
  RefreshCw,
  Search,
  ServerCog,
  TimerReset,
  Workflow,
  X,
} from 'lucide-react';
import { api } from '../../clients/api';
import { showAlert, showConfirm } from '../../components/DialogService';
import {
  ScheduleCenterUserTaskBulkDeleteResult,
  ScheduleCenterUserTask,
  ScheduleCenterUserTaskListResponse,
  ScheduleGlobalTaskDetail,
  ScheduleGlobalTaskListItem,
  ScheduleGlobalTaskOverview,
  ScheduleRuntimeOverview,
  SecurityProject,
} from '../../types/types';

interface ChirmeraScheduleCenterPageProps {
  projects: SecurityProject[];
  initialProjectId?: string;
}

type SortField = 'updated_at' | 'created_at' | 'scheduled_at' | 'started_at' | 'finished_at';
type SortDirection = 'asc' | 'desc';

type TaskFilters = {
  status: string;
  taskType: string;
  projectId: string;
  isRetrying: boolean;
  hasError: boolean;
  search: string;
};

type OverviewNav = 'overview' | 'job-templates' | 'execution-log' | 'key-vault';

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'created', label: '未处理' },
  { value: 'scheduled', label: '计划中' },
  { value: 'queued', label: '排队中' },
  { value: 'retry_wait', label: '重试中' },
  { value: 'running', label: '进行中' },
  { value: 'succeeded', label: '成功' },
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

const SORT_FIELDS: Array<{ value: SortField; label: string }> = [
  { value: 'updated_at', label: '更新时间' },
  { value: 'created_at', label: '创建时间' },
  { value: 'scheduled_at', label: '计划时间' },
  { value: 'started_at', label: '开始时间' },
  { value: 'finished_at', label: '结束时间' },
];

const NAV_ITEMS: Array<{ key: OverviewNav; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = [
  { key: 'overview', label: '全局任务', icon: Workflow },
  { key: 'job-templates', label: '作业模板', icon: FolderKanban },
  { key: 'execution-log', label: '执行记录', icon: Activity },
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

const formatCount = (value?: number | null) => `${Number(value || 0)}`;

const formatDurationSeconds = (value?: number | null) => {
  const seconds = Number(value || 0);
  if (!seconds) return '0s';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
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
  if (label === '成功' || label === 'succeeded') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (label === '失败' || label === 'failed' || label === 'timeout') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (label === '重试中' || label === 'retry_wait') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (label === '进行中' || label === 'running' || label === 'dispatching') return 'border-sky-200 bg-sky-50 text-sky-700';
  if (label === '排队中' || label === 'queued' || label === 'leased') return 'border-cyan-200 bg-cyan-50 text-cyan-700';
  return 'border-slate-200 bg-slate-100 text-slate-700';
};

const metricTone = (key: string) => {
  if (key === 'success') return 'from-emerald-50 via-white to-emerald-100/70 border-emerald-200/70';
  if (key === 'failed') return 'from-rose-50 via-white to-rose-100/70 border-rose-200/70';
  if (key === 'running') return 'from-sky-50 via-white to-sky-100/70 border-sky-200/70';
  if (key === 'retry') return 'from-amber-50 via-white to-amber-100/70 border-amber-200/70';
  if (key === 'queue') return 'from-cyan-50 via-white to-cyan-100/70 border-cyan-200/70';
  return 'from-slate-50 via-white to-slate-100/70 border-slate-200/70';
};

const normalizeTaskTypeLabel = (taskType?: string | null) => {
  if (taskType === 'binary_firmware_e2e') return '盖亚-二进制固件';
  if (taskType === 'source_scan_e2e') return '盖亚-源码';
  if (taskType === 'binary_module_e2e') return '盖亚-二进制模块';
  return taskType || '-';
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
  queue_state: task.dispatch_status,
  current_status: task.downstream_status_mapped || task.business_status || task.dispatch_status || task.create_status,
  display_status_group: task.downstream_status_mapped || task.business_status || task.dispatch_status || task.create_status,
  retry_count: 0,
  downstream_task_id: task.downstream_task_id,
  downstream_detail_view: task.downstream_detail_view,
  created_by: task.created_by,
  created_at: task.created_at,
  updated_at: task.updated_at,
  started_at: null,
  finished_at: null,
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
      create_status: task.create_status,
      dispatch_status: task.dispatch_status,
      business_status: task.business_status,
      downstream_status_raw: task.downstream_status_raw,
      downstream_status_mapped: task.downstream_status_mapped,
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

const sortIndicator = (sortField: SortField, activeField: SortField, direction: SortDirection) => {
  if (sortField !== activeField) return <ArrowUpDown size={14} className="text-slate-400" />;
  return (
    <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
      {direction}
    </span>
  );
};

const DetailDrawer: React.FC<{
  detail: ScheduleGlobalTaskDetail | null;
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onRetryDispatch: () => void;
  onDeleteTask: () => void;
}> = ({ detail, open, loading, onClose, onRetryDispatch, onDeleteTask }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[2px]">
      <button className="flex-1" aria-label="关闭详情抽屉" onClick={onClose} />
      <aside className="relative h-full w-full max-w-[540px] overflow-y-auto border-l border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-6 py-5 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">Task Detail</div>
              <h2 className="mt-2 text-2xl font-black text-slate-900">{detail?.task_name || '加载任务详情'}</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${statusTone(detail?.display_status_group)}`}>
                  {summarizeStatus(detail || {})}
                </span>
                {detail?.task_type ? (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-600">
                    {detail.task_type}
                  </span>
                ) : null}
              </div>
            </div>
            <button onClick={onClose} className="rounded-2xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="space-y-6 px-6 py-6">
          {loading ? (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm font-bold text-slate-500">
              任务详情加载中...
            </div>
          ) : detail ? (
            <>
              <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">基本信息</div>
                <div className="mt-4 grid gap-3 text-sm text-slate-700">
                  <div><span className="font-black text-slate-900">任务 ID：</span>{detail.task_id}</div>
                  <div><span className="font-black text-slate-900">项目：</span>{detail.project_name || detail.project_display_name || detail.project_id || '-'}</div>
                  <div><span className="font-black text-slate-900">创建人：</span>{detail.created_by || '-'}</div>
                  <div><span className="font-black text-slate-900">Root Task Key：</span>{getTaskKeyValue(detail)}</div>
                  <div><span className="font-black text-slate-900">下游任务：</span>{detail.downstream_task_id || '-'}</div>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">状态摘要</div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"><span className="font-black text-slate-900">创建态：</span>{detail.create_status || '-'}</div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"><span className="font-black text-slate-900">分发态：</span>{detail.dispatch_status || '-'}</div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"><span className="font-black text-slate-900">业务态：</span>{detail.business_status || '-'}</div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"><span className="font-black text-slate-900">当前态：</span>{detail.current_status || '-'}</div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"><span className="font-black text-slate-900">重试次数：</span>{detail.retry_count ?? 0}</div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"><span className="font-black text-slate-900">最近尝试：</span>{detail.attempt_no ?? '-'}</div>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">执行窗口</div>
                <div className="mt-4 grid gap-3 text-sm text-slate-700">
                  <div><span className="font-black text-slate-900">计划时间：</span>{formatTime(detail.scheduled_at)}</div>
                  <div><span className="font-black text-slate-900">开始时间：</span>{formatTime(detail.started_at)}</div>
                  <div><span className="font-black text-slate-900">结束时间：</span>{formatTime(detail.finished_at)}</div>
                  <div><span className="font-black text-slate-900">最近失败：</span>{detail.last_error || detail.latest_failure?.message || '-'}</div>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">最近调度与执行</div>
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <div className="font-black text-slate-900">最近 Dispatch</div>
                    <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-600">{JSON.stringify(detail.latest_dispatch || detail.current_dispatch || {}, null, 2)}</pre>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <div className="font-black text-slate-900">最近 Execution</div>
                    <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-600">{JSON.stringify(detail.latest_execution || detail.current_execution || {}, null, 2)}</pre>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">最近事件摘要</div>
                <div className="mt-4 space-y-3">
                  {(detail.recent_events || []).length ? (
                    (detail.recent_events || []).map((event, index) => (
                      <div key={`${event.id || event.created_at || index}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-black text-slate-900">{event.event_type || event.type || 'event'}</span>
                          <span className="text-xs text-slate-500">{formatTime(event.created_at || event.ts)}</span>
                        </div>
                        <div className="mt-2 text-xs text-slate-600">{event.message || JSON.stringify(event.payload || event)}</div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm font-bold text-slate-500">
                      暂无可展示的事件摘要
                    </div>
                  )}
                </div>
              </section>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={onRetryDispatch}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800"
                >
                  <TimerReset size={16} />
                  重试分发
                </button>
                <button
                  onClick={onDeleteTask}
                  className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-black text-white transition hover:bg-rose-700"
                >
                  删除任务
                </button>
                {detail.downstream_detail_view ? (
                  <button
                    onClick={() => window.open(detail.downstream_detail_view || '', '_blank', 'noopener,noreferrer')}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                  >
                    <Waypoints size={16} />
                    跳转下游任务
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm font-bold text-slate-500">
              当前任务详情暂不可用
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};

export const ChirmeraScheduleCenterPage: React.FC<ChirmeraScheduleCenterPageProps> = ({ projects }) => {
  const scheduleApi = api.domains.platform.scheduleCenter;
  const [nav, setNav] = useState<OverviewNav>('overview');
  const [health, setHealth] = useState<{ status?: string; service_name?: string } | null>(null);
  const [runtimeOverview, setRuntimeOverview] = useState<ScheduleRuntimeOverview | null>(null);
  const [overview, setOverview] = useState<ScheduleGlobalTaskOverview>(createEmptyOverview());
  const [tableItems, setTableItems] = useState<ScheduleGlobalTaskListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortField, setSortField] = useState<SortField>('updated_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
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
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [loadingTable, setLoadingTable] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const deferredQuery = useDeferredValue(filters.search);

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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const allVisibleSelected = tableItems.length > 0 && tableItems.every((item) => selectedTaskIds.includes(item.task_id));

  const statCards = useMemo(() => {
    const items = [
      { key: 'total', label: '任务总数', value: overview.stats.total_tasks, hint: '全部调度任务实例' },
      { key: 'neutral', label: '未处理', value: overview.stats.unprocessed_tasks, hint: 'created / ready_for_dispatch' },
      { key: 'neutral', label: '计划中', value: overview.stats.scheduled_tasks, hint: '已计划但尚未入队' },
      { key: 'queue', label: '排队中', value: overview.stats.queued_tasks, hint: 'queued / leased' },
      { key: 'retry', label: '重试中', value: overview.stats.retry_wait_tasks, hint: '等待重试窗口' },
      { key: 'running', label: '进行中', value: overview.stats.running_tasks, hint: 'dispatching / running' },
      { key: 'success', label: '成功', value: overview.stats.succeeded_tasks, hint: '已完成任务' },
      { key: 'failed', label: '失败', value: overview.stats.failed_tasks, hint: 'failed / timeout' },
      { key: 'queue', label: '当前队列深度', value: overview.queue.depth, hint: `backend ${overview.queue.backend || 'unknown'}` },
      { key: 'neutral', label: '最老等待时长', value: formatDurationSeconds(overview.queue.oldest_age_seconds), hint: 'ready queue oldest age' },
      { key: 'neutral', label: '活跃 worker 数', value: overview.workers.active, hint: '当前可用调度执行器' },
      { key: 'neutral', label: 'worker 并发总量', value: overview.workers.concurrency, hint: '调度槽位总量' },
      { key: 'running', label: '当前 inflight', value: overview.workers.inflight, hint: '当前飞行中执行数' },
      { key: 'neutral', label: '已取消', value: overview.stats.cancelled_tasks, hint: 'cancelled' },
      { key: 'neutral', label: '最近刷新时间', value: overview.refreshed_at ? formatTime(overview.refreshed_at) : '-', hint: 'overview snapshot' },
      { key: overview.health.status === 'ok' ? 'success' : 'failed', label: '服务健康', value: overview.health.status || 'unknown', hint: overview.health.redis_available ? 'Redis Ready' : 'Redis Unavailable' },
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
      if (!filters.projectId) {
        setTableItems([]);
        setTotal(0);
        setNotice('任务中心列表已切换为项目级任务接口，请先选择项目。');
        return;
      }
      const payload = await scheduleApi.listUserTasks(filters.projectId) as ScheduleCenterUserTaskListResponse;
      const rawItems = payload.items || [];
      let items = rawItems.map((item) => mapUserTaskToGlobalTaskItem(item, projectNameMap));
      if (filters.status) {
        items = items.filter((item) =>
          [item.current_status, item.business_status, item.dispatch_status, item.create_status].includes(filters.status)
        );
      }
      if (filters.taskType) {
        items = items.filter((item) => rawItems.find((task) => task.id === item.task_id)?.task_type === filters.taskType);
      }
      if (filters.hasError) {
        items = items.filter((item) => Boolean(item.last_error));
      }
      if (filters.isRetrying) {
        items = [];
      }
      if (deferredQuery) {
        const keyword = deferredQuery.toLowerCase();
        items = items.filter((item) =>
          [item.task_name, item.task_id, item.project_name, item.project_id, item.downstream_task_id, item.last_error]
            .some((value) => String(value || '').toLowerCase().includes(keyword))
        );
      }
      items.sort((left, right) => {
        const leftValue = String((left as Record<string, unknown>)[sortField] || '');
        const rightValue = String((right as Record<string, unknown>)[sortField] || '');
        return sortDirection === 'asc' ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue);
      });
      const start = (page - 1) * pageSize;
      setTableItems(items.slice(start, start + pageSize));
      setTotal(items.length);
      setSelectedTaskIds((current) => current.filter((taskId) => items.some((item) => item.task_id === taskId)));
      setNotice('');
    } catch (err: any) {
      setTableItems([]);
      setTotal(0);
      setNotice('项目级任务列表暂时不可用。');
      setError(err?.message || '加载全局任务列表失败');
    } finally {
      setLoadingTable(false);
      if (manual) setRefreshing(false);
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
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [page, pageSize, sortField, sortDirection, filters.status, filters.taskType, filters.projectId, filters.isRetrying, filters.hasError, deferredQuery, projectNameMap]);

  const handleRefresh = async () => {
    setError('');
    await Promise.all([loadHealthAndOverview(true), loadTasks(true)]);
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
        message: `任务 ${item.task_name || item.task_id} 的重试分发请求已提交。`,
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
        title: `${item.task_name} 最近执行摘要`,
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
    if (!filters.projectId) {
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
      message: `当前项目：${projectNameMap.get(filters.projectId) || filters.projectId}\n删除范围：${mode === 'filtered' ? `当前筛选命中的 ${targetCount} 条任务` : `${targetCount} 条任务`}\n\n删除会先同步删除下游任务；失败项不会删除父任务。`,
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
      const result = await scheduleApi.bulkDeleteUserTasks(filters.projectId, payload) as ScheduleCenterUserTaskBulkDeleteResult;
      const failedLines = (result.results || [])
        .filter((item) => item.status !== 'deleted')
        .slice(0, 10)
        .map((item) => `${item.task_id}: ${item.message}`)
        .join('\n');
      await showAlert({
        title: '删除任务结果',
        message: `请求 ${result.total_requested} 条，成功删除 ${result.deleted_count} 条，失败 ${result.failed_count} 条。${failedLines ? `\n\n失败详情：\n${failedLines}` : ''}`,
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
    'execution-log': {
      title: '执行记录',
      summary: '执行记录和完整事件流不再占据首页主布局，避免首页退回到旧三栏控制台模式。',
      bullets: [
        '首页保留“查看详情”和“查看执行记录”入口，用于快速定位单任务运行态。',
        '完整 execution timeline 后续建议收敛到独立执行记录子页。',
        '当前全局任务详情抽屉已经承接最近 dispatch、execution 和事件摘要。',
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
    <div className="flex flex-wrap gap-3">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = item.key === nav;
        return (
          <button
            key={item.key}
            onClick={() => handleLegacyNav(item.key)}
            className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition ${
              active
                ? 'bg-slate-900 text-white shadow-[0_10px_30px_rgba(15,23,42,0.18)]'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
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
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.10),transparent_24%),linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] px-4 py-6 md:px-8">
      <div className="mx-auto max-w-[1760px] space-y-6">
        {notice ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-800">
            {notice}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-bold text-rose-700">
            {error}
          </div>
        ) : null}

        {nav === 'overview' ? (
          <>
            <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
              {statCards.map((card, index) => (
                <article
                  key={`${card.label}-${index}`}
                  className={`rounded-[1.6rem] border bg-gradient-to-br p-5 shadow-sm ${metricTone(card.key)}`}
                >
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">{card.label}</div>
                  <div className="mt-3 break-all text-3xl font-black text-slate-900">{typeof card.value === 'string' ? card.value : formatCount(card.value as number)}</div>
                  <div className="mt-2 text-xs font-bold text-slate-500">{card.hint}</div>
                </article>
              ))}
            </section>

            <section className="rounded-[2rem] border border-slate-200/70 bg-white/90 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur">
              <div className="border-b border-slate-200 px-5 py-5 md:px-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">Global Task Overview</div>
                    <h2 className="mt-2 text-2xl font-black text-slate-900">全局任务总览</h2>
                    <div className="mt-2 text-sm text-slate-500">默认按更新时间倒序展示全部调度任务实例，不再按项目隔离首页视图。</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {renderNavButtons()}
                    <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
                      <Layers3 size={16} />
                      总计 {formatCount(total)}
                    </div>
                    <button
                      onClick={() => void handleRefresh()}
                      className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
                      disabled={refreshing}
                    >
                      <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                      刷新
                    </button>
                  </div>
                </div>
              </div>

              <div className="border-b border-slate-200 px-5 py-5 md:px-6">
                <div className="grid gap-4 xl:grid-cols-[1.45fr_0.95fr_1fr_1fr_0.95fr_0.8fr_auto] xl:items-end">
                  <label className="block">
                    <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">关键词搜索</span>
                    <div className="mt-2 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <Search size={16} className="text-slate-400" />
                      <input
                        value={filters.search}
                        onChange={(event) => {
                          const next = event.target.value;
                          setFilters((current) => ({ ...current, search: next }));
                          if (page !== 1) setPage(1);
                        }}
                        placeholder="任务名 / 下游任务 ID / 创建人"
                        className="w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400"
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">状态</span>
                    <select
                      value={filters.status}
                      onChange={(event) => {
                        setFilters((current) => ({ ...current, status: event.target.value }));
                        setPage(1);
                      }}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-none"
                    >
                      {STATUS_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">任务类型</span>
                    <select
                      value={filters.taskType}
                      onChange={(event) => {
                        setFilters((current) => ({ ...current, taskType: event.target.value }));
                        setPage(1);
                      }}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-none"
                    >
                      {TASK_TYPE_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">项目过滤</span>
                    <select
                      value={filters.projectId}
                      onChange={(event) => {
                        setFilters((current) => ({ ...current, projectId: event.target.value }));
                        setPage(1);
                      }}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-none"
                    >
                      {projectOptions.map((item) => (
                        <option key={item.id} value={item.id}>{item.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">排序字段</span>
                    <select
                      value={sortField}
                      onChange={(event) => {
                        setSortField(event.target.value as SortField);
                        setPage(1);
                      }}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-none"
                    >
                      {SORT_FIELDS.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">每页条数</span>
                    <select
                      value={pageSize}
                      onChange={(event) => {
                        setPageSize(Number(event.target.value));
                        setPage(1);
                      }}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-none"
                    >
                      {PAGE_SIZE_OPTIONS.map((value) => (
                        <option key={value} value={value}>{value}</option>
                      ))}
                    </select>
                  </label>

                  <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                    <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={selectAllMatching}
                        onChange={(event) => {
                          setSelectAllMatching(event.target.checked);
                          if (event.target.checked) setSelectedTaskIds([]);
                        }}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      删除全部筛选结果
                    </label>
                    <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={filters.isRetrying}
                        onChange={(event) => {
                          setFilters((current) => ({ ...current, isRetrying: event.target.checked }));
                          setPage(1);
                        }}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      仅重试中
                    </label>
                    <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={filters.hasError}
                        onChange={(event) => {
                          setFilters((current) => ({ ...current, hasError: event.target.checked }));
                          setPage(1);
                        }}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      仅失败
                    </label>
                    <button
                      type="button"
                      onClick={() => void handleDeleteTasks(selectAllMatching ? 'filtered' : 'selected')}
                      disabled={!filters.projectId || (!selectAllMatching && selectedTaskIds.length === 0)}
                      className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-black text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      删除任务
                    </button>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto px-5 py-5 md:px-6">
                <table className="min-w-full border-separate border-spacing-y-3">
                  <thead>
                    <tr className="text-left text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                      <th className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={(event) => handleToggleSelectVisible(event.target.checked)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                      </th>
                      <th className="px-4 py-2">任务名称</th>
                      <th className="px-4 py-2">任务类型</th>
                      <th className="px-4 py-2">当前状态</th>
                      <th className="px-4 py-2">展示状态</th>
                      <th className="px-4 py-2">项目</th>
                      <th className="px-4 py-2">队列状态</th>
                      <th className="px-4 py-2">重试次数</th>
                      <th className="px-4 py-2">下游任务 ID</th>
                      <th className="px-4 py-2">Root Task Key</th>
                      <th className="px-4 py-2">创建人</th>
                      <th className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSortField('created_at');
                            setSortDirection((current) => (sortField === 'created_at' && current === 'desc' ? 'asc' : 'desc'));
                            setPage(1);
                          }}
                          className="inline-flex items-center gap-2"
                        >
                          创建时间
                          {sortIndicator('created_at', sortField, sortDirection)}
                        </button>
                      </th>
                      <th className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSortField('updated_at');
                            setSortDirection((current) => (sortField === 'updated_at' && current === 'desc' ? 'asc' : 'desc'));
                            setPage(1);
                          }}
                          className="inline-flex items-center gap-2"
                        >
                          更新时间
                          {sortIndicator('updated_at', sortField, sortDirection)}
                        </button>
                      </th>
                      <th className="px-4 py-2">开始时间</th>
                      <th className="px-4 py-2">结束时间</th>
                      <th className="px-4 py-2">失败原因</th>
                      <th className="px-4 py-2">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingTable ? (
                      <tr>
                        <td colSpan={17} className="px-4 py-12 text-center text-sm font-bold text-slate-500">
                          全局任务列表加载中...
                        </td>
                      </tr>
                    ) : tableItems.length ? (
                      tableItems.map((item) => (
                        <tr key={item.task_id} className="rounded-3xl bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
                          <td className="rounded-l-[1.5rem] px-4 py-4 align-top">
                            <input
                              type="checkbox"
                              checked={selectedTaskIds.includes(item.task_id)}
                              onChange={(event) => handleToggleTaskSelection(item.task_id, event.target.checked)}
                              className="h-4 w-4 rounded border-slate-300"
                            />
                          </td>
                          <td className="px-4 py-4 align-top">
                            <div className="font-black text-slate-900">{item.task_name || item.task_id}</div>
                            <div className="mt-1 text-xs text-slate-500">{item.task_id}</div>
                          </td>
                          <td className="px-4 py-4 align-top text-sm font-semibold text-slate-700">{item.task_type || '-'}</td>
                          <td className="px-4 py-4 align-top text-sm font-semibold text-slate-700">{item.current_status || '-'}</td>
                          <td className="px-4 py-4 align-top">
                            <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${statusTone(item.display_status_group)}`}>
                              {summarizeStatus(item)}
                            </span>
                          </td>
                          <td className="px-4 py-4 align-top text-sm font-semibold text-slate-700">{item.project_name || item.project_id || '-'}</td>
                          <td className="px-4 py-4 align-top text-sm font-semibold text-slate-700">{item.queue_state || '-'}</td>
                          <td className="px-4 py-4 align-top text-sm font-semibold text-slate-700">{item.retry_count ?? 0}</td>
                          <td className="px-4 py-4 align-top text-xs font-bold text-slate-600">{item.downstream_task_id || '-'}</td>
                          <td className="px-4 py-4 align-top text-xs font-bold text-slate-600">{getTaskKeyValue(item)}</td>
                          <td className="px-4 py-4 align-top text-sm font-semibold text-slate-700">{item.created_by || '-'}</td>
                          <td className="px-4 py-4 align-top text-xs font-semibold text-slate-600">{formatTime(item.created_at)}</td>
                          <td className="px-4 py-4 align-top text-xs font-semibold text-slate-600">{formatTime(item.updated_at)}</td>
                          <td className="px-4 py-4 align-top text-xs font-semibold text-slate-600">{formatTime(item.started_at)}</td>
                          <td className="px-4 py-4 align-top text-xs font-semibold text-slate-600">{formatTime(item.finished_at)}</td>
                          <td className="max-w-[220px] px-4 py-4 align-top text-xs font-semibold text-rose-700">{item.last_error || '-'}</td>
                          <td className="rounded-r-[1.5rem] px-4 py-4 align-top">
                            <div className="flex flex-col gap-2">
                              <button
                                onClick={() => void openTaskDetail(item)}
                                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                              >
                                查看详情
                              </button>
                              <button
                                onClick={() => void handleViewExecution(item)}
                                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                              >
                                查看执行记录
                              </button>
                              <button
                                onClick={() => void handleRetryDispatch(item)}
                                className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white transition hover:bg-slate-800"
                              >
                                重试分发
                              </button>
                              <button
                                onClick={() => void handleDeleteTasks('selected', item)}
                                className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-black text-white transition hover:bg-rose-700"
                              >
                                删除任务
                              </button>
                              {item.downstream_detail_view ? (
                                <button
                                  onClick={() => window.open(item.downstream_detail_view || '', '_blank', 'noopener,noreferrer')}
                                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                                >
                                  跳转下游任务
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={17} className="px-4 py-12">
                          <div className="rounded-[2rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">
                              <AlertCircle className="text-slate-400" size={24} />
                            </div>
                            <div className="mt-4 text-lg font-black text-slate-900">当前没有可展示的全局任务</div>
                            <div className="mt-2 text-sm font-semibold text-slate-500">
                              当前项目下没有命中筛选条件的任务，或任务已被批量删除。
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-slate-200 px-5 py-4 md:px-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="text-sm font-semibold text-slate-500">
                    第 {page} / {totalPages} 页，共 {formatCount(total)} 条
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                      disabled={page <= 1}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      <ChevronLeft size={16} />
                      上一页
                    </button>
                    <button
                      onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                      disabled={page >= totalPages}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      下一页
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </>
        ) : (
          <section className="rounded-[2rem] border border-slate-200/70 bg-white/90 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur md:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">Secondary Capability</div>
                <h2 className="mt-2 text-3xl font-black text-slate-900">{legacySectionContent[nav as Exclude<OverviewNav, 'overview'>].title}</h2>
                <p className="mt-4 text-sm leading-7 text-slate-600">
                  {legacySectionContent[nav as Exclude<OverviewNav, 'overview'>].summary}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {renderNavButtons()}
                <button
                  onClick={() => void handleRefresh()}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                >
                  <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                  刷新总览数据
                </button>
              </div>
            </div>

            <div className="mt-8 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-[1.6rem] border border-slate-200 bg-slate-50 p-5">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">能力迁移说明</div>
                <div className="mt-4 space-y-3">
                  {legacySectionContent[nav as Exclude<OverviewNav, 'overview'>].bullets.map((bullet) => (
                    <div key={bullet} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                      {bullet}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">当前全局快照</div>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <span className="font-black text-slate-900">任务总数：</span>{formatCount(overview.stats.total_tasks)}
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <span className="font-black text-slate-900">进行中：</span>{formatCount(overview.stats.running_tasks)}
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <span className="font-black text-slate-900">队列深度：</span>{formatCount(overview.queue.depth)}
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <span className="font-black text-slate-900">最近刷新：</span>{overview.refreshed_at ? formatTime(overview.refreshed_at) : '-'}
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <span className="font-black text-slate-900">服务健康：</span>{overview.health.status || health?.status || 'unknown'}
                  </div>
                </div>
              </div>
            </div>
          </section>
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
        onRetryDispatch={() => void handleRetryDispatch(selectedTaskDetail)}
        onDeleteTask={() => void handleDeleteTasks('selected', selectedTaskDetail)}
      />

      {(loadingOverview || refreshing) ? (
        <div className="fixed bottom-6 right-6 inline-flex items-center gap-3 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-2xl">
          <RefreshCw className="animate-spin" size={16} />
          同步全局调度总览中
        </div>
      ) : null}
    </div>
  );
};
