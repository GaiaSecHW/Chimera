import React, { useEffect, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import { ArrowLeft, ChevronDown, ChevronRight, Code2, FileText, Loader2, RefreshCw, RotateCcw, Trash2, XCircle } from 'lucide-react';

import { B2STaskDetail } from '../../clients/binaryToSource';
import { api } from '../../clients/api';
import { showConfirm } from '../../components/DialogService';
import { B2SPhaseBadge, B2SProgressBar, B2SStatusBadge, B2S_TERMINAL_STATUSES, formatBytes, formatDateTime, pct } from './b2sPresentation';
import { hasBinarySecurityReturnContext, navigateBackToBinarySecurityTask } from '../../utils/executionReturnContext';
import { TaskOriginCard } from './taskOrigin';

interface Props {
  projectId: string;
  taskId: string;
  onBack: () => void;
}

type B2SItem = B2STaskDetail['items'][number];

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

const phaseAwareProgressValue = (phase: string, numericPercent: number, progress?: B2SItem['progress'] | null) => {
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
  const numeric = progress?.percent ?? progress?.batches_percent ?? progress?.bytes_percent;
  if (hasNumericProgress(progress)) {
    const value = phaseAwareProgressValue(phase, Number(numeric || 0), progress);
    return {
      value,
      label: `${value.toFixed(1)}%`,
      mode: '',
      estimated: false,
      description: progress?.message || PHASE_DESCRIPTIONS[phase] || '',
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
  return 'border-slate-200 bg-slate-50 text-slate-900';
};

const MetricCard: React.FC<{ label: string; value: string | number; hint?: string; tone?: string }> = ({ label, value, hint, tone = 'slate' }) => (
  <div className={`rounded-2xl border px-4 py-3 ${metricToneClass(tone)}`}>
    <div className="text-[11px] font-black uppercase tracking-[0.18em] opacity-55">{label}</div>
    <div className="mt-1 text-2xl font-black tracking-tight">{value}</div>
    {hint ? <div className="mt-1 truncate text-xs font-semibold opacity-60" title={hint}>{hint}</div> : null}
  </div>
);

export const B2STaskDetailPage: React.FC<Props> = ({ projectId, taskId, onBack }) => {
  const executionApi = api.domains.execution;
  const [detail, setDetail] = useState<B2STaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<string>('');
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [selectedResultPath, setSelectedResultPath] = useState<string>('');
  const [previewContent, setPreviewContent] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const hasReturnContext = hasBinarySecurityReturnContext();
  const handleBack = () => {
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
      setLastRefreshAt(new Date().toLocaleTimeString());
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
    const summary = overall?.phase_summary || {};
    const [phase] = Object.entries(summary).sort((a, b) => b[1] - a[1])[0] || [];
    return phase || detail?.items.find((item) => !B2S_TERMINAL_STATUSES.has(item.status))?.phase || detail?.status || '';
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
  const progressValue = terminal && (detail?.success_items || 0) + (detail?.partial_items || 0) === (detail?.total_items || 0)
    ? 100
    : derivedOverall;
  const progressModeLabel = !terminal && itemProgressValues.some((item) => item.estimated) ? '阶段估算' : '';

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
          <div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-500">
            {terminal ? '已停止自动刷新' : '自动刷新中 · 每 5 秒'}{lastRefreshAt ? ` · 最后刷新 ${lastRefreshAt}` : ''}
          </div>
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
            <div className="bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_55%,#eef6ff_100%)] p-7">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <B2SStatusBadge status={detail.status} />
                    {showTopPhaseBadge && <B2SPhaseBadge phase={dominantPhase} label={phaseLabel} />}
                  </div>
                  <h1 className="mt-4 break-words text-3xl font-black tracking-tight text-slate-950">{detail.name || detail.id}</h1>
                  <div className="mt-3 text-xs font-semibold text-slate-500">
                    <span className="font-mono">任务 ID：{detail.id}</span>
                  </div>
                </div>

                <div className="grid w-full gap-3 sm:grid-cols-2 xl:w-[360px]">
                  <div className="rounded-2xl border border-white/70 bg-white/75 px-4 py-3 shadow-sm">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">创建时间</div>
                    <div className="mt-1 text-sm font-black text-slate-800">{formatDateTime(detail.created_at)}</div>
                  </div>
                  <div className="rounded-2xl border border-white/70 bg-white/75 px-4 py-3 shadow-sm">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">更新时间</div>
                    <div className="mt-1 text-sm font-black text-slate-800">{formatDateTime(detail.updated_at)}</div>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
                <MetricCard label="总进度" value={`${pct(progressValue).toFixed(1)}%`} hint={progressModeLabel} tone={statusTone(detail)} />
                <MetricCard label="ELF" value={`${overall?.completed_items ?? detail.success_items + detail.partial_items}/${overall?.total_items ?? detail.total_items}`} hint="已完成 / 总数" tone="blue" />
                <MetricCard label="函数" value={`${completedFunctions}/${totalFunctions || '-'}`} hint="已还原 / 总数" tone="emerald" />
                <MetricCard label="失败" value={detail.failed_items || 0} hint={detail.failed_items ? '需要处理' : '无异常'} tone={detail.failed_items ? 'rose' : 'slate'} />
                <MetricCard label="本轮耗时" value={taskRunDuration(detail, clockNow)} hint={terminal ? undefined : '实时计时中'} tone="slate" />
              </div>
              <div className="mt-5">
                <TaskOriginCard origin={detail} />
              </div>

              <div className="mt-5">
                <B2SProgressBar value={progressValue} tone={statusTone(detail) === 'emerald' ? 'emerald' : 'blue'} />
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-100 bg-white px-7 py-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="text-sm font-semibold text-slate-500">
                {generatedFiles.length > 0 ? `已生成 ${generatedFiles.length} 个结果文件。` : detail.failed_items ? '请查看失败诊断或展开 item 详情。' : '结果文件生成后会显示在这里。'}
              </div>
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

      {detail && generatedFiles.length > 0 && (
        <section id="b2s-results" className="overflow-hidden rounded-[2rem] border border-emerald-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-emerald-100 bg-emerald-50/70 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <h2 className="text-xl font-black text-slate-900">还原结果</h2>
            <div className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-emerald-700 shadow-sm">{generatedFiles.length} 个文件</div>
          </div>
          <div className="grid min-h-[520px] grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
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
                        <div className="truncate text-sm font-black text-slate-900" title={fileNameOf(path)}>{fileNameOf(path)}</div>
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
      )}

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="border-b border-slate-100 pb-4">
          <h2 className="text-xl font-black text-slate-900">二进制文件执行详情</h2>
        </div>

        {!detail ? (
          <div className="py-10 text-center text-sm text-slate-400">暂无详情数据</div>
        ) : detail.items.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">当前任务没有可展示的 item。</div>
        ) : (
          <div className="mt-5 space-y-4">
            {detail.items.map((item) => {
              const progress = item.progress;
              const progressPresentation = itemPresentations[item.id] || itemProgressPresentation(item);
              const progressValueItem = progressPresentation.value;
              const expanded = expandedItems[item.id] ?? !(item.status === 'success' || item.status === 'completed');
              const itemGeneratedCount = item.generated_files?.length || 0;
              const itemPhaseLabel = formatPhaseLabel(item.phase, item.phase_label);
              return (
                <article key={item.id} className={`rounded-[1.5rem] border bg-white p-5 ${item.status === 'failed' ? 'border-rose-200' : 'border-slate-200'}`}>
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-black text-slate-900">#{item.sequence_no}</div>
                        <div className="min-w-0 truncate text-lg font-black text-slate-900" title={item.elf_path}>{fileNameOf(item.elf_path)}</div>
                        <B2SStatusBadge status={item.status} />
                        <B2SPhaseBadge phase={item.phase} label={itemPhaseLabel} />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                        <MetricCard label="函数" value={`${progress?.completed_functions ?? 0}/${progress?.total_functions ?? '-'}`} tone="emerald" />
                        <MetricCard label="进度" value={progressPresentation.label} hint={progressPresentation.mode} tone={item.status === 'failed' ? 'rose' : 'blue'} />
                        <MetricCard label="耗时" value={item.finished_at ? formatDuration(item.started_at, item.finished_at) : formatDurationMs(item.started_at ? clockNow - parseBackendTimeMs(item.started_at) : null)} tone="slate" />
                        <MetricCard label="结果文件" value={itemGeneratedCount} tone={itemGeneratedCount ? 'emerald' : 'slate'} />
                      </div>
                      {item.status === 'failed' && (
                        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
                          失败原因：{item.error_reason || item.failure_type || '未知错误'}
                        </div>
                      )}
                    </div>

                    <div className="w-full xl:max-w-[300px]">
                      <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-bold text-slate-700">当前进度</div>
                          <div className="text-right text-sm font-black text-slate-900">
                            {progressPresentation.label}
                            {progressPresentation.mode ? <div className="mt-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{progressPresentation.mode}</div> : null}
                          </div>
                        </div>
                        <div className="mt-3">
                          <B2SProgressBar value={progressValueItem} />
                        </div>
                        <div className="mt-4 text-xs font-semibold leading-6 text-slate-500">
                          <div>当前阶段：<span className="text-slate-700">{itemPhaseLabel}</span></div>
                          <div className="leading-5 text-slate-600">{progressPresentation.description}</div>
                          <div>当前函数：<span className="text-slate-700">{progress?.current_function || '-'}</span></div>
                          <div>更新时间：<span className="text-slate-700">{formatDateTime(item.finished_at || detail.updated_at)}</span></div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setExpandedItems((current) => ({ ...current, [item.id]: !expanded }))}
                          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
                        >
                          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          {expanded ? '收起高级信息' : '展开高级信息'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {expanded && (
                    <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                      <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                        <div className="text-sm font-black text-slate-800">路径与执行参数</div>
                        <div className="mt-3 space-y-3 text-sm text-slate-600">
                          <div>
                            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">输入文件</div>
                            <div className="mt-1 break-all rounded-xl bg-white px-3 py-2 font-mono text-xs text-slate-700">{item.elf_path}</div>
                          </div>
                          <div>
                            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">输出目录</div>
                            <div className="mt-1 break-all rounded-xl bg-white px-3 py-2 font-mono text-xs text-slate-700">{item.output_dir || '-'}</div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">开始时间</div>
                              <div className="mt-1 font-bold text-slate-800">{formatDateTime(item.started_at)}</div>
                            </div>
                            <div>
                              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">结束时间</div>
                              <div className="mt-1 font-bold text-slate-800">{formatDateTime(item.finished_at)}</div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                        <div className="text-sm font-black text-slate-800">高级执行信息</div>
                        <div className="mt-3 space-y-3 text-sm text-slate-600">
                          <div className="grid grid-cols-2 gap-3">
                            <div>字节：<span className="font-bold text-slate-800">{formatBytes(progress?.completed_bytes)} / {formatBytes(progress?.total_bytes)}</span></div>
                            <div>批次：<span className="font-bold text-slate-800">{progress?.completed_batches ?? 0} / {progress?.total_batches ?? 0}</span></div>
                            <div>当前批次：<span className="font-bold text-slate-800">{progress?.current_batch ?? '-'}</span></div>
                            <div>尝试次数：<span className="font-bold text-slate-800">{progress?.current_attempt ?? '-'}</span></div>
                          </div>
                          <div>
                            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">阶段消息</div>
                            <div className="mt-1 whitespace-pre-wrap break-words rounded-xl bg-white px-3 py-2 text-slate-700">{item.phase_message || '-'}</div>
                          </div>
                          <div>
                            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">进度消息</div>
                            <div className="mt-1 whitespace-pre-wrap break-words rounded-xl bg-white px-3 py-2 text-slate-700">{progress?.message || '-'}</div>
                          </div>
                          {(item.error_reason || item.failure_type) && (
                            <div>
                              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">错误原文</div>
                              <div className="mt-1 whitespace-pre-wrap break-words rounded-xl bg-white px-3 py-2 text-rose-700">{item.error_reason || item.failure_type}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
