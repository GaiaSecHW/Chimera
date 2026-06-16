import React from 'react';
import { B2STask } from '../../clients/binaryToSource';

// LOKI design tokens (DESIGN.md) — page-local palette.
const LK = {
  primary: '#4f73ff',
  primarySoft: '#7590ff',
  primaryDeep: '#3f63f1',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: '#070d18',
  surface: '#111a2b',
  surfaceRaised: '#18233a',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: '#26324a',
  borderSoft: '#1b2438',
  ink: '#f5f7ff',
  inkSoft: '#d6def0',
  body: '#a4aec4',
  muted: '#72809a',
  mutedSoft: '#8b95a8',
  success: '#45c06f',
  warning: '#d5a13a',
  error: '#f15d5d',
  info: '#4f8cff',
} as const;

export interface B2SStats {
  taskCount: number;
  totalItems: number;
  pendingItems: number;
  queuedItems: number;
  runningItems: number;
  cancellingItems: number;
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
  cancellingItems: 0,
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
      cancellingItems: acc.cancellingItems + (task.cancelling_items || 0),
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
  <div
    className="rounded-xl px-3 py-2.5"
    style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
  >
    <div className="truncate text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: LK.muted }} title={label}>{label}</div>
    <div className="mt-1 text-lg font-semibold tracking-tight" style={{ color: LK.ink }}>{value}</div>
  </div>
);

export const B2SStatsHeader: React.FC<Props> = ({ stats, title = '基础统计' }) => {
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold" style={{ color: LK.inkSoft }}>{title}</div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6 xl:grid-cols-11">
        <StatCard label="任务数" value={stats.taskCount} />
        <StatCard label="总ELF" value={stats.totalItems} />
        <StatCard label="待处理" value={stats.pendingItems} />
        <StatCard label="排队中" value={stats.queuedItems} />
        <StatCard label="运行中" value={stats.runningItems} />
        <StatCard label="取消中" value={stats.cancellingItems} />
        <StatCard label="成功" value={stats.successItems} />
        <StatCard label="部分成功" value={stats.partialItems} />
        <StatCard label="失败" value={stats.failedItems} />
        <StatCard label="已取消" value={stats.cancelledItems} />
        <StatCard label="已完成项" value={stats.successItems + stats.partialItems} />
      </div>
    </div>
  );
};
