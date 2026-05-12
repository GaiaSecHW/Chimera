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
  FirmwareEvolutionSessionIndex,
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
import { useUiFeedback } from '../../components/UiFeedback';
import { hasBinarySecurityReturnTarget, navigateBackByTaskOrigin, navigateBackToBinarySecurityTask } from '../../utils/executionReturnContext';
import { TaskOriginCard, TaskOriginInline } from './taskOrigin';
import { AgentSessionViewer } from './AgentSessionViewer';
import { DownstreamTaskCreator } from './DownstreamTaskCreator';
import { blobToText, buildFirmwareSessionMeta, buildSessionSnapshotFromText, FirmwareSessionIndexItem, normalizeFirmwareSessionIndex, parseSessionJsonlDelta } from './sessionParsing';

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
  { value: 'retry_preparing', label: '重试准备中' },
  { value: 'running', label: '运行中' },
  { value: 'cancelling', label: '取消中' },
  { value: 'cancelled', label: '已取消' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' },
];
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const FILESERVER_CONTAINER_ROOT = '/data/files';
const TASK_WORKSPACE_SEGMENT = 'app/secflow-app-firmware-unpacker';
type DetailTab = 'overview' | 'metrics' | 'events' | 'session' | 'evolution' | 'result';

function sameJsonValue(left: unknown, right: unknown) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function buildWorkspacePreview(projectId: string, taskId = '<task-id>') {
  const base = `${FILESERVER_CONTAINER_ROOT}/${projectId}/${TASK_WORKSPACE_SEGMENT}/${taskId}`;
  return {
    input: `${base}/input`,
    output: `${base}/output`,
    run: `${base}/run`,
  };
}

function deriveRunPath(outputPath: string) {
  const normalized = String(outputPath || '').replace(/\/+$/, '');
  if (!normalized) return '';
  if (normalized.endsWith('/output')) {
    return `${normalized.slice(0, -'/output'.length)}/run`;
  }
  return '';
}

function fmtTime(iso: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('zh-CN', { hour12: false });
}

function fmtDuration(s: string | null, e: string | null) {
  if (!s) return '-';
  const ms = (e ? new Date(e).getTime() : Date.now()) - new Date(s).getTime();
  const sec = Math.round(ms / 1000);
  return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m${sec % 60}s`;
}

function formatSeconds(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return '-';
  const value = Math.max(0, Math.round(seconds));
  if (value < 60) return `${value}s`;
  if (value < 3600) return `${Math.floor(value / 60)}m${value % 60}s`;
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return `${hours}h${minutes}m`;
}

function fmtPercent(used: number | null, limit: number | null, unitSuffix = '') {
  if (used == null || limit == null || limit <= 0) return '-';
  const percent = Math.max(0, (used / limit) * 100);
  return `${percent.toFixed(percent >= 10 ? 1 : 2)}%${unitSuffix}`;
}

function extractFsRelPath(outputPath: string, projectId: string): string | null {
  const prefix = `/data/files/${projectId}`;
  if (!outputPath.startsWith(prefix)) return null;
  const rel = outputPath.slice(prefix.length).replace(/\/+$/, '');
  return rel.startsWith('/') ? rel : `/${rel}`;
}

function normalizeJoinPath(basePath: string, relativePath: string): string {
  const base = basePath.replace(/\/+$/, '');
  const relative = relativePath.replace(/^\/+/, '');
  return `${base}/${relative}`;
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
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
  return `$${value.toFixed(value < 0.01 ? 6 : 4)}`;
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
  if (['review_passed', 'success', 'completed'].includes(raw)) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (['review_failed'].includes(raw)) return 'border-amber-200 bg-amber-50 text-amber-700';
  if (['failed', 'error'].includes(raw)) return 'border-red-200 bg-red-50 text-red-700';
  if (['running', 'active'].includes(raw)) return 'border-blue-200 bg-blue-50 text-blue-700';
  if (['cancelled', 'cancelling'].includes(raw)) return 'border-slate-200 bg-slate-50 text-slate-600';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function inferTimelineTone(event: FirmwareTaskEvent) {
  return {
    icon: Sparkles,
    line: 'from-sky-200 via-blue-300 to-cyan-100',
    node: 'border-sky-200 bg-sky-50 text-sky-700',
    badge: 'border-sky-200 bg-sky-50 text-sky-700',
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
    return text.length > 160 ? `${text.slice(0, 160)}...` : text;
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
    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
        <Info size={12} />
        事件细节
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {rows.slice(0, 8).map((row) => (
          <div key={row.key} className="min-w-0 rounded-xl border border-white bg-white px-3 py-2 text-xs">
            <div className="font-bold text-slate-400">{row.label}</div>
            <div className="mt-1 break-all font-mono text-slate-700">{row.value}</div>
          </div>
        ))}
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-bold text-slate-500 hover:text-slate-800">
          查看原始 JSON
        </summary>
        <pre className="mt-2 max-h-48 overflow-auto rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs leading-6 text-slate-700">
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
  if (raw === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (raw === 'running') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (raw === 'pending') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (raw === 'failed') return 'border-red-200 bg-red-50 text-red-700';
  if (raw === 'cancelled') return 'border-slate-200 bg-slate-50 text-slate-600';
  return 'border-slate-200 bg-slate-50 text-slate-600';
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
      <div className="mb-1 flex items-center justify-between text-[11px] font-bold text-slate-500">
        <span>{label}</span>
        <span>{value == null || !Number.isFinite(value) ? '-' : `${percent.toFixed(percent >= 10 ? 1 : 2)}%`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${toneClass}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function TaskStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { icon: React.ReactNode; cls: string; label: string }> = {
    pending: { icon: <Clock size={12} />, cls: 'bg-amber-50 text-amber-700 border-amber-200', label: '排队中' },
    retry_preparing: { icon: <Loader2 size={12} className="animate-spin" />, cls: 'bg-indigo-50 text-indigo-700 border-indigo-200', label: '重试准备中' },
    running: { icon: <Loader2 size={12} className="animate-spin" />, cls: 'bg-blue-50 text-blue-700 border-blue-200', label: '运行中' },
    cancelling: { icon: <Loader2 size={12} className="animate-spin" />, cls: 'bg-orange-50 text-orange-700 border-orange-200', label: '取消中' },
    cancelled: { icon: <XCircle size={12} />, cls: 'bg-slate-50 text-slate-500 border-slate-200', label: '已取消' },
    success: { icon: <CheckCircle2 size={12} />, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: '成功' },
    failed: { icon: <XCircle size={12} />, cls: 'bg-red-50 text-red-700 border-red-200', label: '失败' },
    max_retries_reached: { icon: <XCircle size={12} />, cls: 'bg-red-50 text-red-700 border-red-200', label: '超限' },
  };
  const { icon, cls, label } = cfg[status] ?? { icon: null, cls: 'bg-slate-50 text-slate-500', label: status };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${cls}`}>
      {icon} {label}
    </span>
  );
}

function RoundDetailMetricCard({ label, value, hint }: { label: string; value: string; hint?: string | null }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-2 text-xl font-black text-slate-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}

function RoundDetailField({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
      <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</div>
      <div className={`mt-1 text-sm text-slate-700 ${mono ? 'break-all font-mono text-[12px]' : ''}`}>{value}</div>
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
        <span className={round.reviewer.passed ? 'font-bold text-emerald-700' : 'font-bold text-amber-700'}>
          {round.reviewer.passed ? '通过' : '未通过'}
        </span>
      )
    : (agent.status || '-');
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-black text-slate-900">{title}</div>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${kind === 'reviewer' ? (round.reviewer.passed ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700') : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
          {statusNode}
        </span>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <RoundDetailField label="耗时" value={formatSeconds(agent.duration_seconds)} />
        <RoundDetailField label="角色" value={agent.provider_role || round.context.provider_role || '-'} />
        <RoundDetailField label="会话文件" value={agent.session_file || '-'} mono />
        <RoundDetailField label="状态" value={kind === 'reviewer' ? statusNode : (agent.status || '-')} />
      </div>
      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">摘要</div>
        <div className="mt-2 text-sm leading-6 text-slate-700">{preview || '暂无摘要'}</div>
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
      <div className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-600">Round Detail</p>
            <h3 className="mt-2 text-xl font-black text-slate-900">轮次 #{round.round} 结果详情</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${roundStatusTone(round.status)}`}>{roundStatusLabel(round.status)}</span>
              {round.context.fallback_to_llm ? <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-bold text-blue-700">回退 LLM</span> : null}
              {round.context.matched_skill ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">{round.context.matched_skill}</span> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
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

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-black text-slate-900">策略与来源</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <RoundDetailField label="命中工具" value={round.context.matched_skill || '-'} />
              <RoundDetailField label="回退到 LLM" value={round.context.fallback_to_llm ? '是' : '否'} />
              <RoundDetailField label="Provider Role" value={round.context.provider_role || '-'} />
              <RoundDetailField label="基线轮次" value={round.output_delta.baseline_round == null ? '-' : `#${round.output_delta.baseline_round}`} />
            </div>
            {round.source_path ? (
              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">results.json 路径</div>
                <div className="mt-2 break-all font-mono text-[12px] text-slate-700">{round.source_path}</div>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black text-slate-900">工作与评审总结</div>
                <div className="mt-1 text-xs text-slate-500">默认展示结构化摘要，原始 JSON 仅作为额外信息折叠查看</div>
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
                      className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                      {tab.label}
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] ${active ? 'bg-white/15 text-slate-100' : 'bg-slate-100 text-slate-500'}`}>
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
              <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-slate-900">{activeSummaryTitle}</div>
                    <div className="mt-1 text-xs text-slate-500">Markdown 解析视图，适合直接阅读完整内容</div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-bold text-slate-600">状态：{activeSummaryMeta.status}</span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-bold text-slate-600">耗时：{activeSummaryMeta.duration}</span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-bold text-slate-600">角色：{activeSummaryMeta.role}</span>
                  </div>
                </div>
                <div className="mt-4 rounded-[1.5rem] border border-slate-200 bg-white p-5">
                  <div className="mb-3 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">会话文件</div>
                  <div className="break-all font-mono text-[12px] text-slate-600">{activeSummaryMeta.session}</div>
                  <article className="prose prose-slate mt-5 max-w-none text-sm leading-7 prose-headings:font-black prose-headings:text-slate-900 prose-p:text-slate-700 prose-li:text-slate-700">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {activeSummaryText}
                    </ReactMarkdown>
                  </article>
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm font-black text-slate-900">产物快照</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <RoundDetailField label="输出文件数" value={String(round.output_snapshot.output_file_count)} />
                <RoundDetailField label="输出目录数" value={String(round.output_snapshot.output_dir_count)} />
                <RoundDetailField label="总大小" value={formatBytes(round.output_snapshot.output_total_size_bytes)} />
                <RoundDetailField label="最大文件" value={formatBytes(round.output_snapshot.largest_file_size_bytes)} />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm font-black text-slate-900">文档与告警</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <RoundDetailField label="总结文档" value={round.artifacts.summary_present ? '已生成' : '未生成'} />
                <RoundDetailField label="改进文档" value={round.artifacts.reason_present ? '已生成' : '未生成'} />
              </div>
              {round.artifacts.warnings.length > 0 ? (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.12em] text-amber-700">告警</div>
                  <div className="mt-2 space-y-2 text-sm text-amber-800">
                    {round.artifacts.warnings.map((warning, index) => (
                      <div key={`${warning}-${index}`} className="rounded-xl border border-amber-200 bg-white/60 px-3 py-2">
                        {warning}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          </div>

          <details className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <summary className="cursor-pointer text-sm font-black text-slate-700">
              查看原始 results.json
            </summary>
            <pre className="mt-3 max-h-[420px] overflow-auto rounded-2xl bg-slate-950 px-4 py-4 text-[12px] leading-6 text-slate-100 whitespace-pre-wrap break-words">
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
    pending: 'bg-slate-100 text-slate-500',
    running: 'bg-blue-100 text-blue-700',
    success: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-red-100 text-red-700',
    skipped: 'bg-amber-100 text-amber-700',
  };
  const labels: Record<string, string> = {
    pending: '待执行',
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
  const running = !isTerminal(task.status);

  return (
    <div
      className={`cursor-pointer rounded-xl border transition-colors ${
        active
          ? 'border-blue-300 bg-blue-50/50 shadow-sm'
          : selected
            ? 'border-slate-300 bg-slate-50/70'
            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80'
      }`}
      onClick={() => onOpenDetail(task.id)}
    >
      <div
        className="flex items-center gap-2 px-3 py-3"
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => {
            e.stopPropagation();
            onSelect(task.id, e.target.checked);
          }}
          onClick={(e) => e.stopPropagation()}
          className="rounded border-slate-300 text-blue-600"
        />
        <TaskStatusBadge status={task.status} />
        <span className="flex-1 min-w-0 truncate font-mono text-xs text-slate-600">{task.firmware_path}</span>
        <div onClick={(e) => e.stopPropagation()} className="hidden 2xl:block max-w-[240px] overflow-hidden">
          <TaskOriginInline origin={task} compact />
        </div>
        {task.worker_id && (
          <span className="hidden xl:inline max-w-[120px] truncate text-[10px] text-slate-400">{task.worker_id}</span>
        )}
        {running && <Loader2 size={11} className="shrink-0 animate-spin text-blue-400" />}
        <span className="hidden lg:inline shrink-0 text-[10px] text-slate-500">{fmtDuration(task.started_at, task.completed_at)}</span>
        <span className="shrink-0 text-[10px] text-slate-400">{fmtTime(task.created_at)}</span>
        <ChevronRight size={14} className={`shrink-0 text-slate-400 transition-transform ${active ? 'translate-x-0.5 text-blue-500' : ''}`} />
      </div>
    </div>
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
  resultRefreshingTaskId: string;
  onActiveTabChange?: (tab: DetailTab) => void;
  refreshRequest?: number;
}) {
  const fileserverApi = api.domains.assets.fileserver;
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [activeResultDoc, setActiveResultDoc] = useState<'summary' | 'reason'>('summary');
  const [timeline, setTimeline] = useState<FirmwareTaskEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState('');
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
  const [evolutionSessions, setEvolutionSessions] = useState<FirmwareEvolutionSessionIndex | null>(null);
  const [evolutionDetailLoading, setEvolutionDetailLoading] = useState(false);
  const [evolutionDetailError, setEvolutionDetailError] = useState('');
  const [evolutionSubmitting, setEvolutionSubmitting] = useState(false);
  const [evolutionLogModalOpen, setEvolutionLogModalOpen] = useState(false);
  const [evolutionLogModalTitle, setEvolutionLogModalTitle] = useState('');
  const [evolutionLog, setEvolutionLog] = useState<FirmwareTaskLog | null>(null);
  const [evolutionLogLoading, setEvolutionLogLoading] = useState(false);
  const sessionSocketRef = useRef<WebSocket | null>(null);
  const lastRefreshRequestRef = useRef(refreshRequest ?? 0);

  const closeSessionSocket = useCallback(() => {
    if (sessionSocketRef.current) {
      sessionSocketRef.current.close();
      sessionSocketRef.current = null;
    }
    setSessionLive(false);
  }, []);

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
    if (!task?.output_path || !task?.project_id) return null;
    const runPath = deriveRunPath(task.output_path);
    if (!runPath) return null;
    return extractFsRelPath(`${runPath}/sessions/index.json`, task.project_id);
  }, [task?.output_path, task?.project_id]);

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
    if (!task?.project_id || !task?.output_path || !sessionFile) return;
    const runPath = deriveRunPath(task.output_path);
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
  }, [fileserverApi, task?.output_path, task?.project_id]);

  const loadEvolutionJobs = useCallback(async (options?: { silent?: boolean }) => {
    if (!task?.id) {
      setEvolutionJobs([]);
      setSelectedEvolutionJobId(null);
      setSelectedEvolutionJob(null);
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
      setEvolutionSessions(null);
      setEvolutionDetailError('');
      return;
    }
    if (!options?.silent) {
      setEvolutionDetailLoading(true);
      setEvolutionDetailError('');
    }
    try {
      const [job, sessionsPayload] = await Promise.all([
        fwApi.getEvolutionJob(jobId),
        fwApi.getEvolutionSessions(jobId).catch(() => ({ version: 1, session_root: null, items: [] })),
      ]);
      setSelectedEvolutionJob(job);
      setEvolutionSessions(sessionsPayload);
    } catch (e: any) {
      if (!options?.silent) {
        setSelectedEvolutionJob(null);
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
    if (activeTab === 'metrics') void loadMetrics();
    if (activeTab === 'events') void loadTimeline();
    if (activeTab === 'result') void loadResult();
    if (activeTab === 'session') void loadSessions();
    if (activeTab === 'evolution') void loadEvolutionJobs();
  }, [activeTab, loadEvolutionJobs, loadMetrics, loadResult, loadSessions, loadTimeline, onRefresh, task?.id]);

  useEffect(() => {
    setActiveTab('overview');
    setTimeline([]);
    setTimelineError('');
    setTimelineLoading(false);
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
    setEvolutionSessions(null);
    setEvolutionDetailLoading(false);
    setEvolutionDetailError('');
    setEvolutionSubmitting(false);
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
    if (activeTab !== 'session' || !selectedSessionPath || !selectedSessionItem || !task?.project_id || !task?.output_path) return;
    if (selectedSessionItem.status !== 'running' || !['pending', 'running', 'cancelling'].includes(task.status)) {
      setSessionLive(false);
      return;
    }
    const sessionAbsPath = normalizeJoinPath(`${deriveRunPath(task.output_path)}/sessions`, selectedSessionPath);
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
      _key: event.id || `${event.event_type || 'event'}-${event.created_at || index}-${index}`,
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
  const canCreateEvolution = task.status === 'success' && !evolutionSubmitting && !evolutionJobs.some((item) => ['pending', 'running'].includes(item.status));
  const evolutionSessionItems = evolutionSessions?.items || [];

  if (!task) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-center">
          <div className="rounded-2xl bg-slate-100 p-4 text-slate-400">
            <ChevronRight size={22} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-700">选择任务查看详情</p>
            <p className="mt-1 text-xs text-slate-400">这里会展示解包任务的输入、输出目录、运行状态和日志摘要。</p>
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
        phase: `evolution:${role}:round_${round}`,
        message: e?.message || '加载进化日志失败',
      });
    } finally {
      setEvolutionLogLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <ArrowLeft size={16} />
          {hasReturnContext ? '返回原任务' : '返回任务列表'}
        </button>

        <div className="flex items-start justify-between gap-4">
          <div className="mt-4 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <TaskStatusBadge status={task.status} />
              {task.worker_id && (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-500">
                  {task.worker_id}
                </span>
              )}
            </div>
            <h3 className="mt-3 break-all text-lg font-black text-slate-900">{task.firmware_path}</h3>
            <p className="mt-2 break-all font-mono text-[11px] text-slate-500">{task.id}</p>
          </div>
          <button
            onClick={refreshCurrentDetail}
            className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
            title="刷新详情"
          >
            {loading || metricsLoading || timelineLoading || resultLoading || sessionsLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {canCancelTask(task.status) && (
            <button
              onClick={() => onCancel(task.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700 hover:bg-orange-100"
            >
              <Square size={13} /> 停止
            </button>
          )}
          {canRetry && (
            <button
              onClick={() => onRetry(task.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
            >
              <RotateCcw size={13} /> 重试
            </button>
          )}
          <DownstreamTaskCreator
            projectId={task.project_id || projectId}
            sourceKind="firmware_unpack"
            task={task}
            buttonClassName="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
          />
          {canDelete && (
            <button
              disabled={deletingTaskId === task.id}
              onClick={() => onDelete(task.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
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
        <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'overview' as const, label: '总览' },
              { id: 'metrics' as const, label: '观测' },
              { id: 'events' as const, label: '事件记录' },
              { id: 'session' as const, label: '智能体会话' },
              { id: 'evolution' as const, label: '自进化' },
              { id: 'result' as const, label: '结果' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-2xl px-5 py-3 text-sm font-black transition ${
                  activeTab === tab.id
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
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
                ['运行目录', <span className="font-mono break-all">{deriveRunPath(task.output_path) || '-'}</span>],
                ['创建时间', fmtTime(task.created_at)],
                ['开始时间', fmtTime(task.started_at)],
                ['完成时间', fmtTime(task.completed_at)],
                ['耗时', fmtDuration(task.started_at, task.completed_at)],
                ['AI 轮次', task.rounds ?? '-'],
              ].map(([label, value], index) => (
                <div key={index} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                  <div className="text-xs text-slate-700">{value}</div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">实时进展</p>
              {progressLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 size={13} className="animate-spin" /> 加载阶段进展中...
                </div>
              ) : !progress ? (
                <div className="text-xs text-slate-500">暂无阶段进展数据</div>
              ) : (
                <div className="space-y-3">
                  {progress.summary && (
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                      {progress.summary}
                    </div>
                  )}
                  <div className="overflow-x-auto pb-1">
                    <div className="relative flex min-w-[720px] items-start gap-0">
                      {progress.phases.map((phase, index) => {
                        const isCompleted = phase.status === 'success';
                        const isRunning = phase.status === 'running';
                        const isFailed = phase.status === 'failed';
                        const lineClass = isCompleted ? 'bg-emerald-400' : isFailed ? 'bg-red-300' : 'bg-slate-200';
                        const nodeClass = isCompleted
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-600'
                          : isRunning
                            ? 'border-blue-500 bg-blue-50 text-blue-600'
                            : isFailed
                              ? 'border-red-400 bg-red-50 text-red-600'
                              : phase.status === 'skipped'
                                ? 'border-amber-400 bg-amber-50 text-amber-600'
                                : 'border-slate-200 bg-white text-slate-400';
                        const textClass = isRunning
                          ? 'text-blue-600'
                          : isCompleted
                            ? 'text-emerald-600'
                            : isFailed
                              ? 'text-red-500'
                              : phase.status === 'skipped'
                                ? 'text-amber-600'
                                : 'text-slate-400';

                        return (
                          <div key={phase.key} className="relative flex-1">
                            {index < progress.phases.length - 1 ? (
                              <div className={`absolute left-1/2 top-4 h-0.5 w-full ${lineClass}`} />
                            ) : null}
                            <div className="relative z-10 flex flex-col items-center px-2 text-center">
                              <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold ${nodeClass}`}>
                                <PhaseNodeStatusIcon status={phase.status} index={index} />
                              </div>
                              <div className={`mt-2 px-1 ${textClass}`}>
                                <div className="text-xs font-semibold">{phase.label}</div>
                                <div className="mt-1 flex justify-center">
                                  <PhaseStatusBadge status={phase.status} />
                                </div>
                                <div className="mt-1 text-[10px] leading-tight text-slate-500">
                                  {phase.detail || '-'}
                                </div>
                                {phase.updated_at && (
                                  <div className="mt-1 text-[10px] text-slate-400">
                                    {fmtTime(phase.updated_at)}
                                  </div>
                                )}
                                <div className="mt-2 flex justify-center">
                                  <button
                                    type="button"
                                    onClick={() => onOpenPhaseLog(task.id, phase.key, phase.label)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
                                  >
                                    <Terminal size={11} /> 查看日志
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">资源使用情况</p>
              {resourceLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 size={13} className="animate-spin" /> 加载资源指标中...
                </div>
              ) : !resourceUsage?.available ? (
                <div className="text-xs text-slate-500">
                  {resourceUsage?.message || '暂无资源指标'}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <p className="text-[10px] text-slate-400">CPU 占用</p>
                      <p className="mt-1 text-sm font-bold text-slate-800">
                        {fmtPercent(resourceUsage.cpu_millicores, resourceUsage.pod_cpu_limit_millicores)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <p className="text-[10px] text-slate-400">内存占用</p>
                      <p className="mt-1 text-sm font-bold text-slate-800">
                        {fmtPercent(resourceUsage.memory_mib, resourceUsage.pod_memory_limit_mib)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {task.result_message && (
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">结果摘要</p>
                <div className="text-xs leading-6 text-slate-700">{task.result_message}</div>
              </div>
            )}

            {task.error_message && (
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-red-500">错误信息</p>
                <div className="break-all font-mono text-xs leading-6 text-red-700">{task.error_message}</div>
              </div>
            )}
          </>
        ) : null}

        {activeTab === 'metrics' ? (
          <section className="space-y-4">
            {metricsLoading ? (
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                <Loader2 size={14} className="animate-spin" />
                加载观测指标中...
              </div>
            ) : metricsError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                {metricsError}
              </div>
            ) : !metrics ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-400">
                暂无观测指标
              </div>
            ) : (
              <>
                <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
                        <Activity size={14} />
                        观测指标
                      </div>
                      <h2 className="mt-2 text-xl font-black text-slate-900">
                        {phaseDisplayLabel(metrics.task.current_stage || metrics.progress.current_phase)}
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        聚焦每轮执行、评审、Token、输出增长与运行健康状态。
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <TaskStatusBadge status={metrics.task.status} />
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${metrics.result.cache_available ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        结果缓存{metrics.result.cache_available ? '可用' : '缺失'}
                      </span>
                      {!metrics.result.cache_available ? (
                        <button
                          type="button"
                          onClick={() => onRefreshResultCache(task.id)}
                          disabled={resultRefreshingTaskId === task.id}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                          <RefreshCw size={13} className={resultRefreshingTaskId === task.id ? 'animate-spin' : ''} />
                          刷新缓存
                        </button>
                      ) : null}
                    </div>
                  </div>
                </section>

                {metrics.rounds.warnings.length > 0 ? (
                  <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-bold text-amber-800">
                      <AlertCircle size={16} />
                      部分轮次观测文件读取异常
                    </div>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-700">
                      {metrics.rounds.warnings.map((warning, index) => (
                        <li key={`${warning}-${index}`}>{warning}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                    <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                      <BarChart3 size={14} />
                      总轮数
                    </div>
                    <div className="mt-2 text-2xl font-black text-slate-900">{formatNumber(metrics.rounds.round_count)}</div>
                    <div className="mt-1 text-xs text-slate-500">完成 {metrics.rounds.completed_round_count} · 失败 {metrics.rounds.failed_round_count}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">当前 / 最新轮次</div>
                    <div className="mt-2 text-2xl font-black text-slate-900">
                      #{metrics.progress.current_round ?? metrics.rounds.running_round ?? metrics.rounds.latest_round ?? '-'}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">计划 {metrics.progress.total_rounds ?? '-'} 轮</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">总 Token</div>
                    <div className="mt-2 text-2xl font-black text-slate-900">{formatNumber(metrics.rounds.total_tokens)}</div>
                    <div className="mt-1 text-xs text-slate-500">Cost {formatCost(metrics.rounds.total_cost)}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">轮次总耗时</div>
                    <div className="mt-2 text-2xl font-black text-slate-900">{formatSeconds(metrics.rounds.total_duration_seconds)}</div>
                    <div className="mt-1 text-xs text-slate-500">输出增长 {formatBytes(metrics.rounds.output_growth_bytes)}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">当前输出文件</div>
                    <div className="mt-2 text-2xl font-black text-slate-900">{formatNumber(metrics.result.output_file_count)}</div>
                    <div className="mt-1 text-xs text-slate-500">目录 {metrics.result.output_dir_count} · {formatBytes(metrics.result.output_total_size_bytes)}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">最大文件</div>
                    <div className="mt-2 text-2xl font-black text-slate-900">{formatBytes(metrics.result.largest_file_size_bytes)}</div>
                    <div className="mt-1 text-xs text-slate-500">顶层条目 {metrics.result.top_level_entry_count}</div>
                  </div>
                </div>

                {!metrics.rounds.available ? (
                  <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                      <BarChart3 size={20} />
                    </div>
                    <div className="mt-4 text-base font-bold text-slate-800">当前任务尚未生成轮次观测指标</div>
                    <div className="mt-2 text-sm text-slate-500">任务至少完成一轮执行与评审后，会在 run/round_XXX/results.json 中生成观测数据。</div>
                  </section>
                ) : (
                  <>
                    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">轮次汇总</h2>
                          <p className="mt-1 text-xs text-slate-400">按轮次聚合执行、评审、Token 与 output 增长指标</p>
                        </div>
                        <div className="text-xs text-slate-500">
                          最新轮次：#{metrics.rounds.latest_round ?? '-'} · 最新输出 {latestRoundMetric ? formatBytes(latestRoundMetric.output_snapshot.output_total_size_bytes) : '-'}
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 xl:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-xs font-black text-slate-700">状态分布</div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {Object.entries(metrics.rounds.summary.status_counts).map(([status, count]) => (
                              <span key={status} className={`rounded-full border px-3 py-1 text-xs font-bold ${roundStatusTone(status)}`}>
                                {roundStatusLabel(status)} {count}
                              </span>
                            ))}
                          </div>
                        </div>
                        {Object.entries(metrics.rounds.summary.stage_summary).map(([stage, item]) => (
                          <div key={stage} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="text-xs font-black text-slate-700">{phaseDisplayLabel(stage)}</div>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-600">
                              <div>轮次 <span className="font-bold text-slate-900">{item.round_count}</span></div>
                              <div>耗时 <span className="font-bold text-slate-900">{formatSeconds(item.duration_seconds)}</span></div>
                              <div>Token <span className="font-bold text-slate-900">{formatNumber(item.token_total)}</span></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">轮次明细</h2>
                          <p className="mt-1 text-xs text-slate-400">展示每一轮执行和评审的产物、耗时、Token 与输出变化，点击行打开结构化轮次详情</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <div className="relative">
                            <Search size={13} className="pointer-events-none absolute left-3 top-2.5 text-slate-400" />
                            <input
                              value={roundKeywordFilter}
                              onChange={(event) => setRoundKeywordFilter(event.target.value)}
                              placeholder="搜索技能/摘要"
                              className="w-44 rounded-xl border border-slate-200 py-2 pl-8 pr-3 text-xs outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                            />
                          </div>
                          <select
                            value={roundStatusFilter}
                            onChange={(event) => setRoundStatusFilter(event.target.value)}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-300"
                          >
                            <option value="">全部状态</option>
                            {roundStatuses.map((status) => <option key={status} value={status}>{roundStatusLabel(status)}</option>)}
                          </select>
                          <select
                            value={roundReviewFilter}
                            onChange={(event) => setRoundReviewFilter(event.target.value)}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-300"
                          >
                            <option value="">全部评审</option>
                            <option value="passed">评审通过</option>
                            <option value="failed">评审未通过</option>
                          </select>
                          <select
                            value={roundFallbackFilter}
                            onChange={(event) => setRoundFallbackFilter(event.target.value)}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-300"
                          >
                            <option value="">全部策略</option>
                            <option value="yes">回退 LLM</option>
                            <option value="no">未回退 LLM</option>
                          </select>
                        </div>
                      </div>

                      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
                        <table className="min-w-[1180px] w-full text-left text-xs">
                          <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.14em] text-slate-400">
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
                          <tbody className="divide-y divide-slate-100">
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
                                  className="cursor-pointer bg-white transition hover:bg-slate-50"
                                >
                                  <td className="px-3 py-3 font-mono font-bold text-slate-800">#{round.round}</td>
                                  <td className="px-3 py-3">
                                    <span className={`rounded-full border px-2 py-0.5 font-bold ${roundStatusTone(round.status)}`}>{roundStatusLabel(round.status)}</span>
                                  </td>
                                  <td className="px-3 py-3 text-slate-600">{formatSeconds(round.duration_seconds)}</td>
                                  <td className="px-3 py-3 max-w-[180px] truncate text-slate-600">{round.executor.response_preview || round.executor.status || '-'}</td>
                                  <td className="px-3 py-3 max-w-[180px] truncate text-slate-600">
                                    <span className={round.reviewer.passed ? 'font-bold text-emerald-700' : 'font-bold text-amber-700'}>
                                      {round.reviewer.passed ? '通过' : '未通过'}
                                    </span>
                                    {round.reviewer.review_preview ? ` · ${round.reviewer.review_preview}` : ''}
                                  </td>
                                  <td className="px-3 py-3 text-slate-600">{round.output_snapshot.output_file_count} / {round.output_snapshot.output_dir_count}</td>
                                  <td className="px-3 py-3 font-mono text-slate-600">{formatBytes(round.output_snapshot.output_total_size_bytes)}</td>
                                  <td className="px-3 py-3 font-mono text-slate-600">{formatBytes(round.output_delta.size_bytes_delta)}</td>
                                  <td className="px-3 py-3 font-mono text-slate-600">{formatNumber(round.tokens.total)}</td>
                                  <td className="px-3 py-3 font-mono text-slate-600">{formatCost(round.tokens.cost)}</td>
                                  <td className="px-3 py-3 text-slate-600">
                                    <div className="flex flex-wrap gap-1">
                                      {round.context.fallback_to_llm ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">LLM</span> : null}
                                      {round.context.matched_skill ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">{round.context.matched_skill}</span> : null}
                                      {!round.context.fallback_to_llm && !round.context.matched_skill ? '-' : null}
                                    </div>
                                  </td>
                                  <td className="px-3 py-3 text-slate-600">{round.artifacts.warnings.length || '-'}</td>
                                </tr>
                              </React.Fragment>
                            ))}
                            {filteredRoundItems.length === 0 ? (
                              <tr>
                                <td colSpan={12} className="px-4 py-10 text-center text-sm text-slate-500">
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

                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">运行健康</h2>
                      <p className="mt-1 text-xs text-slate-400">只保留排障需要的任务、资源、事件和会话摘要</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {metricsHealthItems.map((item) => (
                        <span key={item.label} className={`rounded-full border px-3 py-1 text-xs font-bold ${item.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                          {item.label}：{item.hint}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-3">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <div className="text-xs font-black text-slate-700">任务</div>
                      <div className="mt-3 grid gap-2 text-xs text-slate-600">
                        <div className="flex justify-between gap-3"><span>Owner</span><span className="break-all text-right font-mono text-slate-800">{metrics.task.owner_id || '-'}</span></div>
                        <div className="flex justify-between gap-3"><span>运行耗时</span><span className="font-mono text-slate-800">{formatSeconds(metrics.task.running_seconds ?? metrics.task.duration_seconds)}</span></div>
                        <div className="flex justify-between gap-3"><span>最近进展</span><span className="font-mono text-slate-800">{fmtTime(metrics.task.last_progress_at)}</span></div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-black text-slate-700">资源</div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${metrics.resource.available ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {metrics.resource.available ? '可用' : '不可用'}
                        </span>
                      </div>
                      <div className="mt-3 space-y-3">
                        <MetricBar label="CPU" value={metrics.resource.cpu_usage_percent} tone={clampPercent(metrics.resource.cpu_usage_percent) >= 90 ? 'rose' : 'blue'} />
                        <MetricBar label="内存" value={metrics.resource.memory_usage_percent} tone={clampPercent(metrics.resource.memory_usage_percent) >= 90 ? 'rose' : 'emerald'} />
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <div className="text-xs font-black text-slate-700">事件与会话</div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="rounded-xl bg-white px-2 py-2"><div className="text-slate-400">事件</div><div className="mt-1 font-black text-slate-900">{formatNumber(metrics.events.event_count)}</div></div>
                        <div className="rounded-xl bg-white px-2 py-2"><div className="text-slate-400">会话</div><div className="mt-1 font-black text-slate-900">{formatNumber(metrics.sessions.session_count)}</div></div>
                        <div className="rounded-xl bg-white px-2 py-2"><div className="text-slate-400">运行</div><div className="mt-1 font-black text-blue-700">{formatNumber(metrics.sessions.running_session_count)}</div></div>
                      </div>
                      <div className="mt-3 truncate text-xs text-slate-500">
                        最近事件：{metrics.events.latest_event_type ? formatEventTypeLabel(metrics.events.latest_event_type) : '暂无'}
                      </div>
                    </div>
                  </div>
                  {metrics.health.warnings.length > 0 ? (
                    <div className="mt-4 grid gap-2 md:grid-cols-2">
                      {metrics.health.warnings.map((warning, index) => (
                        <div key={`${warning}-${index}`} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
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
          <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-900">事件记录</h2>
                <p className="mt-1 text-sm text-slate-500">紧凑展示后台记录的关键事件，点击详情查看结构化数据</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">总事件数</div>
                  <div className="mt-1 text-lg font-black text-slate-900">{timeline.length}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">展示区间</div>
                  <div className="mt-1 text-sm font-bold text-slate-700">
                    {timelineItems.length > 0 ? `${fmtTime(timelineItems[0].created_at)} -> ${fmtTime(timelineItems[timelineItems.length - 1].created_at)}` : '-'}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5">
              {timelineLoading ? (
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                  <Loader2 size={14} className="animate-spin" />
                  加载事件时间线中...
                </div>
              ) : timelineError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                  {timelineError}
                </div>
              ) : timelineItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-400">
                  暂无事件
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="min-w-[1080px] w-full divide-y divide-slate-100 text-left text-xs">
                      <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">
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
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {timelineItems.map((event) => {
                          const expanded = expandedEventKey === event._key;
                          const detailRows = eventDetailRows(event.detail);
                          return (
                            <React.Fragment key={event._key}>
                              <tr className="align-middle hover:bg-slate-50/80">
                                <td className="px-3 py-2 font-mono text-[11px] font-bold text-slate-400">#{event._index}</td>
                                <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] font-semibold text-slate-600">
                                  {fmtTime(event.created_at)}
                                </td>
                                <td className="px-3 py-2">
                                  <span className="inline-flex max-w-[150px] items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-black text-sky-700">
                                    <span className="truncate">{formatEventTypeLabel(event.event_type)}</span>
                                  </span>
                                </td>
                                <td className="px-3 py-2">
                                  {event.stage_key ? (
                                    <span className="inline-flex max-w-[110px] rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                                      <span className="truncate">{phaseDisplayLabel(event.stage_key)}</span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">-</span>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  {event.status ? (
                                    <span className={`inline-flex max-w-[90px] rounded-full border px-2 py-0.5 text-[11px] font-bold ${roundStatusTone(event.status)}`}>
                                      <span className="truncate">{event.status}</span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">-</span>
                                  )}
                                </td>
                                <td className="max-w-[360px] px-3 py-2">
                                  <div className="truncate font-bold text-slate-800" title={event.summary || '系统事件'}>
                                    {event.summary || '系统事件'}
                                  </div>
                                </td>
                                <td className="max-w-[176px] px-3 py-2 text-[11px] text-slate-500">
                                  <div className="truncate" title={event.created_by || '-'}>
                                    {event.created_by || '-'}
                                  </div>
                                  {event.owner_id ? (
                                    <div className="mt-0.5 truncate font-mono text-[10px] text-slate-400" title={event.owner_id}>
                                      {event.owner_id}
                                    </div>
                                  ) : null}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <button
                                    type="button"
                                    disabled={detailRows.length === 0}
                                    onClick={() => setExpandedEventKey(expanded ? null : event._key)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
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
            <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">会话列表</div>
                  <div className="mt-1 text-xs text-slate-500">{sessionItems.length} 个会话文件</div>
                </div>
                <button
                  type="button"
                  onClick={() => void loadSessions()}
                  className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                  title="刷新会话"
                >
                  <RefreshCw size={14} className={sessionsLoading ? 'animate-spin' : ''} />
                </button>
              </div>
              {sessionsError ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">{sessionsError}</div> : null}
              {sessionsLoading && sessions.length === 0 ? (
                <div className="mt-4 flex min-h-[240px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  加载会话中...
                </div>
              ) : sessions.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  暂无智能体会话
                </div>
              ) : (
                <div className="mt-4 max-h-[calc(100vh-20rem)] space-y-4 overflow-auto pr-1">
                  {groupedSessions.map(([group, items]) => (
                    <div key={group}>
                      <div className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{group}</div>
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
                                  ? 'border-slate-900 bg-slate-900 text-white shadow-[0_12px_30px_rgba(15,23,42,0.16)]'
                                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-black">{session.display_name}</div>
                                  <div className={`mt-1 text-[11px] ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
                                    {session.relative_path}
                                  </div>
                                </div>
                                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${
                                  indexItem?.status === 'running'
                                    ? selected ? 'bg-emerald-400/20 text-emerald-100' : 'bg-emerald-50 text-emerald-700'
                                    : selected ? 'bg-slate-700 text-slate-200' : 'bg-slate-200 text-slate-600'
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
                <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800 shadow-sm">
                  <div className="font-bold">会话文件存在部分异常行，已跳过不可解析内容</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-700">
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
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Manual Evolution</div>
                  <h4 className="mt-2 text-lg font-black text-slate-900">手动自进化</h4>
                  <p className="mt-2 text-sm text-slate-500">
                    主解包任务成功后，才允许单独发起工具进化。若主任务已命中工具，则基于备份副本进化；若未命中工具，则从进化器生成首个工具开始。进化任务不会改写主任务状态，只会独立产生日志、会话和覆盖结果。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCreateEvolutionClick}
                  disabled={!canCreateEvolution}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-500"
                >
                  {evolutionSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  进化
                </button>
              </div>
              {!canCreateEvolution ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  {task.status !== 'success'
                    ? '仅主解包任务 success 后允许发起进化。'
                    : evolutionJobs.some((item) => ['pending', 'running'].includes(item.status))
                      ? '当前已有 pending/running 进化任务，不能重复发起。'
                      : '当前条件不满足，暂不可发起进化。'}
                </div>
              ) : null}
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">最近一次状态</div>
                <div className="mt-3">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${evolutionStatusTone(activeEvolutionJob?.status)}`}>
                    {formatEvolutionStatus(activeEvolutionJob?.status)}
                  </span>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">轮次 / 阶段</div>
                <div className="mt-3 text-sm font-bold text-slate-800">
                  {activeEvolutionJob ? `${activeEvolutionJob.current_round ?? 0}/${activeEvolutionJob.max_rounds}` : '-'}
                </div>
                <div className="mt-1 text-xs text-slate-500">{evolutionStageLabel(activeEvolutionJob?.current_stage)}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">最终工具</div>
                <div className="mt-3 break-all font-mono text-xs text-slate-700">
                  {activeEvolutionJob?.final_skill_path || task.latest_evolution_final_skill_path || '-'}
                </div>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-black text-slate-900">历史任务列表</div>
                  {evolutionJobsLoading ? <Loader2 size={14} className="animate-spin text-slate-400" /> : null}
                </div>
                {evolutionJobsError ? (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-xs text-red-700">{evolutionJobsError}</div>
                ) : null}
                {!evolutionJobsLoading && evolutionJobs.length === 0 ? (
                  <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
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
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-mono text-xs">{job.id}</div>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                              selected ? 'border-white/20 bg-white/10 text-white' : evolutionStatusTone(job.status)
                            }`}>
                              {formatEvolutionStatus(job.status)}
                            </span>
                          </div>
                          <div className={`mt-2 text-xs ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
                            轮次 {job.current_round ?? 0}/{job.max_rounds} · {evolutionStageLabel(job.current_stage)}
                          </div>
                          <div className={`mt-1 text-[11px] ${selected ? 'text-slate-400' : 'text-slate-400'}`}>
                            {fmtTime(job.created_at)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-slate-900">最近一次进化状态</div>
                      <div className="mt-1 text-xs text-slate-500">展示当前选中进化任务的状态、起始方式和最终工具结果。</div>
                    </div>
                    {evolutionDetailLoading ? <Loader2 size={15} className="animate-spin text-slate-400" /> : null}
                  </div>
                  {evolutionDetailError ? (
                    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-xs text-red-700">{evolutionDetailError}</div>
                  ) : null}
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <RoundDetailField label="状态" value={formatEvolutionStatus(activeEvolutionJob?.status)} />
                    <RoundDetailField label="轮次" value={activeEvolutionJob ? `${activeEvolutionJob.current_round ?? 0}/${activeEvolutionJob.max_rounds}` : '-'} />
                    <RoundDetailField label="当前阶段" value={evolutionStageLabel(activeEvolutionJob?.current_stage)} />
                    <RoundDetailField label="评审是否通过" value={activeEvolutionJob?.review_passed ? '通过' : '未通过'} />
                    <RoundDetailField label="开始时间" value={fmtTime(activeEvolutionJob?.started_at || null)} />
                    <RoundDetailField label="完成时间" value={fmtTime(activeEvolutionJob?.completed_at || null)} />
                    <RoundDetailField label="起始方式" value={activeEvolutionJob?.started_without_matched_skill ? '从进化器生成首个工具' : '基于命中工具备份进化'} />
                    <RoundDetailField label="源工具" value={activeEvolutionJob?.source_skill_path || '-'} mono />
                    <RoundDetailField label="工作副本" value={activeEvolutionJob?.working_skill_path || '-'} mono />
                    <RoundDetailField label="覆盖目标" value={activeEvolutionJob?.replaced_skill_path || '-'} mono />
                    <RoundDetailField label="最终工具" value={activeEvolutionJob?.final_skill_path || '-'} mono />
                    <RoundDetailField label="是否生成新工具" value={activeEvolutionJob?.generated_new_skill ? '是' : '否'} />
                  </div>
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">错误信息</div>
                    <div className="mt-2 text-sm text-slate-700">{activeEvolutionJob?.error_message || '无'}</div>
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-sm font-black text-slate-900">轮次时间线</div>
                  {!activeEvolutionJob ? (
                    <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                      选择一条进化任务后查看轮次详情
                    </div>
                  ) : activeEvolutionJob.rounds.length === 0 ? (
                    <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                      当前进化任务暂未产出轮次记录
                    </div>
                  ) : (
                    <div className="mt-4 space-y-4">
                      {activeEvolutionJob.rounds.map((round) => (
                        <div key={round.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-black text-slate-900">第 {round.round} 轮</div>
                              <div className="mt-1 text-xs text-slate-500">
                                {fmtTime(round.created_at)} {'->'} {fmtTime(round.completed_at)}
                              </div>
                            </div>
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${roundStatusTone(round.status)}`}>
                              {roundStatusLabel(round.status)}
                            </span>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <RoundDetailField label="改进前工具" value={round.tool_skill_path_before || '-'} mono />
                            <RoundDetailField label="改进后工具" value={round.tool_skill_path_after || '-'} mono />
                            <RoundDetailField label="是否改动工具" value={round.tool_changed ? '是' : '否'} />
                            <RoundDetailField label="评审结果摘要" value={round.review_result || '-'} />
                          </div>
                          <div className="mt-4 grid gap-3 md:grid-cols-3">
                            <button
                              type="button"
                              onClick={() => handleOpenEvolutionLog(activeEvolutionJob.id, round.round, 'tool_executor')}
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                            >
                              <Terminal size={12} />
                              工具执行器日志
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEvolutionLog(activeEvolutionJob.id, round.round, 'reviewer')}
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                            >
                              <Terminal size={12} />
                              评审器日志
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEvolutionLog(activeEvolutionJob.id, round.round, 'evolver')}
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
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

                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-sm font-black text-slate-900">进化会话索引</div>
                  <div className="mt-1 text-xs text-slate-500">当前展示所选进化任务的 session 索引，便于定位工具执行器、评审器和工具进化器对话文件。</div>
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Session Root</div>
                    <div className="mt-1 break-all font-mono text-xs text-slate-700">{evolutionSessions?.session_root || '-'}</div>
                  </div>
                  {evolutionSessionItems.length === 0 ? (
                    <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                      暂无进化会话索引
                    </div>
                  ) : (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {evolutionSessionItems.map((item) => (
                        <div key={`${item.session_file}-${item.role}-${item.name}`} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-xs font-black text-slate-900">{item.role}/{item.name}</div>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${item.status === 'running' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                              {item.status === 'running' ? '运行中' : '历史'}
                            </span>
                          </div>
                          <div className="mt-2 text-[11px] text-slate-500">
                            轮次 {item.round ?? '-'} · 阶段 {evolutionStageLabel(item.phase)}
                          </div>
                          <div className="mt-2 break-all font-mono text-[11px] text-slate-700">{item.session_file}</div>
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
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
              >
                {resultRefreshingTaskId === task.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                刷新结果缓存
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">输出文件数</div>
                <div className="mt-2 text-2xl font-black text-slate-900">{result?.summary.output_file_count ?? 0}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">输出目录数</div>
                <div className="mt-2 text-2xl font-black text-slate-900">{result?.summary.output_dir_count ?? 0}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">输出大小</div>
                <div className="mt-2 text-2xl font-black text-slate-900">{formatBytes(result?.summary.output_total_size_bytes ?? 0)}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">顶层条目数</div>
                <div className="mt-2 text-2xl font-black text-slate-900">{result?.summary.top_level_entry_count ?? 0}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">最大文件大小</div>
                <div className="mt-2 text-2xl font-black text-slate-900">{formatBytes(result?.summary.largest_file_size_bytes ?? 0)}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">平均文件大小</div>
                <div className="mt-2 text-2xl font-black text-slate-900">{formatBytes(result?.summary.avg_file_size_bytes ?? 0)}</div>
              </div>
            </div>

            {resultLoading ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
                <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                  <Loader2 size={16} className="animate-spin" />
                  加载结果中...
                </div>
              </section>
            ) : resultError ? (
              <section className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700 shadow-sm">
                {resultError}
              </section>
            ) : !result?.available ? (
              <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500 shadow-sm">
                {result?.warnings?.[0] || '任务完成后可查看结果'}
              </section>
            ) : (
              <>
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">输出结构</div>
                      <div className="mt-1 text-sm text-slate-500">按 output 顶层条目聚合结果分布</div>
                    </div>
                    <div className="text-xs text-slate-400">按大小降序</div>
                  </div>
                  {result.summary.top_level_entries.length === 0 ? (
                    <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                      当前 output 目录为空
                    </div>
                  ) : (
                    <>
                      <div className="mt-4 overflow-x-auto">
                        <table className="min-w-full text-left text-sm text-slate-600">
                          <thead>
                            <tr className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                              <th className="px-3 py-2">名称</th>
                              <th className="px-3 py-2">类型</th>
                              <th className="px-3 py-2">文件数</th>
                              <th className="px-3 py-2">目录数</th>
                              <th className="px-3 py-2">总大小</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.summary.top_level_entries.slice(0, 8).map((entry) => (
                              <tr key={`${entry.kind}-${entry.name}`} className="border-t border-slate-100">
                                <td className="px-3 py-2 font-mono text-xs text-slate-700">{entry.name || '-'}</td>
                                <td className="px-3 py-2">{resultEntryKindLabel(entry.kind)}</td>
                                <td className="px-3 py-2">{entry.file_count}</td>
                                <td className="px-3 py-2">{entry.dir_count}</td>
                                <td className="px-3 py-2 font-bold text-slate-800">{formatBytes(entry.total_size_bytes)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {result.summary.top_level_entries.length > 8 ? (
                        <div className="mt-3 text-xs text-slate-500">
                          还有 {result.summary.top_level_entries.length - 8} 项未展开
                        </div>
                      ) : null}
                    </>
                  )}
                </section>

                <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">文件画像</div>
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">小文件 &lt; 4 KiB</div>
                          <div className="mt-2 text-xl font-black text-slate-900">{result.summary.small_file_count}</div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">中文件 4 KiB - 1 MiB</div>
                          <div className="mt-2 text-xl font-black text-slate-900">{result.summary.medium_file_count}</div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">大文件 ≥ 1 MiB</div>
                          <div className="mt-2 text-xl font-black text-slate-900">{result.summary.large_file_count}</div>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-4 lg:grid-cols-2">
                        <div>
                          <div className="text-xs font-black text-slate-500">扩展名分布</div>
                          {result.summary.file_extension_breakdown.length === 0 ? (
                            <div className="mt-3 text-sm text-slate-500">暂无统计数据</div>
                          ) : (
                            <div className="mt-3 space-y-2">
                              {result.summary.file_extension_breakdown.slice(0, 8).map((item) => (
                                <div key={item.extension} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                                  <span className="font-mono text-slate-700">{item.extension}</span>
                                  <span className="text-slate-500">{item.file_count} 个</span>
                                  <span className="font-bold text-slate-800">{formatBytes(item.total_size_bytes)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="text-xs font-black text-slate-500">最大文件 Top 10</div>
                          {result.summary.largest_files.length === 0 ? (
                            <div className="mt-3 text-sm text-slate-500">暂无统计数据</div>
                          ) : (
                            <div className="mt-3 space-y-2">
                              {result.summary.largest_files.map((item, index) => (
                                <div key={item.path} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="font-bold text-slate-500">#{index + 1}</span>
                                    <span className="font-bold text-slate-800">{formatBytes(item.size_bytes)}</span>
                                  </div>
                                  <div className="mt-1 break-all font-mono text-slate-700">{item.path}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">文本结果与关键路径</div>
                      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                        <div className="space-y-4">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
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
                                        ? 'border-slate-900 bg-slate-900 text-white'
                                        : doc.available
                                          ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                                          : 'border-slate-200 bg-slate-100 text-slate-400'
                                    }`}
                                  >
                                    <div>{doc.label}</div>
                                    <div className={`mt-1 text-[10px] ${selected ? 'text-slate-300' : doc.available ? 'text-slate-500' : 'text-slate-400'}`}>
                                      {doc.file} · {doc.available ? '已生成' : '未生成'}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>

                            {!resultDocumentState.hasSummary && !resultDocumentState.hasReason ? (
                              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
                                暂无结果文档
                              </div>
                            ) : !resultDocumentState.selectedText ? (
                              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
                                {resultDocumentState.selectedDoc === 'summary' ? '当前文档未生成' : '当前文档未生成'}
                              </div>
                            ) : (
                              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
                                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                                  {resultDocumentState.selectedDoc === 'summary' ? '报告总结' : '改进总结'}
                                </div>
                                <div className="mt-2 break-all font-mono text-[11px] text-slate-500">
                                  {resultDocumentState.selectedPath || '-'}
                                </div>
                                <div className="mt-4 prose prose-slate max-w-none text-sm">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{resultDocumentState.selectedText}</ReactMarkdown>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        <aside className="space-y-3 text-xs text-slate-600">
                          <div>
                            <div className="font-bold text-slate-500">output_root</div>
                            <div className="mt-1 break-all font-mono">{result.output_root || '-'}</div>
                          </div>
                          <div>
                            <div className="font-bold text-slate-500">run_root</div>
                            <div className="mt-1 break-all font-mono">{result.run_root || '-'}</div>
                          </div>
                          <div>
                            <div className="font-bold text-slate-500">largest_file</div>
                            <div className="mt-1 break-all font-mono">{result.summary.largest_file_path || '-'}</div>
                            <div className="mt-1 text-slate-400">{formatBytes(result.summary.largest_file_size_bytes)}</div>
                          </div>
                          <div>
                            <div className="font-bold text-slate-500">deepest_path</div>
                            <div className="mt-1 break-all font-mono">{result.summary.deepest_path?.path || '-'}</div>
                            <div className="mt-1 text-slate-400">depth: {result.summary.deepest_path?.depth ?? '-'}</div>
                          </div>
                        </aside>
                      </div>
                    </div>
                  </div>

                  <aside className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">运行统计</div>
                      <div className="mt-4 space-y-2 text-xs text-slate-600">
                        <div className="flex items-center justify-between gap-3"><span>状态</span><span className="font-bold text-slate-800">{result.status}</span></div>
                        <div className="flex items-center justify-between gap-3"><span>会话数</span><span className="font-bold text-slate-800">{result.summary.session_count}</span></div>
                        <div className="flex items-center justify-between gap-3"><span>事件数</span><span className="font-bold text-slate-800">{result.summary.event_count}</span></div>
                        <div className="flex items-center justify-between gap-3"><span>执行轮次</span><span className="font-bold text-slate-800">{result.summary.executor_rounds}</span></div>
                        <div className="flex items-center justify-between gap-3"><span>耗时</span><span className="font-bold text-slate-800">{result.summary.duration_seconds == null ? '-' : `${result.summary.duration_seconds}s`}</span></div>
                        <div className="flex items-center justify-between gap-3"><span>命中工具</span><span className="max-w-[180px] truncate font-bold text-slate-800">{result.summary.matched_skill || '-'}</span></div>
                        <div className="flex items-center justify-between gap-3"><span>回退到 LLM</span><span className="font-bold text-slate-800">{result.summary.fallback_to_llm ? '是' : '否'}</span></div>
                      </div>
                    </div>

                    {result.warnings.length > 0 ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">警告</div>
                        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-800">
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
          <div className="flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-600">Stage Log</p>
                <h3 className="mt-2 text-xl font-black text-slate-900">{logModalTitle}</h3>
                <p className="mt-1 text-xs text-slate-500">阶段标识：<span className="font-mono text-slate-600">{logModalPhase || '-'}</span></p>
              </div>
              <button
                type="button"
                onClick={onCloseLogModal}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 overflow-auto px-6 py-5">
              {taskLogLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 size={15} className="animate-spin" /> 加载日志中...
                </div>
              ) : !taskLog?.available ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  {taskLog?.message || '当前阶段日志不可用'}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">日志目录</p>
                      <p className="mt-1 break-all font-mono text-xs text-slate-700">{taskLog.run_path || '-'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">日志文件</p>
                      <p className="mt-1 break-all font-mono text-xs text-slate-700">{taskLog.files?.join(', ') || '-'}</p>
                    </div>
                  </div>
                  <pre className="min-h-[320px] overflow-auto rounded-2xl bg-slate-950 px-4 py-4 text-[12px] leading-6 text-slate-100 whitespace-pre-wrap break-words">{taskLog.log_text || taskLog.message || '暂无日志内容'}</pre>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {evolutionLogModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-6 backdrop-blur-sm">
          <div className="flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-600">Evolution Log</p>
                <h3 className="mt-2 text-xl font-black text-slate-900">{evolutionLogModalTitle}</h3>
              </div>
              <button
                type="button"
                onClick={() => setEvolutionLogModalOpen(false)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 overflow-auto px-6 py-5">
              {evolutionLogLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 size={15} className="animate-spin" /> 加载日志中...
                </div>
              ) : !evolutionLog?.available ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  {evolutionLog?.message || '当前阶段日志不可用'}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">日志目录</p>
                      <p className="mt-1 break-all font-mono text-xs text-slate-700">{evolutionLog.run_path || '-'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">日志文件</p>
                      <p className="mt-1 break-all font-mono text-xs text-slate-700">{evolutionLog.files?.join(', ') || '-'}</p>
                    </div>
                  </div>
                  <pre className="min-h-[320px] overflow-auto rounded-2xl bg-slate-950 px-4 py-4 text-[12px] leading-6 text-slate-100 whitespace-pre-wrap break-words">{evolutionLog.log_text || evolutionLog.message || '暂无日志内容'}</pre>
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
  const [activeTaskId, setActiveTaskId] = useState(() => initialTaskId.trim());
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
  const normalizedInitialTaskId = initialTaskId.trim();

  const [filterStatus, setFilterStatus] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterWorker, setFilterWorker] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
      if (currentSearch) query.search = currentSearch;
      const res = await fwApi.listTasks(query);
      setTasks((prev) => {
        let next = res.items;
        if (activeTaskId && !next.some((task) => task.id === activeTaskId)) {
          const activeFromPrev = prev.find((task) => task.id === activeTaskId);
          if (activeFromPrev) next = [activeFromPrev, ...next];
        }
        return sameJsonValue(prev, next) ? prev : next;
      });
      setTotal((prev) => prev === res.total ? prev : res.total);
    } catch (e: any) {
      if (!options?.silent) setListError(e?.message || '加载失败');
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [activeTaskId, page, pageSize, projectId, filterStatus, filterSearch, filterWorker]);

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
    if (hasRunning) {
      pollingRef.current = setInterval(() => {
        void fetchTasks(false, { silent: true });
        if (activeTaskId && activeTask && !isTerminal(activeTask.status)) {
          void refreshOne(activeTaskId, {
            showDetailLoading: false,
            refreshProgress: detailActiveTab === 'overview',
            refreshResource: detailActiveTab === 'overview',
          });
        }
      }, 5000);
    } else if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [activeTask, activeTaskId, detailActiveTab, fetchTasks, hasRunning, refreshOne]);

  useEffect(() => {
    fetchTasks(true);
    setSelected(new Set());
    const storedTaskId = normalizedInitialTaskId || sessionStorage.getItem('secflow:firmwareUnpackerTaskId')?.trim();
    if (storedTaskId) {
      sessionStorage.removeItem('secflow:firmwareUnpackerTaskId');
      setActiveTaskId(storedTaskId);
      setDetailActiveTab('overview');
    } else {
      setActiveTaskId('');
    }
  }, [projectId, normalizedInitialTaskId]);

  useEffect(() => {
    if (!normalizedInitialTaskId) return;
    setActiveTaskId(normalizedInitialTaskId);
    setDetailActiveTab('overview');
  }, [normalizedInitialTaskId]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.view !== 'pentest-exec-firmware-unpacker' && detail.view !== 'pentest-exec-firmware-task-list') return;
      const taskId = String(detail.firmwareUnpackerTaskId || detail.taskId || '').trim();
      if (!taskId) return;
      sessionStorage.removeItem('secflow:firmwareUnpackerTaskId');
      setActiveTaskId(taskId);
      setDetailActiveTab('overview');
    };
    window.addEventListener('secflow-navigate-view', handler as EventListener);
    return () => window.removeEventListener('secflow-navigate-view', handler as EventListener);
  }, []);

  useEffect(() => {
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
    if (!taskItems.some((task) => task.id === activeTaskId)) {
      void refreshOne(activeTaskId, {
        showDetailLoading: true,
        refreshProgress: false,
        refreshResource: false,
      });
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
      message: `确认删除 ${deletableIds.length} 条记录${runningCount > 0 ? `，并跳过 ${runningCount} 条运行中任务` : ''}？`,
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
          <div className="w-full max-w-2xl rounded-[2rem] border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-600">Firmware Unpacker</p>
                <h3 className="mt-2 text-2xl font-black text-slate-900">新建解包任务</h3>
                <p className="mt-2 text-sm text-slate-500">使用右上角当前项目，从该项目文件系统中选择待解包固件文件。</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCreateModalOpen(false);
                  setPickerOpen(false);
                }}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <form className="space-y-5 px-6 py-6" onSubmit={handleSubmit}>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm font-semibold text-slate-700">所属项目</p>
                <p className="mt-2 text-sm font-bold text-slate-900">{activeProject?.name || '未选择项目'}</p>
                <p className="mt-1 text-xs text-slate-500">
                  项目 ID: <span className="font-mono text-slate-600">{projectId || '-'}</span>
                </p>
              </div>

              <label className="block text-sm font-semibold text-slate-700">
                固件文件
                <div className="mt-2 flex gap-2">
                  <div className="relative flex-1">
                    <FolderOpen size={14} className="pointer-events-none absolute left-3 top-3.5 text-slate-400" />
                    <input
                      value={firmwarePath}
                      onChange={(e) => setFirmwarePath(e.target.value)}
                      placeholder={`${FILESERVER_CONTAINER_ROOT}/<project>/<subproject>/firmware.bin`}
                      className="w-full rounded-2xl border border-slate-200 py-3 pl-9 pr-4 text-sm font-mono text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
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
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <FolderOpen size={14} /> 选择文件
                  </button>
                </div>
                <span className="mt-2 block text-xs font-normal text-slate-500">支持手工输入路径，也支持从项目文件系统直接选择固件文件。</span>
              </label>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-sm font-semibold text-slate-700">任务工作目录</p>
                <p className="mt-2 text-xs leading-6 text-slate-500">
                  提交后会在当前项目根目录自动创建 `app/secflow-app-firmware-unpacker/&lt;task-id&gt;`，
                  并在其中生成 `input`、`output`、`run` 三个目录。`input` 目录中只会写入一份 JSON 清单，记录原始固件路径、
                  输出目录和运行日志目录，解包时直接使用原始固件文件。
                </p>
                <p className="mt-2 text-xs leading-6 text-slate-500">
                  当前任务使用的 LLM 配置会在提交时从“执行 → 参数配置 → LLM Role Binding”读取并冻结，执行过程中不会再跟随后续配置变更。
                </p>
                <div className="mt-3 space-y-2 text-xs">
                  <div>
                    <p className="font-semibold text-slate-500">input</p>
                    <p className="font-mono break-all text-slate-700">{workspacePreview?.input || '-'}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-500">output</p>
                    <p className="font-mono break-all text-slate-700">{workspacePreview?.output || '-'}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-500">run</p>
                    <p className="font-mono break-all text-slate-700">{workspacePreview?.run || '-'}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setCreateModalOpen(false);
                    setPickerOpen(false);
                  }}
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting || !projectId || !firmwarePath.trim()}
                  className="inline-flex items-center gap-1.5 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {submitting ? <><Loader2 size={14} className="animate-spin" />提交中...</> : <><Play size={14} />提交任务</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Package size={18} className="text-indigo-600" />
          <div>
            <h2 className="text-sm font-bold text-slate-800">
              {showingDetail ? '固件解包 · 任务详情' : '固件解包 · 任务列表'}
            </h2>
            {hasRunning && <p className="animate-pulse text-xs font-semibold text-blue-600">● 有任务运行中，每5秒自动刷新</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handlePageRefresh}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
          >
            {showingDetail ? (
              <>
                <RefreshCw size={12} /> 刷新详情
              </>
            ) : (
              <>
                <RefreshCw size={12} /> 刷新列表
              </>
            )}
          </button>
        </div>
      </div>

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
          resultRefreshingTaskId={resultRefreshingTaskId}
          onActiveTabChange={setDetailActiveTab}
          refreshRequest={detailRefreshRequest}
        />
      ) : (
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="grid grid-cols-4 gap-1 text-center">
            {[
              ['总计', total, 'text-slate-700'],
              ['运行', taskItems.filter((task) => task.status === 'running').length, 'text-blue-600'],
              ['成功', taskItems.filter((task) => task.status === 'success').length, 'text-emerald-600'],
              ['失败', taskItems.filter((task) => task.status === 'failed').length, 'text-red-600'],
            ].map(([label, count, color]) => (
              <div key={String(label)} className="rounded-xl bg-slate-50 py-1.5">
                <p className={`text-base font-black ${color}`}>{count}</p>
                <p className="text-[10px] text-slate-400">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <ListTodo size={14} className="shrink-0 text-violet-600" />
                <h3 className="text-lg font-black text-slate-900">任务列表</h3>
                <span className="text-sm font-normal text-slate-400">({total})</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {activeProject?.name ? `当前项目：${activeProject.name}` : projectId ? `当前项目 ID：${projectId}` : '当前未选择项目'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchTasks(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw size={12} /> 刷新列表
              </button>
              <button
                onClick={openCreateModal}
                disabled={!projectId}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
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
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>

            <div className="relative">
              <Search size={11} className="pointer-events-none absolute left-2.5 top-2 text-slate-400" />
              <input
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchTasks(true, { searchOverride: filterSearch })}
                placeholder="搜索固件路径..."
                className="w-44 rounded-lg border border-slate-200 bg-white py-1.5 pl-7 pr-8 text-xs text-slate-700 outline-none focus:border-blue-300"
              />
              {filterSearch && (
                <button
                  onClick={() => {
                    setFilterSearch('');
                    fetchTasks(true, { searchOverride: '' });
                  }}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
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
              className="w-36 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-300"
            />

            <button
              onClick={() => fetchTasks(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-white"
            >
              <Search size={11} /> 查询
            </button>

            {selected.size > 0 && (
              <button
                onClick={handleBatchDelete}
                className="ml-auto inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100"
              >
                <Trash2 size={11} /> 批量删除 ({selected.size})
              </button>
            )}
          </div>

          {listError && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle size={13} /> {listError}
            </div>
          )}

          {taskItems.length > 0 && (
            <div className="mb-2 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-1.5">
              <input
                type="checkbox"
                checked={selected.size === taskItems.length && taskItems.length > 0}
                onChange={(e) => toggleAll(e.target.checked)}
                className="rounded border-slate-300 text-blue-600"
              />
              <span className="text-xs text-slate-500">全选当前页 ({taskItems.length} 条)</span>
            </div>
          )}

          {!projectId ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-xs text-slate-400">
              请先在右上角选择项目，再查看该项目下的固件解包任务
            </div>
          ) : loading && taskItems.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 size={20} className="mr-2 animate-spin" /> 加载中...
            </div>
          ) : taskItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-xs text-slate-400">
              暂无任务记录
            </div>
          ) : (
            <div className="space-y-1.5">
              {taskItems.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  selected={selected.has(task.id)}
                  active={activeTaskId === task.id}
                  onSelect={toggleSelect}
                  onOpenDetail={setActiveTaskId}
                />
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <div className="text-xs text-slate-500">
              共 {total} 条，当前显示 {pageStart}-{pageEnd}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                每页
                <select
                  value={pageSize}
                  onChange={(e) => {
                    const nextSize = Number(e.target.value) || 20;
                    setPageSize(nextSize);
                    fetchTasks(true, { pageSizeOverride: nextSize });
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none"
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
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50"
              >
                首页
              </button>
              <button
                disabled={page === 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50"
              >
                上一页
              </button>
              <span className="min-w-16 text-center text-xs text-slate-500">{page + 1} / {totalPages}</span>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50"
              >
                下一页
              </button>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage(totalPages - 1)}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50"
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
