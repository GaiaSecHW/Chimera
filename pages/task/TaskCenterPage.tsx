import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Loader2, Plus, RefreshCw, Rocket, Search, Shield, Square, SquareCheck, X } from 'lucide-react';
import { api } from '../../clients/api';
import { getAuthHeaders, handleResponse } from '../../clients/base';
import { agentManageApiPath } from '../../clients/agentManage';
import { useUiFeedback } from '../../components/UiFeedback';
import { saveTaskCenterReturnContext } from '../../utils/executionReturnContext';
import { CreateTaskDialog } from './CreateTaskDialog';
import {
  AgentAppSummary,
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
}

type TaskTypeOption = {
  value: ScheduleCenterUserTaskType;
  label: string;
  downstreamView?: string;
};

const TASK_TYPES: readonly TaskTypeOption[] = [
  { value: 'binary_firmware_e2e', label: '盖亚-二进制固件', downstreamView: 'binary-security-detail' },
  { value: 'source_scan_e2e', label: '盖亚-源码', downstreamView: 'source-security-detail' },
  { value: 'binary_module_e2e', label: '盖亚-二进制模块', downstreamView: 'binary-module-security-detail' },
  { value: 'ai4apk', label: 'AI4APP 应用安全扫描', downstreamView: 'app-security-scan-detail' },
  { value: 'ai4red', label: 'AI4RED 红线验证', downstreamView: 'ai4red-detail' },
  { value: 'sechps_tool', label: 'Agent Harness 任务' },
];

const loadAgentApps = async (departmentId?: number | string | null, tenantId?: number | string | null): Promise<AgentAppSummary[]> => {
  const params = new URLSearchParams();
  if (departmentId) params.set('departmentId', String(departmentId));
  if (tenantId) params.set('tenantId', String(tenantId));
  const qs = params.toString();
  const response = await fetch(agentManageApiPath(`/agent-apps${qs ?`?${qs}` : ''}`), { headers: getAuthHeaders() });
  const payload = await handleResponse(response);
  return Array.isArray(payload?.apps) ? payload.apps : [];
};

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
const getSyncSummary = (task: ScheduleCenterUserTask) => {
  const pieces = [task.sync_status || 'none'];
  if (task.downstream_status_raw) pieces.push(`downstream=${task.downstream_status_raw}`);
  if (task.next_sync_at) pieces.push(`next=${formatDateTime(task.next_sync_at)}`);
  if (task.last_sync_error) pieces.push(`error=${task.last_sync_error}`);
  return pieces.join(' | ');
};
const getTaskTypeLabel = (taskType: string) => TASK_TYPES.find((item) => item.value === taskType)?.label || taskType;
const getTaskHarnessLabel = (task: Pick<ScheduleCenterUserTask, 'task_type' | 'agent_app_name'>) =>
  task.task_type === 'sechps_tool' ? (task.agent_app_name || 'Agent Harness') : getTaskTypeLabel(String(task.task_type || ''));
const getDeleteQueueTypeLabel = (taskType: string) => taskType === 'sechps_tool' ? 'Agent Harness 任务' : getTaskTypeLabel(taskType);
const truncateText = (value?: string | null, max = 80) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '—';
  return normalized.length > max ?`${normalized.slice(0, max)}...` : normalized;
};

// LOKI design tokens (DESIGN.md) — page-local palette.
const LK = {
  primary: '#4f73ff',
  primarySoft: '#7590ff',
  primaryDeep: '#3f63f1',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: '#070d18',
  surface: '#111a2b',
  surfaceRaised: '#18233a',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: '#26324a',
  borderSoft: '#1b2438',
  ink: '#f5f7ff',
  inkSoft: '#d6def0',
  body: '#a4aec4',
  muted: '#72809a',
  mutedSoft: '#8b95a8',
  success: '#45c06f',
  warning: '#d5a13a',
  error: '#f15d5d',
  info: '#4f8cff',
} as const;

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

export const TaskCenterPage: React.FC<Props> = ({ projectId, projects }) => {
  const scheduleApi = api.domains.platform.scheduleCenter;
  const currentUser = useMemo(() => getLocalUserInfo(), []);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<ScheduleCenterUserTask[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [agentApps, setAgentApps] = useState<AgentAppSummary[]>([]);
  const [query, setQuery] = useState('');
  const [selectedAgentAppFilter, setSelectedAgentAppFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
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
  const { notify, confirm, feedbackNodes } = useUiFeedback();

  const projectName = useMemo(() => projects.find((item) => item.id === projectId)?.name || projectId, [projectId, projects]);
  const filteredTasks = useMemo(() => {
    const term = query.trim().toLowerCase();
    return tasks.filter((item) => {
      if (selectedAgentAppFilter && String(item.agent_app_id || '') !== selectedAgentAppFilter) return false;
      if (!term) return true;
      return [item.name, item.task_type, item.agent_app_name || '', item.agent_app_id || '', getDisplayStatus(item), item.sync_status, item.downstream_task_id || '']
        .some((value) => String(value || '').toLowerCase().includes(term));
    });
  }, [query, selectedAgentAppFilter, tasks]);
  const deletableTaskIds = useMemo(
    () => filteredTasks.filter((task) => !['queued', 'running'].includes(String(task.delete_status || 'none'))).map((task) => task.id),
    [filteredTasks],
  );
  const allVisibleSelected = useMemo(
    () => deletableTaskIds.length > 0 && deletableTaskIds.every((taskId) => selectedTaskIds.includes(taskId)),
    [deletableTaskIds, selectedTaskIds],
  );
  const deleteQueueTotalPages = useMemo(
    () => Math.max(1, Math.ceil(deleteQueueTotal / deleteQueuePageSize)),
    [deleteQueuePageSize, deleteQueueTotal],
  );

  const loadData = async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const [taskResp, appResp] = await Promise.all([
        scheduleApi.listUserTasks(projectId, selectedAgentAppFilter ? { agent_app_id: selectedAgentAppFilter } : {}) as Promise<ScheduleCenterUserTaskListResponse>,
        loadAgentApps(currentUser?.department_id, currentUser?.department_id),
      ]);
      setTasks(taskResp.items || []);
      setStats(taskResp.stats || {});
      setAgentApps(appResp || []);
    } catch (err: any) {
      setError(err?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, [projectId, selectedAgentAppFilter]);
  useEffect(() => { setSelectedTaskIds([]); }, [projectId, query, selectedAgentAppFilter]);

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

  const closeCreateDialog = () => {
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
    if (task.task_type === 'sechps_tool') return;
    const meta = TASK_TYPES.find((item) => item.value === task.task_type);
    if (!meta || !meta.downstreamView) return;
    const taskIdentifier = task.downstream_task_id || task.id;
    saveTaskCenterReturnContext();
    if (meta.downstreamView === 'ai4red-detail') {
      window.dispatchEvent(new CustomEvent('chimera-navigate-view', {
        detail: {
          view: 'ai4red-detail',
          redlineTaskId: taskIdentifier,
        },
      }));
      return;
    }
    window.dispatchEvent(new CustomEvent('chimera-navigate-view', {
      detail: {
        view: meta.downstreamView,
        [meta.downstreamView === 'binary-security-detail'
          ? 'binarySecurityTaskId'
          : meta.downstreamView === 'source-security-detail'
            ? 'sourceSecurityTaskId'
            : meta.downstreamView === 'binary-module-security-detail'
              ? 'binaryModuleSecurityTaskId'
              : meta.downstreamView === 'app-security-scan-detail'
                ? 'appScanTaskId'
                : 'redlineTaskId']: taskIdentifier,
      },
    }));
  };

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds((current) => current.includes(taskId) ? current.filter((item) => item !== taskId) : [...current, taskId]);
  };

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedTaskIds((current) => current.filter((taskId) => !deletableTaskIds.includes(taskId)));
      return;
    }
    setSelectedTaskIds((current) => Array.from(new Set([...current, ...deletableTaskIds])));
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

  const submitDeleteAllFiltered = async () => {
    if (!filteredTasks.length || deleteSubmitting) return;
    const confirmed = await confirm({
      title: '确认删除全部任务',
      message:`会删除当前项目下任务列表中可删除的全部 ${deletableTaskIds.length} 项任务，并联动删除下游子任务。此操作不可撤销。`,
      confirmText:`删除全部 ${deletableTaskIds.length} 项`,
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    setDeleteSubmitting(true);
    try {
      await scheduleApi.bulkDeleteUserTasks(projectId, {
        task_ids: [],
        select_all_matching: true,
        filters: {},
      });
      notify('已加入全部任务删除队列', 'success');
      setSelectedTaskIds([]);
      await loadData();
    } catch (err: any) {
      notify(err?.message || '全部删除入队失败', 'error');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const deleteStatusText = (task: ScheduleCenterUserTask) => {
    const status = String(task.delete_status || 'none');
    if (status === 'queued') return '删除排队中';
    if (status === 'running') return '删除中';
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

  const requestSync = async (task: ScheduleCenterUserTask) => {
    try {
      await scheduleApi.syncUserTask(projectId, task.id, { force: true });
      notify('已加入同步队列', 'success');
      await loadData();
    } catch (err: any) {
      notify(err?.message || '加入同步队列失败', 'error');
    }
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
    { label: '总任务', value: stats.total || tasks.length, icon: Shield },
    { label: '排队中', value: stats.queued || 0, icon: Rocket },
    { label: '分发中', value: stats.dispatching || 0, icon: Loader2 },
    { label: '运行中', value: stats.running || 0, icon: CheckCircle2 },
    { label: '失败', value: stats.failed || 0, icon: X },
  ];

  return (
    <div
      className="space-y-4 px-5 py-5 md:px-6 2xl:px-8"
      style={{ backgroundColor: LK.canvas, minHeight: '100%', color: LK.inkSoft }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 pb-4" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
        <div>
          <h1 className="text-2xl font-semibold leading-8 tracking-tight" style={{ color: LK.ink }}>
            任务中心
          </h1>
          <div className="mt-1 text-sm" style={{ color: LK.body }}>
            {projectName}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openDeleteQueue}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
            style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}`, color: LK.inkSoft }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = LK.primary; e.currentTarget.style.color = LK.primarySoft; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = LK.border; e.currentTarget.style.color = LK.inkSoft; }}
          >
            <Shield size={15} />删除队列
          </button>
          <button
            onClick={() => void loadData()}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
            style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}`, color: LK.inkSoft }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = LK.primary; e.currentTarget.style.color = LK.primarySoft; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = LK.border; e.currentTarget.style.color = LK.inkSoft; }}
          >
            <RefreshCw size={15} />刷新
          </button>
          <button
            onClick={openCreateDialog}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
            style={{ backgroundColor: LK.primary, color: '#ffffff' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.primaryDeep; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.primary; }}
          >
            <Plus size={15} />创建任务
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        {statsCards.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="flex items-center justify-between rounded-xl px-4 py-3"
              style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
            >
              <div>
                <div className="text-xs" style={{ color: LK.muted }}>
                  {item.label}
                </div>
                <div className="mt-1 text-2xl font-semibold leading-7 tabular-nums" style={{ color: LK.ink }}>
                  {item.value}
                </div>
              </div>
              <div
                className="flex h-9 w-9 items-center justify-center rounded-md"
                style={{ backgroundColor: LK.surfaceRaised, color: LK.body }}
              >
                <Icon size={18} />
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="flex items-center gap-2 rounded-lg px-3"
        style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
      >
        <Search size={16} style={{ color: LK.muted }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索任务名、Harness、状态、下游任务 ID"
          className="w-full bg-transparent py-2.5 text-sm outline-none"
          style={{ color: LK.inkSoft }}
        />
        <select
          value={selectedAgentAppFilter}
          onChange={(e) => setSelectedAgentAppFilter(e.target.value)}
          className="rounded-lg px-2 py-1 outline-none transition-colors text-sm"
          style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
          onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
          onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
        >
          <option value="">全部 Harness</option>
          {agentApps.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>

      <div
        className="flex items-center justify-between gap-3 rounded-lg px-4 py-3"
        style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
      >
        <div className="text-sm" style={{ color: LK.body }}>
          当前页已选 <span style={{ color: LK.ink }}>{selectedTaskIds.length}</span> 项
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void submitDeleteAllFiltered()}
            disabled={!deletableTaskIds.length || deleteSubmitting}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: `${LK.error}22`, color: LK.error, border: `1px solid ${LK.error}40` }}
            onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor =`${LK.error}3a`; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor =`${LK.error}22`; }}
          >
            {deleteSubmitting ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
            删除全部任务（{deletableTaskIds.length}）
          </button>
          <button
            onClick={() => void submitDelete(selectedTaskIds)}
            disabled={!selectedTaskIds.length || deleteSubmitting}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: LK.error, color: '#ffffff' }}
            onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#e04848'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.error; }}
          >
            {deleteSubmitting ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
            批量删除（{selectedTaskIds.length}）
          </button>
        </div>
      </div>

      {error ? (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{ backgroundColor: `${LK.error}14`, border: `1px solid ${LK.error}40`, color: LK.error }}
        >
          {error}
        </div>
      ) : null}

      <div
        className="overflow-hidden rounded-xl"
        style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
      >
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider" style={{ color: LK.mutedSoft }}>
              <th className="px-4 py-2.5 font-medium" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>
                <button type="button" onClick={toggleSelectAllVisible} style={{ color: LK.muted }}>
                  {allVisibleSelected ? <SquareCheck size={16} /> : <Square size={16} />}
                </button>
              </th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>任务名</th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>类型</th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>任务状态</th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>同步状态</th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>下游任务 ID</th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>更新时间</th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td className="px-4 py-10 text-center" colSpan={9} style={{ color: LK.muted }}><span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" />加载中...</span></td></tr> : null}
            {!loading && filteredTasks.length === 0 ? <tr><td className="px-4 py-10 text-center" colSpan={9} style={{ color: LK.muted }}>暂无任务</td></tr> : null}
            {filteredTasks.map((task) => (
              <tr
                key={task.id}
                className="transition-colors"
                style={{ borderBottom:`1px solid ${LK.borderSoft}` }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.surfaceRaised; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleTaskSelection(task.id)}
                    disabled={['queued', 'running'].includes(String(task.delete_status || 'none'))}
                    className="transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ color: LK.muted }}
                    onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.color = LK.ink; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = LK.muted; }}
                  >
                    {selectedTaskIds.includes(task.id) ? <SquareCheck size={16} /> : <Square size={16} />}
                  </button>
                </td>
                <td className="px-4 py-3 whitespace-nowrap" style={{ color: LK.inkSoft }}>
                  <div className="font-semibold">{task.name}</div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="font-semibold" style={{ color: LK.inkSoft }}>{getTaskHarnessLabel(task)}</div>
                  {task.task_type === 'sechps_tool' ? <div className="text-xs" style={{ color: LK.muted }}>Agent Harness / {task.agent_app_engine || 'unknown'}</div> : null}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="font-semibold" style={{ color: LK.inkSoft }}>{getDisplayStatus(task)}</div>
                  <div className="text-xs" style={{ color: LK.muted }}>{task.dispatch_status} / {task.business_status}</div>
                </td>
                <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: LK.body }} title={getSyncSummary(task)}>
                  {task.sync_status || 'none'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap" style={{ fontFamily: MONO, fontSize: '12px', color: LK.body }}>
                  {task.downstream_task_id || '—'}
                </td>
                <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: LK.muted }}>
                  {formatDateTime(task.updated_at)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {task.task_type !== 'sechps_tool' ? (
                      <button
                        onClick={() => openTask(task)}
                        className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                        style={{ backgroundColor: LK.surfaceRaised, color: LK.body, border: `1px solid ${LK.border}` }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.primaryMuted; e.currentTarget.style.color = LK.primary; e.currentTarget.style.borderColor = LK.primary; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.surfaceRaised; e.currentTarget.style.color = LK.body; e.currentTarget.style.borderColor = LK.border; }}
                      >
                        查看任务 <ArrowRight size={12} />
                      </button>
                    ) : null}
                    {task.sync_required ? (
                      <button
                        onClick={() => void requestSync(task)}
                        className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                        style={{ backgroundColor: LK.surfaceRaised, color: LK.body, border: `1px solid ${LK.border}` }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.primaryMuted; e.currentTarget.style.color = LK.primary; e.currentTarget.style.borderColor = LK.primary; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.surfaceRaised; e.currentTarget.style.color = LK.body; e.currentTarget.style.borderColor = LK.border; }}
                      >
                        <RefreshCw size={12} />
                        立即同步
                      </button>
                    ) : null}
                    <button
                      onClick={() => openTimelinePage(task)}
                      className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                      style={{ backgroundColor: LK.surfaceRaised, color: LK.body, border: `1px solid ${LK.border}` }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.primaryMuted; e.currentTarget.style.color = LK.primary; e.currentTarget.style.borderColor = LK.primary; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.surfaceRaised; e.currentTarget.style.color = LK.body; e.currentTarget.style.borderColor = LK.border; }}
                    >
                      时间线
                    </button>
                    <button
                      onClick={() => void submitDelete([task.id])}
                      disabled={deleteSubmitting || ['queued', 'running'].includes(String(task.delete_status || 'none'))}
                      className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ backgroundColor: `${LK.error}22`, color: LK.error, border: `1px solid ${LK.error}40` }}
                      onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor =`${LK.error}3a`; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor =`${LK.error}22`; }}
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {feedbackNodes}

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
                    placeholder="任务名 / 任务ID / 下游任务ID / 删除错误"
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
                      const statusColor = item.delete_status === 'failed' ? LK.error : item.delete_status === 'running' ? LK.info : LK.warning;
                      return (
                        <tr
                          key={item.id}
                          className="transition-colors"
                          style={{
                            borderBottom:`1px solid ${LK.borderSoft}`,
                            backgroundColor: item.delete_status === 'failed'
                              ?`${LK.error}10`
                              : item.delete_status === 'running'
                                ?`${LK.info}10`
                                :`${LK.warning}10`,
                          }}
                        >
                          <td className="px-4 py-3 font-semibold" style={{ color: LK.inkSoft }}>{item.name}</td>
                          <td className="px-4 py-3" style={{ color: LK.body }}>{getDeleteQueueTypeLabel(String(item.task_type || ''))}</td>
                          <td className="px-4 py-3" style={{ color: LK.body }}>{item.display_status}</td>
                          <td className="px-4 py-3">
                            <span style={{ color: statusColor }}>
                              {item.delete_status}
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
        onCreated={() => { closeCreateDialog(); void loadData(); }}
      />
    </div>
  );
};
