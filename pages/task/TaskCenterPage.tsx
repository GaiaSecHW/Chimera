import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DataTable, DataTableColumn, DropdownSelect, Modal, PageHeader } from '../../design-system';
import { Bug, CheckCircle2, FileText, FolderInput, Loader2, Pause, Play, Plus, RefreshCw, Rocket, Search, Shield, Trash2, X } from 'lucide-react';
import { api } from '../../clients/api';
import { ServicePageTitle } from '../../components/execution/ServiceBuildVersion';
import { useUiFeedback } from '../../components/UiFeedback';
import { saveTaskCenterReturnContext, consumeHomeCreateTaskMode } from '../../utils/executionReturnContext';
import { getPlatformRole } from '../../utils/rbac';
import { CreateTaskDialog, HomeCardMode } from './CreateTaskDialog';
import {
  ScheduleCenterUserTaskDeleteQueueItem,
  ScheduleCenterUserTaskDeleteQueueResponse,
  ScheduleCenterUserTask,
  ScheduleCenterUserTaskType,
  ScheduleCenterUserTaskListResponse,
  SecurityProject,
  UserInfo,
} from '../../types/types';

interface Props {
  projectId: string;
  projects: SecurityProject[];
  onRefreshProjects?: () => Promise<void> | void;
  openCreateTaskOnNav?: boolean;
  onConsumeOpenCreateTask?: () => void;
  hideActionBar?: boolean;
}

type TaskTypeOption = {
  value: ScheduleCenterUserTaskType;
  label: string;
  downstreamView?: string;
};

const TASK_TYPES: readonly TaskTypeOption[] = [
  { value: 'binary_firmware_e2e', label: '盖亚-二进制固件', downstreamView: 'binary-security-detail' },
  { value: 'source_scan_e2e', label: '盖亚-源码', downstreamView: 'source-security-detail' },
  { value: 'kg_source_vuln_scan_e2e', label: '知识图谱-漏洞挖掘', downstreamView: 'kg-source-security-detail' },
  { value: 'binary_module_e2e', label: '盖亚-二进制模块', downstreamView: 'binary-module-security-detail' },
  { value: 'ai4app_fast', label: 'AI4APP 扫描（快速）', downstreamView: 'app-security-scan-detail' },
  { value: 'ai4web_fast', label: 'AI4WEB 扫描（快速）', downstreamView: 'app-security-scan-detail' },
  { value: 'ai4app_deep', label: 'AI4APP 扫描（深度）', downstreamView: 'app-security-scan-detail' },
  { value: 'ai4web_deep', label: 'AI4WEB 扫描（深度）', downstreamView: 'app-security-scan-detail' },
  { value: 'ai4red', label: 'AI4RED 红线验证', downstreamView: 'task-redline-detail' },
  { value: 'sechps_tool', label: 'Agent Harness 任务' },
];

const getLocalUserInfo = (): UserInfo | null => {
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserInfo;
  } catch {
    return null;
  }
};

const formatDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString('zh-CN') : '—');
const getRootTaskKeyDisplay = (task: Pick<ScheduleCenterUserTask, 'root_task_key_name' | 'root_task_key_prefix'>) =>
  [task.root_task_key_name, task.root_task_key_prefix].filter(Boolean).join(' / ') || '—';
const getDisplayStatus = (task: ScheduleCenterUserTask) => task.display_status || task.business_status || task.dispatch_status || task.create_status || 'unknown';
// 面向用户：把后端细分状态收敛成 4 档中文展示
const USER_STATUS_LABEL: Record<string, string> = {
  success: '成功',
  partial_success: '成功',
  failed: '失败',
  cancelled: '已取消',
  completed: '已完成',
  pending: '等待中',
  stopped: '已暂停',
  deleted: '已在黑板删除',
};
const getUserStatusLabel = (task: ScheduleCenterUserTask) => USER_STATUS_LABEL[getDisplayStatus(task)] ?? '进行中';
const getUserStatusLabelFromValue = (status?: string | null) => USER_STATUS_LABEL[String(status || '')] ?? '进行中';
export const getTaskTypeLabel = (taskType: string) => TASK_TYPES.find((item) => item.value === taskType)?.label || taskType;
const getTaskHarnessLabel = (task: Pick<ScheduleCenterUserTask, 'task_type' | 'agent_app_name'>) =>
  task.task_type === 'sechps_tool' ? (task.agent_app_name || 'Agent Harness') : getTaskTypeLabel(String(task.task_type || ''));
const getTaskInputsLabel = (task: Pick<ScheduleCenterUserTask, 'inputs'>) => {
  const labels = (task.inputs || [])
    .map((item) => String(item.display_name || item.input_label || '').trim())
    .filter(Boolean);
  return labels.length ? labels.join('、') : '—';
};
const getTaskTestObjectLabel = (task: Pick<ScheduleCenterUserTask, 'inputs'>) =>
  String(task.inputs?.[0]?.display_name || '').trim() || '—';
const getDeleteQueueTypeLabel = (taskType: string) => taskType === 'sechps_tool' ? 'Agent Harness 任务' : getTaskTypeLabel(taskType);
const getDeleteStatusLabel = (status: string) => {
  if (status === 'queued') return '排队中';
  if (status === 'running') return '删除中';
  if (status === 'blocked') return '阻塞';
  if (status === 'failed') return '失败';
  if (status === 'deleted') return '已删除';
  return status || '—';
};
const truncateText = (value?: string | null, max = 80) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '—';
  return normalized.length > max ?`${normalized.slice(0, max)}...` : normalized;
};

// LOKI design tokens (DESIGN.md) — page-local palette.
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
  errorSoft: 'var(--danger-soft)',
  error: 'var(--danger)',
  info: '#4f8cff',
} as const;

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

export const TaskCenterPage: React.FC<Props> = ({ projectId, projects, onRefreshProjects, openCreateTaskOnNav, onConsumeOpenCreateTask, hideActionBar }) => {
  const scheduleApi = api.domains.platform.scheduleCenter;
  const currentUser = useMemo(() => getLocalUserInfo(), []);
  const isAdmin = useMemo(() => {
    const role = getPlatformRole(currentUser);
    return role === 'super_admin' || role === 'ordinary_admin';
  }, [currentUser]);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<ScheduleCenterUserTask[]>([]);
  const [taskVulnCounts, setTaskVulnCounts] = useState<Record<string, number | undefined>>({});
  const [stats, setStats] = useState<Record<string, number>>({});
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get('task') || '');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState<string>('updated_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [total, setTotal] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [preSelectedMode, setPreSelectedMode] = useState<HomeCardMode | undefined>(undefined);
  const [error, setError] = useState('');
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteQueueOpen, setDeleteQueueOpen] = useState(false);
  const [deleteQueueLoading, setDeleteQueueLoading] = useState(false);
  const [deleteQueueError, setDeleteQueueError] = useState('');
  const [deleteQueueItems, setDeleteQueueItems] = useState<ScheduleCenterUserTaskDeleteQueueItem[]>([]);
  const [deleteQueueTotal, setDeleteQueueTotal] = useState(0);
  const [deleteQueuePage, setDeleteQueuePage] = useState(1);
  const [deleteQueuePageSize, setDeleteQueuePageSize] = useState(20);
  const [deleteQueueSortBy, setDeleteQueueSortBy] = useState<'delete_requested_at' | 'updated_at' | 'name'>('delete_requested_at');
  const [deleteQueueSortDirection, setDeleteQueueSortDirection] = useState<'asc' | 'desc'>('desc');
  const [deleteQueueStats, setDeleteQueueStats] = useState({ queued_total: 0, running_total: 0, failed_total: 0 });
  const [deleteQueueFilters, setDeleteQueueFilters] = useState({
    delete_status: '',
    task_type: '',
    search: '',
    has_error: false,
    from_time: '',
    to_time: '',
  });
  const [changeProjectTask, setChangeProjectTask] = useState<ScheduleCenterUserTask | null>(null);
  const [changeProjectTargetId, setChangeProjectTargetId] = useState('');
  const [changeProjectSubmitting, setChangeProjectSubmitting] = useState(false);
  const { notify, confirm, feedbackNodes } = useUiFeedback();

  const projectName = useMemo(() => projects.find((item) => item.id === projectId)?.name || projectId, [projectId, projects]);
  const deleteQueueTotalPages = useMemo(
    () => Math.max(1, Math.ceil(deleteQueueTotal / deleteQueuePageSize)),
    [deleteQueuePageSize, deleteQueueTotal],
  );

  const fetchTaskVulnCounts = async (taskItems: ScheduleCenterUserTask[]) => {
    if (!projectId || taskItems.length === 0) return;
    try {
      const resp = await api.vuln.getSuspectCountsPerTask(projectId);
      const counts = resp.counts || {};
      setTaskVulnCounts((prev) => {
        const next = { ...prev };
        for (const t of taskItems) {
          next[t.id] = counts[t.id] || 0;
        }
        return next;
      });
    } catch {
      setTaskVulnCounts((prev) => {
        const next = { ...prev };
        for (const t of taskItems) {
          next[t.id] = 0;
        }
        return next;
      });
    }
  };

  const loadData = async (
    nextPage = page,
    nextPageSize = pageSize,
    nextSortBy = sortBy,
    nextSortDirection = sortDirection,
    nextSearch = query,
  ) => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const taskResp = await scheduleApi.listUserTasks(projectId, {
        search: nextSearch,
        page: nextPage,
        page_size: nextPageSize,
        sort_by: nextSortBy,
        sort_direction: nextSortDirection,
      }) as ScheduleCenterUserTaskListResponse;
      const taskItems = (taskResp.items || []) as any[];

      try {
        const cairnProjects = await api.domains.cairn.listProjects();
        const cairnMap = new Map<string, any>();
        for (const p of cairnProjects) {
          cairnMap.set(String(p.id), p);
        }
        for (const t of taskItems) {
          const m = String(t.description || '').match(/\[黑板:cairn:([^\]]+)\]/);
          if (m) {
            const cp = cairnMap.get(m[1]);
            if (cp) {
              const running = (cp as any).working_intent_count > 0;
              if (cp.status === 'completed') {
                t.display_status = 'completed';
              } else if (cp.status === 'stopped') {
                t.display_status = 'stopped';
              } else if (cp.status === 'active' && running) {
                t.display_status = 'running';
              } else if (cp.status === 'active') {
                t.display_status = 'pending';
              }
            } else {
              t.display_status = 'deleted';
            }
          }
        }
      } catch { /* nazhua 不可达时不影响列表加载 */ }

      setTasks(taskItems);
      setStats(taskResp.stats || {});
      setTotal(taskResp.total || 0);
      void fetchTaskVulnCounts(taskItems);
    } catch (err: any) {
      setError(err?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    void loadData(1, pageSize, sortBy, sortDirection, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);
  useEffect(() => { setSelectedTaskIds([]); }, [projectId, query, page, pageSize, sortBy, sortDirection]);

  const skipSearchRef = useRef(true);
  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }
    const handle = setTimeout(() => {
      setPage(1);
      void loadData(1, pageSize, sortBy, sortDirection, query);
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    const mode = consumeHomeCreateTaskMode();
    if (mode === 'dragon-tail' || mode === 'ram-horn' || mode === 'lion-head') {
      setPreSelectedMode(mode as HomeCardMode);
      setCreateOpen(true);
    }
  }, []);

  const loadDeleteQueue = async (
    nextPage = deleteQueuePage,
    nextPageSize = deleteQueuePageSize,
    nextSortBy = deleteQueueSortBy,
    nextSortDirection = deleteQueueSortDirection,
    nextFilters = deleteQueueFilters,
  ) => {
    if (!projectId) return;
    setDeleteQueueLoading(true);
    setDeleteQueueError('');
    try {
      const payload = await scheduleApi.listUserTaskDeleteQueue(projectId, {
        page: nextPage,
        page_size: nextPageSize,
        sort_by: nextSortBy,
        sort_direction: nextSortDirection,
        ...nextFilters,
      }) as ScheduleCenterUserTaskDeleteQueueResponse;
      setDeleteQueueItems(payload.items || []);
      setDeleteQueueTotal(payload.total || 0);
      setDeleteQueueStats(payload.stats || { queued_total: 0, running_total: 0, failed_total: 0 });
    } catch (err: any) {
      setDeleteQueueError(err?.message || '加载删除队列失败');
    } finally {
      setDeleteQueueLoading(false);
    }
  };

  const openCreateDialog = () => {
    setCreateOpen(true);
  };

  useEffect(() => {
    if (openCreateTaskOnNav) {
      setCreateOpen(true);
      onConsumeOpenCreateTask?.();
    }
  }, [openCreateTaskOnNav, onConsumeOpenCreateTask]);

  const closeCreateDialog = () => {
    setPreSelectedMode(undefined);
    setCreateOpen(false);
  };

  const openDeleteQueue = () => {
    setDeleteQueueOpen(true);
    void loadDeleteQueue(1, deleteQueuePageSize, deleteQueueSortBy, deleteQueueSortDirection, deleteQueueFilters);
  };

  const closeDeleteQueue = () => {
    setDeleteQueueOpen(false);
  };

  const openTask = (task: ScheduleCenterUserTask) => {
    saveTaskCenterReturnContext();
    window.dispatchEvent(new CustomEvent('chimera-navigate-view', {
      detail: {
        view: 'task-report-view',
        taskReportTaskId: task.id,
      },
    }));
  };

  const submitDelete = async (taskIds: string[]) => {
    if (!taskIds.length || deleteSubmitting) return;
    const confirmed = await confirm({
      title: '确认删除任务',
      message: '会联动删除下游子任务，删除请求只会加入后台队列，且不可撤销。',
      confirmText:`删除 ${taskIds.length} 项`,
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    setDeleteSubmitting(true);
    try {
      for (const taskId of taskIds) {
        const task = tasks.find((t) => t.id === taskId);
        const desc = task?.description || '';
        const match = desc.match(/\[黑板:cairn:([^\]]+)\]/);
        if (match) {
          try { await api.domains.cairn.deleteProject(match[1]); } catch { /* cairn 项目可能已删,忽略 */ }
        }
      }
      await scheduleApi.bulkDeleteUserTasks(projectId, { task_ids: taskIds, select_all_matching: false });
      notify('已加入删除队列', 'success');
      setSelectedTaskIds([]);
      await loadData();
    } catch (err: any) {
      notify(err?.message || '删除入队失败', 'error');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const submitChangeProject = async (task: ScheduleCenterUserTask, newProjectId: string) => {
    if (!newProjectId || newProjectId === projectId || changeProjectSubmitting) return;
    setChangeProjectSubmitting(true);
    try {
      await scheduleApi.changeUserTaskProject(projectId, task.id, newProjectId);
      notify('任务已转移至目标项目', 'success');
      setChangeProjectTask(null);
      setChangeProjectTargetId('');
      await loadData();
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status;
      if (status === 409) notify('任务运行中，无法转移，请等待完成后再试', 'error');
      else if (status === 404) notify('任务不存在，可能已被删除', 'error');
      else if (status === 400) notify('任务已在目标项目中', 'error');
      else notify(err?.message || '任务转移失败', 'error');
    } finally {
      setChangeProjectSubmitting(false);
    }
  };

  const deleteStatusText = (task: ScheduleCenterUserTask) => {
    const status = String(task.delete_status || 'none');
    if (status === 'queued') return '删除排队中';
    if (status === 'running') return '删除中';
    if (status === 'blocked') return task.delete_error || task.last_error || '删除被阻塞';
    if (status === 'failed') return task.delete_error || task.last_error || '删除失败';
    return '';
  };

  const openTimelinePage = (task: ScheduleCenterUserTask) => {
    window.dispatchEvent(new CustomEvent('chimera-navigate-view', {
      detail: {
        view: 'task-center-timeline',
        taskCenterTimelineTaskId: task.id,
      },
    }));
  };

  const submitDeleteQueueFilters = async (event: React.FormEvent) => {
    event.preventDefault();
    setDeleteQueuePage(1);
    await loadDeleteQueue(1, deleteQueuePageSize, deleteQueueSortBy, deleteQueueSortDirection, deleteQueueFilters);
  };

  const resetDeleteQueueFilters = async () => {
    const nextFilters = {
      delete_status: '',
      task_type: '',
      search: '',
      has_error: false,
      from_time: '',
      to_time: '',
    };
    setDeleteQueueFilters(nextFilters);
    setDeleteQueuePage(1);
    await loadDeleteQueue(1, deleteQueuePageSize, deleteQueueSortBy, deleteQueueSortDirection, nextFilters);
  };

  const toggleDeleteQueueSort = async (nextSortBy: 'delete_requested_at' | 'updated_at' | 'name') => {
    const nextSortDirection = deleteQueueSortBy === nextSortBy && deleteQueueSortDirection === 'desc' ? 'asc' : 'desc';
    setDeleteQueueSortBy(nextSortBy);
    setDeleteQueueSortDirection(nextSortDirection);
    await loadDeleteQueue(deleteQueuePage, deleteQueuePageSize, nextSortBy, nextSortDirection, deleteQueueFilters);
  };

  const statsCards = [
    { label: '总任务', value: stats.total || total, icon: Shield, color: 'var(--text-primary)', shadow: 'var(--mask-primary)'},
    { label: '排队中', value: stats.queued || 0, icon: Rocket, color: '#D97706', shadow: 'rgba(217, 119, 6, 0.08)' },
    { label: '运行中', value: stats.running || 0, icon: CheckCircle2, color: '#2563EB', shadow: 'rgba(37, 99, 235, 0.08)' },
    { label: '失败', value: stats.failed || 0, icon: X, color: '#DC2626', shadow: 'rgba(220, 38, 38, 0.08)' },
  ];

  return (
    <div
      className="task-center space-y-4 px-5 py-5 md:px-6 2xl:px-8"
      style={{ minHeight: '100%', color: LK.inkSoft }}
    >
      <PageHeader
        title={<ServicePageTitle title="任务中心" className="" titleClassName="text-2xl font-semibold tracking-tight text-theme-text-primary" />}
        description="统一展示当前项目下的所有测试任务，追踪分发、执行与同步状态"
      />

      <div className="grid gap-3 md:grid-cols-4">
        {statsCards.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="flex items-center justify-between rounded-xl p-4"
              style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
            >
              <div>
                <div className="text-xs" style={{ color: LK.muted }}>
                  {item.label}
                </div>
                <div className="mt-1 text-3xl font-semibold tabular-nums text-theme-text-primary" style={{ color: item.color }}>
                  {item.value}
                </div>
              </div>
              <div
                className="flex h-9 w-9 items-center justify-center rounded-md"
                style={{ backgroundColor: item.shadow, color: item.color }}
              >
                <Icon size={18} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-theme-surface">
        {!hideActionBar && (
          <div className="flex items-center gap-2 rounded-xl px-4 py-3">
              <button onClick={openCreateDialog} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors" style={{ backgroundColor: LK.primary, color: '#ffffff' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.primaryDeep; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.primary; }}><Plus size={15} />创建任务</button>
              <button
                  onClick={() => void submitDelete(selectedTaskIds)}
                  disabled={!selectedTaskIds.length || deleteSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ backgroundColor: LK.error, color: '#ffffff' }}
                  onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#e04848'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.error; }}
              >
                {deleteSubmitting ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                批量删除（{selectedTaskIds.length}）
              </button>
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-theme-text-faint" size={16} />
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜索任务名、工具、状态"
                    className="form-input w-full pl-10"
                />
              </div>
              <button onClick={() => void loadData()} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}`, color: LK.inkSoft }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = LK.primary; e.currentTarget.style.color = LK.primarySoft; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = LK.border; e.currentTarget.style.color = LK.inkSoft; }}><RefreshCw size={16} /></button>
            </div>
        )}
        {(() => {
          const taskColumns: DataTableColumn<ScheduleCenterUserTask>[] = [
            {
              key: 'name',
              header: '任务名',
              width: '20%',
              render: (task) => <div className="text-sm">{task.name}</div>,
            },
            {
              key: 'tool',
              header: '工具',
              width: '15%',
              render: (task) => <div className="text-sm" style={{ color: LK.inkSoft }}>{getTaskHarnessLabel(task)}</div>,
            },
            {
              key: 'test_object',
              header: '测试对象',
              width: '20%',
              render: (task) => {
                const uploadId = task.inputs?.[0]?.input_upload_id;
                const label = getTaskTestObjectLabel(task);
                if (!uploadId) {
                  return <div className="text-sm" style={{ color: LK.inkSoft }}>{label}</div>;
                }
                return (
                  <a
                    href={`#/test-input-root?upload=${encodeURIComponent(uploadId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`查看测试对象：${label}`}
                    className="text-sm hover:underline"
                    style={{ color: LK.primary }}
                  >
                    {label}
                  </a>
                );
              },
            },
            {
              key: 'status',
              header: '任务状态',
              width: '10%',
              render: (task) => <div className="text-sm" style={{ color: LK.inkSoft }}>{getUserStatusLabel(task)}</div>,
            },
            {
              key: 'updated_at',
              header: '更新时间',
              width: '12%',
              sortable: true,
              sortKey: 'updated_at',
              defaultDirection: 'desc',
              render: (task) => <span className="text-xs whitespace-nowrap" style={{ color: LK.muted }}>{formatDateTime(task.updated_at)}</span>,
            },
            {
              key: 'actions',
              header: '操作',
              render: (task) => (
                <div className="flex items-center gap-1">
                  {(() => {
                    const status = getDisplayStatus(task);
                    const isRunning = !['success', 'partial_success', 'failed', 'cancelled', 'completed', 'pending', 'stopped', 'deleted'].includes(status);
                    const canExecute = ['stopped', 'pending', 'failed', 'cancelled'].includes(status);
                    const canPause = isRunning;
                    return (
                      <>
                        <button
                          type="button"
                          title="执行"
                          disabled={!canExecute}
                          className="inline-flex items-center justify-center rounded-lg p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                          style={{ color: LK.muted }}
                          onMouseEnter={(e) => { if (!e.currentTarget.disabled) { e.currentTarget.style.backgroundColor = LK.primaryMuted; e.currentTarget.style.color = LK.primary; } }}
                          onMouseLeave={(e) => { if (!e.currentTarget.disabled) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = LK.muted; } }}
                        >
                          <Play size={16} />
                        </button>
                        <button
                          type="button"
                          title="暂停"
                          disabled={!canPause}
                          className="inline-flex items-center justify-center rounded-lg p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                          style={{ color: LK.muted }}
                          onMouseEnter={(e) => { if (!e.currentTarget.disabled) { e.currentTarget.style.backgroundColor = LK.primaryMuted; e.currentTarget.style.color = LK.primary; } }}
                          onMouseLeave={(e) => { if (!e.currentTarget.disabled) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = LK.muted; } }}
                        >
                          <Pause size={16} />
                        </button>
                      </>
                    );
                  })()}
                  <button
                    onClick={() => openTask(task)}
                    title="查看报告"
                    className="inline-flex items-center justify-center rounded-lg p-1.5 transition-colors"
                    style={{ color: LK.muted }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.primaryMuted; e.currentTarget.style.color = LK.primary; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = LK.muted; }}
                  >
                    <FileText size={16} />
                  </button>
                  <button
                    onClick={() => {
                      window.open(`#/vuln-list?task=${encodeURIComponent(task.id)}`, '_blank', 'noopener,noreferrer');
                    }}
                    title={`查看漏洞 (${taskVulnCounts[task.id] === undefined ? '…' : taskVulnCounts[task.id]})`}
                    className="relative inline-flex items-center justify-center rounded-lg p-1.5 transition-colors"
                    style={{ color: LK.muted }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.primaryMuted; e.currentTarget.style.color = LK.primary; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = LK.muted; }}
                  >
                    <Bug size={16} />
                    {(() => {
                      const c = taskVulnCounts[task.id];
                      if (c === undefined || c === 0) return null;
                      return (
                        <span
                          className="absolute -top-1 -right-1 inline-flex min-w-[15px] h-[15px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none"
                          style={{ backgroundColor: LK.error, color: '#FFFFFF' }}
                        >
                          {c > 99 ? '99+' : c}
                        </span>
                      );
                    })()}
                  </button>
                  <button
                    type="button"
                    title="修改所属项目"
                    aria-label="修改所属项目"
                    onClick={() => { setChangeProjectTargetId(''); setChangeProjectTask(task); }}
                    disabled={['dispatched','running','queued','pending'].includes(String(task.dispatch_status || '')) || changeProjectSubmitting}
                    className="inline-flex items-center justify-center rounded-lg p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ color: LK.muted }}
                    onMouseEnter={(e) => { if (!e.currentTarget.disabled) { e.currentTarget.style.backgroundColor = LK.primaryMuted; e.currentTarget.style.color = LK.primary; } }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = LK.muted; }}
                  >
                    <FolderInput size={16} />
                  </button>
                  <button
                    onClick={() => void submitDelete([task.id])}
                    disabled={deleteSubmitting || ['queued', 'running'].includes(String(task.delete_status || 'none'))}
                    title="删除"
                    className="inline-flex items-center justify-center rounded-lg p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ color: LK.muted }}
                    onMouseEnter={(e) => { if (!e.currentTarget.disabled) { e.currentTarget.style.backgroundColor = `${LK.errorSoft}`; e.currentTarget.style.color = LK.error; } }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = LK.muted; }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ),
            },
          ];
          return (
            <div className='px-4'>
              <DataTable
                columns={taskColumns}
                data={tasks}
                rowKey={(task) => task.id}
                loading={loading}
                showRowNumber={true}
                sort={{ field: sortBy, direction: sortDirection }}
                onSortChange={({ field, direction }) => {
                  setSortBy(field);
                  setSortDirection(direction);
                  setPage(1);
                  void loadData(1, pageSize, field, direction, query);
                }}
                bulkActions={{
                  selectedKeys: selectedTaskIds,
                  onSelectChange: setSelectedTaskIds,
                  render: () => null,
                }}
                pagination={{
                  page,
                  perPage: pageSize,
                  total,
                  perPageOptions: [10, 20, 50, 100, 200],
                  onPageChange: (next) => {
                    setPage(next);
                    void loadData(next, pageSize, sortBy, sortDirection, query);
                  },
                  onPerPageChange: (next) => {
                    setPageSize(next);
                    setPage(1);
                    void loadData(1, next, sortBy, sortDirection, query);
                  },
                }}
                empty={<div className="py-10 text-center text-sm" style={{ color: LK.muted }}>暂无任务</div>}
              />
            </div>
          );
        })()}
      </div>
      {feedbackNodes}

      {changeProjectTask && (
        <Modal
          open={!!changeProjectTask}
          onClose={() => { if (!changeProjectSubmitting) { setChangeProjectTask(null); setChangeProjectTargetId(''); } }}
          title="修改任务所属项目"
          description={`当前任务：${changeProjectTask.name}`}
          className="flex flex-col h-[360px] !overflow-visible"
          bodyClassName="flex-1 !overflow-visible"
          footer={
            <>
              <button
                type="button"
                onClick={() => { if (!changeProjectSubmitting) { setChangeProjectTask(null); setChangeProjectTargetId(''); } }}
                className="btn-secondary rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                disabled={!changeProjectTargetId || changeProjectTargetId === projectId || changeProjectSubmitting}
                onClick={() => void submitChangeProject(changeProjectTask, changeProjectTargetId)}
                className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
              >
                确认转移
              </button>
            </>
          }
        >
          <div className="py-1">
            <label className="block text-sm font-semibold text-theme-text-primary">
              目标项目
              <DropdownSelect
                value={changeProjectTargetId}
                onChange={setChangeProjectTargetId}
                options={projects.filter((p) => p.id !== projectId).map((p) => ({ value: p.id, label: p.name }))}
                placeholder="请选择目标项目"
                emptyText="暂无其他可选项目"
                containerClassName="mt-1"
                panelClassName="max-h-[240px] overflow-hidden"
              />
            </label>
          </div>
        </Modal>
      )}

      {deleteQueueOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in"
          style={{ backgroundColor: 'rgba(5, 10, 20, 0.72)', backdropFilter: 'blur(6px)' }}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl animate-in"
            style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
          >
            <div className="flex items-start justify-between px-6 py-5" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
              <div>
                <div className="text-lg font-semibold leading-7" style={{ color: LK.ink }}>
                  删除队列
                </div>
                <div className="mt-1 text-sm" style={{ color: LK.muted }}>{projectName}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full px-3 py-1 font-medium" style={{ backgroundColor: `${LK.warning}22`, color: LK.warning }}>
                    排队中 {deleteQueueStats.queued_total}
                  </span>
                  <span className="rounded-full px-3 py-1 font-medium" style={{ backgroundColor: `${LK.info}22`, color: LK.info }}>
                    删除中 {deleteQueueStats.running_total}
                  </span>
                  <span className="rounded-full px-3 py-1 font-medium" style={{ backgroundColor: `${LK.error}22`, color: LK.error }}>
                    失败 {deleteQueueStats.failed_total}
                  </span>
                </div>
              </div>
              <button
                onClick={closeDeleteQueue}
                className="rounded-lg p-2 transition-colors"
                style={{ color: LK.muted }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.surfaceRaised; e.currentTarget.style.color = LK.ink; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = LK.muted; }}
              >
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={(event) => { void submitDeleteQueueFilters(event); }}
              className="px-6 py-4"
              style={{ borderBottom:`1px solid ${LK.borderSoft}` }}
            >
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                <label className="block text-sm font-semibold xl:col-span-2" style={{ color: LK.inkSoft }}>
                  搜索
                  <input
                    value={deleteQueueFilters.search}
                    onChange={(e) => setDeleteQueueFilters((current) => ({ ...current, search: e.target.value }))}
                    placeholder="任务名 / 任务ID / 删除错误"
                    className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
                    style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
                  />
                </label>
                <label className="block text-sm font-semibold" style={{ color: LK.inkSoft }}>
                  删除状态
                  <select
                    value={deleteQueueFilters.delete_status}
                    onChange={(e) => setDeleteQueueFilters((current) => ({ ...current, delete_status: e.target.value }))}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
                    style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
                  >
                    <option value="">全部</option>
                    <option value="queued">queued</option>
                    <option value="running">running</option>
                    <option value="failed">failed</option>
                  </select>
                </label>
                <label className="block text-sm font-semibold" style={{ color: LK.inkSoft }}>
                  任务类型
                  <select
                    value={deleteQueueFilters.task_type}
                    onChange={(e) => setDeleteQueueFilters((current) => ({ ...current, task_type: e.target.value }))}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
                    style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
                  >
                    <option value="">全部</option>
                    {TASK_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-semibold" style={{ color: LK.inkSoft }}>
                  请求开始
                  <input
                    type="datetime-local"
                    value={deleteQueueFilters.from_time}
                    onChange={(e) => setDeleteQueueFilters((current) => ({ ...current, from_time: e.target.value }))}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
                    style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
                  />
                </label>
                <label className="block text-sm font-semibold" style={{ color: LK.inkSoft }}>
                  请求结束
                  <input
                    type="datetime-local"
                    value={deleteQueueFilters.to_time}
                    onChange={(e) => setDeleteQueueFilters((current) => ({ ...current, to_time: e.target.value }))}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
                    style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
                  />
                </label>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-sm" style={{ color: LK.body }}>
                  <input
                    type="checkbox"
                    checked={deleteQueueFilters.has_error}
                    onChange={(e) => setDeleteQueueFilters((current) => ({ ...current, has_error: e.target.checked }))}
                  />
                  仅看有错误项
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void loadDeleteQueue(deleteQueuePage, deleteQueuePageSize, deleteQueueSortBy, deleteQueueSortDirection, deleteQueueFilters)}
                    className="rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                    style={{ backgroundColor: LK.surfaceRaised, color: LK.body, border: `1px solid ${LK.border}` }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = LK.ink; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = LK.body; }}
                  >
                    刷新
                  </button>
                  <button
                    type="button"
                    onClick={() => void resetDeleteQueueFilters()}
                    className="rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                    style={{ backgroundColor: LK.surfaceRaised, color: LK.body, border: `1px solid ${LK.border}` }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = LK.ink; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = LK.body; }}
                  >
                    重置
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                    style={{ backgroundColor: LK.primary, color: '#ffffff' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.primaryDeep; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.primary; }}
                  >
                    查询
                  </button>
                </div>
              </div>
            </form>

            {deleteQueueError ? (
              <div
                className="mx-6 mt-4 rounded-lg px-4 py-3 text-sm"
                style={{ backgroundColor: `${LK.error}14`, border: `1px solid ${LK.error}40`, color: LK.error }}
              >
                {deleteQueueError}
              </div>
            ) : null}

            <div className="flex-1 overflow-auto px-6 py-4">
              <div
                className="overflow-hidden rounded-xl"
                style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
              >
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider" style={{ color: LK.mutedSoft }}>
                      <th className="px-4 py-2.5 font-medium" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>
                        <button type="button" onClick={() => void toggleDeleteQueueSort('name')} className="font-semibold">任务名</button>
                      </th>
                      <th className="px-4 py-2.5 font-medium" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>类型</th>
                      <th className="px-4 py-2.5 font-medium" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>当前任务状态</th>
                      <th className="px-4 py-2.5 font-medium" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>删除状态</th>
                      <th className="px-4 py-2.5 font-medium" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>删除错误</th>
                      <th className="px-4 py-2.5 font-medium" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>下游任务 ID</th>
                      <th className="px-4 py-2.5 font-medium" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>
                        <button type="button" onClick={() => void toggleDeleteQueueSort('delete_requested_at')} className="font-semibold">删除请求时间</button>
                      </th>
                      <th className="px-4 py-2.5 font-medium" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>删除开始时间</th>
                      <th className="px-4 py-2.5 font-medium" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>删除完成时间</th>
                      <th className="px-4 py-2.5 font-medium" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>
                        <button type="button" onClick={() => void toggleDeleteQueueSort('updated_at')} className="font-semibold">更新时间</button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {deleteQueueLoading ? <tr><td className="px-4 py-10 text-center" colSpan={10} style={{ color: LK.muted }}><span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" />加载中...</span></td></tr> : null}
                    {!deleteQueueLoading && deleteQueueItems.length === 0 ? <tr><td className="px-4 py-10 text-center" colSpan={10} style={{ color: LK.muted }}>当前项目暂无删除队列任务</td></tr> : null}
                    {!deleteQueueLoading && deleteQueueItems.map((item) => {
                      const statusColor = item.delete_status === 'failed' ? LK.error : item.delete_status === 'blocked' ? LK.warning : item.delete_status === 'running' ? LK.info : LK.warning;
                      return (
                        <tr
                          key={item.id}
                          className="transition-colors"
                          style={{
                            borderBottom:`1px solid ${LK.borderSoft}`,
                            backgroundColor: item.delete_status === 'failed'
                              ?`${LK.error}10`
                              : item.delete_status === 'blocked'
                                ? `${LK.warning}10`
                              : item.delete_status === 'running'
                                ?`${LK.info}10`
                                :`${LK.warning}10`,
                          }}
                        >
                          <td className="px-4 py-3 font-semibold" style={{ color: LK.inkSoft }}>{item.name}</td>
                          <td className="px-4 py-3" style={{ color: LK.body }}>{getDeleteQueueTypeLabel(String(item.task_type || ''))}</td>
                          <td className="px-4 py-3" style={{ color: LK.body }}>{getUserStatusLabelFromValue(item.display_status)}</td>
                          <td className="px-4 py-3">
                            <span style={{ color: statusColor }}>
                              {getDeleteStatusLabel(String(item.delete_status || ''))}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs" style={{ color: LK.body }} title={item.delete_error || item.last_error || ''}>{truncateText(item.delete_error || item.last_error, 120)}</td>
                          <td className="px-4 py-3" style={{ fontFamily: MONO, fontSize: '12px', color: LK.body }}>{item.downstream_task_id || '—'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: LK.muted }}>{formatDateTime(item.delete_requested_at)}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: LK.muted }}>{formatDateTime(item.delete_started_at)}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: LK.muted }}>{formatDateTime(item.delete_finished_at)}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: LK.muted }}>{formatDateTime(item.updated_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div
              className="flex items-center justify-between px-6 py-4 text-sm"
              style={{ borderTop:`1px solid ${LK.border}` }}
            >
              <div style={{ color: LK.muted }}>
                共 {deleteQueueTotal} 条，当前第 {deleteQueuePage} / {deleteQueueTotalPages} 页
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={deleteQueuePageSize}
                  onChange={(e) => {
                    const nextPageSize = Number(e.target.value) || 20;
                    setDeleteQueuePageSize(nextPageSize);
                    setDeleteQueuePage(1);
                    void loadDeleteQueue(1, nextPageSize, deleteQueueSortBy, deleteQueueSortDirection, deleteQueueFilters);
                  }}
                  className="rounded-lg px-2 py-1 outline-none transition-colors"
                  style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
                >
                  {[20, 50, 100].map((size) => <option key={size} value={size}>{size} / 页</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => { const next = Math.max(1, deleteQueuePage - 1); setDeleteQueuePage(next); void loadDeleteQueue(next, deleteQueuePageSize, deleteQueueSortBy, deleteQueueSortDirection, deleteQueueFilters); }}
                  disabled={deleteQueuePage <= 1 || deleteQueueLoading}
                  className="rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ backgroundColor: LK.surfaceRaised, color: LK.body, border: `1px solid ${LK.border}` }}
                  onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.color = LK.ink; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = LK.body; }}
                >
                  上一页
                </button>
                <button
                  type="button"
                  onClick={() => { const next = Math.min(deleteQueueTotalPages, deleteQueuePage + 1); setDeleteQueuePage(next); void loadDeleteQueue(next, deleteQueuePageSize, deleteQueueSortBy, deleteQueueSortDirection, deleteQueueFilters); }}
                  disabled={deleteQueuePage >= deleteQueueTotalPages || deleteQueueLoading}
                  className="rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ backgroundColor: LK.surfaceRaised, color: LK.body, border: `1px solid ${LK.border}` }}
                  onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.color = LK.ink; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = LK.body; }}
                >
                  下一页
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <CreateTaskDialog
        open={createOpen}
        onClose={closeCreateDialog}
        projectId={projectId}
        projectName={projectName}
        projects={projects}
        onRefreshProjects={onRefreshProjects}
        preSelectedMode={preSelectedMode}
        onCreated={() => { setPreSelectedMode(undefined); closeCreateDialog(); void loadData(); }}
      />
    </div>
  );
};
