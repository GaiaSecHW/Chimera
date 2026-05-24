import React from 'react';

import { B2SBatchObservabilityRow, B2SBatchObservabilitySummary, B2SItemPhaseObservability } from '../../../clients/binaryToSource';
import { B2SBatchObservabilityTable, B2SBatchTableRowAction } from './B2SBatchObservabilityTable';
import { B2SBatchSummaryCards, buildBatchSummaryCardItems } from './B2SBatchSummaryCards';

type Tone = 'slate' | 'blue' | 'emerald' | 'rose' | 'amber' | 'violet';

export interface B2SPhaseMetricTileValue {
  label: string;
  value: string | number;
  tone?: Tone;
  icon?: React.ReactNode;
}

export const B2SPhaseMetricGrid: React.FC<{ items: B2SPhaseMetricTileValue[] }> = ({ items }) => (
  <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
    {items.map((item) => (
      <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{item.label}</div>
        <div className="mt-1 text-base font-black text-slate-900">{item.value}</div>
      </div>
    ))}
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
      {phase.metrics.length ? <B2SPhaseMetricGrid items={phase.metrics.map((metric) => ({ label: metric.label, value: metric.value, tone: (metric.tone as Tone) || 'slate' }))} /> : null}
      {isBody ? (
        !bodyRows?.length ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">{bodyEmptyText}</div>
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
