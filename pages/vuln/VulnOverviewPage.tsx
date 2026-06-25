import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, RefreshCw, ShieldAlert, TrendingUp } from 'lucide-react';
import { PageHeader } from '../../design-system';
import { api } from '../../clients/api';
import { ServiceBuildVersionBadge, useServiceBuildVersion } from '../../components/execution/ServiceBuildVersion';
import {
  ACTION_STATUS_LABELS,
  FINISHED_REASON_LABELS,
  SEVERITY_LABELS,
  STAGE_LABELS,
  labelOf,
} from './vuln-engine/shared';

const vulnApi = api.domains.vuln;

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
} as const;

const SEVERITY_COLORS: Record<string, string> = {
  critical: LK.error,
  high: '#ff8b3d',
  medium: LK.warning,
  low: LK.success,
};

interface VulnPageProps {
  projectId: string;
  onNavigateToView?: (view: string) => void;
}

const STAGE_ORDER = ['receive', 'validation', 'finished'];
const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];
const STAGE_EXPLANATIONS: Record<string, string> = {
  receive: '已接收漏洞，等待进入验证。',
  validation: '正在真实验证，尚无最终验证结果。',
  finished: '生命周期终态，已形成漏洞或归档结论。',
};

export const VulnOverviewPage: React.FC<VulnPageProps> = ({ projectId }) => {
  const buildVersion = useServiceBuildVersion(vulnApi.vuln.getHealth);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<any | null>(null);

  const loadOverview = async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await vulnApi.vuln.getOverview(projectId);
      setOverview(response);
    } catch (err: any) {
      setError(err?.message || '加载漏洞生命周期总览失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, [projectId]);

  const stageItems = useMemo(
    () => STAGE_ORDER.map((stage) => ({ stage, count: Number(overview?.stage_counts?.[stage] || 0) })),
    [overview],
  );
  const severityItems = useMemo(
    () => SEVERITY_ORDER.map((severity) => ({ severity, count: Number(overview?.severity_counts?.[severity] || 0) })),
    [overview],
  );

  const trendItems = overview?.recent_trend || [];
  const maxStageCount = Math.max(1, ...stageItems.map((item) => item.count));
  const maxTrendCount = Math.max(1, ...trendItems.map((item: any) => Number(item.count || 0)));
  const totalCases = Number(overview?.metrics?.total_cases || 0);
  const highRiskCount = Number(overview?.severity_counts?.critical || 0) + Number(overview?.severity_counts?.high || 0);
  const activeServices = Number(overview?.metrics?.active_services || 0);
  const registeredServices = Number(overview?.metrics?.registered_services || 0);
  const queuedActions = Number(overview?.metrics?.queued_actions || 0);
  const finishedCount = Number(overview?.stage_counts?.finished || 0);
  const finishedRate = Number(overview?.metrics?.finished_rate || 0).toFixed(1);
  const highRiskRate = totalCases > 0 ? ((highRiskCount / totalCases) * 100).toFixed(1) : '0.0';
  const runningCases = Number(overview?.metrics?.running_cases || 0);
  const serviceAvailabilityRate = registeredServices > 0 ? ((activeServices / registeredServices) * 100).toFixed(1) : '0.0';
  const actionStatusEntries = Object.entries(overview?.action_status_counts || {}) as Array<[string, number]>;
  const resultTypeEntries = Object.entries(overview?.result_type_counts || {}) as Array<[string, number]>;
  const finishedReasonEntries = Object.entries(overview?.finished_reason_counts || {}) as Array<[string, number]>;
  const maxActionCount = Math.max(1, ...actionStatusEntries.map(([, count]) => Number(count || 0)));
  const maxResultCount = Math.max(1, ...resultTypeEntries.map(([, count]) => Number(count || 0)));
  const maxFinishedReasonCount = Math.max(1, ...finishedReasonEntries.map(([, count]) => Number(count || 0)));

  return (
    <div
      className="space-y-4 px-5 py-5 md:px-6 2xl:px-8"
      style={{ backgroundColor: LK.canvas, minHeight: '100%', color: LK.inkSoft }}
    >
      <PageHeader
        title={(
          <span className="inline-flex flex-wrap items-center gap-3">
            <span>漏洞生命周期指挥台</span>
            <ServiceBuildVersionBadge version={buildVersion} />
          </span>
        )}
        description="把阶段堆积、风险密度、队列压力和结论收敛压缩到一屏内，快速判断项目当前最需要介入的位置。"
        actions={<div className="flex flex-wrap items-center gap-3">
          <div
            className="rounded-xl px-4 py-2.5"
            style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
          >
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: LK.muted }}>
              项目
            </div>
            <div className="mt-1 text-sm font-semibold" style={{ color: LK.ink }}>{projectId || 'n/a'}</div>
          </div>
          <button
            type="button"
            onClick={loadOverview}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors"
            style={{ backgroundColor: LK.primary, color: '#ffffff' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = LK.primaryDeep)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = LK.primary)}
          >
            <RefreshCw size={15} />
            刷新统计
          </button>
        </div>}
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div
          className="flex flex-col gap-3 rounded-xl px-4 py-3"
          style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: LK.muted }}>
              漏洞总数
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: LK.surfaceRaised, color: LK.error }}>
              <ShieldAlert size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold leading-7 tabular-nums" style={{ color: LK.ink }}>{totalCases}</div>
          <div className="text-xs" style={{ color: LK.muted }}>生命周期纳管总量</div>
        </div>

        <div
          className="flex flex-col gap-3 rounded-xl px-4 py-3"
          style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: LK.muted }}>
              高危占比
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: LK.surfaceRaised, color: '#ff8b3d' }}>
              <AlertTriangle size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold leading-7 tabular-nums" style={{ color: LK.ink }}>{highRiskRate}%</div>
          <div className="text-xs" style={{ color: LK.muted }}>{highRiskCount} 个严重 / 高危</div>
        </div>

        <div
          className="flex flex-col gap-3 rounded-xl px-4 py-3"
          style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: LK.muted }}>
              结束占比
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: LK.surfaceRaised, color: LK.success }}>
              <TrendingUp size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold leading-7 tabular-nums" style={{ color: LK.ink }}>{finishedRate}%</div>
          <div className="text-xs" style={{ color: LK.muted }}>已结束 {finishedCount} 个</div>
        </div>

        <div
          className="flex flex-col gap-3 rounded-xl px-4 py-3"
          style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: LK.muted }}>
              人工待办
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: LK.surfaceRaised, color: LK.primary }}>
              <BarChart3 size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold leading-7 tabular-nums" style={{ color: LK.ink }}>{overview?.metrics?.manual_tasks_open || 0}</div>
          <div className="text-xs" style={{ color: LK.muted }}>需要人工介入的任务</div>
        </div>
      </section>

      {error ? (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{ backgroundColor: `${LK.error}14`, border: `1px solid ${LK.error}40`, color: LK.error }}
        >
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="grid gap-4">
          <section
            className="overflow-hidden rounded-xl"
            style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
          >
            <div className="px-4 py-3" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
              <h2 className="text-base font-semibold" style={{ color: LK.ink }}>生命周期流转</h2>
              <p className="mt-1 text-xs" style={{ color: LK.muted }}>上报、验证、漏洞/归档三段主流程与当前项目分布。</p>
            </div>
            <div className="p-4">
              <div className="grid gap-3 md:grid-cols-3">
                {STAGE_ORDER.map((stage) => (
                  <div
                    key={stage}
                    className="rounded-lg px-4 py-3"
                    style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}` }}
                  >
                    <div
                      className="inline-block rounded px-2 py-1 text-xs font-semibold uppercase tracking-wider"
                      style={{ backgroundColor: `${LK.primary}22`, color: LK.primary }}
                    >
                      {labelOf(stage, STAGE_LABELS)}
                    </div>
                    <div className="mt-2 text-2xl font-bold tabular-nums" style={{ color: LK.ink }}>
                      {Number(overview?.stage_counts?.[stage] || 0)}
                    </div>
                    <p className="mt-1 text-xs leading-5" style={{ color: LK.muted }}>{STAGE_EXPLANATIONS[stage]}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section
            className="overflow-hidden rounded-xl"
            style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
          >
            <div className="flex items-center justify-between gap-4 px-4 py-3" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
              <div>
                <h2 className="text-base font-semibold" style={{ color: LK.ink }}>阶段分布</h2>
                <p className="mt-1 text-xs" style={{ color: LK.muted }}>看清当前堆积点和推进压力。</p>
              </div>
              <div
                className="rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider"
                style={{ backgroundColor: LK.surfaceRaised, color: LK.muted }}
              >
                {totalCases} Cases
              </div>
            </div>
            <div className="grid gap-3 p-4">
              {stageItems.map((item) => (
                <div
                  key={item.stage}
                  className="rounded-lg px-4 py-3"
                  style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}` }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="inline-block rounded px-2.5 py-1 text-xs font-semibold uppercase tracking-wider"
                        style={{ backgroundColor: `${LK.primary}22`, color: LK.primary }}
                      >
                        {labelOf(item.stage, STAGE_LABELS)}
                      </span>
                      <span className="text-sm font-semibold" style={{ color: LK.inkSoft }}>{item.count}</span>
                    </div>
                    <span className="text-xs font-semibold" style={{ color: LK.muted }}>
                      {totalCases > 0 ?`${((item.count / totalCases) * 100).toFixed(1)}%` : '0.0%'}
                    </span>
                  </div>
                  <div className="mt-2.5 h-2 overflow-hidden rounded-full" style={{ backgroundColor: LK.surfaceRaised }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(item.count / maxStageCount) * 100}%`, backgroundColor: LK.primary }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-4 2xl:grid-cols-[1.05fr_0.95fr]">
            <section
              className="overflow-hidden rounded-xl"
              style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
            >
              <div className="px-4 py-3" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
                <h2 className="text-base font-semibold" style={{ color: LK.ink }}>近 7 天趋势</h2>
                <p className="mt-1 text-xs" style={{ color: LK.muted }}>每天新进入生命周期的漏洞数量。</p>
              </div>
              <div className="p-4">
                <div className="flex h-52 items-end gap-2.5">
                  {trendItems.map((item: any) => (
                    <div key={item.date} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                      <div className="text-xs font-semibold tabular-nums" style={{ color: LK.muted }}>{item.count}</div>
                      <div
                        className="w-full max-w-[3.5rem] rounded-t-lg"
                        style={{
                          height: `${Math.max(12, (Number(item.count || 0) / maxTrendCount) * 100)}%`,
                          backgroundColor: LK.primary
                        }}
                      />
                      <div className="text-xs" style={{ color: LK.mutedSoft }}>{String(item.date).slice(5)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section
              className="overflow-hidden rounded-xl"
              style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
            >
              <div className="px-4 py-3" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
                <h2 className="text-base font-semibold" style={{ color: LK.ink }}>严重等级</h2>
                <p className="mt-1 text-xs" style={{ color: LK.muted }}>风险层级分布一眼看清。</p>
              </div>
              <div className="grid gap-3 p-4">
                {severityItems.map((item) => (
                  <div
                    key={item.severity}
                    className="flex items-center justify-between rounded-lg px-4 py-3"
                    style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}` }}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: SEVERITY_COLORS[item.severity] || LK.muted }}
                      />
                      <span className="text-sm font-semibold tracking-wider" style={{ color: LK.inkSoft }}>
                        {labelOf(item.severity, SEVERITY_LABELS)}
                      </span>
                    </div>
                    <span className="text-2xl font-bold tabular-nums" style={{ color: LK.ink }}>{item.count}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        <div className="grid gap-4">
          <section
            className="overflow-hidden rounded-xl"
            style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
          >
            <div className="px-4 py-3" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
              <h2 className="text-base font-semibold" style={{ color: LK.ink }}>运行指挥板</h2>
              <p className="mt-1 text-xs" style={{ color: LK.muted }}>服务供给、动作队列和运行中案例的即时状态。</p>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <div
                className="rounded-lg px-4 py-3"
                style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}` }}
              >
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: LK.muted }}>
                  运行中 Case
                </div>
                <div className="mt-2 text-2xl font-bold tabular-nums" style={{ color: LK.ink }}>{runningCases}</div>
              </div>
              <div
                className="rounded-lg px-4 py-3"
                style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}` }}
              >
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: LK.muted }}>
                  排队动作
                </div>
                <div className="mt-2 text-2xl font-bold tabular-nums" style={{ color: LK.ink }}>{queuedActions}</div>
              </div>
              <div
                className="rounded-lg px-4 py-3"
                style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}` }}
              >
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: LK.muted }}>
                  活跃服务
                </div>
                <div className="mt-2 text-2xl font-bold tabular-nums" style={{ color: LK.ink }}>{activeServices}</div>
                <div className="mt-1 text-xs" style={{ color: LK.muted }}>注册 {registeredServices}</div>
              </div>
              <div
                className="rounded-lg px-4 py-3"
                style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}` }}
              >
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: LK.muted }}>
                  服务可用率
                </div>
                <div className="mt-2 text-2xl font-bold tabular-nums" style={{ color: LK.ink }}>{serviceAvailabilityRate}%</div>
              </div>
            </div>
          </section>

          <section
            className="overflow-hidden rounded-xl"
            style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
          >
            <div className="px-4 py-3" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
              <h2 className="text-base font-semibold" style={{ color: LK.ink }}>结束结论分布</h2>
              <p className="mt-1 text-xs" style={{ color: LK.muted }}>观察结论收敛与误报/接受风险分布。</p>
            </div>
            <div className="grid gap-3 p-4">
              {finishedReasonEntries.length === 0 ? (
                <div className="text-sm" style={{ color: LK.muted }}>暂无结束结论统计</div>
              ) : (
                finishedReasonEntries.map(([status, count]) => (
                  <div key={status} className="space-y-2">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm font-semibold" style={{ color: LK.inkSoft }}>
                        {labelOf(status, FINISHED_REASON_LABELS)}
                      </span>
                      <span className="text-sm font-semibold tabular-nums" style={{ color: LK.muted }}>
                        {Number(count || 0)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: LK.surfaceRaised }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(Number(count || 0) / maxFinishedReasonCount) * 100}%`, backgroundColor: LK.success }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section
            className="overflow-hidden rounded-xl"
            style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
          >
            <div className="px-4 py-3" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
              <h2 className="text-base font-semibold" style={{ color: LK.ink }}>动作状态分布</h2>
              <p className="mt-1 text-xs" style={{ color: LK.muted }}>快速识别队列是否卡在某个执行态。</p>
            </div>
            <div className="grid gap-3 p-4">
              {actionStatusEntries.length === 0 ? (
                <div className="text-sm" style={{ color: LK.muted }}>暂无动作状态数据</div>
              ) : (
                actionStatusEntries.map(([status, count]) => (
                  <div key={status} className="space-y-2">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm font-semibold" style={{ color: LK.inkSoft }}>
                        {labelOf(status, ACTION_STATUS_LABELS)}
                      </span>
                      <span className="text-sm font-semibold tabular-nums" style={{ color: LK.muted }}>
                        {Number(count || 0)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: LK.surfaceRaised }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(Number(count || 0) / maxActionCount) * 100}%`, backgroundColor: LK.info }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[0.95fr_1.05fr]">
        <section
          className="overflow-hidden rounded-xl"
          style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
        >
          <div className="px-4 py-3" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
            <h2 className="text-base font-semibold" style={{ color: LK.ink }}>结果类型分布</h2>
            <p className="mt-1 text-xs" style={{ color: LK.muted }}>识别当前回传结果更偏分析、验证还是证明。</p>
          </div>
          <div className="grid gap-3 p-4">
            {resultTypeEntries.length === 0 ? (
              <div className="text-sm" style={{ color: LK.muted }}>暂无结果类型数据</div>
            ) : (
              resultTypeEntries.map(([resultType, count]) => (
                <div key={resultType} className="space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-semibold" style={{ color: LK.inkSoft }}>{resultType}</span>
                    <span className="text-sm font-semibold tabular-nums" style={{ color: LK.muted }}>
                      {Number(count || 0)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: LK.surfaceRaised }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(Number(count || 0) / maxResultCount) * 100}%`, backgroundColor: LK.primarySoft }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {loading ? (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}`, color: LK.muted }}
        >
          正在加载漏洞生命周期统计...
        </div>
      ) : null}
    </div>
  );
};
