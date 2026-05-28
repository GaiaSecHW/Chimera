import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowLeft, BarChart3, CheckCircle2, ChevronDown, ChevronUp, ClipboardCopy,
  FolderOpen, Loader2, PlayCircle, RefreshCw, RotateCcw, Search, ScrollText,
  Trash2, XCircle,
} from 'lucide-react';

import { api } from '../../clients/api';
import { FileWatchMessage } from '../../clients/fileserver';
import {
  AppEaEvaluationRound,
  AppEaSessionEvent,
  AppEaSessionIndex,
  AppEaSessionMeta,
  AppEaSessionSnapshot,
  AppEaStageEvent,
  AppEaStagesJson,
  AppEaTaskDetail,
  AppEaTaskEvent,
  AppEaTaskEvaluation,
  AppEaTaskResult,
  AppEaTaskRuntimeSummary,
  AppEaFunctionCatalogItem,
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
import { blobToText, buildSessionSnapshotFromText } from './sessionParsing';
import { EntryAnalysisTaskConfigPanel } from './TaskConfigPanels';
import { TaskOriginCard } from './taskOrigin';
import { WarningListPanel } from './WarningListPanel';
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

// ─── 完整模式 STAGE_STEPS（6步）────────────────────────────────────────────
const FULL_STAGE_STEPS = [
  {
    key: 'r1',
    label: 'R1 函数提取',
    desc: '静态扫描 + LLM 覆盖率验证，写入函数数据库',
    triggers: ['pipeline_start', 'r1_static_extract', 'r1_static_done',
               'r1_w_start', 'r1_w_done', 'r1_j_start', 'r1_j_done', 'r1_retry_scheduled'],
    artifactSubpath: 'run/workspace/r1-functions',
  },
  {
    key: 'r2',
    label: 'R2 准确性校正',
    desc: '每函数准确性验证（Judge），校正起止行',
    triggers: ['r2_j_start', 'r2_j_done'],
    artifactSubpath: 'run/workspace/r1-functions',
  },
  {
    key: 'r3',
    label: 'R3 外部输入分析',
    desc: '每函数外部输入分析（W+J），确定 has_external_input；与 CC 并行运行',
    triggers: ['r3_w_start', 'r3_w_done', 'r3_j_start', 'r3_j_done'],
    artifactSubpath: 'run/workspace/r2-analysis',
  },
  {
    key: 'cc',
    label: 'CC 调用链建图',
    desc: '静态建全模块调用图（与 R3 并行），为 R4 入口决策提供 caller 上下文',
    triggers: ['callchain_start', 'callchain_done', 'callchain_failed'],
    artifactSubpath: 'run/workspace/callchain',
  },
  {
    key: 'r4',
    label: 'R4 入口决策',
    desc: '每函数调用链判断 W + 证据验证 R4-J',
    triggers: [
      'r4_w_start', 'r4_w_done', 'r4_w_func_start', 'r4_w_func_done',
      'r4_j_start', 'r4_j_done', 'r6_j_start', 'r6_j_done',
    ],
    artifactSubpath: 'run/workspace/r3-entries',
  },
  {
    key: 'r5',
    label: 'R5/R6 报告生成',
    desc: '每入口函数生成报告 W+J + R6 最终聚合',
    triggers: ['r5_w_start', 'r5_j_start', 'r5_j_done', 'r5_done',
               'r6_script_done', 'r6_report_done',
               'task_end', 'functions_list_synced', 'functions_list_error'],
    artifactSubpath: 'output',
  },
];

// ─── 精简模式 STAGE_STEPS（3步）────────────────────────────────────────────
const LEAN_STAGE_STEPS = [
  {
    key: 'lean_file',
    label: '文件级分析',
    desc: '每文件：静态提取函数 → Worker 写脚本执行 → Judge 验证结果',
    triggers: ['pipeline_start', 'lean_static_extract', 'lean_static_done',
               'lean_w_start', 'lean_w_done', 'lean_j_start', 'lean_j_done'],
    artifactSubpath: 'run/workspace/lean-r3',
  },
  {
    key: 'lean_module',
    label: '模块级合并',
    desc: '汇总所有文件入口 → 模块级 Worker+Judge 去重精炼',
    triggers: ['lean_module_w_start', 'lean_module_w_done',
               'lean_module_j_start', 'lean_module_j_done'],
    artifactSubpath: 'run/workspace/lean-r4',
  },
  {
    key: 'lean_output',
    label: '产物输出',
    desc: '生成报告与 functions.list',
    triggers: ['lean_report_start', 'lean_report_done',
               'task_end', 'functions_list_synced', 'functions_list_error'],
    artifactSubpath: 'output',
  },
];


type DetailTab = 'overview' | 'timeline' | 'task-config' | 'session' | 'relationship' | 'result' | 'evaluation';
type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

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
  return 'border-slate-200 bg-white text-slate-700';
}

function timelineEventTypeTone(eventType?: string | null) {
  const normalized = String(eventType || '').trim();
  if (normalized === 'agent_process_manual_kill') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (normalized === 'agent_process_bulk_manual_kill') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-white text-slate-700';
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
    operator !== '-' ? `操作人 ${operator}` : '',
    pid !== '-' ? `PID ${pid}` : '',
    podName !== '-' ? `Pod ${podName}` : '',
    killMode !== '-' ? `方式 ${killMode}` : '',
  ].filter(Boolean).join(' · ');
}

function timelineMessageSummary(event: any) {
  const payload = event.payload || event.payload_json || {};
  const summary = timelineAuditSummary(payload);
  return summary || event.message || '-';
}

function formatDuration(startedAt?: string | null, finishedAt?: string | null): string {
  if (!startedAt || !finishedAt) return '-';
  const secs = Math.max(0, Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000));
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m${secs % 60}s`;
}

function formatLiveDuration(startedAt?: string | null, nowSecs = Math.floor(Date.now() / 1000)): string {
  if (!startedAt) return '-';
  const secs = Math.max(0, nowSecs - Math.floor(new Date(startedAt).getTime() / 1000));
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m${secs % 60}s`;
}

function formatNumber(value: unknown, digits = 0): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return num.toLocaleString('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function formatRate(value: unknown): string {
  const num = Number(value);
  return Number.isFinite(num) ? `${Math.round(num * 100)}%` : '-';
}

function formatMs(value: unknown): string {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms <= 0) return '-';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m${seconds % 60}s`;
}

/** 阶段耗时：两个 Unix 时间戳（秒）之差 */
function formatStageDuration(startTs?: number, endTs?: number): string {
  if (!startTs || !endTs || endTs <= startTs) return '';
  const secs = Math.max(0, Math.round(endTs - startTs));
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m${secs % 60}s`;
}

/** 阶段进行中：从 startTs 到 nowSecs 的已用时 */
function formatStageElapsed(startTs?: number, nowSecs = Math.floor(Date.now() / 1000)): string {
  if (!startTs) return '';
  const secs = Math.max(0, nowSecs - startTs);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m${secs % 60}s`;
}

interface StageStat {
  filesTotal?: number;
  filesDone?: number;
  funcsDone?: number;
  entriesFound?: number;
  attempts?: number;
  nodeCount?: number;
  edgeCount?: number;
  ccStatus?: 'pending'|'running'|'done'|'failed';
  startTs?: number;
  lastTs?: number;
}

/**
 * 从 stages_json.events 推导完整模式各阶段统计。
 * 6 阶段: 0=R1 1=R2 2=R3 3=CC 4=R4 5=R5
 */
function deriveFullStageStats(events: AppEaStageEvent[]): StageStat[] {
  const result: StageStat[] = FULL_STAGE_STEPS.map(() => ({}));
  let totalFiles = 0;
  const firstTs: Array<number | undefined> = FULL_STAGE_STEPS.map(() => undefined);
  const lastTs:  Array<number | undefined> = FULL_STAGE_STEPS.map(() => undefined);

  const r1Files   = new Set<string>();
  const r2Funcs   = new Set<string>();
  const r3Funcs   = new Set<string>();
  const r4Funcs   = new Set<string>();
  let ccNodes = 0, ccEdges = 0, ccStatus: 'pending'|'running'|'done'|'failed' = 'pending';
  let entriesFound = 0;

  const touch = (idx: number, ts: number) => {
    if (ts <= 0) return;
    if (firstTs[idx] === undefined) firstTs[idx] = ts;
    if (lastTs[idx] === undefined || ts > (lastTs[idx] as number)) lastTs[idx] = ts;
  };

  for (const evt of events) {
    const ts = evt.ts || 0;
    const d  = evt.data || {};
    switch (evt.type) {
      // R1 (idx=0)
      case 'pipeline_start': totalFiles = Number(d.file_count) || totalFiles; touch(0, ts); break;
      case 'r1_static_extract': case 'r1_static_done': touch(0, ts); break;
      case 'r1_w_start': case 'r1_j_start': case 'r1_retry_scheduled': touch(0, ts); break;
      case 'r1_w_done': touch(0, ts); if (d.file_hash) r1Files.add(String(d.file_hash)); break;
      case 'r1_j_done': touch(0, ts); break;
  // R2 (idx=1) — 只有 Judge，无 Worker 步骤
      case 'r2_j_start': touch(1, ts); break;
      case 'r2_j_done': touch(1, ts); if (d.func_hash) r2Funcs.add(String(d.func_hash)); break;
      // R3 (idx=2) — 与 CC 并行
      case 'r3_w_start': case 'r3_j_start': touch(2, ts); break;
      case 'r3_w_done': touch(2, ts); if (d.func_hash) r3Funcs.add(String(d.func_hash)); break;
      case 'r3_j_done': touch(2, ts); break;
      // CC (idx=3) — R4 前置，与 R3 并行
      case 'callchain_start': touch(3, ts); ccStatus = 'running'; break;
      case 'callchain_done':
        touch(3, ts); ccStatus = 'done';
        ccNodes = Number(d.nodes) || ccNodes; ccEdges = Number(d.edges) || ccEdges; break;
      case 'callchain_failed': touch(3, ts); ccStatus = 'failed'; break;
      // R4 (idx=4) — 需要 R3+CC 并行完成
      case 'r4_w_start': case 'r4_w_func_start': touch(4, ts); break;
      case 'r4_w_done': touch(4, ts); break;
      case 'r4_w_func_done': touch(4, ts);
        if (d.func_hash && d.decision === 'keep') r4Funcs.add(String(d.func_hash)); break;
      case 'r6_j_start': touch(4, ts); break;
      case 'r6_j_done':
        touch(4, ts);
        if (typeof d.entry_count === 'number') entriesFound = d.entry_count; break;
      // R5 (idx=5)
      case 'r5_w_start': case 'r5_j_done': touch(5, ts); break;
      case 'r5_done':
        touch(5, ts);
        if (typeof d.entry_count === 'number') entriesFound = d.entry_count; break;
      case 'task_end': case 'functions_list_synced': case 'functions_list_error':
      case 'functions_list_autofix': touch(5, ts); break;
      default: break;
    }
  }

  result[0] = { filesTotal: totalFiles || undefined, filesDone: r1Files.size || undefined, startTs: firstTs[0], lastTs: lastTs[0] };
  result[1] = { funcsDone: r2Funcs.size || undefined, startTs: firstTs[1], lastTs: lastTs[1] };
  result[2] = { funcsDone: r3Funcs.size || undefined, startTs: firstTs[2], lastTs: lastTs[2] };
  result[3] = {
    nodeCount: ccNodes || undefined,
    edgeCount: ccEdges || undefined,
    ccStatus,
    startTs: firstTs[3], lastTs: lastTs[3],
  };
  result[4] = {
    funcsDone:    r4Funcs.size || undefined,
    entriesFound: entriesFound || undefined,
    startTs: firstTs[4], lastTs: lastTs[4],
  };
  result[5] = { entriesFound: entriesFound || undefined, startTs: firstTs[5], lastTs: lastTs[5] };
  return result;
}

/** 精简模式各阶段统计 */
interface LeanFileStat {
  file: string;
  file_hash: string;
  func_count?: number;
  static_done: boolean;
  w_state: string;
  w_attempts: number;
  j_state: string;
  j_attempts: number;
  entries?: number;
}

function deriveLeanStageStats(events: AppEaStageEvent[]): { stats: StageStat[]; files: LeanFileStat[] } {
  const stats: StageStat[] = LEAN_STAGE_STEPS.map(() => ({}));
  const firstTs: Array<number | undefined> = LEAN_STAGE_STEPS.map(() => undefined);
  const lastTs:  Array<number | undefined> = LEAN_STAGE_STEPS.map(() => undefined);
  const fileMap = new Map<string, LeanFileStat>();
  let totalFiles = 0;
  let moduleEntries = 0;

  const touch = (idx: number, ts: number) => {
    if (ts <= 0) return;
    if (firstTs[idx] === undefined) firstTs[idx] = ts;
    if (lastTs[idx] === undefined || ts > (lastTs[idx] as number)) lastTs[idx] = ts;
  };

  for (const evt of events) {
    const ts = evt.ts || 0;
    const d  = evt.data || {};
    const fh = String(d.file_hash || '');
    const fname = String(d.file || fh);
    switch (evt.type) {
      case 'pipeline_start': totalFiles = Number(d.file_count) || totalFiles; touch(0, ts); break;
      case 'lean_static_extract': touch(0, ts);
        if (fh && !fileMap.has(fh)) fileMap.set(fh, { file: fname, file_hash: fh, static_done: false, w_state: 'pending', w_attempts: 0, j_state: 'pending', j_attempts: 0 }); break;
      case 'lean_static_done': touch(0, ts);
        if (fh) {
          const f = fileMap.get(fh) || { file: fname, file_hash: fh, static_done: false, w_state: 'pending', w_attempts: 0, j_state: 'pending', j_attempts: 0 };
          f.static_done = true; f.func_count = Number(d.func_count) || f.func_count;
          fileMap.set(fh, f);
        } break;
      case 'lean_w_start': touch(0, ts);
        if (fh) { const f = fileMap.get(fh); if (f) { f.w_state = 'running'; f.w_attempts = Number(d.attempt) || f.w_attempts; } } break;
      case 'lean_w_done': touch(0, ts);
        if (fh) { const f = fileMap.get(fh); if (f) f.w_state = 'passed'; } break;
      case 'lean_j_start': touch(0, ts);
        if (fh) { const f = fileMap.get(fh); if (f) { f.j_state = 'running'; f.j_attempts = Number(d.attempt) || f.j_attempts; } } break;
      case 'lean_j_done': touch(0, ts);
        if (fh) {
          const f = fileMap.get(fh);
          if (f) {
            f.j_state = d.passed ? 'passed' : 'failed';
            if (d.passed && typeof d.entries === 'number') f.entries = d.entries;
          }
        } break;
      case 'lean_module_w_start': case 'lean_module_j_start': touch(1, ts); break;
      case 'lean_module_w_done': case 'lean_module_j_done': touch(1, ts);
        if (typeof d.entries === 'number') moduleEntries = d.entries; break;
      case 'lean_report_start': touch(2, ts); break;
      case 'lean_report_done': touch(2, ts); break;
      case 'task_end': case 'functions_list_synced': case 'functions_list_error': touch(2, ts); break;
      default: break;
    }
  }

  const doneFiles = Array.from(fileMap.values()).filter((f) => f.j_state === 'passed').length;
  const totalEntries = moduleEntries || Array.from(fileMap.values()).reduce((s, f) => s + (f.entries || 0), 0);
  stats[0] = { filesTotal: totalFiles || fileMap.size || undefined, filesDone: doneFiles || undefined, startTs: firstTs[0], lastTs: lastTs[0] };
  stats[1] = { entriesFound: totalEntries || undefined, startTs: firstTs[1], lastTs: lastTs[1] };
  stats[2] = { entriesFound: totalEntries || undefined, startTs: firstTs[2], lastTs: lastTs[2] };

  const files = Array.from(fileMap.values());
  files.sort((a, b) => a.file.localeCompare(b.file));
  return { stats, files };
}


function stageLabel(stage: string | undefined): string {
  const labels: Record<string, string> = {
    extract:  '函数读取',
    coverage: '覆盖率验证',
    pipeline: '函数流水线',
    report:   '报告生成',
    init: '模块加载', r1a: 'R1a 覆盖率', r1b: 'R1b 准确性',
    r2: 'R2 外部输入', r3: 'R3 过滤', cc: 'CC 调用链',
    r4: 'R4 跨文件', r1: 'R1 函数提取', finish: '生成结果',
    analyse: '入口分析', judge: '裁判综合',
  };
  return labels[stage || ''] || stage || '-';
}

function evaluationStatusTone(status?: string) {
  if (status === 'passed') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'failed') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'running') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === 'partial') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'skipped') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-100 text-slate-600';
}

function evaluationRoundKey(round: AppEaEvaluationRound): string {
  return [
    round.round ?? '',
    round.stage_round ?? '',
    round.stage ?? '',
    round.module_name ?? '',
    round.source_path ?? '',
  ].join('::');
}

function extractFsRelPath(path: string, projectId: string): string | null {
  const prefix = `/data/files/${projectId}`;
  if (!path.startsWith(prefix)) return null;
  const rel = path.slice(prefix.length).replace(/\/+$/, '');
  return rel.startsWith('/') ? rel : `/${rel}`;
}

function openInFileExplorer(fsPath: string) {
  const normalizedPath = fsPath.startsWith('/') ? fsPath : `/${fsPath}`;
  sessionStorage.setItem('secflow:fileExplorerNavigatePath', normalizedPath);
  window.dispatchEvent(new CustomEvent('secflow-navigate-view', { detail: { view: 'project-file-explorer', path: normalizedPath } }));
}

function normalizeJoinPath(basePath: string, relativePath: string): string {
  return `${basePath.replace(/\/+$/, '')}/${relativePath.replace(/^\/+/, '')}`;
}

function formatSessionMtime(value?: number) {
  if (!value) return '-';
  return new Date(value * 1000).toLocaleString('zh-CN');
}

function sessionRoleLabel(role?: string) {
  if (role === 'judge' || role?.startsWith('r') && role.endsWith('_judge')) return role?.startsWith('r') ? role.replace('_judge', '-J').toUpperCase() : 'Judge';
  if (role === 'r1_worker') return 'R1-W';
  if (role === 'r2_worker') return 'R2-W';
  if (role === 'r3_worker') return 'R3-W';
  if (role === 'r4_worker') return 'R4-W';
  if (role === 'sub_worker') return 'Sub Worker';
  if (role === 'worker') return 'Worker';
  if (role === 'master' || role === 'master_worker') return 'Master';
  return role || 'Agent';
}

function sessionRoleTone(role?: string) {
  if (role === 'judge' || role?.endsWith('_judge')) return 'border-amber-200 bg-amber-50 text-amber-700';
  if (role === 'r1_worker') return 'border-sky-200 bg-sky-50 text-sky-700';
  if (role === 'r2_worker') return 'border-indigo-200 bg-indigo-50 text-indigo-700';
  if (role === 'r3_worker') return 'border-teal-200 bg-teal-50 text-teal-700';
  if (role === 'r4_worker') return 'border-cyan-200 bg-cyan-50 text-cyan-700';
  if (role === 'sub_worker') return 'border-violet-200 bg-violet-50 text-violet-700';
  if (role === 'master' || role === 'master_worker') return 'border-cyan-200 bg-cyan-50 text-cyan-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function getEntryAnalysisRiskPreset(riskKey: string): { label: string; description: string; statusReason: string } | null {
  if (riskKey === 'queue-pressure') {
    return {
      label: '排队堆积',
      description: '当前重点确认该任务是否存在长时间等待、迟迟未被调度，或阶段推进慢于集群整体节奏。',
      statusReason: '这类问题通常从等待中任务开始排查。',
    };
  }
  if (riskKey === 'timeout-high') {
    return {
      label: '超时偏高',
      description: '当前重点核查该任务是否存在长耗时阶段、会话停滞、超时退出或多次重试未收敛。',
      statusReason: '这类问题通常优先查看失败任务和长耗时会话。',
    };
  }
  if (riskKey === 'low-pass-rate') {
    return {
      label: '最终通过率偏低',
      description: '当前重点检查评审闭环、反思与重分类是否没有收敛，导致任务最终未通过。',
      statusReason: '这类问题通常优先查看失败任务与 Judge/复盘会话。',
    };
  }
  if (riskKey === 'healthy') {
    return {
      label: '整体平稳',
      description: '当前主要是抽样观察活跃任务，确认阶段推进和会话记录链路是否正常。',
      statusReason: '这类问题通常优先查看运行中的会话样本。',
    };
  }
  return null;
}

function getEntryAnalysisDetailRecommendationReason(params: {
  stageFocusHint: 'R1' | 'R2' | 'R3' | 'R4' | 'CC' | '';
  riskPreset: { label: string; description: string; statusReason: string } | null;
  detailStatus?: string;
  focusedSessionGroup: { activeCount: number; latestMtime: number; recommended: AppEaSessionMeta | null } | null;
}): string[] {
  const reasons: string[] = [];
  if (params.stageFocusHint) {
    reasons.push(`当前带着 ${params.stageFocusHint} 阶段线索进入详情页，系统会优先把会话、关系图和推荐分组聚焦到这一阶段。`);
  }
  if (params.riskPreset) {
    reasons.push(`当前带着“${params.riskPreset.label}”风险意图进入详情页，所以会优先关注更符合该风险模式的状态、会话和长耗时信号。`);
  }
  if (params.detailStatus && ['running', 'pending'].includes(params.detailStatus)) {
    reasons.push('这条任务当前仍处于活跃或等待状态，更适合继续观察实时推进、排队与会话追加内容。');
  } else if (params.detailStatus && ['failed', 'error', 'cancelled'].includes(params.detailStatus)) {
    reasons.push('这条任务已经进入异常或终止状态，更适合直接回看失败阶段、Judge 评审和最终未收敛的会话。');
  }
  if (params.focusedSessionGroup?.activeCount) {
    reasons.push(`当前已命中一个更相关的会话分组，里面还有 ${params.focusedSessionGroup.activeCount} 个活跃会话，可直接下钻继续排查。`);
  } else if (params.focusedSessionGroup?.recommended) {
    reasons.push(`当前已命中推荐会话 ${params.focusedSessionGroup.recommended.display_name}，可直接查看最贴近线索的历史会话。`);
  }
  return reasons;
}

function parseParts(content: unknown): Array<Record<string, any>> {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  if (!Array.isArray(content)) return [];
  return content.map((item) => {
    const part = item && typeof item === 'object' ? item as Record<string, any> : {};
    if (part.type === 'text') return { type: 'text', text: part.text || '' };
    if (part.type === 'thinking') return { type: 'thinking', text: part.thinking || '' };
    if (part.type === 'toolCall') return { type: 'toolCall', name: part.name || '', id: part.id || '', arguments: part.arguments || {} };
    if (part.type === 'toolResult') return { type: 'toolResult', text: part.text || '' };
    return { type: 'unknown', detail: JSON.stringify(part).slice(0, 200) };
  });
}

function parseSessionDelta(lines: string[], startLine: number): { events: AppEaSessionEvent[]; warnings: string[]; sessionMeta: Record<string, any> | null } {
  const events: AppEaSessionEvent[] = [];
  const warnings: string[] = [];
  let sessionMeta: Record<string, any> | null = null;
  lines.forEach((raw, index) => {
    const lineNo = startLine + index;
    const line = String(raw || '').trim();
    if (!line) return;
    let obj: Record<string, any>;
    try {
      obj = JSON.parse(line);
    } catch {
      warnings.push(`第 ${lineNo} 行 JSON 解析失败`);
      events.push({ type: 'raw', line: lineNo, event_index: lineNo, raw_line: line.slice(0, 200), summary: line.slice(0, 200) });
      return;
    }
    if (obj.type === 'session') {
      sessionMeta = { id: obj.id || '', version: obj.version || '', timestamp: obj.timestamp || '', cwd: obj.cwd || '' };
      return;
    }
    if (obj.type === 'model_change') {
      events.push({ type: 'model_change', line: lineNo, event_index: lineNo, timestamp: obj.timestamp || '', display_timestamp: obj.timestamp || '', provider: obj.provider || '', modelId: obj.modelId || '', raw_line: line });
      return;
    }
    if (obj.type === 'thinking_level_change') {
      events.push({ type: 'thinking_level_change', line: lineNo, event_index: lineNo, timestamp: obj.timestamp || '', display_timestamp: obj.timestamp || '', thinkingLevel: obj.thinkingLevel || '', thinkingLevelClass: `thinking-${obj.thinkingLevel || 'off'}`, raw_line: line });
      return;
    }
    if (obj.type === 'message') {
      const msg = obj.message && typeof obj.message === 'object' ? obj.message : {};
      const role = String(msg.role || '');
      const eventData: AppEaSessionEvent = { type: 'message', line: lineNo, event_index: lineNo, timestamp: obj.timestamp || '', display_timestamp: obj.timestamp || '', role, render_role: role, parts: parseParts(msg.content || []), raw_line: line };
      if (role === 'toolResult') {
        eventData.toolCallId = msg.toolCallId || msg.tool_call_id || '';
        eventData.toolName = msg.toolName || msg.tool_name || '';
        eventData.isError = Boolean(msg.isError || msg.is_error);
      }
      events.push(eventData);
      return;
    }
    events.push({ type: String(obj.type || 'unknown_event'), line: lineNo, event_index: lineNo, display_timestamp: obj.timestamp || '', raw_line: line, summary: JSON.stringify(obj).slice(0, 200) });
  });
  return { events, warnings, sessionMeta };
}

function deriveStepStatuses(taskStatus: string, events: AppEaStageEvent[], stageSteps: typeof FULL_STAGE_STEPS): StepStatus[] {
  const statuses: StepStatus[] = stageSteps.map((): StepStatus => 'pending');
  if (taskStatus === 'pending') return statuses;
  if (taskStatus === 'passed') return stageSteps.map((): StepStatus => 'completed');
  let last = -1;
  // CC 独立跟踪（非致命，失败不阻断 R4）
  let ccDone = false, ccFailed = false;
  for (const evt of events) {
    if (evt.type === 'callchain_done')   ccDone   = true;
    if (evt.type === 'callchain_failed') ccFailed = true;
    stageSteps.forEach((step, index) => {
      if (step.triggers.includes(evt.type)) last = Math.max(last, index);
    });
  }
  if (last < 0) {
    statuses[0] = taskStatus === 'running' ? 'running'
      : ['failed', 'error', 'cancelled'].includes(taskStatus) ? 'failed' : 'pending';
    return statuses;
  }
  for (let i = 0; i < stageSteps.length; i += 1) {
    const isCCStage = stageSteps[i].key === 'cc';
    if (isCCStage && ccFailed && !ccDone) {
      // CC 建图失败（非致命）：标记 failed 但不阻断后续阶段
      statuses[i] = 'failed';
    } else if (i < last) {
      statuses[i] = 'completed';
    } else if (i === last) {
      statuses[i] = ['failed', 'error', 'cancelled'].includes(taskStatus) ? 'failed' : 'running';
    }
  }
  return statuses;
}

function formatEvent(evt: AppEaStageEvent): string {
  const ts = new Date(evt.ts * 1000).toLocaleTimeString('zh-CN');
  const d = evt.data || {};
  switch (evt.type) {
    // ── 公共 ──────────────────────────────────────────────────────────
    case 'task_start':   return `[${ts}] ▶ 任务开始`;
    case 'task_resume':  return `[${ts}] ↩ 断点续跑 start_round=${d.start_round ?? ''}`;
    case 'module_load':  return `[${ts}] ▶ 加载模块: ${d.module ?? ''}`;
    case 'module_found': return `[${ts}] │ 模块文件: ${d.file_count ?? d.files?.length ?? ''} 个`;
    case 'module_ready': return `[${ts}] ✓ 模块就绪 ${d.count ?? ''} 个文件`;
    case 'error':        return `[${ts}] ✗ 错误: ${d.error ?? JSON.stringify(d)}`;
    case 'task_end':     return `[${ts}] ✓ 任务结束 status=${d.status ?? ''}`;
    // ── R1 函数提取 ───────────────────────────────────────────────────
    case 'r1_static_extract':   return `[${ts}] │ R1 静态提取: ${d.file ?? ''}（${d.file_hash ?? ''}）`;
    case 'r1_static_done':      return `[${ts}] │ R1 静态完成: ${d.file ?? ''} → ${d.count ?? 0} 个函数`;
    case 'r1_w_start':    return `[${ts}] ▶ R1-W 启动: ${d.file ?? ''}${d.is_retry ? '（重试）' : ''}`;
    case 'r1_w_done':     return `[${ts}] ✓ R1-W 完成: ${d.file ?? ''} in=${d.tokens_in ?? 0} out=${d.tokens_out ?? 0}${d.error ? ` ✗${d.error.slice(0, 60)}` : ''}`;
    case 'r1_j_start':          return `[${ts}] ▶ R1-J 覆盖率评审: ${d.file ?? d.file_hash ?? ''}（第${d.attempt ?? 1}次）`;
    case 'r1_j_done':           return `[${ts}] ${d.passed ? '✓' : '✗'} R1-J 覆盖率评审 ${d.passed ? '通过' : '未通过'}: ${d.file ?? ''}${d.feedback ? ` — ${String(d.feedback).slice(0, 80)}` : ''}`;
    case 'r1_j_retry': case 'r1_retry_scheduled': return `[${ts}] ↺ R1 重试: ${d.file ?? ''} (第${d.attempt ?? '?'}次)`;
    // ── R2 准确性校正 ─────────────────────────────────────────────────
    case 'r2_w_start':          return `[${ts}] ▶ R2-W 启动: ${d.function ?? d.func_hash ?? ''}${Number(d.attempt) > 1 ? `(第${d.attempt}次)` : ''}`;
    case 'r2_w_done':           return `[${ts}] ${d.passed ? '✓' : '✗'} R2-W 完成: ${d.function ?? d.func_hash ?? ''}${!d.passed && d.error ? ` — ${d.error}` : ''}`;
    case 'r2_j_start':          return `[${ts}] ▶ R2-J 准确性验证: ${d.function ?? d.func_hash ?? ''}`;
    case 'r2_j_done':           return `[${ts}] ${d.passed ? '✓' : '✗'} R2-J 准确性验证 ${d.passed ? '通过' : '未通过'}: ${d.function ?? d.func_hash ?? ''}${d.feedback ? ` — ${String(d.feedback).slice(0, 80)}` : ''}`;
    // ── R3 外部输入分析 ───────────────────────────────────────────────
    case 'r3_w_start':          return `[${ts}] ▶ R3-W 外部输入分析: ${d.function ?? d.func_hash ?? ''}`;
    case 'r3_w_done':           return `[${ts}] ✓ R3-W 完成: ${d.function ?? d.func_hash ?? ''} has_input=${d.has_external_input ?? ''}`;
    case 'r3_j_start':          return `[${ts}] ▶ R3-J 外部输入验证: ${d.function ?? d.func_hash ?? ''}`;
    case 'r3_j_done':           return `[${ts}] ${d.passed ? '✓' : '✗'} R3-J 外部输入验证 ${d.passed ? '通过' : '未通过'}: ${d.function ?? d.func_hash ?? ''}${d.summary ? ` — ${String(d.summary).slice(0, 80)}` : ''}`;
    case 'r3_j_retry':          return `[${ts}] ↺ R3 重试: ${d.function ?? ''} (${d.retry_count ?? '?'}次)`;
    // ── CC 调用链静态建图 ─────────────────────────────────────────────
    case 'callchain_start':     return `[${ts}] ▶ CC 调用链静态建图开始`;
    case 'callchain_done':      return `[${ts}] ✓ CC 完成: ${d.nodes ?? 0} 节点, ${d.edges ?? 0} 边`;
    case 'callchain_failed':    return `[${ts}] ⚠ CC 建图失败（非致命）: ${String(d.error ?? '').slice(0, 80)}`;
    // ── R4 调用链入口判断 ─────────────────────────────────────────────
    case 'r4_w_start':      return `[${ts}] ▶ R4-W 调用链判断: ${d.function ?? d.func_hash ?? ''}${d.quick_path ? '【快速路径】' : ''}(第${d.attempt ?? 1}次)`;
    case 'r4_w_done':       return `[${ts}] ${d.decision === 'keep' || !d.decision ? '✓' : '✕'} R4-W 决策: ${d.function ?? d.func_hash ?? ''} → ${d.decision === 'remove' ? 'filter' : (d.decision ?? 'keep')}${d.quick_path ? '【快速路径】' : ''}`;
    case 'r4_w_func_start': return `[${ts}] ▶ R4-W 调用链判断: ${d.function ?? d.func_hash ?? ''}(第${d.attempt ?? 1}次)`;
    case 'r4_w_func_done':  return `[${ts}] ${d.decision === 'keep' ? '✓' : '✕'} R4-W 决策: ${d.function ?? d.func_hash ?? ''} → ${d.decision ?? ''}`;
    case 'r4_j_start':      return `[${ts}] ▶ R4-J 调用链验证: ${d.function ?? d.func_hash ?? ''}(第${d.attempt ?? 1}次)`;
    case 'r4_j_done':       return `[${ts}] ${d.passed ? '✓' : '✗'} R4-J 验证 ${d.passed ? '通过' : '未通过'}: ${d.function ?? d.func_hash ?? ''}${!d.passed && d.feedback ? `—${String(d.feedback).slice(0,60)}` : ''}`;
    case 'r4_j_retry':      return `[${ts}] ↺ R4 重试: ${d.function ?? ''} (第${d.attempt ?? '?'}次)`;
    // ── R5 单函数报告 ────────────────────────────────────────────────
    case 'r5_w_start':      return `[${ts}] ▶ R5-W 报告生成: ${d.function ?? d.func_hash ?? ''}(第${d.attempt ?? 1}次)`;
    case 'r5_j_start':      return `[${ts}] ▶ R5-J 报告审核: ${d.function ?? d.func_hash ?? ''}(第${d.attempt ?? 1}次)`;
    case 'r5_j_done':       return `[${ts}] ${d.passed ? '✓' : '✗'} R5-J 报告审核 ${d.passed ? '通过' : '未通过'}: ${d.function ?? d.func_hash ?? ''}${!d.passed && d.feedback ? `—${String(d.feedback).slice(0,60)}` : ''}`;
    case 'r5_done':         return `[${ts}] ✓ R5 完成: ${d.entry_count ?? 0} 个入口`;
    // ── R6 聚合与最终报告 ─────────────────────────────────────────────
    case 'r6_script_done':  return `[${ts}] ✓ R6 聚合完成: ${d.entry_count ?? 0} 个入口${(d.warnings ?? 0) > 0 ? `（${d.warnings} 条字段警告）` : ''}`;
    case 'r6_report_done':  return `[${ts}] ✓ R6 最终报告生成完成`;
    case 'r6_j_start':      return `[${ts}] ▶ R6-J 质量验证（第${d.attempt ?? 1}次）`;
    case 'r6_j_done':       return `[${ts}] ${d.passed ? '✓' : '✗'} R6-J 质量验证 ${d.passed ? '通过' : '未通过'}`;
    // ── 产物 ─────────────────────────────────────────────────────────
    case 'functions_list_synced':   return `[${ts}] ✓ functions.list 生成: ${d.functions_count ?? 0} 条`;
    case 'functions_list_error':    return `[${ts}] ✗ functions.list 错误: ${String(d.error ?? '').slice(0, 80)}`;
    case 'functions_list_autofix':  return `[${ts}] │ functions.list 自动修复 ${d.fixes?.length ?? 0} 处`;
    // ── 精简模式事件 ──────────────────────────────────────────────────
    case 'lean_static_extract': return `[${ts}] │ 精简-静态提取: ${d.file ?? ''}`;
    case 'lean_static_done':    return `[${ts}] │ 精简-静态完成: ${d.file ?? ''} → ${d.func_count ?? 0} 个函数`;
    case 'lean_w_start':        return `[${ts}] ▶ 精简-W 启动: ${d.file ?? ''}${d.is_retry ? '（重试）' : ''}(第${d.attempt ?? 1}次)`;
    case 'lean_w_done':         return `[${ts}] ✓ 精简-W 完成: ${d.file ?? ''}`;
    case 'lean_j_start':        return `[${ts}] ▶ 精简-J 验证: ${d.file ?? ''}(第${d.attempt ?? 1}次)`;
    case 'lean_j_done':         return `[${ts}] ${d.passed ? '✓' : '✗'} 精简-J 验证 ${d.passed ? `通过 ${d.entries ?? 0}个入口` : '未通过'}${d.feedback_preview ? `: ${String(d.feedback_preview).slice(0,80)}` : ''}`;
    case 'lean_module_w_start': return `[${ts}] ▶ 精简-模块W: 汇总 ${d.r3_count ?? 0} 个文件(第${d.attempt ?? 1}次)`;
    case 'lean_module_w_done':  return `[${ts}] ✓ 精简-模块W 完成: ${d.entries ?? ''}个候选入口`;
    case 'lean_module_j_start': return `[${ts}] ▶ 精简-模块J 验证(第${d.attempt ?? 1}次)`;
    case 'lean_module_j_done':  return `[${ts}] ${d.passed ? '✓' : '✗'} 精简-模块J ${d.passed ? `通过 ${d.entries ?? 0}个入口` : '未通过'}`;
    case 'lean_report_start':   return `[${ts}] ▶ 精简-报告生成开始`;
    case 'lean_report_done':    return `[${ts}] ${d.passed ? '✓' : '✗'} 精简-报告完成`;
    // ── 旧流程兼容（parallel worker / master 模式）────────────────────
    case 'round_start':         return `[${ts}] ▶ 第 ${d.round ?? ''} 轮开始`;
    case 'worker_start':        return `[${ts}] │ Worker ${d.worker_id ?? ''}: ${d.entry ?? ''}`;
    case 'worker_done':         return `[${ts}] ✓ Worker ${d.worker_id ?? ''} 完成`;
    case 'master_worker_start': return `[${ts}] ▶ Master Worker Round ${d.round ?? ''} 开始合并`;
    case 'master_worker_done':  return `[${ts}] ✓ Master Worker Round ${d.round ?? ''} 合并完成`;
    case 'judge_start':         return `[${ts}] ▶ Judge ${d.judge_id ?? ''} 开始评审`;
    case 'judge_eval':          return `[${ts}] │ Judge 评分 score=${d.score ?? ''} passed=${d.passed ?? ''}`;
    case 'judge_end':           return `[${ts}] ✓ Judge 评审完成 passed=${d.passed ?? ''}`;
    case 'round_end':           return `[${ts}] ✓ 第 ${d.round ?? ''} 轮结束 passed=${d.passed ?? ''}`;
    default:                    return `[${ts}] ${evt.type}: ${String(d.text ?? d.output ?? JSON.stringify(d)).replace(/\n+/g, ' ').slice(0, 150)}`;
  }
}

// ─── 函数级进度追踪 ──────────────────────────────────────────────────────────

type FuncStage = 'pending' | 'running' | 'passed' | 'failed' | 'skip' | 'keep' | 'remove';

interface FuncProgress {
  func_hash: string;
  name: string;
  file?: string;
  r2j: FuncStage;   // R2-J 准确性验证（Judge only）
  r3w: FuncStage;   // R3-W 内部状态
  r3j: FuncStage;   // R3-J 内部状态
  r3: FuncStage;    // R3 合并态
  r4: FuncStage;    // R4 入口决策
  rep: FuncStage;   // R5 报告
  has_external_input?: boolean;
  entry_role?: string;
  is_entry: boolean;
  lastTs?: number;
}

function deriveFuncProgress(
  events: AppEaStageEvent[],
  functionCatalog?: AppEaFunctionCatalogItem[] | null,
): {
  funcs: FuncProgress[];
  totalFuncCount: number;
} {
  const map = new Map<string, FuncProgress>();
  let totalFuncCount = 0;
  for (const evt of events) {
    if (evt.type === 'r1_static_done') totalFuncCount += Number((evt.data || {}).count) || 0;
  }

  const toStage = (s?: string | null): FuncStage => {
    switch (String(s || 'pending')) {
      case 'running': return 'running';
      case 'passed': return 'passed';
      case 'failed': return 'failed';
      case 'skip': return 'skip';
      case 'keep': return 'keep';
      case 'remove':
      case 'filter': return 'remove';
      default: return 'pending';
    }
  };

  const isTerminalStage = (state: FuncStage) => ['passed', 'failed', 'skip', 'keep', 'remove'].includes(state);
  const combineR3 = (r3w: FuncStage, r3j: FuncStage): FuncStage => {
    if (r3w === 'skip' && r3j === 'skip') return 'skip';
    if (r3w === 'passed' && r3j === 'passed') return 'passed';
    if (r3w === 'failed' || r3j === 'failed') return 'failed';
    if (r3w === 'running' || r3j === 'running') return 'running';
    if (r3w === 'passed' || r3j === 'passed') return 'running';
    return 'pending';
  };

  const getOrCreate = (fh: string, name?: string, file?: string): FuncProgress => {
    if (!map.has(fh)) {
      map.set(fh, {
        func_hash: fh,
        name: name || fh.slice(0, 8),
        file,
        r2j: 'pending',
        r3w: 'pending',
        r3j: 'pending',
        r3: 'pending',
        r4: 'pending',
        rep: 'pending',
        is_entry: false,
      });
    }
    const f = map.get(fh)!;
    if (name && f.name === f.func_hash.slice(0, 8)) f.name = name;
    if (file && !f.file) f.file = file;
    return f;
  };

  const advanceStage = (item: FuncProgress, field: keyof Pick<FuncProgress, 'r2j' | 'r3w' | 'r3j' | 'r3' | 'r4' | 'rep'>, next: FuncStage) => {
    if (!isTerminalStage(item[field])) item[field] = next;
  };

  // 先用 function_catalog 初始化所有函数，保证 R2 开始前就有函数表
  for (const item of functionCatalog || []) {
    const fh = String(item.func_hash || '');
    if (!fh) continue;
    const f = getOrCreate(fh, String(item.name || fh), String(item.file || ''));
    // R2-J: 'failed' 仅是暂时状态（引擎必重试至 passed 或 force-pass），显示为运行中
    f.r2j = item.r2j_state === 'failed' ? 'running' : toStage(item.r2j_state);
    f.r3w = toStage(item.r3w_state);
    f.r3j = toStage(item.r3j_state);
    f.r3 = combineR3(f.r3w, f.r3j);
    const r4Decision = String(item.r4_decision || '').toLowerCase();
    const r4Actual = toStage(item.r4_state);
    const hasInput = item.has_external_input == null ? undefined : Boolean(item.has_external_input);
    if (r4Decision === 'filter' || r4Decision === 'remove') {
      f.r4 = hasInput === false ? 'skip' : 'remove';
    } else if (r4Decision === 'keep') {
      f.r4 = r4Actual === 'passed' ? 'keep' : r4Actual;
    } else {
      f.r4 = r4Actual;
    }
    f.rep = toStage(item.rep_state);
    f.has_external_input = hasInput;
    if (item.entry_role) f.entry_role = String(item.entry_role);
    f.is_entry = f.r4 === 'keep';
  }
  if (!totalFuncCount) totalFuncCount = (functionCatalog || []).length;

  for (const evt of events) {
    const ts = evt.ts || 0;
    const d = evt.data || {};
    const fh = String(d.func_hash || '');
    const fn = String(d.function || d.func_hash || '');
    const fi = String(d.file || '');

    switch (evt.type) {
      case 'r2_j_start':
        if (fh) { const f = getOrCreate(fh, fn, fi); advanceStage(f, 'r2j', 'running'); f.lastTs = ts; }
        break;
      case 'r2_j_done':
        if (fh) {
          const f = getOrCreate(fh, fn, fi);
          if (d.passed) {
            advanceStage(f, 'r2j', 'passed');
          } else {
            // R2-J 失败是暂时的：引擎将带着 J 反馈运行 R2-W 再验证，不允许漏报。
            // 不设为终态 failed，不将下游 R3/R4 标为 skip，保持 running 状态等待重试。
            advanceStage(f, 'r2j', 'running');
          }
          f.lastTs = ts;
        }
        break;

      case 'r3_w_start':
        if (fh) {
          const f = getOrCreate(fh, fn, fi);
          advanceStage(f, 'r3w', 'running');
          advanceStage(f, 'r3', 'running');
          f.lastTs = ts;
        }
        break;
      case 'r3_w_done':
        if (fh) {
          const f = getOrCreate(fh, fn, fi);
          const hasInput = Boolean(d.has_external_input);
          advanceStage(f, 'r3w', hasInput ? 'passed' : 'skip');
          f.has_external_input = hasInput;
          if (!hasInput) {
            advanceStage(f, 'r3j', 'skip');
            advanceStage(f, 'r3', 'skip');
            advanceStage(f, 'r4', 'skip');
          } else {
            advanceStage(f, 'r3', 'running');
          }
          if (d.entry_role) f.entry_role = String(d.entry_role);
          f.lastTs = ts;
        }
        break;

      case 'r3_j_start':
        if (fh) {
          const f = getOrCreate(fh, fn, fi);
          advanceStage(f, 'r3j', 'running');
          advanceStage(f, 'r3', 'running');
          f.lastTs = ts;
        }
        break;
      case 'r3_j_done':
        if (fh) {
          const f = getOrCreate(fh, fn, fi);
          advanceStage(f, 'r3j', d.passed ? 'passed' : 'pending');
          f.lastTs = ts;
        }
        break;

      case 'r4_w_start':
      case 'r4_w_func_start':
        if (fh) {
          const f = getOrCreate(fh, fn, fi);
          advanceStage(f, 'r4', 'running');
          f.lastTs = ts;
        }
        break;
      case 'r4_w_done':
      case 'r4_w_func_done':
        if (fh) {
          const f = getOrCreate(fh, fn, fi);
          const dec = String(d.decision || '').toLowerCase();
          if (dec === 'filter' || dec === 'remove') {
            advanceStage(f, 'r4', f.has_external_input === false ? 'skip' : 'remove');
          } else if (dec === 'keep' && d.quick_path) {
            // 快速路径：W 直接决策 keep，不会再有 r4_j_done 事件
            advanceStage(f, 'r4', 'keep');
            f.is_entry = true;
          }
          f.lastTs = ts;
        }
        break;
      case 'r4_j_start':
        if (fh) {
          const f = getOrCreate(fh, fn, fi);
          advanceStage(f, 'r4', 'running');
          f.lastTs = ts;
        }
        break;
      case 'r4_j_done':
        if (fh) {
          const f = getOrCreate(fh, fn, fi);
          if (d.passed) {
            advanceStage(f, 'r4', 'keep');
            f.is_entry = true;
            advanceStage(f, 'rep', 'pending');
          }
          f.lastTs = ts;
        }
        break;

      case 'r5_w_start':
        if (fh) {
          const f = getOrCreate(fh, fn, fi);
          // R5 开始意味着 R4 已确认 keep（无论是常规路径、快速路径还是 force-pass）
          advanceStage(f, 'r4', 'keep');
          f.is_entry = true;
          advanceStage(f, 'rep', 'running');
          f.lastTs = ts;
        }
        break;
      case 'r5_j_start':
        if (fh) {
          const f = getOrCreate(fh, fn, fi);
          advanceStage(f, 'r4', 'keep');   // 防御性
          f.is_entry = true;
          advanceStage(f, 'rep', 'running');
          f.lastTs = ts;
        }
        break;
      case 'r5_j_done':
        if (fh) { const f = getOrCreate(fh, fn, fi); advanceStage(f, 'rep', d.passed ? 'passed' : 'failed'); f.lastTs = ts; }
        break;
      case 'r6_script_done':
      case 'r6_report_done':
        // R6 完成 — 不绑定单个函数，触发整体刷新用
        break;
      default:
        break;
    }
  }

  for (const f of map.values()) {
    if (!isTerminalStage(f.r3)) f.r3 = combineR3(f.r3w, f.r3j);
    if (f.r4 === 'keep') f.is_entry = true;
  }

  const funcs = Array.from(map.values());
  // 阶段进度优先级：数字越大表示越接近成为入口（同级按函数名字母排序）
  const stagePriority = (f: FuncProgress): number => {
    if (f.rep === 'passed')                           return 9; // R5 报告完成
    if (f.is_entry || f.r4 === 'keep')               return 8; // R4 确认入口
    if (f.r4 === 'running')                          return 7; // R4 决策中
    if (f.r4 === 'remove')                           return 6; // R4 决定过滤
    if (f.r3 === 'passed')                           return 5; // R3 通过，待 R4
    if (f.r3 === 'running')                          return 4; // R3 进行中
    if (f.r2j === 'passed')                          return 3; // R2 通过，待 R3
    if (f.r2j === 'running')                         return 2; // R2 进行中
    if (f.has_external_input === false || f.r4 === 'skip') return 0; // R3 过滤沉底
    return 1;
  };
  funcs.sort((a, b) => {
    const pa = stagePriority(a), pb = stagePriority(b);
    if (pa !== pb) return pb - pa;                   // 优先级高的靠前
    return (a.name || '').localeCompare(b.name || ''); // 同级按函数名字母排序
  });
  return { funcs, totalFuncCount };
}

// ─── 函数级阶段小图标 ────────────────────────────────────────────────────────

function FuncStageDot({ state, label }: { state: FuncStage; label: string }) {
  const cls =
    state === 'passed' || state === 'keep' ? 'bg-emerald-500 text-white' :
    state === 'running'   ? 'bg-blue-500 text-white animate-pulse' :
    state === 'failed'    ? 'bg-red-500 text-white' :
    state === 'remove'    ? 'bg-orange-400 text-white' :
    state === 'skip'      ? 'bg-slate-200 text-slate-400' :
    'bg-slate-100 text-slate-400';
  const icon =
    state === 'passed' || state === 'keep' ? '✓' :
    state === 'running' ? '…' :
    state === 'failed'  ? '✗' :
    state === 'remove'  ? '✗' :
    state === 'skip'    ? '—' : '·';
  return (
    <span title={`${label}: ${state}`} className={`inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-black ${cls}`}>
      {icon}
    </span>
  );
}


function normalizeSessionDisplayPath(path: string): string {
  return path.replace(/^.*\/run\/sessions\//, '').replace(/^\/+/, '');
}

function resolveRoundActorSessionPath(rawPathInput: unknown, detail: AppEaTaskDetail | null, projectId: string): { fsPath: string; displayPath: string; rawPath: string } | null {
  const rawPath = String(rawPathInput || '').trim();
  if (!rawPath) return null;
  const taskRoot = detail?.output_path ? `${detail.output_path.replace(/\/+$/, '')}/${detail.task_id}` : '';
  let absolutePath = rawPath;
  if (!rawPath.startsWith('/')) {
    const relative = rawPath.replace(/^\/+/, '');
    absolutePath = relative.startsWith('run/') ? `${taskRoot}/${relative}` : `${taskRoot}/run/sessions/${relative}`;
  }
  const fsPath = extractFsRelPath(absolutePath, projectId);
  if (!fsPath) return null;
  return {
    fsPath,
    displayPath: normalizeSessionDisplayPath(rawPath),
    rawPath,
  };
}

function buildJudgeRoundSessionMeta(sessionPath: { displayPath: string; rawPath: string } | null, round: AppEaEvaluationRound | null, judge: Record<string, any> | null): AppEaSessionMeta | null {
  if (!sessionPath || !round || !judge) return null;
  const sessionName = sessionPath.displayPath.split('/').pop() || sessionPath.displayPath;
  return {
    session_id: sessionName,
    session_name: sessionName,
    relative_path: sessionPath.displayPath,
    stage_group: stageLabel(round.stage),
    role_name: 'judge',
    size: 0,
    mtime: 0,
    event_count: 0,
    line_count: 0,
    is_active: round.status === 'running',
    display_name: `${stageLabel(round.stage)} · ${round.module_name || '入口分析'} · ${judge.judge_id || 'Judge'}`,
    warnings: [],
  };
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex gap-3"><span className="w-24 shrink-0 text-xs text-slate-400">{label}</span><span className="text-xs text-slate-700 break-all">{value}</span></div>;
}

function MetricCard({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm"><div className="flex items-center justify-between gap-3"><div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</div><div className="text-slate-400">{icon}</div></div><div className="mt-3 text-2xl font-black text-slate-900">{value}</div></div>;
}

function MarkdownContent({ content }: { content: string }) {
  return <article className="prose prose-slate max-w-none prose-headings:font-black prose-pre:bg-slate-950 prose-pre:text-slate-100 prose-code:text-rose-700"><ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown></article>;
}

export const EntryAnalysisTaskDetailPage: React.FC<{ projectId: string; taskId: string; onBack: () => void }> = ({ projectId, taskId, onBack }) => {
  const appApi = api.domains.execution.appEntryAnalyse;
  const fileserverApi = api.domains.assets.fileserver;
  const { notify, feedbackNodes } = useUiFeedback();
  const stageFocusStorageKey = 'secflow:entryAnalysisStageFocus';
  const riskFocusStorageKey = 'secflow:entryAnalysisRiskFocus';
  const [detail, setDetail] = useState<AppEaTaskDetail | null>(null);
  const [runtimeSummary, setRuntimeSummary] = useState<AppEaTaskRuntimeSummary | null>(null);
  const [logs, setLogs] = useState<AppEaStagesJson>({ events: [] });
  const logsEventCountRef = useRef<number>(0);
  const detailRefreshInFlightRef = useRef(false);
  const detailRequestSeqRef = useRef(0);
  const sessionLoadSeqRef = useRef(0);
  const runtimeSummarySeqRef = useRef(0);
  const hasReturnContext = hasExecutionReturnContext() || hasBinarySecurityReturnTarget(detail);
  const [result, setResult] = useState<AppEaTaskResult | null>(null);
  const [evaluation, setEvaluation] = useState<AppEaTaskEvaluation | null>(null);
  const [loading, setLoading] = useState(false);
  const [resultLoading, setResultLoading] = useState(false);
  const [evaluationLoading, setEvaluationLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [timeline, setTimeline] = useState<AppEaTaskEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineClearing, setTimelineClearing] = useState(false);
  const [deletingTimelineEventId, setDeletingTimelineEventId] = useState<string | null>(null);
  const [expandedTimelineEventId, setExpandedTimelineEventId] = useState<string>('');
  const [timelineEventTypeFilter, setTimelineEventTypeFilter] = useState<string>('__all__');
  const [timelineLevelFilter, setTimelineLevelFilter] = useState<string>('__all__');
  const [timelineStatusFilter, setTimelineStatusFilter] = useState<string>('__all__');
  const [timelinePage, setTimelinePage] = useState(1);
  const [timelinePageSize, setTimelinePageSize] = useState(200);
  const [resultView, setResultView] = useState<'final' | 'functions' | 'report' | 'json'>('final');
  const [restarting, setRestarting] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [clockNow, setClockNow] = useState(() => Math.floor(Date.now() / 1000));
  const [logsExpanded, setLogsExpanded] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  const [sessions, setSessions] = useState<AppEaSessionMeta[]>([]);
  const [sessionIndex, setSessionIndex] = useState<AppEaSessionIndex | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [runtimeSummaryLoading, setRuntimeSummaryLoading] = useState(false);
  const [selectedSessionPath, setSelectedSessionPath] = useState<string | null>(null);
  const [activeAgentSessionPath, setActiveAgentSessionPath] = useState<string | null>(null);
  const [sessionSnapshot, setSessionSnapshot] = useState<AppEaSessionSnapshot | null>(null);
  const [sessionEvents, setSessionEvents] = useState<AppEaSessionEvent[]>([]);
  const [sessionWarnings, setSessionWarnings] = useState<string[]>([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionLive, setSessionLive] = useState(false);
  const [sessionWatchStartLine, setSessionWatchStartLine] = useState(0);
  const sessionSocketRef = useRef<WebSocket | null>(null);
  const [evaluationKeyword, setEvaluationKeyword] = useState('');
  const [evaluationStatus, setEvaluationStatus] = useState('');
  const [selectedEvaluationRoundKey, setSelectedEvaluationRoundKey] = useState<string | null>(null);
  const [selectedEvaluationJudgeKey, setSelectedEvaluationJudgeKey] = useState<string | null>(null);
  const [judgeSessionSnapshot, setJudgeSessionSnapshot] = useState<AppEaSessionSnapshot | null>(null);
  const [judgeSessionWatchStartLine, setJudgeSessionWatchStartLine] = useState(0);
  const [judgeSessionEvents, setJudgeSessionEvents] = useState<AppEaSessionEvent[]>([]);
  const [judgeSessionWarnings, setJudgeSessionWarnings] = useState<string[]>([]);
  const [judgeSessionLoading, setJudgeSessionLoading] = useState(false);
  const [judgeSessionError, setJudgeSessionError] = useState<string | null>(null);
  const [judgeSessionLive, setJudgeSessionLive] = useState(false);
  const judgeSessionSocketRef = useRef<WebSocket | null>(null);
  const [stageFocusHint, setStageFocusHint] = useState<'R1' | 'R2' | 'R3' | 'R4' | 'CC' | ''>('');
  const [riskFocusHint, setRiskFocusHint] = useState('');

  const handleBack = () => {
    if (navigateBackToExecutionView()) return;
    if (navigateBackByTaskOrigin(detail)) return;
    if (navigateBackToBinarySecurityTask()) return;
    onBack();
  };

  const loadDetail = async () => {
    if (!taskId) return;
    const requestSeq = ++detailRequestSeqRef.current;
    setLoading(true);
    try {
      const nextDetail = await appApi.getTask(taskId);
      if (detailRequestSeqRef.current === requestSeq) setDetail(nextDetail);
    }
    catch (err: any) { notify(`加载任务详情失败: ${err?.message || err}`, 'error'); }
    finally {
      if (detailRequestSeqRef.current === requestSeq) setLoading(false);
    }
  };

  /** 增量拉取 stages events。incremental=true 时只拉新增事件，false 时全量重置。 */
  const loadLogs = async (incremental: boolean) => {
    if (!taskId) return;
    try {
      const since = incremental ? logsEventCountRef.current : 0;
      const resp = await appApi.getTaskLogs(taskId, since);
      // 兼容新旧两种响应格式
      const respEvents: AppEaStageEvent[] = Array.isArray((resp as any).events)
        ? (resp as any).events
        : Array.isArray((resp as any).stages_json?.events)
          ? (resp as any).stages_json.events
          : [];
      const respFinal: boolean = (resp as any).final ?? (resp as any).stages_json?.final ?? false;
      // 旧接口无 total_event_count 字段，必须全量替换（否则增量追加会重复积累）
      const hasNewFormat = typeof (resp as any).total_event_count === 'number';
      const respTotal: number = hasNewFormat
        ? (resp as any).total_event_count
        : respEvents.length;

      if (!incremental || !hasNewFormat) {
        // 全量替换：初始加载、任务重启、旧接口兼容场景
        setLogs({ events: respEvents, final: respFinal });
        logsEventCountRef.current = respTotal;
      } else if (respEvents.length > 0) {
        // 追加增量（新接口，游标正确推进）
        setLogs((prev) => ({ events: [...prev.events, ...respEvents], final: respFinal }));
        logsEventCountRef.current = respTotal;
      } else {
        // 无新事件，仅更新 final 标志
        setLogs((prev) => ({ ...prev, final: respFinal }));
      }
    } catch {
      // 静默失败，不打断主流程
    }
  };

  const loadResult = async () => {
    setResultLoading(true);
    try { setResult(await appApi.getTaskResult(taskId)); }
    catch (err: any) { notify(`加载任务结果失败: ${err?.message || err}`, 'error'); }
    finally { setResultLoading(false); }
  };

  const loadEvaluation = async () => {
    setEvaluationLoading(true);
    try { setEvaluation(await appApi.getTaskEvaluation(taskId)); }
    catch (err: any) { notify(`加载观测指标失败: ${err?.message || err}`, 'error'); }
    finally { setEvaluationLoading(false); }
  };

  const loadTimeline = async () => {
    if (!taskId || timelineLoading) return;
    setTimelineLoading(true);
    try {
      const data = await appApi.getTimeline(taskId);
      setTimeline(data.items || []);
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
      message: '将删除当前入口分析任务的全部事件时间线记录。该操作不影响任务状态、结果和产物文件，删除后不可恢复，是否继续？',
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
    if (!taskId || !eventId || deletingTimelineEventId) return;
    const confirmed = await showConfirm({
      title: '删除事件',
      message: '将删除当前事件记录。该操作不影响任务状态、结果和产物文件，删除后不可恢复，是否继续？',
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    setDeletingTimelineEventId(eventId);
    try {
      await appApi.deleteTimelineEvent(taskId, eventId);
      setTimeline((current) => current.filter((event) => event.id !== eventId));
    } catch (err: any) {
      notify(`删除事件失败: ${err?.message || err}`, 'error');
    } finally {
      setDeletingTimelineEventId(null);
    }
  };

  const closeSessionSocket = () => {
    if (sessionSocketRef.current) {
      sessionSocketRef.current.close();
      sessionSocketRef.current = null;
    }
    setSessionLive(false);
  };

  const closeJudgeSessionSocket = () => {
    if (judgeSessionSocketRef.current) {
      judgeSessionSocketRef.current.close();
      judgeSessionSocketRef.current = null;
    }
    setJudgeSessionLive(false);
  };

  const openActiveAgentSession = (path: string) => {
    setActiveTab('session');
    setSelectedSessionPath(path);
    setActiveAgentSessionPath(path);
  };

  const loadRuntimeSummary = async (silent = false) => {
    if (!taskId) return;
    const requestSeq = ++runtimeSummarySeqRef.current;
    if (!silent) setRuntimeSummaryLoading(true);
    try {
      const snapshot = await appApi.getTaskRuntimeSummary(taskId);
      if (runtimeSummarySeqRef.current === requestSeq) setRuntimeSummary(snapshot);
    } catch (err: any) {
      if (!silent) notify(`加载运行态摘要失败: ${err?.message || err}`, 'error');
    } finally {
      if (!silent && runtimeSummarySeqRef.current === requestSeq) setRuntimeSummaryLoading(false);
    }
  };

  const loadSessions = async (silent = false, forceRefresh = false) => {
    if (!taskId) return;
    const requestSeq = ++sessionLoadSeqRef.current;
    if (!silent) setSessionsLoading(true);
    setSessionsError(null);
    try {
      const [data, index, runtime] = await Promise.all([
        appApi.listTaskSessions(taskId),
        appApi.getTaskSessionIndex(taskId, forceRefresh).catch(() => null),
        appApi.getTaskRuntimeSummary(taskId).catch(() => null),
      ]);
      if (sessionLoadSeqRef.current !== requestSeq) return;
      setSessions(data);
      setSessionIndex(index);
      if (runtime) setRuntimeSummary(runtime);
      setSelectedSessionPath((current) => current && data.some((item) => item.relative_path === current)
        ? current
        : data.find((item) => item.is_active)?.relative_path || data[0]?.relative_path || null);
    } catch (err: any) {
      if (sessionLoadSeqRef.current === requestSeq) setSessionsError(err?.message || String(err));
    } finally {
      if (!silent && sessionLoadSeqRef.current === requestSeq) setSessionsLoading(false);
    }
  };

  const loadSessionFile = async (path: string) => {
    setSessionLoading(true);
    setSessionError(null);
    try {
      const snapshot = await appApi.getTaskSessionFile(taskId, path);
      setSessionSnapshot(snapshot);
      setSessionWatchStartLine(snapshot.line_count || 0);
      setSessionEvents(snapshot.events || []);
      setSessionWarnings(snapshot.warnings || []);
    } catch (err: any) {
      setSessionSnapshot(null);
      setSessionEvents([]);
      setSessionWarnings([]);
      setSessionError(err?.message || String(err));
    } finally {
      setSessionLoading(false);
    }
  };

  useEffect(() => {
    setRuntimeSummary(null);
    setSessions([]);
    setSessionIndex(null);
    setSelectedSessionPath(null);
    setActiveAgentSessionPath(null);
    void Promise.all([loadDetail(), loadLogs(false)]);
  }, [taskId]);
  useEffect(() => {
    const stored = sessionStorage.getItem(stageFocusStorageKey) || '';
    const normalized = stored.trim().toUpperCase();
    setStageFocusHint(['R1', 'R2', 'R3', 'R4', 'CC'].includes(normalized) ? (normalized as 'R1' | 'R2' | 'R3' | 'R4' | 'CC') : '');
  }, [stageFocusStorageKey, taskId]);
  useEffect(() => {
    const stored = sessionStorage.getItem(riskFocusStorageKey) || '';
    setRiskFocusHint(stored.trim());
  }, [riskFocusStorageKey, taskId]);
  useEffect(() => () => { closeSessionSocket(); closeJudgeSessionSocket(); }, []);
  const sessionFeatureActive = activeTab === 'session' || activeTab === 'relationship' || Boolean(activeAgentSessionPath);

  const refreshDetailAndLogs = async () => {
    if (detailRefreshInFlightRef.current) return;
    detailRefreshInFlightRef.current = true;
    try {
      await Promise.all([loadDetail(), loadLogs(true)]);
    } finally {
      detailRefreshInFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (!detail || !['pending', 'running'].includes(detail.status)) return;
    const timer = window.setInterval(() => void refreshDetailAndLogs(), 5000);
    return () => window.clearInterval(timer);
  }, [detail?.status, taskId]);
  useEffect(() => {
    if (!detail || !['pending', 'running'].includes(detail.status)) return;
    const timer = window.setInterval(() => setClockNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [detail?.status]);
  useEffect(() => {
    if (activeTab === 'timeline' && timeline.length === 0 && !timelineLoading) void loadTimeline();
  }, [activeTab, taskId]);
  useEffect(() => {
    if (activeTab !== 'timeline' || !detail || !['pending', 'running'].includes(detail.status)) return;
    const timer = window.setInterval(() => void loadTimeline(), 12000);
    return () => window.clearInterval(timer);
  }, [activeTab, detail?.status, taskId]);
  useEffect(() => {
    if (logsExpanded && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs.events.length, logsExpanded]);
  useEffect(() => { if (activeTab === 'result') void loadResult(); }, [activeTab, taskId]);
  useEffect(() => { if (activeTab === 'evaluation') void loadEvaluation(); }, [activeTab, taskId]);
  useEffect(() => {
    if (activeTab !== 'evaluation' || !detail || !['pending', 'running'].includes(detail.status)) return;
    const timer = window.setInterval(() => void loadEvaluation(), 12000);
    return () => window.clearInterval(timer);
  }, [activeTab, detail?.status, taskId]);
  useEffect(() => {
    if (activeTab !== 'evaluation') {
      closeJudgeSessionSocket();
    }
  }, [activeTab]);
  useEffect(() => {
    if (!sessionFeatureActive) { closeSessionSocket(); return; }
    void loadSessions();
  }, [sessionFeatureActive, taskId]);
  useEffect(() => {
    if (!sessionFeatureActive) return;
    if (!detail || !['pending', 'running'].includes(detail.status)) return;
    const timer = window.setInterval(() => void loadSessions(true), 12000);
    return () => window.clearInterval(timer);
  }, [sessionFeatureActive, detail?.status, taskId]);
  useEffect(() => {
    const sessionViewerActive = activeTab === 'session' || activeTab === 'relationship' || activeAgentSessionPath === selectedSessionPath;
    if (!sessionViewerActive || !selectedSessionPath) return;
    closeSessionSocket();
    void loadSessionFile(selectedSessionPath);
  }, [activeTab, selectedSessionPath, taskId, activeAgentSessionPath]);
  useEffect(() => {
    const sessionViewerActive = activeTab === 'session' || activeTab === 'relationship' || activeAgentSessionPath === selectedSessionPath;
    if (!sessionViewerActive || !selectedSessionPath || !sessionSnapshot || !detail?.output_path || !['pending', 'running'].includes(detail.status)) return;
    const absPath = normalizeJoinPath(`${detail.output_path}/${detail.task_id}/run/sessions`, selectedSessionPath);
    const watchPath = extractFsRelPath(absPath, projectId);
    if (!watchPath) return;
    closeSessionSocket();
    const socket = fileserverApi.openProjectFileWatchWebSocket(projectId, watchPath, {
      path_mode: 'project_filesystem',
      read_mode: 'line',
      start_from: 'head',
      start_line: sessionWatchStartLine,
    });
    sessionSocketRef.current = socket;
    socket.onopen = () => setSessionLive(true);
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as FileWatchMessage;
        if (message.type === 'delta' && message.read_mode === 'line') {
          const parsed = parseSessionDelta(message.lines || [], (message.from_line ?? sessionWatchStartLine) + 1);
          if (parsed.events.length) setSessionEvents((current) => current.concat(parsed.events));
          if (parsed.warnings.length) setSessionWarnings((current) => Array.from(new Set(current.concat(parsed.warnings))));
          setSessionSnapshot((current) => current ? {
            ...current,
            session_meta: parsed.sessionMeta ? { ...current.session_meta, ...parsed.sessionMeta } : current.session_meta,
            line_count: message.to_line ?? current.line_count,
          } : current);
        } else if (message.type === 'file_event' && ['truncated', 'renamed'].includes(message.event)) {
          void loadSessionFile(selectedSessionPath);
        } else if (message.type === 'error') {
          setSessionError(message.message || '会话订阅失败');
        }
      } catch (err: any) {
        setSessionError(err?.message || String(err));
      }
    };
    socket.onerror = () => setSessionLive(false);
    socket.onclose = () => setSessionLive(false);
    return () => { if (sessionSocketRef.current === socket) closeSessionSocket(); else socket.close(); };
  }, [activeTab, selectedSessionPath, sessionSnapshot?.path, sessionWatchStartLine, detail?.status, detail?.output_path, detail?.task_id, projectId, activeAgentSessionPath]);

  const handleCancel = async () => {
    if (!detail) return;
    try { await appApi.cancelTask(detail.task_id); notify('任务已取消', 'success'); await loadDetail(); }
    catch (err: any) { notify(`取消失败: ${err?.message || err}`, 'error'); }
  };
  const handleDelete = async () => {
    if (!detail) return;
    const ok = await showConfirm({ title: '删除任务', message: `确定要删除任务「${detail.task_name}」及其所有输出文件吗？此操作不可撤销。`, confirmText: '确认删除', cancelText: '取消', danger: true });
    if (!ok) return;
    try { await appApi.deleteTask(detail.task_id, true); notify('任务已删除', 'success'); handleBack(); }
    catch (err: any) { notify(`删除失败: ${err?.message || err}`, 'error'); }
  };
  const handleRestart = async () => {
    if (!detail) return;
    setRestarting(true);
    try {
      await appApi.restartTask(detail.task_id);
      notify('任务已重新启动', 'success');
      // 重启后清空旧 logs，等待新运行时全量重拉
      setLogs({ events: [] });
      logsEventCountRef.current = 0;
      await loadDetail();
      if (activeTab === 'result') await loadResult();
    }
    catch (err: any) { notify(`重启失败: ${err?.message || err}`, 'error'); }
    finally { setRestarting(false); }
  };
  const handleResume = async () => {
    if (!detail) return;
    setResuming(true);
    try {
      await appApi.resumeTask(detail.task_id);
      notify('已从断点继续', 'success');
      setLogs({ events: [] });
      logsEventCountRef.current = 0;
      await loadDetail();
      if (activeTab === 'result') await loadResult();
    }
    catch (err: any) { notify(`断点续跑失败: ${err?.message || err}`, 'error'); }
    finally { setResuming(false); }
  };

  const isLeanMode = Boolean(detail?.lean_mode);
  const events = logs.events;
  const activeStageSteps = isLeanMode ? LEAN_STAGE_STEPS : FULL_STAGE_STEPS;
  const statusSteps = detail ? deriveStepStatuses(detail.status, events, activeStageSteps) : activeStageSteps.map((): StepStatus => 'pending');
  const stageStats = useMemo(() =>
    isLeanMode ? deriveLeanStageStats(events).stats : deriveFullStageStats(events),
    [events, isLeanMode],
  );
  const leanFileData = useMemo(() =>
    isLeanMode ? deriveLeanStageStats(events).files : [],
    [events, isLeanMode],
  );
  const { funcs: funcProgress, totalFuncCount } = useMemo(
    () => deriveFuncProgress(events, detail?.function_catalog || []),
    [events, detail?.function_catalog],
  );
  const funcStats = useMemo(() => {
    let r2 = 0, r3 = 0, r4Done = 0, r4Total = 0, entries = 0, r5 = 0;
    for (const f of funcProgress) {
      // R2: 全部函数都过 R2
      if (f.r2j === 'passed') r2 += 1;
      // R3: 全部函数都过 R3（passed=分析通过, skip=无外部输入跳过）
      if (f.r3 === 'passed' || f.r3 === 'skip') r3 += 1;
      // R4: 只统计实际需要 R4 决策的函数
      //   - has_external_input=false 的函数在 R3 就被过滤，不进入 R4
      //   - r4='skip' 是 R3 的结果，不应计入 R4 done
      if (f.has_external_input !== false) r4Total += 1;
      if (f.r4 === 'keep' || f.r4 === 'remove') r4Done += 1;
      if (f.r4 === 'keep') entries += 1;
      // R5: 只统计入口函数（entries）
      if (f.rep === 'passed') r5 += 1;
    }
    return { r2, r3, r4Done, r4Total, entries, r5, total: funcProgress.length };
  }, [funcProgress]);
  const [funcPageSize, setFuncPageSize] = useState<50|100|200>(50);
  const [funcPage, setFuncPage] = useState(0);
  const [funcEntryOnly, setFuncEntryOnly] = useState(false);
  // 过滤后的列表
  const funcFiltered = funcEntryOnly ? funcProgress.filter((f) => f.is_entry) : funcProgress;
  const funcPageCount = Math.ceil(funcFiltered.length / funcPageSize);
  const funcPageSlice = funcFiltered.slice(funcPage * funcPageSize, (funcPage + 1) * funcPageSize);
  const logLines = events.map(formatEvent);
  const groupedSessions = useMemo(() => {
    const map = new Map<string, AppEaSessionMeta[]>();
    sessions.forEach((session) => map.set(session.stage_group, [...(map.get(session.stage_group) || []), session]));
    return Array.from(map.entries());
  }, [sessions]);
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
  const focusedSessionGroup = useMemo(() => {
    if (!stageFocusHint || groupedSessions.length === 0) return null;
    const stageNeedle = stageFocusHint.toLowerCase();
    const scoredGroups = groupedSessions
      .map(([group, items]) => {
        const normalizedGroup = String(group || '').toLowerCase();
        const sortedItems = [...items].sort((a, b) => {
          if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
          return (b.mtime || 0) - (a.mtime || 0);
        });
        const activeCount = items.filter((item) => item.is_active).length;
        const latestMtime = items.reduce((latest, item) => Math.max(latest, item.mtime || 0), 0);
        const groupMatched = normalizedGroup.includes(stageNeedle);
        const pathMatched = items.some((item) => String(item.relative_path || '').toLowerCase().includes(stageNeedle));
        const roleMatched = items.some((item) => String(item.role_name || '').toLowerCase().includes(stageNeedle));
        const score = (groupMatched ? 100 : 0) + (pathMatched ? 30 : 0) + (roleMatched ? 10 : 0) + Math.min(activeCount, 5);
        const recommended = sortedItems[0] || null;
        return {
          group,
          items: sortedItems,
          activeCount,
          latestMtime,
          recommended,
          score,
          reason: groupMatched
            ? '会话分组名称直接命中当前阶段'
            : pathMatched
              ? '会话文件路径命中当前阶段'
              : roleMatched
                ? '会话角色与当前阶段匹配'
                : '该分组包含当前阶段最活跃的会话',
        };
      })
      .filter((item) => item.score > 0 || item.activeCount > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.activeCount !== a.activeCount) return b.activeCount - a.activeCount;
        return b.latestMtime - a.latestMtime;
      });
    return scoredGroups[0] || null;
  }, [groupedSessions, stageFocusHint]);
  const normalizedStageFocusKey = stageFocusHint ? stageFocusHint.toLowerCase() : '';
  const riskPreset = useMemo(() => getEntryAnalysisRiskPreset(riskFocusHint), [riskFocusHint]);
  const recommendationReasons = useMemo(
    () => getEntryAnalysisDetailRecommendationReason({
      stageFocusHint,
      riskPreset,
      detailStatus: detail?.status,
      focusedSessionGroup,
    }),
    [detail?.status, focusedSessionGroup, riskPreset, stageFocusHint],
  );
  useEffect(() => {
    if (!stageFocusHint || sessions.length === 0) return;
    const stageNeedle = stageFocusHint.toLowerCase();
    const matched =
      sessions.find((item) => String(item.stage_group || '').toLowerCase().includes(stageNeedle) && item.is_active) ||
      sessions.find((item) => String(item.stage_group || '').toLowerCase().includes(stageNeedle)) ||
      sessions.find((item) => String(item.relative_path || '').toLowerCase().includes(stageNeedle)) ||
      null;
    if (!matched) return;
    setActiveTab('session');
    setSelectedSessionPath(matched.relative_path);
  }, [sessions, stageFocusHint]);
  const selectedSession = sessions.find((item) => item.relative_path === selectedSessionPath) || null;
  const activeSessions = useMemo(() => sessions.filter((item) => item.is_active), [sessions]);
  const runtimeActiveSessionCount = runtimeSummary?.active_session_count ?? activeSessions.length;
  const activeAgentSessionMeta = useMemo(
    () => sessions.find((item) => item.relative_path === activeAgentSessionPath) || null,
    [sessions, activeAgentSessionPath],
  );
  const resultRootFsPath = result?.output_root ? extractFsRelPath(result.output_root, projectId) : null;
  const resultContent = resultView === 'final'
    ? result?.result_markdown || ''
    : resultView === 'functions'
      ? result?.functions_list_markdown || ''
      : resultView === 'report'
        ? result?.run_report_markdown || ''
        : JSON.stringify(result?.result_json || {}, null, 2);
  const markdownResultContent = resultView === 'functions' ? `\`\`\`text\n${resultContent}\n\`\`\`` : resultContent;
  const evaluationRounds = evaluation?.rounds || [];
  const evaluationIsRealtime = Boolean(evaluation?.is_realtime || evaluation?.source === 'runtime_snapshot');
  const evaluationRuntimeSummary = evaluation?.runtime_summary || evaluation?.summary?.runtime_summary || null;
  const statuses = Array.from(new Set(evaluationRounds.map((item) => item.status).filter(Boolean) as string[]));
  const filteredRounds = evaluationRounds.filter((round) => {
    const keyword = evaluationKeyword.trim().toLowerCase();
    if (keyword && !String(round.module_name || '').toLowerCase().includes(keyword)) return false;
    if (evaluationStatus && round.status !== evaluationStatus) return false;
    return true;
  });
  const avgJudgeScore = (() => {
    const scores = evaluationRounds.map((item) => Number(item.metrics?.avg_judge_score)).filter(Number.isFinite);
    return scores.length ? scores.reduce((sum, item) => sum + item, 0) / scores.length : null;
  })();
  const selectedEvaluationRound = useMemo<AppEaEvaluationRound | null>(
    () => evaluationRounds.find((item) => evaluationRoundKey(item) === selectedEvaluationRoundKey) || null,
    [evaluationRounds, selectedEvaluationRoundKey],
  );
  const selectedEvaluationJudge = useMemo<Record<string, any> | null>(
    () => (selectedEvaluationRound?.judges || []).find((item, index) => `${item.judge_id || index}::${item.model || ''}` === selectedEvaluationJudgeKey) || null,
    [selectedEvaluationJudgeKey, selectedEvaluationRound],
  );
  const selectedEvaluationJudgeSessionPath = useMemo(
    () => selectedEvaluationJudge ? resolveRoundActorSessionPath(selectedEvaluationJudge.session_file, detail, projectId) : null,
    [detail, projectId, selectedEvaluationJudge],
  );
  const selectedEvaluationJudgeSessionMeta = useMemo(
    () => buildJudgeRoundSessionMeta(selectedEvaluationJudgeSessionPath, selectedEvaluationRound, selectedEvaluationJudge),
    [selectedEvaluationJudge, selectedEvaluationJudgeSessionPath, selectedEvaluationRound],
  );

  useEffect(() => {
    const judges = selectedEvaluationRound?.judges || [];
    const currentValid = judges.some((item, index) => `${item.judge_id || index}::${item.model || ''}` === selectedEvaluationJudgeKey);
    if (currentValid) return;
    const firstWithSession = judges.find((item) => Boolean(String(item?.session_file || '').trim()));
    setSelectedEvaluationJudgeKey(firstWithSession ? `${firstWithSession.judge_id || 0}::${firstWithSession.model || ''}` : null);
  }, [selectedEvaluationJudgeKey, selectedEvaluationRound]);

  useEffect(() => {
    if (activeTab !== 'evaluation' || !selectedEvaluationJudge || !selectedEvaluationJudgeSessionPath) {
      if (activeTab === 'evaluation' && selectedEvaluationJudge && !selectedEvaluationJudgeSessionPath) {
        setJudgeSessionSnapshot(null);
        setJudgeSessionEvents([]);
        setJudgeSessionWarnings([]);
        setJudgeSessionError('该 Judge 未记录可读取的会话文件');
      }
      closeJudgeSessionSocket();
      return;
    }
    closeJudgeSessionSocket();
    const load = async () => {
      setJudgeSessionLoading(true);
      setJudgeSessionError(null);
      setJudgeSessionSnapshot(null);
      setJudgeSessionWatchStartLine(0);
      setJudgeSessionEvents([]);
      setJudgeSessionWarnings([]);
      try {
        const blob = await fileserverApi.fetchProjectFilesystemPreviewBlob(projectId, selectedEvaluationJudgeSessionPath.fsPath);
        const content = await blobToText(blob);
        const snapshot = buildSessionSnapshotFromText(selectedEvaluationJudgeSessionPath.displayPath, content);
        setJudgeSessionSnapshot(snapshot as AppEaSessionSnapshot);
        setJudgeSessionWatchStartLine(snapshot.line_count || 0);
        setJudgeSessionEvents((snapshot.events || []) as AppEaSessionEvent[]);
        setJudgeSessionWarnings(snapshot.warnings || []);
      } catch (err: any) {
        setJudgeSessionError(err?.message || String(err));
      } finally {
        setJudgeSessionLoading(false);
      }
    };
    void load();
  }, [activeTab, selectedEvaluationJudgeKey, selectedEvaluationJudgeSessionPath?.fsPath, fileserverApi, projectId, selectedEvaluationJudge]);

  useEffect(() => {
    if (activeTab !== 'evaluation' || !selectedEvaluationJudge || !selectedEvaluationJudgeSessionPath || !judgeSessionSnapshot || !detail || !['pending', 'running'].includes(detail.status)) return;
    closeJudgeSessionSocket();
    const socket = fileserverApi.openProjectFileWatchWebSocket(projectId, selectedEvaluationJudgeSessionPath.fsPath, {
      path_mode: 'project_filesystem',
      read_mode: 'line',
      start_from: 'head',
      start_line: judgeSessionWatchStartLine,
    });
    judgeSessionSocketRef.current = socket;
    socket.onopen = () => setJudgeSessionLive(true);
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as FileWatchMessage;
        if (message.type === 'delta' && message.read_mode === 'line') {
          const parsed = parseSessionDelta(message.lines || [], (message.from_line ?? judgeSessionWatchStartLine) + 1);
          if (parsed.events.length) setJudgeSessionEvents((current) => current.concat(parsed.events));
          if (parsed.warnings.length) setJudgeSessionWarnings((current) => Array.from(new Set(current.concat(parsed.warnings))));
          setJudgeSessionSnapshot((current) => current ? {
            ...current,
            session_meta: parsed.sessionMeta ? { ...(current.session_meta || {}), ...parsed.sessionMeta } : current.session_meta,
            line_count: message.to_line ?? current.line_count,
          } : current);
          setJudgeSessionWatchStartLine(message.to_line ?? judgeSessionWatchStartLine);
        } else if (message.type === 'file_event' && ['truncated', 'renamed'].includes(message.event)) {
          setJudgeSessionLive(false);
          setJudgeSessionError('Judge 会话文件已重置，正在重新加载');
        } else if (message.type === 'error') {
          setJudgeSessionError(message.message || 'Judge 会话订阅失败');
        }
      } catch (err: any) {
        setJudgeSessionError(err?.message || String(err));
      }
    };
    socket.onerror = () => setJudgeSessionLive(false);
    socket.onclose = () => setJudgeSessionLive(false);
    return () => { if (judgeSessionSocketRef.current === socket) closeJudgeSessionSocket(); else socket.close(); };
  }, [activeTab, detail, fileserverApi, judgeSessionSnapshot, judgeSessionWatchStartLine, projectId, selectedEvaluationJudge, selectedEvaluationJudgeKey, selectedEvaluationJudgeSessionPath]);

  return (
    <div className="px-8 pt-8 pb-10 space-y-6">
      {feedbackNodes}
      <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <button onClick={handleBack} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              <ArrowLeft size={14} />{hasReturnContext ? '返回原任务' : '返回任务列表'}
            </button>
            <p className="mt-4 text-xs font-black uppercase tracking-[0.3em] text-violet-600">Entry Analysis</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-black tracking-tight text-slate-900">{detail?.task_name || '任务详情'}</h1>
              {detail ? <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${STATUS_COLOR[detail.status]}`}>{STATUS_LABEL[detail.status] || detail.status}</span> : null}
            </div>
            <p className="mt-2 text-sm text-slate-500 break-all">{detail?.input_path || '正在加载任务详情。'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {detail && ['running', 'pending'].includes(detail.status) ? <button onClick={() => void handleCancel()} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">取消任务</button> : null}
            {detail && !['pending', 'running'].includes(detail.status) ? <button onClick={() => void handleRestart()} disabled={restarting} className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50">{restarting ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}重新运行</button> : null}
            {detail ? <DownstreamTaskCreator projectId={projectId} sourceKind="entry_analysis" task={detail} /> : null}
            {detail && detail.started_at && !['pending', 'running'].includes(detail.status) ? <button onClick={() => void handleResume()} disabled={resuming} className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50">{resuming ? <Loader2 size={13} className="animate-spin" /> : <PlayCircle size={13} />}断点续跑</button> : null}
            {detail ? <button onClick={() => void handleDelete()} className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"><Trash2 size={13} />删除任务</button> : null}
            <button onClick={() => { void Promise.all([loadDetail(), loadLogs(false)]); if (activeTab === 'result') void loadResult(); if (activeTab === 'evaluation') void loadEvaluation(); if (sessionFeatureActive) void loadSessions(false, true); }} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><RefreshCw size={14} className={loading || resultLoading || evaluationLoading || sessionsLoading ? 'animate-spin' : ''} /></button>
          </div>
        </div>
        {detail ? <div className="mt-5"><TaskOriginCard origin={detail} /></div> : null}
      </section>

      {stageFocusHint ? (
        <section className="rounded-[2rem] border border-indigo-200 bg-indigo-50/80 px-5 py-4 shadow-sm">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-indigo-700">Stage Focus</div>
          <div className="mt-2 text-sm font-bold text-indigo-900">当前正按 {stageFocusHint} 阶段进行会话定位</div>
          <div className="mt-1 text-xs leading-6 text-indigo-800">
            系统已优先尝试把你带到该阶段的智能体会话。你也可以切到“智能体会话/智能体关系/观测指标”继续核查这个阶段。
          </div>
          {focusedSessionGroup ? (
            <div className="mt-4 rounded-2xl border border-indigo-200 bg-white/80 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-indigo-500">Recommended Session Group</div>
                  <div className="mt-1 text-sm font-bold text-slate-900">{focusedSessionGroup.group === 'root' ? '根会话' : focusedSessionGroup.group}</div>
                  <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-600">
                    <span>会话 {focusedSessionGroup.items.length}</span>
                    <span>活跃 {focusedSessionGroup.activeCount}</span>
                    <span>最近更新 {formatSessionMtime(focusedSessionGroup.latestMtime)}</span>
                  </div>
                  <div className="mt-2 text-xs leading-6 text-slate-600">
                    推荐原因：{focusedSessionGroup.reason}
                    {focusedSessionGroup.recommended ? `，优先会话为 ${focusedSessionGroup.recommended.display_name}` : ''}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('session')}
                    className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    查看推荐会话组
                  </button>
                  <button
                    type="button"
                    disabled={!focusedSessionGroup.recommended}
                    onClick={() => {
                      setActiveTab('session');
                      if (focusedSessionGroup.recommended) setSelectedSessionPath(focusedSessionGroup.recommended.relative_path);
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    打开推荐会话
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
      {riskPreset ? (
        <section className="rounded-[2rem] border border-amber-200 bg-amber-50/80 px-5 py-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">Risk Focus</div>
              <div className="mt-2 text-sm font-bold text-amber-900">当前正按“{riskPreset.label}”风险意图排查该任务</div>
              <div className="mt-1 text-xs leading-6 text-amber-800">
                {riskPreset.description} {riskPreset.statusReason}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                sessionStorage.removeItem(riskFocusStorageKey);
                setRiskFocusHint('');
              }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-50"
            >
              清除风险线索
            </button>
          </div>
        </section>
      ) : null}
      {recommendationReasons.length ? (
        <section className="rounded-[2rem] border border-sky-200 bg-sky-50/80 px-5 py-4 shadow-sm">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-sky-700">Why This Task</div>
          <div className="mt-2 text-sm font-bold text-sky-900">当前任务被推荐到这里的主要依据</div>
          <div className="mt-3 space-y-2">
            {recommendationReasons.map((reason) => (
              <div key={reason} className="rounded-xl border border-sky-100 bg-white/80 px-3 py-2 text-xs leading-6 text-slate-700">
                {reason}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {loading && !detail ? <section className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm"><div className="flex items-center justify-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />加载中...</div></section> : null}

      {detail ? <>
        <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">{[
            ['overview', '总览'], ['timeline', '事件时间线'], ['task-config', '任务配置'], ['session', '智能体会话'], ['relationship', '智能体关系'], ['result', '结果'], ['evaluation', '观测指标'],
          ].map(([id, label]) => <button key={id} onClick={() => setActiveTab(id as DetailTab)} className={`rounded-2xl px-5 py-3 text-sm font-black transition ${activeTab === id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>{label}</button>)}</div>
        </section>

        {activeTab === 'overview' ? <>
          {/* ─ 统计条 */}
          {(() => {
            const totalFiles = stageStats[0]?.filesTotal ?? 0;
            const activeStageIdx = statusSteps.reduce((last: number, s: StepStatus, i: number) => (s === 'running' || s === 'completed') ? i : last, -1);
            const activeStage = activeStageIdx >= 0 ? activeStageSteps[activeStageIdx]?.label : '等待中';
            if (isLeanMode) {
              const finalEntries = stageStats[1]?.entriesFound ?? stageStats[2]?.entriesFound ?? 0;
              const doneFiles = stageStats[0]?.filesDone ?? 0;
              return (
                <section className="rounded-2xl border border-violet-100 bg-violet-50/60 px-5 py-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-600">精简模式 · 流水线统计</div>
                    <span className="rounded-full border border-violet-200 bg-white px-3 py-1 text-[11px] font-bold text-violet-700">当前阶段：{activeStage}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {([
                      { label: '总文件数', value: totalFiles || '-', border: 'border-slate-200', bg: 'bg-white', text: 'text-slate-900' },
                      { label: '已分析文件', value: doneFiles || '-', border: 'border-violet-100', bg: 'bg-violet-50', text: 'text-violet-700' },
                      { label: '文件入口合计', value: finalEntries || '-', border: 'border-emerald-100', bg: 'bg-emerald-50', text: 'text-emerald-700' },
                    ] as Array<{label:string;value:string|number;border:string;bg:string;text:string}>).map(({ label, value, border, bg, text }) => (
                      <div key={label} className={`rounded-xl border px-3 py-3 text-center ${border} ${bg}`}>
                        <div className={`text-2xl font-black ${text}`}>{value}</div>
                        <div className="mt-1 text-[10px] font-semibold text-slate-500">{label}</div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            }
            const totalFuncs = totalFuncCount || (stageStats[1]?.funcsDone ?? 0) || funcProgress.length;
            const r1Done     = stageStats[0]?.filesDone ?? 0;
            const r2Funcs    = stageStats[1]?.funcsDone ?? 0;
            const r3Funcs    = stageStats[2]?.funcsDone ?? 0;
            const r4Entries  = stageStats[4]?.entriesFound ?? stageStats[5]?.entriesFound ?? 0;
            const ccNodes    = stageStats[3]?.nodeCount ?? 0;
            return (
              <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">完整模式 · 流水线统计</div>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-600">当前阶段：{activeStage}</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                  {([
                    { label: '总文件数',   value: totalFiles || '-', border: 'border-slate-200', bg: 'bg-slate-50',     text: 'text-slate-900' },
                    { label: '总函数数',   value: totalFuncs || '-',  border: 'border-slate-200', bg: 'bg-slate-50/80',   text: 'text-slate-700' },
                    { label: 'R1完成文件', value: r1Done || '-',    border: 'border-sky-100',   bg: 'bg-sky-50',       text: 'text-sky-700' },
                    { label: 'R2完成函数', value: r2Funcs || '-',    border: 'border-indigo-100',bg: 'bg-indigo-50',    text: 'text-indigo-700' },
                    { label: 'R3函数小计', value: r3Funcs || '-',    border: 'border-teal-100',  bg: 'bg-teal-50',      text: 'text-teal-700' },
                    { label: '最终入口数', value: r4Entries || '-', border: 'border-emerald-100',bg: 'bg-emerald-50', text: 'text-emerald-700' },
                    { label: 'CC节点数',   value: ccNodes || '-',    border: 'border-violet-100',bg: 'bg-violet-50',    text: 'text-violet-700' },
                  ] as Array<{label:string;value:string|number;border:string;bg:string;text:string}>).map(({ label, value, border, bg, text }) => (
                    <div key={label} className={`rounded-xl border px-3 py-3 text-center ${border} ${bg}`}>
                      <div className={`text-2xl font-black ${text}`}>{value}</div>
                      <div className="mt-1 text-[10px] font-semibold text-slate-500">{label}</div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })()}
          {/* ─ 任务概览 */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">任务概览</h2>
            <div className="mt-4 grid gap-x-8 gap-y-3 md:grid-cols-2 lg:grid-cols-3">
              <InfoRow label="任务 ID"   value={<span className="font-mono">{detail.task_id}</span>} />
              <InfoRow label="创建时间"  value={detail.created_at ? new Date(detail.created_at).toLocaleString('zh-CN') : '-'} />
              <InfoRow label="模块目录"  value={<span className="font-mono">{detail.input_path}</span>} />
              <InfoRow label="开始时间"  value={detail.started_at ? new Date(detail.started_at).toLocaleString('zh-CN') : '-'} />
              <InfoRow label="源码目录"  value={detail.source_path ? <span className="font-mono">{detail.source_path}</span> : '-'} />
              <InfoRow label="耗时"      value={detail.finished_at ? formatDuration(detail.started_at, detail.finished_at) : formatLiveDuration(detail.started_at, clockNow)} />
              <InfoRow label="分析模块"  value={detail.module_name || '-'} />
              <InfoRow label="完成时间"  value={detail.finished_at ? new Date(detail.finished_at).toLocaleString('zh-CN') : '-'} />
              <InfoRow label="输出路径"  value={detail.output_path ? <span className="font-mono">{detail.output_path}</span> : '-'} />
              <InfoRow label="最近事件时间" value={timeline[0]?.created_at ? new Date(timeline[0].created_at).toLocaleString('zh-CN') : '-'} />
            </div>
          </section>
          {/* ─ 流水线阶段进度（全宽水平卡片流） */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">{isLeanMode ? '精简模式 · ' : ''}流水线阶段进度</h2>
            <p className="mt-1 text-xs text-slate-400">
              {isLeanMode
                ? '文件并行：静态提取 → Worker写脚本执行 → Judge验证；模块级合并去重精炼；报告输出'
                : 'R1提取 → R2准确性 → R3外部输入 → CC+R4入口决策 → R5报告'}
            </p>
            <div className="mt-5 overflow-x-auto pb-2">
              <div className="flex min-w-max items-stretch gap-2">
                {activeStageSteps.map((step, index) => {
                  const state = statusSteps[index];
                  const stat  = stageStats[index];
                  const borderColor = state === 'completed' ? 'border-emerald-400' : state === 'running' ? 'border-blue-400' : state === 'failed' ? 'border-red-400' : 'border-slate-200';
                  const bgColor     = state === 'completed' ? 'bg-emerald-50'      : state === 'running' ? 'bg-blue-50'      : state === 'failed' ? 'bg-red-50'      : 'bg-slate-50';
                  const dotColor    = state === 'completed' ? 'bg-emerald-500 text-white' : state === 'running' ? 'bg-blue-500 text-white' : state === 'failed' ? 'bg-red-500 text-white' : 'bg-slate-200 text-slate-500';
                  const artifactFull = detail.output_path ? `${detail.output_path}/${detail.task_id}/${step.artifactSubpath}` : '';
                  const artifactFsPath = artifactFull ? extractFsRelPath(artifactFull, projectId) : null;
                  return (
                    <div key={step.key} className={`w-[160px] shrink-0 rounded-xl border-2 px-3 py-3 ${borderColor} ${bgColor}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${dotColor}`}>
                          {state === 'completed' ? '✓' : state === 'running' ? <Loader2 size={10} className="animate-spin" /> : state === 'failed' ? '✗' : index + 1}
                        </div>
                        <p className="text-xs font-black text-slate-900 leading-tight">{step.label}</p>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-snug min-h-[28px]">{step.desc}</p>
                      {stat.startTs && state !== 'pending' ? (
                        <p className="mt-1 font-mono text-[10px] text-slate-400">
                          {state === 'running' ? formatStageElapsed(stat.startTs, clockNow) : formatStageDuration(stat.startTs, stat.lastTs)}
                        </p>
                      ) : null}
                      {/* CC 阶段卡片：显示建图进度和并行说明 */}
                      {step.key === 'cc' && state !== 'pending' ? (
                        <div className="mt-1 text-[9px] text-violet-600">与 R3 并行 · R4 前置</div>
                      ) : null}
                      {state !== 'pending' ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {stat.filesDone != null && <span className="rounded bg-white/90 border border-slate-200 px-1 py-0.5 text-[9px] font-bold text-slate-600">{stat.filesDone}{stat.filesTotal ? `/${stat.filesTotal}` : ''} 文件</span>}
                          {stat.filesTotal != null && stat.filesDone == null && <span className="rounded bg-white/90 border border-slate-200 px-1 py-0.5 text-[9px] font-bold text-slate-600">{stat.filesTotal} 文件</span>}
                          {stat.funcsDone != null && <span className="rounded bg-indigo-100 px-1 py-0.5 text-[9px] font-bold text-indigo-700">{stat.funcsDone} 函数</span>}
                          {stat.entriesFound != null && <span className="rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-bold text-emerald-700">{stat.entriesFound} 入口</span>}
                          {stat.nodeCount != null && <span className="rounded bg-violet-100 px-1 py-0.5 text-[9px] font-bold text-violet-700">{stat.nodeCount} 节点</span>}
                          {stat.edgeCount != null && <span className="rounded bg-violet-100 px-1 py-0.5 text-[9px] font-bold text-violet-600">{stat.edgeCount} 边</span>}
                        </div>
                      ) : null}
                      {artifactFsPath && state !== 'pending' ? (
                        <button onClick={() => openInFileExplorer(artifactFsPath)} className="mt-1.5 inline-flex items-center gap-0.5 text-[9px] font-semibold text-violet-600 hover:underline">
                          <FolderOpen size={9} />查看输出
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
          {/* ─ 精简模式：文件级列表 / 完整模式：函数级列表 */}
          {isLeanMode && leanFileData.length > 0 ? (
            <section className="rounded-2xl border border-violet-100 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 pb-4 pt-5">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.2em] text-violet-700">精简模式 · 文件分析进度</h2>
                  <p className="mt-1 text-xs text-slate-400">共 {leanFileData.length} 个文件，已完成 {leanFileData.filter((f) => f.j_state === 'passed').length} 个</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                      <th className="px-4 py-2.5 text-left">文件名</th>
                      <th className="px-3 py-2.5 text-center">函数数</th>
                      <th className="px-3 py-2.5 text-center">静态提取</th>
                      <th className="px-3 py-2.5 text-center">Worker</th>
                      <th className="px-3 py-2.5 text-center">Judge</th>
                      <th className="px-3 py-2.5 text-center">入口数</th>
                      <th className="px-3 py-2.5 text-center">重试</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {leanFileData.map((f) => (
                      <tr key={f.file_hash} className={`transition ${f.j_state === 'passed' ? 'bg-emerald-50/30 hover:bg-emerald-50' : 'hover:bg-slate-50'}`}>
                        <td className="px-4 py-2 font-mono text-slate-800 max-w-[280px] truncate" title={f.file}>{f.file}</td>
                        <td className="px-3 py-2 text-center text-slate-500">{f.func_count ?? '-'}</td>
                        <td className="px-3 py-2 text-center"><FuncStageDot state={f.static_done ? 'passed' : 'pending'} label="静态" /></td>
                        <td className="px-3 py-2 text-center"><FuncStageDot state={f.w_state as any} label="Worker" /></td>
                        <td className="px-3 py-2 text-center"><FuncStageDot state={f.j_state as any} label="Judge" /></td>
                        <td className="px-3 py-2 text-center">
                          {f.entries != null ? <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black text-emerald-700">{f.entries}</span> : <span className="text-slate-300">-</span>}
                        </td>
                        <td className="px-3 py-2 text-center text-slate-400 text-[10px]">{f.j_attempts > 1 ? `↺${f.j_attempts}` : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : !isLeanMode && funcProgress.length > 0 ? (
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 pb-4 pt-5">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">各函数流水线进度</h2>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                    {[
                      { label: 'R2', done: funcStats.r2,     total: funcStats.total,    color: 'bg-indigo-400' },
                      { label: 'R3', done: funcStats.r3,     total: funcStats.total,    color: 'bg-sky-400' },
                      { label: 'R4', done: funcStats.r4Done, total: funcStats.r4Total,  color: 'bg-violet-400',
                        tip: 'R4应统计有外部输入的函数，不含 R3 过滤函数' },
                      { label: 'R5', done: funcStats.r5,     total: funcStats.entries,  color: 'bg-emerald-400' },
                    ].map(({ label, done, total, color, tip }: { label: string; done: number; total: number; color: string; tip?: string }) => (
                      <span key={label} className="inline-flex items-center gap-1.5" title={tip}>
                        <span className="font-bold text-slate-600">{label}</span>
                        <span className="inline-block h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                          <span
                            className={`block h-full rounded-full ${color} transition-all`}
                            style={{ width: total > 0 ? `${Math.min(100, (done / total) * 100).toFixed(0)}%` : '0%' }}
                          />
                        </span>
                        <span className="tabular-nums">{done}<span className="text-slate-300">/{total}</span></span>
                      </span>
                    ))}
                    <span className="inline-flex items-center gap-1 font-bold text-emerald-700">入口 {funcStats.entries}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => { setFuncEntryOnly((v) => !v); setFuncPage(0); }}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${funcEntryOnly ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                    {funcEntryOnly ? '✓ 仅入口' : '仅入口'}
                  </button>
                  <span className="text-[11px] text-slate-300">|</span>
                  <span className="text-[11px] text-slate-500">每页</span>
                  {([50, 100, 200] as const).map((n) => (
                    <button key={n} onClick={() => { setFuncPageSize(n); setFuncPage(0); }}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${funcPageSize === n ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                      {n}
                    </button>
                  ))}
                  <span className="ml-1 text-[11px] text-slate-400">{funcPage + 1}/{Math.max(1, funcPageCount)} 页·{funcFiltered.length} 个</span>
                  <button disabled={funcPage === 0} onClick={() => setFuncPage((p) => p - 1)} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 disabled:opacity-40 hover:bg-slate-50">‹</button>
                  <button disabled={funcPage >= funcPageCount - 1} onClick={() => setFuncPage((p) => p + 1)} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 disabled:opacity-40 hover:bg-slate-50">›</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                      <th className="px-4 py-2.5 text-left">函数名</th>
                      <th className="px-3 py-2.5 text-center whitespace-nowrap">是否入口</th>
                      <th className="px-2 py-2.5 text-center" title="R2 准确性验证 Judge">R2</th>
                      <th className="px-2 py-2.5 text-center" title="R3 外部输入分析（W+J 均通过才算完成）">R3</th>
                      <th className="px-2 py-2.5 text-center">R4</th>
                      <th className="px-2 py-2.5 text-center">R5</th>
                      <th className="px-4 py-2.5 text-left">状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {funcPageSlice.map((f) => (
                      <tr key={f.func_hash} className={`transition ${f.is_entry ? 'bg-emerald-50/40 hover:bg-emerald-50' : 'hover:bg-slate-50'}`}>
                        <td className="px-4 py-2 font-mono">
                          <span className="truncate max-w-[220px] block font-semibold text-slate-800" title={f.name}>{f.name}</span>
                          {f.entry_role ? <span className="mt-0.5 block text-[9px] text-slate-400">{f.entry_role}</span> : null}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {f.is_entry
                            ? <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[9px] font-black text-emerald-700">✓ 入口</span>
                            : f.r4 === 'remove'
                              ? <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[9px] font-semibold text-orange-600">✗ 已过滤</span>
                              : f.r3 === 'skip'
                                ? <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-semibold text-slate-400">— 无输入</span>
                                : <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-semibold text-slate-300">未完成</span>
                          }
                        </td>
                        <td className="px-2 py-2 text-center"><FuncStageDot state={f.r2j} label="R2" /></td>
                        <td className="px-2 py-2 text-center"><FuncStageDot state={f.r3} label="R3" /></td>
                        <td className="px-2 py-2 text-center"><FuncStageDot state={f.r4}  label="R4" /></td>
                        <td className="px-2 py-2 text-center"><FuncStageDot state={f.rep} label="R5" /></td>
                        <td className="px-4 py-2 text-slate-500">
                          {f.rep === 'passed'   ? <span className="text-emerald-800 font-bold">✓ R5 完成</span>
                          : f.rep === 'running'  ? <span className="text-teal-600 animate-pulse">R5 报告中…</span>
                          : f.r4 === 'keep'      ? <span className="text-emerald-600 font-semibold">✓ 入口·等R5</span>
                          : f.r4 === 'remove'    ? <span className="text-orange-600">R4 过滤</span>
                          : f.r4 === 'running'   ? <span className="text-violet-600 animate-pulse">R4 决策中…</span>
                          : f.r3 === 'skip'      ? <span className="text-slate-400">无外部输入</span>
                          : f.r3 === 'passed'    ? <span className="text-sky-700">R3通过·等R4</span>
                          : f.r3 === 'running'   ? <span className="text-blue-600 animate-pulse">R3分析中…</span>
                          : f.r2j === 'running'  ? <span className="text-indigo-600 animate-pulse">R2验证中…</span>
                          : <span className="text-slate-300">等待中</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {funcPageCount > 1 ? (
                <div className="flex items-center justify-center gap-2 border-t border-slate-100 px-5 py-3">
                  <button disabled={funcPage === 0} onClick={() => setFuncPage(0)}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 disabled:opacity-40 hover:bg-slate-50">«</button>
                  <button disabled={funcPage === 0} onClick={() => setFuncPage((p) => p - 1)}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 disabled:opacity-40 hover:bg-slate-50">‹</button>
                  <span className="text-[11px] text-slate-500">
                    {funcPage + 1} / {funcPageCount}（共 {funcProgress.length} 个函数）
                  </span>
                  <button disabled={funcPage >= funcPageCount - 1} onClick={() => setFuncPage((p) => p + 1)}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 disabled:opacity-40 hover:bg-slate-50">›</button>
                  <button disabled={funcPage >= funcPageCount - 1} onClick={() => setFuncPage(funcPageCount - 1)}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 disabled:opacity-40 hover:bg-slate-50">»</button>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 pb-4 pt-5">
              <div>
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">当前运行智能体</h2>
                <p className="mt-1 text-xs text-slate-400">默认不再首屏扫描会话目录；切到会话视图或手动刷新后再加载详细 session。</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => { void loadRuntimeSummary(); setActiveTab('session'); }}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                >
                  查看会话详情
                </button>
                <button
                  type="button"
                  onClick={() => void loadRuntimeSummary()}
                  className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                  title="刷新运行态摘要"
                >
                  <RefreshCw size={14} className={runtimeSummaryLoading ? 'animate-spin' : ''} />
                </button>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-600">{runtimeActiveSessionCount} 个活跃会话</span>
              </div>
            </div>
            {runtimeSummaryLoading && !runtimeSummary ? (
              <div className="flex items-center justify-center gap-2 px-5 py-8 text-sm text-slate-500"><Loader2 size={15} className="animate-spin" />加载运行态摘要中...</div>
            ) : activeSessions.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {activeSessions.map((session) => (
                  <button key={session.relative_path} type="button" onClick={() => openActiveAgentSession(session.relative_path)} className="w-full px-5 py-4 text-left transition hover:bg-slate-50">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-black text-slate-900">{session.display_name}</div>
                        <div className="mt-1 truncate font-mono text-[11px] text-slate-500">{session.relative_path}</div>
                        <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-slate-500">
                          <span>分组 {session.stage_group || '-'}</span>
                          <span>事件 {session.event_count}</span>
                          <span>更新 {formatSessionMtime(session.mtime)}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${sessionRoleTone(session.role_name)}`}>{sessionRoleLabel(session.role_name)}</span>
                        <span className="inline-flex whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">活跃</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : runtimeSummary ? (
              <div className="px-5 py-6">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">运行摘要</div>
                    <div className="mt-3 text-sm font-bold text-slate-900">最近轮次 {runtimeSummary.latest_round ?? '-'}</div>
                    <div className="mt-1 text-xs text-slate-500">活跃轮次 {(runtimeSummary.active_rounds || []).length > 0 ? runtimeSummary.active_rounds?.join(', ') : '-'}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">角色分布</div>
                    <div className="mt-3 text-sm font-bold text-slate-900">{runtimeSummary.active_roles?.length ? runtimeSummary.active_roles.join(' / ') : '暂无活跃角色'}</div>
                    <div className="mt-1 text-xs text-slate-500">Worker {runtimeSummary.worker_count} · Judge {runtimeSummary.judge_count} · Sub {runtimeSummary.sub_worker_count}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">缓存命中</div>
                    <div className="mt-3 text-sm font-bold text-slate-900">{runtimeSummary.cache_hit ? '已命中会话索引缓存' : '未命中缓存'}</div>
                    <div className="mt-1 text-xs text-slate-500">{runtimeSummary.cache_age_seconds != null ? `缓存年龄 ${Math.round(runtimeSummary.cache_age_seconds)}s` : '暂无缓存年龄信息'}</div>
                  </div>
                </div>
                {runtimeSummary.warnings && runtimeSummary.warnings.length > 0 ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                    {runtimeSummary.warnings.join('；')}
                  </div>
                ) : null}
                <div className="mt-4 text-xs text-slate-500">
                  {runtimeActiveSessionCount > 0
                    ? '已检测到活跃会话，进入“会话”或“关系图”页签后会按需加载完整索引与会话文件。'
                    : (detail.status === 'pending' ? '任务尚未启动，当前没有活跃智能体。' : ['running', 'pending'].includes(detail.status) ? '当前没有检测到活跃智能体会话。' : '任务已结束，当前没有活跃智能体。')}
                </div>
              </div>
            ) : (
              <div className="px-5 py-10 text-center text-sm text-slate-500">
                <div>{detail.status === 'pending' ? '任务尚未启动，当前没有活跃智能体。' : ['running', 'pending'].includes(detail.status) ? '当前尚未加载运行态摘要。' : '任务已结束，当前没有活跃智能体。'}</div>
                {['running', 'pending'].includes(detail.status) ? (
                  <button
                    type="button"
                    onClick={() => void loadRuntimeSummary()}
                    className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    加载运行态摘要
                  </button>
                ) : null}
              </div>
            )}
          </section>
          {detail.abnormal_reason ? <AbnormalReasonCard reason={detail.abnormal_reason} history={detail.abnormal_reason_history} /> : null}
          {detail.error ? <section className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm"><h2 className="text-sm font-black uppercase tracking-[0.2em] text-red-600">错误信息</h2><pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-red-200 bg-white/70 px-3 py-3 text-xs text-red-700">{detail.error}</pre></section> : null}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><button onClick={() => setLogsExpanded((v) => !v)} className="flex w-full items-center justify-between gap-3 text-left"><div><h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">分析日志</h2><p className="mt-1 text-xs text-slate-400">{logLines.length} 条事件</p></div>{logsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>{logsExpanded ? logLines.length === 0 ? <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-400">暂无阶段事件</div> : <div ref={logRef} className="mt-4 max-h-[420px] overflow-auto rounded-xl border border-slate-800 bg-slate-950 px-3 py-3 font-mono text-xs leading-relaxed text-slate-300">{logLines.map((line, index) => <div key={index} className={line.includes('✗') ? 'text-red-400' : line.includes('▶') ? 'text-violet-300' : line.includes('✓') ? 'text-emerald-400' : line.includes('│') ? 'text-slate-400 text-[11px]' : 'text-slate-300'}>{line}</div>)}</div> : null}</section>
          {detail.prompt_content ? <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"><details><summary className="cursor-pointer select-none px-6 py-4 text-sm font-black text-slate-700 hover:bg-slate-50">分析 Prompt</summary><pre className="px-6 py-4 text-xs text-slate-600 whitespace-pre-wrap break-all bg-slate-50 max-h-72 overflow-auto border-t border-slate-100">{detail.prompt_content}</pre></details></section> : null}
        </>
 : activeTab === 'timeline' ? (
          <section className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">事件时间线</h2>
                  <p className="mt-1 text-xs text-slate-400">记录任务关键时间点和运行轨迹，用于分析调度、租约、控制权和执行阶段问题。</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
                    展示 {timelineRangeStart}-{timelineRangeEnd} / {filteredTimeline.length}
                  </div>
                  <label className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500">
                    每页
                    <select value={timelinePageSize} onChange={(event) => setTimelinePageSize(Math.min(2000, Math.max(50, Number(event.target.value) || 200)))} className="ml-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700">
                      {[50, 100, 200, 500].map((size) => <option key={size} value={size}>{size}</option>)}
                    </select>
                  </label>
                  <button onClick={() => void loadTimeline()} disabled={timelineLoading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60">
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
                <select value={timelineEventTypeFilter} onChange={(event) => setTimelineEventTypeFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                  <option value="__all__">全部事件</option>
                  {timelineEventTypeOptions.map((value) => <option key={value} value={value}>{formatTimelineEventTypeLabel(value)}</option>)}
                </select>
                <select value={timelineLevelFilter} onChange={(event) => setTimelineLevelFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                  <option value="__all__">全部级别</option>
                  {timelineLevelOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
                <select value={timelineStatusFilter} onChange={(event) => setTimelineStatusFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                  <option value="__all__">全部状态</option>
                  {timelineStatusOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <div className="mt-4 space-y-3">
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
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {pagedTimelineItems.map((event, index) => {
                            const expanded = expandedTimelineEventId === event.id;
                            const payload = event.payload || event.payload_json || {};
                            const sourceLabel = [event.source, event.worker_id || event.execution_owner_id, event.execution_epoch != null ? `Epoch ${event.execution_epoch}` : '', event.dispatch_status].filter(Boolean).join(' · ') || '-';
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
                                      <button onClick={() => void deleteTimelineEvent(event.id)} disabled={deletingTimelineEventId === event.id || timelineClearing} className="text-[11px] font-black text-rose-600 transition hover:text-rose-800 disabled:opacity-40">{deletingTimelineEventId === event.id ? '删除中' : '删除'}</button>
                                    </div>
                                  </td>
                                </tr>
                                {expanded ? (
                                  <tr className="bg-slate-50/60">
                                    <td colSpan={9} className="px-3 py-3">
                                      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                        {timelinePayloadRows(payload).slice(0, 12).map((row) => (
                                          <div key={row.key} className="min-w-0 rounded-lg border border-slate-100 bg-white px-3 py-2 text-xs">
                                            <div className="font-bold capitalize text-slate-400">{row.label}</div>
                                            <div className="mt-1 break-all font-mono text-slate-700">{row.value}</div>
                                          </div>
                                        ))}
                                      </div>
                                      <pre className="mt-3 overflow-auto rounded-xl border border-slate-200 bg-slate-950 px-3 py-3 text-xs leading-relaxed text-slate-200">{JSON.stringify(payload, null, 2)}</pre>
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
              </div>
            </section>
          </section>
        ) : activeTab === 'task-config' ? (
          <EntryAnalysisTaskConfigPanel detail={detail} />
        ) : activeTab === 'session' ? (
          <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><div><div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">会话列表</div><div className="mt-1 text-xs text-slate-500">{sessions.length} 个会话文件</div></div><button onClick={() => void loadSessions(false, true)} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><RefreshCw size={14} className={sessionsLoading ? 'animate-spin' : ''} /></button></div>{sessionsError ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">{sessionsError}</div> : null}{sessions.length === 0 ? <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">{sessionsLoading ? '加载会话中...' : '当前任务暂无智能体会话文件'}</div> : <div className="mt-4 max-h-[calc(100vh-20rem)] space-y-4 overflow-auto pr-1">{groupedSessions.map(([group, items]) => { const groupMatched = normalizedStageFocusKey ? String(group || '').toLowerCase().includes(normalizedStageFocusKey) || items.some((session) => String(session.relative_path || '').toLowerCase().includes(normalizedStageFocusKey)) : false; const groupRecommended = focusedSessionGroup?.group === group; return <div key={group} className={`rounded-2xl border px-3 py-3 transition ${groupRecommended ? 'border-indigo-200 bg-indigo-50/60' : groupMatched ? 'border-cyan-200 bg-cyan-50/50' : 'border-transparent bg-transparent'}`}><div className="mb-2 flex flex-wrap items-center gap-2"><div className={`text-[11px] font-black uppercase tracking-[0.18em] ${groupRecommended ? 'text-indigo-700' : groupMatched ? 'text-cyan-700' : 'text-slate-400'}`}>{group === 'root' ? '根会话' : group}</div>{groupRecommended ? <span className="rounded-full border border-indigo-200 bg-white px-2 py-0.5 text-[10px] font-bold text-indigo-700">当前推荐</span> : null}{!groupRecommended && groupMatched ? <span className="rounded-full border border-cyan-200 bg-white px-2 py-0.5 text-[10px] font-bold text-cyan-700">阶段命中</span> : null}</div><div className="space-y-2">{items.map((session) => { const selected = session.relative_path === selectedSessionPath; const stageMatched = normalizedStageFocusKey && String(session.relative_path || '').toLowerCase().includes(normalizedStageFocusKey); const recommended = focusedSessionGroup?.recommended?.relative_path === session.relative_path; return <button key={session.relative_path} onClick={() => setSelectedSessionPath(session.relative_path)} className={`w-full rounded-2xl border px-4 py-3 text-left transition ${selected ? 'border-slate-900 bg-slate-900 text-white' : recommended ? 'border-indigo-200 bg-indigo-50 text-slate-800 hover:bg-indigo-100/70' : stageMatched ? 'border-cyan-200 bg-cyan-50 text-slate-800 hover:bg-cyan-100/70' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-black">{session.display_name}</div><div className={`mt-1 truncate text-[11px] ${selected ? 'text-slate-300' : 'text-slate-500'}`}>{session.relative_path}</div></div><div className="flex shrink-0 flex-wrap justify-end gap-1"><span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${session.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'}`}>{session.is_active ? '活跃' : '历史'}</span>{recommended ? <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${selected ? 'border-indigo-300 bg-indigo-400/20 text-indigo-100' : 'border-indigo-200 bg-white text-indigo-700'}`}>推荐</span> : null}{!recommended && stageMatched ? <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${selected ? 'border-cyan-300 bg-cyan-400/20 text-cyan-100' : 'border-cyan-200 bg-white text-cyan-700'}`}>阶段命中</span> : null}</div></div><div className={`mt-3 flex flex-wrap gap-3 text-[11px] ${selected ? 'text-slate-300' : 'text-slate-500'}`}><span>事件 {session.event_count}</span><span>{new Date(session.mtime * 1000).toLocaleString('zh-CN')}</span></div></button>; })}</div></div>; })}</div>}</aside>
            <div className="space-y-4"><AgentSessionWarningPanel warnings={sessionWarnings} /><AgentSessionViewer sessionMeta={selectedSession} sessionHeader={sessionSnapshot?.session_meta} events={sessionEvents} loading={sessionLoading} live={sessionLive} error={sessionError} /></div>
          </section>
        ) : activeTab === 'relationship' ? (
          <section className="space-y-4">
            {stageFocusHint ? (
              <section className="rounded-2xl border border-cyan-200 bg-cyan-50 px-5 py-4 text-sm text-cyan-900 shadow-sm">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-700">Relationship Focus</div>
                <div className="mt-2 font-bold">当前关系图已按 {stageFocusHint} 阶段聚焦</div>
                <div className="mt-1 text-xs leading-6 text-cyan-800">
                  系统会优先高亮该阶段的会话分组与推进关系。若要进一步下钻，可切回“智能体会话”直接打开推荐会话。
                </div>
              </section>
            ) : null}
            <WarningListPanel title="索引生成提示" items={sessionIndex?.warnings?.slice(0, 5) || []} />
            <AgentSessionWarningPanel warnings={sessionWarnings} />
            <SessionRelationshipGraph index={sessionIndex} selectedPath={selectedSessionPath} onSelect={setSelectedSessionPath} focusedStageKey={stageFocusHint ? stageFocusHint.toLowerCase() : null} sessionPreview={{ path: selectedSessionPath, sessionMeta: selectedSession, sessionHeader: sessionSnapshot?.session_meta, events: sessionEvents, loading: sessionLoading, live: sessionLive, error: sessionError }} />
          </section>
        ) : activeTab === 'result' ? (
          <section className="space-y-4"><div className="grid gap-4 xl:grid-cols-5"><MetricCard label="函数数" value={result?.summary.function_count ?? 0} icon={<ScrollText size={18} />} /><MetricCard label="轮次数" value={result?.summary.round_count ?? 0} icon={<BarChart3 size={18} />} /><MetricCard label="通过轮次" value={result?.summary.passed_round_count ?? 0} icon={<CheckCircle2 size={18} />} /><MetricCard label="总 Token" value={formatNumber(result?.summary.total_tokens)} icon={<ScrollText size={18} />} /><div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm"><div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">结果目录</div><div className="mt-2 text-sm font-semibold text-slate-700 line-clamp-2">{result?.output_root || '-'}</div><div className="mt-3 flex flex-wrap gap-2"><button disabled={!resultRootFsPath} onClick={() => resultRootFsPath && openInFileExplorer(resultRootFsPath)} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 px-2 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"><FolderOpen size={11} />打开目录</button><button disabled={!result?.output_root} onClick={() => result?.output_root && navigator.clipboard.writeText(result.output_root)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-50"><ClipboardCopy size={10} />复制路径</button></div></div></div>{resultLoading ? <section className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm text-center text-sm text-slate-500">加载结果中...</section> : !result ? <section className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm text-center text-sm text-slate-500">暂无结果数据</section> : !result.available ? <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 shadow-sm text-center text-sm text-slate-500">任务完成后可查看结果，当前状态：{STATUS_LABEL[result.status] || result.status}</section> : <section className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_300px]"><aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">结果导航</div><div className="mt-3 space-y-2">{[['final', '最终结果'], ['functions', 'functions.list'], ['report', '运行报告'], ['json', '结构化 JSON']].map(([id, label]) => <button key={id} onClick={() => setResultView(id as any)} className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-black transition ${resultView === id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'}`}>{label}</button>)}</div></aside><main className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="border-b border-slate-200 pb-4 text-2xl font-black tracking-tight text-slate-900">{resultView === 'final' ? '最终结果' : resultView === 'functions' ? '函数列表' : resultView === 'report' ? '运行报告' : '结构化 JSON'}</h2><div className="mt-5 max-h-[calc(100vh-24rem)] overflow-auto pr-2">{resultContent ? resultView === 'json' ? <pre className="rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{resultContent}</pre> : <MarkdownContent content={markdownResultContent} /> : <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">当前结果缺少可展示内容</div>}</div></main><aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">函数列表</div><div className="mt-3 max-h-[360px] space-y-2 overflow-auto pr-1">{result.functions.length ? result.functions.map((fn, index) => <div key={`${index}-${fn}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-[11px] text-slate-700">{fn}</div>) : <div className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">没有 functions.list 内容</div>}</div></aside></section>}</section>
        ) : (
          <section className="space-y-4">{evaluationLoading ? <section className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm text-center text-sm text-slate-500">加载观测指标中...</section> : !evaluation || !evaluation.available ? <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500"><BarChart3 size={20} /></div><div className="mt-4 text-base font-bold text-slate-800">当前尚未生成可解析的观测数据</div><div className="mt-2 text-sm text-slate-500">运行中任务会优先展示实时会话快照；若仍为空，说明尚未产生 Worker/Judge 会话文件。</div></section> : <><WarningListPanel title="部分观测文件读取异常" items={evaluation.warnings} />{evaluationIsRealtime ? <section className="rounded-2xl border border-cyan-200 bg-cyan-50 px-5 py-4 text-sm text-cyan-800 shadow-sm"><div className="font-black">实时观测快照</div><div className="mt-1 text-xs leading-6">当前数据来自运行目录和智能体会话索引，最终指标以任务完成后写出的 result.json 为准。快照时间：{evaluation.snapshot_generated_at ? new Date(evaluation.snapshot_generated_at).toLocaleString('zh-CN') : '-'}</div><div className="mt-2 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-white/80 px-3 py-1 font-bold">会话 {formatNumber(evaluationRuntimeSummary?.session_count)}</span><span className="rounded-full bg-white/80 px-3 py-1 font-bold">活跃 {formatNumber(evaluationRuntimeSummary?.active_session_count)}</span><span className="rounded-full bg-white/80 px-3 py-1 font-bold">Worker {formatNumber(evaluationRuntimeSummary?.worker_count)}</span><span className="rounded-full bg-white/80 px-3 py-1 font-bold">Judge {formatNumber(evaluationRuntimeSummary?.judge_count)}</span></div></section> : null}<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><MetricCard label="总轮数" value={formatNumber(evaluation.summary?.round_count ?? evaluation.rounds.length)} icon={<BarChart3 size={18} />} /><MetricCard label={evaluationIsRealtime ? '活跃会话' : '通过轮次'} value={evaluationIsRealtime ? formatNumber(evaluationRuntimeSummary?.active_session_count) : formatNumber(evaluation.summary?.passed_round_count)} icon={<CheckCircle2 size={18} />} /><MetricCard label="总 Token" value={formatNumber(evaluation.summary?.total_tokens)} icon={<ScrollText size={18} />} /><MetricCard label="实际开始时间" value={detail?.started_at ? new Date(detail.started_at).toLocaleString('zh-CN') : '-'} icon={<ScrollText size={18} />} /><MetricCard label="平均 Judge 分" value={avgJudgeScore == null ? '-' : formatNumber(avgJudgeScore, 1)} icon={<BarChart3 size={18} />} /><MetricCard label="最终通过率" value={formatRate(evaluation.summary?.effectiveness?.final_round_pass_rate)} icon={<CheckCircle2 size={18} />} /></section>{selectedEvaluationRound ? <section className="space-y-4"><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><button type="button" onClick={() => setSelectedEvaluationRoundKey(null)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><ArrowLeft size={14} />返回轮次列表</button><div className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-cyan-600">Round Detail</div><h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">#{selectedEvaluationRound.round ?? '-'} · {selectedEvaluationRound.module_name || detail.module_name || '入口分析'}</h2><div className="mt-2 flex flex-wrap gap-2 text-xs"><span className={`rounded-full border px-3 py-1 font-bold ${evaluationStatusTone(selectedEvaluationRound.status)}`}>{selectedEvaluationRound.status || '-'}</span><span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-bold text-slate-600">{stageLabel(selectedEvaluationRound.stage)}</span><span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-mono font-bold text-slate-600">Stage Round {selectedEvaluationRound.stage_round ?? '-'}</span>{selectedEvaluationRound.extra?.source === 'runtime_snapshot' ? <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 font-bold text-cyan-700">实时快照</span> : null}</div></div><div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500"><div className="font-black text-slate-700">来源文件</div><div className="mt-1 max-w-xl break-all font-mono">{selectedEvaluationRound.source_path || detail.source_path || selectedEvaluationRound.extra?.round_dir || '-'}</div></div></div></section><section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><MetricCard label="耗时" value={formatMs(selectedEvaluationRound.duration_ms)} icon={<BarChart3 size={18} />} /><MetricCard label="Token" value={formatNumber(selectedEvaluationRound.metrics?.token_total)} icon={<ScrollText size={18} />} /><MetricCard label="任务实际开始时间" value={detail?.started_at ? new Date(detail.started_at).toLocaleString('zh-CN') : '-'} icon={<ScrollText size={18} />} /><MetricCard label={evaluationIsRealtime ? '活跃会话' : 'Judge 均分'} value={evaluationIsRealtime ? formatNumber(selectedEvaluationRound.metrics?.active_session_count) : formatNumber(selectedEvaluationRound.metrics?.avg_judge_score, 1)} icon={<CheckCircle2 size={18} />} /></section><section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]"><div className="space-y-4"><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">本轮执行摘要</h3><div className="mt-4 space-y-3"><InfoRow label="开始时间" value={selectedEvaluationRound.started_at ? new Date(selectedEvaluationRound.started_at).toLocaleString('zh-CN') : '-'} /><InfoRow label="结束时间" value={selectedEvaluationRound.ended_at ? new Date(selectedEvaluationRound.ended_at).toLocaleString('zh-CN') : '-'} /><InfoRow label="完成原因" value={selectedEvaluationRound.completion_reason || '-'} /><InfoRow label="模块完成" value={selectedEvaluationRound.module_completed ? '是' : '否'} /><InfoRow label="通过投票" value={selectedEvaluationRound.metrics?.passed_by_vote ? '通过' : '未通过'} /><InfoRow label="通过率" value={formatRate(selectedEvaluationRound.metrics?.review_pass_rate)} />{evaluationIsRealtime ? <><InfoRow label="Worker产物" value={formatNumber(selectedEvaluationRound.metrics?.worker_artifact_count)} /><InfoRow label="Judge产物" value={formatNumber(selectedEvaluationRound.metrics?.judge_artifact_count)} /></> : null}</div><div className="mt-4 flex flex-wrap gap-2 text-xs">{selectedEvaluationRound.effectiveness?.needed_reflection ? <span className="rounded-full bg-amber-100 px-3 py-1 font-bold text-amber-700">需要反思</span> : null}{selectedEvaluationRound.effectiveness?.triggered_reclassify ? <span className="rounded-full bg-red-100 px-3 py-1 font-bold text-red-700">触发重分类</span> : null}{!selectedEvaluationRound.effectiveness?.needed_reflection && !selectedEvaluationRound.effectiveness?.triggered_reclassify ? <span className="rounded-full bg-slate-100 px-3 py-1 font-bold text-slate-600">无额外调整</span> : null}</div></section><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">Worker</h3><div className="mt-4 space-y-3"><InfoRow label="模型" value={<span className="break-all font-mono">{selectedEvaluationRound.worker?.model || '-'}</span>} /><InfoRow label="会话文件" value={<span className="break-all font-mono">{selectedEvaluationRound.worker?.session_file || '-'}</span>} /><InfoRow label="错误" value={selectedEvaluationRound.worker?.error || '-'} /></div>{Array.isArray(selectedEvaluationRound.worker?.artifact_paths) && selectedEvaluationRound.worker.artifact_paths.length > 0 ? <div className="mt-4"><div className="text-xs font-bold text-slate-500">产物路径</div><div className="mt-2 space-y-2">{(selectedEvaluationRound.worker?.artifact_paths || []).slice(0, 8).map((path: string) => <div key={path} className="break-all rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-600">{path}</div>)}</div></div> : null}</section></div><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">Judge 评审</h3><p className="mt-1 text-xs text-slate-400">展示本轮所有 Judge 的评分、通过状态、会话文件和反馈摘要</p></div><span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">{selectedEvaluationRound.judges?.length || 0} 个 Judge</span></div><div className="mt-4 space-y-3">{(selectedEvaluationRound.judges || []).map((judge, index) => <div key={`${judge.judge_id || index}-${judge.model || ''}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="font-mono text-xs font-bold text-slate-700">{judge.judge_id || `judge-${index + 1}`}</div><div className="flex flex-wrap gap-2 text-[11px]">{judge.session_file ? <button type="button" onClick={() => setSelectedEvaluationJudgeKey(`${judge.judge_id || index}::${judge.model || ''}`)} className={`rounded-full border px-2 py-0.5 font-bold ${selectedEvaluationJudgeKey === `${judge.judge_id || index}::${judge.model || ''}` ? 'border-cyan-300 bg-cyan-50 text-cyan-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'}`}>查看会话</button> : null}<span className={`rounded-full px-2 py-0.5 font-bold ${judge.passed ? 'bg-emerald-100 text-emerald-700' : judge.is_active ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>{judge.passed ? '通过' : judge.is_active ? '运行中' : '未通过'}</span><span className="rounded-full bg-white px-2 py-0.5 font-bold text-slate-600">评分 {formatNumber(judge.score)}</span></div></div><div className="mt-2 break-all font-mono text-[11px] text-slate-500">{judge.model || '-'}</div><div className="mt-2 break-all font-mono text-[11px] text-slate-500">{judge.session_file || '未记录会话文件'}</div>{judge.feedback_excerpt ? <div className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs leading-6 text-slate-700">{judge.feedback_excerpt}</div> : null}</div>)}{(selectedEvaluationRound.judges || []).length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">本轮没有 Judge 明细</div> : null}</div></section></section>{selectedEvaluationJudge ? <section className="space-y-4"><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">Judge 会话</h3><p className="mt-1 text-xs text-slate-400">通过 fileserver 读取当前选中 Judge 的 session 文件；任务运行中会实时监听追加内容。</p></div>{selectedEvaluationJudgeSessionPath ? <div className="max-w-xl break-all rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-500">{selectedEvaluationJudgeSessionPath.fsPath}</div> : null}</div></section><WarningListPanel title="Judge 会话文件存在部分异常行，已跳过不可解析内容" items={judgeSessionWarnings} /><AgentSessionViewer sessionMeta={selectedEvaluationJudgeSessionMeta} sessionHeader={judgeSessionSnapshot?.session_meta} events={judgeSessionEvents} loading={judgeSessionLoading} live={judgeSessionLive} error={judgeSessionError} /></section> : null}<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">原始 JSON</h3><p className="mt-1 text-xs text-slate-400">保留完整观测文件内容，便于核对字段。</p></div></div><pre className="mt-4 max-h-[480px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(selectedEvaluationRound, null, 2)}</pre></section></section> : <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">轮次明细</h2><p className="mt-1 text-xs text-slate-400">展示每一轮 Worker/Judge 的观测指标，点击行进入轮次详情页</p></div><div className="flex flex-wrap gap-2"><div className="relative"><Search size={13} className="pointer-events-none absolute left-3 top-2.5 text-slate-400" /><input value={evaluationKeyword} onChange={(e) => setEvaluationKeyword(e.target.value)} placeholder="模块过滤" className="rounded-xl border border-slate-200 py-2 pl-8 pr-3 text-xs" /></div><select value={evaluationStatus} onChange={(e) => setEvaluationStatus(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs"><option value="">全部状态</option>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></div></div><div className="mt-4 overflow-auto rounded-2xl border border-slate-200"><table className="min-w-full divide-y divide-slate-200 text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-3">Round</th><th className="px-3 py-3">阶段</th><th className="px-3 py-3">状态</th><th className="px-3 py-3">耗时</th><th className="px-3 py-3">Judge 分</th><th className="px-3 py-3">通过率</th><th className="px-3 py-3">Token</th><th className="px-3 py-3">任务实际开始时间</th></tr></thead><tbody className="divide-y divide-slate-100 bg-white">{filteredRounds.map((round) => <tr key={evaluationRoundKey(round)} onClick={() => setSelectedEvaluationRoundKey(evaluationRoundKey(round))} className="cursor-pointer hover:bg-slate-50"><td className="px-3 py-3 font-mono text-slate-700">{round.round}</td><td className="px-3 py-3 font-semibold text-slate-700">{stageLabel(round.stage)}</td><td className="px-3 py-3"><span className={`rounded-full border px-2 py-0.5 font-bold ${evaluationStatusTone(round.status)}`}>{round.status || '-'}</span></td><td className="px-3 py-3 text-slate-600">{formatMs(round.duration_ms)}</td><td className="px-3 py-3">{formatNumber(round.metrics?.avg_judge_score, 1)}</td><td className="px-3 py-3">{formatRate(round.metrics?.review_pass_rate)}</td><td className="px-3 py-3">{formatNumber(round.metrics?.token_total)}</td><td className="px-3 py-3">{detail?.started_at ? new Date(detail.started_at).toLocaleString('zh-CN') : '-'}</td></tr>)}</tbody></table>{filteredRounds.length === 0 ? <div className="px-4 py-10 text-center text-sm text-slate-500">没有符合过滤条件的轮次</div> : null}</div></section>}</>}</section>
        )}
      </> : !loading ? <div className="py-16 text-center text-sm text-slate-400">未指定任务或任务不存在。</div> : null}

      {activeAgentSessionPath ? (
        <div className="fixed inset-0 z-[280] bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)] shadow-[0_32px_120px_rgba(15,23,42,0.35)]">
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
              <AgentSessionViewer sessionMeta={activeAgentSessionMeta || selectedSession} sessionHeader={sessionSnapshot?.session_meta} events={sessionEvents} loading={sessionLoading} live={sessionLive} error={sessionError} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
