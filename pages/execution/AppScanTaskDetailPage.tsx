import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Coins, Loader2, Pause, Play, Trash2 } from 'lucide-react';

import type { AppScanPhaseProgress, AppScanStatus, AppScanTask } from '../../clients/appScan';
import { appScanApi } from '../../clients/appScan';
import { showConfirm } from '../../components/DialogService';

// ---------------------------------------------------------------------------
//  Props
// ---------------------------------------------------------------------------
interface Props {
  projectId: string;
  toolTaskId: string;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------
const ACTIVE_STATUSES = new Set<AppScanStatus>(['pending', 'decompiling', 'running']);
const POLL_INTERVAL_MS = 3000;

const statusTone = (status: string) => {
  switch (status) {
    case 'completed':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'failed':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'running':
      return 'bg-sky-50 text-sky-700 border-sky-200';
    case 'decompiling':
      return 'bg-violet-50 text-violet-700 border-violet-200';
    case 'paused':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'pending':
      return 'bg-slate-100 text-slate-500 border-slate-200';
    default:
      return 'bg-blue-50 text-blue-700 border-blue-200';
  }
};

const statusLabel = (status: string) => {
  const map: Record<string, string> = {
    pending: '等待中',
    decompiling: '反编译中',
    running: '扫描中',
    paused: '已暂停',
    completed: '已完成',
    failed: '失败',
  };
  return map[status] || status;
};

const fmtTimestamp = (value?: number | null) => {
  if (!value) return '-';
  return new Date(value * 1000).toLocaleString();
};

const phaseLabel = (phase: string) => {
  const map: Record<string, string> = {
    detection: '检测',
    mining: '挖掘',
    validation: '验证',
  };
  return map[phase] || phase;
};

const phaseColor = (index: number) => {
  const colors = ['text-violet-600', 'text-sky-600', 'text-emerald-600'];
  return colors[index % colors.length];
};

const phaseBorderColor = (index: number) => {
  const colors = ['border-violet-200', 'border-sky-200', 'border-emerald-200'];
  return colors[index % colors.length];
};

const fmtTokens = (value: number) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
};

// ---------------------------------------------------------------------------
//  Sub-components
// ---------------------------------------------------------------------------

const PhaseCard: React.FC<{ phase: string; progress: AppScanPhaseProgress; index: number }> = ({ phase, progress, index }) => {
  const { total, pending, running, success, failed } = progress;
  const completedPercent = total > 0 ? Math.round(((success + failed) / total) * 100) : 0;

  return (
    <div className={`rounded-xl border ${phaseBorderColor(index)} bg-white p-4`}>
      <div className="flex items-center justify-between">
        <h4 className={`text-sm font-black ${phaseColor(index)}`}>{phaseLabel(phase)}</h4>
        <span className="text-xs font-bold text-slate-400">{completedPercent}%</span>
      </div>

      {/* Progress bar */}
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        {total > 0 && (
          <div className="flex h-full">
            {success > 0 && (
              <div className="bg-emerald-400 transition-all" style={{ width: `${(success / total) * 100}%` }} />
            )}
            {running > 0 && (
              <div className="bg-sky-400 transition-all" style={{ width: `${(running / total) * 100}%` }} />
            )}
            {failed > 0 && (
              <div className="bg-rose-400 transition-all" style={{ width: `${(failed / total) * 100}%` }} />
            )}
          </div>
        )}
      </div>

      {/* Counts */}
      <div className="mt-3 grid grid-cols-5 gap-1 text-center">
        <div>
          <div className="text-xs font-bold text-slate-900">{total}</div>
          <div className="text-[10px] text-slate-400">总计</div>
        </div>
        <div>
          <div className="text-xs font-bold text-slate-500">{pending}</div>
          <div className="text-[10px] text-slate-400">等待</div>
        </div>
        <div>
          <div className="text-xs font-bold text-sky-600">{running}</div>
          <div className="text-[10px] text-slate-400">运行</div>
        </div>
        <div>
          <div className="text-xs font-bold text-emerald-600">{success}</div>
          <div className="text-[10px] text-slate-400">成功</div>
        </div>
        <div>
          <div className="text-xs font-bold text-rose-600">{failed}</div>
          <div className="text-[10px] text-slate-400">失败</div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
//  Main Component
// ---------------------------------------------------------------------------
export const AppScanTaskDetailPage: React.FC<Props> = ({ projectId, toolTaskId, onBack }) => {
  const [task, setTask] = useState<AppScanTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const mountedRef = useRef(true);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Load task ----
  const load = useCallback(async () => {
    if (!toolTaskId) return;
    setError(null);
    try {
      const data = await appScanApi.getTask(toolTaskId);
      if (!mountedRef.current) return;
      setTask(data);
    } catch (e: any) {
      if (!mountedRef.current) return;
      setError(e?.message || '加载失败');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [toolTaskId]);

  // Initial load
  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    void load();
    return () => {
      mountedRef.current = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [load]);

  // Auto-poll for active tasks
  useEffect(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (task && ACTIVE_STATUSES.has(task.status)) {
      pollTimerRef.current = setTimeout(() => {
        void load();
      }, POLL_INTERVAL_MS);
    }
  }, [task, load]);

  // ---- Actions ----
  const handlePause = async () => {
    setActionLoading(true);
    try {
      await appScanApi.pauseTask(toolTaskId);
      await load();
    } catch (e: any) {
      alert(e?.message || '暂停失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResume = async () => {
    setActionLoading(true);
    try {
      await appScanApi.resumeTask(toolTaskId);
      await load();
    } catch (e: any) {
      alert(e?.message || '恢复失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = await showConfirm({ title: '确认删除', message: `确定要删除任务 ${toolTaskId} 吗？此操作不可恢复。` });
    if (!confirmed) return;
    setActionLoading(true);
    try {
      await appScanApi.deleteTask(toolTaskId);
      onBack();
    } catch (e: any) {
      alert(e?.message || '删除失败');
      setActionLoading(false);
    }
  };

  const isActive = task ? ACTIVE_STATUSES.has(task.status) : false;
  const isPaused = task?.status === 'paused';
  const isTerminal = task ? !isActive && !isPaused : false;

  const phases = useMemo(() => {
    if (!task?.progress?.phases) return [];
    return Object.entries(task.progress.phases).map(([name, progress]) => ({
      name,
      progress,
    }));
  }, [task]);

  const tokenUsage = task?.token_usage;

  // ---- Render ----
  return (
    <div className="px-8 pb-10 pt-8 space-y-6">
      {/* Header */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onBack}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <ArrowLeft size={18} />
              </button>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-600">App Security</p>
                <h1 className="text-xl font-black text-slate-900">应用扫描详情</h1>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <span className="font-mono text-xs text-slate-500">{toolTaskId}</span>
              {task && (
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${statusTone(task.status)}`}>
                  {isActive && <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />}
                  {statusLabel(task.status)}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {(isActive) && (
              <button
                type="button"
                onClick={() => void handlePause()}
                disabled={actionLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-700 shadow-sm hover:bg-amber-100 disabled:opacity-60"
              >
                {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Pause size={14} />}
                暂停
              </button>
            )}
            {isPaused && (
              <button
                type="button"
                onClick={() => void handleResume()}
                disabled={actionLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 shadow-sm hover:bg-emerald-100 disabled:opacity-60"
              >
                {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                恢复
              </button>
            )}
            {!isTerminal && (
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={actionLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700 shadow-sm hover:bg-rose-100 disabled:opacity-60"
              >
                <Trash2 size={14} />
                删除
              </button>
            )}
            {isTerminal && (
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={actionLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-60"
              >
                <Trash2 size={14} />
                删除
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
          <Loader2 size={18} className="animate-spin" />
          加载任务详情...
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      {/* Task error from backend */}
      {!loading && task?.error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          错误信息: {task.error}
        </div>
      )}

      {/* Task info */}
      {!loading && task && (
        <>
          {/* Timeline */}
          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-slate-900">时间线</h2>
            <div className="mt-4 grid grid-cols-3 gap-4">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="text-xs font-bold text-slate-500">创建时间</div>
                <div className="mt-1 text-sm font-semibold text-slate-700">{fmtTimestamp(task.created_at)}</div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="text-xs font-bold text-slate-500">开始时间</div>
                <div className="mt-1 text-sm font-semibold text-slate-700">{fmtTimestamp(task.started_at)}</div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="text-xs font-bold text-slate-500">完成时间</div>
                <div className="mt-1 text-sm font-semibold text-slate-700">{fmtTimestamp(task.completed_at)}</div>
              </div>
            </div>
          </section>

          {/* Three-phase progress */}
          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-900">三阶段进度</h2>
              {isActive && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-bold text-sky-600">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />
                  实时更新
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-500">检测 → 挖掘 → 验证</p>
            {phases.length > 0 ? (
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                {phases.map((phase, idx) => (
                  <PhaseCard key={phase.name} phase={phase.name} progress={phase.progress} index={idx} />
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-sm text-slate-400">
                暂无阶段进度数据
              </div>
            )}
          </section>

          {/* Token usage */}
          {tokenUsage && (
            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <Coins size={18} className="text-amber-500" />
                <h2 className="text-lg font-black text-slate-900">Token 用量</h2>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <div className="text-xs font-bold text-slate-500">Input Tokens</div>
                  <div className="mt-1 text-xl font-black text-slate-900">{fmtTokens(tokenUsage.input)}</div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <div className="text-xs font-bold text-slate-500">Cache Read</div>
                  <div className="mt-1 text-xl font-black text-slate-900">{fmtTokens(tokenUsage.cache_read)}</div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <div className="text-xs font-bold text-slate-500">Output Tokens</div>
                  <div className="mt-1 text-xl font-black text-slate-900">{fmtTokens(tokenUsage.output)}</div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <div className="text-xs font-bold text-slate-500">费用 (Cost)</div>
                  <div className="mt-1 text-xl font-black text-slate-900">${typeof tokenUsage.cost === 'number' ? tokenUsage.cost.toFixed(4) : '0.0000'}</div>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};
