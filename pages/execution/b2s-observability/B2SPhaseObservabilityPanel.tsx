import React from 'react';

import { B2SBatchObservabilityRow, B2SBatchObservabilitySummary, B2SItemPhaseObservability } from '../../../clients/binaryToSource';
import { B2SBatchObservabilityTable, B2SBatchTableRowAction } from './B2SBatchObservabilityTable';
import { B2SBatchSummaryCards, buildBatchSummaryCardItems } from './B2SBatchSummaryCards';

// LOKI design tokens (DESIGN.md) — page-local palette.
const LK = {
  primary: '#2563EB',
  primarySoft: '#7590ff',
  primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'var(--brand-primary-mask)',
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
  success: '#30A46C',
  warning: '#D97706',
  error: '#DC2626',
  info: '#4f8cff',
  critical: '#ff4d4f',
  high: '#ff8b3d',
  medium: '#f0b64c',
  low: '#49c5ff',
} as const;

type Tone = 'slate' | 'blue' | 'emerald' | 'rose' | 'amber' | 'violet';

export interface B2SPhaseMetricTileValue {
  label: string;
  value: string | number;
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

export const B2SPhaseMetricGrid: React.FC<{ items: B2SPhaseMetricTileValue[] }> = ({ items }) => (
  <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
    {items.map((item) => {
      const colors = tileTone(item.tone);
      return (
        <div
          key={item.label}
          className="rounded-xl px-3 py-2.5"
          style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}`, color: colors.color }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ opacity: 0.6 }}>
            {item.label}
          </div>
          <div className="mt-1 text-base font-semibold">{item.value}</div>
        </div>
      );
    })}
  </div>
);

interface Props {
  phase: B2SItemPhaseObservability | null;
  bodySummary?: B2SBatchObservabilitySummary | null;
  bodyRows?: B2SBatchObservabilityRow[];
  bodyEmptyText?: string;
  showBodyArtifacts?: boolean;
  onBatchRowAction?: (action: B2SBatchTableRowAction) => void;
  formatDurationMs?: (value?: number | null) => string;
}

export const B2SPhaseObservabilityPanel: React.FC<Props> = ({
  phase,
  bodySummary,
  bodyRows,
  bodyEmptyText = '当前阶段暂无可展示数据。',
  showBodyArtifacts = false,
  onBatchRowAction,
  formatDurationMs,
}) => {
  if (!phase) return null;
  const renderDuration = formatDurationMs || ((value?: number | null) => (value == null ? '-' : String(value)));
  const isBody = phase.phase === 'body';
  return (
    <div className="space-y-3">
      <B2SPhaseMetricGrid items={[
        { label: '当前', value: phase.current_items },
        { label: '已过', value: phase.completed_items },
        { label: '开始时间', value: phase.started_at || '-' },
        { label: '耗时', value: renderDuration(phase.duration_ms) },
      ]} />
      {phase.metrics.length ? (
        <B2SPhaseMetricGrid items={phase.metrics.map((metric) => ({ label: metric.label, value: metric.value, tone: (metric.tone as Tone) || 'slate' }))} />
      ) : null}
      {isBody ? (
        !bodyRows?.length ? (
          <div
            className="rounded-xl px-4 py-8 text-center text-sm"
            style={{ border: `1px dashed ${LK.border}`, backgroundColor: LK.surfaceRaised, color: LK.muted }}
          >
            {bodyEmptyText}
          </div>
        ) : (
          <div className="space-y-3">
            {bodySummary ? <B2SBatchSummaryCards items={buildBatchSummaryCardItems(bodySummary)} /> : null}
            <B2SBatchObservabilityTable
              rows={bodyRows}
              showArtifactColumn={showBodyArtifacts}
              emptyText={bodyEmptyText}
              onRowAction={onBatchRowAction}
            />
          </div>
        )
      ) : null}
    </div>
  );
};
