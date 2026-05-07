import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileCode2,
  FileSearch,
  FolderOpen,
  Gauge,
  GitBranch,
  History,
  Layers,
  Loader2,
  PauseCircle,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ServerCog,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  TerminalSquare,
  UploadCloud,
  X,
  XCircle,
} from 'lucide-react';

import { api } from '../../clients/api';
import {
  DataflowInputRef,
  DataflowProfileConfigPayload,
  DataflowScanProfile,
  DataflowScanTask,
  DataflowScanTaskAttempt,
  DataflowScanTaskDetail,
  DataflowScanTaskEvent,
  DataflowTaskRun,
  DataflowRunFile,
  DataflowSchedulerWorker,
  DataflowTaskArtifacts,
} from '../../clients/dataflowVulnScanner';
import {
  DEFAULT_DATAFLOW_FILESERVER_RUNS_ROOT,
  DataflowFileserverRunDetail,
  DataflowFileserverRunSummary,
  inspectDataflowFileserverRun,
} from '../../clients/dataflowVulnRunsFileserver';
import { ProjectFilesystemPickerModal } from '../../components/assets/ProjectFilesystemPickerModal';
import { useUiFeedback } from '../../components/UiFeedback';
import { DataflowFileserverRunDashboardPage } from './DataflowFileserverRunDashboardPage';

const STATUS_META: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  pending: { label: '待调度', className: 'bg-slate-100 text-slate-700 border-slate-200', icon: <Clock size={13} /> },
  queued: { label: '排队中', className: 'bg-sky-50 text-sky-700 border-sky-200', icon: <Clock size={13} /> },
  running: { label: '运行中', className: 'bg-cyan-50 text-cyan-700 border-cyan-200', icon: <Activity size={13} /> },
  cancel_requested: { label: '取消中', className: 'bg-amber-50 text-amber-700 border-amber-200', icon: <PauseCircle size={13} /> },
  succeeded: { label: '已成功', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle2 size={13} /> },
  completed: { label: '已完成', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle2 size={13} /> },
  failed: { label: '失败', className: 'bg-rose-50 text-rose-700 border-rose-200', icon: <XCircle size={13} /> },
  cancelled: { label: '已取消', className: 'bg-zinc-100 text-zinc-700 border-zinc-200', icon: <X size={13} /> },
  orphaned: { label: '孤儿任务', className: 'bg-orange-50 text-orange-700 border-orange-200', icon: <AlertTriangle size={13} /> },
};

const EVENT_LEVEL_CLASS: Record<string, string> = {
  info: 'bg-slate-100 text-slate-600 border-slate-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  error: 'bg-rose-50 text-rose-700 border-rose-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const THINKING_OPTIONS = ['low', 'medium', 'high', 'xhigh'];
const REVIEW_PROFILE_OPTIONS = [
  { value: 'fast', label: '快速筛选' },
  { value: 'balanced', label: '平衡默认' },
  { value: 'strict', label: '正式报告' },
  { value: 'audit', label: '审计闭环' },
];
const TEMPLATE_OPTIONS = [
  { value: 'vuln_scan_default', label: '单阶段漏洞挖掘' },
  { value: 'full_pipeline', label: '完整分析流水线' },
];
const FORM_INPUT_CLASS = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-cyan-600';
type DataflowDetailTab = 'overview' | 'runs' | 'events' | 'attempts' | 'artifacts' | 'input';

const defaultConfigPayload = (): DataflowProfileConfigPayload => ({
  model: 'icsl/zai-org/GLM-5',
  thinking: 'high',
  review_profile: 'balanced',
  max_review_cycles: 6,
  worker_timeout: 3600,
  advisor_timeout: 3600,
  result_review_concurrency: 3,
  runtime_overrides: {},
});

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const formatEpochTime = (epoch?: number | null) => {
  if (!epoch || !Number.isFinite(epoch)) return '-';
  return formatDateTime(new Date(epoch * 1000).toISOString());
};

const formatDuration = (start?: string | null, end?: string | null) => {
  if (!start) return '-';
  const begin = new Date(start).getTime();
  const finish = end ? new Date(end).getTime() : Date.now();
  if (!Number.isFinite(begin) || !Number.isFinite(finish) || finish < begin) return '-';
  const seconds = Math.floor((finish - begin) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
};

const formatSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
};

const formatSeconds = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '-';
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
};

const shortId = (value?: string | null, size = 12) => {
  const text = String(value || '');
  return text.length > size ? `${text.slice(0, size)}...` : text || '-';
};

const isPlainObject = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const formatMilliseconds = (value?: number | null) => {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms <= 0) return '-';
  if (ms < 1000) return `${Math.floor(ms)}ms`;
  return formatSeconds(ms / 1000);
};

const sessionKindLabel = (kind?: string | null) => {
  if (kind === 'worker') return 'Worker';
  if (kind === 'global_review') return 'Global Review';
  if (kind === 'result_review') return 'Result Review';
  return 'Session';
};

const normalizeProjectPath = (value: string) => {
  const parts = String(value || '').trim().split('/').filter(Boolean);
  return parts.length ? `/${parts.join('/')}` : '/';
};

const isPathWithin = (base: string, target: string) => {
  const normalizedBase = normalizeProjectPath(base);
  const normalizedTarget = normalizeProjectPath(target);
  if (normalizedBase === '/') return true;
  return normalizedTarget === normalizedBase || normalizedTarget.startsWith(`${normalizedBase}/`);
};

const buildProjectFilesystemRef = (path: string): DataflowInputRef => ({
  source: 'project_filesystem',
  path: normalizeProjectPath(path),
  filename: normalizeProjectPath(path).split('/').filter(Boolean).pop() || undefined,
});

const parseJsonObject = (value: string, label: string) => {
  const trimmed = value.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`${label} 必须是 JSON 对象`);
  }
  return parsed;
};

const normalizeConfigPayload = (value?: Partial<DataflowProfileConfigPayload> | null): DataflowProfileConfigPayload => ({
  ...defaultConfigPayload(),
  ...(value || {}),
  runtime_overrides: value?.runtime_overrides || {},
});

const isoFromEpoch = (epoch?: number | null) => {
  if (!epoch || !Number.isFinite(epoch)) return null;
  return new Date(epoch * 1000).toISOString();
};

const fileserverTaskId = (runName: string) => `fileserver:${runName}`;
const isSyntheticFileserverTaskId = (value?: string | null) => String(value || '').startsWith('fileserver:');

const buildFileserverSyntheticTask = (
  projectId: string,
  run: DataflowFileserverRunDetail,
  runsRootPath: string
): DataflowScanTaskDetail => {
  const startedAt = isoFromEpoch(run.start_epoch);
  const finishedAt = run.status === 'running' ? null : isoFromEpoch((run.start_epoch || 0) + (run.duration_seconds || 0));
  const summaryText = typeof run.raw?.summary_markdown === 'string' && run.raw.summary_markdown.trim()
    ? run.raw.summary_markdown
    : '';
  const taskMarkdown = typeof run.raw?.task_markdown === 'string' && run.raw.task_markdown.trim()
    ? run.raw.task_markdown
    : summaryText || `# 历史 Run\n\n- Run: ${run.name}\n- Root: ${runsRootPath}\n- Atomic: ${run.atomic_work_path || '-'}`;

  return {
    task_id: fileserverTaskId(run.name),
    project_id: projectId,
    profile_id: 'fileserver-history',
    profile_version: 0,
    status: run.status,
    latest_attempt_no: 1,
    retry_count: 0,
    max_retry_count: 0,
    priority: 0,
    created_by: 'history-runs',
    created_at: startedAt || new Date().toISOString(),
    started_at: startedAt,
    finished_at: finishedAt,
    message: `历史 Run：${run.name}`,
    latest_execution_id: run.name,
    title: run.name,
    task_markdown: taskMarkdown,
    artifact_refs: [],
    runtime_overrides: {},
    task_metadata: {
      source: 'history_runs',
      runs_root_path: runsRootPath,
      atomic_work_path: run.atomic_work_path,
      files_count: run.files.length,
      sessions_count: run.sessions.length,
      latest_issues_count: run.latest_issues.length,
      summary_markdown: summaryText,
      raw: run.raw,
    },
    attempts: [
      {
        execution_id: run.name,
        task_id: fileserverTaskId(run.name),
        attempt_no: 1,
        status: run.status,
        history_run_id: run.history_run_id || null,
        owner_pod_id: null,
        lease_expires_at: null,
        started_at: startedAt,
        finished_at: finishedAt,
        recovery_reason: null,
        message: `读取历史 Run 目录 ${run.name}`,
        workspace_root: run.atomic_work_path || run.path,
        output_manifest_path: '',
        output_task_count: run.result_count,
        created_at: startedAt || new Date().toISOString(),
        updated_at: finishedAt || run.last_activity || startedAt || new Date().toISOString(),
      },
    ],
  };
};

const buildFileserverRunDetailPlaceholder = (
  projectId: string,
  runName: string,
  runRootPath: string,
  summary?: Partial<DataflowFileserverRunSummary> | null
): DataflowFileserverRunDetail => ({
  history_run_id: String(summary?.history_run_id || ''),
  project_id: projectId,
  source_type: String(summary?.source_type || 'legacy_runs_root'),
  source_key: String(summary?.source_key || `${normalizeProjectPath(runRootPath)}/${runName}`),
  name: runName,
  path: `${normalizeProjectPath(runRootPath)}/${runName}`,
  root_path: normalizeProjectPath(runRootPath),
  status: String(summary?.status || 'running'),
  start_time: '',
  start_epoch: Number(summary?.start_epoch || 0),
  duration_seconds: Number(summary?.duration_seconds || 0),
  last_activity: String(summary?.last_activity || ''),
  model: String(summary?.model || ''),
  provider: String(summary?.provider || ''),
  thinking: String(summary?.thinking || ''),
  max_cycles: Number(summary?.max_cycles || 0),
  cycles_used: Number(summary?.cycles_used || 0),
  result_count: Number(summary?.result_count || 0),
  passed_count: Number(summary?.passed_count || 0),
  failed_count: Number(summary?.failed_count || 0),
  workflow_mode: String(summary?.workflow_mode || ''),
  updated_at: summary?.updated_at || null,
  config: {
    model: String(summary?.model || ''),
    provider: String(summary?.provider || ''),
    thinking: String(summary?.thinking || ''),
    max_review_cycles: Number(summary?.max_cycles || 0),
  },
  error: null,
  cycles: [],
  results: [],
  removed_results: [],
  manifests: {},
  latest_issues: [],
  atomic_work_path: '',
  files: [],
  sessions: [],
  run_log: '',
  raw: {
    task_markdown: `# 历史 Run\n\n- Run: ${runName}\n- Root: ${runRootPath}\n\n后端正在从 /data 和数据库索引加载详情...`,
    summary_markdown: '',
  },
});

const buildFileserverSyntheticRun = (run: DataflowFileserverRunDetail): DataflowTaskRun => {
  const startedAt = isoFromEpoch(run.start_epoch);
  const finishedAt = run.status === 'running' ? null : isoFromEpoch((run.start_epoch || 0) + (run.duration_seconds || 0));
  return {
    execution_id: run.name,
    task_id: fileserverTaskId(run.name),
    attempt_no: 1,
    status: run.status,
    history_run_id: run.history_run_id || null,
    started_at: startedAt,
    finished_at: finishedAt,
    message: `历史 Run：${run.name}`,
    workspace_root: run.atomic_work_path || run.path,
    output_manifest_path: '',
    output_task_count: run.result_count,
    created_at: startedAt || new Date().toISOString(),
    updated_at: finishedAt || run.last_activity || startedAt || new Date().toISOString(),
    run_summary: {
      status: run.status,
      model: run.model,
      provider: run.provider,
      thinking: run.thinking,
      cycles_used: run.cycles_used,
      result_count: run.result_count,
      passed_count: run.passed_count,
      failed_count: run.failed_count,
      duration_seconds: run.duration_seconds,
      workflow_mode: run.workflow_mode,
    },
  };
};

const buildFileserverSyntheticArtifacts = (run: DataflowFileserverRunDetail): DataflowTaskArtifacts => ({
  task_id: fileserverTaskId(run.name),
  execution_id: run.name,
  workspace_root: run.atomic_work_path || run.path,
  output_manifest_path: '',
  files: run.files.map((file) => ({
    path: file.path,
    size: file.size,
  })),
});

const statusMeta = (status?: string | null) => STATUS_META[String(status || '').toLowerCase()] || {
  label: status || '未知',
  className: 'bg-slate-100 text-slate-600 border-slate-200',
  icon: <AlertTriangle size={13} />,
};

const isActiveTaskStatus = (status?: string | null) =>
  ['pending', 'queued', 'running', 'cancel_requested'].includes(String(status || '').toLowerCase());

const StatusBadge: React.FC<{ status?: string | null }> = ({ status }) => {
  const meta = statusMeta(status);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-black ${meta.className}`}>
      {meta.icon}
      {meta.label}
    </span>
  );
};

const MetricCard: React.FC<{ label: string; value: React.ReactNode; icon: React.ReactNode; tone?: string; hint?: string }> = ({
  label,
  value,
  icon,
  tone = 'bg-white',
  hint,
}) => (
  <div className={`rounded-lg border border-slate-200 ${tone} p-4 shadow-sm`}>
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</span>
      <span className="text-slate-500">{icon}</span>
    </div>
    <div className="mt-3 text-2xl font-black text-slate-900">{value}</div>
    {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
  </div>
);

const EmptyPanel: React.FC<{ title: string; description: string; icon?: React.ReactNode }> = ({ title, description, icon = <FileSearch size={22} /> }) => (
  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400">{icon}</div>
    <div className="mt-4 text-sm font-black text-slate-800">{title}</div>
    <div className="mt-2 text-sm text-slate-500">{description}</div>
  </div>
);

const JsonBlock: React.FC<{ value: any; maxHeight?: string }> = ({ value, maxHeight = 'max-h-80' }) => (
  <pre className={`${maxHeight} overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-4 text-xs leading-5 text-slate-100`}>
    {JSON.stringify(value ?? {}, null, 2)}
  </pre>
);

const PageHeader: React.FC<{
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}> = ({ eyebrow, title, description, children }) => (
  <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-700">{eyebrow}</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{title}</h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">{description}</p>
      </div>
      {children ? <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  </section>
);

interface CreateTaskState {
  title: string;
  profileId: string;
  priority: number;
  workspacePath: string;
  dataFlowPath: string;
  sourcePath: string;
  model: string;
  provider: string;
  thinking: string;
  reviewProfile: string;
  maxReviewCycles: number;
  workerTimeout: number;
  advisorTimeout: number;
  resultReviewConcurrency: number;
  runtimeOverridesText: string;
}

const initialCreateTaskState = (): CreateTaskState => ({
  title: `dataflow-vuln-${new Date().toISOString().slice(0, 16).replace('T', '-')}`,
  profileId: '',
  priority: 100,
  workspacePath: '',
  dataFlowPath: '',
  sourcePath: '',
  model: defaultConfigPayload().model,
  provider: '',
  thinking: defaultConfigPayload().thinking,
  reviewProfile: defaultConfigPayload().review_profile || 'balanced',
  maxReviewCycles: defaultConfigPayload().max_review_cycles,
  workerTimeout: defaultConfigPayload().worker_timeout,
  advisorTimeout: defaultConfigPayload().advisor_timeout,
  resultReviewConcurrency: defaultConfigPayload().result_review_concurrency,
  runtimeOverridesText: '',
});

export const DataflowVulnTaskListPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const executionApi = api.domains.execution.dataflowVulnScanner;
  const navigate = useNavigate();
  const { notify, feedbackNodes } = useUiFeedback();

  const [profiles, setProfiles] = useState<DataflowScanProfile[]>([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [runs, setRuns] = useState<DataflowFileserverRunSummary[]>([]);
  const [runsError, setRunsError] = useState('');
  const [loading, setLoading] = useState(true);
  const [runQuery, setRunQuery] = useState('');
  const [runStatusFilter, setRunStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createState, setCreateState] = useState<CreateTaskState>(initialCreateTaskState);
  const [submitting, setSubmitting] = useState(false);

  const openTaskDetail = (task: Pick<DataflowScanTask, 'task_id' | 'latest_execution_id'>) => {
    const runQuery = task.latest_execution_id ? `?run_id=${encodeURIComponent(task.latest_execution_id)}` : '';
    navigate(`/pentest-exec-dataflow-vuln-task-detail/${encodeURIComponent(task.task_id)}${runQuery}`);
  };

  const openRunDetail = (run: DataflowFileserverRunSummary) => {
    if (run.linked_task_id) {
      const params = new URLSearchParams();
      if (run.linked_execution_id) params.set('run_id', run.linked_execution_id);
      const query = params.toString();
      navigate(`/pentest-exec-dataflow-vuln-task-detail/${encodeURIComponent(run.linked_task_id)}${query ? `?${query}` : ''}`);
      return;
    }
    const params = new URLSearchParams();
    if (run.history_run_id) params.set('history_run_id', run.history_run_id);
    params.set('fileserver_run', run.name);
    params.set('fileserver_root', run.root_path || DEFAULT_DATAFLOW_FILESERVER_RUNS_ROOT);
    navigate(`/pentest-exec-dataflow-vuln-task-detail/${encodeURIComponent(fileserverTaskId(run.name))}?${params.toString()}`, {
      state: {
        fileserverRunSummary: run,
      },
    });
  };

  const loadProfiles = async (options?: { force?: boolean }) => {
    if (!projectId) return;
    if (profilesLoading) return;
    if (profilesLoaded && !options?.force) return;
    setProfilesLoading(true);
    try {
      setProfiles(await executionApi.listProfiles(projectId));
      setProfilesLoaded(true);
    } catch (error: any) {
      setProfiles([]);
      notify(`加载数据流漏洞挖掘 Profile 失败: ${error?.message || error || '未知错误'}`, 'error');
    } finally {
      setProfilesLoading(false);
    }
  };

  const load = async () => {
    if (!projectId) return;
    setLoading(true);
    setRunsError('');
    try {
      setRuns(await executionApi.listHistoryRuns(projectId));
    } catch (error: any) {
      setRuns([]);
      setRunsError(error?.message || '读取任务列表失败');
      notify(`加载数据流漏洞挖掘任务列表失败: ${error?.message || error || '未知错误'}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setProfiles([]);
    setProfilesLoaded(false);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [projectId]);

  const filteredRuns = useMemo(() => {
    const text = runQuery.trim().toLowerCase();
    return runs.filter((run) => {
      if (runStatusFilter && run.status !== runStatusFilter) return false;
      if (!text) return true;
      return [
        run.name,
        run.status,
        run.model,
        run.provider,
        run.workflow_mode,
        run.linked_task_id,
        run.linked_execution_id,
        run.profile_id,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(text));
    });
  }, [runQuery, runStatusFilter, runs]);

  const stats = useMemo(() => {
    return {
      total: runs.length,
      running: runs.filter((run) => ['pending', 'queued', 'running', 'cancel_requested'].includes(run.status)).length,
      succeeded: runs.filter((run) => ['succeeded', 'completed'].includes(run.status)).length,
      failed: runs.filter((run) => run.status === 'failed').length,
      linked: runs.filter((run) => Boolean(run.linked_task_id)).length,
      legacy: runs.filter((run) => !run.linked_task_id).length,
    };
  }, [runs]);

  const submitCreateTask = async () => {
    if (!projectId) {
      notify('请先选择项目', 'warning');
      return;
    }
    if (!createState.title.trim()) {
      notify('请输入任务标题', 'warning');
      return;
    }
    if (!createState.workspacePath.trim()) {
      notify('请选择总工作目录', 'warning');
      return;
    }
    if (!createState.dataFlowPath.trim()) {
      notify('请选择数据流文件路径', 'warning');
      return;
    }
    if (!createState.sourcePath.trim()) {
      notify('请选择代码目录路径', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const runtimeOverrides = parseJsonObject(createState.runtimeOverridesText, '运行时覆盖');
      const created = await executionApi.createTask({
        project_id: projectId,
        profile_id: createState.profileId || undefined,
        title: createState.title.trim(),
        workspace_dir: buildProjectFilesystemRef(createState.workspacePath),
        data_flow: buildProjectFilesystemRef(createState.dataFlowPath),
        source_dir: buildProjectFilesystemRef(createState.sourcePath),
        model: createState.model.trim() || undefined,
        provider: createState.provider.trim() || undefined,
        thinking: createState.thinking,
        review_profile: createState.reviewProfile,
        max_review_cycles: createState.maxReviewCycles,
        worker_timeout: createState.workerTimeout,
        advisor_timeout: createState.advisorTimeout,
        result_review_concurrency: createState.resultReviewConcurrency,
        priority: createState.priority,
        runtime_overrides: runtimeOverrides,
      });
      notify('扫描任务已创建并进入调度队列', 'success');
      setShowCreate(false);
      setCreateState(initialCreateTaskState());
      openTaskDetail(created);
    } catch (error: any) {
      notify(error?.message || '创建任务失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-100 px-5 py-5 text-slate-900 lg:px-8 lg:py-7">
      {feedbackNodes}
      <div className="mx-auto max-w-[1800px] space-y-4">
        <PageHeader
          eyebrow="Dataflow Vulnerability Mining"
          title="数据流漏洞挖掘"
          description="任务列表改为统一 runs 视图，通过后端单一接口聚合当前执行 run 与历史 run，不再拆分“当前 / 历史”两套列表。"
        >
          <button
            onClick={() => {
              setCreateState(initialCreateTaskState());
              setShowCreate(true);
              void loadProfiles();
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-cyan-800"
          >
            <Plus size={16} />
            创建任务
          </button>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            刷新
          </button>
        </PageHeader>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <MetricCard label="Run 总数" value={stats.total} icon={<Layers size={17} />} />
          <MetricCard label="运行中" value={stats.running} icon={<Activity size={17} />} />
          <MetricCard label="已成功" value={stats.succeeded} icon={<ShieldCheck size={17} />} tone="bg-emerald-50/70" />
          <MetricCard label="失败" value={stats.failed} icon={<AlertTriangle size={17} />} tone="bg-rose-50/70" />
          <MetricCard label="关联任务" value={stats.linked} icon={<FileSearch size={17} />} />
          <MetricCard label="独立历史 Run" value={stats.legacy} icon={<Archive size={17} />} />
        </section>

        <section>
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-sm font-black text-slate-900">任务列表</div>
                  <div className="mt-1 text-xs text-slate-500">所有 run 统一从 `/api/dataflow-vuln-scanner/history-runs` 获取；已关联任务的 run 和纯历史 run 在同一视图查看。</div>
                </div>
                <div className="text-xs font-bold text-slate-500">
                  {filteredRuns.length === runs.length
                    ? `${runs.length} 个 run`
                    : `${filteredRuns.length} / ${runs.length} 个 run`}
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <Search size={16} className="text-slate-400" />
                  <input
                    value={runQuery}
                    onChange={(event) => setRunQuery(event.target.value)}
                    placeholder="搜索 Run、任务 ID、执行 ID、模型、状态或工作流模式"
                    className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={runStatusFilter}
                    onChange={(event) => setRunStatusFilter(event.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 outline-none"
                  >
                    <option value="">全部状态</option>
                    {Object.entries(STATUS_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
                  </select>
                </div>
              </div>
              {runsError ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700">
                  {runsError}
                </div>
              ) : null}
            </div>

            <div className="overflow-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">任务 / Run</th>
                    <th className="px-4 py-3">状态</th>
                    <th className="px-4 py-3">模型</th>
                    <th className="px-4 py-3">轮次</th>
                    <th className="px-4 py-3">结果</th>
                    <th className="px-4 py-3">开始时间</th>
                    <th className="px-4 py-3">耗时</th>
                    <th className="px-4 py-3 text-right">详情</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRuns.map((run) => {
                    const secondaryLine = run.linked_task_id
                      ? `任务 ${shortId(run.linked_task_id, 18)} · 执行 ${shortId(run.linked_execution_id || run.name, 18)}`
                      : `${run.workflow_mode || run.provider || '未关联任务'}`;
                    return (
                      <tr
                        key={run.history_run_id || run.name}
                        onClick={() => openRunDetail(run)}
                        className="cursor-pointer border-t border-slate-100 bg-white hover:bg-cyan-50/50"
                        title="查看任务运行详情"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
                              <FileSearch size={17} />
                            </div>
                            <div className="min-w-0">
                              <div className="font-black text-slate-900">{shortId(run.name, 32)}</div>
                              <div className="mt-1 truncate text-xs text-slate-500">{secondaryLine}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={run.status} /></td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-700">{run.model || '-'}</div>
                          <div className="mt-1 text-xs text-slate-500">{run.thinking || run.provider || '-'}</div>
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-700">{run.cycles_used || 0} / {run.max_cycles || 0}</td>
                        <td className="px-4 py-3 text-slate-600">
                          <div>{run.result_count || 0} / {run.passed_count || 0} 通过</div>
                          <div className="mt-1 text-xs text-slate-500">{run.failed_count || 0} 失败</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{formatEpochTime(run.start_epoch)}</td>
                        <td className="px-4 py-3 text-slate-600">{formatSeconds(run.duration_seconds || 0)}</td>
                        <td className="px-4 py-3 text-right text-cyan-700">
                          <ChevronRight size={17} className="ml-auto" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {!loading && !runsError && filteredRuns.length === 0 ? (
                <div className="p-6">
                  <EmptyPanel title="暂无 Runs" description="当前筛选条件下没有可展示的数据流漏洞挖掘 run。" />
                </div>
              ) : null}
              {loading ? (
                <div className="flex items-center gap-2 p-6 text-sm font-bold text-slate-500">
                  <Loader2 size={16} className="animate-spin" />
                  加载任务列表中...
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-black text-slate-900">Profile / 系统配置</div>
                <div className="mt-1 text-xs text-slate-500">Profile 维护入口已下沉到页面底部，日常以统一任务列表为主；只有在需要调整默认模板、Worker 或版本快照时再进入。</div>
              </div>
              <button
                onClick={() => navigate('/pentest-exec-dataflow-vuln-system-config')}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                <Settings size={16} />
                打开系统配置
              </button>
            </div>
          </div>
        </section>
      </div>

      {showCreate ? (
        <CreateTaskDialog
          projectId={projectId}
          state={createState}
          profiles={profiles}
          profilesLoading={profilesLoading}
          submitting={submitting}
          onChange={setCreateState}
          onClose={() => !submitting && setShowCreate(false)}
          onSubmit={submitCreateTask}
        />
      ) : null}
    </div>
  );
};

export const DataflowVulnTaskDetailPage: React.FC<{ projectId: string; onBack?: () => void }> = ({ projectId, onBack }) => {
  const executionApi = api.domains.execution.dataflowVulnScanner;
  const navigate = useNavigate();
  const location = useLocation();
  const { taskId: routeTaskId } = useParams<{ taskId?: string }>();
  const { notify, confirm, prompt, feedbackNodes } = useUiFeedback();

  const taskId = routeTaskId || '';
  const requestedRunId = useMemo(() => new URLSearchParams(location.search).get('run_id') || '', [location.search]);
  const historyRunId = useMemo(() => new URLSearchParams(location.search).get('history_run_id') || '', [location.search]);
  const fileserverRunName = useMemo(() => new URLSearchParams(location.search).get('fileserver_run') || '', [location.search]);
  const fileserverRootPath = useMemo(
    () => new URLSearchParams(location.search).get('fileserver_root') || DEFAULT_DATAFLOW_FILESERVER_RUNS_ROOT,
    [location.search]
  );
  const fileserverRouteSummary = (location.state as { fileserverRunSummary?: DataflowFileserverRunSummary } | null)?.fileserverRunSummary || null;
  const isSyntheticFileserverTask = useMemo(() => isSyntheticFileserverTaskId(taskId), [taskId]);
  const isFileserverMode = isSyntheticFileserverTask && Boolean(fileserverRunName);
  const isHistoryBootstrapMode = isSyntheticFileserverTask && Boolean(historyRunId && !fileserverRunName);
  const [profiles, setProfiles] = useState<DataflowScanProfile[]>([]);
  const [detail, setDetail] = useState<DataflowScanTaskDetail | null>(null);
  const [events, setEvents] = useState<DataflowScanTaskEvent[]>([]);
  const [artifacts, setArtifacts] = useState<DataflowTaskArtifacts | null>(null);
  const [runs, setRuns] = useState<DataflowTaskRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [runDetail, setRunDetail] = useState<Record<string, any> | null>(null);
  const [runSessions, setRunSessions] = useState<Record<string, any>[]>([]);
  const [runFiles, setRunFiles] = useState<DataflowRunFile[]>([]);
  const [runLog, setRunLog] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [runLoading, setRunLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DataflowDetailTab>('runs');
  const [loadError, setLoadError] = useState('');

  const goBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    navigate('/pentest-exec-dataflow-vuln-task-list');
  };

  const applyFileserverPlaceholder = (runName: string, rootPath: string, summary?: Partial<DataflowFileserverRunSummary> | null) => {
    if (!projectId || !runName) return;
    const placeholder = buildFileserverRunDetailPlaceholder(projectId, runName, rootPath, summary);
    const syntheticTask = buildFileserverSyntheticTask(projectId, placeholder, rootPath);
    setDetail(syntheticTask);
    setEvents([]);
    setArtifacts(buildFileserverSyntheticArtifacts(placeholder));
    setRuns([buildFileserverSyntheticRun(placeholder)]);
    setSelectedRunId(runName);
    setRunDetail({
      execution: syntheticTask.attempts[0],
      detail: placeholder,
    });
    setRunSessions([]);
    setRunFiles([]);
    setRunLog('');
  };

  const loadRunProcess = async (targetTaskId: string, executionId: string) => {
    if (!targetTaskId || !executionId) return;
    setRunLoading(true);
    try {
      const [detailResp, sessionsResp, filesResp, logResp] = await Promise.all([
        executionApi.getTaskRun(targetTaskId, executionId).catch(() => null),
        executionApi.listTaskRunSessions(targetTaskId, executionId).catch(() => []),
        executionApi.listTaskRunFiles(targetTaskId, executionId, 5000).catch(() => []),
        executionApi.getTaskRunLog(targetTaskId, executionId, 2000).catch(() => ({ content: '' })),
      ]);
      setSelectedRunId(executionId);
      setRunDetail(detailResp);
      setRunSessions(sessionsResp || []);
      setRunFiles(filesResp || []);
      setRunLog(logResp?.content || '');
    } catch (error: any) {
      notify(`加载 run 过程失败: ${error?.message || error}`, 'error');
    } finally {
      setRunLoading(false);
    }
  };

  const loadFileserverRunDetail = async (runName: string, rootPath: string) => {
    if (!projectId || !runName) return;
    setDetailLoading(true);
    setRunLoading(true);
    setLoadError('');
    applyFileserverPlaceholder(runName, rootPath, fileserverRouteSummary && fileserverRouteSummary.name === runName ? fileserverRouteSummary : null);
    try {
      const run = await inspectDataflowFileserverRun(projectId, rootPath, runName);
      const syntheticTask = buildFileserverSyntheticTask(projectId, run, rootPath);
      setDetail(syntheticTask);
      setEvents([]);
      setArtifacts(buildFileserverSyntheticArtifacts(run));
      setRuns([buildFileserverSyntheticRun(run)]);
      setSelectedRunId(run.name);
      setRunDetail({
        execution: syntheticTask.attempts[0],
        detail: run,
      });
      setRunSessions(run.sessions);
      setRunFiles(run.files);
      setRunLog(run.run_log || '');
    } catch (error: any) {
      const message = error?.message || '加载历史 run 详情失败';
      setLoadError(message);
      notify(`加载历史 run 详情失败: ${message}`, 'error');
    } finally {
      setDetailLoading(false);
      setRunLoading(false);
    }
  };

  const loadTaskDetail = async (targetTaskId: string, preferredRunId = requestedRunId) => {
    if (!targetTaskId) return;
    setDetailLoading(true);
    setLoadError('');
    try {
      const [taskDetail, taskEvents, taskArtifacts, taskRuns] = await Promise.all([
        executionApi.getTask(targetTaskId),
        executionApi.listTaskEvents(targetTaskId),
        executionApi.getTaskArtifacts(targetTaskId).catch(() => null),
        executionApi.listTaskRuns(targetTaskId).catch(() => []),
      ]);
      setDetail(taskDetail);
      setEvents(taskEvents || []);
      setArtifacts(taskArtifacts);
      setRuns(taskRuns || []);

      const preferred = preferredRunId ? taskRuns.find((run) => run.execution_id === preferredRunId) : null;
      const nextRunId = preferred?.execution_id || taskDetail.latest_execution_id || taskRuns?.[0]?.execution_id || '';
      if (nextRunId) {
        await loadRunProcess(targetTaskId, nextRunId);
      } else {
        setSelectedRunId('');
        setRunDetail(null);
        setRunSessions([]);
        setRunFiles([]);
        setRunLog('');
      }
    } catch (error: any) {
      const message = error?.message || '加载任务详情失败';
      setLoadError(message);
      notify(`加载任务详情失败: ${message}`, 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (!projectId) return;
    executionApi.listProfiles(projectId)
      .then((items) => setProfiles(items || []))
      .catch(() => setProfiles([]));
  }, [projectId]);

  useEffect(() => {
    setActiveTab('runs');
    if (isFileserverMode || isHistoryBootstrapMode) return;
    void loadTaskDetail(taskId, requestedRunId);
  }, [taskId, requestedRunId, isFileserverMode, isHistoryBootstrapMode, fileserverRunName, fileserverRootPath, projectId]);

  useEffect(() => {
    if (!isHistoryBootstrapMode || !historyRunId) return;
    let cancelled = false;
    setDetailLoading(true);
    setLoadError('');
    executionApi.getHistoryRun(historyRunId)
      .then((run) => {
        if (cancelled) return;
        const params = new URLSearchParams(location.search);
        params.set('history_run_id', historyRunId);
        params.set('fileserver_run', run.name);
        params.set('fileserver_root', run.root_path || DEFAULT_DATAFLOW_FILESERVER_RUNS_ROOT);
        navigate(`/pentest-exec-dataflow-vuln-task-detail/${encodeURIComponent(fileserverTaskId(run.name))}?${params.toString()}`, {
          replace: true,
          state: fileserverRouteSummary ? { fileserverRunSummary: fileserverRouteSummary } : undefined,
        });
      })
      .catch((error: any) => {
        if (cancelled) return;
        const message = error?.message || '解析历史 Run 失败';
        setLoadError(message);
        notify(`解析历史 Run 失败: ${message}`, 'error');
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [executionApi, fileserverRouteSummary, historyRunId, isHistoryBootstrapMode, location.search, navigate, notify]);

  useEffect(() => {
    if (isFileserverMode || !taskId || detailLoading || !isActiveTaskStatus(detail?.status)) return undefined;
    const timer = window.setTimeout(() => {
      void loadTaskDetail(taskId, selectedRunId);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [detail?.status, detailLoading, isFileserverMode, selectedRunId, taskId]);

  const runTaskAction = async (targetTaskId: string, action: 'cancel' | 'retry' | 'requeue') => {
    const label = action === 'cancel' ? '取消任务' : action === 'retry' ? '重试任务' : '重排任务';
    const ok = await confirm({
      title: label,
      message: `确认对任务 ${targetTaskId} 执行“${label}”？`,
      confirmText: label,
      danger: action === 'cancel',
    });
    if (!ok) return;
    try {
      if (action === 'cancel') await executionApi.cancelTask(targetTaskId);
      if (action === 'retry') await executionApi.retryTask(targetTaskId);
      if (action === 'requeue') await executionApi.requeueTask(targetTaskId);
      notify(`${label}已提交`, 'success');
      await loadTaskDetail(targetTaskId, selectedRunId);
    } catch (error: any) {
      notify(error?.message || `${label}失败`, 'error');
    }
  };

  const updatePriority = async (targetTaskId: string, current: number) => {
    const value = await prompt({
      title: '调整优先级',
      message: `当前优先级为 ${current}`,
      defaultValue: String(current),
      placeholder: '例如 100',
      confirmText: '更新',
    });
    if (value === null) return;
    const next = Number(value);
    if (!Number.isFinite(next)) {
      notify('优先级必须是数字', 'warning');
      return;
    }
    try {
      await executionApi.updatePriority(targetTaskId, next);
      notify('优先级已更新', 'success');
      await loadTaskDetail(targetTaskId, selectedRunId);
    } catch (error: any) {
      notify(error?.message || '更新优先级失败', 'error');
    }
  };

  if (isFileserverMode) {
    return (
      <DataflowFileserverRunDashboardPage
        projectId={projectId}
        initialRunName={fileserverRunName}
        rootPath={fileserverRootPath}
        initialSummary={fileserverRouteSummary}
        onBack={goBack}
      />
    );
  }

  if (isHistoryBootstrapMode) {
    return (
      <div className="min-h-full bg-slate-100 px-5 py-5 text-slate-900 lg:px-8 lg:py-7">
        {feedbackNodes}
        <div className="mx-auto max-w-[960px]">
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 text-sm font-bold text-slate-600">
              <Loader2 size={16} className={detailLoading ? 'animate-spin' : ''} />
              {loadError ? `解析历史 Run 失败: ${loadError}` : '正在解析历史 Run...'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-100 px-5 py-5 text-slate-900 lg:px-8 lg:py-7">
      {feedbackNodes}
      <div className="mx-auto max-w-[1800px] space-y-4">
        <div>
          <button
            type="button"
            onClick={goBack}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            返回任务列表
          </button>
        </div>

        <PageHeader
          eyebrow="Dataflow Vulnerability Mining"
          title="漏洞挖掘任务详情"
          description={isFileserverMode
            ? '当前详情由微服务后端统一读取 /data 历史目录并结合数据库索引返回，页面为只读模式。'
            : '集中查看当前任务的执行状态、当前 run 过程、事件流、尝试记录、产物文件与输入上下文。'}
        >
          <button
            onClick={() => {
              if (isFileserverMode) {
                void loadFileserverRunDetail(fileserverRunName, fileserverRootPath);
              } else {
                void loadTaskDetail(taskId, selectedRunId);
              }
            }}
            disabled={(!taskId && !isFileserverMode) || detailLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {detailLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {isFileserverMode ? '刷新历史 Run' : '刷新详情'}
          </button>
        </PageHeader>

        {!taskId && !isFileserverMode ? (
          <EmptyPanel title="缺少任务 ID" description="无法定位要查看的漏洞挖掘任务，请返回任务列表后重新进入。" icon={<AlertTriangle size={22} />} />
        ) : null}

        {loadError ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{loadError}</div>
        ) : null}

        {detailLoading && !detail ? (
          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-500 shadow-sm">
            <Loader2 size={16} className="animate-spin" />
            加载任务详情中...
          </div>
        ) : null}

        {(taskId || isFileserverMode) && (!detailLoading || detail) ? (
          <TaskDetailPanel
            task={detail}
            detail={detail}
            events={events}
            artifacts={artifacts}
            runs={runs}
            selectedRunId={selectedRunId}
            runDetail={runDetail}
            runSessions={runSessions}
            runFiles={runFiles}
            runLog={runLog}
            profiles={profiles}
            activeTab={activeTab}
            loading={detailLoading}
            runLoading={runLoading}
            fullPage
            profileName={isFileserverMode ? `历史 Runs · ${fileserverRootPath}` : undefined}
            readOnly={isFileserverMode}
            onTabChange={setActiveTab}
            onAction={runTaskAction}
            onPriority={updatePriority}
            onSelectRun={(executionId) => {
              if (isFileserverMode) {
                void loadFileserverRunDetail(executionId, fileserverRootPath);
                return;
              }
              if (taskId) void loadRunProcess(taskId, executionId);
            }}
            onRefresh={() => {
              if (isFileserverMode) {
                void loadFileserverRunDetail(fileserverRunName, fileserverRootPath);
                return;
              }
              if (taskId) void loadTaskDetail(taskId, selectedRunId);
            }}
          />
        ) : null}
      </div>
    </div>
  );
};

const TaskDetailPanel: React.FC<{
  task: DataflowScanTask | null;
  detail: DataflowScanTaskDetail | null;
  events: DataflowScanTaskEvent[];
  artifacts: DataflowTaskArtifacts | null;
  runs: DataflowTaskRun[];
  selectedRunId: string;
  runDetail: Record<string, any> | null;
  runSessions: Record<string, any>[];
  runFiles: DataflowRunFile[];
  runLog: string;
  profiles: DataflowScanProfile[];
  activeTab: DataflowDetailTab;
  loading: boolean;
  runLoading: boolean;
  fullPage?: boolean;
  profileName?: string;
  readOnly?: boolean;
  onTabChange: (tab: DataflowDetailTab) => void;
  onAction: (taskId: string, action: 'cancel' | 'retry' | 'requeue') => void;
  onPriority: (taskId: string, current: number) => void;
  onSelectRun: (executionId: string) => void;
  onRefresh: () => void;
}> = ({
  task,
  detail,
  events,
  artifacts,
  runs,
  selectedRunId,
  runDetail,
  runSessions,
  runFiles,
  runLog,
  profiles,
  activeTab,
  loading,
  runLoading,
  fullPage = false,
  profileName,
  readOnly = false,
  onTabChange,
  onAction,
  onPriority,
  onSelectRun,
  onRefresh,
}) => {
  const profile = profiles.find((item) => item.profile_id === task?.profile_id);
  const resolvedProfileName = profileName || profile?.name || (task ? shortId(task.profile_id) : '-');
  const attempts = detail?.attempts || [];
  const canCancel = task ? ['pending', 'queued', 'running', 'cancel_requested'].includes(task.status) : false;
  const canRetry = task ? ['failed', 'cancelled'].includes(task.status) : false;
  const canRequeue = attempts.some((attempt) => ['orphaned', 'failed', 'cancelled'].includes(attempt.status));

  if (!task) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <EmptyPanel title="选择任务查看详情" description="这里会展示任务输入、执行尝试、事件流和产物清单。" icon={<ChevronRight size={22} />} />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={task.status} />
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-black text-slate-500">v{task.profile_version}</span>
            </div>
            <h2 className="mt-3 break-all text-xl font-black text-slate-950">{detail?.title || task.task_id}</h2>
            <p className="mt-2 break-all text-xs text-slate-500">{task.task_id}</p>
          </div>
          <button onClick={onRefresh} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" title="刷新详情">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <MetricCard label="Profile" value={resolvedProfileName} icon={<SlidersHorizontal size={15} />} />
          <MetricCard label="执行尝试" value={task.latest_attempt_no || 0} icon={<GitBranch size={15} />} />
          <MetricCard label="优先级" value={task.priority} icon={<Gauge size={15} />} />
          <MetricCard label="耗时" value={formatDuration(task.started_at, task.finished_at)} icon={<Clock size={15} />} />
        </div>
        {!readOnly ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              disabled={!canCancel}
              onClick={() => onAction(task.task_id, 'cancel')}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <PauseCircle size={14} />
              取消
            </button>
            <button
              disabled={!canRetry}
              onClick={() => onAction(task.task_id, 'retry')}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw size={14} />
              重试
            </button>
            <button
              disabled={!canRequeue}
              onClick={() => onAction(task.task_id, 'requeue')}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Play size={14} />
              重排
            </button>
            <button
              onClick={() => onPriority(task.task_id, task.priority)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700"
            >
              <Gauge size={14} />
              优先级
            </button>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">
            当前详情来自历史 Run 索引，只读展示；原始正文和日志由后端按需从 `/data` 读取。
          </div>
        )}
      </div>

      <div className="flex overflow-x-auto border-b border-slate-200 px-4">
        {[
          ['overview', '概览'],
          ['runs', `Runs ${runs.length}`],
          ['events', `事件 ${events.length}`],
          ['attempts', `尝试 ${attempts.length}`],
          ['artifacts', `产物 ${artifacts?.files?.length || 0}`],
          ['input', '输入'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => onTabChange(key as DataflowDetailTab)}
            className={`whitespace-nowrap border-b-2 px-3 py-3 text-xs font-black ${
              activeTab === key ? 'border-cyan-700 text-cyan-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={`${fullPage ? '' : 'max-h-[780px]'} overflow-auto p-5`}>
        {loading ? (
          <div className="inline-flex items-center gap-2 text-sm font-bold text-slate-500"><Loader2 size={15} className="animate-spin" />加载详情中...</div>
        ) : null}
        {!loading && activeTab === 'overview' ? <TaskOverview task={task} detail={detail} events={events} artifacts={artifacts} /> : null}
        {!loading && activeTab === 'runs' ? (
          <TaskRuns
            runs={runs}
            selectedRunId={selectedRunId}
            runDetail={runDetail}
            runSessions={runSessions}
            runFiles={runFiles}
            runLog={runLog}
            loading={runLoading}
            expanded={fullPage}
            onSelectRun={onSelectRun}
          />
        ) : null}
        {!loading && activeTab === 'events' ? <TaskEvents events={events} /> : null}
        {!loading && activeTab === 'attempts' ? <TaskAttempts attempts={attempts} /> : null}
        {!loading && activeTab === 'artifacts' ? <TaskArtifacts artifacts={artifacts} /> : null}
        {!loading && activeTab === 'input' ? <TaskInput detail={detail} /> : null}
      </div>
    </div>
  );
};

const TaskOverview: React.FC<{
  task: DataflowScanTask;
  detail: DataflowScanTaskDetail | null;
  events: DataflowScanTaskEvent[];
  artifacts: DataflowTaskArtifacts | null;
}> = ({ task, detail, events, artifacts }) => {
  const latestEvent = events[events.length - 1];
  const isFileserverDetail = detail?.task_metadata?.source === 'history_runs';
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
          <div><span className="text-slate-500">创建人</span><div className="mt-1 font-bold text-slate-900">{task.created_by}</div></div>
          <div><span className="text-slate-500">最新执行</span><div className="mt-1 break-all font-bold text-slate-900">{task.latest_execution_id || '-'}</div></div>
          <div><span className="text-slate-500">创建时间</span><div className="mt-1 font-bold text-slate-900">{formatDateTime(task.created_at)}</div></div>
          <div><span className="text-slate-500">完成时间</span><div className="mt-1 font-bold text-slate-900">{formatDateTime(task.finished_at)}</div></div>
        </div>
        {task.message ? <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">{task.message}</div> : null}
      </div>

      {isFileserverDetail ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
            <div><span className="text-slate-500">Runs Root</span><div className="mt-1 break-all font-bold text-slate-900">{detail?.task_metadata?.runs_root_path || '-'}</div></div>
            <div><span className="text-slate-500">Atomic Work</span><div className="mt-1 break-all font-bold text-slate-900">{detail?.task_metadata?.atomic_work_path || '-'}</div></div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <MetricCard label="上传附件" value={detail?.artifact_refs?.length || 0} icon={<UploadCloud size={15} />} />
        <MetricCard label="事件数量" value={events.length} icon={<TerminalSquare size={15} />} />
        <MetricCard label="产物文件" value={artifacts?.files?.length || 0} icon={<Archive size={15} />} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="text-sm font-black text-slate-900">最新事件</div>
        {latestEvent ? (
          <div className="mt-3 rounded-lg bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-black text-slate-500">{latestEvent.event_type}</span>
              <span className="text-xs text-slate-400">{formatDateTime(latestEvent.created_at)}</span>
            </div>
            <div className="mt-2 text-sm text-slate-700">{latestEvent.message}</div>
          </div>
        ) : (
          <div className="mt-3 text-sm text-slate-500">暂无事件。</div>
        )}
      </div>
    </div>
  );
};

const TaskRuns: React.FC<{
  runs: DataflowTaskRun[];
  selectedRunId: string;
  runDetail: Record<string, any> | null;
  runSessions: Record<string, any>[];
  runFiles: DataflowRunFile[];
  runLog: string;
  loading: boolean;
  expanded?: boolean;
  onSelectRun: (executionId: string) => void;
}> = ({ runs, selectedRunId, runDetail, runSessions, runFiles, runLog, loading, expanded = false, onSelectRun }) => {
  if (!runs.length) return <EmptyPanel title="暂无 Run" description="任务调度后会在这里展示每次执行尝试及其中间过程。" icon={<History size={22} />} />;
  const detail = runDetail?.detail || {};
  const cycles = Array.isArray(detail.cycles) ? detail.cycles : [];
  const results = Array.isArray(detail.results) ? detail.results : [];
  const removedResults = Array.isArray(detail.removed_results) ? detail.removed_results : [];
  const issues = Array.isArray(detail.latest_issues) ? detail.latest_issues : [];
  const catalog = isPlainObject(detail.raw?.catalog) ? detail.raw.catalog : {};
  const fileScan = isPlainObject(catalog.file_scan) ? catalog.file_scan : {};
  const fileCategoryCounts = isPlainObject(fileScan.category_counts) ? fileScan.category_counts : {};
  const manifestSummary = isPlainObject(detail.manifests) ? detail.manifests : {};
  const stateTransitions = Array.isArray(catalog.state_transitions) ? catalog.state_transitions : [];
  const currentStep = isPlainObject(catalog.checkpoints?.current_step) ? catalog.checkpoints.current_step : isPlainObject(detail.raw?.current_step) ? detail.raw.current_step : {};
  const taskOutputFiles = Array.isArray(catalog.task_outputs?.task_result_files) ? catalog.task_outputs.task_result_files : [];
  const nextTasks = isPlainObject(catalog.task_outputs?.next_tasks) ? catalog.task_outputs.next_tasks : isPlainObject(detail.raw?.next_tasks) ? detail.raw.next_tasks : {};
  const finalOutputIndex = isPlainObject(catalog.final_output?.index) ? catalog.final_output.index : isPlainObject(detail.raw?.final_output_index) ? detail.raw.final_output_index : {};
  const finalOutputRelations = isPlainObject(catalog.final_output?.result_relations_manifest)
    ? catalog.final_output.result_relations_manifest
    : isPlainObject(detail.raw?.final_output_result_relations_manifest)
      ? detail.raw.final_output_result_relations_manifest
      : {};
  const supportingDocs = Array.isArray(catalog.supporting_docs?.active) ? catalog.supporting_docs.active : [];
  const finalSupportingDocs = Array.isArray(catalog.supporting_docs?.final_output) ? catalog.supporting_docs.final_output : [];
  const resultsArchive = catalog.results_archive;
  const selectedRun = runs.find((run) => run.execution_id === selectedRunId) || runs[0];
  const visibleCycles = expanded ? cycles : cycles.slice(-6);
  const visibleResults = expanded ? results : results.slice(0, 8);
  const visibleRemovedResults = expanded ? removedResults : removedResults.slice(0, 6);
  const visibleSessions = expanded ? runSessions : runSessions.slice(0, 12);
  const visibleFiles = expanded ? runFiles : runFiles.slice(0, 18);
  const visibleTransitions = expanded ? stateTransitions : stateTransitions.slice(-10);
  const visibleTaskOutputs = expanded ? taskOutputFiles : taskOutputFiles.slice(0, 10);
  const visibleSupportingDocs = expanded ? supportingDocs : supportingDocs.slice(0, 10);
  const visibleFinalSupportingDocs = expanded ? finalSupportingDocs : finalSupportingDocs.slice(0, 10);
  const latestCycle = cycles[cycles.length - 1] || {};

  return (
    <div className="space-y-4">
      <div className={`grid grid-cols-1 gap-3 ${expanded ? '2xl:grid-cols-[320px_minmax(0,1fr)]' : 'xl:grid-cols-[260px_minmax(0,1fr)]'}`}>
        <div className="space-y-2">
          {runs.map((run) => {
            const summary = run.run_summary || {};
            const active = run.execution_id === selectedRunId;
            return (
              <button
                key={run.execution_id}
                onClick={() => onSelectRun(run.execution_id)}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  active ? 'border-cyan-300 bg-cyan-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-black text-slate-900">Run #{run.attempt_no}</span>
                  <StatusBadge status={summary.status || run.status} />
                </div>
                <div className="mt-2 break-all text-xs font-semibold text-slate-500">{shortId(run.execution_id, 24)}</div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-md bg-white px-2 py-1">
                    <div className="font-black text-slate-900">{summary.cycles_used || 0}</div>
                    <div className="text-slate-400">cycles</div>
                  </div>
                  <div className="rounded-md bg-white px-2 py-1">
                    <div className="font-black text-slate-900">{summary.result_count || 0}</div>
                    <div className="text-slate-400">results</div>
                  </div>
                  <div className="rounded-md bg-white px-2 py-1">
                    <div className="font-black text-slate-900">{formatSeconds(Number(summary.duration_seconds || 0))}</div>
                    <div className="text-slate-400">time</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="min-w-0 space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-black text-slate-900">当前 Run</span>
              <StatusBadge status={detail.status || selectedRun?.status} />
              {loading ? <Loader2 size={15} className="animate-spin text-cyan-700" /> : null}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
              <div><span className="text-slate-500">Execution ID</span><div className="mt-1 break-all font-bold text-slate-900">{selectedRunId || '-'}</div></div>
              <div><span className="text-slate-500">Workspace</span><div className="mt-1 break-all font-bold text-slate-900">{selectedRun?.workspace_root || '-'}</div></div>
              <div><span className="text-slate-500">模型</span><div className="mt-1 font-bold text-slate-900">{detail.config?.model || selectedRun?.run_summary?.model || '-'}</div></div>
              <div><span className="text-slate-500">Thinking</span><div className="mt-1 font-bold text-slate-900">{detail.config?.thinking || selectedRun?.run_summary?.thinking || '-'}</div></div>
              <div><span className="text-slate-500">Atomic Work</span><div className="mt-1 break-all font-bold text-slate-900">{detail.atomic_work_path || '-'}</div></div>
              <div><span className="text-slate-500">最新活动</span><div className="mt-1 font-bold text-slate-900">{formatDateTime(detail.last_activity)}</div></div>
            </div>
            {detail.error ? (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                {String(detail.error)}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <MetricCard label="评审轮次" value={cycles.length} icon={<GitBranch size={15} />} />
            <MetricCard label="结果文件" value={results.length} icon={<FileSearch size={15} />} />
            <MetricCard label="最新问题" value={issues.length} icon={<AlertTriangle size={15} />} />
            <MetricCard label="会话记录" value={runSessions.length} icon={<TerminalSquare size={15} />} />
            <MetricCard label="撤回结果" value={removedResults.length} icon={<RotateCcw size={15} />} />
            <MetricCard label="扫描文件" value={runFiles.length} icon={<Archive size={15} />} />
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-sm font-black text-slate-900">评审循环</div>
            <div className="mt-3 space-y-2">
              {cycles.length === 0 ? <div className="text-sm text-slate-500">暂无 cycle 记录，任务可能仍在初始化或尚未开始评审。</div> : null}
              {visibleCycles.map((cycle: any) => {
                const cycleSessions = runSessions.filter((session: any) => Number(session?.cycle || 0) === Number(cycle.cycle || 0));
                return (
                  <details
                    key={cycle.cycle}
                    className="rounded-lg border border-slate-100 bg-slate-50 p-3"
                    open={expanded && cycle.cycle === latestCycle?.cycle}
                  >
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-black text-slate-900">Cycle {cycle.cycle}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${cycle.global_passed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          Global {cycle.global_passed ? 'passed' : 'needs work'}
                        </span>
                        {cycle.outcome ? <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-black text-slate-700">{cycle.outcome}</span> : null}
                        {cycle.workflow_mode ? <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-black text-cyan-700">{cycle.workflow_mode}</span> : null}
                        <span className="text-xs text-slate-500">{formatDateTime(cycle.timestamp)}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600 md:grid-cols-6">
                        <span>结果 {cycle.result_total || 0}</span>
                        <span>通过 {cycle.result_passed || 0}</span>
                        <span>失败 {cycle.result_failed || 0}</span>
                        <span>Removed {cycle.historical_removed_result_count || 0}</span>
                        <span>Issues {cycle.issue_count || 0}</span>
                        <span>Sessions {cycleSessions.length}</span>
                      </div>
                    </summary>

                    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
                      <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                        <div><span className="text-slate-500">失败范围</span><div className="mt-1 font-bold text-slate-900">{cycle.global_failure_scope || '-'}</div></div>
                        <div><span className="text-slate-500">未复审新结果</span><div className="mt-1 font-bold text-slate-900">{cycle.unreviewed_new_result_count || 0}</div></div>
                        <div><span className="text-slate-500">总结体积</span><div className="mt-1 font-bold text-slate-900">{cycle.summary_size || 0}</div></div>
                        <div><span className="text-slate-500">Plateau</span><div className="mt-1 font-bold text-slate-900">{cycle.plateau_status?.stagnant ? `streak ${cycle.plateau_status?.streak || 0}` : 'no'}</div></div>
                      </div>

                      {Object.keys(cycle.scores || {}).length ? (
                        <div>
                          <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">Metrics Scores</div>
                          <ScorePills scores={cycle.scores} />
                        </div>
                      ) : null}

                      {Object.keys(cycle.last_global_scores || {}).length ? (
                        <div>
                          <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">Last Global Scores</div>
                          <ScorePills scores={cycle.last_global_scores} />
                        </div>
                      ) : null}

                      {Array.isArray(cycle.issue_ids) && cycle.issue_ids.length ? (
                        <div>
                          <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">Issue IDs</div>
                          <FileTokenList values={cycle.issue_ids} tone="slate" />
                        </div>
                      ) : null}

                      {Array.isArray(cycle.issues) && cycle.issues.length ? (
                        <div>
                          <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">评审问题</div>
                          <IssueList issues={cycle.issues} />
                        </div>
                      ) : null}

                      {Array.isArray(cycle.global_reviews) && cycle.global_reviews.length ? (
                        <div>
                          <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">全局评审 JSON</div>
                          <div className="space-y-2">
                            {cycle.global_reviews.map((review: any) => (
                              <details key={`${cycle.cycle}-${review.path}`} className="rounded-lg border border-slate-200 bg-white p-3">
                                <summary className="cursor-pointer list-none">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-black text-slate-900">{review.advisor_id || '-'}</span>
                                    {review.role_name ? <span className="text-xs text-slate-500">{review.role_name}</span> : null}
                                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${review.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                      {review.verdict || (review.passed ? 'PASS' : 'FAIL')}
                                    </span>
                                    <span className="text-xs text-slate-500">{review.path}</span>
                                  </div>
                                </summary>
                                <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
                                  {Object.keys(review.scores || {}).length ? <ScorePills scores={review.scores} /> : null}
                                  {review.feedback_detail || review.feedback ? (
                                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                                      {review.feedback_detail || review.feedback}
                                    </pre>
                                  ) : null}
                                  {Array.isArray(review.issues) && review.issues.length ? <IssueList issues={review.issues} /> : null}
                                  <details>
                                    <summary className="cursor-pointer text-xs font-black text-cyan-700">查看评审 JSON</summary>
                                    <div className="mt-2"><JsonBlock value={review} maxHeight="max-h-[420px]" /></div>
                                  </details>
                                </div>
                              </details>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {Array.isArray(cycle.result_reviews) && cycle.result_reviews.length ? (
                        <div>
                          <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">结果评审 JSON</div>
                          <div className="space-y-2">
                            {cycle.result_reviews.map((review: any) => (
                              <details key={`${cycle.cycle}-${review.path}`} className="rounded-lg border border-slate-200 bg-white p-3">
                                <summary className="cursor-pointer list-none">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="break-all text-sm font-black text-slate-900">{review.result_file || '-'}</span>
                                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${review.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                      {review.verdict || (review.passed ? 'PASS' : 'FAIL')}
                                    </span>
                                    <span className="text-xs text-slate-500">conf {Number(review.confidence || 0).toFixed(2)}</span>
                                    <span className="text-xs text-slate-500">{review.path}</span>
                                  </div>
                                </summary>
                                <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
                                  {Object.keys(review.scores || {}).length ? <ScorePills scores={review.scores} /> : null}
                                  {review.feedback_detail || review.feedback ? (
                                    <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                                      {review.feedback_detail || review.feedback}
                                    </pre>
                                  ) : null}
                                  <details>
                                    <summary className="cursor-pointer text-xs font-black text-cyan-700">查看评审 JSON</summary>
                                    <div className="mt-2"><JsonBlock value={review} maxHeight="max-h-[360px]" /></div>
                                  </details>
                                </div>
                              </details>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {cycleSessions.length ? (
                        <div>
                          <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">本轮会话</div>
                          <div className="space-y-2">
                            {cycleSessions.map((session: any) => (
                              <div key={session.session_id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-black text-slate-900">{sessionKindLabel(session.kind)}</span>
                                  <span className="text-slate-500">{session.session_id}</span>
                                  {session.result_file ? <span className="rounded-full bg-slate-100 px-2 py-0.5 font-black text-slate-700">{session.result_file}</span> : null}
                                  {session.advisor_id ? <span className="rounded-full bg-slate-100 px-2 py-0.5 font-black text-slate-700">{session.advisor_id}</span> : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {cycle.summary_snapshot ? (
                        <details className="rounded-lg border border-slate-200 bg-white p-3">
                          <summary className="cursor-pointer text-sm font-black text-slate-900">Summary 快照</summary>
                          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                            {cycle.summary_snapshot}
                          </pre>
                        </details>
                      ) : null}

                      {cycle.previous_limitations_snapshot ? (
                        <details className="rounded-lg border border-slate-200 bg-white p-3">
                          <summary className="cursor-pointer text-sm font-black text-slate-900">Previous Limitations 快照</summary>
                          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                            {cycle.previous_limitations_snapshot}
                          </pre>
                        </details>
                      ) : null}

                      {cycle.reflection ? (
                        <details className="rounded-lg border border-slate-200 bg-white p-3">
                          <summary className="cursor-pointer text-sm font-black text-slate-900">Reflection / 自审</summary>
                          <div className="mt-3 space-y-3">
                            {cycle.reflection?.data?.response ? (
                              <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                                {String(cycle.reflection.data.response)}
                              </pre>
                            ) : null}
                            <JsonBlock value={cycle.reflection} maxHeight="max-h-[420px]" />
                          </div>
                        </details>
                      ) : null}

                      {isPlainObject(cycle.checkpoints) && Object.keys(cycle.checkpoints).length ? (
                        <details className="rounded-lg border border-slate-200 bg-white p-3">
                          <summary className="cursor-pointer text-sm font-black text-slate-900">Checkpoints</summary>
                          <div className="mt-3 space-y-3">
                            <div className="flex flex-wrap gap-2 text-xs">
                              {Object.entries(cycle.checkpoints).map(([phase, items]) => (
                                <span key={phase} className="rounded-full bg-slate-100 px-2 py-1 font-black text-slate-700">
                                  {phase}: {Array.isArray(items) ? items.length : 0}
                                </span>
                              ))}
                            </div>
                            <JsonBlock value={cycle.checkpoints} maxHeight="max-h-[420px]" />
                          </div>
                        </details>
                      ) : null}
                    </div>
                  </details>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-sm font-black text-slate-900">漏洞结果</div>
            <div className="mt-3 space-y-2">
              {results.length === 0 ? <div className="text-sm text-slate-500">暂无 result_*.md。</div> : null}
              {visibleResults.map((result: any) => (
                <details key={result.path || result.filename} className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="break-all text-sm font-black text-slate-900">{result.filename}</span>
                      {result.title ? <span className="text-xs text-slate-500">{result.title}</span> : null}
                      {typeof result.passed === 'boolean' ? (
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${result.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                          {result.verdict || (result.passed ? 'review passed' : 'needs fix')}
                        </span>
                      ) : null}
                      {result.role ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-700">{result.role}</span> : null}
                      {result.delivery_bucket ? <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-black text-sky-700">{result.delivery_bucket}</span> : null}
                      {result.taskable === false ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-black text-amber-700">supplemental</span> : null}
                    </div>
                    <div className="mt-2 break-all text-xs text-slate-500">{result.path}</div>
                    {result.feedback || result.feedback_detail ? <div className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{result.feedback_detail || result.feedback}</div> : null}
                  </summary>

                  <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
                    <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                      <div><span className="text-slate-500">评审轮次</span><div className="mt-1 font-bold text-slate-900">{result.review_cycle || '-'}</div></div>
                      <div><span className="text-slate-500">Confidence</span><div className="mt-1 font-bold text-slate-900">{Number(result.confidence || 0).toFixed(2)}</div></div>
                      <div><span className="text-slate-500">Parser</span><div className="mt-1 font-bold text-slate-900">{result.parser_mode || '-'}</div></div>
                      <div><span className="text-slate-500">Schema</span><div className="mt-1 font-bold text-slate-900">{typeof result.schema_valid === 'boolean' ? (result.schema_valid ? 'valid' : 'repair') : '-'}</div></div>
                      <div><span className="text-slate-500">Lifecycle</span><div className="mt-1 font-bold text-slate-900">{result.lifecycle_status || '-'}</div></div>
                      <div><span className="text-slate-500">Related To</span><div className="mt-1 font-bold text-slate-900">{result.related_to || '-'}</div></div>
                      <div><span className="text-slate-500">评审 JSON</span><div className="mt-1 break-all font-bold text-slate-900">{result.review_path || '-'}</div></div>
                      <div><span className="text-slate-500">Task Output</span><div className="mt-1 break-all font-bold text-slate-900">{result.task_result_path || '-'}</div></div>
                      <div className="md:col-span-2"><span className="text-slate-500">Final Output</span><div className="mt-1 break-all font-bold text-slate-900">{result.final_output_path || '-'}</div></div>
                    </div>

                    {Array.isArray(result.vulnerability_headings) && result.vulnerability_headings.length ? (
                      <div>
                        <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">漏洞标题</div>
                        <FileTokenList values={result.vulnerability_headings} tone="rose" />
                      </div>
                    ) : null}

                    {Array.isArray(result.inference_signals) && result.inference_signals.length ? (
                      <div>
                        <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">Manifest Signals</div>
                        <FileTokenList values={result.inference_signals} tone="amber" />
                      </div>
                    ) : null}

                    {result.feedback_detail || result.feedback ? (
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                        {result.feedback_detail || result.feedback}
                      </pre>
                    ) : null}

                    <details>
                      <summary className="cursor-pointer text-xs font-black text-cyan-700">查看结果元数据</summary>
                      <div className="mt-2"><JsonBlock value={result} maxHeight="max-h-[360px]" /></div>
                    </details>
                  </div>
                </details>
              ))}

              {visibleRemovedResults.length ? (
                <div className="pt-3">
                  <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">已迁移 / 撤回结果</div>
                  <div className="space-y-2">
                    {visibleRemovedResults.map((result: any) => (
                      <details key={`${result.meta_path}-${result.filename}`} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                        <summary className="cursor-pointer list-none">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-black text-slate-900">{result.filename}</span>
                            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-black text-rose-700">{result.lifecycle_status || 'inactive'}</span>
                            <span className="text-xs text-slate-500">cycle {result.cycle || '-'}</span>
                          </div>
                          {result.reason ? <div className="mt-2 line-clamp-2 text-xs text-slate-600">{result.reason}</div> : null}
                        </summary>
                        <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
                          <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                            <div><span className="text-slate-500">结果文件</span><div className="mt-1 break-all font-bold text-slate-900">{result.path || '-'}</div></div>
                            <div><span className="text-slate-500">迁移元数据</span><div className="mt-1 break-all font-bold text-slate-900">{result.meta_path || '-'}</div></div>
                          </div>
                          {Array.isArray(result.signals) && result.signals.length ? <FileTokenList values={result.signals} tone="amber" /> : null}
                          {result.reason ? (
                            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-700">
                              {result.reason}
                            </pre>
                          ) : null}
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-sm font-black text-slate-900">会话与调用</div>
            <div className="mt-3 space-y-2">
              {runSessions.length === 0 ? <div className="text-sm text-slate-500">暂无 session 文件。</div> : null}
              {visibleSessions.map((session: any) => (
                <details key={`${session.session_id}-${session.jsonl_path || session.format}`} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black text-slate-900">{session.session_id}</span>
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-black text-slate-700">{sessionKindLabel(session.kind)}</span>
                      {session.cycle ? <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-black text-cyan-700">cycle {session.cycle}</span> : null}
                      {session.result_file ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-black text-amber-700">{session.result_file}</span> : null}
                      {session.advisor_id ? <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-black text-violet-700">{session.advisor_id}</span> : null}
                      {session.status ? <StatusBadge status={session.status} /> : null}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600 md:grid-cols-6">
                      <span>格式 {session.format || '-'}</span>
                      <span>Calls {session.call_count || session.calls?.length || 0}</span>
                      <span>Completed {session.completed_calls || 0}</span>
                      <span>Failed {session.failed_calls || 0}</span>
                      <span>Prompt {formatSize(Number(session.total_prompt_len || 0))}</span>
                      <span>Output {formatSize(Number(session.total_output_len || 0))}</span>
                    </div>
                  </summary>

                  <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
                    <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                      <div><span className="text-slate-500">Worker / Target</span><div className="mt-1 break-all font-bold text-slate-900">{session.worker_id || '-'}</div></div>
                      <div><span className="text-slate-500">模型</span><div className="mt-1 font-bold text-slate-900">{session.model || '-'}</div></div>
                      <div><span className="text-slate-500">Thinking</span><div className="mt-1 font-bold text-slate-900">{session.thinking || '-'}</div></div>
                      <div><span className="text-slate-500">工具集</span><div className="mt-1 break-all font-bold text-slate-900">{session.tools || '-'}</div></div>
                      <div><span className="text-slate-500">开始</span><div className="mt-1 font-bold text-slate-900">{formatDateTime(session.started_at)}</div></div>
                      <div><span className="text-slate-500">结束</span><div className="mt-1 font-bold text-slate-900">{formatDateTime(session.finished_at)}</div></div>
                      <div><span className="text-slate-500">总耗时</span><div className="mt-1 font-bold text-slate-900">{formatMilliseconds(session.total_duration_ms)}</div></div>
                      <div><span className="text-slate-500">Heartbeat</span><div className="mt-1 font-bold text-slate-900">{formatDateTime(session.latest_heartbeat)}</div></div>
                    </div>

                    {Array.isArray(session.jsonl_files) && session.jsonl_files.length ? (
                      <div>
                        <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">JSONL 会话文件</div>
                        <FileTokenList values={session.jsonl_files} tone="sky" />
                      </div>
                    ) : null}

                    {Array.isArray(session.calls) && session.calls.length ? (
                      <div className="space-y-2">
                        <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Calls</div>
                        {session.calls.map((call: any) => (
                          <details key={`${session.session_id}-${call.call_id}`} className="rounded-lg border border-slate-200 bg-white p-3">
                            <summary className="cursor-pointer list-none">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-black text-slate-900">#{call.turn || '-'} {call.call_id}</span>
                                {call.agent_id ? <span className="text-xs text-slate-500">{call.agent_id}</span> : null}
                                {call.status ? <StatusBadge status={call.status} /> : null}
                                <span className="text-xs text-slate-500">{formatMilliseconds(call.duration_ms)}</span>
                                <span className="text-xs text-slate-500">prompt {formatSize(Number(call.user_prompt_len || 0) + Number(call.sys_prompt_len || 0))}</span>
                                <span className="text-xs text-slate-500">output {formatSize(Number(call.output_total_bytes || call.output_len || 0))}</span>
                                <span className="text-xs text-slate-500">events {call.event_total_count || call.event_count || 0}</span>
                              </div>
                            </summary>
                            <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
                              <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                                <div><span className="text-slate-500">模型</span><div className="mt-1 font-bold text-slate-900">{call.model || '-'}</div></div>
                                <div><span className="text-slate-500">Thinking</span><div className="mt-1 font-bold text-slate-900">{call.thinking || '-'}</div></div>
                                <div><span className="text-slate-500">Mode</span><div className="mt-1 font-bold text-slate-900">{call.mode || '-'}</div></div>
                                <div><span className="text-slate-500">Runtime</span><div className="mt-1 font-bold text-slate-900">{call.runtime || '-'}</div></div>
                                <div><span className="text-slate-500">Started</span><div className="mt-1 font-bold text-slate-900">{formatDateTime(call.started_at)}</div></div>
                                <div><span className="text-slate-500">Finished</span><div className="mt-1 font-bold text-slate-900">{formatDateTime(call.finished_at)}</div></div>
                                <div><span className="text-slate-500">Conversation</span><div className="mt-1 break-all font-bold text-slate-900">{call.conversation_id || '-'}</div></div>
                                <div><span className="text-slate-500">Trace</span><div className="mt-1 font-bold text-slate-900">{call.trace_truncated ? 'truncated' : 'complete'}</div></div>
                              </div>

                              {call.command_display ? (
                                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                                  {call.command_display}
                                </pre>
                              ) : null}

                              {isPlainObject(call.files) && Object.keys(call.files).length ? (
                                <div>
                                  <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">Call Files</div>
                                  <FileTokenList values={Object.entries(call.files).map(([key, value]) => `${key}: ${value}`)} tone="slate" />
                                </div>
                              ) : null}

                              {(call.error || isPlainObject(call.token_usage) || (Array.isArray(call.attempts) && call.attempts.length)) ? (
                                <details>
                                  <summary className="cursor-pointer text-xs font-black text-cyan-700">查看调用细节</summary>
                                  <div className="mt-2 space-y-2">
                                    {call.error ? (
                                      <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                                        {String(call.error)}
                                      </div>
                                    ) : null}
                                    <JsonBlock
                                      value={{
                                        token_usage: call.token_usage || {},
                                        attempts: call.attempts || [],
                                        heartbeat: call.heartbeat || {},
                                        raw: call,
                                      }}
                                      maxHeight="max-h-[360px]"
                                    />
                                  </div>
                                </details>
                              ) : null}
                            </div>
                          </details>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </details>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-sm font-black text-slate-900">过程账本与文档</div>
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="text-slate-500">Taskable Results</div>
                    <div className="mt-1 font-black text-slate-900">{manifestSummary.taskable_result_count || 0}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="text-slate-500">Supplements</div>
                    <div className="mt-1 font-black text-slate-900">{manifestSummary.supplemental_result_count || 0}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="text-slate-500">Excluded</div>
                    <div className="mt-1 font-black text-slate-900">{manifestSummary.excluded_result_count || 0}</div>
                  </div>
                </div>

                {Object.keys(fileCategoryCounts).length ? (
                  <div>
                    <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">文件分类</div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(fileCategoryCounts).map(([key, value]) => (
                        <span key={key} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-700">
                          {key}: {String(value)}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {visibleTransitions.length ? (
                  <details className="rounded-lg border border-slate-200 bg-slate-50 p-3" open={expanded}>
                    <summary className="cursor-pointer text-sm font-black text-slate-900">状态迁移</summary>
                    <div className="mt-3 space-y-2">
                      {visibleTransitions.map((item: any, index: number) => (
                        <div key={`${item.timestamp || index}-${item.current_state || index}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-black text-slate-900">{item.previous_state || '-'}</span>
                            <ChevronRight size={12} className="text-slate-400" />
                            <span className="font-black text-slate-900">{item.current_state || '-'}</span>
                            <span className="text-slate-500">{formatDateTime(item.timestamp)}</span>
                          </div>
                          {item.detail ? <div className="mt-1 text-slate-600">{item.detail}</div> : null}
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}

                {Object.keys(currentStep).length ? (
                  <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <summary className="cursor-pointer text-sm font-black text-slate-900">Current Step</summary>
                    <div className="mt-3"><JsonBlock value={currentStep} maxHeight="max-h-[280px]" /></div>
                  </details>
                ) : null}

                {Object.keys(nextTasks).length ? (
                  <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <summary className="cursor-pointer text-sm font-black text-slate-900">Task Queue / next_tasks.json</summary>
                    <div className="mt-3 space-y-3">
                      {visibleTaskOutputs.length ? (
                        <div>
                          <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">task_result_*.md</div>
                          <FileTokenList values={visibleTaskOutputs.map((file: any) => file.path)} tone="sky" />
                        </div>
                      ) : null}
                      <JsonBlock value={nextTasks} maxHeight="max-h-[280px]" />
                    </div>
                  </details>
                ) : null}

                {Object.keys(finalOutputIndex).length || Object.keys(finalOutputRelations).length ? (
                  <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <summary className="cursor-pointer text-sm font-black text-slate-900">Final Output 索引</summary>
                    <div className="mt-3 space-y-2">
                      {Object.keys(finalOutputIndex).length ? <JsonBlock value={finalOutputIndex} maxHeight="max-h-[260px]" /> : null}
                      {Object.keys(finalOutputRelations).length ? <JsonBlock value={finalOutputRelations} maxHeight="max-h-[260px]" /> : null}
                    </div>
                  </details>
                ) : null}

                {visibleSupportingDocs.length || visibleFinalSupportingDocs.length ? (
                  <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <summary className="cursor-pointer text-sm font-black text-slate-900">Supporting Docs</summary>
                    <div className="mt-3 space-y-3">
                      {visibleSupportingDocs.length ? (
                        <div>
                          <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">运行中目录</div>
                          <FileTokenList values={visibleSupportingDocs.map((file: any) => file.path)} tone="slate" />
                        </div>
                      ) : null}
                      {visibleFinalSupportingDocs.length ? (
                        <div>
                          <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">final_output</div>
                          <FileTokenList values={visibleFinalSupportingDocs.map((file: any) => file.path)} tone="slate" />
                        </div>
                      ) : null}
                    </div>
                  </details>
                ) : null}

                {detail.raw?.previous_limitations_markdown ? (
                  <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <summary className="cursor-pointer text-sm font-black text-slate-900">previous_limitations.md</summary>
                    <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-700">
                      {String(detail.raw.previous_limitations_markdown)}
                    </pre>
                  </details>
                ) : null}

                {resultsArchive ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                    <div className="font-black text-slate-900">Archive</div>
                    <div className="mt-1 break-all text-slate-600">{resultsArchive.path}</div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-sm font-black text-slate-900">关键文件</div>
              <div className={`mt-3 ${expanded ? 'max-h-[760px]' : 'max-h-[560px]'} space-y-2 overflow-auto`}>
                {runFiles.length === 0 ? <div className="text-sm text-slate-500">暂无文件索引。</div> : null}
                {visibleFiles.map((file) => (
                  <div key={`${file.category}-${file.path}`} className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate font-semibold text-slate-700">{file.path}</span>
                      <span className="shrink-0 text-slate-400">{formatSize(file.size)}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">{file.category}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
            <div className="mb-3 text-sm font-black text-slate-100">Run Log</div>
            <pre className={`${expanded ? 'max-h-[560px]' : 'max-h-72'} overflow-auto whitespace-pre-wrap text-xs leading-5 text-slate-300`}>{runLog || '(no log file)'}</pre>
          </div>
          {expanded && runDetail ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="mb-3 text-sm font-black text-slate-900">Run 原始详情</div>
              <JsonBlock value={runDetail} maxHeight="max-h-[560px]" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const ScorePills: React.FC<{ scores: Record<string, any> }> = ({ scores }) => (
  <div className="flex flex-wrap gap-2">
    {Object.entries(scores).map(([key, value]) => (
      <span key={key} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-700">
        {key}: {typeof value === 'number' ? value.toFixed(2) : String(value)}
      </span>
    ))}
  </div>
);

const FileTokenList: React.FC<{ values: string[]; tone?: 'slate' | 'sky' | 'amber' | 'rose' }> = ({ values, tone = 'slate' }) => {
  const toneClass = tone === 'sky'
    ? 'bg-sky-50 text-sky-700'
    : tone === 'amber'
      ? 'bg-amber-50 text-amber-700'
      : tone === 'rose'
        ? 'bg-rose-50 text-rose-700'
        : 'bg-slate-100 text-slate-700';
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <span key={value} className={`rounded-full px-2 py-1 text-[11px] font-black ${toneClass}`}>
          {value}
        </span>
      ))}
    </div>
  );
};

const IssueList: React.FC<{ issues: Record<string, any>[] }> = ({ issues }) => (
  <div className="space-y-2">
    {issues.map((issue, index) => (
      <div key={`${issue.id || index}-${issue.target || index}`} className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {issue.id ? <span className="font-black text-slate-900">{issue.id}</span> : null}
          {issue.severity ? <span className="rounded-full bg-amber-50 px-2 py-0.5 font-black text-amber-700">{issue.severity}</span> : null}
          {issue.category ? <span className="rounded-full bg-slate-100 px-2 py-0.5 font-black text-slate-700">{issue.category}</span> : null}
          {issue.advisor_id ? <span className="text-slate-500">{issue.advisor_id}</span> : null}
        </div>
        {issue.target ? <div className="mt-2 text-slate-500">{issue.target}</div> : null}
        {issue.required_action || issue.detail ? (
          <div className="mt-2 whitespace-pre-wrap leading-5 text-slate-700">{issue.required_action || issue.detail}</div>
        ) : null}
      </div>
    ))}
  </div>
);

const TaskEvents: React.FC<{ events: DataflowScanTaskEvent[] }> = ({ events }) => {
  if (!events.length) return <EmptyPanel title="暂无事件" description="任务调度和执行事件会在这里按时间线展示。" icon={<TerminalSquare size={22} />} />;
  return (
    <div className="space-y-3">
      {events.map((event) => (
        <div key={event.event_id} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${EVENT_LEVEL_CLASS[event.level] || EVENT_LEVEL_CLASS.info}`}>
              {event.level}
            </span>
            <span className="text-sm font-black text-slate-900">{event.event_type}</span>
            {event.stage_id ? <span className="text-xs text-slate-500">stage {event.stage_id}</span> : null}
            {event.round_no ? <span className="text-xs text-slate-500">round {event.round_no}</span> : null}
            <span className="ml-auto text-xs text-slate-400">{formatDateTime(event.created_at)}</span>
          </div>
          <div className="mt-3 text-sm leading-6 text-slate-700">{event.message}</div>
          {event.payload_json && Object.keys(event.payload_json).length ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-black text-cyan-700">查看 payload</summary>
              <div className="mt-2"><JsonBlock value={event.payload_json} maxHeight="max-h-56" /></div>
            </details>
          ) : null}
        </div>
      ))}
    </div>
  );
};

const TaskAttempts: React.FC<{ attempts: DataflowScanTaskAttempt[] }> = ({ attempts }) => {
  if (!attempts.length) return <EmptyPanel title="暂无尝试记录" description="任务进入调度后会生成执行尝试。" icon={<History size={22} />} />;
  return (
    <div className="space-y-3">
      {attempts.map((attempt) => (
        <div key={attempt.execution_id} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-black text-slate-900">Attempt #{attempt.attempt_no}</span>
            <StatusBadge status={attempt.status} />
            <span className="ml-auto text-xs text-slate-400">{formatDateTime(attempt.updated_at)}</span>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
            <div><span className="text-slate-500">Execution ID</span><div className="mt-1 break-all font-bold text-slate-900">{attempt.execution_id}</div></div>
            <div><span className="text-slate-500">Worker</span><div className="mt-1 font-bold text-slate-900">{attempt.owner_pod_id || '-'}</div></div>
            <div><span className="text-slate-500">Workspace</span><div className="mt-1 break-all font-bold text-slate-900">{attempt.workspace_root || '-'}</div></div>
            <div><span className="text-slate-500">Output Manifest</span><div className="mt-1 break-all font-bold text-slate-900">{attempt.output_manifest_path || '-'}</div></div>
          </div>
          {attempt.message || attempt.recovery_reason ? (
            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{attempt.message || attempt.recovery_reason}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
};

const TaskArtifacts: React.FC<{ artifacts: DataflowTaskArtifacts | null }> = ({ artifacts }) => {
  const files = artifacts?.files || [];
  if (!files.length) return <EmptyPanel title="暂无产物" description="执行工作区中的结果、日志、配置和中间产物会列在这里。" icon={<Archive size={22} />} />;
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
        <div className="text-slate-500">Workspace</div>
        <div className="mt-1 break-all font-bold text-slate-900">{artifacts?.workspace_root || '-'}</div>
        <div className="mt-3 text-slate-500">Output Manifest</div>
        <div className="mt-1 break-all font-bold text-slate-900">{artifacts?.output_manifest_path || '-'}</div>
      </div>
      <div className="overflow-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
            <tr>
              <th className="px-4 py-3">文件路径</th>
              <th className="px-4 py-3">大小</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr key={file.path} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <FileCode2 size={15} className="text-slate-400" />
                    <span className="break-all font-semibold text-slate-800">{file.path}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{formatSize(file.size)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const TaskInput: React.FC<{ detail: DataflowScanTaskDetail | null }> = ({ detail }) => (
  <div className="space-y-4">
    <div>
      <div className="mb-2 text-sm font-black text-slate-900">任务 Markdown</div>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
        {detail?.task_markdown || '暂无任务输入。'}
      </pre>
    </div>
    <div>
      <div className="mb-2 text-sm font-black text-slate-900">附件引用</div>
      {(detail?.artifact_refs || []).length ? <JsonBlock value={detail?.artifact_refs} /> : <EmptyPanel title="未上传附件" description="这个任务没有携带文件附件。" />}
    </div>
    <div>
      <div className="mb-2 text-sm font-black text-slate-900">运行时覆盖</div>
      <JsonBlock value={detail?.runtime_overrides || {}} maxHeight="max-h-64" />
    </div>
    <div>
      <div className="mb-2 text-sm font-black text-slate-900">数据流任务元数据</div>
      <JsonBlock value={detail?.task_metadata || {}} maxHeight="max-h-80" />
    </div>
  </div>
);

const CreateTaskDialog: React.FC<{
  projectId: string;
  state: CreateTaskState;
  profiles: DataflowScanProfile[];
  profilesLoading: boolean;
  submitting: boolean;
  onChange: (state: CreateTaskState) => void;
  onClose: () => void;
  onSubmit: () => void;
}> = ({ projectId, state, profiles, profilesLoading, submitting, onChange, onClose, onSubmit }) => {
  const [pickerField, setPickerField] = useState<null | 'workspacePath' | 'dataFlowPath' | 'sourcePath'>(null);

  const pickerMode = pickerField === 'dataFlowPath' ? 'file' : 'directory';
  const pickerTitle = pickerField === 'workspacePath'
    ? '选择总工作目录'
    : pickerField === 'dataFlowPath'
      ? '选择数据流文件'
      : '选择代码目录';
  const pickerDescription = pickerField === 'workspacePath'
    ? '从数据流漏洞挖掘服务直接挂载的 /data 中选择每次执行的工作目录模板。系统会在该目录下按 execution_id 生成实际工作区。'
    : pickerField === 'dataFlowPath'
      ? '从数据流漏洞挖掘服务直接挂载的 /data 中选择数据流分析结果文件。'
      : '从数据流漏洞挖掘服务直接挂载的 /data 中选择要审计的代码目录。';

  return (
    <>
      <div className="fixed inset-0 z-[260] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
        <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-700">New Scan Task</div>
              <h3 className="mt-1 text-xl font-black text-slate-950">创建数据流漏洞挖掘任务</h3>
            </div>
            <button onClick={onClose} disabled={submitting} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40">
              <X size={18} />
            </button>
          </div>
          <div className="overflow-auto p-5">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <label className="lg:col-span-2">
                <span className="text-xs font-black text-slate-600">任务标题</span>
                <input
                  value={state.title}
                  onChange={(event) => onChange({ ...state, title: event.target.value })}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-cyan-600"
                />
              </label>
              <label>
                <span className="text-xs font-black text-slate-600">优先级</span>
                <input
                  type="number"
                  value={state.priority}
                  onChange={(event) => onChange({ ...state, priority: Number(event.target.value) || 0 })}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-cyan-600"
                />
              </label>
              <label className="lg:col-span-2">
                <span className="text-xs font-black text-slate-600">Profile</span>
                <select
                  value={state.profileId}
                  onChange={(event) => {
                    const profile = profiles.find((item) => item.profile_id === event.target.value);
                    const payload = normalizeConfigPayload(profile?.config_payload);
                    onChange({
                      ...state,
                      profileId: event.target.value,
                      model: payload.model,
                      thinking: payload.thinking,
                      reviewProfile: payload.review_profile || 'balanced',
                      maxReviewCycles: payload.max_review_cycles,
                      workerTimeout: payload.worker_timeout,
                      advisorTimeout: payload.advisor_timeout,
                      resultReviewConcurrency: payload.result_review_concurrency,
                    });
                  }}
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-cyan-600"
                >
                  <option value="">使用项目默认 Profile</option>
                  {profiles.map((profile) => (
                    <option key={profile.profile_id} value={profile.profile_id} disabled={!profile.enabled}>
                      {profile.name}{profile.is_default ? '（默认）' : ''}{profile.enabled ? '' : '（停用）'}
                    </option>
                  ))}
                </select>
                {profilesLoading ? (
                  <div className="mt-2 text-xs text-slate-500">Profile 列表加载中...</div>
                ) : null}
                {!profilesLoading && !profiles.some((profile) => profile.enabled) ? (
                  <div className="mt-2 text-xs text-slate-500">当前项目还没有可用 Profile，提交任务时系统会自动创建一个默认扫描 Profile。</div>
                ) : null}
              </label>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-sm font-black text-slate-900">
                  <FolderOpen size={16} />
                  总工作目录
                </div>
                <div className="mt-2 text-xs leading-5 text-slate-500">每次执行会在这个目录下按 execution_id 创建独立工作区。</div>
                <div className="mt-3 flex gap-2">
                  <input
                    value={state.workspacePath}
                    onChange={(event) => onChange({ ...state, workspacePath: event.target.value })}
                    placeholder="/case-a/workspace"
                    className={FORM_INPUT_CLASS}
                  />
                  <button type="button" onClick={() => setPickerField('workspacePath')} className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
                    选择
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-sm font-black text-slate-900">
                  <FileSearch size={16} />
                  数据流文件
                </div>
                <div className="mt-2 text-xs leading-5 text-slate-500">直接从项目文件资源中选择现有 `data_flow.md` 或其他分析结果文件。</div>
                <div className="mt-3 flex gap-2">
                  <input
                    value={state.dataFlowPath}
                    onChange={(event) => onChange({ ...state, dataFlowPath: event.target.value })}
                    placeholder="/case-a/data_flow.md"
                    className={FORM_INPUT_CLASS}
                  />
                  <button type="button" onClick={() => setPickerField('dataFlowPath')} className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
                    选择
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-sm font-black text-slate-900">
                  <FolderOpen size={16} />
                  代码目录
                </div>
                <div className="mt-2 text-xs leading-5 text-slate-500">从项目文件资源中选择包含待审计源码的目录。</div>
                <div className="mt-3 flex gap-2">
                  <input
                    value={state.sourcePath}
                    onChange={(event) => onChange({ ...state, sourcePath: event.target.value })}
                    placeholder="/case-a/source"
                    className={FORM_INPUT_CLASS}
                  />
                  <button type="button" onClick={() => setPickerField('sourcePath')} className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
                    选择
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-4">
              <label>
                <span className="text-xs font-black text-slate-600">模型</span>
                <input value={state.model} onChange={(event) => onChange({ ...state, model: event.target.value })} className={FORM_INPUT_CLASS} />
              </label>
              <label>
                <span className="text-xs font-black text-slate-600">Provider（可选）</span>
                <input value={state.provider} onChange={(event) => onChange({ ...state, provider: event.target.value })} placeholder="openai / anthropic" className={FORM_INPUT_CLASS} />
              </label>
              <label>
                <span className="text-xs font-black text-slate-600">Thinking Level</span>
                <select value={state.thinking} onChange={(event) => onChange({ ...state, thinking: event.target.value })} className={FORM_INPUT_CLASS}>
                  {THINKING_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label>
                <span className="text-xs font-black text-slate-600">Review Profile</span>
                <select value={state.reviewProfile} onChange={(event) => onChange({ ...state, reviewProfile: event.target.value })} className={FORM_INPUT_CLASS}>
                  {REVIEW_PROFILE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label>
                <span className="text-xs font-black text-slate-600">最大评审轮次</span>
                <input type="number" value={state.maxReviewCycles} onChange={(event) => onChange({ ...state, maxReviewCycles: Number(event.target.value) || 1 })} className={FORM_INPUT_CLASS} />
              </label>
              <label>
                <span className="text-xs font-black text-slate-600">结果评审并发</span>
                <input type="number" value={state.resultReviewConcurrency} onChange={(event) => onChange({ ...state, resultReviewConcurrency: Number(event.target.value) || 1 })} className={FORM_INPUT_CLASS} />
              </label>
              <label>
                <span className="text-xs font-black text-slate-600">Worker Timeout</span>
                <input type="number" value={state.workerTimeout} onChange={(event) => onChange({ ...state, workerTimeout: Number(event.target.value) || 60 })} className={FORM_INPUT_CLASS} />
              </label>
              <label>
                <span className="text-xs font-black text-slate-600">Advisor Timeout</span>
                <input type="number" value={state.advisorTimeout} onChange={(event) => onChange({ ...state, advisorTimeout: Number(event.target.value) || 60 })} className={FORM_INPUT_CLASS} />
              </label>
            </div>

            <div className="mt-4">
              <label>
                <span className="text-xs font-black text-slate-600">运行时覆盖 JSON</span>
                <textarea
                  value={state.runtimeOverridesText}
                  onChange={(event) => onChange({ ...state, runtimeOverridesText: event.target.value })}
                  placeholder={'{\n  "global": { "max_review_cycles": 4 }\n}'}
                  className="mt-2 min-h-[150px] w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs leading-5 text-slate-800 outline-none focus:border-cyan-600"
                />
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t border-slate-200 px-5 py-4">
            <button onClick={onClose} disabled={submitting} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-40">取消</button>
            <button onClick={onSubmit} disabled={submitting} className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-black text-white disabled:opacity-50">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              提交任务
            </button>
          </div>
        </div>
      </div>

      <ProjectFilesystemPickerModal
        isOpen={Boolean(pickerField)}
        projectId={projectId}
        selectionMode={pickerMode}
        backend="dataflowVulnScanner"
        title={pickerTitle}
        description={pickerDescription}
        onClose={() => setPickerField(null)}
        onSelect={(selection) => {
          if (!pickerField) return;
          onChange({ ...state, [pickerField]: selection.path });
          setPickerField(null);
        }}
      />
    </>
  );
};

interface ProfileFormState {
  profileId: string;
  name: string;
  description: string;
  templateKind: string;
  model: string;
  thinking: string;
  reviewProfile: string;
  maxReviewCycles: number;
  workerTimeout: number;
  advisorTimeout: number;
  resultReviewConcurrency: number;
  runtimeOverridesText: string;
  isDefault: boolean;
  enabled: boolean;
  maxConcurrency: number;
  defaultPriority: number;
  maxRetryCount: number;
  executionTimeoutSeconds: number;
}

const blankProfileForm = (): ProfileFormState => {
  const payload = defaultConfigPayload();
  return {
    profileId: '',
    name: '默认数据流漏洞挖掘模板',
    description: '面向数据流分析结果的漏洞挖掘与评审闭环模板',
    templateKind: 'vuln_scan_default',
    model: payload.model,
    thinking: payload.thinking,
    reviewProfile: payload.review_profile || 'balanced',
    maxReviewCycles: payload.max_review_cycles,
    workerTimeout: payload.worker_timeout,
    advisorTimeout: payload.advisor_timeout,
    resultReviewConcurrency: payload.result_review_concurrency,
    runtimeOverridesText: '{}',
    isDefault: true,
    enabled: true,
    maxConcurrency: 1,
    defaultPriority: 100,
    maxRetryCount: 3,
    executionTimeoutSeconds: 7200,
  };
};

const formFromProfile = (profile: DataflowScanProfile): ProfileFormState => {
  const payload = normalizeConfigPayload(profile.config_payload);
  return {
    profileId: profile.profile_id,
    name: profile.name,
    description: profile.description || '',
    templateKind: profile.template_kind || 'vuln_scan_default',
    model: payload.model,
    thinking: payload.thinking,
    reviewProfile: payload.review_profile || 'balanced',
    maxReviewCycles: payload.max_review_cycles,
    workerTimeout: payload.worker_timeout,
    advisorTimeout: payload.advisor_timeout,
    resultReviewConcurrency: payload.result_review_concurrency,
    runtimeOverridesText: JSON.stringify(payload.runtime_overrides || {}, null, 2),
    isDefault: profile.is_default,
    enabled: profile.enabled,
    maxConcurrency: profile.max_concurrency,
    defaultPriority: profile.default_priority,
    maxRetryCount: profile.max_retry_count,
    executionTimeoutSeconds: profile.execution_timeout_seconds,
  };
};

const profilePayloadFromForm = (projectId: string, form: ProfileFormState) => ({
  project_id: projectId,
  name: form.name.trim(),
  description: form.description.trim() || undefined,
  template_kind: form.templateKind,
  config_payload: {
    model: form.model.trim(),
    thinking: form.thinking,
    review_profile: form.reviewProfile,
    max_review_cycles: form.maxReviewCycles,
    worker_timeout: form.workerTimeout,
    advisor_timeout: form.advisorTimeout,
    result_review_concurrency: form.resultReviewConcurrency,
    runtime_overrides: parseJsonObject(form.runtimeOverridesText, 'Profile runtime_overrides'),
  },
  is_default: form.isDefault,
  enabled: form.enabled,
  max_concurrency: form.maxConcurrency,
  default_priority: form.defaultPriority,
  max_retry_count: form.maxRetryCount,
  execution_timeout_seconds: form.executionTimeoutSeconds,
});

export const DataflowVulnConfigPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const executionApi = api.domains.execution.dataflowVulnScanner;
  const { notify, confirm, feedbackNodes } = useUiFeedback();
  const [profiles, setProfiles] = useState<DataflowScanProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [form, setForm] = useState<ProfileFormState>(blankProfileForm);
  const [versions, setVersions] = useState<any[]>([]);
  const [workers, setWorkers] = useState<DataflowSchedulerWorker[]>([]);
  const [effectiveConfig, setEffectiveConfig] = useState<any>(null);
  const [serviceConfig, setServiceConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [profileResp, projectConfigResp, serviceConfigResp, workerResp] = await Promise.all([
        executionApi.listProfiles(projectId),
        executionApi.getProjectEffectiveConfig(projectId).catch(() => null),
        executionApi.getServiceEffectiveConfig().catch(() => null),
        executionApi.listWorkers().catch(() => []),
      ]);
      setProfiles(profileResp || []);
      setEffectiveConfig(projectConfigResp);
      setServiceConfig(serviceConfigResp);
      setWorkers(workerResp || []);
      const nextProfile = profileResp.find((item) => item.profile_id === selectedProfileId) || profileResp.find((item) => item.is_default) || profileResp[0];
      if (nextProfile) {
        setSelectedProfileId(nextProfile.profile_id);
        setForm(formFromProfile(nextProfile));
      } else {
        setSelectedProfileId('');
        setForm(blankProfileForm());
      }
    } catch (error: any) {
      notify(`加载系统配置失败: ${error?.message || error}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadVersions = async (profileId: string) => {
    if (!profileId) {
      setVersions([]);
      return;
    }
    try {
      setVersions(await executionApi.listProfileVersions(profileId));
    } catch {
      setVersions([]);
    }
  };

  useEffect(() => {
    void load();
  }, [projectId]);

  useEffect(() => {
    void loadVersions(selectedProfileId);
  }, [selectedProfileId]);

  const selectedProfile = profiles.find((profile) => profile.profile_id === selectedProfileId);

  const saveProfile = async () => {
    if (!projectId) {
      notify('请先选择项目', 'warning');
      return;
    }
    if (!form.name.trim() || !form.model.trim()) {
      notify('Profile 名称和模型不能为空', 'warning');
      return;
    }
    setSaving(true);
    try {
      const payload = profilePayloadFromForm(projectId, form);
      const saved = form.profileId
        ? await executionApi.updateProfile(form.profileId, payload)
        : await executionApi.createProfile(payload);
      notify('Profile 已保存', 'success');
      setSelectedProfileId(saved.profile_id);
      await load();
      await loadVersions(saved.profile_id);
    } catch (error: any) {
      notify(error?.message || '保存 Profile 失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleProfile = async (profile: DataflowScanProfile) => {
    try {
      if (profile.enabled) {
        const ok = await confirm({
          title: '停用 Profile',
          message: `确认停用 ${profile.name}？已绑定任务不会被删除，但后续默认选择会跳过它。`,
          confirmText: '停用',
          danger: true,
        });
        if (!ok) return;
        await executionApi.disableProfile(profile.profile_id);
      } else {
        await executionApi.enableProfile(profile.profile_id);
      }
      notify(profile.enabled ? 'Profile 已停用' : 'Profile 已启用', 'success');
      await load();
    } catch (error: any) {
      notify(error?.message || '更新 Profile 状态失败', 'error');
    }
  };

  const setDefaultProfile = async (profile: DataflowScanProfile) => {
    try {
      await executionApi.setDefaultProfile(profile.profile_id);
      notify('默认 Profile 已更新', 'success');
      await load();
    } catch (error: any) {
      notify(error?.message || '设置默认 Profile 失败', 'error');
    }
  };

  const setWorkerState = async (worker: DataflowSchedulerWorker, state: 'active' | 'draining') => {
    try {
      if (state === 'active') await executionApi.activateWorker(worker.pod_id);
      else await executionApi.drainWorker(worker.pod_id);
      notify('Worker 状态已更新', 'success');
      setWorkers(await executionApi.listWorkers());
    } catch (error: any) {
      notify(error?.message || '更新 Worker 失败', 'error');
    }
  };

  return (
    <div className="min-h-full bg-slate-100 px-5 py-5 text-slate-900 lg:px-8 lg:py-7">
      {feedbackNodes}
      <div className="mx-auto max-w-[1800px] space-y-4">
        <PageHeader
          eyebrow="Scanner Configuration"
          title="漏洞挖掘系统配置"
          description="维护项目级扫描 Profile、运行参数、默认模板、版本快照和调度 Worker，确保任务提交后能稳定进入执行队列。"
        >
          <button
            onClick={() => {
              setSelectedProfileId('');
              setForm(blankProfileForm());
              setVersions([]);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            <Plus size={16} />
            新建 Profile
          </button>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            刷新
          </button>
          <button
            onClick={() => void saveProfile()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-cyan-800 disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            保存
          </button>
        </PageHeader>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label="Profile 数" value={profiles.length} icon={<SlidersHorizontal size={17} />} />
          <MetricCard label="启用模板" value={profiles.filter((profile) => profile.enabled).length} icon={<CheckCircle2 size={17} />} />
          <MetricCard label="Worker" value={workers.length} icon={<ServerCog size={17} />} />
          <MetricCard label="默认 Profile" value={effectiveConfig?.default_profile_id ? shortId(effectiveConfig.default_profile_id, 14) : '-'} icon={<ShieldCheck size={17} />} />
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(680px,1fr)_420px]">
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-3 text-sm font-black text-slate-900">Profile 列表</div>
              <div className="max-h-[640px] overflow-auto p-2">
                {profiles.map((profile) => (
                  <button
                    key={profile.profile_id}
                    onClick={() => {
                      setSelectedProfileId(profile.profile_id);
                      setForm(formFromProfile(profile));
                    }}
                    className={`mb-2 w-full rounded-lg border p-3 text-left transition ${
                      profile.profile_id === selectedProfileId ? 'border-cyan-300 bg-cyan-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-black text-slate-900">{profile.name}</span>
                      {profile.is_default ? <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-black text-cyan-700">默认</span> : null}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                      <span>v{profile.version}</span>
                      <span>{profile.template_kind}</span>
                      <span className={profile.enabled ? 'text-emerald-600' : 'text-rose-600'}>{profile.enabled ? '启用' : '停用'}</span>
                    </div>
                  </button>
                ))}
                {!loading && profiles.length === 0 ? <EmptyPanel title="暂无 Profile" description="创建第一个扫描 Profile 后即可提交任务。" /> : null}
                {loading ? <div className="p-3 text-sm text-slate-500">加载中...</div> : null}
              </div>
            </div>

            {selectedProfile ? (
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => void setDefaultProfile(selectedProfile)}
                    disabled={selectedProfile.is_default}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-40"
                  >
                    设为默认
                  </button>
                  <button
                    onClick={() => void toggleProfile(selectedProfile)}
                    className={`rounded-lg px-3 py-2 text-xs font-black ${
                      selectedProfile.enabled ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}
                  >
                    {selectedProfile.enabled ? '停用' : '启用'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="text-sm font-black text-slate-900">{form.profileId ? '编辑 Profile' : '新建 Profile'}</div>
              <div className="mt-1 text-xs text-slate-500">{form.profileId || '尚未保存'}</div>
            </div>
            <div className="space-y-5 p-5">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Field label="名称">
                  <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={FORM_INPUT_CLASS} />
                </Field>
                <Field label="模板类型">
                  <select value={form.templateKind} onChange={(event) => setForm({ ...form, templateKind: event.target.value })} className={FORM_INPUT_CLASS}>
                    {TEMPLATE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </Field>
                <Field label="模型">
                  <input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} className={FORM_INPUT_CLASS} />
                </Field>
                <Field label="思考强度">
                  <select value={form.thinking} onChange={(event) => setForm({ ...form, thinking: event.target.value })} className={FORM_INPUT_CLASS}>
                    {THINKING_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </Field>
                <Field label="评审档位">
                  <select value={form.reviewProfile} onChange={(event) => setForm({ ...form, reviewProfile: event.target.value })} className={FORM_INPUT_CLASS}>
                    {REVIEW_PROFILE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </Field>
                <Field label="最大评审轮次">
                  <NumberInput value={form.maxReviewCycles} onChange={(value) => setForm({ ...form, maxReviewCycles: value })} />
                </Field>
                <Field label="结果评审并发">
                  <NumberInput value={form.resultReviewConcurrency} onChange={(value) => setForm({ ...form, resultReviewConcurrency: value })} />
                </Field>
                <Field label="Worker 超时秒数">
                  <NumberInput value={form.workerTimeout} onChange={(value) => setForm({ ...form, workerTimeout: value })} />
                </Field>
                <Field label="Advisor 超时秒数">
                  <NumberInput value={form.advisorTimeout} onChange={(value) => setForm({ ...form, advisorTimeout: value })} />
                </Field>
                <Field label="Profile 并发上限">
                  <NumberInput value={form.maxConcurrency} onChange={(value) => setForm({ ...form, maxConcurrency: value })} />
                </Field>
                <Field label="默认优先级">
                  <NumberInput value={form.defaultPriority} onChange={(value) => setForm({ ...form, defaultPriority: value })} />
                </Field>
                <Field label="最大重试次数">
                  <NumberInput value={form.maxRetryCount} onChange={(value) => setForm({ ...form, maxRetryCount: value })} />
                </Field>
                <Field label="执行超时秒数">
                  <NumberInput value={form.executionTimeoutSeconds} onChange={(value) => setForm({ ...form, executionTimeoutSeconds: value })} />
                </Field>
              </div>
              <Field label="描述">
                <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={`${FORM_INPUT_CLASS} min-h-[72px]`} />
              </Field>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-700">
                  <input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />
                  启用 Profile
                </label>
                <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-700">
                  <input type="checkbox" checked={form.isDefault} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })} />
                  设为项目默认
                </label>
              </div>
              <Field label="runtime_overrides JSON">
                <textarea
                  value={form.runtimeOverridesText}
                  onChange={(event) => setForm({ ...form, runtimeOverridesText: event.target.value })}
                  className={`${FORM_INPUT_CLASS} min-h-[180px] font-mono text-xs`}
                />
              </Field>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-3 text-sm font-black text-slate-900">调度 Worker</div>
              <div className="max-h-72 overflow-auto p-3">
                {workers.map((worker) => (
                  <div key={worker.pod_id} className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-slate-900">{worker.pod_id}</div>
                        <div className="mt-1 text-xs text-slate-500">{worker.host_name}</div>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-black ${worker.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {worker.status}
                      </span>
                    </div>
                    <div className="mt-3 text-xs text-slate-500">运行 {worker.running_count}/{worker.capacity} · 心跳 {formatDateTime(worker.last_heartbeat_at)}</div>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => void setWorkerState(worker, 'active')} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700">激活</button>
                      <button onClick={() => void setWorkerState(worker, 'draining')} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">排空</button>
                    </div>
                  </div>
                ))}
                {!workers.length ? <EmptyPanel title="暂无 Worker" description="调度器注册的 Worker 会显示在这里。" icon={<ServerCog size={22} />} /> : null}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-3 text-sm font-black text-slate-900">版本记录</div>
              <div className="max-h-72 overflow-auto p-3">
                {versions.map((version) => (
                  <div key={version.version_id} className="mb-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-black text-slate-900">v{version.version}</span>
                      <span className="text-xs text-slate-500">{formatDateTime(version.created_at)}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{version.created_by}</div>
                  </div>
                ))}
                {!versions.length ? <EmptyPanel title="暂无版本" description="保存 Profile 后会生成版本快照。" icon={<History size={22} />} /> : null}
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900"><Settings size={16} />项目有效配置</div>
            <JsonBlock value={effectiveConfig || {}} />
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900"><ServerCog size={16} />服务有效配置</div>
            <JsonBlock value={serviceConfig || {}} />
          </div>
        </section>
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="text-xs font-black text-slate-600">{label}</span>
    <div className="mt-2">{children}</div>
  </label>
);

const NumberInput: React.FC<{ value: number; onChange: (value: number) => void }> = ({ value, onChange }) => (
  <input
    type="number"
    value={value}
    onChange={(event) => onChange(Number(event.target.value) || 0)}
    className={FORM_INPUT_CLASS}
  />
);
