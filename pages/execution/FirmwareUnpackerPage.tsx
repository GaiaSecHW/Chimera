import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertCircle, ArrowLeft, CheckCircle2, ChevronRight, Clock,
  FolderOpen, Loader2, Package, Play, RefreshCw,
  Square, Trash2, XCircle, ListTodo, RotateCcw, Search, X, Plus, Terminal, Sparkles,
  Activity, BarChart3, Info,
} from 'lucide-react';
import { api } from '../../clients/api';
import { FileWatchMessage } from '../../clients/fileserver';
import {
  FirmwareEvolutionJob,
  FirmwareEvolutionRound,
  FirmwareEvolutionSessionIndex,
  FirmwareTaskConfigSnapshot,
  FirmwareTaskEvent,
  FirmwareTaskLog,
  FirmwareTaskMetrics,
  FirmwareTaskProgress,
  FirmwareTaskResourceUsage,
  FirmwareTaskResult,
  FirmwareTaskRoundMetric,
  FirmwareUnpackTask,
  TaskListQuery,
} from '../../clients/firmwareUnpacker';
import { AppSaSessionEvent, AppSaSessionMeta, AppSaSessionSnapshot, SecurityProject } from '../../types/types';
import { FileServerPickerModal } from '../../components/assets/FileServerPickerModal';
import { showConfirm } from '../../components/DialogService';
import { ExecutionTable, ExecutionTableHead, ExecutionTableTh, ExecutionTableTd, executionTableInteractiveRowClassName } from '../../components/execution/ExecutionTable';
import { ServicePageTitle, useServiceBuildVersion } from '../../components/execution/ServiceBuildVersion';
import { PageHeader } from '../../design-system';
import { useUiFeedback } from '../../components/UiFeedback';
import { hasBinarySecurityReturnTarget, navigateBackByTaskOrigin, navigateBackToBinarySecurityTask } from '../../utils/executionReturnContext';
import { TaskOriginCard, TaskOriginInline } from './taskOrigin';
import { AgentSessionViewer } from './AgentSessionViewer';
import { DownstreamTaskCreator } from './DownstreamTaskCreator';
import { blobToText, buildFirmwareSessionMeta, buildSessionSnapshotFromText, FirmwareSessionIndexItem, normalizeFirmwareSessionIndex, parseSessionJsonlDelta } from './sessionParsing';
import { FirmwareUnpackerTaskConfigPanel } from './TaskConfigPanels';

interface Props {
  projectId: string;
  projects?: SecurityProject[];
  initialTaskId?: string;
  onActiveTaskChange?: (taskId: string) => void;
}

const fwApi = api.domains.execution.firmwareUnpacker;

const TERMINAL = new Set(['success', 'failed', 'cancelled', 'max_retries_reached']);
const isTerminal = (s: string) => TERMINAL.has(s);
const canCancelTask = (s: string) => ['pending', 'running', 'cancelling'].includes(s);

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'pending', label: '排队中' },
  { value: 'running', label: '运行中' },
  { value: 'cancelling', label: '取消中' },
  { value: 'cancelled', label: '已取消' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' },
];

const ORIGIN_MODE_OPTIONS = [
  { value: '', label: '全部来源' },
  { value: 'manual', label: '手动任务' },
  { value: 'linked', label: '总任务关联' },
];
const PAGE_SIZE_OPTIONS = [10, 50, 100, 200, 500, 1000];

const FILESERVER_CONTAINER_ROOT = '/data/files';
const TASK_WORKSPACE_SEGMENT = 'app/chimera-app-firmware-unpacker';
type DetailTab = 'overview' | 'task-config' | 'metrics' | 'events' | 'session' | 'evolution' | 'result';

function sameJsonValue(left: unknown, right: unknown) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function buildWorkspacePreview(projectId: string, taskId = '<task-id>') {
  const base =`${FILESERVER_CONTAINER_ROOT}/${projectId}/${TASK_WORKSPACE_SEGMENT}/${taskId}`;
  return {
    input:`${base}/input`,
    output:`${base}/output`,
    run:`${base}/run`,
  };
}

function deriveRunPath(outputPath: string) {
  const normalized = String(outputPath || '').replace(/\/+$/, '');
  if (!normalized) return '';
  if (normalized.endsWith('/output')) {
    return`${normalized.slice(0, -'/output'.length)}/run`;
  }
  return '';
}

function resolveTaskRunPath(
  task: Pick<FirmwareUnpackTask, 'run_path' | 'run_root' | 'runtime_root' | 'output_path'> | null | undefined,
) {
  const explicit = String(task?.run_path || '').trim();
  if (explicit) return explicit;
  const runRoot = String(task?.run_root || '').trim();
  if (runRoot) return runRoot;
  const runtimeRoot = String(task?.runtime_root || '').trim();
  if (runtimeRoot) return runtimeRoot;
  return deriveRunPath(String(task?.output_path || ''));
}

function fmtTime(iso: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('zh-CN', { hour12: false });
}

function fmtDuration(s: string | null, e: string | null) {
  if (!s) return '-';
  const ms = (e ? new Date(e).getTime() : Date.now()) - new Date(s).getTime();
  const sec = Math.round(ms / 1000);
  return sec < 60 ?`${sec}s` :`${Math.floor(sec / 60)}m${sec % 60}s`;
}

function basename(path: string | null | undefined) {
  const normalized = String(path || '').replace(/\/+$/, '');
  if (!normalized) return '-';
  const parts = normalized.split('/');
  return parts[parts.length - 1] || normalized;
}

function formatSeconds(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return '-';
  const value = Math.max(0, Math.round(seconds));
  if (value < 60) return`${value}s`;
  if (value < 3600) return`${Math.floor(value / 60)}m${value % 60}s`;
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return`${hours}h${minutes}m`;
}

function formatPhaseDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return '';
  return`（${formatSeconds(seconds)}）`;
}

function formatPhaseTokens(tokens: number | null | undefined) {
  if (tokens == null || !Number.isFinite(tokens)) return '';
  return`（${Math.max(0, Math.round(tokens)).toLocaleString()} tokens）`;
}

function formatTokenLines(inputTokens: number | null | undefined, outputTokens: number | null | undefined) {
  const hasInput = inputTokens != null && Number.isFinite(inputTokens);
  const hasOutput = outputTokens != null && Number.isFinite(outputTokens);
  if (!hasInput && !hasOutput) return null;
  return (
    <div className="mt-1 space-y-0.5 text-[10px] leading-tight text-theme-text-muted">
      <div>输入：{hasInput ?`${Math.max(0, Math.round(inputTokens as number)).toLocaleString()} tokens` : '-'}</div>
      <div>输出：{hasOutput ?`${Math.max(0, Math.round(outputTokens as number)).toLocaleString()} tokens` : '-'}</div>
    </div>
  );
}

function formatEvolutionToolDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return '-';
  return formatSeconds(seconds);
}

type ProgressPhase = FirmwareTaskProgress['phases'][number];

type ProgressLaneNode = {
  key: string;
  label: string;
  phase: ProgressPhase;
  rounds?: ProgressPhase[];
};

function buildPlaceholderPhase(key: string, label: string): ProgressPhase {
  return {
    key,
    label,
    status: 'not_executed',
    detail: '未执行',
    updated_at: null,
    current_round: null,
    total_rounds: null,
    duration_seconds: null,
    token_total: null,
    input_tokens: null,
    output_tokens: null,
  };
}

function normalizeProgressPhases(progress: FirmwareTaskProgress | null): ProgressPhase[] {
  if (!progress) return [];
  const byKey = new Map(progress.phases.map((phase) => [phase.key, phase]));
  const phaseKeys = progress.phases.map((phase) => phase.key);
  const roundKeys = phaseKeys
    .map((key) => {
      const matched = key.match(/^(llm_unpack|recursive_expand_llm|llm_review)_round_(\d+)$/);
      return matched ? Number(matched[2]) : null;
    })
    .filter((value): value is number => value != null);
  const hasRoundPhases = roundKeys.length > 0 || typeof progress.current_round === 'number';
  const maxRound = hasRoundPhases ? Math.max(1, progress.current_round || 1, ...roundKeys) : 0;
  const toolReviewPhase = byKey.get('llm_review_tool');

  const expected: Array<{ key: string; label: string }> = [
    { key: 'preprocess', label: '预处理' },
    { key: 'tool_match', label: '工具匹配执行' },
    { key: 'recursive_expand_tool', label: '递归解包（工具后）' },
  ];

  if (hasRoundPhases) {
    if (toolReviewPhase) {
      expected.push({ key: 'llm_review_tool', label: toolReviewPhase.label || 'tool评审' });
    }
    for (let round = 1; round <= maxRound; round += 1) {
      expected.push({ key:`llm_unpack_round_${round}`, label:`LLM 解包（第${round}轮）` });
      expected.push({ key:`recursive_expand_llm_round_${round}`, label:`递归解包（第${round}轮后）` });
      expected.push({ key:`llm_review_round_${round}`, label:`LLM 评审（第${round}轮）` });
    }
  } else {
    expected.push({ key: 'llm_unpack', label: 'LLM 解包' });
    expected.push({ key: 'recursive_expand_llm', label: '递归解包（LLM后）' });
    expected.push(
      toolReviewPhase
        ? { key: 'llm_review_tool', label: toolReviewPhase.label || 'LLM 评审（工具阶段）' }
        : { key: 'llm_review', label: 'LLM评审' },
    );
  }
  expected.push({ key: 'llm_cleanup', label: 'LLM 清理' });

  return expected.map(({ key, label }) => {
    const existing = byKey.get(key);
    if (existing) return existing;
    const phase = buildPlaceholderPhase(key, label);
    if (key.startsWith('llm_') || key.startsWith('recursive_expand_llm_round_')) {
      phase.total_rounds = progress.total_rounds ?? null;
      const matched = key.match(/_round_(\d+)$/);
      if (matched) phase.current_round = Number(matched[1]);
    }
    return phase;
  });
}

function groupRoundPhasesByPrefix(phases: ProgressPhase[], prefix: string) {
  return phases
    .filter((phase) => phase.key.startsWith(`${prefix}_round_`))
    .sort((left, right) => {
      const leftRound = Number(left.key.match(/_round_(\d+)$/)?.[1] || 0);
      const rightRound = Number(right.key.match(/_round_(\d+)$/)?.[1] || 0);
      return leftRound - rightRound;
    });
}

function buildLayeredProgressNodes(phases: ProgressPhase[]) {
  const byKey = new Map(phases.map((phase) => [phase.key, phase]));
  const preprocess = byKey.get('preprocess') || buildPlaceholderPhase('preprocess', '预处理');
  const cleanup = byKey.get('llm_cleanup') || buildPlaceholderPhase('llm_cleanup', 'LLM 清理');
  const toolReview = byKey.get('llm_review_tool') || byKey.get('llm_review') || buildPlaceholderPhase('llm_review_tool', 'tool评审');
  const llmUnpackRounds = groupRoundPhasesByPrefix(phases, 'llm_unpack');
  const llmRecursiveRounds = groupRoundPhasesByPrefix(phases, 'recursive_expand_llm');
  const llmReviewRounds = groupRoundPhasesByPrefix(phases, 'llm_review');

  const toolLane: ProgressLaneNode[] = [
    {
      key: 'tool_match',
      label: '工具匹配执行',
      phase: byKey.get('tool_match') || buildPlaceholderPhase('tool_match', '工具匹配执行'),
    },
    {
      key: 'recursive_expand_tool',
      label: '递归解包',
      phase: byKey.get('recursive_expand_tool') || buildPlaceholderPhase('recursive_expand_tool', '递归解包'),
    },
    {
      key: 'llm_review_tool',
      label: 'tool评审',
      phase: toolReview,
    },
  ];

  const llmLane: ProgressLaneNode[] = [
    {
      key: 'llm_unpack',
      label: 'LLM 解包',
      phase: byKey.get('llm_unpack') || llmUnpackRounds[0] || buildPlaceholderPhase('llm_unpack', 'LLM 解包'),
      rounds: llmUnpackRounds,
    },
    {
      key: 'recursive_expand_llm',
      label: '递归解包',
      phase: byKey.get('recursive_expand_llm') || llmRecursiveRounds[0] || buildPlaceholderPhase('recursive_expand_llm', '递归解包'),
      rounds: llmRecursiveRounds,
    },
    {
      key: 'llm_review',
      label: 'LLM评审',
      phase: byKey.get('llm_review') || llmReviewRounds[0] || buildPlaceholderPhase('llm_review', 'LLM评审'),
      rounds: llmReviewRounds,
    },
  ];

  return { preprocess, cleanup, toolLane, llmLane };
}

type ProgressConnectorPath = {
  id: string;
  d: string;
  stroke?: string;
  dashArray?: string;
};

function phaseNodeTone(status: string) {
  if (status === 'success') return 'border-emerald-500 bg-emerald-500/15 text-emerald-400';
  if (status === 'running') return 'border-blue-500 bg-blue-500/15 text-blue-400';
  if (status === 'failed') return 'border-red-400 bg-red-500/15 text-red-400';
  if (status === 'skipped') return 'border-amber-400 bg-amber-500/15 text-amber-400';
  return 'border-theme-border bg-theme-bg-app text-theme-text-muted';
}

function phaseTextTone(status: string) {
  if (status === 'running') return 'text-blue-400';
  if (status === 'success') return 'text-emerald-400';
  if (status === 'failed') return 'text-red-500';
  if (status === 'skipped') return 'text-amber-400';
  return 'text-theme-text-muted';
}

function fmtPercent(used: number | null, limit: number | null, unitSuffix = '') {
  if (used == null || limit == null || limit <= 0) return '-';
  const percent = Math.max(0, (used / limit) * 100);
  return`${percent.toFixed(percent >= 10 ? 1 : 2)}%${unitSuffix}`;
}

function extractFsRelPath(outputPath: string, projectId: string): string | null {
  const prefix =`/data/files/${projectId}`;
  if (!outputPath.startsWith(prefix)) return null;
  const rel = outputPath.slice(prefix.length).replace(/\/+$/, '');
  return rel.startsWith('/') ? rel :`/${rel}`;
}

function normalizeJoinPath(basePath: string, relativePath: string): string {
  const base = basePath.replace(/\/+$/, '');
  const relative = relativePath.replace(/^\/+/, '');
  return`${base}/${relative}`;
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return '-';
  if (bytes < 1024) return`${bytes} B`;
  if (bytes < 1024 * 1024) return`${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return`${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return`${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return value.toLocaleString('zh-CN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function formatCost(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  if (value === 0) return '$0';
  return`$${value.toFixed(value < 0.01 ? 6 : 4)}`;
}

function resultEntryKindLabel(kind: string | null | undefined): string {
  return String(kind || '').toLowerCase() === 'dir' ? '目录' : '文件';
}

function roundStatusLabel(status: string | null | undefined): string {
  const raw = String(status || 'unknown');
  const labels: Record<string, string> = {
    review_passed: '评审通过',
    review_failed: '评审未通过',
    success: '成功',
    failed: '失败',
    running: '运行中',
    cancelled: '已取消',
    unknown: '未知',
  };
  return labels[raw] || raw;
}

function roundStatusTone(status: string | null | undefined): string {
  const raw = String(status || '').toLowerCase();
  if (['review_passed', 'success', 'completed'].includes(raw)) return 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400';
  if (['review_failed'].includes(raw)) return 'border-amber-500/20 bg-amber-500/15 text-amber-400';
  if (['failed', 'error'].includes(raw)) return 'border-red-500/20 bg-red-500/15 text-red-400';
  if (['running', 'active'].includes(raw)) return 'border-blue-500/20 bg-blue-500/15 text-blue-400';
  if (['cancelled', 'cancelling'].includes(raw)) return 'border-theme-border bg-theme-bg-app text-theme-text-secondary';
  return 'border-theme-border bg-theme-bg-app text-theme-text-secondary';
}

function inferTimelineTone(event: FirmwareTaskEvent) {
  return {
    icon: Sparkles,
    line: 'from-sky-200 via-blue-300 to-cyan-100',
    node: 'border-sky-500/20 bg-sky-500/15 text-sky-400',
    badge: 'border-sky-500/20 bg-sky-500/15 text-sky-400',
    glow: 'shadow-sky-100/80',
  };
}

function clampPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function formatEventTypeLabel(eventType: string | null | undefined) {
  const labels: Record<string, string> = {
    task_created: '任务创建',
    task_claimed: '任务认领',
    runner_started: '执行进程启动',
    task_started: '开始执行',
    stage_changed: '阶段切换',
    tool_matched: '工具命中',
    tool_fallback_to_llm: '回退 LLM',
    executor_round_completed: '执行轮完成',
    review_round_completed: '评审轮完成',
    cleanup_started: '清理开始',
    cleanup_completed: '清理完成',
    cancel_requested: '取消请求',
    cancel_hook_triggered: '取消钩子',
    cancel_sigterm_sent: '发送 SIGTERM',
    cancel_sigkill_sent: '发送 SIGKILL',
    task_cancelled: '任务取消',
    task_failed: '任务失败',
    task_succeeded: '任务成功',
    lease_expired: '租约过期',
    owner_lost: 'Owner 丢失',
    orphan_recovered: '孤儿收敛',
    task_result_cache_refreshed: '结果缓存刷新',
    task_result_cache_refresh_failed: '缓存刷新失败',
    skill_generation_queued: '自进化入队',
    skill_generation_started: '自进化开始',
    skill_generation_completed: '自进化完成',
    skill_generation_failed: '自进化失败',
  };
  const raw = String(eventType || 'event');
  return labels[raw] || raw;
}

function formatEventDetailValue(value: unknown): string {
  if (value == null) return '-';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '-';
  if (typeof value === 'string') return value || '-';
  try {
    const text = JSON.stringify(value);
    return text.length > 160 ?`${text.slice(0, 160)}...` : text;
  } catch {
    return String(value);
  }
}

function eventDetailRows(detail: Record<string, any> | null) {
  if (!detail || Object.keys(detail).length === 0) return [];
  const labels: Record<string, string> = {
    reason: '原因',
    error: '错误',
    owner_id: 'Owner',
    runner_pid: 'Runner PID',
    signal: '信号',
    from: '来源阶段',
    to: '目标阶段',
    round: '轮次',
    matched_skill: '命中工具',
    fallback_to_llm: '回退 LLM',
    result_status: '结果状态',
    rounds: '执行轮数',
    retry_mode: '重试模式',
    provider_role: 'LLM 角色',
    stage_from: '来源阶段',
    stage_to: '目标阶段',
    job_id: '任务',
    skill_generation_status: '自进化状态',
    generated_skill_path: '生成结果',
  };
  const priority = [
    'reason', 'error', 'owner_id', 'runner_pid', 'signal', 'from', 'to',
    'round', 'matched_skill', 'fallback_to_llm', 'result_status', 'rounds',
    'retry_mode', 'provider_role', 'job_id', 'skill_generation_status', 'generated_skill_path', 'stage_from', 'stage_to',
  ];
  const orderedKeys = [
    ...priority.filter((key) => Object.prototype.hasOwnProperty.call(detail, key)),
    ...Object.keys(detail).filter((key) => !priority.includes(key)).sort(),
  ];
  return orderedKeys.map((key) => ({
    key,
    label: labels[key] || key,
    value: formatEventDetailValue(detail[key]),
  }));
}

function EventDetailBlock({ detail }: { detail: Record<string, any> | null }) {
  const rows = eventDetailRows(detail);
  if (rows.length === 0) return null;
  return (
    <div className="mt-3 rounded-2xl border border-theme-border bg-slate-50/80 px-3 py-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-theme-text-muted">
        <Info size={12} />
        事件细节
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {rows.slice(0, 8).map((row) => (
 <div key={row.key} className="min-w-0 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-xs">
            <div className="font-bold text-theme-text-muted">{row.label}</div>
            <div className="mt-1 break-all font-mono text-theme-text-secondary">{row.value}</div>
          </div>
        ))}
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-bold text-theme-text-muted hover:text-theme-text-primary">
          查看原始 JSON
        </summary>
        <pre className="mt-2 max-h-48 overflow-auto rounded-xl border border-theme-border bg-theme-surface px-3 py-3 text-xs leading-6 text-theme-text-secondary">
          {JSON.stringify(detail, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function formatEvolutionStatus(status: string | null | undefined) {
  const raw = String(status || '').toLowerCase();
  const labels: Record<string, string> = {
    pending: '排队中',
    running: '运行中',
    success: '成功',
    failed: '失败',
    cancelled: '已取消',
  };
  return labels[raw] || (status || '-');
}

function evolutionStatusTone(status: string | null | undefined) {
  const raw = String(status || '').toLowerCase();
  if (raw === 'success') return 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400';
  if (raw === 'running') return 'border-blue-500/20 bg-blue-500/15 text-blue-400';
  if (raw === 'pending') return 'border-amber-500/20 bg-amber-500/15 text-amber-400';
  if (raw === 'failed') return 'border-red-500/20 bg-red-500/15 text-red-400';
  if (raw === 'cancelled') return 'border-theme-border bg-theme-bg-app text-theme-text-secondary';
  return 'border-theme-border bg-theme-bg-app text-theme-text-secondary';
}

function evolutionStageLabel(stage: string | null | undefined) {
  const labels: Record<string, string> = {
    tool_execute: '工具执行',
    review: '评审',
    evolve: '工具进化',
  };
  return labels[String(stage || '')] || (stage || '-');
}

function MetricBar({ label, value, tone = 'blue' }: { label: string; value: number | null | undefined; tone?: 'blue' | 'emerald' | 'amber' | 'rose' }) {
  const percent = clampPercent(value);
  const toneClass = {
    blue: 'bg-blue-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
  }[tone];
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] font-bold text-theme-text-muted">
        <span>{label}</span>
        <span>{value == null || !Number.isFinite(value) ? '-' :`${percent.toFixed(percent >= 10 ? 1 : 2)}%`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-theme-elevated">
        <div className={`h-full rounded-full ${toneClass}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function TaskStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { cls: string; label: string }> = {
    pending: { cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20', label: '排队中' },
    running: { cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20', label: '运行中' },
    cancelling: { cls: 'bg-orange-500/15 text-orange-400 border-orange-500/20', label: '取消中' },
    cancelled: { cls: 'bg-theme-bg-app text-theme-text-muted border-theme-border', label: '已取消' },
    success: { cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', label: '成功' },
    failed: { cls: 'bg-red-500/15 text-red-400 border-red-500/20', label: '失败' },
    max_retries_reached: { cls: 'bg-red-500/15 text-red-400 border-red-500/20', label: '超限' },
  };
  const { cls, label } = cfg[status] ?? { cls: 'bg-theme-bg-app text-theme-text-muted', label: status };
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${cls}`}>
      {label}
    </span>
  );
}

function RoundDetailMetricCard({ label, value, hint }: { label: string; value: string; hint?: string | null }) {
  return (
    <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-theme-text-muted">{label}</div>
      <div className="mt-2 text-xl font-semibold text-theme-text-primary">{value}</div>
      {hint ? <div className="mt-1 text-xs text-theme-text-muted">{hint}</div> : null}
    </div>
  );
}

function RoundDetailField({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-theme-text-muted">{label}</div>
      <div className={`mt-1 text-sm text-theme-text-secondary ${mono ? 'break-all font-mono text-[12px]' : ''}`}>{value}</div>
    </div>
  );
}

function pickRoundSummaryText(round: FirmwareTaskRoundMetric, kind: 'executor' | 'reviewer'): string {
  const raw = round.raw && typeof round.raw === 'object' ? round.raw : {};
  const rawAgent = raw[kind] && typeof raw[kind] === 'object' ? raw[kind] as Record<string, any> : {};
  const candidates = kind === 'executor'
    ? [
        round.artifacts.summary_text,
        rawAgent.response,
        rawAgent.result,
        raw.response,
        round.executor.response_preview,
        round.artifacts.summary_preview,
      ]
    : [
        round.artifacts.reason_text,
        rawAgent.review_result,
        rawAgent.response,
        raw.review,
        round.reviewer.review_preview,
        round.artifacts.reason_preview,
      ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  return kind === 'executor' ? '暂无工作总结' : '暂无评审总结';
}

function RoundAgentCard({
  title,
  round,
  kind,
}: {
  title: string;
  round: FirmwareTaskRoundMetric;
  kind: 'executor' | 'reviewer';
}) {
  const agent = kind === 'executor' ? round.executor : round.reviewer;
  const preview = kind === 'executor' ? round.executor.response_preview : round.reviewer.review_preview;
  const statusNode = kind === 'reviewer'
    ? (
        <span className={round.reviewer.passed ? 'font-bold text-emerald-400' : 'font-bold text-amber-400'}>
          {round.reviewer.passed ? '通过' : '未通过'}
        </span>
      )
    : (agent.status || '-');
  return (
 <section className="rounded-2xl border border-theme-border bg-theme-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-theme-text-primary">{title}</div>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${kind === 'reviewer' ? (round.reviewer.passed ? 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400' : 'border-amber-500/20 bg-amber-500/15 text-amber-400') : 'border-theme-border bg-theme-bg-app text-theme-text-secondary'}`}>
          {statusNode}
        </span>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <RoundDetailField label="耗时" value={formatSeconds(agent.duration_seconds)} />
        <RoundDetailField label="角色" value={agent.provider_role || round.context.provider_role || '-'} />
        <RoundDetailField label="会话文件" value={agent.session_file || '-'} mono />
        <RoundDetailField label="状态" value={kind === 'reviewer' ? statusNode : (agent.status || '-')} />
      </div>
      <div className="mt-3 rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-theme-text-muted">摘要</div>
        <div className="mt-2 text-sm leading-6 text-theme-text-secondary">{preview || '暂无摘要'}</div>
      </div>
    </section>
  );
}

function RoundDetailModal({
  round,
  onClose,
}: {
  round: FirmwareTaskRoundMetric;
  onClose: () => void;
}) {
  const [activeSummaryTab, setActiveSummaryTab] = useState<'executor' | 'reviewer'>('executor');
  const activeSummaryTitle = activeSummaryTab === 'executor' ? '工作总结' : '评审总结';
  const activeSummaryText = pickRoundSummaryText(round, activeSummaryTab);
  const activeSummaryMeta = activeSummaryTab === 'executor'
    ? {
        status: round.executor.status || '-',
        duration: formatSeconds(round.executor.duration_seconds),
        role: round.executor.provider_role || round.context.provider_role || '-',
        session: round.executor.session_file || '-',
      }
    : {
        status: round.reviewer.passed ? '通过' : '未通过',
        duration: formatSeconds(round.reviewer.duration_seconds),
        role: round.reviewer.provider_role || round.context.provider_role || '-',
        session: round.reviewer.session_file || '-',
      };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-6 backdrop-blur-sm">
 <div className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-theme-border bg-theme-surface">
        <div className="flex items-start justify-between gap-4 border-b border-theme-border px-6 py-5">
          <div>
            <h3 className="mt-2 text-xl font-semibold text-theme-text-primary">轮次 #{round.round} 结果详情</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${roundStatusTone(round.status)}`}>{roundStatusLabel(round.status)}</span>
              {round.context.fallback_to_llm ? <span className="rounded-full bg-blue-500/15 px-2.5 py-1 text-[11px] font-bold text-blue-400">回退 LLM</span> : null}
              {round.context.matched_skill ? <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-400">{round.context.matched_skill}</span> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-theme-text-muted hover:bg-theme-elevated hover:text-theme-text-secondary"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 overflow-auto px-6 py-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <RoundDetailMetricCard label="耗时" value={formatSeconds(round.duration_seconds)} hint={`${fmtTime(round.started_at)} -> ${fmtTime(round.completed_at)}`} />
            <RoundDetailMetricCard label="Token" value={formatNumber(round.tokens.total)} hint={`输入 ${formatNumber(round.tokens.input)} · 输出 ${formatNumber(round.tokens.output)}`} />
            <RoundDetailMetricCard label="Cost" value={formatCost(round.tokens.cost)} hint={`缓存读 ${formatNumber(round.tokens.cache_read)} · 写 ${formatNumber(round.tokens.cache_write)}`} />
            <RoundDetailMetricCard label="输出大小" value={formatBytes(round.output_snapshot.output_total_size_bytes)} hint={`文件 ${round.output_snapshot.output_file_count} · 目录 ${round.output_snapshot.output_dir_count}`} />
            <RoundDetailMetricCard label="本轮增长" value={formatBytes(round.output_delta.size_bytes_delta)} hint={`文件 ${round.output_delta.file_count_delta} · 目录 ${round.output_delta.dir_count_delta}`} />
            <RoundDetailMetricCard label="告警数" value={String(round.artifacts.warnings.length)} hint={round.artifacts.summary_present || round.artifacts.reason_present ? '已生成文档产物' : '未生成文档产物'} />
          </div>

 <section className="rounded-2xl border border-theme-border bg-theme-surface p-4">
            <div className="text-sm font-semibold text-theme-text-primary">策略与来源</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <RoundDetailField label="命中工具" value={round.context.matched_skill || '-'} />
              <RoundDetailField label="回退到 LLM" value={round.context.fallback_to_llm ? '是' : '否'} />
              <RoundDetailField label="Provider Role" value={round.context.provider_role || '-'} />
              <RoundDetailField label="基线轮次" value={round.output_delta.baseline_round == null ? '-' :`#${round.output_delta.baseline_round}`} />
            </div>
            {round.source_path ? (
              <div className="mt-3 rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-theme-text-muted">results.json 路径</div>
                <div className="mt-2 break-all font-mono text-[12px] text-theme-text-secondary">{round.source_path}</div>
              </div>
            ) : null}
          </section>

 <section className="rounded-2xl border border-theme-border bg-theme-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-theme-text-primary">工作与评审总结</div>
                <div className="mt-1 text-xs text-theme-text-muted">默认展示结构化摘要，原始 JSON 仅作为额外信息折叠查看</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'executor' as const, label: '工作总结', hint: round.executor.status || '-' },
                  { key: 'reviewer' as const, label: '评审总结', hint: round.reviewer.passed ? '通过' : '未通过' },
                ].map((tab) => {
                  const active = activeSummaryTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveSummaryTab(tab.key)}
                      className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${active ? 'border-theme-border bg-theme-surface text-white' : 'border-theme-border bg-theme-surface text-theme-text-secondary hover:bg-theme-elevated'}`}
                    >
                      {tab.label}
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] ${active ? 'bg-slate-50/15 text-slate-100' : 'bg-theme-elevated text-theme-text-muted'}`}>
                        {tab.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
              <div className="space-y-3">
                <RoundAgentCard title="执行器" round={round} kind="executor" />
                <RoundAgentCard title="评审器" round={round} kind="reviewer" />
              </div>
              <div className="rounded-[1.75rem] border border-theme-border bg-theme-bg-app p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-theme-text-primary">{activeSummaryTitle}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full border border-theme-border bg-theme-bg-app px-2.5 py-1 font-bold text-theme-text-secondary">状态：{activeSummaryMeta.status}</span>
                    <span className="rounded-full border border-theme-border bg-theme-bg-app px-2.5 py-1 font-bold text-theme-text-secondary">耗时：{activeSummaryMeta.duration}</span>
                    <span className="rounded-full border border-theme-border bg-theme-bg-app px-2.5 py-1 font-bold text-theme-text-secondary">角色：{activeSummaryMeta.role}</span>
                  </div>
                </div>
                <div className="mt-4 rounded-xl border border-theme-border bg-theme-surface p-5">
                  <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-theme-text-muted">会话文件</div>
                  <div className="break-all font-mono text-[12px] text-theme-text-secondary">{activeSummaryMeta.session}</div>
                  <article className="prose prose-slate mt-5 max-w-none text-sm leading-7 prose-headings:font-semibold prose-headings:text-theme-text-primary prose-p:text-theme-text-secondary prose-li:text-theme-text-secondary">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {activeSummaryText}
                    </ReactMarkdown>
                  </article>
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
 <section className="rounded-2xl border border-theme-border bg-theme-surface p-4">
              <div className="text-sm font-semibold text-theme-text-primary">产物快照</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <RoundDetailField label="输出文件数" value={String(round.output_snapshot.output_file_count)} />
                <RoundDetailField label="输出目录数" value={String(round.output_snapshot.output_dir_count)} />
                <RoundDetailField label="总大小" value={formatBytes(round.output_snapshot.output_total_size_bytes)} />
                <RoundDetailField label="最大文件" value={formatBytes(round.output_snapshot.largest_file_size_bytes)} />
              </div>
            </section>

 <section className="rounded-2xl border border-theme-border bg-theme-surface p-4">
              <div className="text-sm font-semibold text-theme-text-primary">文档与告警</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <RoundDetailField label="总结文档" value={round.artifacts.summary_present ? '已生成' : '未生成'} />
                <RoundDetailField label="改进文档" value={round.artifacts.reason_present ? '已生成' : '未生成'} />
              </div>
              {round.artifacts.warnings.length > 0 ? (
                <div className="mt-3 rounded-2xl border border-amber-500/20 bg-amber-500/15 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-400">告警</div>
                  <div className="mt-2 space-y-2 text-sm text-amber-400">
                    {round.artifacts.warnings.map((warning, index) => (
 <div key={`${warning}-${index}`} className="rounded-xl border border-amber-500/20 bg-theme-surface px-3 py-2">
                        {warning}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          </div>

          <details className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
            <summary className="cursor-pointer text-sm font-semibold text-theme-text-secondary">
              查看原始 results.json
            </summary>
            <pre className="mt-3 max-h-[420px] overflow-auto rounded-2xl border border-theme-border bg-theme-surface px-4 py-4 text-[12px] leading-6 text-theme-text-primary whitespace-pre-wrap break-words">
              {JSON.stringify(round.raw || round, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}

function PhaseStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    pending: 'bg-theme-elevated text-theme-text-muted',
    not_executed: 'bg-theme-elevated text-theme-text-muted',
    running: 'bg-blue-500/15 text-blue-400',
    success: 'bg-emerald-500/15 text-emerald-400',
    failed: 'bg-red-500/15 text-red-400',
    skipped: 'bg-amber-500/15 text-amber-400',
  };
  const labels: Record<string, string> = {
    pending: '待执行',
    not_executed: '未执行',
    running: '进行中',
    success: '已完成',
    failed: '失败',
    skipped: '跳过',
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${cfg[status] || cfg.pending}`}>
      {labels[status] || status}
    </span>
  );
}

function PhaseNodeStatusIcon({ status, index }: { status: string; index: number }) {
  if (status === 'success') {
    return <CheckCircle2 size={16} className="text-emerald-500" />;
  }
  if (status === 'running') {
    return <Loader2 size={14} className="animate-spin text-blue-500" />;
  }
  if (status === 'failed') {
    return <XCircle size={16} className="text-red-500" />;
  }
  return <span>{index + 1}</span>;
}

function phaseDisplayLabel(phaseKey: string | null | undefined) {
  const mapping: Record<string, string> = {
    preprocess: '预处理',
    tool_match: '工具匹配执行',
    llm_unpack: 'LLM 解包',
    llm_review: 'LLM 评审',
    llm_cleanup: 'LLM 清理',
  };
  return mapping[String(phaseKey || '')] || String(phaseKey || '任务');
}

function TaskRow({
  task, selected, active, onSelect, onOpenDetail,
}: {
  task: FirmwareUnpackTask;
  selected: boolean;
  active: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onOpenDetail: (id: string) => void;
}) {
  return (
    <tr
      className={`${executionTableInteractiveRowClassName} ${
        active ? 'bg-blue-50/60' : selected ? 'bg-slate-50/90' : ''
      }`.trim()}
      onClick={() => onOpenDetail(task.id)}
    >
      <ExecutionTableTd>
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => {
            e.stopPropagation();
            onSelect(task.id, e.target.checked);
          }}
          onClick={(e) => e.stopPropagation()}
          className="rounded border-theme-border text-blue-400"
        />
      </ExecutionTableTd>
      <ExecutionTableTd className="min-w-[96px] whitespace-nowrap"><TaskStatusBadge status={task.status} /></ExecutionTableTd>
      <ExecutionTableTd className="min-w-[340px]">
        <div className="truncate font-mono text-xs text-theme-text-secondary" title={task.firmware_path}>{basename(task.firmware_path)}</div>
        <div className="mt-1 font-mono text-[11px] text-theme-text-muted">{task.id}</div>
      </ExecutionTableTd>
      <ExecutionTableTd className="min-w-[170px]">
        <TaskOriginInline origin={task} compact />
      </ExecutionTableTd>
      <ExecutionTableTd className="whitespace-nowrap text-xs text-theme-text-muted">
        {task.worker_id ? (
          <span className="inline-flex items-center gap-1">
            <span className="max-w-[120px] truncate">{task.worker_id}</span>
          </span>
        ) : (
          '-'
        )}
      </ExecutionTableTd>
      <ExecutionTableTd className="whitespace-nowrap text-xs text-theme-text-muted">{fmtDuration(task.started_at, task.completed_at)}</ExecutionTableTd>
      <ExecutionTableTd className="whitespace-nowrap text-xs text-theme-text-muted">{fmtTime(task.created_at)}</ExecutionTableTd>
      <ExecutionTableTd className="whitespace-nowrap text-xs text-theme-text-muted">
        {task.result_status || '-'}
      </ExecutionTableTd>
      <ExecutionTableTd className="text-right">
        <ChevronRight size={14} className={`ml-auto text-theme-text-muted transition-transform ${active ? 'translate-x-0.5 text-blue-500' : ''}`} />
      </ExecutionTableTd>
    </tr>
  );
}

function TaskDetailPanel({
  projectId,
  task,
  loading,
  resourceUsage,
  resourceLoading,
  hasReturnContext,
  progress,
  progressLoading,
  logModalOpen,
  logModalTitle,
  logModalPhase,
  taskLog,
  taskLogLoading,
  onOpenPhaseLog,
  onCloseLogModal,
  deletingTaskId,
  onBack,
  onRefresh,
  onCancel,
  onDelete,
  onRetry,
  onRefreshResultCache,
  onCreateEvolution,
  notify,
  resultRefreshingTaskId,
  onActiveTabChange,
  refreshRequest,
}: {
  projectId: string;
  task: FirmwareUnpackTask | null;
  loading: boolean;
  resourceUsage: FirmwareTaskResourceUsage | null;
  resourceLoading: boolean;
  hasReturnContext: boolean;
  progress: FirmwareTaskProgress | null;
  progressLoading: boolean;
  logModalOpen: boolean;
  logModalTitle: string;
  logModalPhase: string;
  taskLog: FirmwareTaskLog | null;
  taskLogLoading: boolean;
  onOpenPhaseLog: (taskId: string, phaseKey: string, phaseLabel: string) => void;
  onCloseLogModal: () => void;
  deletingTaskId: string;
  onBack: () => void;
  onRefresh: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
  onRefreshResultCache: (id: string) => void;
  onCreateEvolution: (id: string) => Promise<void>;
  notify: (message: string, tone?: 'success' | 'error' | 'info' | 'warning') => void;
  resultRefreshingTaskId: string;
  onActiveTabChange?: (tab: DetailTab) => void;
  refreshRequest?: number;
}) {
  const fileserverApi = api.domains.assets.fileserver;
  const normalizedProgressPhases = useMemo(() => normalizeProgressPhases(progress), [progress]);
  const layeredProgress = useMemo(() => buildLayeredProgressNodes(normalizedProgressPhases), [normalizedProgressPhases]);
  const progressDurationSeconds = useMemo(() => {
    const values = normalizedProgressPhases
      .filter((phase) => !['pending', 'not_executed'].includes(String(phase.status || '')))
      .map((phase) => phase.duration_seconds)
      .filter((value): value is number => value != null && Number.isFinite(value));
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0);
  }, [normalizedProgressPhases]);
  const progressTokenTotal = useMemo(() => {
    const values = normalizedProgressPhases
      .filter((phase) => phase.key === 'llm_cleanup' || phase.key === 'llm_review_tool' || phase.key.startsWith('llm_unpack_round_') || phase.key.startsWith('llm_review_round_'))
      .map((phase) => phase.token_total)
      .filter((value): value is number => value != null && Number.isFinite(value));
    return values.reduce((sum, value) => sum + value, 0);
  }, [normalizedProgressPhases]);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [activeResultDoc, setActiveResultDoc] = useState<'summary' | 'reason'>('summary');
  const [timeline, setTimeline] = useState<FirmwareTaskEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState('');
  const [taskConfigSnapshot, setTaskConfigSnapshot] = useState<FirmwareTaskConfigSnapshot | null>(null);
  const [taskConfigLoading, setTaskConfigLoading] = useState(false);
  const [taskConfigError, setTaskConfigError] = useState('');
  const [expandedEventKey, setExpandedEventKey] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<FirmwareTaskMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState('');
  const [roundKeywordFilter, setRoundKeywordFilter] = useState('');
  const [roundStatusFilter, setRoundStatusFilter] = useState('');
  const [roundReviewFilter, setRoundReviewFilter] = useState('');
  const [roundFallbackFilter, setRoundFallbackFilter] = useState('');
  const [selectedMetricRound, setSelectedMetricRound] = useState<FirmwareTaskRoundMetric | null>(null);
  const [result, setResult] = useState<FirmwareTaskResult | null>(null);
  const [resultLoading, setResultLoading] = useState(false);
  const [resultError, setResultError] = useState('');
  const [sessionItems, setSessionItems] = useState<FirmwareSessionIndexItem[]>([]);
  const [sessions, setSessions] = useState<AppSaSessionMeta[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState('');
  const [selectedSessionPath, setSelectedSessionPath] = useState<string | null>(null);
  const [sessionSnapshot, setSessionSnapshot] = useState<AppSaSessionSnapshot | null>(null);
  const [sessionEvents, setSessionEvents] = useState<AppSaSessionEvent[]>([]);
  const [sessionWarnings, setSessionWarnings] = useState<string[]>([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [sessionLive, setSessionLive] = useState(false);
  const [sessionWatchStartLine, setSessionWatchStartLine] = useState(0);
  const [evolutionJobs, setEvolutionJobs] = useState<FirmwareEvolutionJob[]>([]);
  const [evolutionJobsLoading, setEvolutionJobsLoading] = useState(false);
  const [evolutionJobsError, setEvolutionJobsError] = useState('');
  const [selectedEvolutionJobId, setSelectedEvolutionJobId] = useState<string | null>(null);
  const [selectedEvolutionJob, setSelectedEvolutionJob] = useState<FirmwareEvolutionJob | null>(null);
  const [selectedEvolutionRounds, setSelectedEvolutionRounds] = useState<FirmwareEvolutionRound[]>([]);
  const [evolutionSessions, setEvolutionSessions] = useState<FirmwareEvolutionSessionIndex | null>(null);
  const [evolutionDetailLoading, setEvolutionDetailLoading] = useState(false);
  const [evolutionDetailError, setEvolutionDetailError] = useState('');
  const [evolutionSubmitting, setEvolutionSubmitting] = useState(false);
  const [evolutionReplacing, setEvolutionReplacing] = useState(false);
  const [evolutionLogModalOpen, setEvolutionLogModalOpen] = useState(false);
  const [evolutionLogModalTitle, setEvolutionLogModalTitle] = useState('');
  const [evolutionLog, setEvolutionLog] = useState<FirmwareTaskLog | null>(null);
  const [evolutionLogLoading, setEvolutionLogLoading] = useState(false);
  const sessionSocketRef = useRef<WebSocket | null>(null);
  const lastRefreshRequestRef = useRef(refreshRequest ?? 0);
  const progressCanvasRef = useRef<HTMLDivElement | null>(null);
  const preprocessNodeRef = useRef<HTMLDivElement | null>(null);
  const toolEntryNodeRef = useRef<HTMLDivElement | null>(null);
  const llmEntryNodeRef = useRef<HTMLDivElement | null>(null);
  const toolExitNodeRef = useRef<HTMLDivElement | null>(null);
  const llmExitNodeRef = useRef<HTMLDivElement | null>(null);
  const cleanupNodeRef = useRef<HTMLDivElement | null>(null);
  const [progressConnectorPaths, setProgressConnectorPaths] = useState<ProgressConnectorPath[]>([]);

  const closeSessionSocket = useCallback(() => {
    if (sessionSocketRef.current) {
      sessionSocketRef.current.close();
      sessionSocketRef.current = null;
    }
    setSessionLive(false);
  }, []);

  useEffect(() => {
    const container = progressCanvasRef.current;
    if (!container) {
      setProgressConnectorPaths([]);
      return;
    }

    const getCenter = (node: HTMLDivElement | null) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      const base = container.getBoundingClientRect();
      return {
        x: rect.left - base.left + rect.width / 2,
        y: rect.top - base.top + rect.height / 2,
        r: Math.min(rect.width, rect.height) / 2,
      };
    };

    const preprocess = getCenter(preprocessNodeRef.current);
    const toolEntry = getCenter(toolEntryNodeRef.current);
    const llmEntry = getCenter(llmEntryNodeRef.current);
    const toolExit = getCenter(toolExitNodeRef.current);
    const llmExit = getCenter(llmExitNodeRef.current);
    const cleanup = getCenter(cleanupNodeRef.current);

    if (!preprocess || !toolEntry || !llmEntry || !toolExit || !llmExit || !cleanup) {
      setProgressConnectorPaths([]);
      return;
    }

    const phaseIsVisible = (status: string | null | undefined) => !['pending', 'not_executed'].includes(String(status || ''));
    const phaseIsPassed = (status: string | null | undefined) => String(status || '') === 'success';
    const phaseIsFailed = (status: string | null | undefined) => String(status || '') === 'failed';
    const phaseActuallyExecuted = (status: string | null | undefined) =>
      phaseIsVisible(status) && String(status || '') !== 'skipped';

    const horizontalSign = (fromX: number, toX: number) => (toX >= fromX ? 1 : -1);
    const edgePoint = (
      point: { x: number; y: number; r: number },
      direction: 'left' | 'right',
    ) => ({
      x: point.x + (direction === 'right' ? point.r : -point.r),
      y: point.y,
    });

    const elbow = (
      from: { x: number; y: number; r: number },
      to: { x: number; y: number; r: number },
      midX: number,
    ) => {
      const start = edgePoint(from, horizontalSign(from.x, midX) >= 0 ? 'right' : 'left');
      const end = edgePoint(to, horizontalSign(midX, to.x) >= 0 ? 'left' : 'right');
      return`M ${start.x} ${start.y} L ${midX} ${start.y} L ${midX} ${end.y} L ${end.x} ${end.y}`;
    };

    const leftMidX = preprocess.x + (toolEntry.x - preprocess.x) * 0.42;
    const rightMidX = cleanup.x - (cleanup.x - toolExit.x) * 0.42;
    const toolReviewPhase = layeredProgress.toolLane[layeredProgress.toolLane.length - 1]?.phase;
    const llmReviewPhase = layeredProgress.llmLane[layeredProgress.llmLane.length - 1]?.phase;
    const toolPhase = layeredProgress.toolLane[0]?.phase;
    const llmPhase = layeredProgress.llmLane[0]?.phase;
    const toolRecursivePhase = layeredProgress.toolLane[1]?.phase;
    const toolReviewPassed = phaseIsPassed(toolReviewPhase?.status);
    const toolReviewFailed = phaseIsFailed(toolReviewPhase?.status);
    const llmReviewVisible = phaseActuallyExecuted(llmReviewPhase?.status);
    const llmPhaseExecuted = phaseActuallyExecuted(llmPhase?.status);
    const toolChainExecuted =
      phaseActuallyExecuted(toolPhase?.status)
      || phaseActuallyExecuted(toolRecursivePhase?.status)
      || phaseActuallyExecuted(toolReviewPhase?.status);

    const nextPaths: ProgressConnectorPath[] = [];

    if (phaseIsVisible(toolPhase?.status)) {
      nextPaths.push({ id: 'preprocess-tool', d: elbow(preprocess, toolEntry, leftMidX) });
    }
    if (!toolChainExecuted && llmPhaseExecuted) {
      nextPaths.push({ id: 'preprocess-llm', d: elbow(preprocess, llmEntry, leftMidX) });
    }

    if (toolReviewPassed && !llmPhaseExecuted && !llmReviewVisible) {
      nextPaths.push({ id: 'tool-cleanup', d: elbow(toolExit, cleanup, rightMidX) });
    }
    if (llmReviewVisible) {
      nextPaths.push({ id: 'llm-cleanup', d: elbow(llmExit, cleanup, rightMidX) });
    }
    if (toolChainExecuted && toolReviewFailed && llmPhaseExecuted) {
      const fallbackMidX = toolExit.x + (llmEntry.x - toolExit.x) * 0.42;
      nextPaths.unshift({
        id: 'tool-to-llm-fallback',
        d: elbow(toolExit, llmEntry, fallbackMidX),
        stroke: '#ea580c',
        dashArray: '8 4',
      });
    }

    setProgressConnectorPaths(nextPaths);
  }, [layeredProgress, progress, progressLoading]);

  const loadTimeline = useCallback(async (options?: { silent?: boolean }) => {
    if (!task?.id) return;
    if (!options?.silent) {
      setTimelineLoading(true);
      setTimelineError('');
    }
    try {
      const res = await fwApi.getTaskEvents(task.id, 200);
      setTimeline((prev) => sameJsonValue(prev, res.items || []) ? prev : (res.items || []));
    } catch (e: any) {
      if (!options?.silent) {
        setTimeline([]);
        setTimelineError(e?.message || '加载事件失败');
      }
    } finally {
      if (!options?.silent) setTimelineLoading(false);
    }
  }, [task?.id]);

  const loadMetrics = useCallback(async (options?: { silent?: boolean }) => {
    if (!task?.id) return;
    if (!options?.silent) {
      setMetricsLoading(true);
      setMetricsError('');
    }
    try {
      const res = await fwApi.getTaskMetrics(task.id);
      setMetrics((prev) => sameJsonValue(prev, res) ? prev : res);
    } catch (e: any) {
      if (!options?.silent) {
        setMetrics(null);
        setMetricsError(e?.message || '加载观测指标失败');
      }
    } finally {
      if (!options?.silent) setMetricsLoading(false);
    }
  }, [task?.id]);

  const loadTaskConfig = useCallback(async (options?: { silent?: boolean }) => {
    if (!task?.id || !task?.project_id) {
      setTaskConfigSnapshot(null);
      setTaskConfigError('');
      return;
    }
    if (!options?.silent) {
      setTaskConfigLoading(true);
      setTaskConfigError('');
    }
    try {
      const res = await fwApi.getProjectTaskConfig(task.project_id, task.id);
      setTaskConfigSnapshot((prev) => (sameJsonValue(prev, res) ? prev : res));
    } catch (e: any) {
      if (!options?.silent) {
        setTaskConfigSnapshot(null);
        setTaskConfigError(e?.message || '加载任务配置快照失败');
      }
    } finally {
      if (!options?.silent) setTaskConfigLoading(false);
    }
  }, [task?.id, task?.project_id]);

  const loadResult = useCallback(async () => {
    if (!task?.id) return;
    setResultLoading(true);
    setResultError('');
    try {
      const res = await fwApi.getTaskResult(task.id);
      setResult(res);
    } catch (e: any) {
      setResult(null);
      setResultError(e?.message || '加载结果失败');
    } finally {
      setResultLoading(false);
    }
  }, [task?.id]);

  const sessionIndexFsPath = useMemo(() => {
    if (!task?.project_id) return null;
    const runPath = resolveTaskRunPath(task);
    if (!runPath) return null;
    return extractFsRelPath(`${runPath}/sessions/index.json`, task.project_id);
  }, [task]);

  const groupedSessions = useMemo(() => {
    const groups = new Map<string, AppSaSessionMeta[]>();
    sessions.forEach((item) => {
      const list = groups.get(item.stage_group || '未分类') || [];
      list.push(item);
      groups.set(item.stage_group || '未分类', list);
    });
    return Array.from(groups.entries());
  }, [sessions]);

  const selectedSessionMeta = useMemo(
    () => sessions.find((item) => item.relative_path === selectedSessionPath) || null,
    [sessions, selectedSessionPath],
  );

  const selectedSessionItem = useMemo(
    () => sessionItems.find((item) => item.session_file === selectedSessionPath) || null,
    [sessionItems, selectedSessionPath],
  );

  const loadSessions = useCallback(async (options?: { silent?: boolean }) => {
    if (!sessionIndexFsPath || !task?.project_id) {
      setSessionItems([]);
      setSessions([]);
      setSelectedSessionPath(null);
      setSessionsError('');
      return;
    }
    if (!options?.silent) {
      setSessionsLoading(true);
      setSessionsError('');
    }
    try {
      const blob = await fileserverApi.fetchProjectFilesystemPreviewBlob(task.project_id, sessionIndexFsPath);
      const content = await blobToText(blob);
      const parsed = normalizeFirmwareSessionIndex(JSON.parse(content));
      const nextItems = parsed.items;
      const nextSessions = nextItems.map(buildFirmwareSessionMeta);
      setSessionItems(nextItems);
      setSessions(nextSessions);
      setSelectedSessionPath((current) => {
        if (current && nextItems.some((item) => item.session_file === current)) return current;
        const active = nextItems.find((item) => item.status === 'running');
        return active?.session_file || nextItems[0]?.session_file || null;
      });
    } catch (e: any) {
      const message = e?.message || String(e);
      if (/404/.test(message)) {
        setSessionItems([]);
        setSessions([]);
        setSelectedSessionPath(null);
        setSessionsError('');
      } else {
        setSessionsError(message || '加载会话失败');
      }
    } finally {
      if (!options?.silent) setSessionsLoading(false);
    }
  }, [fileserverApi, sessionIndexFsPath, task?.project_id]);

  const loadSessionFile = useCallback(async (sessionFile: string) => {
    if (!task?.project_id || !sessionFile) return;
    const runPath = resolveTaskRunPath(task);
    if (!runPath) {
      setSessionError('当前任务缺少运行目录');
      return;
    }
    const fsPath = extractFsRelPath(`${runPath}/sessions/${sessionFile}`, task.project_id);
    if (!fsPath) {
      setSessionError('当前会话路径不在 fileserver 项目目录下');
      return;
    }
    setSessionLoading(true);
    setSessionError('');
    try {
      const blob = await fileserverApi.fetchProjectFilesystemPreviewBlob(task.project_id, fsPath);
      const content = await blobToText(blob);
      const snapshot = buildSessionSnapshotFromText(sessionFile, content);
      setSessionSnapshot(snapshot);
      setSessionEvents(snapshot.events || []);
      setSessionWarnings(snapshot.warnings || []);
      setSessionWatchStartLine(snapshot.line_count || 0);
    } catch (e: any) {
      setSessionSnapshot(null);
      setSessionEvents([]);
      setSessionWarnings([]);
      setSessionWatchStartLine(0);
      setSessionError(e?.message || '加载会话内容失败');
    } finally {
      setSessionLoading(false);
    }
  }, [fileserverApi, task]);

  const loadEvolutionJobs = useCallback(async (options?: { silent?: boolean }) => {
    if (!task?.id) {
      setEvolutionJobs([]);
      setSelectedEvolutionJobId(null);
      setSelectedEvolutionJob(null);
      setSelectedEvolutionRounds([]);
      setEvolutionSessions(null);
      setEvolutionJobsError('');
      return;
    }
    if (!options?.silent) {
      setEvolutionJobsLoading(true);
      setEvolutionJobsError('');
    }
    try {
      const res = await fwApi.listEvolutionJobs(task.id, task.project_id);
      const items = res.items || [];
      setEvolutionJobs(items);
      setSelectedEvolutionJobId((current) => {
        if (current && items.some((item) => item.id === current)) return current;
        return items[0]?.id || null;
      });
    } catch (e: any) {
      if (!options?.silent) {
        setEvolutionJobs([]);
        setSelectedEvolutionJobId(null);
        setSelectedEvolutionJob(null);
        setSelectedEvolutionRounds([]);
        setEvolutionSessions(null);
        setEvolutionJobsError(e?.message || '加载进化任务失败');
      }
    } finally {
      if (!options?.silent) setEvolutionJobsLoading(false);
    }
  }, [task?.id]);

  const loadEvolutionJobDetail = useCallback(async (jobId: string, options?: { silent?: boolean }) => {
    if (!jobId) {
      setSelectedEvolutionJob(null);
      setSelectedEvolutionRounds([]);
      setEvolutionSessions(null);
      setEvolutionDetailError('');
      return;
    }
    if (!options?.silent) {
      setEvolutionDetailLoading(true);
      setEvolutionDetailError('');
    }
    try {
      const [job, roundsPayload, sessionsPayload] = await Promise.all([
        fwApi.getEvolutionJob(jobId),
        fwApi.getEvolutionRounds(jobId).catch(() => null),
        fwApi.getEvolutionSessions(jobId).catch(() => ({ version: 1, session_root: null, items: [] })),
      ]);
      const mergedJob = roundsPayload && roundsPayload.length > 0
        ? {
          ...job,
          rounds: roundsPayload,
          round_count: roundsPayload.length,
        }
        : job;
      setSelectedEvolutionJob(mergedJob);
      setSelectedEvolutionRounds(roundsPayload && roundsPayload.length > 0 ? roundsPayload : (mergedJob.rounds || []));
      setEvolutionSessions(sessionsPayload);
    } catch (e: any) {
      if (!options?.silent) {
        setSelectedEvolutionJob(null);
        setSelectedEvolutionRounds([]);
        setEvolutionSessions(null);
        setEvolutionDetailError(e?.message || '加载进化任务详情失败');
      }
    } finally {
      if (!options?.silent) setEvolutionDetailLoading(false);
    }
  }, []);

  const refreshCurrentDetail = useCallback(() => {
    if (!task?.id) return;
    onRefresh(task.id);
    if (activeTab === 'task-config') void loadTaskConfig();
    if (activeTab === 'metrics') void loadMetrics();
    if (activeTab === 'events') void loadTimeline();
    if (activeTab === 'result') void loadResult();
    if (activeTab === 'session') void loadSessions();
    if (activeTab === 'evolution') void loadEvolutionJobs();
  }, [activeTab, loadEvolutionJobs, loadMetrics, loadResult, loadSessions, loadTaskConfig, loadTimeline, onRefresh, task?.id]);

  useEffect(() => {
    setActiveTab('overview');
    setTimeline([]);
    setTimelineError('');
    setTimelineLoading(false);
    setTaskConfigSnapshot(null);
    setTaskConfigLoading(false);
    setTaskConfigError('');
    setExpandedEventKey(null);
    setMetrics(null);
    setMetricsError('');
    setMetricsLoading(false);
    setRoundKeywordFilter('');
    setRoundStatusFilter('');
    setRoundReviewFilter('');
    setRoundFallbackFilter('');
    setSelectedMetricRound(null);
    setResult(null);
    setResultError('');
    setActiveResultDoc('summary');
    setSessionItems([]);
    setSessions([]);
    setSelectedSessionPath(null);
    setSessionSnapshot(null);
    setSessionEvents([]);
    setSessionWarnings([]);
    setSessionError('');
    setEvolutionJobs([]);
    setEvolutionJobsError('');
    setEvolutionJobsLoading(false);
    setSelectedEvolutionJobId(null);
    setSelectedEvolutionJob(null);
    setSelectedEvolutionRounds([]);
    setEvolutionSessions(null);
    setEvolutionDetailLoading(false);
    setEvolutionDetailError('');
    setEvolutionSubmitting(false);
    setEvolutionReplacing(false);
    setEvolutionLogModalOpen(false);
    setEvolutionLogModalTitle('');
    setEvolutionLog(null);
    setEvolutionLogLoading(false);
    closeSessionSocket();
  }, [closeSessionSocket, task?.id]);

  useEffect(() => {
    const next = refreshRequest ?? 0;
    if (next === lastRefreshRequestRef.current) return;
    lastRefreshRequestRef.current = next;
    refreshCurrentDetail();
  }, [refreshCurrentDetail, refreshRequest]);

  useEffect(() => {
    if (activeTab !== 'task-config' || !task?.id || !task?.project_id) return;
    void loadTaskConfig();
  }, [activeTab, loadTaskConfig, task?.id, task?.project_id]);

  useEffect(() => {
    if (activeTab !== 'events' || !task?.id) return;
    void loadTimeline();
  }, [activeTab, loadTimeline, task?.id]);

  useEffect(() => {
    if (activeTab !== 'metrics' || !task?.id) return;
    void loadMetrics();
  }, [
    activeTab,
    loadMetrics,
    task?.id,
    task?.status,
    task?.completed_at,
  ]);

  useEffect(() => {
    onActiveTabChange?.(activeTab);
  }, [activeTab, onActiveTabChange]);

  useEffect(() => {
    if (activeTab !== 'metrics' || !task || isTerminal(task.status)) return;
    const timer = window.setInterval(() => void loadMetrics({ silent: true }), 12000);
    return () => window.clearInterval(timer);
  }, [activeTab, loadMetrics, task]);

  useEffect(() => {
    if (activeTab !== 'events' || !task || isTerminal(task.status)) return;
    const timer = window.setInterval(() => void loadTimeline({ silent: true }), 12000);
    return () => window.clearInterval(timer);
  }, [activeTab, loadTimeline, task]);

  useEffect(() => {
    if (activeTab !== 'result' || !task?.id) return;
    void loadResult();
  }, [activeTab, loadResult, task?.id]);

  useEffect(() => {
    if (activeTab !== 'evolution' || !task?.id) return;
    void loadEvolutionJobs();
  }, [activeTab, loadEvolutionJobs, task?.id]);

  useEffect(() => {
    if (activeTab !== 'evolution' || !selectedEvolutionJobId) {
      if (activeTab !== 'evolution') {
        setSelectedEvolutionJob(null);
        setSelectedEvolutionRounds([]);
        setEvolutionSessions(null);
        setEvolutionDetailError('');
      }
      return;
    }
    void loadEvolutionJobDetail(selectedEvolutionJobId);
  }, [activeTab, loadEvolutionJobDetail, selectedEvolutionJobId]);

  useEffect(() => {
    const isRunningEvolution = Boolean(
      selectedEvolutionJob && ['pending', 'running'].includes(selectedEvolutionJob.status),
    );
    if (activeTab !== 'evolution' || !task?.id || !isRunningEvolution) return;
    const timer = window.setInterval(() => {
      void loadEvolutionJobs({ silent: true });
      if (selectedEvolutionJobId) void loadEvolutionJobDetail(selectedEvolutionJobId, { silent: true });
      onRefresh(task.id);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [activeTab, loadEvolutionJobDetail, loadEvolutionJobs, onRefresh, selectedEvolutionJob, selectedEvolutionJobId, task?.id]);

  useEffect(() => {
    if (activeTab !== 'session') {
      closeSessionSocket();
      return;
    }
    void loadSessions();
  }, [activeTab, closeSessionSocket, loadSessions]);

  useEffect(() => {
    if (activeTab !== 'session') return;
    if (!task || !['pending', 'running', 'cancelling'].includes(task.status)) return;
    const timer = window.setInterval(() => void loadSessions({ silent: true }), 12000);
    return () => window.clearInterval(timer);
  }, [activeTab, loadSessions, task]);

  useEffect(() => {
    if (activeTab !== 'session' || !selectedSessionPath) {
      if (activeTab !== 'session') {
        setSessionSnapshot(null);
        setSessionEvents([]);
        setSessionWarnings([]);
        setSessionError('');
      }
      return;
    }
    closeSessionSocket();
    void loadSessionFile(selectedSessionPath);
  }, [activeTab, closeSessionSocket, loadSessionFile, selectedSessionPath]);

  useEffect(() => {
    if (activeTab !== 'session' || !selectedSessionPath || !selectedSessionItem || !task?.project_id) return;
    if (selectedSessionItem.status !== 'running' || !['pending', 'running', 'cancelling'].includes(task.status)) {
      setSessionLive(false);
      return;
    }
    const runPath = resolveTaskRunPath(task);
    if (!runPath) {
      setSessionLive(false);
      setSessionError('当前任务缺少运行目录，无法实时监听');
      return;
    }
    const sessionAbsPath = normalizeJoinPath(`${runPath}/sessions`, selectedSessionPath);
    const watchPath = extractFsRelPath(sessionAbsPath, task.project_id);
    if (!watchPath) {
      setSessionLive(false);
      setSessionError('当前会话路径不在 fileserver 项目目录下，无法实时监听');
      return;
    }
    closeSessionSocket();
    const socket = fileserverApi.openProjectFileWatchWebSocket(task.project_id, watchPath, {
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
        if (message.type === 'snapshot') {
          setSessionLive(true);
          return;
        }
        if (message.type === 'delta') {
          if (message.read_mode !== 'line') return;
          const deltaLines = Array.isArray(message.lines) ? message.lines : [];
          if (deltaLines.length === 0) return;
          const parsed = parseSessionJsonlDelta(deltaLines, (message.from_line ?? sessionWatchStartLine) + 1);
          if (parsed.events.length > 0) setSessionEvents((current) => current.concat(parsed.events));
          if (parsed.warnings.length > 0) {
            setSessionWarnings((current) => Array.from(new Set(current.concat(parsed.warnings))));
          }
          setSessionSnapshot((current) => current ? {
            ...current,
            session_meta: parsed.sessionMeta ? { ...(current.session_meta || {}), ...parsed.sessionMeta } : current.session_meta,
            line_count: message.to_line ?? current.line_count,
          } : current);
          setSessionWatchStartLine(message.to_line ?? sessionWatchStartLine);
          return;
        }
        if (message.type === 'file_event') {
          if (message.event === 'truncated' || message.event === 'renamed') {
            setSessionLive(false);
            setSessionError('会话文件已重置，正在重新加载');
            void loadSessionFile(selectedSessionPath);
            return;
          }
          if (message.event === 'deleted') {
            setSessionLive(false);
            setSessionError('会话文件已删除');
            closeSessionSocket();
          }
          return;
        }
        if (message.type === 'error') {
          setSessionLive(false);
          setSessionError(message.message || '会话订阅失败');
        }
      } catch (e: any) {
        setSessionError(e?.message || String(e));
      }
    };
    socket.onerror = () => setSessionLive(false);
    socket.onclose = () => setSessionLive(false);
    return () => {
      if (sessionSocketRef.current === socket) closeSessionSocket();
      else socket.close();
    };
  }, [
    activeTab,
    closeSessionSocket,
    fileserverApi,
    loadSessionFile,
    selectedSessionItem,
    selectedSessionPath,
    sessionWatchStartLine,
    task,
  ]);

  const timelineItems = useMemo(() => {
    const events = timeline.slice(-80);
    return events.map((event, index) => ({
      ...event,
      _key: event.id ||`${event.event_type || 'event'}-${event.created_at || index}-${index}`,
      _index: index + 1,
      _tone: inferTimelineTone(event),
    }));
  }, [timeline]);

  const resultDocumentState = useMemo(() => {
    const hasSummary = Boolean(result?.summary_text);
    const hasReason = Boolean(result?.reason_text);
    const selectedDoc = activeResultDoc === 'reason' && hasReason
      ? 'reason'
      : hasSummary
        ? 'summary'
        : hasReason
          ? 'reason'
          : activeResultDoc;
    const selectedText = selectedDoc === 'reason' ? (result?.reason_text || null) : (result?.summary_text || null);
    const selectedPath = selectedDoc === 'reason' ? (result?.reason_path || null) : (result?.summary_path || null);
    return {
      hasSummary,
      hasReason,
      selectedDoc,
      selectedText,
      selectedPath,
    };
  }, [activeResultDoc, result?.reason_path, result?.reason_text, result?.summary_path, result?.summary_text]);
  const roundItems = metrics?.rounds.items || [];
  const roundStatuses = useMemo(
    () => Array.from(new Set(roundItems.map((item) => item.status).filter(Boolean))).sort(),
    [roundItems],
  );
  const filteredRoundItems = useMemo(() => {
    const keyword = roundKeywordFilter.trim().toLowerCase();
    return roundItems.filter((item) => {
      const searchable = [
        item.context.matched_skill,
        item.artifacts.summary_text,
        item.artifacts.reason_text,
        item.artifacts.summary_preview,
        item.artifacts.reason_preview,
        item.executor.response_preview,
        item.reviewer.review_preview,
      ].filter(Boolean).join('\n').toLowerCase();
      if (keyword && !searchable.includes(keyword)) return false;
      if (roundStatusFilter && item.status !== roundStatusFilter) return false;
      if (roundReviewFilter === 'passed' && !item.reviewer.passed) return false;
      if (roundReviewFilter === 'failed' && item.reviewer.passed) return false;
      if (roundFallbackFilter === 'yes' && !item.context.fallback_to_llm) return false;
      if (roundFallbackFilter === 'no' && item.context.fallback_to_llm) return false;
      return true;
    });
  }, [roundFallbackFilter, roundItems, roundKeywordFilter, roundReviewFilter, roundStatusFilter]);
  const latestRoundMetric = roundItems.length > 0 ? roundItems[roundItems.length - 1] : null;
  const latestEvolutionJob = evolutionJobs[0] || null;
  const activeEvolutionJob = selectedEvolutionJob || latestEvolutionJob;
  const activeEvolutionRounds = selectedEvolutionJobId ? selectedEvolutionRounds : (activeEvolutionJob?.rounds || []);
  const canCreateEvolution = task?.status === 'success' && !evolutionSubmitting && !evolutionJobs.some((item) => ['pending', 'running'].includes(item.status));
  const canConfirmEvolutionReplacement = Boolean(
    activeEvolutionJob
    && activeEvolutionJob.status === 'success'
    && activeEvolutionJob.replacement_required
    && !activeEvolutionJob.replacement_confirmed
    && activeEvolutionJob.final_tool_path
    && !evolutionReplacing
  );
  const showConfirmEvolutionReplacementButton = Boolean(activeEvolutionJob);
  const evolutionReplacementHint = !activeEvolutionJob
    ? '当前没有可操作的自进化任务'
    : activeEvolutionJob.status !== 'success'
      ? '仅进化成功后的任务允许替换原工具'
      : activeEvolutionJob.replacement_confirmed
        ? '当前进化结果已确认替换原工具'
        : !activeEvolutionJob.replacement_required
          ? '当前进化结果未产生待替换的新工具'
          : !activeEvolutionJob.final_tool_path
            ? '缺少新工具路径，无法执行替换'
          : evolutionReplacing
            ? '正在替换原工具'
              : '将新工具发布到 active 并同步 dispatcher';
  const evolutionSessionItems = evolutionSessions?.items || [];

  if (!task) {
    return (
 <div className="rounded-2xl border border-theme-border bg-theme-surface p-6">
        <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-center">
          <div className="rounded-2xl bg-theme-elevated p-4 text-theme-text-muted">
            <ChevronRight size={22} />
          </div>
          <div>
            <p className="text-sm font-bold text-theme-text-secondary">选择任务查看详情</p>
            <p className="mt-1 text-xs text-theme-text-muted">这里会展示解包任务的输入、输出目录、运行状态和日志摘要。</p>
          </div>
        </div>
      </div>
    );
  }

  const running = !isTerminal(task.status);
  const canDelete = isTerminal(task.status);
  const canRetry = task.status === 'success' || task.status === 'failed' || task.status === 'cancelled' || task.status === 'max_retries_reached';
  const metricsHealthItems = metrics
    ? ([
        { label: '任务终态', ok: metrics.health.is_terminal, hint: metrics.health.is_terminal ? '已完成' : '执行中' },
        { label: 'Owner', ok: metrics.health.has_owner || metrics.health.is_terminal, hint: metrics.health.has_owner ? '已绑定' : (metrics.health.is_terminal ? '终态释放' : '缺失') },
        { label: '资源指标', ok: metrics.health.resource_available, hint: metrics.health.resource_available ? '可用' : '不可用' },
        { label: '结果缓存', ok: metrics.health.result_cache_available, hint: metrics.health.result_cache_available ? '可用' : '缺失' },
      ])
    : [];

  const handleCreateEvolutionClick = async () => {
    if (!canCreateEvolution) return;
    setEvolutionSubmitting(true);
    try {
      await onCreateEvolution(task.id);
      await loadEvolutionJobs();
    } finally {
      setEvolutionSubmitting(false);
    }
  };

  const handleConfirmEvolutionReplacementClick = async () => {
    if (!activeEvolutionJob?.id || !activeEvolutionJob.final_tool_path) return;
    const targetLabel = activeEvolutionJob.replaced_tool_path
      ?`原工具：${activeEvolutionJob.replaced_tool_path}`
      : '原工具：无，将发布并激活新工具';
    const confirmed = await showConfirm({
      title: '确认替换原工具',
      message:`将使用新工具覆盖原工具。\n\n${targetLabel}\n新工具：${activeEvolutionJob.final_tool_path}`,
      confirmText: '确认替换',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    setEvolutionReplacing(true);
    try {
      const result = await fwApi.confirmEvolutionReplacement(activeEvolutionJob.id);
      notify(result.message || '已确认替换原工具', 'success');
      await loadEvolutionJobs();
      await loadEvolutionJobDetail(activeEvolutionJob.id);
    } catch (e: any) {
      notify(`确认替换失败: ${e?.message || 'unknown error'}`, 'error');
    } finally {
      setEvolutionReplacing(false);
    }
  };

  const handleOpenEvolutionLog = async (jobId: string, round: number, role: 'tool_executor' | 'reviewer' | 'evolver') => {
    const roleLabelMap: Record<string, string> = {
      tool_executor: '工具执行器',
      reviewer: '评审器',
      evolver: '工具进化器',
    };
    setEvolutionLogModalTitle(`第 ${round} 轮 · ${roleLabelMap[role]} 日志`);
    setEvolutionLog(null);
    setEvolutionLogLoading(true);
    setEvolutionLogModalOpen(true);
    try {
      const payload = await fwApi.getEvolutionLogs(jobId, round, role);
      setEvolutionLog(payload);
    } catch (e: any) {
      setEvolutionLog({
        task_id: task.id,
        run_path: null,
        available: false,
        log_text: '',
        files: [],
        phase:`evolution:${role}:round_${round}`,
        message: e?.message || '加载进化日志失败',
      });
    } finally {
      setEvolutionLogLoading(false);
    }
  };

  return (
 <div className="rounded-2xl border border-theme-border bg-theme-surface">
      <div className="border-b border-theme-border p-5">
        <button
          type="button"
          onClick={onBack}
 className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-4 py-2.5 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated"
        >
          <ArrowLeft size={16} />
          {hasReturnContext ? '返回原任务' : '返回任务列表'}
        </button>

        <div className="flex items-start justify-between gap-4">
          <div className="mt-4 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <TaskStatusBadge status={task.status} />
              {task.worker_id && (
                <span className="rounded-full border border-theme-border bg-theme-bg-app px-2.5 py-1 text-[11px] font-bold text-theme-text-muted">
                  {task.worker_id}
                </span>
              )}
            </div>
            <h3 className="mt-3 break-all text-lg font-semibold text-theme-text-primary">{task.firmware_path}</h3>
            <p className="mt-2 break-all font-mono text-[11px] text-theme-text-muted">{task.id}</p>
          </div>
          <button
            onClick={refreshCurrentDetail}
            className="rounded-lg border border-theme-border p-2 text-theme-text-muted hover:bg-theme-elevated"
            title="刷新详情"
          >
            {loading || metricsLoading || timelineLoading || resultLoading || sessionsLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {canCancelTask(task.status) && (
            <button
              onClick={() => onCancel(task.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-orange-500/20 bg-orange-500/15 px-3 py-2 text-xs font-semibold text-orange-400 hover:bg-orange-500/15"
            >
              <Square size={13} /> 停止
            </button>
          )}
          {canRetry && (
            <button
              onClick={() => onRetry(task.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/20 bg-blue-500/15 px-3 py-2 text-xs font-semibold text-blue-400 hover:bg-blue-500/15"
            >
              <RotateCcw size={13} /> 重试
            </button>
          )}
          <DownstreamTaskCreator
            projectId={task.project_id || projectId}
            sourceKind="firmware_unpack"
            task={task}
            buttonClassName="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
          />
          {canDelete && (
            <button
              disabled={deletingTaskId === task.id}
              onClick={() => onDelete(task.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deletingTaskId === task.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} 删除
            </button>
          )}
        </div>
        <div className="mt-4">
          <TaskOriginCard origin={task} />
        </div>
      </div>

      <div className="space-y-4 p-5">
 <section className="rounded-2xl border border-theme-border bg-theme-surface p-2">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'overview' as const, label: '总览' },
              { id: 'task-config' as const, label: '任务配置' },
              { id: 'metrics' as const, label: '观测' },
              { id: 'events' as const, label: '事件记录' },
              { id: 'session' as const, label: '智能体会话' },
              { id: 'result' as const, label: '结果' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-2xl px-5 py-3 text-sm font-semibold transition ${
                  activeTab === tab.id
 ? 'bg-theme-surface text-white '
                    : 'text-theme-text-muted hover:bg-theme-elevated hover:text-theme-text-secondary'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        {activeTab === 'overview' ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                ['任务 ID', <span className="font-mono">{task.id}</span>],
                ['Worker', task.worker_id || '-'],
                ['固件路径', <span className="font-mono break-all">{task.firmware_path}</span>],
                ['输出目录', <span className="font-mono break-all">{task.output_path}</span>],
                ['运行目录', <span className="font-mono break-all">{resolveTaskRunPath(task) || '-'}</span>],
                ['创建时间', fmtTime(task.created_at)],
                ['开始时间', fmtTime(task.started_at)],
                ['完成时间', fmtTime(task.completed_at)],
                ['耗时', progressDurationSeconds != null ? formatSeconds(progressDurationSeconds) : fmtDuration(task.started_at, task.completed_at)],
                ['输入 Token 消耗',`${result?.summary.input_tokens ?? progress?.input_tokens ?? 0} tokens`],
                ['输出 Token 消耗',`${result?.summary.output_tokens ?? progress?.output_tokens ?? 0} tokens`],
                ['AI 轮次', task.rounds ?? '-'],
              ].map(([label, value], index) => (
                <div key={index} className="rounded-xl border border-theme-border bg-theme-surface px-4 py-3">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-theme-text-muted">{label}</p>
                  <div className="text-xs text-theme-text-secondary">{value}</div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-theme-border bg-theme-surface px-4 py-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-theme-text-muted">实时进展</p>
              {progressLoading ? (
                <div className="flex items-center gap-2 text-xs text-theme-text-muted">
                  <Loader2 size={13} className="animate-spin" /> 加载阶段进展中...
                </div>
              ) : !progress ? (
                <div className="text-xs text-theme-text-muted">暂无阶段进展数据</div>
              ) : (
                <div className="space-y-3">
                  {progress.summary && (
                    <div className="rounded-lg border border-theme-border bg-theme-bg-app px-3 py-2 text-xs text-theme-text-secondary">
                      {progress.summary}
                    </div>
                  )}
                  <div className="overflow-x-auto pb-1">
                    <div ref={progressCanvasRef} className="relative min-w-[1080px] rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
                      {progressConnectorPaths.length > 0 ? (
                        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
                          {progressConnectorPaths.map((path) => (
                            <path
                              key={path.id}
                              d={path.d}
                              stroke={path.stroke || '#cbd5e1'}
                              strokeWidth="2"
                              strokeDasharray={path.dashArray}
                              fill="none"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          ))}
                        </svg>
                      ) : null}
                      <div className="grid grid-cols-[160px_1fr_160px] items-start gap-4">
                        <div className="pt-28">
                          <div className="rounded-2xl border border-theme-border bg-theme-surface px-3 py-4 text-center">
                            <div ref={preprocessNodeRef} className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold ${phaseNodeTone(layeredProgress.preprocess.status)}`}>
                              <PhaseNodeStatusIcon status={layeredProgress.preprocess.status} index={0} />
                            </div>
                            <div className={`mt-2 text-xs font-semibold ${phaseTextTone(layeredProgress.preprocess.status)}`}>
                              {layeredProgress.preprocess.label}
                              {formatPhaseDuration(layeredProgress.preprocess.duration_seconds)}
                            </div>
                            <div className="mt-1 flex justify-center">
                              <PhaseStatusBadge status={layeredProgress.preprocess.status} />
                            </div>
                            <div className="mt-1 text-[10px] leading-tight text-theme-text-muted">{layeredProgress.preprocess.detail || '-'}</div>
                            <div className="mt-2 flex justify-center">
                              <button
                                type="button"
                                onClick={() => onOpenPhaseLog(task.id, layeredProgress.preprocess.key, layeredProgress.preprocess.label)}
                                className="inline-flex items-center gap-1 rounded-lg border border-theme-border bg-theme-bg-app px-2.5 py-1 text-[10px] font-bold text-theme-text-secondary hover:bg-theme-elevated"
                              >
                                <Terminal size={11} /> 查看日志
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-6">
                          {[
                            { laneKey: 'tool', nodes: layeredProgress.toolLane, lineColor: 'bg-slate-300' },
                            { laneKey: 'llm', nodes: layeredProgress.llmLane, lineColor: 'bg-slate-300' },
                          ].map((lane, laneIndex) => (
                            <div key={lane.laneKey} className="relative">
                              <div className="grid grid-cols-3 gap-4">
                                {lane.nodes.map((node, index) => (
                                  <div key={node.key} className="relative">
                                    {index < lane.nodes.length - 1 ? (
                                      <div className={`absolute left-1/2 top-4 h-0.5 w-full ${lane.lineColor}`} />
                                    ) : null}
                                    <div className="relative z-10 flex flex-col items-center px-2 text-center">
                                      <div
                                        ref={
                                          lane.laneKey === 'tool' && index === 0
                                            ? toolEntryNodeRef
                                            : lane.laneKey === 'llm' && index === 0
                                              ? llmEntryNodeRef
                                              : lane.laneKey === 'tool' && index === lane.nodes.length - 1
                                                ? toolExitNodeRef
                                                : lane.laneKey === 'llm' && index === lane.nodes.length - 1
                                                  ? llmExitNodeRef
                                                  : undefined
                                        }
                                        className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold ${phaseNodeTone(node.phase.status)}`}
                                      >
                                        <PhaseNodeStatusIcon status={node.phase.status} index={laneIndex * 10 + index + 1} />
                                      </div>
                                      <div className={`mt-2 px-1 ${phaseTextTone(node.phase.status)}`}>
                                        {(() => {
                                          const hideAggregateDuration = Boolean(node.rounds && node.rounds.length > 0);
                                          const hideAggregateLogButton = Boolean(node.rounds && node.rounds.length > 0);
                                          return (
                                            <>
                                        <div className="text-xs font-semibold">
                                          {node.label}
                                          {hideAggregateDuration ? '' : formatPhaseDuration(node.phase.duration_seconds)}
                                        </div>
                                        {!hideAggregateDuration ? formatTokenLines(node.phase.input_tokens, node.phase.output_tokens) : null}
                                        <div className="mt-1 flex justify-center">
                                          <PhaseStatusBadge status={node.phase.status} />
                                        </div>
                                        <div className="mt-1 text-[10px] leading-tight text-theme-text-muted">
                                          {node.phase.detail || '-'}
                                        </div>
                                        {node.phase.updated_at && (
                                          <div className="mt-1 text-[10px] text-theme-text-muted">
                                            {fmtTime(node.phase.updated_at)}
                                          </div>
                                        )}
                                        {!hideAggregateLogButton ? (
                                          <div className="mt-2 flex justify-center">
                                            <button
                                              type="button"
                                              onClick={() => onOpenPhaseLog(task.id, node.phase.key, node.label)}
                                              className="inline-flex items-center gap-1 rounded-lg border border-theme-border bg-theme-bg-app px-2.5 py-1 text-[10px] font-bold text-theme-text-secondary hover:bg-theme-elevated"
                                            >
                                              <Terminal size={11} /> 查看日志
                                            </button>
                                          </div>
                                        ) : null}
                                        {node.rounds && node.rounds.length > 0 ? (
                                          <div className="mt-3 space-y-1 rounded-xl border border-theme-border bg-theme-surface px-2 py-2 text-left">
                                            {node.rounds.map((roundPhase) => (
                                              <div key={roundPhase.key} className="rounded-lg border border-theme-border bg-theme-bg-app px-2 py-2">
                                                <div className="flex items-center justify-between gap-2 text-[10px] text-theme-text-muted">
                                                  <span className="font-semibold text-theme-text-secondary">
                                                    第{roundPhase.current_round || Number(roundPhase.key.match(/_round_(\d+)$/)?.[1] || 0)}轮
                                                    {formatPhaseDuration(roundPhase.duration_seconds)}
                                                  </span>
                                                  <span className={`rounded-full px-1.5 py-0.5 ${phaseTextTone(roundPhase.status)}`}>
                                                    {roundPhase.status === 'running' ? '运行中' : roundPhase.status === 'success' ? '成功' : roundPhase.status === 'failed' ? '失败' : roundPhase.status === 'skipped' ? '跳过' : roundPhase.status === 'not_executed' ? '未执行' : '待处理'}
                                                  </span>
                                                </div>
                                                {formatTokenLines(roundPhase.input_tokens, roundPhase.output_tokens)}
                                                <div className="mt-2 flex justify-end">
                                                  <button
                                                    type="button"
                                                    onClick={() => onOpenPhaseLog(task.id, roundPhase.key, roundPhase.label)}
                                                    className="inline-flex items-center gap-1 rounded-lg border border-theme-border bg-theme-bg-app px-2 py-1 text-[10px] font-bold text-theme-text-secondary hover:bg-theme-elevated"
                                                  >
                                                    <Terminal size={11} /> 查看日志
                                                  </button>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        ) : null}
                                            </>
                                          );
                                        })()}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="pt-28">
                          <div className="rounded-2xl border border-theme-border bg-theme-surface px-3 py-4 text-center">
                            <div ref={cleanupNodeRef} className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold ${phaseNodeTone(layeredProgress.cleanup.status)}`}>
                              <PhaseNodeStatusIcon status={layeredProgress.cleanup.status} index={99} />
                            </div>
                            <div className={`mt-2 text-xs font-semibold ${phaseTextTone(layeredProgress.cleanup.status)}`}>
                              {layeredProgress.cleanup.label}
                              {formatPhaseDuration(layeredProgress.cleanup.duration_seconds)}
                            </div>
                            {formatTokenLines(layeredProgress.cleanup.input_tokens, layeredProgress.cleanup.output_tokens)}
                            <div className="mt-1 flex justify-center">
                              <PhaseStatusBadge status={layeredProgress.cleanup.status} />
                            </div>
                            <div className="mt-1 text-[10px] leading-tight text-theme-text-muted">{layeredProgress.cleanup.detail || '-'}</div>
                            <div className="mt-2 flex justify-center">
                              <button
                                type="button"
                                onClick={() => onOpenPhaseLog(task.id, layeredProgress.cleanup.key, layeredProgress.cleanup.label)}
                                className="inline-flex items-center gap-1 rounded-lg border border-theme-border bg-theme-bg-app px-2.5 py-1 text-[10px] font-bold text-theme-text-secondary hover:bg-theme-elevated"
                              >
                                <Terminal size={11} /> 查看日志
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-theme-border bg-theme-surface px-4 py-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-theme-text-muted">资源使用情况</p>
              {resourceLoading ? (
                <div className="flex items-center gap-2 text-xs text-theme-text-muted">
                  <Loader2 size={13} className="animate-spin" /> 加载资源指标中...
                </div>
              ) : !resourceUsage?.available ? (
                <div className="text-xs text-theme-text-muted">
                  {resourceUsage?.message || '暂无资源指标'}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-lg border border-theme-border bg-theme-bg-app px-3 py-2">
                      <p className="text-[10px] text-theme-text-muted">CPU 占用</p>
                      <p className="mt-1 text-sm font-bold text-theme-text-primary">
                        {fmtPercent(resourceUsage.cpu_millicores, resourceUsage.pod_cpu_limit_millicores)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-theme-border bg-theme-bg-app px-3 py-2">
                      <p className="text-[10px] text-theme-text-muted">内存占用</p>
                      <p className="mt-1 text-sm font-bold text-theme-text-primary">
                        {fmtPercent(resourceUsage.memory_mib, resourceUsage.pod_memory_limit_mib)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {task.result_message && (
              <div className="rounded-xl border border-theme-border bg-theme-surface px-4 py-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-theme-text-muted">结果摘要</p>
                <div className="text-xs leading-6 text-theme-text-secondary">{task.result_message}</div>
              </div>
            )}

            {task.error_message && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/15 px-4 py-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-red-500">错误信息</p>
                <div className="break-all font-mono text-xs leading-6 text-red-400">{task.error_message}</div>
              </div>
            )}
          </>
        ) : null}

        {activeTab === 'task-config' ? (
          <FirmwareUnpackerTaskConfigPanel
            detail={task}
            taskConfigSnapshot={taskConfigSnapshot}
            taskConfigLoading={taskConfigLoading}
            taskConfigError={taskConfigError}
          />
        ) : null}

        {activeTab === 'metrics' ? (
          <section className="space-y-4">
            {metricsLoading ? (
              <div className="flex items-center gap-2 rounded-2xl border border-theme-border bg-theme-surface px-4 py-4 text-sm text-theme-text-muted">
                <Loader2 size={14} className="animate-spin" />
                加载观测指标中...
              </div>
            ) : metricsError ? (
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/15 px-4 py-4 text-sm text-rose-400">
                {metricsError}
              </div>
            ) : !metrics ? (
              <div className="rounded-2xl border border-dashed border-theme-border bg-theme-surface px-6 py-10 text-center text-sm text-theme-text-muted">
                暂无观测指标
              </div>
            ) : (
              <>
 <section className="rounded-xl border border-theme-border bg-theme-surface p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">
                        <Activity size={14} />
                        观测指标
                      </div>
                      <h2 className="mt-2 text-xl font-semibold text-theme-text-primary">
                        {phaseDisplayLabel(metrics.task.current_stage || metrics.progress.current_phase)}
                      </h2>
                      <p className="mt-1 text-sm text-theme-text-muted">
                        聚焦每轮执行、评审、Token、输出增长与运行健康状态。
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <TaskStatusBadge status={metrics.task.status} />
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${metrics.result.cache_available ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                        结果缓存{metrics.result.cache_available ? '可用' : '缺失'}
                      </span>
                      {!metrics.result.cache_available ? (
                        <button
                          type="button"
                          onClick={() => onRefreshResultCache(task.id)}
                          disabled={resultRefreshingTaskId === task.id}
                          className="inline-flex items-center gap-2 rounded-xl border border-theme-border px-3 py-2 text-xs font-semibold text-theme-text-secondary hover:bg-theme-elevated disabled:opacity-60"
                        >
                          <RefreshCw size={13} className={resultRefreshingTaskId === task.id ? 'animate-spin' : ''} />
                          刷新缓存
                        </button>
                      ) : null}
                    </div>
                  </div>
                </section>

                {metrics.rounds.warnings.length > 0 ? (
 <section className="rounded-2xl border border-amber-500/20 bg-amber-500/15 p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-amber-400">
                      <AlertCircle size={16} />
                      部分轮次观测文件读取异常
                    </div>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-400">
                      {metrics.rounds.warnings.map((warning, index) => (
                        <li key={`${warning}-${index}`}>{warning}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
 <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">
                      <BarChart3 size={14} />
                      总轮数
                    </div>
                    <div className="mt-2 text-2xl font-bold text-theme-text-primary">{formatNumber(metrics.rounds.round_count)}</div>
                    <div className="mt-1 text-xs text-theme-text-muted">完成 {metrics.rounds.completed_round_count} · 失败 {metrics.rounds.failed_round_count}</div>
                  </div>
 <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">当前 / 最新轮次</div>
                    <div className="mt-2 text-2xl font-bold text-theme-text-primary">
                      #{metrics.progress.current_round ?? metrics.rounds.running_round ?? metrics.rounds.latest_round ?? '-'}
                    </div>
                    <div className="mt-1 text-xs text-theme-text-muted">计划 {metrics.progress.total_rounds ?? '-'} 轮</div>
                  </div>
 <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">总 Token</div>
                    <div className="mt-2 text-2xl font-bold text-theme-text-primary">{formatNumber(metrics.rounds.total_tokens)}</div>
                    <div className="mt-1 text-xs text-theme-text-muted">Cost {formatCost(metrics.rounds.total_cost)}</div>
                  </div>
 <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">轮次总耗时</div>
                    <div className="mt-2 text-2xl font-bold text-theme-text-primary">{formatSeconds(metrics.rounds.total_duration_seconds)}</div>
                    <div className="mt-1 text-xs text-theme-text-muted">输出增长 {formatBytes(metrics.rounds.output_growth_bytes)}</div>
                  </div>
 <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">当前输出文件</div>
                    <div className="mt-2 text-2xl font-bold text-theme-text-primary">{formatNumber(metrics.result.output_file_count)}</div>
                    <div className="mt-1 text-xs text-theme-text-muted">目录 {metrics.result.output_dir_count} · {formatBytes(metrics.result.output_total_size_bytes)}</div>
                  </div>
 <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">最大文件</div>
                    <div className="mt-2 text-2xl font-bold text-theme-text-primary">{formatBytes(metrics.result.largest_file_size_bytes)}</div>
                    <div className="mt-1 text-xs text-theme-text-muted">顶层条目 {metrics.result.top_level_entry_count}</div>
                  </div>
                </div>

                {!metrics.rounds.available ? (
 <section className="rounded-2xl border border-dashed border-theme-border bg-theme-surface p-10 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-theme-elevated text-theme-text-muted">
                      <BarChart3 size={20} />
                    </div>
                    <div className="mt-4 text-base font-bold text-theme-text-primary">当前任务尚未生成轮次观测指标</div>
                    <div className="mt-2 text-sm text-theme-text-muted">任务至少完成一轮执行与评审后，会在 run/round_XXX/results.json 中生成观测数据。</div>
                  </section>
                ) : (
                  <>
 <section className="rounded-2xl border border-theme-border bg-theme-surface p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-theme-text-muted">轮次汇总</h2>
                          <p className="mt-1 text-xs text-theme-text-muted">按轮次聚合执行、评审、Token 与 output 增长指标</p>
                        </div>
                        <div className="text-xs text-theme-text-muted">
                          最新轮次：#{metrics.rounds.latest_round ?? '-'} · 最新输出 {latestRoundMetric ? formatBytes(latestRoundMetric.output_snapshot.output_total_size_bytes) : '-'}
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 xl:grid-cols-3">
                        <div className="rounded-2xl border border-theme-border bg-theme-surface p-4">
                          <div className="text-xs font-semibold text-theme-text-secondary">状态分布</div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {Object.entries(metrics.rounds.summary.status_counts).map(([status, count]) => (
                              <span key={status} className={`rounded-full border px-3 py-1 text-xs font-bold ${roundStatusTone(status)}`}>
                                {roundStatusLabel(status)} {count}
                              </span>
                            ))}
                          </div>
                        </div>
                        {Object.entries(metrics.rounds.summary.stage_summary).map(([stage, item]) => (
                          <div key={stage} className="rounded-2xl border border-theme-border bg-theme-surface p-4">
                            <div className="text-xs font-semibold text-theme-text-secondary">{phaseDisplayLabel(stage)}</div>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-theme-text-secondary">
                              <div>轮次 <span className="font-bold text-theme-text-primary">{item.round_count}</span></div>
                              <div>耗时 <span className="font-bold text-theme-text-primary">{formatSeconds(item.duration_seconds)}</span></div>
                              <div>Token <span className="font-bold text-theme-text-primary">{formatNumber(item.token_total)}</span></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

 <section className="rounded-2xl border border-theme-border bg-theme-surface p-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-theme-text-muted">轮次明细</h2>
                          <p className="mt-1 text-xs text-theme-text-muted">展示每一轮执行和评审的产物、耗时、Token 与输出变化，点击行打开结构化轮次详情</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <div className="relative">
                            <Search size={13} className="pointer-events-none absolute left-3 top-2.5 text-theme-text-muted" />
                            <input
                              value={roundKeywordFilter}
                              onChange={(event) => setRoundKeywordFilter(event.target.value)}
                              placeholder="搜索技能/摘要"
                              className="w-44 rounded-xl border border-theme-border py-2 pl-8 pr-3 text-xs outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                            />
                          </div>
                          <select
                            value={roundStatusFilter}
                            onChange={(event) => setRoundStatusFilter(event.target.value)}
                            className="rounded-xl border border-theme-border px-3 py-2 text-xs outline-none focus:border-blue-300"
                          >
                            <option value="">全部状态</option>
                            {roundStatuses.map((status) => <option key={status} value={status}>{roundStatusLabel(status)}</option>)}
                          </select>
                          <select
                            value={roundReviewFilter}
                            onChange={(event) => setRoundReviewFilter(event.target.value)}
                            className="rounded-xl border border-theme-border px-3 py-2 text-xs outline-none focus:border-blue-300"
                          >
                            <option value="">全部评审</option>
                            <option value="passed">评审通过</option>
                            <option value="failed">评审未通过</option>
                          </select>
                          <select
                            value={roundFallbackFilter}
                            onChange={(event) => setRoundFallbackFilter(event.target.value)}
                            className="rounded-xl border border-theme-border px-3 py-2 text-xs outline-none focus:border-blue-300"
                          >
                            <option value="">全部策略</option>
                            <option value="yes">回退 LLM</option>
                            <option value="no">未回退 LLM</option>
                          </select>
                        </div>
                      </div>

                      <div className="mt-4 overflow-x-auto rounded-2xl border border-theme-border">
                        <table className="min-w-[1180px] w-full text-left text-xs">
                          <thead className="bg-theme-bg-app text-[11px] uppercase tracking-[0.14em] text-theme-text-muted">
                            <tr>
                              <th className="px-3 py-3">Round</th>
                              <th className="px-3 py-3">状态</th>
                              <th className="px-3 py-3">耗时</th>
                              <th className="px-3 py-3">Executor</th>
                              <th className="px-3 py-3">Reviewer</th>
                              <th className="px-3 py-3">文件</th>
                              <th className="px-3 py-3">输出大小</th>
                              <th className="px-3 py-3">本轮增长</th>
                              <th className="px-3 py-3">Token</th>
                              <th className="px-3 py-3">Cost</th>
                              <th className="px-3 py-3">策略</th>
                              <th className="px-3 py-3">告警</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-theme-border">
                            {filteredRoundItems.map((round) => (
                              <React.Fragment key={round.round}>
                                <tr
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => setSelectedMetricRound(round)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault();
                                      setSelectedMetricRound(round);
                                    }
                                  }}
                                  className="cursor-pointer bg-theme-bg-app transition hover:bg-theme-elevated"
                                >
                                  <td className="px-3 py-3 font-mono font-bold text-theme-text-primary">#{round.round}</td>
                                  <td className="px-3 py-3">
                                    <span className={`rounded-full border px-2 py-0.5 font-bold ${roundStatusTone(round.status)}`}>{roundStatusLabel(round.status)}</span>
                                  </td>
                                  <td className="px-3 py-3 text-theme-text-secondary">{formatSeconds(round.duration_seconds)}</td>
                                  <td className="px-3 py-3 max-w-[180px] truncate text-theme-text-secondary">{round.executor.response_preview || round.executor.status || '-'}</td>
                                  <td className="px-3 py-3 max-w-[180px] truncate text-theme-text-secondary">
                                    <span className={round.reviewer.passed ? 'font-bold text-emerald-400' : 'font-bold text-amber-400'}>
                                      {round.reviewer.passed ? '通过' : '未通过'}
                                    </span>
                                    {round.reviewer.review_preview ?` · ${round.reviewer.review_preview}` : ''}
                                  </td>
                                  <td className="px-3 py-3 text-theme-text-secondary">{round.output_snapshot.output_file_count} / {round.output_snapshot.output_dir_count}</td>
                                  <td className="px-3 py-3 font-mono text-theme-text-secondary">{formatBytes(round.output_snapshot.output_total_size_bytes)}</td>
                                  <td className="px-3 py-3 font-mono text-theme-text-secondary">{formatBytes(round.output_delta.size_bytes_delta)}</td>
                                  <td className="px-3 py-3 font-mono text-theme-text-secondary">{formatNumber(round.tokens.total)}</td>
                                  <td className="px-3 py-3 font-mono text-theme-text-secondary">{formatCost(round.tokens.cost)}</td>
                                  <td className="px-3 py-3 text-theme-text-secondary">
                                    <div className="flex flex-wrap gap-1">
                                      {round.context.fallback_to_llm ? <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-blue-400">LLM</span> : null}
                                      {round.context.matched_skill ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-400">{round.context.matched_skill}</span> : null}
                                      {!round.context.fallback_to_llm && !round.context.matched_skill ? '-' : null}
                                    </div>
                                  </td>
                                  <td className="px-3 py-3 text-theme-text-secondary">{round.artifacts.warnings.length || '-'}</td>
                                </tr>
                              </React.Fragment>
                            ))}
                            {filteredRoundItems.length === 0 ? (
                              <tr>
                                <td colSpan={12} className="px-4 py-10 text-center text-sm text-theme-text-muted">
                                  当前筛选条件下没有轮次记录
                                </td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </>
                )}

 <section className="rounded-2xl border border-theme-border bg-theme-surface p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-theme-text-muted">运行健康</h2>
                      <p className="mt-1 text-xs text-theme-text-muted">只保留排障需要的任务、资源、事件和会话摘要</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {metricsHealthItems.map((item) => (
                        <span key={item.label} className={`rounded-full border px-3 py-1 text-xs font-bold ${item.ok ? 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400' : 'border-amber-500/20 bg-amber-500/15 text-amber-400'}`}>
                          {item.label}：{item.hint}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-3">
                    <div className="rounded-2xl border border-theme-border bg-theme-surface p-4">
                      <div className="text-xs font-semibold text-theme-text-secondary">任务</div>
                      <div className="mt-3 grid gap-2 text-xs text-theme-text-secondary">
                        <div className="flex justify-between gap-3"><span>Owner</span><span className="break-all text-right font-mono text-theme-text-primary">{metrics.task.owner_id || '-'}</span></div>
                        <div className="flex justify-between gap-3"><span>运行耗时</span><span className="font-mono text-theme-text-primary">{formatSeconds(metrics.task.running_seconds ?? metrics.task.duration_seconds)}</span></div>
                        <div className="flex justify-between gap-3"><span>最近进展</span><span className="font-mono text-theme-text-primary">{fmtTime(metrics.task.last_progress_at)}</span></div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-theme-border bg-theme-surface p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-semibold text-theme-text-secondary">资源</div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${metrics.resource.available ? 'bg-emerald-500/15 text-emerald-400' : 'bg-theme-elevated text-theme-text-muted'}`}>
                          {metrics.resource.available ? '可用' : '不可用'}
                        </span>
                      </div>
                      <div className="mt-3 space-y-3">
                        <MetricBar label="CPU" value={metrics.resource.cpu_usage_percent} tone={clampPercent(metrics.resource.cpu_usage_percent) >= 90 ? 'rose' : 'blue'} />
                        <MetricBar label="内存" value={metrics.resource.memory_usage_percent} tone={clampPercent(metrics.resource.memory_usage_percent) >= 90 ? 'rose' : 'emerald'} />
                      </div>
                    </div>
                    <div className="rounded-2xl border border-theme-border bg-theme-surface p-4">
                      <div className="text-xs font-semibold text-theme-text-secondary">事件与会话</div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="rounded-xl bg-theme-surface px-2 py-2"><div className="text-theme-text-muted">事件</div><div className="mt-1 font-semibold text-theme-text-primary">{formatNumber(metrics.events.event_count)}</div></div>
                        <div className="rounded-xl bg-theme-surface px-2 py-2"><div className="text-theme-text-muted">会话</div><div className="mt-1 font-semibold text-theme-text-primary">{formatNumber(metrics.sessions.session_count)}</div></div>
                        <div className="rounded-xl bg-theme-surface px-2 py-2"><div className="text-theme-text-muted">运行</div><div className="mt-1 font-semibold text-blue-400">{formatNumber(metrics.sessions.running_session_count)}</div></div>
                      </div>
                      <div className="mt-3 truncate text-xs text-theme-text-muted">
                        最近事件：{metrics.events.latest_event_type ? formatEventTypeLabel(metrics.events.latest_event_type) : '暂无'}
                      </div>
                    </div>
                  </div>
                  {metrics.health.warnings.length > 0 ? (
                    <div className="mt-4 grid gap-2 md:grid-cols-2">
                      {metrics.health.warnings.map((warning, index) => (
                        <div key={`${warning}-${index}`} className="rounded-xl border border-amber-500/20 bg-amber-500/15 px-3 py-2 text-xs text-amber-400">
                          {warning}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              </>
            )}
          </section>
        ) : null}

        {activeTab === 'events' ? (
 <section className="rounded-xl border border-theme-border bg-theme-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-theme-text-primary">事件记录</h2>
                <p className="mt-1 text-sm text-theme-text-muted">紧凑展示后台记录的关键事件，点击详情查看结构化数据</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-theme-text-muted">总事件数</div>
                  <div className="mt-1 text-lg font-semibold text-theme-text-primary">{timeline.length}</div>
                </div>
                <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-theme-text-muted">展示区间</div>
                  <div className="mt-1 text-sm font-bold text-theme-text-secondary">
                    {timelineItems.length > 0 ?`${fmtTime(timelineItems[0].created_at)} -> ${fmtTime(timelineItems[timelineItems.length - 1].created_at)}` : '-'}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5">
              {timelineLoading ? (
                <div className="flex items-center gap-2 rounded-2xl border border-theme-border bg-theme-surface px-4 py-4 text-sm text-theme-text-muted">
                  <Loader2 size={14} className="animate-spin" />
                  加载事件时间线中...
                </div>
              ) : timelineError ? (
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/15 px-4 py-4 text-sm text-rose-400">
                  {timelineError}
                </div>
              ) : timelineItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-theme-border bg-theme-surface px-6 py-10 text-center text-sm text-theme-text-muted">
                  暂无事件
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-theme-border">
                  <div className="overflow-x-auto">
                    <table className="min-w-[1080px] w-full divide-y divide-theme-border text-left text-xs">
                      <thead className="bg-theme-bg-app text-[11px] font-semibold uppercase tracking-[0.12em] text-theme-text-muted">
                        <tr>
                          <th className="w-14 px-3 py-2">#</th>
                          <th className="w-40 px-3 py-2">时间</th>
                          <th className="w-40 px-3 py-2">事件</th>
                          <th className="w-28 px-3 py-2">阶段</th>
                          <th className="w-24 px-3 py-2">状态</th>
                          <th className="px-3 py-2">摘要</th>
                          <th className="w-44 px-3 py-2">来源</th>
                          <th className="w-20 px-3 py-2 text-right">详情</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-theme-border bg-theme-bg-app">
                        {timelineItems.map((event) => {
                          const expanded = expandedEventKey === event._key;
                          const detailRows = eventDetailRows(event.detail);
                          const recorderName = event.recorder_pod_name || event.recorder_hostname || '-';
                          const recorderRole = event.recorder_role || '-';
                          const originName = event.origin_pod_name || event.origin_hostname || '-';
                          const showOrigin = Boolean(
                            (event.origin_pod_name || event.origin_hostname || event.origin_role)
                            && (
                              event.origin_pod_name !== event.recorder_pod_name
                              || event.origin_hostname !== event.recorder_hostname
                              || event.origin_role !== event.recorder_role
                            )
                          );
                          return (
                            <React.Fragment key={event._key}>
                              <tr className="align-middle hover:bg-slate-100/80">
                                <td className="px-3 py-2 font-mono text-[11px] font-bold text-theme-text-muted">#{event._index}</td>
                                <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] font-semibold text-theme-text-secondary">
                                  {fmtTime(event.created_at)}
                                </td>
                                <td className="px-3 py-2">
                                  <span className="inline-flex max-w-[150px] items-center rounded-full border border-sky-500/20 bg-sky-500/15 px-2 py-0.5 text-[11px] font-medium text-sky-400">
                                    <span className="truncate">{formatEventTypeLabel(event.event_type)}</span>
                                  </span>
                                </td>
                                <td className="px-3 py-2">
                                  {event.stage_key ? (
                                    <span className="inline-flex max-w-[110px] rounded-full border border-theme-border bg-theme-bg-app px-2 py-0.5 text-[11px] font-bold text-theme-text-secondary">
                                      <span className="truncate">{phaseDisplayLabel(event.stage_key)}</span>
                                    </span>
                                  ) : (
                                    <span className="text-theme-text-muted">-</span>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  {event.status ? (
                                    <span className={`inline-flex max-w-[90px] rounded-full border px-2 py-0.5 text-[11px] font-bold ${roundStatusTone(event.status)}`}>
                                      <span className="truncate">{event.status}</span>
                                    </span>
                                  ) : (
                                    <span className="text-theme-text-muted">-</span>
                                  )}
                                </td>
                                <td className="max-w-[360px] px-3 py-2">
                                  <div className="truncate font-bold text-theme-text-primary" title={event.summary || '系统事件'}>
                                    {event.summary || '系统事件'}
                                  </div>
                                </td>
                                <td className="max-w-[176px] px-3 py-2 text-[11px] text-theme-text-muted">
                                  <div className="truncate" title={`${recorderName} · ${recorderRole}`}>
                                    记录者：{recorderName} · {recorderRole}
                                  </div>
                                  <div className="mt-0.5 truncate" title={event.recorder_node_name || '-'}>
                                    节点：{event.recorder_node_name || '-'}
                                  </div>
                                  {showOrigin ? (
                                    <div className="mt-0.5 truncate" title={`${originName} · ${event.origin_role || '-'}`}>
                                      来源：{originName} · {event.origin_role || '-'}
                                    </div>
                                  ) : null}
                                  {event.owner_id ? (
                                    <div className="mt-1 truncate font-mono text-[10px] text-theme-text-muted" title={event.owner_id}>
                                      {event.owner_id}
                                    </div>
                                  ) : null}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <button
                                    type="button"
                                    disabled={detailRows.length === 0}
                                    onClick={() => setExpandedEventKey(expanded ? null : event._key)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-theme-border bg-theme-bg-app px-2 py-1 text-[11px] font-bold text-theme-text-secondary hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    <ChevronRight size={12} className={expanded ? 'rotate-90 transition-transform' : 'transition-transform'} />
                                    {detailRows.length > 0 ? '查看' : '无'}
                                  </button>
                                </td>
                              </tr>
                              {expanded && detailRows.length > 0 ? (
                                <tr className="bg-slate-50/80">
                                  <td className="px-3 py-3" />
                                  <td colSpan={7} className="px-3 py-3">
                                    <EventDetailBlock detail={event.detail} />
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
        ) : null}

        {activeTab === 'session' ? (
          <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
 <aside className="rounded-2xl border border-theme-border bg-theme-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">会话列表</div>
                  <div className="mt-1 text-xs text-theme-text-muted">{sessionItems.length} 个会话文件</div>
                </div>
                <button
                  type="button"
                  onClick={() => void loadSessions()}
                  className="rounded-xl border border-theme-border p-2 text-theme-text-muted hover:bg-theme-elevated"
                  title="刷新会话"
                >
                  <RefreshCw size={14} className={sessionsLoading ? 'animate-spin' : ''} />
                </button>
              </div>
              {sessionsError ? <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/15 px-4 py-4 text-sm text-rose-400">{sessionsError}</div> : null}
              {sessionsLoading && sessions.length === 0 ? (
                <div className="mt-4 flex min-h-[240px] items-center justify-center rounded-2xl border border-theme-border bg-theme-surface text-sm text-theme-text-muted">
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  加载会话中...
                </div>
              ) : sessions.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-theme-border bg-theme-surface px-4 py-10 text-center text-sm text-theme-text-muted">
                  暂无智能体会话
                </div>
              ) : (
                <div className="mt-4 max-h-[calc(100vh-20rem)] space-y-4 overflow-auto pr-1">
                  {groupedSessions.map(([group, items]) => (
                    <div key={group}>
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">{group}</div>
                      <div className="space-y-2">
                        {items.map((session) => {
                          const indexItem = sessionItems.find((item) => item.session_file === session.relative_path);
                          const selected = session.relative_path === selectedSessionPath;
                          return (
                            <button
                              key={session.relative_path}
                              type="button"
                              onClick={() => setSelectedSessionPath(session.relative_path)}
                              className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                                selected
                                  ? 'border-theme-border bg-theme-surface text-white'
                                  : 'border-theme-border bg-theme-bg-app text-theme-text-secondary hover:bg-theme-bg-app'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold">{session.display_name}</div>
                                  <div className={`mt-1 text-[11px] ${selected ? 'text-theme-text-faint' : 'text-theme-text-muted'}`}>
                                    {session.relative_path}
                                  </div>
                                </div>
                                <span className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-bold ${
                                  indexItem?.status === 'running'
                                    ? selected ? 'bg-emerald-400/20 text-emerald-100' : 'bg-emerald-500/15 text-emerald-400'
                                    : selected ? 'bg-theme-elevated text-slate-200' : 'bg-theme-elevated text-theme-text-secondary'
                                }`}>
                                  {indexItem?.status === 'running' ? '运行中' : '历史'}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </aside>

            <div className="space-y-4">
              {sessionWarnings.length > 0 ? (
 <section className="rounded-2xl border border-amber-500/20 bg-amber-500/15 px-4 py-4 text-sm text-amber-400">
                  <div className="font-bold">会话文件存在部分异常行，已跳过不可解析内容</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-400">
                    {sessionWarnings.map((warning, index) => (
                      <li key={`${warning}-${index}`}>{warning}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <AgentSessionViewer
                sessionMeta={selectedSessionMeta}
                sessionHeader={sessionSnapshot?.session_meta}
                events={sessionEvents}
                loading={sessionLoading}
                live={sessionLive}
                error={sessionError || null}
              />
            </div>
          </section>
        ) : null}

        {activeTab === 'evolution' ? (
          <section className="space-y-4">
 <section className="rounded-2xl border border-theme-border bg-theme-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">Manual Evolution</div>
                  <h4 className="mt-2 text-lg font-semibold text-theme-text-primary">手动自进化</h4>
                  <p className="mt-2 text-sm text-theme-text-muted">
                    主解包任务成功后，才允许单独发起工具进化。若主任务已命中工具，则基于备份副本进化；若未命中工具，则从进化器生成首个工具开始。进化任务不会改写主任务状态，只会独立产生日志、会话和覆盖结果。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCreateEvolutionClick}
                  disabled={!canCreateEvolution}
 className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-4 py-2 text-sm font-bold text-white hover:bg-theme-elevated disabled:cursor-not-allowed disabled:border-theme-border disabled:bg-theme-elevated disabled:text-theme-text-muted"
                >
                  {evolutionSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  进化
                </button>
              </div>
              {!canCreateEvolution ? (
                <div className="mt-4 rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-xs text-theme-text-secondary">
                  {task.status !== 'success'
                    ? '仅主解包任务 success 后允许发起进化。'
                    : evolutionJobs.some((item) => ['pending', 'running'].includes(item.status))
                      ? '当前已有 pending/running 进化任务，不能重复发起。'
                      : '当前条件不满足，暂不可发起进化。'}
                </div>
              ) : null}
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
 <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">最近一次状态</div>
                <div className="mt-3">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${evolutionStatusTone(activeEvolutionJob?.status)}`}>
                    {formatEvolutionStatus(activeEvolutionJob?.status)}
                  </span>
                </div>
              </div>
 <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">轮次 / 阶段</div>
                <div className="mt-3 text-sm font-bold text-theme-text-primary">
                  {activeEvolutionJob ?`${activeEvolutionJob.current_round ?? 0}/${activeEvolutionJob.max_rounds}` : '-'}
                </div>
                <div className="mt-1 text-xs text-theme-text-muted">{evolutionStageLabel(activeEvolutionJob?.current_stage)}</div>
              </div>
 <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">最终工具脚本</div>
                <div className="mt-3 break-all font-mono text-xs text-theme-text-secondary">
                  {activeEvolutionJob?.final_tool_path || activeEvolutionJob?.final_skill_path || task.latest_evolution_final_skill_path || '-'}
                </div>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
 <div className="rounded-2xl border border-theme-border bg-theme-surface p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-theme-text-primary">历史任务列表</div>
                  {evolutionJobsLoading ? <Loader2 size={14} className="animate-spin text-theme-text-muted" /> : null}
                </div>
                {evolutionJobsError ? (
                  <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/15 px-3 py-3 text-xs text-red-400">{evolutionJobsError}</div>
                ) : null}
                {!evolutionJobsLoading && evolutionJobs.length === 0 ? (
                  <div className="mt-3 rounded-xl border border-dashed border-theme-border bg-theme-surface px-3 py-6 text-center text-sm text-theme-text-muted">
                    暂无手动进化任务
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    {evolutionJobs.map((job) => {
                      const selected = job.id === selectedEvolutionJobId;
                      return (
                        <button
                          key={job.id}
                          type="button"
                          onClick={() => setSelectedEvolutionJobId(job.id)}
                          className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                            selected
                              ? 'border-theme-border bg-theme-surface text-white'
                              : 'border-theme-border bg-theme-bg-app text-theme-text-secondary hover:bg-theme-elevated'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-mono text-xs">{job.id}</div>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
 selected ? 'border-theme-border bg-theme-elevated text-white' : evolutionStatusTone(job.status)
                            }`}>
                              {formatEvolutionStatus(job.status)}
                            </span>
                          </div>
                          <div className={`mt-2 text-xs ${selected ? 'text-theme-text-faint' : 'text-theme-text-muted'}`}>
                            轮次 {job.current_round ?? 0}/{job.max_rounds} · {evolutionStageLabel(job.current_stage)}
                          </div>
                          <div className={`mt-1 text-[11px] ${selected ? 'text-theme-text-muted' : 'text-theme-text-muted'}`}>
                            {fmtTime(job.created_at)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-4">
 <section className="rounded-2xl border border-theme-border bg-theme-surface p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-theme-text-primary">最近一次进化状态</div>
                      <div className="mt-1 text-xs text-theme-text-muted">展示当前选中进化任务的状态、起始方式和最终 Python 工具脚本结果。</div>
                    </div>
                    {evolutionDetailLoading ? <Loader2 size={15} className="animate-spin text-theme-text-muted" /> : null}
                  </div>
                  {evolutionDetailError ? (
                    <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/15 px-3 py-3 text-xs text-red-400">{evolutionDetailError}</div>
                  ) : null}
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <RoundDetailField label="状态" value={formatEvolutionStatus(activeEvolutionJob?.status)} />
                    <RoundDetailField label="轮次" value={activeEvolutionJob ?`${activeEvolutionJob.current_round ?? 0}/${activeEvolutionJob.max_rounds}` : '-'} />
                    <RoundDetailField label="当前阶段" value={evolutionStageLabel(activeEvolutionJob?.current_stage)} />
                    <RoundDetailField label="评审是否通过" value={activeEvolutionJob?.review_passed ? '通过' : '未通过'} />
                    <RoundDetailField label="开始时间" value={fmtTime(activeEvolutionJob?.started_at || null)} />
                    <RoundDetailField label="完成时间" value={fmtTime(activeEvolutionJob?.completed_at || null)} />
                    <RoundDetailField label="起始方式" value={activeEvolutionJob?.started_without_matched_skill ? '从进化器生成首个 Python 工具' : '基于命中工具脚本备份进化'} />
                    <RoundDetailField label="源工具脚本" value={activeEvolutionJob?.source_tool_path || activeEvolutionJob?.source_skill_path || '-'} mono />
                    <RoundDetailField label="工作副本" value={activeEvolutionJob?.working_tool_path || activeEvolutionJob?.working_skill_path || '-'} mono />
                    <RoundDetailField label="覆盖目标" value={activeEvolutionJob?.replaced_tool_path || activeEvolutionJob?.replaced_skill_path || '-'} mono />
                    <RoundDetailField label="最终工具脚本" value={activeEvolutionJob?.final_tool_path || activeEvolutionJob?.final_skill_path || '-'} mono />
                    <RoundDetailField label="是否生成新工具" value={activeEvolutionJob?.generated_new_tool || activeEvolutionJob?.generated_new_skill ? '是' : '否'} />
                    <RoundDetailField label="替换状态" value={
                      activeEvolutionJob?.replacement_required
                        ? (activeEvolutionJob?.replacement_confirmed ? '已确认替换' : '待确认替换')
                        : '无需替换'
                    } />
                  </div>
                  {showConfirmEvolutionReplacementButton ? (
                    <div className="mt-4 flex justify-end">
                      <div className="flex flex-col items-end gap-2">
                        <button
                          type="button"
                          onClick={handleConfirmEvolutionReplacementClick}
                          disabled={!canConfirmEvolutionReplacement}
 className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:border-theme-border disabled:bg-theme-elevated disabled:text-theme-text-muted"
                        >
                          {evolutionReplacing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                          确认替换原工具
                        </button>
                        <div className="text-xs text-theme-text-muted">{evolutionReplacementHint}</div>
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-3 rounded-xl border border-theme-border bg-theme-surface px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-theme-text-muted">错误信息</div>
                    <div className="mt-2 text-sm text-theme-text-secondary">{activeEvolutionJob?.error_message || '无'}</div>
                  </div>
                </section>

 <section className="rounded-2xl border border-theme-border bg-theme-surface p-5">
                  <div className="text-sm font-semibold text-theme-text-primary">轮次时间线</div>
                  {!activeEvolutionJob ? (
                    <div className="mt-3 rounded-xl border border-dashed border-theme-border bg-theme-surface px-3 py-6 text-center text-sm text-theme-text-muted">
                      选择一条进化任务后查看轮次详情
                    </div>
                  ) : activeEvolutionRounds.length === 0 ? (
                    <div className="mt-3 rounded-xl border border-dashed border-theme-border bg-theme-surface px-3 py-6 text-center text-sm text-theme-text-muted">
                      当前进化任务暂未产出轮次记录
                    </div>
                  ) : (
                    <div className="mt-4 space-y-4">
                      {activeEvolutionRounds.map((round) => (
                        <div key={round.id} className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-theme-text-primary">第 {round.round} 轮</div>
                              <div className="mt-1 text-xs text-theme-text-muted">
                                {fmtTime(round.created_at)} {'->'} {fmtTime(round.completed_at)}
                              </div>
                            </div>
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${roundStatusTone(round.status)}`}>
                              {roundStatusLabel(round.status)}
                            </span>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <RoundDetailField label="改进前工具" value={round.tool_path_before || round.tool_skill_path_before || '-'} mono />
                            <RoundDetailField label="改进后工具" value={round.tool_path_after || round.tool_skill_path_after || '-'} mono />
                            <RoundDetailField label="是否改动工具" value={round.tool_changed ? '是' : '否'} />
                            <RoundDetailField label="评审结果摘要" value={round.review_result || '-'} />
                          </div>
                          <div className="mt-4 grid gap-3 md:grid-cols-3">
                            <button
                              type="button"
                              onClick={() => handleOpenEvolutionLog(activeEvolutionJob.id, round.round, 'tool_executor')}
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-xs font-bold text-theme-text-secondary hover:bg-theme-elevated"
                            >
                              <Terminal size={12} />
                              工具执行器日志
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEvolutionLog(activeEvolutionJob.id, round.round, 'reviewer')}
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-xs font-bold text-theme-text-secondary hover:bg-theme-elevated"
                            >
                              <Terminal size={12} />
                              评审器日志
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEvolutionLog(activeEvolutionJob.id, round.round, 'evolver')}
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-xs font-bold text-theme-text-secondary hover:bg-theme-elevated"
                            >
                              <Terminal size={12} />
                              工具进化器日志
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

 <section className="rounded-2xl border border-theme-border bg-theme-surface p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-theme-text-primary">进化效果</div>
                      <div className="mt-1 text-xs text-theme-text-muted">按轮展示工具脚本实际执行时间，便于直观看出工具是否越进化越快。</div>
                    </div>
                  </div>
                  {!activeEvolutionJob ? (
                    <div className="mt-3 rounded-xl border border-dashed border-theme-border bg-theme-surface px-3 py-6 text-center text-sm text-theme-text-muted">
                      选择一条进化任务后查看效果指标
                    </div>
                  ) : activeEvolutionRounds.length === 0 ? (
                    <div className="mt-3 rounded-xl border border-dashed border-theme-border bg-theme-surface px-3 py-6 text-center text-sm text-theme-text-muted">
                      当前进化任务暂未产出可展示的效果指标
                    </div>
                  ) : (
                    <div className="mt-4 overflow-auto rounded-2xl border border-theme-border">
                      <table className="min-w-full divide-y divide-theme-border text-left text-xs">
                        <thead className="bg-theme-bg-app text-theme-text-muted">
                          <tr>
                            <th className="px-3 py-3">轮次</th>
                            <th className="px-3 py-3">状态</th>
                            <th className="px-3 py-3">工具执行时间</th>
                            <th className="px-3 py-3">是否换工具</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-theme-border bg-theme-bg-app">
                          {activeEvolutionRounds.map((round) => {
                            const unpackSeconds = round.tool_unpack_duration_seconds ?? round.metrics?.tool_unpack_duration_seconds ?? null;
                            return (
                              <tr key={`effect-${round.id}`}>
                                <td className="px-3 py-3 font-mono text-theme-text-secondary">#{round.round}</td>
                                <td className="px-3 py-3">
                                  <span className={`rounded-full border px-2 py-0.5 font-bold ${roundStatusTone(round.status)}`}>
                                    {roundStatusLabel(round.status)}
                                  </span>
                                </td>
                                <td className="px-3 py-3 text-theme-text-secondary">{formatEvolutionToolDuration(unpackSeconds)}</td>
                                <td className="px-3 py-3 text-theme-text-secondary">{round.tool_changed ? '是' : '否'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

 <section className="rounded-2xl border border-theme-border bg-theme-surface p-5">
                  <div className="text-sm font-semibold text-theme-text-primary">进化会话索引</div>
                  <div className="mt-1 text-xs text-theme-text-muted">当前展示所选进化任务的 session 索引，便于定位工具执行器、评审器和工具进化器对话文件。</div>
                  <div className="mt-3 rounded-xl border border-theme-border bg-theme-surface px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-theme-text-muted">Session Root</div>
                    <div className="mt-1 break-all font-mono text-xs text-theme-text-secondary">{evolutionSessions?.session_root || '-'}</div>
                  </div>
                  {evolutionSessionItems.length === 0 ? (
                    <div className="mt-3 rounded-xl border border-dashed border-theme-border bg-theme-surface px-3 py-6 text-center text-sm text-theme-text-muted">
                      暂无进化会话索引
                    </div>
                  ) : (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {evolutionSessionItems.map((item) => (
                        <div key={`${item.session_file}-${item.role}-${item.name}`} className="rounded-xl border border-theme-border bg-theme-surface px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-xs font-semibold text-theme-text-primary">{item.role}/{item.name}</div>
                            <span className={`inline-flex shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${item.status === 'running' ? 'border-blue-500/20 bg-blue-500/15 text-blue-400' : 'border-theme-border bg-theme-bg-app text-theme-text-secondary'}`}>
                              {item.status === 'running' ? '运行中' : '历史'}
                            </span>
                          </div>
                          <div className="mt-2 text-[11px] text-theme-text-muted">
                            轮次 {item.round ?? '-'} · 阶段 {evolutionStageLabel(item.phase)}
                          </div>
                          <div className="mt-2 break-all font-mono text-[11px] text-theme-text-secondary">{item.session_file}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </section>
          </section>
        ) : null}

        {activeTab === 'result' ? (
          <section className="space-y-4">
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => onRefreshResultCache(task.id)}
                disabled={resultRefreshingTaskId === task.id}
 className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-4 py-2 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated disabled:opacity-60"
              >
                {resultRefreshingTaskId === task.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                刷新结果缓存
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
 <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">输出文件数</div>
                <div className="mt-2 text-2xl font-bold text-theme-text-primary">{result?.summary.output_file_count ?? 0}</div>
              </div>
 <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">输出目录数</div>
                <div className="mt-2 text-2xl font-bold text-theme-text-primary">{result?.summary.output_dir_count ?? 0}</div>
              </div>
 <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">输出大小</div>
                <div className="mt-2 text-2xl font-bold text-theme-text-primary">{formatBytes(result?.summary.output_total_size_bytes ?? 0)}</div>
              </div>
 <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">顶层条目数</div>
                <div className="mt-2 text-2xl font-bold text-theme-text-primary">{result?.summary.top_level_entry_count ?? 0}</div>
              </div>
 <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">最大文件大小</div>
                <div className="mt-2 text-2xl font-bold text-theme-text-primary">{formatBytes(result?.summary.largest_file_size_bytes ?? 0)}</div>
              </div>
 <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">平均文件大小</div>
                <div className="mt-2 text-2xl font-bold text-theme-text-primary">{formatBytes(result?.summary.avg_file_size_bytes ?? 0)}</div>
              </div>
            </div>

            {resultLoading ? (
 <section className="rounded-2xl border border-theme-border bg-theme-surface p-10">
                <div className="flex items-center justify-center gap-2 text-sm text-theme-text-muted">
                  <Loader2 size={16} className="animate-spin" />
                  加载结果中...
                </div>
              </section>
            ) : resultError ? (
 <section className="rounded-2xl border border-rose-500/20 bg-rose-500/15 px-4 py-4 text-sm text-rose-400">
                {resultError}
              </section>
            ) : !result?.available ? (
 <section className="rounded-2xl border border-dashed border-theme-border bg-theme-surface px-6 py-10 text-center text-sm text-theme-text-muted">
                {result?.warnings?.[0] || '任务完成后可查看结果'}
              </section>
            ) : (
              <>
 <section className="rounded-2xl border border-theme-border bg-theme-surface p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">输出结构</div>
                      <div className="mt-1 text-sm text-theme-text-muted">按 output 顶层条目聚合结果分布</div>
                    </div>
                    <div className="text-xs text-theme-text-muted">按大小降序</div>
                  </div>
                  {result.summary.top_level_entries.length === 0 ? (
                    <div className="mt-4 rounded-2xl border border-dashed border-theme-border bg-theme-surface px-4 py-8 text-center text-sm text-theme-text-muted">
                      当前 output 目录为空
                    </div>
                  ) : (
                    <>
                      <div className="mt-4 overflow-x-auto">
                        <table className="min-w-full text-left text-sm text-theme-text-secondary">
                          <thead>
                            <tr className="text-[11px] uppercase tracking-[0.16em] text-theme-text-muted">
                              <th className="px-3 py-2">名称</th>
                              <th className="px-3 py-2">类型</th>
                              <th className="px-3 py-2">文件数</th>
                              <th className="px-3 py-2">目录数</th>
                              <th className="px-3 py-2">总大小</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.summary.top_level_entries.slice(0, 8).map((entry) => (
                              <tr key={`${entry.kind}-${entry.name}`} className="border-t border-theme-border">
                                <td className="px-3 py-2 font-mono text-xs text-theme-text-secondary">{entry.name || '-'}</td>
                                <td className="px-3 py-2">{resultEntryKindLabel(entry.kind)}</td>
                                <td className="px-3 py-2">{entry.file_count}</td>
                                <td className="px-3 py-2">{entry.dir_count}</td>
                                <td className="px-3 py-2 font-bold text-theme-text-primary">{formatBytes(entry.total_size_bytes)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {result.summary.top_level_entries.length > 8 ? (
                        <div className="mt-3 text-xs text-theme-text-muted">
                          还有 {result.summary.top_level_entries.length - 8} 项未展开
                        </div>
                      ) : null}
                    </>
                  )}
                </section>

                <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                  <div className="space-y-4">
 <div className="rounded-2xl border border-theme-border bg-theme-surface p-5">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">文件画像</div>
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="rounded-xl border border-theme-border bg-theme-surface px-4 py-3">
                          <div className="text-[11px] font-bold uppercase tracking-wide text-theme-text-muted">小文件 &lt; 4 KiB</div>
                          <div className="mt-2 text-xl font-semibold text-theme-text-primary">{result.summary.small_file_count}</div>
                        </div>
                        <div className="rounded-xl border border-theme-border bg-theme-surface px-4 py-3">
                          <div className="text-[11px] font-bold uppercase tracking-wide text-theme-text-muted">中文件 4 KiB - 1 MiB</div>
                          <div className="mt-2 text-xl font-semibold text-theme-text-primary">{result.summary.medium_file_count}</div>
                        </div>
                        <div className="rounded-xl border border-theme-border bg-theme-surface px-4 py-3">
                          <div className="text-[11px] font-bold uppercase tracking-wide text-theme-text-muted">大文件 ≥ 1 MiB</div>
                          <div className="mt-2 text-xl font-semibold text-theme-text-primary">{result.summary.large_file_count}</div>
                        </div>
                      </div>

                      <div className="mt-5">
                        <div>
                          <div className="text-xs font-semibold text-theme-text-muted">扩展名分布</div>
                          {result.summary.file_extension_breakdown.length === 0 ? (
                            <div className="mt-3 text-sm text-theme-text-muted">暂无统计数据</div>
                          ) : (
                            <div className="mt-3 space-y-2">
                              {result.summary.file_extension_breakdown.slice(0, 8).map((item) => (
                                <div key={item.extension} className="flex items-center justify-between gap-3 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-xs">
                                  <span className="font-mono text-theme-text-secondary">{item.extension}</span>
                                  <span className="text-theme-text-muted">{item.file_count} 个</span>
                                  <span className="font-bold text-theme-text-primary">{formatBytes(item.total_size_bytes)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

 <div className="rounded-2xl border border-theme-border bg-theme-surface p-5">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">文本结果</div>
                      <div className="mt-4">
                        <div className="space-y-4">
                          <div className="rounded-2xl border border-theme-border bg-theme-surface p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              {[
                                {
                                  id: 'summary' as const,
                                  label: '报告总结',
                                  file: 'summary.md',
                                  available: resultDocumentState.hasSummary,
                                },
                                {
                                  id: 'reason' as const,
                                  label: '改进总结',
                                  file: 'reason.md',
                                  available: resultDocumentState.hasReason,
                                },
                              ].map((doc) => {
                                const selected = resultDocumentState.selectedDoc === doc.id;
                                return (
                                  <button
                                    key={doc.id}
                                    type="button"
                                    onClick={() => setActiveResultDoc(doc.id)}
                                    className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                                      selected
                                        ? 'border-theme-border bg-theme-surface text-white'
                                        : doc.available
                                          ? 'border-theme-border bg-theme-bg-app text-theme-text-secondary hover:bg-theme-elevated'
                                          : 'border-theme-border bg-theme-elevated text-theme-text-muted'
                                    }`}
                                  >
                                    <div>{doc.label}</div>
                                    <div className={`mt-1 text-[10px] ${selected ? 'text-theme-text-faint' : doc.available ? 'text-theme-text-muted' : 'text-theme-text-muted'}`}>
                                      {doc.file} · {doc.available ? '已生成' : '未生成'}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>

                            {!resultDocumentState.hasSummary && !resultDocumentState.hasReason ? (
                              <div className="mt-4 rounded-xl border border-dashed border-theme-border bg-theme-surface px-4 py-8 text-center text-sm text-theme-text-muted">
                                暂无结果文档
                              </div>
                            ) : !resultDocumentState.selectedText ? (
                              <div className="mt-4 rounded-xl border border-dashed border-theme-border bg-theme-surface px-4 py-8 text-center text-sm text-theme-text-muted">
                                {resultDocumentState.selectedDoc === 'summary' ? '当前文档未生成' : '当前文档未生成'}
                              </div>
                            ) : (
 <div className="mt-4 rounded-[1.75rem] border border-theme-border bg-theme-bg-app p-6">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">
                                  {resultDocumentState.selectedDoc === 'summary' ? '报告总结' : '改进总结'}
                                </div>
                                <div className="mt-3 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 break-all font-mono text-[11px] text-theme-text-muted">
                                  {resultDocumentState.selectedPath || '-'}
                                </div>
                                <div className="mt-5 rounded-xl border border-theme-border bg-theme-surface px-6 py-5">
                                  <div className="mb-4 flex items-center justify-between gap-3 border-b border-theme-border pb-3">
                                    <div className="rounded-full border border-theme-border bg-theme-bg-app px-3 py-1 text-[11px] font-bold text-theme-text-muted">
                                      {resultDocumentState.selectedDoc === 'summary' ? 'summary.md' : 'reason.md'}
                                    </div>
                                  </div>
                                  <div
                                    className="
                                      prose prose-slate max-w-none text-[15px] leading-7
                                      prose-headings:scroll-mt-24 prose-headings:font-semibold prose-headings:text-theme-text-primary
                                      prose-h1:text-3xl prose-h1:tracking-tight prose-h1:border-b prose-h1:border-theme-border prose-h1:pb-3
                                      prose-h2:text-xl prose-h2:mt-8 prose-h2:border-b prose-h2:border-theme-border prose-h2:pb-2
                                      prose-h3:text-base prose-h3:mt-6
                                      prose-p:text-theme-text-secondary
                                      prose-strong:text-theme-text-primary
                                      prose-a:text-blue-400 prose-a:no-underline hover:prose-a:text-blue-300
                                      prose-ul:my-4 prose-ul:list-disc prose-ul:pl-6
                                      prose-ol:my-4 prose-ol:list-decimal prose-ol:pl-6
                                      prose-li:my-1 prose-li:text-theme-text-secondary
                                      prose-blockquote:border-l-4 prose-blockquote:border-amber-300 prose-blockquote:bg-amber-500/15 prose-blockquote:px-4 prose-blockquote:py-3 prose-blockquote:italic prose-blockquote:text-theme-text-secondary
                                      prose-hr:border-theme-border
                                      prose-code:rounded prose-code:bg-theme-elevated prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[13px] prose-code:font-semibold prose-code:text-rose-400
                                      prose-pre:overflow-x-auto prose-pre:rounded-[1.25rem] prose-pre:border prose-pre:border-theme-border prose-pre:bg-theme-bg-app prose-pre:px-4 prose-pre:py-4 prose-pre:text-[13px] prose-pre:leading-6 prose-pre:text-theme-text-primary
                                      prose-pre:
                                      prose-table:block prose-table:w-full prose-table:overflow-x-auto
                                      prose-thead:border-b prose-thead:border-theme-border
                                      prose-th:bg-theme-elevated prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:text-[12px] prose-th:font-semibold prose-th:uppercase prose-th:tracking-wide prose-th:text-theme-text-secondary
                                      prose-td:px-3 prose-td:py-2 prose-td:border-b prose-td:border-theme-border prose-td:text-theme-text-secondary"
                                  >
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{resultDocumentState.selectedText}</ReactMarkdown>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <aside className="space-y-4">
 <div className="rounded-2xl border border-theme-border bg-theme-surface p-5">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">运行统计</div>
                      <div className="mt-4 space-y-2 text-xs text-theme-text-secondary">
                        <div className="flex items-center justify-between gap-3"><span>状态</span><span className="font-bold text-theme-text-primary">{result.status}</span></div>
                        <div className="flex items-center justify-between gap-3"><span>会话数</span><span className="font-bold text-theme-text-primary">{result.summary.session_count}</span></div>
                        <div className="flex items-center justify-between gap-3"><span>事件数</span><span className="font-bold text-theme-text-primary">{result.summary.event_count}</span></div>
                        <div className="flex items-center justify-between gap-3"><span>执行轮次</span><span className="font-bold text-theme-text-primary">{result.summary.executor_rounds}</span></div>
                        <div className="flex items-center justify-between gap-3"><span>耗时</span><span className="font-bold text-theme-text-primary">{result.summary.duration_seconds == null ? '-' :`${result.summary.duration_seconds}s`}</span></div>
                        <div className="flex items-center justify-between gap-3"><span>输入 Token</span><span className="font-bold text-theme-text-primary">{result.summary.input_tokens.toLocaleString()} tokens</span></div>
                        <div className="flex items-center justify-between gap-3"><span>输出 Token</span><span className="font-bold text-theme-text-primary">{result.summary.output_tokens.toLocaleString()} tokens</span></div>
                        <div className="flex items-center justify-between gap-3"><span>命中工具</span><span className="max-w-[180px] truncate font-bold text-theme-text-primary">{result.summary.matched_skill || '-'}</span></div>
                        <div className="flex items-center justify-between gap-3"><span>回退到 LLM</span><span className="font-bold text-theme-text-primary">{result.summary.fallback_to_llm ? '是' : '否'}</span></div>
                      </div>
                    </div>

                    {result.warnings.length > 0 ? (
 <div className="rounded-2xl border border-amber-500/20 bg-amber-500/15 p-5">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400">警告</div>
                        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-400">
                          {result.warnings.map((warning, index) => (
                            <li key={`${warning}-${index}`}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </aside>
                </section>
              </>
            )}
          </section>
        ) : null}
      </div>

      {logModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-6 backdrop-blur-sm">
 <div className="flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-theme-border bg-theme-surface">
            <div className="flex items-start justify-between gap-4 border-b border-theme-border px-6 py-5">
              <div>
                <h3 className="mt-2 text-xl font-semibold text-theme-text-primary">{logModalTitle}</h3>
                <p className="mt-1 text-xs text-theme-text-muted">阶段标识：<span className="font-mono text-theme-text-secondary">{logModalPhase || '-'}</span></p>
              </div>
              <button
                type="button"
                onClick={onCloseLogModal}
                className="rounded-xl p-2 text-theme-text-muted hover:bg-theme-elevated hover:text-theme-text-secondary"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 overflow-auto px-6 py-5">
              {taskLogLoading ? (
                <div className="flex items-center gap-2 text-sm text-theme-text-muted">
                  <Loader2 size={15} className="animate-spin" /> 加载日志中...
                </div>
              ) : !taskLog?.available ? (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/15 px-4 py-3 text-sm text-amber-400">
                  {taskLog?.message || '当前阶段日志不可用'}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-theme-border bg-theme-surface px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-theme-text-muted">日志目录</p>
                      <p className="mt-1 break-all font-mono text-xs text-theme-text-secondary">{taskLog.run_path || '-'}</p>
                    </div>
                    <div className="rounded-xl border border-theme-border bg-theme-surface px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-theme-text-muted">日志文件</p>
                      <p className="mt-1 break-all font-mono text-xs text-theme-text-secondary">{taskLog.files?.join(', ') || '-'}</p>
                    </div>
                  </div>
                  <pre className="min-h-[320px] overflow-auto rounded-2xl border border-theme-border bg-theme-surface px-4 py-4 text-[12px] leading-6 text-theme-text-primary whitespace-pre-wrap break-words">{taskLog.log_text || taskLog.message || '暂无日志内容'}</pre>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {evolutionLogModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-6 backdrop-blur-sm">
 <div className="flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-theme-border bg-theme-surface">
            <div className="flex items-start justify-between gap-4 border-b border-theme-border px-6 py-5">
              <div>
                <h3 className="mt-2 text-xl font-semibold text-theme-text-primary">{evolutionLogModalTitle}</h3>
              </div>
              <button
                type="button"
                onClick={() => setEvolutionLogModalOpen(false)}
                className="rounded-xl p-2 text-theme-text-muted hover:bg-theme-elevated hover:text-theme-text-secondary"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 overflow-auto px-6 py-5">
              {evolutionLogLoading ? (
                <div className="flex items-center gap-2 text-sm text-theme-text-muted">
                  <Loader2 size={15} className="animate-spin" /> 加载日志中...
                </div>
              ) : !evolutionLog?.available ? (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/15 px-4 py-3 text-sm text-amber-400">
                  {evolutionLog?.message || '当前阶段日志不可用'}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-theme-border bg-theme-surface px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-theme-text-muted">日志目录</p>
                      <p className="mt-1 break-all font-mono text-xs text-theme-text-secondary">{evolutionLog.run_path || '-'}</p>
                    </div>
                    <div className="rounded-xl border border-theme-border bg-theme-surface px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-theme-text-muted">日志文件</p>
                      <p className="mt-1 break-all font-mono text-xs text-theme-text-secondary">{evolutionLog.files?.join(', ') || '-'}</p>
                    </div>
                  </div>
                  <pre className="min-h-[320px] overflow-auto rounded-2xl border border-theme-border bg-theme-surface px-4 py-4 text-[12px] leading-6 text-theme-text-primary whitespace-pre-wrap break-words">{evolutionLog.log_text || evolutionLog.message || '暂无日志内容'}</pre>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedMetricRound && (
        <RoundDetailModal
          round={selectedMetricRound}
          onClose={() => setSelectedMetricRound(null)}
        />
      )}
    </div>
  );
}

export const FirmwareUnpackerPage: React.FC<Props> = ({ projectId, projects = [], initialTaskId = '', onActiveTaskChange }) => {
  const buildVersion = useServiceBuildVersion(fwApi.getHealth);
  const { notify, feedbackNodes } = useUiFeedback();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [firmwarePath, setFirmwarePath] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [tasks, setTasks] = useState<FirmwareUnpackTask[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeTaskId, setActiveTaskId] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState('');
  const [resourceUsage, setResourceUsage] = useState<FirmwareTaskResourceUsage | null>(null);
  const [resourceLoading, setResourceLoading] = useState(false);
  const [progress, setProgress] = useState<FirmwareTaskProgress | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [taskLog, setTaskLog] = useState<FirmwareTaskLog | null>(null);
  const [taskLogLoading, setTaskLogLoading] = useState(false);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [logModalTitle, setLogModalTitle] = useState('');
  const [logModalPhase, setLogModalPhase] = useState('');
  const [resultRefreshingTaskId, setResultRefreshingTaskId] = useState('');
  const [detailActiveTab, setDetailActiveTab] = useState<DetailTab>('overview');
  const [detailRefreshRequest, setDetailRefreshRequest] = useState(0);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterOriginMode, setFilterOriginMode] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterWorker, setFilterWorker] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pageEffectMountedRef = useRef(false);
  const taskItems = Array.isArray(tasks) ? tasks : [];
  const activeProject = useMemo(
    () => projects.find((item) => item.id === projectId) || null,
    [projects, projectId],
  );
  const workspacePreview = useMemo(
    () => (projectId ? buildWorkspacePreview(projectId) : null),
    [projectId],
  );
  const activeTask = useMemo(
    () => taskItems.find((task) => task.id === activeTaskId) || null,
    [taskItems, activeTaskId],
  );

  const resetCreateForm = useCallback(() => {
    setFirmwarePath('');
  }, []);

  const openCreateModal = useCallback(() => {
    resetCreateForm();
    setCreateModalOpen(true);
  }, [resetCreateForm]);

  const fetchTasks = useCallback(async (resetPage = false, options?: {
    silent?: boolean;
    pageOverride?: number;
    pageSizeOverride?: number;
    statusOverride?: string;
    originModeOverride?: string;
    searchOverride?: string;
    workerOverride?: string;
  }) => {
    if (!projectId) {
      if (resetPage) setPage(0);
      setTasks([]);
      setTotal(0);
      setSelected(new Set());
      setListError('');
      setLoading(false);
      return;
    }

    if (!options?.silent) {
      setLoading(true);
      setListError('');
    }
    const currentPage = resetPage ? 0 : options?.pageOverride ?? page;
    const currentPageSize = options?.pageSizeOverride ?? pageSize;
    const currentStatus = options?.statusOverride ?? filterStatus;
    const currentOriginMode = options?.originModeOverride ?? filterOriginMode;
    const currentSearch = options?.searchOverride ?? filterSearch;
    const currentWorker = options?.workerOverride ?? filterWorker;
    if (resetPage) setPage(0);
    try {
      const query: TaskListQuery = {
        project_id: projectId,
        limit: currentPageSize,
        offset: currentPage * currentPageSize,
      };
      if (currentStatus) query.status = currentStatus;
      if (currentWorker) query.worker_id = currentWorker;
      if (currentOriginMode) query.origin_mode = currentOriginMode;
      if (currentSearch) query.search = currentSearch;
      const res = await fwApi.listTasks(query);
      setTasks((prev) => sameJsonValue(prev, res.items) ? prev : res.items);
      setTotal((prev) => prev === res.total ? prev : res.total);
    } catch (e: any) {
      if (!options?.silent) setListError(e?.message || '加载失败');
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [page, pageSize, projectId, filterStatus, filterOriginMode, filterSearch, filterWorker]);

  const refreshOne = useCallback(async (id: string, options?: {
    showDetailLoading?: boolean;
    refreshProgress?: boolean;
    refreshResource?: boolean;
  }) => {
    const isActive = activeTaskId === id;
    const showDetailLoading = options?.showDetailLoading ?? true;
    const refreshProgress = options?.refreshProgress ?? isActive;
    const refreshResource = options?.refreshResource ?? isActive;
    if (isActive && showDetailLoading) setDetailLoading(true);
    try {
      const task = await fwApi.getTask(id);
      setTasks((prev) => {
        const exists = prev.some((item) => item.id === id);
        if (!exists) return [task, ...prev];
        return prev.map((item) => {
          if (item.id !== id) return item;
          return sameJsonValue(item, task) ? item : task;
        });
      });
      if (isActive && (refreshResource || refreshProgress)) {
        const [usage, taskProgress] = await Promise.all([
          refreshResource ? fwApi.getTaskResourceUsage(id).catch(() => null) : Promise.resolve(undefined),
          refreshProgress ? fwApi.getTaskProgress(id).catch(() => null) : Promise.resolve(undefined),
        ]);
        if (usage !== undefined) setResourceUsage((prev) => sameJsonValue(prev, usage) ? prev : usage);
        if (taskProgress !== undefined) setProgress((prev) => sameJsonValue(prev, taskProgress) ? prev : taskProgress);
      }
    } catch {
    } finally {
      if (isActive && showDetailLoading) setDetailLoading(false);
    }
  }, [activeTaskId]);

  const loadResourceUsage = useCallback(async (id: string, options?: { silent?: boolean }) => {
    if (!options?.silent) setResourceLoading(true);
    try {
      const usage = await fwApi.getTaskResourceUsage(id);
      setResourceUsage((prev) => sameJsonValue(prev, usage) ? prev : usage);
    } catch {
      setResourceUsage((prev) => prev === null ? prev : null);
    } finally {
      if (!options?.silent) setResourceLoading(false);
    }
  }, []);

  const loadTaskProgress = useCallback(async (id: string, options?: { silent?: boolean }) => {
    if (!options?.silent) setProgressLoading(true);
    try {
      const next = await fwApi.getTaskProgress(id);
      setProgress((prev) => sameJsonValue(prev, next) ? prev : next);
    } catch {
      setProgress((prev) => prev === null ? prev : null);
    } finally {
      if (!options?.silent) setProgressLoading(false);
    }
  }, []);

  const hasRunning = useMemo(() => taskItems.some((task) => !isTerminal(task.status)), [taskItems]);

  useEffect(() => {
    if (hasRunning && !activeTaskId) {
      pollingRef.current = setInterval(() => {
        void fetchTasks(false, { silent: true });
      }, 5000);
    } else if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [activeTaskId, fetchTasks, hasRunning]);

  useEffect(() => {
    fetchTasks(true);
    setSelected(new Set());
    setActiveTaskId('');
    setDetailActiveTab('overview');
  }, [projectId]);

  useEffect(() => {
    if (!pageEffectMountedRef.current) {
      pageEffectMountedRef.current = true;
      return;
    }
    fetchTasks();
  }, [page]);

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);
    if (page > maxPage) setPage(maxPage);
  }, [page, pageSize, total]);

  useEffect(() => {
    if (!activeTaskId) {
      setDetailActiveTab('overview');
      setResourceUsage(null);
      setResourceLoading(false);
      setProgress(null);
      setProgressLoading(false);
      setTaskLog(null);
      setTaskLogLoading(false);
      setLogModalOpen(false);
      setLogModalTitle('');
      setLogModalPhase('');
      return;
    }
    loadResourceUsage(activeTaskId);
    loadTaskProgress(activeTaskId);
  }, [activeTaskId, loadResourceUsage, loadTaskProgress, refreshOne, taskItems]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) {
      notify('请先选择项目', 'error');
      return;
    }
    if (!firmwarePath.trim()) {
      notify('请先选择要解包的固件文件', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const result = await fwApi.unpack({
        firmware_path: firmwarePath.trim(),
        project_id: projectId,
      });
      const messageParts = [`任务已提交！ID: ${result.task_id}`];
      if (result.output_path) messageParts.push(`output: ${result.output_path}`);
      if (result.run_path) messageParts.push(`run: ${result.run_path}`);
      notify(messageParts.join('，'), 'success');
      setCreateModalOpen(false);
      resetCreateForm();
      setTimeout(() => fetchTasks(true), 800);
    } catch (e: any) {
      notify(e?.message || '提交失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await fwApi.cancelTask(id);
      notify('任务停止请求已提交', 'success');
      refreshOne(id);
    } catch (e: any) {
      notify(`停止失败: ${e?.message}`, 'error');
    }
  };

  const handleDelete = useCallback(async (id: string) => {
    const target = taskItems.find((task) => task.id === id);
    if (target && !isTerminal(target.status)) {
      notify('运行中的任务不能删除，请先停止', 'error');
      return;
    }
    const confirmed = await showConfirm({
      title: '删除任务',
      message: '确认删除当前解包任务记录吗？',
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    setDeletingTaskId(id);
    try {
      await fwApi.deleteTask(id);
      setTasks((prev) => prev.filter((task) => task.id !== id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (activeTaskId === id) {
        setActiveTaskId('');
        setDetailLoading(false);
        setResourceUsage(null);
        setResourceLoading(false);
        setProgress(null);
        setProgressLoading(false);
        setTaskLog(null);
        setTaskLogLoading(false);
        setLogModalOpen(false);
        setLogModalTitle('');
        setLogModalPhase('');
      }
      await fetchTasks(taskItems.length <= 1 && page > 0);
      notify('任务已删除', 'success');
    } catch (e: any) {
      notify(`删除失败: ${e?.message}`, 'error');
    } finally {
      setDeletingTaskId('');
    }
  }, [activeTaskId, fetchTasks, notify, page, taskItems]);

  const handleRetry = async (id: string) => {
    try {
      const result = await fwApi.retryTask(id);
      notify(result.message || '任务重试已受理，后台正在准备', 'success');
      setTimeout(() => fetchTasks(true), 800);
    } catch (e: any) {
      notify(`重试失败: ${e?.message}`, 'error');
    }
  };

  const handleRefreshResultCache = async (id: string) => {
    setResultRefreshingTaskId(id);
    try {
      const result = await fwApi.refreshTaskResultCache(id);
      notify(result.message || '结果缓存刷新已受理，后台正在更新', 'success');
      setTimeout(() => {
        void refreshOne(id, { showDetailLoading: false, refreshProgress: false, refreshResource: false });
      }, 800);
    } catch (e: any) {
      notify(`刷新结果缓存失败: ${e?.message}`, 'error');
    } finally {
      setResultRefreshingTaskId('');
    }
  };

  const handleOpenDetail = useCallback((id: string) => {
    setActiveTaskId(id);
    setDetailActiveTab('overview');
    onActiveTaskChange?.(id);
  }, [onActiveTaskChange]);

  const handleCreateEvolution = useCallback(async (id: string) => {
    try {
      const taskItem = taskItems.find((item) => item.id === id) || null;
      const result = await fwApi.createEvolutionJob(id, taskItem?.project_id);
      notify(`手动进化任务已创建：${result.job_id}`, 'success');
      await refreshOne(id, { showDetailLoading: false, refreshProgress: false, refreshResource: false });
      await fetchTasks(false, { silent: true });
    } catch (e: any) {
      notify(`发起进化失败: ${e?.message || 'unknown error'}`, 'error');
      throw e;
    }
  }, [fetchTasks, notify, refreshOne]);

  const handleOpenPhaseLog = useCallback(async (taskId: string, phaseKey: string, phaseLabel: string) => {
    setLogModalTitle(`${phaseLabel} 日志`);
    setLogModalPhase(phaseKey);
    setTaskLog(null);
    setTaskLogLoading(true);
    setLogModalOpen(true);
    try {
      const next = await fwApi.getTaskLogs(taskId, phaseKey);
      setTaskLog(next);
    } catch (e: any) {
      setTaskLog({
        task_id: taskId,
        run_path: null,
        available: false,
        log_text: '',
        files: [],
        phase: phaseKey,
        message: e?.message || '加载阶段日志失败',
      });
    } finally {
      setTaskLogLoading(false);
    }
  }, []);

  const handleBatchDelete = useCallback(async () => {
    const selectedTasks = taskItems.filter((task) => selected.has(task.id));
    const deletableIds = selectedTasks.filter((task) => isTerminal(task.status)).map((task) => task.id);
    const runningCount = selectedTasks.length - deletableIds.length;

    if (!selectedTasks.length) return;
    if (!deletableIds.length) {
      notify('所选任务中包含运行中任务，请先停止后再删除', 'error');
      return;
    }
    const confirmed = await showConfirm({
      title: '批量删除任务',
      message:`确认删除 ${deletableIds.length} 条记录${runningCount > 0 ?`，并跳过 ${runningCount} 条运行中任务` : ''}？`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;

    try {
      await fwApi.batchDelete(deletableIds);
      setSelected((prev) => {
        const next = new Set(prev);
        deletableIds.forEach((taskId) => next.delete(taskId));
        return next;
      });
      if (activeTaskId && deletableIds.includes(activeTaskId)) setActiveTaskId('');
      fetchTasks(true);
      notify(`已删除 ${deletableIds.length} 条任务记录`, 'success');
    } catch (e: any) {
      notify(`批量删除失败: ${e?.message}`, 'error');
    }
  }, [activeTaskId, fetchTasks, notify, selected, taskItems]);

  const toggleSelect = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(taskItems.map((task) => task.id)) : new Set());
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageStart = total === 0 ? 0 : page * pageSize + 1;
  const pageEnd = total === 0 ? 0 : Math.min(total, page * pageSize + taskItems.length);
  const showingDetail = Boolean(activeTaskId);
  const hasReturnContext = hasBinarySecurityReturnTarget(activeTask);
  const handleDetailBack = () => {
    if (navigateBackByTaskOrigin(activeTask)) return;
    if (navigateBackToBinarySecurityTask()) return;
    onActiveTaskChange?.('');
    setActiveTaskId('');
  };
  const handlePageRefresh = () => {
    if (showingDetail) {
      setDetailRefreshRequest((value) => value + 1);
      return;
    }
    fetchTasks(true);
  };

  return (
    <div className="p-4 space-y-4">
      {feedbackNodes}

      <FileServerPickerModal
        projectId={projectId}
        isOpen={pickerOpen}
        mode="file"
        containerRoot={FILESERVER_CONTAINER_ROOT}
        title="选择固件文件"
        description="从项目文件系统中选择要解包的固件文件"
        confirmText="选择文件"
        onClose={() => setPickerOpen(false)}
        onSelect={(containerPath) => {
          setPickerOpen(false);
          setFirmwarePath(containerPath);
        }}
      />

      {createModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/65 p-6 backdrop-blur-sm">
 <div className="w-full max-w-2xl rounded-xl border border-theme-border bg-theme-surface">
            <div className="flex items-start justify-between gap-4 border-b border-theme-border px-6 py-5">
              <div>
                <h3 className="mt-2 text-2xl font-bold text-theme-text-primary">新建解包任务</h3>
                <p className="mt-2 text-sm text-theme-text-muted">使用右上角当前项目，从该项目文件系统中选择待解包固件文件。</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCreateModalOpen(false);
                  setPickerOpen(false);
                }}
                className="rounded-xl p-2 text-theme-text-muted hover:bg-theme-elevated hover:text-theme-text-secondary"
              >
                <X size={18} />
              </button>
            </div>

            <form className="space-y-5 px-6 py-6" onSubmit={handleSubmit}>
              <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
                <p className="text-sm font-semibold text-theme-text-secondary">所属项目</p>
                <p className="mt-2 text-sm font-bold text-theme-text-primary">{activeProject?.name || '未选择项目'}</p>
                <p className="mt-1 text-xs text-theme-text-muted">
                  项目 ID: <span className="font-mono text-theme-text-secondary">{projectId || '-'}</span>
                </p>
              </div>

              <label className="block text-sm font-semibold text-theme-text-secondary">
                固件文件
                <div className="mt-2 flex gap-2">
                  <div className="relative flex-1">
                    <FolderOpen size={14} className="pointer-events-none absolute left-3 top-3.5 text-theme-text-muted" />
                    <input
                      value={firmwarePath}
                      onChange={(e) => setFirmwarePath(e.target.value)}
                      placeholder={`${FILESERVER_CONTAINER_ROOT}/<project>/<subproject>/firmware.bin`}
                      className="w-full rounded-2xl border border-theme-border py-3 pl-9 pr-4 text-sm font-mono text-theme-text-primary outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!projectId}
                  onClick={() => {
                      if (!projectId) {
                        notify('请先选择项目', 'error');
                        return;
                      }
                      setPickerOpen(true);
                    }}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl border border-theme-border px-4 py-3 text-sm font-semibold text-theme-text-secondary hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <FolderOpen size={14} /> 选择文件
                  </button>
                </div>
                <span className="mt-2 block text-xs font-normal text-theme-text-muted">支持手工输入路径，也支持从项目文件系统直接选择固件文件。</span>
              </label>

              <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
                <p className="text-sm font-semibold text-theme-text-secondary">任务工作目录</p>
                <p className="mt-2 text-xs leading-6 text-theme-text-muted">
                  提交后会在当前项目根目录自动创建`app/chimera-app-firmware-unpacker/&lt;task-id&gt;`，
                  并在其中生成`input`、`output`、`run` 三个目录。`input` 目录中只会写入一份 JSON 清单，记录原始固件路径、
                  输出目录和运行日志目录，解包时直接使用原始固件文件。
                </p>
                <p className="mt-2 text-xs leading-6 text-theme-text-muted">
                  当前任务使用的 LLM 配置会在提交时从“执行 → 参数配置 → LLM Role Binding”读取并冻结，执行过程中不会再跟随后续配置变更。
                </p>
                <div className="mt-3 space-y-2 text-xs">
                  <div>
                    <p className="font-semibold text-theme-text-muted">input</p>
                    <p className="font-mono break-all text-theme-text-secondary">{workspacePreview?.input || '-'}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-theme-text-muted">output</p>
                    <p className="font-mono break-all text-theme-text-secondary">{workspacePreview?.output || '-'}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-theme-text-muted">run</p>
                    <p className="font-mono break-all text-theme-text-secondary">{workspacePreview?.run || '-'}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-theme-border pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setCreateModalOpen(false);
                    setPickerOpen(false);
                  }}
                  className="rounded-2xl border border-theme-border px-5 py-3 text-sm font-semibold text-theme-text-secondary hover:bg-theme-elevated"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting || !projectId || !firmwarePath.trim()}
 className="inline-flex items-center gap-1.5 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {submitting ? <><Loader2 size={14} className="animate-spin" />提交中...</> : <><Play size={14} />提交任务</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <PageHeader
        title={showingDetail ? '固件解包 · 任务详情' : '固件解包 · 任务列表'}
        description={!showingDetail && hasRunning ? '有任务运行中，每5秒自动刷新' : undefined}
        actions={<button onClick={handlePageRefresh} className="inline-flex items-center gap-1.5 rounded-lg bg-theme-surface px-3 py-1.5 text-xs font-semibold text-white">{showingDetail ? <><RefreshCw size={12} /> 刷新详情</> : <><RefreshCw size={12} /> 刷新列表</>}</button>}
      />

      {showingDetail ? (
        <TaskDetailPanel
          projectId={projectId}
          task={projectId ? activeTask : null}
          loading={detailLoading}
          resourceUsage={resourceUsage}
          resourceLoading={resourceLoading}
          hasReturnContext={hasReturnContext}
          progress={progress}
          progressLoading={progressLoading}
          logModalOpen={logModalOpen}
          logModalTitle={logModalTitle}
          logModalPhase={logModalPhase}
          taskLog={taskLog}
          taskLogLoading={taskLogLoading}
          onOpenPhaseLog={handleOpenPhaseLog}
          onCloseLogModal={() => setLogModalOpen(false)}
          deletingTaskId={deletingTaskId}
          onBack={handleDetailBack}
          onRefresh={refreshOne}
          onCancel={handleCancel}
          onDelete={handleDelete}
          onRetry={handleRetry}
          onRefreshResultCache={handleRefreshResultCache}
          onCreateEvolution={handleCreateEvolution}
          notify={notify}
          resultRefreshingTaskId={resultRefreshingTaskId}
          onActiveTabChange={setDetailActiveTab}
          refreshRequest={detailRefreshRequest}
        />
      ) : (
      <div className="space-y-4">
 <div className="rounded-2xl border border-theme-border bg-theme-surface p-3">
          <div className="grid grid-cols-4 gap-1 text-center">
            {[
              ['总计', total, 'text-theme-text-secondary'],
              ['运行', taskItems.filter((task) => task.status === 'running').length, 'text-blue-400'],
              ['成功', taskItems.filter((task) => task.status === 'success').length, 'text-emerald-400'],
              ['失败', taskItems.filter((task) => task.status === 'failed').length, 'text-red-400'],
            ].map(([label, count, color]) => (
              <div key={String(label)} className="rounded-xl bg-theme-surface py-1.5">
                <p className={`text-base font-semibold ${color}`}>{count}</p>
                <p className="text-[10px] text-theme-text-muted">{label}</p>
              </div>
            ))}
          </div>
        </div>

 <div className="rounded-2xl border border-theme-border bg-theme-surface p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <ListTodo size={14} className="shrink-0 text-violet-400" />
                <h3 className="text-lg font-semibold text-theme-text-primary">任务列表</h3>
                <span className="text-sm font-normal text-theme-text-muted">({total})</span>
              </div>
              <p className="mt-1 text-xs text-theme-text-muted">
                {activeProject?.name ?`当前项目：${activeProject.name}` : projectId ?`当前项目 ID：${projectId}` : '当前未选择项目'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchTasks(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-theme-border px-3 py-1.5 text-xs font-semibold text-theme-text-secondary hover:bg-theme-elevated"
              >
                <RefreshCw size={12} /> 刷新列表
              </button>
              <button
                onClick={openCreateModal}
                disabled={!projectId}
                className="inline-flex items-center gap-1.5 rounded-lg bg-theme-surface px-3 py-1.5 text-xs font-semibold text-white hover:bg-theme-elevated disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Plus size={13} /> 新建任务
              </button>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select
              value={filterStatus}
              onChange={(e) => {
                const nextStatus = e.target.value;
                setFilterStatus(nextStatus);
                fetchTasks(true, { statusOverride: nextStatus });
              }}
              className="rounded-lg border border-theme-border bg-theme-bg-app px-2 py-1.5 text-xs text-theme-text-secondary outline-none"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>

            <select
              value={filterOriginMode}
              onChange={(e) => {
                const nextOriginMode = e.target.value;
                setFilterOriginMode(nextOriginMode);
                fetchTasks(true, { originModeOverride: nextOriginMode });
              }}
              className="rounded-lg border border-theme-border bg-theme-bg-app px-2 py-1.5 text-xs text-theme-text-secondary outline-none"
            >
              {ORIGIN_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>

            <div className="relative">
              <Search size={11} className="pointer-events-none absolute left-2.5 top-2 text-theme-text-muted" />
              <input
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchTasks(true, { searchOverride: filterSearch })}
                placeholder="搜索固件路径..."
                className="w-44 rounded-lg border border-theme-border bg-theme-bg-app py-1.5 pl-7 pr-8 text-xs text-theme-text-secondary outline-none focus:border-blue-300"
              />
              {filterSearch && (
                <button
                  onClick={() => {
                    setFilterSearch('');
                    fetchTasks(true, { searchOverride: '' });
                  }}
                  className="absolute right-2 top-2 text-theme-text-muted hover:text-theme-text-secondary"
                >
                  <X size={11} />
                </button>
              )}
            </div>

            <input
              value={filterWorker}
              onChange={(e) => setFilterWorker(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchTasks(true, { workerOverride: filterWorker })}
              placeholder="Worker ID 过滤..."
              className="w-36 rounded-lg border border-theme-border bg-theme-bg-app px-2.5 py-1.5 text-xs text-theme-text-secondary outline-none focus:border-blue-300"
            />

            <button
              onClick={() => fetchTasks(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-theme-elevated px-2.5 py-1.5 text-xs font-semibold text-white"
            >
              <Search size={11} /> 查询
            </button>

            {selected.size > 0 && (
              <button
                onClick={handleBatchDelete}
                className="ml-auto inline-flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/15 px-2.5 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/15"
              >
                <Trash2 size={11} /> 批量删除 ({selected.size})
              </button>
            )}
          </div>

          {listError && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/15 px-3 py-2 text-xs text-red-400">
              <AlertCircle size={13} /> {listError}
            </div>
          )}

          {taskItems.length > 0 && (
            <div className="mb-2 flex items-center gap-2 rounded-xl bg-theme-surface px-3 py-1.5">
              <input
                type="checkbox"
                checked={selected.size === taskItems.length && taskItems.length > 0}
                onChange={(e) => toggleAll(e.target.checked)}
                className="rounded border-theme-border text-blue-400"
              />
              <span className="text-xs text-theme-text-muted">全选当前页 ({taskItems.length} 条)</span>
            </div>
          )}

          {!projectId ? (
            <div className="rounded-xl border border-dashed border-theme-border bg-theme-surface py-10 text-center text-xs text-theme-text-muted">
              请先在右上角选择项目，再查看该项目下的固件解包任务
            </div>
          ) : loading && taskItems.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-theme-text-muted">
              <Loader2 size={20} className="mr-2 animate-spin" /> 加载中...
            </div>
          ) : taskItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-theme-border bg-theme-surface py-10 text-center text-xs text-theme-text-muted">
              暂无任务记录
            </div>
          ) : (
            <ExecutionTable minWidth={1320}>
              <ExecutionTableHead>
                <tr>
                  <ExecutionTableTh className="w-12">
                    <input
                      type="checkbox"
                      checked={selected.size === taskItems.length && taskItems.length > 0}
                      onChange={(e) => toggleAll(e.target.checked)}
                      aria-label="全选当前页任务"
                    />
                  </ExecutionTableTh>
                  <ExecutionTableTh className="w-[104px]">状态</ExecutionTableTh>
                  <ExecutionTableTh>固件路径</ExecutionTableTh>
                  <ExecutionTableTh>来源</ExecutionTableTh>
                  <ExecutionTableTh>Worker</ExecutionTableTh>
                  <ExecutionTableTh>耗时</ExecutionTableTh>
                  <ExecutionTableTh>创建时间</ExecutionTableTh>
                  <ExecutionTableTh>结果</ExecutionTableTh>
                  <ExecutionTableTh className="text-right">详情</ExecutionTableTh>
                </tr>
              </ExecutionTableHead>
              <tbody>
                {taskItems.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    selected={selected.has(task.id)}
                    active={activeTaskId === task.id}
                    onSelect={toggleSelect}
                    onOpenDetail={handleOpenDetail}
                  />
                ))}
              </tbody>
            </ExecutionTable>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-theme-border pt-3">
            <div className="text-xs text-theme-text-muted">
              共 {total} 条，当前显示 {pageStart}-{pageEnd}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1.5 text-xs text-theme-text-muted">
                每页
                <select
                  value={pageSize}
                  onChange={(e) => {
                    const nextSize = Number(e.target.value) || 50;
                    setPageSize(nextSize);
                    fetchTasks(true, { pageSizeOverride: nextSize });
                  }}
                  className="rounded-lg border border-theme-border bg-theme-bg-app px-2 py-1.5 text-xs text-theme-text-secondary outline-none"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
                条
              </label>
              <button
                disabled={page === 0}
                onClick={() => setPage(0)}
                className="rounded-lg border border-theme-border px-2.5 py-1.5 text-xs font-semibold text-theme-text-secondary disabled:opacity-40 hover:bg-theme-elevated"
              >
                首页
              </button>
              <button
                disabled={page === 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                className="rounded-lg border border-theme-border px-3 py-1.5 text-xs font-semibold text-theme-text-secondary disabled:opacity-40 hover:bg-theme-elevated"
              >
                上一页
              </button>
              <span className="min-w-16 text-center text-xs text-theme-text-muted">{page + 1} / {totalPages}</span>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
                className="rounded-lg border border-theme-border px-3 py-1.5 text-xs font-semibold text-theme-text-secondary disabled:opacity-40 hover:bg-theme-elevated"
              >
                下一页
              </button>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage(totalPages - 1)}
                className="rounded-lg border border-theme-border px-2.5 py-1.5 text-xs font-semibold text-theme-text-secondary disabled:opacity-40 hover:bg-theme-elevated"
              >
                末页
              </button>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
