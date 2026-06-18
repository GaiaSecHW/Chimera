import React from 'react';
import { BarChart3 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export type DataflowVulnOverviewViewModel = {
  topCards: Array<{ label: string; value: string; hint: string; tone: string }>;
  cycleCards: Array<{ label: string; value: string; hint: string; tone: string }>;
  plateauFlags: Array<{ label: string; active: boolean; hint: string }>;
  chartData: Array<{ name: string; value: number; fill: string }>;
  insightCards: Array<{ label: string; value: string; hint: string; tone: string }>;
  runtimeModes: Array<{
    mode: string;
    calls: number | null;
    attempts: number | null;
    durationSeconds: number | null;
    avgDurationSeconds: number | null;
    timeoutFailures: number | null;
    stdoutTruncated: number | null;
    outputBytes: number | null;
  }>;
};

export type DataflowVulnAiViewModel = {
  topCards: Array<{ label: string; value: string; hint: string; tone: string }>;
  phaseCards: Array<{ label: string; value: string; hint: string; tone: string }>;
  roleChart: Array<{ name: string; value: number; fill: string }>;
  tokenChart: Array<{ name: string; value: number; fill: string }>;
  reviewCards: Array<{ label: string; value: string; hint: string; tone: string }>;
};

export type DataflowVulnSampleScope = 'focus' | 'cycle' | 'runtime' | 'ai' | 'plugin' | 'all';

type FormatterSet = {
  formatMetricValue: (value: number) => string;
  formatNumber: (value: number | null | undefined, digits?: number) => string;
  formatSeconds: (value: number | null | undefined) => string;
};

const CHART_GRID = '#26324a';

const EmptyCard: React.FC<{ text: string }> = ({ text }) => (
  <div className="flex h-full min-h-[220px] items-center justify-center rounded-[2rem] border border-dashed border-theme-border bg-theme-bg-app px-6 text-center text-sm text-theme-text-muted">
    {text}
  </div>
);

export const HeadlineMetricCard: React.FC<{ label: string; value: string; hint: string; tone: string }> = ({ label, value, hint, tone }) => (
 <div className="rounded-2xl border border-theme-border bg-theme-bg-app px-4 py-3">
    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-theme-text-muted">{label}</div>
    <div className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</div>
    <div className="mt-1 text-xs text-theme-text-muted">{hint}</div>
  </div>
);

export const DATAFLOW_VULN_SAMPLE_SCOPE_OPTIONS: Array<{ key: DataflowVulnSampleScope; label: string }> = [
  { key: 'focus', label: '业务聚焦' },
  { key: 'cycle', label: 'Cycle/Run' },
  { key: 'runtime', label: 'Runtime' },
  { key: 'ai', label: 'AI' },
  { key: 'plugin', label: 'Plugin' },
  { key: 'all', label: '全部样本' },
];

export const DataflowVulnObservabilitySection: React.FC<{
  formatters: FormatterSet;
  viewModel: DataflowVulnOverviewViewModel;
}> = ({ formatters, viewModel }) => (
 <section className="space-y-4 rounded-[2rem] border border-rose-500/20 bg-theme-bg-app p-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-400">Dataflow Vuln Observability</div>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-theme-text-primary">数据流漏洞挖掘专属观测</h2>
        <p className="mt-2 max-w-3xl text-sm text-theme-text-secondary">
          这部分优先回答四个问题：当前 run 是否在推进、漏洞产出是否在收敛、是否进入平台期、运行时调用面是否在放大失败或输出截断。
        </p>
      </div>
 <span className="inline-flex rounded-full border border-rose-500/20 bg-theme-bg-app px-3 py-1 text-xs font-medium text-rose-400">dataflow-vuln MVP</span>
    </div>

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
 <div className="rounded-[1.6rem] border border-rose-500/20 bg-theme-bg-app p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">漏洞产出与评审收敛</div>
        <h3 className="mt-2 text-lg font-semibold tracking-tight text-theme-text-primary">Latest Cycle Snapshot</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {viewModel.cycleCards.map((item) => (
            <div key={item.label} className="rounded-2xl border border-theme-border bg-theme-bg-app px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-theme-text-muted">{item.label}</div>
              <div className={`mt-2 text-xl font-semibold ${item.tone}`}>{item.value}</div>
              <div className="mt-1 text-xs text-theme-text-muted">{item.hint}</div>
            </div>
          ))}
        </div>
      </div>

 <div className="rounded-[1.6rem] border border-rose-500/20 bg-theme-bg-app p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">平台期与闭环状态</div>
        <h3 className="mt-2 text-lg font-semibold tracking-tight text-theme-text-primary">Plateau / Closure Flags</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {viewModel.plateauFlags.map((item) => (
            <div
              key={item.label}
 className={`rounded-2xl border px-4 py-3 ${
                item.active ? 'border-rose-500/20 bg-rose-500/15 text-rose-400' : 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400'
              }`}
            >
              <div className="text-sm font-semibold">{item.label}</div>
              <div className="mt-1 text-xs leading-5 opacity-85">{item.hint}</div>
              <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em]">{item.active ? 'Active' : 'Inactive'}</div>
            </div>
          ))}
        </div>
      </div>
    </div>

 <div className="rounded-[1.6rem] border border-rose-500/20 bg-theme-bg-app p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">运行时调用面</div>
          <h3 className="mt-2 text-lg font-semibold tracking-tight text-theme-text-primary">Runtime Trace By Mode</h3>
        </div>
        <span className="inline-flex rounded-full border border-theme-border bg-theme-bg-app px-3 py-1 text-[11px] font-bold text-theme-text-muted">
          calls / attempts / duration / truncation
        </span>
      </div>
      <div className="mt-4 overflow-auto rounded-2xl border border-theme-border">
        <table className="min-w-full divide-y divide-theme-border text-left text-xs">
          <thead className="bg-theme-bg-app text-theme-text-muted">
            <tr>
              <th className="px-3 py-3">模式</th>
              <th className="px-3 py-3">调用</th>
              <th className="px-3 py-3">尝试</th>
              <th className="px-3 py-3">总耗时</th>
              <th className="px-3 py-3">均耗时/次</th>
              <th className="px-3 py-3">超时</th>
              <th className="px-3 py-3">stdout 截断</th>
              <th className="px-3 py-3">输出字节</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-theme-border bg-theme-bg-app">
            {viewModel.runtimeModes.length ? (
              viewModel.runtimeModes.map((row) => (
                <tr key={row.mode} className="hover:bg-theme-elevated">
                  <td className="px-3 py-3 font-mono text-[11px] font-bold text-theme-text-primary">{row.mode}</td>
                  <td className="px-3 py-3 font-mono text-[11px] text-theme-text-primary">{formatters.formatNumber(row.calls)}</td>
                  <td className="px-3 py-3 font-mono text-[11px] text-theme-text-primary">{formatters.formatNumber(row.attempts)}</td>
                  <td className="px-3 py-3 font-mono text-[11px] text-theme-text-primary">{formatters.formatSeconds(row.durationSeconds)}</td>
                  <td className="px-3 py-3 font-mono text-[11px] text-theme-text-primary">{formatters.formatSeconds(row.avgDurationSeconds)}</td>
                  <td className={`px-3 py-3 font-mono text-[11px] font-bold ${(row.timeoutFailures || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {formatters.formatNumber(row.timeoutFailures)}
                  </td>
                  <td className={`px-3 py-3 font-mono text-[11px] font-bold ${(row.stdoutTruncated || 0) > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {formatters.formatNumber(row.stdoutTruncated)}
                  </td>
                  <td className="px-3 py-3 font-mono text-[11px] text-theme-text-primary">{formatters.formatMetricValue(row.outputBytes ?? Number.NaN)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-theme-text-muted">
                  当前还没有 runtime trace 聚合指标。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  </section>
);

export const DataflowVulnSignalsSection: React.FC<{
  formatters: FormatterSet;
  viewModel: DataflowVulnOverviewViewModel;
}> = ({ formatters, viewModel }) => (
  <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)]">
 <div className="rounded-[2rem] border border-rose-500/20 bg-theme-bg-app p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">热点指标</div>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-theme-text-primary">数据流漏洞挖掘 Top Signals</h2>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-rose-500/20 bg-rose-500/15 px-3 py-1 text-[11px] font-bold text-rose-400">
          <BarChart3 size={12} />
          业务信号
        </span>
      </div>
      <div className="mt-4 h-72">
        {viewModel.chartData.some((item) => item.value > 0) ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={viewModel.chartData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
              <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} interval={0} angle={-16} textAnchor="end" height={68} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip formatter={(value: number) => formatters.formatMetricValue(Number(value))} />
              <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                {viewModel.chartData.map((entry) => (
                  <Cell key={`dfv-chart-${entry.name}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyCard text="当前还没有足够的业务信号样本" />
        )}
      </div>
    </div>

 <div className="rounded-[2rem] border border-rose-500/20 bg-theme-bg-app p-5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">关键摘要</div>
      <h2 className="mt-2 text-xl font-semibold tracking-tight text-theme-text-primary">运行与收敛摘要</h2>
      <div className="mt-4 space-y-3">
        {viewModel.insightCards.map((item) => (
          <div key={item.label} className="rounded-2xl border border-theme-border bg-theme-bg-app px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-theme-text-primary">{item.label}</div>
                <div className="mt-1 text-xs text-theme-text-muted">{item.hint}</div>
              </div>
              <div className={`text-right text-lg font-semibold ${item.tone}`}>{item.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {viewModel.runtimeModes.map((item) => (
          <div key={item.mode} className="rounded-xl border border-theme-border bg-theme-bg-app px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-theme-text-muted">{item.mode}</div>
            <div className="mt-1 text-base font-semibold text-theme-text-primary">
              {formatters.formatNumber(item.calls)} call / {formatters.formatSeconds(item.avgDurationSeconds)}
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export const DataflowVulnAiSection: React.FC<{
  formatters: FormatterSet;
  viewModel: DataflowVulnAiViewModel;
}> = ({ formatters, viewModel }) => (
  <>
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {viewModel.topCards.map((item) => (
        <HeadlineMetricCard key={item.label} label={item.label} value={item.value} hint={item.hint} tone={item.tone} />
      ))}
    </section>

    <section className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
 <div className="rounded-[2rem] border border-fuchsia-500/20 bg-theme-bg-app p-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fuchsia-500">Cycle / Review / Runtime</div>
        <h3 className="mt-2 text-xl font-semibold tracking-tight text-theme-text-primary">AI 分层摘要</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {viewModel.phaseCards.map((item) => (
 <div key={item.label} className="rounded-2xl border border-fuchsia-500/20 bg-theme-bg-app px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-theme-text-muted">{item.label}</div>
              <div className={`mt-2 text-xl font-semibold ${item.tone}`}>{item.value}</div>
              <div className="mt-1 text-xs text-theme-text-muted">{item.hint}</div>
            </div>
          ))}
        </div>
      </div>

 <div className="rounded-[2rem] border border-fuchsia-500/20 bg-theme-bg-app p-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">Token / Cost</div>
        <h3 className="mt-2 text-xl font-semibold tracking-tight text-theme-text-primary">Token 结构</h3>
        <div className="mt-4 h-72">
          {viewModel.tokenChart.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={viewModel.tokenChart} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip formatter={(value: number) => formatters.formatMetricValue(Number(value))} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {viewModel.tokenChart.map((entry) => (
                    <Cell key={`dfv-token-${entry.name}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyCard text="当前还没有 token 结构样本" />
          )}
        </div>
      </div>
    </section>

    <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
 <div className="rounded-[2rem] border border-fuchsia-500/20 bg-theme-bg-app p-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">角色与插件</div>
        <h3 className="mt-2 text-xl font-semibold tracking-tight text-theme-text-primary">Agent / Plugin 活跃度</h3>
        <div className="mt-4 h-72">
          {viewModel.roleChart.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={viewModel.roleChart} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip formatter={(value: number) => formatters.formatMetricValue(Number(value))} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {viewModel.roleChart.map((entry) => (
                    <Cell key={`dfv-role-${entry.name}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyCard text="当前还没有 agent/plugin 活跃度样本" />
          )}
        </div>
      </div>

 <div className="rounded-[2rem] border border-fuchsia-500/20 bg-theme-bg-app p-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">Plugin Review</div>
        <h3 className="mt-2 text-xl font-semibold tracking-tight text-theme-text-primary">插件结果摘要</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {viewModel.reviewCards.map((item) => (
            <div key={item.label} className="rounded-2xl border border-theme-border bg-theme-bg-app px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-theme-text-muted">{item.label}</div>
              <div className={`mt-2 text-xl font-semibold ${item.tone}`}>{item.value}</div>
              <div className="mt-1 text-xs text-theme-text-muted">{item.hint}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  </>
);

export const DataflowVulnSampleScopeFilter: React.FC<{
  activeScope: DataflowVulnSampleScope;
  onChange: (scope: DataflowVulnSampleScope) => void;
}> = ({ activeScope, onChange }) => (
  <>
    {DATAFLOW_VULN_SAMPLE_SCOPE_OPTIONS.map((item) => {
      const active = activeScope === item.key;
      return (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
            active ? 'border-rose-500/20 bg-rose-500/15 text-rose-400' : 'border-theme-border bg-theme-bg-app text-theme-text-secondary hover:bg-theme-bg-app'
          }`}
        >
          {item.label}
        </button>
      );
    })}
  </>
);
