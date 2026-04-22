import React from 'react';
import { B2STask } from '../../clients/binaryToSource';

export interface B2SStats {
  taskCount: number;
  totalItems: number;
  pendingItems: number;
  queuedItems: number;
  runningItems: number;
  successItems: number;
  partialItems: number;
  failedItems: number;
  cancelledItems: number;
}

export const emptyB2SStats = (): B2SStats => ({
  taskCount: 0,
  totalItems: 0,
  pendingItems: 0,
  queuedItems: 0,
  runningItems: 0,
  successItems: 0,
  partialItems: 0,
  failedItems: 0,
  cancelledItems: 0,
});

export const summarizeB2STasks = (tasks: B2STask[]): B2SStats => {
  return tasks.reduce<B2SStats>(
    (acc, task) => ({
      taskCount: acc.taskCount + 1,
      totalItems: acc.totalItems + (task.total_items || 0),
      pendingItems: acc.pendingItems + (task.pending_items || 0),
      queuedItems: acc.queuedItems + (task.queued_items || 0),
      runningItems: acc.runningItems + (task.running_items || 0),
      successItems: acc.successItems + (task.success_items || 0),
      partialItems: acc.partialItems + (task.partial_items || 0),
      failedItems: acc.failedItems + (task.failed_items || 0),
      cancelledItems: acc.cancelledItems + (task.cancelled_items || 0),
    }),
    emptyB2SStats()
  );
};

interface Props {
  stats: B2SStats;
  title?: string;
}

const StatCard: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="rounded border border-slate-200 bg-white px-2 py-2">
    <div className="text-[11px] text-slate-500">{label}</div>
    <div className="text-sm font-bold text-slate-800">{value}</div>
  </div>
);

export const B2SStatsHeader: React.FC<Props> = ({ stats, title = '基础统计' }) => {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-slate-700">{title}</div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <StatCard label="任务数" value={stats.taskCount} />
        <StatCard label="总ELF" value={stats.totalItems} />
        <StatCard label="待处理" value={stats.pendingItems} />
        <StatCard label="排队中" value={stats.queuedItems} />
        <StatCard label="运行中" value={stats.runningItems} />
        <StatCard label="成功" value={stats.successItems} />
        <StatCard label="部分成功" value={stats.partialItems} />
        <StatCard label="失败" value={stats.failedItems} />
        <StatCard label="已取消" value={stats.cancelledItems} />
        <StatCard label="已完成项" value={stats.successItems + stats.partialItems} />
      </div>
    </div>
  );
};

