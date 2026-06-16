import React from 'react';
import { B2SOverallProgress } from '../../clients/binaryToSource';

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
  critical: '#ff4d4f',
  high: '#ff8b3d',
  medium: '#f0b64c',
  low: '#49c5ff',
} as const;

export const B2S_TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled', 'partial', 'success']);

const STATUS_STYLES: Record<string, { bg: string; color: string; ring: string }> = {
  pending: { bg: LK.warning + '14', color: LK.warning, ring: LK.warning + '40' },
  queued: { bg: LK.surfaceRaised, color: LK.body, ring: LK.border },
  running: { bg: LK.info + '14', color: LK.info, ring: LK.info + '40' },
  cancelling: { bg: LK.warning + '14', color: LK.warning, ring: LK.warning + '40' },
  completed: { bg: LK.success + '14', color: LK.success, ring: LK.success + '40' },
  success: { bg: LK.success + '14', color: LK.success, ring: LK.success + '40' },
  partial: { bg: LK.primarySoft + '14', color: LK.primarySoft, ring: LK.primarySoft + '40' },
  failed: { bg: LK.error + '14', color: LK.error, ring: LK.error + '40' },
  cancelled: { bg: LK.surfaceRaised, color: LK.muted, ring: LK.border },
};

const STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  queued: '排队中',
  running: '运行中',
  cancelling: '取消中',
  completed: '已完成',
  success: '成功',
  partial: '部分成功',
  failed: '失败',
  cancelled: '已取消',
};

const PHASE_STYLES: Record<string, { bg: string; color: string; ring: string }> = {
  queued: { bg: LK.surfaceRaised, color: LK.body, ring: LK.border },
  ida: { bg: LK.info + '14', color: LK.info, ring: LK.info + '40' },
  batching: { bg: LK.primarySoft + '14', color: LK.primarySoft, ring: LK.primarySoft + '40' },
  header: { bg: LK.low + '14', color: LK.low, ring: LK.low + '40' },
  body: { bg: LK.warning + '14', color: LK.warning, ring: LK.warning + '40' },
  merge: { bg: LK.primary + '14', color: LK.primary, ring: LK.primary + '40' },
  completed: { bg: LK.success + '14', color: LK.success, ring: LK.success + '40' },
  failed: { bg: LK.error + '14', color: LK.error, ring: LK.error + '40' },
  cancelled: { bg: LK.surfaceRaised, color: LK.muted, ring: LK.border },
};

export const formatB2SStatus = (status?: string) => STATUS_LABELS[status || ''] || status || '-';

export const formatBytes = (value?: number | null) => {
  if (value === undefined || value === null || Number.isNaN(value)) return '-';
  if (value < 1024) return`${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let next = value / 1024;
  let idx = 0;
  while (next >= 1024 && idx < units.length - 1) {
    next /= 1024;
    idx += 1;
  }
  return`${next.toFixed(next >= 10 ? 1 : 2)} ${units[idx]}`;
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
  return`${value.toFixed(1)}% · ${basisLabel}`;
};

export const B2SStatusBadge: React.FC<{ status?: string; className?: string }> = ({ status, className = '' }) => {
  const style = STATUS_STYLES[status || ''] || STATUS_STYLES.queued;
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${className || ''}`.trim()}
      style={{ backgroundColor: style.bg, color: style.color, border: `1px solid ${style.ring}` }}
    >
      {formatB2SStatus(status)}
    </span>
  );
};

export const B2SPhaseBadge: React.FC<{ phase?: string; label?: string }> = ({ phase, label }) => {
  const style = PHASE_STYLES[phase || ''] || PHASE_STYLES.queued;
  return (
    <span
      className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ backgroundColor: style.bg, color: style.color, border: `1px solid ${style.ring}` }}
    >
      {label || phase || '-'}
    </span>
  );
};

export const B2SProgressBar: React.FC<{ value?: number | null; tone?: 'blue' | 'emerald' }> = ({ value, tone = 'blue' }) => (
  <div className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: LK.surfaceRaised }}>
    <div
      className="h-full rounded-full"
      style={{ width: `${pct(value)}%`, backgroundColor: tone === 'emerald' ? LK.success : LK.info }}
    />
  </div>
);
