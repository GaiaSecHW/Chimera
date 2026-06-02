import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, BarChart3, CheckCircle2, ChevronDown, ChevronRight, Clock, FileText, Folder, Loader2, Package, Play, RefreshCw, RotateCcw, Search, Sparkles, Square, Terminal, Trash2, X, XCircle } from 'lucide-react';

import { api } from '../../clients/api';
import { FileWatchMessage } from '../../clients/fileserver';
import {
  FirmwareEvolutionJob,
  FirmwareRuntimeFileList,
  FirmwareEvolutionSessionIndex,
  FirmwareSessionIndexItem,
  FirmwareTaskEvent,
  FirmwareTaskLog,
  FirmwareRuntimeFilePreview,
  FirmwareUnpackTask,
} from '../../clients/firmwareUnpacker';
import { showConfirm } from '../../components/DialogService';
import { ExecutionTable, ExecutionTableHead, ExecutionTableTd, ExecutionTableTh, executionTableInteractiveRowClassName } from '../../components/execution/ExecutionTable';
import { useUiFeedback } from '../../components/UiFeedback';
import { AppSaSessionEvent, AppSaSessionMeta, AppSaSessionSnapshot } from '../../types/types';
import { AgentSessionViewer } from './AgentSessionViewer';
import { blobToText, buildFirmwareSessionMeta, buildSessionSnapshotFromText, parseSessionJsonlDelta } from './sessionParsing';

interface Props {
  projectId: string;
}

type DetailTab = 'overview' | 'metrics' | 'events' | 'session' | 'result';

const fwApi = api.domains.execution.firmwareUnpacker;
const TERMINAL = new Set(['success', 'failed', 'cancelled']);
const isTerminal = (status: string | null | undefined) => TERMINAL.has(String(status || ''));
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function sameJsonValue(left: unknown, right: unknown) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function fmtTime(iso: string | null | undefined) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('zh-CN', { hour12: false });
}

function fmtDuration(start: string | null | undefined, end: string | null | undefined) {
  if (!start) return '-';
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  const sec = Math.max(0, Math.round(ms / 1000));
  return fmtSeconds(sec);
}

function fmtSeconds(value: number | null | undefined) {
  const sec = Math.max(0, Math.round(Number(value ?? 0)));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m${sec % 60}s`;
  return `${Math.floor(sec / 3600)}h${Math.floor((sec % 3600) / 60)}m`;
}

function fmtToken(value: number | null | undefined) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num) || num <= 0) return '0';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(num >= 10_000_000 ? 1 : 2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(num >= 10_000 ? 1 : 2)}K`;
  return String(Math.round(num));
}

function basename(path: string | null | undefined) {
  const normalized = String(path || '').replace(/\/+$/, '');
  if (!normalized) return '-';
  const parts = normalized.split('/');
  return parts[parts.length - 1] || normalized;
}

function formatBytes(value?: number | null) {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  const digits = size >= 10 || index === 0 ? 0 : 1;
  return `${size.toFixed(digits)} ${units[index]}`;
}

type RuntimeTreeNode = {
  name: string;
  path: string;
  kind: string;
  sizeBytes: number;
  modifiedAt: string | null;
  children: RuntimeTreeNode[];
};

function inferRuntimePreviewMode(path: string, contentType: string) {
  const loweredPath = String(path || '').toLowerCase();
  const loweredType = String(contentType || '').toLowerCase();
  if (
    loweredType.startsWith('text/') ||
    loweredType.includes('json') ||
    loweredType.includes('xml') ||
    loweredType.includes('javascript') ||
    loweredType.includes('yaml') ||
    loweredPath.endsWith('.md') ||
    loweredPath.endsWith('.txt') ||
    loweredPath.endsWith('.log') ||
    loweredPath.endsWith('.json') ||
    loweredPath.endsWith('.yaml') ||
    loweredPath.endsWith('.yml') ||
    loweredPath.endsWith('.py') ||
    loweredPath.endsWith('.sh') ||
    loweredPath.endsWith('.conf') ||
    loweredPath.endsWith('.ini')
  ) {
    return 'text';
  }
  return 'binary';
}

function toHexView(bytes: Uint8Array) {
  const lines: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const chunk = bytes.slice(offset, offset + 16);
    const hex = Array.from(chunk).map((value) => value.toString(16).padStart(2, '0')).join(' ');
    const ascii = Array.from(chunk).map((value) => (value >= 32 && value <= 126 ? String.fromCharCode(value) : '.')).join('');
    lines.push(`${offset.toString(16).padStart(8, '0')}  ${hex.padEnd(16 * 3 - 1, ' ')}  ${ascii}`);
  }
  return lines.join('\n');
}

function buildRuntimeTree(items: FirmwareRuntimeFileList['items']): RuntimeTreeNode[] {
  const root: RuntimeTreeNode[] = [];
  const nodeMap = new Map<string, RuntimeTreeNode>();
  const ensureDirectory = (path: string) => {
    const normalized = String(path || '').replace(/^\/+|\/+$/g, '');
    if (!normalized) return null;
    const existing = nodeMap.get(normalized);
    if (existing) return existing;
    const parts = normalized.split('/');
    const name = parts[parts.length - 1] || normalized;
    const node: RuntimeTreeNode = { name, path: normalized, kind: 'dir', sizeBytes: 0, modifiedAt: null, children: [] };
    nodeMap.set(normalized, node);
    const parentPath = parts.slice(0, -1).join('/');
    const parent = parentPath ? ensureDirectory(parentPath) : null;
    if (parent) parent.children.push(node);
    else root.push(node);
    return node;
  };

  items.forEach((item) => {
    const normalized = String(item.path || '').replace(/^\/+|\/+$/g, '');
    if (!normalized) return;
    const parts = normalized.split('/');
    const name = parts[parts.length - 1] || normalized;
    if (item.kind === 'dir') {
      const dir = ensureDirectory(normalized);
      if (dir) {
        dir.sizeBytes = item.size_bytes;
        dir.modifiedAt = item.modified_at;
      }
      return;
    }
    const parentPath = parts.slice(0, -1).join('/');
    const parent = parentPath ? ensureDirectory(parentPath) : null;
    const node: RuntimeTreeNode = {
      name,
      path: normalized,
      kind: item.kind,
      sizeBytes: item.size_bytes,
      modifiedAt: item.modified_at,
      children: [],
    };
    nodeMap.set(normalized, node);
    if (parent) parent.children.push(node);
    else root.push(node);
  });

  const sortNodes = (nodes: RuntimeTreeNode[]) => {
    nodes.sort((left, right) => {
      const leftOrder = left.kind === 'dir' ? 0 : 1;
      const rightOrder = right.kind === 'dir' ? 0 : 1;
      return leftOrder - rightOrder || left.name.localeCompare(right.name, 'zh-CN');
    });
    nodes.forEach((node) => sortNodes(node.children));
  };
  sortNodes(root);
  return root;
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

function formatStatus(status: string | null | undefined) {
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

function statusTone(status: string | null | undefined) {
  const raw = String(status || '').toLowerCase();
  if (raw === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (raw === 'running') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (raw === 'pending') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (raw === 'failed') return 'border-red-200 bg-red-50 text-red-700';
  if (raw === 'cancelled') return 'border-slate-200 bg-slate-50 text-slate-600';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function stageLabel(stage: string | null | undefined) {
  const labels: Record<string, string> = {
    evolution_execute: '工具进化执行',
    tool_execute: '工具解包',
    review: '评审',
    evolve: '工具进化',
  };
  return labels[String(stage || '')] || (stage || '-');
}

function roundStatusLabel(status: string | null | undefined) {
  const raw = String(status || 'unknown');
  const labels: Record<string, string> = {
    review_passed: '评审通过',
    review_failed: '评审未通过',
    evolve_completed: '进化完成',
    tool_failed: '工具失败',
    success: '成功',
    failed: '失败',
    running: '运行中',
    cancelled: '已取消',
    unknown: '未知',
  };
  return labels[raw] || raw;
}

function roundStatusTone(status: string | null | undefined) {
  const raw = String(status || '').toLowerCase();
  if (['review_passed', 'success', 'completed'].includes(raw)) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (['review_failed', 'evolve_completed'].includes(raw)) return 'border-amber-200 bg-amber-50 text-amber-700';
  if (['failed', 'tool_failed', 'error'].includes(raw)) return 'border-red-200 bg-red-50 text-red-700';
  if (['running', 'active'].includes(raw)) return 'border-blue-200 bg-blue-50 text-blue-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function DetailField({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
      <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</div>
      <div className={`mt-1 text-sm text-slate-700 ${mono ? 'break-all font-mono text-[12px]' : ''}`}>{value}</div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: React.ReactNode; tone: string }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${tone}`}>
      <div className="text-[11px] font-black uppercase tracking-[0.14em] opacity-70">{label}</div>
      <div className="mt-2 text-2xl font-black">{value}</div>
    </div>
  );
}

function getEvolutionRoundMetrics(round: FirmwareEvolutionJob['rounds'][number]) {
  const metrics = round.metrics || {};
  const executorTokens = round.evolution_executor_tokens || metrics.evolution_executor_tokens || {};
  const reviewerTokens = round.reviewer_tokens || metrics.reviewer_tokens || {};
  const totalTokens = round.total_tokens || metrics.total_tokens || {};
  return {
    toolDurationSeconds: Number(round.tool_unpack_duration_seconds ?? metrics.tool_unpack_duration_seconds ?? 0),
    executorTokens,
    reviewerTokens,
    totalTokens,
    totalTokenCount: Number(totalTokens.total ?? 0),
    executorTokenCount: Number(executorTokens.total ?? 0),
    reviewerTokenCount: Number(reviewerTokens.total ?? 0),
  };
}

function buildEvolutionProgressPhases(job: FirmwareEvolutionJob) {
  const phases: Array<{
    key: string;
    label: string;
    detail: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    round?: number;
  }> = [];
  const maxRounds = Math.max(1, Number(job.max_rounds || 1));
  const currentRound = Math.max(0, Number(job.current_round || 0));
  const currentStage = String(job.current_stage || '');
  const roundByNumber = new Map((job.rounds || []).map((round) => [Number(round.round || 0), round]));

  for (let roundId = 1; roundId <= maxRounds; roundId += 1) {
    const round = roundByNumber.get(roundId);
    const beforeCurrent = roundId < currentRound;
    const isCurrent = roundId === currentRound;
    const roundPassed = round?.status === 'review_passed';
    const roundFailed = round?.status === 'failed' || round?.status === 'tool_failed';
    const roundRunning = round?.status === 'running';

    phases.push({
      key: `round_${roundId}_evolution_execute`,
      label: `第 ${roundId} 轮 · 工具进化执行`,
      detail: round?.tool_path_after || round?.tool_skill_path_after || (roundId === 1 && job.started_without_matched_skill ? '生成首个 working tool 并执行解包' : '执行或完善 working tool 后解包'),
      status: round
        ? (
            roundFailed
              ? 'failed'
              : (roundRunning && isCurrent && ['evolution_execute', 'tool_execute', 'evolve'].includes(currentStage) && !isTerminal(job.status))
                ? 'running'
                : 'completed'
          )
        : isCurrent && ['evolution_execute', 'tool_execute', 'evolve'].includes(currentStage) && !isTerminal(job.status)
          ? 'running'
          : beforeCurrent
            ? 'completed'
            : 'pending',
      round: roundId,
    });

    phases.push({
      key: `round_${roundId}_review`,
      label: `第 ${roundId} 轮 · 评审`,
      detail: round?.review_result ? round.review_result.slice(0, 120) : '评审解包完整性、工具可改进性和效率',
      status: round
        ? (
            roundPassed
              ? 'completed'
              : roundFailed
                ? 'failed'
                : (roundRunning && isCurrent && currentStage === 'review' && !isTerminal(job.status))
                  ? 'running'
                  : (roundRunning && isCurrent && ['evolution_execute', 'tool_execute', 'evolve'].includes(currentStage) && !isTerminal(job.status))
                    ? 'pending'
                    : 'completed'
          )
        : isCurrent && currentStage === 'review' && !isTerminal(job.status)
          ? 'running'
          : beforeCurrent
            ? 'completed'
            : 'pending',
      round: roundId,
    });

    if (roundPassed || (job.status === 'success' && isCurrent)) break;
  }

  if (job.status === 'success') {
    phases.push({
      key: 'publish',
      label: '发布工具结果',
      detail: job.final_tool_path || job.final_skill_path || '进化工具已生成',
      status: 'completed',
    });
  } else if (job.status === 'failed') {
    phases.push({
      key: 'failed',
      label: '进化结束',
      detail: job.error_message || '评审未通过或轮次耗尽',
      status: 'failed',
    });
  } else if (job.status === 'cancelled') {
    phases.push({
      key: 'cancelled',
      label: '进化结束',
      detail: '任务已手动结束',
      status: 'failed',
    });
  }
  return phases;
}

function progressStatusClass(status: string) {
  if (status === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'running') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === 'failed') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'skipped') return 'border-slate-200 bg-slate-50 text-slate-500';
  return 'border-slate-200 bg-slate-50 text-slate-400';
}

function progressStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: '未执行',
    running: '进行中',
    completed: '完成',
    failed: '失败',
    skipped: '跳过',
  };
  return labels[status] || status;
}

function CreateEvolutionModal({
  open,
  loading,
  sourceTasks,
  selectedTaskId,
  submitting,
  onClose,
  onSelectTask,
  onSubmit,
}: {
  open: boolean;
  loading: boolean;
  sourceTasks: FirmwareUnpackTask[];
  selectedTaskId: string;
  submitting: boolean;
  onClose: () => void;
  onSelectTask: (id: string) => void;
  onSubmit: () => void;
}) {
  const [keyword, setKeyword] = useState('');
  useEffect(() => {
    if (open) setKeyword('');
  }, [open]);
  const filtered = useMemo(() => {
    const value = keyword.trim().toLowerCase();
    if (!value) return sourceTasks;
    return sourceTasks.filter((task) => [task.id, task.firmware_path, task.output_path].join('\n').toLowerCase().includes(value));
  }, [keyword, sourceTasks]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/65 p-6 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col rounded-[2rem] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-600">Firmware Evolution</p>
            <h3 className="mt-2 text-2xl font-black text-slate-900">新建进化任务</h3>
            <p className="mt-2 text-sm text-slate-500">选择一个已 success 的固件解包任务作为进化源任务。</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
            <Search size={14} className="text-slate-400" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索解包任务 ID / 固件路径"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                <tr>
                  <th className="px-4 py-3">选择</th>
                  <th className="px-4 py-3">解包任务</th>
                  <th className="px-4 py-3">固件</th>
                  <th className="px-4 py-3">完成时间</th>
                  <th className="px-4 py-3">最近进化</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">加载 success 解包任务中...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">暂无可选 success 解包任务</td></tr>
                ) : filtered.map((task) => (
                  <tr key={task.id} onClick={() => onSelectTask(task.id)} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3"><input type="radio" checked={selectedTaskId === task.id} onChange={() => onSelectTask(task.id)} /></td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{task.id}</td>
                    <td className="px-4 py-3"><div className="max-w-[320px] truncate font-medium text-slate-800">{basename(task.firmware_path)}</div><div className="mt-1 max-w-[320px] truncate font-mono text-[11px] text-slate-400">{task.firmware_path}</div></td>
                    <td className="px-4 py-3 text-xs text-slate-500">{fmtTime(task.completed_at)}</td>
                    <td className="px-4 py-3"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusTone(task.latest_evolution_status)}`}>{task.latest_evolution_status ? formatStatus(task.latest_evolution_status) : '未进化'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-5">
          <button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">取消</button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting || !selectedTaskId}
            className="inline-flex items-center gap-1.5 rounded-2xl bg-amber-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {submitting ? <><Loader2 size={14} className="animate-spin" />提交中...</> : <><Play size={14} />提交进化任务</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export const FirmwareEvolutionCenterPage: React.FC<Props> = ({ projectId }) => {
  const { notify, feedbackNodes } = useUiFeedback();
  const fileserverApi = api.domains.assets.fileserver;
  const [jobs, setJobs] = useState<FirmwareEvolutionJob[]>([]);
  const [runtimeFiles, setRuntimeFiles] = useState<FirmwareRuntimeFileList | null>(null);
  const [runtimeFilesLoading, setRuntimeFilesLoading] = useState(false);
  const [runtimeFilesError, setRuntimeFilesError] = useState('');
  const [runtimeExpandedPaths, setRuntimeExpandedPaths] = useState<Set<string>>(new Set());
  const [runtimeSelectedPath, setRuntimeSelectedPath] = useState<string>('');
  const [runtimePreviewLoading, setRuntimePreviewLoading] = useState(false);
  const [runtimePreviewError, setRuntimePreviewError] = useState('');
  const [runtimePreviewText, setRuntimePreviewText] = useState('');
  const [runtimePreviewHex, setRuntimePreviewHex] = useState('');
  const [runtimePreviewMeta, setRuntimePreviewMeta] = useState<{ contentType: string; truncated: boolean; mode: 'text' | 'binary' | ''; size: number }>({
    contentType: '',
    truncated: false,
    mode: '',
    size: 0,
  });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [activeJobId, setActiveJobId] = useState('');
  const [activeJob, setActiveJob] = useState<FirmwareEvolutionJob | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [sourceTasks, setSourceTasks] = useState<FirmwareUnpackTask[]>([]);
  const [sourceTasksLoading, setSourceTasksLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createSourceTaskId, setCreateSourceTaskId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingJobId, setDeletingJobId] = useState('');
  const [events, setEvents] = useState<FirmwareTaskEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [sessions, setSessions] = useState<FirmwareEvolutionSessionIndex | null>(null);
  const [sessionItems, setSessionItems] = useState<FirmwareSessionIndexItem[]>([]);
  const [sessionMetas, setSessionMetas] = useState<AppSaSessionMeta[]>([]);
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
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [logModalTitle, setLogModalTitle] = useState('');
  const [logLoading, setLogLoading] = useState(false);
  const [logPayload, setLogPayload] = useState<FirmwareTaskLog | null>(null);
  const [replacing, setReplacing] = useState(false);
  const sessionSocketRef = useRef<WebSocket | null>(null);
  const notifyRef = useRef(notify);
  const runtimeRequestSeqRef = useRef(0);
  const detailLoadSeqRef = useRef(0);

  useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);

  const hasRunning = useMemo(() => jobs.some((job) => !isTerminal(job.status)), [jobs]);
  const stats = useMemo(() => ({
    total,
    running: jobs.filter((job) => job.status === 'running' || job.status === 'pending').length,
    success: jobs.filter((job) => job.status === 'success').length,
    failed: jobs.filter((job) => job.status === 'failed' || job.status === 'cancelled').length,
  }), [jobs, total]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showingDetail = Boolean(activeJobId);
  const runtimeItems = runtimeFiles?.items || [];
  const runtimeTree = useMemo(() => buildRuntimeTree(runtimeItems), [runtimeItems]);
  const selectedRuntimeItem = useMemo(
    () => runtimeItems.find((item) => item.path === runtimeSelectedPath) || null,
    [runtimeItems, runtimeSelectedPath],
  );
  const runtimeRootPath = useMemo(() => {
    if (showingDetail) {
      const candidate = String(activeJob?.run_root || '').trim();
      return candidate || '/data/secflow-app-firmware-unpacker';
    }
    return '/data/secflow-app-firmware-unpacker';
  }, [activeJob?.run_root, showingDetail]);
  const canConfirmReplacement = Boolean(
    activeJob
    && activeJob.status === 'success'
    && activeJob.replacement_required
    && !activeJob.replacement_confirmed
    && activeJob.final_tool_path
    && !replacing,
  );
  const sessionRoot = sessions?.session_root || activeJob?.session_root || null;
  const groupedSessions = useMemo(() => {
    const groups = new Map<string, AppSaSessionMeta[]>();
    sessionMetas.forEach((item) => {
      const list = groups.get(item.stage_group || '未分类') || [];
      list.push(item);
      groups.set(item.stage_group || '未分类', list);
    });
    return Array.from(groups.entries());
  }, [sessionMetas]);
  const selectedSessionMeta = useMemo(
    () => sessionMetas.find((item) => item.relative_path === selectedSessionPath) || null,
    [selectedSessionPath, sessionMetas],
  );
  const selectedSessionItem = useMemo(
    () => sessionItems.find((item) => item.session_file === selectedSessionPath) || null,
    [selectedSessionPath, sessionItems],
  );

  const closeSessionSocket = useCallback(() => {
    if (sessionSocketRef.current) {
      sessionSocketRef.current.close();
      sessionSocketRef.current = null;
    }
    setSessionLive(false);
  }, []);

  const fetchJobs = useCallback(async (resetPage = false, options?: { silent?: boolean }) => {
    if (!projectId) return;
    if (!options?.silent) {
      setLoading(true);
      setListError('');
    }
    const nextPage = resetPage ? 0 : page;
    if (resetPage) setPage(0);
    try {
      const res = await fwApi.listAllEvolutionJobs({
        project_id: projectId,
        status: filterStatus || undefined,
        search: filterSearch || undefined,
        limit: pageSize,
        offset: nextPage * pageSize,
      });
      setJobs((prev) => sameJsonValue(prev, res.items) ? prev : res.items);
      setTotal(res.total || 0);
    } catch (e: any) {
      if (!options?.silent) setListError(e?.message || '加载进化任务失败');
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [filterSearch, filterStatus, page, pageSize, projectId]);

  const handleRefreshList = useCallback(async () => {
    await fetchJobs(false);
  }, [fetchJobs]);

  const handleQueryList = useCallback(async () => {
    await fetchJobs(true);
  }, [fetchJobs]);

  const loadRuntimeFiles = useCallback(async () => {
    if (!projectId) return;
    const requestSeq = ++runtimeRequestSeqRef.current;
    setRuntimeFilesLoading(true);
    setRuntimeFilesError('');
    try {
      const payload = await fwApi.listRuntimeFiles(projectId, 2000, runtimeRootPath);
      if (runtimeRequestSeqRef.current !== requestSeq) return;
      setRuntimeFiles(payload);
      setRuntimeExpandedPaths((current) => {
        if (current.size > 0) return current;
        const initial = new Set<string>();
        payload.items
          .filter((item) => item.kind === 'dir')
          .slice(0, 12)
          .forEach((item) => {
            const parent = String(item.path || '').split('/').slice(0, -1).join('/');
            if (!parent || !parent.includes('/')) initial.add(String(item.path || ''));
          });
        return initial;
      });
      setRuntimeSelectedPath((current) => current || payload.items.find((item) => item.kind !== 'dir')?.path || payload.items[0]?.path || '');
    } catch (e: any) {
      if (runtimeRequestSeqRef.current !== requestSeq) return;
      const message = e?.message || '加载运行时文件失败';
      setRuntimeFilesError(message);
      notifyRef.current(`加载运行时文件失败: ${message}`, 'error');
    } finally {
      if (runtimeRequestSeqRef.current === requestSeq) {
        setRuntimeFilesLoading(false);
      }
    }
  }, [projectId, runtimeRootPath]);

  const refreshJobDetail = useCallback(async (jobId: string, options?: { silent?: boolean }) => {
    if (!jobId) return;
    const requestSeq = ++detailLoadSeqRef.current;
    if (!options?.silent) {
      setDetailLoading(true);
      setDetailError('');
    }
    try {
      const [job, rounds] = await Promise.all([
        fwApi.getEvolutionJob(jobId),
        fwApi.getEvolutionRounds(jobId).catch(() => null),
      ]);
      const mergedJob = rounds && rounds.length > 0
        ? {
          ...job,
          rounds,
          round_count: rounds.length,
        }
        : job;
      if (detailLoadSeqRef.current !== requestSeq) return;
      setActiveJob((prev) => sameJsonValue(prev, mergedJob) ? prev : mergedJob);
      setJobs((prev) => prev.map((item) => item.id === mergedJob.id ? mergedJob : item));
    } catch (e: any) {
      if (detailLoadSeqRef.current !== requestSeq) return;
      setDetailError(e?.message || '加载进化任务详情失败');
      notify(`加载进化任务详情失败: ${e?.message || e}`, 'error');
    } finally {
      if (!options?.silent && detailLoadSeqRef.current === requestSeq) setDetailLoading(false);
    }
  }, [notify]);

  const loadSourceTasks = useCallback(async () => {
    if (!projectId) return;
    setSourceTasksLoading(true);
    try {
      const res = await fwApi.listTasks({ project_id: projectId, status: 'success', limit: 200 });
      setSourceTasks(res.items || []);
    } catch (e: any) {
      notify(`加载 success 解包任务失败: ${e?.message || e}`, 'error');
    } finally {
      setSourceTasksLoading(false);
    }
  }, [notify, projectId]);

  const loadEvents = useCallback(async () => {
    if (!activeJob?.task_id) return;
    setEventsLoading(true);
    try {
      const res = await fwApi.getTaskEvents(activeJob.task_id, 200);
      setEvents((res.items || []).filter((item) => String(item.event_type || '').startsWith('evolution_') || item.stage_key === 'evolution'));
    } catch (e: any) {
      notify(`加载事件记录失败: ${e?.message || e}`, 'error');
    } finally {
      setEventsLoading(false);
    }
  }, [activeJob?.task_id, notify]);

  const loadSessions = useCallback(async (options?: { silent?: boolean }) => {
    if (!activeJobId) return;
    if (!options?.silent) {
      setSessionsLoading(true);
      setSessionsError('');
    }
    setSessionError('');
    try {
      const payload = await fwApi.getEvolutionSessions(activeJobId);
      const items = payload.items || [];
      setSessions(payload);
      setSessionItems(items);
      setSessionMetas(items.map(buildFirmwareSessionMeta));
      setSelectedSessionPath((current) => {
        if (current && items.some((item) => item.session_file === current)) return current;
        const active = items.find((item) => item.status === 'running');
        return active?.session_file || items[0]?.session_file || null;
      });
    } catch (e: any) {
      setSessionsError(e?.message || '加载进化会话失败');
      setSessions({ version: 1, session_root: null, items: [] });
      setSessionItems([]);
      setSessionMetas([]);
      setSelectedSessionPath(null);
    } finally {
      if (!options?.silent) setSessionsLoading(false);
    }
  }, [activeJobId]);

  const loadSessionFile = useCallback(async (sessionFile: string) => {
    const jobProjectId = activeJob?.project_id || projectId;
    if (!jobProjectId || !sessionRoot || !sessionFile) return;
    const fsPath = extractFsRelPath(normalizeJoinPath(sessionRoot, sessionFile), jobProjectId)
      || extractFsRelPath(sessionFile, jobProjectId);
    if (!fsPath) {
      setSessionError('当前会话路径不在 fileserver 项目目录下');
      return;
    }
    setSessionLoading(true);
    setSessionError('');
    try {
      const blob = await fileserverApi.fetchProjectFilesystemPreviewBlob(jobProjectId, fsPath);
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
  }, [activeJob?.project_id, fileserverApi, projectId, sessionRoot]);

  const renderRuntimeTree = useCallback((nodes: RuntimeTreeNode[], depth = 0): React.ReactNode => nodes.map((node) => {
    const expanded = runtimeExpandedPaths.has(node.path);
    const selected = runtimeSelectedPath === node.path;
    const isDirectory = node.kind === 'dir';
    return (
      <div key={`${node.kind}:${node.path}`}>
        <button
          type="button"
          onClick={() => {
            if (isDirectory) {
              setRuntimeExpandedPaths((current) => {
                const next = new Set(current);
                if (next.has(node.path)) next.delete(node.path);
                else next.add(node.path);
                return next;
              });
            }
            setRuntimeSelectedPath(node.path);
          }}
          className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs transition ${selected ? 'bg-sky-50 text-sky-700' : 'text-slate-700 hover:bg-slate-50'}`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
        >
          {isDirectory ? (
            expanded ? <ChevronDown size={14} className="shrink-0 text-slate-400" /> : <ChevronRight size={14} className="shrink-0 text-slate-400" />
          ) : (
            <span className="w-[14px] shrink-0" />
          )}
          {isDirectory ? <Folder size={14} className="shrink-0 text-amber-600" /> : <FileText size={14} className="shrink-0 text-slate-500" />}
          <span className="min-w-0 flex-1 truncate font-mono">{node.name}</span>
          {!isDirectory ? <span className="shrink-0 text-[10px] text-slate-400">{formatBytes(node.sizeBytes)}</span> : null}
        </button>
        {isDirectory && expanded && node.children.length > 0 ? (
          <div>{renderRuntimeTree(node.children, depth + 1)}</div>
        ) : null}
      </div>
    );
  }), [runtimeExpandedPaths, runtimeSelectedPath]);

  useEffect(() => {
    void handleQueryList();
  }, [projectId]);

  useEffect(() => {
    void loadRuntimeFiles();
  }, [loadRuntimeFiles]);

  useEffect(() => {
    const selected = selectedRuntimeItem;
    if (!selected || selected.kind === 'dir') {
      setRuntimePreviewLoading(false);
      setRuntimePreviewError('');
      setRuntimePreviewText('');
      setRuntimePreviewHex('');
      setRuntimePreviewMeta({ contentType: '', truncated: false, mode: '', size: selected?.size_bytes || 0 });
      return;
    }
    let cancelled = false;
    const loadPreview = async () => {
      setRuntimePreviewLoading(true);
      setRuntimePreviewError('');
      try {
        const payload: FirmwareRuntimeFilePreview = await fwApi.fetchRuntimeFilePreviewBlob(selected.path, projectId, 262144, runtimeRootPath);
        if (cancelled) return;
        const mode = inferRuntimePreviewMode(selected.path, payload.contentType);
        if (mode === 'text') {
          const text = await payload.blob.text();
          if (cancelled) return;
          setRuntimePreviewText(text);
          setRuntimePreviewHex('');
        } else {
          const bytes = new Uint8Array(await payload.blob.arrayBuffer());
          if (cancelled) return;
          setRuntimePreviewText('');
          setRuntimePreviewHex(toHexView(bytes));
        }
        setRuntimePreviewMeta({
          contentType: payload.contentType,
          truncated: payload.truncated,
          mode,
          size: selected.size_bytes,
        });
      } catch (e: any) {
        if (cancelled) return;
        setRuntimePreviewError(e?.message || '加载文件预览失败');
        setRuntimePreviewText('');
        setRuntimePreviewHex('');
        setRuntimePreviewMeta({ contentType: '', truncated: false, mode: '', size: selected.size_bytes });
      } finally {
        if (!cancelled) setRuntimePreviewLoading(false);
      }
    };
    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [projectId, runtimeRootPath, runtimeSelectedPath, selectedRuntimeItem?.kind, selectedRuntimeItem?.modified_at, selectedRuntimeItem?.size_bytes]);

  useEffect(() => {
    void handleQueryList();
  }, [filterStatus, pageSize]);

  useEffect(() => {
    void fetchJobs(false);
  }, [page]);

  useEffect(() => {
    if (!hasRunning || showingDetail) return;
    const timer = window.setInterval(() => void fetchJobs(false, { silent: true }), 5000);
    return () => window.clearInterval(timer);
  }, [fetchJobs, hasRunning, showingDetail]);

  useEffect(() => {
    if (!activeJobId) {
      detailLoadSeqRef.current += 1;
      setActiveJob(null);
      setDetailError('');
      setRuntimeFiles(null);
      setRuntimeFilesError('');
      setRuntimeSelectedPath('');
      setRuntimeExpandedPaths(new Set());
      setRuntimePreviewText('');
      setRuntimePreviewHex('');
      setRuntimePreviewError('');
      setRuntimePreviewMeta({ contentType: '', truncated: false, mode: '', size: 0 });
      setEvents([]);
      setSessions(null);
      setSessionItems([]);
      setSessionMetas([]);
      setSelectedSessionPath(null);
      setSessionSnapshot(null);
      setSessionEvents([]);
      setSessionWarnings([]);
      setSessionError('');
      closeSessionSocket();
      return;
    }
    detailLoadSeqRef.current += 1;
    setDetailError('');
    setActiveTab('overview');
    void refreshJobDetail(activeJobId);
    // 只在切换详情任务时加载一次，避免 refreshJobDetail 引用变化导致详情页循环刷新。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJobId, closeSessionSocket]);

  useEffect(() => {
    runtimeRequestSeqRef.current += 1;
    setRuntimeFiles(null);
    setRuntimeFilesError('');
    setRuntimeSelectedPath('');
    setRuntimeExpandedPaths(new Set());
    setRuntimePreviewText('');
    setRuntimePreviewHex('');
    setRuntimePreviewError('');
    setRuntimePreviewMeta({ contentType: '', truncated: false, mode: '', size: 0 });
  }, [runtimeRootPath]);

  useEffect(() => {
    if (!activeJobId || !activeJob || isTerminal(activeJob.status)) return;
    const timer = window.setInterval(() => void refreshJobDetail(activeJobId, { silent: true }), 8000);
    return () => window.clearInterval(timer);
  }, [activeJob?.status, activeJobId, refreshJobDetail]);

  useEffect(() => {
    if (activeTab === 'events') void loadEvents();
    if (activeTab === 'session') void loadSessions();
  }, [activeTab, loadEvents, loadSessions]);

  useEffect(() => {
    if (activeTab !== 'session') {
      closeSessionSocket();
      return;
    }
    if (!activeJobId || !activeJob || isTerminal(activeJob.status)) return;
    const timer = window.setInterval(() => void loadSessions({ silent: true }), 12000);
    return () => window.clearInterval(timer);
  }, [activeJob?.status, activeJobId, activeTab, closeSessionSocket, loadSessions, activeJob]);

  useEffect(() => {
    if (activeTab !== 'session' || !selectedSessionPath) {
      if (activeTab !== 'session') {
        setSessionSnapshot(null);
        setSessionEvents([]);
        setSessionWarnings([]);
        setSessionError('');
      } else {
        setSessionSnapshot(null);
        setSessionEvents([]);
        setSessionWarnings([]);
      }
      return;
    }
    closeSessionSocket();
    void loadSessionFile(selectedSessionPath);
  }, [activeTab, closeSessionSocket, loadSessionFile, selectedSessionPath]);

  useEffect(() => {
    const jobProjectId = activeJob?.project_id || projectId;
    if (activeTab !== 'session' || !selectedSessionPath || !selectedSessionItem || !jobProjectId || !sessionRoot) return;
    if (selectedSessionItem.status !== 'running' || !activeJob || isTerminal(activeJob.status)) {
      setSessionLive(false);
      return;
    }
    const watchPath = extractFsRelPath(normalizeJoinPath(sessionRoot, selectedSessionPath), jobProjectId)
      || extractFsRelPath(selectedSessionPath, jobProjectId);
    if (!watchPath) {
      setSessionLive(false);
      setSessionError('当前会话路径不在 fileserver 项目目录下，无法实时监听');
      return;
    }
    closeSessionSocket();
    const socket = fileserverApi.openProjectFileWatchWebSocket(jobProjectId, watchPath, {
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
          if (parsed.warnings.length > 0) setSessionWarnings((current) => Array.from(new Set(current.concat(parsed.warnings))));
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
    activeJob,
    activeTab,
    closeSessionSocket,
    fileserverApi,
    loadSessionFile,
    projectId,
    selectedSessionItem,
    selectedSessionPath,
    sessionRoot,
    sessionWatchStartLine,
  ]);

  const openCreateModal = async () => {
    setCreateSourceTaskId('');
    setCreateModalOpen(true);
    await loadSourceTasks();
  };

  const handleCreate = async () => {
    if (!createSourceTaskId) return;
    setSubmitting(true);
    try {
      const sourceTask = sourceTasks.find((task) => task.id === createSourceTaskId);
      const result = await fwApi.createEvolutionJob(createSourceTaskId, sourceTask?.project_id || projectId);
      notify(`进化任务已提交：${result.job_id}`, 'success');
      setCreateModalOpen(false);
      setCreateSourceTaskId('');
      await fetchJobs(true, { silent: true });
      setActiveJobId(result.job_id);
    } catch (e: any) {
      notify(`提交进化任务失败: ${e?.message || e}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (jobId: string) => {
    try {
      await fwApi.cancelEvolutionJob(jobId);
      notify('进化任务结束请求已提交', 'success');
      await refreshJobDetail(jobId, { silent: true });
      await fetchJobs(false, { silent: true });
    } catch (e: any) {
      notify(`结束失败: ${e?.message || e}`, 'error');
    }
  };

  const handleRetry = async (jobId: string) => {
    try {
      const result = await fwApi.retryEvolutionJob(jobId);
      notify(result.message || '进化任务重试已受理', 'success');
      await refreshJobDetail(jobId, { silent: true });
      await fetchJobs(false, { silent: true });
    } catch (e: any) {
      notify(`重试失败: ${e?.message || e}`, 'error');
    }
  };

  const handleDelete = async (jobId: string) => {
    const target = jobs.find((job) => job.id === jobId) || activeJob;
    if (target && !isTerminal(target.status)) {
      notify('运行中的进化任务不能删除，请先结束', 'error');
      return;
    }
    const confirmed = await showConfirm({
      title: '删除进化任务',
      message: '确认删除当前进化任务记录吗？',
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    setDeletingJobId(jobId);
    try {
      await fwApi.deleteEvolutionJob(jobId);
      notify('进化任务已删除', 'success');
      if (activeJobId === jobId) setActiveJobId('');
      await fetchJobs(true, { silent: true });
    } catch (e: any) {
      notify(`删除失败: ${e?.message || e}`, 'error');
    } finally {
      setDeletingJobId('');
    }
  };

  const handleConfirmReplacement = async () => {
    if (!activeJob?.id || !activeJob.final_tool_path) return;
    const targetLabel = activeJob.replaced_tool_path
      ? `原工具：${activeJob.replaced_tool_path}`
      : '原工具：无，将发布并激活新工具';
    const confirmed = await showConfirm({
      title: '确认替换原工具',
      message: `将使用新工具覆盖原工具。\n\n${targetLabel}\n新工具：${activeJob.final_tool_path}`,
      confirmText: '确认替换',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    setReplacing(true);
    try {
      const result = await fwApi.confirmEvolutionReplacement(activeJob.id);
      notify(result.message || '已确认替换原工具', 'success');
      await refreshJobDetail(activeJob.id);
    } catch (e: any) {
      notify(`确认替换失败: ${e?.message || e}`, 'error');
    } finally {
      setReplacing(false);
    }
  };

  const handleOpenLog = async (jobId: string, round: number, role: 'evolution_executor' | 'tool_executor' | 'reviewer' | 'evolver') => {
    const roleLabelMap: Record<string, string> = { evolution_executor: '工具进化执行器', tool_executor: '工具解包器', reviewer: '评审器', evolver: '工具进化器' };
    setLogModalTitle(`第 ${round} 轮 · ${roleLabelMap[role]} 日志`);
    setLogPayload(null);
    setLogLoading(true);
    setLogModalOpen(true);
    try {
      setLogPayload(await fwApi.getEvolutionLogs(jobId, round, role));
    } catch (e: any) {
      setLogPayload({ task_id: jobId, run_path: null, available: false, log_text: '', files: [], phase: `evolution:${role}:round_${round}`, message: e?.message || '加载进化日志失败' });
    } finally {
      setLogLoading(false);
    }
  };

  const renderDetail = () => {
    if (!activeJob) {
      return (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          <div>{detailError || '加载进化任务详情中...'}</div>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button onClick={() => setActiveJobId('')} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">返回列表</button>
            {activeJobId ? (
              <button onClick={() => refreshJobDetail(activeJobId)} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white">
                重试加载
              </button>
            ) : null}
          </div>
        </div>
      );
    }
    const progressPhases = buildEvolutionProgressPhases(activeJob);
    const effectRows = activeJob.rounds.map((round) => ({ round, metrics: getEvolutionRoundMetrics(round) }));
    const bestDuration = effectRows.reduce<number | null>((best, item) => {
      const value = item.metrics.toolDurationSeconds;
      if (!value) return best;
      return best === null ? value : Math.min(best, value);
    }, null);
    const bestTokens = effectRows.reduce<number | null>((best, item) => {
      const value = item.metrics.totalTokenCount;
      if (!value) return best;
      return best === null ? value : Math.min(best, value);
    }, null);
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setActiveJobId('')} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">返回列表</button>
            <div>
              <div className="text-sm font-black text-slate-900">进化任务详情</div>
              <div className="mt-1 font-mono text-xs text-slate-500">{activeJob.id}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => refreshJobDetail(activeJob.id)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"><RefreshCw size={12} />刷新详情</button>
            <button onClick={() => handleRetry(activeJob.id)} disabled={!isTerminal(activeJob.status)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"><RotateCcw size={12} />重试</button>
            <button onClick={() => handleCancel(activeJob.id)} disabled={isTerminal(activeJob.status)} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 disabled:cursor-not-allowed disabled:opacity-40"><Square size={12} />结束</button>
            <button onClick={() => handleDelete(activeJob.id)} disabled={!isTerminal(activeJob.status) || deletingJobId === activeJob.id} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={12} />删除</button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {[
              ['overview', '总览'],
              ['metrics', '观测'],
              ['events', '事件记录'],
              ['session', '智能体会话'],
              ['result', '结果'],
            ].map(([id, label]) => (
              <button key={id} onClick={() => setActiveTab(id as DetailTab)} className={`rounded-xl px-4 py-2 text-sm font-bold ${activeTab === id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{label}</button>
            ))}
          </div>
        </div>

        {detailLoading ? <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" />刷新详情中...</div> : null}

        {activeTab === 'overview' ? (
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Realtime Progress</div>
                  <h3 className="mt-2 text-lg font-black text-slate-900">实时进展</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    当前轮次 {activeJob.current_round ?? 0}/{activeJob.max_rounds} · 当前阶段 {stageLabel(activeJob.current_stage)} · 状态 {formatStatus(activeJob.status)}
                  </p>
                </div>
                {!isTerminal(activeJob.status) ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                    <Loader2 size={12} className="animate-spin" />
                    实时更新中
                  </span>
                ) : (
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusTone(activeJob.status)}`}>{formatStatus(activeJob.status)}</span>
                )}
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {progressPhases.map((phase, index) => {
                  const isRunning = phase.status === 'running';
                  return (
                    <div key={phase.key} className={`rounded-2xl border px-4 py-4 ${isRunning ? 'border-blue-300 bg-blue-50/70 shadow-sm' : 'border-slate-200 bg-slate-50'}`}>
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-black ${progressStatusClass(phase.status)}`}>
                          {phase.status === 'completed' ? <CheckCircle2 size={14} /> : phase.status === 'failed' ? <XCircle size={14} /> : phase.status === 'running' ? <Loader2 size={14} className="animate-spin" /> : index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-black text-slate-900">{phase.label}</div>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${progressStatusClass(phase.status)}`}>
                              {progressStatusLabel(phase.status)}
                            </span>
                          </div>
                          <div className="mt-2 line-clamp-3 break-all text-xs leading-5 text-slate-500">{phase.detail || '-'}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Evolution Effect</div>
                  <h3 className="mt-2 text-lg font-black text-slate-900">进化效果对比</h3>
                  <p className="mt-1 text-xs text-slate-500">按轮次展示工具解包耗时和 token 消耗，用于判断工具是否更快、更省 token。</p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
                  <BarChart3 size={12} />
                  {effectRows.length} 轮
                </span>
              </div>
              {effectRows.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">暂无进化效果数据</div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-black uppercase tracking-[0.12em] text-slate-400">
                        <th className="px-3 py-2">轮次</th>
                        <th className="px-3 py-2">状态</th>
                        <th className="px-3 py-2">工具解包时间</th>
                        <th className="px-3 py-2">总 token</th>
                        <th className="px-3 py-2">进化器 token</th>
                        <th className="px-3 py-2">评审器 token</th>
                        <th className="px-3 py-2">工具变化</th>
                      </tr>
                    </thead>
                    <tbody>
                      {effectRows.map(({ round, metrics }) => {
                        const durationIsBest = bestDuration !== null && metrics.toolDurationSeconds > 0 && metrics.toolDurationSeconds === bestDuration;
                        const tokenIsBest = bestTokens !== null && metrics.totalTokenCount > 0 && metrics.totalTokenCount === bestTokens;
                        return (
                          <tr key={round.id} className="border-b border-slate-100 last:border-0">
                            <td className="px-3 py-3 font-black text-slate-900">第 {round.round} 轮</td>
                            <td className="px-3 py-3"><span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${roundStatusTone(round.status)}`}>{roundStatusLabel(round.status)}</span></td>
                            <td className="px-3 py-3">
                              <span className={durationIsBest ? 'font-black text-emerald-700' : 'font-semibold text-slate-700'}>{metrics.toolDurationSeconds ? fmtSeconds(metrics.toolDurationSeconds) : '-'}</span>
                              {durationIsBest ? <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">最快</span> : null}
                            </td>
                            <td className="px-3 py-3">
                              <span className={tokenIsBest ? 'font-black text-emerald-700' : 'font-semibold text-slate-700'}>{metrics.totalTokenCount ? fmtToken(metrics.totalTokenCount) : '-'}</span>
                              {tokenIsBest ? <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">最省</span> : null}
                            </td>
                            <td className="px-3 py-3 text-slate-600">{fmtToken(metrics.executorTokenCount)}</td>
                            <td className="px-3 py-3 text-slate-600">{fmtToken(metrics.reviewerTokenCount)}</td>
                            <td className="px-3 py-3 text-slate-600">{round.tool_changed ? '已改进' : '未改动'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Overview</div>
                    <h3 className="mt-2 text-lg font-black text-slate-900">进化执行状态</h3>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusTone(activeJob.status)}`}>{formatStatus(activeJob.status)}</span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <DetailField label="主解包任务" value={activeJob.task_id} mono />
                  <DetailField label="固件文件" value={activeJob.source_task?.firmware_path || '-'} mono />
                  <DetailField label="当前轮次" value={`${activeJob.current_round ?? 0}/${activeJob.max_rounds}`} />
                  <DetailField label="当前阶段" value={stageLabel(activeJob.current_stage)} />
                  <DetailField label="开始时间" value={fmtTime(activeJob.started_at)} />
                  <DetailField label="完成时间" value={fmtTime(activeJob.completed_at)} />
                  <DetailField label="耗时" value={fmtDuration(activeJob.started_at, activeJob.completed_at)} />
                  <DetailField label="尝试次数" value={activeJob.attempts} />
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm font-black text-slate-900">轮次时间线</div>
                {activeJob.rounds.length === 0 ? (
                  <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">当前进化任务暂未产出轮次记录</div>
                ) : (
                  <div className="mt-4 space-y-4">
                    {activeJob.rounds.map((round) => (
                      <div key={round.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-black text-slate-900">第 {round.round} 轮</div>
                            <div className="mt-1 text-xs text-slate-500">{fmtTime(round.created_at)} {'->'} {fmtTime(round.completed_at)}</div>
                          </div>
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${roundStatusTone(round.status)}`}>{roundStatusLabel(round.status)}</span>
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <DetailField label="改进前工具" value={round.tool_path_before || round.tool_skill_path_before || '-'} mono />
                          <DetailField label="改进后工具" value={round.tool_path_after || round.tool_skill_path_after || '-'} mono />
                          <DetailField label="是否改动工具" value={round.tool_changed ? '是' : '否'} />
                          <DetailField label="评审结果摘要" value={round.review_result || '-'} />
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <button onClick={() => handleOpenLog(activeJob.id, round.round, 'evolution_executor')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><Terminal size={12} />工具进化执行器日志</button>
                          <button onClick={() => handleOpenLog(activeJob.id, round.round, 'reviewer')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><Terminal size={12} />评审器日志</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <aside className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">工具结果</div>
                <div className="mt-4 space-y-3">
                  <DetailField label="源工具" value={activeJob.source_tool_path || activeJob.source_skill_path || '-'} mono />
                  <DetailField label="工作副本" value={activeJob.working_tool_path || activeJob.working_skill_path || '-'} mono />
                  <DetailField label="最终工具" value={activeJob.final_tool_path || activeJob.final_skill_path || '-'} mono />
                  <DetailField label="覆盖目标" value={activeJob.replaced_tool_path || activeJob.replaced_skill_path || '-'} mono />
                </div>
                <button onClick={handleConfirmReplacement} disabled={!canConfirmReplacement} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-500 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-amber-600 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-500">{replacing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}确认替换原工具</button>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">错误信息</div>
                <div className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{activeJob.error_message || '无'}</div>
              </div>
            </aside>
          </section>
          </div>
        ) : null}

        {activeTab === 'metrics' ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="轮次" value={`${activeJob.current_round ?? 0}/${activeJob.max_rounds}`} tone="border-blue-200 bg-blue-50 text-blue-700" />
            <StatCard label="阶段" value={stageLabel(activeJob.current_stage)} tone="border-violet-200 bg-violet-50 text-violet-700" />
            <StatCard label="耗时" value={fmtDuration(activeJob.started_at, activeJob.completed_at)} tone="border-slate-200 bg-slate-50 text-slate-700" />
            <StatCard label="会话数" value={sessions?.items?.length ?? '-'} tone="border-emerald-200 bg-emerald-50 text-emerald-700" />
            <div className="rounded-2xl border border-slate-200 bg-white p-5 md:col-span-2 xl:col-span-4">
              <div className="text-sm font-black text-slate-900">运行路径</div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <DetailField label="run_root" value={activeJob.run_root || '-'} mono />
                <DetailField label="session_root" value={activeJob.session_root || '-'} mono />
                <DetailField label="task_output_path" value={activeJob.task_output_path || '-'} mono />
                <DetailField label="owner" value={activeJob.owner_id || '-'} mono />
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === 'events' ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3"><div className="text-sm font-black text-slate-900">事件记录</div>{eventsLoading ? <Loader2 size={14} className="animate-spin text-slate-400" /> : null}</div>
            {events.length === 0 ? <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm text-slate-500">暂无进化事件</div> : (
              <div className="mt-4 space-y-3">
                {events.map((event) => (
                  <div key={event.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3"><div className="text-sm font-bold text-slate-900">{event.summary || event.event_type}</div><div className="text-xs text-slate-500">{fmtTime(event.created_at)}</div></div>
                    <div className="mt-2 grid gap-2 md:grid-cols-3"><DetailField label="事件" value={event.event_type} /><DetailField label="阶段" value={event.stage_key || '-'} /><DetailField label="状态" value={event.status || '-'} /></div>
                    {event.detail ? <pre className="mt-3 max-h-48 overflow-auto rounded-xl bg-white px-3 py-3 text-xs leading-6 text-slate-700">{JSON.stringify(event.detail, null, 2)}</pre> : null}
                  </div>
                ))}
              </div>
            )}
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
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Session Root</div>
                <div className="mt-1 break-all font-mono text-[11px] text-slate-700">{sessionRoot || '-'}</div>
              </div>
              {sessionsError ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">{sessionsError}</div> : null}
              {sessionsLoading && sessionMetas.length === 0 ? (
                <div className="mt-4 flex min-h-[240px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  加载会话中...
                </div>
              ) : sessionMetas.length === 0 ? (
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
                                  <div className={`mt-1 text-[11px] ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
                                    轮次 {indexItem?.round ?? '-'} · 阶段 {stageLabel(indexItem?.phase)}
                                  </div>
                                </div>
                                <span className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-bold ${
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

        {activeTab === 'result' ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-black text-slate-900">进化结果</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <DetailField label="评审是否通过" value={activeJob.review_passed ? '通过' : '未通过'} />
              <DetailField label="是否生成新工具" value={activeJob.generated_new_tool || activeJob.generated_new_skill ? '是' : '否'} />
              <DetailField label="替换状态" value={activeJob.replacement_required ? (activeJob.replacement_confirmed ? '已确认替换' : '待确认替换') : '无需替换'} />
              <DetailField label="有效工具" value={activeJob.effective_tool_path || '-'} mono />
              <DetailField label="最终工具" value={activeJob.final_tool_path || activeJob.final_skill_path || '-'} mono />
              <DetailField label="覆盖目标" value={activeJob.replaced_tool_path || activeJob.replaced_skill_path || '-'} mono />
            </div>
            <pre className="mt-4 max-h-[420px] overflow-auto rounded-2xl bg-slate-950 px-4 py-4 text-xs leading-6 text-slate-100">{JSON.stringify(activeJob, null, 2)}</pre>
          </section>
        ) : null}
      </div>
    );
  };

  return (
    <div className="p-4 space-y-4">
      {feedbackNodes}
      <CreateEvolutionModal
        open={createModalOpen}
        loading={sourceTasksLoading}
        sourceTasks={sourceTasks}
        selectedTaskId={createSourceTaskId}
        submitting={submitting}
        onClose={() => setCreateModalOpen(false)}
        onSelectTask={setCreateSourceTaskId}
        onSubmit={handleCreate}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-amber-600" />
          <div>
            <h2 className="text-sm font-bold text-slate-800">{showingDetail ? '进化固件解包 · 任务详情' : '进化固件解包 · 任务列表'}</h2>
            {!showingDetail && hasRunning ? <p className="animate-pulse text-xs font-semibold text-blue-600">● 有进化任务运行中，每5秒自动刷新</p> : null}
          </div>
        </div>
        <button onClick={() => void (showingDetail && activeJobId ? refreshJobDetail(activeJobId) : handleRefreshList())} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"><RefreshCw size={12} />{showingDetail ? '刷新详情' : '刷新列表'}</button>
      </div>

      {showingDetail ? renderDetail() : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <StatCard label="总计" value={stats.total} tone="border-slate-200 bg-white text-slate-800" />
            <StatCard label="运行中" value={stats.running} tone="border-blue-200 bg-blue-50 text-blue-700" />
            <StatCard label="成功" value={stats.success} tone="border-emerald-200 bg-emerald-50 text-emerald-700" />
            <StatCard label="失败/取消" value={stats.failed} tone="border-red-200 bg-red-50 text-red-700" />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Runtime Explorer</div>
                <h3 className="mt-1 text-sm font-bold text-slate-800">运行时文件</h3>
                <p className="mt-1 text-xs text-slate-400">
                  当前展示 <span className="font-mono">{runtimeFiles?.root || '/data/secflow-app-firmware-unpacker'}</span> 下的文件与目录。
                </p>
              </div>
              <button onClick={() => void loadRuntimeFiles()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                <RefreshCw size={12} className={runtimeFilesLoading ? 'animate-spin' : ''} />
                刷新文件
              </button>
            </div>
            <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span>总项数：{runtimeFiles?.total ?? '-'}</span>
              {runtimeFiles?.truncated ? <span className="text-amber-700">结果已截断，当前最多展示 2000 项</span> : null}
            </div>
            {runtimeFilesError ? <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{runtimeFilesError}</div> : null}
            {runtimeFilesLoading && !runtimeFiles ? (
              <div className="flex items-center gap-2 py-10 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" />加载中...</div>
            ) : !runtimeFiles || runtimeFiles.items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-10 text-center text-sm text-slate-500">
                {runtimeFilesLoading ? '加载中...' : '当前目录下暂无可展示文件'}
              </div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">文件树</div>
                  <div className="max-h-[36rem] overflow-auto p-2">
                    {runtimeTree.length === 0 ? (
                      <div className="px-3 py-8 text-center text-sm text-slate-400">暂无可展示节点</div>
                    ) : (
                      <div className="space-y-1">{renderRuntimeTree(runtimeTree)}</div>
                    )}
                  </div>
                </div>
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">文件预览</div>
                    <div className="mt-1 break-all font-mono text-[11px] text-slate-700">{runtimeSelectedPath || '-'}</div>
                    {runtimeSelectedPath ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        <span>{runtimePreviewMeta.mode === 'binary' ? '二进制' : runtimePreviewMeta.mode === 'text' ? '文本' : '目录'}</span>
                        <span>{formatBytes(runtimePreviewMeta.size)}</span>
                        <span>{runtimePreviewMeta.contentType || '-'}</span>
                        {runtimePreviewMeta.truncated ? <span className="text-amber-700">预览已截断</span> : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="max-h-[36rem] overflow-auto bg-white">
                    {runtimePreviewLoading ? (
                      <div className="flex items-center gap-2 px-4 py-10 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" />加载预览中...</div>
                    ) : runtimePreviewError ? (
                      <div className="m-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{runtimePreviewError}</div>
                    ) : !runtimeSelectedPath ? (
                      <div className="px-4 py-10 text-center text-sm text-slate-400">请选择左侧文件</div>
                    ) : runtimePreviewMeta.mode === '' ? (
                      <div className="px-4 py-10 text-center text-sm text-slate-400">当前选择为目录，请展开或选择文件</div>
                    ) : (
                      <pre className="min-h-[28rem] whitespace-pre-wrap break-words px-4 py-4 font-mono text-[12px] leading-6 text-slate-800">{runtimePreviewMeta.mode === 'text' ? runtimePreviewText : runtimePreviewHex}</pre>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0"><div className="flex items-center gap-2"><Package size={14} className="shrink-0 text-amber-600" /><h3 className="text-sm font-bold text-slate-800">进化任务列表</h3></div><p className="mt-1 text-xs text-slate-400">管理固件解包进化任务，支持进入详情查看轮次、事件、会话和结果。</p></div>
              <button onClick={openCreateModal} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"><Play size={12} />新建进化任务</button>
            </div>
            <div className="mb-4 grid gap-3 md:grid-cols-[160px_minmax(0,1fr)_auto]">
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 outline-none focus:border-amber-400"><option value="">全部状态</option><option value="pending">排队中</option><option value="running">运行中</option><option value="success">成功</option><option value="failed">失败</option><option value="cancelled">已取消</option></select>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><Search size={14} className="text-slate-400" /><input value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void handleQueryList(); }} placeholder="搜索进化任务 ID / 主任务 ID / 固件路径" className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400" /></div>
              <button onClick={() => void handleQueryList()} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Search size={12} />查询</button>
            </div>
            {listError ? <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{listError}</div> : null}
            <ExecutionTable>
              <ExecutionTableHead><tr><ExecutionTableTh>任务 ID</ExecutionTableTh><ExecutionTableTh>状态</ExecutionTableTh><ExecutionTableTh>源解包任务</ExecutionTableTh><ExecutionTableTh>固件</ExecutionTableTh><ExecutionTableTh>轮次/阶段</ExecutionTableTh><ExecutionTableTh>时间</ExecutionTableTh><ExecutionTableTh align="right">操作</ExecutionTableTh></tr></ExecutionTableHead>
              <tbody>
                {loading && jobs.length === 0 ? <tr><ExecutionTableTd colSpan={7} className="py-10 text-center text-slate-500">加载中...</ExecutionTableTd></tr> : jobs.length === 0 ? <tr><ExecutionTableTd colSpan={7} className="py-10 text-center text-slate-500">暂无进化任务</ExecutionTableTd></tr> : jobs.map((job) => (
                  <tr key={job.id} onClick={() => setActiveJobId(job.id)} className={executionTableInteractiveRowClassName}>
                    <ExecutionTableTd><div className="font-mono text-xs font-bold text-slate-800">{job.id}</div></ExecutionTableTd>
                    <ExecutionTableTd><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusTone(job.status)}`}>{formatStatus(job.status)}</span></ExecutionTableTd>
                    <ExecutionTableTd><div className="font-mono text-xs text-slate-700">{job.task_id}</div></ExecutionTableTd>
                    <ExecutionTableTd><div className="max-w-[220px] truncate text-xs text-slate-700">{basename(job.source_task?.firmware_path)}</div></ExecutionTableTd>
                    <ExecutionTableTd><div className="text-xs font-semibold text-slate-700">{job.current_round ?? 0}/{job.max_rounds}</div><div className="mt-1 text-[11px] text-slate-400">{stageLabel(job.current_stage)}</div></ExecutionTableTd>
                    <ExecutionTableTd><div className="text-xs text-slate-500">创建：{fmtTime(job.created_at)}</div><div className="mt-1 text-[11px] text-slate-400">耗时：{fmtDuration(job.started_at, job.completed_at)}</div></ExecutionTableTd>
                    <ExecutionTableTd className="text-right"><div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}><button onClick={() => setActiveJobId(job.id)} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50">详情</button><button onClick={() => handleCancel(job.id)} disabled={isTerminal(job.status)} className="rounded-lg border border-amber-200 px-2 py-1 text-[11px] font-bold text-amber-700 disabled:opacity-40">结束</button><button onClick={() => handleRetry(job.id)} disabled={!isTerminal(job.status)} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 disabled:opacity-40">重试</button><button onClick={() => handleDelete(job.id)} disabled={!isTerminal(job.status) || deletingJobId === job.id} className="rounded-lg border border-red-200 px-2 py-1 text-[11px] font-bold text-red-700 disabled:opacity-40">删除</button></div></ExecutionTableTd>
                  </tr>
                ))}
              </tbody>
            </ExecutionTable>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500"><span>第 {page + 1} / {totalPages} 页，共 {total} 条</span><div className="flex items-center gap-2"><select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }} className="rounded-lg border border-slate-200 px-2 py-1">{PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}/页</option>)}</select><button onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page <= 0} className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40">上一页</button><button onClick={() => setPage((value) => Math.min(totalPages - 1, value + 1))} disabled={page >= totalPages - 1} className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40">下一页</button></div></div>
          </div>
        </div>
      )}

      {logModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-6 backdrop-blur-sm">
          <div className="flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5"><div><p className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-600">Evolution Log</p><h3 className="mt-2 text-xl font-black text-slate-900">{logModalTitle}</h3></div><button onClick={() => setLogModalOpen(false)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button></div>
            <div className="space-y-3 overflow-auto px-6 py-5">{logLoading ? <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={15} className="animate-spin" /> 加载日志中...</div> : !logPayload?.available ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{logPayload?.message || '当前阶段日志不可用'}</div> : <><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">日志目录</p><p className="mt-1 break-all font-mono text-xs text-slate-700">{logPayload.run_path || '-'}</p></div><div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">日志文件</p><p className="mt-1 break-all font-mono text-xs text-slate-700">{logPayload.files?.join(', ') || '-'}</p></div></div><pre className="min-h-[320px] overflow-auto rounded-2xl bg-slate-950 px-4 py-4 text-[12px] leading-6 text-slate-100 whitespace-pre-wrap break-words">{logPayload.log_text || logPayload.message || '暂无日志内容'}</pre></> }</div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
