import React from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';

import { B2SReviewAnalytics, B2SReviewAnalyticsDimension } from '../../../clients/binaryToSource';

const CHART_COLORS: Record<string, string> = {
  logic: 'var(--color-chart-logic)',
  structure: 'var(--color-chart-structure)',
  readability: 'var(--color-chart-readability)',
  grid: 'var(--color-chart-grid)',
  axis: 'var(--color-chart-axis)',
};

const PanelCard: React.FC<{ title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, right, children, className = '' }) => (
  <div className={`rounded-none border border-slate-200 bg-white/90 p-5 shadow-panel ring-1 ring-slate-900/[0.03] ${className}`}>
    <div className="mb-4 flex min-h-6 items-start justify-between gap-3">
      <div className="min-w-0">{typeof title === 'string' ? <div className="text-[14px] font-black tracking-[0.04em] text-slate-900">{title}</div> : title}</div>
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
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const last = points[points.length - 1];

  return (
    <svg className="overflow-visible" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={path} fill="none" stroke="#d9d9de" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.slice(0, -1).map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="3.5" fill="white" stroke="#e5e5ea" strokeWidth="2" />)}
      {last && <circle cx={last.x} cy={last.y} r="4" fill="white" stroke={color} strokeWidth="2.6" />}
    </svg>
  );
};

const colorForDimension = (dimension: B2SReviewAnalyticsDimension, index: number) => {
  if (dimension.color_hint && CHART_COLORS[dimension.color_hint]) return CHART_COLORS[dimension.color_hint];
  return [CHART_COLORS.logic, CHART_COLORS.structure, CHART_COLORS.readability][index] || CHART_COLORS.axis;
};

const dotClassForDimension = (dimension: B2SReviewAnalyticsDimension, index: number) => {
  if (dimension.color_hint === 'logic') return 'bg-chart-logic';
  if (dimension.color_hint === 'structure') return 'bg-chart-structure';
  if (dimension.color_hint === 'readability') return 'bg-chart-readability';
  return ['bg-chart-logic', 'bg-chart-structure', 'bg-chart-readability'][index] || 'bg-slate-500';
};

const labelClassForDimension = (dimension: B2SReviewAnalyticsDimension, index: number) => {
  if (dimension.color_hint === 'logic') return 'text-chart-logic';
  if (dimension.color_hint === 'structure') return 'text-chart-structure';
  if (dimension.color_hint === 'readability') return 'text-chart-readability';
  return ['text-chart-logic', 'text-chart-structure', 'text-chart-readability'][index] || 'text-slate-700';
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
  const verdictTone = verdictPassed ? 'text-emerald-700' : verdictFailed ? 'text-rose-700' : 'text-slate-700';
  const verdictBg = verdictPassed ? 'border-emerald-200 border-l-emerald-500 bg-emerald-50/35' : verdictFailed ? 'border-rose-200 border-l-rose-500 bg-rose-50/35' : 'border-slate-200 border-l-slate-400 bg-slate-50/60';
  const conclusionText = verdictPassed
    ? `多轮评审已完成，当前未发现阻断问题，遗留问题 ${remainingCount} 项。`
    : verdictFailed
      ? `评审仍未通过，当前遗留问题 ${remainingCount} 项，建议优先查看闭环证据。`
      : '评审结论暂不可判定，建议查看各轮评审详情与中间产物。';
  const closureTitle = remainingCount > 0 ? `仍有 ${remainingCount} 项未闭环` : '问题全部闭环';
  const closureTone = remainingCount > 0 ? 'text-rose-700' : 'text-emerald-700';
  const closureDescription = `共发现 ${issueTotal || 0} 项问题，已解决 ${resolvedCount} 项，未解决 ${remainingCount} 项。`;
  const trendToneClass = trend?.tone === 'warning' ? 'text-amber-700' : trend?.tone === 'positive' ? 'text-emerald-700' : 'text-slate-700';

  const qualityTrend = (() => {
    const attemptMap = new Map<number, Record<string, number | string>>();
    dimensions.forEach((dimension) => {
      dimension.points.forEach((point) => {
        const row = attemptMap.get(point.attempt_no) || { round: point.label || `第${point.attempt_no}轮` };
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
    <section className="overflow-hidden rounded-none border border-slate-200 bg-white p-6 shadow-section">
      <div className="relative mb-6 flex items-center justify-between gap-3">
        <div className="text-xl font-black tracking-[0.05em] text-slate-900">代码还原质量迭代追踪</div>
        {(analytics.meta?.mock ?? analytics.summary.mock) && <div className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-black tracking-[0.12em] text-cyan-700">模拟数据</div>}
      </div>

      <div className={`mb-4 rounded-none border border-l-4 p-5 ${verdictBg}`}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="text-[13px] font-black tracking-[0.08em] text-slate-400">最终结论</div>
            <div className={`mt-1 text-5xl font-black leading-none tracking-tight ${verdictTone}`}>{verdictLabel}</div>
            <div className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-600">{conclusionText}</div>
          </div>
          <div className="grid shrink-0 grid-cols-2 divide-x divide-slate-200 border-l border-slate-200 bg-white/45 lg:min-w-[430px]">
            <div className="px-5 py-3 text-center">
              <div className="text-[11px] font-black tracking-[0.12em] text-slate-400">最终质量</div>
              <div className="mt-1 flex items-baseline justify-center gap-2">
                <span className="text-3xl font-black text-indigo-700">{finalQualityScore}</span>
                <span className="text-sm font-black text-amber-700">+{improvementPercent}%</span>
              </div>
              <div className="mt-1 text-xs font-black text-indigo-600">{finalQualityLabel} · {firstQualityScore} → {finalQualityScore}</div>
            </div>
            <div className="px-5 py-3 text-center">
              <div className="text-[11px] font-black tracking-[0.12em] text-slate-400">问题闭环</div>
              <div className={`mt-1 text-3xl font-black ${remainingCount > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{resolvedCount}/{issueTotal || 0}</div>
              <div className="mt-1 text-xs font-black text-slate-500">遗留 {remainingCount}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <PanelCard title={<div><div className="text-[13px] font-black tracking-[0.08em] text-slate-400">质量趋势</div><div className={`mt-1 text-3xl font-black leading-tight tracking-tight ${trendToneClass}`}>{trend?.title || '逐轮质量趋势'}</div><div className="mt-1 max-w-xl text-xs font-semibold leading-5 text-slate-500">{trend?.conclusion || '暂无足够轮次数据生成趋势结论。'}</div></div>} className="flex h-full flex-col">
          <div className="min-h-[300px] flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={qualityTrend} margin={{ top: 20, right: 26, left: 0, bottom: 12 }}>
                <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="4 5" strokeOpacity={0.8} vertical={false} />
                <XAxis dataKey="round" stroke={CHART_COLORS.axis} tick={{ fontSize: 12, fontWeight: 900 }} tickLine={false} axisLine={{ stroke: CHART_COLORS.grid }} />
                <YAxis domain={[(dataMin: number) => Math.max(0, Math.floor(dataMin / 10) * 10 - 5), 100]} ticks={[55, 70, 85, 100]} stroke={CHART_COLORS.axis} tick={{ fontSize: 10, fontWeight: 800 }} tickLine={false} axisLine={{ stroke: CHART_COLORS.grid }} />
                {dimensions.map((dimension, index) => <Line key={dimension.key} type="monotone" dataKey={dimension.label} stroke={colorForDimension(dimension, index)} strokeWidth={2.6} dot={{ r: 3.4, fill: 'white', strokeWidth: 2 }} activeDot={{ r: 6, strokeWidth: 2.5, fill: 'var(--color-white)' }} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-slate-100 pt-3 text-[11px] font-black">
            {dimensions.map((dimension, index) => <span key={dimension.key} className="inline-flex items-center gap-1.5 text-slate-600"><span className={`h-2.5 w-2.5 rounded-full ${dotClassForDimension(dimension, index)}`} />{dimension.label}</span>)}
          </div>
        </PanelCard>

        <PanelCard title={<div><div className="text-[13px] font-black tracking-[0.08em] text-slate-400">质量评分拆解</div><div className="mt-1 text-3xl font-black leading-tight tracking-tight text-slate-900">{finalQualityLabel} · {finalQualityScore}</div><div className="mt-1 max-w-xl text-xs font-semibold leading-5 text-slate-500">初始质量 {firstQualityScore}，最终质量 {finalQualityScore}，综合提升 {qualityDelta} 分。</div></div>}>
          <div className="space-y-3">
            {dimensions.map((dimension, index) => {
              const color = colorForDimension(dimension, index);
              const labelClass = labelClassForDimension(dimension, index);
              return (
                <div key={dimension.key} className="grid grid-cols-[minmax(0,1fr)_118px] items-center gap-5 rounded-[18px] bg-white px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.025),0_0_0_1px_rgba(60,60,67,0.045)]">
                  <div className="min-w-0">
                    <div className="mb-4 flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${dotClassForDimension(dimension, index)}`} /><div className={`text-sm font-black tracking-[-0.01em] ${labelClass}`}>{dimension.label}</div></div>
                    <div className="flex items-baseline gap-1.5"><span className="text-[42px] font-black leading-none tracking-[-0.045em] text-black">{dimension.score}</span><span className="text-[17px] font-semibold text-slate-400">分</span></div>
                    <div className="mt-1 text-sm font-bold text-slate-900">{dimension.level_label} · 较初始提升 <span className={labelClass}>{dimension.delta_percent}%</span></div>
                    <div className="mt-2 text-sm font-medium leading-5 text-slate-400">{dimension.description}</div>
                  </div>
                  <div className="justify-self-end"><DimensionSparkline values={dimension.points.map((point) => ({ attemptNo: point.attempt_no, value: point.score }))} color={color} /></div>
                </div>
              );
            })}
          </div>
        </PanelCard>

        <div id="b2s-review-evidence" className="scroll-mt-24 xl:col-span-2">
          <PanelCard title={<div><div className="text-[13px] font-black tracking-[0.08em] text-slate-400">评审闭环时间线</div><div className={`mt-1 text-3xl font-black leading-tight tracking-tight ${closureTone}`}>{closureTitle}</div><div className="mt-1 max-w-xl text-xs font-semibold leading-5 text-slate-500">{closureDescription}</div></div>}>
            <div className="overflow-hidden border border-slate-200">
              <div className="grid grid-cols-[104px_88px_repeat(6,minmax(72px,1fr))_92px_88px] gap-0 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400"><div>轮次</div><div>结论</div><div>已验证</div><div>阻断</div><div>语义分</div><div>发现</div><div>解决</div><div>未闭环</div><div>状态</div><div className="text-right">操作</div></div>
              <div className="divide-y divide-slate-200">
                {roundSummaries.map((round) => {
                  const attempt = round.attempt;
                  const passed = round.tone === 'emerald';
                  const border = passed ? 'border-emerald-200' : 'border-rose-200';
                  const bg = passed ? 'bg-emerald-50/50' : 'bg-rose-50/50';
                  const badge = passed ? 'border-emerald-300/30 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700';
                  const accent = passed ? 'border-l-emerald-500' : 'border-l-rose-500';
                  return (
                    <details key={attempt.attempt_no} className="group">
                      <summary className={`grid list-none cursor-pointer grid-cols-[104px_88px_repeat(6,minmax(72px,1fr))_92px_88px] items-center border-l-4 ${accent} bg-white px-4 py-3 text-sm transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden`}>
                        <div className="font-black text-slate-500">第 {attempt.attempt_no} 轮</div><div className={`text-lg font-black leading-none ${passed ? 'text-emerald-700' : 'text-rose-700'}`}>{round.verdictLabel}</div><div className="font-black text-emerald-700">{attempt.verified_functions}/{attempt.total_functions}</div><div className={`font-black ${attempt.blocking_issues ? 'text-rose-700' : 'text-emerald-700'}`}>{attempt.blocking_issues}</div><div className="font-black text-violet-700">{attempt.semantic_score}</div><div className={`font-black ${(attempt.issues_discovered ?? round.discovered.length) ? 'text-rose-700' : 'text-slate-500'}`}>{attempt.issues_discovered ?? round.discovered.length}</div><div className="font-black text-emerald-700">{attempt.issues_resolved ?? round.resolved.length}</div><div className={`font-black ${(attempt.issues_open_after_attempt ?? round.openAtRound.length) ? 'text-rose-700' : 'text-slate-700'}`}>{attempt.issues_open_after_attempt ?? round.openAtRound.length}</div><div><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${badge}`}>{attempt.status_label || (round.isFinal ? '最终轮' : passed ? '已通过' : '需修复')}</span></div><div className="text-right text-xs font-black text-slate-500 transition group-open:text-slate-900"><span className="group-open:hidden">详情 ▾</span><span className="hidden group-open:inline">收起 ▴</span></div>
                      </summary>
                      <div className={`border-l-4 ${accent} border-t ${border} ${bg} p-5`}>
                        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600"><span>本轮发现 {round.discovered.length} 项</span><span className="text-slate-300">/</span><span>本轮解决 {round.resolved.length} 项</span><span className="text-slate-300">/</span><span>轮后未闭环 {round.openAtRound.length} 项</span></div>
                        <div className="grid gap-4 lg:grid-cols-2">
                          <div><div className="mb-2 flex items-center justify-between border-b border-slate-200 pb-2"><div className="text-xs font-black tracking-[0.08em] text-rose-700">本轮发现</div><div className="text-[11px] font-bold text-slate-500">{round.discovered.length} 项</div></div><div className="space-y-2">{round.discovered.length ? round.discovered.map((issue, idx) => <div key={`d-${attempt.attempt_no}-${issue.id}`} className="rounded-none border border-slate-200 bg-white/85 p-3"><div className="flex items-start gap-3"><div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xs font-black text-rose-700">{idx + 1}</div><div className="min-w-0"><div className="text-sm font-black text-slate-900">{issue.display_label || issue.label}</div><div className="mt-1 text-xs font-medium leading-5 text-slate-500">{issue.description || `${issue.category_label || issue.category} · ${issue.severity_label || issue.severity}`}</div><div className="mt-1 font-mono text-[11px] font-bold text-slate-500">{issue.function}</div></div></div></div>) : <div className="rounded-none border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">本轮未新增阻断问题</div>}</div></div>
                          <div><div className="mb-2 flex items-center justify-between border-b border-slate-200 pb-2"><div className="text-xs font-black tracking-[0.08em] text-emerald-700">本轮解决</div><div className="text-[11px] font-bold text-slate-500">{round.resolved.length} 项</div></div><div className="space-y-2">{round.resolved.length ? round.resolved.map((issue) => <div key={`r-${attempt.attempt_no}-${issue.id}`} className="grid grid-cols-[minmax(0,1fr)_76px] items-center gap-2 rounded-none border border-slate-200 bg-white/85 p-3"><div className="min-w-0"><div className="truncate text-sm font-black text-slate-900">{issue.display_label || issue.label}</div><div className="mt-1 font-mono text-[11px] font-bold text-slate-500">第 {issue.introduced_attempt} 轮发现</div></div><div className="rounded-none bg-emerald-100 px-2 py-2 text-center text-xs font-black text-emerald-700">{issue.status_label || '已解决'}</div></div>) : <div className="rounded-none border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">本轮暂无已关闭问题</div>}</div></div>
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
