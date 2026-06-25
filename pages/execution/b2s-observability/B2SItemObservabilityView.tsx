import React from 'react';
import { Clock3, FileText, Gauge, GitBranch, Layers3, Loader2 } from 'lucide-react';

import { B2SReviewAnalytics, B2STaskDetail, B2STaskObservability } from '../../../clients/binaryToSource';
import { ReviewEffectivenessPanel } from '../b2s-advanced/ReviewEffectivenessPanel';
import { B2SBatchTableRowAction } from './B2SBatchObservabilityTable';
import { B2SPhaseObservabilityPanel } from './B2SPhaseObservabilityPanel';

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

type B2SItem = B2STaskDetail['items'][number];
type B2SObservabilityItem = B2STaskObservability['items'][number];
type BatchStatusFilter = '__all__' | 'running' | 'failed' | 'passed' | 'partial' | 'pending' | 'not_started' | 'unknown';
type BatchSortKey = 'sequence' | 'batch' | 'attempts' | 'duration';

interface MetricTileLikeProps {
  label: string;
  value: React.ReactNode;
  tone?: string;
  icon?: React.ReactNode;
}

interface Props {
  selectedItem: B2SItem | null;
  selectedObservabilityItem: B2SObservabilityItem | null;
  observabilitySummary: B2STaskObservability | null | undefined;
  currentItemBatchRows: any[];
  currentItemBatchSummary: any;
  batchStatusFilter: BatchStatusFilter;
  batchSortKey: BatchSortKey;
  setBatchStatusFilter: (value: BatchStatusFilter) => void;
  setBatchSortKey: (value: BatchSortKey) => void;
  handleBatchRowAction: (action: B2SBatchTableRowAction) => void;
  itemAnalytics: B2SReviewAnalytics | null;
  fileNameOf: (path?: string | null) => string;
  formatDurationMs: (value?: number | null) => string;
  formatDateTime: (value?: string | null) => string;
  formatDuration: (start?: string | null, end?: string | null, nowMs?: number) => string;
  clockNow: number;
  summaryLine: string;
  phaseOrder: string[];
  phaseLabels: Record<string, string>;
  phaseDescriptions: Record<string, string>;
  metricTile: React.ComponentType<MetricTileLikeProps>;
  sectionCard: (args: { title: string; description?: string; children: React.ReactNode }) => React.ReactElement;
}

const SectionCard: React.FC<{ title: string; description?: string; children: React.ReactNode; right?: React.ReactNode }> = ({ title, description, children, right }) => (
  <section
    className="rounded-xl p-4"
    style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
  >
    <div className="flex flex-col gap-1.5 pb-3 md:flex-row md:items-end md:justify-between" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
      <div>
        <h2 className="text-base font-semibold" style={{ color: LK.ink }}>{title}</h2>
        {description ? (
          <p className="mt-0.5 text-[11px]" style={{ color: LK.muted }}>{description}</p>
        ) : null}
      </div>
      {right}
    </div>
    <div className="mt-3">{children}</div>
  </section>
);

const MetricTile: React.FC<{ label: string; value: React.ReactNode; tone?: string; icon?: React.ReactNode }> = ({ label, value, tone = 'slate', icon }) => {
  const toneColors: Record<string, { bg: string; color: string; border: string }> = {
    slate: { bg: LK.surfaceRaised, color: LK.ink, border: LK.border },
    blue: { bg: LK.info + '14', color: LK.info, border: LK.info + '40' },
    emerald: { bg: LK.success + '14', color: LK.success, border: LK.success + '40' },
    rose: { bg: LK.error + '14', color: LK.error, border: LK.error + '40' },
    amber: { bg: LK.warning + '14', color: LK.warning, border: LK.warning + '40' },
    violet: { bg: LK.primarySoft + '14', color: LK.primarySoft, border: LK.primarySoft + '40' },
  };
  const colors = toneColors[tone] || toneColors.slate;
  return (
    <div
      className="min-w-0 rounded-xl px-3 py-2.5"
      style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}`, color: colors.color }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ opacity: 0.6 }}>{label}</div>
          <div className="mt-0.5 break-words text-xl font-semibold tracking-tight">{value}</div>
        </div>
        {icon ? (
          <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ backgroundColor: LK.surface, color: colors.color }}>
            {icon}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const B2SItemObservabilityView: React.FC<Props> = ({
  selectedItem,
  selectedObservabilityItem,
  observabilitySummary,
  currentItemBatchRows,
  currentItemBatchSummary,
  batchStatusFilter,
  batchSortKey,
  setBatchStatusFilter,
  setBatchSortKey,
  handleBatchRowAction,
  itemAnalytics,
  fileNameOf,
  formatDurationMs,
  formatDateTime,
  formatDuration,
  clockNow,
  summaryLine,
  phaseOrder,
  phaseLabels,
  phaseDescriptions,
}) => {
  const currentPhaseEntry = (phase: string) =>
    selectedObservabilityItem?.phase_observability?.find((entry) => entry.phase === phase)
    || selectedItem?.phase_observability?.find((entry) => entry.phase === phase)
    || null;
  const itemStatusLabel = selectedItem?.status_label || selectedObservabilityItem?.status_label || selectedItem?.status || '-';
  const itemDurationMs = selectedItem?.run_duration_ms ?? selectedObservabilityItem?.duration_ms ?? null;

  return (
    <div className="space-y-4">
      <SectionCard
        title="观测摘要"
        description="仅在指定 ELF Item 后展示该 item 的阶段观测指标。"
      >
        {!observabilitySummary ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: LK.muted }}>
            <Loader2 size={16} className="animate-spin" />加载观测指标中...
          </div>
        ) : !selectedItem ? (
          <div
            className="rounded-xl px-4 py-8 text-center text-sm"
            style={{ border: `1px dashed ${LK.border}`, backgroundColor: LK.surfaceRaised, color: LK.muted }}
          >
            当前处于全部汇总视角。请先通过顶部 ELF Item 选择器切换到具体 item，再查看各阶段观测指标。
          </div>
        ) : (
          <>
            <div className="rounded-xl px-3 py-2.5 text-sm font-semibold" style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}`, color: LK.inkSoft }}>
              当前 Item：#{selectedItem.sequence_no} {fileNameOf(selectedItem.elf_path)}
            </div>
            <div className="mt-3 grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
              <MetricTile label="状态" value={itemStatusLabel} tone="slate" icon={<Gauge size={18} />} />
              <MetricTile label="当前阶段" value={selectedItem.phase_label || selectedItem.phase || '-'} tone="blue" icon={<Clock3 size={18} />} />
              <MetricTile label="任务项耗时" value={formatDurationMs(itemDurationMs)} tone="violet" icon={<Layers3 size={18} />} />
              <MetricTile label="轮次/均分/残留" value={summaryLine} tone="emerald" icon={<GitBranch size={18} />} />
            </div>
          </>
        )}
      </SectionCard>

      {selectedItem ? (
        <>
          {phaseOrder.map((phase) => {
            const isBody = phase === 'body';
            const isCompleted = phase === 'completed';
            return (
              <SectionCard
                key={phase}
                title={phaseLabels[phase] || phase}
                description={phaseDescriptions[phase] || '阶段观测面板。'}
              >
                <div className="space-y-3">
                  {isBody ? (
                    !observabilitySummary ? (
                      <div className="flex items-center gap-2 text-sm" style={{ color: LK.muted }}>
                        <Loader2 size={16} className="animate-spin" />加载函数体还原观测中...
                      </div>
                    ) : currentItemBatchRows.length === 0 ? (
                      <div
                        className="rounded-xl px-4 py-8 text-center text-sm"
                        style={{ border: `1px dashed ${LK.border}`, backgroundColor: LK.surfaceRaised, color: LK.muted }}
                      >
                        当前 item 尚未生成函数体还原 batch。
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          <select
                            value={batchStatusFilter}
                            onChange={(event) => setBatchStatusFilter(event.target.value as BatchStatusFilter)}
                            className="form-select text-xs"
                            style={{
                              backgroundColor: LK.surface,
                              border: `1px solid ${LK.border}`,
                              color: LK.body,
                            }}
                            onFocus={(e) => { e.currentTarget.style.borderColor = LK.primary; }}
                            onBlur={(e) => { e.currentTarget.style.borderColor = LK.border; }}
                          >
                            <option value="__all__">全部状态</option>
                            <option value="running">运行中</option>
                            <option value="failed">失败</option>
                            <option value="passed">已通过</option>
                            <option value="partial">部分完成</option>
                            <option value="pending">待执行</option>
                            <option value="not_started">未开始</option>
                            <option value="unknown">未知</option>
                          </select>
                          <select
                            value={batchSortKey}
                            onChange={(event) => setBatchSortKey(event.target.value as BatchSortKey)}
                            className="form-select text-xs"
                            style={{
                              backgroundColor: LK.surface,
                              border: `1px solid ${LK.border}`,
                              color: LK.body,
                            }}
                            onFocus={(e) => { e.currentTarget.style.borderColor = LK.primary; }}
                            onBlur={(e) => { e.currentTarget.style.borderColor = LK.border; }}
                          >
                            <option value="sequence">按 Batch</option>
                            <option value="batch">按 Batch</option>
                            <option value="attempts">按 Attempt</option>
                            <option value="duration">按耗时</option>
                          </select>
                        </div>
                        <B2SPhaseObservabilityPanel
                          phase={currentPhaseEntry(phase)}
                          bodySummary={currentItemBatchSummary}
                          bodyRows={currentItemBatchRows}
                          bodyEmptyText="当前 item 尚未生成函数体还原 batch。"
                          showBodyArtifacts
                          onBatchRowAction={handleBatchRowAction}
                          formatDurationMs={formatDurationMs}
                        />
                      </div>
                    )
                  ) : isCompleted ? (
                    <div className="space-y-3">
                      <B2SPhaseObservabilityPanel phase={currentPhaseEntry(phase)} formatDurationMs={formatDurationMs} />
                      <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
                        <MetricTile label="结束时间" value={selectedItem.finished_at ? formatDateTime(selectedItem.finished_at) : '-'} tone="slate" />
                        <MetricTile label="总耗时" value={formatDuration(selectedItem.started_at, selectedItem.finished_at, clockNow)} tone="violet" icon={<Clock3 size={18} />} />
                        <MetricTile label="产物文件数" value={selectedItem.generated_files?.length || 0} tone="blue" icon={<FileText size={18} />} />
                        <MetricTile label="Pi Worker" value={selectedItem.pi_worker_url || '-'} tone="slate" />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <B2SPhaseObservabilityPanel phase={currentPhaseEntry(phase)} formatDurationMs={formatDurationMs} />
                      <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
                        <MetricTile label="任务项状态" value={itemStatusLabel} tone="slate" />
                        <MetricTile label="当前阶段" value={selectedItem.phase_label || selectedItem.phase || '-'} tone="blue" />
                        <MetricTile label="阶段结束" value={currentPhaseEntry(phase)?.finished_at ? formatDateTime(currentPhaseEntry(phase)?.finished_at) : currentPhaseEntry(phase)?.is_active ? '进行中' : '-'} tone="slate" />
                        <MetricTile label="阶段备注" value={phaseDescriptions[phase] || '-'} tone="slate" />
                      </div>
                    </div>
                  )}
                </div>
              </SectionCard>
            );
          })}

          <SectionCard
            title={`Item 观测明细 · #${selectedItem.sequence_no} ${fileNameOf(selectedItem.elf_path)}`}
            description="直接复用现有评审效果面板。"
          >
            {itemAnalytics ? (
              <ReviewEffectivenessPanel analytics={itemAnalytics} />
            ) : (
              <div className="flex items-center gap-2 text-sm" style={{ color: LK.muted }}>
                <Loader2 size={16} className="animate-spin" />加载 item 观测中...
              </div>
            )}
          </SectionCard>
        </>
      ) : null}
    </div>
  );
};
