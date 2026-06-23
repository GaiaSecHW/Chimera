/* @refresh reset */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownUp, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, FolderOpen, List, Loader2, PlayCircle, Plus, RefreshCw, RotateCcw, Trash2, X, XCircle } from 'lucide-react';

import { api } from '../../clients/api';
import { AppDfaClusterCapacity, AppDfaStageEvent, AppDfaTaskDetail, AppDfaTaskItem, AppDfaTaskListStats, AppDfaWorkerActiveJob } from '../../types/types';
import { showConfirm } from '../../components/DialogService';
import { ExecutionTable, ExecutionTableHead, ExecutionTableTh, ExecutionTableTd, executionTableRowClassName } from '../../components/execution/ExecutionTable';
import { ServicePageTitle, useServiceBuildVersion } from '../../components/execution/ServiceBuildVersion';
import { useUiFeedback } from '../../components/UiFeedback';
import { FileServerPickerModal } from '../../components/assets/FileServerPickerModal';
import { TaskOriginCard } from './taskOrigin';
import { saveExecutionReturnContext } from '../../utils/executionReturnContext';

const RUNNING_AGENT_PAGE_SIZE = 10;
const SLOT_WORKER_PAGE_SIZE = 6;

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

const ACTIVE_OR_TERMINAL_TASK_STATUSES = new Set(['running', 'passed', 'failed', 'error', 'cancelled']);

function formatDuration(startedAt: string | null | undefined, finishedAt: string | null | undefined, nowSecs = Math.floor(Date.now() / 1000)): string {
  if (!startedAt) return '-';
  const startSecs = Math.floor(new Date(startedAt).getTime() / 1000);
  const endSecs = finishedAt ? Math.floor(new Date(finishedAt).getTime() / 1000) : nowSecs;
  const secs = Math.max(0, endSecs - startSecs);
  if (secs < 60) return`${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return`${m}m${s}s`;
}

function formatDurationMs(durationMs: number | null | undefined): string {
  if (durationMs == null || Number.isNaN(durationMs) || durationMs < 0) return '-';
  const secs = Math.floor(durationMs / 1000);
  if (secs < 60) return`${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return`${m}m${s}s`;
}

function formatTsDuration(startTs: number | null, endTs: number | null): string {
  if (!startTs || !endTs || endTs <= startTs) return '';
  const secs = Math.round(endTs - startTs);
  if (secs === 0) return '< 1s';
  if (secs < 60) return`${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return`${m}m${s}s`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toLocaleString('zh-CN') : value;
}

function getTaskExecutionAttemptCount(task: AppDfaTaskItem): number {
  return Math.max(0, Number(task.rerun_count || 0));
}

// ── DFA Stage Steps ───────────────────────────────────────────────────────────
//
// 微服务实际执行节奏：
//   task_start / trace_start  → 毫秒级准备（加载配置、初始化目录）
//   round_start + worker_*    → 分钟级 LLM 并行调用（真正的耗时阶段）
//   judge_*                   → 秒-分钟级评估，可多轮循环
//   task_end                  → 毫秒级合并报告
// 4 个阶段对应实际工作量分布，避免出现两个 0s 初始化框。

const STAGE_STEPS = [
  { key: 'init',   label: '任务准备',    desc: '解析配置 · 初始化工作区',     artifactSubpath: '' },
  { key: 'worker', label: 'Worker 分析', desc: 'LLM 并行深度数据流分析',      artifactSubpath: 'run/sessions' },
  { key: 'judge',  label: 'Judge 评估',  desc: '多维可信度评估 · 反思迭代',   artifactSubpath: 'run/sessions' },
  { key: 'report', label: '报告输出',    desc: '合并全链路分析报告',           artifactSubpath: 'output' },
];

/** 事件类型 → 阶段索引 (0=准备, 1=Worker分析, 2=Judge评估, 3=报告输出)
 *  Worker 和 Judge 阶段可因多轮反思而循环交替，取最后出现的阶段为当前阶段。
 */
const EVT_STAGE: Record<string, number> = {
  task_start: 0, trace_start: 0, trace_skip: 0, trace_callees: 0,
  round_start: 1, worker_start: 1, worker_done: 1,
  judge_start: 2, judge_eval: 2, judge_summary: 2, judge_done: 2, judge_result: 2,
  task_end: 3,
};

type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

function deriveStepStatuses(taskStatus: string, events: AppDfaStageEvent[]): StepStatus[] {
  const statuses: StepStatus[] = STAGE_STEPS.map(() => 'pending');
  if (taskStatus === 'pending') return statuses;
  if (taskStatus === 'passed') return STAGE_STEPS.map(() => 'completed');

  // 状态机：遍历事件流确定当前活跃阶段
  // round_end(passed=true) → 推进到 report(3)
  // round_end(passed=false) → 保持在 judge(2)，等待下一轮 round_start 退回 worker(1)
  // Worker/Judge 可循环交替（多轮反思），始终取最后事件所在阶段
  let stage = -1;
  for (const evt of events) {
    if (evt.type === 'round_end') {
      if (evt.data?.passed) stage = 3;
      // passed=false：留在 judge(2)
    } else if (evt.type !== 'round_reflection') {
      const s = EVT_STAGE[evt.type];
      if (s !== undefined) stage = s;
    }
  }

  if (stage === -1) {
    if (taskStatus === 'running') statuses[0] = 'running';
    else if (['error', 'failed', 'cancelled'].includes(taskStatus)) statuses[0] = 'failed';
    return statuses;
  }

  const isTerminal = ['error', 'failed', 'cancelled'].includes(taskStatus);
  for (let i = 0; i < STAGE_STEPS.length; i++) {
    if (i < stage) statuses[i] = 'completed';
    else if (i === stage) statuses[i] = isTerminal ? 'failed' : 'running';
  }
  return statuses;
}

function computeStageTimes(events: AppDfaStageEvent[]): Array<{ startTs: number | null; endTs: number | null }> {
  // Worker(1) 和 Judge(2) 阶段可多轮循环：
  //   startTs = 该阶段首次出现的事件时间戳
  //   endTs   = 该阶段最后出现的事件时间戳（跨所有轮次的总跨度）
  // 这样 Worker 时长 ≈ 首轮开始 → 末轮最后 Worker 完成，直观展示总耗时。
  const result = STAGE_STEPS.map(() => ({ startTs: null as number | null, endTs: null as number | null }));
  for (const evt of events) {
    let s: number | undefined;
    if (evt.type === 'round_end') {
      s = evt.data?.passed ? 3 : undefined;
    } else if (evt.type !== 'round_reflection') {
      s = EVT_STAGE[evt.type];
    }
    if (s === undefined) continue;
    if (result[s].startTs === null) result[s].startTs = evt.ts;
    result[s].endTs = evt.ts;
  }
  // Stage 0 (准备) 的结束时间以 Stage 1 开始时间为准，精确到首个 round_start
  if (result[0].startTs !== null && result[1].startTs !== null) {
    result[0].endTs = result[1].startTs;
  }
  return result;
}

/** 当前轮次进度：轮次号、函数名、Worker 完成数/总数、已追踪函数数 */
interface RoundProgress { round: number; func: string; workersDone: number; workersTotal: number; tracedCount: number; }
function computeRoundProgress(events: AppDfaStageEvent[]): RoundProgress {
  let round = 0, func = '', workersDone = 0, workersTotal = 0;
  const tracedFuncs = new Set<string>();
  for (const evt of events) {
    if (evt.type === 'trace_start' && evt.data?.function) {
      tracedFuncs.add(evt.data.function as string);
      func = evt.data.function as string;
    }
    if (evt.type === 'round_start') {
      round = (evt.data?.round as number) ?? (round + 1);
      if (evt.data?.function) func = evt.data.function as string;
      workersDone = 0;
      workersTotal = 0;
    }
    if (evt.type === 'worker_start') workersTotal++;
    if (evt.type === 'worker_done') workersDone++;
  }
  return { round, func, workersDone, workersTotal, tracedCount: tracedFuncs.size };
}

// ── DFA Dataflow Tree ─────────────────────────────────────────────────────────

interface DfaTreeNode {
  name: string;
  depth: number;
  status: 'pending' | 'running' | 'done';
  children: DfaTreeNode[];
}

function buildDfaTree(events: AppDfaStageEvent[], taskStatus: string): DfaTreeNode | null {
  const calleesMap  = new Map<string, string[]>();      // parent → valid callees
  const nodeDepth   = new Map<string, number>();
  const nodeSt      = new Map<string, 'running' | 'done'>();
  let rootName: string | null = null;

  for (const evt of events) {
    const d = evt.data ?? {};
    if (evt.type === 'trace_start') {
      const fn = ((d.function ?? d.task) as string | undefined)?.trim();
      if (!fn) continue;
      const depth = (d.depth as number) ?? 0;
      if (!nodeDepth.has(fn) || nodeDepth.get(fn)! > depth) nodeDepth.set(fn, depth);
      if (!nodeSt.has(fn)) nodeSt.set(fn, 'running');
      if (rootName === null && depth === 0) rootName = fn;
    } else if (evt.type === 'trace_callees') {
      const fn = (d.function as string | undefined)?.trim();
      const callees = (d.callees as string[] | undefined) ?? [];
      if (fn) {
        // Merge with any previously seen callees for this function (e.g. on resume, two
        // trace_callees events can appear for the same function; take the union so the
        // larger/earlier correct list is not silently overwritten by a shorter resume list).
        const existing = calleesMap.get(fn) ?? [];
        const merged = existing.length === 0 ? callees : [...new Set([...existing, ...callees])];
        calleesMap.set(fn, merged);
        nodeSt.set(fn, 'done');
      }
    }
  }

  if (!['running', 'pending'].includes(taskStatus)) {
    for (const [fn, st] of nodeSt) if (st === 'running') nodeSt.set(fn, 'done');
  }

  if (!rootName) return null;

  const build = (name: string, inheritDepth: number, visited = new Set<string>()): DfaTreeNode => {
    if (visited.has(name)) return { name, depth: inheritDepth, status: 'done', children: [] };
    visited.add(name);
    const depth = nodeDepth.get(name) ?? inheritDepth;
    const status = nodeSt.get(name) ?? 'pending';
    const children = (calleesMap.get(name) ?? []).map((cn) => build(cn, depth + 1, new Set(visited)));
    return { name, depth, status, children };
  };

  return build(rootName, 0);
}

function extractFsRelPath(outputPath: string, projectId: string): string | null {
  const prefix =`/data/files/${projectId}`;
  if (!outputPath.startsWith(prefix)) return null;
  const rel = outputPath.slice(prefix.length).replace(/\/+$/, '');
  return rel.startsWith('/') ? rel :`/${rel}`;
}

function openInFileExplorer(fsPath: string) {
  const normalizedPath = fsPath.startsWith('/') ? fsPath :`/${fsPath}`;
  sessionStorage.setItem('chimera:fileExplorerNavigatePath', normalizedPath);
  window.dispatchEvent(new CustomEvent('chimera-navigate-view', { detail: { view: 'project-file-explorer', path: normalizedPath } }));
}

function formatEventLog(evt: AppDfaStageEvent): string {
  const ts = new Date(evt.ts * 1000).toLocaleTimeString('zh-CN');
  const d = evt.data ?? {};
  switch (evt.type) {
    case 'task_start':
      return`[${ts}] 任务开始  入口=${d.task ?? ''}`;
    case 'trace_start': {
      const fn = d.function ?? d.task ?? '';
      return`[${ts}] \u25b6 追踪 ${fn}  深度=${d.depth ?? 0}`;
    }
    case 'trace_skip':
      return`[${ts}] \u2298 跳过 ${d.function ?? ''}  原因=${d.reason ?? ''}`;
    case 'trace_callees':
      return`[${ts}]   发现 ${(d.callees ?? []).length} 个被调函数`;
    case 'round_start':
      return`[${ts}] \u25b6 Round ${d.round ?? ''}  Workers=${d.worker_ids?.length ?? 0}`;
    case 'round_end':
      return`[${ts}] \u2713 Round ${d.round ?? ''} 完成  passed=${d.passed ?? false}`;
    case 'worker_start':
      return`[${ts}]   Worker ${d.worker_id ?? ''}  model=${d.model ?? ''}`;
    case 'worker_done':
      return`[${ts}] \u2713 Worker ${d.worker_id ?? ''} 完成`;
    case 'agent_stream': {
      const text = (d.text ?? '').replace(/\n+/g, ' ').trim().slice(0, 120);
      if (!text) return '';
      return`[${ts}] \u2502 ${text}`;
    }
    case 'agent_output': {
      const text = (d.output ?? '').replace(/\n+/g, ' ').trim().slice(0, 120);
      if (!text) return`[${ts}] \u2713 Agent 完成`;
      return`[${ts}] \u2713 ${text}`;
    }
    case 'judge_start':
      return`[${ts}] \u25b6 Judge 评估  结果数=${d.worker_count ?? 0}`;
    case 'judge_eval':
      return`[${ts}]   Judge ${d.judge_id ?? ''}: passed=${d.passed ?? false}`;
    case 'judge_summary':
      return`[${ts}] \u2713 评估汇总: passed=${d.passed ?? false}  score=${d.score ?? '-'}`;
    case 'round_reflection': {
      const sugg = (d.suggestion ?? '').slice(0, 80);
      return sugg ?`[${ts}]   反思: ${sugg}` : '';
    }
    case 'error':
      return`[${ts}] \u2717 错误: ${d.error ?? JSON.stringify(d)}`;
    case 'task_end':
      return`[${ts}] 任务结束  status=${d.status ?? ''}`;
    default:
      return`[${ts}] ${evt.type}: ${JSON.stringify(d).slice(0, 100)}`;
  }
}

// ── functions.list parser ─────────────────────────────────────────────────

interface EntryItem {
  raw: string;
  source_file: string;
  function_name: string;
  line_hint: string;
  taint_vars: string;
}

interface RunningAgentView {
  id: string;
  name: string;
  model: string;
  round: number | null;
  currentFunction: string;
  startedTs: number;
  lastTs: number;
  lastEventType: string;
}

/** Extract clean comma-separated variable names from new-format taint field.
 * Input examples:  aHeader`🔴`aMessage`🔴   /   aSingle`🟡   /   aConfig`⚠️
 */
function extractTaintVars(raw: string): string {
  const matches = [...raw.matchAll(/`?(\w+)`[^\w\s]/gu)];
  if (matches.length > 0) return matches.map((m) => m[1]).join(',');
  // Fallback: strip backticks and emoji, collapse whitespace
  return raw.replace(/`/g, '').replace(/[^\w\s,]/gu, '').replace(/\s+/g, ' ').trim();
}

function parseFunctionsList(content: string): EntryItem[] {
  const stripped = content.trim();

  // JSON array format (new format from functions_list.py)
  // [{"tag":"P","file":"foo.cpp","line":45,"function":"Bar()","taints":["aMsg"]},...]
  if (stripped.startsWith('[')) {
    try {
      const items = JSON.parse(stripped);
      if (Array.isArray(items)) {
        return items
          .filter((item) => item && typeof item === 'object' && item.function)
          .map((item) => ({
            raw: JSON.stringify(item),
            source_file: item.file || '',
            function_name: item.function || '',
            line_hint: item.line ?`L${item.line}` : '',
            taint_vars: Array.isArray(item.taints) ? item.taints.join(',') : '',
          }));
      }
    } catch {
      // fall through to text-based parsing
    }
  }

  // Text-based formats (legacy)
  const result: EntryItem[] = [];
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    // Skip section-header lines:"污点变量:#::文件"
    if (line.startsWith('\u6c61\u70b9\u53d8\u91cf')) continue;
    const dIdx = line.indexOf('::');
    if (dIdx !== -1) {
      // New format: <taint_raw>:<seq_num>::<source_file>
      const source_file = line.slice(dIdx + 2);
      const left = line.slice(0, dIdx); //"<taint_raw>:<seq_num>"
      const lastColon = left.lastIndexOf(':');
      const taint_raw = lastColon !== -1 ? left.slice(0, lastColon) : left;
      const line_hint = lastColon !== -1 ? left.slice(lastColon + 1) : '';
      // Skip entries with no taint vars (无 / 无（...）)
      if (!taint_raw.trim() || /^\u65e0/.test(taint_raw)) continue;
      const taint_vars = extractTaintVars(taint_raw);
      result.push({ raw: line, source_file, function_name: '', line_hint, taint_vars });
    } else {
      // Old format: file:func:line:taint
      if (line.startsWith('#')) continue;
      const parts = line.split(':');
      result.push({ raw: line, source_file: parts[0] ?? '', function_name: parts[1] ?? '', line_hint: parts[2] ?? '', taint_vars: parts[3] ?? '' });
    }
  }
  return result;
}

function deriveRunningAgents(events: AppDfaStageEvent[], taskStatus: string): RunningAgentView[] {
  if (!['running', 'pending'].includes(taskStatus)) return [];

  const runningAgents = new Map<string, RunningAgentView>();
  let currentRound: number | null = null;
  let currentFunction = '';

  for (const evt of events) {
    const data = evt.data ?? {};
    if (evt.type === 'round_start') {
      const roundValue = Number(data.round);
      if (Number.isFinite(roundValue) && roundValue > 0) currentRound = roundValue;
    }
    if (evt.type === 'trace_start') {
      const nextFunction = String(data.function ?? data.task ?? '').trim();
      if (nextFunction) currentFunction = nextFunction;
    }

    const workerId = String(data.worker_id ?? data.agent ?? '').trim();
    if (!workerId) continue;

    if (evt.type === 'worker_start') {
      runningAgents.set(workerId, {
        id: workerId,
        name: workerId,
        model: String(data.model ?? '').trim(),
        round: Number.isFinite(Number(data.round)) && Number(data.round) > 0 ? Number(data.round) : currentRound,
        currentFunction: String(data.function ?? data.target_function ?? currentFunction ?? '').trim(),
        startedTs: evt.ts,
        lastTs: evt.ts,
        lastEventType: evt.type,
      });
      continue;
    }

    const current = runningAgents.get(workerId);
    if (!current) continue;

    if (evt.type === 'worker_done') {
      runningAgents.delete(workerId);
      continue;
    }

    current.lastTs = evt.ts;
    current.lastEventType = evt.type;
    if (!current.model && data.model) current.model = String(data.model).trim();
    const nextRound = Number(data.round);
    if (Number.isFinite(nextRound) && nextRound > 0) current.round = nextRound;
    const nextFunction = String(data.function ?? data.target_function ?? currentFunction ?? '').trim();
    if (nextFunction) current.currentFunction = nextFunction;
  }

  return Array.from(runningAgents.values()).sort((left, right) => {
    if (right.lastTs !== left.lastTs) return right.lastTs - left.lastTs;
    return left.name.localeCompare(right.name, 'zh-CN');
  });
}

const emptyForm = {
  task_name: '',
  input_path: '',
  output_path: '',
  task_description: '',
  // entry selection (derived into prompt_content on submit)
  entry_list_path: '',
  source_file: '',
  function_name: '',
  line_hint: '',
  taint_vars: '',
};

const SORT_OPTIONS = [
  { value: 'created_at', label: '创建时间' },
  { value: 'updated_at', label: '更新时间' },
  { value: 'started_at', label: '开始时间' },
  { value: 'finished_at', label: '结束时间' },
  { value: 'status', label: '任务状态' },
  { value: 'task_name', label: '任务名称' },
];

const HEADER_SORT_FIELDS: Partial<Record<'task' | 'status' | 'created_at' | 'duration', string>> = {
  task: 'task_name',
  status: 'status',
  created_at: 'created_at',
  duration: 'started_at',
};

type SortableHeaderProps = {
  label: string;
  active: boolean;
  direction: 'asc' | 'desc';
  onClick?: () => void;
  className?: string;
};

const SortableHeader: React.FC<SortableHeaderProps> = ({ label, active, direction, onClick, className }) => {
  if (!onClick) return <ExecutionTableTh className={className}>{label}</ExecutionTableTh>;
  return (
    <ExecutionTableTh className={className}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 transition-colors ${active ? 'text-theme-text-primary' : 'text-theme-text-muted hover:text-theme-text-primary'}`}
        title={`按${label}排序`}
      >
        <span>{label}</span>
        <ArrowDownUp size={13} className={active ? 'text-sky-400' : 'text-theme-text-muted'} />
        {active ? <span className="text-[10px] text-sky-400">{direction === 'asc' ? '升序' : '降序'}</span> : null}
      </button>
    </ExecutionTableTh>
  );
};

function getTaskMode(task: Pick<AppDfaTaskItem, 'task_origin_type' | 'parent_task_type'>): 'manual' | 'binary' | 'source' {
  if (String(task.task_origin_type || '').trim() !== 'binary_security') return 'manual';
  return String(task.parent_task_type || '').trim() === 'source' ? 'source' : 'binary';
}

function getTaskModeLabel(task: Pick<AppDfaTaskItem, 'task_origin_type' | 'parent_task_type'>): string {
  const mode = getTaskMode(task);
  if (mode === 'manual') return '手动';
  return mode === 'source' ? '源码模式' : '二进制模式';
}

function getTaskModeBadgeClassName(task: Pick<AppDfaTaskItem, 'task_origin_type' | 'parent_task_type'>): string {
  const mode = getTaskMode(task);
  if (mode === 'manual') return 'bg-theme-elevated text-theme-text-secondary';
  return mode === 'source' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-sky-500/15 text-sky-400';
}

function getQuickFilterButtonClassName(active: boolean, baseClassName: string): string {
  return`${baseClassName} transition-all ${active ? 'ring-2 ring-violet-500/20 ring-offset-1' : 'hover:opacity-80'}`;
}

type ExecutionSlotState = 'running' | 'pending' | 'expired' | 'released' | 'idle';

function formatRatioPercent(value?: number | null): string {
  if (!Number.isFinite(value)) return '-';
  return`${Math.round(Number(value) * 100)}%`;
}

function parseOwnerHost(ownerId?: string | null): string {
  const normalized = String(ownerId || '').trim();
  if (!normalized) return '';
  const separator = normalized.indexOf(':');
  return separator >= 0 ? normalized.slice(0, separator) : normalized;
}

function isLeaseExpired(leaseUntil?: string | null): boolean {
  if (!leaseUntil) return false;
  const timestamp = new Date(leaseUntil).getTime();
  return Number.isFinite(timestamp) && timestamp < Date.now();
}

function getExecutionSlotView(task: AppDfaTaskItem, autoRefreshEnabled: boolean): {
  state: ExecutionSlotState;
  label: string;
  ownerLabel: string;
  ownerFull: string;
  detail: string[];
  className: string;
} {
  const status = String(task.status || '').trim();
  const ownerFull = String(task.execution_owner_id || '').trim();
  const ownerLabel = parseOwnerHost(ownerFull);
  const dispatchStatus = String(task.dispatch_status || '').trim();
  const heartbeat = task.execution_heartbeat_at ?`心跳 ${new Date(task.execution_heartbeat_at).toLocaleString('zh-CN')}` : '';
  const lease = task.execution_lease_until ?`租约至 ${new Date(task.execution_lease_until).toLocaleString('zh-CN')}` : '';
  const terminal = ['passed', 'failed', 'error', 'cancelled'].includes(status);

  if (terminal) {
    return {
      state: 'released',
      label: '已释放',
      ownerLabel: '',
      ownerFull,
      detail: [dispatchStatus || 'terminal'].filter(Boolean),
      className: 'border-theme-border bg-theme-elevated text-theme-text-secondary',
    };
  }
  if (autoRefreshEnabled && status === 'running' && ownerFull && isLeaseExpired(task.execution_lease_until)) {
    return {
      state: 'expired',
      label: '状态过期',
      ownerLabel: ownerLabel || ownerFull,
      ownerFull,
      detail: [dispatchStatus, lease || heartbeat].filter(Boolean).slice(0, 2),
      className: 'border-orange-500/20 bg-orange-500/15 text-orange-400',
    };
  }
  if (status === 'running' && ownerFull) {
    return {
      state: 'running',
      label: '运行中',
      ownerLabel: ownerLabel || ownerFull,
      ownerFull,
      detail: [dispatchStatus, heartbeat || lease].filter(Boolean).slice(0, 2),
      className: 'border-cyan-500/20 bg-cyan-500/15 text-cyan-400',
    };
  }
  if (status === 'pending') {
    const queued = dispatchStatus === 'queued' || dispatchStatus === 'dispatching';
    return {
      state: 'pending',
      label: queued ? '排队中' : '未占用槽位',
      ownerLabel: '',
      ownerFull,
      detail: [dispatchStatus || 'pending'].filter(Boolean),
      className: 'border-amber-500/20 bg-amber-500/15 text-amber-400',
    };
  }
  return {
    state: 'idle',
    label: '未占用槽位',
    ownerLabel: ownerLabel || '',
    ownerFull,
    detail: [dispatchStatus].filter(Boolean),
    className: 'border-theme-border bg-theme-elevated text-theme-text-secondary',
  };
}

function getWorkerJobMode(job: Pick<AppDfaWorkerActiveJob, 'task_origin_type' | 'parent_task_type'>): 'manual' | 'binary' | 'source' {
  if (String(job.task_origin_type || '').trim() !== 'binary_security') return 'manual';
  return String(job.parent_task_type || '').trim() === 'source' ? 'source' : 'binary';
}

function getWorkerJobModeLabel(job: Pick<AppDfaWorkerActiveJob, 'task_origin_type' | 'parent_task_type'>): string {
  const mode = getWorkerJobMode(job);
  if (mode === 'manual') return '手动';
  return mode === 'source' ? '源码模式' : '二进制模式';
}

export const DataflowAnalysisTaskPage: React.FC<{ projectId: string; onOpenTask?: (taskId: string) => void }> = ({ projectId, onOpenTask }) => {
  const appApi = api.domains.execution.appDataflowAnalyse;
  const buildVersion = useServiceBuildVersion(appApi.getHealth);
  const { notify, feedbackNodes } = useUiFeedback();
  const autoRefreshStorageKey =`chimera:dataflowAnalysis:autoRefresh:${projectId || 'default'}`;
  const refreshIntervalStorageKey =`chimera:dataflowAnalysis:refreshInterval:${projectId || 'default'}`;

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchCancelling, setBatchCancelling] = useState(false);
  const [batchRestarting, setBatchRestarting] = useState(false);
  const [tasks, setTasks] = useState<AppDfaTaskItem[]>([]);
  const [total, setTotal] = useState(0);
  const [taskStats, setTaskStats] = useState<AppDfaTaskListStats>({ total: 0, pending: 0, running: 0, passed: 0, failed: 0, error: 0, cancelled: 0 });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [statusFilter, setStatusFilter] = useState('');
  const [modeFilter, setModeFilter] = useState<'' | 'manual' | 'binary' | 'source'>('');
  const [parentTaskIdFilter, setParentTaskIdFilter] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [refreshIntervalSec, setRefreshIntervalSec] = useState(10);
  const [clockNow, setClockNow] = useState(() => Math.floor(Date.now() / 1000));
  const [slotSummary, setSlotSummary] = useState<AppDfaClusterCapacity | null>(null);
  const [slotSummaryLoading, setSlotSummaryLoading] = useState(false);
  const [slotSummaryError, setSlotSummaryError] = useState('');
  const [showSlotDetailModal, setShowSlotDetailModal] = useState(false);
  const [slotPanelExpanded, setSlotPanelExpanded] = useState(false);
  const [expandedSlotWorkerIds, setExpandedSlotWorkerIds] = useState<string[]>([]);
  const [slotWorkerPage, setSlotWorkerPage] = useState(1);
  const [runningAgentNameFilter, setRunningAgentNameFilter] = useState('');
  const [runningAgentPage, setRunningAgentPage] = useState(1);

  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Detail modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [detail, setDetail] = useState<AppDfaTaskDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [logsExpanded, setLogsExpanded] = useState(true);

  const [form, setForm] = useState(emptyForm);
  const [entryList, setEntryList] = useState<EntryItem[]>([]);
  const [loadingEntryList, setLoadingEntryList] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'input' | 'output' | 'entrylist'>('input');
  const logScrollRef = useRef<HTMLDivElement>(null);

  const handleHeaderSort = (field: 'task' | 'status' | 'created_at' | 'duration') => {
    const mapped = HEADER_SORT_FIELDS[field];
    if (!mapped) return;
    if (sortBy === mapped) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(mapped);
      setSortOrder(field === 'task' || field === 'status' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const toggleStatusQuickFilter = (status: string) => {
    setStatusFilter((current) => (current === status ? '' : status));
    setPage(1);
  };

  const toggleModeQuickFilter = (mode: '' | 'manual' | 'binary' | 'source') => {
    if (!mode) return;
    setModeFilter((current) => (current === mode ? '' : mode));
    setPage(1);
  };

  const toggleParentTaskQuickFilter = (parentTaskId: string) => {
    if (!parentTaskId) return;
    setParentTaskIdFilter((current) => (current === parentTaskId ? '' : parentTaskId));
    setPage(1);
  };

  const toggleSourceQuickFilter = (task: AppDfaTaskItem) => {
    if (task.parent_task_id) {
      toggleParentTaskQuickFilter(task.parent_task_id);
      return;
    }
    toggleModeQuickFilter(getTaskMode(task));
  };

  // Pre-fill input_path from FileExplorer right-click
  useEffect(() => {
    const stored = sessionStorage.getItem('chimera:dataflowAnalysisInputPath');
    if (stored) {
      sessionStorage.removeItem('chimera:dataflowAnalysisInputPath');
      setCreateModalOpen(true);
      setSelectedTaskId('');
      const entryListPath =`${stored.replace(/\/+$/, '')}/functions.list`;
      setForm({ ...emptyForm, input_path: stored, output_path:`/data/files/${projectId}/app/chimera-app-dataflow-analyse`, entry_list_path: entryListPath });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load task list ────────────────────────────────────────────────────────

  const loadTasks = useCallback(async (p = page) => {
    if (!projectId) return;
    setLoading(true);
    try {
      const resp = await appApi.listTasks({
        project_id: projectId,
        page: p,
        per_page: perPage,
        status: statusFilter,
        mode: modeFilter || undefined,
        parent_task_id: parentTaskIdFilter.trim() || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      setTasks(resp.items || []);
      setTotal(resp.total || 0);
    } catch (err: any) {
      notify(`加载任务列表失败: ${err?.message || err}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [projectId, page, perPage, statusFilter, modeFilter, parentTaskIdFilter, sortBy, sortOrder]);

  const loadTaskStats = useCallback(async () => {
    if (!projectId) return;
    try {
      const resp = await appApi.getTaskStats({
        project_id: projectId,
        status: statusFilter,
        mode: modeFilter || undefined,
        parent_task_id: parentTaskIdFilter.trim() || undefined,
      });
      setTaskStats(resp);
    } catch (err: any) {
      notify(`加载任务统计失败: ${err?.message || err}`, 'error');
    }
  }, [appApi, projectId, statusFilter, modeFilter, parentTaskIdFilter, notify]);

  const loadSlotSummary = useCallback(async () => {
    setSlotSummaryLoading(true);
    setSlotSummaryError('');
    try {
      const payload = await appApi.getWorkerClusterCapacity();
      setSlotSummary(payload);
      setExpandedSlotWorkerIds((current) => {
        const availableIds = new Set((payload.workers || []).map((worker) => worker.worker_id));
        const retained = current.filter((workerId) => availableIds.has(workerId));
        return retained.length > 0 ? retained : (payload.workers || []).slice(0, 1).map((worker) => worker.worker_id);
      });
    } catch (err: any) {
      setSlotSummary(null);
      setSlotSummaryError(err?.message || '读取槽位摘要失败');
    } finally {
      setSlotSummaryLoading(false);
    }
  }, [appApi]);

  const loadAll = useCallback(async (p = page) => {
    await Promise.all([
      loadTasks(p),
      loadTaskStats(),
      loadSlotSummary(),
    ]);
  }, [loadTasks, loadTaskStats, loadSlotSummary, page]);

  useEffect(() => { void loadAll(page); }, [projectId, page, perPage, statusFilter, modeFilter, parentTaskIdFilter, sortBy, sortOrder]);

  useEffect(() => {
    const storedEnabled = localStorage.getItem(autoRefreshStorageKey);
    const storedInterval = localStorage.getItem(refreshIntervalStorageKey);
    setAutoRefreshEnabled(storedEnabled === 'true');
    if (storedInterval) {
      const parsed = Number(storedInterval);
      setRefreshIntervalSec(Number.isFinite(parsed) ? Math.max(5, Math.floor(parsed)) : 10);
    } else {
      setRefreshIntervalSec(10);
    }
  }, [autoRefreshStorageKey, refreshIntervalStorageKey]);

  useEffect(() => {
    localStorage.setItem(autoRefreshStorageKey, String(autoRefreshEnabled));
  }, [autoRefreshEnabled, autoRefreshStorageKey]);

  useEffect(() => {
    localStorage.setItem(refreshIntervalStorageKey, String(refreshIntervalSec));
  }, [refreshIntervalSec, refreshIntervalStorageKey]);

  useEffect(() => {
    setSelectedTaskIds((current) => {
      const validIds = new Set(tasks.map((task) => task.task_id));
      const next = new Set<string>();
      current.forEach((taskId) => {
        if (validIds.has(taskId)) next.add(taskId);
      });
      return next;
    });
  }, [tasks]);

  // ── Load task detail ──────────────────────────────────────────────────────

  const loadDetail = async (taskId: string) => {
    setDetailLoading(true);
    try {
      const d = await appApi.getTask(taskId);
      setDetail(d);
    } catch (err: any) {
      notify(`加载任务详情失败: ${err?.message || err}`, 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSelectTask = (taskId: string) => {
    if (onOpenTask) {
      onOpenTask(taskId);
      return;
    }
    saveExecutionReturnContext({ view: 'dataflow-analysis-task' });
    window.dispatchEvent(new CustomEvent('chimera-navigate-view', {
      detail: { view: 'dataflow-analysis-detail', dataflowAnalysisTaskId: taskId },
    }));
  };

  // ── Auto-poll when tasks are running or pending ───────────────────────────
  const hasActiveTasks = tasks.some((t) => t.status === 'running' || t.status === 'pending');
  const hasActiveDetail = Boolean(detail && (detail.status === 'running' || detail.status === 'pending'));
  useEffect(() => {
    if (!hasActiveTasks && !hasActiveDetail) return;
    const timer = window.setInterval(() => setClockNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [hasActiveTasks, hasActiveDetail]);

  useEffect(() => {
    if (!autoRefreshEnabled) return;
    if (!hasActiveTasks) return;
    const timer = setInterval(() => {
      void loadAll(page);
    }, Math.max(5, refreshIntervalSec) * 1000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefreshEnabled, refreshIntervalSec, hasActiveTasks, projectId, page]);

  // Auto-scroll logs to bottom when new events arrive
  useEffect(() => {
    if (logsExpanded && logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [detail?.stages_json?.events?.length, logsExpanded]);

  // ── Load functions.list ───────────────────────────────────────────────────

  const loadEntryList = async (listPath: string) => {
    if (!listPath.trim()) return;
    setLoadingEntryList(true);
    setEntryList([]);
    try {
      const fsApi = api.domains.assets.fileserver;
      const prefix =`/data/files/${projectId}`;
      const apiPath = listPath.startsWith(prefix) ? listPath.slice(prefix.length) : listPath;
      const blob = await fsApi.fetchProjectFilesystemDownloadBlob(projectId, apiPath);
      const text = await blob.text();
      const items = parseFunctionsList(text);
      setEntryList(items);
      if (items.length === 0) notify('functions.list 中没有找到入口函数', 'error');
    } catch (err: any) {
      notify(`加载入口清单失败: ${err?.message || err}`, 'error');
    } finally {
      setLoadingEntryList(false);
    }
  };

  // ── Create task ───────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!form.task_name.trim()) { notify('任务名称不能为空', 'error'); return; }
    if (!form.input_path.trim()) { notify('源码路径不能为空', 'error'); return; }
    if (!form.function_name.trim()) { notify('请选择或填写入口函数', 'error'); return; }
    const sf = form.source_file.trim();
    const fn = form.function_name.trim();
    const lh = form.line_hint.trim();
    const tv = form.taint_vars.trim();
    const promptBase = sf
      ?`对 ${sf} 的 ${fn}${lh ? ' ' + lh : ''} 函数完成数据流安全分析`
      :`对 ${fn}${lh ? ' ' + lh : ''} 函数完成数据流安全分析`;
    const prompt = tv ?`${promptBase}，外部输入参数为: ${tv}` : promptBase;
    setCreating(true);
    try {
      const resp = await appApi.createTask({
        project_id: projectId,
        task_name: form.task_name.trim(),
        input_path: form.input_path.trim(),
        output_path: form.output_path.trim() || undefined,
        task_description: form.task_description.trim() || undefined,
        prompt_content: prompt,
      });
      notify(`任务创建成功: ${resp.task_id}`, 'success');
      setForm({ ...emptyForm });
      setEntryList([]);
      setCreateModalOpen(false);
      setPage(1);
      await loadTasks(1);
    } catch (err: any) {
      notify(`任务创建失败: ${err?.message || err}`, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleCancel = async (taskId: string) => {
    try {
      await appApi.cancelTask(taskId);
      notify('任务已取消', 'success');
      if (selectedTaskId === taskId) void loadDetail(taskId);
      await loadTasks(page);
    } catch (err: any) {
      notify(`取消失败: ${err?.message || err}`, 'error');
    }
  };

  const handleDelete = async (taskId: string, taskName: string) => {
    const confirmed = await showConfirm({
      title: '删除任务',
      message:`确定要删除任务「${taskName}」及其所有输出文件吗？此操作不可撤销。`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await appApi.deleteTask(taskId, true);
      notify('任务已删除', 'success');
      if (selectedTaskId === taskId) { setModalOpen(false); setSelectedTaskId(''); }
      setSelectedTaskIds((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
      await loadTasks(page);
    } catch (err: any) {
      notify(`删除失败: ${err?.message || err}`, 'error');
    }
  };

  const toggleTaskSelection = (taskId: string, checked: boolean) => {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (checked) next.add(taskId);
      else next.delete(taskId);
      return next;
    });
  };

  const toggleAllPageSelection = (checked: boolean) => {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (checked) tasks.forEach((task) => next.add(task.task_id));
      else tasks.forEach((task) => next.delete(task.task_id));
      return next;
    });
  };

  const handleBatchDelete = async () => {
    const taskIds = Array.from(selectedTaskIds);
    if (taskIds.length === 0) {
      notify('请先选择要删除的任务', 'error');
      return;
    }
    const confirmed = await showConfirm({
      title: '批量删除任务',
      message:`确定要批量删除 ${taskIds.length} 个数据流分析任务及其输出文件吗？此操作不可撤销。`,
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
        await appApi.deleteTask(taskId, true);
        success += 1;
      } catch (err: any) {
        failed += 1;
        if (!firstError) firstError = err?.message || String(err);
      }
    }
    setBatchDeleting(false);
    setSelectedTaskIds(new Set());
    if (selectedTaskId && taskIds.includes(selectedTaskId)) {
      closeModal();
    }
    await loadTasks(page);

    if (failed === 0) {
      notify(`批量删除成功，共 ${success} 个任务`, 'success');
    } else if (success > 0) {
      notify(`批量删除完成，成功 ${success} / ${taskIds.length}，首个错误：${firstError}`, 'warning');
    } else {
      notify(`批量删除失败：${firstError || '未知错误'}`, 'error');
    }
  };

  const handleBatchCancel = async () => {
    const activeIds = tasks
      .filter((task) => selectedTaskIds.has(task.task_id) && (task.status === 'pending' || task.status === 'running'))
      .map((task) => task.task_id);
    if (activeIds.length === 0) {
      notify('已选择任务中没有可取消的等待中或运行中任务', 'error');
      return;
    }
    const confirmed = await showConfirm({
      title: '批量取消任务',
      message:`确定要取消 ${activeIds.length} 个等待中/运行中的数据流分析任务吗？任务记录和输出文件会保留。`,
      confirmText: '确认取消',
      cancelText: '返回',
    });
    if (!confirmed) return;

    setBatchCancelling(true);
    let success = 0;
    let failed = 0;
    let firstError = '';
    for (const taskId of activeIds) {
      try {
        await appApi.cancelTask(taskId);
        success += 1;
      } catch (err: any) {
        failed += 1;
        if (!firstError) firstError = err?.message || String(err);
      }
    }
    setBatchCancelling(false);
    await loadTasks(page);
    if (selectedTaskId && activeIds.includes(selectedTaskId)) {
      void loadDetail(selectedTaskId);
    }

    if (failed === 0) {
      notify(`批量取消成功，共 ${success} 个任务`, 'success');
    } else if (success > 0) {
      notify(`批量取消完成，成功 ${success} / ${activeIds.length}，首个错误：${firstError}`, 'warning');
    } else {
      notify(`批量取消失败：${firstError || '未知错误'}`, 'error');
    }
  };

  const handleBatchRestart = async () => {
    const restartableIds = tasks
      .filter((task) => selectedTaskIds.has(task.task_id) && task.status !== 'pending' && task.status !== 'running')
      .map((task) => task.task_id);
    if (restartableIds.length === 0) {
      notify('已选择任务中没有可重试的终态任务', 'error');
      return;
    }
    const skipped = selectedTaskIds.size - restartableIds.length;
    const confirmed = await showConfirm({
      title: '批量重试任务',
      message:`确定要重试 ${restartableIds.length} 个数据流分析任务吗？${skipped > 0 ?`将跳过 ${skipped} 个等待中/运行中的任务。` : ''}`,
      confirmText: '确认重试',
      cancelText: '取消',
    });
    if (!confirmed) return;

    setBatchRestarting(true);
    let success = 0;
    let failed = 0;
    let firstError = '';
    for (const taskId of restartableIds) {
      try {
        await appApi.restartTask(taskId);
        success += 1;
      } catch (err: any) {
        failed += 1;
        if (!firstError) firstError = err?.message || String(err);
      }
    }
    setBatchRestarting(false);
    await loadTasks(page);
    if (selectedTaskId && restartableIds.includes(selectedTaskId)) {
      void loadDetail(selectedTaskId);
    }

    if (failed === 0) {
      notify(`批量重试成功，共 ${success} 个任务`, 'success');
    } else if (success > 0) {
      notify(`批量重试完成，成功 ${success} / ${restartableIds.length}，首个错误：${firstError}`, 'warning');
    } else {
      notify(`批量重试失败：${firstError || '未知错误'}`, 'error');
    }
  };

  const handleRestart = async (taskId: string) => {
    setRestarting(true);
    try {
      await appApi.restartTask(taskId);
      notify('任务已重新启动', 'success');
      await loadTasks(page);
      if (selectedTaskId === taskId && modalOpen) void loadDetail(taskId);
    } catch (err: any) {
      notify(`重启失败: ${err?.message || err}`, 'error');
    } finally {
      setRestarting(false);
    }
  };

  const handleResume = async (taskId: string) => {
    setResuming(true);
    try {
      await appApi.resumeTask(taskId);
      notify('已从断点继续', 'success');
      await loadTasks(page);
      if (selectedTaskId === taskId && modalOpen) void loadDetail(taskId);
    } catch (err: any) {
      notify(`断点续跑失败: ${err?.message || err}`, 'error');
    } finally {
      setResuming(false);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedTaskId('');
    setDetail(null);
  };

  const totalPages = Math.ceil(total / perPage);
  const allPageSelected = tasks.length > 0 && tasks.every((task) => selectedTaskIds.has(task.task_id));
  const hasSelection = selectedTaskIds.size > 0;

  const stageStatuses = detail
    ? deriveStepStatuses(detail.status, detail.stages_json?.events ?? [])
    : STAGE_STEPS.map((): StepStatus => 'pending');

  const stageTimes = detail
    ? computeStageTimes(detail.stages_json?.events ?? [])
    : STAGE_STEPS.map(() => ({ startTs: null as number | null, endTs: null as number | null }));

  const events = detail?.stages_json?.events ?? [];
  const roundProgress = computeRoundProgress(events);
  const runningAgents = detail ? deriveRunningAgents(events, detail.status) : [];
  const normalizedRunningAgentNameFilter = runningAgentNameFilter.trim().toLowerCase();
  const filteredRunningAgents = useMemo(() => {
    if (!normalizedRunningAgentNameFilter) return runningAgents;
    return runningAgents.filter((agent) => [agent.name, agent.model, agent.currentFunction]
      .some((value) => String(value || '').toLowerCase().includes(normalizedRunningAgentNameFilter)));
  }, [normalizedRunningAgentNameFilter, runningAgents]);
  const runningAgentTotalPages = Math.max(1, Math.ceil(filteredRunningAgents.length / RUNNING_AGENT_PAGE_SIZE));
  const pagedRunningAgents = useMemo(() => {
    const currentPage = Math.min(runningAgentPage, runningAgentTotalPages);
    const startIndex = (currentPage - 1) * RUNNING_AGENT_PAGE_SIZE;
    return filteredRunningAgents.slice(startIndex, startIndex + RUNNING_AGENT_PAGE_SIZE);
  }, [filteredRunningAgents, runningAgentPage, runningAgentTotalPages]);
  const dfaTree = detail ? buildDfaTree(events, detail.status) : null;

  const logLines = events.map(formatEventLog).filter(Boolean);
  useEffect(() => {
    setRunningAgentNameFilter('');
    setRunningAgentPage(1);
  }, [detail?.task_id]);
  useEffect(() => {
    setRunningAgentPage(1);
  }, [runningAgentNameFilter]);
  useEffect(() => {
    setRunningAgentPage((current) => Math.min(current, runningAgentTotalPages));
  }, [runningAgentTotalPages]);
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
      hint: slotSummary?.updated_at ?`更新于 ${new Date(slotSummary.updated_at).toLocaleTimeString('zh-CN')}` : '当前项目可见 worker 的总执行槽位',
      border: 'border-theme-border',
      bg: 'bg-theme-elevated',
      text: 'text-theme-text-primary',
    },
    {
      label: '忙槽位',
      value: slotSummary?.running_jobs ?? '-',
      hint:`利用率 ${formatRatioPercent(
        slotSummary && slotSummary.total_capacity > 0
          ? slotSummary.running_jobs / slotSummary.total_capacity
          : null
      )}`,
      border: 'border-cyan-500/20',
      bg: 'bg-cyan-500/15',
      text: 'text-cyan-400',
    },
    {
      label: '空闲槽位',
      value: slotSummary?.available_slots ?? '-',
      hint: '当前未被任务占用的执行容量',
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
  const slotWorkers = slotSummary?.workers || [];
  const slotWorkerTotalPages = Math.max(1, Math.ceil(slotWorkers.length / SLOT_WORKER_PAGE_SIZE));
  const slotWorkerPageSafe = Math.min(slotWorkerPage, slotWorkerTotalPages);
  const pagedSlotWorkers = slotWorkers.slice((slotWorkerPageSafe - 1) * SLOT_WORKER_PAGE_SIZE, slotWorkerPageSafe * SLOT_WORKER_PAGE_SIZE);

  useEffect(() => {
    setSlotWorkerPage(1);
  }, [slotSummary?.updated_at, slotWorkers.length]);

  useEffect(() => {
    if (slotWorkerPage > slotWorkerTotalPages) {
      setSlotWorkerPage(slotWorkerTotalPages);
    }
  }, [slotWorkerPage, slotWorkerTotalPages]);

  return (
    <div className="px-8 pt-8 pb-10 space-y-6">
      {feedbackNodes}
      <FileServerPickerModal
        projectId={projectId}
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        mode={pickerTarget === 'entrylist' ? 'file' : 'directory'}
        title={pickerTarget === 'entrylist' ? '选择 functions.list 文件' : undefined}
        onSelect={(containerPath) => {
          setPickerOpen(false);
          if (pickerTarget === 'output') {
            setForm((p) => ({ ...p, output_path: containerPath }));
          } else if (pickerTarget === 'entrylist') {
            setForm((p) => ({ ...p, entry_list_path: containerPath }));
          } else {
            const entryListPath =`${containerPath.replace(/\/+$/, '')}/functions.list`;
            setForm((p) => ({ ...p, input_path: containerPath, entry_list_path: entryListPath }));
          }
        }}
      />

      {/* Task Detail Modal */}
      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
 <div className="relative z-10 w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-theme-border bg-theme-surface overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-theme-border bg-theme-elevated shrink-0">
              {detail ? (
                <div className="flex items-center gap-2.5 min-w-0">
                  <h2 className="text-lg font-semibold text-theme-text-primary truncate">{detail.task_name}</h2>
                  <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[detail.status] ?? 'bg-theme-elevated text-theme-text-secondary'}`}>
                    {STATUS_LABEL[detail.status] ?? detail.status}
                  </span>
                </div>
              ) : (
                <h2 className="text-lg font-semibold text-theme-text-primary">任务详情</h2>
              )}
              <div className="flex items-center gap-2 shrink-0">
                {detail && (detail.status === 'running' || detail.status === 'pending') ? (
                  <button onClick={() => void handleCancel(detail.task_id)}
                    className="rounded-lg border border-theme-border px-3 py-1 text-xs text-theme-text-secondary hover:bg-theme-elevated">取消</button>
                ) : null}
                {detail && !['pending', 'running'].includes(detail.status) ? (
                  <>
                    <button
                      onClick={() => void handleRestart(detail.task_id)}
                      disabled={restarting}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/20 bg-violet-500/15 px-3 py-1 text-xs font-semibold text-violet-400 hover:bg-violet-500/15 disabled:opacity-50"
                    >
                      {restarting ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                      重新运行
                    </button>
                    {detail.started_at ? (
                      <button
                        onClick={() => void handleResume(detail.task_id)}
                        disabled={resuming}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-400 hover:bg-amber-500/15 disabled:opacity-50"
                      >
                        {resuming ? <Loader2 size={12} className="animate-spin" /> : <PlayCircle size={12} />}
                        断点续跑
                      </button>
                    ) : null}
                  </>
                ) : null}
                <button onClick={() => detail && void loadDetail(detail.task_id)} title="刷新"
                  className="rounded-lg border border-theme-border p-1.5 text-theme-text-muted hover:text-theme-text-secondary"><RefreshCw size={14} /></button>
                <button onClick={closeModal} title="关闭"
                  className="rounded-lg p-1 text-theme-text-muted hover:text-theme-text-secondary"><X size={16} /></button>
              </div>
            </div>

            {/* Modal body */}
            {detailLoading && !detail ? (
              <div className="flex items-center justify-center gap-2 py-20 text-sm text-theme-text-muted">
                <Loader2 size={16} className="animate-spin" />加载中...
              </div>
            ) : detail ? (
              <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
                {/* Basic info grid */}
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
                  <InfoRow label="任务 ID" value={<span className="font-mono">{detail.task_id}</span>} />
                  <InfoRow label="创建时间" value={detail.created_at ? new Date(detail.created_at).toLocaleString('zh-CN') : '-'} />
                  <InfoRow label="输入路径" value={<span className="font-mono break-all">{detail.input_path}</span>} />
                  {detail.started_at ? <InfoRow label="开始时间" value={new Date(detail.started_at).toLocaleString('zh-CN')} /> : <div />}
                  {detail.output_path ? <InfoRow label="输出路径" value={<span className="font-mono break-all">{detail.output_path}</span>} /> : <div />}
                  {detail.finished_at ? <InfoRow label="完成时间" value={new Date(detail.finished_at).toLocaleString('zh-CN')} /> : <div />}
                  {detail.task_description ? <InfoRow label="描述" value={detail.task_description} /> : null}
                  {detail.started_at ? <InfoRow label="耗时" value={formatDuration(detail.started_at, detail.finished_at ?? undefined, clockNow)} /> : null}
                </div>

                {/* Stage Progress */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-theme-text-muted mb-3">分析阶段进度</h3>
                  <div className="relative flex items-start gap-0">
                    {STAGE_STEPS.map((step, i) => {
                      const st = stageStatuses[i];
                      const timing = stageTimes[i];
                      const timingStr = (st === 'completed' || st === 'failed') ? formatTsDuration(timing.startTs, timing.endTs) : '';
                      const artifactFull = detail.output_path && step.artifactSubpath
                        ?`${detail.output_path}/${detail.task_id}/${step.artifactSubpath}`
                        : null;
                      const artifactFsPath = artifactFull ? extractFsRelPath(artifactFull, projectId) : null;
                      return (
                        <div key={step.key} className="flex-1 flex flex-col items-center relative">
                          {i < STAGE_STEPS.length - 1 ? (
                            <div className={`absolute top-4 left-1/2 w-full h-0.5 ${st === 'completed' ? 'bg-violet-400' : 'bg-theme-elevated'}`} />
                          ) : null}
                          <div className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold
                            ${st === 'completed' ? 'border-violet-500 bg-violet-500/15 text-violet-400'
                              : st === 'running'   ? 'border-blue-500 bg-blue-500/15 text-blue-400'
                              : st === 'failed'    ? 'border-red-400 bg-red-500/15 text-red-400'
                              : 'border-theme-border bg-theme-elevated text-theme-text-muted'}`}>
                            {st === 'completed' ? <CheckCircle2 size={16} className="text-violet-500" />
                              : st === 'running'  ? <Loader2 size={14} className="animate-spin text-blue-500" />
                              : st === 'failed'   ? <XCircle size={16} className="text-red-500" />
                              : <span>{i + 1}</span>}
                          </div>
                          <div className={`mt-2 text-center px-1 ${st === 'running' ? 'text-blue-400' : st === 'completed' ? 'text-violet-400' : st === 'failed' ? 'text-red-500' : 'text-theme-text-muted'}`}>
                            <div className="text-xs font-semibold">{step.label}</div>
                            {/* Worker 分析阶段: 轮次 + Worker进度 + 函数名 */}
                            {i === 1 && st === 'running' ? (
                              <div className="text-[10px] font-mono text-blue-500 mt-0.5 leading-tight space-y-0">
                                {roundProgress.round > 0 ? (
                                  <span>{roundProgress.workersTotal > 0
                                    ?`第 ${roundProgress.round} 轮 · ${roundProgress.workersDone}/${roundProgress.workersTotal} W`
                                    :`第 ${roundProgress.round} 轮`}
                                  </span>
                                ) : null}
                                {roundProgress.tracedCount > 1 ? <span className="block">共 {roundProgress.tracedCount} 函数</span> : null}
                                {roundProgress.func ? <span className="block truncate max-w-[80px]" title={roundProgress.func}>{roundProgress.func.split('::').pop()}</span> : null}
                              </div>
                            ) : null}
                            {/* Judge 评估阶段: 轮次 */}
                            {i === 2 && st === 'running' && roundProgress.round > 0 ? (
                              <div className="text-[10px] font-mono text-blue-500 mt-0.5">第 {roundProgress.round} 轮</div>
                            ) : null}
                            <div className="text-[10px] text-theme-text-muted leading-tight mt-0.5 hidden sm:block">{step.desc}</div>
                            {timingStr ? <div className="text-[10px] font-mono text-theme-text-muted mt-0.5">&#9201; {timingStr}</div> : null}
                            {artifactFsPath && (st === 'completed' || st === 'running') ? (
                              <button
                                onClick={() => openInFileExplorer(artifactFsPath)}
                                className="mt-1 inline-flex items-center gap-0.5 rounded border border-violet-500/20 px-1 py-0.5 text-[10px] text-violet-400 hover:bg-violet-500/15"
                              >
                                <FolderOpen size={9} />输出
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-theme-text-muted">当前运行智能体</h3>
                      <p className="mt-1 text-[11px] text-theme-text-muted">
                        当前检测到 {filteredRunningAgents.length} 个运行中的智能体
                        {normalizedRunningAgentNameFilter ?`，筛选前 ${runningAgents.length} 个` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="search"
                        value={runningAgentNameFilter}
                        onChange={(event) => setRunningAgentNameFilter(event.target.value)}
                        placeholder="筛选智能体 / 模型 / 函数"
                        className="rounded-lg border border-theme-border bg-theme-elevated px-3 py-2 text-xs text-theme-text-secondary outline-none focus:border-violet-400"
                      />
                      <div className="rounded-lg border border-theme-border bg-theme-elevated px-3 py-2 text-[11px] text-theme-text-muted">
                        每页 {RUNNING_AGENT_PAGE_SIZE} 条
                      </div>
                    </div>
                  </div>
                  {pagedRunningAgents.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-theme-border bg-theme-elevated px-4 py-6 text-sm text-theme-text-muted">
                      {runningAgents.length === 0 ? '当前没有处于运行中的智能体。' : '没有匹配当前筛选条件的运行中智能体。'}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {pagedRunningAgents.map((agent) => (
                        <div key={agent.id} className="rounded-xl border border-theme-border bg-theme-surface px-4 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="truncate text-sm font-semibold text-theme-text-primary" title={agent.name}>{agent.name}</div>
                                <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold text-blue-400">运行中</span>
                                {agent.round ? (
                                  <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold text-violet-400">第 {agent.round} 轮</span>
                                ) : null}
                              </div>
                              <div className="mt-2 grid gap-2 text-xs text-theme-text-muted md:grid-cols-2">
                                <div className="truncate" title={agent.model || '-'}>模型: {agent.model || '-'}</div>
                                <div className="truncate" title={agent.currentFunction || '-'}>当前函数: {agent.currentFunction || '-'}</div>
                                <div>开始时间: {formatDateTime(new Date(agent.startedTs * 1000).toISOString())}</div>
                                <div>最近活动: {formatDateTime(new Date(agent.lastTs * 1000).toISOString())}</div>
                              </div>
                            </div>
                            <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-[11px] text-theme-text-muted">
                              最近事件
                              <div className="mt-1 font-semibold text-theme-text-secondary">{agent.lastEventType}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {runningAgentTotalPages > 1 ? (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-theme-border bg-theme-surface px-3 py-2">
                          <div className="text-xs text-theme-text-muted">第 {runningAgentPage} / {runningAgentTotalPages} 页</div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setRunningAgentPage((current) => Math.max(1, current - 1))}
                              disabled={runningAgentPage <= 1}
                              className="rounded-lg border border-theme-border bg-theme-elevated px-3 py-1.5 text-xs text-theme-text-secondary disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              上一页
                            </button>
                            <button
                              type="button"
                              onClick={() => setRunningAgentPage((current) => Math.min(runningAgentTotalPages, current + 1))}
                              disabled={runningAgentPage >= runningAgentTotalPages}
                              className="rounded-lg border border-theme-border bg-theme-elevated px-3 py-1.5 text-xs text-theme-text-secondary disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              下一页
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>

                {/* Dataflow Call Tree */}
                {dfaTree ? (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-theme-text-muted mb-2">
                      数据流调用树
                      <span className="ml-2 normal-case font-normal text-theme-text-muted">
                        {dfaTree.status === 'running' ? '分析中…' :`已完成`}
                      </span>
                    </h3>
                    <div className="rounded-lg border border-theme-border bg-theme-elevated px-2 py-1.5 max-h-72 overflow-auto">
                      <DfaTreeNodeView node={dfaTree} depth={0} />
                    </div>
                  </div>
                ) : null}

                {/* Error */}
                {detail.error ? (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-red-500 mb-1">错误信息</h3>
                    <pre className="rounded-lg bg-red-500/15 border border-red-500/20 px-3 py-2 text-xs text-red-400 whitespace-pre-wrap break-all max-h-32 overflow-auto">{detail.error}</pre>
                  </div>
                ) : null}

                {/* Analysis Logs */}
                <div>
                  <button
                    type="button"
                    onClick={() => setLogsExpanded((v) => !v)}
                    className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-theme-text-muted hover:text-theme-text-secondary mb-1"
                  >
                    <span>分析日志 <span className="normal-case font-normal text-theme-text-muted">({logLines.length} 条事件)</span></span>
                    {logsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {logsExpanded ? (
                    logLines.length === 0 ? (
                      <div className="rounded-lg bg-theme-elevated border border-theme-border px-3 py-3 text-xs text-theme-text-muted">
                        {detail.status === 'pending' ? '任务尚未开始，暂无日志' : '暂无阶段事件（日志在任务运行期间每3个事件刷新一次）'}
                      </div>
                    ) : (
                      <div
                        ref={logScrollRef}
                        className="rounded-lg bg-theme-elevated border border-theme-border px-3 py-2 text-xs text-theme-text-faint font-mono max-h-64 overflow-auto space-y-0.5 leading-relaxed"
                      >
                        {logLines.map((line, idx) => (
                          <div key={idx} className={
                            line.includes('\u2717') ? 'text-red-400' :
                            line.includes('\u25b6') ? 'text-violet-300' :
                            line.includes('\u2713') ? 'text-emerald-400' :
                            line.includes('\u2502') ? 'text-theme-text-muted text-[11px]' :
                            line.includes('\u2298') ? 'text-yellow-400' :
                            'text-theme-text-faint'
                          }>{line}</div>
                        ))}
                      </div>
                    )
                  ) : null}
                </div>

                {/* Prompt (collapsible) */}
                {detail.prompt_content ? (
                  <details className="rounded-lg border border-theme-border">
                    <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-theme-text-secondary hover:bg-theme-elevated">分析 Prompt</summary>
                    <pre className="px-3 py-2 text-xs text-theme-text-secondary whitespace-pre-wrap break-all max-h-48 overflow-auto border-t border-theme-border">{detail.prompt_content}</pre>
                  </details>
                ) : null}

                {/* Result JSON (collapsible) */}
                {detail.result_json ? (
                  <details className="rounded-lg border border-theme-border" open={false}>
                    <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-theme-text-secondary hover:bg-theme-elevated">分析结果 (JSON)</summary>
                    <pre className="px-3 py-2 text-xs text-theme-text-secondary whitespace-pre-wrap break-all max-h-64 overflow-auto border-t border-theme-border">{JSON.stringify(detail.result_json, null, 2)}</pre>
                  </details>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ── Page header ─────────────────────────────────────────────────────── */}
 <section className="rounded-xl border border-theme-border bg-theme-surface p-6">
        <ServicePageTitle title="数据流分析任务" version={buildVersion} />
        <p className="mt-2 text-sm text-theme-text-muted">追踪污点传播路径，识别敏感数据流向危险函数的安全风险。</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: '总任务', value: taskStats.total, bg: 'bg-theme-elevated', text: 'text-theme-text-primary', border: 'border-theme-border' },
            { label: '运行中', value: taskStats.running + taskStats.pending, bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/20' },
            { label: '已通过', value: taskStats.passed, bg: 'bg-violet-500/15', text: 'text-violet-400', border: 'border-violet-500/20' },
            { label: '失败/取消', value: taskStats.failed + taskStats.error + taskStats.cancelled, bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/20' },
          ].map((s) => (
            <div key={s.label} className={`min-w-[96px] rounded-xl border ${s.border} ${s.bg} px-3 py-2`}>
              <p className={`text-lg font-semibold ${s.text}`}>{s.value}</p>
              <p className="mt-1 text-[11px] text-theme-text-muted">{s.label}</p>
            </div>
          ))}
        </div>
 <div className="mt-4 rounded-xl border border-theme-border bg-theme-surface p-5">
          <button
            type="button"
            onClick={() => setSlotPanelExpanded((current) => !current)}
            className="flex w-full flex-col gap-4 text-left lg:flex-row lg:items-start lg:justify-between"
          >
            <div>
              <h2 className="text-xl font-semibold text-theme-text-primary">执行槽位</h2>
              <p className="mt-1 text-sm text-theme-text-muted">展示当前数据流分析 worker 的执行槽位、活跃任务和心跳情况。</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-xs text-theme-text-muted">
                最近同步 {formatDateTime(slotSummary?.updated_at)}
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setShowSlotDetailModal(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-xs font-bold text-theme-text-secondary hover:bg-theme-elevated"
              >
                查看详情
              </button>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-theme-border bg-theme-surface text-theme-text-muted">
                {slotPanelExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </div>
              {slotSummaryLoading ? (
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-theme-text-muted">
                  <Loader2 size={13} className="animate-spin" />
                  刷新槽位数据中
                </div>
              ) : null}
            </div>
          </button>
          {slotPanelExpanded ? (
            <>
              <div className="mt-5 grid gap-3 md:grid-cols-4">
                {slotCards.map((card) => (
                  <div key={card.label} className={`rounded-2xl border ${card.border} ${card.bg} px-4 py-3`}>
                    <div className={`text-[11px] font-semibold uppercase tracking-[0.24em] ${card.text}`}>{card.label}</div>
                    <div className="mt-2 text-2xl font-bold text-theme-text-primary">{card.value}</div>
                    <div className="mt-1 text-[11px] text-theme-text-muted">{card.hint}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {pagedSlotWorkers.map((worker) => (
                  <div
                    key={worker.worker_id}
                    className={`rounded-2xl border px-4 py-3 ${
                      worker.healthy
                        ? 'border-theme-border bg-theme-elevated'
                        : 'border-rose-500/20 bg-rose-500/15'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-theme-text-primary" title={worker.worker_id}>{worker.host_name || worker.worker_id}</div>
                      <div className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        worker.healthy ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                      }`}>
                        {worker.healthy ? 'healthy' : 'unhealthy'}
                      </div>
                    </div>
                    <div className="mt-1 truncate text-[11px] text-theme-text-muted" title={worker.worker_id}>{worker.worker_id}</div>
                    <div className="mt-2 text-xs text-theme-text-secondary">
                      槽位 {worker.running_jobs}/{worker.max_concurrent_jobs}
                      {worker.available_slots >= 0 ?` · 空闲 ${worker.available_slots}` : ''}
                    </div>
                    <div className="mt-1 text-xs text-theme-text-muted">
                      来源 {worker.source || 'worker_registry'} · 心跳 {formatDateTime(worker.last_heartbeat_at)}
                    </div>
                    {worker.error ? (
                      <div className="mt-2 break-all text-[11px] text-rose-400">{worker.error}</div>
                    ) : null}
                  </div>
                ))}
                {slotSummary && slotWorkers.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-theme-border bg-theme-surface px-4 py-6 text-sm text-theme-text-muted">
                    当前未发现可用的数据流分析 worker。
                  </div>
                ) : null}
              </div>
              {slotSummary && slotWorkers.length > SLOT_WORKER_PAGE_SIZE ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
                  <div className="text-xs text-theme-text-muted">
                    当前显示 {Math.min((slotWorkerPageSafe - 1) * SLOT_WORKER_PAGE_SIZE + 1, slotWorkers.length)}
                    {' - '}
                    {Math.min(slotWorkerPageSafe * SLOT_WORKER_PAGE_SIZE, slotWorkers.length)}
                    {' / '}
                    {slotWorkers.length} 个 Worker
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setSlotWorkerPage((current) => Math.max(1, current - 1))}
                      disabled={slotWorkerPageSafe <= 1}
                      className="rounded-lg border border-theme-border bg-theme-elevated px-3 py-1.5 text-theme-text-secondary disabled:cursor-not-allowed disabled:opacity-40 hover:bg-theme-elevated"
                    >
                      上一页
                    </button>
                    <span className="text-theme-text-muted">第 {slotWorkerPageSafe}/{slotWorkerTotalPages} 页</span>
                    <button
                      type="button"
                      onClick={() => setSlotWorkerPage((current) => Math.min(slotWorkerTotalPages, current + 1))}
                      disabled={slotWorkerPageSafe >= slotWorkerTotalPages}
                      className="rounded-lg border border-theme-border bg-theme-elevated px-3 py-1.5 text-theme-text-secondary disabled:cursor-not-allowed disabled:opacity-40 hover:bg-theme-elevated"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              ) : null}
              {slotSummaryError ? (
                <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-400">
                  暂无槽位数据：{slotSummaryError}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </section>

      {showSlotDetailModal ? (
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm" onClick={() => setShowSlotDetailModal(false)}>
          <div className="w-full max-w-5xl rounded-2xl border border-theme-border bg-theme-surface" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-theme-border px-6 py-5">
              <div>
                <h3 className="mt-2 text-2xl font-bold tracking-tight text-theme-text-primary">执行槽位详情</h3>
                <p className="mt-2 text-sm text-theme-text-muted">按 worker 展示当前执行中的数据流分析任务与租约心跳状态。</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-xs text-theme-text-muted">
                  <button
                    type="button"
                    onClick={() => setSlotWorkerPage((current) => Math.max(1, current - 1))}
                    disabled={slotWorkerPageSafe <= 1}
                    className="rounded-lg border border-theme-border px-2.5 py-1 text-theme-text-secondary disabled:cursor-not-allowed disabled:opacity-40 hover:bg-theme-elevated"
                  >
                    上一页
                  </button>
                  <span>第 {slotWorkerPageSafe}/{slotWorkerTotalPages} 页</span>
                  <button
                    type="button"
                    onClick={() => setSlotWorkerPage((current) => Math.min(slotWorkerTotalPages, current + 1))}
                    disabled={slotWorkerPageSafe >= slotWorkerTotalPages}
                    className="rounded-lg border border-theme-border px-2.5 py-1 text-theme-text-secondary disabled:cursor-not-allowed disabled:opacity-40 hover:bg-theme-elevated"
                  >
                    下一页
                  </button>
                </div>
                <div className="text-right text-xs text-theme-text-muted">
                  <div>最近同步</div>
                  <div className="mt-1 font-semibold text-theme-text-muted">{formatDateTime(slotSummary?.updated_at)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSlotDetailModal(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-theme-border bg-theme-surface text-theme-text-secondary hover:bg-theme-elevated"
                  aria-label="关闭执行槽位详情"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="max-h-[75vh] overflow-auto px-6 py-5">
              {slotWorkers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-theme-border bg-theme-surface px-4 py-10 text-center text-sm text-theme-text-muted">
                  当前未发现可用的数据流分析 worker。
                </div>
              ) : (
                <div className="space-y-4">
                  {pagedSlotWorkers.map((worker) => {
                    const expanded = expandedSlotWorkerIds.includes(worker.worker_id);
                    const activeJobs = worker.active_jobs || [];
                    return (
                      <section
                        key={worker.worker_id}
                        className={`overflow-hidden rounded-xl border ${
                          worker.healthy ? 'border-theme-border bg-theme-elevated' : 'border-rose-500/20 bg-rose-50/70'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSlotWorkerExpanded(worker.worker_id)}
                          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-100/70"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-semibold text-theme-text-primary">{worker.host_name || worker.worker_id}</div>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                worker.healthy ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                              }`}>
                                {worker.healthy ? 'healthy' : 'unhealthy'}
                              </span>
                              <span className="rounded-full bg-theme-elevated px-2 py-0.5 text-[10px] font-bold text-theme-text-secondary">
                                活动任务 {activeJobs.length}
                              </span>
                            </div>
                            <div className="mt-1 text-[11px] text-theme-text-muted">{worker.worker_id}</div>
                            <div className="mt-2 flex flex-wrap gap-3 text-xs text-theme-text-muted">
                              <span>槽位 {worker.running_jobs}/{worker.max_concurrent_jobs}</span>
                              <span>空闲 {worker.available_slots}</span>
                              <span>来源 {worker.source || 'worker_registry'}</span>
                              <span>心跳 {formatDateTime(worker.last_heartbeat_at)}</span>
                            </div>
                          </div>
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-theme-border bg-theme-surface text-theme-text-muted">
                            {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} className="rotate-90" />}
                          </div>
                        </button>
                        {expanded ? (
                          <div className="border-t border-theme-border px-5 py-4">
                            {!worker.healthy ? (
                              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm text-rose-400">
                                Worker 当前不可用。{worker.error ?`原因：${worker.error}` : ''}
                              </div>
                            ) : activeJobs.length === 0 ? (
                              <div className="rounded-2xl border border-dashed border-theme-border bg-theme-surface px-4 py-8 text-center text-sm text-theme-text-muted">
                                当前无活跃数据流分析任务。
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {activeJobs.map((job) => (
                                  <div
                                    key={`${worker.worker_id}:${job.task_id}`}
                                    className={`rounded-2xl border px-4 py-4 ${
                                      job.mapped
                                        ? 'border-theme-border bg-theme-elevated'
                                        : 'border-amber-500/20 bg-amber-50/80'
                                    }`}
                                  >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <div className="truncate text-sm font-semibold text-theme-text-primary" title={job.task_name}>
                                            {job.task_name}
                                          </div>
                                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_COLOR[job.status] ?? 'bg-theme-elevated text-theme-text-secondary'}`}>
                                            {STATUS_LABEL[job.status] ?? job.status}
                                          </span>
                                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${getTaskModeBadgeClassName(job as Pick<AppDfaTaskItem, 'task_origin_type' | 'parent_task_type'>)}`}>
                                            {getWorkerJobModeLabel(job)}
                                          </span>
                                        </div>
                                        <div className="mt-2 grid gap-2 text-xs text-theme-text-muted md:grid-cols-2">
                                          <div className="truncate" title={job.task_id}>任务 ID: {job.task_id}</div>
                                          <div className="truncate" title={job.parent_task_id || '-'}>主任务: {job.parent_task_id || '-'}</div>
                                          <div className="truncate" title={job.input_path}>输入路径: {job.input_path}</div>
                                          <div>调度状态: {job.dispatch_status || '-'}</div>
                                          <div>开始时间: {formatDateTime(job.started_at)}</div>
                                          <div>最近更新: {formatDateTime(job.updated_at)}</div>
                                          <div>租约: {formatDateTime(job.execution_lease_until)}</div>
                                          <div>心跳: {formatDateTime(job.execution_heartbeat_at)}</div>
                                        </div>
                                      </div>
                                      <div className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                                        job.mapped ? 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400' : 'border-amber-500/20 bg-amber-500/15 text-amber-400'
                                      }`}>
                                        {job.mapped ? '已映射到当前 Worker' : '映射异常'}
                                        <div className="mt-1 max-w-[220px] break-words text-[11px] font-normal">{job.mapping_reason}</div>
                                      </div>
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
              {slotSummary && slotWorkers.length > SLOT_WORKER_PAGE_SIZE ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
                  <div className="text-xs text-theme-text-muted">
                    当前显示 {Math.min((slotWorkerPageSafe - 1) * SLOT_WORKER_PAGE_SIZE + 1, slotWorkers.length)}
                    {' - '}
                    {Math.min(slotWorkerPageSafe * SLOT_WORKER_PAGE_SIZE, slotWorkers.length)}
                    {' / '}
                    {slotWorkers.length} 个 Worker
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setSlotWorkerPage((current) => Math.max(1, current - 1))}
                      disabled={slotWorkerPageSafe <= 1}
                      className="rounded-lg border border-theme-border bg-theme-elevated px-3 py-1.5 text-theme-text-secondary disabled:cursor-not-allowed disabled:opacity-40 hover:bg-theme-elevated"
                    >
                      上一页
                    </button>
                    <span className="text-theme-text-muted">第 {slotWorkerPageSafe}/{slotWorkerTotalPages} 页</span>
                    <button
                      type="button"
                      onClick={() => setSlotWorkerPage((current) => Math.min(slotWorkerTotalPages, current + 1))}
                      disabled={slotWorkerPageSafe >= slotWorkerTotalPages}
                      className="rounded-lg border border-theme-border bg-theme-elevated px-3 py-1.5 text-theme-text-secondary disabled:cursor-not-allowed disabled:opacity-40 hover:bg-theme-elevated"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Task list ───────────────────────────────────────────────────────── */}
 <section className="rounded-2xl border border-theme-border bg-theme-surface p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-theme-text-primary">任务列表 <span className="text-sm font-normal text-theme-text-muted">({total})</span></h2>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="inline-flex items-center gap-2 rounded-lg border border-theme-border bg-theme-elevated px-3 py-1.5 text-xs text-theme-text-secondary">
              <input
                type="checkbox"
                checked={autoRefreshEnabled}
                onChange={(e) => setAutoRefreshEnabled(e.target.checked)}
              />
              自动刷新
            </label>
            <label className="inline-flex items-center gap-2 rounded-lg border border-theme-border bg-theme-elevated px-3 py-1.5 text-xs text-theme-text-secondary">
              间隔
              <input
                type="number"
                min={5}
                step={1}
                value={refreshIntervalSec}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setRefreshIntervalSec(Number.isFinite(value) ? Math.max(5, Math.floor(value)) : 5);
                }}
                className="w-16 rounded border border-theme-border bg-theme-elevated px-2 py-1 text-xs text-theme-text-secondary"
              />
              秒
            </label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="form-select text-xs"
              title="任务状态筛选"
            >
              <option value="">全部状态</option>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select
              value={modeFilter}
              onChange={(e) => { setModeFilter((e.target.value as '' | 'manual' | 'binary' | 'source') || ''); setPage(1); }}
              className="form-select text-xs"
              title="模式筛选"
            >
              <option value="">全部模式</option>
              <option value="manual">手动</option>
              <option value="binary">二进制模式</option>
              <option value="source">源码模式</option>
            </select>
            <input
              value={parentTaskIdFilter}
              onChange={(e) => { setParentTaskIdFilter(e.target.value); setPage(1); }}
              placeholder="筛选主任务ID"
              className="w-44 rounded-lg border border-theme-border bg-theme-elevated px-3 py-1.5 text-xs text-theme-text-secondary placeholder:text-theme-text-muted"
              title="按主任务 ID 筛选"
            />
            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
              className="form-select text-xs"
              title="排序字段"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>按{option.label}排序</option>
              ))}
            </select>
            <select
              value={sortOrder}
              onChange={(e) => { setSortOrder(e.target.value === 'asc' ? 'asc' : 'desc'); setPage(1); }}
              className="form-select text-xs"
              title="排序方向"
            >
              <option value="desc">降序</option>
              <option value="asc">升序</option>
            </select>
            <select
              value={perPage}
              onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
              className="form-select text-xs"
              title="每页显示条数"
            >
              {[10, 50, 100, 200, 500, 1000].map((n) => <option key={n} value={n}>{n}条/页</option>)}
            </select>
            <button onClick={() => void loadAll(page)} className="rounded-lg border border-theme-border p-2 text-theme-text-muted hover:bg-theme-elevated">
              <RefreshCw size={14} />
            </button>
            <button
              onClick={() => {
                setCreateModalOpen(true);
                setEntryList([]);
                setForm({ ...emptyForm, output_path:`/data/files/${projectId}/app/chimera-app-dataflow-analyse` });
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-800"
            >
              <Plus size={13} />新建任务
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-theme-text-muted">
          <span>
            自动刷新：{autoRefreshEnabled ?`开启（${Math.max(5, refreshIntervalSec)}s）` : '关闭'}
          </span>
          {autoRefreshEnabled && !hasActiveTasks ? (
            <span className="text-amber-400">当前无运行中任务，自动刷新暂不触发</span>
          ) : null}
          {autoRefreshEnabled && hasActiveTasks ? (
            <span className="text-violet-400">检测到活跃任务，按设定间隔自动刷新</span>
          ) : null}
        </div>

        {hasSelection ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-500/20 bg-violet-500/15 px-4 py-3">
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-theme-text-secondary">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={(e) => toggleAllPageSelection(e.target.checked)}
                />
                全选当前页（{tasks.length} 条）
              </label>
              <span className="text-sm font-semibold text-violet-400">已选择 {selectedTaskIds.size} 个任务</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => void handleBatchCancel()}
                disabled={batchCancelling || batchDeleting || batchRestarting}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-500/20 bg-theme-surface px-4 py-2 text-sm font-semibold text-amber-400 hover:bg-amber-500/15 disabled:opacity-50"
              >
                {batchCancelling ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                批量取消
              </button>
              <button
                onClick={() => void handleBatchRestart()}
                disabled={batchRestarting || batchCancelling || batchDeleting}
                className="inline-flex items-center gap-2 rounded-xl border border-violet-500/20 bg-theme-surface px-4 py-2 text-sm font-semibold text-violet-400 hover:bg-violet-500/15 disabled:opacity-50"
              >
                {batchRestarting ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                批量重试
              </button>
              <button
                onClick={() => setSelectedTaskIds(new Set())}
                disabled={batchDeleting || batchCancelling || batchRestarting}
                className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-4 py-2 text-sm font-semibold text-theme-text-secondary hover:bg-theme-elevated disabled:opacity-50"
              >
                清除选择
              </button>
              <button
                onClick={() => void handleBatchDelete()}
                disabled={batchDeleting || batchCancelling || batchRestarting}
                className="inline-flex items-center gap-2 rounded-xl border border-red-500/20 bg-theme-surface px-4 py-2 text-sm font-semibold text-red-400 hover:bg-red-500/15 disabled:opacity-50"
              >
                {batchDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                批量删除（{selectedTaskIds.size}）
              </button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-theme-text-muted py-6"><Loader2 size={14} className="animate-spin" />加载中...</div>
        ) : tasks.length === 0 ? (
          <div className="py-10 text-center text-sm text-theme-text-muted">暂无任务，点击右上角「新建任务」创建</div>
        ) : (
          <ExecutionTable minWidth={1280}>
            <ExecutionTableHead>
              <tr>
                <ExecutionTableTh className="w-12">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={(e) => toggleAllPageSelection(e.target.checked)}
                    aria-label="全选当前页任务"
                  />
                </ExecutionTableTh>
                <SortableHeader
                  label="任务"
                  active={sortBy === 'task_name'}
                  direction={sortOrder}
                  onClick={() => handleHeaderSort('task')}
                />
                <ExecutionTableTh>模式</ExecutionTableTh>
                <SortableHeader
                  label="状态"
                  active={sortBy === 'status'}
                  direction={sortOrder}
                  onClick={() => handleHeaderSort('status')}
                />
                <ExecutionTableTh>执行槽位</ExecutionTableTh>
                <ExecutionTableTh>重执行次数</ExecutionTableTh>
                <ExecutionTableTh>来源</ExecutionTableTh>
                <SortableHeader
                  label="创建时间"
                  active={sortBy === 'created_at'}
                  direction={sortOrder}
                  onClick={() => handleHeaderSort('created_at')}
                />
                <ExecutionTableTh>最近开始时间</ExecutionTableTh>
                <ExecutionTableTh>执行耗时</ExecutionTableTh>
                <SortableHeader
                  label="生命周期时长"
                  active={sortBy === 'started_at'}
                  direction={sortOrder}
                  onClick={() => handleHeaderSort('duration')}
                />
                <ExecutionTableTh className="text-right">操作</ExecutionTableTh>
              </tr>
            </ExecutionTableHead>
            <tbody>
              {tasks.map((t) => {
                const slotView = getExecutionSlotView(t, autoRefreshEnabled);
                return (
                <tr
                  key={t.task_id}
                  className={`${executionTableRowClassName} ${selectedTaskIds.has(t.task_id) ? 'bg-violet-50/60' : ''}`.trim()}
                >
                  <ExecutionTableTd>
                    <input
                      type="checkbox"
                      checked={selectedTaskIds.has(t.task_id)}
                      onChange={(e) => toggleTaskSelection(t.task_id, e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`选择任务 ${t.task_name}`}
                    />
                  </ExecutionTableTd>
                  <ExecutionTableTd className="min-w-[180px]">
                    <button
                      type="button"
                      onClick={() => handleSelectTask(t.task_id)}
                      className="text-left text-sm font-bold text-theme-text-primary hover:text-violet-400"
                      title={`查看任务 ${t.task_name}`}
                    >
                      {t.task_name}
                    </button>
                    {t.abnormal_reason_title && ['failed', 'error', 'cancelled'].includes(t.status) ? (
                      <div className="mt-1 text-xs text-red-400">
                        <span className="font-bold">{t.abnormal_reason_title}</span>
                        {t.abnormal_reason_code ? <span className="ml-2 font-mono uppercase tracking-[0.12em] text-red-500">{t.abnormal_reason_code}</span> : null}
                      </div>
                    ) : null}
                  </ExecutionTableTd>
                  <ExecutionTableTd className="whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleModeQuickFilter(getTaskMode(t))}
                      className={getQuickFilterButtonClassName(
                        modeFilter === getTaskMode(t),`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${getTaskModeBadgeClassName(t)}`
                      )}
                      title={modeFilter === getTaskMode(t) ? '再次点击取消模式筛选' : '点击按模式快速筛选'}
                    >
                      {getTaskModeLabel(t)}
                    </button>
                  </ExecutionTableTd>
                  <ExecutionTableTd>
                    <button
                      type="button"
                      onClick={() => toggleStatusQuickFilter(t.status)}
                      className={getQuickFilterButtonClassName(
                        statusFilter === t.status,`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${STATUS_COLOR[t.status] ?? 'bg-theme-elevated text-theme-text-secondary'}`
                      )}
                      title={statusFilter === t.status ? '再次点击取消状态筛选' : '点击按状态快速筛选'}
                    >
                      {STATUS_LABEL[t.status] ?? t.status}
                    </button>
                  </ExecutionTableTd>
                  <ExecutionTableTd className="min-w-[200px]">
                    <div className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${slotView.className}`}>
                      {slotView.label}
                    </div>
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
                  <ExecutionTableTd className="whitespace-nowrap text-xs text-theme-text-secondary">
                    <span
                      title={`重跑次数 ${Math.max(0, Number(t.rerun_count || 0))} · 执行代次 ${Math.max(0, Number(t.execution_epoch || 0))} · 控制面重跑 ${Math.max(0, Number(t.control_version || 0))} · lease_lost 回收 ${Math.max(0, Number(t.lease_lost_count || 0))}`}
                    >
                      {getTaskExecutionAttemptCount(t)}
                    </span>
                  </ExecutionTableTd>
                  <ExecutionTableTd className="min-w-[150px]">
                    {(t.parent_task_id || t.parent_task_display || t.origin_label) ? (
                      <button
                        type="button"
                        onClick={() => toggleSourceQuickFilter(t)}
                        className={getQuickFilterButtonClassName(
                          t.parent_task_id
                            ? parentTaskIdFilter === t.parent_task_id
                            : modeFilter === getTaskMode(t),
                          'inline-flex max-w-full items-center rounded-md border border-theme-border bg-theme-elevated px-2.5 py-1 font-mono text-xs font-semibold text-theme-text-secondary'
                        )}
                        title={
                          t.parent_task_id
                            ? (parentTaskIdFilter === t.parent_task_id ? '再次点击取消来源筛选' : '点击按来源快速筛选')
                            : (modeFilter === getTaskMode(t) ? '再次点击取消来源筛选' : '点击按来源快速筛选')
                        }
                      >
                        <span className="truncate" title={t.parent_task_display || t.parent_task_id || t.origin_label || '-'}>
                          {t.parent_task_display || t.parent_task_id || t.origin_label}
                        </span>
                      </button>
                    ) : (
                      <span className="text-xs text-theme-text-muted">-</span>
                    )}
                  </ExecutionTableTd>
                  <ExecutionTableTd className="whitespace-nowrap text-xs text-theme-text-muted">
                    {t.created_at ? new Date(t.created_at).toLocaleString('zh-CN') : '-'}
                  </ExecutionTableTd>
                  <ExecutionTableTd className="whitespace-nowrap text-xs text-theme-text-muted">
                    {t.latest_started_at
                      ? new Date(t.latest_started_at).toLocaleString('zh-CN')
                      : '-'}
                  </ExecutionTableTd>
                  <ExecutionTableTd className="whitespace-nowrap text-xs text-theme-text-muted">
                    {t.execution_duration_ms != null
                      ? formatDurationMs(t.execution_duration_ms)
                      : (ACTIVE_OR_TERMINAL_TASK_STATUSES.has(String(t.status || '').trim().toLowerCase())
                        ? formatDuration(t.started_at, t.finished_at, clockNow)
                        : '-')}
                  </ExecutionTableTd>
                  <ExecutionTableTd className="whitespace-nowrap text-xs text-theme-text-muted">
                    {formatDuration(t.started_at, t.finished_at, clockNow)}
                  </ExecutionTableTd>
                  <ExecutionTableTd className="text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); void handleDelete(t.task_id, t.task_name); }}
                      title="删除任务及输出文件"
                      className="inline-flex items-center justify-center rounded-lg p-1.5 text-theme-text-muted hover:bg-red-500/15 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </ExecutionTableTd>
                </tr>
              )})}
            </tbody>
          </ExecutionTable>
        )}

        {totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-lg border border-theme-border px-3 py-1.5 disabled:opacity-40">上一页</button>
            <span className="text-theme-text-muted">{page} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="rounded-lg border border-theme-border px-3 py-1.5 disabled:opacity-40">下一页</button>
          </div>
        ) : null}
      </section>

      {/* Create Task Modal */}
      {createModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setCreateModalOpen(false)} />
 <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-theme-border bg-theme-surface">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-theme-text-primary">新建数据流分析任务</h2>
                <button onClick={() => setCreateModalOpen(false)} className="rounded-lg p-1 text-theme-text-muted hover:text-theme-text-secondary"><X size={16} /></button>
              </div>

              {/* 任务名称 */}
              <label className="block text-sm text-theme-text-secondary">
                任务名称 <span className="text-red-500">*</span>
                <input
                  className="mt-1 w-full rounded-lg border border-theme-border px-3 py-2 text-sm"
                  value={form.task_name}
                  onChange={(e) => setForm((p) => ({ ...p, task_name: e.target.value }))}
                  placeholder="例：登录模块数据流分析-2025"
                />
              </label>

              {/* 源码路径 */}
              <label className="block text-sm text-theme-text-secondary">
                源码路径 <span className="text-red-500">*</span>
                <span className="ml-1 text-xs text-theme-text-muted">(待分析源代码所在目录)</span>
                <div className="mt-1 flex gap-1">
                  <input
                    className="flex-1 rounded-lg border border-theme-border px-3 py-2 text-sm font-mono"
                    value={form.input_path}
                    onChange={(e) => {
                      const v = e.target.value;
                      const elp =`${v.replace(/\/+$/, '')}/functions.list`;
                      setForm((p) => ({ ...p, input_path: v, entry_list_path: elp }));
                    }}
                    placeholder="/data/files/<project>/src"
                  />
                  <button
                    type="button"
                    title="浏览目录"
                    onClick={() => { setPickerTarget('input'); setPickerOpen(true); }}
                    className="flex items-center gap-1 rounded-lg border border-theme-border px-3 py-2 text-xs text-theme-text-secondary hover:bg-theme-elevated shrink-0"
                  >
                    <FolderOpen size={13} />浏览
                  </button>
                </div>
              </label>

              {/* 入口清单 (functions.list) */}
              <div className="rounded-xl border border-theme-border bg-theme-surface p-4 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-theme-text-muted flex items-center gap-1">
                  <List size={12} />入口函数 <span className="text-red-500">*</span>
                </div>

                {/* functions.list 路径 */}
                <label className="block text-xs text-theme-text-muted">
                  入口清单路径 <span className="text-theme-text-muted">(functions.list)</span>
                  <div className="mt-1 flex gap-1">
                    <input
                      className="flex-1 rounded-lg border border-theme-border bg-theme-elevated px-3 py-1.5 text-xs font-mono"
                      value={form.entry_list_path}
                      onChange={(e) => setForm((p) => ({ ...p, entry_list_path: e.target.value }))}
                      placeholder="/data/files/<project>/...output/functions.list"
                    />
                    <button
                      type="button"
                      title="浏览文件"
                      onClick={() => { setPickerTarget('entrylist'); setPickerOpen(true); }}
                      className="flex items-center gap-1 rounded-lg border border-theme-border bg-theme-elevated px-2 py-1.5 text-xs text-theme-text-secondary hover:bg-theme-elevated shrink-0"
                    >
                      <FolderOpen size={12} />浏览
                    </button>
                    <button
                      type="button"
                      onClick={() => void loadEntryList(form.entry_list_path)}
                      disabled={!form.entry_list_path.trim() || loadingEntryList}
                      className="flex items-center gap-1 rounded-lg border border-violet-500/20 bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-400 hover:bg-violet-500/15 disabled:opacity-40 shrink-0"
                    >
                      {loadingEntryList ? <Loader2 size={12} className="animate-spin" /> : <List size={12} />}
                      加载
                    </button>
                  </div>
                </label>

                {/* Entry function select */}
                {entryList.length > 0 ? (
                  <div>
                    <p className="text-xs text-theme-text-muted mb-1">从清单中选择入口函数（共 {entryList.length} 项）</p>
                    <select
                      className="form-select w-full text-xs font-mono"
                      value={form.source_file ?`${form.source_file}:${form.function_name}:${form.line_hint}` : ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        const found = entryList.find((i) =>`${i.source_file}:${i.function_name}:${i.line_hint}` === v);
                        if (found) {
                          setForm((p) => ({ ...p, source_file: found.source_file, function_name: found.function_name, line_hint: found.line_hint, taint_vars: found.taint_vars }));
                        }
                      }}
                    >
                      <option value="">-- 请选择入口函数 --</option>
                      {entryList.map((item, idx) => (
                        <option key={idx} value={`${item.source_file}:${item.function_name}:${item.line_hint}`}>
                          {item.function_name
                            ?`${item.source_file}  ${item.function_name}  ${item.line_hint}`
                            :`#${item.line_hint}  ${item.source_file}`}
                          {item.taint_vars ?`  [${item.taint_vars}]` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {/* 手动填写模块路径 + 函数名 */}
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs text-theme-text-muted">
                    模块路径 <span className="text-theme-text-muted">(自动填入或手填)</span>
                    <input
                      className="mt-1 w-full rounded-lg border border-theme-border bg-theme-elevated px-3 py-1.5 text-xs font-mono"
                      value={form.source_file}
                      onChange={(e) => setForm((p) => ({ ...p, source_file: e.target.value }))}
                      placeholder="libipsec.c"
                    />
                  </label>
                  <label className="block text-xs text-theme-text-muted">
                    入口函数名 <span className="text-red-500">*</span>
                    <input
                      className="mt-1 w-full rounded-lg border border-theme-border bg-theme-elevated px-3 py-1.5 text-xs font-mono"
                      value={form.function_name}
                      onChange={(e) => setForm((p) => ({ ...p, function_name: e.target.value }))}
                      placeholder="IPSEC_SOCKI_PipeMsg"
                    />
                  </label>
                </div>

                {/* 污点变量 */}
                <label className="block text-xs text-theme-text-muted">
                  污点参数 <span className="text-theme-text-muted">(逗号分隔，自动填入或手填；留空则分析全部参数)</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-theme-border bg-theme-elevated px-3 py-1.5 text-xs font-mono"
                    value={form.taint_vars}
                    onChange={(e) => setForm((p) => ({ ...p, taint_vars: e.target.value }))}
                    placeholder="pipe_id,pipe_type,msg_type"
                  />
                </label>

                {/* Derived prompt preview */}
                {form.function_name.trim() ? (
                  <div className="rounded-lg border border-violet-500/20 bg-violet-500/15 px-3 py-2">
                    <p className="text-[10px] text-violet-400 font-semibold uppercase tracking-wider mb-0.5">生成的分析指令</p>
                    <p className="text-xs font-mono text-violet-400">
                      {(() => {
                        const sf2 = form.source_file.trim();
                        const fn2 = form.function_name.trim();
                        const lh2 = form.line_hint.trim();
                        const tv2 = form.taint_vars.trim();
                        const base = sf2
                          ?`对 ${sf2} 的 ${fn2}${lh2 ? ' ' + lh2 : ''} 函数完成数据流安全分析`
                          :`对 ${fn2}${lh2 ? ' ' + lh2 : ''} 函数完成数据流安全分析`;
                        return tv2 ?`${base}，外部输入参数为: ${tv2}` : base;
                      })()}
                    </p>
                  </div>
                ) : null}
              </div>

              {/* 输出路径 */}
              <label className="block text-sm text-theme-text-secondary">
                输出路径 <span className="text-theme-text-muted text-xs">(留空自动填充)</span>
                <div className="mt-1 flex gap-1">
                  <input
                    className="flex-1 rounded-lg border border-theme-border px-3 py-2 text-sm font-mono"
                    value={form.output_path}
                    onChange={(e) => setForm((p) => ({ ...p, output_path: e.target.value }))}
                    placeholder="/data/files/<project>/app/chimera-app-dataflow-analyse"
                  />
                  <button
                    type="button"
                    title="浏览目录"
                    onClick={() => { setPickerTarget('output'); setPickerOpen(true); }}
                    className="flex items-center gap-1 rounded-lg border border-theme-border px-3 py-2 text-xs text-theme-text-secondary hover:bg-theme-elevated shrink-0"
                  >
                    <FolderOpen size={13} />浏览
                  </button>
                </div>
              </label>

              {/* 任务描述 */}
              <label className="block text-sm text-theme-text-secondary">
                任务描述 <span className="text-theme-text-muted text-xs">(可选)</span>
                <input
                  className="mt-1 w-full rounded-lg border border-theme-border px-3 py-2 text-sm"
                  value={form.task_description}
                  onChange={(e) => setForm((p) => ({ ...p, task_description: e.target.value }))}
                  placeholder="简要说明分析目标或安全关注点"
                />
              </label>

              <button
                onClick={() => void handleCreate()}
                disabled={creating || !form.task_name.trim() || !form.input_path.trim() || !form.function_name.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 hover:bg-violet-800"
              >
                {creating ? <Loader2 size={15} className="animate-spin" /> : null}
                创建数据流分析任务
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

// ── DFA Tree Node Component ───────────────────────────────────────────────────

const DfaTreeNodeView: React.FC<{ node: DfaTreeNode; depth?: number }> = ({ node, depth = 0 }) => {
  const [expanded, setExpanded] = useState(depth < 3);
  const hasChildren = node.children.length > 0;
  const shortName = node.name.includes('::')
    ? node.name.split('::').pop()!
    : node.name.split('/').pop() ?? node.name;

  return (
    <div>
      <div className={`flex items-center gap-1.5 py-0.5 px-1 rounded-sm min-h-5 ${node.status === 'running' ? 'bg-blue-500/15' : 'hover:bg-theme-elevated'}`}>
        {node.status === 'running'
          ? <Loader2 size={9} className="animate-spin text-blue-400 shrink-0" />
          : node.status === 'done'
          ? <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
          : <div className="w-1.5 h-1.5 rounded-full border border-theme-border shrink-0" />}
        <span
          className={`text-[11px] font-mono truncate ${
            node.status === 'running' ? 'text-blue-400 font-semibold max-w-[200px]' :
            node.status === 'done'    ? 'text-theme-text-secondary max-w-[200px]' :
                                        'text-theme-text-muted italic max-w-[200px]'
          }`}
          title={node.name}
        >{shortName}</span>
        <span className="text-[9px] text-theme-text-faint font-mono shrink-0">d{node.depth}</span>
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="ml-auto shrink-0 flex items-center gap-0.5 text-[10px] text-violet-400 hover:text-violet-400"
          >
            {expanded ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
            <span className="font-mono text-[9px]">{node.children.length}</span>
          </button>
        ) : null}
      </div>
      {hasChildren && expanded ? (
        <div className="ml-3 border-l border-dashed border-theme-border">
          {node.children.map((child, i) => (
            <DfaTreeNodeView key={`${child.name}-${i}`} node={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
};

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="w-20 shrink-0 text-xs text-theme-text-muted">{label}</span>
      <span className="text-xs text-theme-text-secondary min-w-0">{value}</span>
    </div>
  );
}
