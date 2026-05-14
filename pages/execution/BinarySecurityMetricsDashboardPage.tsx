import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Database,
  Gauge,
  Loader2,
  RefreshCw,
  Search,
  ServerCog,
  TimerReset,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { api } from '../../clients/api';
import {
  BINARY_SECURITY_METRICS_SERVICES,
  BinarySecurityMetricsGroup,
  BinarySecurityMetricsServiceDefinition,
  BinarySecurityMetricsServiceKey,
} from '../../clients/binarySecurityMetrics';

type MetricsState = {
  loading: boolean;
  rawText: string;
  error: string | null;
  refreshedAt: number | null;
};

type PrometheusMetricType = 'counter' | 'gauge' | 'histogram' | 'summary' | 'untyped';

type ParsedMetricSample = {
  name: string;
  familyName: string;
  labels: Record<string, string>;
  value: number;
  type: PrometheusMetricType;
  help: string | null;
};

type DisplayMetricRow = ParsedMetricSample & {
  group: BinarySecurityMetricsGroup;
  labelText: string;
  displayName: string;
};

type MetricsInsight = {
  label: string;
  value: number;
  group: BinarySecurityMetricsGroup;
  hint: string;
};

type ServiceViewModel = {
  rows: DisplayMetricRow[];
  kpis: Array<{ label: string; value: number; icon: React.ReactNode }>;
  chartData: Array<{ name: string; value: number; group: BinarySecurityMetricsGroup }>;
  insights: MetricsInsight[];
  groupCounts: Array<{ group: BinarySecurityMetricsGroup; count: number }>;
};

const GROUP_LABELS: Record<BinarySecurityMetricsGroup, string> = {
  http: 'HTTP',
  task: '任务',
  queue: '队列',
  worker: 'Worker/调度',
  duration: '耗时',
  'error-retry-timeout': '异常/重试/超时',
  'llm-token-cost': 'LLM/Token/Cost',
  'service-specific': '服务特定',
};

const GROUP_BADGE: Record<BinarySecurityMetricsGroup, string> = {
  http: 'border-sky-200 bg-sky-50 text-sky-700',
  task: 'border-slate-200 bg-slate-100 text-slate-700',
  queue: 'border-amber-200 bg-amber-50 text-amber-700',
  worker: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  duration: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  'error-retry-timeout': 'border-rose-200 bg-rose-50 text-rose-700',
  'llm-token-cost': 'border-violet-200 bg-violet-50 text-violet-700',
  'service-specific': 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

const CHART_COLOR = '#0f766e';
const CHART_GRID = '#e2e8f0';
const INITIAL_STATE: MetricsState = { loading: false, rawText: '', error: null, refreshedAt: null };

const formatNumber = (value: number | null | undefined, digits = 0) => {
  if (value == null || !Number.isFinite(value)) return '-';
  return value.toLocaleString('zh-CN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
};

const formatMetricValue = (value: number) => {
  if (!Number.isFinite(value)) return '-';
  if (Math.abs(value) >= 1000) return formatNumber(value, 0);
  if (Math.abs(value) >= 1) return formatNumber(value, 2);
  return value.toExponential(2);
};

const formatTime = (timestamp: number | null) =>
  timestamp ? new Date(timestamp).toLocaleString('zh-CN', { hour12: false }) : '-';

const sampleFamilyName = (name: string) =>
  name.replace(/_(bucket|sum|count|total|created)$/u, '');

const parsePrometheusLabels = (source: string): Record<string, string> => {
  const labels: Record<string, string> = {};
  const regex = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\.|[^"\\])*)"/g;
  for (const match of source.matchAll(regex)) {
    labels[match[1]] = match[2]
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
  return labels;
};

const parsePrometheusText = (rawText: string): ParsedMetricSample[] => {
  const helpMap = new Map<string, string>();
  const typeMap = new Map<string, PrometheusMetricType>();
  const rows: ParsedMetricSample[] = [];

  for (const rawLine of rawText.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('# HELP ')) {
      const match = line.match(/^# HELP ([a-zA-Z_:][a-zA-Z0-9_:]*)\s+(.+)$/u);
      if (match) helpMap.set(match[1], match[2]);
      continue;
    }
    if (line.startsWith('# TYPE ')) {
      const match = line.match(/^# TYPE ([a-zA-Z_:][a-zA-Z0-9_:]*)\s+(counter|gauge|histogram|summary|untyped)$/u);
      if (match) typeMap.set(match[1], match[2] as PrometheusMetricType);
      continue;
    }
    if (line.startsWith('#')) continue;

    const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{.*\})?\s+([^\s]+)(?:\s+\d+)?$/u);
    if (!match) continue;
    const value = Number(match[3]);
    if (!Number.isFinite(value)) continue;
    const name = match[1];
    const familyName = sampleFamilyName(name);
    rows.push({
      name,
      familyName,
      labels: match[2] ? parsePrometheusLabels(match[2]) : {},
      value,
      type: typeMap.get(familyName) || typeMap.get(name) || 'untyped',
      help: helpMap.get(familyName) || helpMap.get(name) || null,
    });
  }

  return rows;
};

const detectGroup = (metric: ParsedMetricSample, service: BinarySecurityMetricsServiceDefinition): BinarySecurityMetricsGroup => {
  const fingerprint = `${metric.name} ${Object.keys(metric.labels).join(' ')} ${Object.values(metric.labels).join(' ')}`.toLowerCase();
  if (service.serviceSpecificKeywords.some((token) => fingerprint.includes(token))) return 'service-specific';
  if (/(token|cost|llm|model|prompt|judge|review)/u.test(fingerprint)) return 'llm-token-cost';
  if (/(error|fail|retry|timeout|exception|cancel|abort)/u.test(fingerprint)) return 'error-retry-timeout';
  if (/(queue|backlog|lease|pending|claimed)/u.test(fingerprint)) return 'queue';
  if (/(worker|scheduler|dispatcher|heartbeat|owner|runner|pod)/u.test(fingerprint)) return 'worker';
  if (/(duration|latency|elapsed|seconds|millisecond|runtime|processing_time)/u.test(fingerprint)) return 'duration';
  if (/(http|request|response|status|route|path|method)/u.test(fingerprint)) return 'http';
  return 'task';
};

const labelTextForMetric = (labels: Record<string, string>) => {
  const entries = Object.entries(labels);
  if (!entries.length) return '-';
  return entries.map(([key, value]) => `${key}=${value}`).join(', ');
};

const metricDisplayName = (metric: ParsedMetricSample) => metric.name.replace(/^secflow_/u, '').replace(/_/gu, ' ');

const scoreMetric = (metric: DisplayMetricRow, service: BinarySecurityMetricsServiceDefinition) => {
  const groupOrder = service.preferredGroups.indexOf(metric.group);
  const groupScore = groupOrder >= 0 ? service.preferredGroups.length - groupOrder : 0;
  const suffixPenalty = /(_bucket|_created)$/u.test(metric.name) ? -3 : 0;
  const labelBonus = Object.keys(metric.labels).length ? 1 : 0;
  const valueBonus = metric.value !== 0 ? 1 : 0;
  return groupScore * 10 + labelBonus + valueBonus + suffixPenalty;
};

const buildInsights = (rows: DisplayMetricRow[]): MetricsInsight[] => {
  const sumByRegex = (label: string, regex: RegExp, group: BinarySecurityMetricsGroup, hint: string) => {
    const matches = rows.filter((row) => regex.test(row.name));
    if (!matches.length) return null;
    return {
      label,
      value: matches.reduce((total, row) => total + row.value, 0),
      group,
      hint,
    } as MetricsInsight;
  };

  return [
    sumByRegex('HTTP 请求量', /(http|request).*(total|count)$/u, 'http', '接口调用累计值'),
    sumByRegex('错误/失败', /(error|fail|exception).*(total|count)?$/u, 'error-retry-timeout', '失败与异常类指标'),
    sumByRegex('运行中任务', /(running|in_progress|active).*(task|job|execution|session)?/u, 'task', '当前运行中的任务/执行'),
    sumByRegex('成功任务', /(success|succeeded|completed).*(task|job|execution|session)?/u, 'task', '成功完成的任务/执行'),
    sumByRegex('队列积压', /(queue|backlog|pending)/u, 'queue', '等待中的队列/积压指标'),
    sumByRegex('重试/超时', /(retry|timeout)/u, 'error-retry-timeout', '重试与超时类指标'),
    sumByRegex('Token 用量', /token/u, 'llm-token-cost', 'Token 统计'),
    sumByRegex('成本', /cost/u, 'llm-token-cost', '成本相关指标'),
  ].filter((item): item is MetricsInsight => Boolean(item));
};

const buildServiceViewModel = (
  rawText: string,
  service: BinarySecurityMetricsServiceDefinition,
): ServiceViewModel => {
  const parsed = parsePrometheusText(rawText);
  const rows = parsed
    .map((metric) => ({
      ...metric,
      group: detectGroup(metric, service),
      labelText: labelTextForMetric(metric.labels),
      displayName: metricDisplayName(metric),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));

  const counterFamilies = new Set(rows.filter((row) => row.type === 'counter').map((row) => row.familyName));
  const gaugeFamilies = new Set(rows.filter((row) => row.type === 'gauge').map((row) => row.familyName));
  const histogramFamilies = new Set(rows.filter((row) => row.type === 'histogram' || row.type === 'summary').map((row) => row.familyName));
  const topRows = [...rows]
    .sort((left, right) => {
      const scoreGap = scoreMetric(right, service) - scoreMetric(left, service);
      if (scoreGap !== 0) return scoreGap;
      return Math.abs(right.value) - Math.abs(left.value);
    })
    .filter((row) => !/_bucket$/u.test(row.name))
    .slice(0, 8);

  const groupCounts = (Object.keys(GROUP_LABELS) as BinarySecurityMetricsGroup[]).map((group) => ({
    group,
    count: rows.filter((row) => row.group === group).length,
  }));

  return {
    rows,
    kpis: [
      { label: '抓取样本数', value: rows.length, icon: <Database size={16} /> },
      { label: 'Counter 指标族', value: counterFamilies.size, icon: <Activity size={16} /> },
      { label: 'Gauge 指标族', value: gaugeFamilies.size, icon: <Gauge size={16} /> },
      { label: 'Histogram/Summary', value: histogramFamilies.size, icon: <BarChart3 size={16} /> },
    ],
    chartData: topRows.map((row) => ({
      name: row.displayName.length > 18 ? `${row.displayName.slice(0, 18)}...` : row.displayName,
      value: row.value,
      group: row.group,
    })),
    insights: buildInsights(rows),
    groupCounts,
  };
};

const MetricCard: React.FC<{ label: string; value: number; icon: React.ReactNode }> = ({ label, value, icon }) => (
  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
    <div className="flex items-center justify-between gap-3 text-slate-500">
      <span className="text-[11px] font-black uppercase tracking-[0.18em]">{label}</span>
      <span>{icon}</span>
    </div>
    <div className="mt-3 text-2xl font-black tracking-tight text-slate-900">{formatNumber(value)}</div>
  </div>
);

export const BinarySecurityMetricsDashboardPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const executionMetricsApi = api.domains.execution.metrics;
  const [activeServiceKey, setActiveServiceKey] = useState<BinarySecurityMetricsServiceKey>(BINARY_SECURITY_METRICS_SERVICES[0].key);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [groupFilter, setGroupFilter] = useState<'all' | BinarySecurityMetricsGroup>('all');
  const [stateByService, setStateByService] = useState<Record<BinarySecurityMetricsServiceKey, MetricsState>>(
    Object.fromEntries(BINARY_SECURITY_METRICS_SERVICES.map((service) => [service.key, INITIAL_STATE])) as Record<BinarySecurityMetricsServiceKey, MetricsState>,
  );

  const activeService = useMemo(
    () => BINARY_SECURITY_METRICS_SERVICES.find((service) => service.key === activeServiceKey) || BINARY_SECURITY_METRICS_SERVICES[0],
    [activeServiceKey],
  );

  const loadMetrics = async (serviceKey: BinarySecurityMetricsServiceKey) => {
    setStateByService((current) => ({
      ...current,
      [serviceKey]: {
        ...current[serviceKey],
        loading: true,
        error: null,
      },
    }));
    try {
      const rawText = await executionMetricsApi.getServiceMetrics(serviceKey);
      setStateByService((current) => ({
        ...current,
        [serviceKey]: {
          loading: false,
          rawText,
          error: null,
          refreshedAt: Date.now(),
        },
      }));
    } catch (error: any) {
      setStateByService((current) => ({
        ...current,
        [serviceKey]: {
          ...current[serviceKey],
          loading: false,
          error: error?.message || '指标抓取失败',
          refreshedAt: Date.now(),
        },
      }));
    }
  };

  useEffect(() => {
    const current = stateByService[activeServiceKey];
    if (!current.rawText && !current.loading && !current.error) {
      void loadMetrics(activeServiceKey);
    }
  }, [activeServiceKey, stateByService]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = window.setInterval(() => {
      void loadMetrics(activeServiceKey);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [activeServiceKey, autoRefresh]);

  useEffect(() => {
    setSearchKeyword('');
    setGroupFilter('all');
  }, [activeServiceKey, projectId]);

  const activeState = stateByService[activeServiceKey];
  const viewModel = useMemo(
    () => buildServiceViewModel(activeState.rawText, activeService),
    [activeService, activeState.rawText],
  );

  const filteredRows = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    return viewModel.rows.filter((row) => {
      if (groupFilter !== 'all' && row.group !== groupFilter) return false;
      if (!keyword) return true;
      return `${row.name} ${row.labelText} ${row.help || ''}`.toLowerCase().includes(keyword);
    });
  }, [groupFilter, searchKeyword, viewModel.rows]);

  return (
    <div className="space-y-6 px-8 pb-10 pt-8">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-teal-600">Binary Security</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">性能看板</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              面向二进制安全链路的轻量指标看板，直接抓取各微服务的 Prometheus `/metrics` 快照并做紧凑渲染。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(event) => setAutoRefresh(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              自动刷新 30s
            </label>
            <button
              type="button"
              onClick={() => void loadMetrics(activeServiceKey)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <RefreshCw size={16} />
              刷新
            </button>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-500">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
            <ServerCog size={13} />
            {activeService.serviceName}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
            <TimerReset size={13} />
            最近刷新：{formatTime(activeState.refreshedAt)}
          </span>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {BINARY_SECURITY_METRICS_SERVICES.map((service) => {
            const state = stateByService[service.key];
            const active = service.key === activeServiceKey;
            return (
              <button
                key={service.key}
                type="button"
                onClick={() => setActiveServiceKey(service.key)}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  active ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                }`}
              >
                <div className="text-sm font-black">{service.label}</div>
                <div className={`mt-1 text-[11px] ${active ? 'text-slate-200' : 'text-slate-500'}`}>
                  {state.loading ? '抓取中...' : state.error ? '抓取失败' : state.refreshedAt ? '已更新' : '待抓取'}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {activeState.loading && !activeState.rawText ? (
        <section className="rounded-[2rem] border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
          <Loader2 className="mx-auto animate-spin text-slate-400" size={24} />
          <p className="mt-4 text-sm text-slate-500">正在抓取 {activeService.label} 的指标...</p>
        </section>
      ) : activeState.error && !activeState.rawText ? (
        <section className="rounded-[2rem] border border-rose-200 bg-rose-50 px-6 py-12 text-center shadow-sm">
          <p className="text-sm font-semibold text-rose-700">{activeState.error}</p>
        </section>
      ) : (
        <>
          <section className="grid gap-4 xl:grid-cols-4">
            {viewModel.kpis.map((item) => (
              <MetricCard key={item.label} label={item.label} value={item.value} icon={item.icon} />
            ))}
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">热点指标</div>
                  <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900">关键样本 Top 8</h2>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-500">
                  <BarChart3 size={12} />
                  当前快照
                </span>
              </div>
              <div className="mt-4 h-72">
                {viewModel.chartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={viewModel.chartData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                      <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} interval={0} angle={-16} textAnchor="end" height={68} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                      <Tooltip
                        formatter={(value: number) => formatMetricValue(Number(value))}
                        labelStyle={{ fontWeight: 700, color: '#0f172a' }}
                        contentStyle={{ borderRadius: 16, borderColor: '#cbd5e1' }}
                      />
                      <Bar dataKey="value" fill={CHART_COLOR} radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
                    暂无可绘制的指标
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">关键摘要</div>
              <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900">高优先级指标</h2>
              <div className="mt-4 space-y-3">
                {viewModel.insights.length ? (
                  viewModel.insights.slice(0, 8).map((item) => (
                    <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-black text-slate-800">{item.label}</div>
                          <div className="mt-1 text-xs text-slate-500">{item.hint}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-black text-slate-900">{formatMetricValue(item.value)}</div>
                          <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${GROUP_BADGE[item.group]}`}>
                            {GROUP_LABELS[item.group]}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    当前服务暂无可自动聚合的关键指标
                  </div>
                )}
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {viewModel.groupCounts.map((item) => (
                  <div key={item.group} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">{GROUP_LABELS[item.group]}</div>
                    <div className="mt-1 text-base font-black text-slate-800">{formatNumber(item.count)}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">原始指标</div>
                <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900">Prometheus Samples</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-3 top-2.5 text-slate-400" />
                  <input
                    value={searchKeyword}
                    onChange={(event) => setSearchKeyword(event.target.value)}
                    placeholder="搜索指标名 / labels / help"
                    className="rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-700"
                  />
                </div>
                <select
                  value={groupFilter}
                  onChange={(event) => setGroupFilter(event.target.value as 'all' | BinarySecurityMetricsGroup)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
                >
                  <option value="all">全部分组</option>
                  {(Object.keys(GROUP_LABELS) as BinarySecurityMetricsGroup[]).map((group) => (
                    <option key={group} value={group}>{GROUP_LABELS[group]}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 overflow-auto rounded-2xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-3">指标名</th>
                    <th className="px-3 py-3">Labels</th>
                    <th className="px-3 py-3">Value</th>
                    <th className="px-3 py-3">Type</th>
                    <th className="px-3 py-3">Group</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredRows.map((row) => (
                    <tr key={`${row.name}:${row.labelText}`} className="hover:bg-slate-50">
                      <td className="px-3 py-3 align-top">
                        <div className="font-mono text-[11px] font-bold text-slate-800">{row.name}</div>
                        {row.help ? <div className="mt-1 max-w-[34rem] text-[11px] text-slate-500">{row.help}</div> : null}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-slate-600">{row.labelText}</td>
                      <td className="px-3 py-3 font-mono text-[11px] font-semibold text-slate-800">{formatMetricValue(row.value)}</td>
                      <td className="px-3 py-3 uppercase text-slate-600">{row.type}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${GROUP_BADGE[row.group]}`}>
                          {GROUP_LABELS[row.group]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredRows.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-slate-500">没有符合过滤条件的指标</div>
              ) : null}
            </div>
          </section>
        </>
      )}
    </div>
  );
};
