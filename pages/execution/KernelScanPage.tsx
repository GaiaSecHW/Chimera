import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, Copy, FileText, Folder, FolderOpen, Loader2, Plus, RefreshCw, Search, Shield, Smartphone, Trash2, X, XCircle } from 'lucide-react';

import { api } from '../../clients/api';
import { KernelScanAdbDevice, KernelScanCategory, KernelScanBrowseResponse, KernelScanEntryResult, KernelScanFileEntry, KernelScanReadyState, KernelScanTaskDetail, KernelScanTaskSummary } from '../../clients/kernelScan';
import { useUiFeedback } from '../../components/UiFeedback';

const ACTIVE_TASK_STATUSES = new Set(['queued', 'running', 'cancel_requested']);

const TASK_STATUS_LABELS: Record<string, string> = {
  queued: '排队中',
  running: '执行中',
  cancel_requested: '取消中',
  cancelled: '已取消',
  succeeded: '已完成',
  failed: '失败',
};

const CATEGORY_LABELS: Record<KernelScanCategory, string> = {
  attack_entry: '扫描攻击入口',
  vuln_scan: '漏洞扫描',
  vuln_verify: '漏洞验证',
};

const statusTone = (status?: string | null) => {
  switch (String(status || '').toLowerCase()) {
    case 'succeeded':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'failed':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'cancelled':
      return 'border-slate-200 bg-slate-100 text-slate-500';
    case 'cancel_requested':
    case 'running':
      return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'queued':
      return 'border-violet-200 bg-violet-50 text-violet-700';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600';
  }
};

const formatTaskStatus = (status?: string | null) => TASK_STATUS_LABELS[String(status || '').toLowerCase()] || (status || '-');

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const formatBytes = (value?: number | null) => {
  if (value == null) return '-';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
};

const toWorkspaceAbsolutePath = (path?: string | null) => {
  const trimmed = String(path || '').trim();
  if (!trimmed || trimmed === '/') return '/workspace';
  if (trimmed === '/workspace' || trimmed.startsWith('/workspace/')) return trimmed;
  const relative = trimmed.replace(/^\/+/, '').replace(/^workspace\/?/, '');
  return relative ? `/workspace/${relative}` : '/workspace';
};

const stripWorkspacePrefix = (path?: string | null) => {
  const trimmed = String(path || '').trim();
  return trimmed
    .replace(/^\/workspace\/?/, '')
    .replace(/^workspace\/?/, '')
    .replace(/^\/+/, '');
};

const formatWorkspaceDisplayPath = (path?: string | null) => {
  const relative = stripWorkspacePrefix(path);
  return relative ? `/workspace/${relative}` : '/workspace';
};

const isPathWithinWorkspaceRoot = (path?: string | null, root?: string | null) => {
  const normalizedPath = toWorkspaceAbsolutePath(path).replace(/\/+$/, '');
  const normalizedRoot = toWorkspaceAbsolutePath(root).replace(/\/+$/, '');
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
};

const getTaskWorkspaceRoot = (task: KernelScanTaskDetail, category: KernelScanCategory) => {
  const stage = category === 'vuln_scan' ? 'audit' : category === 'vuln_verify' ? 'poc' : 'entry';
  return toWorkspaceAbsolutePath(`${stage}/${task.task_id}`);
};

type PathPickerTarget = 'target_dir' | 'entrylist_file' | 'report_dir';

const panelClassName = 'rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm';

export const KernelScanPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const executionApi = api.domains.execution.kernelScan;
  const { notify, confirm, feedbackNodes } = useUiFeedback();

  const [bootstrapping, setBootstrapping] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [readyState, setReadyState] = useState<KernelScanReadyState | null>(null);

  const [activeTab, setActiveTab] = useState<KernelScanCategory>('attack_entry');
  const [tasks, setTasks] = useState<KernelScanTaskSummary[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskKeyword, setTaskKeyword] = useState('');

  const [showTaskDetail, setShowTaskDetail] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [selectedTask, setSelectedTask] = useState<KernelScanTaskDetail | null>(null);
  const [taskDetailLoading, setTaskDetailLoading] = useState(false);
  const [actingTask, setActingTask] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  const [entryResult, setEntryResult] = useState<KernelScanEntryResult | null>(null);
  const [entryResultLoading, setEntryResultLoading] = useState(false);
  const entryResultTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const tasksRefreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const tasksRefreshInFlight = useRef(false);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createTargetPath, setCreateTargetPath] = useState('');
  const [createDevlistPath, setCreateDevlistPath] = useState('');
  const [createReportDir, setCreateReportDir] = useState('');
  const [createParallelCount, setCreateParallelCount] = useState('1');
  const [showPathPicker, setShowPathPicker] = useState(false);
  const [pathPickerTarget, setPathPickerTarget] = useState<PathPickerTarget>('target_dir');
  const [browsePath, setBrowsePath] = useState('');
  const [browseData, setBrowseData] = useState<KernelScanBrowseResponse | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);

  const [adbDevices, setAdbDevices] = useState<KernelScanAdbDevice[]>([]);
  const [adbDevicesRaw, setAdbDevicesRaw] = useState('');
  const [adbDevicesMessage, setAdbDevicesMessage] = useState('');
  const [adbDevicesError, setAdbDevicesError] = useState<string | null>(null);
  const [adbDevicesLoading, setAdbDevicesLoading] = useState(false);
  const [adbDevicesQueried, setAdbDevicesQueried] = useState(false);
  const [adbConnected, setAdbConnected] = useState(false);

  const [taskWorkspaceRoot, setTaskWorkspaceRoot] = useState('');
  const [taskWorkspacePath, setTaskWorkspacePath] = useState('');
  const [taskWorkspaceData, setTaskWorkspaceData] = useState<KernelScanBrowseResponse | null>(null);
  const [taskWorkspaceLoading, setTaskWorkspaceLoading] = useState(false);
  const [taskWorkspaceError, setTaskWorkspaceError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<KernelScanFileEntry | null>(null);
  const [previewContent, setPreviewContent] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const filteredTasks = tasks.filter((item) => {
    const keyword = taskKeyword.trim().toLowerCase();
    if (!keyword) return true;
    return `${item.title} ${item.kernel_dir || ''} ${item.task_id}`.toLowerCase().includes(keyword);
  });

  const activeTaskCount = tasks.filter((item) => ACTIVE_TASK_STATUSES.has(String(item.status || '').toLowerCase())).length;
  const succeededTaskCount = tasks.filter((item) => String(item.status || '').toLowerCase() === 'succeeded').length;
  const failedTaskCount = tasks.filter((item) => String(item.status || '').toLowerCase() === 'failed').length;
  const isVulnScanDetail = activeTab === 'vuln_scan' && selectedTask?.pipeline_mode === 'audit_only';
  const isVulnVerifyDetail = activeTab === 'vuln_verify' && selectedTask?.pipeline_mode === 'poc_only';
  const showTaskWorkspaceFiles = isVulnScanDetail || isVulnVerifyDetail;
  const pathPickerMode = pathPickerTarget === 'entrylist_file' ? 'file' : 'dir';
  const pathPickerTitle = pathPickerTarget === 'entrylist_file'
    ? '选择 Devlist 文件'
    : pathPickerTarget === 'report_dir'
      ? '选择漏洞报告目录'
      : '选择源码目录';
  const taskWorkspaceItems = taskWorkspaceData?.items || [];
  const taskWorkspaceDisplayPath = formatWorkspaceDisplayPath(taskWorkspacePath || taskWorkspaceData?.path || taskWorkspaceRoot);
  const canGoTaskWorkspaceUp = Boolean(
    taskWorkspaceData?.parent &&
    taskWorkspaceRoot &&
    isPathWithinWorkspaceRoot(taskWorkspaceData.parent, taskWorkspaceRoot) &&
    toWorkspaceAbsolutePath(taskWorkspaceData.path) !== toWorkspaceAbsolutePath(taskWorkspaceRoot),
  );

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      setBootstrapping(true);
      setOverviewError(null);
      try {
        const ready = await executionApi.getReady();
        if (cancelled) return;
        setReadyState(ready);
        if (!ready.ready) {
          setOverviewError('内核扫描服务未就绪');
          return;
        }
      } catch (error: any) {
        if (cancelled) return;
        setReadyState({ status: 'error', ready: false, checks: {} });
        setOverviewError(`内核扫描服务连接失败：${error?.message || '未知错误'}`);
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    };
    bootstrap();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!readyState?.ready) return;
    handleRefreshTasks();
  }, [activeTab, readyState?.ready]);

  useEffect(() => {
    if (!readyState?.ready || showTaskDetail) {
      stopTaskListPolling();
      return;
    }
    stopTaskListPolling();
    tasksRefreshTimer.current = setInterval(() => {
      handleRefreshTasks({ silent: true });
    }, 5000);
    return () => stopTaskListPolling();
  }, [activeTab, readyState?.ready, showTaskDetail]);

  const stopTaskListPolling = () => {
    if (tasksRefreshTimer.current) {
      clearInterval(tasksRefreshTimer.current);
      tasksRefreshTimer.current = null;
    }
  };

  const fetchAllTasks = async () => {
    const perPage = 100;
    let page = 1;
    let total = 0;
    const allItems: KernelScanTaskSummary[] = [];

    while (true) {
      const data = await executionApi.listTasks({ page, per_page: perPage });
      const items = Array.isArray(data.items) ? data.items : [];
      total = Number(data.total ?? items.length);
      allItems.push(...items);
      if (total === 0 || allItems.length >= total || items.length === 0 || items.length < perPage) {
        break;
      }
      page += 1;
    }

    return allItems;
  };

  const handleRefreshTasks = async (options: { silent?: boolean } = {}) => {
    if (tasksRefreshInFlight.current) return;
    tasksRefreshInFlight.current = true;
    if (!options.silent) setTasksLoading(true);
    setOverviewError(null);
    try {
      const items = await fetchAllTasks();
      const pipelineMode = executionApi.categoryToPipeline(activeTab);
      const filtered = items.filter((t) => t.pipeline_mode === pipelineMode);
      setTasks(filtered);
    } catch (error: any) {
      setTasks([]);
      setOverviewError(error?.message || '刷新任务列表失败');
    } finally {
      tasksRefreshInFlight.current = false;
      if (!options.silent) setTasksLoading(false);
    }
  };

  const handleOpenTaskDetail = async (taskId: string) => {
    setSelectedTaskId(taskId);
    setShowTaskDetail(true);
    setTaskDetailLoading(true);
    setEntryResult(null);
    resetTaskWorkspace();
    try {
      const detail = await executionApi.getTask(taskId);
      setSelectedTask(detail);
      if (activeTab !== 'vuln_verify') {
        fetchEntryResult(taskId);
        startEntryResultPolling(taskId, detail.status);
      } else {
        stopEntryResultPolling();
      }
      const workspaceRoot = getTaskWorkspaceRoot(detail, activeTab);
      setTaskWorkspaceRoot(workspaceRoot);
      loadTaskWorkspace(workspaceRoot);
    } catch (error: any) {
      notify(error?.message || '获取任务详情失败', 'error');
    } finally {
      setTaskDetailLoading(false);
    }
  };

  const handleBackToList = () => {
    stopEntryResultPolling();
    setShowTaskDetail(false);
    setSelectedTask(null);
    setSelectedTaskId('');
    setEntryResult(null);
    resetTaskWorkspace();
    handleRefreshTasks({ silent: true });
  };

  const fetchEntryResult = async (taskId: string) => {
    setEntryResultLoading(true);
    try {
      const result = await executionApi.getEntryResult(taskId);
      setEntryResult(result);
    } catch {
      setEntryResult(null);
    } finally {
      setEntryResultLoading(false);
    }
  };

  const startEntryResultPolling = (taskId: string, status?: string | null) => {
    stopEntryResultPolling();
    if (ACTIVE_TASK_STATUSES.has(String(status || '').toLowerCase())) {
      entryResultTimer.current = setInterval(() => fetchEntryResult(taskId), 3000);
    }
  };

  const stopEntryResultPolling = () => {
    if (entryResultTimer.current) {
      clearInterval(entryResultTimer.current);
      entryResultTimer.current = null;
    }
  };

  useEffect(() => () => stopEntryResultPolling(), []);

  const handleOpenPathPicker = async (target: PathPickerTarget = 'target_dir') => {
    setPathPickerTarget(target);
    setShowPathPicker(true);
    setBrowsePath('');
    await loadBrowseData('');
  };

  const loadBrowseData = async (path: string) => {
    setBrowseLoading(true);
    try {
      const data = await executionApi.browseWorkspace(path);
      setBrowseData(data);
      setBrowsePath(data.path);
    } catch (error: any) {
      notify(error?.message || '加载目录失败', 'error');
    } finally {
      setBrowseLoading(false);
    }
  };

  const handleBrowseNavigate = (entry: KernelScanFileEntry) => {
    if (entry.is_dir) {
      loadBrowseData(entry.path);
    }
  };

  const handleBrowseUp = () => {
    if (browseData?.parent != null) {
      loadBrowseData(browseData.parent);
    }
  };

  const handleSelectPath = (path: string) => {
    const absPath = toWorkspaceAbsolutePath(path);
    if (pathPickerTarget === 'entrylist_file') {
      setCreateDevlistPath(absPath);
    } else if (pathPickerTarget === 'report_dir') {
      setCreateReportDir(absPath);
    } else {
      setCreateTargetPath(absPath);
    }
    setShowPathPicker(false);
  };

  const handleConnectRemoteAdbDevice = async () => {
    setAdbDevicesLoading(true);
    setAdbDevicesError(null);
    setAdbDevicesMessage('');
    setAdbDevicesRaw('');
    setAdbDevicesQueried(true);
    setAdbConnected(false);
    try {
      const result = await executionApi.connectRemoteAdbDevice();
      const devices = result.devices || [];
      const connectedDevices = devices.filter((device) => String(device.status || '').toLowerCase() === 'device');
      setAdbDevices(connectedDevices);
      setAdbDevicesRaw(result.raw || '');
      setAdbConnected(connectedDevices.length > 0);
      if (connectedDevices.length > 0) {
        setAdbDevicesMessage(result.message || `设备连接成功：${connectedDevices.map((device) => device.serial).join(', ')}`);
      } else {
        const detected = devices.length > 0
          ? `检测到设备但状态不可用：${devices.map((device) => `${device.serial} (${device.status || '-'})`).join('，')}`
          : '未获取到可用设备 SN';
        setAdbDevicesError(`${detected}。请确认远程 ADB server 已连接设备且状态为 device。`);
      }
    } catch (error: any) {
      setAdbDevices([]);
      setAdbConnected(false);
      setAdbDevicesError(error?.message || '连接远程 ADB 设备失败');
    } finally {
      setAdbDevicesLoading(false);
    }
  };

  const resetTaskWorkspace = () => {
    setTaskWorkspaceRoot('');
    setTaskWorkspacePath('');
    setTaskWorkspaceData(null);
    setTaskWorkspaceError(null);
    setTaskWorkspaceLoading(false);
    setPreviewFile(null);
    setPreviewContent('');
    setPreviewError(null);
    setPreviewLoading(false);
  };

  const loadTaskWorkspace = async (path: string) => {
    const targetPath = toWorkspaceAbsolutePath(path);
    if (taskWorkspaceRoot && !isPathWithinWorkspaceRoot(targetPath, taskWorkspaceRoot)) {
      setTaskWorkspaceError('只能访问当前任务的 workspace 文件');
      return;
    }
    setTaskWorkspaceLoading(true);
    setTaskWorkspaceError(null);
    try {
      const data = await executionApi.browseWorkspace(targetPath);
      if (taskWorkspaceRoot && !isPathWithinWorkspaceRoot(data.path, taskWorkspaceRoot)) {
        throw new Error('只能访问当前任务的 workspace 文件');
      }
      setTaskWorkspaceData(data);
      setTaskWorkspacePath(toWorkspaceAbsolutePath(data.path || targetPath));
    } catch (error: any) {
      setTaskWorkspaceData(null);
      setTaskWorkspacePath(targetPath);
      setTaskWorkspaceError(error?.message || '加载任务 workspace 失败');
    } finally {
      setTaskWorkspaceLoading(false);
    }
  };

  const handleTaskWorkspaceNavigate = (entry: KernelScanFileEntry) => {
    if (!isPathWithinWorkspaceRoot(entry.path, taskWorkspaceRoot)) {
      setTaskWorkspaceError('只能访问当前任务的 workspace 文件');
      return;
    }
    if (entry.is_dir) {
      setPreviewFile(null);
      setPreviewContent('');
      setPreviewError(null);
      loadTaskWorkspace(entry.path);
    } else {
      handlePreviewWorkspaceFile(entry);
    }
  };

  const handleTaskWorkspaceUp = () => {
    if (!taskWorkspaceData?.parent || !isPathWithinWorkspaceRoot(taskWorkspaceData.parent, taskWorkspaceRoot)) return;
    setPreviewFile(null);
    setPreviewContent('');
    setPreviewError(null);
    loadTaskWorkspace(taskWorkspaceData.parent);
  };

  const handlePreviewWorkspaceFile = async (entry: KernelScanFileEntry) => {
    if (!isPathWithinWorkspaceRoot(entry.path, taskWorkspaceRoot)) {
      setPreviewError('只能预览当前任务的 workspace 文件');
      return;
    }
    setPreviewFile(entry);
    setPreviewContent('');
    setPreviewError(null);
    setPreviewLoading(true);
    try {
      const file = await executionApi.getWorkspaceFile(entry.path);
      setPreviewContent(file.content || '');
      setPreviewFile({
        ...entry,
        path: file.path || entry.path,
        size: file.size ?? entry.size,
      });
    } catch (error: any) {
      setPreviewError(error?.message || '预览文件失败');
    } finally {
      setPreviewLoading(false);
    }
  };

  const buildVulnVerifyTaskTitle = () => {
    const customTitle = createTitle.trim();
    if (customTitle) return customTitle;
    const reportName = stripWorkspacePrefix(createReportDir).split('/').filter(Boolean).pop();
    return reportName ? `漏洞验证 - ${reportName}` : '漏洞验证任务';
  };

  const handleCreateTask = async () => {
    if (activeTab !== 'vuln_verify' && !createTitle.trim()) {
      notify('请输入任务标题', 'error');
      return;
    }
    if (!createTargetPath.trim()) {
      notify(activeTab === 'vuln_verify' ? '请选择源码目录' : '请输入目标路径', 'error');
      return;
    }
    if (activeTab === 'vuln_scan' && !createDevlistPath.trim()) {
      notify('请选择 Devlist 文件路径', 'error');
      return;
    }
    if (activeTab === 'vuln_verify' && !createReportDir.trim()) {
      notify('请选择漏洞报告目录', 'error');
      return;
    }
    setCreating(true);
    try {
      const parallelValue = Number(createParallelCount) || 1;
      const pipelineMode = executionApi.categoryToPipeline(activeTab);
      const title = activeTab === 'vuln_verify' ? buildVulnVerifyTaskTitle() : createTitle.trim();
      await executionApi.createTask({
        title,
        pipeline_mode: pipelineMode,
        kernel_dir: createTargetPath.trim(),
        entrylist: activeTab === 'vuln_scan' ? createDevlistPath.trim() : undefined,
        report_dir: activeTab === 'vuln_verify' ? createReportDir.trim() : undefined,
        notes: activeTab !== 'vuln_verify' ? `parallel_count=${parallelValue}` : undefined,
      });
      notify('任务创建成功', 'success');
      setCreateTitle('');
      setCreateTargetPath('');
      setCreateDevlistPath('');
      setCreateReportDir('');
      setCreateParallelCount('1');
      setCreateModalOpen(false);
      await handleRefreshTasks();
    } catch (error: any) {
      notify(error?.message || '创建任务失败', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleCancelTask = async () => {
    if (!selectedTask) return;
    const confirmed = await confirm({
      title: '取消任务',
      message: `确认取消任务「${selectedTask.title}」吗？`,
      confirmText: '取消任务',
      cancelText: '保留任务',
      danger: true,
    });
    if (!confirmed) return;
    setActingTask(true);
    try {
      await executionApi.cancelTask(selectedTask.task_id);
      notify('已提交取消请求', 'success');
      await handleRefreshTasks();
      await handleOpenTaskDetail(selectedTask.task_id);
    } catch (error: any) {
      notify(error?.message || '取消任务失败', 'error');
    } finally {
      setActingTask(false);
    }
  };

  const handleDeleteTaskById = async (task: KernelScanTaskSummary | KernelScanTaskDetail, event?: React.MouseEvent) => {
    event?.stopPropagation();
    event?.preventDefault();
    const confirmed = await confirm({
      title: '删除任务',
      message: `确认删除任务「${task.title}」吗？该操作不可恢复。`,
      confirmText: '删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    setDeletingTaskId(task.task_id);
    try {
      await executionApi.deleteTask(task.task_id);
      notify('任务已删除', 'success');
      if (selectedTaskId === task.task_id) {
        handleBackToList();
      }
      await handleRefreshTasks();
    } catch (error: any) {
      notify(error?.message || '删除任务失败', 'error');
    } finally {
      setDeletingTaskId(null);
    }
  };

  // --- RENDER ---

  if (bootstrapping) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={32} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8 p-10 animate-in fade-in duration-300">
      {feedbackNodes}

      <section className={panelClassName}>
        <div className="flex items-center gap-3">
          <Shield size={24} className="text-slate-700" />
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Kernel Security</div>
            <h1 className="mt-1 text-2xl font-black text-slate-950">内核扫描</h1>
          </div>
        </div>
        {readyState ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(readyState.checks || {}).map(([key, passed]) => (
              <span
                key={key}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${passed ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}
              >
                {passed ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                {key}
              </span>
            ))}
          </div>
        ) : null}
        {overviewError ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{overviewError}</div>
        ) : null}
      </section>

      <div className="flex gap-2">
        {(['attack_entry', 'vuln_scan', 'vuln_verify'] as KernelScanCategory[]).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => { setActiveTab(cat); setShowTaskDetail(false); setTaskKeyword(''); }}
            className={`rounded-lg px-4 py-2.5 text-sm font-bold transition ${activeTab === cat ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {!showTaskDetail && activeTab === 'vuln_verify' ? (
        <section className={panelClassName}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <Smartphone size={22} className="shrink-0 text-slate-700" />
              <div className="min-w-0">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Remote ADB</div>
                <h2 className="mt-1 text-xl font-black text-slate-950">远程终端设备</h2>
                <div className="mt-1 break-all font-mono text-[11px] font-semibold text-slate-500">
                  转发设备端口：ssh -N -R 0.0.0.0:15037:127.0.0.1:5037 remote_user@IP
                </div>
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
              <button
                type="button"
                onClick={handleConnectRemoteAdbDevice}
                disabled={adbDevicesLoading}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {adbDevicesLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                连接设备
              </button>
            </div>
          </div>

          {adbDevicesError ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
              {adbDevicesError}
            </div>
          ) : null}
          {adbDevicesMessage ? (
            <div className={`mt-4 rounded-lg border px-3 py-2 text-sm font-semibold ${adbConnected ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
              {adbDevicesMessage}
            </div>
          ) : null}

          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="hidden grid-cols-[minmax(0,1.1fr)_120px_minmax(0,1.4fr)] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500 sm:grid">
              <span>Serial</span>
              <span>Status</span>
              <span>Info</span>
            </div>
            {adbDevicesLoading ? (
              <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm font-semibold text-slate-500">
                <Loader2 size={16} className="animate-spin" />
                连接中...
              </div>
            ) : adbDevices.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {adbDevices.map((device) => (
                  <div
                    key={`${device.serial}-${device.transport_id || ''}`}
                    className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1.1fr)_120px_minmax(0,1.4fr)] sm:gap-3"
                  >
                    <div className="min-w-0 break-all font-mono text-sm font-semibold text-slate-800">{device.serial}</div>
                    <div>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${device.status === 'device' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                        {device.status || '-'}
                      </span>
                    </div>
                    <div className="min-w-0 space-y-1 text-xs font-semibold text-slate-600">
                      <div className="break-all">{[device.model, device.product, device.device].filter(Boolean).join(' / ') || '-'}</div>
                      {device.transport_id ? (
                        <div className="font-mono text-slate-400">transport_id={device.transport_id}</div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : adbDevicesQueried ? (
              <div className="px-3 py-8 text-center text-sm font-semibold text-slate-400">
                未发现远程 ADB 设备
              </div>
            ) : (
              <div className="px-3 py-8 text-center text-sm font-semibold text-slate-400">
                点击连接设备
              </div>
            )}
          </div>

          {adbDevicesRaw ? (
            <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100">
{adbDevicesRaw}
            </pre>
          ) : null}
        </section>
      ) : null}

      {!showTaskDetail ? (
        <section className={panelClassName}>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Task Queue</div>
              <h2 className="mt-2 text-xl font-black text-slate-950">{CATEGORY_LABELS[activeTab]} · 任务列表</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCreateModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-bold text-white transition hover:bg-slate-800"
              >
                <Plus size={16} />
                新建任务
              </button>
              <button
                type="button"
                onClick={() => handleRefreshTasks()}
                disabled={tasksLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {tasksLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                刷新
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">任务总数</div>
              <div className="mt-1 text-lg font-black text-slate-900">{tasks.length}</div>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-600">进行中</div>
              <div className="mt-1 text-lg font-black text-blue-700">{activeTaskCount}</div>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600">已完成</div>
              <div className="mt-1 text-lg font-black text-emerald-700">{succeededTaskCount}</div>
            </div>
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-rose-600">失败</div>
              <div className="mt-1 text-lg font-black text-rose-700">{failedTaskCount}</div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <Search size={16} className="text-slate-400" />
            <input
              value={taskKeyword}
              onChange={(event) => setTaskKeyword(event.target.value)}
              placeholder="筛选标题、路径或任务 ID"
              className="w-full bg-transparent text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>

          <div className="mt-4 max-h-[840px] space-y-3 overflow-auto pr-1">
            {tasksLoading ? (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
                <Loader2 size={16} className="animate-spin" />
                正在加载任务列表...
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm font-semibold text-slate-500">
                当前没有{CATEGORY_LABELS[activeTab]}任务。
              </div>
            ) : (
              filteredTasks.map((item) => {
                const active = item.task_id === selectedTaskId;
                const deleting = deletingTaskId === item.task_id;
                return (
                  <div
                    key={item.task_id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleOpenTaskDetail(item.task_id)}
                    onKeyDown={(event) => { if (event.key === 'Enter') handleOpenTaskDetail(item.task_id); }}
                    className={`block w-full cursor-pointer rounded-lg border px-4 py-4 text-left transition ${active ? 'border-sky-300 bg-sky-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-slate-900">{item.title}</div>
                        <div className="mt-2 break-all font-mono text-[11px] text-slate-500">{item.kernel_dir || '-'}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${statusTone(item.status)}`}>
                          {formatTaskStatus(item.status)}
                        </span>
                        <button
                          type="button"
                          onClick={(event) => handleDeleteTaskById(item, event)}
                          disabled={deleting}
                          title="删除任务"
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2 py-1 text-[11px] font-bold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                          删除
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500">
                      <span>{formatDateTime(item.created_at)}</span>
                    </div>
                    <div className="mt-2 font-mono text-[11px] text-slate-400">{item.task_id}</div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      ) : (
        <section className={panelClassName}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <button
                type="button"
                onClick={handleBackToList}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
              >
                <ArrowLeft size={16} />
                返回任务列表
              </button>
              <div className="mt-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Task Detail</div>
              <h2 className="mt-2 truncate text-2xl font-black text-slate-950">{selectedTask?.title || '任务详情'}</h2>
              {selectedTask ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusTone(selectedTask.status)}`}>
                    {formatTaskStatus(selectedTask.status)}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
                    {CATEGORY_LABELS[activeTab]}
                  </span>
                </div>
              ) : null}
            </div>

            {selectedTask ? (
              <div className="flex flex-wrap gap-2">
                {ACTIVE_TASK_STATUSES.has(String(selectedTask.status || '').toLowerCase()) ? (
                  <button
                    type="button"
                    onClick={handleCancelTask}
                    disabled={actingTask}
                    className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {actingTask ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                    取消任务
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => handleDeleteTaskById(selectedTask)}
                  disabled={deletingTaskId === selectedTask.task_id}
                  className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 py-2 text-sm font-bold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deletingTaskId === selectedTask.task_id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  删除任务
                </button>
              </div>
            ) : null}
          </div>

          {taskDetailLoading ? (
            <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-slate-600">
              <Loader2 size={16} className="animate-spin" />
              正在加载任务详情...
            </div>
          ) : selectedTask ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">任务 ID</div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(selectedTask.task_id);
                        notify('已复制任务 ID', 'success');
                      } catch {
                        notify('复制失败，请手动选择文本', 'error');
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 transition hover:bg-slate-100"
                  >
                    <Copy size={12} />
                    复制
                  </button>
                </div>
                <div
                  className="mt-2 break-all font-mono text-sm text-slate-800 select-all cursor-text"
                  onClick={(event) => {
                    const range = document.createRange();
                    range.selectNodeContents(event.currentTarget);
                    const selection = window.getSelection();
                    selection?.removeAllRanges();
                    selection?.addRange(range);
                  }}
                >
                  {selectedTask.task_id}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">目标路径</div>
                <div className="mt-2 break-all font-mono text-sm text-slate-800">{selectedTask.kernel_dir || '-'}</div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">创建时间</div>
                  <div className="mt-2 text-sm font-semibold text-slate-800">{formatDateTime(selectedTask.created_at)}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">完成时间</div>
                  <div className="mt-2 text-sm font-semibold text-slate-800">{formatDateTime(selectedTask.finished_at)}</div>
                </div>
              </div>
              {selectedTask.notes ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">备注</div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{selectedTask.notes}</div>
                </div>
              ) : null}
              {showTaskWorkspaceFiles ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <FolderOpen size={14} className="text-slate-500" />
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{isVulnVerifyDetail ? '扫描结果预览' : '任务 Workspace 文件'}</div>
                      </div>
                      <div className="mt-2 break-all font-mono text-[11px] text-slate-500">{taskWorkspaceDisplayPath}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => loadTaskWorkspace(taskWorkspacePath || taskWorkspaceRoot)}
                      disabled={taskWorkspaceLoading || !taskWorkspaceRoot}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {taskWorkspaceLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      刷新
                    </button>
                  </div>

                  {taskWorkspaceError ? (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
                      {taskWorkspaceError}
                    </div>
                  ) : null}

                  <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
                    <div className="min-h-[320px] overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
                        <span className="text-xs font-bold text-slate-600">{isVulnVerifyDetail ? '结果文件' : '文件列表'}</span>
                        {canGoTaskWorkspaceUp ? (
                          <button
                            type="button"
                            onClick={handleTaskWorkspaceUp}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold text-slate-600 transition hover:bg-slate-200"
                          >
                            <ArrowLeft size={12} />
                            上级
                          </button>
                        ) : null}
                      </div>
                      <div className="max-h-[420px] overflow-auto p-2">
                        {taskWorkspaceLoading && !taskWorkspaceData ? (
                          <div className="flex items-center justify-center gap-2 py-10 text-sm font-semibold text-slate-500">
                            <Loader2 size={16} className="animate-spin" />
                            加载中...
                          </div>
                        ) : taskWorkspaceItems.length > 0 ? (
                          <div className="space-y-1">
                            {taskWorkspaceItems.map((entry) => {
                              const selected = previewFile?.path === entry.path;
                              return (
                                <button
                                  key={entry.path}
                                  type="button"
                                  onClick={() => handleTaskWorkspaceNavigate(entry)}
                                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition ${selected ? 'bg-sky-50 text-sky-800' : 'text-slate-700 hover:bg-slate-50'}`}
                                >
                                  {entry.is_dir ? (
                                    <Folder size={16} className="shrink-0 text-amber-500" />
                                  ) : (
                                    <FileText size={16} className="shrink-0 text-slate-400" />
                                  )}
                                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{entry.name}</span>
                                  {entry.is_dir ? (
                                    <ChevronRight size={14} className="shrink-0 text-slate-300" />
                                  ) : (
                                    <span className="shrink-0 text-[11px] font-semibold text-slate-400">{formatBytes(entry.size)}</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="py-10 text-center text-sm font-semibold text-slate-400">
                            {isVulnVerifyDetail ? '暂无扫描结果文件' : '暂无 workspace 文件'}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="min-h-[320px] overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="truncate text-xs font-bold text-slate-600">
                          {previewFile ? previewFile.name : '文件预览'}
                        </div>
                        {previewFile ? (
                          <div className="mt-1 break-all font-mono text-[11px] text-slate-400">
                            {stripWorkspacePrefix(previewFile.path)} · {formatBytes(previewFile.size)}
                          </div>
                        ) : null}
                      </div>
                      <div className="max-h-[420px] overflow-auto p-3">
                        {previewLoading ? (
                          <div className="flex items-center justify-center gap-2 py-10 text-sm font-semibold text-slate-500">
                            <Loader2 size={16} className="animate-spin" />
                            正在读取文件...
                          </div>
                        ) : previewError ? (
                          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                            {previewError}
                          </div>
                        ) : previewFile ? (
                          <pre className="min-h-[260px] whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-slate-800">
{previewContent || '(空文件)'}
                          </pre>
                        ) : (
                          <div className="flex min-h-[260px] items-center justify-center text-sm font-semibold text-slate-400">
                            点击左侧文件进行预览
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
              {activeTab !== 'vuln_verify' ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-slate-500" />
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">扫描结果预览</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {ACTIVE_TASK_STATUSES.has(String(selectedTask.status || '').toLowerCase()) ? (
                      <span className="text-[10px] font-bold text-blue-600">自动刷新中</span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => fetchEntryResult(selectedTask.task_id)}
                      disabled={entryResultLoading}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                    >
                      {entryResultLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      刷新
                    </button>
                  </div>
                </div>
                {entryResultLoading && !entryResult ? (
                  <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-500">
                    <Loader2 size={14} className="animate-spin" />
                    加载中...
                  </div>
                ) : entryResult?.exists ? (
                  <div className="mt-3">
                    <div className="mb-2 break-all font-mono text-[11px] text-slate-400">
                      {entryResult.path} ({entryResult.size ?? 0} bytes)
                    </div>
                    <pre className="max-h-[400px] overflow-auto whitespace-pre-wrap break-all rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs leading-relaxed text-slate-800">
{entryResult.content || '(空文件)'}
                    </pre>
                  </div>
                ) : (
                  <div className="mt-3 text-sm font-semibold text-slate-400">
                    暂无扫描结果文件
                  </div>
                )}
              </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-6 text-sm font-semibold text-slate-500">
              任务详情不可用，请返回任务列表重新选择。
            </div>
          )}
        </section>
      )}

      {createModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
          <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="shrink-0 border-b border-slate-200 bg-slate-50/90 px-5 py-4">
              <h3 className="text-lg font-black text-slate-950">新建{CATEGORY_LABELS[activeTab]}任务</h3>
            </div>
            <div className="flex-1 space-y-5 overflow-auto p-5">
              <label className="block">
                <div className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                  {activeTab === 'vuln_verify' ? '自定义任务名' : '任务标题'}
                </div>
                <input
                  value={createTitle}
                  onChange={(event) => setCreateTitle(event.target.value)}
                  placeholder={activeTab === 'vuln_verify' ? '留空则按报告目录自动生成' : `输入${CATEGORY_LABELS[activeTab]}任务标题`}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                />
              </label>
              <label className="block">
                <div className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">{activeTab === 'vuln_verify' ? '源码目录' : '目标路径（内核源码目录）'}</div>
                <div className="flex items-center gap-2">
                  <input
                    value={createTargetPath}
                    readOnly
                    placeholder={activeTab === 'vuln_verify' ? '选择内核源码目录' : '从项目资产中选择路径'}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleOpenPathPicker('target_dir')}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                  >
                    <FolderOpen size={16} />
                    选择
                  </button>
                </div>
              </label>
              {activeTab === 'vuln_scan' ? (
                <label className="block">
                  <div className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">Devlist 文件路径</div>
                  <div className="flex items-center gap-2">
                    <input
                      value={createDevlistPath}
                      readOnly
                      placeholder="选择入口清单文件（每行 <func> <method>）"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleOpenPathPicker('entrylist_file')}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                    >
                      <FileText size={16} />
                      选择
                    </button>
                  </div>
                </label>
              ) : null}
              {activeTab === 'vuln_verify' ? (
                <label className="block">
                  <div className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">漏洞报告目录</div>
                  <div className="flex items-center gap-2">
                    <input
                      value={createReportDir}
                      readOnly
                      placeholder="选择漏洞扫描生成的报告目录"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleOpenPathPicker('report_dir')}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                    >
                      <FolderOpen size={16} />
                      选择
                    </button>
                  </div>
                </label>
              ) : null}
              {activeTab !== 'vuln_verify' ? (
                <label className="block">
                  <div className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">并行数</div>
                  <input
                    type="number"
                    min={1}
                    max={32}
                    value={createParallelCount}
                    onChange={(event) => setCreateParallelCount(event.target.value)}
                    placeholder="1"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                  />
                </label>
              ) : null}
            </div>
            <div className="shrink-0 border-t border-slate-200 bg-slate-50/90 px-5 py-4">
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  disabled={creating}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleCreateTask}
                  disabled={creating || (activeTab !== 'vuln_verify' && !createTitle.trim()) || !createTargetPath.trim() || (activeTab === 'vuln_scan' && !createDevlistPath.trim()) || (activeTab === 'vuln_verify' && !createReportDir.trim())}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  创建任务
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showPathPicker ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
          <div className="flex h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50/90 px-5 py-4">
              <div>
                <h3 className="text-lg font-black text-slate-950">{pathPickerTitle}</h3>
                <div className="mt-1 break-all font-mono text-xs text-slate-500">{formatWorkspaceDisplayPath(browsePath)}</div>
              </div>
              <button type="button" onClick={() => setShowPathPicker(false)} className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-200">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {browseLoading ? (
                <div className="flex items-center gap-2 py-8 justify-center text-sm font-semibold text-slate-500">
                  <Loader2 size={16} className="animate-spin" />
                  加载中...
                </div>
              ) : (
                <div className="space-y-1">
                  {browseData?.parent != null ? (
                    <button
                      type="button"
                      onClick={handleBrowseUp}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
                    >
                      <ArrowLeft size={16} className="text-slate-400" />
                      ..
                    </button>
                  ) : null}
                  {(browseData?.items || []).filter((e) => e.is_dir).map((entry) => (
                    <div key={entry.path} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleBrowseNavigate(entry)}
                        className="flex flex-1 items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
                      >
                        <Folder size={16} className="text-amber-500" />
                        {entry.name}
                        <ChevronRight size={14} className="ml-auto text-slate-300" />
                      </button>
                      {pathPickerMode === 'dir' ? (
                        <button
                          type="button"
                          onClick={() => handleSelectPath(entry.path)}
                          className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                        >
                          选择
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {(browseData?.items || []).filter((e) => !e.is_dir).map((entry) => (
                    <div key={entry.path} className="flex items-center gap-1 rounded-lg px-3 py-2.5">
                      <div className="flex flex-1 items-center gap-2 text-sm font-semibold text-slate-700">
                        <FileText size={16} className="text-slate-400" />
                        {entry.name}
                      </div>
                      {pathPickerMode === 'file' ? (
                        <button
                          type="button"
                          onClick={() => handleSelectPath(entry.path)}
                          className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                        >
                          选择
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {!browseLoading && (browseData?.items || []).length === 0 ? (
                    <div className="py-8 text-center text-sm font-semibold text-slate-400">空目录</div>
                  ) : null}
                </div>
              )}
            </div>
            <div className="shrink-0 border-t border-slate-200 bg-slate-50/90 px-5 py-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">
                  {pathPickerMode === 'file' ? '进入目录后点击文件旁的"选择"' : '点击目录名进入，点击"选择"确认路径'}
                </span>
                {pathPickerMode === 'dir' ? (
                  <button
                    type="button"
                    onClick={() => handleSelectPath(browsePath)}
                    className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-800"
                  >
                    选择当前目录
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
