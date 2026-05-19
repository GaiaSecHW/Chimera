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
  AppEaTaskDetail,
  AppEaTaskEvaluation,
  AppEaTaskResult,
} from '../../types/types';
import { showConfirm } from '../../components/DialogService';
import { useUiFeedback } from '../../components/UiFeedback';
import {
  hasBinarySecurityReturnTarget,
  navigateBackByTaskOrigin,
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
  {
    key: 'init',
    label: '模块加载',
    desc: '扫描模块文件，建立软链接工作目录',
    triggers: ['task_start', 'module_load', 'module_found', 'module_ready', 'task_resume'],
    artifactSubpath: 'run',
  },
  {
    key: 'r1',
    label: 'R1 函数提取',
    desc: '文件级并行：静态工具 + LLM 验证，逐函数提取定义与函数体',
    triggers: ['r1_static_extract', 'r1_static_done', 'r1_w_agent_start', 'r1_w_agent_done', 'r1_j_start', 'r1_j_done', 'r1_j_retry'],
    artifactSubpath: 'run/functions',
  },
  {
    key: 'r2',
    label: 'R2 函数分析',
    desc: '函数级并行：逐函数判断是否含外部输入（被动参数 / 主动拉取）',
    triggers: ['r2_w_start', 'r2_w_done', 'r2_j_start', 'r2_j_done', 'r2_j_retry',
               // 兼容旧流程事件
               'round_start', 'worker_start', 'master_worker_start'],
    artifactSubpath: 'run/analysis',
  },
  {
    key: 'r3',
    label: 'R3 文件过滤',
    desc: '文件级并行：筛选文件内最外层真实外部数据入口',
    triggers: ['r3_w_start', 'r3_w_done', 'r3_j_start', 'r3_j_done', 'r3_j_retry',
               // 兼容旧流程事件
               'judge_start', 'judge_eval', 'judge_end'],
    artifactSubpath: 'run/entries',
  },
  {
    key: 'r4',
    label: 'R4 模块汇总',
    desc: '模块级：跨文件调用链分析，保留真实最外层外部入口',
    triggers: ['r4_w_start', 'r4_w_done', 'r4_j_start', 'r4_j_done', 'r4_j_retry',
               // 兼容旧流程事件
               'round_end'],
    artifactSubpath: 'run',
  },
  {
    key: 'finish',
    label: '生成结果',
    desc: '输出 final_report.md 与 functions.list（JSON 格式）',
    triggers: ['task_end', 'functions_list_synced', 'functions_list_error'],
    artifactSubpath: 'output',
  },
];

type DetailTab = 'overview' | 'task-config' | 'session' | 'relationship' | 'result' | 'evaluation';
type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

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

function stageLabel(stage: string | undefined): string {
  const labels: Record<string, string> = {
    init:   '模块加载',
    r1:     'R1 函数提取',
    r2:     'R2 函数分析',
    r3:     'R3 文件过滤',
    r4:     'R4 模块汇总',
    finish: '生成结果',
    // 旧流程兼容
    analyse: '入口分析',
    judge:   '裁判综合',
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
  sessionStorage.setItem('secflow:fileExplorerNavigatePath', fsPath);
  window.dispatchEvent(new CustomEvent('secflow-navigate-view', { detail: { view: 'project-file-explorer', path: fsPath } }));
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
  stageFocusHint: 'R1' | 'R2' | 'R3' | 'R4' | '';
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

function deriveStepStatuses(taskStatus: string, events: AppEaStageEvent[]): StepStatus[] {
  const statuses: StepStatus[] = STAGE_STEPS.map(() => 'pending');
  if (taskStatus === 'pending') return statuses;
  if (taskStatus === 'passed') return STAGE_STEPS.map(() => 'completed');
  let last = -1;
  for (const evt of events) {
    STAGE_STEPS.forEach((step, index) => {
      if (step.triggers.includes(evt.type)) last = Math.max(last, index);
    });
  }
  if (last < 0) {
    statuses[0] = taskStatus === 'running' ? 'running' : ['failed', 'error', 'cancelled'].includes(taskStatus) ? 'failed' : 'pending';
    return statuses;
  }
  for (let i = 0; i < STAGE_STEPS.length; i += 1) {
    if (i < last) statuses[i] = 'completed';
    if (i === last) statuses[i] = ['failed', 'error', 'cancelled'].includes(taskStatus) ? 'failed' : 'running';
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
    case 'r1_w_agent_start':    return `[${ts}] ▶ R1-W 启动: ${d.file ?? ''}${d.is_retry ? '（重试）' : ''}`;
    case 'r1_w_agent_done':     return `[${ts}] ✓ R1-W 完成: ${d.file ?? ''} in=${d.tokens_in ?? 0} out=${d.tokens_out ?? 0}${d.error ? ` ✗${d.error.slice(0, 60)}` : ''}`;
    case 'r1_j_start':          return `[${ts}] ▶ R1-J 评审函数: ${d.func_hash ?? d.function ?? ''}`;
    case 'r1_j_done':           return `[${ts}] ${d.passed ? '✓' : '✗'} R1-J 函数评审 ${d.passed ? '通过' : '未通过'}: ${d.func_hash ?? d.function ?? ''}${d.feedback ? ` — ${String(d.feedback).slice(0, 80)}` : ''}`;
    case 'r1_j_retry':          return `[${ts}] ↺ R1 重试函数: ${d.func_hash ?? ''} (第${d.attempt ?? '?'}次)`;
    // ── R2 函数分析 ───────────────────────────────────────────────────
    case 'r2_w_start':          return `[${ts}] ▶ R2-W 分析: ${d.function ?? d.func_hash ?? ''}`;
    case 'r2_w_done':           return `[${ts}] ✓ R2-W 完成: ${d.function ?? d.func_hash ?? ''} has_input=${d.has_external_input ?? ''}`;
    case 'r2_j_start':          return `[${ts}] ▶ R2-J 评审文件: ${d.file ?? d.file_hash ?? ''}`;
    case 'r2_j_done':           return `[${ts}] ${d.passed ? '✓' : '✗'} R2-J 文件评审 ${d.passed ? '通过' : '未通过'}: ${d.file ?? ''} 问题函数=${d.failed_count ?? 0}`;
    case 'r2_j_retry':          return `[${ts}] ↺ R2 重试函数列表: ${d.file ?? ''} (${d.retry_count ?? '?'} 个)`;
    // ── R3 文件过滤 ───────────────────────────────────────────────────
    case 'r3_w_start':          return `[${ts}] ▶ R3-W 文件过滤: ${d.file ?? d.file_hash ?? ''}`;
    case 'r3_w_done':           return `[${ts}] ✓ R3-W 完成: ${d.file ?? ''} 保留入口=${d.entry_count ?? 0}`;
    case 'r3_j_start':          return `[${ts}] ▶ R3-J 评审: ${d.file ?? d.file_hash ?? ''}`;
    case 'r3_j_done':           return `[${ts}] ${d.passed ? '✓' : '✗'} R3-J 评审 ${d.passed ? '通过' : '未通过'}: ${d.file ?? ''}`;
    case 'r3_j_retry':          return `[${ts}] ↺ R3 重试: ${d.file ?? ''}`;
    // ── R4 模块汇总 ───────────────────────────────────────────────────
    case 'r4_w_start':          return `[${ts}] ▶ R4-W 模块汇总开始`;
    case 'r4_w_done':           return `[${ts}] ✓ R4-W 完成 最终入口=${d.entry_count ?? 0}`;
    case 'r4_j_start':          return `[${ts}] ▶ R4-J 最终评审`;
    case 'r4_j_done':           return `[${ts}] ${d.passed ? '✓' : '✗'} R4-J 最终评审 ${d.passed ? '通过' : '未通过'}`;
    case 'r4_j_retry':          return `[${ts}] ↺ R4 重试 (第${d.attempt ?? '?'}次)`;
    // ── 输出产物 ──────────────────────────────────────────────────────
    case 'functions_list_synced':   return `[${ts}] ✓ functions.list 生成: ${d.functions_count ?? 0} 条`;
    case 'functions_list_error':    return `[${ts}] ✗ functions.list 错误: ${String(d.error ?? '').slice(0, 80)}`;
    case 'functions_list_autofix':  return `[${ts}] │ functions.list 自动修复 ${d.fixes?.length ?? 0} 处`;
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
  const hasReturnContext = hasBinarySecurityReturnTarget(detail);
  const [result, setResult] = useState<AppEaTaskResult | null>(null);
  const [evaluation, setEvaluation] = useState<AppEaTaskEvaluation | null>(null);
  const [loading, setLoading] = useState(false);
  const [resultLoading, setResultLoading] = useState(false);
  const [evaluationLoading, setEvaluationLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
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
  const [stageFocusHint, setStageFocusHint] = useState<'R1' | 'R2' | 'R3' | 'R4' | ''>('');
  const [riskFocusHint, setRiskFocusHint] = useState('');

  const handleBack = () => {
    if (navigateBackByTaskOrigin(detail)) return;
    if (navigateBackToBinarySecurityTask()) return;
    onBack();
  };

  const loadDetail = async () => {
    if (!taskId) return;
    setLoading(true);
    try { setDetail(await appApi.getTask(taskId)); }
    catch (err: any) { notify(`加载任务详情失败: ${err?.message || err}`, 'error'); }
    finally { setLoading(false); }
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
    setSelectedSessionPath(path);
    setActiveAgentSessionPath(path);
  };

  const loadSessions = async (silent = false) => {
    if (!silent) setSessionsLoading(true);
    setSessionsError(null);
    try {
      const [data, index] = await Promise.all([
        appApi.listTaskSessions(taskId),
        appApi.getTaskSessionIndex(taskId).catch(() => null),
      ]);
      setSessions(data);
      setSessionIndex(index);
      setSelectedSessionPath((current) => current && data.some((item) => item.relative_path === current)
        ? current
        : data.find((item) => item.is_active)?.relative_path || data[0]?.relative_path || null);
    } catch (err: any) {
      setSessionsError(err?.message || String(err));
    } finally {
      if (!silent) setSessionsLoading(false);
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

  useEffect(() => { void loadDetail(); }, [taskId]);
  useEffect(() => {
    const stored = sessionStorage.getItem(stageFocusStorageKey) || '';
    const normalized = stored.trim().toUpperCase();
    setStageFocusHint(['R1', 'R2', 'R3', 'R4'].includes(normalized) ? (normalized as 'R1' | 'R2' | 'R3' | 'R4') : '');
  }, [stageFocusStorageKey, taskId]);
  useEffect(() => {
    const stored = sessionStorage.getItem(riskFocusStorageKey) || '';
    setRiskFocusHint(stored.trim());
  }, [riskFocusStorageKey, taskId]);
  useEffect(() => () => { closeSessionSocket(); closeJudgeSessionSocket(); }, []);
  useEffect(() => {
    if (!detail || !['pending', 'running'].includes(detail.status)) return;
    const timer = window.setInterval(() => void loadDetail(), 5000);
    return () => window.clearInterval(timer);
  }, [detail?.status, taskId]);
  useEffect(() => {
    if (!detail || !['pending', 'running'].includes(detail.status)) return;
    const timer = window.setInterval(() => setClockNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [detail?.status]);
  useEffect(() => {
    if (logsExpanded && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [detail?.stages_json?.events?.length, logsExpanded]);
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
    if (activeTab !== 'session' && activeTab !== 'overview' && activeTab !== 'relationship' && !activeAgentSessionPath) { closeSessionSocket(); return; }
    void loadSessions();
  }, [activeTab, taskId, activeAgentSessionPath]);
  useEffect(() => {
    if (activeTab !== 'session' && activeTab !== 'overview' && activeTab !== 'relationship' && !activeAgentSessionPath) return;
    if (!detail || !['pending', 'running'].includes(detail.status)) return;
    const timer = window.setInterval(() => void loadSessions(true), 12000);
    return () => window.clearInterval(timer);
  }, [activeTab, detail?.status, taskId, activeAgentSessionPath]);
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
    try { await appApi.restartTask(detail.task_id); notify('任务已重新启动', 'success'); await loadDetail(); if (activeTab === 'result') await loadResult(); }
    catch (err: any) { notify(`重启失败: ${err?.message || err}`, 'error'); }
    finally { setRestarting(false); }
  };
  const handleResume = async () => {
    if (!detail) return;
    setResuming(true);
    try { await appApi.resumeTask(detail.task_id); notify('已从断点继续', 'success'); await loadDetail(); if (activeTab === 'result') await loadResult(); }
    catch (err: any) { notify(`断点续跑失败: ${err?.message || err}`, 'error'); }
    finally { setResuming(false); }
  };

  const events = detail?.stages_json?.events || [];
  const statusSteps = detail ? deriveStepStatuses(detail.status, events) : STAGE_STEPS.map((): StepStatus => 'pending');
  const logLines = events.map(formatEvent);
  const groupedSessions = useMemo(() => {
    const map = new Map<string, AppEaSessionMeta[]>();
    sessions.forEach((session) => map.set(session.stage_group, [...(map.get(session.stage_group) || []), session]));
    return Array.from(map.entries());
  }, [sessions]);
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
            <button onClick={() => { void loadDetail(); if (activeTab === 'result') void loadResult(); if (activeTab === 'evaluation') void loadEvaluation(); }} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><RefreshCw size={14} className={loading || resultLoading || evaluationLoading ? 'animate-spin' : ''} /></button>
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
            ['overview', '总览'], ['task-config', '任务配置'], ['session', '智能体会话'], ['relationship', '智能体关系'], ['result', '结果'], ['evaluation', '观测指标'],
          ].map(([id, label]) => <button key={id} onClick={() => setActiveTab(id as DetailTab)} className={`rounded-2xl px-5 py-3 text-sm font-black transition ${activeTab === id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>{label}</button>)}</div>
        </section>

        {activeTab === 'overview' ? <>
          <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">任务概览</h2>
              <div className="mt-4 grid gap-x-8 gap-y-3 md:grid-cols-2">
                <InfoRow label="任务 ID" value={<span className="font-mono">{detail.task_id}</span>} />
                <InfoRow label="创建时间" value={detail.created_at ? new Date(detail.created_at).toLocaleString('zh-CN') : '-'} />
                <InfoRow label="模块目录" value={<span className="font-mono">{detail.input_path}</span>} />
                <InfoRow label="开始时间" value={detail.started_at ? new Date(detail.started_at).toLocaleString('zh-CN') : '-'} />
                <InfoRow label="源码目录" value={detail.source_path ? <span className="font-mono">{detail.source_path}</span> : '-'} />
                <InfoRow label="完成时间" value={detail.finished_at ? new Date(detail.finished_at).toLocaleString('zh-CN') : '-'} />
                <InfoRow label="分析模块" value={detail.module_name || '-'} />
                <InfoRow label="耗时" value={detail.finished_at ? formatDuration(detail.started_at, detail.finished_at) : formatLiveDuration(detail.started_at, clockNow)} />
                <InfoRow label="输出路径" value={detail.output_path ? <span className="font-mono">{detail.output_path}</span> : '-'} />
                <InfoRow label="描述" value={detail.task_description || '-'} />
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">阶段进度</h2>
              <div className="mt-4 space-y-3">{STAGE_STEPS.map((step, index) => {
                const state = statusSteps[index];
                const artifactFull = detail.output_path ? `${detail.output_path}/${detail.task_id}/${step.artifactSubpath}` : '';
                const artifactFsPath = artifactFull ? extractFsRelPath(artifactFull, projectId) : null;
                return <div key={step.key} className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3"><div className="flex items-start gap-3"><div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${state === 'completed' ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : state === 'running' ? 'border-blue-500 bg-blue-50 text-blue-600' : state === 'failed' ? 'border-red-400 bg-red-50 text-red-600' : 'border-slate-200 bg-white text-slate-400'}`}>{state === 'completed' ? <CheckCircle2 size={16} /> : state === 'running' ? <Loader2 size={14} className="animate-spin" /> : state === 'failed' ? <XCircle size={16} /> : index + 1}</div><div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-900">{step.label}</p><p className="mt-1 text-xs text-slate-500">{step.desc}</p>{artifactFsPath && state !== 'pending' ? <button onClick={() => openInFileExplorer(artifactFsPath)} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-violet-200 px-2 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-50"><FolderOpen size={11} />打开阶段输出</button> : null}</div></div></div>;
              })}</div>
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">当前运行智能体</h2>
                <p className="mt-1 text-xs text-slate-400">展示当前任务仍处于活跃状态的智能体会话与角色，点击可查看实时会话。</p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-600">
                {activeSessions.length} 个活跃会话
              </span>
            </div>
            {sessionsLoading && sessions.length === 0 ? (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                <Loader2 size={15} className="animate-spin" />
                加载智能体状态中...
              </div>
            ) : activeSessions.length > 0 ? (
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                <div className="divide-y divide-slate-200 bg-white">
                  {activeSessions.map((session) => (
                    <button key={session.relative_path} type="button" onClick={() => openActiveAgentSession(session.relative_path)} className="w-full px-4 py-4 text-left transition hover:bg-slate-50">
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
                {detail.status === 'pending' ? '任务尚未启动，当前没有活跃智能体。' : ['running', 'pending'].includes(detail.status) ? '当前没有检测到活跃智能体会话。' : '任务已结束，当前没有活跃智能体。'}
              </div>
            )}
          </section>
          {detail.error ? <section className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm"><h2 className="text-sm font-black uppercase tracking-[0.2em] text-red-600">错误信息</h2><pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-red-200 bg-white/70 px-3 py-3 text-xs text-red-700">{detail.error}</pre></section> : null}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><button onClick={() => setLogsExpanded((v) => !v)} className="flex w-full items-center justify-between gap-3 text-left"><div><h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">分析日志</h2><p className="mt-1 text-xs text-slate-400">{logLines.length} 条事件</p></div>{logsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>{logsExpanded ? logLines.length === 0 ? <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-400">暂无阶段事件</div> : <div ref={logRef} className="mt-4 max-h-[420px] overflow-auto rounded-xl border border-slate-800 bg-slate-950 px-3 py-3 font-mono text-xs leading-relaxed text-slate-300">{logLines.map((line, index) => <div key={index} className={line.includes('✗') ? 'text-red-400' : line.includes('▶') ? 'text-violet-300' : line.includes('✓') ? 'text-emerald-400' : line.includes('│') ? 'text-slate-400 text-[11px]' : 'text-slate-300'}>{line}</div>)}</div> : null}</section>
          {detail.prompt_content ? <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"><details><summary className="cursor-pointer select-none px-6 py-4 text-sm font-black text-slate-700 hover:bg-slate-50">分析 Prompt</summary><pre className="px-6 py-4 text-xs text-slate-600 whitespace-pre-wrap break-all bg-slate-50 max-h-72 overflow-auto border-t border-slate-100">{detail.prompt_content}</pre></details></section> : null}
        </> : activeTab === 'task-config' ? (
          <EntryAnalysisTaskConfigPanel detail={detail} />
        ) : activeTab === 'session' ? (
          <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><div><div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">会话列表</div><div className="mt-1 text-xs text-slate-500">{sessions.length} 个会话文件</div></div><button onClick={() => void loadSessions()} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><RefreshCw size={14} className={sessionsLoading ? 'animate-spin' : ''} /></button></div>{sessionsError ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">{sessionsError}</div> : null}{sessions.length === 0 ? <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">{sessionsLoading ? '加载会话中...' : '当前任务暂无智能体会话文件'}</div> : <div className="mt-4 max-h-[calc(100vh-20rem)] space-y-4 overflow-auto pr-1">{groupedSessions.map(([group, items]) => { const groupMatched = normalizedStageFocusKey ? String(group || '').toLowerCase().includes(normalizedStageFocusKey) || items.some((session) => String(session.relative_path || '').toLowerCase().includes(normalizedStageFocusKey)) : false; const groupRecommended = focusedSessionGroup?.group === group; return <div key={group} className={`rounded-2xl border px-3 py-3 transition ${groupRecommended ? 'border-indigo-200 bg-indigo-50/60' : groupMatched ? 'border-cyan-200 bg-cyan-50/50' : 'border-transparent bg-transparent'}`}><div className="mb-2 flex flex-wrap items-center gap-2"><div className={`text-[11px] font-black uppercase tracking-[0.18em] ${groupRecommended ? 'text-indigo-700' : groupMatched ? 'text-cyan-700' : 'text-slate-400'}`}>{group === 'root' ? '根会话' : group}</div>{groupRecommended ? <span className="rounded-full border border-indigo-200 bg-white px-2 py-0.5 text-[10px] font-bold text-indigo-700">当前推荐</span> : null}{!groupRecommended && groupMatched ? <span className="rounded-full border border-cyan-200 bg-white px-2 py-0.5 text-[10px] font-bold text-cyan-700">阶段命中</span> : null}</div><div className="space-y-2">{items.map((session) => { const selected = session.relative_path === selectedSessionPath; const stageMatched = normalizedStageFocusKey && String(session.relative_path || '').toLowerCase().includes(normalizedStageFocusKey); const recommended = focusedSessionGroup?.recommended?.relative_path === session.relative_path; return <button key={session.relative_path} onClick={() => setSelectedSessionPath(session.relative_path)} className={`w-full rounded-2xl border px-4 py-3 text-left transition ${selected ? 'border-slate-900 bg-slate-900 text-white' : recommended ? 'border-indigo-200 bg-indigo-50 text-slate-800 hover:bg-indigo-100/70' : stageMatched ? 'border-cyan-200 bg-cyan-50 text-slate-800 hover:bg-cyan-100/70' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-black">{session.display_name}</div><div className={`mt-1 truncate text-[11px] ${selected ? 'text-slate-300' : 'text-slate-500'}`}>{session.relative_path}</div></div><div className="flex shrink-0 flex-wrap justify-end gap-1"><span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${session.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'}`}>{session.is_active ? '活跃' : '历史'}</span>{recommended ? <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${selected ? 'border-indigo-300 bg-indigo-400/20 text-indigo-100' : 'border-indigo-200 bg-white text-indigo-700'}`}>推荐</span> : null}{!recommended && stageMatched ? <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${selected ? 'border-cyan-300 bg-cyan-400/20 text-cyan-100' : 'border-cyan-200 bg-white text-cyan-700'}`}>阶段命中</span> : null}</div></div><div className={`mt-3 flex flex-wrap gap-3 text-[11px] ${selected ? 'text-slate-300' : 'text-slate-500'}`}><span>事件 {session.event_count}</span><span>{new Date(session.mtime * 1000).toLocaleString('zh-CN')}</span></div></button>; })}</div></div>; })}</div>}</aside>
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
          <section className="space-y-4"><div className="grid gap-4 xl:grid-cols-5"><MetricCard label="函数数" value={result?.summary.function_count ?? 0} icon={<ScrollText size={18} />} /><MetricCard label="轮次数" value={result?.summary.round_count ?? 0} icon={<BarChart3 size={18} />} /><MetricCard label="通过轮次" value={result?.summary.passed_round_count ?? 0} icon={<CheckCircle2 size={18} />} /><MetricCard label="总 Token" value={formatNumber(result?.summary.total_tokens)} icon={<ScrollText size={18} />} /><div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm"><div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">结果目录</div><div className="mt-2 text-sm font-semibold text-slate-700 line-clamp-2">{result?.output_root || '-'}</div><div className="mt-3 flex flex-wrap gap-2"><button disabled={!resultRootFsPath} onClick={() => resultRootFsPath && openInFileExplorer(resultRootFsPath)} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 px-2 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"><FolderOpen size={11} />打开目录</button><button disabled={!result?.output_root} onClick={() => result?.output_root && navigator.clipboard.writeText(result.output_root)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-50"><ClipboardCopy size={10} />复制路径</button></div></div></div>{resultLoading ? <section className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm text-center text-sm text-slate-500">加载结果中...</section> : !result ? <section className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm text-center text-sm text-slate-500">暂无结果数据</section> : !result.available ? <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 shadow-sm text-center text-sm text-slate-500">任务完成后可查看结果，当前状态：{STATUS_LABEL[result.status] || result.status}</section> : <section className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_300px]"><aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">结果导航</div><div className="mt-3 space-y-2">{[['final', '最终结果'], ['functions', 'functions.list'], ['report', '运行报告'], ['json', '结构化 JSON']].map(([id, label]) => <button key={id} onClick={() => setResultView(id as any)} className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-black transition ${resultView === id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'}`}>{label}</button>)}</div></aside><main className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="border-b border-slate-200 pb-4 text-2xl font-black tracking-tight text-slate-900">{resultView === 'final' ? '最终结果' : resultView === 'functions' ? '函数列表' : resultView === 'report' ? '运行报告' : '结构化 JSON'}</h2><div className="mt-5 max-h-[calc(100vh-24rem)] overflow-auto pr-2">{resultContent ? resultView === 'json' ? <pre className="rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{resultContent}</pre> : <MarkdownContent content={markdownResultContent} /> : <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">当前结果缺少可展示内容</div>}</div></main><aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">函数列表</div><div className="mt-3 max-h-[360px] space-y-2 overflow-auto pr-1">{result.functions.length ? result.functions.map((fn) => <div key={fn} className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-[11px] text-slate-700">{fn}</div>) : <div className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">没有 functions.list 内容</div>}</div></aside></section>}</section>
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
