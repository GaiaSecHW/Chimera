import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bot,
  Brain,
  Coins,
  Database,
  Gauge,
  GitBranch,
  Loader2,
  RefreshCw,
  Search,
  ServerCog,
  ShieldAlert,
  TimerReset,
  TrendingUp,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { api } from '../../clients/api';
import {
  BINARY_SECURITY_AI_DIMENSION_LABEL_KEYS,
  BINARY_SECURITY_CANONICAL_AI_METRICS,
  BINARY_SECURITY_METRICS_SECONDARY_TABS,
  BINARY_SECURITY_METRICS_SERVICES,
  BinarySecurityMetricsGroup,
  BinarySecurityMetricsSecondaryTab,
  BinarySecurityMetricsServiceDefinition,
  BinarySecurityMetricsServiceKey,
  getBinarySecurityMetricsService,
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

type AggregateCoverageSummary = {
  attempted: number;
  successful: number;
  partial: boolean;
  attemptedByRole: Array<{ role: string; attempted: number; successful: number }>;
};

type AiCard = {
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
};

type AiCoverage = 'none' | 'basic' | 'partial' | 'complete';

type AiViewModel = {
  rows: DisplayMetricRow[];
  cards: AiCard[];
  coverage: AiCoverage;
  coverageLabel: string;
  familyCount: number;
  roleChart: Array<{ name: string; value: number }>;
  tokenChart: Array<{ name: string; value: number }>;
  coverageText: string;
};

type BinarySecurityReducerSnapshot = {
  capturedAt: number;
  pendingDepth: number | null;
  processingDepth: number | null;
  retryableDepth: number | null;
  deadLetterDepth: number | null;
  processedDepth: number | null;
  oldestPendingAge: number | null;
  oldestProcessingAge: number | null;
  oldestRetryableAge: number | null;
  oldestDeadLetterAge: number | null;
  reducerRunSuccess: number | null;
  reducerRunFailed: number | null;
  reducerRunLockBusy: number | null;
  reducerRunSkipped: number | null;
  reducerAvgDurationSeconds: number | null;
  eventAvgLagSeconds: number | null;
  lockWaitAvgSeconds: number | null;
  lockHeldAvgSeconds: number | null;
};

type ReducerQueueCard = {
  label: string;
  value: number | null;
  hint: string;
  tone: string;
  icon: React.ReactNode;
};

type ReducerBreakdownItem = {
  label: string;
  value: number | null;
  tone: string;
};

type BinarySecurityReducerViewModel = {
  queueCards: ReducerQueueCard[];
  queueBarData: Array<{ name: string; value: number | null; tone: string }>;
  ageBarData: Array<{ name: string; value: number | null; tone: string }>;
  healthSummary: Array<{ label: string; value: string; tone: string; hint: string }>;
  reducerRuns: ReducerBreakdownItem[];
  reducerEventResults: ReducerBreakdownItem[];
  deadLetters: ReducerBreakdownItem[];
  fileWriteResults: ReducerBreakdownItem[];
  activeLocks: ReducerBreakdownItem[];
  timeSeries: Array<{
    time: string;
    pending: number | null;
    retryable: number | null;
    deadLetter: number | null;
    oldestPendingAge: number | null;
    reducerAvgDurationSeconds: number | null;
    eventAvgLagSeconds: number | null;
  }>;
};

const GROUP_LABELS: Record<BinarySecurityMetricsGroup, string> = {
  http: 'HTTP',
  task: '任务',
  queue: '队列',
  worker: 'Worker/调度',
  duration: '耗时',
  'error-retry-timeout': '异常/重试/超时',
  'llm-token-cost': 'LLM/Token/Cost',
  'ai-agent': 'AI/智能体',
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
  'ai-agent': 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700',
  'service-specific': 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

const AI_COVERAGE_BADGE: Record<AiCoverage, string> = {
  none: 'border-slate-200 bg-slate-50 text-slate-600',
  basic: 'border-amber-200 bg-amber-50 text-amber-700',
  partial: 'border-sky-200 bg-sky-50 text-sky-700',
  complete: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

const AI_SERVICE_SCOPE: Record<BinarySecurityMetricsServiceKey, string> = {
  'binary-security': '编排层 AI 观测聚焦于模块筛选、继续/重试编排、AI 下游阶段活跃度与失败归因。',
  'binary-evolution': '进化中心 AI 观测聚焦 round 演进、agent 活跃度、重试/超时与轮次衍生结果。',
  'firmware-unpacker': '固件解包 AI 观测聚焦 AI 辅助/进化链路中的 token、成本、重试与失败分布。',
  'system-analysis': '系统分析 AI 观测覆盖 worker/judge/session、token/cost、失败分类与 stage round 统计。',
  'binary-to-source': '二进制逆向 AI 观测覆盖 review 尝试、session、token/cost、validator/judge 相关行为。',
  'entry-analysis': '入口分析 AI 观测覆盖 worker/judge/session、token/cost、轮次与失败/超时。',
  'dataflow-analysis': '数据流分析 AI 观测覆盖 judge/session、token/cost、轮次、trace 相关 AI 行为。',
  'dataflow-vuln': '数据流漏洞挖掘 AI 观测覆盖 cycle/review/plugin、runtime trace、token/cost 与失败分布。',
};

const CHART_COLOR = '#0f766e';
const AI_CHART_COLOR = '#7c3aed';
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

const formatSeconds = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return '-';
  if (value >= 3600) return `${formatNumber(value / 3600, 2)}h`;
  if (value >= 60) return `${formatNumber(value / 60, 2)}m`;
  return `${formatNumber(value, value >= 10 ? 1 : 2)}s`;
};

const formatTime = (timestamp: number | null) =>
  timestamp ? new Date(timestamp).toLocaleString('zh-CN', { hour12: false }) : '-';

const sampleFamilyName = (name: string) => name.replace(/_(bucket|sum|count|total|created)$/u, '');

const parsePrometheusLabels = (source: string): Record<string, string> => {
  const labels: Record<string, string> = {};
  const regex = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\.|[^"\\])*)"/g;
  for (const match of source.matchAll(regex)) {
    labels[match[1]] = match[2].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
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

const isAiMetric = (metric: ParsedMetricSample) => {
  const fingerprint = `${metric.name} ${Object.keys(metric.labels).join(' ')} ${Object.values(metric.labels).join(' ')}`.toLowerCase();
  if (/_ai_/u.test(metric.name)) return true;
  return /(token|cost|llm|model|prompt|judge|review|agent|session|worker|cycle|round|plugin|advisor|reflection|validator)/u.test(fingerprint);
};

const detectGroup = (metric: ParsedMetricSample, service: BinarySecurityMetricsServiceDefinition): BinarySecurityMetricsGroup => {
  const fingerprint = `${metric.name} ${Object.keys(metric.labels).join(' ')} ${Object.values(metric.labels).join(' ')}`.toLowerCase();
  if (service.serviceSpecificKeywords.some((token) => fingerprint.includes(token))) return 'service-specific';
  if (isAiMetric(metric)) return 'ai-agent';
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
    return { label, value: matches.reduce((total, row) => total + row.value, 0), group, hint } as MetricsInsight;
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

const buildServiceViewModel = (rawText: string, service: BinarySecurityMetricsServiceDefinition): ServiceViewModel => {
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

const buildAggregateCoverageSummary = (rows: DisplayMetricRow[], serviceKey: BinarySecurityMetricsServiceKey): AggregateCoverageSummary | null => {
  if (serviceKey !== 'binary-security') return null;
  const attemptedRows = rows.filter((row) => row.name === 'secflow_binary_security_metrics_aggregate_scrape_targets');
  const successRows = rows.filter((row) => row.name === 'secflow_binary_security_metrics_aggregate_scrape_success_targets');
  if (!attemptedRows.length && !successRows.length) return null;
  const roles = new Set<string>();
  attemptedRows.forEach((row) => roles.add(String(row.labels.role || 'unknown')));
  successRows.forEach((row) => roles.add(String(row.labels.role || 'unknown')));
  const attemptedByRole = Array.from(roles)
    .sort((left, right) => left.localeCompare(right, 'zh-CN'))
    .map((role) => ({
      role,
      attempted: attemptedRows.filter((row) => row.labels.role === role).reduce((sum, row) => sum + row.value, 0),
      successful: successRows.filter((row) => row.labels.role === role).reduce((sum, row) => sum + row.value, 0),
    }));
  const attempted = attemptedByRole.reduce((sum, item) => sum + item.attempted, 0);
  const successful = attemptedByRole.reduce((sum, item) => sum + item.successful, 0);
  const partialRow = rows.find((row) => row.name === 'secflow_binary_security_metrics_aggregate_partial');
  return {
    attempted,
    successful,
    partial: Boolean((partialRow?.value || 0) > 0),
    attemptedByRole,
  };
};

const canonicalLookup = (rows: DisplayMetricRow[]) => {
  const matchSum = (predicate: (row: DisplayMetricRow) => boolean) =>
    rows.filter(predicate).reduce((total, row) => total + row.value, 0);

  return {
    sessionTotal: matchSum((row) => /_ai_session_total$/u.test(row.name) || /session/u.test(row.name)),
    tokenInput: matchSum((row) => /_ai_token_usage_total$/u.test(row.name) && row.labels.type === 'input') || matchSum((row) => /token_input/u.test(row.name)),
    tokenOutput: matchSum((row) => /_ai_token_usage_total$/u.test(row.name) && row.labels.type === 'output') || matchSum((row) => /token_output/u.test(row.name)),
    tokenCacheRead: matchSum((row) => /_ai_token_usage_total$/u.test(row.name) && row.labels.type === 'cache_read'),
    tokenCacheWrite: matchSum((row) => /_ai_token_usage_total$/u.test(row.name) && row.labels.type === 'cache_write'),
    tokenTotal:
      matchSum((row) => /_ai_token_usage_total$/u.test(row.name) && row.labels.type === 'total') ||
      matchSum((row) => /token/u.test(row.name) && /(total|usage)/u.test(row.name)),
    costTotal: matchSum((row) => /_ai_token_cost_total$/u.test(row.name) || /token_cost_total|cost_usage/u.test(row.name)),
    roleTotal: matchSum((row) => /_ai_role_count$/u.test(row.name)),
    retryTotal: matchSum((row) => /_ai_retry_total$/u.test(row.name) || /retry/u.test(row.name)),
    timeoutTotal: matchSum((row) => /_ai_timeout_total$/u.test(row.name) || /timeout/u.test(row.name)),
    failureTotal: matchSum((row) => /_ai_failure_total$/u.test(row.name) || /error|fail/u.test(row.name)),
    roundTotal: matchSum((row) => /_ai_round_total$/u.test(row.name) || /(round|cycle|review)_/u.test(row.name)),
    reviewTotal: matchSum((row) => /_ai_review_total$/u.test(row.name) || /review/u.test(row.name)),
  };
};

const buildAiViewModel = (rows: DisplayMetricRow[], service: BinarySecurityMetricsServiceDefinition): AiViewModel => {
  const aiRows = rows.filter((row) => row.group === 'ai-agent' || isAiMetric(row));
  const byCanonicalFamily = new Set(
    aiRows.filter((row) => /_ai_(role_count|session_total|round_total|retry_total|timeout_total|failure_total|token_usage_total|token_cost_total|review_total)$/u.test(row.name)).map((row) => row.familyName),
  );
  const lookup = canonicalLookup(aiRows);
  const roleChart = ['worker', 'judge', 'agent', 'plugin', 'validator', 'advisor']
    .map((role) => ({
      name: role,
      value: aiRows.filter((row) => /_ai_role_count$/u.test(row.name) && row.labels.role === role).reduce((sum, row) => sum + row.value, 0),
    }))
    .filter((item) => item.value > 0);
  const tokenChart = [
    { name: 'input', value: lookup.tokenInput },
    { name: 'output', value: lookup.tokenOutput },
    { name: 'cache_read', value: lookup.tokenCacheRead },
    { name: 'cache_write', value: lookup.tokenCacheWrite },
    { name: 'total', value: lookup.tokenTotal },
    { name: 'cost', value: lookup.costTotal },
  ].filter((item) => item.value > 0);

  let coverage: AiCoverage = 'none';
  if (aiRows.length) coverage = 'basic';
  if (byCanonicalFamily.size >= 4) coverage = 'partial';
  if (byCanonicalFamily.size >= 7) coverage = 'complete';
  const coverageLabel =
    coverage === 'complete' ? '完整埋点' : coverage === 'partial' ? '部分埋点' : coverage === 'basic' ? '基础埋点' : '未埋点';

  return {
    rows: aiRows,
    cards: [
      { label: 'AI Token 总量', value: lookup.tokenTotal || lookup.tokenInput + lookup.tokenOutput, hint: 'input/output/cache/total 聚合', icon: <Brain size={16} /> },
      { label: 'AI 成本', value: lookup.costTotal, hint: 'token cost / cost usage', icon: <Coins size={16} /> },
      { label: 'AI 会话数', value: lookup.sessionTotal, hint: 'session / conversation / role session', icon: <Bot size={16} /> },
      { label: 'Worker/Judge/Agent 活跃数', value: lookup.roleTotal, hint: 'role_count 聚合', icon: <Activity size={16} /> },
      { label: '重试/超时/失败', value: lookup.retryTotal + lookup.timeoutTotal + lookup.failureTotal, hint: 'retry + timeout + failure', icon: <Gauge size={16} /> },
      { label: '轮次/周期/评审次数', value: lookup.roundTotal + lookup.reviewTotal, hint: 'round/cycle/review 聚合', icon: <BarChart3 size={16} /> },
    ],
    coverage,
    coverageLabel,
    familyCount: byCanonicalFamily.size,
    roleChart,
    tokenChart,
    coverageText: AI_SERVICE_SCOPE[service.key],
  };
};

const sumMetric = (rows: DisplayMetricRow[], matcher: (row: DisplayMetricRow) => boolean) =>
  rows.filter(matcher).reduce((total, row) => total + row.value, 0);

const histogramAverage = (rows: DisplayMetricRow[], familyName: string, labels: Record<string, string> = {}) => {
  const matchesLabels = (row: DisplayMetricRow) => Object.entries(labels).every(([key, value]) => row.labels[key] === value);
  const sum = sumMetric(rows, (row) => row.familyName === familyName && row.name.endsWith('_sum') && matchesLabels(row));
  const count = sumMetric(rows, (row) => row.familyName === familyName && row.name.endsWith('_count') && matchesLabels(row));
  return count > 0 ? sum / count : null;
};

const metricValueByName = (rows: DisplayMetricRow[], name: string, labels: Record<string, string> = {}) => {
  const matches = rows.filter((row) => row.name === name && Object.entries(labels).every(([key, value]) => row.labels[key] === value));
  if (!matches.length) return null;
  return matches.reduce((total, row) => total + row.value, 0);
};

const buildBinarySecurityReducerSnapshot = (rows: DisplayMetricRow[]): BinarySecurityReducerSnapshot => ({
  capturedAt: Date.now(),
  pendingDepth: metricValueByName(rows, 'secflow_binary_security_state_event_queue_depth', { status: 'pending' }),
  processingDepth: metricValueByName(rows, 'secflow_binary_security_state_event_queue_depth', { status: 'processing' }),
  retryableDepth: metricValueByName(rows, 'secflow_binary_security_state_event_queue_depth', { status: 'retryable' }),
  deadLetterDepth: metricValueByName(rows, 'secflow_binary_security_state_event_queue_depth', { status: 'dead_letter' }),
  processedDepth: metricValueByName(rows, 'secflow_binary_security_state_event_queue_depth', { status: 'processed' }),
  oldestPendingAge: metricValueByName(rows, 'secflow_binary_security_state_event_oldest_age_seconds', { status: 'pending' }),
  oldestProcessingAge: metricValueByName(rows, 'secflow_binary_security_state_event_oldest_age_seconds', { status: 'processing' }),
  oldestRetryableAge: metricValueByName(rows, 'secflow_binary_security_state_event_oldest_age_seconds', { status: 'retryable' }),
  oldestDeadLetterAge: metricValueByName(rows, 'secflow_binary_security_state_event_oldest_age_seconds', { status: 'dead_letter' }),
  reducerRunSuccess: metricValueByName(rows, 'secflow_binary_security_state_reducer_runs_total', { result: 'success' }),
  reducerRunFailed: metricValueByName(rows, 'secflow_binary_security_state_reducer_runs_total', { result: 'failed' }),
  reducerRunLockBusy: metricValueByName(rows, 'secflow_binary_security_state_reducer_runs_total', { result: 'lock_busy' }),
  reducerRunSkipped: metricValueByName(rows, 'secflow_binary_security_state_reducer_runs_total', { result: 'skipped' }),
  reducerAvgDurationSeconds: histogramAverage(rows, 'secflow_binary_security_state_reducer_duration_seconds'),
  eventAvgLagSeconds: histogramAverage(rows, 'secflow_binary_security_state_event_lag_seconds'),
  lockWaitAvgSeconds: histogramAverage(rows, 'secflow_binary_security_task_state_lock_wait_seconds'),
  lockHeldAvgSeconds: histogramAverage(rows, 'secflow_binary_security_task_state_lock_held_seconds'),
});

const dedupeReducerHistory = (history: BinarySecurityReducerSnapshot[]) => {
  const result: BinarySecurityReducerSnapshot[] = [];
  for (const item of history) {
    const prev = result[result.length - 1];
    if (
      prev &&
      prev.pendingDepth === item.pendingDepth &&
      prev.processingDepth === item.processingDepth &&
      prev.retryableDepth === item.retryableDepth &&
      prev.deadLetterDepth === item.deadLetterDepth &&
      prev.oldestPendingAge === item.oldestPendingAge &&
      prev.reducerRunSuccess === item.reducerRunSuccess &&
      prev.reducerRunFailed === item.reducerRunFailed &&
      prev.reducerAvgDurationSeconds === item.reducerAvgDurationSeconds &&
      prev.eventAvgLagSeconds === item.eventAvgLagSeconds
    ) {
      result[result.length - 1] = item;
      continue;
    }
    result.push(item);
  }
  return result.slice(-24);
};

const buildBinarySecurityReducerViewModel = (rows: DisplayMetricRow[], history: BinarySecurityReducerSnapshot[]): BinarySecurityReducerViewModel => {
  const snapshot = buildBinarySecurityReducerSnapshot(rows);
  const deadLetters = rows
    .filter((row) => row.name === 'secflow_binary_security_state_dead_letters_total')
    .sort((left, right) => right.value - left.value)
    .slice(0, 6)
    .map((row) => ({
      label: `${row.labels.event_type || 'unknown'} / ${row.labels.reason || 'unknown'}`,
      value: row.value,
      tone: (row.value || 0) > 0 ? 'text-rose-700' : 'text-slate-500',
    }));
  const reducerEventResults = rows
    .filter((row) => row.name === 'secflow_binary_security_state_reducer_events_total')
    .sort((left, right) => right.value - left.value)
    .slice(0, 8)
    .map((row) => ({
      label: `${row.labels.event_type || 'unknown'} / ${row.labels.result || 'unknown'}`,
      value: row.value,
      tone: row.labels.result === 'processed' ? 'text-emerald-700' : 'text-rose-700',
    }));
  const fileWriteResults = rows
    .filter((row) => row.name === 'secflow_binary_security_state_file_writes_total')
    .sort((left, right) => right.value - left.value)
    .slice(0, 6)
    .map((row) => ({
      label: `${row.labels.target || 'unknown'} / ${row.labels.result || 'unknown'}`,
      value: row.value,
      tone: row.labels.result === 'success' ? 'text-emerald-700' : 'text-amber-700',
    }));
  const activeLocks = rows
    .filter((row) => row.name === 'secflow_binary_security_task_state_lock_active')
    .sort((left, right) => right.value - left.value)
    .map((row) => ({
      label: row.labels.operation || 'unknown',
      value: row.value,
      tone: (row.value || 0) > 0 ? 'text-indigo-700' : 'text-slate-500',
    }));

  const queueCards: ReducerQueueCard[] = [
    {
      label: '待处理事件',
      value: snapshot.pendingDepth,
      hint: snapshot.oldestPendingAge == null ? '未采集' : `最老 ${formatSeconds(snapshot.oldestPendingAge)}`,
      tone: (snapshot.pendingDepth || 0) > 0 ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-700',
      icon: <Database size={15} />,
    },
    {
      label: '处理中',
      value: snapshot.processingDepth,
      hint: snapshot.oldestProcessingAge == null ? '未采集' : `最老 ${formatSeconds(snapshot.oldestProcessingAge)}`,
      tone: (snapshot.processingDepth || 0) > 0 ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-slate-200 bg-slate-50 text-slate-700',
      icon: <Activity size={15} />,
    },
    {
      label: '可重试',
      value: snapshot.retryableDepth,
      hint: snapshot.oldestRetryableAge == null ? '未采集' : `最老 ${formatSeconds(snapshot.oldestRetryableAge)}`,
      tone: (snapshot.retryableDepth || 0) > 0 ? 'border-orange-200 bg-orange-50 text-orange-800' : 'border-slate-200 bg-slate-50 text-slate-700',
      icon: <RefreshCw size={15} />,
    },
    {
      label: '死信事件',
      value: snapshot.deadLetterDepth,
      hint: snapshot.oldestDeadLetterAge == null ? '未采集' : `最老 ${formatSeconds(snapshot.oldestDeadLetterAge)}`,
      tone: (snapshot.deadLetterDepth || 0) > 0 ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-slate-200 bg-slate-50 text-slate-700',
      icon: <ShieldAlert size={15} />,
    },
  ];

  const mergedHistory = dedupeReducerHistory([...history, snapshot]);
  return {
    queueCards,
    queueBarData: [
      { name: 'pending', value: snapshot.pendingDepth, tone: '#f59e0b' },
      { name: 'processing', value: snapshot.processingDepth, tone: '#0ea5e9' },
      { name: 'retryable', value: snapshot.retryableDepth, tone: '#f97316' },
      { name: 'dead', value: snapshot.deadLetterDepth, tone: '#ef4444' },
      { name: 'processed', value: snapshot.processedDepth, tone: '#10b981' },
    ],
    ageBarData: [
      { name: 'pending', value: snapshot.oldestPendingAge, tone: '#f59e0b' },
      { name: 'processing', value: snapshot.oldestProcessingAge, tone: '#0ea5e9' },
      { name: 'retryable', value: snapshot.oldestRetryableAge, tone: '#f97316' },
      { name: 'dead', value: snapshot.oldestDeadLetterAge, tone: '#ef4444' },
    ],
    healthSummary: [
      {
        label: 'Reducer 平均单次耗时',
        value: formatSeconds(snapshot.reducerAvgDurationSeconds),
        tone: (snapshot.reducerAvgDurationSeconds || 0) > 1 ? 'text-amber-700' : 'text-slate-900',
        hint: '来自 `state_reducer_duration_seconds` 均值',
      },
      {
        label: '事件平均收口延迟',
        value: formatSeconds(snapshot.eventAvgLagSeconds),
        tone: (snapshot.eventAvgLagSeconds || 0) > 30 ? 'text-rose-700' : 'text-slate-900',
        hint: '从事件创建到 reducer 应用完成',
      },
      {
        label: '锁等待均值',
        value: formatSeconds(snapshot.lockWaitAvgSeconds),
        tone: (snapshot.lockWaitAvgSeconds || 0) > 0.3 ? 'text-amber-700' : 'text-slate-900',
        hint: '任务级状态锁竞争强度',
      },
      {
        label: '锁持有均值',
        value: formatSeconds(snapshot.lockHeldAvgSeconds),
        tone: (snapshot.lockHeldAvgSeconds || 0) > 1.5 ? 'text-rose-700' : 'text-slate-900',
        hint: '串行应用期间锁占用时长',
      },
    ],
    reducerRuns: [
      { label: 'success', value: snapshot.reducerRunSuccess, tone: 'text-emerald-700' },
      { label: 'failed', value: snapshot.reducerRunFailed, tone: 'text-rose-700' },
      { label: 'lock_busy', value: snapshot.reducerRunLockBusy, tone: 'text-amber-700' },
      { label: 'skipped', value: snapshot.reducerRunSkipped, tone: 'text-slate-600' },
    ],
    reducerEventResults,
    deadLetters,
    fileWriteResults,
    activeLocks,
    timeSeries: mergedHistory.map((item) => ({
      time: new Date(item.capturedAt).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      pending: item.pendingDepth,
      retryable: item.retryableDepth,
      deadLetter: item.deadLetterDepth,
      oldestPendingAge: item.oldestPendingAge,
      reducerAvgDurationSeconds: item.reducerAvgDurationSeconds,
      eventAvgLagSeconds: item.eventAvgLagSeconds,
    })),
  };
};

const MetricCard: React.FC<{ label: string; value: number; icon: React.ReactNode }> = ({ label, value, icon }) => (
  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
    <div className="flex items-center justify-between gap-3 text-slate-500">
      <span className="text-[11px] font-black uppercase tracking-[0.18em]">{label}</span>
      <span>{icon}</span>
    </div>
    <div className="mt-3 text-2xl font-black tracking-tight text-slate-900">{formatNumber(value, 2)}</div>
  </div>
);

const EmptyCard: React.FC<{ text: string }> = ({ text }) => (
  <div className="flex h-full min-h-[220px] items-center justify-center rounded-[2rem] border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-500">
    {text}
  </div>
);

const ReducerMetricList: React.FC<{ title: string; items: ReducerBreakdownItem[]; emptyText: string }> = ({ title, items, emptyText }) => (
  <div className="rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-sm">
    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{title}</div>
    <div className="mt-3 space-y-2">
      {items.length ? (
        items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
            <div className="min-w-0 truncate text-[12px] font-semibold text-slate-700">{item.label}</div>
            <div className={`font-mono text-[12px] font-black ${item.tone}`}>{formatMetricValue(item.value)}</div>
          </div>
        ))
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">{emptyText}</div>
      )}
    </div>
  </div>
);

export const BinarySecurityMetricsDashboardPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const executionMetricsApi = api.domains.execution.metrics;
  const [activeServiceKey, setActiveServiceKey] = useState<BinarySecurityMetricsServiceKey>(BINARY_SECURITY_METRICS_SERVICES[0].key);
  const [activeSecondaryTab, setActiveSecondaryTab] = useState<BinarySecurityMetricsSecondaryTab>('observability');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [groupFilter, setGroupFilter] = useState<'all' | BinarySecurityMetricsGroup>('all');
  const [aiSearchKeyword, setAiSearchKeyword] = useState('');
  const [aiRoleFilter, setAiRoleFilter] = useState<'all' | string>('all');
  const [reducerHistoryByService, setReducerHistoryByService] = useState<Record<BinarySecurityMetricsServiceKey, BinarySecurityReducerSnapshot[]>>(
    Object.fromEntries(BINARY_SECURITY_METRICS_SERVICES.map((service) => [service.key, []])) as Record<BinarySecurityMetricsServiceKey, BinarySecurityReducerSnapshot[]>,
  );
  const [reducerMetricsState, setReducerMetricsState] = useState<MetricsState>(INITIAL_STATE);
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
      [serviceKey]: { ...current[serviceKey], loading: true, error: null },
    }));
    try {
      const rawText = await executionMetricsApi.getServiceMetrics(serviceKey);
      setStateByService((current) => ({
        ...current,
        [serviceKey]: { loading: false, rawText, error: null, refreshedAt: Date.now() },
      }));
    } catch (error: any) {
      setStateByService((current) => ({
        ...current,
        [serviceKey]: { ...current[serviceKey], loading: false, error: error?.message || '指标抓取失败', refreshedAt: Date.now() },
      }));
    }
  };

  const loadReducerMetrics = async () => {
    setReducerMetricsState((current) => ({ ...current, loading: true, error: null }));
    try {
      const rawText = await executionMetricsApi.getBinarySecurityReducerMetrics();
      const rows = buildServiceViewModel(rawText, getBinarySecurityMetricsService('binary-security')).rows;
      const snapshot = buildBinarySecurityReducerSnapshot(rows);
      setReducerHistoryByService((current) => ({
        ...current,
        'binary-security': dedupeReducerHistory([...(current['binary-security'] || []), snapshot]),
      }));
      setReducerMetricsState({ loading: false, rawText, error: null, refreshedAt: Date.now() });
    } catch (error: any) {
      setReducerMetricsState((current) => ({
        ...current,
        loading: false,
        error: error?.message || 'Reducer 指标抓取失败',
        refreshedAt: Date.now(),
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
    if (activeServiceKey !== 'binary-security') return;
    if (activeSecondaryTab !== 'reducer') return;
    if (!reducerMetricsState.rawText && !reducerMetricsState.loading && !reducerMetricsState.error) {
      void loadReducerMetrics();
    }
  }, [activeSecondaryTab, activeServiceKey, reducerMetricsState]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = window.setInterval(() => {
      void loadMetrics(activeServiceKey);
      if (activeServiceKey === 'binary-security' && activeSecondaryTab === 'reducer') {
        void loadReducerMetrics();
      }
    }, 30000);
    return () => window.clearInterval(timer);
  }, [activeSecondaryTab, activeServiceKey, autoRefresh]);

  useEffect(() => {
    setSearchKeyword('');
    setGroupFilter('all');
    setAiSearchKeyword('');
    setAiRoleFilter('all');
    setActiveSecondaryTab('observability');
  }, [activeServiceKey, projectId]);

  const activeState = stateByService[activeServiceKey];
  const activeRefreshTimestamp = activeServiceKey === 'binary-security' && activeSecondaryTab === 'reducer' ? reducerMetricsState.refreshedAt : activeState.refreshedAt;
  const viewModel = useMemo(() => buildServiceViewModel(activeState.rawText, activeService), [activeService, activeState.rawText]);
  const aggregateCoverage = useMemo(
    () => buildAggregateCoverageSummary(viewModel.rows, activeServiceKey),
    [activeServiceKey, viewModel.rows],
  );
  const aiViewModel = useMemo(() => buildAiViewModel(viewModel.rows, activeService), [activeService, viewModel.rows]);
  const reducerViewModel = useMemo(
    () =>
      activeServiceKey === 'binary-security'
        ? buildBinarySecurityReducerViewModel(
            buildServiceViewModel(reducerMetricsState.rawText, getBinarySecurityMetricsService('binary-security')).rows,
            reducerHistoryByService[activeServiceKey] || [],
          )
        : null,
    [activeServiceKey, reducerHistoryByService, reducerMetricsState.rawText],
  );

  const filteredRows = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    return viewModel.rows.filter((row) => {
      if (groupFilter !== 'all' && row.group !== groupFilter) return false;
      if (!keyword) return true;
      return `${row.name} ${row.labelText} ${row.help || ''}`.toLowerCase().includes(keyword);
    });
  }, [groupFilter, searchKeyword, viewModel.rows]);

  const aiRows = useMemo(() => {
    const keyword = aiSearchKeyword.trim().toLowerCase();
    return aiViewModel.rows.filter((row) => {
      if (aiRoleFilter !== 'all') {
        const roleHit = Object.values(row.labels).some((value) => value === aiRoleFilter);
        if (!roleHit) return false;
      }
      if (!keyword) return true;
      return `${row.name} ${row.labelText} ${row.help || ''}`.toLowerCase().includes(keyword);
    });
  }, [aiRoleFilter, aiSearchKeyword, aiViewModel.rows]);

  const aiRoles = useMemo(() => {
    const roles = new Set<string>();
    aiViewModel.rows.forEach((row) => {
      Object.entries(row.labels).forEach(([key, value]) => {
        if ((BINARY_SECURITY_AI_DIMENSION_LABEL_KEYS as readonly string[]).includes(key) && value) {
          roles.add(value);
        }
      });
    });
    return Array.from(roles).sort((left, right) => left.localeCompare(right, 'zh-CN'));
  }, [aiViewModel.rows]);

  return (
    <div className="space-y-6 px-8 pb-10 pt-8">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-teal-600">Binary Security</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">性能看板</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              面向二进制安全链路的轻量指标看板，直接抓取各微服务的 Prometheus `/metrics` 快照，并拆分通用观测与 AI/智能体观测。
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
              onClick={() => {
                if (activeServiceKey === 'binary-security' && activeSecondaryTab === 'reducer') {
                  void loadReducerMetrics();
                  return;
                }
                void loadMetrics(activeServiceKey);
              }}
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
            最近刷新：{formatTime(activeRefreshTimestamp)}
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

      <section className="rounded-[2rem] border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {BINARY_SECURITY_METRICS_SECONDARY_TABS.map((tab) => {
            const active = tab.key === activeSecondaryTab;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveSecondaryTab(tab.key)}
                className={`rounded-2xl px-4 py-2.5 text-sm font-black transition ${
                  active ? 'bg-teal-600 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tab.label}
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
      ) : activeSecondaryTab === 'observability' ? (
        <>
          {aggregateCoverage ? (
            <section
              className={`rounded-[2rem] border px-5 py-4 shadow-sm ${
                aggregateCoverage.partial ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Cluster Aggregate</div>
                  <h2 className="mt-2 text-lg font-black tracking-tight text-slate-900">当前展示的是二进制安全编排器多实例聚合指标</h2>
                  <p className="mt-2 text-sm text-slate-600">
                    已抓取 {aggregateCoverage.successful}/{aggregateCoverage.attempted} 个实例。
                    {aggregateCoverage.partial ? ' 当前为部分聚合结果，个别 Pod scrape 失败时数值可能略有偏差。' : ' 当前结果已覆盖本次发现的全部实例。'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {aggregateCoverage.attemptedByRole.map((item) => (
                    <span
                      key={item.role}
                      className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white px-3 py-1 text-xs font-bold text-slate-700"
                    >
                      {item.role}: {formatNumber(item.successful, 0)}/{formatNumber(item.attempted, 0)}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

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
                      <Tooltip formatter={(value: number) => formatMetricValue(Number(value))} />
                      <Bar dataKey="value" fill={CHART_COLOR} radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyCard text="暂无可绘制的指标" />
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
                  <EmptyCard text="当前服务暂无可自动聚合的关键指标" />
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
                  <input value={searchKeyword} onChange={(event) => setSearchKeyword(event.target.value)} placeholder="搜索指标名 / labels / help" className="rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-700" />
                </div>
                <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value as 'all' | BinarySecurityMetricsGroup)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
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
              {filteredRows.length === 0 ? <div className="px-4 py-10 text-center text-sm text-slate-500">没有符合过滤条件的指标</div> : null}
            </div>
          </section>
        </>
      ) : activeSecondaryTab === 'reducer' ? (
        activeServiceKey !== 'binary-security' ? (
          <section className="rounded-[2rem] border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
            <div className="mx-auto max-w-2xl">
              <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">Reducer</div>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">当前服务无独立 reducer 观测</h2>
              <p className="mt-3 text-sm text-slate-500">
                `Reducer` Tab 当前只对 `二进制安全编排器` 开放，用来持续观测状态事件队列、收口时延、死信、锁竞争和落盘行为。
              </p>
            </div>
          </section>
        ) : reducerMetricsState.loading && !reducerMetricsState.rawText ? (
          <section className="rounded-[2rem] border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
            <Loader2 className="mx-auto animate-spin text-slate-400" size={24} />
            <p className="mt-4 text-sm text-slate-500">正在抓取 reducer 指标...</p>
          </section>
        ) : reducerMetricsState.error && !reducerMetricsState.rawText ? (
          <section className="rounded-[2rem] border border-rose-200 bg-rose-50 px-6 py-12 text-center shadow-sm">
            <p className="text-sm font-semibold text-rose-700">{reducerMetricsState.error}</p>
          </section>
        ) : reducerViewModel ? (
          <section className="space-y-4 rounded-[2rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.08),_transparent_36%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-teal-600">Reducer Watch</div>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">状态收口观测</h2>
                <p className="mt-2 max-w-3xl text-sm text-slate-500">
                  持续观测 reducer 是否在及时消费状态事件、是否出现队列积压、锁竞争、死信和文件落盘异常，专门对应“下游已恢复但父任务仍然失败/不收敛”的问题。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-bold text-slate-600">
                  <TrendingUp size={12} />
                  历史窗口 {formatNumber(reducerViewModel.timeSeries.length)} 点
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-bold text-slate-600">
                  <GitBranch size={12} />
                  30s 自动刷新可形成连续曲线
                </span>
              </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-4">
              {reducerViewModel.queueCards.map((item) => (
                <div key={item.label} className={`rounded-[1.4rem] border px-4 py-4 shadow-sm ${item.tone}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em]">{item.label}</div>
                    <span>{item.icon}</span>
                  </div>
                  <div className="mt-3 text-3xl font-black tracking-tight">{formatNumber(item.value)}</div>
                  <div className="mt-1 text-xs opacity-80">{item.hint}</div>
                </div>
              ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <div className="rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">队列走势</div>
                    <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">Pending / Retryable / Dead Letter</h3>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-500">
                    <BarChart3 size={12} />
                    客户端历史
                  </span>
                </div>
                <div className="mt-4 h-72">
                  {reducerViewModel.timeSeries.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={reducerViewModel.timeSeries} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                        <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#64748b' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                        <Tooltip formatter={(value: number) => formatMetricValue(Number(value))} />
                        <Line type="monotone" dataKey="pending" stroke="#f59e0b" strokeWidth={2.5} dot={false} />
                        <Line type="monotone" dataKey="retryable" stroke="#f97316" strokeWidth={2.2} dot={false} />
                        <Line type="monotone" dataKey="deadLetter" stroke="#ef4444" strokeWidth={2.2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyCard text="开启自动刷新后，这里会持续显示 reducer 队列走势。" />
                  )}
                </div>
              </div>

              <div className="rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">收口时延</div>
                <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">事件老化 / 平均耗时</h3>
                <div className="mt-4 h-72">
                  {reducerViewModel.timeSeries.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={reducerViewModel.timeSeries} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                        <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#64748b' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                        <Tooltip formatter={(value: number) => formatSeconds(Number(value))} />
                        <Line type="monotone" dataKey="oldestPendingAge" stroke="#f59e0b" strokeWidth={2.4} dot={false} />
                        <Line type="monotone" dataKey="eventAvgLagSeconds" stroke="#0f766e" strokeWidth={2.2} dot={false} />
                        <Line type="monotone" dataKey="reducerAvgDurationSeconds" stroke="#7c3aed" strokeWidth={2.2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyCard text="这里会观察最老 pending 事件年龄、平均收口延迟和 reducer 平均处理耗时。" />
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <div className="rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">即时状态</div>
                <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">队列快照与处理均值</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {reducerViewModel.healthSummary.map((item) => (
                    <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{item.label}</div>
                      <div className={`mt-2 text-2xl font-black ${item.tone}`}>{item.value}</div>
                      <div className="mt-1 text-xs text-slate-500">{item.hint}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Queue Depth</div>
                    <div className="mt-3 h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={reducerViewModel.queueBarData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                          <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                          <Tooltip formatter={(value: number) => formatMetricValue(Number(value))} />
                          <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                            {reducerViewModel.queueBarData.map((entry) => (
                              <Cell key={entry.name} fill={entry.tone} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Oldest Age</div>
                    <div className="mt-3 h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={reducerViewModel.ageBarData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                          <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                          <Tooltip formatter={(value: number) => formatSeconds(Number(value))} />
                          <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                            {reducerViewModel.ageBarData.map((entry) => (
                              <Cell key={entry.name} fill={entry.tone} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <ReducerMetricList title="Reducer Runs" items={reducerViewModel.reducerRuns} emptyText="暂无 reducer 运行统计。" />
                <ReducerMetricList title="Reducer Event Result" items={reducerViewModel.reducerEventResults} emptyText="暂无事件应用结果。" />
                <ReducerMetricList title="Dead Letters" items={reducerViewModel.deadLetters} emptyText="当前没有死信事件。" />
                <ReducerMetricList title="Task State Lock / File Writes" items={[...reducerViewModel.activeLocks, ...reducerViewModel.fileWriteResults].slice(0, 8)} emptyText="暂无锁和文件落盘统计。" />
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-[2rem] border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
            <p className="text-sm text-slate-500">Reducer 指标还没有准备好，请刷新后重试。</p>
          </section>
        )
      ) : (
        <>
          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-fuchsia-500">AI/智能体</div>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">AI专区</h2>
                <p className="mt-2 max-w-3xl text-sm text-slate-500">{aiViewModel.coverageText}</p>
              </div>
              <div className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${AI_COVERAGE_BADGE[aiViewModel.coverage]}`}>
                {aiViewModel.coverageLabel}
              </div>
            </div>
          </section>

          {aiViewModel.rows.length === 0 ? (
            <EmptyCard text="当前服务尚未完成 AI 观测埋点，AI专区暂时没有可展示的指标。" />
          ) : (
            <>
              <section className="grid gap-4 xl:grid-cols-3">
                {aiViewModel.cards.map((item) => (
                  <MetricCard key={item.label} label={item.label} value={item.value} icon={item.icon} />
                ))}
              </section>

              <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">埋点覆盖</div>
                  <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">AI 指标摘要</h3>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">识别到的 AI 指标族</div>
                      <div className="mt-3 text-3xl font-black text-slate-900">{formatNumber(aiViewModel.familyCount)}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Canonical 契约</div>
                      <div className="mt-3 text-base font-black text-slate-900">{aiViewModel.coverageLabel}</div>
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                    <div className="text-sm font-bold text-slate-800">已识别 canonical 维度</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {BINARY_SECURITY_CANONICAL_AI_METRICS.map((item) => {
                        const hit = aiViewModel.rows.some((row) => row.name.includes(item.key.replace(/-/gu, '_')) || (row.help || '').includes(item.label));
                        return (
                          <span key={item.key} className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${hit ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                            {item.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">角色分布</div>
                  <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">AI 角色分布图</h3>
                  <div className="mt-4 h-72">
                    {aiViewModel.roleChart.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={aiViewModel.roleChart} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                          <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                          <Tooltip formatter={(value: number) => formatMetricValue(Number(value))} />
                          <Bar dataKey="value" fill={AI_CHART_COLOR} radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyCard text="当前服务暂时没有 AI 角色分布数据" />
                    )}
                  </div>
                </div>
              </section>

              <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Token / Cost</div>
                <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">AI Token/Cost 图</h3>
                <div className="mt-4 h-72">
                  {aiViewModel.tokenChart.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={aiViewModel.tokenChart} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                        <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                        <Tooltip formatter={(value: number) => formatMetricValue(Number(value))} />
                        <Bar dataKey="value" fill="#db2777" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyCard text="当前服务暂时没有 token/cost 维度数据" />
                  )}
                </div>
              </section>

              <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">AI 指标表</div>
                    <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">AI/智能体指标明细</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <div className="relative">
                      <Search size={14} className="pointer-events-none absolute left-3 top-2.5 text-slate-400" />
                      <input value={aiSearchKeyword} onChange={(event) => setAiSearchKeyword(event.target.value)} placeholder="搜索 AI 指标名 / labels / help" className="rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-700" />
                    </div>
                    <select value={aiRoleFilter} onChange={(event) => setAiRoleFilter(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
                      <option value="all">全部角色/类型</option>
                      {aiRoles.map((role) => (
                        <option key={role} value={role}>{role}</option>
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
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {aiRows.map((row) => (
                        <tr key={`${row.name}:${row.labelText}`} className="hover:bg-slate-50">
                          <td className="px-3 py-3 align-top">
                            <div className="font-mono text-[11px] font-bold text-slate-800">{row.name}</div>
                            {row.help ? <div className="mt-1 max-w-[34rem] text-[11px] text-slate-500">{row.help}</div> : null}
                          </td>
                          <td className="px-3 py-3 font-mono text-[11px] text-slate-600">{row.labelText}</td>
                          <td className="px-3 py-3 font-mono text-[11px] font-semibold text-slate-800">{formatMetricValue(row.value)}</td>
                          <td className="px-3 py-3 uppercase text-slate-600">{row.type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {aiRows.length === 0 ? <div className="px-4 py-10 text-center text-sm text-slate-500">没有符合过滤条件的 AI 指标</div> : null}
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
};
