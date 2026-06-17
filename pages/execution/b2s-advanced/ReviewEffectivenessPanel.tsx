import React from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';

import { B2SReviewAnalytics, B2SReviewAnalyticsDimension } from '../../../clients/binaryToSource';

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

const CHART_COLORS: Record<string, string> = {
  logic: '#6366f1',
  structure: '#8b5cf6',
  readability: '#ec4899',
  grid: LK.borderSoft,
  axis: LK.muted,
};

const PanelCard: React.FC<{ title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, right, children, className = '' }) => (
  <div
    className={`rounded-xl p-5 ${className || ''}`}
    style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
  >
    <div className="mb-4 flex min-h-6 items-start justify-between gap-3">
      <div className="min-w-0">{typeof title === 'string' ? <div className="text-sm font-semibold tracking-wider" style={{ color: LK.ink }}>{title}</div> : title}</div>
      {right}
    </div>
    {children}
  </div>
);

const DimensionSparkline: React.FC<{ values: Array<{ attemptNo: number; value: number }>; color: string }> = ({ values, color }) => {
  const width = 118;
  const height = 58;
  const padding = 8;
  if (!values.length) return null;

  const nums = values.map((item) => item.value);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = Math.max(1, max - min);
  const points = values.map((item, index) => {
    const x = values.length === 1 ? width / 2 : padding + (index / (values.length - 1)) * (width - padding * 2);
    const y = height - padding - ((item.value - min) / range) * (height - padding * 2);
    return { x, y };
  });
  const path = points.map((point, index) =>`${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const last = points[points.length - 1];

  return (
    <svg className="overflow-visible" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={path} fill="none" stroke={LK.borderSoft} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.slice(0, -1).map((point, index) => (
        <circle key={index} cx={point.x} cy={point.y} r="3.5" fill={LK.surface} stroke={LK.border} strokeWidth="2" />
      ))}
      {last && <circle cx={last.x} cy={last.y} r="4" fill={LK.surface} stroke={color} strokeWidth="2.6" />}
    </svg>
  );
};

const colorForDimension = (dimension: B2SReviewAnalyticsDimension, index: number) => {
  if (dimension.color_hint && CHART_COLORS[dimension.color_hint]) return CHART_COLORS[dimension.color_hint];
  return [CHART_COLORS.logic, CHART_COLORS.structure, CHART_COLORS.readability][index] || CHART_COLORS.axis;
};

const dotClassForDimension = (dimension: B2SReviewAnalyticsDimension, index: number): string => {
  if (dimension.color_hint === 'logic') return 'bg-indigo-500';
  if (dimension.color_hint === 'structure') return 'bg-violet-500';
  if (dimension.color_hint === 'readability') return 'bg-pink-500';
  return ['bg-indigo-500', 'bg-violet-500', 'bg-pink-500'][index] || 'bg-slate-500';
};

const labelClassForDimension = (dimension: B2SReviewAnalyticsDimension, index: number): string => {
  if (dimension.color_hint === 'logic') return 'text-indigo-400';
  if (dimension.color_hint === 'structure') return 'text-violet-400';
  if (dimension.color_hint === 'readability') return 'text-pink-400';
  return ['text-indigo-400', 'text-violet-400', 'text-pink-400'][index] || 'text-theme-text-secondary';
};

const verdictColors = (passed: boolean): { border: string; borderLeft: string; bg: string; color: string } => {
  return passed
    ? { border: LK.success + '40', borderLeft: LK.success, bg: LK.success + '14', color: LK.success }
    : { border: LK.error + '40', borderLeft: LK.error, bg: LK.error + '14', color: LK.error };
};

export const ReviewEffectivenessPanel: React.FC<{ analytics: B2SReviewAnalytics | null }> = ({ analytics }) => {
  if (!analytics) return null;

  const summary = analytics.summary;
  const dimensions = analytics.dimensions || [];
  const trend = analytics.trend || analytics.trend_insight;
  const resolvedCount = summary.issue_resolved ?? analytics.issues.filter((issue) => issue.status === 'resolved').length;
  const remainingCount = summary.issue_remaining ?? analytics.issues.filter((issue) => issue.status !== 'resolved').length;
  const issueTotal = summary.issue_total ?? analytics.issues.length;
  const finalQualityScore = summary.final_quality_score ?? summary.final_confidence;
  const firstQualityScore = summary.initial_quality_score ?? analytics.attempts[0]?.quality_score ?? analytics.attempts[0]?.semantic_score ?? 0;
  const finalQualityLabel = summary.final_quality_label || '未知';
  const qualityDelta = summary.quality_delta ?? Math.max(0, finalQualityScore - firstQualityScore);
  const improvementPercent = summary.quality_delta_percent ?? (firstQualityScore > 0 ? Math.round((qualityDelta / firstQualityScore) * 100) : 0);
  const verdictLabel = summary.final_verdict_label || (summary.final_verdict === 'PASS' ? '通过' : summary.final_verdict === 'FAIL' ? '未通过' : '未知');
  const verdictPassed = summary.final_verdict === 'PASS';
  const verdictFailed = summary.final_verdict === 'FAIL';
  const verdictTone = verdictPassed ? LK.success : verdictFailed ? LK.error : LK.body;
  const verdictColorsValue = verdictColors(verdictPassed);
  const conclusionText = verdictPassed
    ?`多轮评审已完成，当前未发现阻断问题，遗留问题 ${remainingCount} 项。`
    : verdictFailed
      ?`评审仍未通过，当前遗留问题 ${remainingCount} 项，建议优先查看闭环证据。`
      : '评审结论暂不可判定，建议查看各轮评审详情与中间产物。';
  const closureTitle = remainingCount > 0 ?`仍有 ${remainingCount} 项未闭环` : '问题全部闭环';
  const closureTone = remainingCount > 0 ? LK.error : LK.success;
  const closureDescription =`共发现 ${issueTotal || 0} 项问题，已解决 ${resolvedCount} 项，未解决 ${remainingCount} 项。`;
  const trendToneClass = trend?.tone === 'warning' ? LK.warning : trend?.tone === 'positive' ? LK.success : LK.body;

  const qualityTrend = (() => {
    const attemptMap = new Map<number, Record<string, number | string>>();
    dimensions.forEach((dimension) => {
      dimension.points.forEach((point) => {
        const row = attemptMap.get(point.attempt_no) || { round: point.label ||`第${point.attempt_no}轮` };
        row[dimension.label] = point.score;
        attemptMap.set(point.attempt_no, row);
      });
    });
    return Array.from(attemptMap.entries()).sort((a, b) => a[0] - b[0]).map(([, row]) => row);
  })();

  const roundSummaries = analytics.attempts.map((attempt, index) => {
    const discovered = analytics.issues.filter((issue) => issue.introduced_attempt === attempt.attempt_no);
    const resolved = analytics.issues.filter((issue) => issue.resolved_attempt === attempt.attempt_no);
    const openAtRound = analytics.issues.filter((issue) => issue.introduced_attempt <= attempt.attempt_no && (!issue.resolved_attempt || issue.resolved_attempt > attempt.attempt_no));
    const passed = attempt.verdict === 'PASS';
    return { attempt, index, discovered, resolved, openAtRound, verdictLabel: attempt.verdict_label || (passed ? '通过' : attempt.verdict === 'FAIL' ? '失败' : '未知'), tone: passed ? 'emerald' : 'rose', isFinal: index === analytics.attempts.length - 1 };
  });

  return (
    <section
      className="overflow-hidden rounded-xl p-6"
      style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
    >
      <div className="relative mb-6 flex items-center justify-between gap-3">
        <div className="text-xl font-semibold tracking-wider" style={{ color: LK.ink }}>代码还原质量迭代追踪</div>
      </div>

      <div
        className="mb-4 rounded-xl p-5"
        style={{
          border: `1px solid ${verdictColorsValue.border}`,
          borderLeft:`4px solid ${verdictColorsValue.borderLeft}`,
          backgroundColor: verdictColorsValue.bg,
        }}
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold tracking-wider" style={{ color: LK.muted }}>最终结论</div>
            <div className="mt-1 text-5xl font-semibold leading-none tracking-tight" style={{ color: verdictTone }}>{verdictLabel}</div>
            <div className="mt-3 max-w-2xl text-sm leading-6" style={{ color: LK.body }}>{conclusionText}</div>
          </div>
          <div
            className="grid shrink-0 grid-cols-2 lg:min-w-[430px]"
            style={{ borderLeft:`1px solid ${verdictColorsValue.border}`, backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
          >
            <div className="px-5 py-3 text-center" style={{ borderRight:`1px solid ${LK.border}` }}>
              <div className="text-[11px] font-semibold tracking-wider" style={{ color: LK.muted }}>最终质量</div>
              <div className="mt-1 flex items-baseline justify-center gap-2">
                <span className="text-3xl font-semibold" style={{ color: LK.primarySoft }}>{finalQualityScore}</span>
                <span className="text-sm font-semibold" style={{ color: LK.warning }}>+{improvementPercent}%</span>
              </div>
              <div className="mt-1 text-xs font-semibold" style={{ color: LK.primarySoft }}>{finalQualityLabel} · {firstQualityScore} → {finalQualityScore}</div>
            </div>
            <div className="px-5 py-3 text-center">
              <div className="text-[11px] font-semibold tracking-wider" style={{ color: LK.muted }}>问题闭环</div>
              <div className="mt-1 text-3xl font-semibold" style={{ color: closureTone }}>{resolvedCount}/{issueTotal || 0}</div>
              <div className="mt-1 text-xs font-semibold" style={{ color: LK.muted }}>遗留 {remainingCount}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <PanelCard
          title={
            <div>
              <div className="text-xs font-semibold tracking-wider" style={{ color: LK.muted }}>质量趋势</div>
              <div className="mt-1 text-3xl font-semibold leading-tight tracking-tight" style={{ color: trendToneClass }}>{trend?.title || '逐轮质量趋势'}</div>
              <div className="mt-1 max-w-xl text-xs leading-5" style={{ color: LK.body }}>{trend?.conclusion || '暂无足够轮次数据生成趋势结论。'}</div>
            </div>
          }
          className="flex h-full flex-col"
        >
          <div className="min-h-[300px] flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={qualityTrend} margin={{ top: 20, right: 26, left: 0, bottom: 12 }}>
                <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="4 5" strokeOpacity={0.8} vertical={false} />
                <XAxis dataKey="round" stroke={CHART_COLORS.axis} tick={{ fontSize: 12, fontWeight: 600 }} tickLine={false} axisLine={{ stroke: CHART_COLORS.grid }} />
                <YAxis domain={[(dataMin: number) => Math.max(0, Math.floor(dataMin / 10) * 10 - 5), 100]} ticks={[55, 70, 85, 100]} stroke={CHART_COLORS.axis} tick={{ fontSize: 10, fontWeight: 600 }} tickLine={false} axisLine={{ stroke: CHART_COLORS.grid }} />
                {dimensions.map((dimension, index) => (
                  <Line key={dimension.key} type="monotone" dataKey={dimension.label} stroke={colorForDimension(dimension, index)} strokeWidth={2.6} dot={{ r: 3.4, fill: LK.surface, strokeWidth: 2 }} activeDot={{ r: 6, strokeWidth: 2.5, fill: LK.surface }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t pt-3 text-[11px] font-semibold" style={{ borderColor: LK.borderSoft }}>
            {dimensions.map((dimension, index) => (
              <span key={dimension.key} className="inline-flex items-center gap-1.5" style={{ color: LK.body }}>
                <span className={`h-2.5 w-2.5 rounded-full ${dotClassForDimension(dimension, index)}`} />{dimension.label}
              </span>
            ))}
          </div>
        </PanelCard>

        <PanelCard
          title={
            <div>
              <div className="text-xs font-semibold tracking-wider" style={{ color: LK.muted }}>质量评分拆解</div>
              <div className="mt-1 text-3xl font-semibold leading-tight tracking-tight" style={{ color: LK.ink }}>{finalQualityLabel} · {finalQualityScore}</div>
              <div className="mt-1 max-w-xl text-xs leading-5" style={{ color: LK.body }}>初始质量 {firstQualityScore}，最终质量 {finalQualityScore}，综合提升 {qualityDelta} 分。</div>
            </div>
          }
        >
          <div className="space-y-3">
            {dimensions.map((dimension, index) => {
              const color = colorForDimension(dimension, index);
              const labelClass = labelClassForDimension(dimension, index);
              return (
                <div
                  key={dimension.key}
                  className="grid grid-cols-[minmax(0,1fr)_118px] items-center gap-5 rounded-xl px-5 py-4"
                  style={{ backgroundColor: LK.surface, boxShadow: '0 1px 2px rgba(0,0,0,0.025), 0 0 0 1px rgba(60,60,67,0.045)' }}
                >
                  <div className="min-w-0">
                    <div className="mb-4 flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${dotClassForDimension(dimension, index)}`} />
                      <div className={`text-sm font-semibold tracking-tight ${labelClass}`}>{dimension.label}</div>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[42px] font-semibold leading-none tracking-tight" style={{ color: LK.ink }}>{dimension.score}</span>
                      <span className="text-[17px] font-semibold" style={{ color: LK.muted }}>分</span>
                    </div>
                    <div className="mt-1 text-sm font-semibold" style={{ color: LK.inkSoft }}>
                      {dimension.level_label} · 较初始提升 <span className={labelClass}>{dimension.delta_percent}%</span>
                    </div>
                    <div className="mt-2 text-sm leading-5" style={{ color: LK.body }}>{dimension.description}</div>
                  </div>
                  <div className="justify-self-end">
                    <DimensionSparkline values={dimension.points.map((point) => ({ attemptNo: point.attempt_no, value: point.score }))} color={color} />
                  </div>
                </div>
              );
            })}
          </div>
        </PanelCard>

        <div id="b2s-review-evidence" className="scroll-mt-24 xl:col-span-2">
          <PanelCard
            title={
              <div>
                <div className="text-xs font-semibold tracking-wider" style={{ color: LK.muted }}>评审闭环时间线</div>
                <div className="mt-1 text-3xl font-semibold leading-tight tracking-tight" style={{ color: closureTone }}>{closureTitle}</div>
                <div className="mt-1 max-w-xl text-xs leading-5" style={{ color: LK.body }}>{closureDescription}</div>
              </div>
            }
          >
            <div className="overflow-hidden" style={{ border: `1px solid ${LK.border}` }}>
              <div
                className="grid grid-cols-[104px_88px_repeat(6,minmax(72px,1fr))_92px_88px] gap-0 border-b px-4 py-2 text-[10px] font-semibold uppercase tracking-wider"
                style={{ borderColor: LK.border, backgroundColor: LK.surfaceRaised, color: LK.muted }}
              >
                <div>轮次</div>
                <div>结论</div>
                <div>已验证</div>
                <div>阻断</div>
                <div>语义分</div>
                <div>发现</div>
                <div>解决</div>
                <div>未闭环</div>
                <div>状态</div>
                <div className="text-right">操作</div>
              </div>
              <div className="divide-y" style={{ borderColor: LK.borderSoft }}>
                {roundSummaries.map((round) => {
                  const attempt = round.attempt;
                  const passed = round.tone === 'emerald';
                  const accent = passed ? LK.success : LK.error;
                  const bg = passed ? LK.success + '10' : LK.error + '10';
                  const badge = passed ? { border: LK.success + '40', bg: LK.success + '14', color: LK.success } : { border: LK.error + '40', bg: LK.error + '14', color: LK.error };
                  return (
                    <details key={attempt.attempt_no} className="group">
                      <summary
                        className="grid list-none cursor-pointer grid-cols-[104px_88px_repeat(6,minmax(72px,1fr))_92px_88px] items-center border-l-4 px-4 py-3 text-sm transition-colors"
                        style={{
                          borderColor: accent,
                          backgroundColor: LK.surface,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.surfaceRaised; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.surface; }}
                      >
                        <div className="font-semibold" style={{ color: LK.muted }}>第 {attempt.attempt_no} 轮</div>
                        <div className="text-lg font-semibold leading-none" style={{ color: passed ? LK.success : LK.error }}>{round.verdictLabel}</div>
                        <div className="font-semibold" style={{ color: LK.success }}>{attempt.verified_functions}/{attempt.total_functions}</div>
                        <div className="font-semibold" style={{ color: attempt.blocking_issues ? LK.error : LK.success }}>{attempt.blocking_issues}</div>
                        <div className="font-semibold" style={{ color: LK.primarySoft }}>{attempt.semantic_score}</div>
                        <div className="font-semibold" style={{ color: (attempt.issues_discovered ?? round.discovered.length) ? LK.error : LK.muted }}>{attempt.issues_discovered ?? round.discovered.length}</div>
                        <div className="font-semibold" style={{ color: LK.success }}>{attempt.issues_resolved ?? round.resolved.length}</div>
                        <div className="font-semibold" style={{ color: (attempt.issues_open_after_attempt ?? round.openAtRound.length) ? LK.error : LK.body }}>{attempt.issues_open_after_attempt ?? round.openAtRound.length}</div>
                        <div>
                          <span
                            className="inline-flex rounded-full border px-3 py-1 text-xs font-semibold"
                            style={{ borderColor: badge.border, backgroundColor: badge.bg, color: badge.color }}
                          >
                            {attempt.status_label || (round.isFinal ? '最终轮' : passed ? '已通过' : '需修复')}
                          </span>
                        </div>
                        <div className="text-right text-xs font-semibold transition-colors group-hover:text-ink" style={{ color: LK.muted }}>
                          <span className="group-open:hidden">详情 ▾</span>
                          <span className="hidden group-open:inline">收起 ▴</span>
                        </div>
                      </summary>
                      <div
                        className="border-l-4 p-5"
                        style={{ borderColor: accent, borderTop:`1px solid ${badge.border}`, backgroundColor: bg }}
                      >
                        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-semibold" style={{ color: LK.body }}>
                          <span>本轮发现 {round.discovered.length} 项</span>
                          <span style={{ color: LK.border }}>/</span>
                          <span>本轮解决 {round.resolved.length} 项</span>
                          <span style={{ color: LK.border }}>/</span>
                          <span>轮后未闭环 {round.openAtRound.length} 项</span>
                        </div>
                        <div className="grid gap-4 lg:grid-cols-2">
                          <div>
                            <div className="mb-2 flex items-center justify-between border-b pb-2" style={{ borderColor: LK.border }}>
                              <div className="text-xs font-semibold tracking-wider" style={{ color: LK.error }}>本轮发现</div>
                              <div className="text-[11px] font-semibold" style={{ color: LK.muted }}>{round.discovered.length} 项</div>
                            </div>
                            <div className="space-y-2">
                              {round.discovered.length ? (
                                round.discovered.map((issue, idx) => (
                                  <div
                                    key={`d-${attempt.attempt_no}-${issue.id}`}
                                    className="rounded-xl p-3"
                                    style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
                                  >
                                    <div className="flex items-start gap-3">
                                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold" style={{ backgroundColor: LK.error + '20', color: LK.error }}>
                                        {idx + 1}
                                      </div>
                                      <div className="min-w-0">
                                        <div className="text-sm font-semibold" style={{ color: LK.ink }}>{issue.display_label || issue.label}</div>
                                        <div className="mt-1 text-xs leading-5" style={{ color: LK.body }}>
                                          {issue.description ||`${issue.category_label || issue.category} · ${issue.severity_label || issue.severity}`}
                                        </div>
                                        <div className="mt-1 font-mono text-[11px] font-semibold" style={{ color: LK.muted }}>{issue.function}</div>
                                      </div>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="rounded-xl px-3 py-2 text-xs font-semibold" style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}`, color: LK.muted }}>
                                  本轮未新增阻断问题
                                </div>
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="mb-2 flex items-center justify-between border-b pb-2" style={{ borderColor: LK.border }}>
                              <div className="text-xs font-semibold tracking-wider" style={{ color: LK.success }}>本轮解决</div>
                              <div className="text-[11px] font-semibold" style={{ color: LK.muted }}>{round.resolved.length} 项</div>
                            </div>
                            <div className="space-y-2">
                              {round.resolved.length ? (
                                round.resolved.map((issue) => (
                                  <div
                                    key={`r-${attempt.attempt_no}-${issue.id}`}
                                    className="grid grid-cols-[minmax(0,1fr)_76px] items-center gap-2 rounded-xl p-3"
                                    style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
                                  >
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-semibold" style={{ color: LK.ink }}>{issue.display_label || issue.label}</div>
                                      <div className="mt-1 font-mono text-[11px] font-semibold" style={{ color: LK.muted }}>第 {issue.introduced_attempt} 轮发现</div>
                                    </div>
                                    <div className="rounded-lg px-2 py-2 text-center text-xs font-semibold" style={{ backgroundColor: LK.success + '20', color: LK.success }}>
                                      {issue.status_label || '已解决'}
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="rounded-xl px-3 py-2 text-xs font-semibold" style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}`, color: LK.muted }}>
                                  本轮暂无已关闭问题
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </details>
                  );
                })}
              </div>
            </div>
          </PanelCard>
        </div>
      </div>
    </section>
  );
};
