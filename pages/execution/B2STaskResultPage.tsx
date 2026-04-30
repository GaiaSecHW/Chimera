import React, { useEffect, useMemo, useState } from 'react';
import { B2SProgress, B2STaskDetail } from '../../clients/binaryToSource';
import { api } from '../../clients/api';
import { B2SCompactTable } from './B2SCompactTable';
import { B2SStatsHeader, B2SStats, emptyB2SStats, summarizeB2STasks } from './B2SStatsHeader';

interface Props {
  projectId: string;
}

const terminalStatuses = new Set(['completed', 'failed', 'cancelled', 'partial']);

const phaseColors: Record<string, string> = {
  queued: 'bg-slate-100 text-slate-700 ring-slate-200',
  ida: 'bg-blue-50 text-blue-700 ring-blue-200',
  batching: 'bg-purple-50 text-purple-700 ring-purple-200',
  header: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  body: 'bg-amber-50 text-amber-700 ring-amber-200',
  merge: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  failed: 'bg-red-50 text-red-700 ring-red-200',
  cancelled: 'bg-slate-100 text-slate-500 ring-slate-200',
};

const formatBytes = (value?: number) => {
  if (value === undefined || value === null || Number.isNaN(value)) return '-';
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB'];
  let n = value / 1024;
  let idx = 0;
  while (n >= 1024 && idx < units.length - 1) {
    n /= 1024;
    idx += 1;
  }
  return `${n.toFixed(n >= 10 ? 1 : 2)} ${units[idx]}`;
};

const pct = (value?: number) => Math.max(0, Math.min(100, Number(value || 0)));

const PhaseBadge: React.FC<{ phase?: string; label?: string }> = ({ phase, label }) => {
  const key = phase || 'queued';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-black ring-1 ${phaseColors[key] || 'bg-slate-100 text-slate-700 ring-slate-200'}`}>
      {label || phase || '-'}
    </span>
  );
};

const MiniProgress: React.FC<{ value?: number }> = ({ value }) => (
  <div className="mt-1 h-1.5 w-36 rounded-full bg-slate-100 overflow-hidden">
    <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct(value)}%` }} />
  </div>
);

const ProgressSummary: React.FC<{ progress?: B2SProgress }> = ({ progress }) => {
  if (!progress) return <span className="text-slate-400">-</span>;
  const percent = progress.percent ?? progress.batches_percent ?? progress.bytes_percent ?? 0;
  return (
    <div className="min-w-[220px] space-y-1 text-[11px] text-slate-600">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-slate-800">总体 {pct(percent).toFixed(1)}%</span>
        <span>尝试 {progress.current_attempt ?? '-'}</span>
      </div>
      <MiniProgress value={percent} />
      <div>函数：{progress.completed_functions ?? '-'} / {progress.total_functions ?? '-'}</div>
      <div>大小：{formatBytes(progress.completed_bytes)} / {formatBytes(progress.total_bytes)}</div>
      <div>批次：{progress.completed_batches ?? '-'} / {progress.total_batches ?? '-'} 当前 {progress.current_batch ?? '-'}</div>
      {progress.message && <div className="max-w-[360px] truncate text-slate-500" title={progress.message}>{progress.message}</div>}
    </div>
  );
};

export const B2STaskResultPage: React.FC<Props> = ({ projectId }) => {
  const executionApi = api.domains.execution;
  const [taskId, setTaskId] = useState('');
  const [detail, setDetail] = useState<B2STaskDetail | null>(null);
  const [projectStats, setProjectStats] = useState<B2SStats>(emptyB2SStats());
  const [error, setError] = useState('');

  const loadProjectStats = async () => {
    if (!projectId) return;
    try {
      const data = await executionApi.binaryToSource.listTasks(projectId);
      setProjectStats(summarizeB2STasks(data.items || []));
    } catch (_e) {
      setProjectStats(emptyB2SStats());
    }
  };

  const loadTask = async () => {
    if (!projectId || !taskId.trim()) return;
    setError('');
    try {
      const data = await executionApi.binaryToSource.getTask(projectId, taskId.trim());
      setDetail(data);
    } catch (e: any) {
      setError(e?.message || '查询失败');
      setDetail(null);
    }
  };

  useEffect(() => {
    if (!projectId) return;
    void loadProjectStats();
    const timer = window.setInterval(() => {
      const shouldRefreshTask = !!taskId.trim() && (!detail || !terminalStatuses.has(detail.status));
      if (shouldRefreshTask) void loadTask();
      void loadProjectStats();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [projectId, taskId, detail?.status]);

  const currentStats = useMemo<B2SStats>(() => {
    if (!detail) return projectStats;
    return {
      taskCount: 1,
      totalItems: detail.total_items || 0,
      pendingItems: detail.pending_items || 0,
      queuedItems: detail.queued_items || 0,
      runningItems: detail.running_items || 0,
      successItems: detail.success_items || 0,
      partialItems: detail.partial_items || 0,
      failedItems: detail.failed_items || 0,
      cancelledItems: detail.cancelled_items || 0,
    };
  }, [detail, projectStats]);

  const rows = useMemo(() => (detail?.items || []).map((it) => [
    it.sequence_no,
    <div className="max-w-[320px] truncate" title={it.elf_path}>{it.elf_path}</div>,
    it.status,
    <PhaseBadge phase={it.phase} label={it.phase_label} />,
    <ProgressSummary progress={it.progress} />,
    it.failure_type || '-',
    <div className="max-w-[300px] truncate text-red-600" title={it.error_reason || ''}>{it.error_reason || '-'}</div>,
    <div className="max-w-[360px] whitespace-normal break-all">{(it.generated_files || []).join('\n') || '-'}</div>,
  ]), [detail]);

  const overall = detail?.overall_progress;

  return (
    <div className="p-4 space-y-3">
      <h2 className="text-sm font-bold text-slate-800">代码逆向还原引擎 / 结果查询</h2>
      <B2SStatsHeader stats={currentStats} title={detail ? '当前任务统计' : '项目任务统计'} />
      {overall && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
          <div className="flex flex-wrap items-center gap-4">
            <div className="font-black text-slate-900">整体进度 {pct(overall.percent).toFixed(1)}%</div>
            <div>Item：{overall.completed_items}/{overall.total_items}</div>
            <div>函数：{overall.completed_functions ?? '-'}/{overall.total_functions ?? '-'}</div>
            <div>大小：{formatBytes(overall.completed_bytes)} / {formatBytes(overall.total_bytes)}</div>
            <div>批次：{overall.completed_batches ?? '-'}/{overall.total_batches ?? '-'}</div>
          </div>
          <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct(overall.percent)}%` }} />
          </div>
          {overall.phase_summary && (
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(overall.phase_summary).map(([phase, count]) => <PhaseBadge key={phase} phase={phase} label={`${phase}: ${count}`} />)}
            </div>
          )}
        </div>
      )}
      <div className="flex gap-2">
        <input value={taskId} onChange={(e) => setTaskId(e.target.value)} placeholder="输入任务ID" className="flex-1 px-2 py-2 border rounded text-xs" />
        <button onClick={() => void loadTask()} className="px-3 py-1.5 rounded bg-blue-600 text-white text-xs font-semibold">查询</button>
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
      <B2SCompactTable
        headers={['序号', 'ELF路径', '状态', '阶段', 'RE进度', '失败类型', '失败原因', '输出文件']}
        rows={rows}
      />
    </div>
  );
};
