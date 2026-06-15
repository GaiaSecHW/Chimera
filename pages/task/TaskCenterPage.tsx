import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, ChevronRight, Folder, FolderOpen, Loader2, Plus, RefreshCw, Rocket, Search, Shield, Square, SquareCheck, X } from 'lucide-react';
import { api } from '../../clients/api';
import { getAuthHeaders, handleResponse } from '../../clients/base';
import { agentManageApiPath } from '../../clients/agentManage';
import { useUiFeedback } from '../../components/UiFeedback';
import { getUploadRecordDisplayName } from '../assets/baseResourcePageModel';
import { saveTaskCenterReturnContext } from '../../utils/executionReturnContext';
import {
  AgentAppSummary,
  ProjectInputUploadBrowseEntry,
  ProjectInputUploadBrowseResponse,
  ProjectInputUploadRecord,
  ScheduleCenterUserTaskDeleteQueueItem,
  ScheduleCenterUserTaskDeleteQueueResponse,
  ScheduleCenterUserTask,
  ScheduleCenterUserTaskCreatePayload,
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

const CREATE_TABS = [
  { key: 'basic', label: '基础信息' },
  { key: 'input', label: '输入选择' },
  { key: 'options', label: '创建选项' },
] as const;

const INPUT_MODES: Record<string, 'file' | 'file_list' | 'directory'> = {
  binary_firmware_e2e: 'file',
  binary_module_e2e: 'file_list',
  source_scan_e2e: 'directory',
  ai4red: 'directory',
  ai4apk: 'file',
  sechps_tool: 'directory',
};

const loadAgentApps = async (departmentId?: number | string | null, tenantId?: number | string | null): Promise<AgentAppSummary[]> => {
  const params = new URLSearchParams();
  if (departmentId) params.set('departmentId', String(departmentId));
  if (tenantId) params.set('tenantId', String(tenantId));
  const qs = params.toString();
  const response = await fetch(agentManageApiPath(`/agent-apps${qs ? `?${qs}` : ''}`), { headers: getAuthHeaders() });
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
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
};

export const TaskCenterPage: React.FC<Props> = ({ projectId, projects }) => {
  const scheduleApi = api.domains.platform.scheduleCenter;
  const fileserverApi = api.domains.assets.fileserver;
  const currentUser = useMemo(() => getLocalUserInfo(), []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tasks, setTasks] = useState<ScheduleCenterUserTask[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [inputs, setInputs] = useState<ProjectInputUploadRecord[]>([]);
  const [agentApps, setAgentApps] = useState<AgentAppSummary[]>([]);
  const [query, setQuery] = useState('');
  const [selectedAgentAppFilter, setSelectedAgentAppFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [activeCreateTab, setActiveCreateTab] = useState<(typeof CREATE_TABS)[number]['key']>('basic');
  const [taskType, setTaskType] = useState<(typeof TASK_TYPES)[number]['value']>('binary_firmware_e2e');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedInputId, setSelectedInputId] = useState('');
  const [inputBrowseLoading, setInputBrowseLoading] = useState(false);
  const [inputBrowseError, setInputBrowseError] = useState('');
  const [inputCurrentPath, setInputCurrentPath] = useState('');
  const [browseCache, setBrowseCache] = useState<Record<string, ProjectInputUploadBrowseResponse>>({});
  const [expandedPaths, setExpandedPaths] = useState<string[]>([]);
  const [selectedRelativePath, setSelectedRelativePath] = useState<string | null>(null);
  const [selectedRelativePaths, setSelectedRelativePaths] = useState<string[]>([]);
  const [directorySelectionTouched, setDirectorySelectionTouched] = useState(false);
  const [moduleName, setModuleName] = useState('');
  const [selectedAgentAppId, setSelectedAgentAppId] = useState('');
  const [instruction, setInstruction] = useState('');
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
  const createTabs = useMemo(() => CREATE_TABS.map((item) => (
    item.key === 'input' && taskType === 'sechps_tool'
      ? { ...item, label: '路径与 Harness' }
      : item
  )), [taskType]);
  const taskTypeMeta = useMemo(() => TASK_TYPES.find((item) => item.value === taskType) || TASK_TYPES[0], [taskType]);
  const selectionMode = useMemo(() => INPUT_MODES[taskType] || 'file', [taskType]);
  const selectedAgentApp = useMemo(() => agentApps.find((item) => item.id === selectedAgentAppId) || null, [agentApps, selectedAgentAppId]);
  const selectableInputs = useMemo(() => inputs, [inputs]);
  const selectedInput = useMemo(() => selectableInputs.find((item) => item.upload_id === selectedInputId) || null, [selectableInputs, selectedInputId]);
  const rootBrowse = browseCache[''] || null;
  const isDirectorySelectionValid = directorySelectionTouched && selectedRelativePath !== null;
  const inputSummary = useMemo(() => {
    if (!selectedInput) return '未选择上传记录';
    if (selectionMode === 'file') return selectedRelativePath || '请选择一个文件';
    if (selectionMode === 'file_list') return selectedRelativePaths.length ? selectedRelativePaths.join('，') : '请选择一个或多个文件';
    if (!isDirectorySelectionValid) return '请选择一个文件夹';
    return selectedRelativePath || selectedInput.target_path || '/';
  }, [isDirectorySelectionValid, selectedInput, selectedRelativePath, selectedRelativePaths, selectionMode]);
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
  const activeCreateTabIndex = useMemo(() => createTabs.findIndex((item) => item.key === activeCreateTab), [activeCreateTab, createTabs]);
  const canCreateTask = taskType === 'sechps_tool'
    ? Boolean(
      name
      && selectedAgentApp
      && selectedInputId
      && isDirectorySelectionValid,
    )
    : Boolean(name && selectedInputId && (
    (selectionMode === 'file' && selectedRelativePath) ||
    (selectionMode === 'file_list' && selectedRelativePaths.length > 0) ||
    (selectionMode === 'directory' && isDirectorySelectionValid)
  ) && (taskType !== 'binary_module_e2e' || moduleName.trim()));

  const inputSelectionHint = useMemo(() => {
    if (taskType === 'sechps_tool') return '请选择一个已注册的 Agent Harness，并选择一个目录。调度中心会在分发时自动申请 Task Key，并把所选目录直接传给下游。';
    if (taskType === 'ai4apk') return '请选择一个 APK/HAP 安装包，或 zip/rar/tar.gz/gz 等常见压缩包作为任务输入；压缩包将作为 APK/HAP 的源码包处理。';
    if (selectionMode === 'directory') return '请选择一个目录作为任务输入。';
    if (selectionMode === 'file_list') return '请选择一个或多个文件作为任务输入。';
    return '请选择一个文件作为任务输入。';
  }, [selectionMode, taskType]);
  const deleteQueueTotalPages = useMemo(
    () => Math.max(1, Math.ceil(deleteQueueTotal / deleteQueuePageSize)),
    [deleteQueuePageSize, deleteQueueTotal],
  );

  const loadData = async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const [taskResp, inputResp, appResp] = await Promise.all([
        scheduleApi.listUserTasks(projectId, selectedAgentAppFilter ? { agent_app_id: selectedAgentAppFilter } : {}) as Promise<ScheduleCenterUserTaskListResponse>,
        fileserverApi.listProjectInputUploads(projectId, { pageSize: 200 }) as Promise<{ items: ProjectInputUploadRecord[] }>,
        loadAgentApps(currentUser?.department_id, currentUser?.department_id),
      ]);
      const nextInputs = inputResp.items || [];
      setTasks(taskResp.items || []);
      setStats(taskResp.stats || {});
      setInputs(nextInputs);
      setAgentApps(appResp || []);
      setSelectedInputId((current) => current || nextInputs[0]?.upload_id || '');
      setSelectedAgentAppId((current) => current || appResp?.[0]?.id || '');
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

  useEffect(() => {
    if (!selectableInputs.length) {
      setSelectedInputId('');
      return;
    }
    if (!selectableInputs.some((item) => item.upload_id === selectedInputId)) {
      setSelectedInputId(selectableInputs[0]?.upload_id || '');
    }
  }, [selectableInputs, selectedInputId]);

  useEffect(() => {
    setSelectedRelativePath(null);
    setSelectedRelativePaths([]);
    setInputCurrentPath('');
    setExpandedPaths([]);
    setDirectorySelectionTouched(false);
    setInputBrowseError('');
    setInstruction('');
    if (taskType !== 'sechps_tool') {
      setSelectedAgentAppId('');
    }
  }, [taskType]);

  useEffect(() => {
    if (taskType !== 'sechps_tool') return;
    if (!agentApps.length) {
      setSelectedAgentAppId('');
      return;
    }
    if (!selectedAgentAppId || !agentApps.some((item) => item.id === selectedAgentAppId)) {
      setSelectedAgentAppId(agentApps[0]?.id || '');
    }
  }, [agentApps, selectedAgentAppId, taskType]);

  useEffect(() => {
    setSelectedRelativePath(null);
    setSelectedRelativePaths([]);
    setInputCurrentPath('');
    setBrowseCache({});
    setExpandedPaths([]);
    setDirectorySelectionTouched(false);
    setInputBrowseError('');
  }, [selectedInputId]);

  const loadBrowsePath = async (relativePath: string) => {
    if (!createOpen || !selectedInputId || !projectId) return;
    setInputBrowseLoading(true);
    setInputBrowseError('');
    try {
      const resp = await fileserverApi.browseProjectInputUpload(projectId, selectedInputId, relativePath);
      setBrowseCache((current) => ({ ...current, [relativePath]: resp }));
    } catch (err: any) {
      setInputBrowseError(err?.message || '加载输入目录失败');
    } finally {
      setInputBrowseLoading(false);
    }
  };

  useEffect(() => {
    if (!createOpen || !selectedInputId || !projectId) return;
    void loadBrowsePath('');
  }, [createOpen, projectId, selectedInputId, taskType]);

  const openCreateDialog = () => {
    setCreateOpen(true);
    setActiveCreateTab('basic');
  };

  const closeCreateDialog = () => {
    setCreateOpen(false);
    setActiveCreateTab('basic');
  };

  const openDeleteQueue = () => {
    setDeleteQueueOpen(true);
    void loadDeleteQueue(1, deleteQueuePageSize, deleteQueueSortBy, deleteQueueSortDirection, deleteQueueFilters);
  };

  const closeDeleteQueue = () => {
    setDeleteQueueOpen(false);
  };

  const openBrowsePath = (relativePath: string) => {
    setInputCurrentPath(relativePath);
    if (selectionMode === 'directory') {
      setSelectedRelativePath(relativePath);
      setDirectorySelectionTouched(true);
    }
    setExpandedPaths((current) => (current.includes(relativePath) || !relativePath ? current : [...current, relativePath]));
    if (!(relativePath in browseCache)) {
      void loadBrowsePath(relativePath);
    }
  };

  const toggleDirectoryExpansion = (relativePath: string) => {
    const nextExpanded = expandedPaths.includes(relativePath)
      ? expandedPaths.filter((item) => item !== relativePath)
      : [...expandedPaths, relativePath];
    setExpandedPaths(nextExpanded);
    if (!expandedPaths.includes(relativePath) && !(relativePath in browseCache)) {
      void loadBrowsePath(relativePath);
    }
  };

  const selectDirectoryPath = (relativePath: string | null) => {
    setSelectedRelativePath(relativePath);
    setDirectorySelectionTouched(true);
  };

  const toggleFileSelection = (entry: ProjectInputUploadBrowseEntry) => {
    if (entry.node_type !== 'file') return;
    if (selectionMode === 'file') {
      setSelectedRelativePath(entry.relative_path);
      return;
    }
    if (selectionMode === 'file_list') {
      setSelectedRelativePaths((current) => current.includes(entry.relative_path)
        ? current.filter((item) => item !== entry.relative_path)
        : [...current, entry.relative_path]);
    }
  };

  const createTask = async () => {
    setSaving(true);
    setError('');
    try {
      const payload: ScheduleCenterUserTaskCreatePayload = {
        task_type: taskType,
        name,
        description,
        input_upload_ids: [selectedInputId],
        input_binding: {
          upload_id: selectedInputId,
          selection_type: selectionMode,
          relative_path: selectionMode === 'file_list' ? undefined : (selectionMode === 'directory' ? (selectedRelativePath !== null ? selectedRelativePath : undefined) : (selectedRelativePath || undefined)),
          relative_paths: selectionMode === 'file_list' ? selectedRelativePaths : undefined,
        },
        policy: {},
        dispatch_policy: {},
        module_name: taskType === 'binary_module_e2e' ? moduleName : undefined,
        agent_app_id: taskType === 'sechps_tool' ? (selectedAgentApp?.id || undefined) : undefined,
        agent_app_name: taskType === 'sechps_tool' ? (selectedAgentApp?.name || undefined) : undefined,
        agent_app_engine: taskType === 'sechps_tool' ? (selectedAgentApp?.engine || undefined) : undefined,
        agent_app_agent_name: taskType === 'sechps_tool' ? (selectedAgentApp?.defaultAgentName || undefined) : undefined,
        agent_model_alias_id: taskType === 'sechps_tool' ? (selectedAgentApp?.modelAliasId || undefined) : undefined,
        agent_harness_path: taskType === 'sechps_tool' ? (selectedAgentApp?.agentHarnessPath || undefined) : undefined,
        instruction: taskType === 'sechps_tool' ? instruction : undefined,
      };
      await scheduleApi.createUserTask(projectId, payload);
      closeCreateDialog();
      setName('');
      setDescription('');
      setModuleName('');
      setSelectedAgentAppId('');
      setInstruction('');
      setSelectedRelativePath(null);
      setSelectedRelativePaths([]);
      setInputCurrentPath('');
      setDirectorySelectionTouched(false);
      await loadData();
    } catch (err: any) {
      setError(err?.message || '创建失败');
    } finally {
      setSaving(false);
    }
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
      confirmText: `删除 ${taskIds.length} 项`,
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
      message: `会删除当前项目下任务列表中可删除的全部 ${deletableTaskIds.length} 项任务，并联动删除下游子任务。此操作不可撤销。`,
      confirmText: `删除全部 ${deletableTaskIds.length} 项`,
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

  const goCreateTab = (step: -1 | 1) => {
    const nextTab = CREATE_TABS[activeCreateTabIndex + step];
    if (nextTab) setActiveCreateTab(nextTab.key);
  };

  const statsCards = [
    { label: '总任务', value: stats.total || tasks.length, icon: Shield },
    { label: '排队中', value: stats.queued || 0, icon: Rocket },
    { label: '分发中', value: stats.dispatching || 0, icon: Loader2 },
    { label: '运行中', value: stats.running || 0, icon: CheckCircle2 },
    { label: '失败', value: stats.failed || 0, icon: X },
  ];

  const renderTreeRows = (relativePath: string, depth: number): React.ReactNode[] => {
    const browse = browseCache[relativePath];
    if (!browse) return [];
    const rows: React.ReactNode[] = [];
    const entries = [...(browse.directories || []), ...(browse.files || [])];
    entries.forEach((entry) => {
      const isDirectory = entry.node_type === 'directory';
      const isExpanded = isDirectory && expandedPaths.includes(entry.relative_path);
      const isSelected = selectionMode === 'file_list'
        ? selectedRelativePaths.includes(entry.relative_path)
        : selectionMode === 'directory'
          ? selectedRelativePath === entry.relative_path
          : selectedRelativePath === entry.relative_path;
      rows.push(
        <tr key={entry.relative_path || `${relativePath}:${entry.name}`} className="border-t border-theme-border">
          <td className="px-4 py-3">
            {isDirectory ? (
              selectionMode === 'directory' ? (
                <button type="button" onClick={() => selectDirectoryPath(entry.relative_path)} className="text-theme-text-secondary">
                  {isSelected ? <SquareCheck size={16} /> : <Square size={16} />}
                </button>
              ) : null
            ) : (
              <button type="button" onClick={() => toggleFileSelection(entry)} className="text-theme-text-secondary">
                {isSelected ? <SquareCheck size={16} /> : <Square size={16} />}
              </button>
            )}
          </td>
          <td className="px-4 py-3">
            <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 16}px` }}>
              {isDirectory ? (
                <button type="button" onClick={() => toggleDirectoryExpansion(entry.relative_path)} className="rounded-md p-1 text-theme-text-faint hover:bg-theme-elevated">
                  <ChevronRight size={14} className={isExpanded ? 'rotate-90 transition-transform' : 'transition-transform'} />
                </button>
              ) : (
                <span className="inline-block h-6 w-6" />
              )}
              {isDirectory ? (
                <button type="button" onClick={() => openBrowsePath(entry.relative_path)} className="inline-flex items-center gap-2 font-semibold text-theme-text-primary">
                  {isExpanded ? <FolderOpen size={15} /> : <Folder size={15} />}
                  {entry.name}
                </button>
              ) : (
                <button type="button" onClick={() => toggleFileSelection(entry)} className="font-medium text-theme-text-primary">{entry.name}</button>
              )}
            </div>
          </td>
          <td className="px-4 py-3 font-mono text-xs text-theme-text-faint">{entry.relative_path || '.'}</td>
          <td className="px-4 py-3 text-theme-text-secondary">{isDirectory ? '文件夹' : '文件'}</td>
        </tr>,
      );
      if (isDirectory && isExpanded) {
        rows.push(...renderTreeRows(entry.relative_path, depth + 1));
      }
    });
    return rows;
  };

  return (
    <div className="min-h-full bg-slate-50 p-6 text-slate-900">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">任务中心</h1>
          <div className="text-sm text-slate-500">{projectName}</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openDeleteQueue} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold"><Shield size={15} />删除队列</button>
          <button onClick={() => void loadData()} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold"><RefreshCw size={15} />刷新</button>
          <button onClick={openCreateDialog} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"><Plus size={15} />创建任务</button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-5">
        {statsCards.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-sm text-slate-500"><span>{item.label}</span><Icon size={16} /></div>
              <div className="mt-2 text-2xl font-black">{item.value}</div>
            </div>
          );
        })}
      </div>

      <div className="mb-4 flex items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm">
        <Search size={16} className="text-slate-400" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索任务名、Harness、状态、下游任务 ID" className="w-full bg-transparent outline-none" />
        <select value={selectedAgentAppFilter} onChange={(e) => setSelectedAgentAppFilter(e.target.value)} className="rounded-lg border px-3 py-1 text-sm">
          <option value="">全部 Harness</option>
          {agentApps.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm">
        <div className="text-sm text-slate-500">当前页已选 {selectedTaskIds.length} 项</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void submitDeleteAllFiltered()}
            disabled={!deletableTaskIds.length || deleteSubmitting}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleteSubmitting ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
            删除全部任务（{deletableTaskIds.length}）
          </button>
          <button
            onClick={() => void submitDelete(selectedTaskIds)}
            disabled={!selectedTaskIds.length || deleteSubmitting}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleteSubmitting ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
            批量删除（{selectedTaskIds.length}）
          </button>
        </div>
      </div>

      {error ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">
                <button type="button" onClick={toggleSelectAllVisible} className="text-slate-500">
                  {allVisibleSelected ? <SquareCheck size={16} /> : <Square size={16} />}
                </button>
              </th>
              <th className="px-4 py-3">任务名</th>
              <th className="px-4 py-3">类型</th>
              <th className="px-4 py-3">任务状态</th>
              <th className="px-4 py-3">同步状态</th>
              <th className="px-4 py-3">运行父凭证</th>
              <th className="px-4 py-3">下游任务 ID</th>
              <th className="px-4 py-3">更新时间</th>
              <th className="px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={10}>加载中...</td></tr> : null}
            {!loading && filteredTasks.length === 0 ? <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={10}>暂无任务</td></tr> : null}
            {filteredTasks.map((task) => (
              <tr key={task.id} className="border-t">
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleTaskSelection(task.id)}
                    disabled={['queued', 'running'].includes(String(task.delete_status || 'none'))}
                    className="text-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {selectedTaskIds.includes(task.id) ? <SquareCheck size={16} /> : <Square size={16} />}
                  </button>
                </td>
                <td className="px-4 py-3 font-semibold">{task.name}</td>
                <td className="px-4 py-3">
                  <div className="font-semibold">{getTaskHarnessLabel(task)}</div>
                  {task.task_type === 'sechps_tool' ? <div className="text-xs text-slate-500">Agent Harness / {task.agent_app_engine || 'unknown'}</div> : null}
                </td>
                <td className="px-4 py-3">
                  <div className="font-semibold">{getDisplayStatus(task)}</div>
                  <div className="text-xs text-slate-500">{task.dispatch_status} / {task.business_status}</div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600" title={getSyncSummary(task)}>
                  {task.sync_status || 'none'}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{[task.parent_task_key_name, task.parent_task_key_prefix].filter(Boolean).join(' / ') || getRootTaskKeyDisplay(task)}</td>
                <td className="px-4 py-3 font-mono text-xs">{task.downstream_task_id || '—'}</td>
                <td className="px-4 py-3">{formatDateTime(task.updated_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {task.task_type !== 'sechps_tool' ? <button onClick={() => openTask(task)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold">查看任务 <ArrowRight size={12} /></button> : null}
                    {task.sync_required ? (
                      <button onClick={() => void requestSync(task)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold">
                        <RefreshCw size={12} />
                        立即同步
                      </button>
                    ) : null}
                    <button onClick={() => openTimelinePage(task)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold">
                      时间线
                    </button>
                    <button
                      onClick={() => void submitDelete([task.id])}
                      disabled={deleteSubmitting || ['queued', 'running'].includes(String(task.delete_status || 'none'))}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-[2rem] border border-theme-border bg-theme-surface shadow-2xl">
            <div className="flex items-start justify-between border-b border-theme-border px-6 py-5">
              <div>
                <div className="text-lg font-black text-theme-text-primary">删除队列</div>
                <div className="mt-1 text-sm text-theme-text-faint">{projectName}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">排队中 {deleteQueueStats.queued_total}</span>
                  <span className="rounded-full bg-sky-100 px-3 py-1 text-sky-700">删除中 {deleteQueueStats.running_total}</span>
                  <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">失败 {deleteQueueStats.failed_total}</span>
                </div>
              </div>
              <button onClick={closeDeleteQueue} className="rounded-xl p-2 text-theme-text-faint transition hover:bg-theme-elevated hover:text-theme-text-primary"><X size={18} /></button>
            </div>

            <form onSubmit={(event) => { void submitDeleteQueueFilters(event); }} className="border-b border-theme-border px-6 py-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                <label className="block text-sm font-semibold text-theme-text-secondary xl:col-span-2">
                  搜索
                  <input
                    value={deleteQueueFilters.search}
                    onChange={(e) => setDeleteQueueFilters((current) => ({ ...current, search: e.target.value }))}
                    placeholder="任务名 / 任务ID / 下游任务ID / 删除错误"
                    className="mt-1 w-full rounded-xl border border-theme-border bg-theme-elevated px-3 py-2 text-sm text-theme-text-primary"
                  />
                </label>
                <label className="block text-sm font-semibold text-theme-text-secondary">
                  删除状态
                  <select
                    value={deleteQueueFilters.delete_status}
                    onChange={(e) => setDeleteQueueFilters((current) => ({ ...current, delete_status: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-theme-border bg-theme-elevated px-3 py-2 text-sm text-theme-text-primary"
                  >
                    <option value="">全部</option>
                    <option value="queued">queued</option>
                    <option value="running">running</option>
                    <option value="failed">failed</option>
                  </select>
                </label>
                <label className="block text-sm font-semibold text-theme-text-secondary">
                  任务类型
                  <select
                    value={deleteQueueFilters.task_type}
                    onChange={(e) => setDeleteQueueFilters((current) => ({ ...current, task_type: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-theme-border bg-theme-elevated px-3 py-2 text-sm text-theme-text-primary"
                  >
                    <option value="">全部</option>
                    {TASK_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-semibold text-theme-text-secondary">
                  请求开始
                  <input type="datetime-local" value={deleteQueueFilters.from_time} onChange={(e) => setDeleteQueueFilters((current) => ({ ...current, from_time: e.target.value }))} className="mt-1 w-full rounded-xl border border-theme-border bg-theme-elevated px-3 py-2 text-sm text-theme-text-primary" />
                </label>
                <label className="block text-sm font-semibold text-theme-text-secondary">
                  请求结束
                  <input type="datetime-local" value={deleteQueueFilters.to_time} onChange={(e) => setDeleteQueueFilters((current) => ({ ...current, to_time: e.target.value }))} className="mt-1 w-full rounded-xl border border-theme-border bg-theme-elevated px-3 py-2 text-sm text-theme-text-primary" />
                </label>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-theme-text-secondary">
                  <input type="checkbox" checked={deleteQueueFilters.has_error} onChange={(e) => setDeleteQueueFilters((current) => ({ ...current, has_error: e.target.checked }))} />
                  仅看有错误项
                </label>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => void loadDeleteQueue(deleteQueuePage, deleteQueuePageSize, deleteQueueSortBy, deleteQueueSortDirection, deleteQueueFilters)} className="rounded-xl border border-theme-border px-4 py-2 text-sm font-semibold text-theme-text-secondary">刷新</button>
                  <button type="button" onClick={() => void resetDeleteQueueFilters()} className="rounded-xl border border-theme-border px-4 py-2 text-sm font-semibold text-theme-text-secondary">重置</button>
                  <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">查询</button>
                </div>
              </div>
            </form>

            {deleteQueueError ? <div className="mx-6 mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{deleteQueueError}</div> : null}

            <div className="flex-1 overflow-auto px-6 py-4">
              <div className="overflow-hidden rounded-2xl border border-theme-border bg-theme-surface">
                <table className="min-w-full text-sm">
                  <thead className="bg-theme-elevated text-left text-theme-text-faint">
                    <tr>
                      <th className="px-4 py-3"><button type="button" onClick={() => void toggleDeleteQueueSort('name')} className="font-semibold">任务名</button></th>
                      <th className="px-4 py-3">类型</th>
                      <th className="px-4 py-3">当前任务状态</th>
                      <th className="px-4 py-3">删除状态</th>
                      <th className="px-4 py-3">删除错误</th>
                      <th className="px-4 py-3">下游任务 ID</th>
                      <th className="px-4 py-3"><button type="button" onClick={() => void toggleDeleteQueueSort('delete_requested_at')} className="font-semibold">删除请求时间</button></th>
                      <th className="px-4 py-3">删除开始时间</th>
                      <th className="px-4 py-3">删除完成时间</th>
                      <th className="px-4 py-3"><button type="button" onClick={() => void toggleDeleteQueueSort('updated_at')} className="font-semibold">更新时间</button></th>
                    </tr>
                  </thead>
                  <tbody>
                    {deleteQueueLoading ? <tr><td className="px-4 py-10 text-center text-theme-text-faint" colSpan={10}><span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" />加载中...</span></td></tr> : null}
                    {!deleteQueueLoading && deleteQueueItems.length === 0 ? <tr><td className="px-4 py-10 text-center text-theme-text-faint" colSpan={10}>当前项目暂无删除队列任务</td></tr> : null}
                    {!deleteQueueLoading && deleteQueueItems.map((item) => (
                      <tr
                        key={item.id}
                        className={`border-t border-theme-border ${
                          item.delete_status === 'failed'
                            ? 'bg-rose-50/70'
                            : item.delete_status === 'running'
                              ? 'bg-sky-50/60'
                              : 'bg-amber-50/40'
                        }`}
                      >
                        <td className="px-4 py-3 font-semibold">{item.name}</td>
                        <td className="px-4 py-3">{getDeleteQueueTypeLabel(String(item.task_type || ''))}</td>
                        <td className="px-4 py-3">{item.display_status}</td>
                        <td className="px-4 py-3">
                          <span className={item.delete_status === 'failed' ? 'text-rose-600' : item.delete_status === 'running' ? 'text-sky-600' : 'text-amber-600'}>
                            {item.delete_status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-theme-text-secondary" title={item.delete_error || item.last_error || ''}>{truncateText(item.delete_error || item.last_error, 120)}</td>
                        <td className="px-4 py-3 font-mono text-xs">{item.downstream_task_id || '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(item.delete_requested_at)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(item.delete_started_at)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(item.delete_finished_at)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(item.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-theme-border px-6 py-4">
              <div className="text-sm text-theme-text-faint">共 {deleteQueueTotal} 条，当前第 {deleteQueuePage} / {deleteQueueTotalPages} 页</div>
              <div className="flex items-center gap-2">
                <select
                  value={deleteQueuePageSize}
                  onChange={(e) => {
                    const nextPageSize = Number(e.target.value) || 20;
                    setDeleteQueuePageSize(nextPageSize);
                    setDeleteQueuePage(1);
                    void loadDeleteQueue(1, nextPageSize, deleteQueueSortBy, deleteQueueSortDirection, deleteQueueFilters);
                  }}
                  className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text-primary"
                >
                  {[20, 50, 100].map((size) => <option key={size} value={size}>{size} / 页</option>)}
                </select>
                <button type="button" onClick={() => { const next = Math.max(1, deleteQueuePage - 1); setDeleteQueuePage(next); void loadDeleteQueue(next, deleteQueuePageSize, deleteQueueSortBy, deleteQueueSortDirection, deleteQueueFilters); }} disabled={deleteQueuePage <= 1 || deleteQueueLoading} className="rounded-xl border border-theme-border px-4 py-2 text-sm font-semibold text-theme-text-secondary disabled:opacity-40">上一页</button>
                <button type="button" onClick={() => { const next = Math.min(deleteQueueTotalPages, deleteQueuePage + 1); setDeleteQueuePage(next); void loadDeleteQueue(next, deleteQueuePageSize, deleteQueueSortBy, deleteQueueSortDirection, deleteQueueFilters); }} disabled={deleteQueuePage >= deleteQueueTotalPages || deleteQueueLoading} className="rounded-xl border border-theme-border px-4 py-2 text-sm font-semibold text-theme-text-secondary disabled:opacity-40">下一页</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] border border-theme-border bg-theme-surface shadow-2xl">
            <div className="flex items-start justify-between border-b border-theme-border px-6 py-5">
              <div>
                <div className="text-lg font-black text-theme-text-primary">创建任务</div>
                <div className="mt-1 text-sm text-theme-text-faint">使用多阶段表单选择现有任务输入，不支持直接上传文件</div>
              </div>
              <button onClick={closeCreateDialog} className="rounded-xl p-2 text-theme-text-faint transition hover:bg-theme-elevated hover:text-theme-text-primary"><X size={18} /></button>
            </div>

            <div className="border-b border-theme-border px-6 py-4">
              <div className="flex flex-wrap gap-2">
                {createTabs.map((tab, index) => {
                  const active = tab.key === activeCreateTab;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveCreateTab(tab.key)}
                      className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-bold transition ${
                        active ? 'bg-slate-900 text-white' : 'bg-theme-elevated text-theme-text-secondary hover:text-theme-text-primary'
                      }`}
                    >
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${active ? 'bg-white/15' : 'bg-theme-surface'}`}>{index + 1}</span>
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
              {activeCreateTab === 'basic' ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block text-sm font-semibold text-theme-text-secondary">任务类型
                    <select value={taskType} onChange={(e) => setTaskType(e.target.value as any)} className="mt-1 w-full rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-theme-text-primary">
                      {TASK_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </label>
                  <div className="rounded-2xl border border-theme-border bg-theme-elevated px-4 py-3">
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-theme-text-faint">项目</div>
                    <div className="mt-2 text-sm font-semibold text-theme-text-primary">{projectName}</div>
                    <div className="mt-1 text-xs text-theme-text-faint">
                      {taskType === 'sechps_tool' ? 'SecHPS 作为执行引擎运行具体 Agent Harness，不提供单独业务详情页。' : `下游详情会跳转到 ${taskTypeMeta.label} 的原任务页面。`}
                    </div>
                  </div>
                  <label className="block text-sm font-semibold text-theme-text-secondary md:col-span-2">任务名称
                    <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-theme-text-primary" />
                  </label>
                  <label className="block text-sm font-semibold text-theme-text-secondary md:col-span-2">描述
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 w-full rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-theme-text-primary" rows={4} />
                  </label>
                  {taskType === 'binary_module_e2e' ? (
                    <label className="block text-sm font-semibold text-theme-text-secondary md:col-span-2">模块名
                      <input value={moduleName} onChange={(e) => setModuleName(e.target.value)} className="mt-1 w-full rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-theme-text-primary" />
                    </label>
                  ) : null}
                  {taskType === 'sechps_tool' ? (
                    <label className="block text-sm font-semibold text-theme-text-secondary md:col-span-2">执行指令（可选）
                      <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-theme-text-primary" />
                    </label>
                  ) : null}
                </div>
              ) : null}

              {activeCreateTab === 'input' ? (
                <div className="space-y-4">
                  {taskType === 'sechps_tool' ? (
                    <>
                      <div className="rounded-2xl border border-theme-border bg-theme-elevated px-4 py-4 text-sm text-theme-text-secondary">
                        先选择任务输入中的目录，再选择具体 Agent Harness。分发时调度中心会自动申请 Task Key，并把所选目录直接传给 SecHPS。
                      </div>
                      <label className="block text-sm font-semibold text-theme-text-secondary">Agent Harness
                        <select value={selectedAgentAppId} onChange={(e) => setSelectedAgentAppId(e.target.value)} className="mt-1 w-full rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-theme-text-primary">
                          <option value="">请选择具体 Harness</option>
                          {agentApps.map((item) => <option key={item.id} value={item.id}>{`${item.name} / ${item.engine}`}</option>)}
                        </select>
                      </label>
                      {selectedAgentApp ? (
                        <div className="rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-xs text-theme-text-secondary">
                          <div>Harness: <span className="font-semibold text-theme-text-primary">{selectedAgentApp.name}</span></div>
                          <div className="mt-1">Engine: <span className="font-semibold text-theme-text-primary">{selectedAgentApp.engine}</span></div>
                          <div className="mt-1 break-all">Harness Path: <span className="font-semibold text-theme-text-primary">{selectedAgentApp.agentHarnessPath || '—'}</span></div>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  <label className="block text-sm font-semibold text-theme-text-secondary">任务输入记录
                    <select value={selectedInputId} onChange={(e) => setSelectedInputId(e.target.value)} className="mt-1 w-full rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-theme-text-primary">
                      {selectableInputs.map((item) => <option key={item.upload_id} value={item.upload_id}>{`${getUploadRecordDisplayName(item)} · ${item.status}`}</option>)}
                    </select>
                  </label>
                  <div className="rounded-2xl border border-theme-border bg-theme-elevated px-4 py-3 text-sm text-theme-text-secondary">
                    当前输入模式：
                    <span className="ml-2 font-semibold text-theme-text-primary">
                      {selectionMode === 'file' ? '选择单个文件' : selectionMode === 'file_list' ? '选择多个文件' : '选择文件夹'}
                    </span>
                    <div className="mt-2 text-xs text-theme-text-faint">{inputSelectionHint}</div>
                  </div>
                  {selectableInputs.length === 0 ? (
                    <div className="rounded-2xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                      没有可用输入，请先到“任务输入”上传记录。
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-theme-text-faint">
                          {((browseCache[inputCurrentPath]?.breadcrumbs) || (rootBrowse?.breadcrumbs) || []).map((crumb, index, items) => (
                            <button
                              key={`${crumb.path}-${index}`}
                              type="button"
                              onClick={() => openBrowsePath(crumb.path)}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-theme-elevated"
                            >
                              <Folder size={12} />
                              <span>{crumb.name}</span>
                              {index < items.length - 1 ? <ChevronRight size={12} /> : null}
                            </button>
                          ))}
                        </div>
                      </div>
                      {inputBrowseError ? (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{inputBrowseError}</div>
                      ) : null}
                      <div className="max-h-[min(24rem,45vh)] overflow-auto rounded-2xl border border-theme-border bg-theme-surface">
                        <table className="min-w-full text-sm">
                          <thead className="bg-theme-elevated text-theme-text-faint">
                            <tr>
                              <th className="px-4 py-3 text-left">选择</th>
                              <th className="px-4 py-3 text-left">名称</th>
                              <th className="px-4 py-3 text-left">相对路径</th>
                              <th className="px-4 py-3 text-left">类型</th>
                            </tr>
                          </thead>
                          <tbody>
                            {inputBrowseLoading ? (
                              <tr><td className="px-4 py-6 text-center text-theme-text-faint" colSpan={4}>加载目录中...</td></tr>
                            ) : null}
                            {!inputBrowseLoading && !rootBrowse ? (
                              <tr><td className="px-4 py-6 text-center text-theme-text-faint" colSpan={4}>暂无可浏览目录</td></tr>
                            ) : null}
                            {rootBrowse ? (
                              <tr className="border-t border-theme-border bg-theme-elevated/40">
                                <td className="px-4 py-3">
                                  {selectionMode === 'directory' ? (
                                    <button type="button" onClick={() => selectDirectoryPath('')} className="text-theme-text-secondary">
                                      {selectedRelativePath === '' && directorySelectionTouched ? <SquareCheck size={16} /> : <Square size={16} />}
                                    </button>
                                  ) : null}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2 font-semibold text-theme-text-primary">
                                    <FolderOpen size={15} />
                                    上传根目录
                                  </div>
                                </td>
                                <td className="px-4 py-3 font-mono text-xs text-theme-text-faint">.</td>
                                <td className="px-4 py-3 text-theme-text-secondary">文件夹</td>
                              </tr>
                            ) : null}
                            {rootBrowse ? renderTreeRows('', 0) : null}
                          </tbody>
                        </table>
                      </div>
                      <div className="rounded-2xl border border-theme-border bg-theme-elevated px-4 py-3">
                        <div className="text-xs font-bold uppercase tracking-[0.18em] text-theme-text-faint">当前选择</div>
                        <div className="mt-2 text-sm font-semibold text-theme-text-primary">{inputSummary}</div>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {activeCreateTab === 'options' ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-theme-border bg-theme-elevated px-4 py-3">
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-theme-text-faint">创建后状态</div>
                    <div className="mt-2 text-sm font-semibold text-theme-text-primary">created / ready_for_dispatch / 自动进入分发队列</div>
                    <div className="mt-1 text-xs text-theme-text-faint">
                      {taskType === 'sechps_tool' ? '创建阶段会登记具体 Agent Harness 与目录绑定。Task Key 由调度中心在分发阶段自动申请。' : '创建阶段只登记业务任务，不要求手动填写 Task Key、Secret 或算力池。'}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-theme-border bg-theme-elevated px-4 py-3">
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-theme-text-faint">自动分发</div>
                    <div className="mt-2 text-sm font-semibold text-theme-text-primary">调度中心后台排队并执行分发</div>
                    <div className="mt-1 text-xs text-theme-text-faint">
                      {taskType === 'ai4apk'
                        ? '创建成功后任务会自动进入分发队列；调度中心会把所选文件路径（APK/HAP 安装包或其源码压缩包）直接传给 AI4APP 进行扫描。'
                        : taskType === 'sechps_tool'
                          ? '创建成功后任务会自动进入分发队列；调度中心会动态申请 Task Key，并把所选目录与该 Task Key 一起传给 SecHPS。'
                          : '创建成功后任务会自动进入分发队列；调度中心会在分发期创建 root task key，并直接传给下游。'}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 md:col-span-2">
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-theme-text-faint">创建摘要</div>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <div>
                        <div className="text-xs text-theme-text-faint">任务类型</div>
                        <div className="mt-1 text-sm font-semibold text-theme-text-primary">{taskTypeMeta.label}</div>
                      </div>
                      <div>
                        <div className="text-xs text-theme-text-faint">输入记录</div>
                        <div className="mt-1 text-sm font-semibold text-theme-text-primary">{taskType === 'sechps_tool' ? (selectedAgentApp?.name || '未选择 Harness') : (selectedInputId || '未选择')}</div>
                      </div>
                      <div>
                        <div className="text-xs text-theme-text-faint">输入路径</div>
                        <div className="mt-1 text-sm font-semibold text-theme-text-primary break-all">{inputSummary}</div>
                      </div>
                      {taskType === 'binary_module_e2e' ? (
                        <div>
                          <div className="text-xs text-theme-text-faint">模块名</div>
                          <div className="mt-1 text-sm font-semibold text-theme-text-primary">{moduleName || '未填写'}</div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-between border-t border-theme-border px-6 py-4">
              <div className="text-xs text-theme-text-faint">第 {activeCreateTabIndex + 1} 步 / 共 {createTabs.length} 步</div>
              <div className="flex items-center gap-2">
                <button onClick={closeCreateDialog} className="rounded-xl border border-theme-border px-4 py-2 text-sm font-semibold text-theme-text-secondary">取消</button>
                <button onClick={() => goCreateTab(-1)} disabled={activeCreateTabIndex === 0} className="rounded-xl border border-theme-border px-4 py-2 text-sm font-semibold text-theme-text-secondary disabled:opacity-40">上一步</button>
                {activeCreateTabIndex < createTabs.length - 1 ? (
                  <button onClick={() => goCreateTab(1)} className="rounded-xl bg-theme-elevated px-4 py-2 text-sm font-semibold text-theme-text-primary">下一步</button>
                ) : (
                  <button onClick={() => void createTask()} disabled={saving || !canCreateTask} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? '创建中...' : '创建任务'}</button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
