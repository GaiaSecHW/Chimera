import React, { useEffect, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, Code2, Cpu, FileCode2, FileText, Gauge, Layers3, Loader2, RefreshCw, RotateCcw, Sparkles, Trash2, XCircle } from 'lucide-react';

import { B2STaskDetail } from '../../clients/binaryToSource';
import { api } from '../../clients/api';
import { showConfirm } from '../../components/DialogService';
import { B2SPhaseBadge, B2SProgressBar, B2SStatusBadge, B2S_TERMINAL_STATUSES, formatBytes, formatDateTime, pct } from './b2sPresentation';
import { hasBinarySecurityReturnTarget, navigateBackByTaskOrigin, navigateBackToBinarySecurityTask } from '../../utils/executionReturnContext';
import { TaskOriginCard } from './taskOrigin';
import { DownstreamTaskCreator } from './DownstreamTaskCreator';

interface Props {
  projectId: string;
  taskId: string;
  onBack: () => void;
  onOpenAdvanced?: (itemId: string) => void;
}

type B2SItem = B2STaskDetail['items'][number];
type DetailTab = 'overview' | 'result' | 'execution';

const PHASE_LABELS: Record<string, string> = {
  queued: '排队中',
  pending: '待处理',
  ida: '静态分析',
  batching: '函数分批',
  header: '生成头文件',
  body: '还原函数体',
  merge: '合并结果',
  completed: '已完成',
  success: '成功',
  failed: '失败',
  cancelled: '已取消',
};

const PHASE_DESCRIPTIONS: Record<string, string> = {
  queued: '任务正在等待 worker 接收，通常很快会进入静态分析。',
  pending: '任务已创建，正在等待调度。',
  ida: '正在执行静态分析，识别函数、符号和反编译上下文。',
  batching: '正在根据函数数量拆分处理批次。',
  header: '正在生成头文件、类型声明和函数原型；头文件完成后整体进度进入 40%。',
  body: '正在逐批还原函数体源码，整体进度会根据 batch 完成情况实时推进。',
  merge: '正在合并源码、头文件和最终输出。',
  completed: '任务已完成，结果文件已生成。',
  success: '任务项已成功完成。',
  failed: '任务执行失败，请查看错误诊断。',
  cancelled: '任务已取消。',
};

const PHASE_ESTIMATED_PERCENT: Record<string, number> = {
  pending: 0,
  queued: 0,
  ida: 0,
  batching: 0,
  header: 15,
  body: 40,
  merge: 95,
  completed: 100,
  success: 100,
  failed: 100,
  cancelled: 100,
};

const fileNameOf = (path?: string | null) => {
  if (!path) return '-';
  const normalized = path.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() || path;
};

const projectPathFromStoragePath = (projectId: string, path: string) => {
  const normalized = path.replace(/\\/g, '/');
  const prefix = `/data/files/${projectId}`;
  if (normalized.startsWith(prefix)) return normalized.slice(prefix.length) || '/';
  if (normalized.startsWith('/')) return normalized;
  return `/${normalized}`;
};

const languageFromPath = (path?: string | null) => {
  const name = fileNameOf(path).toLowerCase();
  if (name.endsWith('.c') || name.endsWith('.h')) return 'c';
  if (name.endsWith('.cpp') || name.endsWith('.cc') || name.endsWith('.cxx') || name.endsWith('.hpp') || name.endsWith('.hh')) return 'cpp';
  if (name.endsWith('.asm') || name.endsWith('.s')) return 'asm';
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.md')) return 'markdown';
  if (name.endsWith('.py')) return 'python';
  if (name.endsWith('.txt') || name.endsWith('.log')) return 'plaintext';
  return 'plaintext';
};

const formatPhaseLabel = (phase?: string | null, fallback?: string | null) => {
  const value = phase || fallback || '';
  if (!value) return '-';
  return PHASE_LABELS[value] || fallback || value;
};

const hasNumericProgress = (progress?: B2SItem['progress'] | null) => (
  progress?.percent !== undefined && progress?.percent !== null
) || (
  progress?.batches_percent !== undefined && progress?.batches_percent !== null
) || (
  progress?.bytes_percent !== undefined && progress?.bytes_percent !== null
);

const batchProgressPercent = (progress?: B2SItem['progress'] | null) => {
  if (progress?.batches_percent !== undefined && progress.batches_percent !== null) return pct(progress.batches_percent);
  const completed = progress?.completed_batches;
  const total = progress?.total_batches;
  if (completed !== undefined && completed !== null && total && total > 0) return pct((completed / total) * 100);
  return null;
};

const rawProgressPercent = (progress?: B2SItem['progress'] | null) => {
  const numeric = progress?.percent ?? progress?.batches_percent ?? progress?.bytes_percent;
  return numeric === undefined || numeric === null ? null : pct(Number(numeric));
};

const terminalNonSuccessProgressValue = (item: B2SItem) => {
  const raw = rawProgressPercent(item.progress);
  if (raw !== null) return raw;
  const batchPercent = batchProgressPercent(item.progress);
  if (batchPercent !== null) return batchPercent;
  return 0;
};

const phaseAwareProgressValue = (item: B2SItem, numericPercent: number) => {
  const phase = item.phase || item.status || '';
  const progress = item.progress;
  if (item.status === 'success' || item.status === 'completed') return 100;
  if (item.status === 'failed' || item.status === 'cancelled') return terminalNonSuccessProgressValue(item);
  if (phase === 'pending' || phase === 'queued' || phase === 'ida' || phase === 'batching') return 0;
  if (phase === 'header') return 15;
  if (phase === 'body') {
    // Body progress is driven by completed batches. Header completion contributes
    // the first 40%, then body batches move the task from 40% to 90%.
    const bodyBatchPercent = batchProgressPercent(progress) ?? pct(numericPercent);
    return 40 + (bodyBatchPercent / 100) * 50;
  }
  if (phase === 'merge') return 95;
  return pct(numericPercent);
};

const itemProgressPresentation = (item: B2SItem) => {
  const progress = item.progress;
  const phase = item.phase || item.status || '';
  const raw = rawProgressPercent(progress);
  if (hasNumericProgress(progress)) {
    const value = phaseAwareProgressValue(item, raw ?? 0);
    return {
      value,
      label: `${value.toFixed(1)}%`,
      mode: item.status === 'failed' || item.status === 'cancelled' ? '终止进度' : '',
      estimated: false,
      description: progress?.message || PHASE_DESCRIPTIONS[phase] || '',
    };
  }
  if (item.status === 'failed' || item.status === 'cancelled') {
    return {
      value: 0,
      label: '0.0%',
      mode: '终止进度',
      estimated: false,
      description: PHASE_DESCRIPTIONS[item.status] || '',
    };
  }
  const estimated = PHASE_ESTIMATED_PERCENT[phase] ?? (B2S_TERMINAL_STATUSES.has(item.status) ? 100 : 12);
  return {
    value: estimated,
    label: `${estimated}%`,
    mode: B2S_TERMINAL_STATUSES.has(item.status) ? '' : '阶段估算',
    estimated: !B2S_TERMINAL_STATUSES.has(item.status),
    description: PHASE_DESCRIPTIONS[item.phase || item.status || ''] || '任务正在执行，系统会在进入函数还原阶段后显示精确进度。',
  };
};

const parseBackendTimeMs = (value?: string | null) => {
  if (!value) return NaN;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`;
  return new Date(normalized).getTime();
};

const formatDurationMs = (durationMs?: number | null) => {
  if (durationMs === undefined || durationMs === null || Number.isNaN(durationMs) || durationMs < 0) return '-';
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const minuteRest = minutes % 60;
  return minuteRest ? `${hours}h ${minuteRest}m` : `${hours}h`;
};

const formatDuration = (start?: string | null, end?: string | null) => {
  if (!start || !end) return '-';
  const startMs = parseBackendTimeMs(start);
  const endMs = parseBackendTimeMs(end);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return '-';
  return formatDurationMs(endMs - startMs);
};

const taskRunDuration = (detail?: B2STaskDetail | null, nowMs: number = Date.now()) => {
  if (!detail || detail.items.length === 0) return '-';
  const startTimes = detail.items
    .map((item) => item.started_at ? parseBackendTimeMs(item.started_at) : NaN)
    .filter((value) => !Number.isNaN(value));
  if (startTimes.length === 0) return '-';
  const endTimes = detail.items
    .map((item) => {
      if (item.finished_at) return parseBackendTimeMs(item.finished_at);
      if (!B2S_TERMINAL_STATUSES.has(item.status)) return nowMs;
      return NaN;
    })
    .filter((value) => !Number.isNaN(value));
  if (endTimes.length === 0) return '-';
  const startMs = Math.min(...startTimes);
  const endMs = Math.max(...endTimes);
  return formatDurationMs(endMs - startMs);
};

const statusTone = (detail: B2STaskDetail) => {
  if (detail.failed_items > 0 || detail.status === 'failed') return 'rose';
  if (detail.status === 'partial') return 'violet';
  if (B2S_TERMINAL_STATUSES.has(detail.status)) return 'emerald';
  return 'blue';
};

const metricToneClass = (tone: string) => {
  if (tone === 'rose') return 'border-rose-100 bg-rose-50 text-rose-900';
  if (tone === 'amber') return 'border-amber-100 bg-amber-50 text-amber-900';
  if (tone === 'emerald') return 'border-emerald-100 bg-emerald-50 text-emerald-900';
  if (tone === 'blue') return 'border-blue-100 bg-blue-50 text-blue-900';
  if (tone === 'violet') return 'border-violet-100 bg-violet-50 text-violet-900';
  if (tone === 'cyan') return 'border-cyan-100 bg-cyan-50 text-cyan-900';
  return 'border-slate-200 bg-slate-50 text-slate-900';
};

const MetricCard: React.FC<{ label: string; value: string | number; hint?: string; tone?: string }> = ({ label, value, hint, tone = 'slate' }) => (
  <div className={`rounded-2xl border px-4 py-3 ${metricToneClass(tone)}`}>
    <div className="text-[11px] font-black uppercase tracking-[0.18em] opacity-55">{label}</div>
    <div className="mt-1 text-2xl font-black tracking-tight">{value}</div>
    {hint ? <div className="mt-1 truncate text-xs font-semibold opacity-60" title={hint}>{hint}</div> : null}
  </div>
);

const KPI_TILE_STYLES: Record<string, string> = {
  blue: 'border-blue-100 bg-blue-50/80 text-blue-900',
  emerald: 'border-emerald-100 bg-emerald-50/80 text-emerald-900',
  rose: 'border-rose-100 bg-rose-50/80 text-rose-900',
  amber: 'border-amber-100 bg-amber-50/80 text-amber-900',
  violet: 'border-violet-100 bg-violet-50/80 text-violet-900',
  slate: 'border-slate-200 bg-slate-50/90 text-slate-900',
};

const KPI_ICON_STYLES: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  rose: 'bg-rose-100 text-rose-700',
  amber: 'bg-amber-100 text-amber-700',
  violet: 'bg-violet-100 text-violet-700',
  slate: 'bg-slate-200 text-slate-700',
};

const KpiTile: React.FC<{ label: string; value: string | number; hint?: string; tone?: string; icon: React.ReactNode }> = ({ label, value, hint, tone = 'slate', icon }) => (
  <div className={`rounded-[1.25rem] border p-4 ${KPI_TILE_STYLES[tone] || KPI_TILE_STYLES.slate}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[11px] font-black uppercase tracking-[0.18em] opacity-55">{label}</div>
        <div className="mt-1 text-2xl font-black tracking-tight">{value}</div>
      </div>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${KPI_ICON_STYLES[tone] || KPI_ICON_STYLES.slate}`}>
        {icon}
      </div>
    </div>
    {hint ? <div className="mt-2 truncate text-xs font-semibold opacity-65" title={hint}>{hint}</div> : null}
  </div>
);

const STAGE_ORDER = ['queued', 'ida', 'batching', 'header', 'body', 'merge', 'completed'];
const STAGE_LABELS: Record<string, string> = {
  queued: '调度',
  ida: '静态分析',
  batching: '分批',
  header: '头文件',
  body: '函数体',
  merge: '合并',
  completed: '完成',
};

const stageIndex = (phase?: string | null) => {
  const idx = STAGE_ORDER.indexOf(phase || '');
  if (idx >= 0) return idx;
  if (phase === 'pending') return 0;
  if (phase === 'success') return STAGE_ORDER.length - 1;
  if (phase === 'failed' || phase === 'cancelled') return -1;
  return 0;
};

const dominantRunningPhase = (detail?: B2STaskDetail | null, fallback?: string) => {
  if (!detail) return fallback || '';
  const running = detail.items.filter((item) => !B2S_TERMINAL_STATUSES.has(item.status));
  if (running.length === 0) return fallback || detail.status;
  const counts = running.reduce<Record<string, number>>((acc, item) => {
    const phase = item.phase || item.status || 'queued';
    acc[phase] = (acc[phase] || 0) + 1;
    return acc;
  }, {});
  const [phase] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [];
  return phase || fallback || detail.status;
};

const modeLabelFromDetail = (detail?: B2STaskDetail | null) => detail?.mode_label || '-';

const fileKindLabel = (path: string) => {
  const name = fileNameOf(path).toLowerCase();
  if (name.endsWith('_ida.c')) return 'IDA C';
  if (name.endsWith('.h')) return '头文件';
  if (name.endsWith('.c')) return '还原 C';
  return languageFromPath(path).toUpperCase();
};

export const B2STaskDetailPage: React.FC<Props> = ({ projectId, taskId, onBack, onOpenAdvanced }) => {
  const executionApi = api.domains.execution;
  const [detail, setDetail] = useState<B2STaskDetail | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [selectedResultPath, setSelectedResultPath] = useState<string>('');
  const [previewContent, setPreviewContent] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const hasReturnContext = hasBinarySecurityReturnTarget(detail);
  const handleBack = () => {
    if (navigateBackByTaskOrigin(detail)) return;
    if (navigateBackToBinarySecurityTask()) return;
    onBack();
  };

  const load = async () => {
    if (!projectId || !taskId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await executionApi.binaryToSource.getTask(projectId, taskId);
      setDetail(data);
    } catch (e: any) {
      setError(e?.message || '加载任务详情失败');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [projectId, taskId]);

  useEffect(() => {
    if (!projectId || !taskId) return;
    if (!detail || !B2S_TERMINAL_STATUSES.has(detail.status)) {
      const timer = window.setInterval(() => {
        void load();
      }, 5000);
      return () => window.clearInterval(timer);
    }
  }, [projectId, taskId, detail?.status]);

  useEffect(() => {
    if (!detail || B2S_TERMINAL_STATUSES.has(detail.status)) return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [detail?.status]);

  const cancelTask = async () => {
    if (!projectId || !taskId || cancelling) return;
    const confirmed = await showConfirm({
      title: '取消二进制逆向任务',
      message: '确认取消该二进制逆向任务？\n\n运行中的 item 会请求后端终止，已生成的输入、输出和中间文件会保留。',
      confirmText: '确认取消',
      cancelText: '继续运行',
      danger: true,
    });
    if (!confirmed) return;
    setError(null);
    setCancelling(true);
    try {
      await executionApi.binaryToSource.terminateTask(projectId, taskId);
      await load();
    } catch (e: any) {
      setError(e?.message || '取消任务失败');
    } finally {
      setCancelling(false);
    }
  };

  const rerunTask = async () => {
    if (!projectId || !taskId || rerunning) return;
    const confirmed = await showConfirm({
      title: '完整重跑二进制逆向任务',
      message: `确认完整重新运行该任务？\n\n任务 ID：${taskId}\n\n系统会先请求终止当前未完成的 job，保留 input 目录，清理各 item 的 output 目录，并重新提交所有 ELF item。旧结果会被覆盖。`,
      confirmText: '确认重跑',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    setError(null);
    setRerunning(true);
    try {
      await executionApi.binaryToSource.rerunTask(projectId, taskId, { clean_output: true, cancel_running: true });
      await load();
    } catch (e: any) {
      setError(e?.message || '完整重跑任务失败');
    } finally {
      setRerunning(false);
    }
  };

  const deleteTask = async () => {
    if (!projectId || !taskId || deleting) return;
    const confirmed = await showConfirm({
      title: '彻底删除二进制逆向任务',
      message: `确认彻底删除该二进制逆向任务？\n\n任务 ID：${taskId}\n\n此操作会删除 taskId 目录下的所有输入、输出和中间文件，并删除任务记录，且不可恢复。`,
      confirmText: '确认删除',
      cancelText: '保留任务',
      danger: true,
    });
    if (!confirmed) return;
    setError(null);
    setDeleting(true);
    try {
      await executionApi.binaryToSource.deleteTask(projectId, taskId);
      handleBack();
    } catch (e: any) {
      setError(e?.message || '删除任务失败');
    } finally {
      setDeleting(false);
    }
  };

  const overall = detail?.overall_progress;
  const itemPresentations = useMemo(() => {
    const entries = (detail?.items || []).map((item) => [item.id, itemProgressPresentation(item)] as const);
    return Object.fromEntries(entries);
  }, [detail]);
  const generatedFiles = useMemo(() => {
    if (!detail) return [] as Array<{ item: B2SItem; path: string }>;
    return detail.items.flatMap((item) => (item.generated_files || []).map((path) => ({ item, path })));
  }, [detail]);

  useEffect(() => {
    if (generatedFiles.length === 0) {
      setSelectedResultPath('');
      return;
    }
    setSelectedResultPath((current) => current && generatedFiles.some((file) => file.path === current) ? current : generatedFiles[0].path);
  }, [generatedFiles]);

  useEffect(() => {
    if (!projectId || !selectedResultPath) {
      setPreviewContent('');
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    const loadPreview = async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const projectPath = projectPathFromStoragePath(projectId, selectedResultPath);
        const blob = await api.domains.assets.fileserver.fetchProjectFilesystemPreviewBlob(projectId, projectPath);
        const text = await blob.text();
        if (!cancelled) setPreviewContent(text);
      } catch (e: any) {
        if (!cancelled) {
          setPreviewContent('');
          setPreviewError(e?.message || '加载预览失败');
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    };
    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [projectId, selectedResultPath]);

  const dominantPhase = useMemo(() => {
    const runningPhase = dominantRunningPhase(detail);
    if (runningPhase) return runningPhase;
    const summary = overall?.phase_summary || {};
    const [phase] = Object.entries(summary).sort((a, b) => b[1] - a[1])[0] || [];
    return phase || detail?.status || '';
  }, [detail, overall]);

  if (!taskId) {
    return (
      <div className="px-8 pb-10 pt-8 space-y-6">
        <button type="button" onClick={handleBack} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm">
          <ArrowLeft size={16} />
          {hasReturnContext ? '返回原任务' : '返回二进制逆向'}
        </button>
        <div className="rounded-[2rem] border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
          未指定任务，请返回列表重新选择。
        </div>
      </div>
    );
  }

  const phaseLabel = formatPhaseLabel(dominantPhase, dominantPhase);
  const terminal = !!detail && B2S_TERMINAL_STATUSES.has(detail.status);
  const showTopPhaseBadge = !!detail && !terminal && !!dominantPhase && dominantPhase !== detail.status;
  const totalFunctions = overall?.total_functions ?? detail?.items.reduce((sum, item) => sum + (item.progress?.total_functions || 0), 0) ?? 0;
  const completedFunctions = overall?.completed_functions ?? detail?.items.reduce((sum, item) => sum + (item.progress?.completed_functions || 0), 0) ?? 0;
  const itemProgressValues = detail?.items.map((item) => itemPresentations[item.id] || itemProgressPresentation(item)) || [];
  const derivedOverall = itemProgressValues.length
    ? itemProgressValues.reduce((sum, item) => sum + item.value, 0) / itemProgressValues.length
    : (overall?.percent ?? 0);
  const progressValue = overall?.percent !== undefined && overall.percent !== null
    ? overall.percent
    : (terminal && (detail?.success_items || 0) + (detail?.partial_items || 0) === (detail?.total_items || 0)
      ? 100
      : derivedOverall);
  const progressModeLabel = !terminal && itemProgressValues.some((item) => item.estimated) ? '阶段估算' : '';
  const runningItems = detail?.running_items || detail?.items.filter((item) => !B2S_TERMINAL_STATUSES.has(item.status)).length || 0;
  const resultCount = generatedFiles.length;
  const modeLabel = modeLabelFromDetail(detail);
  const primaryActiveItem = detail?.items.find((item) => !B2S_TERMINAL_STATUSES.has(item.status)) || detail?.items.find((item) => item.status === 'failed') || detail?.items[0];
  const primaryActivePresentation = primaryActiveItem ? (itemPresentations[primaryActiveItem.id] || itemProgressPresentation(primaryActiveItem)) : null;
  const actionableFailures = detail?.items.filter((item) => item.status === 'failed' || item.error_reason).slice(0, 3) || [];
  const taskStartedAt = detail?.items
    .map((item) => item.started_at ? parseBackendTimeMs(item.started_at) : NaN)
    .filter((value) => !Number.isNaN(value))
    .sort((a, b) => a - b)[0];
  const taskFinishedAt = detail && terminal
    ? detail.items
      .map((item) => item.finished_at ? parseBackendTimeMs(item.finished_at) : NaN)
      .filter((value) => !Number.isNaN(value))
      .sort((a, b) => b - a)[0]
    : undefined;
  const firstInputPath = detail?.items[0]?.elf_path || '-';
  const primaryOutputDir = primaryActiveItem?.output_dir || detail?.items.find((item) => item.output_dir)?.output_dir || '-';

  return (
    <div className="px-8 pb-10 pt-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <ArrowLeft size={16} />
          {hasReturnContext ? '返回原任务' : '返回二进制逆向'}
        </button>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            刷新
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      <section className={`overflow-hidden rounded-[2rem] border bg-white shadow-sm ${detail && statusTone(detail) === 'rose' ? 'border-rose-200' : 'border-slate-200'}`}>
        {loading && !detail ? (
          <div className="flex items-center gap-2 p-8 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" />
            加载中...
          </div>
        ) : detail ? (
          <div>
            <div className="bg-[radial-gradient(circle_at_top_left,#eff6ff_0,#ffffff_38%,#f8fafc_100%)] p-7">
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <B2SStatusBadge status={detail.status} />
                    {showTopPhaseBadge && <B2SPhaseBadge phase={dominantPhase} label={phaseLabel} />}
                    {modeLabel !== '-' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-black text-indigo-700 ring-1 ring-indigo-200">
                        <Sparkles size={13} />
                        {modeLabel}
                      </span>
                    )}
                  </div>
                  <h1 className="mt-4 break-words text-3xl font-black tracking-tight text-slate-950">{detail.name || detail.id}</h1>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-500">
                    <span className="font-mono">任务 ID：{detail.id}</span>
                    <span>创建：{formatDateTime(detail.created_at)}</span>
                    <span>更新：{formatDateTime(detail.updated_at)}</span>
                  </div>

                  <div className="mt-6 rounded-[1.5rem] border border-white/80 bg-white/75 p-4 shadow-sm backdrop-blur">
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">总体进度</div>
                        <div className="mt-1 text-4xl font-black tracking-tight text-slate-950">{pct(progressValue).toFixed(1)}%</div>
                      </div>
                      <div className="text-right text-xs font-bold text-slate-500">
                        {progressModeLabel || (terminal ? '最终进度' : '后端实时进度')}
                      </div>
                    </div>
                    <div className="mt-4">
                      <B2SProgressBar value={progressValue} tone={statusTone(detail) === 'emerald' ? 'emerald' : 'blue'} />
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-3 text-xs font-semibold text-slate-600">
                      <div className="rounded-xl bg-slate-50 px-3 py-2">当前阶段：<span className="font-black text-slate-800">{phaseLabel}</span></div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2">运行中：<span className="font-black text-slate-800">{runningItems}</span></div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2">结果文件：<span className="font-black text-slate-800">{resultCount}</span></div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded-[1.5rem] border border-white/80 bg-white/80 p-4 shadow-sm">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">当前焦点</div>
                    {primaryActiveItem ? (
                      <div className="mt-3">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">#{primaryActiveItem.sequence_no}</span>
                          <div className="min-w-0 truncate text-sm font-black text-slate-900" title={primaryActiveItem.elf_path}>{fileNameOf(primaryActiveItem.elf_path)}</div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600">
                          <div className="rounded-xl bg-slate-50 px-3 py-2">阶段：<span className="font-black text-slate-800">{formatPhaseLabel(primaryActiveItem.phase, primaryActiveItem.phase_label)}</span></div>
                          <div className="rounded-xl bg-slate-50 px-3 py-2">进度：<span className="font-black text-slate-800">{primaryActivePresentation?.label || '-'}</span></div>
                          <div className="col-span-2 rounded-xl bg-slate-50 px-3 py-2">当前函数：<span className="font-black text-slate-800">{primaryActiveItem.progress?.current_function || '-'}</span></div>
                        </div>
                      </div>
                    ) : <div className="mt-3 text-sm font-semibold text-slate-500">暂无 item</div>}
                  </div>
                  <TaskOriginCard origin={detail} />
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <KpiTile label="ELF 完成" value={`${overall?.completed_items ?? detail.success_items + detail.partial_items}/${overall?.total_items ?? detail.total_items}`} hint={`${runningItems} 个运行中`} tone="blue" icon={<Cpu size={19} />} />
                <KpiTile label="函数" value={`${completedFunctions}/${totalFunctions || '-'}`} hint="已还原 / 总数" tone="emerald" icon={<FileCode2 size={19} />} />
                <KpiTile label="批次" value={`${overall?.completed_batches ?? 0}/${overall?.total_batches ?? 0}`} hint="completed / total" tone="violet" icon={<Layers3 size={19} />} />
                <KpiTile label="结果文件" value={resultCount} hint={resultCount ? '可预览' : '等待生成'} tone={resultCount ? 'emerald' : 'slate'} icon={<Code2 size={19} />} />
                <KpiTile label="失败" value={detail.failed_items || 0} hint={detail.failed_items ? '需要处理' : '无异常'} tone={detail.failed_items ? 'rose' : 'slate'} icon={detail.failed_items ? <AlertTriangle size={19} /> : <CheckCircle2 size={19} />} />
                <KpiTile label="本轮耗时" value={taskRunDuration(detail, clockNow)} hint={terminal ? '已结束' : '实时计时中'} tone="slate" icon={<Gauge size={19} />} />
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-100 bg-white px-7 py-5 lg:flex-row lg:items-center lg:justify-end">
              <div className="flex flex-wrap items-center gap-3">
                {detail && !B2S_TERMINAL_STATUSES.has(detail.status) && (
                  <button
                    type="button"
                    onClick={() => void cancelTask()}
                    disabled={cancelling}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-black text-rose-700 shadow-sm hover:bg-rose-50 disabled:opacity-50"
                  >
                    {cancelling ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                    取消任务
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void rerunTask()}
                  disabled={rerunning}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-black text-amber-700 shadow-sm hover:bg-amber-100 disabled:opacity-50"
                >
                  {rerunning ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                  完整重跑
                </button>
                <DownstreamTaskCreator
                  projectId={projectId}
                  sourceKind="binary_to_source"
                  task={detail}
                  buttonClassName="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-black text-emerald-700 shadow-sm hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => void deleteTask()}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-black text-red-700 shadow-sm hover:bg-red-100 disabled:opacity-50"
                >
                  {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  删除
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 text-sm text-slate-500">未找到任务详情。</div>
        )}
      </section>

      {detail ? (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: 'overview' as DetailTab, label: '总览' },
                { id: 'result' as DetailTab, label: '还原结果' },
                { id: 'execution' as DetailTab, label: '执行明细' },
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
              <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">任务概览</h2>
                  <div className="mt-4 grid gap-x-8 gap-y-3 md:grid-cols-2">
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">任务 ID</div>
                      <div className="mt-1 font-mono text-sm text-slate-800">{detail.id}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">运行模式</div>
                      <div className="mt-1 text-sm font-semibold text-slate-800">{modeLabel}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">创建时间</div>
                      <div className="mt-1 text-sm font-semibold text-slate-800">{formatDateTime(detail.created_at)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">开始时间</div>
                      <div className="mt-1 text-sm font-semibold text-slate-800">{taskStartedAt ? formatDateTime(new Date(taskStartedAt).toISOString()) : '-'}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">更新时间</div>
                      <div className="mt-1 text-sm font-semibold text-slate-800">{formatDateTime(detail.updated_at)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">完成时间</div>
                      <div className="mt-1 text-sm font-semibold text-slate-800">{taskFinishedAt ? formatDateTime(new Date(taskFinishedAt).toISOString()) : '-'}</div>
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">任务名称</div>
                      <div className="mt-1 text-sm font-semibold text-slate-700">{detail.name || '-'}</div>
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">输入 ELF</div>
                      <div className="mt-1 break-all font-mono text-xs text-slate-700">{firstInputPath}</div>
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">输出目录</div>
                      <div className="mt-1 break-all font-mono text-xs text-slate-700">{primaryOutputDir}</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">当前焦点</h2>
                    {primaryActiveItem ? (
                      <div className="mt-4">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">#{primaryActiveItem.sequence_no}</span>
                          <div className="min-w-0 truncate text-sm font-black text-slate-900" title={primaryActiveItem.elf_path}>{fileNameOf(primaryActiveItem.elf_path)}</div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600">
                          <div className="rounded-xl bg-slate-50 px-3 py-2">阶段：<span className="font-black text-slate-800">{formatPhaseLabel(primaryActiveItem.phase, primaryActiveItem.phase_label)}</span></div>
                          <div className="rounded-xl bg-slate-50 px-3 py-2">进度：<span className="font-black text-slate-800">{primaryActivePresentation?.label || '-'}</span></div>
                          <div className="col-span-2 rounded-xl bg-slate-50 px-3 py-2">当前函数：<span className="font-black text-slate-800">{primaryActiveItem.progress?.current_function || '-'}</span></div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 text-sm font-semibold text-slate-500">暂无 item</div>
                    )}
                  </div>
                  <TaskOriginCard origin={detail} />
                </div>
              </section>

              {actionableFailures.length > 0 && (
                <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-600" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-black text-rose-900">失败诊断</div>
                      <div className="mt-2 space-y-2">
                        {actionableFailures.map((item) => (
                          <div key={item.id} className="rounded-xl border border-rose-100 bg-white px-3 py-2 text-xs font-semibold text-rose-800">
                            <span className="font-black">#{item.sequence_no} {fileNameOf(item.elf_path)}：</span>{item.error_reason || item.failure_type || '未知错误'}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              )}
            </>
          ) : null}

          {activeTab === 'result' ? (
            generatedFiles.length > 0 ? (
              <section id="b2s-results" className="overflow-hidden rounded-[2rem] border border-emerald-200 bg-white shadow-sm">
                <div className="flex flex-col gap-2 border-b border-emerald-100 bg-emerald-50/70 px-5 py-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-xl font-black text-slate-900">还原结果</h2>
                    <p className="mt-1 text-xs text-slate-500">浏览当前任务已生成的头文件、还原源码和辅助产物。</p>
                  </div>
                  <div className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-emerald-700 shadow-sm">{generatedFiles.length} 个文件</div>
                </div>
                <div className="grid min-h-[520px] grid-cols-1 lg:grid-cols-[380px_minmax(0,1fr)] xl:grid-cols-[440px_minmax(0,1fr)]">
                  <aside className="border-b border-slate-200 bg-slate-50/70 lg:border-b-0 lg:border-r">
                    <div className="border-b border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-[0.2em] text-slate-400">文件列表</div>
                    <div className="max-h-[520px] overflow-auto p-3">
                      {generatedFiles.map(({ item, path }) => {
                        const active = selectedResultPath === path;
                        return (
                          <button
                            key={`${item.id}-${path}`}
                            type="button"
                            onClick={() => setSelectedResultPath(path)}
                            className={`mb-2 flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition-all ${active ? 'border-emerald-300 bg-white shadow-sm ring-2 ring-emerald-100' : 'border-transparent bg-white/70 hover:border-slate-200 hover:bg-white'}`}
                          >
                            <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                              {languageFromPath(path) === 'plaintext' ? <FileText size={17} /> : <Code2 size={17} />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-start gap-2">
                                <div className="break-words text-sm font-black leading-5 text-slate-900 [overflow-wrap:anywhere]" title={fileNameOf(path)}>{fileNameOf(path)}</div>
                                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">{fileKindLabel(path)}</span>
                              </div>
                              <div className="mt-1 truncate font-mono text-[11px] text-slate-500" title={path}>#{item.sequence_no} · {projectPathFromStoragePath(projectId, path)}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </aside>
                  <div className="min-w-0 bg-slate-950">
                    <div className="flex min-h-[48px] items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-slate-100" title={fileNameOf(selectedResultPath)}>{fileNameOf(selectedResultPath)}</div>
                        <div className="mt-0.5 truncate font-mono text-[11px] text-slate-400" title={selectedResultPath}>{projectPathFromStoragePath(projectId, selectedResultPath)}</div>
                      </div>
                      <div className="shrink-0 rounded-full bg-slate-800 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">
                        {languageFromPath(selectedResultPath)}
                      </div>
                    </div>
                    <div className="h-[520px]">
                      {previewLoading ? (
                        <div className="flex h-full items-center justify-center gap-2 text-sm font-bold text-slate-400">
                          <Loader2 size={18} className="animate-spin" />
                          加载预览中...
                        </div>
                      ) : previewError ? (
                        <div className="flex h-full items-center justify-center px-6 text-center text-sm font-semibold text-rose-300">{previewError}</div>
                      ) : (
                        <Editor
                          height="100%"
                          language={languageFromPath(selectedResultPath)}
                          value={previewContent}
                          theme="vs-dark"
                          options={{
                            readOnly: true,
                            minimap: { enabled: false },
                            fontSize: 13,
                            lineNumbers: 'on',
                            scrollBeyondLastLine: false,
                            wordWrap: 'off',
                            automaticLayout: true,
                            renderWhitespace: 'selection',
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </section>
            ) : (
              <section className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
                <div className="text-center">
                  <div className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">还原结果</div>
                  <div className="mt-4 text-base font-bold text-slate-800">{terminal ? '当前任务尚未生成可展示的结果文件' : '任务完成后可在此查看还原结果'}</div>
                  <div className="mt-2 text-sm text-slate-500">现有接口未返回文件时，页面保持空状态，不额外请求新数据源。</div>
                </div>
              </section>
            )
          ) : null}

          {activeTab === 'execution' ? (
            <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-900">执行明细</h2>
                  <p className="mt-1 text-xs text-slate-500">按 item 展示逆向过程、实时进度、统计信息和错误诊断。</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-black">
                  <span className="rounded-full bg-blue-50 px-3 py-1.5 text-blue-700">运行 {runningItems}</span>
                  <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700">成功 {detail.success_items}</span>
                  <span className="rounded-full bg-rose-50 px-3 py-1.5 text-rose-700">失败 {detail.failed_items}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">取消 {detail.cancelled_items}</span>
                </div>
              </div>

              {detail.items.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-400">当前任务没有可展示的 item。</div>
              ) : (
                <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50/90">
                        <tr className="text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                          <th className="px-4 py-3">序号</th>
                          <th className="px-4 py-3">ELF</th>
                          <th className="px-4 py-3">状态</th>
                          <th className="px-4 py-3">阶段</th>
                          <th className="px-4 py-3">进度</th>
                          <th className="px-4 py-3">函数</th>
                          <th className="px-4 py-3">批次</th>
                          <th className="px-4 py-3">耗时</th>
                          <th className="px-4 py-3">结果文件</th>
                          <th className="px-4 py-3 text-right">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {detail.items.map((item) => {
                          const progress = item.progress;
                          const progressPresentation = itemPresentations[item.id] || itemProgressPresentation(item);
                          const progressValueItem = progressPresentation.value;
                          const expanded = expandedItems[item.id] ?? !(item.status === 'success' || item.status === 'completed');
                          const itemGeneratedCount = item.generated_files?.length || 0;
                          const itemPhaseLabel = formatPhaseLabel(item.phase, item.phase_label);
                          const itemStageIndex = stageIndex(item.phase || item.status);
                          const itemTerminal = B2S_TERMINAL_STATUSES.has(item.status);
                          const rowDuration = item.finished_at
                            ? formatDuration(item.started_at, item.finished_at)
                            : formatDurationMs(item.started_at ? clockNow - parseBackendTimeMs(item.started_at) : null);
                          return (
                            <React.Fragment key={item.id}>
                              <tr className={`align-top ${item.status === 'failed' ? 'bg-rose-50/40' : ''}`}>
                                <td className="whitespace-nowrap px-4 py-4 text-sm font-black text-slate-900">#{item.sequence_no}</td>
                                <td className="px-4 py-4">
                                  <div className="max-w-[280px]">
                                    <div className="truncate text-sm font-black text-slate-900" title={item.elf_path}>{fileNameOf(item.elf_path)}</div>
                                    <div className="mt-1 truncate font-mono text-[11px] text-slate-500" title={item.elf_path}>{item.elf_path}</div>
                                    {item.status === 'failed' && (item.error_reason || item.failure_type) ? (
                                      <div className="mt-2 truncate text-xs font-semibold text-rose-700" title={item.error_reason || item.failure_type}>
                                        {item.error_reason || item.failure_type}
                                      </div>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="whitespace-nowrap px-4 py-4"><B2SStatusBadge status={item.status} /></td>
                                <td className="whitespace-nowrap px-4 py-4"><B2SPhaseBadge phase={item.phase} label={itemPhaseLabel} /></td>
                                <td className="px-4 py-4">
                                  <div className="min-w-[180px]">
                                    <div className="flex items-center justify-between gap-3 text-xs font-black text-slate-600">
                                      <span>{progressPresentation.mode || '实时进度'}</span>
                                      <span>{progressPresentation.label}</span>
                                    </div>
                                    <div className="mt-2">
                                      <B2SProgressBar value={progressValueItem} tone={item.status === 'success' || item.status === 'completed' ? 'emerald' : 'blue'} />
                                    </div>
                                    <div className="mt-2 truncate text-[11px] font-semibold text-slate-500" title={progressPresentation.description || ''}>
                                      {progressPresentation.description || '等待 worker 上报执行信息。'}
                                    </div>
                                  </div>
                                </td>
                                <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-slate-700">
                                  <span className="font-black text-slate-900">{progress?.completed_functions ?? 0}</span>
                                  <span className="text-slate-400"> / </span>
                                  <span>{progress?.total_functions ?? '-'}</span>
                                </td>
                                <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-slate-700">
                                  <span className="font-black text-slate-900">{progress?.completed_batches ?? 0}</span>
                                  <span className="text-slate-400"> / </span>
                                  <span>{progress?.total_batches ?? 0}</span>
                                </td>
                                <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-slate-700">{rowDuration}</td>
                                <td className="px-4 py-4">
                                  <div className="text-sm font-black text-slate-900">{itemGeneratedCount}</div>
                                  <div className="mt-1 text-[11px] font-semibold text-slate-500">{itemGeneratedCount ? '可预览' : '未生成'}</div>
                                </td>
                                <td className="px-4 py-4">
                                  <div className="flex min-w-[180px] flex-col items-stretch gap-2">
                                    {detail.mode === 'deep' && onOpenAdvanced && (
                                      <button
                                        type="button"
                                        onClick={() => onOpenAdvanced(item.id)}
                                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-100"
                                      >
                                        <Code2 size={14} />
                                        查看高级信息
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => setExpandedItems((current) => ({ ...current, [item.id]: !expanded }))}
                                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
                                    >
                                      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                      {expanded ? '收起明细' : '展开明细'}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {expanded && (
                                <tr className="bg-slate-50/70">
                                  <td colSpan={10} className="px-4 py-4">
                                    <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4">
                                      <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 md:flex-row md:items-center md:justify-between">
                                        <div>
                                          <div className="text-sm font-black text-slate-900">执行明细</div>
                                          <div className="mt-1 text-xs font-semibold text-slate-500">执行路径、阶段消息、运行统计与错误原文。</div>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700 ring-1 ring-slate-200">尝试 {progress?.current_attempt ?? '-'}</span>
                                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700 ring-1 ring-slate-200">当前函数 {progress?.current_function || '-'}</span>
                                        </div>
                                      </div>

                                      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                                        <div className="space-y-4">
                                          <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
                                            <div className="mb-3 flex items-center justify-between text-xs font-black text-slate-500">
                                              <span>ELF 阶段</span>
                                              <span>{itemPhaseLabel}</span>
                                            </div>
                                            <div className="grid grid-cols-7 gap-2">
                                              {STAGE_ORDER.map((stage, index) => {
                                                const active = itemTerminal ? stage === 'completed' && (item.status === 'success' || item.status === 'completed') : index === itemStageIndex;
                                                const done = itemTerminal ? (item.status === 'success' || item.status === 'completed') : index < itemStageIndex;
                                                const failedHere = (item.status === 'failed' || item.status === 'cancelled') && index === Math.max(0, itemStageIndex);
                                                return (
                                                  <div key={stage} className="min-w-0">
                                                    <div className={`h-1.5 rounded-full ${failedHere ? 'bg-rose-500' : active ? 'bg-blue-500' : done ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                                                    <div className={`mt-1.5 truncate text-center text-[10px] font-black ${failedHere ? 'text-rose-700' : active ? 'text-blue-700' : done ? 'text-emerald-700' : 'text-slate-400'}`}>{STAGE_LABELS[stage]}</div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>

                                          <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4">
                                            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">文件路径</div>
                                            <div className="mt-3 space-y-3">
                                              <div>
                                                <div className="text-[11px] font-black text-slate-400">输入 ELF</div>
                                                <div className="mt-1 break-all rounded-xl bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">{item.elf_path}</div>
                                              </div>
                                              <div>
                                                <div className="text-[11px] font-black text-slate-400">输出目录</div>
                                                <div className="mt-1 break-all rounded-xl bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">{item.output_dir || '-'}</div>
                                              </div>
                                            </div>
                                          </div>

                                          <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4">
                                            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">消息</div>
                                            <div className="mt-3 grid gap-3 lg:grid-cols-2">
                                              <div>
                                                <div className="text-[11px] font-black text-slate-400">阶段消息</div>
                                                <div className="mt-1 min-h-[44px] whitespace-pre-wrap break-words rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">{item.phase_message || '-'}</div>
                                              </div>
                                              <div>
                                                <div className="text-[11px] font-black text-slate-400">进度消息</div>
                                                <div className="mt-1 min-h-[44px] whitespace-pre-wrap break-words rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">{progress?.message || '-'}</div>
                                              </div>
                                            </div>
                                          </div>
                                        </div>

                                        <div className="space-y-4">
                                          <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4">
                                            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">运行统计</div>
                                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600">
                                              <div className="rounded-xl bg-slate-50 px-3 py-2">字节<br /><span className="font-black text-slate-900">{formatBytes(progress?.completed_bytes)} / {formatBytes(progress?.total_bytes)}</span></div>
                                              <div className="rounded-xl bg-slate-50 px-3 py-2">批次<br /><span className="font-black text-slate-900">{progress?.completed_batches ?? 0} / {progress?.total_batches ?? 0}</span></div>
                                              <div className="rounded-xl bg-slate-50 px-3 py-2">当前批次<br /><span className="font-black text-slate-900">{progress?.current_batch ?? '-'}</span></div>
                                              <div className="rounded-xl bg-slate-50 px-3 py-2">函数进度<br /><span className="font-black text-slate-900">{progress?.completed_functions ?? 0} / {progress?.total_functions ?? '-'}</span></div>
                                              <div className="rounded-xl bg-slate-50 px-3 py-2">开始时间<br /><span className="font-black text-slate-900">{formatDateTime(item.started_at)}</span></div>
                                              <div className="rounded-xl bg-slate-50 px-3 py-2">结束时间<br /><span className="font-black text-slate-900">{formatDateTime(item.finished_at)}</span></div>
                                            </div>
                                          </div>

                                          {(item.error_reason || item.failure_type) && (
                                            <div className="rounded-[1.25rem] border border-rose-200 bg-rose-50 p-4">
                                              <div className="text-xs font-black uppercase tracking-[0.18em] text-rose-400">错误原文</div>
                                              <div className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-white px-3 py-2 text-sm font-semibold text-rose-700">{item.error_reason || item.failure_type}</div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
};
