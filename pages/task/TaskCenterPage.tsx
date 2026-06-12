import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, ChevronRight, Folder, FolderOpen, Loader2, Plus, RefreshCw, Rocket, Search, Shield, Square, SquareCheck, X } from 'lucide-react';
import { api } from '../../clients/api';
import { useUiFeedback } from '../../components/UiFeedback';
import { getUploadRecordDisplayName } from '../assets/baseResourcePageModel';
import { saveTaskCenterReturnContext } from '../../utils/executionReturnContext';
import {
  ProjectInputUploadBrowseEntry,
  ProjectInputUploadBrowseResponse,
  ProjectInputUploadRecord,
  ScheduleUserTaskEvent,
  ScheduleUserTaskEventListResponse,
  ScheduleCenterUserTask,
  ScheduleCenterUserTaskCreatePayload,
  ScheduleCenterUserTaskType,
  ScheduleCenterUserTaskListResponse,
  SecurityProject,
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
  { value: 'ai4apk', label: 'AI4APK 应用安全扫描' },
];

const CREATE_TABS = [
  { key: 'basic', label: '基础信息' },
  { key: 'input', label: '输入选择' },
] as const;

const INPUT_MODES: Record<string, 'file' | 'file_list' | 'directory'> = {
  binary_firmware_e2e: 'file',
  binary_module_e2e: 'file_list',
  source_scan_e2e: 'directory',
  ai4red: 'directory',
  ai4apk: 'directory',
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

export const TaskCenterPage: React.FC<Props> = ({ projectId, projects }) => {
  const scheduleApi = api.domains.platform.scheduleCenter;
  const fileserverApi = api.domains.assets.fileserver;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tasks, setTasks] = useState<ScheduleCenterUserTask[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [inputs, setInputs] = useState<ProjectInputUploadRecord[]>([]);
  const [query, setQuery] = useState('');
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
  const [error, setError] = useState('');
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [timelineTask, setTimelineTask] = useState<ScheduleCenterUserTask | null>(null);
  const [timelineItems, setTimelineItems] = useState<ScheduleUserTaskEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineOnlyFailed, setTimelineOnlyFailed] = useState(false);
  const [expandedTimelineEventId, setExpandedTimelineEventId] = useState('');
  const { notify, confirm, feedbackNodes } = useUiFeedback();

  const projectName = useMemo(() => projects.find((item) => item.id === projectId)?.name || projectId, [projectId, projects]);
  const taskTypeMeta = useMemo(() => TASK_TYPES.find((item) => item.value === taskType) || TASK_TYPES[0], [taskType]);
  const selectionMode = useMemo(() => INPUT_MODES[taskType] || 'file', [taskType]);
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
    if (!term) return tasks;
    return tasks.filter((item) => [item.name, item.task_type, getDisplayStatus(item), item.sync_status, item.downstream_task_id || ''].some((value) => String(value || '').toLowerCase().includes(term)));
  }, [query, tasks]);
  const deletableTaskIds = useMemo(
    () => filteredTasks.filter((task) => !['queued', 'running'].includes(String(task.delete_status || 'none'))).map((task) => task.id),
    [filteredTasks],
  );
  const allVisibleSelected = useMemo(
    () => deletableTaskIds.length > 0 && deletableTaskIds.every((taskId) => selectedTaskIds.includes(taskId)),
    [deletableTaskIds, selectedTaskIds],
  );
  const activeCreateTabIndex = useMemo(() => CREATE_TABS.findIndex((item) => item.key === activeCreateTab), [activeCreateTab]);
  const canCreateTask = Boolean(name && selectedInputId && (
    (selectionMode === 'file' && selectedRelativePath) ||
    (selectionMode === 'file_list' && selectedRelativePaths.length > 0) ||
    (selectionMode === 'directory' && isDirectorySelectionValid)
  ) && (taskType !== 'binary_module_e2e' || moduleName.trim()));

  const inputSelectionHint = useMemo(() => {
    if (taskType === 'ai4apk') return '选择 APK/HAP 所在目录，AI4APK 服务会在目录内自行发现待扫描包。';
    if (selectionMode === 'directory') return '请选择一个目录作为任务输入。';
    if (selectionMode === 'file_list') return '请选择一个或多个文件作为任务输入。';
    return '请选择一个文件作为任务输入。';
  }, [selectionMode, taskType]);

  const loadData = async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const [taskResp, inputResp] = await Promise.all([
        scheduleApi.listUserTasks(projectId) as Promise<ScheduleCenterUserTaskListResponse>,
        fileserverApi.listProjectInputUploads(projectId, { pageSize: 200 }) as Promise<{ items: ProjectInputUploadRecord[] }>,
      ]);
      const nextInputs = inputResp.items || [];
      setTasks(taskResp.items || []);
      setStats(taskResp.stats || {});
      setInputs(nextInputs);
      setSelectedInputId((current) => current || nextInputs[0]?.upload_id || '');
    } catch (err: any) {
      setError(err?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, [projectId]);
  useEffect(() => { setSelectedTaskIds([]); }, [projectId, query]);

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
  }, [taskType]);

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
  }, [createOpen, projectId, selectedInputId]);

  const openCreateDialog = () => {
    setCreateOpen(true);
    setActiveCreateTab('basic');
  };

  const closeCreateDialog = () => {
    setCreateOpen(false);
    setActiveCreateTab('basic');
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
          relative_path: selectionMode === 'file_list' ? undefined : (selectionMode === 'directory' ? (selectedRelativePath ?? '') : (selectedRelativePath || undefined)),
          relative_paths: selectionMode === 'file_list' ? selectedRelativePaths : undefined,
        },
        policy: {},
        dispatch_policy: {},
        module_name: taskType === 'binary_module_e2e' ? moduleName : undefined,
      };
      await scheduleApi.createUserTask(projectId, payload);
      closeCreateDialog();
      setName('');
      setDescription('');
      setModuleName('');
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

  const deleteStatusText = (task: ScheduleCenterUserTask) => {
    const status = String(task.delete_status || 'none');
    if (status === 'queued') return '删除排队中';
    if (status === 'running') return '删除中';
    if (status === 'failed') return task.delete_error || task.last_error || '删除失败';
    return '';
  };

  const loadTimeline = async (task: ScheduleCenterUserTask, onlyFailed = false) => {
    setTimelineLoading(true);
    try {
      const payload = await scheduleApi.listUserTaskEvents(task.project_id, task.id, {
        page: 1,
        page_size: 100,
        only_failed: onlyFailed || undefined,
      }) as ScheduleUserTaskEventListResponse;
      setTimelineTask(task);
      setTimelineItems(payload.items || []);
      setTimelineOnlyFailed(onlyFailed);
      setExpandedTimelineEventId('');
    } catch (err: any) {
      notify(err?.message || '加载任务时间线失败', 'error');
    } finally {
      setTimelineLoading(false);
    }
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
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索任务名、状态、下游任务 ID" className="w-full bg-transparent outline-none" />
      </div>

      <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm">
        <div className="text-sm text-slate-500">当前页已选 {selectedTaskIds.length} 项</div>
        <button
          onClick={() => void submitDelete(selectedTaskIds)}
          disabled={!selectedTaskIds.length || deleteSubmitting}
          className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {deleteSubmitting ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
          批量删除（{selectedTaskIds.length}）
        </button>
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
              <th className="px-4 py-3">删除状态</th>
              <th className="px-4 py-3">输入记录数</th>
              <th className="px-4 py-3">运行父凭证</th>
              <th className="px-4 py-3">下游任务 ID</th>
              <th className="px-4 py-3">更新时间</th>
              <th className="px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={12}>加载中...</td></tr> : null}
            {!loading && filteredTasks.length === 0 ? <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={12}>暂无任务</td></tr> : null}
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
                <td className="px-4 py-3">{TASK_TYPES.find((item) => item.value === task.task_type)?.label || task.task_type}</td>
                <td className="px-4 py-3">
                  <div className="font-semibold">{getDisplayStatus(task)}</div>
                  <div className="text-xs text-slate-500">{task.dispatch_status} / {task.business_status}</div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">{getSyncSummary(task)}</td>
                <td className="px-4 py-3 text-xs">
                  {task.delete_status && task.delete_status !== 'none' ? (
                    <span className={task.delete_status === 'failed' ? 'text-rose-600' : 'text-amber-600'}>
                      {deleteStatusText(task)}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3">{task.input_upload_count}</td>
                <td className="px-4 py-3 font-mono text-xs">{getRootTaskKeyDisplay(task)}</td>
                <td className="px-4 py-3 font-mono text-xs">{task.downstream_task_id || '—'}</td>
                <td className="px-4 py-3">{formatDateTime(task.updated_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {task.task_type !== 'ai4apk' ? (
                      <button onClick={() => openTask(task)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold">查看任务 <ArrowRight size={12} /></button>
                    ) : null}
                    {task.sync_required ? (
                      <button onClick={() => void requestSync(task)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold">
                        <RefreshCw size={12} />
                        立即同步
                      </button>
                    ) : null}
                    <button onClick={() => void loadTimeline(task)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold">
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

      {timelineTask ? (
        <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between border-b px-6 py-5">
            <div>
              <div className="text-lg font-black">任务时间线</div>
              <div className="mt-1 text-xs text-slate-500">{timelineTask.name} / {timelineTask.id}</div>
              <div className="mt-1 text-xs text-slate-500">状态：{getDisplayStatus(timelineTask)} / 下游：{timelineTask.downstream_task_id || '—'}</div>
            </div>
            <button
              onClick={() => {
                setTimelineTask(null);
                setTimelineItems([]);
                setExpandedTimelineEventId('');
              }}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex items-center justify-between border-b px-6 py-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={timelineOnlyFailed}
                onChange={(e) => { void loadTimeline(timelineTask, e.target.checked); }}
              />
              仅看失败事件
            </label>
            <button onClick={() => void loadTimeline(timelineTask, timelineOnlyFailed)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold">
              <RefreshCw size={14} className={timelineLoading ? 'animate-spin' : ''} />
              刷新
            </button>
          </div>
          <div className="flex-1 overflow-auto px-6 py-4">
            {timelineLoading ? <div className="py-10 text-center text-sm text-slate-500">加载中...</div> : null}
            {!timelineLoading && timelineItems.length === 0 ? <div className="py-10 text-center text-sm text-slate-500">暂无事件</div> : null}
            <div className="space-y-3">
              {timelineItems.map((event) => {
                const expanded = expandedTimelineEventId === event.id;
                const hasPayload = !!event.payload && Object.keys(event.payload).length > 0;
                return (
                  <div key={event.id} className={`rounded-2xl border px-4 py-3 ${event.result_status === 'failed' ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-black text-slate-900">{event.event_type}</div>
                        <div className="mt-1 text-xs text-slate-500">{formatDateTime(event.created_at)} · {event.result_status} · {event.event_source}{event.actor ? ` · ${event.actor}` : ''}</div>
                        <div className="mt-2 text-sm text-slate-700">{event.message}</div>
                      </div>
                      <button onClick={() => setExpandedTimelineEventId(expanded ? '' : event.id)} disabled={!hasPayload} className="text-xs font-bold text-slate-500 disabled:opacity-30">
                        {expanded ? '收起' : '查看'}
                      </button>
                    </div>
                    {expanded && hasPayload ? (
                      <pre className="mt-3 overflow-auto rounded-xl bg-white p-3 text-xs text-slate-700">{JSON.stringify(event.payload, null, 2)}</pre>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="flex w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] border border-theme-border bg-theme-surface shadow-2xl">
            <div className="flex items-start justify-between border-b border-theme-border px-6 py-5">
              <div>
                <div className="text-lg font-black text-theme-text-primary">创建任务</div>
                <div className="mt-1 text-sm text-theme-text-faint">使用多阶段表单选择现有任务输入，不支持直接上传文件</div>
              </div>
              <button onClick={closeCreateDialog} className="rounded-xl p-2 text-theme-text-faint transition hover:bg-theme-elevated hover:text-theme-text-primary"><X size={18} /></button>
            </div>

            <div className="border-b border-theme-border px-6 py-4">
              <div className="flex flex-wrap gap-2">
                {CREATE_TABS.map((tab, index) => {
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

            <div className="px-6 py-6">
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
                    <div className="mt-1 text-xs text-theme-text-faint">下游详情会跳转到 {taskTypeMeta.label} 的原任务页面。</div>
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
                </div>
              ) : null}

              {activeCreateTab === 'input' ? (
                <div className="space-y-4">
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
                      <div className="max-h-80 overflow-auto rounded-2xl border border-theme-border bg-theme-surface">
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

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-theme-border bg-theme-elevated px-4 py-3">
                  <div className="text-xs font-bold uppercase tracking-[0.18em] text-theme-text-faint">创建后状态</div>
                  <div className="mt-2 text-sm font-semibold text-theme-text-primary">created / ready_for_dispatch / 自动进入分发队列</div>
                  <div className="mt-1 text-xs text-theme-text-faint">创建阶段只登记业务任务，不要求手动填写 Task Key、Secret 或算力池。</div>
                </div>
                <div className="rounded-2xl border border-theme-border bg-theme-elevated px-4 py-3">
                  <div className="text-xs font-bold uppercase tracking-[0.18em] text-theme-text-faint">自动分发</div>
                  <div className="mt-2 text-sm font-semibold text-theme-text-primary">调度中心后台排队并执行分发</div>
                  <div className="mt-1 text-xs text-theme-text-faint">
                    {taskType === 'ai4apk'
                      ? '创建成功后任务会自动进入分发队列；调度中心会把所选目录路径原样传给 AI4APK，由下游在目录内自行发现 APK/HAP。'
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
                      <div className="mt-1 text-sm font-semibold text-theme-text-primary">{selectedInputId || '未选择'}</div>
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
            </div>

            <div className="flex items-center justify-between border-t border-theme-border px-6 py-4">
              <div className="text-xs text-theme-text-faint">第 {activeCreateTabIndex + 1} 步 / 共 {CREATE_TABS.length} 步</div>
              <div className="flex items-center gap-2">
                <button onClick={closeCreateDialog} className="rounded-xl border border-theme-border px-4 py-2 text-sm font-semibold text-theme-text-secondary">取消</button>
                <button onClick={() => goCreateTab(-1)} disabled={activeCreateTabIndex === 0} className="rounded-xl border border-theme-border px-4 py-2 text-sm font-semibold text-theme-text-secondary disabled:opacity-40">上一步</button>
                {activeCreateTabIndex < CREATE_TABS.length - 1 ? (
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
