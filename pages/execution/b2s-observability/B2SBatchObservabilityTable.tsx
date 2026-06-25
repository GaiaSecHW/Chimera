import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';

import { B2SBatchObservabilityRow } from '../../../clients/binaryToSource';
import { formatBytes, formatDateTime } from '../b2sPresentation';

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
  inkSoft: 'var(--text-primary)',
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

const statusTone = (status: string): { bg: string; color: string; border: string } => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'running') return { bg: LK.info + '14', color: LK.info, border: LK.info + '40' };
  if (normalized === 'passed') return { bg: LK.success + '14', color: LK.success, border: LK.success + '40' };
  if (normalized === 'failed') return { bg: LK.error + '14', color: LK.error, border: LK.error + '40' };
  if (normalized === 'partial') return { bg: LK.warning + '14', color: LK.warning, border: LK.warning + '40' };
  if (normalized === 'pending') return { bg: LK.surfaceRaised, color: LK.body, border: LK.border };
  if (normalized === 'not_started') return { bg: LK.surface, color: LK.muted, border: LK.border };
  return { bg: LK.surface, color: LK.muted, border: LK.border };
};

const verdictTone = (verdict?: string | null): string => {
  const normalized = String(verdict || '').toUpperCase();
  if (normalized === 'PASS') return LK.success;
  if (normalized === 'FAIL') return LK.error;
  return LK.muted;
};

const formatDurationMs = (durationMs?: number | null) => {
  if (durationMs == null || Number.isNaN(durationMs) || durationMs < 0) return '-';
  const seconds = durationMs / 1000;
  const precision = Number.isInteger(seconds) ? 0 : seconds >= 10 ? 1 : 2;
  return`${seconds.toFixed(precision)} 秒`;
};

export interface B2SBatchTableRowAction {
  type: 'select-item' | 'open-advanced' | 'open-session';
  row: B2SBatchObservabilityRow;
}

interface Props {
  rows: B2SBatchObservabilityRow[];
  showItemColumn?: boolean;
  showArtifactColumn?: boolean;
  emptyText: string;
  onRowAction?: (action: B2SBatchTableRowAction) => void;
}

export const B2SBatchObservabilityTable: React.FC<Props> = ({
  rows,
  showItemColumn = false,
  showArtifactColumn = false,
  emptyText,
  onRowAction,
}) => {
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const expandedSet = useMemo(() => new Set(expandedKeys), [expandedKeys]);

  const toggleRow = (key: string) => {
    setExpandedKeys((current) => (
      current.includes(key) ? current.filter((entry) => entry !== key) : current.concat(key)
    ));
  };

  if (rows.length === 0) {
    return (
      <div
        className="rounded-xl px-4 py-8 text-center text-sm"
        style={{ border: `1px dashed ${LK.border}`, backgroundColor: LK.surfaceRaised, color: LK.muted }}
      >
        {emptyText}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-xs font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft, backgroundColor: LK.surfaceRaised }}>
              <th className="px-3 py-2.5 text-left" style={{ borderBottom:`1px solid ${LK.border}` }}>详情</th>
              {showItemColumn ? <th className="px-3 py-2.5 text-left" style={{ borderBottom:`1px solid ${LK.border}` }}>ELF Item</th> : null}
              <th className="px-3 py-2.5 text-left" style={{ borderBottom:`1px solid ${LK.border}` }}>Batch</th>
              <th className="px-3 py-2.5 text-left" style={{ borderBottom:`1px solid ${LK.border}` }}>函数体阶段状态</th>
              <th className="px-3 py-2.5 text-left" style={{ borderBottom:`1px solid ${LK.border}` }}>当前 Attempt</th>
              <th className="px-3 py-2.5 text-left" style={{ borderBottom:`1px solid ${LK.border}` }}>函数数</th>
              <th className="px-3 py-2.5 text-left" style={{ borderBottom:`1px solid ${LK.border}` }}>代码字节</th>
              <th className="px-3 py-2.5 text-left" style={{ borderBottom:`1px solid ${LK.border}` }}>当前函数</th>
              <th className="px-3 py-2.5 text-left" style={{ borderBottom:`1px solid ${LK.border}` }}>Review</th>
              <th className="px-3 py-2.5 text-left" style={{ borderBottom:`1px solid ${LK.border}` }}>Session</th>
              <th className="px-3 py-2.5 text-left" style={{ borderBottom:`1px solid ${LK.border}` }}>结果</th>
              <th className="px-3 py-2.5 text-left" style={{ borderBottom:`1px solid ${LK.border}` }}>函数体耗时</th>
              <th className="px-3 py-2.5 text-left" style={{ borderBottom:`1px solid ${LK.border}` }}>最近更新</th>
              {showArtifactColumn ? <th className="px-3 py-2.5 text-left" style={{ borderBottom:`1px solid ${LK.border}` }}>产物</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key =`${row.item_id}:${row.batch_no}`;
              const expanded = expandedSet.has(key);
              const rowColors = statusTone(row.status);
              return (
                <React.Fragment key={key}>
                  <tr
                    className="transition-colors"
                    style={{
                      backgroundColor: row.status === 'running' ? LK.info + '10' : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (row.status !== 'running') e.currentTarget.style.backgroundColor = LK.surfaceRaised;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = row.status === 'running' ? LK.info + '10' : 'transparent';
                    }}
                  >
                    <td className="px-3 py-2.5 align-top" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
                      <button
                        type="button"
                        onClick={() => toggleRow(key)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition-colors"
                        style={{
                          backgroundColor: LK.surface,
                          border: `1px solid ${LK.border}`,
                          color: LK.body,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = LK.surfaceRaised;
                          e.currentTarget.style.color = LK.inkSoft;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = LK.surface;
                          e.currentTarget.style.color = LK.body;
                        }}
                      >
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        展开
                      </button>
                    </td>
                    {showItemColumn ? (
                      <td className="px-3 py-2.5 align-top" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
                        <button
                          type="button"
                          onClick={() => onRowAction?.({ type: 'select-item', row })}
                          className="text-left font-semibold transition-colors"
                          style={{ color: LK.inkSoft }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = LK.primary; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = LK.inkSoft; }}
                        >
                          #{row.sequence_no} {row.item_name}
                        </button>
                      </td>
                    ) : null}
                    <td className="px-3 py-2.5 align-top font-mono" style={{ borderBottom:`1px solid ${LK.borderSoft}`, color: LK.inkSoft }}>{row.batch_no}</td>
                    <td className="px-3 py-2.5 align-top" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
                      <span
                        className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold"
                        style={{
                          backgroundColor: rowColors.bg,
                          color: rowColors.color,
                          border: `1px solid ${rowColors.border}`,
                        }}
                      >
                        {row.status_label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 align-top" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
                      {row.current_attempt_no ?? row.attempt_count ?? '-'}
                    </td>
                    <td className="px-3 py-2.5 align-top" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
                      {row.function_count || '-'}
                    </td>
                    <td className="px-3 py-2.5 align-top" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
                      {row.total_size_bytes ? formatBytes(row.total_size_bytes) : '-'}
                    </td>
                    <td className="px-3 py-2.5 align-top" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
                      <span style={{ color: row.status === 'running' ? LK.info : LK.body, fontWeight: row.status === 'running' ? 600 : 400 }}>
                        {row.current_function || '-'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 align-top" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
                      {row.review_count}
                    </td>
                    <td className="px-3 py-2.5 align-top" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
                      {row.session_count}
                    </td>
                    <td className="px-3 py-2.5 align-top font-semibold" style={{ borderBottom:`1px solid ${LK.borderSoft}`, color: verdictTone(row.latest_verdict) }}>
                      {row.latest_verdict || '-'}
                    </td>
                    <td className="px-3 py-2.5 align-top" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
                      {formatDurationMs(row.duration_ms)}
                    </td>
                    <td className="px-3 py-2.5 align-top" style={{ borderBottom:`1px solid ${LK.borderSoft}`, color: LK.body }}>
                      {row.last_event_at ? formatDateTime(row.last_event_at) : '-'}
                    </td>
                    {showArtifactColumn ? (
                      <td className="px-3 py-2.5 align-top text-xs" style={{ borderBottom:`1px solid ${LK.borderSoft}`, color: LK.body }}>
                        <div>{row.has_source_output ? '源码输出' : '无源码'}</div>
                        <div>{row.has_disasm_context ? '有反编译上下文' : '无上下文'}</div>
                      </td>
                    ) : null}
                  </tr>
                  {expanded ? (
                    <tr style={{ backgroundColor: LK.surfaceRaised + '60' }}>
                      <td
                        colSpan={showItemColumn && showArtifactColumn ? 14 : showItemColumn || showArtifactColumn ? 13 : 12}
                        className="px-4 py-3"
                      >
                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
                          <div className="space-y-2">
                            <div className="rounded-xl px-3 py-2" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
                              <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: LK.muted }}>
                                函数体阶段细节
                              </div>
                              <div className="mt-2 grid gap-2 text-xs md:grid-cols-2">
                                <div style={{ color: LK.body }}>
                                  最新 Verdict：<span style={{ fontWeight: 600, color: LK.ink }}>{row.latest_verdict_label || row.latest_verdict || '-'}</span>
                                </div>
                                <div style={{ color: LK.body }}>
                                  函数体开始：<span style={{ fontWeight: 600, color: LK.ink }}>{row.started_at ? formatDateTime(row.started_at) : '-'}</span>
                                </div>
                                <div style={{ color: LK.body }}>
                                  函数体结束：<span style={{ fontWeight: 600, color: LK.ink }}>{row.finished_at ? formatDateTime(row.finished_at) : '-'}</span>
                                </div>
                                <div style={{ color: LK.body }}>
                                  Attempt 总数：<span style={{ fontWeight: 600, color: LK.ink }}>{row.attempt_count}</span>
                                </div>
                              </div>
                              <div className="mt-2 text-xs" style={{ color: LK.muted }}>该记录表示 batch 在函数体还原阶段的执行与结束状态。</div>
                            </div>
                            <div className="rounded-xl px-3 py-2" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
                              <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: LK.muted }}>
                                Warnings
                              </div>
                              <div className="mt-2 text-xs" style={{ color: LK.body }}>
                                {row.warnings.length ? row.warnings.join('；') : '无额外告警'}
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2 rounded-xl px-3 py-2" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: LK.muted }}>
                              导航
                            </div>
                            <div className="flex flex-wrap gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => onRowAction?.({ type: 'select-item', row })}
                                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors"
                                style={{
                                  backgroundColor: LK.surfaceRaised,
                                  border: `1px solid ${LK.border}`,
                                  color: LK.body,
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = LK.surface;
                                  e.currentTarget.style.color = LK.inkSoft;
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = LK.surfaceRaised;
                                  e.currentTarget.style.color = LK.body;
                                }}
                              >
                                切到 Item
                              </button>
                              <button
                                type="button"
                                onClick={() => onRowAction?.({ type: 'open-session', row })}
                                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors"
                                style={{
                                  backgroundColor: LK.surfaceRaised,
                                  border: `1px solid ${LK.border}`,
                                  color: LK.body,
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = LK.surface;
                                  e.currentTarget.style.color = LK.inkSoft;
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = LK.surfaceRaised;
                                  e.currentTarget.style.color = LK.body;
                                }}
                              >
                                <ExternalLink size={13} />
                                会话页
                              </button>
                              <button
                                type="button"
                                onClick={() => onRowAction?.({ type: 'open-advanced', row })}
                                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors"
                                style={{
                                  backgroundColor: LK.surfaceRaised,
                                  border: `1px solid ${LK.border}`,
                                  color: LK.body,
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = LK.surface;
                                  e.currentTarget.style.color = LK.inkSoft;
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = LK.surfaceRaised;
                                  e.currentTarget.style.color = LK.body;
                                }}
                              >
                                <ExternalLink size={13} />
                                Advanced
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
