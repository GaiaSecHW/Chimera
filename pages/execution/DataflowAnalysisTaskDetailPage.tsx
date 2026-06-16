import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowLeft, BarChart3, CheckCircle2, ChevronDown, ChevronUp, ClipboardCopy,
  FolderOpen, Loader2, RefreshCw, RotateCcw, Search, ScrollText, Trash2, XCircle,
} from 'lucide-react';

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

import { api } from '../../clients/api';
import { FileWatchMessage } from '../../clients/fileserver';
import {
  AppDfaEvaluationRound,
  AppDfaSessionEvent,
  AppDfaSessionIndex,
  AppDfaSessionMeta,
  AppDfaSessionSnapshot,
  AppDfaStageEvent,
  AppDfaTaskDetail,
  AppDfaTaskEvent,
  AppDfaTaskEvaluation,
  AppDfaTaskResult,
} from '../../types/types';
import { showConfirm } from '../../components/DialogService';
import { useUiFeedback } from '../../components/UiFeedback';
import {
  hasBinarySecurityReturnTarget,
  hasExecutionReturnContext,
  navigateBackByTaskOrigin,
  navigateBackToExecutionView,
  navigateBackToBinarySecurityTask,
} from '../../utils/executionReturnContext';
import { AgentSessionViewer } from './AgentSessionViewer';
import { AgentSessionDialogHeader } from './AgentSessionDialogHeader';
import { AgentSessionWarningPanel } from './AgentSessionWarningPanel';
import { DownstreamTaskCreator } from './DownstreamTaskCreator';
import { SessionRelationshipGraph } from './SessionRelationshipGraph';
import { DataflowAnalysisTaskConfigPanel } from './TaskConfigPanels';
import { TaskOriginCard } from './taskOrigin';
import { WarningListPanel } from './WarningListPanel';
import { buildSessionSnapshotFromText, parseSessionJsonlDelta } from './sessionParsing';
import { AbnormalReasonCard } from './AbnormalReasonCard';

const STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  running: '分析中',
  passed: '通过',
  failed: '失败',
  error: '错误',
  cancelled: '已取消',
};

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  running: 'bg-blue-100 text-blue-700',
  passed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  error: 'bg-orange-100 text-orange-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

const STAGE_STEPS = [
  { key: 'init', label: '任务准备', desc: '解析配置，初始化工作区', artifactSubpath: 'run' },
  { key: 'worker', label: 'Worker 分析', desc: '并行追踪函数数据流', artifactSubpath: 'run/sessions' },
  { key: 'judge', label: 'Judge 评估', desc: '评估数据流分析可信度', artifactSubpath: 'run/sessions' },
  { key: 'report', label: '报告输出', desc: '生成数据流 Markdown 和结构化结果', artifactSubpath: 'output' },
];

const EVT_STAGE: Record<string, number> = {
  task_start: 0, trace_start: 0, trace_skip: 0, trace_callees: 0,
  round_start: 1, worker_start: 1, worker_done: 1,
  judge_start: 2, judge_eval: 2, judge_summary: 2, judge_done: 2, judge_result: 2,
  task_end: 3,
};

type DetailTab = 'overview' | 'timeline' | 'task-config' | 'session' | 'relationship' | 'result' | 'evaluation';
type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

function extractFsRelPath(path: string, projectId: string): string | null {
  const prefix =`/data/files/${projectId}`;
  if (!path.startsWith(prefix)) return null;
  const rel = path.slice(prefix.length).replace(/\/+$/, '');
  return rel.startsWith('/') ? rel :`/${rel}`;
}

function normalizeJoinPath(basePath: string, relativePath: string): string {
  return`${basePath.replace(/\/+$/, '')}/${relativePath.replace(/^\/+/, '')}`;
}

function openInFileExplorer(fsPath: string) {
  const normalizedPath = fsPath.startsWith('/') ? fsPath :`/${fsPath}`;
  sessionStorage.setItem('chimera:fileExplorerNavigatePath', normalizedPath);
  window.dispatchEvent(new CustomEvent('chimera-navigate-view', { detail: { view: 'project-file-explorer', path: normalizedPath } }));
}

function formatDuration(startedAt?: string | null, finishedAt?: string | null): string {
  if (!startedAt || !finishedAt) return '-';
  const secs = Math.max(0, Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000));
  if (secs < 60) return`${secs}s`;
  return`${Math.floor(secs / 60)}m${secs % 60}s`;
}

function formatLiveDuration(startedAt?: string | null, nowSecs = Math.floor(Date.now() / 1000)): string {
  if (!startedAt) return '-';
  const secs = Math.max(0, nowSecs - Math.floor(new Date(startedAt).getTime() / 1000));
  if (secs < 60) return`${secs}s`;
  return`${Math.floor(secs / 60)}m${secs % 60}s`;
}

function formatNumber(value: unknown, digits = 0): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return num.toLocaleString('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function formatRate(value: unknown): string {
  const num = Number(value);
  return Number.isFinite(num) ?`${Math.round(num * 100)}%` : '-';
}

function formatMs(value: unknown): string {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms <= 0) return '-';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return`${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return`${minutes}m${seconds % 60}s`;
}

function formatSessionMtime(value?: number) {
  if (!value) return '-';
  return new Date(value * 1000).toLocaleString('zh-CN');
}

function sessionRoleLabel(role?: string) {
  if (role === 'judge') return 'Judge';
  if (role === 'sub_worker') return 'Sub Worker';
  if (role === 'worker') return 'Worker';
  if (role === 'master' || role === 'master_worker') return 'Master';
  return role || 'Agent';
}

function sessionRoleTone(role?: string) {
  if (role === 'judge') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (role === 'sub_worker') return 'border-violet-200 bg-violet-50 text-violet-700';
  if (role === 'master' || role === 'master_worker') return 'border-cyan-200 bg-cyan-50 text-cyan-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function stageLabel(stage?: string): string {
  const labels: Record<string, string> = {
    init: '任务准备',
    worker: 'Worker 分析',
    judge: 'Judge 评估',
    report: '报告输出',
    analyse: '函数分析',
  };
  return labels[stage || ''] || stage || '-';
}

function evaluationStatusTone(status?: string) {
  if (status === 'passed') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'failed') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'running') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === 'skipped') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-100 text-slate-600';
}

function timelineLevelTone(level?: string | null) {
  const normalized = String(level || '').toLowerCase();
  if (normalized === 'error') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (normalized === 'warning' || normalized === 'warn') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (normalized === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function isAgentKillTimelineEvent(eventType?: string | null) {
  return ['agent_process_manual_kill', 'agent_process_bulk_manual_kill'].includes(String(eventType || '').trim());
}

function timelineEventCategory(eventType?: string | null) {
  const normalized = String(eventType || '').trim().toLowerCase();
  if (!normalized) return 'other';
  if (/kill|manual|bulk/.test(normalized)) return 'task_mutation';
  if (/(failed|error|abnormal|cancel|reject|noop)/.test(normalized)) return 'failure';
  if (/(queued|dispatch|started|running|resume|retry|completed|finished|succeeded)/.test(normalized)) return 'stage_progress';
  return 'other';
}

function timelineEventCategoryLabel(eventType?: string | null) {
  const category = timelineEventCategory(eventType);
  if (category === 'task_mutation') return '任务操作';
  if (category === 'failure') return '异常/终态';
  if (category === 'stage_progress') return '阶段推进';
  return '其他事件';
}

function timelineEventCategoryTone(eventType?: string | null) {
  const category = timelineEventCategory(eventType);
  if (category === 'task_mutation') return 'border-cyan-200 bg-cyan-50 text-cyan-700';
  if (category === 'failure') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (category === 'stage_progress') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function timelineEventTypeTone(eventType?: string | null) {
  const normalized = String(eventType || '').trim();
  if (normalized === 'agent_process_manual_kill') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (normalized === 'agent_process_bulk_manual_kill') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function formatTimelineEventTypeLabel(eventType?: string | null) {
  const normalized = String(eventType || '').trim();
  if (!normalized) return '-';
  if (normalized === 'agent_process_manual_kill') return '智能体手工终止';
  if (normalized === 'agent_process_bulk_manual_kill') return '智能体批量终止';
  return normalized.replace(/_/g, ' ');
}

function formatTimelinePayloadValue(value: any): string {
  if (value == null) return '-';
  if (typeof value === 'string') return value || '-';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.length ? value.map((entry) => formatTimelinePayloadValue(entry)).join(', ') : '-';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function timelinePayloadRows(payload: Record<string, any>) {
  return Object.entries(payload || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => ({ key, label: key.replace(/_/g, ' '), value: formatTimelinePayloadValue(value) }));
}

function timelineAuditSummary(payload: Record<string, any>) {
  const operator = formatTimelinePayloadValue(payload.operator);
  const pid = formatTimelinePayloadValue(payload.pid);
  const podName = formatTimelinePayloadValue(payload.pod_name);
  const killMode = formatTimelinePayloadValue(payload.kill_mode);
  return [
    operator !== '-' ?`操作人 ${operator}` : '',
    pid !== '-' ?`PID ${pid}` : '',
    podName !== '-' ?`Pod ${podName}` : '',
    killMode !== '-' ?`方式 ${killMode}` : '',
  ].filter(Boolean).join(' · ');
}

function timelineMessageSummary(event: AppDfaTaskEvent) {
  const payload = event.payload || {};
  const summary = timelineAuditSummary(payload);
  return summary || event.message || '-';
}

function evaluationRoundKey(round: AppDfaEvaluationRound): string {
  return [
    round.round ?? '',
    round.stage_round ?? '',
    round.stage ?? '',
    round.module_name ?? round.function ?? round.func ?? round.entry ?? '',
    round.source_path ?? '',
  ].join('::');
}

function deriveStepStatuses(taskStatus: string, events: AppDfaStageEvent[]): StepStatus[] {
  const statuses: StepStatus[] = STAGE_STEPS.map(() => 'pending');
  if (taskStatus === 'pending') return statuses;
  if (taskStatus === 'passed') return STAGE_STEPS.map(() => 'completed');
  let stage = -1;
  for (const evt of events) {
    if (evt.type === 'round_end') {
      if (evt.data?.passed) stage = 3;
    } else if (evt.type !== 'round_reflection') {
      const mapped = EVT_STAGE[evt.type];
      if (mapped !== undefined) stage = mapped;
    }
  }
  if (stage === -1) {
    statuses[0] = taskStatus === 'running' ? 'running' : ['error', 'failed', 'cancelled'].includes(taskStatus) ? 'failed' : 'pending';
    return statuses;
  }
  for (let i = 0; i < STAGE_STEPS.length; i += 1) {
    if (i < stage) statuses[i] = 'completed';
    else if (i === stage) statuses[i] = ['error', 'failed', 'cancelled'].includes(taskStatus) ? 'failed' : 'running';
  }
  return statuses;
}

function formatEventLog(evt: AppDfaStageEvent): string {
  const ts = new Date(evt.ts * 1000).toLocaleTimeString('zh-CN');
  const d = evt.data || {};
  switch (evt.type) {
    case 'task_start': return`[${ts}] 任务开始`;
    case 'trace_start': return`[${ts}] ▶ 追踪函数: ${d.function || d.task || ''}`;
    case 'trace_callees': return`[${ts}] ✓ 发现调用: ${(d.callees || []).join(', ')}`;
    case 'round_start': return`[${ts}] ▶ 第 ${d.round || ''} 轮 Worker 分析`;
    case 'worker_start': return`[${ts}] │ Worker ${d.worker_id || d.worker_idx || ''} 开始`;
    case 'worker_done': return`[${ts}] ✓ Worker ${d.worker_id || d.worker_idx || ''} 完成`;
    case 'judge_start': return`[${ts}] ▶ Judge ${d.judge_id || d.judge_idx || ''} 开始`;
    case 'judge_done': return`[${ts}] ✓ Judge ${d.judge_id || d.judge_idx || ''} 完成`;
    case 'round_end': return`[${ts}] ✓ 第 ${d.round || ''} 轮结束 passed=${d.passed ?? ''}`;
    case 'error': return`[${ts}] ✗ 错误: ${d.error || JSON.stringify(d)}`;
    case 'task_end': return`[${ts}] 任务结束 status=${d.status || ''}`;
    default: return`[${ts}] ${evt.type}: ${String(d.text || d.output || JSON.stringify(d)).replace(/\n+/g, ' ').slice(0, 150)}`;
  }
}

interface DfaTreeNode {
  name: string;
  depth: number;
  status: 'pending' | 'running' | 'done';
  children: DfaTreeNode[];
}

function buildDfaTree(events: AppDfaStageEvent[], taskStatus: string): DfaTreeNode | null {
  const calleesMap = new Map<string, string[]>();
  const nodeDepth = new Map<string, number>();
  const nodeStatus = new Map<string, 'running' | 'done'>();
  let rootName: string | null = null;
  for (const evt of events) {
    const d = evt.data || {};
    if (evt.type === 'trace_start') {
      const fn = String(d.function || d.task || '').trim();
      if (!fn) continue;
      const depth = Number(d.depth ?? 0);
      if (!nodeDepth.has(fn) || (nodeDepth.get(fn) || 0) > depth) nodeDepth.set(fn, depth);
      if (!nodeStatus.has(fn)) nodeStatus.set(fn, 'running');
      if (!rootName && depth === 0) rootName = fn;
    }
    if (evt.type === 'trace_callees') {
      const fn = String(d.function || '').trim();
      const callees = Array.isArray(d.callees) ? d.callees.map(String) : [];
      if (fn) {
        // Merge with any previously seen callees (union) to handle duplicate events on resume
        const existing = calleesMap.get(fn) ?? [];
        const merged = existing.length === 0 ? callees : [...new Set([...existing, ...callees])];
        calleesMap.set(fn, merged);
        nodeStatus.set(fn, 'done');
      }
    }
  }
  if (!['running', 'pending'].includes(taskStatus)) {
    nodeStatus.forEach((status, fn) => { if (status === 'running') nodeStatus.set(fn, 'done'); });
  }
  if (!rootName) return null;
  const build = (name: string, inheritDepth: number, visited = new Set<string>()): DfaTreeNode => {
    if (visited.has(name)) return { name, depth: inheritDepth, status: 'done', children: [] };
    visited.add(name);
    const depth = nodeDepth.get(name) ?? inheritDepth;
    return {
      name,
      depth,
      status: nodeStatus.get(name) || 'pending',
      children: (calleesMap.get(name) || []).map((child) => build(child, depth + 1, new Set(visited))),
    };
  };
  return build(rootName, 0);
}

function TreeNodeView({ node }: { node: DfaTreeNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
        <span className={`h-2 w-2 rounded-full ${node.status === 'done' ? 'bg-emerald-500' : node.status === 'running' ? 'bg-blue-500' : 'bg-slate-300'}`} />
        <span className="font-mono text-slate-700">{node.name}</span>
      </div>
      {node.children.length ? <div className="ml-5 border-l border-slate-200 pl-3 space-y-2">{node.children.map((child) => <TreeNodeView key={`${node.name}-${child.name}-${child.depth}`} node={child} />)}</div> : null}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex gap-3"><span className="w-24 shrink-0 text-xs text-slate-400">{label}</span><span className="text-xs text-slate-700 break-all">{value}</span></div>;
}

function MetricCard({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) {
 return <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"><div className="flex items-center justify-between gap-3"><div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</div><div className="text-slate-400">{icon}</div></div><div className="mt-3 text-2xl font-black text-slate-900">{value}</div></div>;
}

function MarkdownContent({ content }: { content: string }) {
  return <article className="prose prose-slate max-w-none prose-headings:font-black prose-pre:border prose-pre:border-slate-200 prose-pre:bg-slate-50 prose-pre:text-slate-900 prose-code:text-rose-700"><ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown></article>;
}

export const DataflowAnalysisTaskDetailPage: React.FC<{ projectId: string; taskId: string; onBack: () => void }> = ({ projectId, taskId, onBack }) => {
  const appApi = api.domains.execution.appDataflowAnalyse;
  const fileserverApi = api.domains.assets.fileserver;
  const { notify, feedbackNodes } = useUiFeedback();
  const [detail, setDetail] = useState<AppDfaTaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [timeline, setTimeline] = useState<AppDfaTaskEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineClearing, setTimelineClearing] = useState(false);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [expandedTimelineEventId, setExpandedTimelineEventId] = useState<string>('');
  const [timelineEventTypeFilter, setTimelineEventTypeFilter] = useState<string>('__all__');
  const [timelineLevelFilter, setTimelineLevelFilter] = useState<string>('__all__');
  const [timelineStatusFilter, setTimelineStatusFilter] = useState<string>('__all__');
  const [timelinePage, setTimelinePage] = useState(1);
  const [timelinePageSize, setTimelinePageSize] = useState(200);
  const [result, setResult] = useState<AppDfaTaskResult | null>(null);
  const [resultLoading, setResultLoading] = useState(false);
  const [resultView, setResultView] = useState<'final' | 'report' | 'dataflow' | 'json'>('final');
  const [selectedDataflowFile, setSelectedDataflowFile] = useState<string>('');
  const [evaluation, setEvaluation] = useState<AppDfaTaskEvaluation | null>(null);
  const [evaluationLoading, setEvaluationLoading] = useState(false);
  const [evaluationKeyword, setEvaluationKeyword] = useState('');
  const [evaluationStatus, setEvaluationStatus] = useState('');
  const [selectedEvaluationRoundKey, setSelectedEvaluationRoundKey] = useState<string | null>(null);
  const [sessions, setSessions] = useState<AppDfaSessionMeta[]>([]);
  const [sessionIndex, setSessionIndex] = useState<AppDfaSessionIndex | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [selectedSessionPath, setSelectedSessionPath] = useState<string | null>(null);
  const [activeAgentSessionPath, setActiveAgentSessionPath] = useState<string | null>(null);
  const [activeAgentKeyword, setActiveAgentKeyword] = useState('');
  const [activeAgentPage, setActiveAgentPage] = useState(1);
  const [activeAgentPageSize, setActiveAgentPageSize] = useState(10);
  const [sessionSnapshot, setSessionSnapshot] = useState<AppDfaSessionSnapshot | null>(null);
  const [sessionEvents, setSessionEvents] = useState<AppDfaSessionEvent[]>([]);
  const [sessionWarnings, setSessionWarnings] = useState<string[]>([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionLive, setSessionLive] = useState(false);
  const [logsExpanded, setLogsExpanded] = useState(true);
  const [clockNow, setClockNow] = useState(() => Math.floor(Date.now() / 1000));
  const sessionSocketRef = useRef<WebSocket | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const handleBack = () => {
    if (navigateBackToExecutionView()) return;
    if (navigateBackByTaskOrigin(detail)) return;
    if (navigateBackToBinarySecurityTask()) return;
    onBack();
  };

  const loadDetail = async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      setDetail(await appApi.getTask(taskId));
    } catch (err: any) {
      notify(`加载任务详情失败: ${err?.message || err}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadResult = async () => {
    if (!taskId || resultLoading) return;
    setResultLoading(true);
    try {
      const data = await appApi.getTaskResult(taskId);
      setResult(data);
      if (!selectedDataflowFile && data.dataflow_files?.[0]) setSelectedDataflowFile(data.dataflow_files[0].relative_path);
    } catch (err: any) {
      notify(`加载结果失败: ${err?.message || err}`, 'error');
    } finally {
      setResultLoading(false);
    }
  };

  const loadEvaluation = async () => {
    if (!taskId || evaluationLoading) return;
    setEvaluationLoading(true);
    try {
      setEvaluation(await appApi.getTaskEvaluation(taskId));
    } catch (err: any) {
      notify(`加载观测指标失败: ${err?.message || err}`, 'error');
    } finally {
      setEvaluationLoading(false);
    }
  };

  const loadTimeline = async () => {
    if (!taskId || timelineLoading) return;
    setTimelineLoading(true);
    try {
      const data = await appApi.getTimeline(taskId);
      setTimeline(data.events || []);
    } catch (err: any) {
      notify(`加载事件时间线失败: ${err?.message || err}`, 'error');
    } finally {
      setTimelineLoading(false);
    }
  };

  const clearTimeline = async () => {
    if (!taskId || timelineClearing) return;
    const confirmed = await showConfirm({
      title: '清空事件时间线',
      message: '将删除当前数据流分析任务的全部事件时间线记录。该操作不影响任务状态、结果和产物文件，删除后不可恢复，是否继续？',
      confirmText: '确认清空',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    setTimelineClearing(true);
    try {
      await appApi.clearTimeline(taskId);
      setTimeline([]);
    } catch (err: any) {
      notify(`清空事件时间线失败: ${err?.message || err}`, 'error');
    } finally {
      setTimelineClearing(false);
    }
  };

  const deleteTimelineEvent = async (eventId: string) => {
    if (!taskId || !eventId || deletingEventId) return;
    const confirmed = await showConfirm({
      title: '删除事件',
      message: '将删除当前事件记录。该操作不影响任务状态、结果和产物文件，删除后不可恢复，是否继续？',
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    setDeletingEventId(eventId);
    try {
      await appApi.deleteTimelineEvent(taskId, eventId);
      setTimeline((current) => current.filter((event) => event.id !== eventId));
    } catch (err: any) {
      notify(`删除事件失败: ${err?.message || err}`, 'error');
    } finally {
      setDeletingEventId(null);
    }
  };

  const loadSessions = async () => {
    if (!taskId) return;
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const [data, index] = await Promise.all([
        appApi.listTaskSessions(taskId),
        appApi.getTaskSessionIndex(taskId).catch(() => null),
      ]);
      const items = data.items || [];
      setSessions(items);
      setSessionIndex(index);
      setSelectedSessionPath((current) => current || items.find((item) => item.is_active)?.relative_path || items[0]?.relative_path || null);
    } catch (err: any) {
      setSessionsError(`加载会话列表失败: ${err?.message || err}`);
    } finally {
      setSessionsLoading(false);
    }
  };

  const loadSessionFile = async (path: string) => {
    setSessionLoading(true);
    setSessionError(null);
    try {
      const snapshot = await appApi.getTaskSessionFile(taskId, path);
      const text = (snapshot.events || []).map((event: any) => event.raw_line).filter(Boolean).join('\n');
      const parsed = text ? buildSessionSnapshotFromText(path, text) : null;
      setSessionSnapshot({ ...snapshot, session_meta: snapshot.session_meta || parsed?.session_meta || null });
      setSessionEvents((parsed?.events || snapshot.events || []) as AppDfaSessionEvent[]);
      setSessionWarnings([...(snapshot.warnings || []), ...((parsed?.warnings || []) as string[])]);
    } catch (err: any) {
      setSessionError(`加载会话失败: ${err?.message || err}`);
    } finally {
      setSessionLoading(false);
    }
  };

  const closeSessionSocket = () => {
    if (sessionSocketRef.current) {
      sessionSocketRef.current.close();
      sessionSocketRef.current = null;
    }
    setSessionLive(false);
  };

  const openActiveAgentSession = (path: string) => {
    setSelectedSessionPath(path);
    setActiveAgentSessionPath(path);
  };

  useEffect(() => { void loadDetail(); }, [taskId]);
  useEffect(() => {
    const timer = setInterval(() => setClockNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (activeTab === 'timeline' && timeline.length === 0 && !timelineLoading) void loadTimeline();
    if (activeTab === 'result' && !result && !resultLoading) void loadResult();
    if (activeTab === 'evaluation' && !evaluation && !evaluationLoading) void loadEvaluation();
    if ((activeTab === 'overview' || activeTab === 'session' || activeTab === 'relationship' || Boolean(activeAgentSessionPath)) && sessions.length === 0 && !sessionsLoading) void loadSessions();
  }, [activeTab, activeAgentSessionPath]);
  useEffect(() => {
    if (activeTab !== 'timeline' || !detail || !['pending', 'running'].includes(detail.status)) return;
    const timer = window.setInterval(() => void loadTimeline(), 12000);
    return () => window.clearInterval(timer);
  }, [activeTab, detail?.status, taskId]);
  const timelineEventTypeOptions = useMemo(() => Array.from(new Set(timeline.map((event) => String(event.event_type || '').trim()).filter(Boolean))), [timeline]);
  const timelineLevelOptions = useMemo(() => Array.from(new Set(timeline.map((event) => String(event.level || '').trim()).filter(Boolean))), [timeline]);
  const timelineStatusOptions = useMemo(() => Array.from(new Set(timeline.map((event) => String(event.status || event.dispatch_status || '').trim()).filter(Boolean))), [timeline]);
  const filteredTimeline = useMemo(() => timeline.filter((event) => {
    if (timelineEventTypeFilter !== '__all__' && (event.event_type || '__none__') !== timelineEventTypeFilter) return false;
    if (timelineLevelFilter !== '__all__' && (event.level || '__none__') !== timelineLevelFilter) return false;
    const normalizedStatus = event.status || event.dispatch_status || '__none__';
    if (timelineStatusFilter !== '__all__' && normalizedStatus !== timelineStatusFilter) return false;
    return true;
  }), [timeline, timelineEventTypeFilter, timelineLevelFilter, timelineStatusFilter]);
  const timelineTotalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredTimeline.length / Math.max(1, timelinePageSize))),
    [filteredTimeline.length, timelinePageSize],
  );
  const normalizedTimelinePage = Math.min(Math.max(1, timelinePage), timelineTotalPages);
  const pagedTimelineItems = useMemo(() => {
    const start = (normalizedTimelinePage - 1) * Math.max(1, timelinePageSize);
    return filteredTimeline.slice(start, start + Math.max(1, timelinePageSize));
  }, [filteredTimeline, normalizedTimelinePage, timelinePageSize]);
  const timelineRangeStart = filteredTimeline.length === 0 ? 0 : (normalizedTimelinePage - 1) * Math.max(1, timelinePageSize) + 1;
  const timelineRangeEnd = filteredTimeline.length === 0 ? 0 : Math.min(normalizedTimelinePage * Math.max(1, timelinePageSize), filteredTimeline.length);
  useEffect(() => {
    if (timelinePage > timelineTotalPages) setTimelinePage(timelineTotalPages);
  }, [timelinePage, timelineTotalPages]);
  useEffect(() => {
    setTimelinePage(1);
  }, [timelineEventTypeFilter, timelineLevelFilter, timelineStatusFilter, taskId]);
  useEffect(() => {
    if (!logsExpanded || !logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [detail?.stages_json?.events?.length, logsExpanded]);
  useEffect(() => {
    if (detail?.status !== 'running') return;
    const timer = setInterval(() => void loadDetail(), 8000);
    return () => clearInterval(timer);
  }, [detail?.status, taskId]);
  useEffect(() => {
    if (activeTab !== 'session' && activeTab !== 'overview' && activeTab !== 'relationship' && !activeAgentSessionPath) return;
    if (detail?.status !== 'running') return;
    const timer = setInterval(() => void loadSessions(), 12000);
    return () => clearInterval(timer);
  }, [activeTab, detail?.status, taskId, activeAgentSessionPath]);
  useEffect(() => {
    closeSessionSocket();
    const sessionViewerActive = activeTab === 'session' || activeTab === 'relationship' || activeAgentSessionPath === selectedSessionPath;
    if (!sessionViewerActive || !selectedSessionPath) return;
    void loadSessionFile(selectedSessionPath);
    return closeSessionSocket;
  }, [activeTab, selectedSessionPath, taskId, activeAgentSessionPath]);
  useEffect(() => {
    const sessionViewerActive = activeTab === 'session' || activeTab === 'relationship' || activeAgentSessionPath === selectedSessionPath;
    if (!sessionViewerActive || !selectedSessionPath || !detail?.output_path || detail.status !== 'running') return;
    const runFilePath = normalizeJoinPath(`${detail.output_path}/${detail.task_id}/run`, selectedSessionPath);
    const watchPath = extractFsRelPath(runFilePath, projectId);
    if (!watchPath) return;
    const startLine = sessionSnapshot?.line_count || 0;
    const socket = fileserverApi.openProjectFileWatchWebSocket(projectId, watchPath, {
      path_mode: 'project_filesystem',
      read_mode: 'line',
      start_from: startLine > 0 ? 'tail' : 'head',
      start_line: startLine,
    });
    sessionSocketRef.current = socket;
    socket.onopen = () => setSessionLive(true);
    socket.onclose = () => setSessionLive(false);
    socket.onerror = () => setSessionLive(false);
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as FileWatchMessage;
        if (message.type === 'snapshot' || message.type === 'heartbeat') return;
        if (message.type === 'error') {
          setSessionError(message.message || '会话实时监听失败');
          setSessionLive(false);
          return;
        }
        if (message.type === 'file_event') {
          if (message.event === 'deleted') {
            setSessionError('会话文件已删除，实时监听已停止');
            setSessionLive(false);
          } else if (message.event === 'truncated' || message.event === 'renamed') {
            void loadSessionFile(selectedSessionPath);
          }
          return;
        }
        if (message.type !== 'delta' || message.read_mode !== 'line') return;
        const parsed = parseSessionJsonlDelta(message.lines || [], (message.from_line ?? startLine) + 1);
        if (parsed.events.length) setSessionEvents((current) => [...current, ...(parsed.events as AppDfaSessionEvent[])]);
        if (parsed.warnings.length) setSessionWarnings((current) => [...current, ...parsed.warnings]);
        setSessionSnapshot((current) => current ? { ...current, line_count: Math.max(current.line_count || 0, message.to_line || current.line_count || 0) } : current);
      } catch (err) {
        console.warn('Failed to parse dataflow session watch message', err);
      }
    };
    return closeSessionSocket;
  }, [activeTab, selectedSessionPath, detail?.output_path, detail?.status, sessionSnapshot?.line_count, projectId, activeAgentSessionPath]);

  const events = detail?.stages_json?.events || [];
  const statusSteps = detail ? deriveStepStatuses(detail.status, events) : STAGE_STEPS.map((): StepStatus => 'pending');
  const logLines = events.map(formatEventLog).filter(Boolean);
  const dfaTree = detail ? buildDfaTree(events, detail.status) : null;
  const groupedSessions = useMemo(() => {
    const groups = new Map<string, AppDfaSessionMeta[]>();
    sessions.forEach((session) => {
      const key = session.stage_group || 'root';
      groups.set(key, [...(groups.get(key) || []), session]);
    });
    return Array.from(groups.entries());
  }, [sessions]);
  const selectedSession = sessions.find((item) => item.relative_path === selectedSessionPath) || null;
  const activeSessions = useMemo(() => sessions.filter((item) => item.is_active), [sessions]);
  const filteredActiveSessions = useMemo(() => {
    const keyword = activeAgentKeyword.trim().toLowerCase();
    if (!keyword) return activeSessions;
    return activeSessions.filter((session) =>
      [
        session.display_name,
        session.relative_path,
        session.stage_group,
        session.role_name,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword)),
    );
  }, [activeAgentKeyword, activeSessions]);
  const activeAgentTotalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredActiveSessions.length / Math.max(1, activeAgentPageSize))),
    [filteredActiveSessions.length, activeAgentPageSize],
  );
  const normalizedActiveAgentPage = Math.min(Math.max(1, activeAgentPage), activeAgentTotalPages);
  const pagedActiveSessions = useMemo(() => {
    const start = (normalizedActiveAgentPage - 1) * Math.max(1, activeAgentPageSize);
    return filteredActiveSessions.slice(start, start + Math.max(1, activeAgentPageSize));
  }, [activeAgentPageSize, filteredActiveSessions, normalizedActiveAgentPage]);
  const activeAgentRangeStart = filteredActiveSessions.length === 0 ? 0 : (normalizedActiveAgentPage - 1) * Math.max(1, activeAgentPageSize) + 1;
  const activeAgentRangeEnd = filteredActiveSessions.length === 0 ? 0 : Math.min(normalizedActiveAgentPage * Math.max(1, activeAgentPageSize), filteredActiveSessions.length);
  const activeAgentSessionMeta = useMemo(
    () => sessions.find((item) => item.relative_path === activeAgentSessionPath) || null,
    [sessions, activeAgentSessionPath],
  );
  const resultRootFsPath = result?.output_root ? extractFsRelPath(result.output_root, projectId) : null;
  const selectedDataflow = result?.dataflow_files?.find((file) => file.relative_path === selectedDataflowFile) || result?.dataflow_files?.[0] || null;
  const resultContent = resultView === 'final'
    ? result?.result_markdown || ''
    : resultView === 'report'
      ? result?.run_report_markdown || ''
      : resultView === 'dataflow'
        ? selectedDataflow?.markdown || ''
        : JSON.stringify(result?.result_json || {}, null, 2);
  const evaluationRounds = evaluation?.rounds || [];
  const evaluationStatuses = useMemo(
    () => Array.from(new Set(evaluationRounds.map((item) => item.status).filter(Boolean) as string[])).sort(),
    [evaluationRounds],
  );
  const filteredRounds = useMemo(() => {
    const keyword = evaluationKeyword.trim().toLowerCase();
    return evaluationRounds.filter((round) => {
      if (evaluationStatus && round.status !== evaluationStatus) return false;
      if (!keyword) return true;
      return JSON.stringify(round).toLowerCase().includes(keyword);
    });
  }, [evaluationKeyword, evaluationRounds, evaluationStatus]);
  const avgJudgeScore = useMemo(() => {
    const scores = evaluationRounds.map((item) => Number(item.metrics?.avg_judge_score)).filter(Number.isFinite);
    if (!scores.length) return null;
    return scores.reduce((sum, item) => sum + item, 0) / scores.length;
  }, [evaluationRounds]);
  const selectedEvaluationRound = useMemo(
    () => evaluationRounds.find((item) => evaluationRoundKey(item) === selectedEvaluationRoundKey) || null,
    [evaluationRounds, selectedEvaluationRoundKey],
  );
  const hasReturnContext = hasExecutionReturnContext() || hasBinarySecurityReturnTarget(detail);

  useEffect(() => {
    setActiveAgentPage(1);
  }, [activeAgentKeyword, activeAgentPageSize, taskId]);

  useEffect(() => {
    if (activeAgentPage > activeAgentTotalPages) setActiveAgentPage(activeAgentTotalPages);
  }, [activeAgentPage, activeAgentTotalPages]);

  const cancelTask = async () => {
    if (!detail) return;
    await appApi.cancelTask(detail.task_id);
    notify('任务已取消', 'success');
    await loadDetail();
  };
  const restartTask = async () => {
    if (!detail) return;
    await appApi.restartTask(detail.task_id);
    notify('任务已重新启动', 'success');
    await loadDetail();
  };
  const resumeTask = async () => {
    if (!detail) return;
    await appApi.resumeTask(detail.task_id);
    notify('已从断点继续', 'success');
    await loadDetail();
  };
  const deleteTask = async () => {
    if (!detail) return;
    const confirmed = await showConfirm({
      title: '删除数据流分析任务',
      message:`确定要删除任务「${detail.task_name}」及其输出文件吗？此操作不可恢复。`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    await appApi.deleteTask(detail.task_id, true);
    notify('任务已删除', 'success');
    onBack();
  };

  return (
    <div className="px-8 pt-8 pb-10 space-y-6">
      {feedbackNodes}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
 <button onClick={handleBack} className="mt-1 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-slate-600 hover:bg-slate-100"><ArrowLeft size={18} /></button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate text-2xl font-black tracking-tight text-slate-900">{detail?.task_name || '数据流分析任务详情'}</h1>
              {detail ? <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_COLOR[detail.status] || 'bg-slate-100 text-slate-600'}`}>{STATUS_LABEL[detail.status] || detail.status}</span> : null}
              {hasReturnContext ? <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-700">来自二进制安全总任务</span> : null}
            </div>
            <p className="mt-2 text-sm text-slate-500">查看数据流追踪、智能体会话、结果产物和观测指标。</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void loadDetail()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />刷新</button>
          {detail && ['pending', 'running'].includes(detail.status) ? <button onClick={() => void cancelTask()} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"><XCircle size={15} />取消</button> : null}
          {detail && !['pending', 'running'].includes(detail.status) ? <button onClick={() => void restartTask()} className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50"><RotateCcw size={15} />重试</button> : null}
          {detail ? <DownstreamTaskCreator projectId={projectId} sourceKind="dataflow_analysis" task={detail} buttonClassName="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50" /> : null}
          {detail?.started_at ? <button onClick={() => void resumeTask()} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"><CheckCircle2 size={15} />继续</button> : null}
          {detail ? <button onClick={() => void deleteTask()} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"><Trash2 size={15} />删除</button> : null}
        </div>
      </div>

 <div className="flex gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1">
        {[
          ['overview', '总览'],
          ['timeline', '事件时间线'],
          ['task-config', '任务配置'],
          ['session', '智能体会话'],
          ['relationship', '智能体关系'],
          ['result', '结果'],
          ['evaluation', '观测指标'],
 ].map(([id, label]) => <button key={id} onClick={() => setActiveTab(id as DetailTab)} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${activeTab === id ? 'bg-slate-900 text-white ' : 'text-slate-500 hover:bg-slate-100'}`}>{label}</button>)}
      </div>

      {loading && !detail ? <div className="py-20 text-center text-sm text-slate-500"><Loader2 size={18} className="mx-auto mb-3 animate-spin" />加载任务详情中...</div> : detail ? (
        activeTab === 'overview' ? (
          <section className="space-y-4">
            <TaskOriginCard origin={detail} />
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
 <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">任务信息</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <InfoRow label="任务 ID" value={<span className="font-mono">{detail.task_id}</span>} />
                  <InfoRow label="创建时间" value={new Date(detail.created_at).toLocaleString('zh-CN')} />
                  <InfoRow label="输入路径" value={<span className="font-mono">{detail.input_path}</span>} />
                  <InfoRow label="输出路径" value={detail.output_path ? <span className="font-mono">{detail.output_path}</span> : '-'} />
                  <InfoRow label="开始时间" value={detail.started_at ? new Date(detail.started_at).toLocaleString('zh-CN') : '-'} />
                  <InfoRow label="完成时间" value={detail.finished_at ? new Date(detail.finished_at).toLocaleString('zh-CN') : '-'} />
                  <InfoRow label="重跑次数" value={Math.max(0, Number(detail.rerun_count || 0))} />
                  <InfoRow label="执行代次" value={`第 ${Math.max(0, Number(detail.execution_epoch || 0))} 轮`} />
                  <InfoRow label="控制面重跑" value={Math.max(0, Number(detail.control_version || 0))} />
                  <InfoRow label="lease_lost 回收" value={Math.max(0, Number(detail.lease_lost_count || 0))} />
                  <InfoRow label="最近事件时间" value={timeline[0]?.created_at ? new Date(timeline[0].created_at).toLocaleString('zh-CN') : '-'} />
                  <InfoRow label="耗时" value={detail.finished_at ? formatDuration(detail.started_at, detail.finished_at) : formatLiveDuration(detail.started_at, clockNow)} />
                  <InfoRow label="描述" value={detail.task_description || '-'} />
                </div>
              </div>
 <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">阶段进度</h2>
                <div className="mt-4 space-y-3">{STAGE_STEPS.map((step, index) => {
                  const state = statusSteps[index];
                  const artifactPath = detail.output_path ? extractFsRelPath(`${detail.output_path}/${detail.task_id}/${step.artifactSubpath}`, projectId) : null;
                  return <div key={step.key} className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3"><div className="flex items-start gap-3"><div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${state === 'completed' ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : state === 'running' ? 'border-blue-500 bg-blue-50 text-blue-600' : state === 'failed' ? 'border-red-400 bg-red-50 text-red-600' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>{state === 'completed' ? <CheckCircle2 size={16} /> : state === 'running' ? <Loader2 size={14} className="animate-spin" /> : state === 'failed' ? <XCircle size={16} /> : index + 1}</div><div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-900">{step.label}</p><p className="mt-1 text-xs text-slate-500">{step.desc}</p>{artifactPath && state !== 'pending' ? <button onClick={() => openInFileExplorer(artifactPath)} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-violet-200 px-2 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-50"><FolderOpen size={11} />打开阶段输出</button> : null}</div></div></div>;
                })}</div>
              </div>
            </div>
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
 <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">数据流调用树</h2>
                <div className="mt-4 max-h-[420px] overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">{dfaTree ? <TreeNodeView node={dfaTree} /> : <div className="py-10 text-center text-sm text-slate-400">暂无调用树事件</div>}</div>
              </div>
 <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <button onClick={() => setLogsExpanded((value) => !value)} className="flex w-full items-center justify-between gap-3 text-left"><div><h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">分析日志</h2><p className="mt-1 text-xs text-slate-400">{logLines.length} 条事件</p></div>{logsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
                {logsExpanded ? <div ref={logRef} className="mt-4 max-h-[420px] overflow-auto rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 font-mono text-xs leading-relaxed text-slate-700">{logLines.length ? logLines.map((line, index) => <div key={index} className={line.includes('✗') ? 'text-red-500' : line.includes('▶') ? 'text-violet-700' : line.includes('✓') ? 'text-emerald-700' : 'text-slate-700'}>{line}</div>) : <div className="text-slate-500">暂无阶段事件</div>}</div> : null}
              </div>
            </section>
 <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">当前运行智能体</h2>
                  <p className="mt-1 text-xs text-slate-400">展示当前任务仍处于活跃状态的智能体会话与角色，点击可查看实时会话。</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-600">{activeSessions.length} 个活跃会话</span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-600">
                    展示 {activeAgentRangeStart}-{activeAgentRangeEnd} / {filteredActiveSessions.length}
                  </span>
                </div>
              </div>
              {sessionsLoading && sessions.length === 0 ? (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500"><Loader2 size={15} className="animate-spin" />加载智能体状态中...</div>
              ) : activeSessions.length > 0 ? (
                <>
                  <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <Search size={14} className="text-slate-400" />
                      <input
                        value={activeAgentKeyword}
                        onChange={(event) => setActiveAgentKeyword(event.target.value)}
                        placeholder="按名称、路径、分组或角色筛选"
                        className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400"
                      />
                    </div>
                    <label className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
                      每页
                      <select
                        value={activeAgentPageSize}
                        onChange={(event) => setActiveAgentPageSize(Math.max(1, Number(event.target.value) || 10))}
                        className="ml-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-700"
                      >
                        {[10, 20, 50].map((size) => <option key={size} value={size}>{size}</option>)}
                      </select>
                    </label>
                  </div>
                  {filteredActiveSessions.length > 0 ? (
                    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                      <div className="divide-y divide-slate-200 bg-slate-50">
                        {pagedActiveSessions.map((session) => (
                          <button key={session.relative_path} type="button" onClick={() => openActiveAgentSession(session.relative_path)} className="w-full px-4 py-4 text-left transition hover:bg-slate-100">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-black text-slate-900">{session.display_name}</div>
                                <div className="mt-1 truncate font-mono text-[11px] text-slate-500">{session.relative_path}</div>
                                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
                                  <span>分组 {session.stage_group || '-'}</span>
                                  <span>事件 {session.event_count}</span>
                                  <span>更新时间 {formatSessionMtime(session.mtime)}</span>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${sessionRoleTone(session.role_name)}`}>
                                  {sessionRoleLabel(session.role_name)}
                                </span>
                                <span className="inline-flex whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">活跃</span>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                      当前筛选条件下没有匹配的活跃智能体会话。
                    </div>
                  )}
                  {activeAgentTotalPages > 1 && filteredActiveSessions.length > 0 ? (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                      <span>第 {normalizedActiveAgentPage} / {activeAgentTotalPages} 页</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveAgentPage((current) => Math.max(1, current - 1))}
                          disabled={normalizedActiveAgentPage <= 1}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-700 disabled:opacity-40"
                        >
                          上一页
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveAgentPage((current) => Math.min(activeAgentTotalPages, current + 1))}
                          disabled={normalizedActiveAgentPage >= activeAgentTotalPages}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-700 disabled:opacity-40"
                        >
                          下一页
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  {detail.status === 'pending' ? '任务尚未启动，当前没有活跃智能体。' : ['running', 'pending'].includes(detail.status) ? '当前没有检测到活跃智能体会话。' : '任务已结束，当前没有活跃智能体。'}
                </div>
              )}
            </section>
            {detail.abnormal_reason ? <AbnormalReasonCard reason={detail.abnormal_reason} history={detail.abnormal_reason_history} /> : null}
 {detail.error ? <section className="rounded-2xl border border-red-200 bg-red-50 p-5"><h2 className="text-sm font-black uppercase tracking-[0.2em] text-red-600">错误信息</h2><pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-red-200 bg-slate-50 px-3 py-3 text-xs text-red-700">{detail.error}</pre></section> : null}
 {detail.prompt_content ? <section className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden"><details><summary className="cursor-pointer select-none px-6 py-4 text-sm font-black text-slate-700 hover:bg-slate-100">分析 Prompt</summary><pre className="px-6 py-4 text-xs text-slate-600 whitespace-pre-wrap break-all bg-slate-50 max-h-72 overflow-auto border-t border-slate-100">{detail.prompt_content}</pre></details></section> : null}
          </section>
        ) : activeTab === 'timeline' ? (
          <section className="space-y-4">
 <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">事件时间线</h2>
                  <p className="mt-1 text-xs text-slate-400">记录任务关键时间点和运行轨迹，用于分析调度、租约、控制权和执行阶段问题。</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
                    展示 {timelineRangeStart}-{timelineRangeEnd} / {filteredTimeline.length}
                  </div>
                  <label className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
                    每页
                    <select value={timelinePageSize} onChange={(event) => setTimelinePageSize(Math.min(2000, Math.max(50, Number(event.target.value) || 200)))} className="ml-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-700">
                      {[50, 100, 200, 500].map((size) => <option key={size} value={size}>{size}</option>)}
                    </select>
                  </label>
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-600">
                    <button
                      onClick={() => setTimelinePage((page) => Math.max(1, page - 1))}
                      disabled={normalizedTimelinePage <= 1}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      上一页
                    </button>
                    <span className="min-w-16 text-center text-xs font-bold text-slate-500">
                      {normalizedTimelinePage} / {timelineTotalPages}
                    </span>
                    <button
                      onClick={() => setTimelinePage((page) => Math.min(timelineTotalPages, page + 1))}
                      disabled={normalizedTimelinePage >= timelineTotalPages}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      下一页
                    </button>
                  </div>
                  <button onClick={() => void loadTimeline()} disabled={timelineLoading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-60">
                    {timelineLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    刷新
                  </button>
                  <button onClick={() => void clearTimeline()} disabled={timelineClearing || timeline.length === 0} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60">
                    {timelineClearing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    清空
                  </button>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <select value={timelineEventTypeFilter} onChange={(event) => setTimelineEventTypeFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                  <option value="__all__">全部事件</option>
                  {timelineEventTypeOptions.map((value) => <option key={value} value={value}>{formatTimelineEventTypeLabel(value)}</option>)}
                </select>
                <select value={timelineLevelFilter} onChange={(event) => setTimelineLevelFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                  <option value="__all__">全部级别</option>
                  {timelineLevelOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
                <select value={timelineStatusFilter} onChange={(event) => setTimelineStatusFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                  <option value="__all__">全部状态</option>
                  {timelineStatusOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
            </section>
 <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              {timelineLoading && timeline.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">加载事件时间线中...</div>
              ) : filteredTimeline.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">当前暂无数据库事件时间线</div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="min-w-[1180px] w-full divide-y divide-slate-100 text-left text-xs">
                      <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">
                        <tr>
                          <th className="w-14 px-3 py-2">#</th>
                          <th className="w-44 px-3 py-2">时间</th>
                          <th className="w-32 px-3 py-2">分类</th>
                          <th className="w-44 px-3 py-2">事件</th>
                          <th className="w-28 px-3 py-2">状态</th>
                          <th className="w-24 px-3 py-2">级别</th>
                          <th className="px-3 py-2">摘要</th>
                          <th className="w-56 px-3 py-2">来源/归属</th>
                          <th className="w-36 px-3 py-2 text-right">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-slate-50">
                        {pagedTimelineItems.map((event, index) => {
                          const expanded = expandedTimelineEventId === event.id;
                          const payload = event.payload || {};
                          const sourceLabel = [event.source, event.worker_id || event.execution_owner_id, event.execution_epoch != null ?`Epoch ${event.execution_epoch}` : '', event.dispatch_status].filter(Boolean).join(' · ') || '-';
                          const hasPayload = Object.keys(payload).length > 0;
                          const statusText = event.status || event.dispatch_status || '-';
                          const auditEvent = isAgentKillTimelineEvent(event.event_type);
                          const auditSummary = auditEvent ? timelineAuditSummary(payload) : '';
                          return (
                            <React.Fragment key={event.id}>
                              <tr className="align-top">
                                <td className="px-3 py-2 font-mono text-slate-500">{timelineRangeStart + index}</td>
                                <td className="px-3 py-2 text-slate-600">{event.created_at ? new Date(event.created_at).toLocaleString('zh-CN') : '-'}</td>
                                <td className="px-3 py-2"><span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${timelineEventCategoryTone(event.event_type)}`}>{timelineEventCategoryLabel(event.event_type)}</span></td>
                                <td className="px-3 py-2"><span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${timelineEventTypeTone(event.event_type)}`}>{formatTimelineEventTypeLabel(event.event_type)}</span></td>
                                <td className="px-3 py-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_COLOR[event.status || 'pending'] || 'bg-slate-100 text-slate-600'}`}>{STATUS_LABEL[event.status || 'pending'] || statusText}</span></td>
                                <td className="px-3 py-2"><span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-black ${timelineLevelTone(event.level)}`}>{event.level || 'info'}</span></td>
                                <td className="max-w-[360px] px-3 py-2">
                                  <div className="truncate font-semibold text-slate-800" title={timelineMessageSummary(event)}>{timelineMessageSummary(event)}</div>
                                  {auditSummary ? <div className="mt-1 truncate text-[11px] font-medium text-rose-700" title={auditSummary}>{auditSummary}</div> : null}
                                </td>
                                <td className="px-3 py-2 text-[11px] text-slate-500"><div className="truncate font-mono" title={sourceLabel}>{sourceLabel}</div></td>
                                <td className="px-3 py-2 text-right">
                                  <div className="flex items-center justify-end gap-3">
                                    <button type="button" onClick={() => setExpandedTimelineEventId(expanded ? '' : event.id)} disabled={!hasPayload} className="text-[11px] font-black text-slate-500 transition hover:text-slate-900 disabled:opacity-30">{expanded ? '收起' : '查看'}</button>
                                    <button onClick={() => void deleteTimelineEvent(event.id)} disabled={deletingEventId === event.id || timelineClearing} className="text-[11px] font-black text-rose-600 transition hover:text-rose-800 disabled:opacity-40">{deletingEventId === event.id ? '删除中' : '删除'}</button>
                                  </div>
                                </td>
                              </tr>
                              {expanded ? (
                                <tr className="bg-slate-50/60">
                                  <td colSpan={9} className="px-3 py-3">
                                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                      {timelinePayloadRows(payload).slice(0, 12).map((row) => (
                                        <div key={row.key} className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
                                          <div className="font-bold capitalize text-slate-400">{row.label}</div>
                                          <div className="mt-1 break-all font-mono text-slate-700">{row.value}</div>
                                        </div>
                                      ))}
                                    </div>
                                    <pre className="mt-3 overflow-auto rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs leading-relaxed text-slate-900">{JSON.stringify(payload, null, 2)}</pre>
                                  </td>
                                </tr>
                              ) : null}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          </section>
        ) : activeTab === 'task-config' ? (
          <DataflowAnalysisTaskConfigPanel detail={detail} />
        ) : activeTab === 'session' ? (
          <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
 <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><div><div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">会话列表</div><div className="mt-1 text-xs text-slate-500">{sessions.length} 个会话文件</div></div><button onClick={() => void loadSessions()} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-100"><RefreshCw size={14} className={sessionsLoading ? 'animate-spin' : ''} /></button></div>{sessionsError ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">{sessionsError}</div> : null}{sessions.length === 0 ? <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">{sessionsLoading ? '加载会话中...' : '当前任务暂无智能体会话文件'}</div> : <div className="mt-4 max-h-[calc(100vh-20rem)] space-y-4 overflow-auto pr-1">{groupedSessions.map(([group, items]) => <div key={group}><div className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{group === 'root' ? '根会话' : group}</div><div className="space-y-2">{items.map((session) => { const selected = session.relative_path === selectedSessionPath; return <button key={session.relative_path} onClick={() => setSelectedSessionPath(session.relative_path)} className={`w-full rounded-2xl border px-4 py-3 text-left transition ${selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-50'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-black">{session.display_name}</div><div className={`mt-1 truncate text-[11px] ${selected ? 'text-slate-300' : 'text-slate-500'}`}>{session.relative_path}</div></div><span className={`inline-flex shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${session.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>{session.is_active ? '活跃' : '历史'}</span></div><div className={`mt-3 flex flex-wrap gap-3 text-[11px] ${selected ? 'text-slate-300' : 'text-slate-500'}`}><span>事件 {session.event_count}</span><span>{new Date(session.mtime * 1000).toLocaleString('zh-CN')}</span></div></button>; })}</div></div>)}</div>}</aside>
            <div className="space-y-4"><AgentSessionWarningPanel warnings={sessionWarnings} /><AgentSessionViewer sessionMeta={selectedSession as any} sessionHeader={sessionSnapshot?.session_meta} events={sessionEvents as any} loading={sessionLoading} live={sessionLive} error={sessionError} /></div>
          </section>
        ) : activeTab === 'relationship' ? (
          <section className="space-y-4"><WarningListPanel title="索引生成提示" items={sessionIndex?.warnings?.slice(0, 5) || []} /><AgentSessionWarningPanel warnings={sessionWarnings} /><SessionRelationshipGraph index={sessionIndex as any} selectedPath={selectedSessionPath} onSelect={setSelectedSessionPath} sessionPreview={{ path: selectedSessionPath, sessionMeta: selectedSession as any, sessionHeader: sessionSnapshot?.session_meta, events: sessionEvents as any, loading: sessionLoading, live: sessionLive, error: sessionError }} /></section>
        ) : activeTab === 'result' ? (
          <section className="space-y-4">
 <div className="grid gap-4 xl:grid-cols-5"><MetricCard label="追踪函数" value={result?.summary.function_count ?? 0} icon={<ScrollText size={18} />} /><MetricCard label="轮次数" value={result?.summary.round_count ?? 0} icon={<BarChart3 size={18} />} /><MetricCard label="通过轮次" value={result?.summary.passed_round_count ?? 0} icon={<CheckCircle2 size={18} />} /><MetricCard label="总 Token" value={formatNumber(result?.summary.total_tokens)} icon={<ScrollText size={18} />} /><div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"><div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">结果目录</div><div className="mt-2 text-sm font-semibold text-slate-700 line-clamp-2">{result?.output_root || '-'}</div><div className="mt-3 flex flex-wrap gap-2"><button disabled={!resultRootFsPath} onClick={() => resultRootFsPath && openInFileExplorer(resultRootFsPath)} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 px-2 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"><FolderOpen size={11} />打开目录</button><button disabled={!result?.output_root} onClick={() => result?.output_root && navigator.clipboard.writeText(result.output_root)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-50"><ClipboardCopy size={10} />复制路径</button></div></div></div>
 {resultLoading ? <section className="rounded-2xl border border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">加载结果中...</section> : !result || !result.available ? <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">当前任务尚未生成可展示结果。</section> : <section className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_320px]"><aside className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">结果导航</div><div className="mt-3 space-y-2">{[['final', '最终报告'], ['report', '运行报告'], ['dataflow', '函数级结果'], ['json', '结构化 JSON']].map(([id, label]) => <button key={id} onClick={() => setResultView(id as any)} className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-black transition ${resultView === id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-50'}`}>{label}</button>)}</div>{resultView === 'dataflow' ? <div className="mt-4 max-h-80 space-y-2 overflow-auto">{result.dataflow_files.map((file) => <button key={file.relative_path} onClick={() => setSelectedDataflowFile(file.relative_path)} className={`w-full rounded-xl border px-3 py-2 text-left text-xs ${selectedDataflow?.relative_path === file.relative_path ? 'border-cyan-300 bg-cyan-50 text-cyan-800' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>{file.name}</button>)}</div> : null}</aside><main className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><h2 className="border-b border-slate-200 pb-4 text-2xl font-black tracking-tight text-slate-900">{resultView === 'final' ? '最终报告' : resultView === 'report' ? '运行报告' : resultView === 'dataflow' ? selectedDataflow?.name || '函数级结果' : '结构化 JSON'}</h2><div className="mt-5 max-h-[calc(100vh-24rem)] overflow-auto pr-2">{resultContent ? resultView === 'json' ? <pre className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-900">{resultContent}</pre> : <MarkdownContent content={resultContent} /> : <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">当前结果缺少可展示内容</div>}</div></main><aside className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">关键文件</div><div className="mt-3 space-y-2">{[...(result.output_files || []), ...(result.dataflow_files || [])].map((file) => <div key={file.relative_path} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><div className="font-mono text-[11px] text-slate-700 break-all">{file.relative_path}</div><div className="mt-1 text-[10px] text-slate-400">{formatNumber(file.size)} bytes</div></div>)}</div></aside></section>}
          </section>
        ) : (
          <section className="space-y-4">
            {evaluationLoading ? (
 <section className="rounded-2xl border border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">加载观测指标中...</section>
            ) : !evaluation || !evaluation.available ? (
 <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500"><BarChart3 size={20} /></div>
                <div className="mt-4 text-base font-bold text-slate-800">当前任务尚未生成观测指标</div>
                <div className="mt-2 text-sm text-slate-500">任务至少完成一个 Worker/Judge 轮次后会出现观测数据。</div>
              </section>
            ) : (
              <>
                <WarningListPanel title="部分观测文件读取异常" items={evaluation.warnings} />
                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard label="总轮数" value={formatNumber(evaluation.summary?.round_count ?? evaluationRounds.length)} icon={<BarChart3 size={18} />} />
                  <MetricCard label="通过轮次" value={formatNumber(evaluation.summary?.passed_round_count)} icon={<CheckCircle2 size={18} />} />
                  <MetricCard label="追踪函数" value={formatNumber(evaluation.summary?.function_count)} icon={<ScrollText size={18} />} />
                  <MetricCard label="总 Token" value={formatNumber(evaluation.summary?.total_tokens)} icon={<ScrollText size={18} />} />
                  <MetricCard label="实际开始时间" value={detail?.started_at ? new Date(detail.started_at).toLocaleString('zh-CN') : '-'} icon={<ScrollText size={18} />} />
                  <MetricCard label="平均 Judge 分" value={avgJudgeScore == null ? '-' : formatNumber(avgJudgeScore, 1)} icon={<BarChart3 size={18} />} />
                  <MetricCard label="最终通过率" value={formatRate(evaluation.summary?.effectiveness?.final_round_pass_rate)} icon={<CheckCircle2 size={18} />} />
                </section>
                {selectedEvaluationRound ? (
                  <section className="space-y-4">
 <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <button type="button" onClick={() => setSelectedEvaluationRoundKey(null)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                            <ArrowLeft size={14} />
                            返回轮次列表
                          </button>
                          <div className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-cyan-600">轮次详情</div>
                          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">
                            #{selectedEvaluationRound.round ?? '-'} · {selectedEvaluationRound.module_name || selectedEvaluationRound.function || selectedEvaluationRound.func || selectedEvaluationRound.entry || '数据流分析'}
                          </h2>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs">
                            <span className={`rounded-full border px-3 py-1 font-bold ${evaluationStatusTone(selectedEvaluationRound.status)}`}>{selectedEvaluationRound.status || '-'}</span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-bold text-slate-600">{stageLabel(selectedEvaluationRound.stage)}</span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-mono font-bold text-slate-600">阶段轮次 {selectedEvaluationRound.stage_round ?? '-'}</span>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                          <div className="font-black text-slate-700">来源文件</div>
                          <div className="mt-1 max-w-xl break-all font-mono">{selectedEvaluationRound.source_path || '-'}</div>
                        </div>
                      </div>
                    </section>
                    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <MetricCard label="耗时" value={formatMs(selectedEvaluationRound.duration_ms)} icon={<BarChart3 size={18} />} />
                      <MetricCard label="Token" value={formatNumber(selectedEvaluationRound.metrics?.token_total)} icon={<ScrollText size={18} />} />
                      <MetricCard label="任务实际开始时间" value={detail?.started_at ? new Date(detail.started_at).toLocaleString('zh-CN') : '-'} icon={<ScrollText size={18} />} />
                      <MetricCard label="Judge 均分" value={formatNumber(selectedEvaluationRound.metrics?.avg_judge_score, 1)} icon={<CheckCircle2 size={18} />} />
                    </section>
                    <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                      <div className="space-y-4">
 <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                          <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">本轮执行摘要</h3>
                          <div className="mt-4 space-y-3">
                            <InfoRow label="开始时间" value={selectedEvaluationRound.started_at ? new Date(selectedEvaluationRound.started_at).toLocaleString('zh-CN') : '-'} />
                            <InfoRow label="结束时间" value={selectedEvaluationRound.ended_at ? new Date(selectedEvaluationRound.ended_at).toLocaleString('zh-CN') : '-'} />
                            <InfoRow label="完成原因" value={selectedEvaluationRound.completion_reason || '-'} />
                            <InfoRow label="函数完成" value={selectedEvaluationRound.module_completed ? '是' : '否'} />
                            <InfoRow label="通过投票" value={selectedEvaluationRound.metrics?.passed_by_vote ? '通过' : '未通过'} />
                            <InfoRow label="通过率" value={formatRate(selectedEvaluationRound.metrics?.review_pass_rate)} />
                          </div>
                        </section>
 <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                          <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">Worker</h3>
                          <div className="mt-4 space-y-3">
                            <InfoRow label="模型" value={<span className="break-all font-mono">{selectedEvaluationRound.worker?.model || '-'}</span>} />
                            <InfoRow label="会话文件" value={<span className="break-all font-mono">{selectedEvaluationRound.worker?.session_file || '-'}</span>} />
                            <InfoRow label="错误" value={selectedEvaluationRound.worker?.error || '-'} />
                          </div>
                          {Array.isArray(selectedEvaluationRound.worker?.artifact_paths) && selectedEvaluationRound.worker.artifact_paths.length > 0 ? (
                            <div className="mt-4">
                              <div className="text-xs font-bold text-slate-500">产物路径</div>
                              <div className="mt-2 space-y-2">
                                {(selectedEvaluationRound.worker?.artifact_paths || []).slice(0, 8).map((path: string) => (
                                  <div key={path} className="break-all rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-600">{path}</div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </section>
                      </div>
 <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">Judge 评审</h3>
                            <p className="mt-1 text-xs text-slate-400">展示本轮所有 Judge 的评分、通过状态和反馈摘要</p>
                          </div>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">{selectedEvaluationRound.judges?.length || 0} 个 Judge</span>
                        </div>
                        <div className="mt-4 space-y-3">
                          {(selectedEvaluationRound.judges || []).map((judge: any, index: number) => (
                            <div key={`${judge.judge_id || index}-${judge.model || ''}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="font-mono text-xs font-bold text-slate-700">{judge.judge_id ||`judge-${index + 1}`}</div>
                                <div className="flex flex-wrap gap-2 text-[11px]">
                                  <span className={`rounded-full px-2 py-0.5 font-bold ${judge.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{judge.passed ? '通过' : '未通过'}</span>
                                  <span className="rounded-full bg-slate-50 px-2 py-0.5 font-bold text-slate-600">评分 {formatNumber(judge.score)}</span>
                                </div>
                              </div>
                              <div className="mt-2 break-all font-mono text-[11px] text-slate-500">{judge.model || '-'}</div>
                              <div className="mt-2 break-all font-mono text-[11px] text-slate-500">{judge.session_file || '未记录会话文件'}</div>
                              {judge.feedback_excerpt ? <div className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs leading-6 text-slate-700">{judge.feedback_excerpt}</div> : null}
                            </div>
                          ))}
                          {(selectedEvaluationRound.judges || []).length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">本轮没有 Judge 明细</div>
                          ) : null}
                        </div>
                      </section>
                    </section>
 <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">原始 JSON</h3>
                          <p className="mt-1 text-xs text-slate-400">保留完整观测文件内容，便于核对字段。</p>
                        </div>
                      </div>
                      <pre className="mt-4 max-h-[480px] overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-900">{JSON.stringify(selectedEvaluationRound, null, 2)}</pre>
                    </section>
                  </section>
                ) : (
 <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">轮次明细</h2>
                        <p className="mt-1 text-xs text-slate-400">展示每一轮 Worker/Judge 的观测指标，点击行进入轮次详情页</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <div className="relative">
                          <Search size={13} className="pointer-events-none absolute left-3 top-2.5 text-slate-400" />
                          <input value={evaluationKeyword} onChange={(e) => setEvaluationKeyword(e.target.value)} placeholder="函数过滤" className="rounded-xl border border-slate-200 py-2 pl-8 pr-3 text-xs" />
                        </div>
                        <select value={evaluationStatus} onChange={(e) => setEvaluationStatus(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs">
                          <option value="">全部状态</option>
                          {evaluationStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="mt-4 overflow-auto rounded-2xl border border-slate-200">
                      <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500">
                          <tr>
                            <th className="px-3 py-3">轮次</th>
                            <th className="px-3 py-3">阶段</th>
                            <th className="px-3 py-3">函数</th>
                            <th className="px-3 py-3">状态</th>
                            <th className="px-3 py-3">耗时</th>
                            <th className="px-3 py-3">Judge 分</th>
                            <th className="px-3 py-3">通过率</th>
                            <th className="px-3 py-3">Token</th>
                            <th className="px-3 py-3">任务实际开始时间</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-slate-50">
                          {filteredRounds.map((round) => (
                            <tr key={evaluationRoundKey(round)} onClick={() => setSelectedEvaluationRoundKey(evaluationRoundKey(round))} className="cursor-pointer hover:bg-slate-100">
                              <td className="px-3 py-3 font-mono text-slate-700">{round.round}</td>
                              <td className="px-3 py-3 font-semibold text-slate-700">{stageLabel(round.stage)}</td>
                              <td className="px-3 py-3 font-mono text-slate-700">{round.module_name || round.function || round.func || round.entry || '-'}</td>
                              <td className="px-3 py-3"><span className={`rounded-full border px-2 py-0.5 font-bold ${evaluationStatusTone(round.status)}`}>{round.status || '-'}</span></td>
                              <td className="px-3 py-3 text-slate-600">{formatMs(round.duration_ms)}</td>
                              <td className="px-3 py-3">{formatNumber(round.metrics?.avg_judge_score, 1)}</td>
                              <td className="px-3 py-3">{formatRate(round.metrics?.review_pass_rate)}</td>
                              <td className="px-3 py-3">{formatNumber(round.metrics?.token_total)}</td>
                              <td className="px-3 py-3">{detail?.started_at ? new Date(detail.started_at).toLocaleString('zh-CN') : '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {filteredRounds.length === 0 ? <div className="px-4 py-10 text-center text-sm text-slate-500">没有符合过滤条件的轮次</div> : null}
                    </div>
                  </section>
                )}
              </>
            )}
          </section>
        )
      ) : !loading ? <div className="py-16 text-center text-sm text-slate-400">未指定任务或任务不存在。</div> : null}

      {activeAgentSessionPath ? (
        <div className="fixed inset-0 z-[280] bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-900 shadow-panel">
            <AgentSessionDialogHeader
              title={activeAgentSessionMeta?.display_name || activeAgentSessionPath}
              subtitle={activeAgentSessionMeta?.relative_path || activeAgentSessionPath}
              stage={activeAgentSessionMeta?.stage_group}
              roleLabel={sessionRoleLabel(activeAgentSessionMeta?.role_name)}
              roleToneClass={sessionRoleTone(activeAgentSessionMeta?.role_name)}
              eventCount={activeAgentSessionMeta?.event_count}
              live={sessionLive}
              onClose={() => setActiveAgentSessionPath(null)}
            />
            <div className="flex-1 overflow-auto px-6 py-6">
              <AgentSessionWarningPanel warnings={sessionWarnings} className="mb-4" />
              <AgentSessionViewer sessionMeta={(activeAgentSessionMeta || selectedSession) as any} sessionHeader={sessionSnapshot?.session_meta} events={sessionEvents as any} loading={sessionLoading} live={sessionLive} error={sessionError} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
