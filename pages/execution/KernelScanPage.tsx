import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, Copy, FileText, Folder, FolderOpen, Loader2, Plus, RefreshCw, RotateCcw, Search, Shield, Smartphone, Trash2, X, XCircle } from 'lucide-react';

import { api } from '../../clients/api';
import { KernelScanAdbDevice, KernelScanCategory, KernelScanBrowseResponse, KernelScanEntryResult, KernelScanFileEntry, KernelScanReadyState, KernelScanTaskDetail, KernelScanTaskSummary } from '../../clients/kernelScan';
import { useUiFeedback } from '../../components/UiFeedback';

const ACTIVE_TASK_STATUSES = new Set(['queued', 'running', 'cancel_requested']);
const RESTARTABLE_TASK_STATUSES = new Set(['succeeded', 'partial_success', 'failed', 'cancelled']);
const TERMINAL_SUCCESS_STATUSES = new Set(['succeeded', 'partial_success']);

interface EntryProgress {
  percent: number | null;
  current?: number;
  total?: number;
  label?: string;
  updatedAt: number;
}

const PROJECT_TAG_RE = /^\[p:([^\]\s]+)\]\s*/;

const parseTaskTitle = (rawTitle: string): { projectId: string | null; title: string } => {
  const match = String(rawTitle || '').match(PROJECT_TAG_RE);
  if (!match) return { projectId: null, title: String(rawTitle || '') };
  return { projectId: match[1], title: String(rawTitle || '').replace(PROJECT_TAG_RE, '') };
};

const tagTaskTitle = (title: string, projectId?: string | null): string => {
  const trimmed = String(title || '').trim();
  if (!projectId) return trimmed;
  return`[p:${projectId}] ${trimmed}`;
};

const parseEntryProgress = (content: string): EntryProgress | null => {
  if (!content) return null;
  const lines = content.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line) continue;
    const ratio = line.match(/(\d+)\s*\/\s*(\d+)/);
    if (ratio) {
      const current = Number(ratio[1]);
      const total = Number(ratio[2]);
      if (Number.isFinite(current) && Number.isFinite(total) && total > 0) {
        const percent = Math.max(0, Math.min(100, (current / total) * 100));
        return { percent, current, total, label: line.trim().slice(-120), updatedAt: Date.now() };
      }
    }
    const pct = line.match(/(\d+(?:\.\d+)?)\s*%/);
    if (pct) {
      const percent = Math.max(0, Math.min(100, Number(pct[1])));
      if (Number.isFinite(percent)) {
        return { percent, label: line.trim().slice(-120), updatedAt: Date.now() };
      }
    }
  }
  return null;
};

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
      return { borderColor: LK.success, backgroundColor: 'rgba(69, 192, 111, 0.14)', color: LK.success };
    case 'failed':
      return { borderColor: LK.error, backgroundColor: 'rgba(241, 93, 93, 0.14)', color: LK.error };
    case 'cancelled':
      return { borderColor: LK.borderSoft, backgroundColor: LK.surfaceRaised, color: LK.muted };
    case 'cancel_requested':
    case 'running':
      return { borderColor: LK.info, backgroundColor: 'rgba(79, 140, 255, 0.14)', color: LK.info };
    case 'queued':
      return { borderColor: LK.primary, backgroundColor: 'rgba(79, 115, 255, 0.14)', color: LK.primary };
    default:
      return { borderColor: LK.borderSoft, backgroundColor: LK.surface, color: LK.body };
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
  if (value < 1024) return`${value} B`;
  if (value < 1024 * 1024) return`${(value / 1024).toFixed(1)} KB`;
  return`${(value / 1024 / 1024).toFixed(1)} MB`;
};

const toWorkspaceAbsolutePath = (path?: string | null) => {
  const trimmed = String(path || '').trim();
  if (!trimmed || trimmed === '/') return '/workspace';
  if (trimmed === '/workspace' || trimmed.startsWith('/workspace/')) return trimmed;
  const relative = trimmed.replace(/^\/+/, '').replace(/^workspace\/?/, '');
  return relative ?`/workspace/${relative}` : '/workspace';
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
  return relative ?`/workspace/${relative}` : '/workspace';
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

const LK = {
  primary: '#4f73ff', primarySoft: '#7590ff', primaryDeep: '#3f63f1',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: '#070d18', surface: '#111a2b', surfaceRaised: '#18233a',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: '#26324a', borderSoft: '#1b2438',
  ink: '#f5f7ff', inkSoft: '#d6def0', body: '#a4aec4',
  muted: '#72809a', mutedSoft: '#8b95a8',
  success: '#45c06f', warning: '#d5a13a', error: '#f15d5d', info: '#4f8cff',
  critical: '#ff4d4f', high: '#ff8b3d', medium: '#f0b64c', low: '#49c5ff',
} as const;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

const panelClassName = 'rounded-[2rem] border border-slate-200 bg-slate-50 p-6 ';

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
  const [restartingTask, setRestartingTask] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  const [entryResult, setEntryResult] = useState<KernelScanEntryResult | null>(null);
  const [entryResultLoading, setEntryResultLoading] = useState(false);
  const entryResultTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const tasksRefreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const tasksRefreshInFlight = useRef(false);

  const [entryProgress, setEntryProgress] = useState<Record<string, EntryProgress>>({});
  const entryProgressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const entryProgressInFlight = useRef<Set<string>>(new Set());

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

  const tasksForProject = tasks
    .map((item) => {
      const parsed = parseTaskTitle(item.title);
      return { ...item, title: parsed.title, _rawTitle: item.title, _projectId: parsed.projectId };
    })
    .filter((item) => {
      if (!projectId) return true;
      return item._projectId === projectId;
    });

  const filteredTasks = tasksForProject.filter((item) => {
    const keyword = taskKeyword.trim().toLowerCase();
    if (!keyword) return true;
    return`${item.title} ${item.kernel_dir || ''} ${item.task_id}`.toLowerCase().includes(keyword);
  });

  const activeTaskCount = tasksForProject.filter((item) => ACTIVE_TASK_STATUSES.has(String(item.status || '').toLowerCase())).length;
  const succeededTaskCount = tasksForProject.filter((item) => String(item.status || '').toLowerCase() === 'succeeded').length;
  const failedTaskCount = tasksForProject.filter((item) => String(item.status || '').toLowerCase() === 'failed').length;
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
      const parsedDetailTitle = parseTaskTitle(detail.title);
      setSelectedTask({ ...detail, title: parsedDetailTitle.title });
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

  const fetchEntryProgressForTask = async (taskId: string, status?: string | null) => {
    const normalized = String(status || '').toLowerCase();
    if (TERMINAL_SUCCESS_STATUSES.has(normalized)) {
      setEntryProgress((prev) => ({
        ...prev,
        [taskId]: { percent: 100, label: '已完成', updatedAt: Date.now() },
      }));
      return;
    }
    if (entryProgressInFlight.current.has(taskId)) return;
    entryProgressInFlight.current.add(taskId);
    try {
      const file = await executionApi.getWorkspaceFile(`/workspace/entry/${taskId}/entry.log`);
      const parsed = parseEntryProgress(String(file?.content || ''));
      if (parsed) {
        setEntryProgress((prev) => ({ ...prev, [taskId]: parsed }));
      } else {
        setEntryProgress((prev) => {
          if (prev[taskId]) return prev;
          return { ...prev, [taskId]: { percent: null, updatedAt: Date.now() } };
        });
      }
    } catch {
      setEntryProgress((prev) => {
        if (prev[taskId]) return prev;
        return { ...prev, [taskId]: { percent: null, updatedAt: Date.now() } };
      });
    } finally {
      entryProgressInFlight.current.delete(taskId);
    }
  };

  useEffect(() => {
    if (entryProgressTimer.current) {
      clearInterval(entryProgressTimer.current);
      entryProgressTimer.current = null;
    }
    if (activeTab !== 'attack_entry' || tasks.length === 0) return;

    const refresh = () => {
      tasks.forEach((task) => {
        const status = String(task.status || '').toLowerCase();
        if (ACTIVE_TASK_STATUSES.has(status) || TERMINAL_SUCCESS_STATUSES.has(status) || !entryProgress[task.task_id]) {
          fetchEntryProgressForTask(task.task_id, task.status);
        }
      });
    };

    refresh();
    entryProgressTimer.current = setInterval(refresh, 5000);

    return () => {
      if (entryProgressTimer.current) {
        clearInterval(entryProgressTimer.current);
        entryProgressTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, tasks]);

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
        setAdbDevicesMessage(result.message ||`设备连接成功：${connectedDevices.map((device) => device.serial).join(', ')}`);
      } else {
        const detected = devices.length > 0
          ?`检测到设备但状态不可用：${devices.map((device) =>`${device.serial} (${device.status || '-'})`).join('，')}`
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
    return reportName ?`漏洞验证 - ${reportName}` : '漏洞验证任务';
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
      const rawTitle = activeTab === 'vuln_verify' ? buildVulnVerifyTaskTitle() : createTitle.trim();
      const title = tagTaskTitle(rawTitle, projectId);
      await executionApi.createTask({
        title,
        pipeline_mode: pipelineMode,
        kernel_dir: createTargetPath.trim(),
        entrylist: activeTab === 'vuln_scan' ? createDevlistPath.trim() : undefined,
        report_dir: activeTab === 'vuln_verify' ? createReportDir.trim() : undefined,
        notes: activeTab !== 'vuln_verify' ?`parallel_count=${parallelValue}` : undefined,
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
      message:`确认取消任务「${selectedTask.title}」吗？`,
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

  const handleRestartTask = async () => {
    if (!selectedTask) return;
    const confirmed = await confirm({
      title: '重启任务',
      message:`确认重启任务「${selectedTask.title}」吗？将复用原有配置重新执行，已有产物会被保留。`,
      confirmText: '重启',
      cancelText: '取消',
    });
    if (!confirmed) return;
    setRestartingTask(true);
    try {
      await executionApi.restartTask(selectedTask.task_id);
      notify('任务已重新排队', 'success');
      await handleRefreshTasks();
      await handleOpenTaskDetail(selectedTask.task_id);
    } catch (error: any) {
      notify(error?.message || '重启任务失败', 'error');
    } finally {
      setRestartingTask(false);
    }
  };

  const handleDeleteTaskById = async (task: KernelScanTaskSummary | KernelScanTaskDetail, event?: React.MouseEvent) => {
    event?.stopPropagation();
    event?.preventDefault();
    const confirmed = await confirm({
      title: '删除任务',
      message:`确认删除任务「${task.title}」吗？该操作不可恢复。`,
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8rem 0' }}>
        <Loader2 size={32} className="animate-spin" style={{ color: LK.muted }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', padding: '2.5rem', backgroundColor: LK.canvas, minHeight: '100vh' }}>
      {feedbackNodes}

      <section style={{ borderRadius: '1.5rem', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Shield size={24} style={{ color: LK.inkSoft }} />
          <div>
            <h1 style={{ marginTop: '0.25rem', fontSize: '1.5rem', fontWeight: 600, color: LK.ink }}>内核扫描</h1>
          </div>
        </div>
        {readyState ? (
          <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {Object.entries(readyState.checks || {}).map(([key, passed]) => (
              <span
                key={key}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                  borderRadius: '9999px', border: `1px solid ${passed ? LK.success : LK.warning}`,
                  backgroundColor: passed ? 'rgba(69, 192, 111, 0.14)' : 'rgba(213, 161, 58, 0.14)',
                  padding: '0.25rem 0.75rem', fontSize: '0.75rem', fontWeight: 600,
                  color: passed ? LK.success : LK.warning
                }}
              >
                {passed ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                {key}
              </span>
            ))}
          </div>
        ) : null}
        {overviewError ? (
          <div style={{ marginTop: '1rem', borderRadius: '1.25rem', border: `1px solid ${LK.error}`, backgroundColor: 'rgba(241, 93, 93, 0.14)', padding: '0.75rem 1rem', fontSize: '0.875rem', fontWeight: 600, color: LK.error }}>{overviewError}</div>
        ) : null}
      </section>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {(['attack_entry', 'vuln_scan', 'vuln_verify'] as KernelScanCategory[]).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => { setActiveTab(cat); setShowTaskDetail(false); setTaskKeyword(''); }}
            style={{
              borderRadius: '0.5rem', padding: '0.625rem 1rem', fontSize: '0.875rem', fontWeight: 600, transition: 'all 0.2s',
              backgroundColor: activeTab === cat ? LK.ink : LK.surface,
              color: activeTab === cat ? LK.canvas : LK.inkSoft,
              border: activeTab === cat ? 'none' :`1px solid ${LK.borderSoft}`
            }}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {!showTaskDetail && activeTab === 'vuln_verify' ? (
        <section style={{ borderRadius: '2rem', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: '0.75rem' }}>
              <Smartphone size={22} style={{ flexShrink: 0, color: LK.inkSoft }} />
              <div style={{ minWidth: 0 }}>
                <h2 style={{ marginTop: '0.25rem', fontSize: '1.25rem', fontWeight: 600, color: LK.ink }}>远程终端设备</h2>
                <div style={{ marginTop: '0.25rem', wordBreak: 'break-all', fontFamily: MONO, fontSize: '0.6875rem', fontWeight: 600, color: LK.muted }}>
                  转发设备端口：ssh -N -R 0.0.0.0:15037:127.0.0.1:5037 remote_user@IP
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', width: '100%', flexDirection: 'column', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={handleConnectRemoteAdbDevice}
                disabled={adbDevicesLoading}
                style={{
                  display: 'inline-flex', flexShrink: 0, alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                  borderRadius: '0.5rem', backgroundColor: LK.ink, padding: '0.625rem 1rem',
                  fontSize: '0.875rem', fontWeight: 600, color: LK.canvas, transition: 'all 0.2s',
                  opacity: adbDevicesLoading ? 0.5 : 1, cursor: adbDevicesLoading ? 'not-allowed' : 'pointer'
                }}
              >
                {adbDevicesLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                连接设备
              </button>
            </div>
          </div>

          {adbDevicesError ? (
            <div style={{ marginTop: '1rem', borderRadius: '0.5rem', border: `1px solid ${LK.error}`, backgroundColor: 'rgba(241, 93, 93, 0.14)', padding: '0.5rem 0.75rem', fontSize: '0.875rem', fontWeight: 600, color: LK.error }}>
              {adbDevicesError}
            </div>
          ) : null}
          {adbDevicesMessage ? (
            <div style={{ marginTop: '1rem', borderRadius: '0.5rem', border: `1px solid ${adbConnected ? LK.success : LK.borderSoft}`, backgroundColor: adbConnected ? 'rgba(69, 192, 111, 0.14)' : LK.surfaceRaised, padding: '0.5rem 0.75rem', fontSize: '0.875rem', fontWeight: 600, color: adbConnected ? LK.success : LK.body }}>
              {adbDevicesMessage}
            </div>
          ) : null}

          <div style={{ marginTop: '1rem', overflow: 'hidden', borderRadius: '0.5rem', border: `1px solid ${LK.border}`, backgroundColor: LK.surface }}>
            <div style={{ display: 'none', gridTemplateColumns: 'minmax(0,1.1fr) 120px minmax(0,1.4fr)', gap: '0.75rem', borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '0.5rem 0.75rem', fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }} className="sm:grid">
              <span>Serial</span>
              <span>Status</span>
              <span>Info</span>
            </div>
            {adbDevicesLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.75rem 2rem', fontSize: '0.875rem', fontWeight: 600, color: LK.body }}>
                <Loader2 size={16} className="animate-spin" />
                连接中...
              </div>
            ) : adbDevices.length > 0 ? (
              <div style={{ borderTop:`1px solid ${LK.borderSoft}` }}>
                {adbDevices.map((device) => (
                  <div
                    key={`${device.serial}-${device.transport_id || ''}`}
                    style={{ display: 'grid', gap: '0.5rem', padding: '0.75rem', gridTemplateColumns: 'minmax(0,1.1fr) 120px minmax(0,1.4fr)' }} className="sm:grid-cols-[minmax(0,1.1fr)_120px_minmax(0,1.4fr)] sm:gap-3"
                  >
                    <div style={{ minWidth: 0, wordBreak: 'break-all', fontFamily: MONO, fontSize: '0.875rem', fontWeight: 600, color: LK.inkSoft }}>{device.serial}</div>
                    <div>
                      <span style={{ display: 'inline-flex', borderRadius: '9999px', border: `1px solid ${device.status === 'device' ? LK.success : LK.warning}`, backgroundColor: device.status === 'device' ? 'rgba(69, 192, 111, 0.14)' : 'rgba(213, 161, 58, 0.14)', padding: '0 0.5rem', fontSize: '0.6875rem', fontWeight: 600, color: device.status === 'device' ? LK.success : LK.warning }}>
                        {device.status || '-'}
                      </span>
                    </div>
                    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem', fontWeight: 600, color: LK.muted }}>
                      <div style={{ wordBreak: 'break-all' }}>{[device.model, device.product, device.device].filter(Boolean).join(' / ') || '-'}</div>
                      {device.transport_id ? (
                        <div style={{ fontFamily: MONO, color: LK.mutedSoft }}>transport_id={device.transport_id}</div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : adbDevicesQueried ? (
              <div style={{ padding: '0.75rem 2rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: 600, color: LK.muted }}>
                未发现远程 ADB 设备
              </div>
            ) : (
              <div style={{ padding: '0.75rem 2rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: 600, color: LK.muted }}>
                点击连接设备
              </div>
            )}
          </div>

        </section>
      ) : null}

      {!showTaskDetail ? (
        <section style={{ borderRadius: '2rem', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ marginTop: '0.5rem', fontSize: '1.25rem', fontWeight: 600, color: LK.ink }}>{CATEGORY_LABELS[activeTab]} · 任务列表</h2>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setCreateModalOpen(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', borderRadius: '0.5rem', backgroundColor: LK.ink, padding: '0.5rem 0.75rem', fontSize: '0.875rem', fontWeight: 600, color: LK.canvas, transition: 'all 0.2s' }}
              >
                <Plus size={16} />
                新建任务
              </button>
              <button
                type="button"
                onClick={() => handleRefreshTasks()}
                disabled={tasksLoading}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', borderRadius: '0.5rem', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, padding: '0.5rem 0.75rem', fontSize: '0.875rem', fontWeight: 600, color: LK.inkSoft, transition: 'all 0.2s', opacity: tasksLoading ? 0.5 : 1, cursor: tasksLoading ? 'not-allowed' : 'pointer' }}
              >
                {tasksLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                刷新
              </button>
            </div>
          </div>

          <div style={{ marginTop: '1rem', display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(4, 1fr)' }} className="sm:grid-cols-4">
            <div style={{ borderRadius: '0.5rem', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, padding: '0.75rem 1rem' }}>
              <div style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>任务总数</div>
              <div style={{ marginTop: '0.25rem', fontSize: '1.125rem', fontWeight: 600, color: LK.ink }}>{tasks.length}</div>
            </div>
            <div style={{ borderRadius: '0.5rem', border: `1px solid ${LK.info}`, backgroundColor: 'rgba(79, 140, 255, 0.14)', padding: '0.75rem 1rem' }}>
              <div style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.info }}>进行中</div>
              <div style={{ marginTop: '0.25rem', fontSize: '1.125rem', fontWeight: 600, color: LK.info }}>{activeTaskCount}</div>
            </div>
            <div style={{ borderRadius: '0.5rem', border: `1px solid ${LK.success}`, backgroundColor: 'rgba(69, 192, 111, 0.14)', padding: '0.75rem 1rem' }}>
              <div style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.success }}>已完成</div>
              <div style={{ marginTop: '0.25rem', fontSize: '1.125rem', fontWeight: 600, color: LK.success }}>{succeededTaskCount}</div>
            </div>
            <div style={{ borderRadius: '0.5rem', border: `1px solid ${LK.error}`, backgroundColor: 'rgba(241, 93, 93, 0.14)', padding: '0.75rem 1rem' }}>
              <div style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.error }}>失败</div>
              <div style={{ marginTop: '0.25rem', fontSize: '1.125rem', fontWeight: 600, color: LK.error }}>{failedTaskCount}</div>
            </div>
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '0.5rem', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, padding: '0.625rem 0.75rem' }}>
            <Search size={16} style={{ color: LK.muted }} />
            <input
              value={taskKeyword}
              onChange={(event) => setTaskKeyword(event.target.value)}
              placeholder="筛选标题、路径或任务 ID"
              style={{ width: '100%', backgroundColor: 'transparent', fontSize: '0.875rem', fontWeight: 600, color: LK.inkSoft, outline: 'none', border: 'none' }}
            />
          </div>

          <div style={{ marginTop: '1rem', maxHeight: '840px', overflow: 'auto', paddingRight: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {tasksLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '0.5rem', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, padding: '0.75rem 1rem', fontSize: '0.875rem', fontWeight: 600, color: LK.body }}>
                <Loader2 size={16} className="animate-spin" />
                正在加载任务列表...
              </div>
            ) : filteredTasks.length === 0 ? (
              <div style={{ borderRadius: '0.5rem', border: `1px dashed ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, padding: '1rem 3rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: 600, color: LK.muted }}>
                当前没有{CATEGORY_LABELS[activeTab]}任务。
              </div>
            ) : (
              filteredTasks.map((item) => {
                const active = item.task_id === selectedTaskId;
                const deleting = deletingTaskId === item.task_id;
                const statusStyle = statusTone(item.status);
                return (
                  <div
                    key={item.task_id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleOpenTaskDetail(item.task_id)}
                    onKeyDown={(event) => { if (event.key === 'Enter') handleOpenTaskDetail(item.task_id); }}
                    style={{
                      display: 'block', width: '100%', cursor: 'pointer', borderRadius: '0.5rem',
                      border: `1px solid ${active ? LK.info : LK.border}`,
                      padding: '1rem', textAlign: 'left', transition: 'all 0.2s',
                      backgroundColor: active ? 'rgba(79, 140, 255, 0.14)' : LK.surface
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.875rem', fontWeight: 600, color: LK.ink }}>{item.title}</div>
                        <div style={{ marginTop: '0.5rem', wordBreak: 'break-all', fontFamily: MONO, fontSize: '0.6875rem', color: LK.muted }}>{item.kernel_dir || '-'}</div>
                      </div>
                      <div style={{ display: 'flex', flexShrink: 0, alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ borderRadius: '9999px', border: `1px solid ${statusStyle.borderColor}`, backgroundColor: statusStyle.backgroundColor, padding: '0 0.625rem', fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: statusStyle.color }}>
                          {formatTaskStatus(item.status)}
                        </span>
                        <button
                          type="button"
                          onClick={(event) => handleDeleteTaskById(item, event)}
                          disabled={deleting}
                          title="删除任务"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', borderRadius: '0.5rem', border: `1px solid ${LK.error}`, backgroundColor: LK.surface, padding: '0.25rem 0.5rem', fontSize: '0.6875rem', fontWeight: 600, color: LK.error, transition: 'all 0.2s', opacity: deleting ? 0.5 : 1, cursor: deleting ? 'not-allowed' : 'pointer' }}
                        >
                          {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                          删除
                        </button>
                      </div>
                    </div>
                    <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.6875rem', fontWeight: 600, color: LK.muted }}>
                      <span>{formatDateTime(item.created_at)}</span>
                    </div>
                    <div style={{ marginTop: '0.5rem', fontFamily: MONO, fontSize: '0.6875rem', color: LK.mutedSoft }}>{item.task_id}</div>
                    {activeTab === 'attack_entry' ? (() => {
                      const progress = entryProgress[item.task_id];
                      const status = String(item.status || '').toLowerCase();
                      const isQueued = status === 'queued';
                      const isRunning = status === 'running' || status === 'cancel_requested';
                      const isSucceeded = TERMINAL_SUCCESS_STATUSES.has(status);
                      const isFailed = status === 'failed';
                      const isCancelled = status === 'cancelled';

                      const pct = isSucceeded ? 100 : progress?.percent;
                      const hasPct = typeof pct === 'number' && Number.isFinite(pct);
                      const display = hasPct ? Math.round(pct as number) : null;

                      let barColor: string = LK.info;
                      let hint = '';
                      let indeterminate = false;
                      if (isSucceeded) { barColor = LK.success; hint = '已完成'; }
                      else if (isFailed) { barColor = LK.error; hint = hasPct ? '已失败' : '失败'; }
                      else if (isCancelled) { barColor = LK.muted; hint = '已取消'; }
                      else if (isQueued) { barColor = LK.primary; hint = '排队中'; }
                      else if (isRunning && !hasPct) { indeterminate = true; hint = '正在启动…'; }

                      const widthPercent = isSucceeded
                        ? 100
                        : hasPct
                          ? (display as number)
                          : 0;

                      return (
                        <div style={{ marginTop: '0.75rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.625rem', fontWeight: 600, color: LK.muted }}>
                            <span>扫描进度{hint ?` · ${hint}` : ''}</span>
                            <span style={{ fontFamily: MONO, color: LK.inkSoft }}>
                              {display !== null ?`${display}%` : '—'}
                              {progress?.current != null && progress?.total != null ?` (${progress.current}/${progress.total})` : ''}
                            </span>
                          </div>
                          <div style={{ marginTop: '0.25rem', height: '0.375rem', width: '100%', overflow: 'hidden', borderRadius: '9999px', backgroundColor: LK.borderSoft }}>
                            <div
                              style={{ height: '100%', backgroundColor: barColor, transition: 'all 0.3s', width: `${widthPercent}%`, opacity: indeterminate ? 0.5 : 1 }}
                              className={indeterminate ? 'animate-pulse' : ''}
                            />
                          </div>
                          {progress?.label && !isQueued ? (
                            <div style={{ marginTop: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: MONO, fontSize: '0.625rem', color: LK.mutedSoft }} title={progress.label}>{progress.label}</div>
                          ) : null}
                        </div>
                      );
                    })() : null}
                  </div>
                );
              })
            )}
          </div>
        </section>
      ) : (
        <section style={{ borderRadius: '2rem', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ minWidth: 0 }}>
              <button
                type="button"
                onClick={handleBackToList}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', borderRadius: '1.25rem', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, padding: '0.5rem 0.75rem', fontSize: '0.875rem', fontWeight: 600, color: LK.inkSoft, transition: 'all 0.2s' }}
              >
                <ArrowLeft size={16} />
                返回任务列表
              </button>
              <h2 style={{ marginTop: '0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '1.5rem', fontWeight: 600, color: LK.ink }}>{selectedTask?.title || '任务详情'}</h2>
              {selectedTask ? (() => {
                const statusStyle = statusTone(selectedTask.status);
                return (
                <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ borderRadius: '9999px', border: `1px solid ${statusStyle.borderColor}`, backgroundColor: statusStyle.backgroundColor, padding: '0 0.75rem', fontSize: '0.75rem', fontWeight: 600, color: statusStyle.color }}>
                    {formatTaskStatus(selectedTask.status)}
                  </span>
                  <span style={{ borderRadius: '9999px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, padding: '0 0.75rem', fontSize: '0.75rem', fontWeight: 600, color: LK.body }}>
                    {CATEGORY_LABELS[activeTab]}
                  </span>
                </div>
                );
              })() : null}
            </div>

            {selectedTask ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {ACTIVE_TASK_STATUSES.has(String(selectedTask.status || '').toLowerCase()) ? (
                  <button
                    type="button"
                    onClick={handleCancelTask}
                    disabled={actingTask}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', borderRadius: '1.25rem', border: `1px solid ${LK.error}`, backgroundColor: 'rgba(241, 93, 93, 0.14)', padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 600, color: LK.error, transition: 'all 0.2s', opacity: actingTask ? 0.5 : 1, cursor: actingTask ? 'not-allowed' : 'pointer' }}
                  >
                    {actingTask ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                    取消任务
                  </button>
                ) : null}
                {RESTARTABLE_TASK_STATUSES.has(String(selectedTask.status || '').toLowerCase()) ? (
                  <button
                    type="button"
                    onClick={handleRestartTask}
                    disabled={restartingTask}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', borderRadius: '1.25rem', border: `1px solid ${LK.info}`, backgroundColor: 'rgba(79, 140, 255, 0.14)', padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 600, color: LK.info, transition: 'all 0.2s', opacity: restartingTask ? 0.5 : 1, cursor: restartingTask ? 'not-allowed' : 'pointer' }}
                  >
                    {restartingTask ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                    重启任务
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => handleDeleteTaskById(selectedTask)}
                  disabled={deletingTaskId === selectedTask.task_id}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', borderRadius: '1.25rem', border: `1px solid ${LK.error}`, backgroundColor: LK.surface, padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 600, color: LK.error, transition: 'all 0.2s', opacity: deletingTaskId === selectedTask.task_id ? 0.5 : 1, cursor: deletingTaskId === selectedTask.task_id ? 'not-allowed' : 'pointer' }}
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
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-700 transition hover:bg-slate-100"
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
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
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
                    <div className="min-h-[320px] overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
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
                                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition ${selected ? 'bg-sky-50 text-sky-800' : 'text-slate-700 hover:bg-slate-100'}`}
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

                    <div className="min-h-[320px] overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
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
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
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
                    <pre className="max-h-[400px] overflow-auto whitespace-pre-wrap break-all rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-800">
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
 <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
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
                  placeholder={activeTab === 'vuln_verify' ? '留空则按报告目录自动生成' :`输入${CATEGORY_LABELS[activeTab]}任务标题`}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
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
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
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
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
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
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
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
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
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
                  className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
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
 <div className="flex h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
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
                          className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
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
                          className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
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
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowPathPicker(false)}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPath(browsePath)}
                      className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-800"
                    >
                      选择当前目录
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowPathPicker(false)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
                  >
                    取消
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
