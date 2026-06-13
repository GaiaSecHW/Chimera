import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, BarChart3, RefreshCw, ShieldAlert, TrendingUp } from 'lucide-react';
import { api } from '../../clients/api';
import {
  ACTION_STATUS_LABELS,
  FINISHED_REASON_LABELS,
  SEVERITY_LABELS,
  STAGE_LABELS,
  cardClass,
  labelOf,
  stageTone,
  toneOf,
} from './vuln-engine/shared';

const vulnApi = api.domains.vuln;

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

const severityPalette: Record<string, string> = {
  critical: 'bg-rose-500',
  high: 'bg-orange-500',
  medium: 'bg-amber-500',
  low: 'bg-emerald-500',
};

export const VulnOverviewPage: React.FC<VulnPageProps> = ({ projectId }) => {
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
  const issueCount = Number(overview?.decision_counts?.issue || 0);
  const nonIssueCount = Number(overview?.decision_counts?.non_issue || 0);
  const closedCases = issueCount + nonIssueCount;
  const finishedCount = Number(overview?.stage_counts?.finished || 0);
  const finishedRate = totalCases > 0 ? ((finishedCount / totalCases) * 100).toFixed(1) : '0.0';
  const highRiskRate = totalCases > 0 ? ((highRiskCount / totalCases) * 100).toFixed(1) : '0.0';
  const runningCases = Number(overview?.metrics?.running_cases || 0);
  const waitingExternal = Number(overview?.metrics?.waiting_external || 0);
  const serviceAvailabilityRate = registeredServices > 0 ? ((activeServices / registeredServices) * 100).toFixed(1) : '0.0';
  const actionStatusEntries = Object.entries(overview?.action_status_counts || {}) as Array<[string, number]>;
  const resultTypeEntries = Object.entries(overview?.result_type_counts || {}) as Array<[string, number]>;
  const finishedReasonEntries = Object.entries(overview?.finished_reason_counts || {}) as Array<[string, number]>;
  const maxActionCount = Math.max(1, ...actionStatusEntries.map(([, count]) => Number(count || 0)));
  const maxResultCount = Math.max(1, ...resultTypeEntries.map(([, count]) => Number(count || 0)));
  const maxFinishedReasonCount = Math.max(1, ...finishedReasonEntries.map(([, count]) => Number(count || 0)));

  return (
    <div className="animate-in fade-in space-y-5 p-6 pb-16 duration-500 xl:p-8 xl:pb-20">
      <section className="overflow-hidden rounded-[2rem] border border-[rgba(255,255,255,0.08)] bg-[radial-gradient(circle_at_top_left,_rgba(244,63,94,0.08),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.08),_transparent_24%),var(--bg-surface)] shadow-sm">
        <div className="flex flex-col gap-5 px-5 py-5 xl:flex-row xl:items-start xl:justify-between xl:px-6">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-rose-700">
              <BarChart3 size={13} />
              生命周期总览
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-900 xl:text-3xl">漏洞生命周期指挥台</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              把阶段堆积、风险密度、队列压力和结论收敛压缩到一屏内，快速判断项目当前最需要介入的位置。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl border border-slate-200 bg-[var(--bg-surface)] px-3 py-2">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">项目</div>
              <div className="mt-1 text-sm font-black text-slate-800">{projectId || 'n/a'}</div>
            </div>
            <button
              onClick={loadOverview}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-slate-900/10"
            >
              <RefreshCw size={15} />
              刷新统计
            </button>
          </div>
        </div>

        <div className="grid gap-3 border-t border-slate-100 px-5 py-4 md:grid-cols-2 xl:grid-cols-5 xl:px-6">
          <div className="rounded-[1.4rem] border border-slate-200 bg-[var(--bg-surface)] px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">漏洞总数</span>
              <ShieldAlert className="text-rose-200" size={18} />
            </div>
            <div className="mt-2 text-3xl font-black text-slate-900">{totalCases}</div>
            <div className="mt-1 text-xs text-slate-500">生命周期纳管总量</div>
          </div>

          <div className="rounded-[1.4rem] border border-slate-200 bg-[var(--bg-surface)] px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">高危占比</span>
              <AlertTriangle className="text-orange-200" size={18} />
            </div>
            <div className="mt-2 text-3xl font-black text-slate-900">{highRiskRate}%</div>
            <div className="mt-1 text-xs text-slate-500">{highRiskCount} 个严重 / 高危</div>
          </div>

          <div className="rounded-[1.4rem] border border-slate-200 bg-[var(--bg-surface)] px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">外部等待</span>
              <Activity className="text-indigo-200" size={18} />
            </div>
            <div className="mt-2 text-3xl font-black text-slate-900">{waitingExternal}</div>
            <div className="mt-1 text-xs text-slate-500">外部模块尚未回传</div>
          </div>

          <div className="rounded-[1.4rem] border border-slate-200 bg-[var(--bg-surface)] px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">结束占比</span>
              <TrendingUp className="text-emerald-300" size={18} />
            </div>
            <div className="mt-2 text-3xl font-black text-slate-900">{finishedRate}%</div>
            <div className="mt-1 text-xs text-slate-500">已结束 {finishedCount} 个</div>
          </div>

          <div className="rounded-[1.4rem] bg-slate-900 px-4 py-3 text-white shadow-lg shadow-slate-900/10">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">人工待办</span>
              <BarChart3 className="text-blue-300" size={18} />
            </div>
            <div className="mt-2 text-3xl font-black">{overview?.metrics?.manual_tasks_open || 0}</div>
            <div className="mt-1 text-xs text-slate-300">需要人工介入的任务</div>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-[1.25rem] border border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="grid gap-4">
          <div className={cardClass}>
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-base font-black text-slate-900">生命周期流转</h3>
              <p className="mt-1 text-xs text-slate-500">上报、验证、漏洞/归档三段主流程与当前项目分布。</p>
            </div>
            <div className="p-5">
              <div className="grid gap-3 md:grid-cols-3">
                {STAGE_ORDER.map((stage, index) => (
                  <div key={stage} className="relative rounded-[1.2rem] border border-slate-200 bg-[rgba(255,255,255,0.04)] px-4 py-3">
                    {index < STAGE_ORDER.length - 1 && (
                      <div className="absolute -right-2 top-1/2 hidden h-px w-4 -translate-y-1/2 bg-slate-300 md:block" />
                    )}
                    <div className={`inline-flex rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-widest ${toneOf(stage, stageTone)}`}>
                      {labelOf(stage, STAGE_LABELS)}
                    </div>
                    <div className="mt-2 text-2xl font-black text-slate-900">{Number(overview?.stage_counts?.[stage] || 0)}</div>
                    <p className="mt-1 text-[11px] leading-5 text-slate-500">{STAGE_EXPLANATIONS[stage]}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={cardClass}>
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-base font-black text-slate-900">阶段分布</h3>
                <p className="mt-1 text-xs text-slate-500">看清当前堆积点和推进压力。</p>
              </div>
              <div className="rounded-xl bg-slate-100 px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                {totalCases} Cases
              </div>
            </div>
            <div className="grid gap-3 p-5">
              {stageItems.map((item) => (
                <div key={item.stage} className="rounded-[1.2rem] border border-slate-200 bg-[rgba(255,255,255,0.04)] px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${toneOf(item.stage, stageTone)}`}>
                        {labelOf(item.stage, STAGE_LABELS)}
                      </span>
                      <span className="text-sm font-semibold text-slate-700">{item.count}</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-400">
                      {totalCases > 0 ? `${((item.count / totalCases) * 100).toFixed(1)}%` : '0.0%'}
                    </span>
                  </div>
                  <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-slate-900 via-slate-800 to-blue-600"
                      style={{ width: `${(item.count / maxStageCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 2xl:grid-cols-[1.05fr_0.95fr]">
            <div className={cardClass}>
              <div className="border-b border-slate-100 px-5 py-4">
                <h3 className="text-base font-black text-slate-900">近 7 天趋势</h3>
                <p className="mt-1 text-xs text-slate-500">每天新进入生命周期的漏洞数量。</p>
              </div>
              <div className="p-5">
                <div className="flex h-52 items-end gap-2.5">
                  {trendItems.map((item: any) => (
                    <div key={item.date} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                      <div className="text-[11px] font-black text-slate-500">{item.count}</div>
                      <div
                        className="w-full max-w-[3.5rem] rounded-t-2xl bg-gradient-to-t from-slate-900 via-slate-800 to-blue-500"
                        style={{ height: `${Math.max(12, (Number(item.count || 0) / maxTrendCount) * 100)}%` }}
                      />
                      <div className="text-[10px] text-slate-400">{String(item.date).slice(5)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={cardClass}>
              <div className="border-b border-slate-100 px-5 py-4">
                <h3 className="text-base font-black text-slate-900">严重等级</h3>
                <p className="mt-1 text-xs text-slate-500">风险层级分布一眼看清。</p>
              </div>
              <div className="grid gap-3 p-5">
                {severityItems.map((item) => (
                  <div key={item.severity} className="flex items-center justify-between rounded-[1.2rem] border border-slate-200 bg-[rgba(255,255,255,0.04)] px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className={`h-3 w-3 rounded-full ${severityPalette[item.severity] || 'bg-slate-400'}`} />
                      <span className="text-sm font-black tracking-[0.08em] text-slate-700">{labelOf(item.severity, SEVERITY_LABELS)}</span>
                    </div>
                    <span className="text-2xl font-black text-slate-900">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          <div className={cardClass}>
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-base font-black text-slate-900">运行指挥板</h3>
              <p className="mt-1 text-xs text-slate-500">服务供给、动作队列和运行中案例的即时状态。</p>
            </div>
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              <div className="rounded-[1.2rem] border border-slate-200 bg-[rgba(255,255,255,0.04)] px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">运行中 Case</div>
                <div className="mt-2 text-3xl font-black text-slate-900">{runningCases}</div>
              </div>
              <div className="rounded-[1.2rem] border border-slate-200 bg-[rgba(255,255,255,0.04)] px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">排队动作</div>
                <div className="mt-2 text-3xl font-black text-slate-900">{queuedActions}</div>
              </div>
              <div className="rounded-[1.2rem] border border-slate-200 bg-[rgba(255,255,255,0.04)] px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">活跃服务</div>
                <div className="mt-2 text-3xl font-black text-slate-900">{activeServices}</div>
                <div className="mt-1 text-xs text-slate-500">注册 {registeredServices}</div>
              </div>
              <div className="rounded-[1.2rem] border border-slate-200 bg-[rgba(255,255,255,0.04)] px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">服务可用率</div>
                <div className="mt-2 text-3xl font-black text-slate-900">{serviceAvailabilityRate}%</div>
              </div>
            </div>
          </div>

          <div className={cardClass}>
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-base font-black text-slate-900">结束结论分布</h3>
              <p className="mt-1 text-xs text-slate-500">观察结论收敛与误报/接受风险分布。</p>
            </div>
            <div className="grid gap-3 p-5">
              {finishedReasonEntries.length === 0 ? (
                <div className="text-sm text-slate-400">暂无结束结论统计</div>
              ) : (
                finishedReasonEntries.map(([status, count]) => (
                  <div key={status} className="space-y-2">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm font-black text-slate-700">{labelOf(status, FINISHED_REASON_LABELS)}</span>
                      <span className="text-sm font-semibold text-slate-500">{Number(count || 0)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-slate-900 to-emerald-500"
                        style={{ width: `${(Number(count || 0) / maxFinishedReasonCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={cardClass}>
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-base font-black text-slate-900">动作状态分布</h3>
              <p className="mt-1 text-xs text-slate-500">快速识别队列是否卡在某个执行态。</p>
            </div>
            <div className="grid gap-3 p-5">
              {actionStatusEntries.length === 0 ? (
                <div className="text-sm text-slate-400">暂无动作状态数据</div>
              ) : (
                actionStatusEntries.map(([status, count]) => (
                  <div key={status} className="space-y-2">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm font-black text-slate-700">{labelOf(status, ACTION_STATUS_LABELS)}</span>
                      <span className="text-sm font-semibold text-slate-500">{Number(count || 0)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-slate-900 to-cyan-500"
                        style={{ width: `${(Number(count || 0) / maxActionCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[0.95fr_1.05fr]">
        <div className={cardClass}>
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="text-base font-black text-slate-900">结果类型分布</h3>
            <p className="mt-1 text-xs text-slate-500">识别当前回传结果更偏分析、验证还是证明。</p>
          </div>
          <div className="grid gap-3 p-5">
            {resultTypeEntries.length === 0 ? (
              <div className="text-sm text-slate-400">暂无结果类型数据</div>
            ) : (
              resultTypeEntries.map(([resultType, count]) => (
                <div key={resultType} className="space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-black text-slate-700">{resultType}</span>
                    <span className="text-sm font-semibold text-slate-500">{Number(count || 0)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-600 to-emerald-500"
                      style={{ width: `${(Number(count || 0) / maxResultCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className={cardClass}>
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="text-base font-black text-slate-900">项目运营摘要</h3>
            <p className="mt-1 text-xs text-slate-500">把需要关注的运行信号压成一块简报。</p>
          </div>
          <div className="grid gap-3 p-5 md:grid-cols-2">
            <div className="rounded-[1.2rem] bg-slate-50 px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">明确结论</div>
              <div className="mt-2 text-2xl font-black text-slate-900">{closedCases}</div>
              <div className="mt-1 text-xs text-slate-500">confirmed / false positive / accepted risk</div>
            </div>
            <div className="rounded-[1.2rem] bg-slate-50 px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">待外部结果</div>
              <div className="mt-2 text-2xl font-black text-slate-900">{waitingExternal}</div>
              <div className="mt-1 text-xs text-slate-500">说明外部模块回传仍是当前瓶颈</div>
            </div>
            <div className="rounded-[1.2rem] bg-slate-50 px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">活跃 / 注册服务</div>
              <div className="mt-2 text-2xl font-black text-slate-900">
                {activeServices} / {registeredServices}
              </div>
              <div className="mt-1 text-xs text-slate-500">供给侧健康度</div>
            </div>
            <div className="rounded-[1.2rem] bg-slate-50 px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">高危密度</div>
              <div className="mt-2 text-2xl font-black text-slate-900">{highRiskCount}</div>
              <div className="mt-1 text-xs text-slate-500">高风险问题需优先清空验证和裁决链路</div>
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div className="rounded-[1.25rem] border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500">
          正在加载漏洞生命周期统计...
        </div>
      )}
    </div>
  );
};
