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
import { StatisticCard } from '../../design-system';

const LK = {
  primary: '#2563EB', primarySoft: '#7590ff', primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'var(--brand-primary-mask)',
  canvas: 'var(--bg-app)', surface: 'var(--bg-surface)', surfaceRaised: 'var(--bg-app)',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: 'var(--border-default)', borderSoft: 'var(--border-default)',
  ink: 'var(--text-primary)', inkSoft: 'var(--text-secondary)', body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)', mutedSoft: '#8b95a8',
  success: '#30A46C', warning: '#D97706', error: '#DC2626', info: '#4f8cff',
  critical: '#ff4d4f', high: '#ff8b3d', medium: '#f0b64c', low: '#49c5ff',
} as const;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

const STATUS_META: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  pending: { label: '待启动', className: 'bg-theme-elevated text-theme-text-secondary border-theme-border', icon: <Clock size={13} /> },
  queued: { label: '启动中', className: 'bg-sky-500/15 text-sky-400 border-sky-500/20', icon: <Clock size={13} /> },
  running: { label: '运行中', className: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20', icon: <Activity size={13} /> },
  cancel_requested: { label: '取消中', className: 'bg-amber-500/15 text-amber-400 border-amber-500/20', icon: <PauseCircle size={13} /> },
  delete_requested: { label: '删除中', className: 'bg-rose-500/15 text-rose-400 border-rose-500/20', icon: <PauseCircle size={13} /> },
  completed: { label: '已完成', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', icon: <CheckCircle2 size={13} /> },
  failed: { label: '失败', className: 'bg-rose-500/15 text-rose-400 border-rose-500/20', icon: <XCircle size={13} /> },
  interrupted: { label: '已中断', className: 'bg-orange-500/15 text-orange-400 border-orange-500/20', icon: <AlertTriangle size={13} /> },
  cancelled: { label: '已取消', className: 'bg-theme-elevated text-theme-text-secondary border-theme-border', icon: <X size={13} /> },
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
  subtitle: '展示漏洞挖掘微服务从 Profile 模板到结果评审与漏洞上报的静态推进链路，帮助理解不同配置对扫描收敛的影响位置。',
  lanes: [
    {
      label: '扫描执行链路',
      steps: [
        { id: 'dfv-profile', title: 'Profile / 模板装载', desc: '装载项目默认或显式指定 Profile，并解析模板、模型与运行参数。', badge: '1', tone: 'guard' as const },
        { id: 'dfv-worker', title: 'Worker 挖掘', desc: '围绕数据流结果开展漏洞候选挖掘，输出 issue 与证据草稿。', badge: '2', tone: 'analysis' as const },
        { id: 'dfv-global-review', title: '全局评审', desc: 'Advisor / Global Review 判断候选质量、收敛方向和是否继续下一轮。', badge: '3', tone: 'review' as const },
        { id: 'dfv-result-review', title: '结果评审', desc: '对 issue 做并发结果复核，压缩误报并形成最终结论。', badge: '4', tone: 'review' as const },
        { id: 'dfv-report', title: '报告输出与上报', desc: '生成 Run 结果、漏洞报告，并在开启时向漏洞引擎上报漏洞。', badge: '5', tone: 'artifact' as const },
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

const FORM_INPUT_STYLE = {
  width: '100%',
  borderRadius: 8,
  border: `1px solid ${LK.borderSoft}`,
  backgroundColor: LK.surfaceRaised,
  padding: '10px 12px',
  fontSize: 14,
  fontWeight: 400,
  color: LK.inkSoft,
  outline: 'none',
  transition: 'border-color 0.2s',
};

const DEFAULT_DATAFLOW_VULN_RUNS_ROOT = '/app/secflow-app-dataflow-vuln-scan';
const DEFAULT_CREATE_TASK_MODEL = 'local_minimax/MiniMax/MiniMax-M2.5';
const TASK_PURPOSE_META: Record<string, { label: string; className: string }> = {
  normal: { label: '正常任务', className: 'border-[#1b2438] bg-theme-elevated text-[#a4aec4]' },
  evolution: { label: '进化任务', className: 'border-[#d5a13a] bg-[rgba(213,161,58,0.15)] text-[#d5a13a]' },
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
  if (seconds < 60) return`${seconds}s`;
  if (seconds < 3600) return`${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return`${hours}h ${minutes}m`;
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
  return`${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
};

const formatSeconds = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '-';
  if (seconds < 60) return`${Math.floor(seconds)}s`;
  if (seconds < 3600) return`${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  return`${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
};

const shortId = (value?: string | null, size = 12) => {
  const text = String(value || '');
  return text.length > size ?`${text.slice(0, size)}...` : text || '-';
};

const isPlainObject = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const formatMilliseconds = (value?: number | null) => {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms <= 0) return '-';
  if (ms < 1000) return`${Math.floor(ms)}ms`;
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
  return parts.length ?`/${parts.join('/')}` : '/';
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

const fileserverTaskId = (runName: string) =>`fileserver:${runName}`;
const isSyntheticFileserverTaskId = (value?: string | null) => String(value || '').startsWith('fileserver:');
const decodeFileserverTaskRunName = (value?: string | null) => {
  const normalized = String(value || '').trim();
  if (!isSyntheticFileserverTaskId(normalized)) return '';
  return normalized.slice('fileserver:'.length);
};
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const TASK_RUN_ROUTE_CACHE_PREFIX = 'chimera:dataflowVuln:taskRunRoute:';
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
  return`/pentest-exec-dataflow-vuln-task-detail/${encodeURIComponent(fileserverTaskId(run.name))}?${params.toString()}`;
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
  const pathRoot = pathParts.length > 1 ?`/${pathParts.slice(0, -1).join('/')}` : '';
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
  return`${rootPath}/${name}`;
};

const taskDisplayStatus = (task: DataflowScanTask) => String(task.status || '');
const taskPurposeMeta = (purpose?: string | null) => TASK_PURPOSE_META[String(purpose || 'normal').trim()] || TASK_PURPOSE_META.normal;
const renderProjectScopedTemplate = (template: string, projectId: string) =>
  String(template || '').replaceAll('{project_id}', projectId || '{project_id}');
const agentStateDirList = (dirs?: Record<string, DataflowAgentStateDir> | null) =>
  Object.values(dirs || {}).sort((left, right) => left.agent_id.localeCompare(right.agent_id));

const vulnReportStatusLabel = (task: DataflowScanTask) => {
  if (task.auto_report_vulnerabilities === false) return { label: '未开启', className: 'border-theme-border bg-theme-elevated text-theme-text-muted' };
  const status = String(task.vuln_report_status?.status || 'not_started');
  if (status === 'reported') return { label:`已上报 ${task.vuln_report_status?.reported || 0}`, className: 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400' };
  if (status === 'partial_failed') return { label: '部分失败', className: 'border-amber-500/20 bg-amber-500/15 text-amber-400' };
  if (status === 'failed') return { label: '上报失败', className: 'border-rose-500/20 bg-rose-500/15 text-rose-400' };
  if (status === 'empty') return { label: '无漏洞', className: 'border-theme-border bg-theme-elevated text-theme-text-muted' };
  return { label: '待上报', className: 'border-cyan-500/20 bg-cyan-500/15 text-cyan-400' };
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
    className: 'bg-theme-elevated text-theme-text-secondary border-theme-border',
    icon: <AlertTriangle size={13} />,
  };
};

const isActiveTaskStatus = (status?: string | null) =>
  ['pending', 'queued', 'running', 'cancel_requested', 'delete_requested'].includes(normalizeRunStatus(status));

type ExecutionSlotState = 'running' | 'pending' | 'expired' | 'released' | 'idle';
type ExecutionSlotFilterState = 'bound' | 'queued' | 'unbound' | 'released';

function parseOwnerHost(owner?: string | null) {
  const normalized = String(owner || '').trim();
  if (!normalized) return '';
  const separator = normalized.indexOf(':');
  return separator >= 0 ? normalized.slice(0, separator) : normalized;
}

function isHeartbeatExpired(heartbeatAgeSeconds?: number | null): boolean {
  return typeof heartbeatAgeSeconds === 'number' && Number.isFinite(heartbeatAgeSeconds) && heartbeatAgeSeconds > 300;
}

function isLeaseExpired(leaseUntil?: string | null): boolean {
  if (!leaseUntil) return false;
  const ts = new Date(leaseUntil).getTime();
  return Number.isFinite(ts) && ts < Date.now();
}

function getExecutionSlotView(task: DataflowScanTask): {
  state: ExecutionSlotState;
  filterState: ExecutionSlotFilterState;
  label: string;
  ownerLabel: string;
  ownerFull: string;
  detail: string[];
  className: string;
} {
  const status = normalizeRunStatus(task.status);
  const ownerFull = String(task.execution_owner_id || task.owner_pod_id || '').trim();
  const ownerLabel = parseOwnerHost(ownerFull);
  const dispatchStatus = String(task.dispatch_status || '').trim();
  const heartbeatAt = task.execution_heartbeat_at || task.heartbeat_at;
  const heartbeat = heartbeatAt ?`心跳 ${new Date(heartbeatAt).toLocaleString('zh-CN')}` : '';
  const heartbeatAge = typeof task.heartbeat_age_seconds === 'number' ?`距今 ${task.heartbeat_age_seconds}s` : '';
  const lease = task.execution_lease_until ?`租约至 ${new Date(task.execution_lease_until).toLocaleString('zh-CN')}` : '';
  const terminal = ['completed', 'failed', 'interrupted', 'cancelled'].includes(status);
  const queued = dispatchStatus === 'queued' || dispatchStatus === 'dispatching' || dispatchStatus === 'leased' || status === 'queued';
  const canonicalOwner = String(task.execution_owner_id || '').trim();
  const ownerBackfilled = Boolean(canonicalOwner || ownerFull);
  const staleOwner = Boolean(ownerBackfilled && (isLeaseExpired(task.execution_lease_until) || isHeartbeatExpired(task.heartbeat_age_seconds)));

  if (terminal) {
    return {
      state: 'released',
      filterState: 'released',
      label: '已释放',
      ownerLabel: '',
      ownerFull,
      detail: [dispatchStatus || status].filter(Boolean),
      className: 'border-theme-border bg-theme-elevated text-theme-text-secondary',
    };
  }
  if (status === 'running' && ownerBackfilled && staleOwner) {
    return {
      state: 'expired',
      filterState: 'bound',
      label: '状态过期',
      ownerLabel: ownerLabel || ownerFull,
      ownerFull,
      detail: [dispatchStatus, lease || heartbeatAge || heartbeat].filter(Boolean).slice(0, 2),
      className: 'border-orange-500/20 bg-orange-500/15 text-orange-400',
    };
  }
  if (status === 'running' && ownerBackfilled) {
    return {
      state: 'running',
      filterState: 'bound',
      label: '运行中',
      ownerLabel: ownerLabel || ownerFull,
      ownerFull,
      detail: [dispatchStatus, heartbeat || lease || heartbeatAge].filter(Boolean).slice(0, 2),
      className: 'border-cyan-500/20 bg-cyan-500/15 text-cyan-400',
    };
  }
  if (status === 'pending' || status === 'queued') {
    return {
      state: 'pending',
      filterState: queued ? 'queued' : 'unbound',
      label: queued ? '排队中' : '未占用槽位',
      ownerLabel: '',
      ownerFull,
      detail: [dispatchStatus || status].filter(Boolean),
      className: 'border-amber-500/20 bg-amber-500/15 text-amber-400',
    };
  }
  if (ownerBackfilled && queued) {
    return {
      state: 'pending',
      filterState: 'bound',
      label: '运行中',
      ownerLabel: ownerLabel || ownerFull,
      ownerFull,
      detail: [dispatchStatus, heartbeat || lease || heartbeatAge].filter(Boolean).slice(0, 2),
      className: 'border-cyan-500/20 bg-cyan-500/15 text-cyan-400',
    };
  }
  return {
    state: 'idle',
    filterState: 'unbound',
    label: '未占用槽位',
    ownerLabel: ownerLabel || '',
    ownerFull,
    detail: [dispatchStatus].filter(Boolean),
    className: 'border-theme-border bg-theme-elevated text-theme-text-secondary',
  };
}

const StatusBadge: React.FC<{ status?: string | null }> = ({ status }) => {
  const meta = statusMeta(status);
  const style = meta.className.includes('bg-theme-elevated')
    ? { backgroundColor: LK.surfaceRaised, color: LK.body, borderColor: LK.borderSoft }
    : meta.className.includes('bg-sky-500/15')
    ? { backgroundColor: `${LK.info}15`, color: LK.info, borderColor: `${LK.info}40` }
    : meta.className.includes('bg-cyan-500/15')
    ? { backgroundColor: `${LK.primary}15`, color: LK.primary, borderColor: `${LK.primary}40` }
    : meta.className.includes('bg-amber-500/15')
    ? { backgroundColor: `${LK.warning}15`, color: LK.warning, borderColor: `${LK.warning}40` }
    : meta.className.includes('bg-rose-500/15')
    ? { backgroundColor: `${LK.error}15`, color: LK.error, borderColor: `${LK.error}40` }
    : meta.className.includes('bg-emerald-500/15')
    ? { backgroundColor: `${LK.success}15`, color: LK.success, borderColor: `${LK.success}40` }
    : meta.className.includes('bg-orange-500/15')
    ? { backgroundColor: `${LK.warning}15`, color: LK.warning, borderColor: `${LK.warning}40` }
    : { backgroundColor: LK.surfaceRaised, color: LK.body, borderColor: LK.borderSoft };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 9999, border: '1px solid', padding: '4px 10px', fontSize: 11, fontWeight: 600, ...style }}>
      {meta.icon}
      {meta.label}
    </span>
  );
};

const MetricCard: React.FC<{ label: string; value: React.ReactNode; icon: React.ReactNode; tone?: string; hint?: string }> = ({ label, value, icon, tone, hint }) => {
  const toneMap: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info' | 'brand'> = {
    success: 'success', warning: 'warning', danger: 'danger', info: 'info', brand: 'brand',
    emerald: 'success', rose: 'danger', amber: 'warning', red: 'danger', green: 'success',
    'bg-emerald-500/10': 'success', 'bg-rose-500/10': 'danger', 'bg-theme-elevated': 'default',
  };
  return <StatisticCard label={label} value={value} icon={icon} hint={hint} tone={tone ? (toneMap[tone] ?? 'default') : 'default'} />;
};

const EmptyPanel: React.FC<{ title: string; description: string; icon?: React.ReactNode }> = ({ title, description, icon = <FileSearch size={22} /> }) => (
  <div style={{ borderRadius: 12, border: `1px dashed ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, padding: '24px 48px', textAlign: 'center' }}>
    <div style={{ margin: '0 auto', display: 'flex', height: 48, width: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surface, color: LK.muted }}>{icon}</div>
    <div style={{ marginTop: 16, fontSize: 14, fontWeight: 600, color: LK.ink }}>{title}</div>
    <div style={{ marginTop: 8, fontSize: 14, color: LK.body }}>{description}</div>
  </div>
);

const JsonBlock: React.FC<{ value: any; maxHeight?: string }> = ({ value, maxHeight = 'max-h-80' }) => (
  <pre style={{ maxHeight: maxHeight === 'max-h-80' ? 320 : maxHeight, overflow: 'auto', borderRadius: 8, border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, padding: 16, fontSize: 12, lineHeight: 1.25, color: LK.ink, fontFamily: MONO }}>
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
  <section style={{ borderRadius: 12, border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surface, padding: 20 }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.2em', color: LK.primary }}>{eyebrow}</p>
        <ServicePageTitle
          title={title}
          version={version}
          className="mt-2"
          titleClassName="text-2xl font-semibold tracking-tight text-theme-text-primary"
          badgeClassName="text-[10px]"
        />
        {description ? <p style={{ marginTop: 8, maxWidth: 896, fontSize: 14, lineHeight: 1.5, color: LK.body }}>{description}</p> : null}
      </div>
      {children ? <div style={{ display: 'flex', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>{children}</div> : null}
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
    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: active ? LK.primary : 'inherit', cursor: 'pointer' }}
    onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = LK.ink; }}
    onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = 'inherit'; }}
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
  <div style={{ display: 'flex', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
    <button
      type="button"
      onClick={onReset}
      disabled={saving}
      style={{ borderRadius: 8, border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surface, padding: '8px 12px', fontSize: 12, fontWeight: 600, color: LK.body, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.5 : 1 }}
      onMouseEnter={(e) => { if (!saving) e.currentTarget.style.backgroundColor = LK.surfaceRaised; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.surface; }}
    >
      重置为默认
    </button>
    <button
      type="button"
      onClick={onSave}
      disabled={saving || disabled}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 8, backgroundColor: LK.primary, padding: '8px 12px', fontSize: 12, fontWeight: 600, color: 'white', cursor: (saving || disabled) ? 'not-allowed' : 'pointer', opacity: (saving || disabled) ? 0.5 : 1 }}
      onMouseEnter={(e) => { if (!saving && !disabled) e.currentTarget.style.backgroundColor = LK.primaryDeep; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.primary; }}
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
  title:`dataflow-vuln-${new Date().toISOString().slice(0, 16).replace('T', '-')}`,
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
  const [projectionBackfillPending, setProjectionBackfillPending] = useState(false);
  const [projectionBackfillEnqueued, setProjectionBackfillEnqueued] = useState(false);
  const [projectionTotalMissing, setProjectionTotalMissing] = useState(0);
  const [tasksError, setTasksError] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
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
  const refreshSequenceRef = useRef(0);

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
    const runQuery = taskForResolve.latest_execution_id ?`?execution_id=${encodeURIComponent(taskForResolve.latest_execution_id)}` : '';
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
    const refreshId = ++refreshSequenceRef.current;
    try {
      const payload = await executionApi.listTasks({
        projectId,
        page: targetPage,
        per_page: perPage,
        status: runStatusFilter || statusQuickFilter || undefined,
        search: runQuery.trim() || undefined,
        slot_binding_state: slotQuickFilter || undefined,
        report_status: reportQuickFilter || undefined,
        model: modelQuickFilter || undefined,
        mode: modeFilter || undefined,
        parent_task_id: parentTaskIdFilter.trim() || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      if (refreshId !== refreshSequenceRef.current) return;
      setTasks(payload.items || []);
      setTotal(payload.total || 0);
      setProjectionBackfillPending(Boolean(payload.projection_backfill_pending));
      setProjectionBackfillEnqueued(Boolean(payload.projection_backfill_enqueued));
      setProjectionTotalMissing(Number(payload.projection_total_missing || 0));
    } catch (error: any) {
      if (refreshId !== refreshSequenceRef.current) return;
      setTasks([]);
      setTotal(0);
      setProjectionBackfillPending(false);
      setProjectionBackfillEnqueued(false);
      setProjectionTotalMissing(0);
      const message = error?.message || '读取任务列表失败';
      setTasksError(message);
      notify(`加载数据流漏洞挖掘任务列表失败: ${message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [executionApi, modeFilter, modelQuickFilter, notify, parentTaskIdFilter, perPage, projectId, reportQuickFilter, runQuery, runStatusFilter, slotQuickFilter, sortBy, sortOrder, statusQuickFilter]);

  const loadTaskStats = useCallback(async () => {
    if (!projectId) return;
    const refreshId = refreshSequenceRef.current;
    try {
      const payload = await executionApi.getTaskStats({
        projectId,
        status: runStatusFilter || statusQuickFilter || undefined,
        search: runQuery.trim() || undefined,
        slot_binding_state: slotQuickFilter || undefined,
        report_status: reportQuickFilter || undefined,
        model: modelQuickFilter || undefined,
        mode: modeFilter || undefined,
        parent_task_id: parentTaskIdFilter.trim() || undefined,
      });
      if (refreshId !== refreshSequenceRef.current) return;
      setTaskStats(payload);
      setProjectionBackfillPending((current) => current || Boolean(payload.projection_backfill_pending));
    } catch {
      setTaskStats((current) => current);
    }
  }, [executionApi, modeFilter, modelQuickFilter, parentTaskIdFilter, projectId, reportQuickFilter, runQuery, runStatusFilter, slotQuickFilter, statusQuickFilter]);

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
    await loadTasks(targetPage);
    void loadTaskStats();
    void loadSlotSummary();
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
    setProjectionBackfillPending(false);
    setProjectionBackfillEnqueued(false);
    setProjectionTotalMissing(0);
    setPage(1);
    setSlotQuickFilter('');
    setStatusQuickFilter('');
    setReportQuickFilter('');
    setModelQuickFilter('');
  }, [projectId]);

  useEffect(() => {
    void loadAll(page);
  }, [loadAll, page, projectId, perPage, runQuery, runStatusFilter, slotQuickFilter, statusQuickFilter, reportQuickFilter, modelQuickFilter, modeFilter, parentTaskIdFilter, sortBy, sortOrder]);

  useEffect(() => {
    if (!showSlotDetailModal) return;
    void loadSlotDetail();
  }, [showSlotDetailModal]);

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
    const visibleTaskIds = tasks.map((task) => task.task_id);
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
      message:`确定要删除任务「${taskLabel}」及其关联 Run / 输出文件吗？此操作不可撤销。`,
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
      message:`确定要批量删除 ${taskIds.length} 个任务及其关联 Run / 输出文件吗？此操作不可撤销。`,
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
  const allVisibleSelected = tasks.length > 0 && tasks.every((task) => selectedTaskIds.has(task.task_id));
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
        ?`${slotSummary.detail_mode === 'detail' ? '明细' : '摘要'}更新于 ${new Date(slotSummary.updated_at).toLocaleTimeString('zh-CN')}`
        : '全局 worker 总执行槽位',
      border: 'border-theme-border',
      bg: 'bg-theme-elevated',
      text: 'text-theme-text-primary',
    },
    {
      label: '忙槽位',
      value: slotSummary?.running_jobs ?? '-',
      hint: slotSummary && slotSummary.total_capacity > 0 ?`利用率 ${Math.round((slotSummary.running_jobs / slotSummary.total_capacity) * 100)}%` : '当前活跃任务占用的槽位',
      border: 'border-cyan-500/20',
      bg: 'bg-cyan-500/15',
      text: 'text-cyan-400',
    },
    {
      label: '空闲槽位',
      value: slotSummary?.available_slots ?? '-',
      hint: '当前未被活跃任务占用的容量',
      border: 'border-emerald-500/20',
      bg: 'bg-emerald-500/15',
      text: 'text-emerald-400',
    },
    {
      label: '排队任务',
      value: slotSummary?.queued_jobs ?? '-',
      hint:`在线 Worker ${slotSummary?.worker_count ?? 0}`,
      border: 'border-amber-500/20',
      bg: 'bg-amber-500/15',
      text: 'text-amber-400',
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
    <div className="min-h-full bg-theme-elevated px-5 py-5 text-theme-text-primary lg:px-8 lg:py-7">
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
 className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-800"
          >
            <Plus size={16} />
            创建任务
          </button>
          <button
            onClick={() => void loadAll(page)}
            className="inline-flex items-center gap-2 rounded-lg border border-theme-border bg-theme-elevated px-4 py-2 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated"
          >
            <RefreshCw size={16} />
            刷新
          </button>
        </PageHeader>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label="任务总数" value={stats.total} icon={<Layers size={17} />} />
          <MetricCard label="运行中" value={stats.running} icon={<Activity size={17} />} />
          <MetricCard label="已成功" value={stats.succeeded} icon={<ShieldCheck size={17} />} tone="bg-emerald-500/10" />
          <MetricCard label="失败" value={stats.failed} icon={<AlertTriangle size={17} />} tone="bg-rose-500/10" />
        </section>

 <section className="rounded-[2rem] border border-theme-border bg-theme-elevated p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <button
              type="button"
              onClick={() => setSlotsPanelExpanded((current) => !current)}
              className="flex flex-1 items-start justify-between gap-4 text-left"
            >
              <div>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-theme-text-primary">执行槽位总览</h2>
                <p className="mt-2 text-sm text-theme-text-muted">展示数据流漏洞挖掘服务全局 worker 槽位、活跃任务和心跳状态，不区分项目。</p>
              </div>
              <span className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-theme-border bg-theme-elevated text-theme-text-muted">
                {slotsPanelExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} className="rotate-[-90deg]" />}
              </span>
            </button>
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-xs text-theme-text-muted">最近同步 {formatDateTime(slotSummary?.updated_at)}</div>
              {slotSummary ? (
                <button
                  type="button"
                  onClick={() => setShowSlotDetailModal(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/15 px-3 py-2 text-xs font-bold text-violet-400 hover:bg-violet-500/15"
                >
                  查看详情
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void (showSlotDetailModal ? loadSlotDetail() : loadSlotSummary())}
                className="rounded-lg border border-theme-border p-2 text-theme-text-muted hover:bg-theme-elevated"
              >
                <RefreshCw size={14} />
              </button>
              {slotSummaryLoading ? (
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-theme-text-muted">
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
                    <div className={`text-[11px] font-semibold uppercase tracking-[0.24em] ${card.text}`}>{card.label}</div>
                    <div className="mt-2 text-2xl font-semibold text-theme-text-primary">{card.value}</div>
                    <div className="mt-1 text-[11px] text-theme-text-muted">{card.hint}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                {(slotSummary?.workers || []).map((worker) => (
                  <div
                    key={worker.worker_id}
                    className={`min-w-[220px] rounded-2xl border px-4 py-3 ${worker.healthy ? 'border-theme-border bg-theme-elevated' : 'border-rose-500/20 bg-rose-500/15'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-theme-text-primary" title={worker.worker_id}>{worker.host_name || worker.worker_id}</div>
                      <div className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${worker.healthy ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                        {worker.healthy ? 'healthy' : 'unhealthy'}
                      </div>
                    </div>
                    <div className="mt-1 truncate text-[11px] text-theme-text-muted" title={worker.worker_id}>{worker.worker_id}</div>
                    <div className="mt-2 text-xs text-theme-text-secondary">槽位 {worker.running_jobs}/{worker.max_concurrent_jobs} · 空闲 {worker.available_slots}</div>
                    <div className="mt-1 text-xs text-theme-text-muted">心跳 {formatDateTime(worker.last_heartbeat_at)}</div>
                    {worker.error ? <div className="mt-2 break-all text-[11px] text-rose-400">{worker.error}</div> : null}
                  </div>
                ))}
                {slotSummary && (slotSummary.workers || []).length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-theme-border bg-theme-elevated px-4 py-6 text-sm text-theme-text-muted">
                    当前未发现可用的漏洞挖掘 worker。
                  </div>
                ) : null}
              </div>
              {slotSummaryError ? (
                <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-400">
                  暂无槽位数据：{slotSummaryError}
                </div>
              ) : null}
            </>
          ) : null}
        </section>

        <section>
 <div className="rounded-lg border border-theme-border bg-theme-elevated">
            <div className="border-b border-theme-border p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-sm font-semibold text-theme-text-primary">任务 / Run 列表</div>
                  <div className="mt-1 text-xs text-theme-text-muted">对齐数据流分析 / 入口分析列表：筛选、快速筛选、分页和排序都基于当前项目下的全量任务做服务端查询。</div>
                </div>
                <div className="text-xs font-bold text-theme-text-muted">
                  当前页 {tasks.length} 条 · 筛选后共 {total} 条
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-theme-border bg-theme-elevated px-3 py-2">
                  <Search size={16} className="text-theme-text-muted" />
                  <input
                    value={runQuery}
                    onChange={(event) => { setRunQuery(event.target.value); setPage(1); }}
                    placeholder="搜索当前项目任务名、任务 ID、执行 ID、Run 目录、模型、状态或工作流模式"
                    className="w-full bg-transparent text-sm font-medium text-theme-text-secondary outline-none placeholder:text-theme-text-muted"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={runStatusFilter}
                    onChange={(event) => { setRunStatusFilter(event.target.value); setPage(1); }}
                    className="form-select"
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
                    className="form-select"
                    title="按任务来源筛选"
                  >
                    {TASK_MODE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <input
                    value={parentTaskIdFilter}
                    onChange={(event) => { setParentTaskIdFilter(event.target.value); setPage(1); }}
                    placeholder="筛选主任务 ID"
                    className="w-40 rounded-lg border border-theme-border bg-theme-elevated px-3 py-2 text-sm font-medium text-theme-text-secondary outline-none placeholder:text-theme-text-muted"
                    title="按主任务 ID 筛选"
                  />
                  <select
                    value={sortBy}
                    onChange={(event) => { setSortBy(event.target.value); setPage(1); }}
                    className="form-select"
                    title="排序字段"
                  >
                    {TASK_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>按{option.label}排序</option>)}
                  </select>
                  <select
                    value={sortOrder}
                    onChange={(event) => { setSortOrder(event.target.value === 'asc' ? 'asc' : 'desc'); setPage(1); }}
                    className="form-select"
                    title="排序方向"
                  >
                    <option value="desc">降序</option>
                    <option value="asc">升序</option>
                  </select>
                  <select
                    value={perPage}
                    onChange={(event) => { setPerPage(Number(event.target.value)); setPage(1); }}
                    className="form-select"
                    title="每页显示条数"
                  >
                    {[10, 50, 100, 200, 500, 1000].map((n) => <option key={n} value={n}>{n}条/页</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => void loadAll(page)}
                    className="rounded-lg border border-theme-border p-2 text-theme-text-muted hover:bg-theme-elevated"
                    title="刷新任务列表与槽位摘要"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
              </div>
              {tasksError ? (
                <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/15 px-3 py-2 text-sm font-bold text-amber-400">
                  {tasksError}
                </div>
              ) : null}
              {projectionBackfillPending ? (
                <div className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-500/15 px-3 py-2 text-sm font-semibold text-cyan-400">
                  任务列表索引后台修复中，统计可能短暂不完整。
                  {projectionTotalMissing > 0 ?` 当前待补投影 ${projectionTotalMissing} 条。` : ''}
                  {projectionBackfillEnqueued ? ' 已登记后台修复。' : ''}
                </div>
              ) : null}
              {hasSelection ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-cyan-500/20 bg-cyan-500/15 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3 text-sm text-theme-text-secondary">
                    <label className="inline-flex items-center gap-2 font-semibold">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={(event) => toggleAllVisibleSelection(event.target.checked)}
                      />
                      全选当前页结果（{tasks.length} 条）
                    </label>
                    <span className="font-medium text-cyan-400">已选择 {selectedTaskIds.size} 个任务</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedTaskIds(new Set())}
                      disabled={batchDeleting}
                      className="inline-flex items-center gap-2 rounded-lg border border-theme-border bg-theme-elevated px-3 py-2 text-xs font-bold text-theme-text-secondary hover:bg-theme-elevated disabled:opacity-50"
                    >
                      清除选择
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleBatchDelete()}
                      disabled={batchDeleting}
                      className="inline-flex items-center gap-2 rounded-lg border border-rose-500/20 bg-theme-elevated px-3 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/15 disabled:opacity-50"
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
                    <ExecutionTableTh>漏洞上报</ExecutionTableTh>
                    <ExecutionTableTh>开始时间</ExecutionTableTh>
                    <ExecutionTableTh>耗时</ExecutionTableTh>
                    <ExecutionTableTh className="text-right">操作</ExecutionTableTh>
                  </tr>
                </ExecutionTableHead>
                <tbody>
                  {tasks.map((task) => {
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
                      ?`任务 ${shortId(taskId, 18)} · Run ${shortId(run.name || '', 18)}`
                      :`任务 ${shortId(taskId, 18)} · 执行 ${shortId(executionId || '-', 18)}`;
                    return (
                      <tr
                        key={task.task_id}
                        className={`${executionTableRowClassName} ${selectedTaskIds.has(task.task_id) ? 'bg-cyan-500/10' : ''}`.trim()}
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
                            className="flex w-full items-center gap-3 rounded-lg text-left hover:bg-theme-elevated"
                            title={hasRun ? '按 Run 目录进入运行详情' : '查看任务记录，Run 初始化后会自动进入详情'}
                          >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-theme-border bg-theme-elevated text-theme-text-muted">
                              {hasRun ? <FolderOpen size={17} /> : <FileSearch size={17} />}
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="font-medium text-theme-text-primary">{shortId(displayName, 32)}</div>
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${purposeMeta.className}`}>
                                  {purposeMeta.label}
                                </span>
                              </div>
                              <div className="mt-1 truncate text-xs text-theme-text-muted">{secondaryLine}</div>
                            </div>
                          </button>
                        </ExecutionTableTd>
                        <ExecutionTableTd className="min-w-[200px]">
                          <button
                            type="button"
                            onClick={() => toggleQuickFilter('slot', slotView.filterState)}
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold transition hover:brightness-95 ${slotView.className} ${slotQuickFilter === slotView.filterState ? 'ring-2 ring-cyan-500/20' : ''}`}
                            title={slotQuickFilter === slotView.filterState ? '点击取消执行槽位筛选' : '点击按执行槽位状态快速筛选'}
                          >
                            {slotView.label}
                          </button>
                          <div className="mt-1 space-y-0.5 text-xs">
                            {slotView.ownerLabel ? (
                              <div className="font-semibold text-theme-text-secondary" title={slotView.ownerFull}>
                                占用 Pod: {slotView.ownerLabel}
                              </div>
                            ) : null}
                            {slotView.detail.map((line) => (
                              <div key={line} className="text-theme-text-muted">{line}</div>
                            ))}
                          </div>
                        </ExecutionTableTd>
                        <ExecutionTableTd>
                          <button
                            type="button"
                            onClick={() => toggleQuickFilter('status', normalizeRunStatus(displayStatus))}
                            className={`rounded-full ${statusQuickFilter === normalizeRunStatus(displayStatus) ? 'ring-2 ring-cyan-500/20' : ''}`}
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
                            className={`text-left ${runSummary.model ? 'hover:text-cyan-400' : 'cursor-default'} ${modelQuickFilter === String(runSummary.model || '') ? 'text-cyan-400' : ''}`}
                            title={runSummary.model ? (modelQuickFilter === String(runSummary.model) ? '点击取消模型筛选' : '点击按模型快速筛选') : undefined}
                          >
                            <div className="font-bold text-theme-text-secondary">{runSummary.model || '-'}</div>
                          </button>
                          <div className="mt-1 text-xs text-theme-text-muted">{formatThinking(runSummary.thinking)}</div>
                        </ExecutionTableTd>
                        <ExecutionTableTd className="font-bold text-theme-text-secondary">
                          {hasRun ?`${runSummary.cycles_used || 0} / ${runSummary.max_cycles || 0}` :`尝试 ${task.latest_attempt_no || 0}`}
                        </ExecutionTableTd>
                        <ExecutionTableTd className="text-theme-text-secondary">
                          {hasRun ? (
                            <>
                              <div>{runSummary.result_count || 0} / {runSummary.passed_count || 0} 通过</div>
                              <div className="mt-1 text-xs text-theme-text-muted">{runSummary.failed_count || 0} 失败</div>
                            </>
                          ) : (
                            <>
                              <div>{task.message || '等待 Run 生成'}</div>
                              <div className="mt-1 text-xs text-theme-text-muted">Execution: {shortId(executionId || '-', 18)}</div>
                            </>
                          )}
                        </ExecutionTableTd>
                        <ExecutionTableTd>
                          <button
                            type="button"
                            onClick={() => toggleQuickFilter('report', reportStatus.label)}
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${reportStatus.className} ${reportQuickFilter === reportStatus.label ? 'ring-2 ring-cyan-500/20' : ''}`}
                            title={reportQuickFilter === reportStatus.label ? '点击取消漏洞上报筛选' : '点击按漏洞上报状态快速筛选'}
                          >
                            {reportStatus.label}
                          </button>
                        </ExecutionTableTd>
                        <ExecutionTableTd className="text-xs text-theme-text-muted">
                          <div title={runSummary.start_epoch ?`Run 开始时间：${formatEpochTime(runSummary.start_epoch)}` : undefined}>
                            {formatDateTime(task.started_at || task.created_at)}
                          </div>
                        </ExecutionTableTd>
                        <ExecutionTableTd className="text-theme-text-secondary">
                          <div title={runSummary.duration_seconds ?`Run 执行时长：${formatSeconds(runSummary.duration_seconds || 0)}` : undefined}>
                            {formatDuration(task.started_at || task.created_at, task.finished_at)}
                          </div>
                        </ExecutionTableTd>
                        <ExecutionTableTd className="text-right">
                          <div className="flex items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => void handleDeleteTask(task)}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-500/20 bg-theme-elevated px-2.5 py-1.5 text-xs font-bold text-rose-400 hover:bg-rose-500/15"
                              title="删除任务及其关联 Run"
                            >
                              <Trash2 size={13} />
                              删除
                            </button>
                            <button
                              type="button"
                              onClick={() => void openTaskRowDetail(task)}
                              className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/20 bg-theme-elevated px-2.5 py-1.5 text-xs font-bold text-cyan-400 hover:bg-cyan-500/15"
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

              {!loading && !tasksError && tasks.length === 0 ? (
                <div className="p-6">
                  <EmptyPanel title="暂无任务" description="当前筛选条件下没有可展示的数据流漏洞挖掘任务。" />
                </div>
              ) : null}
              {loading ? (
                <div className="flex items-center gap-2 p-6 text-sm font-bold text-theme-text-muted">
                  <Loader2 size={16} className="animate-spin" />
                  加载任务列表中...
                </div>
              ) : null}
            </div>

            {totalPages > 1 ? (
              <div className="flex items-center justify-center gap-2 border-t border-theme-border px-4 py-4 text-sm">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                  className="rounded-lg border border-theme-border px-3 py-1.5 text-theme-text-secondary disabled:opacity-40"
                >
                  上一页
                </button>
                <span className="text-theme-text-muted">{page} / {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page >= totalPages}
                  className="rounded-lg border border-theme-border px-3 py-1.5 text-theme-text-secondary disabled:opacity-40"
                >
                  下一页
                </button>
              </div>
            ) : null}
          </div>
        </section>

        <section>
 <div className="rounded-lg border border-theme-border bg-theme-elevated px-4 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-theme-text-primary">Profile / 参数配置</div>
                <div className="mt-1 text-xs text-theme-text-muted">Profile 维护已合入「参数配置」一级菜单；只有在需要调整默认模板、Worker 或版本快照时再进入。</div>
              </div>
              <button
                onClick={() => navigate('/pentest-exec-dataflow-vuln-system-config')}
                className="inline-flex items-center gap-2 rounded-lg border border-theme-border bg-theme-elevated px-4 py-2 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated"
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
 <div className="w-full max-w-5xl rounded-[2rem] border border-theme-border bg-theme-elevated" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-theme-border px-6 py-5">
              <div>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-theme-text-primary">执行槽位详情</h3>
                <p className="mt-2 text-sm text-theme-text-muted">按 worker 展示当前正在执行的数据流漏洞挖掘任务。</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right text-xs text-theme-text-muted">
                  <div>最近同步</div>
                  <div className="mt-1 font-semibold text-theme-text-muted">{formatDateTime(slotSummary?.updated_at)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSlotDetailModal(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-theme-border bg-theme-elevated text-theme-text-secondary hover:bg-theme-elevated"
                  aria-label="关闭执行槽位详情"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="max-h-[75vh] overflow-auto px-6 py-5">
              {(slotSummary?.workers || []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-theme-border bg-theme-elevated px-4 py-10 text-center text-sm text-theme-text-muted">
                  当前未发现可用的漏洞挖掘 worker。
                </div>
              ) : (
                <div className="space-y-4">
                  {(slotSummary?.workers || []).map((worker) => {
                    const expanded = expandedSlotWorkerIds.includes(worker.worker_id);
                    const activeJobs = worker.active_jobs || [];
                    return (
                      <section key={worker.worker_id} className={`overflow-hidden rounded-[1.5rem] border ${worker.healthy ? 'border-theme-border bg-theme-elevated' : 'border-rose-500/20 bg-rose-500/10'}`}>
                        <button
                          type="button"
                          onClick={() => toggleSlotWorkerExpanded(worker.worker_id)}
                          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-theme-elevated"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-semibold text-theme-text-primary">{worker.host_name || worker.worker_id}</div>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${worker.healthy ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>{worker.healthy ? 'healthy' : 'unhealthy'}</span>
                              <span className="rounded-full bg-theme-elevated px-2 py-0.5 text-[10px] font-bold text-theme-text-secondary">活动任务 {activeJobs.length}</span>
                            </div>
                            <div className="mt-1 text-[11px] text-theme-text-muted">{worker.worker_id}</div>
                            <div className="mt-2 flex flex-wrap gap-3 text-xs text-theme-text-muted">
                              <span>槽位 {worker.running_jobs}/{worker.max_concurrent_jobs}</span>
                              <span>空闲 {worker.available_slots}</span>
                              <span>心跳 {formatDateTime(worker.last_heartbeat_at)}</span>
                            </div>
                          </div>
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-theme-border bg-theme-elevated text-theme-text-muted">
                            {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} className="rotate-90" />}
                          </div>
                        </button>
                        {expanded ? (
                          <div className="border-t border-theme-border px-5 py-4">
                            {!worker.healthy && worker.error ? (
                              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm text-rose-400">
                                明细拉取失败：{worker.error}
                              </div>
                            ) : activeJobs.length === 0 ? (
                              <div className="rounded-2xl border border-dashed border-theme-border bg-theme-elevated px-4 py-8 text-center text-sm text-theme-text-muted">
                                当前无运行中的漏洞挖掘任务。
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {activeJobs.map((job) => (
                                  <div key={`${worker.worker_id}:${job.execution_id}:${job.worker_job_id}`} className={`rounded-2xl border px-4 py-4 ${job.mapped ? 'border-theme-border bg-theme-elevated' : 'border-amber-500/20 bg-amber-500/10'}`}>
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          {job.mapped && job.task_id ? (
                                            <button
                                              type="button"
                                              onClick={() => void openTaskDetail({ task_id: job.task_id || '', latest_execution_id: job.execution_id || '' })}
                                              className="truncate text-left text-sm font-semibold text-cyan-400 hover:text-cyan-400"
                                            >
                                              {job.task_title || job.task_id}
                                            </button>
                                          ) : (
                                            <div className="truncate text-sm font-semibold text-theme-text-primary">{job.task_title || '未关联任务'}</div>
                                          )}
                                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${job.mapped ? 'bg-cyan-500/15 text-cyan-400' : 'bg-amber-500/15 text-amber-400'}`}>
                                            {job.mapped ? '已关联任务' : '未关联任务'}
                                          </span>
                                        </div>
                                        <div className="mt-2 grid gap-2 text-xs text-theme-text-muted md:grid-cols-2">
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
                                          className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/20 bg-theme-elevated px-3 py-1.5 text-xs font-bold text-cyan-400 hover:bg-cyan-500/15"
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
  const syntheticRunName = useMemo(() => decodeFileserverTaskRunName(taskId), [taskId]);
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
    try {
      const runName = fileserverRouteSummary?.name || syntheticRunName;
      if (!runName) {
        throw new Error('缺少 Run 名称，无法进入详情页');
      }
      const target = {
        name: runName,
        run_id: fileserverRouteSummary?.run_id || routeRunId,
        root_path: fileserverRouteSummary?.root_path || fileserverRootPath || DEFAULT_DATAFLOW_FILESERVER_RUNS_ROOT,
        linked_task_id: linkedTaskId || fileserverRouteSummary?.linked_task_id || null,
      };
      navigate(buildRunDetailPath(target), {
        replace: true,
        state: fileserverRouteSummary ? { fileserverRunSummary: fileserverRouteSummary } : undefined,
      });
    } catch (error: any) {
      if (cancelled) return;
      const message = error?.message || '解析 Run 失败';
      setLoadError(message);
      notify(`解析 Run 失败: ${message}`, 'error');
    } finally {
      if (!cancelled) setDetailLoading(false);
    }
    return () => {
      cancelled = true;
    };
  }, [fileserverRootPath, fileserverRouteSummary, isRunBootstrapMode, linkedTaskId, navigate, notify, routeRunId, syntheticRunName]);

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
      <div className="min-h-full bg-theme-elevated px-5 py-5 text-theme-text-primary lg:px-8 lg:py-7">
        {feedbackNodes}
        <div className="space-y-4">
 <div className="rounded-lg border border-theme-border bg-theme-elevated p-6">
            <div className="flex items-center gap-3 text-sm font-bold text-theme-text-secondary">
              <Loader2 size={16} className={detailLoading ? 'animate-spin' : ''} />
              {loadError ?`解析 Run 失败: ${loadError}` : '正在解析 Run...'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (taskId && !isSyntheticFileserverTask) {
    return (
      <div className="min-h-full bg-theme-elevated px-5 py-5 text-theme-text-primary lg:px-8 lg:py-7">
        {feedbackNodes}
        <div className="space-y-4">
          <PageHeader
            eyebrow="DATAFLOW VULNERABILITY DISCOVERY"
            title="正在进入 Run 详情"
            description="该入口会先定位任务对应的 Run，然后进入详情页。"
          >
            <button
              onClick={goBack}
              className="inline-flex items-center gap-2 rounded-lg border border-theme-border bg-theme-elevated px-4 py-2 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated"
            >
              <ArrowLeft size={16} />
              返回列表
            </button>
            <button
              onClick={() => void resolveTaskRouteToRun(taskId, requestedExecutionId)}
              disabled={detailLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-theme-border bg-theme-elevated px-4 py-2 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated disabled:opacity-50"
            >
              {detailLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              重新解析
            </button>
          </PageHeader>
 <div className="rounded-lg border border-theme-border bg-theme-elevated p-6">
            <div className="flex items-center gap-3 text-sm font-bold text-theme-text-secondary">
              <Loader2 size={16} className={detailLoading ? 'animate-spin' : ''} />
              {loadError ||`正在查找任务 ${shortId(taskId, 20)} 对应的 Run...`}
            </div>
            {loadError ? (
              <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/15 px-3 py-2 text-xs font-bold text-amber-400">
                暂时未找到该任务对应的 Run。若这是刚创建的任务，请等待后端完成 Run 目录初始化后再重试。
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-theme-elevated px-5 py-5 text-theme-text-primary lg:px-8 lg:py-7">
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
 className="inline-flex items-center gap-2 rounded-lg border border-theme-border bg-theme-elevated px-4 py-2 text-sm font-medium text-theme-text-secondary hover:bg-theme-elevated"
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
 <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-theme-border bg-theme-elevated">
          <div className="flex items-center justify-between border-b border-theme-border px-5 py-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-400">New Scan Task</div>
              <h3 className="mt-1 text-xl font-semibold text-theme-text-primary">创建数据流漏洞挖掘任务</h3>
            </div>
            <button onClick={onClose} disabled={submitting} className="rounded-lg p-2 text-theme-text-muted hover:bg-theme-elevated disabled:opacity-40">
              <X size={18} />
            </button>
          </div>
          <div className="overflow-auto p-5">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <label className="lg:col-span-2">
                <span className="text-xs font-medium text-theme-text-secondary">任务标题 / Run 文件夹名</span>
                <input
                  value={state.title}
                  onChange={(event) => onChange({ ...state, title: event.target.value })}
                  className="mt-2 w-full rounded-lg border border-theme-border px-3 py-2.5 text-sm font-semibold outline-none focus:border-cyan-600"
                />
                <span className="mt-1 block text-xs leading-5 text-theme-text-muted">
                  提交后会作为后端 run_vuln_scan.py 的 --run-name，最终目录名会做安全字符清洗。
                </span>
              </label>
              <label className="lg:col-span-2">
                <span className="text-xs font-medium text-theme-text-secondary">Profile</span>
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
                  className="form-select mt-2 w-full"
                >
                  <option value="">使用项目默认 Profile</option>
                  {profiles.map((profile) => (
                    <option key={profile.profile_id} value={profile.profile_id} disabled={!profile.enabled}>
                      {profile.name}{profile.is_default ? '（默认）' : ''}{profile.enabled ? '' : '（停用）'}
                    </option>
                  ))}
                </select>
                {profilesLoading ? (
                  <div className="mt-2 text-xs text-theme-text-muted">Profile 列表加载中...</div>
                ) : null}
                {!profilesLoading && !profiles.some((profile) => profile.enabled) ? (
                  <div className="mt-2 text-xs text-theme-text-muted">当前项目还没有可用 Profile，提交任务时系统会自动创建一个默认扫描 Profile。</div>
                ) : null}
              </label>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="rounded-lg border border-theme-border bg-theme-elevated p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
                  <FolderOpen size={16} />
                  Runs 根目录
                </div>
                <div className="mt-2 text-xs leading-5 text-theme-text-muted">默认使用当前项目的 /app/secflow-app-dataflow-vuln-scan；后端会在该目录下创建标准 Run 扫描目录。</div>
                <div className="mt-3 flex gap-2">
                  <input
                    value={state.workspacePath}
                    onChange={(event) => onChange({ ...state, workspacePath: event.target.value })}
                    placeholder={DEFAULT_DATAFLOW_VULN_RUNS_ROOT}
                    style={FORM_INPUT_STYLE}
                  />
                  <button type="button" onClick={() => setPickerField('workspacePath')} className="shrink-0 rounded-lg border border-theme-border bg-theme-elevated px-3 py-2 text-xs font-medium text-theme-text-secondary hover:bg-theme-elevated">
                    选择
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-theme-border bg-theme-elevated p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
                  <FolderOpen size={16} />
                  数据流目录
                </div>
                <div className="mt-2 text-xs leading-5 text-theme-text-muted">直接从项目文件资源中选择包含`data_flow.md` 或其他分析结果文件的目录。</div>
                <div className="mt-3 flex gap-2">
                  <input
                    value={state.dataFlowPath}
                    onChange={(event) => onChange({ ...state, dataFlowPath: event.target.value })}
                    placeholder="/case-a/data_flow"
                    style={FORM_INPUT_STYLE}
                  />
                  <button type="button" onClick={() => setPickerField('dataFlowPath')} className="shrink-0 rounded-lg border border-theme-border bg-theme-elevated px-3 py-2 text-xs font-medium text-theme-text-secondary hover:bg-theme-elevated">
                    选择
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-theme-border bg-theme-elevated p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
                  <FolderOpen size={16} />
                  代码目录
                </div>
                <div className="mt-2 text-xs leading-5 text-theme-text-muted">从项目文件资源中选择包含待审计源码的目录。</div>
                <div className="mt-3 flex gap-2">
                  <input
                    value={state.sourcePath}
                    onChange={(event) => onChange({ ...state, sourcePath: event.target.value })}
                    placeholder="/case-a/source"
                    style={FORM_INPUT_STYLE}
                  />
                  <button type="button" onClick={() => setPickerField('sourcePath')} className="shrink-0 rounded-lg border border-theme-border bg-theme-elevated px-3 py-2 text-xs font-medium text-theme-text-secondary hover:bg-theme-elevated">
                    选择
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <label>
                <span className="text-xs font-medium text-theme-text-secondary">模型</span>
                <input value={state.model} onChange={(event) => onChange({ ...state, model: event.target.value })} style={FORM_INPUT_STYLE} />
              </label>
              <label>
                <span className="text-xs font-medium text-theme-text-secondary">Provider（可选）</span>
                <input value={state.provider} onChange={(event) => onChange({ ...state, provider: event.target.value })} placeholder="openai / anthropic" style={FORM_INPUT_STYLE} />
              </label>
              <label>
                <span className="text-xs font-medium text-theme-text-secondary">Review Profile</span>
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
                  style={FORM_INPUT_STYLE}
                >
                  {REVIEW_PROFILE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
                {state.reviewProfile === 'fast' ? (
                  <span className="mt-1 block text-[11px] leading-4 text-theme-text-muted">快速筛选会关闭评审；这里的“1”表示至少执行 1 个发现周期，不代表还会再做 1 轮评审。</span>
                ) : null}
              </label>
              <label>
                <span className="text-xs font-medium text-theme-text-secondary">最大评审轮次</span>
                <input type="number" min={1} value={state.maxReviewCycles} onChange={(event) => onChange({ ...state, maxReviewCycles: Number(event.target.value) || 1 })} style={FORM_INPUT_STYLE} />
              </label>
              <label>
                <span className="text-xs font-medium text-theme-text-secondary">Pi Timeout 最大次数</span>
                <input type="number" min={1} value={state.timeoutMaxRetries} onChange={(event) => onChange({ ...state, timeoutMaxRetries: Number(event.target.value) || 1 })} style={FORM_INPUT_STYLE} />
                <span className="mt-1 block text-[11px] leading-4 text-theme-text-muted">默认 3；Pi/provider 返回 timeout 时按该次数重发同一提示词。</span>
              </label>
              <label>
                <span className="text-xs font-medium text-theme-text-secondary">Pi Timeout 重试间隔（秒）</span>
                <input type="number" min={0} value={state.timeoutRetryIntervalSeconds} onChange={(event) => onChange({ ...state, timeoutRetryIntervalSeconds: Math.max(0, Number(event.target.value) || 0) })} style={FORM_INPUT_STYLE} />
                <span className="mt-1 block text-[11px] leading-4 text-theme-text-muted">默认 30；仅在最大次数大于 1 时生效。</span>
              </label>
              <label>
                <span className="text-xs font-medium text-theme-text-secondary">结果评审并发</span>
                <input type="number" min={1} value={state.resultReviewConcurrency} onChange={(event) => onChange({ ...state, resultReviewConcurrency: Number(event.target.value) || 1 })} style={FORM_INPUT_STYLE} />
              </label>
            </div>

            <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={state.autoReportVulnerabilities}
                  onChange={(event) => onChange({ ...state, autoReportVulnerabilities: event.target.checked })}
                  className="mt-1 h-4 w-4 rounded border-emerald-300 text-emerald-400 focus:ring-emerald-600"
                />
                <span>
                  <span className="flex items-center gap-2 text-sm font-semibold text-emerald-950">
                    <ShieldCheck size={16} />
                    自动上报漏洞漏洞
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-emerald-400">
                    默认开启。任务成功后会将最终有效的 result_NNN.md 上报到当前项目的漏洞引擎，并记录原始任务 ID、执行 ID 和结果文件路径。
                  </span>
                </span>
              </label>
            </div>

            <div className="mt-4">
              <label>
                <span className="text-xs font-medium text-theme-text-secondary">运行时覆盖 JSON</span>
                <textarea
                  value={state.runtimeOverridesText}
                  onChange={(event) => onChange({ ...state, runtimeOverridesText: event.target.value })}
                  placeholder={'{\n"global": {"max_review_cycles": 4 }\n}'}
                  className="mt-2 min-h-[150px] w-full rounded-lg border border-theme-border bg-theme-elevated px-4 py-3 font-mono text-xs leading-5 text-theme-text-primary outline-none focus:border-cyan-600"
                />
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t border-theme-border px-5 py-4">
            <button onClick={onClose} disabled={submitting} className="rounded-lg border border-theme-border px-4 py-2 text-sm font-bold text-theme-text-secondary disabled:opacity-40">取消</button>
            <button onClick={onSubmit} disabled={submitting} className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
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
          message:`确认停用 ${profile.name}？已绑定任务不会被删除，但后续默认选择会跳过它。`,
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
        className="inline-flex items-center gap-2 rounded-lg border border-theme-border bg-theme-elevated px-4 py-2 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated"
      >
        <Plus size={16} />
        新建 Profile
      </button>
      <button
        onClick={() => void load()}
        className="inline-flex items-center gap-2 rounded-lg border border-theme-border bg-theme-elevated px-4 py-2 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated"
      >
        <RefreshCw size={16} />
        刷新
      </button>
    </>
  );

  const updateServiceSchedulerField = (key: string, value: any) => {
    setServiceRuntimeConfig((current) => ({
      service_name: current?.service_name || 'secflow-app-dataflow-vuln-scan',
      api_prefix: current?.api_prefix || '/api/dataflow-vuln-scan',
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
      service_name: current?.service_name || 'secflow-app-dataflow-vuln-scan',
      api_prefix: current?.api_prefix || '/api/dataflow-vuln-scan',
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
    <div className={embedded ? 'space-y-6 text-theme-text-primary' : 'min-h-full bg-theme-elevated px-5 py-5 text-theme-text-primary lg:px-8 lg:py-7'}>
      {feedbackNodes}
      <div className={embedded ? 'space-y-6' : 'mx-auto max-w-[1800px] space-y-4'}>
        {embedded ? (
 <section className="rounded-[2rem] border border-theme-border bg-theme-elevated p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Settings size={18} className="text-rose-400" />
                  <h2 className="text-xl font-semibold text-theme-text-primary">数据流漏洞挖掘参数配置</h2>
                  <span className="rounded-full border border-rose-500/20 bg-rose-500/15 px-3 py-1 text-[11px] font-medium tracking-[0.12em] text-rose-400">
                    secflow-app-dataflow-vuln-scan
                  </span>
                </div>
                <p className="mt-2 max-w-4xl text-sm text-theme-text-muted">
                  当前 Tab 中的全部配置项都归属于`secflow-app-dataflow-vuln-scan` 微服务，用于维护项目级扫描 Profile、运行参数、默认模板和版本快照。
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
 <div className="rounded-lg border border-theme-border bg-theme-elevated">
              <div className="border-b border-theme-border px-4 py-3 text-sm font-semibold text-theme-text-primary">Profile 列表</div>
              <div className="max-h-[640px] overflow-auto p-2">
                {profiles.map((profile) => (
                  <button
                    key={profile.profile_id}
                    onClick={() => {
                      setSelectedProfileId(profile.profile_id);
                      setForm(formFromProfile(profile));
                    }}
                    className={`mb-2 w-full rounded-lg border p-3 text-left transition ${
                      profile.profile_id === selectedProfileId ? 'border-cyan-300 bg-cyan-500/15' : 'border-theme-border bg-theme-elevated hover:bg-theme-elevated'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-theme-text-primary">{profile.name}</span>
                      {profile.is_default ? <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-400">默认</span> : null}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-theme-text-muted">
                      <span>v{profile.version}</span>
                      <span>{profile.template_kind}</span>
                      <span className={profile.enabled ? 'text-emerald-400' : 'text-rose-400'}>{profile.enabled ? '启用' : '停用'}</span>
                    </div>
                  </button>
                ))}
                {!loading && profiles.length === 0 ? <EmptyPanel title="暂无 Profile" description="创建第一个扫描 Profile 后即可提交任务。" /> : null}
                {loading ? <div className="p-3 text-sm text-theme-text-muted">加载中...</div> : null}
              </div>
            </div>

            {selectedProfile ? (
 <div className="rounded-lg border border-theme-border bg-theme-elevated p-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => void setDefaultProfile(selectedProfile)}
                    disabled={selectedProfile.is_default}
                    className="rounded-lg border border-theme-border px-3 py-2 text-xs font-medium text-theme-text-secondary disabled:opacity-40"
                  >
                    设为默认
                  </button>
                  <button
                    onClick={() => void toggleProfile(selectedProfile)}
                    className={`rounded-lg px-3 py-2 text-xs font-medium ${
                      selectedProfile.enabled ? 'bg-rose-500/15 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                    }`}
                  >
                    {selectedProfile.enabled ? '停用' : '启用'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
 <div className="rounded-lg border border-theme-border bg-theme-elevated">
              <div className="border-b border-theme-border px-5 py-4">
                <div className="text-sm font-semibold text-theme-text-primary">{form.profileId ? '编辑 Profile' : '新建 Profile'}</div>
                <div className="mt-1 text-xs text-theme-text-muted">{form.profileId || '尚未保存'}</div>
              </div>
              <div className="space-y-5 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-theme-text-primary">基础信息</div>
                    <div className="mt-1 text-xs text-theme-text-muted">名称、模板类型、描述和默认启用状态。</div>
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
                    <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} style={FORM_INPUT_STYLE} />
                  </Field>
                  <Field label="模板类型">
                    <select value={form.templateKind} onChange={(event) => setForm({ ...form, templateKind: event.target.value })} style={FORM_INPUT_STYLE}>
                      {TEMPLATE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="描述">
                  <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} style={{ ...FORM_INPUT_STYLE, minHeight: 72 }} />
                </Field>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <label className="flex items-center gap-3 rounded-lg border border-theme-border bg-theme-elevated p-3 text-sm font-bold text-theme-text-secondary">
                    <input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />
                    启用 Profile
                  </label>
                  <label className="flex items-center gap-3 rounded-lg border border-theme-border bg-theme-elevated p-3 text-sm font-bold text-theme-text-secondary">
                    <input type="checkbox" checked={form.isDefault} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })} />
                    设为项目默认
                  </label>
                </div>
              </div>
            </div>

 <div className="rounded-lg border border-theme-border bg-theme-elevated">
              <div className="space-y-5 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-theme-text-primary">挖掘与评审参数</div>
                    <div className="mt-1 text-xs text-theme-text-muted">模型、评审档位、评审轮次和结果评审并发。</div>
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
                    <input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} style={FORM_INPUT_STYLE} />
                  </Field>
                  <Field label="评审档位">
                    <select value={form.reviewProfile} onChange={(event) => setForm({ ...form, reviewProfile: event.target.value })} style={FORM_INPUT_STYLE}>
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

 <div className="rounded-lg border border-theme-border bg-theme-elevated">
              <div className="space-y-5 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-theme-text-primary">运行时覆盖</div>
                    <div className="mt-1 text-xs text-theme-text-muted">针对当前 Profile 的`runtime_overrides` JSON。</div>
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
                    style={{ ...FORM_INPUT_STYLE, minHeight: 180, fontFamily: MONO, fontSize: 12 }}
                  />
                </Field>
              </div>
            </div>
          </div>

          <div className="space-y-4">
 <div className="rounded-lg border border-theme-border bg-theme-elevated">
              <div className="border-b border-theme-border px-4 py-3 text-sm font-semibold text-theme-text-primary">版本记录</div>
              <div className="max-h-72 overflow-auto p-3">
                {versions.map((version) => (
                  <div key={version.version_id} className="mb-2 rounded-lg border border-theme-border bg-theme-elevated p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-theme-text-primary">v{version.version}</span>
                      <span className="text-xs text-theme-text-muted">{formatDateTime(version.created_at)}</span>
                    </div>
                    <div className="mt-1 text-xs text-theme-text-muted">{version.created_by}</div>
                  </div>
                ))}
                {!versions.length ? <EmptyPanel title="暂无版本" description="保存 Profile 后会生成版本快照。" icon={<History size={22} />} /> : null}
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
 <div className="rounded-lg border border-theme-border bg-theme-elevated p-4 xl:col-span-2">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary"><Settings size={16} />调度与并发</div>
                <div className="mt-1 text-xs text-theme-text-muted">控制动态扩容自发现、槽位预留、批量分发、失联回收等关键参数。</div>
              </div>
              <button
                onClick={() => void saveRuntimeConfig()}
                disabled={!serviceRuntimeConfig || savingServiceConfig}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                <Save size={16} />
                {savingServiceConfig ? '保存中...' : '保存调度参数'}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Field label="Worker 发现方式">
                <div className="rounded-lg border border-theme-border bg-theme-elevated px-3 py-2.5 text-sm font-semibold text-theme-text-secondary">
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
                  style={FORM_INPUT_STYLE}
                  placeholder="http://{pod_id}.{headless_service_name}.{pod_namespace}.svc.cluster.local:8080"
                />
                <span className="mt-1 block text-[11px] leading-4 text-theme-text-muted">留空时自动使用 registry FQDN：`pod_id.headless_service_name.pod_namespace.svc.cluster.local`。</span>
              </Field>
              <Field label="dispatch 重试间隔(秒)">
                <NumberInput value={Number(serviceRuntimeConfig?.config?.dataflow_worker?.dispatch_retry_interval_seconds || 2)} onChange={(value) => updateServiceWorkerField('dispatch_retry_interval_seconds', value)} />
              </Field>
            </div>
          </div>
 <div className="rounded-lg border border-theme-border bg-theme-elevated p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-theme-text-primary"><ServerCog size={16} />Agent 默认存储目录</div>
            {serviceConfig?.agent_storage?.agents?.length ? (
              <div className="overflow-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-theme-elevated text-[11px] font-semibold uppercase tracking-[0.14em] text-theme-text-muted">
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
                      <tr key={item.agent_id} className="border-t border-theme-border">
                        <td className="px-3 py-2 font-mono text-xs font-bold text-theme-text-secondary">{item.agent_id}</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-theme-text-secondary">{renderProjectScopedTemplate(item.root_dir_template, projectId)}</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-theme-text-secondary">{renderProjectScopedTemplate(item.skills_dir_template, projectId)}</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-theme-text-secondary">{renderProjectScopedTemplate(item.memory_dir_template, projectId)}</td>
                        <td className="px-3 py-2 text-xs font-bold text-theme-text-muted">{item.source || 'shared_default'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyPanel title="暂无 Agent 存储配置" description="当前服务有效配置未返回可展示的 Agent 默认目录。" icon={<ServerCog size={22} />} />
            )}
          </div>
 <div className="rounded-lg border border-theme-border bg-theme-elevated p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-theme-text-primary"><Settings size={16} />项目有效配置</div>
            <JsonBlock value={effectiveConfig || {}} />
          </div>
 <div className="rounded-lg border border-theme-border bg-theme-elevated p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-theme-text-primary"><ServerCog size={16} />服务有效配置</div>
            <JsonBlock value={serviceConfig || {}} />
          </div>
        </section>
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="text-xs font-medium text-theme-text-secondary">{label}</span>
    <div className="mt-2">{children}</div>
  </label>
);

const NumberInput: React.FC<{ value: number; onChange: (value: number) => void }> = ({ value, onChange }) => (
  <input
    type="number"
    value={value}
    onChange={(event) => onChange(Number(event.target.value) || 0)}
    style={FORM_INPUT_STYLE}
  />
);
