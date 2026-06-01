import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  FileSearch,
  FolderOpen,
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
  Trash2,
  X,
  XCircle,
} from 'lucide-react';

import { api } from '../../clients/api';
import { ServicePageTitle, useServiceBuildVersion } from '../../components/execution/ServiceBuildVersion';
import {
  DataflowAgentStateDir,
  DataflowInputRef,
  DataflowProfileConfigPayload,
  DataflowScanProfile,
  DataflowScanTask,
  DataflowScanTaskListItem,
  DataflowScanTaskStats,
  DataflowScanTaskDetail,
  DataflowCreateTaskPayload,
  DataflowServiceRuntimeConfig,
  DataflowVulnClusterCapacity,
  DataflowRunResolve,
} from '../../clients/dataflowVulnScanner';
import {
  DEFAULT_DATAFLOW_FILESERVER_RUNS_ROOT,
  DataflowFileserverRunSummary,
} from '../../clients/dataflowVulnRunsFileserver';
import { ProjectFilesystemPickerModal } from '../../components/assets/ProjectFilesystemPickerModal';
import { ExecutionTable, ExecutionTableHead, ExecutionTableTd, ExecutionTableTh, executionTableRowClassName } from '../../components/execution/ExecutionTable';
import { showConfirm } from '../../components/DialogService';
import { useUiFeedback } from '../../components/UiFeedback';
import { DataflowFileserverRunDashboardPage } from './DataflowFileserverRunDashboardPage';
import { StaticPipelineFlow } from './StaticPipelineFlow';
import { navigateBackByTaskOrigin, navigateBackToBinarySecurityTask } from '../../utils/executionReturnContext';

const STATUS_META: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  pending: { label: '待启动', className: 'bg-slate-100 text-slate-700 border-slate-200', icon: <Clock size={13} /> },
  queued: { label: '启动中', className: 'bg-sky-50 text-sky-700 border-sky-200', icon: <Clock size={13} /> },
  running: { label: '运行中', className: 'bg-cyan-50 text-cyan-700 border-cyan-200', icon: <Activity size={13} /> },
  cancel_requested: { label: '取消中', className: 'bg-amber-50 text-amber-700 border-amber-200', icon: <PauseCircle size={13} /> },
  delete_requested: { label: '删除中', className: 'bg-rose-50 text-rose-700 border-rose-200', icon: <PauseCircle size={13} /> },
  completed: { label: '已完成', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle2 size={13} /> },
  failed: { label: '失败', className: 'bg-rose-50 text-rose-700 border-rose-200', icon: <XCircle size={13} /> },
  interrupted: { label: '已中断', className: 'bg-orange-50 text-orange-700 border-orange-200', icon: <AlertTriangle size={13} /> },
  cancelled: { label: '已取消', className: 'bg-zinc-100 text-zinc-700 border-zinc-200', icon: <X size={13} /> },
};

const RUN_STATUS_FILTER_KEYS = [
  'pending',
  'queued',
  'running',
  'cancel_requested',
  'delete_requested',
  'completed',
  'failed',
  'interrupted',
  'cancelled',
];

const TASK_MODE_OPTIONS = [
  { value: '', label: '全部来源' },
  { value: 'manual', label: '手动任务' },
  { value: 'binary', label: '二进制模式' },
  { value: 'source', label: '源码模式' },
] as const;

const TASK_SORT_OPTIONS = [
  { value: 'created_at', label: '创建时间' },
  { value: 'updated_at', label: '更新时间' },
  { value: 'started_at', label: '开始时间' },
  { value: 'public_status', label: '状态' },
  { value: 'priority', label: '优先级' },
] as const;

type LocalTaskSortKey = 'started_at' | 'duration';
type LocalFilterOwner = 'slot' | 'status' | 'report' | 'model';

const REVIEW_PROFILE_OPTIONS = [
  { value: 'fast', label: '快速筛选' },
  { value: 'balanced', label: '平衡挖掘' },
  { value: 'audit', label: '深度审计' },
];
const REVIEW_PROFILE_DEFAULT_MAX_CYCLES: Record<string, number> = {
  fast: 1,
  balanced: 6,
  audit: 10,
};
const TEMPLATE_OPTIONS = [
  { value: 'vuln_scan_default', label: '单阶段漏洞挖掘' },
  { value: 'full_pipeline', label: '完整分析流水线' },
];
const DATAFLOW_VULN_FLOW = {
  title: '数据流漏洞挖掘阶段推进关系',
  subtitle: '展示漏洞挖掘微服务从 Profile 模板到结果评审与疑点上报的静态推进链路，帮助理解不同配置对扫描收敛的影响位置。',
  lanes: [
    {
      label: '扫描执行链路',
      steps: [
        { id: 'dfv-profile', title: 'Profile / 模板装载', desc: '装载项目默认或显式指定 Profile，并解析模板、模型与运行参数。', badge: '1', tone: 'guard' as const },
        { id: 'dfv-worker', title: 'Worker 挖掘', desc: '围绕数据流结果开展漏洞候选挖掘，输出 issue 与证据草稿。', badge: '2', tone: 'analysis' as const },
        { id: 'dfv-global-review', title: '全局评审', desc: 'Advisor / Global Review 判断候选质量、收敛方向和是否继续下一轮。', badge: '3', tone: 'review' as const },
        { id: 'dfv-result-review', title: '结果评审', desc: '对 issue 做并发结果复核，压缩误报并形成最终结论。', badge: '4', tone: 'review' as const },
        { id: 'dfv-report', title: '报告输出与上报', desc: '生成 Run 结果、漏洞报告，并在开启时向漏洞引擎上报疑点。', badge: '5', tone: 'artifact' as const },
      ],
    },
  ],
  notes: [
    {
      title: '模板差异',
      detail: '单阶段漏洞挖掘更聚焦直接 issue 产出；完整分析流水线会结合更多上下游结果与补充评审。',
      tone: 'analysis' as const,
    },
    {
      title: '评审与超时',
      detail: 'review_profile、max_review_cycles、timeout_max_retries 和 result_review_concurrency 共同影响候选收敛速度、稳定性与误报控制。',
      tone: 'review' as const,
    },
  ],
};
const FORM_INPUT_CLASS = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-cyan-600';
const DEFAULT_DATAFLOW_VULN_RUNS_ROOT = '/app/secflow-app-dataflow-vuln-scanner';
const DEFAULT_CREATE_TASK_MODEL = 'local_minimax/MiniMax/MiniMax-M2.5';
const TASK_PURPOSE_META: Record<string, { label: string; className: string }> = {
  normal: { label: '正常任务', className: 'border-slate-200 bg-slate-50 text-slate-700' },
  evolution: { label: '进化任务', className: 'border-amber-200 bg-amber-50 text-amber-700' },
};

const defaultConfigPayload = (): DataflowProfileConfigPayload => ({
  model: DEFAULT_CREATE_TASK_MODEL,
  review_profile: 'balanced',
  max_review_cycles: 6,
  worker_timeout: 3600,
  advisor_timeout: 3600,
  timeout_max_retries: 3,
  timeout_retry_interval_seconds: 30,
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

const formatThinking = (value?: string | null) => {
  const normalized = String(value || '').trim();
  return normalized || '不支持/未启用';
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

const fileserverTaskId = (runName: string) => `fileserver:${runName}`;
const isSyntheticFileserverTaskId = (value?: string | null) => String(value || '').startsWith('fileserver:');
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const TASK_RUN_ROUTE_CACHE_PREFIX = 'secflow:dataflowVuln:taskRunRoute:';
const DATAFLOW_VULN_LIST_RETURN_VIEW = 'pentest-exec-dataflow-vuln-task-list';

type CachedTaskRunRoute = {
  taskId: string;
  executionId: string;
  run_id: string;
  name: string;
  root_path: string;
  linked_task_id?: string | null;
};

type DataflowVulnRouteState = {
  fileserverRunSummary?: DataflowFileserverRunSummary;
  returnView?: typeof DATAFLOW_VULN_LIST_RETURN_VIEW;
};

const readCachedTaskRunRoute = (taskId: string, executionId = ''): CachedTaskRunRoute | null => {
  if (!taskId) return null;
  try {
    const raw = window.sessionStorage.getItem(`${TASK_RUN_ROUTE_CACHE_PREFIX}${taskId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedTaskRunRoute;
    if (!parsed || parsed.taskId !== taskId || !parsed.name || !parsed.root_path) return null;
    if (executionId && parsed.executionId && parsed.executionId !== executionId) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeCachedTaskRunRoute = (
  taskId: string,
  executionId: string | null | undefined,
  run: Pick<DataflowFileserverRunSummary, 'name' | 'run_id' | 'root_path'> & { linked_task_id?: string | null }
) => {
  if (!taskId || !run?.name || !run?.root_path) return;
  try {
    window.sessionStorage.setItem(`${TASK_RUN_ROUTE_CACHE_PREFIX}${taskId}`, JSON.stringify({
      taskId,
      executionId: executionId || '',
      run_id: run.run_id || '',
      name: run.name,
      root_path: run.root_path,
      linked_task_id: run.linked_task_id || null,
    } satisfies CachedTaskRunRoute));
  } catch {}
};

const buildRunDetailPath = (
  run: Pick<DataflowFileserverRunSummary, 'name' | 'run_id' | 'root_path'> & { linked_task_id?: string | null }
) => {
  const params = new URLSearchParams();
  const runId = run.run_id || '';
  if (runId) params.set('run_id', runId);
  if (run.linked_task_id) params.set('linked_task_id', run.linked_task_id);
  params.set('fileserver_run', run.name);
  params.set('fileserver_root', run.root_path || DEFAULT_DATAFLOW_FILESERVER_RUNS_ROOT);
  return `/pentest-exec-dataflow-vuln-task-detail/${encodeURIComponent(fileserverTaskId(run.name))}?${params.toString()}`;
};

const runResolveToRouteTarget = (resolved: DataflowRunResolve) => ({
  name: resolved.run_name,
  run_id: resolved.run_id || '',
  root_path: resolved.root_path || DEFAULT_DATAFLOW_FILESERVER_RUNS_ROOT,
  linked_task_id: resolved.linked_task_id || null,
});

const taskRunSummary = (task: DataflowScanTask): Partial<DataflowFileserverRunSummary> =>
  task.run && typeof task.run === 'object'
    ? task.run
    : (task.latest_run && typeof task.latest_run === 'object' ? task.latest_run : {});

const taskRunLocator = (task: DataflowScanTask): Partial<DataflowFileserverRunSummary> => {
  const summary = taskRunSummary(task);
  const explicitPath = String(task.run_path || '').trim();
  const pathParts = explicitPath.split('/').filter(Boolean);
  const pathName = pathParts[pathParts.length - 1] || '';
  const pathRoot = pathParts.length > 1 ? `/${pathParts.slice(0, -1).join('/')}` : '';
  return {
    ...summary,
    name: task.run_name || summary.name || pathName,
    root_path: task.runs_root || summary.root_path || pathRoot,
    path: task.run_path || summary.path || '',
    linked_task_id: task.task_id,
    linked_execution_id: task.latest_execution_id || summary.linked_execution_id,
  };
};

const taskRunDirectoryPath = (task: DataflowScanTask) => {
  const run = taskRunLocator(task);
  const path = String(run.path || '').trim();
  if (path) return path;
  const rootPath = String(run.root_path || '').trim().replace(/\/+$/, '');
  const name = String(run.name || '').trim().replace(/^\/+|\/+$/g, '');
  if (!rootPath || !name) return '';
  return `${rootPath}/${name}`;
};

const taskDisplayStatus = (task: DataflowScanTask) => String(task.status || '');
const taskPurposeMeta = (purpose?: string | null) => TASK_PURPOSE_META[String(purpose || 'normal').trim()] || TASK_PURPOSE_META.normal;
const renderProjectScopedTemplate = (template: string, projectId: string) =>
  String(template || '').replaceAll('{project_id}', projectId || '{project_id}');
const agentStateDirList = (dirs?: Record<string, DataflowAgentStateDir> | null) =>
  Object.values(dirs || {}).sort((left, right) => left.agent_id.localeCompare(right.agent_id));

const vulnReportStatusLabel = (task: DataflowScanTask) => {
  if (task.auto_report_vulnerabilities === false) return { label: '未开启', className: 'border-slate-200 bg-slate-50 text-slate-500' };
  const status = String(task.vuln_report_status?.status || 'not_started');
  if (status === 'reported') return { label: `已上报 ${task.vuln_report_status?.reported || 0}`, className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
  if (status === 'partial_failed') return { label: '部分失败', className: 'border-amber-200 bg-amber-50 text-amber-700' };
  if (status === 'failed') return { label: '上报失败', className: 'border-rose-200 bg-rose-50 text-rose-700' };
  if (status === 'empty') return { label: '无疑点', className: 'border-slate-200 bg-slate-50 text-slate-500' };
  return { label: '待上报', className: 'border-cyan-200 bg-cyan-50 text-cyan-700' };
};

const normalizeRunStatus = (status?: string | null) => {
  const value = String(status || '').trim().toLowerCase();
  if (['succeeded', 'success', 'passed'].includes(value)) return 'completed';
  if ([
    'orphaned',
    'error',
    'timeout',
    'review_error',
    'review_plateau',
    'summary_incomplete',
    'runtime_output_limit',
    'runtime_timeout',
    'blocked_context_window',
    'blocked_quota',
    'provider_rate_limited',
    'model_contract_violation',
    'blocked_external_source',
    'no_workspace',
  ].includes(value)) return 'failed';
  if (value === 'stopped') return 'interrupted';
  return value;
};

const statusMeta = (status?: string | null) => {
  const normalized = normalizeRunStatus(status);
  return STATUS_META[normalized] || {
    label: status || '未知',
    className: 'bg-slate-100 text-slate-600 border-slate-200',
    icon: <AlertTriangle size={13} />,
  };
};

const isActiveTaskStatus = (status?: string | null) =>
  ['pending', 'queued', 'running', 'cancel_requested', 'delete_requested'].includes(normalizeRunStatus(status));

type ExecutionSlotState = 'running' | 'pending' | 'expired' | 'released' | 'idle';

function parseOwnerHost(owner?: string | null) {
  const normalized = String(owner || '').trim();
  if (!normalized) return '';
  const separator = normalized.indexOf(':');
  return separator >= 0 ? normalized.slice(0, separator) : normalized;
}

function isHeartbeatExpired(heartbeatAgeSeconds?: number | null): boolean {
  return typeof heartbeatAgeSeconds === 'number' && Number.isFinite(heartbeatAgeSeconds) && heartbeatAgeSeconds > 300;
}

function getExecutionSlotView(task: DataflowScanTask): {
  state: ExecutionSlotState;
  label: string;
  ownerLabel: string;
  ownerFull: string;
  detail: string[];
  className: string;
} {
  const status = normalizeRunStatus(task.status);
  const ownerFull = String(task.owner_pod_id || '').trim();
  const ownerLabel = parseOwnerHost(ownerFull);
  const dispatchStatus = String(task.dispatch_status || '').trim();
  const heartbeat = task.heartbeat_at ? `心跳 ${new Date(task.heartbeat_at).toLocaleString('zh-CN')}` : '';
  const heartbeatAge = typeof task.heartbeat_age_seconds === 'number' ? `距今 ${task.heartbeat_age_seconds}s` : '';
  const terminal = ['completed', 'failed', 'interrupted', 'cancelled'].includes(status);

  if (terminal) {
    return {
      state: 'released',
      label: '已释放',
      ownerLabel: '',
      ownerFull,
      detail: [dispatchStatus || status].filter(Boolean),
      className: 'border-slate-200 bg-slate-50 text-slate-600',
    };
  }
  if (status === 'running' && ownerFull && isHeartbeatExpired(task.heartbeat_age_seconds)) {
    return {
      state: 'expired',
      label: '状态过期',
      ownerLabel: ownerLabel || ownerFull,
      ownerFull,
      detail: [dispatchStatus, heartbeatAge || heartbeat].filter(Boolean).slice(0, 2),
      className: 'border-orange-200 bg-orange-50 text-orange-700',
    };
  }
  if (status === 'running' && ownerFull) {
    return {
      state: 'running',
      label: '运行中',
      ownerLabel: ownerLabel || ownerFull,
      ownerFull,
      detail: [dispatchStatus, heartbeat || heartbeatAge].filter(Boolean).slice(0, 2),
      className: 'border-cyan-200 bg-cyan-50 text-cyan-700',
    };
  }
  if (status === 'pending' || status === 'queued') {
    const queued = dispatchStatus === 'queued' || dispatchStatus === 'dispatching' || status === 'queued';
    return {
      state: 'pending',
      label: queued ? '排队中' : '未占用槽位',
      ownerLabel: '',
      ownerFull,
      detail: [dispatchStatus || status].filter(Boolean),
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }
  return {
    state: 'idle',
    label: '未占用槽位',
    ownerLabel: ownerLabel || '',
    ownerFull,
    detail: [dispatchStatus].filter(Boolean),
    className: 'border-slate-200 bg-white text-slate-600',
  };
}

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
  version?: string | null;
  description?: string;
  children?: React.ReactNode;
}> = ({ eyebrow, title, version, description, children }) => (
  <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-700">{eyebrow}</p>
        <ServicePageTitle
          title={title}
          version={version}
          className="mt-2"
          titleClassName="text-2xl font-black tracking-tight text-slate-950"
          badgeClassName="text-[10px]"
        />
        {description ? <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">{description}</p> : null}
      </div>
      {children ? <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  </section>
);

const TableSortButton: React.FC<{
  label: string;
  active: boolean;
  order?: 'asc' | 'desc';
  onClick: () => void;
}> = ({ label, active, order, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex items-center gap-1 font-inherit ${active ? 'text-cyan-700' : 'text-inherit hover:text-slate-900'}`}
  >
    <span>{label}</span>
    {active ? (order === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <SlidersHorizontal size={13} />}
  </button>
);

const PanelActions: React.FC<{ saving: boolean; disabled?: boolean; onSave: () => void; onReset: () => void }> = ({
  saving,
  disabled = false,
  onSave,
  onReset,
}) => (
  <div className="flex shrink-0 flex-wrap items-center gap-2">
    <button
      type="button"
      onClick={onReset}
      disabled={saving}
      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    >
      重置为默认
    </button>
    <button
      type="button"
      onClick={onSave}
      disabled={saving || disabled}
      className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-3 py-2 text-xs font-black text-white shadow-sm hover:bg-cyan-800 disabled:opacity-50"
    >
      {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
      保存配置
    </button>
  </div>
);

interface CreateTaskState {
  title: string;
  profileId: string;
  workspacePath: string;
  dataFlowPath: string;
  sourcePath: string;
  model: string;
  provider: string;
  reviewProfile: string;
  maxReviewCycles: number;
  timeoutMaxRetries: number;
  timeoutRetryIntervalSeconds: number;
  resultReviewConcurrency: number;
  runtimeOverridesText: string;
  autoReportVulnerabilities: boolean;
}

const createTaskDefaultConfigPayload = (): DataflowProfileConfigPayload => ({
  ...defaultConfigPayload(),
  model: DEFAULT_CREATE_TASK_MODEL,
  review_profile: 'fast',
  max_review_cycles: REVIEW_PROFILE_DEFAULT_MAX_CYCLES.fast,
});

const initialCreateTaskState = (): CreateTaskState => ({
  title: `dataflow-vuln-${new Date().toISOString().slice(0, 16).replace('T', '-')}`,
  profileId: '',
  workspacePath: DEFAULT_DATAFLOW_VULN_RUNS_ROOT,
  dataFlowPath: '',
  sourcePath: '',
  model: createTaskDefaultConfigPayload().model,
  provider: '',
  reviewProfile: createTaskDefaultConfigPayload().review_profile || 'balanced',
  maxReviewCycles: createTaskDefaultConfigPayload().max_review_cycles,
  timeoutMaxRetries: createTaskDefaultConfigPayload().timeout_max_retries ?? 3,
  timeoutRetryIntervalSeconds: createTaskDefaultConfigPayload().timeout_retry_interval_seconds ?? 30,
  resultReviewConcurrency: createTaskDefaultConfigPayload().result_review_concurrency,
  runtimeOverridesText: '',
  autoReportVulnerabilities: true,
});

const applyConfigPayloadToCreateTaskState = (
  state: CreateTaskState,
  configPayload: DataflowProfileConfigPayload,
  options?: { preserveModel?: boolean; preserveReviewProfile?: boolean; preserveMaxReviewCycles?: boolean }
): CreateTaskState => ({
  ...state,
  model: options?.preserveModel ? state.model : configPayload.model,
  reviewProfile: options?.preserveReviewProfile ? state.reviewProfile : (configPayload.review_profile || createTaskDefaultConfigPayload().review_profile || 'fast'),
  maxReviewCycles: options?.preserveMaxReviewCycles ? state.maxReviewCycles : configPayload.max_review_cycles,
  timeoutMaxRetries: configPayload.timeout_max_retries ?? 3,
  timeoutRetryIntervalSeconds: configPayload.timeout_retry_interval_seconds ?? 30,
  resultReviewConcurrency: configPayload.result_review_concurrency,
});

const isCreateTaskConfigUntouched = (state: CreateTaskState) => {
  const defaults = createTaskDefaultConfigPayload();
  return (
    !state.provider.trim()
    && state.model === defaults.model
    && state.reviewProfile === (defaults.review_profile || 'balanced')
    && state.maxReviewCycles === defaults.max_review_cycles
    && state.timeoutMaxRetries === (defaults.timeout_max_retries ?? 3)
    && state.timeoutRetryIntervalSeconds === (defaults.timeout_retry_interval_seconds ?? 30)
    && state.resultReviewConcurrency === defaults.result_review_concurrency
    && !state.runtimeOverridesText.trim()
  );
};

const resolveDefaultProfile = (profiles: DataflowScanProfile[]) =>
  profiles.find((item) => item.is_default && item.enabled)
  || profiles.find((item) => item.enabled)
  || null;

const buildCreateTaskConfigOverrides = (
  state: CreateTaskState,
  baseline: DataflowProfileConfigPayload
): Partial<DataflowCreateTaskPayload> => {
  const overrides: Partial<DataflowCreateTaskPayload> = {};
  const shouldSend = <T,>(value: T, baselineValue: T) => value !== baselineValue;
  const model = state.model.trim();
  const provider = state.provider.trim();
  if (provider) {
    overrides.provider = provider;
    if (model) overrides.model = model;
  } else if (model && shouldSend(model, baseline.model)) {
    overrides.model = model;
  }
  if (state.reviewProfile && shouldSend(state.reviewProfile, baseline.review_profile || 'balanced')) {
    overrides.review_profile = state.reviewProfile;
  }
  if (shouldSend(state.maxReviewCycles, baseline.max_review_cycles)) {
    overrides.max_review_cycles = state.maxReviewCycles;
  }
  if (shouldSend(state.timeoutMaxRetries, baseline.timeout_max_retries ?? 3)) {
    overrides.timeout_max_retries = state.timeoutMaxRetries;
  }
  if (shouldSend(state.timeoutRetryIntervalSeconds, baseline.timeout_retry_interval_seconds ?? 30)) {
    overrides.timeout_retry_interval_seconds = state.timeoutRetryIntervalSeconds;
  }
  if (shouldSend(state.resultReviewConcurrency, baseline.result_review_concurrency)) {
    overrides.result_review_concurrency = state.resultReviewConcurrency;
  }
  return overrides;
};

export const DataflowVulnTaskListPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const executionApi = api.domains.execution.dataflowVulnScanner;
  const navigate = useNavigate();
  const { notify, feedbackNodes } = useUiFeedback();

  const [profiles, setProfiles] = useState<DataflowScanProfile[]>([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [tasks, setTasks] = useState<DataflowScanTaskListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [taskStats, setTaskStats] = useState<DataflowScanTaskStats>({ total: 0, pending: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0 });
  const [tasksError, setTasksError] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [runQuery, setRunQuery] = useState('');
  const [runStatusFilter, setRunStatusFilter] = useState('');
  const [slotQuickFilter, setSlotQuickFilter] = useState('');
  const [statusQuickFilter, setStatusQuickFilter] = useState('');
  const [reportQuickFilter, setReportQuickFilter] = useState('');
  const [modelQuickFilter, setModelQuickFilter] = useState('');
  const [modeFilter, setModeFilter] = useState<'' | 'manual' | 'binary' | 'source'>('');
  const [parentTaskIdFilter, setParentTaskIdFilter] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [localSort, setLocalSort] = useState<{ key: LocalTaskSortKey; order: 'asc' | 'desc' } | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createState, setCreateState] = useState<CreateTaskState>(initialCreateTaskState);
  const [submitting, setSubmitting] = useState(false);
  const buildVersion = useServiceBuildVersion(executionApi.getHealth);
  const [slotSummary, setSlotSummary] = useState<DataflowVulnClusterCapacity | null>(null);
  const [slotSummaryLoading, setSlotSummaryLoading] = useState(false);
  const [slotSummaryError, setSlotSummaryError] = useState('');
  const [slotsPanelExpanded, setSlotsPanelExpanded] = useState(false);
  const [showSlotDetailModal, setShowSlotDetailModal] = useState(false);
  const [expandedSlotWorkerIds, setExpandedSlotWorkerIds] = useState<string[]>([]);

  const openTaskDetail = async (
    task: Pick<DataflowScanTask, 'task_id' | 'latest_execution_id'>,
    options?: { retry?: number }
  ) => {
    let taskForResolve = task;
    const maxAttempts = Math.max(options?.retry ?? 1, 1);
    const cached = readCachedTaskRunRoute(task.task_id, task.latest_execution_id || '');
    if (cached) {
      navigate(buildRunDetailPath(cached), {
        state: { returnView: DATAFLOW_VULN_LIST_RETURN_VIEW } satisfies DataflowVulnRouteState,
      });
      return true;
    }

    if (task.latest_execution_id) {
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
          const resolved = await executionApi.resolveRunByTask(projectId, task.task_id, task.latest_execution_id);
          const target = runResolveToRouteTarget(resolved);
          writeCachedTaskRunRoute(task.task_id, resolved.linked_execution_id || task.latest_execution_id, target);
          navigate(buildRunDetailPath(target), {
            state: { returnView: DATAFLOW_VULN_LIST_RETURN_VIEW } satisfies DataflowVulnRouteState,
          });
          return true;
        } catch {
          // The Run index may appear just after task creation; retry briefly before falling back.
        }
        if (attempt + 1 < maxAttempts) await wait(500);
      }
    }

    try {
      const detail = await executionApi.getTask(task.task_id);
      const run = taskRunLocator(detail);
      if (run.name && run.root_path) {
        writeCachedTaskRunRoute(task.task_id, detail.latest_execution_id, run as DataflowFileserverRunSummary);
        navigate(buildRunDetailPath(run as DataflowFileserverRunSummary), {
          state: {
            fileserverRunSummary: run,
            returnView: DATAFLOW_VULN_LIST_RETURN_VIEW,
          },
        });
        return true;
      }
      taskForResolve = detail;
    } catch {
      // Fall through to the resolver endpoint. This keeps old/pending task
      // links usable even if the task-detail fetch races with creation.
    }
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const resolved = await executionApi.resolveRunByTask(projectId, task.task_id, taskForResolve.latest_execution_id);
        const target = runResolveToRouteTarget(resolved);
        writeCachedTaskRunRoute(task.task_id, resolved.linked_execution_id || taskForResolve.latest_execution_id, target);
        navigate(buildRunDetailPath(target), {
          state: { returnView: DATAFLOW_VULN_LIST_RETURN_VIEW } satisfies DataflowVulnRouteState,
        });
        return true;
      } catch {
        // The Run index may appear just after task creation; retry briefly before falling back to the resolver route.
      }
      if (attempt + 1 < maxAttempts) await wait(500);
    }
    const runQuery = taskForResolve.latest_execution_id ? `?execution_id=${encodeURIComponent(taskForResolve.latest_execution_id)}` : '';
    navigate(`/pentest-exec-dataflow-vuln-task-detail/${encodeURIComponent(task.task_id)}${runQuery}`, {
      state: { returnView: DATAFLOW_VULN_LIST_RETURN_VIEW } satisfies DataflowVulnRouteState,
    });
    return false;
  };

  const openRunDetail = (run: DataflowFileserverRunSummary) => {
    navigate(buildRunDetailPath(run), {
      state: {
        fileserverRunSummary: run,
        returnView: DATAFLOW_VULN_LIST_RETURN_VIEW,
      },
    });
  };

  const openTaskRowDetail = async (task: DataflowScanTask) => {
    const run = taskRunLocator(task);
    if (run.name && run.root_path) {
      writeCachedTaskRunRoute(task.task_id, task.latest_execution_id, run as DataflowFileserverRunSummary);
      openRunDetail(run as DataflowFileserverRunSummary);
      return;
    }
    await openTaskDetail(task, { retry: 3 });
  };

  const loadProfiles = async (options?: { force?: boolean }) => {
    if (!projectId) return;
    if (profilesLoading) return;
    if (profilesLoaded && !options?.force) return;
    setProfilesLoading(true);
    try {
      const nextProfiles = await executionApi.listProfiles(projectId);
      setProfiles(nextProfiles);
      setProfilesLoaded(true);
      const defaultProfile = resolveDefaultProfile(nextProfiles);
      if (showCreate && defaultProfile) {
        const defaultProfilePayload = normalizeConfigPayload(defaultProfile.config_payload);
        setCreateState((current) => (
          current.profileId || !isCreateTaskConfigUntouched(current)
            ? current
            : applyConfigPayloadToCreateTaskState(current, defaultProfilePayload, {
              preserveModel: true,
              preserveReviewProfile: true,
              preserveMaxReviewCycles: true,
            })
        ));
      }
    } catch (error: any) {
      setProfiles([]);
      notify(`加载数据流漏洞挖掘 Profile 失败: ${error?.message || error || '未知错误'}`, 'error');
    } finally {
      setProfilesLoading(false);
    }
  };

  const loadTasks = useCallback(async (targetPage: number) => {
    if (!projectId) return;
    setLoading(true);
    setTasksError('');
    try {
      const payload = await executionApi.listTasks({
        projectId,
        page: targetPage,
        per_page: perPage,
        status: runStatusFilter || undefined,
        mode: modeFilter || undefined,
        parent_task_id: parentTaskIdFilter.trim() || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      setTasks(payload.items || []);
      setTotal(payload.total || 0);
    } catch (error: any) {
      setTasks([]);
      setTotal(0);
      const message = error?.message || '读取任务列表失败';
      setTasksError(message);
      notify(`加载数据流漏洞挖掘任务列表失败: ${message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [executionApi, modeFilter, notify, parentTaskIdFilter, perPage, projectId, runStatusFilter, sortBy, sortOrder]);

  const loadTaskStats = useCallback(async () => {
    if (!projectId) return;
    try {
      const payload = await executionApi.getTaskStats({
        projectId,
        status: runStatusFilter || undefined,
        mode: modeFilter || undefined,
        parent_task_id: parentTaskIdFilter.trim() || undefined,
      });
      setTaskStats(payload);
    } catch {
      setTaskStats((current) => current);
    }
  }, [executionApi, modeFilter, parentTaskIdFilter, projectId, runStatusFilter]);

  const loadSlotSummary = useCallback(async () => {
    setSlotSummaryLoading(true);
    try {
      const payload = await executionApi.getWorkerClusterCapacitySummary();
      setSlotSummary(payload);
      setSlotSummaryError('');
    } catch (error: any) {
      setSlotSummary(null);
      setSlotSummaryError(error?.message || '读取执行槽位失败');
    } finally {
      setSlotSummaryLoading(false);
    }
  }, [executionApi]);

  const loadAll = useCallback(async (targetPage: number) => {
    await Promise.allSettled([
      loadTasks(targetPage),
      loadTaskStats(),
      loadSlotSummary(),
    ]);
  }, [loadSlotSummary, loadTaskStats, loadTasks]);

  const loadSlotDetail = async () => {
    setSlotSummaryLoading(true);
    try {
      const payload = await executionApi.getWorkerClusterCapacity();
      setSlotSummary(payload);
      setSlotSummaryError('');
    } catch (error: any) {
      setSlotSummaryError(error?.message || '读取执行槽位详情失败');
    } finally {
      setSlotSummaryLoading(false);
    }
  };

  useEffect(() => {
    setProfiles([]);
    setProfilesLoaded(false);
    setSelectedTaskIds(new Set());
    setTaskStats({ total: 0, pending: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0 });
    setPage(1);
    setSlotQuickFilter('');
    setStatusQuickFilter('');
    setReportQuickFilter('');
    setModelQuickFilter('');
    setLocalSort(null);
  }, [projectId]);

  useEffect(() => {
    void loadAll(page);
  }, [loadAll, page, projectId, perPage, runStatusFilter, modeFilter, parentTaskIdFilter, sortBy, sortOrder]);

  useEffect(() => {
    if (!showSlotDetailModal) return;
    void loadSlotDetail();
  }, [showSlotDetailModal]);

  useEffect(() => {
    const storedTaskId = sessionStorage.getItem('secflow:dataflowVulnTaskId');
    if (!storedTaskId || !projectId) return;
    sessionStorage.removeItem('secflow:dataflowVulnTaskId');
    void openTaskDetail({ task_id: storedTaskId, latest_execution_id: '' });
  }, [projectId]);

  const filteredTasks = useMemo(() => {
    const text = runQuery.trim().toLowerCase();
    const matched = tasks.filter((task) => {
      const run = taskRunLocator(task);
      const runSummary = taskRunSummary(task);
      const normalizedStatus = normalizeRunStatus(taskDisplayStatus(task));
      const slotView = getExecutionSlotView(task);
      const reportStatus = vulnReportStatusLabel(task);
      const modelValue = String(runSummary.model || '').trim();

      if (text && ![
        task.title,
        task.task_id,
        task.status,
        task.message,
        task.latest_execution_id,
        task.profile_id,
        run.name,
        run.path,
        taskRunDirectoryPath(task),
        run.root_path,
        runSummary.status,
        STATUS_META[normalizedStatus]?.label,
        runSummary.model,
        runSummary.provider,
        runSummary.workflow_mode,
        run.linked_task_id,
        run.linked_execution_id,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(text))) {
        return false;
      }

      if (slotQuickFilter && slotView.state !== slotQuickFilter) return false;
      if (statusQuickFilter && normalizedStatus !== statusQuickFilter) return false;
      if (reportQuickFilter && reportStatus.label !== reportQuickFilter) return false;
      if (modelQuickFilter && modelValue !== modelQuickFilter) return false;
      return true;
    });

    if (!localSort) return matched;

    const sorted = [...matched];
    sorted.sort((left, right) => {
      if (localSort.key === 'started_at') {
        const leftValue = new Date(left.started_at || left.created_at || 0).getTime();
        const rightValue = new Date(right.started_at || right.created_at || 0).getTime();
        const safeLeft = Number.isFinite(leftValue) ? leftValue : 0;
        const safeRight = Number.isFinite(rightValue) ? rightValue : 0;
        return localSort.order === 'asc' ? safeLeft - safeRight : safeRight - safeLeft;
      }
      const leftStart = new Date(left.started_at || left.created_at || 0).getTime();
      const rightStart = new Date(right.started_at || right.created_at || 0).getTime();
      const leftEnd = left.finished_at ? new Date(left.finished_at).getTime() : Date.now();
      const rightEnd = right.finished_at ? new Date(right.finished_at).getTime() : Date.now();
      const leftDuration = Number.isFinite(leftStart) && Number.isFinite(leftEnd) && leftEnd >= leftStart ? leftEnd - leftStart : -1;
      const rightDuration = Number.isFinite(rightStart) && Number.isFinite(rightEnd) && rightEnd >= rightStart ? rightEnd - rightStart : -1;
      return localSort.order === 'asc' ? leftDuration - rightDuration : rightDuration - leftDuration;
    });
    return sorted;
  }, [localSort, modelQuickFilter, reportQuickFilter, runQuery, slotQuickFilter, statusQuickFilter, tasks]);

  const toggleQuickFilter = useCallback((owner: LocalFilterOwner, value: string) => {
    setPage(1);
    if (owner === 'slot') {
      setSlotQuickFilter((current) => current === value ? '' : value);
      return;
    }
    if (owner === 'status') {
      setStatusQuickFilter((current) => current === value ? '' : value);
      return;
    }
    if (owner === 'report') {
      setReportQuickFilter((current) => current === value ? '' : value);
      return;
    }
    setModelQuickFilter((current) => current === value ? '' : value);
  }, []);

  const toggleLocalSort = useCallback((key: LocalTaskSortKey) => {
    setLocalSort((current) => {
      if (!current || current.key !== key) return { key, order: 'desc' };
      if (current.order === 'desc') return { key, order: 'asc' };
      return null;
    });
  }, []);

  const stats = taskStats;

  useEffect(() => {
    const taskIds = new Set(tasks.map((task) => task.task_id));
    setSelectedTaskIds((current) => {
      const next = new Set<string>();
      current.forEach((taskId) => {
        if (taskIds.has(taskId)) next.add(taskId);
      });
      return next.size === current.size ? current : next;
    });
  }, [tasks]);

  const toggleTaskSelection = (taskId: string, checked: boolean) => {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (checked) next.add(taskId);
      else next.delete(taskId);
      return next;
    });
  };

  const toggleAllVisibleSelection = (checked: boolean) => {
    const visibleTaskIds = filteredTasks.map((task) => task.task_id);
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (checked) visibleTaskIds.forEach((taskId) => next.add(taskId));
      else visibleTaskIds.forEach((taskId) => next.delete(taskId));
      return next;
    });
  };

  const handleDeleteTask = async (task: DataflowScanTask) => {
    const taskLabel = task.title || task.run_name || task.task_id;
    const confirmed = await showConfirm({
      title: '删除任务',
      message: `确定要删除任务「${taskLabel}」及其关联 Run / 输出文件吗？此操作不可撤销。`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await executionApi.deleteTask(task.task_id);
      notify('任务已删除', 'success');
      setSelectedTaskIds((current) => {
        const next = new Set(current);
        next.delete(task.task_id);
        return next;
      });
      await loadTasks(page);
    } catch (error: any) {
      notify(`删除任务失败: ${error?.message || error || '未知错误'}`, 'error');
    }
  };

  const handleBatchDelete = async () => {
    const taskIds = tasks
      .map((task) => task.task_id)
      .filter((taskId) => selectedTaskIds.has(taskId));
    if (taskIds.length === 0) {
      notify('请先选择要删除的任务', 'warning');
      return;
    }
    const confirmed = await showConfirm({
      title: '批量删除任务',
      message: `确定要批量删除 ${taskIds.length} 个任务及其关联 Run / 输出文件吗？此操作不可撤销。`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;

    setBatchDeleting(true);
    let success = 0;
    let failed = 0;
    let firstError = '';

    for (const taskId of taskIds) {
      try {
        await executionApi.deleteTask(taskId);
        success += 1;
      } catch (error: any) {
        failed += 1;
        if (!firstError) firstError = error?.message || String(error);
      }
    }

    setBatchDeleting(false);
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      taskIds.forEach((taskId) => next.delete(taskId));
      return next;
    });
    await loadTasks(page);

    if (failed === 0) {
      notify(`批量删除成功，共 ${success} 个任务`, 'success');
    } else if (success > 0) {
      notify(`批量删除完成，成功 ${success} / ${taskIds.length}，首个错误：${firstError}`, 'warning');
    } else {
      notify(`批量删除失败：${firstError || '未知错误'}`, 'error');
    }
  };

  const hasSelection = selectedTaskIds.size > 0;
  const allVisibleSelected = filteredTasks.length > 0 && filteredTasks.every((task) => selectedTaskIds.has(task.task_id));
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, perPage)));
  const toggleSlotWorkerExpanded = (workerId: string) => {
    setExpandedSlotWorkerIds((current) => (
      current.includes(workerId)
        ? current.filter((item) => item !== workerId)
        : [...current, workerId]
    ));
  };
  const slotCards = useMemo(() => [
    {
      label: '总槽位',
      value: slotSummary?.total_capacity ?? '-',
      hint: slotSummary?.updated_at
        ? `${slotSummary.detail_mode === 'detail' ? '明细' : '摘要'}更新于 ${new Date(slotSummary.updated_at).toLocaleTimeString('zh-CN')}`
        : '全局 worker 总执行槽位',
      border: 'border-slate-200',
      bg: 'bg-slate-50',
      text: 'text-slate-800',
    },
    {
      label: '忙槽位',
      value: slotSummary?.running_jobs ?? '-',
      hint: slotSummary && slotSummary.total_capacity > 0 ? `利用率 ${Math.round((slotSummary.running_jobs / slotSummary.total_capacity) * 100)}%` : '当前活跃任务占用的槽位',
      border: 'border-cyan-200',
      bg: 'bg-cyan-50',
      text: 'text-cyan-700',
    },
    {
      label: '空闲槽位',
      value: slotSummary?.available_slots ?? '-',
      hint: '当前未被活跃任务占用的容量',
      border: 'border-emerald-200',
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
    },
    {
      label: '排队任务',
      value: slotSummary?.queued_jobs ?? '-',
      hint: `在线 Worker ${slotSummary?.worker_count ?? 0}`,
      border: 'border-amber-200',
      bg: 'bg-amber-50',
      text: 'text-amber-700',
    },
  ], [slotSummary]);

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
      notify('请选择 Runs 根目录路径', 'warning');
      return;
    }
    if (!createState.dataFlowPath.trim()) {
      notify('请选择数据流目录路径', 'warning');
      return;
    }
    if (!createState.sourcePath.trim()) {
      notify('请选择代码目录路径', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const runtimeOverrides = parseJsonObject(createState.runtimeOverridesText, '运行时覆盖');
      const selectedProfile = createState.profileId
        ? profiles.find((item) => item.profile_id === createState.profileId)
        : resolveDefaultProfile(profiles);
      const baselinePayload = normalizeConfigPayload(selectedProfile?.config_payload);
      const configOverrides = buildCreateTaskConfigOverrides(createState, baselinePayload);
      const createPayload: DataflowCreateTaskPayload = {
        project_id: projectId,
        profile_id: createState.profileId || undefined,
        title: createState.title.trim(),
        data_flow: buildProjectFilesystemRef(createState.dataFlowPath),
        source_dir: buildProjectFilesystemRef(createState.sourcePath),
        ...(createState.workspacePath.trim() ? { workspace_dir: buildProjectFilesystemRef(createState.workspacePath) } : {}),
        auto_report_vulnerabilities: createState.autoReportVulnerabilities,
        ...configOverrides,
        ...(Object.keys(runtimeOverrides).length ? { runtime_overrides: runtimeOverrides } : {}),
      };
      const created = await executionApi.createTask(createPayload);
      notify('扫描任务已创建并开始运行', 'success');
      setShowCreate(false);
      setCreateState(initialCreateTaskState());
      await openTaskRowDetail(created);
    } catch (error: any) {
      notify(error?.message || '创建任务失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-100 px-5 py-5 text-slate-900 lg:px-8 lg:py-7">
      {feedbackNodes}
      <div className="space-y-4">
        <PageHeader
          eyebrow="DATAFLOW VULNERABILITY DISCOVERY"
          title="数据流漏洞挖掘"
          version={buildVersion}
        >
          <button
            onClick={() => {
              const defaultProfile = resolveDefaultProfile(profiles);
              const initialState = initialCreateTaskState();
              setCreateState(defaultProfile
                ? applyConfigPayloadToCreateTaskState(initialState, normalizeConfigPayload(defaultProfile.config_payload), {
                  preserveModel: true,
                  preserveReviewProfile: true,
                  preserveMaxReviewCycles: true,
                })
                : initialState);
              setShowCreate(true);
              void loadProfiles();
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-cyan-800"
          >
            <Plus size={16} />
            创建任务
          </button>
          <button
            onClick={() => void loadAll(page)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            刷新
          </button>
        </PageHeader>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label="任务总数" value={stats.total} icon={<Layers size={17} />} />
          <MetricCard label="运行中" value={stats.running} icon={<Activity size={17} />} />
          <MetricCard label="已成功" value={stats.succeeded} icon={<ShieldCheck size={17} />} tone="bg-emerald-50/70" />
          <MetricCard label="失败" value={stats.failed} icon={<AlertTriangle size={17} />} tone="bg-rose-50/70" />
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <button
              type="button"
              onClick={() => setSlotsPanelExpanded((current) => !current)}
              className="flex flex-1 items-start justify-between gap-4 text-left"
            >
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">Execution Slots</p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">执行槽位总览</h2>
                <p className="mt-2 text-sm text-slate-500">展示数据流漏洞挖掘服务全局 worker 槽位、活跃任务和心跳状态，不区分项目。</p>
              </div>
              <span className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500">
                {slotsPanelExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} className="rotate-[-90deg]" />}
              </span>
            </button>
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-xs text-slate-400">最近同步 {formatDateTime(slotSummary?.updated_at)}</div>
              {slotSummary ? (
                <button
                  type="button"
                  onClick={() => setShowSlotDetailModal(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 hover:bg-violet-100"
                >
                  查看详情
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void (showSlotDetailModal ? loadSlotDetail() : loadSlotSummary())}
                className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
              >
                <RefreshCw size={14} />
              </button>
              {slotSummaryLoading ? (
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <Loader2 size={13} className="animate-spin" />
                  刷新槽位数据中
                </div>
              ) : null}
            </div>
          </div>
          {slotsPanelExpanded ? (
            <>
              <div className="mt-5 grid gap-3 md:grid-cols-4">
                {slotCards.map((card) => (
                  <div key={card.label} className={`rounded-2xl border ${card.border} ${card.bg} px-4 py-3`}>
                    <div className={`text-[11px] font-black uppercase tracking-[0.24em] ${card.text}`}>{card.label}</div>
                    <div className="mt-2 text-2xl font-black text-slate-900">{card.value}</div>
                    <div className="mt-1 text-[11px] text-slate-500">{card.hint}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                {(slotSummary?.workers || []).map((worker) => (
                  <div
                    key={worker.worker_id}
                    className={`min-w-[220px] rounded-2xl border px-4 py-3 ${worker.healthy ? 'border-slate-200 bg-slate-50' : 'border-rose-200 bg-rose-50'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-black text-slate-900" title={worker.worker_id}>{worker.host_name || worker.worker_id}</div>
                      <div className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${worker.healthy ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {worker.healthy ? 'healthy' : 'unhealthy'}
                      </div>
                    </div>
                    <div className="mt-1 truncate text-[11px] text-slate-400" title={worker.worker_id}>{worker.worker_id}</div>
                    <div className="mt-2 text-xs text-slate-600">槽位 {worker.running_jobs}/{worker.max_concurrent_jobs} · 空闲 {worker.available_slots}</div>
                    <div className="mt-1 text-xs text-slate-400">心跳 {formatDateTime(worker.last_heartbeat_at)}</div>
                    {worker.error ? <div className="mt-2 break-all text-[11px] text-rose-600">{worker.error}</div> : null}
                  </div>
                ))}
                {slotSummary && (slotSummary.workers || []).length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-400">
                    当前未发现可用的漏洞挖掘 worker。
                  </div>
                ) : null}
              </div>
              {slotSummaryError ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                  暂无槽位数据：{slotSummaryError}
                </div>
              ) : null}
            </>
          ) : null}
        </section>

        <section>
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-sm font-black text-slate-900">任务 / Run 列表</div>
                  <div className="mt-1 text-xs text-slate-500">对齐数据流分析 / 入口分析列表：任务列表与槽位摘要分离加载，支持分页、模式筛选与服务端排序。</div>
                </div>
                <div className="text-xs font-bold text-slate-500">
                  当前页 {tasks.length} 条 · 共 {total} 条
                  {filteredTasks.length !== tasks.length ? ` · 搜索命中 ${filteredTasks.length} 条` : ''}
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <Search size={16} className="text-slate-400" />
                  <input
                    value={runQuery}
                    onChange={(event) => setRunQuery(event.target.value)}
                    placeholder="搜索当前页任务名、任务 ID、执行 ID、Run 目录、模型、状态或工作流模式"
                    className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={runStatusFilter}
                    onChange={(event) => { setRunStatusFilter(event.target.value); setPage(1); }}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 outline-none"
                    title="按任务状态筛选"
                  >
                    <option value="">全部状态</option>
                    {RUN_STATUS_FILTER_KEYS.map((key) => {
                      const meta = STATUS_META[key];
                      return <option key={key} value={key}>{meta.label}</option>;
                    })}
                  </select>
                  <select
                    value={modeFilter}
                    onChange={(event) => { setModeFilter(event.target.value as '' | 'manual' | 'binary' | 'source'); setPage(1); }}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 outline-none"
                    title="按任务来源筛选"
                  >
                    {TASK_MODE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <input
                    value={parentTaskIdFilter}
                    onChange={(event) => { setParentTaskIdFilter(event.target.value); setPage(1); }}
                    placeholder="筛选主任务 ID"
                    className="w-40 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400"
                    title="按主任务 ID 筛选"
                  />
                  <select
                    value={sortBy}
                    onChange={(event) => { setSortBy(event.target.value); setPage(1); }}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 outline-none"
                    title="排序字段"
                  >
                    {TASK_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>按{option.label}排序</option>)}
                  </select>
                  <select
                    value={sortOrder}
                    onChange={(event) => { setSortOrder(event.target.value === 'asc' ? 'asc' : 'desc'); setPage(1); }}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 outline-none"
                    title="排序方向"
                  >
                    <option value="desc">降序</option>
                    <option value="asc">升序</option>
                  </select>
                  <select
                    value={perPage}
                    onChange={(event) => { setPerPage(Number(event.target.value)); setPage(1); }}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 outline-none"
                    title="每页显示条数"
                  >
                    {[20, 50, 100, 200, 500].map((n) => <option key={n} value={n}>{n}条/页</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => void loadAll(page)}
                    className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                    title="刷新任务列表与槽位摘要"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
              </div>
              {tasksError ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700">
                  {tasksError}
                </div>
              ) : null}
              {hasSelection ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
                    <label className="inline-flex items-center gap-2 font-semibold">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={(event) => toggleAllVisibleSelection(event.target.checked)}
                      />
                      全选当前筛选结果（{filteredTasks.length} 条）
                    </label>
                    <span className="font-black text-cyan-700">已选择 {selectedTaskIds.size} 个任务</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedTaskIds(new Set())}
                      disabled={batchDeleting}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      清除选择
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleBatchDelete()}
                      disabled={batchDeleting}
                      className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-black text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    >
                      {batchDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      批量删除（{selectedTaskIds.size}）
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="overflow-auto">
              <ExecutionTable minWidth={1320}>
                <ExecutionTableHead>
                  <tr>
                    <ExecutionTableTh className="w-12">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={(event) => toggleAllVisibleSelection(event.target.checked)}
                        aria-label="全选当前筛选任务"
                      />
                    </ExecutionTableTh>
                    <ExecutionTableTh>任务 / Run</ExecutionTableTh>
                    <ExecutionTableTh>执行槽位</ExecutionTableTh>
                    <ExecutionTableTh>状态</ExecutionTableTh>
                    <ExecutionTableTh>模型</ExecutionTableTh>
                    <ExecutionTableTh>轮次</ExecutionTableTh>
                    <ExecutionTableTh>结果</ExecutionTableTh>
                    <ExecutionTableTh>疑点上报</ExecutionTableTh>
                    <ExecutionTableTh>
                      <TableSortButton
                        label="开始时间"
                        active={localSort?.key === 'started_at'}
                        order={localSort?.key === 'started_at' ? localSort.order : undefined}
                        onClick={() => toggleLocalSort('started_at')}
                      />
                    </ExecutionTableTh>
                    <ExecutionTableTh>
                      <TableSortButton
                        label="耗时"
                        active={localSort?.key === 'duration'}
                        order={localSort?.key === 'duration' ? localSort.order : undefined}
                        onClick={() => toggleLocalSort('duration')}
                      />
                    </ExecutionTableTh>
                    <ExecutionTableTh className="text-right">操作</ExecutionTableTh>
                  </tr>
                </ExecutionTableHead>
                <tbody>
                  {filteredTasks.map((task) => {
                    const run = taskRunLocator(task);
                    const runSummary = taskRunSummary(task);
                    const slotView = getExecutionSlotView(task);
                    const displayStatus = taskDisplayStatus(task);
                    const hasRun = Boolean(run.name && run.root_path);
                    const taskId = task.task_id || run.linked_task_id || '';
                    const executionId = task.latest_execution_id || run.linked_execution_id || '';
                    const displayName = task.title || run.name || taskId || run.path || 'Run';
                    const reportStatus = vulnReportStatusLabel(task);
                    const purposeMeta = taskPurposeMeta(task.task_purpose);
                    const secondaryLine = hasRun
                      ? `任务 ${shortId(taskId, 18)} · Run ${shortId(run.name || '', 18)}`
                      : `任务 ${shortId(taskId, 18)} · 执行 ${shortId(executionId || '-', 18)}`;
                    return (
                      <tr
                        key={task.task_id}
                        className={`${executionTableRowClassName} ${selectedTaskIds.has(task.task_id) ? 'bg-cyan-50/60' : ''}`.trim()}
                      >
                        <ExecutionTableTd onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedTaskIds.has(task.task_id)}
                            onChange={(event) => toggleTaskSelection(task.task_id, event.target.checked)}
                            aria-label={`选择任务 ${displayName}`}
                          />
                        </ExecutionTableTd>
                        <ExecutionTableTd>
                          <button
                            type="button"
                            onClick={() => void openTaskRowDetail(task)}
                            className="flex w-full items-center gap-3 rounded-lg text-left hover:bg-slate-50"
                            title={hasRun ? '按 Run 目录进入运行详情' : '查看任务记录，Run 初始化后会自动进入详情'}
                          >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
                              {hasRun ? <FolderOpen size={17} /> : <FileSearch size={17} />}
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="font-black text-slate-900">{shortId(displayName, 32)}</div>
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black ${purposeMeta.className}`}>
                                  {purposeMeta.label}
                                </span>
                              </div>
                              <div className="mt-1 truncate text-xs text-slate-500">{secondaryLine}</div>
                            </div>
                          </button>
                        </ExecutionTableTd>
                        <ExecutionTableTd className="min-w-[200px]">
                          <button
                            type="button"
                            onClick={() => toggleQuickFilter('slot', slotView.state)}
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold transition hover:brightness-95 ${slotView.className} ${slotQuickFilter === slotView.state ? 'ring-2 ring-cyan-200' : ''}`}
                            title={slotQuickFilter === slotView.state ? '点击取消执行槽位筛选' : '点击按执行槽位状态快速筛选'}
                          >
                            {slotView.label}
                          </button>
                          <div className="mt-1 space-y-0.5 text-xs">
                            {slotView.ownerLabel ? (
                              <div className="font-semibold text-slate-700" title={slotView.ownerFull}>
                                占用 Pod: {slotView.ownerLabel}
                              </div>
                            ) : null}
                            {slotView.detail.map((line) => (
                              <div key={line} className="text-slate-500">{line}</div>
                            ))}
                          </div>
                        </ExecutionTableTd>
                        <ExecutionTableTd>
                          <button
                            type="button"
                            onClick={() => toggleQuickFilter('status', normalizeRunStatus(displayStatus))}
                            className={`rounded-full ${statusQuickFilter === normalizeRunStatus(displayStatus) ? 'ring-2 ring-cyan-200' : ''}`}
                            title={statusQuickFilter === normalizeRunStatus(displayStatus) ? '点击取消状态筛选' : '点击按状态快速筛选'}
                          >
                            <StatusBadge status={displayStatus} />
                          </button>
                        </ExecutionTableTd>
                        <ExecutionTableTd>
                          <button
                            type="button"
                            onClick={() => runSummary.model && toggleQuickFilter('model', String(runSummary.model))}
                            disabled={!runSummary.model}
                            className={`text-left ${runSummary.model ? 'hover:text-cyan-700' : 'cursor-default'} ${modelQuickFilter === String(runSummary.model || '') ? 'text-cyan-700' : ''}`}
                            title={runSummary.model ? (modelQuickFilter === String(runSummary.model) ? '点击取消模型筛选' : '点击按模型快速筛选') : undefined}
                          >
                            <div className="font-bold text-slate-700">{runSummary.model || '-'}</div>
                          </button>
                          <div className="mt-1 text-xs text-slate-500">{formatThinking(runSummary.thinking)}</div>
                        </ExecutionTableTd>
                        <ExecutionTableTd className="font-bold text-slate-700">
                          {hasRun ? `${runSummary.cycles_used || 0} / ${runSummary.max_cycles || 0}` : `尝试 ${task.latest_attempt_no || 0}`}
                        </ExecutionTableTd>
                        <ExecutionTableTd className="text-slate-600">
                          {hasRun ? (
                            <>
                              <div>{runSummary.result_count || 0} / {runSummary.passed_count || 0} 通过</div>
                              <div className="mt-1 text-xs text-slate-500">{runSummary.failed_count || 0} 失败</div>
                            </>
                          ) : (
                            <>
                              <div>{task.message || '等待 Run 生成'}</div>
                              <div className="mt-1 text-xs text-slate-500">Execution: {shortId(executionId || '-', 18)}</div>
                            </>
                          )}
                        </ExecutionTableTd>
                        <ExecutionTableTd>
                          <button
                            type="button"
                            onClick={() => toggleQuickFilter('report', reportStatus.label)}
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${reportStatus.className} ${reportQuickFilter === reportStatus.label ? 'ring-2 ring-cyan-200' : ''}`}
                            title={reportQuickFilter === reportStatus.label ? '点击取消疑点上报筛选' : '点击按疑点上报状态快速筛选'}
                          >
                            {reportStatus.label}
                          </button>
                        </ExecutionTableTd>
                        <ExecutionTableTd className="text-xs text-slate-500">
                          <div title={runSummary.start_epoch ? `Run 开始时间：${formatEpochTime(runSummary.start_epoch)}` : undefined}>
                            {formatDateTime(task.started_at || task.created_at)}
                          </div>
                        </ExecutionTableTd>
                        <ExecutionTableTd className="text-slate-600">
                          <div title={runSummary.duration_seconds ? `Run 执行时长：${formatSeconds(runSummary.duration_seconds || 0)}` : undefined}>
                            {formatDuration(task.started_at || task.created_at, task.finished_at)}
                          </div>
                        </ExecutionTableTd>
                        <ExecutionTableTd className="text-right">
                          <div className="flex items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => void handleDeleteTask(task)}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50"
                              title="删除任务及其关联 Run"
                            >
                              <Trash2 size={13} />
                              删除
                            </button>
                            <button
                              type="button"
                              onClick={() => void openTaskRowDetail(task)}
                              className="inline-flex items-center gap-1 rounded-lg border border-cyan-200 bg-white px-2.5 py-1.5 text-xs font-bold text-cyan-700 hover:bg-cyan-50"
                              title="进入详情"
                            >
                              详情
                              <ChevronRight size={15} />
                            </button>
                          </div>
                        </ExecutionTableTd>
                      </tr>
                    );
                  })}
                </tbody>
              </ExecutionTable>

              {!loading && !tasksError && filteredTasks.length === 0 ? (
                <div className="p-6">
                  <EmptyPanel title="暂无任务" description="当前筛选条件下没有可展示的数据流漏洞挖掘任务。" />
                </div>
              ) : null}
              {loading ? (
                <div className="flex items-center gap-2 p-6 text-sm font-bold text-slate-500">
                  <Loader2 size={16} className="animate-spin" />
                  加载任务列表中...
                </div>
              ) : null}
            </div>

            {totalPages > 1 ? (
              <div className="flex items-center justify-center gap-2 border-t border-slate-200 px-4 py-4 text-sm">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-700 disabled:opacity-40"
                >
                  上一页
                </button>
                <span className="text-slate-500">{page} / {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page >= totalPages}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-700 disabled:opacity-40"
                >
                  下一页
                </button>
              </div>
            ) : null}
          </div>
        </section>

        <section>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-black text-slate-900">Profile / 参数配置</div>
                <div className="mt-1 text-xs text-slate-500">Profile 维护已合入「参数配置」一级菜单；只有在需要调整默认模板、Worker 或版本快照时再进入。</div>
              </div>
              <button
                onClick={() => navigate('/pentest-exec-dataflow-vuln-system-config')}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                <Settings size={16} />
                打开参数配置
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

      {showSlotDetailModal ? (
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm" onClick={() => setShowSlotDetailModal(false)}>
          <div className="w-full max-w-5xl rounded-[2rem] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] shadow-[0_30px_100px_rgba(15,23,42,0.35)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-700">Slot Detail</div>
                <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-900">执行槽位详情</h3>
                <p className="mt-2 text-sm text-slate-500">按 worker 展示当前正在执行的数据流漏洞挖掘任务。</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right text-xs text-slate-400">
                  <div>最近同步</div>
                  <div className="mt-1 font-semibold text-slate-500">{formatDateTime(slotSummary?.updated_at)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSlotDetailModal(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  aria-label="关闭执行槽位详情"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="max-h-[75vh] overflow-auto px-6 py-5">
              {(slotSummary?.workers || []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-400">
                  当前未发现可用的漏洞挖掘 worker。
                </div>
              ) : (
                <div className="space-y-4">
                  {(slotSummary?.workers || []).map((worker) => {
                    const expanded = expandedSlotWorkerIds.includes(worker.worker_id);
                    const activeJobs = worker.active_jobs || [];
                    return (
                      <section key={worker.worker_id} className={`overflow-hidden rounded-[1.5rem] border ${worker.healthy ? 'border-slate-200 bg-white' : 'border-rose-200 bg-rose-50/70'}`}>
                        <button
                          type="button"
                          onClick={() => toggleSlotWorkerExpanded(worker.worker_id)}
                          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50/70"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-black text-slate-900">{worker.host_name || worker.worker_id}</div>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${worker.healthy ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{worker.healthy ? 'healthy' : 'unhealthy'}</span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">活动任务 {activeJobs.length}</span>
                            </div>
                            <div className="mt-1 text-[11px] text-slate-400">{worker.worker_id}</div>
                            <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                              <span>槽位 {worker.running_jobs}/{worker.max_concurrent_jobs}</span>
                              <span>空闲 {worker.available_slots}</span>
                              <span>心跳 {formatDateTime(worker.last_heartbeat_at)}</span>
                            </div>
                          </div>
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500">
                            {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} className="rotate-90" />}
                          </div>
                        </button>
                        {expanded ? (
                          <div className="border-t border-slate-100 px-5 py-4">
                            {!worker.healthy && worker.error ? (
                              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                                明细拉取失败：{worker.error}
                              </div>
                            ) : activeJobs.length === 0 ? (
                              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
                                当前无运行中的漏洞挖掘任务。
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {activeJobs.map((job) => (
                                  <div key={`${worker.worker_id}:${job.execution_id}:${job.worker_job_id}`} className={`rounded-2xl border px-4 py-4 ${job.mapped ? 'border-slate-200 bg-slate-50/70' : 'border-amber-200 bg-amber-50/80'}`}>
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          {job.mapped && job.task_id ? (
                                            <button
                                              type="button"
                                              onClick={() => void openTaskDetail({ task_id: job.task_id || '', latest_execution_id: job.execution_id || '' })}
                                              className="truncate text-left text-sm font-black text-cyan-700 hover:text-cyan-800"
                                            >
                                              {job.task_title || job.task_id}
                                            </button>
                                          ) : (
                                            <div className="truncate text-sm font-black text-slate-900">{job.task_title || '未关联任务'}</div>
                                          )}
                                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${job.mapped ? 'bg-cyan-100 text-cyan-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {job.mapped ? '已关联任务' : '未关联任务'}
                                          </span>
                                        </div>
                                        <div className="mt-2 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
                                          <div>任务 ID: {job.task_id || '-'}</div>
                                          <div>执行 ID: {job.execution_id || '-'}</div>
                                          <div>Run 名称: {job.run_name || '-'}</div>
                                          <div className="break-all">Run 路径: {job.run_path || '-'}</div>
                                          <div>状态: {job.status || '-'}</div>
                                          <div>调度状态: {job.dispatch_status || '-'}</div>
                                          <div>开始时间: {formatDateTime(job.started_at)}</div>
                                          <div>最近更新时间: {formatDateTime(job.updated_at)}</div>
                                        </div>
                                      </div>
                                      {job.mapped && job.task_id ? (
                                        <button
                                          type="button"
                                          onClick={() => void openTaskDetail({ task_id: job.task_id || '', latest_execution_id: job.execution_id || '' })}
                                          className="inline-flex items-center gap-1 rounded-lg border border-cyan-200 bg-white px-3 py-1.5 text-xs font-bold text-cyan-700 hover:bg-cyan-50"
                                        >
                                          进入任务
                                          <ChevronRight size={14} />
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export const DataflowVulnTaskDetailPage: React.FC<{ projectId: string; onBack?: () => void }> = ({ projectId, onBack }) => {
  const executionApi = api.domains.execution.dataflowVulnScanner;
  const navigate = useNavigate();
  const location = useLocation();
  const { taskId: routeTaskId } = useParams<{ taskId?: string }>();
  const { notify, feedbackNodes } = useUiFeedback();

  const taskId = routeTaskId || '';
  const routeRunId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('run_id') || '';
  }, [location.search]);
  const requestedExecutionId = useMemo(() => new URLSearchParams(location.search).get('execution_id') || '', [location.search]);
  const linkedTaskId = useMemo(() => new URLSearchParams(location.search).get('linked_task_id') || '', [location.search]);
  const fileserverRunName = useMemo(() => new URLSearchParams(location.search).get('fileserver_run') || '', [location.search]);
  const fileserverRootPath = useMemo(
    () => new URLSearchParams(location.search).get('fileserver_root') || DEFAULT_DATAFLOW_FILESERVER_RUNS_ROOT,
    [location.search]
  );
  const routeState = (location.state as DataflowVulnRouteState | null) || null;
  const fileserverRouteSummary = routeState?.fileserverRunSummary || null;
  const returnView = routeState?.returnView || '';
  const isSyntheticFileserverTask = useMemo(() => isSyntheticFileserverTaskId(taskId), [taskId]);
  const isFileserverMode = isSyntheticFileserverTask && Boolean(fileserverRunName);
  const isRunBootstrapMode = isSyntheticFileserverTask && Boolean(routeRunId && !fileserverRunName);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [linkedTaskDetail, setLinkedTaskDetail] = useState<DataflowScanTaskDetail | null>(null);
  const routeResolveGenerationRef = useRef(0);

  const goBack = () => {
    if (returnView === DATAFLOW_VULN_LIST_RETURN_VIEW) {
      navigate('/pentest-exec-dataflow-vuln');
      return;
    }
    if (navigateBackByTaskOrigin(linkedTaskDetail)) {
      return;
    }
    if (navigateBackToBinarySecurityTask()) {
      return;
    }
    if (onBack) {
      onBack();
      return;
    }
    navigate('/pentest-exec-dataflow-vuln');
  };

  const resolveTaskRouteToRun = async (
    targetTaskId: string,
    preferredExecutionId = requestedExecutionId,
    isActive: () => boolean = () => true
  ) => {
    if (!projectId || !targetTaskId) return;
    if (!isActive()) return;
    const cached = readCachedTaskRunRoute(targetTaskId, preferredExecutionId || '');
    if (cached) {
      if (!isActive()) return;
      navigate(buildRunDetailPath(cached), { replace: true });
      return;
    }
    if (!isActive()) return;
    setDetailLoading(true);
    setLoadError('');
    try {
      let executionId = preferredExecutionId || '';

      if (executionId) {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const resolved = await executionApi.resolveRunByTask(projectId, targetTaskId, executionId);
            if (!isActive()) return;
            const target = runResolveToRouteTarget(resolved);
            writeCachedTaskRunRoute(targetTaskId, resolved.linked_execution_id || executionId, target);
            navigate(buildRunDetailPath(target), { replace: true });
            return;
          } catch (error: any) {
            if (!isActive()) return;
            if (attempt >= 2) break;
          }
          await wait(300);
          if (!isActive()) return;
        }
      }

      try {
        const taskDetail = await executionApi.getTask(targetTaskId);
        if (!isActive()) return;
        setLinkedTaskDetail(taskDetail);
        const run = taskRunLocator(taskDetail);
        if (run.name && run.root_path) {
          writeCachedTaskRunRoute(targetTaskId, taskDetail.latest_execution_id, run as DataflowFileserverRunSummary);
          navigate(buildRunDetailPath(run as DataflowFileserverRunSummary), {
            replace: true,
            state: {
              fileserverRunSummary: run,
            },
          });
          return;
        }
        executionId = executionId || taskDetail.latest_execution_id || '';
      } catch {
        if (!isActive()) return;
        setLinkedTaskDetail(null);
      }
      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          const resolved = await executionApi.resolveRunByTask(projectId, targetTaskId, executionId);
          if (!isActive()) return;
          const target = runResolveToRouteTarget(resolved);
          writeCachedTaskRunRoute(targetTaskId, resolved.linked_execution_id || executionId, target);
          navigate(buildRunDetailPath(target), { replace: true });
          return;
        } catch (error: any) {
          if (!isActive()) return;
          if (attempt >= 5) throw error;
        }
        if (attempt < 5) {
          await wait(500);
          if (!isActive()) return;
        }
      }
      if (!isActive()) return;
      setLoadError('没有找到该任务对应的 Run 目录。可能任务刚创建完成，Run 目录仍在初始化；请稍后刷新任务列表。');
    } catch (error: any) {
      if (!isActive()) return;
      setLoadError(error?.message || '解析任务对应 Run 失败');
    } finally {
      if (isActive()) {
        setDetailLoading(false);
      }
    }
  };

  useEffect(() => {
    if (isFileserverMode || isRunBootstrapMode) return;
    let cancelled = false;
    const generation = routeResolveGenerationRef.current + 1;
    routeResolveGenerationRef.current = generation;
    const isActive = () => !cancelled && routeResolveGenerationRef.current === generation;
    void resolveTaskRouteToRun(taskId, requestedExecutionId, isActive);
    return () => {
      cancelled = true;
    };
  }, [taskId, requestedExecutionId, isFileserverMode, isRunBootstrapMode, fileserverRunName, fileserverRootPath, projectId]);

  useEffect(() => {
    if (!linkedTaskId || !projectId) {
      if (isSyntheticFileserverTask) setLinkedTaskDetail(null);
      return;
    }
    let cancelled = false;
    executionApi.getTask(linkedTaskId)
      .then((task) => {
        if (!cancelled) setLinkedTaskDetail(task);
      })
      .catch(() => {
        if (!cancelled) setLinkedTaskDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [executionApi, isSyntheticFileserverTask, linkedTaskId, projectId]);

  useEffect(() => {
    if (!isRunBootstrapMode || !routeRunId) return;
    let cancelled = false;
    setDetailLoading(true);
    setLoadError('');
    executionApi.getRun(routeRunId)
      .then((run) => {
        if (cancelled) return;
        const params = new URLSearchParams(location.search);
        params.set('run_id', run.run_id || routeRunId);
        params.set('fileserver_run', run.name);
        params.set('fileserver_root', run.root_path || DEFAULT_DATAFLOW_FILESERVER_RUNS_ROOT);
        navigate(`/pentest-exec-dataflow-vuln-task-detail/${encodeURIComponent(fileserverTaskId(run.name))}?${params.toString()}`, {
          replace: true,
          state: fileserverRouteSummary ? { fileserverRunSummary: fileserverRouteSummary } : undefined,
        });
      })
      .catch((error: any) => {
        if (cancelled) return;
        const message = error?.message || '解析 Run 失败';
        setLoadError(message);
        notify(`解析 Run 失败: ${message}`, 'error');
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [executionApi, fileserverRouteSummary, routeRunId, isRunBootstrapMode, location.search, navigate, notify]);

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

  if (isRunBootstrapMode) {
    return (
      <div className="min-h-full bg-slate-100 px-5 py-5 text-slate-900 lg:px-8 lg:py-7">
        {feedbackNodes}
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 text-sm font-bold text-slate-600">
              <Loader2 size={16} className={detailLoading ? 'animate-spin' : ''} />
              {loadError ? `解析 Run 失败: ${loadError}` : '正在解析 Run...'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (taskId && !isSyntheticFileserverTask) {
    return (
      <div className="min-h-full bg-slate-100 px-5 py-5 text-slate-900 lg:px-8 lg:py-7">
        {feedbackNodes}
        <div className="space-y-4">
          <PageHeader
            eyebrow="DATAFLOW VULNERABILITY DISCOVERY"
            title="正在进入 Run 详情"
            description="该入口会先定位任务对应的 Run，然后进入详情页。"
          >
            <button
              onClick={goBack}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft size={16} />
              返回列表
            </button>
            <button
              onClick={() => void resolveTaskRouteToRun(taskId, requestedExecutionId)}
              disabled={detailLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {detailLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              重新解析
            </button>
          </PageHeader>
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 text-sm font-bold text-slate-600">
              <Loader2 size={16} className={detailLoading ? 'animate-spin' : ''} />
              {loadError || `正在查找任务 ${shortId(taskId, 20)} 对应的 Run...`}
            </div>
            {loadError ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                暂时未找到该任务对应的 Run。若这是刚创建的任务，请等待后端完成 Run 目录初始化后再重试。
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-100 px-5 py-5 text-slate-900 lg:px-8 lg:py-7">
      {feedbackNodes}
      <div className="space-y-4">
        <PageHeader
          eyebrow="DATAFLOW VULNERABILITY DISCOVERY"
          title="缺少 Run 入口"
          description="请从任务列表选择一个 Run 后进入。"
        >
          <button
            type="button"
            onClick={goBack}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            返回任务列表
          </button>
        </PageHeader>
        <EmptyPanel title="缺少 Run" description="无法定位要查看的漏洞挖掘 Run，请返回任务列表后重新进入。" icon={<AlertTriangle size={22} />} />
      </div>
    </div>
  );
};

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

  const pickerMode = 'directory';
  const pickerTitle = pickerField === 'workspacePath'
    ? '选择 Runs 根目录'
    : pickerField === 'dataFlowPath'
      ? '选择数据流目录'
      : '选择代码目录';
  const pickerDescription = pickerField === 'workspacePath'
    ? '从数据流漏洞挖掘服务直接挂载的 /data 中选择 run_vuln_scan.py 的 --runs-root。系统会在该目录下创建标准 Run 扫描目录。'
    : pickerField === 'dataFlowPath'
      ? '从数据流漏洞挖掘服务直接挂载的 /data 中选择包含数据流分析结果文件的目录。'
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
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <label className="lg:col-span-2">
                <span className="text-xs font-black text-slate-600">任务标题 / Run 文件夹名</span>
                <input
                  value={state.title}
                  onChange={(event) => onChange({ ...state, title: event.target.value })}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-cyan-600"
                />
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  提交后会作为后端 run_vuln_scan.py 的 --run-name，最终目录名会做安全字符清洗。
                </span>
              </label>
              <label className="lg:col-span-2">
                <span className="text-xs font-black text-slate-600">Profile</span>
                <select
                  value={state.profileId}
                  onChange={(event) => {
                    const profile = profiles.find((item) => item.profile_id === event.target.value);
                    const payload = event.target.value
                      ? normalizeConfigPayload(profile?.config_payload)
                      : createTaskDefaultConfigPayload();
                    onChange({
                      ...state,
                      profileId: event.target.value,
                      model: event.target.value ? payload.model : DEFAULT_CREATE_TASK_MODEL,
                      reviewProfile: payload.review_profile || createTaskDefaultConfigPayload().review_profile || 'fast',
                      maxReviewCycles: payload.max_review_cycles,
                      timeoutMaxRetries: payload.timeout_max_retries ?? 3,
                      timeoutRetryIntervalSeconds: payload.timeout_retry_interval_seconds ?? 30,
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
                  Runs 根目录
                </div>
                <div className="mt-2 text-xs leading-5 text-slate-500">默认使用当前项目的 /app/secflow-app-dataflow-vuln-scanner；后端会在该目录下创建标准 Run 扫描目录。</div>
                <div className="mt-3 flex gap-2">
                  <input
                    value={state.workspacePath}
                    onChange={(event) => onChange({ ...state, workspacePath: event.target.value })}
                    placeholder={DEFAULT_DATAFLOW_VULN_RUNS_ROOT}
                    className={FORM_INPUT_CLASS}
                  />
                  <button type="button" onClick={() => setPickerField('workspacePath')} className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
                    选择
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-sm font-black text-slate-900">
                  <FolderOpen size={16} />
                  数据流目录
                </div>
                <div className="mt-2 text-xs leading-5 text-slate-500">直接从项目文件资源中选择包含 `data_flow.md` 或其他分析结果文件的目录。</div>
                <div className="mt-3 flex gap-2">
                  <input
                    value={state.dataFlowPath}
                    onChange={(event) => onChange({ ...state, dataFlowPath: event.target.value })}
                    placeholder="/case-a/data_flow"
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

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <label>
                <span className="text-xs font-black text-slate-600">模型</span>
                <input value={state.model} onChange={(event) => onChange({ ...state, model: event.target.value })} className={FORM_INPUT_CLASS} />
              </label>
              <label>
                <span className="text-xs font-black text-slate-600">Provider（可选）</span>
                <input value={state.provider} onChange={(event) => onChange({ ...state, provider: event.target.value })} placeholder="openai / anthropic" className={FORM_INPUT_CLASS} />
              </label>
              <label>
                <span className="text-xs font-black text-slate-600">Review Profile</span>
                <select
                  value={state.reviewProfile}
                  onChange={(event) => {
                    const nextProfile = event.target.value;
                    onChange({
                      ...state,
                      reviewProfile: nextProfile,
                      maxReviewCycles: REVIEW_PROFILE_DEFAULT_MAX_CYCLES[nextProfile] || state.maxReviewCycles,
                    });
                  }}
                  className={FORM_INPUT_CLASS}
                >
                  {REVIEW_PROFILE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
                {state.reviewProfile === 'fast' ? (
                  <span className="mt-1 block text-[11px] leading-4 text-slate-500">快速筛选会关闭评审；这里的“1”表示至少执行 1 个发现周期，不代表还会再做 1 轮评审。</span>
                ) : null}
              </label>
              <label>
                <span className="text-xs font-black text-slate-600">最大评审轮次</span>
                <input type="number" min={1} value={state.maxReviewCycles} onChange={(event) => onChange({ ...state, maxReviewCycles: Number(event.target.value) || 1 })} className={FORM_INPUT_CLASS} />
              </label>
              <label>
                <span className="text-xs font-black text-slate-600">Pi Timeout 最大次数</span>
                <input type="number" min={1} value={state.timeoutMaxRetries} onChange={(event) => onChange({ ...state, timeoutMaxRetries: Number(event.target.value) || 1 })} className={FORM_INPUT_CLASS} />
                <span className="mt-1 block text-[11px] leading-4 text-slate-500">默认 3；Pi/provider 返回 timeout 时按该次数重发同一提示词。</span>
              </label>
              <label>
                <span className="text-xs font-black text-slate-600">Pi Timeout 重试间隔（秒）</span>
                <input type="number" min={0} value={state.timeoutRetryIntervalSeconds} onChange={(event) => onChange({ ...state, timeoutRetryIntervalSeconds: Math.max(0, Number(event.target.value) || 0) })} className={FORM_INPUT_CLASS} />
                <span className="mt-1 block text-[11px] leading-4 text-slate-500">默认 30；仅在最大次数大于 1 时生效。</span>
              </label>
              <label>
                <span className="text-xs font-black text-slate-600">结果评审并发</span>
                <input type="number" min={1} value={state.resultReviewConcurrency} onChange={(event) => onChange({ ...state, resultReviewConcurrency: Number(event.target.value) || 1 })} className={FORM_INPUT_CLASS} />
              </label>
            </div>

            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/70 p-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={state.autoReportVulnerabilities}
                  onChange={(event) => onChange({ ...state, autoReportVulnerabilities: event.target.checked })}
                  className="mt-1 h-4 w-4 rounded border-emerald-300 text-emerald-700 focus:ring-emerald-600"
                />
                <span>
                  <span className="flex items-center gap-2 text-sm font-black text-emerald-950">
                    <ShieldCheck size={16} />
                    自动上报漏洞疑点
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-emerald-800">
                    默认开启。任务成功后会将最终有效的 result_NNN.md 上报到当前项目的漏洞引擎，并记录原始任务 ID、执行 ID 和结果文件路径。
                  </span>
                </span>
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
  reviewProfile: string;
  maxReviewCycles: number;
  resultReviewConcurrency: number;
  runtimeOverridesText: string;
  isDefault: boolean;
  enabled: boolean;
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
    reviewProfile: payload.review_profile || 'balanced',
    maxReviewCycles: payload.max_review_cycles,
    resultReviewConcurrency: payload.result_review_concurrency,
    runtimeOverridesText: '{}',
    isDefault: true,
    enabled: true,
    defaultPriority: 100,
    maxRetryCount: 0,
    executionTimeoutSeconds: 0,
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
    reviewProfile: payload.review_profile || 'balanced',
    maxReviewCycles: payload.max_review_cycles,
    resultReviewConcurrency: payload.result_review_concurrency,
    runtimeOverridesText: JSON.stringify(payload.runtime_overrides || {}, null, 2),
    isDefault: profile.is_default,
    enabled: profile.enabled,
    defaultPriority: profile.default_priority,
    maxRetryCount: 0,
    executionTimeoutSeconds: 0,
  };
};

const profilePayloadFromForm = (projectId: string, form: ProfileFormState) => ({
  project_id: projectId,
  name: form.name.trim(),
  description: form.description.trim() || undefined,
  template_kind: form.templateKind,
  config_payload: {
    model: form.model.trim(),
    review_profile: form.reviewProfile,
    max_review_cycles: form.maxReviewCycles,
    result_review_concurrency: form.resultReviewConcurrency,
    runtime_overrides: parseJsonObject(form.runtimeOverridesText, 'Profile runtime_overrides'),
  },
  is_default: form.isDefault,
  enabled: form.enabled,
  default_priority: form.defaultPriority,
  max_retry_count: form.maxRetryCount,
  execution_timeout_seconds: form.executionTimeoutSeconds,
});

type ProfilePanelId = 'basic' | 'review' | 'runtime';

const PROFILE_PANEL_FIELDS: Record<ProfilePanelId, Array<keyof ProfileFormState>> = {
  basic: ['name', 'description', 'templateKind', 'enabled', 'isDefault'],
  review: ['model', 'reviewProfile', 'maxReviewCycles', 'resultReviewConcurrency'],
  runtime: ['runtimeOverridesText'],
};

const applyProfilePanel = (base: ProfileFormState, draft: ProfileFormState, panel: ProfilePanelId): ProfileFormState => {
  const next = { ...base };
  PROFILE_PANEL_FIELDS[panel].forEach((field) => {
    next[field] = draft[field] as never;
  });
  return next;
};

const isProfilePanelDirty = (saved: ProfileFormState, draft: ProfileFormState, panel: ProfilePanelId) =>
  PROFILE_PANEL_FIELDS[panel].some((field) => saved[field] !== draft[field]);

export const DataflowVulnConfigPage: React.FC<{ projectId: string; embedded?: boolean }> = ({ projectId, embedded = false }) => {
  const executionApi = api.domains.execution.dataflowVulnScanner;
  const { notify, confirm, feedbackNodes } = useUiFeedback();
  const [profiles, setProfiles] = useState<DataflowScanProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [form, setForm] = useState<ProfileFormState>(blankProfileForm);
  const [versions, setVersions] = useState<any[]>([]);
  const [effectiveConfig, setEffectiveConfig] = useState<any>(null);
  const [serviceConfig, setServiceConfig] = useState<any>(null);
  const [serviceRuntimeConfig, setServiceRuntimeConfig] = useState<DataflowServiceRuntimeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPanel, setSavingPanel] = useState<ProfilePanelId | null>(null);
  const [savingServiceConfig, setSavingServiceConfig] = useState(false);

  const load = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [profileResp, projectConfigResp, serviceConfigResp, serviceRuntimeResp] = await Promise.all([
        executionApi.listProfiles(projectId),
        executionApi.getProjectEffectiveConfig(projectId).catch(() => null),
        executionApi.getServiceEffectiveConfig().catch(() => null),
        executionApi.getServiceConfig().catch(() => null),
      ]);
      setProfiles(profileResp || []);
      setEffectiveConfig(projectConfigResp);
      setServiceConfig(serviceConfigResp);
      setServiceRuntimeConfig(serviceRuntimeResp);
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
  const savedForm = selectedProfile ? formFromProfile(selectedProfile) : blankProfileForm();

  const saveProfile = async (panel?: ProfilePanelId) => {
    if (!projectId) {
      notify('请先选择项目', 'warning');
      return;
    }
    if (!form.name.trim() || !form.model.trim()) {
      notify('Profile 名称和模型不能为空', 'warning');
      return;
    }
    setSaving(true);
    if (panel) {
      setSavingPanel(panel);
    }
    try {
      const payloadForm = panel ? applyProfilePanel(savedForm, form, panel) : form;
      const payload = profilePayloadFromForm(projectId, payloadForm);
      const saved = form.profileId
        ? await executionApi.updateProfile(form.profileId, payload)
        : await executionApi.createProfile(payload);
      const nextSavedForm = formFromProfile(saved);
      const nextDraft = panel ? applyProfilePanel(form, nextSavedForm, panel) : nextSavedForm;
      notify(panel ? '分组配置已保存' : 'Profile 已保存', 'success');
      setSelectedProfileId(saved.profile_id);
      await load();
      await loadVersions(saved.profile_id);
      setForm(nextDraft);
    } catch (error: any) {
      notify(error?.message || '保存 Profile 失败', 'error');
    } finally {
      setSaving(false);
      setSavingPanel(null);
    }
  };

  const resetProfilePanel = (panel: ProfilePanelId, label: string) => {
    setForm((current) => applyProfilePanel(current, blankProfileForm(), panel));
    notify(`${label}已重置为默认值（尚未保存）`, 'info');
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

  const configActions = (
    <>
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
    </>
  );

  const updateServiceSchedulerField = (key: string, value: any) => {
    setServiceRuntimeConfig((current) => ({
      service_name: current?.service_name || 'secflow-app-dataflow-vuln-scanner',
      api_prefix: current?.api_prefix || '/api/dataflow-vuln-scanner',
      config: {
        ...(current?.config || {}),
        scheduler: {
          ...((current?.config?.scheduler as Record<string, any>) || {}),
          [key]: value,
        },
      },
    }));
  };

  const updateServiceWorkerField = (key: string, value: any) => {
    setServiceRuntimeConfig((current) => ({
      service_name: current?.service_name || 'secflow-app-dataflow-vuln-scanner',
      api_prefix: current?.api_prefix || '/api/dataflow-vuln-scanner',
      config: {
        ...(current?.config || {}),
        dataflow_worker: {
          ...((current?.config?.dataflow_worker as Record<string, any>) || {}),
          [key]: value,
        },
      },
    }));
  };

  const saveRuntimeConfig = async () => {
    if (!serviceRuntimeConfig) return;
    setSavingServiceConfig(true);
    try {
      const saved = await executionApi.saveServiceConfig(serviceRuntimeConfig.config);
      setServiceRuntimeConfig(saved);
      setServiceConfig(await executionApi.getServiceEffectiveConfig().catch(() => serviceConfig));
      notify('调度与并发参数已保存', 'success');
    } catch (error: any) {
      notify(error?.message || '保存调度参数失败', 'error');
    } finally {
      setSavingServiceConfig(false);
    }
  };

  return (
    <div className={embedded ? 'space-y-6 text-slate-900' : 'min-h-full bg-slate-100 px-5 py-5 text-slate-900 lg:px-8 lg:py-7'}>
      {feedbackNodes}
      <div className={embedded ? 'space-y-6' : 'mx-auto max-w-[1800px] space-y-4'}>
        {embedded ? (
          <section className="rounded-[2rem] border border-slate-200 bg-slate-50/70 p-6 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Settings size={18} className="text-rose-600" />
                  <h2 className="text-xl font-black text-slate-900">数据流漏洞挖掘参数配置</h2>
                  <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-black tracking-[0.12em] text-rose-700">
                    secflow-app-dataflow-vuln-scanner
                  </span>
                </div>
                <p className="mt-2 max-w-4xl text-sm text-slate-500">
                  当前 Tab 中的全部配置项都归属于 `secflow-app-dataflow-vuln-scanner` 微服务，用于维护项目级扫描 Profile、运行参数、默认模板和版本快照。
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">{configActions}</div>
            </div>
          </section>
        ) : (
          <PageHeader
            eyebrow="Scanner Configuration"
            title="漏洞挖掘系统配置"
            description="维护项目级扫描 Profile、运行参数、默认模板和版本快照；任务提交后会立即在后端 Pod 中启动运行。"
          >
            {configActions}
          </PageHeader>
        )}

        <StaticPipelineFlow
          title={DATAFLOW_VULN_FLOW.title}
          subtitle={DATAFLOW_VULN_FLOW.subtitle}
          lanes={DATAFLOW_VULN_FLOW.lanes}
          notes={DATAFLOW_VULN_FLOW.notes}
        />

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <MetricCard label="Profile 数" value={profiles.length} icon={<SlidersHorizontal size={17} />} />
          <MetricCard label="启用模板" value={profiles.filter((profile) => profile.enabled).length} icon={<CheckCircle2 size={17} />} />
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

          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <div className="text-sm font-black text-slate-900">{form.profileId ? '编辑 Profile' : '新建 Profile'}</div>
                <div className="mt-1 text-xs text-slate-500">{form.profileId || '尚未保存'}</div>
              </div>
              <div className="space-y-5 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-black text-slate-900">基础信息</div>
                    <div className="mt-1 text-xs text-slate-500">名称、模板类型、描述和默认启用状态。</div>
                  </div>
                  <PanelActions
                    saving={savingPanel === 'basic'}
                    disabled={!isProfilePanelDirty(savedForm, form, 'basic')}
                    onSave={() => { void saveProfile('basic'); }}
                    onReset={() => resetProfilePanel('basic', '基础信息')}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <Field label="名称">
                    <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={FORM_INPUT_CLASS} />
                  </Field>
                  <Field label="模板类型">
                    <select value={form.templateKind} onChange={(event) => setForm({ ...form, templateKind: event.target.value })} className={FORM_INPUT_CLASS}>
                      {TEMPLATE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
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
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="space-y-5 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-black text-slate-900">挖掘与评审参数</div>
                    <div className="mt-1 text-xs text-slate-500">模型、评审档位、评审轮次和结果评审并发。</div>
                  </div>
                  <PanelActions
                    saving={savingPanel === 'review'}
                    disabled={!isProfilePanelDirty(savedForm, form, 'review')}
                    onSave={() => { void saveProfile('review'); }}
                    onReset={() => resetProfilePanel('review', '挖掘与评审参数')}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <Field label="模型">
                    <input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} className={FORM_INPUT_CLASS} />
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
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="space-y-5 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-black text-slate-900">运行时覆盖</div>
                    <div className="mt-1 text-xs text-slate-500">针对当前 Profile 的 `runtime_overrides` JSON。</div>
                  </div>
                  <PanelActions
                    saving={savingPanel === 'runtime'}
                    disabled={!isProfilePanelDirty(savedForm, form, 'runtime')}
                    onSave={() => { void saveProfile('runtime'); }}
                    onReset={() => resetProfilePanel('runtime', '运行时覆盖')}
                  />
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
          </div>

          <div className="space-y-4">
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
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-black text-slate-900"><Settings size={16} />调度与并发</div>
                <div className="mt-1 text-xs text-slate-500">控制动态扩容自发现、槽位预留、批量分发、失联回收等关键参数。</div>
              </div>
              <button
                onClick={() => void saveRuntimeConfig()}
                disabled={!serviceRuntimeConfig || savingServiceConfig}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50"
              >
                <Save size={16} />
                {savingServiceConfig ? '保存中...' : '保存调度参数'}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Field label="Worker 发现方式">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700">
                  registry（固定）
                </div>
              </Field>
              <Field label="每 Pod 槽位数">
                <NumberInput value={Number(serviceRuntimeConfig?.config?.scheduler?.worker_capacity || 0)} onChange={(value) => updateServiceSchedulerField('worker_capacity', value)} />
              </Field>
              <Field label="单 worker 排队深度">
                <NumberInput value={Number(serviceRuntimeConfig?.config?.scheduler?.worker_queue_depth || 0)} onChange={(value) => updateServiceSchedulerField('worker_queue_depth', value)} />
              </Field>
              <Field label="心跳间隔(秒)">
                <NumberInput value={Number(serviceRuntimeConfig?.config?.scheduler?.heartbeat_interval_seconds || 5)} onChange={(value) => updateServiceSchedulerField('heartbeat_interval_seconds', value)} />
              </Field>
              <Field label="失联阈值(秒)">
                <NumberInput value={Number(serviceRuntimeConfig?.config?.scheduler?.worker_timeout_seconds || 300)} onChange={(value) => updateServiceSchedulerField('worker_timeout_seconds', value)} />
              </Field>
              <Field label="保留窗口(秒)">
                <NumberInput value={Number(serviceRuntimeConfig?.config?.scheduler?.worker_retention_seconds || 1800)} onChange={(value) => updateServiceSchedulerField('worker_retention_seconds', value)} />
              </Field>
              <Field label="reservation lease(秒)">
                <NumberInput value={Number(serviceRuntimeConfig?.config?.scheduler?.reservation_lease_seconds || 30)} onChange={(value) => updateServiceSchedulerField('reservation_lease_seconds', value)} />
              </Field>
              <Field label="dispatch 批次">
                <NumberInput value={Number(serviceRuntimeConfig?.config?.scheduler?.dispatch_batch_size || 8)} onChange={(value) => updateServiceSchedulerField('dispatch_batch_size', value)} />
              </Field>
              <Field label="dispatch 卡住回收(秒)">
                <NumberInput value={Number(serviceRuntimeConfig?.config?.scheduler?.requeue_stuck_dispatch_after_seconds || 60)} onChange={(value) => updateServiceSchedulerField('requeue_stuck_dispatch_after_seconds', value)} />
              </Field>
              <Field label="worker 自报地址模板">
                <input
                  value={String(serviceRuntimeConfig?.config?.dataflow_worker?.advertise_url_template || '')}
                  onChange={(event) => updateServiceWorkerField('advertise_url_template', event.target.value)}
                  className={FORM_INPUT_CLASS}
                  placeholder="http://{pod_id}.{headless_service_name}.{pod_namespace}.svc.cluster.local:8080"
                />
                <span className="mt-1 block text-[11px] leading-4 text-slate-500">留空时自动使用 registry FQDN：`pod_id.headless_service_name.pod_namespace.svc.cluster.local`。</span>
              </Field>
              <Field label="dispatch 重试间隔(秒)">
                <NumberInput value={Number(serviceRuntimeConfig?.config?.dataflow_worker?.dispatch_retry_interval_seconds || 2)} onChange={(value) => updateServiceWorkerField('dispatch_retry_interval_seconds', value)} />
              </Field>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900"><ServerCog size={16} />Agent 默认存储目录</div>
            {serviceConfig?.agent_storage?.agents?.length ? (
              <div className="overflow-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Agent</th>
                      <th className="px-3 py-2">Root</th>
                      <th className="px-3 py-2">Skills</th>
                      <th className="px-3 py-2">Memory</th>
                      <th className="px-3 py-2">来源</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serviceConfig.agent_storage.agents.map((item: any) => (
                      <tr key={item.agent_id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-mono text-xs font-bold text-slate-700">{item.agent_id}</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-600">{renderProjectScopedTemplate(item.root_dir_template, projectId)}</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-600">{renderProjectScopedTemplate(item.skills_dir_template, projectId)}</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-600">{renderProjectScopedTemplate(item.memory_dir_template, projectId)}</td>
                        <td className="px-3 py-2 text-xs font-bold text-slate-500">{item.source || 'shared_default'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyPanel title="暂无 Agent 存储配置" description="当前服务有效配置未返回可展示的 Agent 默认目录。" icon={<ServerCog size={22} />} />
            )}
          </div>
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
