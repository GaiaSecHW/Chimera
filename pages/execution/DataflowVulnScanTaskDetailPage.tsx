import React, { Component, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertTriangle, ArrowLeft, BarChart3, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ClipboardCopy,
  FolderOpen, Loader2, RefreshCw, RotateCcw, Search, ScrollText, Trash2, XCircle,
  Bug, TrendingUp,
} from 'lucide-react';

const LK = {
  primary: 'var(--brand-primary)', primarySoft: '#7590ff', primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: 'var(--bg-app)', surface: 'var(--bg-surface)', surfaceRaised: 'var(--bg-app)',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: 'var(--border-default)', borderSoft: 'var(--border-default)',
  ink: 'var(--text-primary)', inkSoft: 'var(--text-primary)', body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)', mutedSoft: '#8b95a8',
  success: '#45c06f', warning: '#d5a13a', error: '#f15d5d', info: '#4f8cff',
  critical: '#ff4d4f', high: '#ff8b3d', medium: '#f0b64c', low: '#49c5ff',
} as const;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

/** Safety cap for synchronous event processing to prevent browser freeze.
 *  Does NOT truncate data - larger datasets use virtualized rendering. */
const MAX_EVENTS_BUDGET = 20000;
/** Child nodes to show before "show more" button */
const INITIAL_CHILD_DISPLAY = 50;
/** Maximum size for JSON.stringify targets (approximate chars) */
const MAX_JSON_STRINGIFY_SIZE = 500_000;

import { api } from '../../clients/api';
import type { DataflowVulnTraceTreeNode } from '../../clients/appDataflowVulnScan';
import { FileWatchMessage } from '../../clients/fileserver';
import {
  AppDfaSessionEvent,
  AppDfaSessionIndex,
  AppDfaSessionMeta,
  AppDfaSessionSnapshot,
  AppDfaStageEvent,
  AppDfaTaskDetail,
  AppDfaTaskEvent,
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
import { StatisticCard } from '../../design-system';

const STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  running: '分析中',
  passed: '通过',
  failed: '失败',
  error: '错误',
  cancelled: '已取消',
};

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-theme-elevated text-theme-text-secondary',
  running: 'bg-blue-500/15 text-blue-400',
  passed: 'bg-emerald-500/15 text-emerald-400',
  failed: 'bg-red-500/15 text-red-400',
  error: 'bg-orange-500/15 text-orange-400',
  cancelled: 'bg-theme-elevated text-theme-text-muted',
};

const STAGE_STEPS = [
  { key: 'init', label: '任务准备', desc: '解析配置，初始化工作区', artifactSubpath: 'run' },
  { key: 'worker', label: 'Worker 分析', desc: '并行追踪函数数据流', artifactSubpath: 'run/sessions' },
  { key: 'judge', label: 'Judge 评估', desc: '评估数据流漏洞挖掘可信度', artifactSubpath: 'run/sessions' },
  { key: 'report', label: '报告输出', desc: '生成数据流 Markdown 和结构化结果', artifactSubpath: 'output' },
];

const EVT_STAGE: Record<string, number> = {
  task_start: 0, trace_start: 0, trace_skip: 0, trace_callees: 0,
  round_start: 1, worker_start: 1, worker_done: 1,
  judge_start: 2, judge_eval: 2, judge_summary: 2, judge_done: 2, judge_result: 2,
  task_end: 3,
};

type DetailTab = 'overview' | 'timeline' | 'task-config' | 'session' | 'relationship' | 'result' | 'vuln-graph' | 'evaluation';
type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

/** Error boundary to prevent a single render error from crashing the entire page. */
class DetailErrorBoundary extends Component<{ children: React.ReactNode; taskName?: string }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode; taskName?: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[DataflowVulnScanDetail] render error:', error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="px-8 pt-8 pb-10 space-y-6">
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/15 p-8 text-center">
            <AlertTriangle size={40} className="mx-auto mb-4 text-rose-400" />
            <h2 className="text-xl font-bold text-rose-400">页面渲染异常</h2>
            <p className="mt-2 text-sm text-theme-text-secondary">
              任务「{this.props.taskName || '-'}」的详情页渲染时发生错误，数据可能过大或格式异常。
            </p>
            <p className="mt-2 text-xs text-theme-text-muted font-mono break-all">
              {this.state.error?.message || 'Unknown error'}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-4 py-2 text-sm font-semibold text-theme-text-secondary hover:bg-theme-elevated"
            >
              <RefreshCw size={15} /> 重试渲染
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Safe JSON.stringify with size limit to prevent browser freeze. */
function safeJsonStringify(value: unknown, space = 2): string {
  try {
    const raw = JSON.stringify(value, null, space);
    if (raw.length > MAX_JSON_STRINGIFY_SIZE) {
      return JSON.stringify({ _truncated: true, _original_size: raw.length, _preview: raw.slice(0, MAX_JSON_STRINGIFY_SIZE) }, null, space);
    }
    return raw;
  } catch (e) {
    return `{"error": "JSON.stringify failed: ${(e as Error).message}"}`;
  }
}

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
  if (role === 'judge') return 'border-amber-500/20 bg-amber-500/15 text-amber-400';
  if (role === 'sub_worker') return 'border-violet-500/20 bg-violet-500/15 text-violet-400';
  if (role === 'master' || role === 'master_worker') return 'border-cyan-500/20 bg-cyan-500/15 text-cyan-400';
  return 'border-theme-border bg-theme-bg-app text-theme-text-secondary';
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

function timelineLevelTone(level?: string | null) {
  const normalized = String(level || '').toLowerCase();
  if (normalized === 'error') return 'border-rose-500/20 bg-rose-500/15 text-rose-400';
  if (normalized === 'warning' || normalized === 'warn') return 'border-amber-500/20 bg-amber-500/15 text-amber-400';
  if (normalized === 'success') return 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400';
  return 'border-theme-border bg-theme-bg-app text-theme-text-secondary';
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
  if (category === 'task_mutation') return 'border-cyan-500/20 bg-cyan-500/15 text-cyan-400';
  if (category === 'failure') return 'border-rose-500/20 bg-rose-500/15 text-rose-400';
  if (category === 'stage_progress') return 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400';
  return 'border-theme-border bg-theme-bg-app text-theme-text-secondary';
}

function timelineEventTypeTone(eventType?: string | null) {
  const normalized = String(eventType || '').trim();
  if (normalized === 'agent_process_manual_kill') return 'border-rose-500/20 bg-rose-500/15 text-rose-400';
  if (normalized === 'agent_process_bulk_manual_kill') return 'border-amber-500/20 bg-amber-500/15 text-amber-400';
  return 'border-theme-border bg-theme-bg-app text-theme-text-secondary';
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

function timelineRecorderLabel(event: AppDfaTaskEvent) {
  const primary = event.recorder_pod_name || event.recorder_hostname || '-';
  const role = event.recorder_role || '-';
  return `记录者: ${primary} · ${role}`;
}

function timelineOriginLabel(event: AppDfaTaskEvent) {
  const primary = event.origin_pod_name || event.origin_hostname;
  const role = event.origin_role;
  if (!primary && !role) return '';
  const recorderPrimary = event.recorder_pod_name || event.recorder_hostname || '';
  const recorderRole = event.recorder_role || '';
  if (primary === recorderPrimary && (role || '') === recorderRole) return '';
  return `来源: ${primary || '-'} · ${role || '-'}`;
}

function deriveStepStatuses(taskStatus: string, events: AppDfaStageEvent[]): StepStatus[] {
  try {
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
  } catch (e) {
    console.error('[deriveStepStatuses] error:', e);
    return STAGE_STEPS.map((): StepStatus => 'pending');
  }
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
    case 'entry_screen_start': return`[${ts}] ▶ 入口快速筛查: ${d.function || ''}`;
    case 'entry_screen_whitelisted': return`[${ts}] ✓ 入口筛查通过（白名单命中 \`${d.matched_keyword || ''}\`）`;
    case 'entry_screen_pass': return`[${ts}] ✓ 入口筛查通过（${d.screened_by || 'agent'}${d.confidence ? '/' + d.confidence : ''}）${d.reason ? ': ' + d.reason : ''}`;
    case 'entry_screen_reject': return`[${ts}] ⛔ 判定为非入口，已跳过数据流分析${d.confidence ? '（置信度 ' + d.confidence + '）' : ''}: ${d.reason || ''}`;
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
  try {
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
  // Global visited set: each function appears at most ONCE in the full tree.
  // This prevents exponential DAG→tree expansion (e.g. 103 functions → 901K nodes).
  const globallyVisited = new Set<string>();
  const build = (name: string, inheritDepth: number): DfaTreeNode | null => {
    if (globallyVisited.has(name)) return null;
    globallyVisited.add(name);
    const depth = nodeDepth.get(name) ?? inheritDepth;
    const children: DfaTreeNode[] = [];
    for (const childName of (calleesMap.get(name) || [])) {
      const child = build(childName, depth + 1);
      if (child) children.push(child);
    }
    return {
      name,
      depth,
      status: nodeStatus.get(name) || 'pending',
      children,
    };
  };
  const root = build(rootName, 0);
  return root;
  } catch (e) {
    console.error('[buildDfaTree] error:', e);
    return null;
  }
}

function TreeNodeView({ node, defaultExpanded = true }: { node: DfaTreeNode; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showAll, setShowAll] = useState(false);
  const hasManyChildren = node.children.length > INITIAL_CHILD_DISPLAY;
  const visibleChildren = hasManyChildren && !showAll ? node.children.slice(0, INITIAL_CHILD_DISPLAY) : node.children;
  const hiddenCount = hasManyChildren && !showAll ? node.children.length - INITIAL_CHILD_DISPLAY : 0;
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => node.children.length > 0 && setExpanded((e) => !e)}
        className="flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-xs hover:bg-theme-elevated transition w-full text-left"
      >
        <span className={`h-2 w-2 rounded-full shrink-0 ${node.status === 'done' ? 'bg-emerald-500' : node.status === 'running' ? 'bg-blue-500' : 'bg-slate-300'}`} />
        <span className="font-mono text-theme-text-secondary truncate flex-1">{node.name}</span>
        {node.children.length > 0 && (
          <span className="text-theme-text-muted shrink-0 ml-2">{expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}{node.children.length > 0 && <span className="ml-1 text-[10px]">{node.children.length}</span>}</span>
        )}
      </button>
      {expanded && node.children.length > 0 && (
        <div className="ml-5 border-l border-theme-border pl-3 space-y-2">
          {visibleChildren.map((child) => (
            <TreeNodeView key={`${node.name}-${child.name}-${child.depth}`} node={child} defaultExpanded={false} />
          ))}
          {hasManyChildren && !showAll && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="text-[11px] text-theme-text-muted hover:text-theme-text-secondary pl-2 py-1"
            >
              展开剩余 {hiddenCount} 个子函数...
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type VulnGraphStats = {
  totalNodes: number;
  analyzedNodes: number;
  pendingNodes: number;
  skippedNodes: number;
  cycleNodes: number;
  maxDepth: number;
  vulnCount: number;
};

function computeVulnGraphStats(tree: DataflowVulnTraceTreeNode | null | undefined): VulnGraphStats {
  if (!tree) return { totalNodes: 0, analyzedNodes: 0, pendingNodes: 0, skippedNodes: 0, cycleNodes: 0, maxDepth: 0, vulnCount: 0 };
  const stats: VulnGraphStats = { totalNodes: 0, analyzedNodes: 0, pendingNodes: 0, skippedNodes: 0, cycleNodes: 0, maxDepth: 0, vulnCount: 0 };
  const walk = (node: DataflowVulnTraceTreeNode) => {
    stats.totalNodes += 1;
    stats.maxDepth = Math.max(stats.maxDepth, node.depth);
    stats.vulnCount += node.findings_count || 0;
    const status = String(node.status || '').toLowerCase();
    if (status === 'cycle') {
      stats.cycleNodes += 1;
    } else if (node.pruned || status === 'skipped' || status === 'depth_limit' || status === 'merged') {
      stats.skippedNodes += 1;
    } else if (status === 'passed' || status === 'completed' || status === 'analyzed' || status === 'done') {
      stats.analyzedNodes += 1;
    } else {
      stats.pendingNodes += 1;
    }
    (node.children || []).forEach(walk);
  };
  walk(tree);
  return stats;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex gap-3"><span className="w-24 shrink-0 text-xs text-theme-text-muted">{label}</span><span className="text-xs text-theme-text-secondary break-all">{value}</span></div>;
}

function MetricCard({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) {
  return <StatisticCard label={label} value={value} icon={icon} />;
}

function traceNodeTone(status?: string) {
  if (status === 'passed' || status === 'completed') return 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400';
  if (status === 'running' || status === 'queued') return 'border-blue-500/20 bg-blue-500/15 text-blue-400';
  if (status === 'failed' || status === 'error') return 'border-rose-500/20 bg-rose-500/15 text-rose-400';
  if (status === 'depth_limit' || status === 'cycle' || status === 'skipped') return 'border-amber-500/20 bg-amber-500/15 text-amber-400';
  return 'border-theme-border bg-theme-bg-app text-theme-text-secondary';
}

function flattenTraceTree(node?: DataflowVulnTraceTreeNode | null): DataflowVulnTraceTreeNode[] {
  if (!node) return [];
  const result: DataflowVulnTraceTreeNode[] = [];
  const stack: DataflowVulnTraceTreeNode[] = [node];
  while (stack.length > 0) {
    const current = stack.pop()!;
    result.push(current);
    const kids = Array.isArray(current.children) ? current.children : [];
    for (let i = kids.length - 1; i >= 0; i--) {
      stack.push(kids[i]);
    }
  }
  return result;
}

const PRUNE_LABELS: Record<string, string> = {
  skipped: '已跳过',
  merged_equivalent_taint_validation: '污点等价合并',
  cycle: '递归循环',
  depth_limit: '已达深度上限',
  external: '外部库函数',
  not_in_source_root_funcdb: '外部依赖（不在源码树内）',
  invalid_name: '未解析（函数指针/宏/内联）',
  already_analyzed: '已分析',
  recursion: '递归检测',
  'external followup': '外部库函数',
  'stdlib skip': '标准库',
};

function pruneReasonTone(reason?: string | null): string {
  const r = reason || '';
  if (r === 'merged_equivalent_taint_validation' || r === 'already_analyzed') return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';
  if (r === 'invalid_name') return 'bg-rose-500/15 text-rose-400 border-rose-500/20';
  if (r === 'not_in_source_root_funcdb' || r === 'external' || r.startsWith('external') || r === 'stdlib skip') return 'bg-amber-500/15 text-amber-400 border-amber-500/20';
  return 'bg-theme-bg-app text-theme-text-secondary border-theme-border';
}

function PrunedBranchBadge({ node, level = 0, isLast = false, ancestors = [] }: { node: DataflowVulnTraceTreeNode; level?: number; isLast?: boolean; ancestors?: boolean[] }) {
  const reasonLabel = PRUNE_LABELS[node.prune_reason || ''] || node.prune_reason || node.followup_status;
  const reasonTone = pruneReasonTone(node.prune_reason);
  const tooltipLines: string[] = [];
  tooltipLines.push(`未继续跟踪: ${reasonLabel}`);
  if (node.followup_reason) tooltipLines.push(`详细: ${node.followup_reason}`);
  if (node.taint_constraints?.length) {
    tooltipLines.push('');
    tooltipLines.push('调用点约束:');
    for (const c of node.taint_constraints) {
      tooltipLines.push(`  • ${c.kind} ${c.target_symbol ||`arg${c.target_arg_index}`}: ${c.evidence || c.confidence}`);
    }
  }
  return (
    <div className="relative" style={{ marginLeft: `${level * 22}px` }}>
      {level > 0 && (
        <>
          <div className="absolute border-l border-dashed border-theme-border" style={{ left: `${-1 * 22 + 8}px`, top: 0, height: '10px' }} />
          <div className="absolute border-b border-l border-dashed border-theme-border rounded-bl" style={{ left: `${-1 * 22 + 8}px`, top: '10px', width: '10px', height: '4px' }} />
        </>
      )}
      <div className="group relative inline-flex items-center gap-1.5 rounded-lg border border-dashed px-2.5 py-1.5 text-xs cursor-help opacity-70 hover:opacity-100 transition-opacity" style={{ borderColor: reasonTone.includes('amber') ? '#d5a13a40' : reasonTone.includes('rose') ? '#f15d5d40' : '#72809a40' }}>
        <span className="font-mono font-semibold text-theme-text-muted line-through">{node.function_name || '-'}</span>
        <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${reasonTone}`}>{reasonLabel}</span>
      </div>
      <div className="pointer-events-none absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-[11px] leading-relaxed text-theme-text-secondary opacity-0 transition-opacity group-hover:opacity-100 whitespace-pre-wrap">
        {tooltipLines.join('\n')}
      </div>
    </div>
  );
}

function TraceTreeNodeCard({
  node,
  selectedRunId,
  onSelect,
  level = 0,
  isLast = false,
  ancestors = [],
}: {
  node: DataflowVulnTraceTreeNode;
  selectedRunId?: string;
  onSelect: (node: DataflowVulnTraceTreeNode) => void;
  level?: number;
  isLast?: boolean;
  ancestors?: boolean[];
}) {
  const selected = selectedRunId === node.run_id || (!selectedRunId && level === 0);
  const [expanded, setExpanded] = useState(level === 0);
  const [showAll, setShowAll] = useState(false);
  const safeChildren = Array.isArray(node.children) ? node.children : [];
  const hasMany = safeChildren.length > INITIAL_CHILD_DISPLAY;
  const visibleChildren = hasMany && !showAll ? safeChildren.slice(0, INITIAL_CHILD_DISPLAY) : safeChildren;
  const hiddenCount = hasMany && !showAll ? safeChildren.length - INITIAL_CHILD_DISPLAY : 0;

  const depthColors = [
    'border-l-cyan-500', 'border-l-emerald-500', 'border-l-violet-500',
    'border-l-amber-500', 'border-l-rose-500', 'border-l-blue-500',
  ];
  const depthBorder = depthColors[level % depthColors.length];

  if (node.pruned) {
    return <PrunedBranchBadge node={node} level={level} isLast={isLast} ancestors={ancestors} />;
  }

  return (
    <div className="relative">
      {/* Ancestor tree lines */}
      {level > 0 && ancestors.map((hasMore, i) => (
        hasMore ? (
          <div
            key={`line-${i}`}
            className="absolute border-l border-theme-border"
            style={{ left: `${i * 22}px`, top: 0, bottom: 0, width: 0 }}
          />
        ) : null
      ))}
      {/* Current level connector */}
      {level > 0 && (
        <>
          <div
            className="absolute border-l border-theme-border"
            style={{ left: `${(level - 1) * 22}px`, top: 0, height: '18px' }}
          />
          <div
            className="absolute border-b border-l border-theme-border rounded-bl-lg"
            style={{ left: `${(level - 1) * 22}px`, top: '18px', width: '14px', height: '8px' }}
          />
        </>
      )}
      {/* Node card */}
      <div style={{ marginLeft: `${level * 22}px` }}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => { onSelect(node); if (safeChildren.length > 0) setExpanded((e) => !e); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(node); if (safeChildren.length > 0) setExpanded((e) => !e); } }}
          className={`w-full rounded-xl border px-3 py-2.5 text-left transition cursor-pointer border-l-2 ${depthBorder} ${selected ? 'bg-theme-elevated/80 border-theme-border' : 'bg-theme-surface hover:bg-theme-elevated/40 border-theme-border'}`}
        >
          <div className="flex items-start gap-2">
            {/* Expand icon */}
            <div className="mt-0.5 shrink-0">
              {safeChildren.length > 0 ? (
                expanded ? <ChevronDown size={14} className="text-theme-text-muted" /> : <ChevronRight size={14} className="text-theme-text-muted" />
              ) : (
                <div className="w-3.5 h-3.5" />
              )}
            </div>
            {/* Content */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate font-mono text-[13px] font-bold text-theme-text-primary">{node.function_name || '-'}</span>
                <span className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-bold ${traceNodeTone(node.followup_status || node.status)}`}>{node.followup_status || node.status || '-'}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-theme-text-muted">
                <span className="truncate max-w-[240px]">{node.source_file || '-'}</span>
                {node.line_hint ? <span>{node.line_hint}</span> : null}
                <span className="text-theme-text-faint">D{node.depth}</span>
                {node.findings_count > 0 ? <span className="font-bold text-rose-400">🐛{node.findings_count}</span> : null}
                {node.termination_reasons?.length ? <span className="text-amber-400">⏹</span> : null}
              </div>
            </div>
            {/* Right stats */}
            <div className="flex shrink-0 items-center gap-1.5 text-[10px] text-theme-text-muted">
              <span className="rounded bg-theme-elevated px-1.5 py-0.5">{node.taint_inputs?.length || 0} 输入</span>
              <span className="rounded bg-theme-elevated px-1.5 py-0.5">{node.child_count || safeChildren.length} 子</span>
            </div>
          </div>
        </div>
        {/* Children */}
        {expanded && safeChildren.length > 0 && (
          <div className="mt-1">
            {visibleChildren.map((child, i) => (
              <TraceTreeNodeCard
                key={`${child.run_id || child.function_name}-${child.line_hint}-${level + 1}`}
                node={child}
                selectedRunId={selectedRunId}
                onSelect={onSelect}
                level={level + 1}
                isLast={i === visibleChildren.length - 1}
                ancestors={[...ancestors, !isLast || (hasMany && !showAll)]}
              />
            ))}
            {hasMany && !showAll && (
              <div style={{ marginLeft: `${(level + 1) * 22}px` }}>
                <div className="relative">
                  <div className="absolute border-l border-dashed border-theme-border" style={{ left: '-14px', top: 0, height: '14px' }} />
                  <button
                    type="button"
                    onClick={() => setShowAll(true)}
                    className="text-[11px] text-theme-text-muted hover:text-amber-400 transition ml-2"
                  >
                    + 展开剩余 {hiddenCount} 个子函数
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const MARKDOWN_LAZY_THRESHOLD = 100_000; // characters, above which content is collapsed by default

function MarkdownContent({ content }: { content: string }) {
  const [showFull, setShowFull] = useState(false);
  const isLarge = content.length > MARKDOWN_LAZY_THRESHOLD;
  const displayContent = isLarge && !showFull ? content.slice(0, MARKDOWN_LAZY_THRESHOLD) + '\n\n*(内容较长，已截断预览...)*' : content;
  return (
    <div>
      {isLarge && (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/15 px-4 py-2 text-xs">
          <AlertTriangle size={14} className="text-amber-400" />
          <span className="text-amber-400">报告内容较长 ({(content.length / 1024).toFixed(0)} KB)，默认折叠以提升性能。</span>
          <button
            type="button"
            onClick={() => setShowFull((v) => !v)}
            className="ml-auto rounded-lg border border-amber-500/30 px-3 py-1 text-xs font-semibold text-amber-400 hover:bg-amber-500/20"
          >
            {showFull ? '收起' : '展开全部'}
          </button>
        </div>
      )}
      <article className="prose prose-slate max-w-none prose-headings:font-semibold prose-pre:border prose-pre:border-theme-border prose-pre:bg-theme-bg-app prose-pre:text-theme-text-primary prose-code:text-rose-400">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
      </article>
    </div>
  );
}

const DataflowVulnScanTaskDetailPageInner: React.FC<{ projectId: string; taskId: string; onBack: () => void; onTaskNameReady?: (name: string) => void }> = ({ projectId, taskId, onBack, onTaskNameReady }) => {
  const appApi = api.domains.execution.appDataflowVulnScan;
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
  const [vulnGraph, setVulnGraph] = useState<any | null>(null);
  const [vulnGraphLoading, setVulnGraphLoading] = useState(false);
  const [resultLoading, setResultLoading] = useState(false);
  const [resultView, setResultView] = useState<'final' | 'report' | 'dataflow' | 'json'>('final');
  const [selectedDataflowFile, setSelectedDataflowFile] = useState<string>('');
  const [selectedTraceRunId, setSelectedTraceRunId] = useState<string | null>(null);
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
      const d = await appApi.getTask(taskId);
      setDetail(d);
      onTaskNameReady?.(d?.task_name || taskId);
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

  const loadVulnGraph = async () => {
    if (!taskId || vulnGraphLoading) return;
    setVulnGraphLoading(true);
    try {
      const data = await appApi.getVulnGraph(taskId);
      setVulnGraph(data);
      setSelectedTraceRunId((current) => current || data.trace_tree?.run_id || null);
    } catch (err: any) {
      notify(`加载漏洞图谱失败: ${err?.message || err}`, 'error');
    } finally {
      setVulnGraphLoading(false);
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
      message: '将删除当前数据流漏洞挖掘任务的全部事件时间线记录。该操作不影响任务状态、结果和产物文件，删除后不可恢复，是否继续？',
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

  // ── Data loading effects ──────────────────────────────────────────────────
  useEffect(() => { void loadDetail(); }, [taskId]);
  useEffect(() => {
    const timer = setInterval(() => setClockNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  
  // Load tab-specific data with proper dependency guards
  const timelineLoaded = useRef(false);
  const resultLoaded = useRef(false);
  const vulnGraphLoaded = useRef(false);
  const sessionsLoaded = useRef(false);
  useEffect(() => {
    timelineLoaded.current = false;
    resultLoaded.current = false;
    vulnGraphLoaded.current = false;
    sessionsLoaded.current = false;
  }, [taskId]);
  
  useEffect(() => {
    if (activeTab === 'timeline' && !timelineLoaded.current && !timelineLoading) {
      timelineLoaded.current = true;
      void loadTimeline();
    }
    if (activeTab === 'result' && !resultLoaded.current && !resultLoading) {
      resultLoaded.current = true;
      void loadResult();
    }
    if ((activeTab === 'vuln-graph' || activeTab === 'evaluation' || activeTab === 'overview') && !vulnGraphLoaded.current && !vulnGraphLoading) {
      vulnGraphLoaded.current = true;
      void loadVulnGraph();
    }
    if ((activeTab === 'overview' || activeTab === 'session' || activeTab === 'relationship') && !sessionsLoaded.current && !sessionsLoading) {
      sessionsLoaded.current = true;
      void loadSessions();
    }
  }, [activeTab]);
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
  const traceTreeRoot = vulnGraph?.trace_tree || null;
  const vulnStats = useMemo(() => computeVulnGraphStats(traceTreeRoot), [traceTreeRoot]);
  const vulnSummary = vulnGraph?.summary || {};
  const [expandedFindingIds, setExpandedFindingIds] = useState<Set<string>>(new Set());
  const traceTreeNodes = useMemo(() => flattenTraceTree(traceTreeRoot), [traceTreeRoot]);
  const selectedTraceNode = useMemo(
    () => traceTreeNodes.find((node) => node.run_id === selectedTraceRunId) || traceTreeNodes[0] || null,
    [selectedTraceRunId, traceTreeNodes],
  );
  const resultContent = resultView === 'final'
    ? result?.result_markdown || ''
    : resultView === 'report'
      ? result?.run_report_markdown || ''
      : resultView === 'dataflow'
        ? selectedDataflow?.markdown || ''
        : safeJsonStringify(result?.result_json || {});
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
      title: '删除数据流漏洞挖掘任务',
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
 <button onClick={handleBack} className="mt-1 rounded-2xl border border-theme-border bg-theme-surface p-3 text-theme-text-secondary hover:bg-theme-elevated"><ArrowLeft size={18} /></button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate text-2xl font-bold tracking-tight text-theme-text-primary">{detail?.task_name || '数据流漏洞挖掘任务详情'}</h1>
              {detail ? <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_COLOR[detail.status] || 'bg-theme-elevated text-theme-text-secondary'}`}>{STATUS_LABEL[detail.status] || detail.status}</span> : null}
              {hasReturnContext ? <span className="rounded-full border border-cyan-500/20 bg-cyan-500/15 px-3 py-1 text-xs font-bold text-cyan-400">来自二进制安全总任务</span> : null}
            </div>
            <p className="mt-2 text-sm text-theme-text-muted">查看数据流追踪、智能体会话、结果产物和树状跟踪过程。</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void loadDetail()} className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-4 py-2 text-sm font-semibold text-theme-text-secondary hover:bg-theme-elevated"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />刷新</button>
          {detail && ['pending', 'running'].includes(detail.status) ? <button onClick={() => void cancelTask()} className="inline-flex items-center gap-2 rounded-xl border border-rose-500/20 bg-theme-surface px-4 py-2 text-sm font-semibold text-rose-400 hover:bg-rose-500/15"><XCircle size={15} />取消</button> : null}
          {detail && !['pending', 'running'].includes(detail.status) ? <button onClick={() => void restartTask()} className="inline-flex items-center gap-2 rounded-xl border border-violet-500/20 bg-theme-surface px-4 py-2 text-sm font-semibold text-violet-400 hover:bg-violet-500/15"><RotateCcw size={15} />重试</button> : null}
          {detail ? <DownstreamTaskCreator projectId={projectId} sourceKind="dataflow_analysis" task={detail} buttonClassName="inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50" /> : null}
          {detail?.started_at ? <button onClick={() => void resumeTask()} className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-theme-surface px-4 py-2 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/15"><CheckCircle2 size={15} />继续</button> : null}
          {detail ? <button onClick={() => void deleteTask()} className="inline-flex items-center gap-2 rounded-xl border border-rose-500/20 bg-theme-surface px-4 py-2 text-sm font-semibold text-rose-400 hover:bg-rose-500/15"><Trash2 size={15} />删除</button> : null}
        </div>
      </div>

 <div className="flex gap-2 rounded-2xl border border-theme-border bg-theme-surface p-1">
        {[
          ['overview', '总览'],
          ['timeline', '事件时间线'],
          ['task-config', '任务配置'],
          ['session', '智能体会话'],
          ['relationship', '智能体关系'],
          ['result', '结果'],
          ['vuln-graph', '漏洞图谱'],
          ['evaluation', '跟踪过程'],
 ].map(([id, label]) => <button key={id} onClick={() => setActiveTab(id as DetailTab)} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${activeTab === id ? 'bg-theme-surface text-white ' : 'text-theme-text-muted hover:bg-theme-elevated'}`}>{label}</button>)}
      </div>

      {loading && !detail ? <div className="py-20 text-center text-sm text-theme-text-muted"><Loader2 size={18} className="mx-auto mb-3 animate-spin" />加载任务详情中...</div> : detail ? (
        activeTab === 'overview' ? (
          <section className="space-y-4">
            <TaskOriginCard origin={detail} />
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
 <div className="rounded-2xl border border-theme-border bg-theme-surface p-5">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-theme-text-muted">任务信息</h2>
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
                  <InfoRow label="模型" value={<span className="font-mono">{detail.task_config_json?.model || 'auto'}</span>} />
                  <InfoRow label="Key ID" value={<span className="font-mono">{detail.agent_auth_json?.agent_task_key_id || '-'}</span>} />
                  <InfoRow label="Key 名称" value={detail.agent_auth_json?.agent_task_key_name || '-'} />
                  <InfoRow label="Key 前缀" value={<span className="font-mono">{detail.agent_auth_json?.agent_task_key_prefix || '-'}</span>} />
                  <InfoRow label="Key 来源" value={detail.agent_auth_json?.agent_task_key_source || '-'} />
                </div>
              </div>
 <div className="rounded-2xl border border-theme-border bg-theme-surface p-5">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-theme-text-muted">分析进度</h2>
                <div className="mt-4 space-y-4">
                  {(() => {
                    const sRuns = Number(vulnSummary.runs || 0);
                    const sFollowups = Number(vulnSummary.followups || 0);
                    const sExecuted = Number(vulnSummary.executed_followups || 0);
                    const sFindings = Number(vulnSummary.findings || 0);
                    // analyzed = runs (each run = one function fully analyzed)
                    // pending = followups not yet executed nor skipped
                    const analyzed = sRuns || vulnStats.analyzedNodes;
                    const pendingFollowups = Math.max(0, sFollowups - sExecuted - (sFollowups > 0 ? Math.max(0, sFollowups - sExecuted - (vulnStats.skippedNodes || 0)) : 0));
                    const skippedFollowups = sFollowups > 0 ? Math.max(0, sFollowups - sExecuted) : (vulnStats.skippedNodes || 0);
                    const total = sRuns + sFollowups || vulnStats.totalNodes;
                    const pending = (sFollowups > 0 ? Math.max(0, sFollowups - sExecuted - skippedFollowups) : 0) || vulnStats.pendingNodes;
                    const pct = (analyzed + pending) > 0 ? Math.round((analyzed / (analyzed + pending)) * 100) : detail?.status === 'running' ? 0 : detail?.status === 'passed' ? 100 : 0;
                    const isRunning = detail?.status === 'running';
                    return (
                      <>
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-theme-text-secondary">函数节点分析进度</span>
                            <span className="text-xs font-bold text-theme-text-primary">{pct}%</span>
                          </div>
                          <div className="h-3 w-full overflow-hidden rounded-full bg-theme-elevated">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ${isRunning ? 'animate-pulse' : ''}`}
                              style={{
                                width: `${pct}%`,
                                background: pct === 100
                                  ? 'linear-gradient(90deg, #45c06f, #34d399)'
                                  : isRunning
                                    ? 'linear-gradient(90deg, #4f8cff, #7590ff)'
                                    : 'linear-gradient(90deg, #4f73ff, #7590ff)',
                              }}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/8 px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <CheckCircle2 size={13} className="text-emerald-400" />
                              <span className="text-[11px] font-semibold text-emerald-400">已分析</span>
                            </div>
                            <p className="mt-1 text-lg font-bold text-emerald-400">{analyzed}</p>
                          </div>
                          <div className="rounded-xl border border-amber-500/15 bg-amber-500/8 px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <Loader2 size={13} className={`text-amber-400 ${isRunning ? 'animate-spin' : ''}`} />
                              <span className="text-[11px] font-semibold text-amber-400">待分析</span>
                            </div>
                            <p className="mt-1 text-lg font-bold text-amber-400">{pending}</p>
                          </div>
                          <div className="rounded-xl border border-violet-500/15 bg-violet-500/8 px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <TrendingUp size={13} className="text-violet-400" />
                              <span className="text-[11px] font-semibold text-violet-400">分析深度</span>
                            </div>
                            <p className="mt-1 text-lg font-bold text-violet-400">{vulnStats.maxDepth > 0 ? `Lv.${vulnStats.maxDepth}` : '-'}</p>
                          </div>
                          <div className="rounded-xl border border-rose-500/15 bg-rose-500/8 px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <Bug size={13} className="text-rose-400" />
                              <span className="text-[11px] font-semibold text-rose-400">漏洞上报</span>
                            </div>
                            <p className="mt-1 text-lg font-bold text-rose-400">{vulnStats.vulnCount || sFindings || result?.summary?.total_findings || 0}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 text-[11px] text-theme-text-muted">
                          <span className="rounded-full border border-theme-border bg-theme-elevated px-2.5 py-1">
                            总节点: <span className="font-bold text-theme-text-secondary">{total || vulnStats.totalNodes || '-'}</span>
                          </span>
                          <span className="rounded-full border border-theme-border bg-theme-elevated px-2.5 py-1">
                            跳过: <span className="font-bold text-theme-text-secondary">{skippedFollowups || vulnStats.skippedNodes || 0}</span>
                          </span>
                          <span className="rounded-full border border-theme-border bg-theme-elevated px-2.5 py-1">
                            环路: <span className="font-bold text-theme-text-secondary">{vulnStats.cycleNodes || 0}</span>
                          </span>
                          <span className="rounded-full border border-theme-border bg-theme-elevated px-2.5 py-1">
                            污点边: <span className="font-bold text-theme-text-secondary">{vulnSummary.edges || 0}</span>
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
 <div className="rounded-2xl border border-theme-border bg-theme-surface p-5">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-theme-text-muted">数据流调用树</h2>
                <div className="mt-4 max-h-[420px] overflow-auto rounded-2xl border border-theme-border bg-theme-surface p-4">{dfaTree ? <TreeNodeView node={dfaTree} /> : <div className="py-10 text-center text-sm text-theme-text-muted">暂无调用树事件</div>}</div>
              </div>
 <div className="rounded-2xl border border-theme-border bg-theme-surface p-5">
                <button onClick={() => setLogsExpanded((value) => !value)} className="flex w-full items-center justify-between gap-3 text-left"><div><h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-theme-text-muted">分析日志</h2><p className="mt-1 text-xs text-theme-text-muted">{logLines.length} 条事件</p></div>{logsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
                {logsExpanded ? <div ref={logRef} className="mt-4 max-h-[420px] overflow-auto rounded-xl border border-theme-border bg-theme-surface px-3 py-3 font-mono text-xs leading-relaxed text-theme-text-secondary">{logLines.length ? logLines.map((line, index) => <div key={index} className={line.includes('✗') ? 'text-red-500' : line.includes('▶') ? 'text-violet-400' : line.includes('✓') ? 'text-emerald-400' : 'text-theme-text-secondary'}>{line}</div>) : <div className="text-theme-text-muted">暂无阶段事件</div>}</div> : null}
              </div>
            </section>
 <section className="rounded-2xl border border-theme-border bg-theme-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-theme-text-muted">当前运行智能体</h2>
                  <p className="mt-1 text-xs text-theme-text-muted">展示当前任务仍处于活跃状态的智能体会话与角色，点击可查看实时会话。</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-theme-border bg-theme-bg-app px-3 py-1 text-[11px] font-bold text-theme-text-secondary">{activeSessions.length} 个活跃会话</span>
                  <span className="rounded-full border border-theme-border bg-theme-bg-app px-3 py-1 text-[11px] font-bold text-theme-text-secondary">
                    展示 {activeAgentRangeStart}-{activeAgentRangeEnd} / {filteredActiveSessions.length}
                  </span>
                </div>
              </div>
              {sessionsLoading && sessions.length === 0 ? (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-4 py-4 text-sm text-theme-text-muted"><Loader2 size={15} className="animate-spin" />加载智能体状态中...</div>
              ) : activeSessions.length > 0 ? (
                <>
                  <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2">
                      <Search size={14} className="text-theme-text-muted" />
                      <input
                        value={activeAgentKeyword}
                        onChange={(event) => setActiveAgentKeyword(event.target.value)}
                        placeholder="按名称、路径、分组或角色筛选"
                        className="w-full bg-transparent text-sm font-medium text-theme-text-secondary outline-none placeholder:text-theme-text-muted"
                      />
                    </div>
                    <label className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-xs font-semibold text-theme-text-muted">
                      每页
                      <select
                        value={activeAgentPageSize}
                        onChange={(event) => setActiveAgentPageSize(Math.max(1, Number(event.target.value) || 10))}
                        className="ml-2 rounded-lg border border-theme-border bg-theme-bg-app px-2 py-1 text-xs font-bold text-theme-text-secondary"
                      >
                        {[10, 20, 50].map((size) => <option key={size} value={size}>{size}</option>)}
                      </select>
                    </label>
                  </div>
                  {filteredActiveSessions.length > 0 ? (
                    <div className="mt-4 overflow-hidden rounded-2xl border border-theme-border">
                      <div className="divide-y divide-theme-border bg-theme-bg-app">
                        {pagedActiveSessions.map((session) => (
                          <button key={session.relative_path} type="button" onClick={() => openActiveAgentSession(session.relative_path)} className="w-full px-4 py-4 text-left transition hover:bg-theme-elevated">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-semibold text-theme-text-primary">{session.display_name}</div>
                                <div className="mt-1 truncate font-mono text-[11px] text-theme-text-muted">{session.relative_path}</div>
                                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-theme-text-muted">
                                  <span>分组 {session.stage_group || '-'}</span>
                                  <span>事件 {session.event_count}</span>
                                  <span>更新时间 {formatSessionMtime(session.mtime)}</span>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${sessionRoleTone(session.role_name)}`}>
                                  {sessionRoleLabel(session.role_name)}
                                </span>
                                <span className="inline-flex whitespace-nowrap rounded-full border border-emerald-500/20 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400">活跃</span>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-dashed border-theme-border bg-theme-surface px-4 py-8 text-center text-sm text-theme-text-muted">
                      当前筛选条件下没有匹配的活跃智能体会话。
                    </div>
                  )}
                  {activeAgentTotalPages > 1 && filteredActiveSessions.length > 0 ? (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-theme-text-muted">
                      <span>第 {normalizedActiveAgentPage} / {activeAgentTotalPages} 页</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveAgentPage((current) => Math.max(1, current - 1))}
                          disabled={normalizedActiveAgentPage <= 1}
                          className="rounded-lg border border-theme-border px-3 py-1.5 text-theme-text-secondary disabled:opacity-40"
                        >
                          上一页
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveAgentPage((current) => Math.min(activeAgentTotalPages, current + 1))}
                          disabled={normalizedActiveAgentPage >= activeAgentTotalPages}
                          className="rounded-lg border border-theme-border px-3 py-1.5 text-theme-text-secondary disabled:opacity-40"
                        >
                          下一页
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-theme-border bg-theme-surface px-4 py-8 text-center text-sm text-theme-text-muted">
                  {detail.status === 'pending' ? '任务尚未启动，当前没有活跃智能体。' : ['running', 'pending'].includes(detail.status) ? '当前没有检测到活跃智能体会话。' : '任务已结束，当前没有活跃智能体。'}
                </div>
              )}
            </section>
            {detail.abnormal_reason ? <AbnormalReasonCard reason={detail.abnormal_reason} history={detail.abnormal_reason_history} /> : null}
 {detail.error ? <section className="rounded-2xl border border-red-500/20 bg-red-500/15 p-5"><h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-red-400">错误信息</h2><pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-red-500/20 bg-theme-surface px-3 py-3 text-xs text-red-400">{detail.error}</pre></section> : null}
 {detail.prompt_content ? <section className="rounded-2xl border border-theme-border bg-theme-surface overflow-hidden"><details><summary className="cursor-pointer select-none px-6 py-4 text-sm font-semibold text-theme-text-secondary hover:bg-theme-elevated">分析 Prompt</summary><pre className="px-6 py-4 text-xs text-theme-text-secondary whitespace-pre-wrap break-all bg-theme-surface max-h-72 overflow-auto border-t border-theme-border">{detail.prompt_content}</pre></details></section> : null}
          </section>
        ) : activeTab === 'timeline' ? (
          <section className="space-y-4">
 <section className="rounded-2xl border border-theme-border bg-theme-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-theme-text-muted">事件时间线</h2>
                  <p className="mt-1 text-xs text-theme-text-muted">记录任务关键时间点和运行轨迹，用于分析调度、租约、控制权和执行阶段问题。</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-xs font-semibold text-theme-text-muted">
                    展示 {timelineRangeStart}-{timelineRangeEnd} / {filteredTimeline.length}
                  </div>
                  <label className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-xs font-semibold text-theme-text-muted">
                    每页
                    <select value={timelinePageSize} onChange={(event) => setTimelinePageSize(Math.min(2000, Math.max(50, Number(event.target.value) || 200)))} className="ml-2 rounded-lg border border-theme-border bg-theme-bg-app px-2 py-1 text-xs font-bold text-theme-text-secondary">
                      {[50, 100, 200, 500].map((size) => <option key={size} value={size}>{size}</option>)}
                    </select>
                  </label>
                  <button onClick={() => void loadTimeline()} disabled={timelineLoading} className="inline-flex items-center gap-2 rounded-xl border border-theme-border px-3 py-2 text-xs font-semibold text-theme-text-secondary hover:bg-theme-elevated disabled:opacity-60">
                    {timelineLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    刷新
                  </button>
                  <button onClick={() => void clearTimeline()} disabled={timelineClearing || timeline.length === 0} className="inline-flex items-center gap-2 rounded-xl border border-rose-500/20 px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/15 disabled:opacity-60">
                    {timelineClearing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    清空
                  </button>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <select value={timelineEventTypeFilter} onChange={(event) => setTimelineEventTypeFilter(event.target.value)} className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-semibold text-theme-text-secondary">
                  <option value="__all__">全部事件</option>
                  {timelineEventTypeOptions.map((value) => <option key={value} value={value}>{formatTimelineEventTypeLabel(value)}</option>)}
                </select>
                <select value={timelineLevelFilter} onChange={(event) => setTimelineLevelFilter(event.target.value)} className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-semibold text-theme-text-secondary">
                  <option value="__all__">全部级别</option>
                  {timelineLevelOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
                <select value={timelineStatusFilter} onChange={(event) => setTimelineStatusFilter(event.target.value)} className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-semibold text-theme-text-secondary">
                  <option value="__all__">全部状态</option>
                  {timelineStatusOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
            </section>
 <section className="rounded-2xl border border-theme-border bg-theme-surface p-5">
              {timelineLoading && timeline.length === 0 ? (
                <div className="rounded-xl border border-theme-border bg-theme-surface px-4 py-10 text-center text-sm text-theme-text-muted">加载事件时间线中...</div>
              ) : filteredTimeline.length === 0 ? (
                <div className="rounded-xl border border-dashed border-theme-border bg-theme-surface px-4 py-10 text-center text-sm text-theme-text-muted">当前暂无数据库事件时间线</div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-theme-border">
                  <div className="overflow-x-auto">
                    <table className="min-w-[1180px] w-full divide-y divide-theme-border text-left text-xs">
                      <thead className="bg-theme-bg-app text-[11px] font-semibold uppercase tracking-[0.12em] text-theme-text-muted">
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
                      <tbody className="divide-y divide-theme-border bg-theme-bg-app">
                        {pagedTimelineItems.map((event, index) => {
                          const expanded = expandedTimelineEventId === event.id;
                          const payload = event.payload || {};
                          const sourceLabel = [event.source, event.worker_id || event.execution_owner_id, event.execution_epoch != null ?`Epoch ${event.execution_epoch}` : '', event.dispatch_status].filter(Boolean).join(' · ') || '-';
                          const recorderLabel = timelineRecorderLabel(event);
                          const originLabel = timelineOriginLabel(event);
                          const nodeLabel = event.recorder_node_name ? `节点: ${event.recorder_node_name}` : '节点: -';
                          const hasPayload = Object.keys(payload).length > 0;
                          const statusText = event.status || event.dispatch_status || '-';
                          const auditEvent = isAgentKillTimelineEvent(event.event_type);
                          const auditSummary = auditEvent ? timelineAuditSummary(payload) : '';
                          return (
                            <React.Fragment key={event.id}>
                              <tr className="align-top">
                                <td className="px-3 py-2 font-mono text-theme-text-muted">{timelineRangeStart + index}</td>
                                <td className="px-3 py-2 text-theme-text-secondary">{event.created_at ? new Date(event.created_at).toLocaleString('zh-CN') : '-'}</td>
                                <td className="px-3 py-2"><span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${timelineEventCategoryTone(event.event_type)}`}>{timelineEventCategoryLabel(event.event_type)}</span></td>
                                <td className="px-3 py-2"><span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${timelineEventTypeTone(event.event_type)}`}>{formatTimelineEventTypeLabel(event.event_type)}</span></td>
                                <td className="px-3 py-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_COLOR[event.status || 'pending'] || 'bg-theme-elevated text-theme-text-secondary'}`}>{STATUS_LABEL[event.status || 'pending'] || statusText}</span></td>
                                <td className="px-3 py-2"><span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${timelineLevelTone(event.level)}`}>{event.level || 'info'}</span></td>
                                <td className="max-w-[360px] px-3 py-2">
                                  <div className="truncate font-semibold text-theme-text-primary" title={timelineMessageSummary(event)}>{timelineMessageSummary(event)}</div>
                                  {auditSummary ? <div className="mt-1 truncate text-[11px] font-medium text-rose-400" title={auditSummary}>{auditSummary}</div> : null}
                                </td>
                                <td className="px-3 py-2 text-[11px] text-theme-text-muted">
                                  <div className="truncate font-mono" title={recorderLabel}>{recorderLabel}</div>
                                  <div className="truncate font-mono" title={nodeLabel}>{nodeLabel}</div>
                                  {originLabel ? <div className="truncate font-mono" title={originLabel}>{originLabel}</div> : null}
                                  <div className="truncate font-mono opacity-70" title={sourceLabel}>{sourceLabel}</div>
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <div className="flex items-center justify-end gap-3">
                                    <button type="button" onClick={() => setExpandedTimelineEventId(expanded ? '' : event.id)} disabled={!hasPayload} className="text-[11px] font-semibold text-theme-text-muted transition hover:text-theme-text-primary disabled:opacity-30">{expanded ? '收起' : '查看'}</button>
                                    <button onClick={() => void deleteTimelineEvent(event.id)} disabled={deletingEventId === event.id || timelineClearing} className="text-[11px] font-semibold text-rose-400 transition hover:text-rose-400 disabled:opacity-40">{deletingEventId === event.id ? '删除中' : '删除'}</button>
                                  </div>
                                </td>
                              </tr>
                              {expanded ? (
                                <tr className="bg-slate-50/60">
                                  <td colSpan={9} className="px-3 py-3">
                                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                      {timelinePayloadRows(payload).slice(0, 12).map((row) => (
                                        <div key={row.key} className="min-w-0 rounded-lg border border-theme-border bg-theme-bg-app px-3 py-2 text-xs">
                                          <div className="font-bold capitalize text-theme-text-muted">{row.label}</div>
                                          <div className="mt-1 break-all font-mono text-theme-text-secondary">{row.value}</div>
                                        </div>
                                      ))}
                                    </div>
                                    <pre className="mt-3 overflow-auto rounded-xl border border-theme-border bg-theme-surface px-3 py-3 text-xs leading-relaxed text-theme-text-primary">{JSON.stringify(payload, null, 2)}</pre>
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
 <aside className="rounded-2xl border border-theme-border bg-theme-surface p-4"><div className="flex items-center justify-between gap-3"><div><div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">会话列表</div><div className="mt-1 text-xs text-theme-text-muted">{sessions.length} 个会话文件</div></div><button onClick={() => void loadSessions()} className="rounded-xl border border-theme-border p-2 text-theme-text-muted hover:bg-theme-elevated"><RefreshCw size={14} className={sessionsLoading ? 'animate-spin' : ''} /></button></div>{sessionsError ? <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/15 px-4 py-4 text-sm text-rose-400">{sessionsError}</div> : null}{sessions.length === 0 ? <div className="mt-4 rounded-2xl border border-dashed border-theme-border bg-theme-surface px-4 py-10 text-center text-sm text-theme-text-muted">{sessionsLoading ? '加载会话中...' : '当前任务暂无智能体会话文件'}</div> : <div className="mt-4 max-h-[calc(100vh-20rem)] space-y-4 overflow-auto pr-1">{groupedSessions.map(([group, items]) => <div key={group}><div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">{group === 'root' ? '根会话' : group}</div><div className="space-y-2">{items.map((session) => { const selected = session.relative_path === selectedSessionPath; return <button key={session.relative_path} onClick={() => setSelectedSessionPath(session.relative_path)} className={`w-full rounded-2xl border px-4 py-3 text-left transition ${selected ? 'border-theme-border bg-theme-surface text-white' : 'border-theme-border bg-theme-surface text-theme-text-secondary hover:bg-theme-surface'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-semibold">{session.display_name}</div><div className={`mt-1 truncate text-[11px] ${selected ? 'text-theme-text-faint' : 'text-theme-text-muted'}`}>{session.relative_path}</div></div><span className={`inline-flex shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${session.is_active ? 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400' : 'border-theme-border bg-theme-surface text-theme-text-muted'}`}>{session.is_active ? '活跃' : '历史'}</span></div><div className={`mt-3 flex flex-wrap gap-3 text-[11px] ${selected ? 'text-theme-text-faint' : 'text-theme-text-muted'}`}><span>事件 {session.event_count}</span><span>{new Date(session.mtime * 1000).toLocaleString('zh-CN')}</span></div></button>; })}</div></div>)}</div>}</aside>
            <div className="space-y-4"><AgentSessionWarningPanel warnings={sessionWarnings} /><AgentSessionViewer sessionMeta={selectedSession as any} sessionHeader={sessionSnapshot?.session_meta} events={sessionEvents as any} loading={sessionLoading} live={sessionLive} error={sessionError} /></div>
          </section>
        ) : activeTab === 'relationship' ? (
          <section className="space-y-4"><WarningListPanel title="索引生成提示" items={sessionIndex?.warnings?.slice(0, 5) || []} /><AgentSessionWarningPanel warnings={sessionWarnings} /><SessionRelationshipGraph index={sessionIndex as any} selectedPath={selectedSessionPath} onSelect={setSelectedSessionPath} sessionPreview={{ path: selectedSessionPath, sessionMeta: selectedSession as any, sessionHeader: sessionSnapshot?.session_meta, events: sessionEvents as any, loading: sessionLoading, live: sessionLive, error: sessionError }} /></section>
        ) : activeTab === 'result' ? (
          <section className="space-y-4">
 <div className="grid gap-4 xl:grid-cols-5"><MetricCard label="追踪函数" value={result?.summary.function_count ?? 0} icon={<ScrollText size={18} />} /><MetricCard label="轮次数" value={result?.summary.round_count ?? 0} icon={<BarChart3 size={18} />} /><MetricCard label="通过轮次" value={result?.summary.passed_round_count ?? 0} icon={<CheckCircle2 size={18} />} /><MetricCard label="总 Token" value={formatNumber(result?.summary.total_tokens)} icon={<ScrollText size={18} />} /><div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4"><div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">结果目录</div><div className="mt-2 text-sm font-semibold text-theme-text-secondary line-clamp-2">{result?.output_root || '-'}</div><div className="mt-3 flex flex-wrap gap-2"><button disabled={!resultRootFsPath} onClick={() => resultRootFsPath && openInFileExplorer(resultRootFsPath)} className="inline-flex items-center gap-1 rounded-lg border border-violet-500/20 px-2 py-1 text-[11px] font-semibold text-violet-400 hover:bg-violet-500/15 disabled:opacity-50"><FolderOpen size={11} />打开目录</button><button disabled={!result?.output_root} onClick={() => result?.output_root && navigator.clipboard.writeText(result.output_root)} className="inline-flex items-center gap-1 rounded-lg border border-theme-border px-2 py-1 text-[11px] font-semibold text-theme-text-muted hover:bg-theme-elevated disabled:opacity-50"><ClipboardCopy size={10} />复制路径</button></div></div></div>
 {resultLoading ? <section className="rounded-2xl border border-theme-border bg-theme-surface p-10 text-center text-sm text-theme-text-muted">加载结果中...</section> : !result || !result.available ? <section className="rounded-2xl border border-dashed border-theme-border bg-theme-surface p-10 text-center text-sm text-theme-text-muted">当前任务尚未生成可展示结果。</section> : <section className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_320px]"><aside className="rounded-2xl border border-theme-border bg-theme-surface p-4"><div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">结果导航</div><div className="mt-3 space-y-2">{[['final', '最终报告'], ['report', '运行报告'], ['dataflow', '函数级结果'], ['json', '结构化 JSON']].map(([id, label]) => <button key={id} onClick={() => setResultView(id as any)} className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${resultView === id ? 'border-theme-border bg-theme-surface text-white' : 'border-theme-border bg-theme-surface text-theme-text-secondary hover:bg-theme-surface'}`}>{label}</button>)}</div>{resultView === 'dataflow' ? <div className="mt-4 max-h-80 space-y-2 overflow-auto">{result.dataflow_files.map((file) => <button key={file.relative_path} onClick={() => setSelectedDataflowFile(file.relative_path)} className={`w-full rounded-xl border px-3 py-2 text-left text-xs ${selectedDataflow?.relative_path === file.relative_path ? 'border-cyan-300 bg-cyan-500/15 text-cyan-400' : 'border-theme-border bg-theme-surface text-theme-text-secondary'}`}>{file.name}</button>)}</div> : null}</aside><main className="rounded-2xl border border-theme-border bg-theme-surface p-5"><h2 className="border-b border-theme-border pb-4 text-2xl font-semibold tracking-tight text-theme-text-primary">{resultView === 'final' ? '最终报告' : resultView === 'report' ? '运行报告' : resultView === 'dataflow' ? selectedDataflow?.name || '函数级结果' : '结构化 JSON'}</h2><div className="mt-5 max-h-[calc(100vh-24rem)] overflow-auto pr-2">{resultContent ? resultView === 'json' ? <pre className="rounded-2xl border border-theme-border bg-theme-surface p-4 text-xs text-theme-text-primary">{resultContent}</pre> : <MarkdownContent content={resultContent} /> : <div className="rounded-2xl border border-dashed border-theme-border bg-theme-surface px-6 py-10 text-center text-sm text-theme-text-muted">当前结果缺少可展示内容</div>}</div></main><aside className="rounded-2xl border border-theme-border bg-theme-surface p-4"><div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">关键文件</div><div className="mt-3 space-y-2">{[...(result.output_files || []), ...(result.dataflow_files || [])].map((file) => <div key={file.relative_path} className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2"><div className="font-mono text-[11px] text-theme-text-secondary break-all">{file.relative_path}</div><div className="mt-1 text-[10px] text-theme-text-muted">{formatNumber(file.size)} bytes</div></div>)}</div></aside></section>}
          </section>
        ) : activeTab === 'vuln-graph' ? (
          <section className="space-y-4">
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard label="污点节点" value={formatNumber(vulnGraph?.summary?.nodes)} icon={<ScrollText size={18} />} />
              <MetricCard label="传播边" value={formatNumber(vulnGraph?.summary?.edges)} icon={<BarChart3 size={18} />} />
              <MetricCard label="跟入点" value={formatNumber(vulnGraph?.summary?.followups)} icon={<ChevronDown size={18} />} />
              <MetricCard label="漏洞数" value={formatNumber(vulnGraph?.summary?.findings)} icon={<XCircle size={18} />} />
 <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4"><div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">图数据库</div><div className="mt-2 break-all text-xs font-semibold text-theme-text-secondary">{vulnGraph?.run_root || '-'}</div><button onClick={() => void loadVulnGraph()} className="mt-3 inline-flex items-center gap-1 rounded-lg border border-theme-border px-2 py-1 text-[11px] font-semibold text-theme-text-muted hover:bg-theme-elevated"><RefreshCw size={10} className={vulnGraphLoading ? 'animate-spin' : ''} />刷新</button></div>
            </section>
 {vulnGraphLoading ? <section className="rounded-2xl border border-theme-border bg-theme-surface p-10 text-center text-sm text-theme-text-muted">加载漏洞图谱中...</section> : !vulnGraph?.available ? <section className="rounded-2xl border border-dashed border-theme-border bg-theme-surface p-10 text-center text-sm text-theme-text-muted">当前任务尚未生成漏洞图谱。</section> : (() => {
                    const findings = (vulnGraph?.graph?.vulnerability_findings || []) as any[];
                    return findings.length === 0 ? (
                      <section className="rounded-2xl border border-dashed border-theme-border bg-theme-surface p-10 text-center">
                        <Bug size={28} className="mx-auto text-theme-text-muted" />
                        <p className="mt-4 text-sm font-semibold text-theme-text-primary">暂未发现漏洞</p>
                        <p className="mt-1 text-xs text-theme-text-muted">污点追踪完成后，漏洞挖掘阶段会自动扫描并生成报告。</p>
                      </section>
                    ) : (
                      <section className="rounded-2xl border border-theme-border bg-theme-surface">
                        <div className="border-b border-theme-border px-5 py-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-theme-text-muted">漏洞列表</h2>
                              <p className="mt-1 text-xs text-theme-text-muted">共 {findings.length} 个漏洞发现</p>
                            </div>
                            <button onClick={() => void loadVulnGraph()} className="inline-flex items-center gap-1 rounded-xl border border-theme-border px-3 py-1.5 text-xs font-semibold text-theme-text-secondary hover:bg-theme-elevated"><RefreshCw size={12} className={vulnGraphLoading ? 'animate-spin' : ''} />刷新</button>
                          </div>
                        </div>
                        <div className="divide-y divide-theme-border">
                          {findings.map((finding: any, idx: number) => {
                            const severityColors: Record<string, string> = {
                              CRITICAL: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
                              HIGH: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
                              MEDIUM: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
                              LOW: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
                              INFO: 'border-slate-500/30 bg-slate-500/10 text-slate-400',
                            };
                            const sev = String(finding.severity || 'unknown').toUpperCase();
                            const sevTone = severityColors[sev] || 'border-theme-border bg-theme-elevated text-theme-text-secondary';
                            const sevLabel: Record<string, string> = { CRITICAL: '严重', HIGH: '高危', MEDIUM: '中危', LOW: '低危', INFO: '信息' };
                            const fid = finding.finding_id || String(idx);
                            const expanded = expandedFindingIds.has(fid);
                            const toggle = () => setExpandedFindingIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(fid)) next.delete(fid); else next.add(fid);
                              return next;
                            });
                            return (
                              <div key={fid} className="px-5 py-4 hover:bg-theme-elevated/50 transition-colors">
                                <div
                                  role="button"
                                  tabIndex={0}
                                  onClick={toggle}
                                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
                                  className="flex w-full cursor-pointer items-start gap-4 text-left"
                                >
                                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-rose-500/20 bg-rose-500/10">
                                    <Bug size={16} className="text-rose-400" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-sm font-bold text-theme-text-primary">{finding.title || finding.finding_id || '-'}</span>
                                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${sevTone}`}>{sevLabel[sev] || sev}</span>
                                      {finding.confidence != null ? <span className="rounded-full border border-theme-border bg-theme-elevated px-2 py-0.5 text-[10px] font-bold text-theme-text-muted">置信度 {typeof finding.confidence === 'number' ? `${Math.round(finding.confidence * 100)}%` : finding.confidence}</span> : null}
                                      {expanded ? <ChevronUp size={14} className="ml-auto text-theme-text-muted shrink-0" /> : <ChevronDown size={14} className="ml-auto text-theme-text-muted shrink-0" />}
                                    </div>
                                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-theme-text-muted">
                                      <span className="font-mono">{finding.vuln_type || 'unknown'}</span>
                                      {finding.source_file ? <span>·</span> : null}
                                      <span className="font-mono">{finding.source_file || ''}{finding.function_name ? `::${finding.function_name}` : ''}{finding.line ? ` L${finding.line}` : ''}</span>
                                    </div>
                                    {!expanded && finding.summary ? <p className="mt-2 text-xs leading-5 text-theme-text-secondary line-clamp-2">{finding.summary}</p> : null}
                                  </div>
                                </div>
                                {expanded && (
                                  <div className="mt-4 ml-14 space-y-4 rounded-xl border border-theme-border bg-theme-elevated/50 p-4">
                                    {/* 概览 */}
                                    {finding.summary ? (
                                      <div>
                                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">概述</div>
                                        <p className="mt-2 text-sm leading-6 text-theme-text-secondary">{finding.summary}</p>
                                      </div>
                                    ) : null}
                                    {/* 入口点 */}
                                    {finding.entry_point ? (
                                      <div>
                                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">最初入口</div>
                                        <p className="mt-1 font-mono text-sm text-theme-text-primary">{typeof finding.entry_point === 'string' ? finding.entry_point : JSON.stringify(finding.entry_point)}</p>
                                      </div>
                                    ) : null}
                                    {/* 触发路径 */}
                                    {finding.trigger_path ? (
                                      <div>
                                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">触发路径</div>
                                        <p className="mt-1 font-mono text-xs text-theme-text-secondary">{typeof finding.trigger_path === 'string' ? finding.trigger_path : JSON.stringify(finding.trigger_path)}</p>
                                      </div>
                                    ) : null}
                                    {/* 可利用性 / 影响 */}
                                    {finding.exploitability || finding.impact ? (
                                      <div>
                                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">可利用性与影响</div>
                                        {finding.exploitability ? (
                                          <div className="mt-2 rounded-lg border border-amber-500/15 bg-amber-500/5 px-3 py-2 prose prose-slate max-w-none prose-sm text-xs text-theme-text-secondary">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{typeof finding.exploitability === 'string' ? finding.exploitability : JSON.stringify(finding.exploitability, null, 2)}</ReactMarkdown>
                                          </div>
                                        ) : null}
                                        {finding.impact ? (
                                          <div className="mt-2 rounded-lg border border-rose-500/15 bg-rose-500/5 px-3 py-2">
                                            <p className="text-xs text-theme-text-secondary">{typeof finding.impact === 'string' ? finding.impact : JSON.stringify(finding.impact)}</p>
                                          </div>
                                        ) : null}
                                      </div>
                                    ) : null}
                                    {/* 维度自检 */}
                                    {finding.dimensions ? (
                                      <div>
                                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">四维度自检</div>
                                        <div className="mt-2 rounded-lg border border-theme-border bg-theme-surface px-3 py-2 prose prose-slate max-w-none prose-sm text-xs text-theme-text-secondary">
                                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{typeof finding.dimensions === 'string' ? finding.dimensions : JSON.stringify(finding.dimensions, null, 2)}</ReactMarkdown>
                                        </div>
                                      </div>
                                    ) : null}
                                    {/* 输出目录 */}
                                    {finding.output_dir ? (
                                      <div>
                                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">报告目录</div>
                                        <p className="mt-1 break-all font-mono text-[10px] text-theme-text-muted">{finding.output_dir}</p>
                                      </div>
                                    ) : null}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })()}
          </section>
        ) : (
          <section className="space-y-4">
            {vulnGraphLoading ? (
 <section className="rounded-2xl border border-theme-border bg-theme-surface p-10 text-center text-sm text-theme-text-muted">加载跟踪过程图谱中...</section>
            ) : !vulnGraph?.available || !traceTreeRoot ? (
 <section className="rounded-2xl border border-dashed border-theme-border bg-theme-surface p-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-theme-elevated text-theme-text-muted"><BarChart3 size={20} /></div>
                <div className="mt-4 text-base font-bold text-theme-text-primary">当前任务尚未生成跟踪过程</div>
                <div className="mt-2 text-sm text-theme-text-muted">任务至少完成根函数分析后，才会生成函数调用树与污点跟踪过程。</div>
              </section>
            ) : (
              <>
                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard label="跟踪函数" value={formatNumber(vulnGraph?.summary?.runs)} icon={<ScrollText size={18} />} />
                  <MetricCard label="跟入节点" value={formatNumber(vulnGraph?.summary?.followups)} icon={<ChevronDown size={18} />} />
                  <MetricCard label="已执行跟入" value={formatNumber(vulnGraph?.summary?.executed_followups)} icon={<CheckCircle2 size={18} />} />
                  <MetricCard label="漏洞发现" value={formatNumber(vulnGraph?.summary?.findings)} icon={<BarChart3 size={18} />} />
                </section>
                <section className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)]">
 <section className="rounded-2xl border border-theme-border bg-theme-surface p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-theme-text-muted">函数调用树</h2>
                        <p className="mt-1 text-xs text-theme-text-muted">按调用深度展示整个污点跟踪过程，点击节点查看详情。</p>
                      </div>
                      <button onClick={() => void loadVulnGraph()} className="inline-flex items-center gap-2 rounded-xl border border-theme-border px-3 py-2 text-xs font-semibold text-theme-text-secondary hover:bg-theme-elevated">
                        <RefreshCw size={14} className={vulnGraphLoading ? 'animate-spin' : ''} />
                        刷新
                      </button>
                    </div>
                    <div className="mt-4 space-y-3">
                      <TraceTreeNodeCard node={traceTreeRoot} selectedRunId={selectedTraceNode?.run_id} onSelect={(node) => setSelectedTraceRunId(node.run_id || null)} />
                    </div>
                  </section>
 <section className="rounded-2xl border border-theme-border bg-theme-surface p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-theme-text-muted">节点详情</h2>
                        <p className="mt-1 text-xs text-theme-text-muted">展示当前函数的污点输入、传播摘要、终止原因和子调用状态。</p>
                      </div>
                      {selectedTraceNode ? <span className={`rounded-full border px-3 py-1 text-xs font-bold ${traceNodeTone(selectedTraceNode.followup_status || selectedTraceNode.status)}`}>{selectedTraceNode.followup_status || selectedTraceNode.status || '-'}</span> : null}
                    </div>
                    {!selectedTraceNode ? (
                      <div className="mt-6 rounded-2xl border border-dashed border-theme-border bg-theme-surface px-4 py-10 text-center text-sm text-theme-text-muted">请选择一个函数节点</div>
                    ) : (
                      <div className="mt-4 space-y-5">
                        <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
                          <div className="font-mono text-sm font-semibold text-theme-text-primary">{selectedTraceNode.function_name || '-'}</div>
                          <div className="mt-2 break-all text-xs text-theme-text-muted">{selectedTraceNode.source_file || '-'} {selectedTraceNode.line_hint || ''}</div>
                        </div>
                        <div className="space-y-3">
                          <InfoRow label="深度" value={selectedTraceNode.depth} />
                          <InfoRow label="漏洞数量" value={selectedTraceNode.findings_count} />
                          <InfoRow label="子节点数" value={selectedTraceNode.child_count} />
                          <InfoRow label="Run ID" value={<span className="break-all font-mono">{selectedTraceNode.run_id || '-'}</span>} />
                          <InfoRow label="跟入原因" value={selectedTraceNode.followup_reason || '-'} />
                        </div>
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-theme-text-muted">污点输入</div>
                          <div className="mt-3 space-y-2">
                            {selectedTraceNode.taint_inputs?.length ? selectedTraceNode.taint_inputs.map((item, index) => (
                              <div key={`${item.symbol}-${index}`} className="rounded-xl border border-theme-border bg-theme-surface px-3 py-3 text-xs">
                                <div className="font-mono font-bold text-theme-text-primary">{item.symbol}</div>
                                <div className="mt-1 text-theme-text-muted">{item.kind || 'param'} {item.line ?`· ${item.line}` : ''}</div>
                                {item.description ? <div className="mt-2 text-theme-text-secondary">{item.description}</div> : null}
                              </div>
                            )) : <div className="rounded-xl border border-dashed border-theme-border bg-theme-surface px-3 py-6 text-center text-xs text-theme-text-muted">未记录污点输入</div>}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-theme-text-muted">关键传播摘要</div>
                          <div className="mt-3 space-y-2">
                            {selectedTraceNode.taint_summary?.length ? selectedTraceNode.taint_summary.map((item, index) => (
                              <div key={`${item.from_symbol}-${item.to_symbol}-${index}`} className="rounded-xl border border-theme-border bg-theme-surface px-3 py-3 text-xs">
                                <div className="font-mono font-bold text-theme-text-primary">{item.from_symbol || '-'} → {item.to_symbol || '-'}</div>
                                <div className="mt-1 text-theme-text-muted">{item.operation || 'unknown'} {item.line ?`· ${item.line}` : ''}</div>
                                {item.evidence ? <div className="mt-2 text-theme-text-secondary">{item.evidence}</div> : null}
                                {item.termination_reason ? <div className="mt-2 text-amber-400">终止原因：{item.termination_reason}</div> : null}
                              </div>
                            )) : <div className="rounded-xl border border-dashed border-theme-border bg-theme-surface px-3 py-6 text-center text-xs text-theme-text-muted">当前节点暂无传播摘要</div>}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-theme-text-muted">终止原因</div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {selectedTraceNode.termination_reasons?.length ? selectedTraceNode.termination_reasons.map((item) => (
                              <span key={item} className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-400">{item}</span>
                            )) : <span className="text-xs text-theme-text-muted">无明确终止原因</span>}
                          </div>
                        </div>
                      </div>
                    )}
                  </section>
                </section>
              </>
            )}
          </section>
        )
      ) : !loading ? <div className="py-16 text-center text-sm text-theme-text-muted">未指定任务或任务不存在。</div> : null}

      {activeAgentSessionPath ? (
        <div className="fixed inset-0 z-[280] bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-theme-border bg-theme-surface shadow-panel">
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

export const DataflowVulnScanTaskDetailPage: React.FC<{ projectId: string; taskId: string; onBack: () => void }> = ({ projectId, taskId, onBack }) => {
  const [taskName, setTaskName] = useState<string>('');
  return (
    <DetailErrorBoundary taskName={taskName}>
      <DataflowVulnScanTaskDetailPageInner
        projectId={projectId}
        taskId={taskId}
        onBack={onBack}
        onTaskNameReady={setTaskName}
      />
    </DetailErrorBoundary>
  );
};
