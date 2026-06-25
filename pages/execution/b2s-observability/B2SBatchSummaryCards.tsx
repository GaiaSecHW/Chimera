import React from 'react';
import { Activity, AlertTriangle, CheckCircle2, Layers3, RotateCcw, XCircle } from 'lucide-react';

// LOKI design tokens (DESIGN.md) — page-local palette.
const LK = {
  primary: 'var(--brand-primary)',
  primarySoft: '#7590ff',
  primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: 'var(--bg-app)',
  surface: 'var(--bg-surface)',
  surfaceRaised: 'var(--bg-app)',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: 'var(--border-default)',
  borderSoft: 'var(--border-default)',
  ink: 'var(--text-primary)',
  inkSoft: 'var(--text-secondary)',
  body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)',
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

type Tone = 'slate' | 'blue' | 'emerald' | 'rose' | 'amber' | 'violet';

export interface B2SBatchSummaryValue {
  label: string;
  value: string | number;
  hint?: string;
  tone?: Tone;
  icon?: React.ReactNode;
}

const tileTone = (tone: Tone = 'slate'): { bg: string; color: string; border: string } => {
  const map: Record<Tone, { bg: string; color: string; border: string }> = {
    slate: { bg: LK.surfaceRaised, color: LK.ink, border: LK.border },
    blue: { bg: LK.info + '14', color: LK.info, border: LK.info + '40' },
    emerald: { bg: LK.success + '14', color: LK.success, border: LK.success + '40' },
    rose: { bg: LK.error + '14', color: LK.error, border: LK.error + '40' },
    amber: { bg: LK.warning + '14', color: LK.warning, border: LK.warning + '40' },
    violet: { bg: LK.primarySoft + '14', color: LK.primarySoft, border: LK.primarySoft + '40' },
  };
  return map[tone];
};

export const buildBatchSummaryCardItems = (summary: {
  total_batches: number;
  planned_total_batches?: number;
  materialized_total_batches?: number;
  running_batches: number;
  passed_batches: number;
  failed_batches: number;
  partial_batches: number;
  avg_attempts_per_batch: number;
  total_review_rounds?: number;
}): B2SBatchSummaryValue[] => ([
  {
    label: '计划 Batch',
    value: summary.planned_total_batches ?? summary.total_batches,
    hint:`已物化 ${summary.materialized_total_batches ?? summary.total_batches}`,
    tone: 'violet',
    icon: <Layers3 size={18} />,
  },
  { label: '运行中', value: summary.running_batches, tone: 'blue', icon: <Activity size={18} /> },
  { label: '已通过', value: summary.passed_batches, tone: 'emerald', icon: <CheckCircle2 size={18} /> },
  { label: '失败', value: summary.failed_batches, tone: 'rose', icon: <XCircle size={18} /> },
  { label: '部分完成', value: summary.partial_batches, tone: 'amber', icon: <AlertTriangle size={18} /> },
  { label: '平均 Attempt', value: summary.avg_attempts_per_batch || 0, hint: summary.total_review_rounds != null ?`Review ${summary.total_review_rounds}` : undefined, tone: 'slate', icon: <RotateCcw size={18} /> },
]);

export const B2SBatchSummaryCards: React.FC<{ items: B2SBatchSummaryValue[] }> = ({ items }) => (
  <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-6">
    {items.map((item) => {
      const colors = tileTone(item.tone);
      return (
        <div
          key={item.label}
          className="min-w-0 rounded-xl px-3 py-2.5"
          style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}`, color: colors.color }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ opacity: 0.6 }}>
                {item.label}
              </div>
              <div className="mt-0.5 break-words text-xl font-semibold tracking-tight">{item.value}</div>
            </div>
            {item.icon ? (
              <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ backgroundColor: LK.surface, color: colors.color }}>
                {item.icon}
              </div>
            ) : null}
          </div>
          {item.hint ? (
            <div className="mt-1 truncate text-[11px] font-semibold" style={{ opacity: 0.7 }} title={item.hint}>
              {item.hint}
            </div>
          ) : null}
        </div>
      );
    })}
  </div>
);
