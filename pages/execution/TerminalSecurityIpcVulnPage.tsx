import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FolderSearch,
  Play,
  Plus,
  RefreshCw,
  Search,
  Target,
  Terminal,
} from 'lucide-react';

import { showConfirm } from '../../components/DialogService';
import { useUiFeedback } from '../../components/UiFeedback';
import {
  ProjectFilesystemPickerModal,
  ProjectFilesystemSelection,
} from '../../components/assets/ProjectFilesystemPickerModal';

interface TerminalSecurityIpcVulnPageProps {
  projectId: string;
}

type IpcTaskStatus = 'draft' | 'queued' | 'running' | 'completed' | 'failed' | 'archived';
type IpcTargetMode = 'file' | 'directory';
type IpcScanProfile = 'fast' | 'balanced' | 'deep';
type IpcScanScope = 'service' | 'system_ability' | 'mixed';
type FilterStatus = 'all' | IpcTaskStatus;
type StageState = 'pending' | 'active' | 'done' | 'failed' | 'muted';

interface IpcVulnTask {
  id: string;
  title: string;
  targetPath: string;
  targetName: string;
  targetMode: IpcTargetMode;
  scanProfile: IpcScanProfile;
  scanScope: IpcScanScope;
  status: IpcTaskStatus;
  outputPath: string;
  notes: string;
  findingsCount: number;
  highRiskCount: number;
  createdAt: string;
  updatedAt: string;
  queuedAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  lastMessage: string;
}

interface CreateFormState {
  title: string;
  targetPath: string;
  targetName: string;
  targetMode: IpcTargetMode;
  scanProfile: IpcScanProfile;
  scanScope: IpcScanScope;
  outputPath: string;
  notes: string;
  autoQueue: boolean;
}

const STORAGE_KEY_PREFIX = 'secflow:terminalSecurity:ipcTasks:';

const STATUS_LABELS: Record<IpcTaskStatus, string> = {
  draft: '草稿',
  queued: '待扫描',
  running: '扫描中',
  completed: '已完成',
  failed: '失败',
  archived: '已归档',
};

const PROFILE_LABELS: Record<IpcScanProfile, string> = {
  fast: '快速探测',
  balanced: '平衡模式',
  deep: '深度审计',
};

const SCOPE_LABELS: Record<IpcScanScope, string> = {
  service: '普通 Service',
  system_ability: 'System Ability',
  mixed: '混合目标',
};

const TARGET_MODE_LABELS: Record<IpcTargetMode, string> = {
  file: '单文件',
  directory: '目录',
};

const EMPTY_FORM: CreateFormState = {
  title: '',
  targetPath: '',
  targetName: '',
  targetMode: 'directory',
  scanProfile: 'balanced',
  scanScope: 'system_ability',
  outputPath: '',
  notes: '',
  autoQueue: true,
};

const stageDefinitions = [
  { id: 'target', label: '目标采集', detail: '识别 SA/Service/Stub/Proxy 入口与目标文件集。' },
  { id: 'extract', label: 'IPC 抽取', detail: '提取事务码、Parcel 读写和接口路由关系。' },
  { id: 'trace', label: '调用追踪', detail: '补足跨类、跨模块调用链与危险参数传播。' },
  { id: 'review', label: '漏洞研判', detail: '输出高风险点、复现上下文和审计建议。' },
];

const buildStorageKey = (projectId: string) => `${STORAGE_KEY_PREFIX}${projectId || 'default'}`;

const sortTasks = (tasks: IpcVulnTask[]) => (
  [...tasks].sort((a, b) => {
    const aTime = new Date(a.updatedAt || a.createdAt).getTime();
    const bTime = new Date(b.updatedAt || b.createdAt).getTime();
    return bTime - aTime;
  })
);

const isTaskStatus = (value: string): value is IpcTaskStatus => (
  value === 'draft'
  || value === 'queued'
  || value === 'running'
  || value === 'completed'
  || value === 'failed'
  || value === 'archived'
);

const isTargetMode = (value: string): value is IpcTargetMode => value === 'file' || value === 'directory';
const isScanProfile = (value: string): value is IpcScanProfile => value === 'fast' || value === 'balanced' || value === 'deep';
const isScanScope = (value: string): value is IpcScanScope => value === 'service' || value === 'system_ability' || value === 'mixed';

const loadTasksFromStorage = (projectId: string): IpcVulnTask[] => {
  if (!projectId) return [];
  try {
    const raw = localStorage.getItem(buildStorageKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const tasks = parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const id = typeof item.id === 'string' ? item.id.trim() : '';
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      const targetPath = typeof item.targetPath === 'string' ? item.targetPath.trim() : '';
      const targetName = typeof item.targetName === 'string' ? item.targetName.trim() : '';
      const outputPath = typeof item.outputPath === 'string' ? item.outputPath.trim() : '';
      const notes = typeof item.notes === 'string' ? item.notes : '';
      const lastMessage = typeof item.lastMessage === 'string' ? item.lastMessage : '';
      const createdAt = typeof item.createdAt === 'string' ? item.createdAt : '';
      const updatedAt = typeof item.updatedAt === 'string' ? item.updatedAt : createdAt;
      if (!id || !title || !targetPath || !createdAt || !updatedAt) return [];

      const status = isTaskStatus(String(item.status || '')) ? item.status : 'draft';
      const targetMode = isTargetMode(String(item.targetMode || '')) ? item.targetMode : 'directory';
      const scanProfile = isScanProfile(String(item.scanProfile || '')) ? item.scanProfile : 'balanced';
      const scanScope = isScanScope(String(item.scanScope || '')) ? item.scanScope : 'system_ability';
      const findingsCount = Number.isFinite(item.findingsCount) ? Number(item.findingsCount) : 0;
      const highRiskCount = Number.isFinite(item.highRiskCount) ? Number(item.highRiskCount) : 0;

      return [{
        id,
        title,
        targetPath,
        targetName: targetName || targetPath.split('/').filter(Boolean).pop() || targetPath,
        targetMode,
        scanProfile,
        scanScope,
        status,
        outputPath,
        notes,
        findingsCount,
        highRiskCount,
        createdAt,
        updatedAt,
        queuedAt: typeof item.queuedAt === 'string' ? item.queuedAt : null,
        startedAt: typeof item.startedAt === 'string' ? item.startedAt : null,
        finishedAt: typeof item.finishedAt === 'string' ? item.finishedAt : null,
        lastMessage: lastMessage || '本地任务记录已恢复。',
      }];
    });
    return sortTasks(tasks);
  } catch {
    return [];
  }
};

const persistTasksToStorage = (projectId: string, tasks: IpcVulnTask[]) => {
  if (!projectId) return;
  localStorage.setItem(buildStorageKey(projectId), JSON.stringify(sortTasks(tasks)));
};

const formatTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const generateTaskId = () => {
  const base = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().slice(0, 8)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `ipc-${base}`;
};

const statusTone = (status: IpcTaskStatus) => {
  switch (status) {
    case 'draft':
      return 'border-slate-200 bg-slate-100 text-slate-700';
    case 'queued':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'running':
      return 'border-sky-200 bg-sky-50 text-sky-700';
    case 'completed':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'failed':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'archived':
      return 'border-slate-200 bg-slate-50 text-slate-500';
    default:
      return 'border-slate-200 bg-slate-100 text-slate-700';
  }
};

const resolveStageState = (task: IpcVulnTask, stageId: string): StageState => {
  if (task.status === 'archived') return 'muted';
  if (task.status === 'draft') return 'pending';
  if (task.status === 'queued') {
    return stageId === 'target' ? 'active' : 'pending';
  }
  if (task.status === 'running') {
    if (stageId === 'target') return 'done';
    if (stageId === 'extract') return 'active';
    return 'pending';
  }
  if (task.status === 'completed') return 'done';
  if (task.status === 'failed') {
    if (stageId === 'target') return 'done';
    if (stageId === 'extract' || stageId === 'trace') return 'failed';
    return 'pending';
  }
  return 'pending';
};

const stageTone = (state: StageState) => {
  switch (state) {
    case 'active':
      return 'border-sky-200 bg-sky-50 text-sky-700';
    case 'done':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'failed':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'muted':
      return 'border-slate-200 bg-slate-50 text-slate-400';
    default:
      return 'border-slate-200 bg-white text-slate-500';
  }
};

const buildDefaultOutputPath = (projectId: string, title: string) => {
  const normalized = title.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-_]/g, '').toLowerCase();
  const suffix = normalized || `ipc-${Date.now()}`;
  return `/data/files/${projectId}/terminal-security/ipc-vuln/${suffix}`;
};

const openProjectPath = (path: string) => {
  if (!path) return;
  window.dispatchEvent(new CustomEvent('secflow-navigate-view', {
    detail: {
      view: 'project-file-explorer',
      path,
    },
  }));
};

const StatCard: React.FC<{
  label: string;
  value: string | number;
  hint: string;
  icon: React.ReactNode;
}> = ({ label, value, hint, icon }) => (
  <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
    <div className="flex items-center justify-between">
      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className="text-slate-300">{icon}</div>
    </div>
    <div className="mt-4 text-3xl font-black tracking-tight text-slate-900">{value}</div>
    <div className="mt-2 text-sm font-medium text-slate-500">{hint}</div>
  </div>
);

const TaskActionButton: React.FC<{
  onClick: () => void;
  label: string;
  tone?: 'primary' | 'neutral' | 'danger';
}> = ({ onClick, label, tone = 'neutral' }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-2xl px-4 py-2.5 text-sm font-bold transition-all ${
      tone === 'primary'
        ? 'bg-sky-600 text-white hover:bg-sky-700'
        : tone === 'danger'
          ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
    }`}
  >
    {label}
  </button>
);

export const TerminalSecurityIpcVulnPage: React.FC<TerminalSecurityIpcVulnPageProps> = ({ projectId }) => {
  const { notify, feedbackNodes } = useUiFeedback();
  const [tasks, setTasks] = useState<IpcVulnTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState<CreateFormState>(EMPTY_FORM);

  useEffect(() => {
    const next = loadTasksFromStorage(projectId);
    setTasks(next);
    setSelectedTaskId((current) => {
      if (current && next.some((task) => task.id === current)) return current;
      return next[0]?.id || '';
    });
  }, [projectId]);

  const saveTasks = (nextTasks: IpcVulnTask[]) => {
    const normalized = sortTasks(nextTasks);
    persistTasksToStorage(projectId, normalized);
    setTasks(normalized);
    setSelectedTaskId((current) => {
      if (current && normalized.some((task) => task.id === current)) return current;
      return normalized[0]?.id || '';
    });
  };

  const refreshFromStorage = async () => {
    setRefreshing(true);
    const next = loadTasksFromStorage(projectId);
    setTasks(next);
    setSelectedTaskId((current) => {
      if (current && next.some((task) => task.id === current)) return current;
      return next[0]?.id || '';
    });
    window.setTimeout(() => setRefreshing(false), 220);
  };

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) || null,
    [selectedTaskId, tasks]
  );

  const filteredTasks = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return tasks.filter((task) => {
      if (statusFilter !== 'all' && task.status !== statusFilter) return false;
      if (!keyword) return true;
      return [
        task.id,
        task.title,
        task.targetPath,
        task.targetName,
        task.notes,
        STATUS_LABELS[task.status],
        PROFILE_LABELS[task.scanProfile],
      ].some((field) => String(field || '').toLowerCase().includes(keyword));
    });
  }, [tasks, searchTerm, statusFilter]);

  const stats = useMemo(() => ({
    total: tasks.length,
    queued: tasks.filter((task) => task.status === 'queued').length,
    running: tasks.filter((task) => task.status === 'running').length,
    completed: tasks.filter((task) => task.status === 'completed').length,
  }), [tasks]);

  const resetForm = () => setForm({
    ...EMPTY_FORM,
    outputPath: projectId ? buildDefaultOutputPath(projectId, '') : '',
  });

  const openCreateModal = () => {
    resetForm();
    setCreateOpen(true);
  };

  const handleSelectPath = (selection: ProjectFilesystemSelection) => {
    const targetMode = selection.node_type === 'file' ? 'file' : 'directory';
    setForm((current) => {
      const titleFallback = current.title.trim()
        ? current.title
        : `ipc-${selection.name || selection.path.split('/').filter(Boolean).pop() || 'scan'}`;
      return {
        ...current,
        title: titleFallback,
        targetPath: selection.path,
        targetName: selection.name,
        targetMode,
        outputPath: current.outputPath.trim() || buildDefaultOutputPath(projectId, titleFallback),
      };
    });
    setPickerOpen(false);
  };

  const handleCreateTask = () => {
    if (!projectId) {
      notify('请先选择项目后再创建 IPC 扫描任务。', 'warning');
      return;
    }
    if (!form.title.trim()) {
      notify('任务名称不能为空。', 'error');
      return;
    }
    if (!form.targetPath.trim()) {
      notify('请先选择扫描目标。', 'error');
      return;
    }
    const now = new Date().toISOString();
    const initialStatus: IpcTaskStatus = form.autoQueue ? 'queued' : 'draft';
    const nextTask: IpcVulnTask = {
      id: generateTaskId(),
      title: form.title.trim(),
      targetPath: form.targetPath.trim(),
      targetName: form.targetName.trim() || form.targetPath.trim().split('/').filter(Boolean).pop() || form.targetPath.trim(),
      targetMode: form.targetMode,
      scanProfile: form.scanProfile,
      scanScope: form.scanScope,
      status: initialStatus,
      outputPath: (form.outputPath.trim() || buildDefaultOutputPath(projectId, form.title)).trim(),
      notes: form.notes.trim(),
      findingsCount: 0,
      highRiskCount: 0,
      createdAt: now,
      updatedAt: now,
      queuedAt: form.autoQueue ? now : null,
      startedAt: null,
      finishedAt: null,
      lastMessage: form.autoQueue
        ? '任务已进入本地等待队列。后续接入后端后可替换为真实调度状态。'
        : '任务已保存为本地草稿，等待进一步配置。',
    };
    saveTasks([nextTask, ...tasks]);
    setSelectedTaskId(nextTask.id);
    setCreateOpen(false);
    notify(`已创建 IPC 扫描任务 ${nextTask.id}。`, 'success');
  };

  const updateTask = (taskId: string, updater: (task: IpcVulnTask) => IpcVulnTask) => {
    const next = tasks.map((task) => task.id === taskId ? updater(task) : task);
    saveTasks(next);
  };

  const queueTask = (taskId: string) => {
    const now = new Date().toISOString();
    updateTask(taskId, (task) => ({
      ...task,
      status: 'queued',
      queuedAt: now,
      startedAt: null,
      finishedAt: null,
      updatedAt: now,
      lastMessage: '任务已进入本地队列，等待后端 IPC 扫描调度接入。',
    }));
    notify('任务已加入队列。', 'success');
  };

  const startTask = (taskId: string) => {
    const now = new Date().toISOString();
    updateTask(taskId, (task) => ({
      ...task,
      status: 'running',
      startedAt: now,
      finishedAt: null,
      updatedAt: now,
      lastMessage: '已切换为扫描中状态。当前仍为前端骨架，不会触发真实扫描。',
    }));
    notify('任务已切换为扫描中。', 'success');
  };

  const completeTask = (taskId: string) => {
    const now = new Date().toISOString();
    updateTask(taskId, (task) => ({
      ...task,
      status: 'completed',
      finishedAt: now,
      updatedAt: now,
      lastMessage: '任务已标记为完成。当前模块尚未接入真实报告与漏洞结果。',
    }));
    notify('任务已标记完成。', 'success');
  };

  const failTask = (taskId: string) => {
    const now = new Date().toISOString();
    updateTask(taskId, (task) => ({
      ...task,
      status: 'failed',
      finishedAt: now,
      updatedAt: now,
      lastMessage: '任务已标记为失败。后续可在这里挂接真实错误信息与重试入口。',
    }));
    notify('任务已标记失败。', 'warning');
  };

  const archiveTask = (taskId: string) => {
    const now = new Date().toISOString();
    updateTask(taskId, (task) => ({
      ...task,
      status: 'archived',
      updatedAt: now,
      lastMessage: '任务已归档，仅保留前端本地记录。',
    }));
    notify('任务已归档。', 'success');
  };

  const removeTask = async (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    const confirmed = await showConfirm({
      title: '删除本地任务',
      message: `确认删除任务「${task.title}」吗？\n\n当前 IPC 模块还未接入后端，删除动作只会清理浏览器本地记录。`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    const next = tasks.filter((item) => item.id !== taskId);
    saveTasks(next);
    notify('本地任务已删除。', 'success');
  };

  return (
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-8 py-8">
        <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          <div className="bg-[linear-gradient(135deg,rgba(15,23,42,1)_0%,rgba(30,41,59,1)_58%,rgba(14,116,144,0.95)_100%)] px-8 py-10 text-white">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.24em] text-sky-100">
              <Terminal size={14} />
              终端安全
            </div>
            <div className="mt-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h1 className="text-3xl font-black tracking-tight">IPC漏洞扫描</h1>
                <p className="mt-3 max-w-3xl text-sm font-medium leading-7 text-slate-200">
                  当前已补齐前端模块骨架：支持本地任务创建、筛选、详情查看和目标路径选择。后续接入后端时，可以直接把本地存储替换为真实 API。
                </p>
              </div>
              <div className="rounded-[1.5rem] bg-white/10 px-5 py-4 backdrop-blur-sm">
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-sky-100">当前项目</div>
                <div className="mt-2 font-mono text-sm font-semibold text-white break-all">{projectId || '-'}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-amber-200 bg-amber-50 px-6 py-5 text-amber-800 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-black">当前为前端原型模块</div>
              <div className="mt-1 text-sm font-medium leading-7">
                任务记录暂时保存在当前浏览器本地，不会触发真实 IPC 扫描。后续只需补 `client` 和后端接口，即可把本页切换为正式模块。
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="本地任务" value={stats.total} hint="当前项目下保存的 IPC 模块任务" icon={<Target size={22} />} />
          <StatCard label="待扫描" value={stats.queued} hint="可直接映射到后端等待队列" icon={<ChevronRight size={22} />} />
          <StatCard label="扫描中" value={stats.running} hint="用于预留真实执行态与进度条" icon={<RefreshCw size={22} />} />
          <StatCard label="已完成" value={stats.completed} hint="后续可承接报告、PoC 和结果回链" icon={<CheckCircle2 size={22} />} />
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(340px,0.95fr)]">
          <div className="space-y-5">
            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <div className="relative flex-1">
                  <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="搜索任务 ID、任务名称、目标路径..."
                    className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm font-medium text-slate-700 outline-none ring-0 transition-all focus:border-sky-300 focus:shadow-[0_0_0_4px_rgba(14,165,233,0.08)]"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as FilterStatus)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none"
                >
                  <option value="all">全部状态</option>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => void refreshFromStorage()}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50"
                >
                  <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                  刷新
                </button>

                <button
                  type="button"
                  onClick={openCreateModal}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-600 px-5 py-3 text-sm font-black text-white transition-all hover:bg-sky-700"
                >
                  <Plus size={16} />
                  新建扫描任务
                </button>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Task Queue</div>
                  <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900">IPC 扫描任务列表</h2>
                </div>
                <div className="text-sm font-semibold text-slate-500">匹配到 {filteredTasks.length} 个任务</div>
              </div>

              <div className="divide-y divide-slate-100">
                {filteredTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-slate-400">
                      <FolderSearch size={28} />
                    </div>
                    <div className="mt-5 text-xl font-black tracking-tight text-slate-900">当前没有匹配的 IPC 扫描任务</div>
                    <div className="mt-2 max-w-xl text-sm font-medium leading-7 text-slate-500">
                      可以直接创建一个本地任务草稿，用来承接后续的 SA 入口扫描、Parcel 解析审计和漏洞研判流程。
                    </div>
                    <button
                      type="button"
                      onClick={openCreateModal}
                      className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-sky-600 px-5 py-3 text-sm font-black text-white hover:bg-sky-700"
                    >
                      <Plus size={16} />
                      创建第一个任务
                    </button>
                  </div>
                ) : (
                  filteredTasks.map((task) => {
                    const active = task.id === selectedTaskId;
                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => setSelectedTaskId(task.id)}
                        className={`w-full px-6 py-5 text-left transition-all ${
                          active ? 'bg-sky-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                                {task.id}
                              </span>
                              <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] ${statusTone(task.status)}`}>
                                {STATUS_LABELS[task.status]}
                              </span>
                              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold text-slate-500">
                                {PROFILE_LABELS[task.scanProfile]}
                              </span>
                            </div>

                            <div className="mt-3 text-lg font-black tracking-tight text-slate-900">{task.title}</div>
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm font-medium text-slate-500">
                              <span>{SCOPE_LABELS[task.scanScope]}</span>
                              <span className="text-slate-300">/</span>
                              <span>{TARGET_MODE_LABELS[task.targetMode]}</span>
                            </div>
                            <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
                              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Target Path</div>
                              <div className="mt-1 break-all font-mono text-[13px]">{task.targetPath}</div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 xl:w-[250px]">
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">创建时间</div>
                              <div className="mt-2 text-sm font-semibold text-slate-700">{formatTime(task.createdAt)}</div>
                            </div>
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">最近更新</div>
                              <div className="mt-2 text-sm font-semibold text-slate-700">{formatTime(task.updatedAt)}</div>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <aside className="rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Task Detail</div>
              <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900">任务详情</h2>
            </div>

            {!selectedTask ? (
              <div className="px-6 py-10 text-sm font-medium leading-7 text-slate-500">
                当前还没有选中任务。左侧创建或选择一个 IPC 扫描任务后，这里会展示路径、阶段、输出目录和后续接后端时需要保留的上下文。
              </div>
            ) : (
              <div className="space-y-6 px-6 py-6">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] ${statusTone(selectedTask.status)}`}>
                      {STATUS_LABELS[selectedTask.status]}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                      {PROFILE_LABELS[selectedTask.scanProfile]}
                    </span>
                  </div>
                  <div className="text-2xl font-black tracking-tight text-slate-900">{selectedTask.title}</div>
                  <div className="text-sm font-medium text-slate-500">任务 ID: <span className="font-mono text-slate-700">{selectedTask.id}</span></div>
                </div>

                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">扫描目标</div>
                  <button
                    type="button"
                    onClick={() => openProjectPath(selectedTask.targetPath)}
                    className="mt-3 block break-all text-left font-mono text-[13px] font-semibold text-sky-700 hover:text-sky-800"
                  >
                    {selectedTask.targetPath}
                  </button>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white bg-white px-4 py-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">目标类型</div>
                      <div className="mt-2 text-sm font-semibold text-slate-700">{TARGET_MODE_LABELS[selectedTask.targetMode]}</div>
                    </div>
                    <div className="rounded-2xl border border-white bg-white px-4 py-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">扫描范围</div>
                      <div className="mt-2 text-sm font-semibold text-slate-700">{SCOPE_LABELS[selectedTask.scanScope]}</div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">执行阶段</div>
                  <div className="mt-3 space-y-3">
                    {stageDefinitions.map((stage) => {
                      const state = resolveStageState(selectedTask, stage.id);
                      return (
                        <div key={stage.id} className={`rounded-2xl border px-4 py-3 ${stageTone(state)}`}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-black">{stage.label}</div>
                            <div className="text-[10px] font-black uppercase tracking-[0.18em]">
                              {state === 'done' ? 'Done' : state === 'active' ? 'Active' : state === 'failed' ? 'Failed' : state === 'muted' ? 'Archived' : 'Pending'}
                            </div>
                          </div>
                          <div className="mt-1 text-sm font-medium opacity-90">{stage.detail}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">输出目录</div>
                    <div className="mt-2 break-all font-mono text-[13px] font-semibold text-slate-700">{selectedTask.outputPath || '-'}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">最近状态</div>
                    <div className="mt-2 text-sm font-medium leading-7 text-slate-600">{selectedTask.lastMessage}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">备注</div>
                    <div className="mt-2 text-sm font-medium leading-7 text-slate-600">{selectedTask.notes || '暂无备注'}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">创建时间</div>
                    <div className="mt-2 text-sm font-semibold text-slate-700">{formatTime(selectedTask.createdAt)}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">结束时间</div>
                    <div className="mt-2 text-sm font-semibold text-slate-700">{formatTime(selectedTask.finishedAt)}</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  {selectedTask.status === 'draft' ? (
                    <TaskActionButton onClick={() => queueTask(selectedTask.id)} label="加入队列" tone="primary" />
                  ) : null}
                  {selectedTask.status === 'queued' ? (
                    <TaskActionButton onClick={() => startTask(selectedTask.id)} label="标记扫描中" tone="primary" />
                  ) : null}
                  {selectedTask.status === 'running' ? (
                    <>
                      <TaskActionButton onClick={() => completeTask(selectedTask.id)} label="标记完成" tone="primary" />
                      <TaskActionButton onClick={() => failTask(selectedTask.id)} label="标记失败" />
                    </>
                  ) : null}
                  {(selectedTask.status === 'completed' || selectedTask.status === 'failed' || selectedTask.status === 'archived') ? (
                    <TaskActionButton onClick={() => queueTask(selectedTask.id)} label="重新排队" />
                  ) : null}
                  {selectedTask.status !== 'archived' ? (
                    <TaskActionButton onClick={() => archiveTask(selectedTask.id)} label="归档" />
                  ) : null}
                  <TaskActionButton onClick={() => void removeTask(selectedTask.id)} label="删除" tone="danger" />
                </div>
              </div>
            )}
          </aside>
        </section>
      </div>

      {createOpen ? (
        <div className="fixed inset-0 z-[280] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-8 py-6">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-sky-600">Terminal Security</div>
                <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-900">新建 IPC 扫描任务</h3>
                <p className="mt-2 text-sm font-medium text-slate-500">
                  先把前端需要的任务字段固定下来，后面后端只要按这些字段回传即可平滑接入。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                关闭
              </button>
            </div>

            <div className="space-y-6 overflow-y-auto px-8 py-6">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <label className="block">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">任务名称</div>
                  <input
                    value={form.title}
                    onChange={(event) => {
                      const title = event.target.value;
                      setForm((current) => ({
                        ...current,
                        title,
                        outputPath: current.outputPath.trim() ? current.outputPath : buildDefaultOutputPath(projectId, title),
                      }));
                    }}
                    placeholder="例如：ohos-telephony-ipc-scan"
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:border-sky-300"
                  />
                </label>

                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-5 py-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">任务说明</div>
                  <div className="mt-2 text-sm font-medium leading-7 text-slate-500">
                    新建任务时仅保留核心字段，系统按默认 IPC 扫描流程处理；路径选择时可直接选文件或目录。
                  </div>
                </div>
              </div>

              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">扫描目标</div>
                <div className="mt-2 flex flex-col gap-3 md:flex-row">
                  <div className="min-h-[52px] flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-[13px] font-semibold text-slate-700 break-all">
                    {form.targetPath || '请选择项目文件中的目录或文件'}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white hover:bg-slate-800"
                  >
                    选择路径
                  </button>
                </div>
                {form.targetName ? (
                  <div className="mt-2 text-sm font-medium text-slate-500">当前目标: {form.targetName}</div>
                ) : null}
              </div>

              <label className="block">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">输出目录</div>
                <input
                  value={form.outputPath}
                  onChange={(event) => setForm((current) => ({ ...current, outputPath: event.target.value }))}
                  placeholder={`/data/files/${projectId}/terminal-security/ipc-vuln/...`}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-mono text-[13px] font-semibold text-slate-700 outline-none focus:border-sky-300"
                />
              </label>

              <label className="block">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">备注 / 扫描目标说明</div>
                <textarea
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="例如：聚焦 OnRemoteRequest、MessageParcel 解析、事务码分发、IPC 参数长度校验。"
                  rows={5}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium leading-7 text-slate-700 outline-none focus:border-sky-300"
                />
              </label>

              <label className="flex items-start gap-3 rounded-[1.5rem] border border-slate-200 bg-white px-5 py-4">
                <input
                  type="checkbox"
                  checked={form.autoQueue}
                  onChange={(event) => setForm((current) => ({ ...current, autoQueue: event.target.checked }))}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-600"
                />
                <div>
                  <div className="text-sm font-black text-slate-900">创建后直接加入队列</div>
                  <div className="mt-1 text-sm font-medium leading-6 text-slate-500">
                    当前只切换前端状态，不会触发真实执行。后续接后端时，可以把这个选项直接映射到任务提交行为。
                  </div>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-8 py-5">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleCreateTask}
                className="inline-flex items-center gap-2 rounded-2xl bg-sky-600 px-5 py-3 text-sm font-black text-white hover:bg-sky-700"
              >
                <Play size={16} />
                创建任务
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ProjectFilesystemPickerModal
        isOpen={pickerOpen}
        projectId={projectId}
        selectionMode="any"
        title="选择 IPC 扫描目标"
        description="可直接选择项目文件中的目录或文件。"
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelectPath}
      />

      {feedbackNodes}
    </div>
  );
};
