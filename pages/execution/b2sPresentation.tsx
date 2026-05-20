import React from 'react';
import { B2SOverallProgress } from '../../clients/binaryToSource';

export const B2S_TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled', 'partial', 'success']);

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  queued: 'bg-slate-100 text-slate-700 ring-slate-200',
  running: 'bg-blue-50 text-blue-700 ring-blue-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  partial: 'bg-violet-50 text-violet-700 ring-violet-200',
  failed: 'bg-rose-50 text-rose-700 ring-rose-200',
  cancelled: 'bg-slate-100 text-slate-500 ring-slate-200',
};

const STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  queued: '排队中',
  running: '运行中',
  completed: '已完成',
  success: '成功',
  partial: '部分成功',
  failed: '失败',
  cancelled: '已取消',
};

const PHASE_STYLES: Record<string, string> = {
  queued: 'bg-slate-100 text-slate-700 ring-slate-200',
  ida: 'bg-blue-50 text-blue-700 ring-blue-200',
  batching: 'bg-violet-50 text-violet-700 ring-violet-200',
  header: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  body: 'bg-amber-50 text-amber-700 ring-amber-200',
  merge: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  failed: 'bg-rose-50 text-rose-700 ring-rose-200',
  cancelled: 'bg-slate-100 text-slate-500 ring-slate-200',
};

export const formatB2SStatus = (status?: string) => STATUS_LABELS[status || ''] || status || '-';

export const formatBytes = (value?: number | null) => {
  if (value === undefined || value === null || Number.isNaN(value)) return '-';
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let next = value / 1024;
  let idx = 0;
  while (next >= 1024 && idx < units.length - 1) {
    next /= 1024;
    idx += 1;
  }
  return `${next.toFixed(next >= 10 ? 1 : 2)} ${units[idx]}`;
};

export const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

export const pct = (value?: number | null) => Math.max(0, Math.min(100, Number(value || 0)));

export const formatB2SOverallProgressBasis = (basis?: string | null) => {
  switch (String(basis || '').trim().toLowerCase()) {
    case 'functions':
      return '按函数';
    case 'batches':
      return '按批次';
    case 'bytes':
      return '按字节';
    case 'items':
      return '按 ELF';
    default:
      return '按任务';
  }
};

export const formatB2SOverallProgressSummary = (overall?: B2SOverallProgress | null) => {
  const value = pct(overall?.percent);
  const basisLabel = formatB2SOverallProgressBasis(overall?.percent_basis);
  return `${value.toFixed(1)}% · ${basisLabel}`;
};

export const B2SStatusBadge: React.FC<{ status?: string; className?: string }> = ({ status, className = '' }) => (
  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ring-1 ${STATUS_STYLES[status || ''] || 'bg-slate-100 text-slate-700 ring-slate-200'} ${className}`.trim()}>
    {formatB2SStatus(status)}
  </span>
);

export const B2SPhaseBadge: React.FC<{ phase?: string; label?: string }> = ({ phase, label }) => (
  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ring-1 ${PHASE_STYLES[phase || ''] || 'bg-slate-100 text-slate-700 ring-slate-200'}`}>
    {label || phase || '-'}
  </span>
);

export const B2SProgressBar: React.FC<{ value?: number | null; tone?: 'blue' | 'emerald' }> = ({ value, tone = 'blue' }) => (
  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
    <div
      className={`h-full rounded-full ${tone === 'emerald' ? 'bg-emerald-500' : 'bg-blue-500'}`}
      style={{ width: `${pct(value)}%` }}
    />
  </div>
);
