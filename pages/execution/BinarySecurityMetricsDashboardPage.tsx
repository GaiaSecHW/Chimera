import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { showAlert, showConfirm } from '../../components/DialogService';
import {
  ExecutionTable,
  ExecutionTableEmptyRow,
  ExecutionTableHead,
  ExecutionTableTd,
  ExecutionTableTh,
  executionTableRowClassName,
} from '../../components/execution/ExecutionTable';
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
import {
  AgentObservabilitySummary,
  AgentProcessKillResponse,
  AgentProcessSnapshot,
  AgentSessionObservabilitySnapshot,
  AgentTaskOwnershipSnapshot,
  AppDfaSessionMeta,
  AppDfaSessionSnapshot,
  AppEaSessionSnapshot,
  AppSaSessionMeta,
  AppSaSessionSnapshot,
  AppDfaClusterCapacity,
  AppSaClusterCapacity,
  EntryAnalyseSlotClusterSummary,
} from '../../types/types';
import type { BinarySecurityReducerEventRecord, BinarySecurityReducerEventRecordPage } from '../../clients/binarySecurity';
import {
  DataflowVulnAiSection,
  DataflowVulnObservabilitySection,
  DataflowVulnSampleScopeFilter,
  DataflowVulnSignalsSection,
  HeadlineMetricCard,
} from './binarySecurityMetricsDataflowVuln';
import type { DataflowVulnAiViewModel, DataflowVulnOverviewViewModel, DataflowVulnSampleScope } from './binarySecurityMetricsDataflowVuln';
import { buildDataflowVulnAiViewModel, buildDataflowVulnOverviewViewModel, matchesDataflowVulnSampleScope } from './binarySecurityMetricsDataflowVulnBuilders';
import { AgentSessionViewer } from './AgentSessionViewer';

type MetricsState = {
  loading: boolean;
  rawText: string;
  error: string | null;
  refreshedAt: number | null;
};

type ReducerEventState = {
  loading: boolean;
  data: BinarySecurityReducerEventRecordPage | null;
  error: string | null;
  refreshedAt: number | null;
};

type DfaWorkerDetailState = {
  loading: boolean;
  data: AppDfaClusterCapacity | null;
  error: string | null;
  refreshedAt: number | null;
};

type EntryWorkerDetailState = {
  loading: boolean;
  data: EntryAnalyseSlotClusterSummary | null;
  error: string | null;
  refreshedAt: number | null;
};

type SystemAnalysisWorkerDetailState = {
  loading: boolean;
  data: AppSaClusterCapacity | null;
  error: string | null;
  refreshedAt: number | null;
};

type AgentObservabilityState = {
  loading: boolean;
  summary: AgentObservabilitySummary | null;
  processes: AgentProcessSnapshot[];
  sessions: AgentSessionObservabilitySnapshot[];
  tasks: AgentTaskOwnershipSnapshot[];
  error: string | null;
  refreshedAt: number | null;
};

type AgentSessionContentState = {
  loading: boolean;
  data: AppEaSessionSnapshot | AppSaSessionSnapshot | AppDfaSessionSnapshot | null;
  error: string | null;
};

type AgentKillHistoryEntry = {
  id: string;
  scope: 'single' | 'selected' | 'bulk';
  createdAt: number;
  response: AgentProcessKillResponse;
};

type ReducerEventSortBy = 'processed_at' | 'duration_ms' | 'created_at';
type ReducerEventSortOrder = 'asc' | 'desc';

const buildFallbackAgentSessionMeta = (
  session: AgentSessionObservabilitySnapshot,
): AppSaSessionMeta => ({
  session_id: session.session_id || session.session_file,
  session_name: session.display_name,
  relative_path: session.session_file,
  stage_group: session.stage_key || 'agent',
  role_name: session.role_kind || 'agent',
  size: 0,
  mtime: 0,
  event_count: 0,
  line_count: session.line_count,
  is_active: session.live,
  display_name: session.display_name,
  warnings: session.parse_warnings,
});

const normalizeAgentSessionMeta = (
  snapshot: AppEaSessionSnapshot | AppSaSessionSnapshot | AppDfaSessionSnapshot | null,
  session: AgentSessionObservabilitySnapshot | null,
): AppSaSessionMeta | null => {
  if (!session) return null;
  const fallback = buildFallbackAgentSessionMeta(session);
  if (!snapshot) return fallback;

  const dfaMeta = 'meta' in snapshot ? (snapshot.meta as AppDfaSessionMeta | undefined | null) : null;
  if (dfaMeta) {
    return {
      ...fallback,
      session_id: dfaMeta.session_id || fallback.session_id,
      session_name: dfaMeta.session_name || fallback.session_name,
      relative_path: dfaMeta.relative_path || fallback.relative_path,
      stage_group: dfaMeta.stage_group || fallback.stage_group,
      role_name: dfaMeta.role_name || fallback.role_name,
      size: dfaMeta.size ?? fallback.size,
      mtime: dfaMeta.mtime ?? fallback.mtime,
      event_count: dfaMeta.event_count ?? snapshot.events?.length ?? fallback.event_count,
      line_count: snapshot.line_count ?? fallback.line_count,
      is_active: dfaMeta.is_active ?? fallback.is_active,
      display_name: dfaMeta.display_name || fallback.display_name,
      warnings: snapshot.warnings || fallback.warnings,
    };
  }

  const rawMeta = 'session_meta' in snapshot ? snapshot.session_meta : null;
  if (rawMeta && typeof rawMeta === 'object') {
    const meta = rawMeta as Partial<AppSaSessionMeta> & Record<string, unknown>;
    return {
      ...fallback,
      session_id: String(meta.session_id || fallback.session_id),
      session_name: String(meta.session_name || fallback.session_name),
      relative_path: String(meta.relative_path || fallback.relative_path),
      stage_group: String(meta.stage_group || fallback.stage_group),
      role_name: String(meta.role_name || fallback.role_name),
      size: typeof meta.size === 'number' ? meta.size : fallback.size,
      mtime: typeof meta.mtime === 'number' ? meta.mtime : fallback.mtime,
      event_count: typeof meta.event_count === 'number' ? meta.event_count : snapshot.events?.length ?? fallback.event_count,
      line_count: typeof meta.line_count === 'number' ? meta.line_count : snapshot.line_count ?? fallback.line_count,
      is_active: typeof meta.is_active === 'boolean' ? meta.is_active : fallback.is_active,
      display_name: String(meta.display_name || fallback.display_name),
      warnings: Array.isArray(meta.warnings)
        ? meta.warnings.map((item) => String(item))
        : snapshot.warnings || fallback.warnings,
    };
  }

  return fallback;
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

type B2SBusinessViewModel = {
  availableItems: number | null;
  missingItems: number | null;
  coverageRate: number | null;
  headerAvgSeconds: number | null;
  bodyAvgSeconds: number | null;
  batchAvgSeconds: number | null;
  runningHeaderAvgSeconds: number | null;
  runningBodyAvgSeconds: number | null;
  functionThroughput: number | null;
  weightedFunctionThroughput: number | null;
  batchRetryRate: number | null;
  batchValidationPassRate: number | null;
  batchFailureRate: number | null;
  avgAttemptsPerBatch: number | null;
  batchAttempts: number | null;
  batchValidation: number | null;
  artifactBytes: number | null;
  tokenTotal: number | null;
  costTotal: number | null;
  latestSeenAt: number | null;
  missingReasons: Array<{ reason: string; value: number }>;
  syncCandidates: number | null;
  syncLastAttempted: number | null;
  syncLastSucceeded: number | null;
  syncLastChanged: number | null;
  syncLastFailed: number | null;
  syncLastDurationSeconds: number | null;
  syncLastRunAt: number | null;
  syncTotalTicks: number | null;
  syncTotalFailedTasks: number | null;
};

type B2SCacheViewModel = {
  requestsTotal: number | null;
  hitsTotal: number | null;
  missesTotal: number | null;
  bypassedTotal: number | null;
  replacedTotal: number | null;
  entries: number | null;
  hitRate: number | null;
};

type FirmwareUnpackerHealthAlert = {
  label: string;
  text: string;
  tone: string;
};

type FirmwareUnpackerViewModel = {
  kpis: Array<{ label: string; value: string; hint: string; tone: string }>;
  taskStatusChart: Array<{ name: string; value: number; fill: string }>;
  queueChart: Array<{ name: string; value: number; fill: string }>;
  workerChart: Array<{ name: string; value: number; fill: string }>;
  httpTop: Array<{ name: string; value: number }>;
  operations: Array<{ label: string; value: number | null; hint: string; tone: string }>;
  aiSummary: Array<{ label: string; value: string; hint: string; tone: string }>;
  alerts: FirmwareUnpackerHealthAlert[];
};

type EntryAnalysisViewModel = {
  kpis: Array<{ label: string; value: string; hint: string; tone: string }>;
  roleSummary: Array<{ label: string; value: string; hint: string; tone: string }>;
  failureSummary: Array<{ label: string; value: number | null; hint: string; tone: string }>;
  topModules: Array<{ name: string; value: number }>;
  riskAlerts: Array<{ label: string; text: string; tone: string }>;
  stageCards: Array<{ label: string; value: string; hint: string; tone: string }>;
  stageRows: Array<{
    stage: string;
    totalRuns: number;
    passedRuns: number;
    failedRuns: number;
    retryRuns: number;
    runningRuns: number;
    workerCalls: number;
    judgeCalls: number;
    sessionCount: number;
    avgDurationSeconds: number | null;
    healthTone: string;
  }>;
  stageStatusChart: Array<{
    name: string;
    passed: number;
    failed: number;
    retry: number;
    running: number;
  }>;
};

type DataflowAnalysisViewModel = {
  kpis: Array<{ label: string; value: string; hint: string; tone: string }>;
  loadCards: Array<{ label: string; value: string; hint: string; tone: string }>;
  failureCategories: Array<{ label: string; value: number; tone: string }>;
  dispatchSummary: Array<{ label: string; value: number; tone: string }>;
  alerts: Array<{ label: string; text: string; tone: string }>;
};

type SystemAnalysisStageRow = {
  stage: string;
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
  runningRuns: number;
  avgDurationSeconds: number | null;
  avgScore: number | null;
  avgTokens: number | null;
  avgCost: number | null;
  avgRounds: number | null;
  successRate: number | null;
};

type SystemAnalysisViewModel = {
  compactSummary: Array<{ label: string; value: string; tone: string }>;
  overviewCards: Array<{ label: string; value: string; hint: string; tone: string }>;
  governanceCards: Array<{ label: string; value: string; hint: string; tone: string }>;
  qualityCards: Array<{ label: string; value: string; hint: string; tone: string }>;
  costCards: Array<{ label: string; value: string; hint: string; tone: string }>;
  stageRows: SystemAnalysisStageRow[];
  failureCategories: Array<{ label: string; value: number; tone: string }>;
  riskAlerts: Array<{ label: string; text: string; tone: string }>;
  checkpointCards: Array<{ label: string; value: string; hint: string; tone: string }>;
  checkpointChart: Array<{ name: string; value: number; fill: string }>;
  concurrencyChart: Array<{ name: string; value: number; fill: string }>;
  stagePressureCards: Array<{ label: string; value: string; hint: string; tone: string }>;
  stagePressureRows: Array<{ stage: string; pressureScore: number; runningRuns: number; avgDurationSeconds: number | null; successRate: number | null; tone: string }>;
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
  snapshotMeta: {
    available: boolean;
    stale: boolean;
    ageSeconds: number | null;
    sourcePod: string | null;
    generatedAtTimestamp: number | null;
  };
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

type BinarySecurityObservabilityViewModel = {
  overviewCards: Array<{ label: string; value: string; hint: string; tone: string; icon: React.ReactNode }>;
  alerts: Array<{ label: string; text: string; tone: string }>;
  pipelineSummary: ReducerBreakdownItem[];
  reducerSummary: ReducerBreakdownItem[];
  syncSummary: ReducerBreakdownItem[];
  taskListPerformance: {
    topCards: Array<{ label: string; value: string; hint: string; tone: string }>;
    stageRows: Array<{ stage: string; p95Seconds: number | null; avgSeconds: number | null; count: number | null; tone: string }>;
    alerts: Array<{ label: string; text: string; tone: string }>;
  };
  groupCounts: Array<{ group: BinarySecurityMetricsGroup; count: number }>;
};

const GROUP_LABELS: Record<BinarySecurityMetricsGroup, string> = {
  health: '健康',
  orchestration: '编排',
  reducer: 'Reducer',
  lock: '锁',
  http: 'HTTP',
  task: '任务',
  queue: '队列',
  worker: 'Worker/调度',
  duration: '耗时',
  'error-retry-timeout': '异常/重试/超时',
  'llm-token-cost': 'LLM/Token/Cost',
  'ai-agent': 'AI/智能体',
  'service-specific': '服务特定',
  other: '其他',
};

const GROUP_BADGE: Record<BinarySecurityMetricsGroup, string> = {
  health: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  orchestration: 'border-teal-200 bg-teal-50 text-teal-700',
  reducer: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  lock: 'border-orange-200 bg-orange-50 text-orange-700',
  http: 'border-sky-200 bg-sky-50 text-sky-700',
  task: 'border-slate-200 bg-slate-100 text-slate-700',
  queue: 'border-amber-200 bg-amber-50 text-amber-700',
  worker: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  duration: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  'error-retry-timeout': 'border-rose-200 bg-rose-50 text-rose-700',
  'llm-token-cost': 'border-violet-200 bg-violet-50 text-violet-700',
  'ai-agent': 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700',
  'service-specific': 'border-emerald-200 bg-emerald-50 text-emerald-700',
  other: 'border-slate-200 bg-slate-50 text-slate-600',
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
const INITIAL_REDUCER_EVENT_STATE: ReducerEventState = { loading: false, data: null, error: null, refreshedAt: null };
const ENTRY_ANALYSIS_STAGE_FOCUS_STORAGE_KEY = 'secflow:entryAnalysisStageFocus';
const ENTRY_ANALYSIS_RISK_FOCUS_STORAGE_KEY = 'secflow:entryAnalysisRiskFocus';

function entryAnalysisRiskKeyFromLabel(label: string): string {
  if (label === '排队堆积') return 'queue-pressure';
  if (label === '超时偏高') return 'timeout-high';
  if (label === '最终通过率偏低') return 'low-pass-rate';
  return 'healthy';
}

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

const formatMilliseconds = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return '-';
  if (value >= 1000) return formatSeconds(value / 1000);
  return `${formatNumber(value, 0)}ms`;
};

const formatTime = (timestamp: number | null) =>
  timestamp ? new Date(timestamp).toLocaleString('zh-CN', { hour12: false }) : '-';

const formatBytes = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return '-';
  if (value >= 1024 * 1024 * 1024) return `${formatNumber(value / (1024 * 1024 * 1024), 2)} GB`;
  if (value >= 1024 * 1024) return `${formatNumber(value / (1024 * 1024), 2)} MB`;
  if (value >= 1024) return `${formatNumber(value / 1024, 2)} KB`;
  return `${formatNumber(value, 0)} B`;
};

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

const metricGroupingFingerprint = (metric: ParsedMetricSample) => {
  const serviceNeutralName = metric.name.replace(/^firmware_unpacker_/u, '').replace(/^secflow_/u, '');
  return `${serviceNeutralName} ${Object.keys(metric.labels).join(' ')} ${Object.values(metric.labels).join(' ')}`.toLowerCase();
};

const BINARY_SECURITY_GROUP_RULES: Array<{ group: BinarySecurityMetricsGroup; pattern: RegExp }> = [
  { group: 'health', pattern: /metrics_aggregate_(scrape|partial|last_success)|reducer_snapshot_(available|age|stale|generated_at|source_info)/u },
  { group: 'lock', pattern: /task_state_lock_(wait|held|active)|lock_busy/u },
  { group: 'reducer', pattern: /state_(event|reducer|dead_letter|file_write)|archive_jobs_by_status/u },
  { group: 'orchestration', pattern: /downstream|dispatch|stage_duration|task_lifecycle|task_operations|archive_actions|downstream_reconcile/u },
  { group: 'queue', pattern: /queue_depth|queue_oldest_age|pending|backlog|retryable|dead_letter/u },
  { group: 'worker', pattern: /active_workers|slot_usage|scheduler|dispatcher|heartbeat|owner|runner|pod/u },
  { group: 'http', pattern: /api_request|downstream_requests_total|http|request|response|route|path|method/u },
  { group: 'ai-agent', pattern: /_ai_/u },
  { group: 'error-retry-timeout', pattern: /error|fail|retry|timeout|exception|cancel|abort/u },
  { group: 'duration', pattern: /duration|latency|elapsed|seconds|millisecond|runtime|processing_time/u },
  { group: 'task', pattern: /task|module|status/u },
];

const isNoisyMetric = (metric: ParsedMetricSample | DisplayMetricRow) =>
  /^python_/u.test(metric.name) || /^process_/u.test(metric.name) || /_created$/u.test(metric.name) || /_bucket$/u.test(metric.name);

const detectGroup = (metric: ParsedMetricSample, service: BinarySecurityMetricsServiceDefinition): BinarySecurityMetricsGroup => {
  const fingerprint = metricGroupingFingerprint(metric);
  if (service.key === 'binary-security') {
    for (const rule of BINARY_SECURITY_GROUP_RULES) {
      if (rule.pattern.test(fingerprint)) return rule.group;
    }
    if (service.serviceSpecificKeywords.some((token) => fingerprint.includes(token))) return 'service-specific';
    return 'other';
  }
  if (isAiMetric(metric)) return 'ai-agent';
  if (/(token|cost|llm|model|prompt|judge|review)/u.test(fingerprint)) return 'llm-token-cost';
  if (/(error|fail|retry|timeout|exception|cancel|abort)/u.test(fingerprint)) return 'error-retry-timeout';
  if (/(queue|backlog|lease|pending|claimed)/u.test(fingerprint)) return 'queue';
  if (/(worker|scheduler|dispatcher|heartbeat|owner|runner|pod)/u.test(fingerprint)) return 'worker';
  if (/(duration|latency|elapsed|seconds|millisecond|runtime|processing_time)/u.test(fingerprint)) return 'duration';
  if (/(http|request|response|status|route|path|method)/u.test(fingerprint)) return 'http';
  if (service.serviceSpecificKeywords.some((token) => fingerprint.includes(token))) return 'service-specific';
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
  const suffixPenalty = isNoisyMetric(metric) ? -100 : 0;
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
    .filter((row) => !isNoisyMetric(row))
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
  const expectedRows = rows.filter((row) => row.name === 'secflow_binary_security_metrics_aggregate_role_expected');
  const coveredRows = rows.filter((row) => row.name === 'secflow_binary_security_metrics_aggregate_role_covered');
  const attemptedRows = rows.filter((row) => row.name === 'secflow_binary_security_metrics_aggregate_scrape_targets');
  const successRows = rows.filter((row) => row.name === 'secflow_binary_security_metrics_aggregate_scrape_success_targets');
  const useCanonicalRoleCoverage = expectedRows.length > 0 || coveredRows.length > 0;
  if (!useCanonicalRoleCoverage && !attemptedRows.length && !successRows.length) return null;
  const roles = new Set<string>();
  if (useCanonicalRoleCoverage) {
    expectedRows.forEach((row) => roles.add(String(row.labels.role || 'unknown')));
    coveredRows.forEach((row) => roles.add(String(row.labels.role || 'unknown')));
  } else {
    attemptedRows.forEach((row) => roles.add(String(row.labels.role || 'unknown')));
    successRows.forEach((row) => roles.add(String(row.labels.role || 'unknown')));
  }
  const attemptedByRole = Array.from(roles)
    .sort((left, right) => left.localeCompare(right, 'zh-CN'))
    .map((role) => ({
      role,
      attempted: useCanonicalRoleCoverage
        ? expectedRows.filter((row) => row.labels.role === role).reduce((sum, row) => sum + row.value, 0)
        : attemptedRows.filter((row) => row.labels.role === role).reduce((sum, row) => sum + row.value, 0),
      successful: useCanonicalRoleCoverage
        ? coveredRows.filter((row) => row.labels.role === role).reduce((sum, row) => sum + row.value, 0)
        : successRows.filter((row) => row.labels.role === role).reduce((sum, row) => sum + row.value, 0),
    }));
  const attempted = attemptedByRole.reduce((sum, item) => sum + item.attempted, 0);
  const successful = attemptedByRole.reduce((sum, item) => sum + item.successful, 0);
  const partialRow =
    rows.find((row) => row.name === 'secflow_binary_security_health_aggregate_partial') ||
    rows.find((row) => row.name === 'secflow_binary_security_metrics_aggregate_partial');
  return {
    attempted,
    successful,
    partial: Boolean((partialRow?.value || 0) > 0),
    attemptedByRole,
  };
};

const buildBinarySecurityObservabilityViewModel = (
  rows: DisplayMetricRow[],
  aggregateCoverage: AggregateCoverageSummary | null,
): BinarySecurityObservabilityViewModel => {
  const pendingDepth = firstMetricValue(rows, [
    { name: 'secflow_binary_security_health_pending_event_depth' },
    { name: 'secflow_binary_security_state_event_queue_depth', labels: { status: 'pending' } },
  ]);
  const retryableDepth = metricValueByName(rows, 'secflow_binary_security_state_event_queue_depth', { status: 'retryable' });
  const deadLetterDepth = firstMetricValue(rows, [
    { name: 'secflow_binary_security_health_dead_letter_depth' },
    { name: 'secflow_binary_security_state_event_queue_depth', labels: { status: 'dead_letter' } },
  ]);
  const oldestPendingAge = firstMetricValue(rows, [
    { name: 'secflow_binary_security_health_oldest_pending_age_seconds' },
    { name: 'secflow_binary_security_state_event_oldest_age_seconds', labels: { status: 'pending' } },
  ]);
  const reducerAvgDuration =
    firstMetricValue(rows, [{ name: 'secflow_binary_security_health_reducer_avg_duration_seconds' }]) ??
    histogramAverage(rows, 'secflow_binary_security_state_reducer_duration_seconds');
  const eventAvgLag =
    firstMetricValue(rows, [{ name: 'secflow_binary_security_health_event_avg_lag_seconds' }]) ??
    histogramAverage(rows, 'secflow_binary_security_state_event_lag_seconds');
  const lockWaitAvg =
    firstMetricValue(rows, [{ name: 'secflow_binary_security_health_lock_wait_avg_seconds' }]) ??
    histogramAverage(rows, 'secflow_binary_security_task_state_lock_wait_seconds');
  const lockHeldAvg =
    firstMetricValue(rows, [{ name: 'secflow_binary_security_health_lock_held_avg_seconds' }]) ??
    histogramAverage(rows, 'secflow_binary_security_task_state_lock_held_seconds');
  const activeLocks = sumMetric(rows, (row) => row.name === 'secflow_binary_security_task_state_lock_active');
  const deadLettersTotal = sumMetric(rows, (row) => row.name === 'secflow_binary_security_state_dead_letters_total');
  const reducerRunFailed = sumMetric(rows, (row) => row.name === 'secflow_binary_security_state_reducer_runs_total' && row.labels.result === 'failed');
  const reducerRunLockBusy = sumMetric(rows, (row) => row.name === 'secflow_binary_security_state_reducer_runs_total' && row.labels.result === 'lock_busy');
  const archiveQueued =
    firstMetricValue(rows, [{ name: 'secflow_binary_security_health_archive_queued_jobs' }]) ??
    sumMetric(rows, (row) => row.name === 'secflow_binary_security_archive_jobs_by_status' && row.labels.status === 'queued');
  const archiveRunning =
    firstMetricValue(rows, [{ name: 'secflow_binary_security_health_archive_running_jobs' }]) ??
    sumMetric(rows, (row) => row.name === 'secflow_binary_security_archive_jobs_by_status' && row.labels.status === 'running');
  const runningWorkers = sumMetric(rows, (row) => row.name === 'secflow_binary_security_active_workers' && row.labels.kind === 'running');
  const pendingWorkers = sumMetric(rows, (row) => row.name === 'secflow_binary_security_active_workers' && row.labels.kind === 'pending');
  const dispatchWorkers = sumMetric(rows, (row) => row.name === 'secflow_binary_security_active_workers' && row.labels.kind === 'dispatch');
  const reconcileCandidates = metricValueByName(rows, 'secflow_binary_security_task_readless_reconcile_candidates');
  const reconcileLastAttempted = metricValueByName(rows, 'secflow_binary_security_task_readless_reconcile_last_attempted');
  const reconcileLastChanged = metricValueByName(rows, 'secflow_binary_security_task_readless_reconcile_last_changed');
  const reconcileLastFailed = metricValueByName(rows, 'secflow_binary_security_task_readless_reconcile_last_failed');
  const reconcileLastRunAt = metricValueByName(rows, 'secflow_binary_security_task_readless_reconcile_last_run_timestamp');
  const reconcileChangedTotal = metricValueByName(rows, 'secflow_binary_security_task_readless_reconcile_tasks_total', { result: 'changed' });
  const reconcileFailedTotal = metricValueByName(rows, 'secflow_binary_security_task_readless_reconcile_tasks_total', { result: 'failed' });
  const listQueryTotal = sumMetric(rows, (row) => row.name === 'secflow_binary_security_task_list_queries_total');
  const listQueryErrors = sumMetric(rows, (row) => row.name === 'secflow_binary_security_task_list_queries_total' && row.labels.result === 'error');
  const listQueryAvgSeconds = histogramAverage(rows, 'secflow_binary_security_task_list_query_duration_seconds');
  const listQueryP50Seconds = histogramQuantile(rows, 'secflow_binary_security_task_list_query_duration_seconds', 0.5);
  const listQueryP95Seconds = histogramQuantile(rows, 'secflow_binary_security_task_list_query_duration_seconds', 0.95);
  const taskListPerfStageKeys = [
    'count',
    'page_items',
    'project_stats',
    'project_stage_aggregates',
    'queue_info',
    'serialize_items',
    'service_config',
    'build_base_query',
  ] as const;
  const taskListPerfStageLabel = (stage: string) => {
    const labels: Record<string, string> = {
      count: '总数统计',
      page_items: '分页数据查询',
      project_stats: '项目统计聚合',
      project_stage_aggregates: '阶段聚合',
      queue_info: '队列统计',
      serialize_items: '列表序列化',
      service_config: '服务配置读取',
      build_base_query: '基础查询构建',
    };
    return labels[stage] || stage;
  };
  const taskListStageRows = taskListPerfStageKeys
    .map((stage) => {
      const p95Seconds = histogramQuantile(rows, 'secflow_binary_security_task_list_query_stage_duration_seconds', 0.95, { stage });
      const avgSeconds = histogramAverage(rows, 'secflow_binary_security_task_list_query_stage_duration_seconds', { stage });
      const count = metricValueByName(rows, 'secflow_binary_security_task_list_query_stage_duration_seconds_count', { stage });
      const severity = Math.max(p95Seconds || 0, avgSeconds || 0);
      const tone =
        severity > 1
          ? 'text-rose-700'
          : severity > 0.3
            ? 'text-amber-700'
            : severity > 0
              ? 'text-slate-700'
              : 'text-slate-500';
      return { stage, p95Seconds, avgSeconds, count, tone };
    })
    .filter((item) => item.count != null || item.avgSeconds != null || item.p95Seconds != null)
    .sort((left, right) => (right.p95Seconds || 0) - (left.p95Seconds || 0));
  const alerts: Array<{ label: string; text: string; tone: string }> = [];
  const taskListAlerts: Array<{ label: string; text: string; tone: string }> = [];

  if (aggregateCoverage?.partial) {
    alerts.push({
      label: '聚合不完整',
      text: `当前仅抓取到 ${formatNumber(aggregateCoverage.successful)}/${formatNumber(aggregateCoverage.attempted)} 个实例，聚合数值可能偏低。`,
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
    });
  }
  if ((pendingDepth || 0) > 0 && (oldestPendingAge || 0) > 60) {
    alerts.push({
      label: '状态事件积压',
      text: `pending=${formatNumber(pendingDepth)}，最老事件年龄 ${formatSeconds(oldestPendingAge)}，状态收口已经明显滞后。`,
      tone: 'border-rose-200 bg-rose-50 text-rose-800',
    });
  }
  if ((deadLetterDepth || 0) > 0 || deadLettersTotal > 0) {
    alerts.push({
      label: '存在死信',
      text: `当前死信队列 ${formatNumber(deadLetterDepth)}，累计死信 ${formatNumber(deadLettersTotal)}，需要优先排查 reducer 应用失败原因。`,
      tone: 'border-rose-200 bg-rose-50 text-rose-800',
    });
  }
  if ((lockWaitAvg || 0) > 0.3 || activeLocks > 0) {
    alerts.push({
      label: '锁竞争偏高',
      text: `锁等待均值 ${formatSeconds(lockWaitAvg)}，活动锁 ${formatNumber(activeLocks)}，可能导致父任务收口变慢。`,
      tone: 'border-orange-200 bg-orange-50 text-orange-800',
    });
  }
  if ((archiveQueued || 0) > 0 || (archiveRunning || 0) > 0) {
    alerts.push({
      label: '归档仍在处理中',
      text: `archive queued=${formatNumber(archiveQueued)}，running=${formatNumber(archiveRunning)}，终态收口仍可能继续延迟。`,
      tone: 'border-sky-200 bg-sky-50 text-sky-800',
    });
  }
  if ((reconcileLastFailed || 0) > 0) {
    alerts.push({
      label: '后台状态同步失败',
      text: `最近一轮后台状态同步失败 ${formatNumber(reconcileLastFailed)} 个任务。列表查询已不再触发同步，请检查后台循环与下游状态拉取。`,
      tone: 'border-rose-200 bg-rose-50 text-rose-800',
    });
  }
  if (!alerts.length) {
    alerts.push({
      label: '编排侧整体平稳',
      text: '当前聚合结果没有显示明显的状态事件积压、死信或锁竞争放大信号，可以继续结合下方原始指标排查细节。',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    });
  }
  const slowestTaskListStage = taskListStageRows[0];
  if ((listQueryP95Seconds || 0) > 1) {
    taskListAlerts.push({
      label: '任务列表长尾延迟偏高',
      text: `当前列表查询 P95 ${formatSeconds(listQueryP95Seconds)}，用户在任务列表页会明显感知等待。`,
      tone: 'border-rose-200 bg-rose-50 text-rose-800',
    });
  }
  if ((listQueryErrors || 0) > 0) {
    taskListAlerts.push({
      label: '任务列表查询存在错误',
      text: `累计错误 ${formatNumber(listQueryErrors)} / 总请求 ${formatNumber(listQueryTotal)}，需要排查读路径稳定性或聚合依赖异常。`,
      tone: 'border-rose-200 bg-rose-50 text-rose-800',
    });
  }
  if (slowestTaskListStage && (slowestTaskListStage.p95Seconds || 0) > 0.3) {
    taskListAlerts.push({
      label: `最慢分段：${taskListPerfStageLabel(slowestTaskListStage.stage)}`,
      text: `P95 ${formatSeconds(slowestTaskListStage.p95Seconds)}，均值 ${formatSeconds(slowestTaskListStage.avgSeconds)}。`,
      tone: (slowestTaskListStage.p95Seconds || 0) > 1 ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-amber-200 bg-amber-50 text-amber-800',
    });
  }
  if (!taskListAlerts.length) {
    taskListAlerts.push({
      label: '任务列表读路径平稳',
      text: '当前没有明显的任务列表查询慢点或错误积累，若页面仍慢，优先继续排查浏览器渲染或上游网络链路。',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    });
  }

  return {
    overviewCards: [
      {
        label: '聚合完整性',
        value: aggregateCoverage?.partial ? '部分聚合' : '完整聚合',
        hint: aggregateCoverage ? `${formatNumber(aggregateCoverage.successful)}/${formatNumber(aggregateCoverage.attempted)} 实例可用` : '当前无聚合覆盖元数据',
        tone: aggregateCoverage?.partial ? 'text-amber-700' : 'text-emerald-700',
        icon: <ServerCog size={16} />,
      },
      {
        label: '待处理事件数',
        value: formatNumber(pendingDepth),
        hint: oldestPendingAge == null ? '未采集最老事件年龄' : `最老 ${formatSeconds(oldestPendingAge)}`,
        tone: (pendingDepth || 0) > 0 ? 'text-amber-700' : 'text-emerald-700',
        icon: <Database size={16} />,
      },
      {
        label: '死信队列深度',
        value: formatNumber(deadLetterDepth),
        hint: `累计死信 ${formatNumber(deadLettersTotal)}`,
        tone: (deadLetterDepth || 0) > 0 || deadLettersTotal > 0 ? 'text-rose-700' : 'text-emerald-700',
        icon: <ShieldAlert size={16} />,
      },
      {
        label: '锁等待均值',
        value: formatSeconds(lockWaitAvg),
        hint: `锁持有均值 ${formatSeconds(lockHeldAvg)}`,
        tone: (lockWaitAvg || 0) > 0.3 ? 'text-orange-700' : 'text-slate-900',
        icon: <TimerReset size={16} />,
      },
      {
        label: 'Reducer 平均耗时',
        value: formatSeconds(reducerAvgDuration),
        hint: `事件平均收口延迟 ${formatSeconds(eventAvgLag)}`,
        tone: (reducerAvgDuration || 0) > 1 ? 'text-amber-700' : 'text-slate-900',
        icon: <Activity size={16} />,
      },
      {
        label: '锁忙 / 失败',
        value: `${formatNumber(reducerRunLockBusy)} / ${formatNumber(reducerRunFailed)}`,
        hint: 'reducer run 结果',
        tone: reducerRunFailed > 0 ? 'text-rose-700' : reducerRunLockBusy > 0 ? 'text-amber-700' : 'text-emerald-700',
        icon: <RefreshCw size={16} />,
      },
      {
        label: '归档处理队列',
        value: `${formatNumber(archiveQueued)} / ${formatNumber(archiveRunning)}`,
        hint: 'queued / running',
        tone: archiveQueued > 0 || archiveRunning > 0 ? 'text-sky-700' : 'text-slate-900',
        icon: <GitBranch size={16} />,
      },
      {
        label: '活跃工作单元',
        value: `${formatNumber(runningWorkers)} / ${formatNumber(dispatchWorkers + pendingWorkers)}`,
        hint: 'running / dispatch+pending',
        tone: runningWorkers > 0 ? 'text-teal-700' : 'text-slate-900',
        icon: <TrendingUp size={16} />,
      },
      {
        label: '同步候选任务',
        value: formatNumber(reconcileCandidates),
        hint: `最近运行 ${formatTime(reconcileLastRunAt)}`,
        tone: (reconcileCandidates || 0) > 0 ? 'text-cyan-700' : 'text-slate-900',
        icon: <RefreshCw size={16} />,
      },
    ],
    alerts,
    pipelineSummary: [
      { label: 'running workers', value: runningWorkers, tone: 'text-teal-700' },
      { label: 'dispatch+pending workers', value: dispatchWorkers + pendingWorkers, tone: 'text-indigo-700' },
      { label: 'archive queued', value: archiveQueued, tone: archiveQueued > 0 ? 'text-sky-700' : 'text-slate-600' },
      { label: 'archive running', value: archiveRunning, tone: archiveRunning > 0 ? 'text-sky-700' : 'text-slate-600' },
      { label: 'retryable events', value: retryableDepth, tone: (retryableDepth || 0) > 0 ? 'text-amber-700' : 'text-slate-600' },
      { label: 'dead letters total', value: deadLettersTotal, tone: deadLettersTotal > 0 ? 'text-rose-700' : 'text-slate-600' },
    ],
    reducerSummary: [
      { label: 'oldest pending age', value: oldestPendingAge, tone: (oldestPendingAge || 0) > 60 ? 'text-rose-700' : 'text-slate-600' },
      { label: 'event avg lag', value: eventAvgLag, tone: (eventAvgLag || 0) > 30 ? 'text-rose-700' : 'text-slate-600' },
      { label: 'reducer avg duration', value: reducerAvgDuration, tone: (reducerAvgDuration || 0) > 1 ? 'text-amber-700' : 'text-slate-600' },
      { label: 'lock wait avg', value: lockWaitAvg, tone: (lockWaitAvg || 0) > 0.3 ? 'text-orange-700' : 'text-slate-600' },
      { label: 'lock held avg', value: lockHeldAvg, tone: (lockHeldAvg || 0) > 1.5 ? 'text-rose-700' : 'text-slate-600' },
      { label: 'active locks', value: activeLocks, tone: activeLocks > 0 ? 'text-orange-700' : 'text-slate-600' },
    ],
    syncSummary: [
      { label: 'last attempted', value: reconcileLastAttempted, tone: 'text-slate-600' },
      { label: 'last changed', value: reconcileLastChanged, tone: (reconcileLastChanged || 0) > 0 ? 'text-cyan-700' : 'text-slate-600' },
      { label: 'last failed', value: reconcileLastFailed, tone: (reconcileLastFailed || 0) > 0 ? 'text-rose-700' : 'text-emerald-700' },
      { label: 'changed total', value: reconcileChangedTotal, tone: (reconcileChangedTotal || 0) > 0 ? 'text-cyan-700' : 'text-slate-600' },
      { label: 'failed total', value: reconcileFailedTotal, tone: (reconcileFailedTotal || 0) > 0 ? 'text-rose-700' : 'text-emerald-700' },
    ],
    taskListPerformance: {
      topCards: [
        { label: '列表总请求', value: formatNumber(listQueryTotal), hint: 'task_list_queries_total', tone: 'text-slate-900' },
        { label: '错误请求', value: formatNumber(listQueryErrors), hint: 'result=error', tone: listQueryErrors > 0 ? 'text-rose-700' : 'text-emerald-700' },
        { label: '平均耗时', value: formatSeconds(listQueryAvgSeconds), hint: 'overall avg', tone: (listQueryAvgSeconds || 0) > 0.5 ? 'text-amber-700' : 'text-slate-900' },
        { label: 'P50', value: formatSeconds(listQueryP50Seconds), hint: 'overall p50', tone: (listQueryP50Seconds || 0) > 0.3 ? 'text-amber-700' : 'text-slate-900' },
        { label: 'P95', value: formatSeconds(listQueryP95Seconds), hint: 'overall p95', tone: (listQueryP95Seconds || 0) > 1 ? 'text-rose-700' : (listQueryP95Seconds || 0) > 0.5 ? 'text-amber-700' : 'text-emerald-700' },
      ],
      stageRows: taskListStageRows.map((item) => ({ ...item, stage: taskListPerfStageLabel(item.stage) })),
      alerts: taskListAlerts,
    },
    groupCounts: (Object.keys(GROUP_LABELS) as BinarySecurityMetricsGroup[]).map((group) => ({
      group,
      count: rows.filter((row) => row.group === group).length,
    })),
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

const histogramQuantile = (
  rows: DisplayMetricRow[],
  familyName: string,
  quantile: number,
  labels: Record<string, string> = {},
) => {
  const matchesLabels = (row: DisplayMetricRow) => Object.entries(labels).every(([key, value]) => row.labels[key] === value);
  const target = Math.min(1, Math.max(0, quantile));
  const buckets = rows
    .filter((row) => row.familyName === familyName && row.name.endsWith('_bucket') && matchesLabels(row))
    .map((row) => ({
      le: row.labels.le === '+Inf' ? Number.POSITIVE_INFINITY : Number(row.labels.le),
      value: row.value,
    }))
    .filter((item) => Number.isFinite(item.le) || item.le === Number.POSITIVE_INFINITY)
    .sort((left, right) => left.le - right.le);
  if (!buckets.length) return null;
  const total = buckets[buckets.length - 1]?.value ?? 0;
  if (!(total > 0)) return null;
  const wanted = total * target;
  for (const bucket of buckets) {
    if (bucket.value >= wanted) {
      return Number.isFinite(bucket.le) ? bucket.le : null;
    }
  }
  return null;
};

const metricValueByName = (rows: DisplayMetricRow[], name: string, labels: Record<string, string> = {}) => {
  const matches = rows.filter((row) => row.name === name && Object.entries(labels).every(([key, value]) => row.labels[key] === value));
  if (!matches.length) return null;
  return matches.reduce((total, row) => total + row.value, 0);
};

const firstMetricValue = (rows: DisplayMetricRow[], candidates: Array<{ name: string; labels?: Record<string, string> }>) => {
  for (const candidate of candidates) {
    const value = metricValueByName(rows, candidate.name, candidate.labels || {});
    if (value != null) return value;
  }
  return null;
};

const averageFromSummary = (rows: DisplayMetricRow[], familyName: string, labels: Record<string, string> = {}) => {
  const matchesLabels = (row: DisplayMetricRow) => Object.entries(labels).every(([key, value]) => row.labels[key] === value);
  const sum = rows
    .filter((row) => row.familyName === familyName && row.name.endsWith('_sum') && matchesLabels(row))
    .reduce((total, row) => total + row.value, 0);
  const count = rows
    .filter((row) => row.familyName === familyName && row.name.endsWith('_count') && matchesLabels(row))
    .reduce((total, row) => total + row.value, 0);
  return count > 0 ? sum / count : null;
};

const buildSystemAnalysisViewModel = (rows: DisplayMetricRow[]): SystemAnalysisViewModel => {
  const running = valueOrZero(metricValueByName(rows, 'secflow_sa_tasks_running'));
  const pending = valueOrZero(metricValueByName(rows, 'secflow_sa_tasks_pending'));
  const finished = valueOrZero(metricValueByName(rows, 'secflow_sa_tasks_finished'));
  const queueWaitAvg = averageFromSummary(rows, 'secflow_sa_queue_wait_seconds');
  const executionAvg = averageFromSummary(rows, 'secflow_sa_execution_seconds');
  const turnaroundAvg = averageFromSummary(rows, 'secflow_sa_turnaround_seconds');
  const workerCapacity = metricValueByName(rows, 'secflow_sa_worker_runtime', { kind: 'capacity' });
  const workerRunning = metricValueByName(rows, 'secflow_sa_worker_runtime', { kind: 'running' });
  const workerAvailableSlots = metricValueByName(rows, 'secflow_sa_worker_runtime', { kind: 'available_slots' });
  const workerRuntimeUtilization = metricValueByName(rows, 'secflow_sa_worker_utilization_ratio');
  const workers = valueOrZero(workerCapacity ?? metricValueByName(rows, 'secflow_sa_workers'));
  const judges = valueOrZero(metricValueByName(rows, 'secflow_sa_judges'));
  const sessions = valueOrZero(metricValueByName(rows, 'secflow_sa_sessions'));
  const retryTotal = valueOrZero(metricValueByName(rows, 'secflow_sa_retry_total'));
  const timeoutTotal = valueOrZero(metricValueByName(rows, 'secflow_sa_timeout_total'));
  const cancelTotal = valueOrZero(metricValueByName(rows, 'secflow_sa_cancel_total'));
  const tokenInputTotal = valueOrZero(metricValueByName(rows, 'secflow_sa_token_input_total'));
  const tokenOutputTotal = valueOrZero(metricValueByName(rows, 'secflow_sa_token_output_total'));
  const tokenCostTotal = metricValueByName(rows, 'secflow_sa_token_cost_total');
  const tokenInputRunning = valueOrZero(metricValueByName(rows, 'secflow_sa_token_input_running'));
  const tokenOutputRunning = valueOrZero(metricValueByName(rows, 'secflow_sa_token_output_running'));
  const tokenCostRunning = metricValueByName(rows, 'secflow_sa_token_cost_running');
  const moduleTotal = valueOrZero(metricValueByName(rows, 'secflow_sa_module_total'));
  const moduleCompletedTotal = valueOrZero(metricValueByName(rows, 'secflow_sa_module_completed_total'));
  const moduleFailedTotal = valueOrZero(metricValueByName(rows, 'secflow_sa_module_failed_total'));
  const checkpointAnyTasks = valueOrZero(metricValueByName(rows, 'secflow_sa_checkpoint_tasks', { state: 'any' }));
  const checkpointPartialTasks = valueOrZero(metricValueByName(rows, 'secflow_sa_checkpoint_tasks', { state: 'partial' }));
  const checkpointOverallDoneTasks = valueOrZero(metricValueByName(rows, 'secflow_sa_checkpoint_tasks', { state: 'overall_done' }));
  const firstRoundPassRate = averageFromSummary(rows, 'secflow_sa_effectiveness_first_round_pass_rate');
  const finalModulePassRate = averageFromSummary(rows, 'secflow_sa_effectiveness_final_module_pass_rate');
  const multiRoundPassRate = averageFromSummary(rows, 'secflow_sa_effectiveness_multi_round_pass_rate');
  const reflectionRounds = valueOrZero(metricValueByName(rows, 'secflow_sa_effectiveness_reflection_round_total'));
  const reclassifyTotal = valueOrZero(metricValueByName(rows, 'secflow_sa_effectiveness_reclassify_total'));
  const checkpointStageRows = rows
    .filter((row) => row.name === 'secflow_sa_checkpoint_stage_done_total')
    .sort((left, right) => left.labels.stage?.localeCompare(right.labels.stage || '', 'zh-CN') || 0);
  const checkpointS2Modules = valueOrZero(metricValueByName(rows, 'secflow_sa_checkpoint_module_done_total', { stage: 's2' }));
  const checkpointS3Modules = valueOrZero(metricValueByName(rows, 'secflow_sa_checkpoint_module_done_total', { stage: 's3' }));

  const failureCategories = rows
    .filter((row) => row.name === 'secflow_sa_failure_category_total')
    .sort((left, right) => right.value - left.value)
    .map((row) => ({
      label: row.labels.category || 'unknown',
      value: row.value,
      tone: row.labels.category === 'timeout' ? 'text-amber-700' : 'text-rose-700',
    }));

  const stageNames = Array.from(new Set(rows.filter((row) => row.name === 'secflow_sa_stage_rounds').map((row) => row.labels.stage || 'unknown'))).sort((left, right) =>
    left.localeCompare(right, 'zh-CN'),
  );
  const terminalStatuses = new Set(['passed', 'success', 'failed', 'error', 'cancelled', 'timeout']);
  const stageRows = stageNames.map((stage) => {
    const stageEntries = rows.filter(
      (row) =>
        [
          'secflow_sa_stage_rounds',
          'secflow_sa_stage_records_total',
          'secflow_sa_stage_duration_seconds',
          'secflow_sa_stage_token_total',
          'secflow_sa_stage_cost_total',
          'secflow_sa_stage_vote_pass_total',
          'secflow_sa_stage_vote_fail_total',
          'secflow_sa_stage_judge_score_sum',
          'secflow_sa_stage_judge_score_count',
          'secflow_sa_stage_review_pass_rate_sum',
          'secflow_sa_stage_review_pass_rate_count',
          'secflow_sa_stage_round_index_sum',
          'secflow_sa_stage_round_index_count',
        ].includes(row.name) && row.labels.stage === stage,
    );
    const statusValues = Array.from(new Set(stageEntries.map((row) => row.labels.status || 'unknown')));
    const totalRuns = statusValues.reduce((sum, status) => {
      const explicit = metricValueByName(rows, 'secflow_sa_stage_records_total', { stage, status });
      return sum + valueOrZero(explicit ?? metricValueByName(rows, 'secflow_sa_stage_rounds', { stage, status }));
    }, 0);
    const successRuns = statusValues.reduce((sum, status) => {
      const explicit = metricValueByName(rows, 'secflow_sa_stage_vote_pass_total', { stage, status });
      if (explicit != null) return sum + valueOrZero(explicit);
      return sum + (['passed', 'success', 'completed'].includes(status) ? valueOrZero(metricValueByName(rows, 'secflow_sa_stage_rounds', { stage, status })) : 0);
    }, 0);
    const failedRuns = statusValues.reduce((sum, status) => {
      const explicit = metricValueByName(rows, 'secflow_sa_stage_vote_fail_total', { stage, status });
      if (explicit != null) return sum + valueOrZero(explicit);
      return sum + (['failed', 'error', 'timeout', 'cancelled'].includes(status) ? valueOrZero(metricValueByName(rows, 'secflow_sa_stage_rounds', { stage, status })) : 0);
    }, 0);
    const runningRuns = statusValues
      .filter((status) => !terminalStatuses.has(status))
      .reduce((sum, status) => sum + valueOrZero(metricValueByName(rows, 'secflow_sa_stage_records_total', { stage, status }) ?? metricValueByName(rows, 'secflow_sa_stage_rounds', { stage, status })), 0);
    const totalDuration = statusValues.reduce((sum, status) => sum + valueOrZero(metricValueByName(rows, 'secflow_sa_stage_duration_seconds', { stage, status })), 0);
    const totalTokens = statusValues.reduce((sum, status) => sum + valueOrZero(metricValueByName(rows, 'secflow_sa_stage_token_total', { stage, status })), 0);
    const totalCost = statusValues.reduce((sum, status) => sum + valueOrZero(metricValueByName(rows, 'secflow_sa_stage_cost_total', { stage, status })), 0);
    const scoreSum = statusValues.reduce((sum, status) => sum + valueOrZero(metricValueByName(rows, 'secflow_sa_stage_judge_score_sum', { stage, status })), 0);
    const scoreCount = statusValues.reduce((sum, status) => sum + valueOrZero(metricValueByName(rows, 'secflow_sa_stage_judge_score_count', { stage, status })), 0);
    const roundIndexSum = statusValues.reduce((sum, status) => sum + valueOrZero(metricValueByName(rows, 'secflow_sa_stage_round_index_sum', { stage, status })), 0);
    const roundIndexCount = statusValues.reduce((sum, status) => sum + valueOrZero(metricValueByName(rows, 'secflow_sa_stage_round_index_count', { stage, status })), 0);
    const avgDurationSeconds = totalRuns > 0 ? totalDuration / totalRuns : null;
    const avgTokens = totalRuns > 0 ? totalTokens / totalRuns : null;
    const avgCost = totalRuns > 0 ? totalCost / totalRuns : null;
    const avgRounds = roundIndexCount > 0 ? roundIndexSum / roundIndexCount : totalRuns > 0 ? totalRuns / Math.max(1, successRuns + failedRuns + runningRuns) : null;
    const avgJudgeScore = scoreCount > 0 ? scoreSum / scoreCount : null;
    return {
      stage,
      totalRuns,
      successRuns,
      failedRuns,
      runningRuns,
      avgDurationSeconds,
      avgScore: avgJudgeScore,
      avgTokens,
      avgCost,
      avgRounds,
      successRate: totalRuns > 0 ? (successRuns / totalRuns) * 100 : null,
    };
  });

  const activeUnitTotal = workers + judges;
  const sessionPerUnit = activeUnitTotal > 0 ? sessions / activeUnitTotal : null;
  const pendingPerWorker = workers > 0 ? pending / workers : null;
  const timeoutRate = finished > 0 ? (timeoutTotal / finished) * 100 : null;
  const retryPressure = finished > 0 ? retryTotal / finished : null;
  const queuePressure = pending > 0 && workers > 0 && pending > workers;
  const costPerFinished = finished > 0 && tokenCostTotal != null ? tokenCostTotal / finished : null;
  const tokenPerFinished = finished > 0 ? (tokenInputTotal + tokenOutputTotal) / finished : null;
  const checkpointCoverage = checkpointAnyTasks > 0 ? (checkpointPartialTasks / checkpointAnyTasks) * 100 : null;
  const effectiveRunning = valueOrZero(workerRunning ?? running);
  const effectiveAvailableSlots = valueOrZero(workerAvailableSlots ?? (workers > effectiveRunning ? workers - effectiveRunning : 0));
  const workerUtilization = workerRuntimeUtilization != null ? workerRuntimeUtilization * 100 : workers > 0 ? (effectiveRunning / workers) * 100 : null;
  const concurrencySlack = effectiveAvailableSlots;
  const resumedTaskCompletionRate = checkpointAnyTasks > 0 ? (checkpointOverallDoneTasks / checkpointAnyTasks) * 100 : null;
  const stageCheckpointCoverage = checkpointStageRows.length
    ? checkpointStageRows.reduce((sum, row) => sum + row.value, 0) / checkpointStageRows.length
    : null;
  const stagePressureRows = stageRows
    .map((row) => {
      const durationFactor = Math.min(10, (row.avgDurationSeconds || 0) / 60);
      const runningFactor = row.runningRuns * 2;
      const successPenalty = row.successRate == null ? 0 : Math.max(0, (100 - row.successRate) / 10);
      const pressureScore = Number((durationFactor + runningFactor + successPenalty).toFixed(1));
      const tone = pressureScore >= 8 ? 'text-rose-700' : pressureScore >= 4 ? 'text-amber-700' : 'text-emerald-700';
      return {
        stage: row.stage,
        pressureScore,
        runningRuns: row.runningRuns,
        avgDurationSeconds: row.avgDurationSeconds,
        successRate: row.successRate,
        tone,
      };
    })
    .sort((left, right) => right.pressureScore - left.pressureScore)
    .slice(0, 5);
  const stagePressureLeader = stagePressureRows[0] || null;
  const hotStageCount = stagePressureRows.filter((row) => row.pressureScore >= 4).length;

  const riskAlerts: Array<{ label: string; text: string; tone: string }> = [];
  if (queuePressure) {
    riskAlerts.push({
      label: '排队堆积',
      text: `pending=${formatNumber(pending)} 已高于 workers=${formatNumber(workers)}，当前存在明显的排队压力。`,
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
    });
  }
  if ((timeoutRate || 0) >= 10) {
    riskAlerts.push({
      label: '超时偏高',
      text: `timeout=${formatNumber(timeoutTotal)}，约占已结束任务的 ${formatNumber(timeoutRate, 1)}%。`,
      tone: 'border-rose-200 bg-rose-50 text-rose-800',
    });
  }
  if ((finalModulePassRate || 0) > 0 && (finalModulePassRate || 0) < 0.8) {
    riskAlerts.push({
      label: '最终通过率偏低',
      text: `final module pass rate 仅 ${formatNumber((finalModulePassRate || 0) * 100, 1)}%，需要重点观察评审闭环和重分类效果。`,
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
    });
  }
  if (!riskAlerts.length) {
    riskAlerts.push({
      label: '整体平稳',
      text: '当前未发现明显的排队或超时放大信号，可以继续通过阶段健康表观察结构性问题。',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    });
  }

  return {
    compactSummary: [
      { label: '排队/运行', value: `${formatNumber(pending)}/${formatNumber(running)}`, tone: queuePressure ? 'text-amber-700' : 'text-slate-700' },
      { label: '均排/均执', value: `${formatSeconds(queueWaitAvg)}/${formatSeconds(executionAvg)}`, tone: (queueWaitAvg || 0) > 300 || (executionAvg || 0) > 1800 ? 'text-amber-700' : 'text-slate-700' },
      { label: '首过/终过', value: `${firstRoundPassRate == null ? '-' : `${formatNumber(firstRoundPassRate * 100, 1)}%`}/${finalModulePassRate == null ? '-' : `${formatNumber(finalModulePassRate * 100, 1)}%`}`, tone: (finalModulePassRate || 0) < 0.8 ? 'text-amber-700' : 'text-emerald-700' },
      { label: '重试/超时', value: `${formatNumber(retryTotal)}/${formatNumber(timeoutTotal)}`, tone: timeoutTotal > 0 ? 'text-rose-700' : retryTotal > 0 ? 'text-amber-700' : 'text-slate-700' },
      { label: '并发命中', value: workerUtilization == null ? '-' : `${formatNumber(workerUtilization, 1)}%`, tone: (workerUtilization || 0) < 60 && effectiveRunning > 0 ? 'text-amber-700' : 'text-indigo-700' },
      { label: '续跑完成', value: resumedTaskCompletionRate == null ? '-' : `${formatNumber(resumedTaskCompletionRate, 1)}%`, tone: checkpointAnyTasks > 0 ? 'text-sky-700' : 'text-slate-500' },
    ],
    overviewCards: [
      { label: '运行/排队', value: `${formatNumber(running)} / ${formatNumber(pending)}`, hint: `finished ${formatNumber(finished)}`, tone: running > 0 ? 'text-teal-700' : 'text-slate-900' },
      { label: '平均排队', value: formatSeconds(queueWaitAvg), hint: 'queue_wait_seconds', tone: (queueWaitAvg || 0) > 300 ? 'text-amber-700' : 'text-slate-900' },
      { label: '平均执行', value: formatSeconds(executionAvg), hint: 'execution_seconds', tone: (executionAvg || 0) > 1800 ? 'text-amber-700' : 'text-slate-900' },
      { label: '平均周转', value: formatSeconds(turnaroundAvg), hint: 'turnaround_seconds', tone: (turnaroundAvg || 0) > 2400 ? 'text-rose-700' : 'text-slate-900' },
      { label: 'Worker/Judge', value: `${formatNumber(workers)} / ${formatNumber(judges)}`, hint: `running ${formatNumber(effectiveRunning)} · sessions ${formatNumber(sessions)}`, tone: 'text-indigo-700' },
      { label: '模块完成', value: moduleTotal > 0 ? `${formatNumber(moduleCompletedTotal)} / ${formatNumber(moduleTotal)}` : '-', hint: `failed ${formatNumber(moduleFailedTotal)}`, tone: moduleFailedTotal > 0 ? 'text-amber-700' : 'text-emerald-700' },
      { label: '完成产能', value: tokenPerFinished == null ? '-' : `${formatNumber(tokenPerFinished, 0)} tok/task`, hint: '平均每个完成任务 token', tone: 'text-violet-700' },
    ],
    governanceCards: [
      { label: '待处理/Worker', value: pendingPerWorker == null ? '-' : formatNumber(pendingPerWorker, 2), hint: '背压强度', tone: (pendingPerWorker || 0) > 1 ? 'text-amber-700' : 'text-slate-900' },
      { label: '可用槽位', value: formatNumber(effectiveAvailableSlots), hint: `capacity ${formatNumber(workers)} - running ${formatNumber(effectiveRunning)}`, tone: effectiveAvailableSlots > 0 ? 'text-emerald-700' : 'text-amber-700' },
      { label: 'Session/活跃单元', value: sessionPerUnit == null ? '-' : formatNumber(sessionPerUnit, 2), hint: 'worker+judge 承载会话密度', tone: (sessionPerUnit || 0) > 3 ? 'text-indigo-700' : 'text-slate-900' },
      { label: '重试压力', value: retryPressure == null ? '-' : formatNumber(retryPressure, 2), hint: 'retry per finished task', tone: (retryPressure || 0) > 1 ? 'text-amber-700' : 'text-slate-900' },
      { label: 'Checkpoint 续跑面', value: checkpointCoverage == null ? '-' : `${formatNumber(checkpointCoverage, 1)}%`, hint: `${formatNumber(checkpointPartialTasks)}/${formatNumber(checkpointAnyTasks)} partial`, tone: (checkpointCoverage || 0) > 0 ? 'text-sky-700' : 'text-slate-900' },
      { label: 'Checkpoint 完整体', value: `${formatNumber(checkpointOverallDoneTasks)}`, hint: 'overall_done tasks', tone: checkpointOverallDoneTasks > 0 ? 'text-slate-900' : 'text-emerald-700' },
      { label: '取消任务', value: formatNumber(cancelTotal), hint: 'cancel_total', tone: cancelTotal > 0 ? 'text-slate-900' : 'text-emerald-700' },
    ],
    qualityCards: [
      { label: '超时率', value: timeoutRate == null ? '-' : `${formatNumber(timeoutRate, 1)}%`, hint: `timeout ${formatNumber(timeoutTotal)}`, tone: (timeoutRate || 0) > 10 ? 'text-rose-700' : 'text-emerald-700' },
      { label: '首轮通过率', value: firstRoundPassRate == null ? '-' : `${formatNumber(firstRoundPassRate * 100, 1)}%`, hint: 'effectiveness.first_round_pass_rate', tone: (firstRoundPassRate || 0) < 0.7 ? 'text-amber-700' : 'text-emerald-700' },
      { label: '最终通过率', value: finalModulePassRate == null ? '-' : `${formatNumber(finalModulePassRate * 100, 1)}%`, hint: 'effectiveness.final_module_pass_rate', tone: (finalModulePassRate || 0) < 0.8 ? 'text-amber-700' : 'text-emerald-700' },
      { label: '多轮兜底率', value: multiRoundPassRate == null ? '-' : `${formatNumber(multiRoundPassRate * 100, 1)}%`, hint: 'effectiveness.multi_round_pass_rate', tone: (multiRoundPassRate || 0) > 0 ? 'text-indigo-700' : 'text-slate-900' },
      { label: '反思/重分类', value: `${formatNumber(reflectionRounds)} / ${formatNumber(reclassifyTotal)}`, hint: 'reflection / reclassify', tone: reflectionRounds > 0 || reclassifyTotal > 0 ? 'text-slate-900' : 'text-emerald-700' },
    ],
    costCards: [
      { label: '输入 Token', value: formatNumber(tokenInputTotal), hint: `running ${formatNumber(tokenInputRunning)}`, tone: 'text-violet-700' },
      { label: '输出 Token', value: formatNumber(tokenOutputTotal), hint: `running ${formatNumber(tokenOutputRunning)}`, tone: 'text-violet-700' },
      { label: '累计成本', value: formatMetricValue(tokenCostTotal ?? Number.NaN), hint: `running ${formatMetricValue(tokenCostRunning ?? Number.NaN)}`, tone: 'text-fuchsia-700' },
      { label: '单任务成本', value: costPerFinished == null ? '-' : formatMetricValue(costPerFinished), hint: 'cost per finished task', tone: 'text-fuchsia-700' },
    ],
    stageRows,
    failureCategories,
    riskAlerts,
    checkpointCards: [
      {
        label: '续跑任务覆盖',
        value: checkpointAnyTasks > 0 ? `${formatNumber(checkpointAnyTasks)}` : '-',
        hint: `partial ${formatNumber(checkpointPartialTasks)} / done ${formatNumber(checkpointOverallDoneTasks)}`,
        tone: checkpointAnyTasks > 0 ? 'text-sky-700' : 'text-slate-500',
      },
      {
        label: '续跑完成率',
        value: resumedTaskCompletionRate == null ? '-' : `${formatNumber(resumedTaskCompletionRate, 1)}%`,
        hint: 'overall_done / any checkpoint task',
        tone: (resumedTaskCompletionRate || 0) >= 80 ? 'text-emerald-700' : checkpointAnyTasks > 0 ? 'text-amber-700' : 'text-slate-500',
      },
      {
        label: '阶段 checkpoint 均值',
        value: stageCheckpointCoverage == null ? '-' : formatNumber(stageCheckpointCoverage, 1),
        hint: '平均每个 checkpoint stage 被命中次数',
        tone: stageCheckpointCoverage != null ? 'text-slate-900' : 'text-slate-500',
      },
      {
        label: '模块恢复面',
        value: `${formatNumber(checkpointS2Modules)} / ${formatNumber(checkpointS3Modules)}`,
        hint: 's2 / s3 completed modules',
        tone: checkpointS2Modules > 0 || checkpointS3Modules > 0 ? 'text-sky-700' : 'text-slate-500',
      },
    ],
    checkpointChart: [
      { name: 'partial', value: checkpointPartialTasks, fill: '#0ea5e9' },
      { name: 'overall_done', value: checkpointOverallDoneTasks, fill: '#10b981' },
      { name: 's2 modules', value: checkpointS2Modules, fill: '#6366f1' },
      { name: 's3 modules', value: checkpointS3Modules, fill: '#7c3aed' },
    ],
    concurrencyChart: [
      { name: 'running', value: effectiveRunning, fill: '#14b8a6' },
      { name: 'capacity', value: workers, fill: '#0f766e' },
      { name: 'slack', value: concurrencySlack, fill: '#94a3b8' },
      { name: 'pending', value: pending, fill: '#f59e0b' },
    ],
    stagePressureCards: [
      {
        label: '最高压力阶段',
        value: stagePressureLeader ? stagePressureLeader.stage : '-',
        hint: stagePressureLeader ? `score ${formatNumber(stagePressureLeader.pressureScore, 1)}` : '暂无阶段样本',
        tone: stagePressureLeader?.tone || 'text-slate-500',
      },
      {
        label: '热点阶段数',
        value: formatNumber(hotStageCount),
        hint: 'pressure score >= 4',
        tone: hotStageCount > 0 ? 'text-amber-700' : 'text-emerald-700',
      },
      {
        label: '最高运行堆积',
        value: stagePressureLeader ? formatNumber(stagePressureLeader.runningRuns) : '-',
        hint: 'top stage running runs',
        tone: stagePressureLeader && stagePressureLeader.runningRuns > 0 ? 'text-rose-700' : 'text-slate-500',
      },
    ],
    stagePressureRows,
  };
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

const buildBinarySecurityReducerSnapshotMeta = (rows: DisplayMetricRow[]) => ({
  available: (metricValueByName(rows, 'secflow_binary_security_reducer_snapshot_available') || 0) > 0,
  stale: (metricValueByName(rows, 'secflow_binary_security_reducer_snapshot_stale') || 0) > 0,
  ageSeconds: metricValueByName(rows, 'secflow_binary_security_reducer_snapshot_age_seconds'),
  sourcePod: rows.find((row) => row.name === 'secflow_binary_security_reducer_snapshot_source_info')?.labels.pod || null,
  generatedAtTimestamp: metricValueByName(rows, 'secflow_binary_security_reducer_snapshot_generated_at_timestamp_seconds'),
});

const buildB2SBusinessViewModel = (rows: DisplayMetricRow[]): B2SBusinessViewModel => {
  const availableItems =
    metricValueByName(rows, 'secflow_binary_to_source_runtime_metric_available_items') ??
    metricValueByName(rows, 'secflow_binary_to_source_business_metric_available_items');
  const legacyMissing = metricValueByName(rows, 'secflow_binary_to_source_business_metric_missing_items');
  const missingReasons = rows
    .filter((row) => row.name === 'secflow_binary_to_source_runtime_metric_missing_items' && row.labels.reason !== 'none')
    .map((row) => ({ reason: row.labels.reason || 'unknown', value: row.value }))
    .sort((left, right) => right.value - left.value);
  const missingItems = missingReasons.length ? missingReasons.reduce((sum, item) => sum + item.value, 0) : legacyMissing;
  const totalItems = (availableItems || 0) + (missingItems || 0);
  const latestSeenSeconds = metricValueByName(rows, 'secflow_binary_to_source_latest_runtime_metric_seen_timestamp');
  const syncLastRunAt = metricValueByName(rows, 'secflow_binary_to_source_task_sync_last_run_timestamp');
  return {
    availableItems,
    missingItems,
    coverageRate: totalItems > 0 ? ((availableItems || 0) / totalItems) * 100 : null,
    headerAvgSeconds:
      histogramAverage(rows, 'secflow_binary_to_source_completed_phase_duration_seconds', { phase: 'header_synthesis' }) ??
      histogramAverage(rows, 'secflow_binary_to_source_header_recovery_duration_seconds'),
    bodyAvgSeconds:
      histogramAverage(rows, 'secflow_binary_to_source_completed_phase_duration_seconds', { phase: 'body_generation' }) ??
      histogramAverage(rows, 'secflow_binary_to_source_body_recovery_duration_seconds'),
    batchAvgSeconds: histogramAverage(rows, 'secflow_binary_to_source_batch_recovery_duration_seconds'),
    runningHeaderAvgSeconds: histogramAverage(rows, 'secflow_binary_to_source_running_phase_duration_seconds', { phase: 'header_synthesis' }),
    runningBodyAvgSeconds: histogramAverage(rows, 'secflow_binary_to_source_running_phase_duration_seconds', { phase: 'body_generation' }),
    functionThroughput: metricValueByName(rows, 'secflow_binary_to_source_function_throughput'),
    weightedFunctionThroughput: metricValueByName(rows, 'secflow_binary_to_source_weighted_function_throughput'),
    batchRetryRate: metricValueByName(rows, 'secflow_binary_to_source_batch_retry_rate'),
    batchValidationPassRate: metricValueByName(rows, 'secflow_binary_to_source_batch_validation_pass_rate'),
    batchFailureRate: metricValueByName(rows, 'secflow_binary_to_source_batch_failure_rate'),
    avgAttemptsPerBatch: metricValueByName(rows, 'secflow_binary_to_source_avg_attempts_per_batch'),
    batchAttempts: metricValueByName(rows, 'secflow_binary_to_source_batch_attempts_total'),
    batchValidation: metricValueByName(rows, 'secflow_binary_to_source_batch_validation_total'),
    artifactBytes: metricValueByName(rows, 'secflow_binary_to_source_artifact_bytes'),
    tokenTotal: metricValueByName(rows, 'secflow_binary_to_source_llm_token_usage_total'),
    costTotal: metricValueByName(rows, 'secflow_binary_to_source_llm_token_cost_total'),
    latestSeenAt: latestSeenSeconds && latestSeenSeconds > 0 ? latestSeenSeconds * 1000 : null,
    missingReasons,
    syncCandidates: metricValueByName(rows, 'secflow_binary_to_source_task_sync_candidates'),
    syncLastAttempted: metricValueByName(rows, 'secflow_binary_to_source_task_sync_last_attempted_tasks'),
    syncLastSucceeded: metricValueByName(rows, 'secflow_binary_to_source_task_sync_last_succeeded_tasks'),
    syncLastChanged: metricValueByName(rows, 'secflow_binary_to_source_task_sync_last_changed_tasks'),
    syncLastFailed: metricValueByName(rows, 'secflow_binary_to_source_task_sync_last_failed_tasks'),
    syncLastDurationSeconds: metricValueByName(rows, 'secflow_binary_to_source_task_sync_last_duration_seconds'),
    syncLastRunAt: syncLastRunAt && syncLastRunAt > 0 ? syncLastRunAt * 1000 : null,
    syncTotalTicks: metricValueByName(rows, 'secflow_binary_to_source_task_sync_ticks_total'),
    syncTotalFailedTasks: metricValueByName(rows, 'secflow_binary_to_source_task_sync_tasks_total', { result: 'failed' }),
  };
};

const buildB2SCacheViewModel = (rows: DisplayMetricRow[]): B2SCacheViewModel => {
  const requests = metricValueByName(rows, 'secflow_binary_to_source_cache_requests_total');
  const hits = metricValueByName(rows, 'secflow_binary_to_source_cache_hits_total');
  const misses = metricValueByName(rows, 'secflow_binary_to_source_cache_misses_total');
  const bypassed = metricValueByName(rows, 'secflow_binary_to_source_cache_bypassed_total');
  const replaced = metricValueByName(rows, 'secflow_binary_to_source_cache_replace_total');
  const entries = metricValueByName(rows, 'secflow_binary_to_source_cache_entries');
  const denominator = (hits || 0) + (misses || 0);
  return {
    requestsTotal: requests,
    hitsTotal: hits,
    missesTotal: misses,
    bypassedTotal: bypassed,
    replacedTotal: replaced,
    entries,
    hitRate: denominator > 0 ? ((hits || 0) / denominator) * 100 : null,
  };
};

const valueOrZero = (value: number | null | undefined) => (Number.isFinite(value || 0) ? value || 0 : 0);

const firmwareMetric = (rows: DisplayMetricRow[], name: string, labels: Record<string, string> = {}) => metricValueByName(rows, name, labels);

const buildFirmwareStatusChart = (
  rows: DisplayMetricRow[],
  metricName: string,
  labelName: string,
  labelMap: Record<string, string>,
  colors: Record<string, string>,
) =>
  Object.entries(labelMap).map(([key, label]) => ({
    name: label,
    value: valueOrZero(firmwareMetric(rows, metricName, { [labelName]: key })),
    fill: colors[key] || '#64748b',
  }));

const buildFirmwareUnpackerViewModel = (rows: DisplayMetricRow[]): FirmwareUnpackerViewModel => {
  const pending = valueOrZero(firmwareMetric(rows, 'firmware_unpacker_tasks_by_status', { status: 'pending' }));
  const claimed = valueOrZero(firmwareMetric(rows, 'firmware_unpacker_tasks_by_status', { status: 'claimed' }));
  const running = valueOrZero(firmwareMetric(rows, 'firmware_unpacker_tasks_by_status', { status: 'running' }));
  const archiving = valueOrZero(firmwareMetric(rows, 'firmware_unpacker_tasks_by_status', { status: 'archiving' }));
  const success = valueOrZero(firmwareMetric(rows, 'firmware_unpacker_tasks_by_status', { status: 'success' }));
  const failed = valueOrZero(firmwareMetric(rows, 'firmware_unpacker_tasks_by_status', { status: 'failed' }));
  const queuePending = valueOrZero(firmwareMetric(rows, 'firmware_unpacker_queue_state', { state: 'pending' }));
  const queueQueued = valueOrZero(firmwareMetric(rows, 'firmware_unpacker_queue_state', { state: 'queued' }));
  const queueRunning = valueOrZero(firmwareMetric(rows, 'firmware_unpacker_queue_state', { state: 'running' }));
  const queueLeased = valueOrZero(firmwareMetric(rows, 'firmware_unpacker_queue_state', { state: 'leased' }));
  const cleanupPending = valueOrZero(firmwareMetric(rows, 'firmware_unpacker_queue_state', { state: 'cleanup_pending' }));
  const workerTotal = valueOrZero(firmwareMetric(rows, 'firmware_unpacker_workers_by_state', { state: 'total' }));
  const workerAlive = valueOrZero(firmwareMetric(rows, 'firmware_unpacker_workers_by_state', { state: 'alive' }));
  const workerDead = valueOrZero(firmwareMetric(rows, 'firmware_unpacker_workers_by_state', { state: 'dead' }));
  const slotUsage = valueOrZero(firmwareMetric(rows, 'firmware_unpacker_slot_usage', { kind: 'slot_usage' }));
  const slotCapacity =
    firmwareMetric(rows, 'firmware_unpacker_slot_usage', { kind: 'slot_capacity' }) ??
    firmwareMetric(rows, 'firmware_unpacker_effective_max_concurrent') ??
    null;
  const executorCapacity = firmwareMetric(rows, 'firmware_unpacker_slot_usage', { kind: 'executor_capacity' });
  const cleanupFailed = valueOrZero(firmwareMetric(rows, 'firmware_unpacker_cleanup_jobs_by_status', { status: 'failed' }));
  const cleanupSuccess = valueOrZero(firmwareMetric(rows, 'firmware_unpacker_cleanup_jobs_by_status', { status: 'success' }));
  const retryPreparing = valueOrZero(firmwareMetric(rows, 'firmware_unpacker_tasks_by_status', { status: 'retry_preparing' }));
  const backpressure = firmwareMetric(rows, 'firmware_unpacker_dispatch_backpressure_total');
  const claimedTotal = firmwareMetric(rows, 'firmware_unpacker_claimed_tasks_total');
  const dbRetry = sumMetric(rows, (row) => row.name === 'firmware_unpacker_db_retry_total');
  const taskErrors = sumMetric(rows, (row) => row.name === 'firmware_unpacker_task_errors_total');
  const tokenTotal =
    firmwareMetric(rows, 'firmware_unpacker_token_usage', { kind: 'total' }) ??
    firmwareMetric(rows, 'firmware_unpacker_ai_token_usage_total', { type: 'total' });
  const costTotal = firmwareMetric(rows, 'firmware_unpacker_cost_usage', { kind: 'total' }) ?? firmwareMetric(rows, 'firmware_unpacker_ai_token_cost_total');
  const aiSessions = firmwareMetric(rows, 'firmware_unpacker_ai_session_total', { role: 'agent' });
  const aiRounds = firmwareMetric(rows, 'firmware_unpacker_ai_round_total', { kind: 'round' });
  const aiFailures = sumMetric(rows, (row) => row.name === 'firmware_unpacker_ai_failure_total' && row.labels.category !== 'unknown');
  const slotUsageRate = slotCapacity && slotCapacity > 0 ? (slotUsage / slotCapacity) * 100 : null;

  const alerts: FirmwareUnpackerHealthAlert[] = [];
  if (cleanupFailed > 0) {
    alerts.push({
      label: '清理异常',
      text: `存在 ${formatNumber(cleanupFailed)} 个失败的 workspace cleanup job，建议检查清理日志和目录权限。`,
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
    });
  }
  if (workerDead > workerAlive && workerAlive > 0) {
    alerts.push({
      label: 'Worker 历史记录偏多',
      text: `当前 alive=${formatNumber(workerAlive)}，dead=${formatNumber(workerDead)}；dead 可能包含历史心跳记录，请以 alive 和近期心跳判断当前能力。`,
      tone: 'border-sky-200 bg-sky-50 text-sky-800',
    });
  }
  if (queuePending + queueQueued > 0 && slotCapacity && slotUsage < slotCapacity) {
    alerts.push({
      label: '可能调度延迟',
      text: `队列仍有 ${formatNumber(queuePending + queueQueued)} 个等待项，但并发槽未打满，需要关注 dispatcher/claim 状态。`,
      tone: 'border-rose-200 bg-rose-50 text-rose-800',
    });
  }
  if (!alerts.length && running + queuePending + queueQueued === 0) {
    alerts.push({
      label: '当前空闲',
      text: '没有运行中或排队中的固件解包任务，调度队列处于空闲状态。',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    });
  }

  return {
    kpis: [
      { label: '运行中任务', value: formatNumber(running + archiving), hint: `running ${formatNumber(running)} / archiving ${formatNumber(archiving)}`, tone: running + archiving > 0 ? 'text-teal-700' : 'text-slate-900' },
      { label: '排队/待领取', value: formatNumber(pending + claimed), hint: `pending ${formatNumber(pending)} / claimed ${formatNumber(claimed)}`, tone: pending + claimed > 0 ? 'text-amber-700' : 'text-slate-900' },
      { label: '成功/失败任务', value: `${formatNumber(success)} / ${formatNumber(failed)}`, hint: '历史任务终态分布', tone: failed > 0 ? 'text-rose-700' : 'text-emerald-700' },
      { label: '活跃 Worker', value: `${formatNumber(workerAlive)} / ${formatNumber(workerTotal)}`, hint: `dead ${formatNumber(workerDead)}`, tone: workerAlive > 0 ? 'text-indigo-700' : 'text-rose-700' },
      { label: '并发使用率', value: slotUsageRate == null ? '-' : `${formatNumber(slotUsageRate, 1)}%`, hint: `${formatNumber(slotUsage)} / ${formatNumber(slotCapacity)} slots`, tone: slotUsageRate && slotUsageRate > 85 ? 'text-amber-700' : 'text-slate-900' },
      { label: '清理失败数', value: formatNumber(cleanupFailed), hint: `cleanup success ${formatNumber(cleanupSuccess)}`, tone: cleanupFailed > 0 ? 'text-rose-700' : 'text-emerald-700' },
    ],
    taskStatusChart: buildFirmwareStatusChart(
      rows,
      'firmware_unpacker_tasks_by_status',
      'status',
      { pending: 'Pending', claimed: 'Claimed', running: 'Running', archiving: 'Archiving', success: 'Success', failed: 'Failed', cancelled: 'Cancelled' },
      { pending: '#f59e0b', claimed: '#0ea5e9', running: '#14b8a6', archiving: '#6366f1', success: '#10b981', failed: '#ef4444', cancelled: '#64748b' },
    ),
    queueChart: [
      { name: 'pending', value: queuePending, fill: '#f59e0b' },
      { name: 'queued', value: queueQueued, fill: '#0ea5e9' },
      { name: 'running', value: queueRunning, fill: '#14b8a6' },
      { name: 'leased', value: queueLeased, fill: '#6366f1' },
      { name: 'cleanup', value: cleanupPending, fill: '#a855f7' },
    ],
    workerChart: [
      { name: 'alive', value: workerAlive, fill: '#10b981' },
      { name: 'dead', value: workerDead, fill: '#f97316' },
      { name: 'slot usage', value: slotUsage, fill: '#14b8a6' },
      { name: 'slot capacity', value: valueOrZero(slotCapacity), fill: '#0f766e' },
      { name: 'executor', value: valueOrZero(executorCapacity), fill: '#6366f1' },
    ],
    httpTop: rows
      .filter((row) => row.name === 'firmware_unpacker_api_requests_total')
      .sort((left, right) => right.value - left.value)
      .slice(0, 6)
      .map((row) => ({
        name: `${row.labels.method || '-'} ${String(row.labels.path || '').replace('/api/app/firmware-unpacker/', '')}`,
        value: row.value,
      })),
    operations: [
      { label: '任务错误', value: taskErrors, hint: 'task_errors_total 聚合', tone: taskErrors > 0 ? 'text-rose-700' : 'text-emerald-700' },
      { label: 'DB 重试', value: dbRetry, hint: 'transient database retries', tone: dbRetry > 0 ? 'text-amber-700' : 'text-slate-900' },
      { label: '调度反压', value: backpressure, hint: 'no free local execution slots', tone: (backpressure || 0) > 0 ? 'text-amber-700' : 'text-slate-900' },
      { label: '已领取任务', value: claimedTotal, hint: 'claimed_tasks_total', tone: 'text-slate-900' },
      { label: '重试准备中', value: retryPreparing, hint: 'retry_preparing tasks', tone: retryPreparing > 0 ? 'text-amber-700' : 'text-slate-900' },
    ],
    aiSummary: [
      { label: 'AI 会话', value: formatNumber(aiSessions), hint: 'ai_session_total', tone: (aiSessions || 0) > 0 ? 'text-indigo-700' : 'text-slate-900' },
      { label: 'AI 轮次', value: formatNumber(aiRounds), hint: 'ai_round_total', tone: (aiRounds || 0) > 0 ? 'text-indigo-700' : 'text-slate-900' },
      { label: 'Token 总量', value: formatNumber(tokenTotal), hint: 'token_usage total', tone: (tokenTotal || 0) > 0 ? 'text-violet-700' : 'text-slate-900' },
      { label: '成本', value: formatMetricValue(costTotal ?? Number.NaN), hint: 'cost_usage total', tone: (costTotal || 0) > 0 ? 'text-violet-700' : 'text-slate-900' },
      { label: 'AI 失败', value: formatNumber(aiFailures), hint: '排除 unknown 的 failure 聚合', tone: aiFailures > 0 ? 'text-rose-700' : 'text-emerald-700' },
    ],
    alerts,
  };
};

const buildEntryAnalysisViewModel = (rows: DisplayMetricRow[]): EntryAnalysisViewModel => {
  const pending = metricValueByName(rows, 'secflow_ea_tasks_pending');
  const running = metricValueByName(rows, 'secflow_ea_tasks_running');
  const finished = metricValueByName(rows, 'secflow_ea_tasks_finished');
  const avgQueueWait = histogramAverage(rows, 'secflow_ea_queue_wait_seconds');
  const avgExecution = histogramAverage(rows, 'secflow_ea_execution_seconds');
  const avgTurnaround = histogramAverage(rows, 'secflow_ea_turnaround_seconds');
  const avgRoundDuration = histogramAverage(rows, 'secflow_ea_round_duration_seconds');
  const avgWorkerDuration = histogramAverage(rows, 'secflow_ea_worker_duration_seconds');
  const avgJudgeDuration = histogramAverage(rows, 'secflow_ea_judge_duration_seconds');
  const sessions = metricValueByName(rows, 'secflow_ea_sessions');
  const workers = metricValueByName(rows, 'secflow_ea_workers');
  const judges = metricValueByName(rows, 'secflow_ea_judges');
  const retryTotal = metricValueByName(rows, 'secflow_ea_retry_total');
  const timeoutTotal = metricValueByName(rows, 'secflow_ea_timeout_total');
  const cancelTotal = metricValueByName(rows, 'secflow_ea_cancel_total');
  const fileTotal = metricValueByName(rows, 'secflow_ea_file_total');
  const tokenInputTotal = metricValueByName(rows, 'secflow_ea_token_input_total');
  const tokenOutputTotal = metricValueByName(rows, 'secflow_ea_token_output_total');
  const tokenCostTotal = metricValueByName(rows, 'secflow_ea_token_cost_total');
  const tokenRunning = valueOrZero(metricValueByName(rows, 'secflow_ea_token_input_running')) + valueOrZero(metricValueByName(rows, 'secflow_ea_token_output_running'));
  const schedulerRunning = metricValueByName(rows, 'secflow_ea_scheduler_running');
  const workerServiceRunning = metricValueByName(rows, 'secflow_ea_worker_service_running');
  const failureSummary = rows
    .filter((row) => row.name === 'secflow_ea_failure_category_total')
    .sort((left, right) => right.value - left.value)
    .slice(0, 6)
    .map((row) => ({
      label: row.labels.category || 'unknown',
      value: row.value,
      hint: 'terminal failure category',
      tone: row.labels.category === 'timeout' || row.labels.category === 'error' ? 'text-rose-700' : 'text-amber-700',
    }));
  const topModules = rows
    .filter((row) => row.name === 'secflow_ea_module_total')
    .sort((left, right) => right.value - left.value)
    .slice(0, 6)
    .map((row) => ({
      name: row.labels.module || 'unknown',
      value: row.value,
    }));
  const stageRows = ['r1', 'r2', 'r3', 'r4']
    .map((stage) => {
      const passedRuns = valueOrZero(metricValueByName(rows, 'secflow_ea_stage_rounds', { stage, status: 'passed' }));
      const failedRuns = valueOrZero(metricValueByName(rows, 'secflow_ea_stage_rounds', { stage, status: 'failed' }));
      const retryRuns = valueOrZero(metricValueByName(rows, 'secflow_ea_stage_rounds', { stage, status: 'retry' }));
      const runningRuns = valueOrZero(metricValueByName(rows, 'secflow_ea_stage_rounds', { stage, status: 'running' }));
      const totalRuns = passedRuns + failedRuns + retryRuns + runningRuns;
      const durationSum =
        valueOrZero(metricValueByName(rows, 'secflow_ea_stage_duration_seconds_sum', { stage, status: 'passed' })) +
        valueOrZero(metricValueByName(rows, 'secflow_ea_stage_duration_seconds_sum', { stage, status: 'failed' })) +
        valueOrZero(metricValueByName(rows, 'secflow_ea_stage_duration_seconds_sum', { stage, status: 'completed' }));
      const durationCount =
        valueOrZero(metricValueByName(rows, 'secflow_ea_stage_duration_seconds_count', { stage, status: 'passed' })) +
        valueOrZero(metricValueByName(rows, 'secflow_ea_stage_duration_seconds_count', { stage, status: 'failed' })) +
        valueOrZero(metricValueByName(rows, 'secflow_ea_stage_duration_seconds_count', { stage, status: 'completed' }));
      const avgDurationSeconds = durationCount > 0 ? durationSum / durationCount : null;
      const workerCalls = valueOrZero(metricValueByName(rows, 'secflow_ea_stage_role_total', { stage, role: 'worker' }));
      const judgeCalls = valueOrZero(metricValueByName(rows, 'secflow_ea_stage_role_total', { stage, role: 'judge' }));
      const sessionCount = valueOrZero(metricValueByName(rows, 'secflow_ea_stage_session_total', { stage }));
      const failPressure = failedRuns + retryRuns;
      const healthTone =
        failPressure > passedRuns
          ? 'text-rose-700'
          : runningRuns > 0
            ? 'text-amber-700'
            : passedRuns > 0
              ? 'text-emerald-700'
              : 'text-slate-600';
      return {
        stage: stage.toUpperCase(),
        totalRuns,
        passedRuns,
        failedRuns,
        retryRuns,
        runningRuns,
        workerCalls,
        judgeCalls,
        sessionCount,
        avgDurationSeconds,
        healthTone,
      };
    })
    .filter((item) => item.totalRuns > 0 || item.workerCalls > 0 || item.judgeCalls > 0 || item.sessionCount > 0);
  const stageStatusChart = stageRows.map((item) => ({
    name: item.stage,
    passed: item.passedRuns,
    failed: item.failedRuns,
    retry: item.retryRuns,
    running: item.runningRuns,
  }));
  const busiestStage = [...stageRows].sort((left, right) => right.totalRuns - left.totalRuns)[0] || null;
  const slowestStage = [...stageRows]
    .filter((item) => item.avgDurationSeconds != null)
    .sort((left, right) => (right.avgDurationSeconds || 0) - (left.avgDurationSeconds || 0))[0] || null;
  const mostRetryStage = [...stageRows].sort((left, right) => right.retryRuns - left.retryRuns)[0] || null;
  const activeStageCount = stageRows.filter((item) => item.runningRuns > 0).length;
  const riskAlerts: Array<{ label: string; text: string; tone: string }> = [];
  if ((pending || 0) > Math.max(3, valueOrZero(workers))) {
    riskAlerts.push({
      label: '排队堆积',
      text: `pending=${formatNumber(pending)} 已明显高于 workers=${formatNumber(workers)}，当前入口分析存在排队压力。`,
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
    });
  }
  if (slowestStage && (slowestStage.avgDurationSeconds || 0) > 180) {
    riskAlerts.push({
      label: '慢阶段',
      text: `${slowestStage.stage} 平均耗时 ${formatSeconds(slowestStage.avgDurationSeconds)}，已经高于阶段健康阈值，建议优先查看该阶段会话和下游依赖。`,
      tone: 'border-rose-200 bg-rose-50 text-rose-800',
    });
  }
  if (mostRetryStage && mostRetryStage.retryRuns > Math.max(2, mostRetryStage.passedRuns)) {
    riskAlerts.push({
      label: '重试放大',
      text: `${mostRetryStage.stage} 的 retry=${formatNumber(mostRetryStage.retryRuns, 0)}，已经高于通过样本 ${formatNumber(mostRetryStage.passedRuns, 0)}，可能存在提示词/评审门槛/输入质量问题。`,
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
    });
  }
  const failureHeavyStage = [...stageRows].find((item) => item.failedRuns > item.passedRuns && item.failedRuns > 0) || null;
  if (failureHeavyStage) {
    riskAlerts.push({
      label: '失败偏高',
      text: `${failureHeavyStage.stage} 当前 failed=${formatNumber(failureHeavyStage.failedRuns, 0)}，超过 passed=${formatNumber(failureHeavyStage.passedRuns, 0)}，阶段内失败已经开始主导。`,
      tone: 'border-rose-200 bg-rose-50 text-rose-800',
    });
  }
  const sessionGapStage = [...stageRows].find((item) => (item.workerCalls > 0 || item.judgeCalls > 0) && item.sessionCount <= 0) || null;
  if (sessionGapStage) {
    riskAlerts.push({
      label: '会话记录缺口',
      text: `${sessionGapStage.stage} 已有 Worker/Judge 调用样本，但 session_total=0，这通常意味着会话记录或阶段事件没有完整落盘。`,
      tone: 'border-sky-200 bg-sky-50 text-sky-800',
    });
  }
  if (!riskAlerts.length) {
    riskAlerts.push({
      label: '整体平稳',
      text: '当前入口分析没有明显的排队放大、慢阶段、失败主导或会话缺口信号，可以继续通过阶段矩阵做细查。',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    });
  }

  return {
    kpis: [
      { label: '排队任务', value: formatNumber(pending), hint: '当前 pending 任务数', tone: (pending || 0) > 0 ? 'text-amber-700' : 'text-slate-900' },
      { label: '运行中任务', value: formatNumber(running), hint: '当前 running 任务数', tone: (running || 0) > 0 ? 'text-teal-700' : 'text-slate-900' },
      { label: '平均排队时长', value: formatSeconds(avgQueueWait), hint: 'queue_wait_seconds 均值', tone: (avgQueueWait || 0) > 60 ? 'text-rose-700' : 'text-slate-900' },
      { label: '平均执行时长', value: formatSeconds(avgExecution), hint: 'execution_seconds 均值', tone: (avgExecution || 0) > 300 ? 'text-amber-700' : 'text-slate-900' },
      { label: '平均端到端时长', value: formatSeconds(avgTurnaround), hint: 'turnaround_seconds 均值', tone: (avgTurnaround || 0) > 600 ? 'text-rose-700' : 'text-slate-900' },
      { label: '平均轮次耗时', value: formatSeconds(avgRoundDuration), hint: 'round_duration_seconds 均值', tone: (avgRoundDuration || 0) > 180 ? 'text-amber-700' : 'text-slate-900' },
    ],
    roleSummary: [
      { label: 'Worker 平均耗时', value: formatSeconds(avgWorkerDuration), hint: 'worker_duration_seconds 均值', tone: 'text-indigo-700' },
      { label: 'Judge 平均耗时', value: formatSeconds(avgJudgeDuration), hint: 'judge_duration_seconds 均值', tone: 'text-fuchsia-700' },
      { label: '会话文件数', value: formatNumber(sessions), hint: 'session gauge', tone: (sessions || 0) > 0 ? 'text-slate-900' : 'text-slate-500' },
      { label: 'Worker / Judge', value: `${formatNumber(workers)} / ${formatNumber(judges)}`, hint: '当前聚合角色规模', tone: 'text-slate-900' },
      { label: '运行中 Token', value: formatNumber(tokenRunning), hint: 'running input + output token snapshot', tone: tokenRunning > 0 ? 'text-violet-700' : 'text-slate-900' },
      { label: '累计成本', value: formatMetricValue(tokenCostTotal ?? Number.NaN), hint: `input ${formatNumber(tokenInputTotal)} / output ${formatNumber(tokenOutputTotal)}`, tone: (tokenCostTotal || 0) > 0 ? 'text-violet-700' : 'text-slate-900' },
      { label: '处理文件估算', value: formatNumber(fileTotal), hint: 'worker files / shard 估算', tone: 'text-slate-900' },
      {
        label: '调度健康',
        value: `${formatNumber(schedulerRunning)} / ${formatNumber(workerServiceRunning)}`,
        hint: 'scheduler_running / worker_service_running',
        tone: schedulerRunning && workerServiceRunning ? 'text-emerald-700' : 'text-rose-700',
      },
      { label: '终态任务', value: formatNumber(finished), hint: '当前聚合 finished 任务数', tone: (finished || 0) > 0 ? 'text-emerald-700' : 'text-slate-900' },
    ],
    failureSummary: [
      { label: '重试次数', value: retryTotal, hint: '额外 round 聚合', tone: (retryTotal || 0) > 0 ? 'text-amber-700' : 'text-slate-900' },
      { label: '超时次数', value: timeoutTotal, hint: 'timeout total', tone: (timeoutTotal || 0) > 0 ? 'text-rose-700' : 'text-emerald-700' },
      { label: '取消次数', value: cancelTotal, hint: 'cancel total', tone: (cancelTotal || 0) > 0 ? 'text-slate-700' : 'text-emerald-700' },
      ...failureSummary,
    ],
    topModules,
    riskAlerts,
    stageCards: [
      {
        label: '阶段覆盖',
        value: `${formatNumber(stageRows.length, 0)} / 4`,
        hint: '当前有指标回传的阶段数',
        tone: stageRows.length >= 4 ? 'text-emerald-700' : 'text-amber-700',
      },
      {
        label: '最忙阶段',
        value: busiestStage ? `${busiestStage.stage} · ${formatNumber(busiestStage.totalRuns, 0)}` : '-',
        hint: '按 stage_rounds 总样本',
        tone: busiestStage ? busiestStage.healthTone : 'text-slate-900',
      },
      {
        label: '最慢阶段',
        value: slowestStage ? `${slowestStage.stage} · ${formatSeconds(slowestStage.avgDurationSeconds)}` : '-',
        hint: '按 stage_duration_seconds 均值',
        tone: slowestStage && (slowestStage.avgDurationSeconds || 0) > 120 ? 'text-rose-700' : 'text-slate-900',
      },
      {
        label: '重试最密集',
        value: mostRetryStage && mostRetryStage.retryRuns > 0 ? `${mostRetryStage.stage} · ${formatNumber(mostRetryStage.retryRuns, 0)}` : '-',
        hint: '按 stage retry 样本',
        tone: mostRetryStage && mostRetryStage.retryRuns > 0 ? 'text-amber-700' : 'text-emerald-700',
      },
      {
        label: '活跃阶段数',
        value: formatNumber(activeStageCount, 0),
        hint: '当前存在 running 样本的阶段',
        tone: activeStageCount > 0 ? 'text-teal-700' : 'text-slate-900',
      },
    ],
    stageRows,
    stageStatusChart,
  };
};

const buildDataflowAnalysisViewModel = (rows: DisplayMetricRow[]): DataflowAnalysisViewModel => {
  const pending = metricValueByName(rows, 'secflow_dfa_cluster_tasks_pending');
  const running = metricValueByName(rows, 'secflow_dfa_cluster_tasks_running');
  const terminal = metricValueByName(rows, 'secflow_dfa_cluster_tasks_terminal');
  const leased = metricValueByName(rows, 'secflow_dfa_cluster_leased_tasks');
  const staleLeases = metricValueByName(rows, 'secflow_dfa_cluster_stale_leases');
  const heartbeatLive = metricValueByName(rows, 'secflow_dfa_cluster_heartbeat_live_tasks');
  const heartbeatStale = metricValueByName(rows, 'secflow_dfa_cluster_heartbeat_stale_tasks');
  const heartbeatAgeMax = metricValueByName(rows, 'secflow_dfa_cluster_heartbeat_age_seconds_max');
  const retryCount = metricValueByName(rows, 'secflow_dfa_cluster_retry_count');
  const timeoutCount = metricValueByName(rows, 'secflow_dfa_cluster_timeout_count');
  const cancelCount = metricValueByName(rows, 'secflow_dfa_cluster_cancel_count');
  const configuredWorkers = metricValueByName(rows, 'secflow_dfa_cluster_workers', { state: 'configured' });
  const observedActiveOwners = metricValueByName(rows, 'secflow_dfa_cluster_workers', { state: 'observed_active_owner' });
  const observedHeartbeatOwners = metricValueByName(rows, 'secflow_dfa_cluster_workers', { state: 'observed_live_heartbeat_owner' });
  const workerSlotCapacity = metricValueByName(rows, 'secflow_dfa_cluster_worker_slots', { kind: 'capacity' });
  const workerSlotBusy = metricValueByName(rows, 'secflow_dfa_cluster_worker_slots', { kind: 'busy' });
  const workerSlotFree = metricValueByName(rows, 'secflow_dfa_cluster_worker_slots', { kind: 'free' });
  const workerCapacityPerPod = metricValueByName(rows, 'secflow_dfa_cluster_worker_capacity_per_pod');
  const slotUtilizationRatio = metricValueByName(rows, 'secflow_dfa_cluster_worker_slot_utilization_ratio');
  const observedCoverageRatio = metricValueByName(rows, 'secflow_dfa_cluster_worker_observed_coverage_ratio');
  const queuePressureRatio = metricValueByName(rows, 'secflow_dfa_cluster_queue_pressure_ratio');
  const rounds = metricValueByName(rows, 'secflow_dfa_cluster_rounds');
  const judges = metricValueByName(rows, 'secflow_dfa_cluster_judges');
  const functions = metricValueByName(rows, 'secflow_dfa_cluster_functions');
  const traceDepthMax = metricValueByName(rows, 'secflow_dfa_cluster_trace_depth_max');
  const traceCallees = metricValueByName(rows, 'secflow_dfa_cluster_trace_callees');
  const tokenTotal = metricValueByName(rows, 'secflow_dfa_cluster_token_usage', { type: 'total' });
  const tokenRunning = metricValueByName(rows, 'secflow_dfa_cluster_running_token_usage', { type: 'total' });
  const tokenCost = metricValueByName(rows, 'secflow_dfa_cluster_token_cost');
  const runningCost = metricValueByName(rows, 'secflow_dfa_cluster_running_token_cost');
  const avgQueueWait = averageFromSummary(rows, 'secflow_dfa_cluster_queue_wait_seconds');
  const avgExecution = averageFromSummary(rows, 'secflow_dfa_cluster_execution_seconds');
  const avgTurnaround = averageFromSummary(rows, 'secflow_dfa_cluster_turnaround_seconds');
  const avgRoundDuration = averageFromSummary(rows, 'secflow_dfa_cluster_round_duration_seconds');
  const avgJudgeDuration = averageFromSummary(rows, 'secflow_dfa_cluster_judge_duration_seconds');

  const failureCategories = rows
    .filter((row) => row.name === 'secflow_dfa_cluster_failure_category')
    .sort((left, right) => right.value - left.value)
    .map((row) => ({
      label: row.labels.category || 'unknown',
      value: row.value,
      tone: row.labels.category === 'timeout' || row.labels.category === 'lease_lost' ? 'text-rose-700' : 'text-amber-700',
    }));

  const dispatchSummary = rows
    .filter((row) => row.name === 'secflow_dfa_cluster_dispatch_status')
    .sort((left, right) => right.value - left.value)
    .map((row) => ({
      label: row.labels.status || 'unknown',
      value: row.value,
      tone: row.labels.status === 'running' || row.labels.status === 'leased' ? 'text-teal-700' : 'text-slate-700',
    }));

  const alerts: Array<{ label: string; text: string; tone: string }> = [];
  if ((observedCoverageRatio || 0) > 0 && (observedCoverageRatio || 0) < 0.6) {
    alerts.push({
      label: '观测 Owner 偏少',
      text: `configured workers=${formatNumber(configuredWorkers)}，但当前仅观测到 ${formatNumber(observedActiveOwners)} 个 active owner，heartbeat owners=${formatNumber(observedHeartbeatOwners)}。需要核对 worker 可用性、调度分布或 lease 回收情况。`,
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
    });
  }
  if ((slotUtilizationRatio || 0) >= 0.85) {
    alerts.push({
      label: '执行槽位逼近打满',
      text: `busy slots=${formatNumber(workerSlotBusy)} / capacity=${formatNumber(workerSlotCapacity)}，利用率约 ${formatNumber((slotUtilizationRatio || 0) * 100, 1)}%。继续进流时更容易放大排队时延。`,
      tone: 'border-rose-200 bg-rose-50 text-rose-800',
    });
  }
  if ((heartbeatStale || 0) > 0) {
    alerts.push({
      label: '存在心跳超时任务',
      text: `heartbeat stale=${formatNumber(heartbeatStale)}，max age=${formatSeconds(heartbeatAgeMax)}。这通常意味着 owner 卡死、Pod 抖动或 lease 续约链路异常。`,
      tone: 'border-rose-200 bg-rose-50 text-rose-800',
    });
  }
  if ((queuePressureRatio || 0) >= 1 || ((pending || 0) > 0 && (workerSlotFree || 0) <= 0)) {
    alerts.push({
      label: '队列压力偏高',
      text: `pending=${formatNumber(pending)}，free slots=${formatNumber(workerSlotFree)}，queue pressure 约 ${formatNumber((queuePressureRatio || 0) * 100, 1)}%。需要关注扩容、任务重量或租约释放速度。`,
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
    });
  }
  if ((timeoutCount || 0) > 0 && ((timeoutCount || 0) >= 3 || (terminal || 0) > 0 && ((timeoutCount || 0) / (terminal || 1)) >= 0.2)) {
    alerts.push({
      label: '超时失败偏高',
      text: `timeout=${formatNumber(timeoutCount)}，terminal=${formatNumber(terminal)}。建议继续拆分是 queue wait、execution duration 还是 lease/heartbeat 问题。`,
      tone: 'border-rose-200 bg-rose-50 text-rose-800',
    });
  }
  if (!alerts.length) {
    alerts.push({
      label: '聚合视图平稳',
      text: '当前未见明显的容量打满、心跳超时或 owner 覆盖异常；可以继续结合 failure category 和 dispatch summary 做结构性观察。',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    });
  }

  return {
    kpis: [
      { label: '排队任务', value: formatNumber(pending), hint: 'cluster pending tasks', tone: (pending || 0) > 0 ? 'text-amber-700' : 'text-slate-900' },
      { label: '运行中任务', value: formatNumber(running), hint: 'cluster running tasks', tone: (running || 0) > 0 ? 'text-teal-700' : 'text-slate-900' },
      { label: '有效租约', value: formatNumber(leased), hint: 'active leases', tone: (leased || 0) > 0 ? 'text-indigo-700' : 'text-slate-900' },
      { label: '陈旧租约', value: formatNumber(staleLeases), hint: 'expired owned leases', tone: (staleLeases || 0) > 0 ? 'text-rose-700' : 'text-emerald-700' },
      { label: '心跳正常/超时', value: `${formatNumber(heartbeatLive)} / ${formatNumber(heartbeatStale)}`, hint: `max age ${formatSeconds(heartbeatAgeMax)}`, tone: (heartbeatStale || 0) > 0 ? 'text-rose-700' : 'text-emerald-700' },
      {
        label: 'Worker 配置/观测',
        value: `${formatNumber(configuredWorkers)} / ${formatNumber(observedActiveOwners)}`,
        hint: `heartbeat owners ${formatNumber(observedHeartbeatOwners)} · per pod ${formatNumber(workerCapacityPerPod)}`,
        tone: (observedActiveOwners || 0) > 0 ? 'text-cyan-700' : 'text-slate-500',
      },
    ],
    loadCards: [
      {
        label: 'Busy / Free Slots',
        value: `${formatNumber(workerSlotBusy)} / ${formatNumber(workerSlotFree)}`,
        hint: `configured capacity ${formatNumber(workerSlotCapacity)} · observed owners ${formatNumber(observedActiveOwners)}`,
        tone: (workerSlotBusy || 0) > (workerSlotFree || 0) ? 'text-amber-700' : 'text-slate-900',
      },
      { label: '平均排队', value: formatSeconds(avgQueueWait), hint: 'queue_wait_seconds', tone: (avgQueueWait || 0) > 120 ? 'text-rose-700' : 'text-slate-900' },
      { label: '平均执行', value: formatSeconds(avgExecution), hint: 'execution_seconds', tone: (avgExecution || 0) > 900 ? 'text-amber-700' : 'text-slate-900' },
      { label: '平均周转', value: formatSeconds(avgTurnaround), hint: 'turnaround_seconds', tone: (avgTurnaround || 0) > 1200 ? 'text-rose-700' : 'text-slate-900' },
      { label: '平均轮次 / Judge', value: `${formatSeconds(avgRoundDuration)} / ${formatSeconds(avgJudgeDuration)}`, hint: 'round/judge duration', tone: 'text-slate-900' },
      { label: '轮次 / Judge / Function', value: `${formatNumber(rounds)} / ${formatNumber(judges)} / ${formatNumber(functions)}`, hint: 'analysis scale snapshot', tone: 'text-indigo-700' },
      { label: 'Trace 深度 / Callee', value: `${formatNumber(traceDepthMax)} / ${formatNumber(traceCallees)}`, hint: 'trace complexity snapshot', tone: 'text-slate-900' },
      { label: 'Token 总量 / 运行中', value: `${formatNumber(tokenTotal)} / ${formatNumber(tokenRunning)}`, hint: 'cluster token snapshot', tone: 'text-violet-700' },
      { label: '成本 / 运行中成本', value: `${formatMetricValue(tokenCost ?? Number.NaN)} / ${formatMetricValue(runningCost ?? Number.NaN)}`, hint: 'cluster token cost snapshot', tone: 'text-fuchsia-700' },
      { label: '重试 / 超时 / 取消', value: `${formatNumber(retryCount)} / ${formatNumber(timeoutCount)} / ${formatNumber(cancelCount)}`, hint: 'cluster failure pressure', tone: (timeoutCount || 0) > 0 ? 'text-rose-700' : 'text-slate-900' },
      { label: '终态任务', value: formatNumber(terminal), hint: 'cluster terminal tasks', tone: (terminal || 0) > 0 ? 'text-emerald-700' : 'text-slate-900' },
    ],
    failureCategories,
    dispatchSummary,
    alerts,
  };
};

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
  const snapshotMeta = buildBinarySecurityReducerSnapshotMeta(rows);
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
    snapshotMeta,
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

const INITIAL_DFA_WORKER_DETAIL_STATE: DfaWorkerDetailState = {
  loading: false,
  data: null,
  error: null,
  refreshedAt: null,
};

const INITIAL_ENTRY_WORKER_DETAIL_STATE: EntryWorkerDetailState = {
  loading: false,
  data: null,
  error: null,
  refreshedAt: null,
};

const INITIAL_AGENT_STATE: AgentObservabilityState = {
  loading: false,
  summary: null,
  processes: [],
  sessions: [],
  tasks: [],
  error: null,
  refreshedAt: null,
};

const INITIAL_AGENT_SESSION_CONTENT_STATE: AgentSessionContentState = {
  loading: false,
  data: null,
  error: null,
};

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

const reducerFailedKinds = new Set(['retryable', 'dead_letter', 'reducer_failed', 'lease_expired', 'unknown']);

function reducerRowClassName(item: BinarySecurityReducerEventRecord): string {
  if (reducerFailedKinds.has(item.failure_kind)) {
    return `${executionTableRowClassName} bg-rose-50/80 hover:bg-rose-50`;
  }
  return executionTableRowClassName;
}

export const BinarySecurityMetricsDashboardPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const executionMetricsApi = api.domains.execution.metrics;
  const binarySecurityExecutionApi = api.domains.execution.binarySecurity;
  const dataflowAnalysisApi = api.domains.execution.appDataflowAnalyse;
  const entryAnalysisApi = api.domains.execution.appEntryAnalyse;
  const systemAnalysisApi = api.domains.execution.appSystemAnalyse;
  const [activeServiceKey, setActiveServiceKey] = useState<BinarySecurityMetricsServiceKey>(BINARY_SECURITY_METRICS_SERVICES[0].key);
  const [activeSecondaryTab, setActiveSecondaryTab] = useState<BinarySecurityMetricsSecondaryTab>('observability');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [groupFilter, setGroupFilter] = useState<'all' | BinarySecurityMetricsGroup>('all');
  const [dataflowVulnSampleScope, setDataflowVulnSampleScope] = useState<DataflowVulnSampleScope>('focus');
  const [aiSearchKeyword, setAiSearchKeyword] = useState('');
  const [aiRoleFilter, setAiRoleFilter] = useState<'all' | string>('all');
  const [selectedEntryStage, setSelectedEntryStage] = useState<'all' | 'R1' | 'R2' | 'R3' | 'R4'>('all');
  const [selectedSystemWorkerFilter, setSelectedSystemWorkerFilter] = useState<string>('');
  const [selectedDfaWorkerFilter, setSelectedDfaWorkerFilter] = useState<string>('');
  const [selectedEntryWorkerFilter, setSelectedEntryWorkerFilter] = useState<string>('');
  const [reducerHistoryByService, setReducerHistoryByService] = useState<Record<BinarySecurityMetricsServiceKey, BinarySecurityReducerSnapshot[]>>(
    Object.fromEntries(BINARY_SECURITY_METRICS_SERVICES.map((service) => [service.key, []])) as Record<BinarySecurityMetricsServiceKey, BinarySecurityReducerSnapshot[]>,
  );
  const [reducerMetricsState, setReducerMetricsState] = useState<MetricsState>(INITIAL_STATE);
  const [reducerEventState, setReducerEventState] = useState<ReducerEventState>(INITIAL_REDUCER_EVENT_STATE);
  const [reducerEventPage, setReducerEventPage] = useState(1);
  const [reducerEventPageSize, setReducerEventPageSize] = useState(50);
  const [reducerEventSortBy, setReducerEventSortBy] = useState<ReducerEventSortBy>('processed_at');
  const [reducerEventSortOrder, setReducerEventSortOrder] = useState<ReducerEventSortOrder>('desc');
  const [reducerEventStatusFilter, setReducerEventStatusFilter] = useState<string>('all');
  const [reducerEventTypeFilter, setReducerEventTypeFilter] = useState('');
  const [reducerEventHandlerFilter, setReducerEventHandlerFilter] = useState('');
  const [reducerEventTaskFilter, setReducerEventTaskFilter] = useState('');
  const [reducerEventFailedOnly, setReducerEventFailedOnly] = useState(false);
  const [reducerEventSlowOnly, setReducerEventSlowOnly] = useState(false);
  const [stateByService, setStateByService] = useState<Record<BinarySecurityMetricsServiceKey, MetricsState>>(
    Object.fromEntries(BINARY_SECURITY_METRICS_SERVICES.map((service) => [service.key, INITIAL_STATE])) as Record<BinarySecurityMetricsServiceKey, MetricsState>,
  );
  const [dfaWorkerDetailState, setDfaWorkerDetailState] = useState<DfaWorkerDetailState>(INITIAL_DFA_WORKER_DETAIL_STATE);
  const [entryWorkerDetailState, setEntryWorkerDetailState] = useState<EntryWorkerDetailState>(INITIAL_ENTRY_WORKER_DETAIL_STATE);
  const [systemWorkerDetailState, setSystemWorkerDetailState] = useState<SystemAnalysisWorkerDetailState>({
    loading: false,
    data: null,
    error: null,
    refreshedAt: null,
  });
  const [agentState, setAgentState] = useState<AgentObservabilityState>(INITIAL_AGENT_STATE);
  const [selectedAgentPids, setSelectedAgentPids] = useState<number[]>([]);
  const [selectedAgentTaskId, setSelectedAgentTaskId] = useState<string>('');
  const [selectedAgentSessionId, setSelectedAgentSessionId] = useState<string>('');
  const [agentSessionContentState, setAgentSessionContentState] = useState<AgentSessionContentState>(INITIAL_AGENT_SESSION_CONTENT_STATE);
  const [agentKillHistory, setAgentKillHistory] = useState<AgentKillHistoryEntry[]>([]);

  const activeService = useMemo(
    () => BINARY_SECURITY_METRICS_SERVICES.find((service) => service.key === activeServiceKey) || BINARY_SECURITY_METRICS_SERVICES[0],
    [activeServiceKey],
  );

  const loadMetrics = async (serviceKey: BinarySecurityMetricsServiceKey) => {
    setStateByService((current) => ({
      ...current,
      [serviceKey]: { ...current[serviceKey], loading: true, error: null },
    }));
    if (serviceKey === 'dataflow-analysis') {
      setDfaWorkerDetailState((current) => ({ ...current, loading: true, error: null }));
    }
    if (serviceKey === 'entry-analysis') {
      setEntryWorkerDetailState((current) => ({ ...current, loading: true, error: null }));
    }
    if (serviceKey === 'system-analysis') {
      setSystemWorkerDetailState((current) => ({ ...current, loading: true, error: null }));
    }
    try {
      const [rawText, dfaWorkerData, entryWorkerData, systemWorkerData] = await Promise.all([
        executionMetricsApi.getServiceMetrics(serviceKey),
        serviceKey === 'dataflow-analysis' && projectId
          ? dataflowAnalysisApi.getWorkerClusterCapacity(projectId)
          : Promise.resolve(null),
        serviceKey === 'entry-analysis' && projectId
          ? entryAnalysisApi.getSlotCluster(projectId)
          : Promise.resolve(null),
        serviceKey === 'system-analysis' && projectId
          ? systemAnalysisApi.getWorkerClusterCapacity(projectId)
          : Promise.resolve(null),
      ]);
      setStateByService((current) => ({
        ...current,
        [serviceKey]: { loading: false, rawText, error: null, refreshedAt: Date.now() },
      }));
      if (serviceKey === 'dataflow-analysis') {
        setDfaWorkerDetailState({
          loading: false,
          data: dfaWorkerData,
          error: null,
          refreshedAt: Date.now(),
        });
      }
      if (serviceKey === 'entry-analysis') {
        setEntryWorkerDetailState({
          loading: false,
          data: entryWorkerData,
          error: null,
          refreshedAt: Date.now(),
        });
      }
      if (serviceKey === 'system-analysis') {
        setSystemWorkerDetailState({
          loading: false,
          data: systemWorkerData,
          error: null,
          refreshedAt: Date.now(),
        });
      }
    } catch (error: any) {
      setStateByService((current) => ({
        ...current,
        [serviceKey]: { ...current[serviceKey], loading: false, error: error?.message || '指标抓取失败', refreshedAt: Date.now() },
      }));
      if (serviceKey === 'dataflow-analysis') {
        try {
          const data = projectId ? await dataflowAnalysisApi.getWorkerClusterCapacity(projectId) : null;
          setDfaWorkerDetailState({
            loading: false,
            data,
            error: error?.message || '指标抓取失败',
            refreshedAt: Date.now(),
          });
        } catch (detailError: any) {
          setDfaWorkerDetailState({
            loading: false,
            data: null,
            error: detailError?.message || error?.message || 'Worker 明细抓取失败',
            refreshedAt: Date.now(),
          });
        }
      }
      if (serviceKey === 'entry-analysis') {
        try {
          const data = projectId ? await entryAnalysisApi.getSlotCluster(projectId) : null;
          setEntryWorkerDetailState({
            loading: false,
            data,
            error: error?.message || '指标抓取失败',
            refreshedAt: Date.now(),
          });
        } catch (detailError: any) {
          setEntryWorkerDetailState({
            loading: false,
            data: null,
            error: detailError?.message || error?.message || 'Worker 明细抓取失败',
            refreshedAt: Date.now(),
          });
        }
      }
      if (serviceKey === 'system-analysis') {
        try {
          const data = projectId ? await systemAnalysisApi.getWorkerClusterCapacity(projectId) : null;
          setSystemWorkerDetailState({
            loading: false,
            data,
            error: error?.message || '指标抓取失败',
            refreshedAt: Date.now(),
          });
        } catch (detailError: any) {
          setSystemWorkerDetailState({
            loading: false,
            data: null,
            error: detailError?.message || error?.message || 'Worker 明细抓取失败',
            refreshedAt: Date.now(),
          });
        }
      }
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

  const loadReducerEvents = async () => {
    setReducerEventState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await binarySecurityExecutionApi.getReducerEvents({
        page: reducerEventPage,
        page_size: reducerEventPageSize,
        sort_by: reducerEventSortBy,
        sort_order: reducerEventSortOrder,
        status: reducerEventStatusFilter === 'all' ? [] : [reducerEventStatusFilter],
        event_type: reducerEventTypeFilter.trim() || undefined,
        handler_pod: reducerEventHandlerFilter.trim() || undefined,
        task_id: reducerEventTaskFilter.trim() || undefined,
        failed_only: reducerEventFailedOnly,
        slow_only: reducerEventSlowOnly,
      });
      setReducerEventState({
        loading: false,
        data,
        error: null,
        refreshedAt: Date.now(),
      });
    } catch (error: any) {
      setReducerEventState((current) => ({
        ...current,
        loading: false,
        error: error?.message || 'Reducer 事件记录抓取失败',
        refreshedAt: Date.now(),
      }));
    }
  };

  const agentObservabilityEnabled = activeServiceKey === 'entry-analysis' || activeServiceKey === 'system-analysis' || activeServiceKey === 'dataflow-analysis';

  const loadAgentObservability = async (serviceKey: BinarySecurityMetricsServiceKey) => {
    if (!projectId || !(serviceKey === 'entry-analysis' || serviceKey === 'system-analysis' || serviceKey === 'dataflow-analysis')) {
      setAgentState(INITIAL_AGENT_STATE);
      return;
    }
    setAgentState((current) => ({ ...current, loading: true, error: null }));
    try {
      const [summary, processes, sessions, tasks] = await Promise.all([
        executionMetricsApi.getAgentObservabilitySummary(serviceKey, projectId) as Promise<AgentObservabilitySummary>,
        executionMetricsApi.getAgentProcesses(serviceKey, projectId) as Promise<AgentProcessSnapshot[]>,
        executionMetricsApi.getAgentSessions(serviceKey, projectId) as Promise<AgentSessionObservabilitySnapshot[]>,
        executionMetricsApi.getAgentTasks(serviceKey, projectId) as Promise<AgentTaskOwnershipSnapshot[]>,
      ]);
      setAgentState({
        loading: false,
        summary,
        processes,
        sessions,
        tasks,
        error: null,
        refreshedAt: Date.now(),
      });
    } catch (error: any) {
      setAgentState((current) => ({
        ...current,
        loading: false,
        error: error?.message || '智能体观测抓取失败',
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
    if (activeServiceKey !== 'binary-security') return;
    if (activeSecondaryTab !== 'reducer') return;
    void loadReducerEvents();
  }, [
    activeSecondaryTab,
    activeServiceKey,
    reducerEventPage,
    reducerEventPageSize,
    reducerEventSortBy,
    reducerEventSortOrder,
    reducerEventStatusFilter,
    reducerEventTypeFilter,
    reducerEventHandlerFilter,
    reducerEventTaskFilter,
    reducerEventFailedOnly,
    reducerEventSlowOnly,
  ]);

  useEffect(() => {
    if (activeSecondaryTab !== 'agent') return;
    if (!agentObservabilityEnabled) return;
    if (!agentState.summary && !agentState.loading && !agentState.error) {
      void loadAgentObservability(activeServiceKey);
    }
  }, [activeSecondaryTab, activeServiceKey, agentObservabilityEnabled, agentState.error, agentState.loading, agentState.summary]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = window.setInterval(() => {
      if (activeSecondaryTab === 'agent' && agentObservabilityEnabled) {
        void loadAgentObservability(activeServiceKey);
        return;
      }
      void loadMetrics(activeServiceKey);
      if (activeServiceKey === 'binary-security' && activeSecondaryTab === 'reducer') {
        void loadReducerMetrics();
        void loadReducerEvents();
      }
    }, activeSecondaryTab === 'agent' ? 5000 : 30000);
    return () => window.clearInterval(timer);
  }, [activeSecondaryTab, activeServiceKey, agentObservabilityEnabled, autoRefresh]);

  useEffect(() => {
    setSearchKeyword('');
    setGroupFilter('all');
    setDataflowVulnSampleScope('focus');
    setAiSearchKeyword('');
    setAiRoleFilter('all');
    setSelectedEntryStage('all');
    setActiveSecondaryTab('observability');
    setAgentState(INITIAL_AGENT_STATE);
    setSelectedAgentPids([]);
    setSelectedAgentTaskId('');
    setSelectedAgentSessionId('');
    setAgentSessionContentState(INITIAL_AGENT_SESSION_CONTENT_STATE);
  }, [activeServiceKey, projectId]);

  const activeState = stateByService[activeServiceKey];
  const activeRefreshTimestamp = activeServiceKey === 'binary-security' && activeSecondaryTab === 'reducer' ? reducerMetricsState.refreshedAt : activeState.refreshedAt;
  const viewModel = useMemo(() => buildServiceViewModel(activeState.rawText, activeService), [activeService, activeState.rawText]);
  const aggregateCoverage = useMemo(
    () => buildAggregateCoverageSummary(viewModel.rows, activeServiceKey),
    [activeServiceKey, viewModel.rows],
  );
  const aiViewModel = useMemo(() => buildAiViewModel(viewModel.rows, activeService), [activeService, viewModel.rows]);
  const dataflowVulnAiViewModel = useMemo(
    () =>
      activeServiceKey === 'dataflow-vuln'
        ? buildDataflowVulnAiViewModel(viewModel.rows, {
            formatMetricValue,
            formatNumber,
            formatSeconds,
            metricValueByName,
            sumMetric,
            valueOrZero,
            averageFromSummary,
          })
        : null,
    [activeServiceKey, viewModel.rows],
  );
  const b2sBusinessViewModel = useMemo(
    () => (activeServiceKey === 'binary-to-source' ? buildB2SBusinessViewModel(viewModel.rows) : null),
    [activeServiceKey, viewModel.rows],
  );
  const b2sCacheViewModel = useMemo(
    () => (activeServiceKey === 'binary-to-source' ? buildB2SCacheViewModel(viewModel.rows) : null),
    [activeServiceKey, viewModel.rows],
  );
  const systemAnalysisViewModel = useMemo(
    () => (activeServiceKey === 'system-analysis' ? buildSystemAnalysisViewModel(viewModel.rows) : null),
    [activeServiceKey, viewModel.rows],
  );
  const dataflowVulnOverviewViewModel = useMemo(
    () =>
      activeServiceKey === 'dataflow-vuln'
        ? buildDataflowVulnOverviewViewModel(viewModel.rows, {
            formatMetricValue,
            formatNumber,
            formatSeconds,
            metricValueByName,
            sumMetric,
            valueOrZero,
            averageFromSummary,
          })
        : null,
    [activeServiceKey, viewModel.rows],
  );
  const firmwareUnpackerViewModel = useMemo(
    () => (activeServiceKey === 'firmware-unpacker' ? buildFirmwareUnpackerViewModel(viewModel.rows) : null),
    [activeServiceKey, viewModel.rows],
  );
  const entryAnalysisViewModel = useMemo(
    () => (activeServiceKey === 'entry-analysis' ? buildEntryAnalysisViewModel(viewModel.rows) : null),
    [activeServiceKey, viewModel.rows],
  );
  const dataflowAnalysisViewModel = useMemo(
    () => (activeServiceKey === 'dataflow-analysis' ? buildDataflowAnalysisViewModel(viewModel.rows) : null),
    [activeServiceKey, viewModel.rows],
  );
  const focusedEntryStageRow = useMemo(() => {
    if (!entryAnalysisViewModel || selectedEntryStage === 'all') return null;
    return entryAnalysisViewModel.stageRows.find((item) => item.stage === selectedEntryStage) || null;
  }, [entryAnalysisViewModel, selectedEntryStage]);
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
  const binarySecurityObservabilityViewModel = useMemo(
    () => (activeServiceKey === 'binary-security' ? buildBinarySecurityObservabilityViewModel(viewModel.rows, aggregateCoverage) : null),
    [activeServiceKey, aggregateCoverage, viewModel.rows],
  );

  const filteredRows = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    return viewModel.rows.filter((row) => {
      if (activeServiceKey === 'dataflow-vuln' && !matchesDataflowVulnSampleScope(row, dataflowVulnSampleScope)) return false;
      if (groupFilter !== 'all' && row.group !== groupFilter) return false;
      if (activeServiceKey === 'dataflow-analysis' && selectedDfaWorkerFilter) {
        const workerId = row.labels.worker_id || '';
        const hostName = row.labels.host_name || '';
        if (workerId !== selectedDfaWorkerFilter && hostName !== selectedDfaWorkerFilter) return false;
      }
      if (activeServiceKey === 'system-analysis' && selectedSystemWorkerFilter) {
        const workerId = row.labels.worker_id || row.labels.instance_id || row.labels.owner || '';
        const hostName = row.labels.host_name || row.labels.host || row.labels.pod_name || '';
        if (workerId !== selectedSystemWorkerFilter && hostName !== selectedSystemWorkerFilter) return false;
      }
      if (activeServiceKey === 'entry-analysis' && selectedEntryWorkerFilter) {
        const workerId = row.labels.worker_id || row.labels.worker || '';
        const hostName = row.labels.host_name || row.labels.host || row.labels.pod_name || '';
        if (workerId !== selectedEntryWorkerFilter && hostName !== selectedEntryWorkerFilter) return false;
      }
      if (!keyword) return true;
      return `${row.name} ${row.labelText} ${row.help || ''}`.toLowerCase().includes(keyword);
    });
  }, [activeServiceKey, dataflowVulnSampleScope, groupFilter, searchKeyword, selectedDfaWorkerFilter, selectedEntryWorkerFilter, selectedSystemWorkerFilter, viewModel.rows]);

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

  const filteredAgentProcesses = useMemo(() => {
    return agentState.processes.filter((item) => {
      if (selectedAgentTaskId && item.task_id !== selectedAgentTaskId) return false;
      if (selectedAgentSessionId && item.session_id !== selectedAgentSessionId) return false;
      return true;
    });
  }, [agentState.processes, selectedAgentSessionId, selectedAgentTaskId]);

  const filteredAgentSessions = useMemo(() => {
    return agentState.sessions.filter((item) => {
      if (selectedAgentTaskId && item.task_id !== selectedAgentTaskId) return false;
      if (selectedAgentSessionId && item.session_id !== selectedAgentSessionId) return false;
      return true;
    });
  }, [agentState.sessions, selectedAgentSessionId, selectedAgentTaskId]);

  const filteredAgentTasks = useMemo(() => {
    return selectedAgentTaskId ? agentState.tasks.filter((item) => item.task_id === selectedAgentTaskId) : agentState.tasks;
  }, [agentState.tasks, selectedAgentTaskId]);

  const selectedAgentSession = useMemo(
    () => agentState.sessions.find((item) => item.session_id === selectedAgentSessionId) || null,
    [agentState.sessions, selectedAgentSessionId],
  );

  const selectedAgentSessionMeta = useMemo(
    () => normalizeAgentSessionMeta(agentSessionContentState.data, selectedAgentSession),
    [agentSessionContentState.data, selectedAgentSession],
  );

  const pushAgentKillHistory = useCallback((scope: AgentKillHistoryEntry['scope'], response: AgentProcessKillResponse, id: string) => {
    setAgentKillHistory((current) => [
      {
        id,
        scope,
        createdAt: Date.now(),
        response,
      },
      ...current,
    ].slice(0, 8));
  }, []);

  useEffect(() => {
    const loadSessionContent = async () => {
      if (!selectedAgentSession || !selectedAgentSession.task_id || !selectedAgentSession.session_file) {
        setAgentSessionContentState(INITIAL_AGENT_SESSION_CONTENT_STATE);
        return;
      }
      setAgentSessionContentState({ loading: true, data: null, error: null });
      try {
        const data = activeServiceKey === 'entry-analysis'
          ? await entryAnalysisApi.getTaskSessionFile(selectedAgentSession.task_id, selectedAgentSession.session_file)
          : activeServiceKey === 'system-analysis'
            ? await systemAnalysisApi.getTaskSessionFile(selectedAgentSession.task_id, selectedAgentSession.session_file)
            : await dataflowAnalysisApi.getTaskSessionFile(selectedAgentSession.task_id, selectedAgentSession.session_file);
        setAgentSessionContentState({ loading: false, data, error: null });
      } catch (error: any) {
        setAgentSessionContentState({ loading: false, data: null, error: error?.message || '会话内容加载失败' });
      }
    };
    if (activeSecondaryTab === 'agent' && agentObservabilityEnabled) {
      void loadSessionContent();
    }
  }, [activeSecondaryTab, activeServiceKey, agentObservabilityEnabled, dataflowAnalysisApi, entryAnalysisApi, selectedAgentSession, systemAnalysisApi]);

  const selectedKillablePids = useMemo(
    () => selectedAgentPids.filter((pid) => agentState.processes.some((item) => item.pid === pid && item.owner_kind === 'orphan' && item.kill_allowed)),
    [agentState.processes, selectedAgentPids],
  );

  const orphanProcesses = useMemo(
    () => agentState.processes.filter((item) => item.owner_kind === 'orphan'),
    [agentState.processes],
  );

  const killSingleOrphan = async (process: AgentProcessSnapshot) => {
    if (!projectId || !agentObservabilityEnabled) return;
    if (process.owner_kind !== 'orphan' || !process.kill_allowed) {
      await showAlert({
        title: '不允许终止',
        message: process.kill_block_reason || '仅允许终止已判定为明确孤儿的智能体进程。',
      });
      return;
    }
    const confirmed = await showConfirm({
      title: '杀死孤儿智能体进程',
      message: `仅针对“已判定为明确孤儿”的智能体进程。\nPID=${process.pid} PGID=${process.pgid ?? '-'}。\n不影响运行中受控任务，操作不可撤销。`,
      confirmText: '确认杀死',
      danger: true,
    });
    if (!confirmed) return;
    const result = await executionMetricsApi.killAgentProcess(activeServiceKey, projectId, process.pid) as AgentProcessKillResponse;
    pushAgentKillHistory('single', result, `single-${process.pid}-${Date.now()}`);
    await showAlert({
      title: '执行结果',
      message: `请求 ${result.requested}，命中 ${result.matched}，成功 ${result.succeeded}，失败 ${result.failed}，跳过 ${result.skipped}`,
    });
    setSelectedAgentPids((current) => current.filter((pid) => pid !== process.pid));
    await loadAgentObservability(activeServiceKey);
  };

  const killSelectedOrphans = async () => {
    if (!projectId || !agentObservabilityEnabled || selectedKillablePids.length === 0) return;
    const confirmed = await showConfirm({
      title: '批量杀死选中孤儿',
      message: `仅针对“已判定为明确孤儿”的智能体进程。\n本次将处理 ${selectedKillablePids.length} 个 PID，不影响运行中受控任务，操作不可撤销。`,
      confirmText: '确认批量杀死',
      danger: true,
    });
    if (!confirmed) return;
    let summary = { requested: 0, matched: 0, succeeded: 0, failed: 0, skipped: 0 };
    const items: AgentProcessKillResponse['items'] = [];
    for (const pid of selectedKillablePids) {
      const result = await executionMetricsApi.killAgentProcess(activeServiceKey, projectId, pid) as AgentProcessKillResponse;
      summary = {
        requested: summary.requested + result.requested,
        matched: summary.matched + result.matched,
        succeeded: summary.succeeded + result.succeeded,
        failed: summary.failed + result.failed,
        skipped: summary.skipped + result.skipped,
      };
      items.push(...(result.items || []));
    }
    pushAgentKillHistory('selected', { ...summary, items }, `selected-${Date.now()}`);
    await showAlert({
      title: '批量执行结果',
      message: `请求 ${summary.requested}，命中 ${summary.matched}，成功 ${summary.succeeded}，失败 ${summary.failed}，跳过 ${summary.skipped}`,
    });
    setSelectedAgentPids([]);
    await loadAgentObservability(activeServiceKey);
  };

  const killAllOrphans = async () => {
    if (!projectId || !agentObservabilityEnabled) return;
    const confirmed = await showConfirm({
      title: '一键杀死全部明确孤儿',
      message: '仅针对“已判定为明确孤儿”的智能体进程，不影响运行中受控任务，操作不可撤销。',
      confirmText: '确认全部杀死',
      danger: true,
    });
    if (!confirmed) return;
    const result = await executionMetricsApi.killAllOrphanProcesses(activeServiceKey, projectId) as AgentProcessKillResponse;
    pushAgentKillHistory('bulk', result, `bulk-${Date.now()}`);
    await showAlert({
      title: '执行结果',
      message: `请求 ${result.requested}，命中 ${result.matched}，成功 ${result.succeeded}，失败 ${result.failed}，跳过 ${result.skipped}`,
    });
    setSelectedAgentPids([]);
    await loadAgentObservability(activeServiceKey);
  };

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
                if (activeSecondaryTab === 'agent' && agentObservabilityEnabled) {
                  void loadAgentObservability(activeServiceKey);
                  return;
                }
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
      ) : activeSecondaryTab === 'agent' ? (
        !agentObservabilityEnabled ? (
          <section className="rounded-[2rem] border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
            <div className="mx-auto max-w-2xl">
              <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">Agent</div>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">当前服务未接入智能体观测</h2>
              <p className="mt-3 text-sm text-slate-500">本期仅对入口分析、系统分析、数据流分析开放智能体进程/会话/归属关系观测。</p>
            </div>
          </section>
        ) : (
          <section className="space-y-4 rounded-[2rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.08),_transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-teal-600">Agent Health</div>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">智能体进程健康与孤儿处置</h2>
                <p className="mt-2 max-w-3xl text-sm text-slate-500">聚焦 Pod 内智能体进程、会话和任务归属关系，并仅对已判定为明确孤儿的进程开放手工处置。</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={selectedKillablePids.length === 0}
                  onClick={() => void killSelectedOrphans()}
                  className={`rounded-xl px-4 py-2 text-sm font-bold ${selectedKillablePids.length ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-slate-100 text-slate-400'}`}
                >
                  杀死选中孤儿
                </button>
                <button
                  type="button"
                  disabled={!orphanProcesses.some((item) => item.kill_allowed)}
                  onClick={() => void killAllOrphans()}
                  className={`rounded-xl px-4 py-2 text-sm font-bold ${orphanProcesses.some((item) => item.kill_allowed) ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-100 text-slate-400'}`}
                >
                  一键杀死全部明确孤儿
                </button>
              </div>
            </div>

            {agentState.error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{agentState.error}</div>
            ) : null}

            {activeServiceKey === 'dataflow-analysis' && agentState.summary?.aggregate_mode ? (
              <div className={`rounded-2xl border px-4 py-3 text-sm ${
                agentState.summary.aggregate_partial ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'
              }`}>
                <div className="font-semibold">
                  DFA Aggregate:
                  {' '}
                  mode={agentState.summary.aggregate_mode}
                  {' '}
                  sources={formatNumber(agentState.summary.aggregate_sources ?? 0)}
                  {' '}
                  errors={formatNumber(agentState.summary.aggregate_fanout_errors ?? 0)}
                </div>
                <div className="mt-1 text-xs opacity-85">
                  {agentState.summary.aggregate_partial
                    ? '当前是部分聚合结果，至少有一个 worker Pod 未成功返回智能体快照。'
                    : '当前是 API Pod 汇总的多 Pod 智能体视图。'}
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                  <span className="rounded-full bg-white/80 px-2 py-1">fanout {formatSeconds(agentState.summary.aggregate_duration_seconds ?? 0)}</span>
                  <span className="rounded-full bg-white/80 px-2 py-1">cache {agentState.summary.aggregate_cache_hit ? `hit ${formatSeconds(agentState.summary.aggregate_cache_age_seconds ?? 0)}` : 'miss'}</span>
                </div>
                {agentState.summary.aggregate_failed_targets?.length ? (
                  <div className="mt-2 text-[11px] opacity-90">
                    失败目标：{agentState.summary.aggregate_failed_targets.join(', ')}
                  </div>
                ) : null}
              </div>
            ) : null}

            {(selectedAgentTaskId || selectedAgentSessionId) ? (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-xs text-cyan-900">
                {selectedAgentTaskId ? <span className="rounded-full bg-white px-3 py-1 font-mono">task: {selectedAgentTaskId}</span> : null}
                {selectedAgentSessionId ? <span className="rounded-full bg-white px-3 py-1 font-mono">session: {selectedAgentSessionId}</span> : null}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAgentTaskId('');
                    setSelectedAgentSessionId('');
                  }}
                  className="rounded-full border border-cyan-200 bg-white px-3 py-1 font-semibold text-cyan-700 hover:bg-cyan-100"
                >
                  清除筛选
                </button>
              </div>
            ) : null}

            <div className="grid gap-3 xl:grid-cols-5">
              {[
                { label: '活跃进程', value: agentState.summary?.active_processes ?? 0, tone: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
                { label: '明确孤儿进程', value: agentState.summary?.orphan_processes ?? 0, tone: 'border-rose-200 bg-rose-50 text-rose-800' },
                { label: '可杀孤儿进程', value: agentState.summary?.killable_orphan_processes ?? 0, tone: 'border-orange-200 bg-orange-50 text-orange-800' },
                { label: '孤儿会话', value: agentState.summary?.orphan_sessions ?? 0, tone: 'border-amber-200 bg-amber-50 text-amber-800' },
                { label: '未知进程', value: agentState.summary?.unknown_processes ?? 0, tone: 'border-slate-200 bg-slate-50 text-slate-700' },
              ].map((item) => (
                <div key={item.label} className={`rounded-[1.4rem] border px-4 py-4 shadow-sm ${item.tone}`}>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em]">{item.label}</div>
                  <div className="mt-3 text-3xl font-black tracking-tight">{formatNumber(item.value)}</div>
                  <div className="mt-1 text-xs opacity-80">最近扫描 {formatTime(agentState.refreshedAt)}</div>
                </div>
              ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,2.4fr)_minmax(320px,1fr)]">
              <div className="rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Processes</div>
                    <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">实时进程表</h3>
                  </div>
                  {agentState.loading ? <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" />扫描中...</div> : null}
                </div>
                <div className="mt-4 overflow-auto rounded-2xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-3">选择</th>
                        <th className="px-3 py-3">Pod</th>
                        <th className="px-3 py-3">PID / PGID</th>
                        <th className="px-3 py-3">Task</th>
                        <th className="px-3 py-3">Stage / Role</th>
                        <th className="px-3 py-3">Session</th>
                        <th className="px-3 py-3">Memory</th>
                        <th className="px-3 py-3">Owner</th>
                        <th className="px-3 py-3">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredAgentProcesses.map((item) => {
                        const selected = selectedAgentPids.includes(item.pid);
                        const selectable = item.owner_kind === 'orphan' && item.kill_allowed;
                        return (
                          <tr key={`${item.pod_name}:${item.pid}`} className="hover:bg-slate-50">
                            <td className="px-3 py-3">
                              <input
                                type="checkbox"
                                checked={selected}
                                disabled={!selectable}
                                onChange={(event) => {
                                  setSelectedAgentPids((current) => event.target.checked ? [...current, item.pid] : current.filter((pid) => pid !== item.pid));
                                }}
                                className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                              />
                            </td>
                            <td className="px-3 py-3 font-mono text-[11px] text-slate-700">{item.pod_name}</td>
                            <td className="px-3 py-3 font-mono text-[11px] text-slate-700">
                              <div>{item.pid}</div>
                              <div className="text-slate-400">pgid {item.pgid ?? '-'}</div>
                            </td>
                            <td className="px-3 py-3">
                              <button type="button" onClick={() => setSelectedAgentTaskId(item.task_id || '')} className="text-left">
                                <div className="font-mono text-[11px] font-bold text-slate-800">{item.task_id || '-'}</div>
                                <div className="mt-1 max-w-[14rem] truncate text-[11px] text-slate-500">{item.task_name || '-'}</div>
                              </button>
                            </td>
                            <td className="px-3 py-3 text-slate-700">
                              <div>{item.stage_key || '-'}</div>
                              <div className="mt-1 text-[11px] text-slate-500">{item.role_kind || '-'}</div>
                            </td>
                            <td className="px-3 py-3">
                              <button
                                type="button"
                                onClick={() => setSelectedAgentSessionId(item.session_id || '')}
                                className="font-mono text-[11px] text-cyan-700 hover:underline"
                              >
                                {item.session_id || '-'}
                              </button>
                            </td>
                            <td className="px-3 py-3 text-slate-700">{formatBytes(item.rss_bytes)}</td>
                            <td className="px-3 py-3">
                              <div className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                                item.owner_kind === 'tracked'
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : item.owner_kind === 'orphan'
                                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                                    : 'border-slate-200 bg-slate-50 text-slate-600'
                              }`}>
                                {item.owner_kind}
                              </div>
                              <div className="mt-1 max-w-[14rem] text-[11px] text-slate-500">{item.kill_allowed ? item.owner_reason : (item.kill_block_reason || item.owner_reason)}</div>
                            </td>
                            <td className="px-3 py-3">
                              <button
                                type="button"
                                disabled={!selectable}
                                onClick={() => void killSingleOrphan(item)}
                                className={`rounded-lg px-3 py-1.5 text-[11px] font-bold ${selectable ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-slate-100 text-slate-400'}`}
                                title={!selectable ? (item.kill_block_reason || '仅明确孤儿可手工终止') : '杀死孤儿'}
                              >
                                杀死孤儿
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!filteredAgentProcesses.length ? <div className="px-4 py-10 text-center text-sm text-slate-500">当前没有可展示的智能体进程。</div> : null}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Exceptions</div>
                  <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">异常面板</h3>
                  <div className="mt-4 space-y-2">
                    {orphanProcesses.length ? orphanProcesses.slice(0, 8).map((item) => (
                      <div key={`orphan-${item.pid}`} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-mono text-xs font-bold text-rose-800">PID {item.pid}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${item.kill_allowed ? 'bg-white text-rose-700' : 'bg-slate-100 text-slate-500'}`}>
                            {item.kill_allowed ? '可处置' : '禁止'}
                          </span>
                        </div>
                        <div className="mt-2 text-[11px] text-rose-700">{item.owner_reason}</div>
                      </div>
                    )) : (
                      <div className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">当前未发现明确孤儿进程。</div>
                    )}
                  </div>
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Recent Manual Kill</div>
                    <div className="mt-3 space-y-2">
                      {agentKillHistory.length ? agentKillHistory.slice(0, 4).map((entry) => (
                        <div key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-bold text-slate-800">
                              {entry.scope === 'single' ? '单个处置' : entry.scope === 'selected' ? '选中批量处置' : '全部孤儿处置'}
                            </span>
                            <span className="text-[11px] text-slate-500">{formatTime(entry.createdAt)}</span>
                          </div>
                          <div className="mt-2 text-[11px] text-slate-600">
                            请求 {formatNumber(entry.response.requested)} / 命中 {formatNumber(entry.response.matched)} / 成功 {formatNumber(entry.response.succeeded)} / 失败 {formatNumber(entry.response.failed)} / 跳过 {formatNumber(entry.response.skipped)}
                          </div>
                          {entry.response.items?.length ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {entry.response.items.slice(0, 6).map((item) => (
                                <span
                                  key={`${entry.id}-${item.pid}-${item.status}`}
                                  className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                                    item.status === 'succeeded'
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : item.status === 'failed'
                                        ? 'bg-rose-100 text-rose-700'
                                        : 'bg-amber-100 text-amber-800'
                                  }`}
                                  title={item.reason || ''}
                                >
                                  PID {item.pid} · {item.status}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      )) : (
                        <div className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">当前还没有手工处置记录。</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Scan</div>
                  <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">扫描状态</h3>
                  <div className="mt-4 grid gap-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">最近扫描时间：{formatTime(agentState.refreshedAt)}</div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">扫描错误数：{formatNumber(agentState.summary?.scan_errors ?? 0)}</div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">Pod：{agentState.summary?.pod_name || '-'}</div>
                    {activeServiceKey === 'dataflow-analysis' ? (
                      <>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">Aggregate 模式：{agentState.summary?.aggregate_mode || '-'}</div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">成功来源数：{formatNumber(agentState.summary?.aggregate_sources ?? 0)}</div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">Fan-out 错误数：{formatNumber(agentState.summary?.aggregate_fanout_errors ?? 0)}</div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">Fan-out 耗时：{formatSeconds(agentState.summary?.aggregate_duration_seconds ?? 0)}</div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">缓存状态：{agentState.summary?.aggregate_cache_hit ? `命中 (${formatSeconds(agentState.summary?.aggregate_cache_age_seconds ?? 0)})` : '未命中'}</div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">是否部分结果：{agentState.summary?.aggregate_partial ? '是' : '否'}</div>
                        {agentState.summary?.aggregate_failed_targets?.length ? (
                          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                            <div className="font-semibold">失败目标</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {agentState.summary.aggregate_failed_targets.map((target) => (
                                <span key={target} className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-amber-800">{target}</span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Ownership</div>
                <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">任务-智能体归属关系</h3>
                <div className="mt-4 overflow-auto rounded-2xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-3">Task</th>
                        <th className="px-3 py-3">Stage</th>
                        <th className="px-3 py-3">Pod</th>
                        <th className="px-3 py-3">Process</th>
                        <th className="px-3 py-3">Session</th>
                        <th className="px-3 py-3">Roles</th>
                        <th className="px-3 py-3">Ownership</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredAgentTasks.map((item) => (
                        <tr key={item.task_id} className="hover:bg-slate-50">
                          <td className="px-3 py-3">
                            <button type="button" onClick={() => setSelectedAgentTaskId(item.task_id)} className="text-left">
                              <div className="font-mono text-[11px] font-bold text-slate-800">{item.task_id}</div>
                              <div className="mt-1 max-w-[16rem] truncate text-[11px] text-slate-500">{item.task_name}</div>
                            </button>
                          </td>
                          <td className="px-3 py-3 text-slate-700">{item.stage_key || '-'}</td>
                          <td className="px-3 py-3 font-mono text-[11px] text-slate-700">{item.pod_name}</td>
                          <td className="px-3 py-3 text-slate-700">{formatNumber(item.process_count)}</td>
                          <td className="px-3 py-3 text-slate-700">{formatNumber(item.session_count)}</td>
                          <td className="px-3 py-3 text-slate-700">{item.agent_roles.length ? item.agent_roles.join(', ') : '-'}</td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                              item.ownership_status === 'healthy'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : item.ownership_status === 'partial'
                                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                                  : 'border-slate-200 bg-slate-50 text-slate-600'
                            }`}>
                              {item.ownership_status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!filteredAgentTasks.length ? <div className="px-4 py-10 text-center text-sm text-slate-500">当前没有任务归属关系数据。</div> : null}
                </div>
              </div>

              <div className="rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Sessions</div>
                <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">会话列表与详情</h3>
                <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.4fr)]">
                  <div className="space-y-2">
                    {filteredAgentSessions.length ? filteredAgentSessions.map((item) => (
                      <button
                        key={`${item.session_file}:${item.session_id || ''}`}
                        type="button"
                        onClick={() => setSelectedAgentSessionId(item.session_id || '')}
                        className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                          selectedAgentSessionId === (item.session_id || '') ? 'border-cyan-300 bg-cyan-50' : 'border-slate-200 bg-slate-50 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-slate-800">{item.display_name}</div>
                            <div className="mt-1 truncate font-mono text-[11px] text-slate-500">{item.session_id || item.session_file}</div>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${item.orphan_session ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {item.orphan_session ? 'orphan' : (item.live ? 'live' : 'history')}
                          </span>
                        </div>
                        <div className="mt-2 text-[11px] text-slate-500">{item.task_id || '-'} / {item.role_kind || '-'}</div>
                      </button>
                    )) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">当前没有会话数据。</div>
                    )}
                  </div>

                  {selectedAgentSession ? (
                    <AgentSessionViewer
                      loading={agentSessionContentState.loading}
                      error={agentSessionContentState.error}
                      sessionMeta={selectedAgentSessionMeta}
                      events={agentSessionContentState.data?.events || []}
                      live={selectedAgentSession.live}
                    />
                  ) : (
                    <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
                      请选择左侧会话
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )
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
                  <h2 className="mt-2 text-lg font-black tracking-tight text-slate-900">当前展示的是二进制安全编排器聚合健康视图</h2>
                  <p className="mt-2 text-sm text-slate-600">
                    当前角色覆盖 {aggregateCoverage.successful}/{aggregateCoverage.attempted}。
                    {aggregateCoverage.partial
                      ? ' 当前为部分聚合结果，说明至少有一个预期角色没有成功提供聚合数据，数值可能偏低。'
                      : ' 当前结果已覆盖本次预期角色，可以作为编排层健康判断的主视图。'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {aggregateCoverage.attemptedByRole.map((item) => (
                    <span
                      key={item.role}
                      className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white px-3 py-1 text-xs font-bold text-slate-700"
                    >
                      {item.role}: {formatNumber(item.successful, 0)}/{formatNumber(item.attempted, 0)} 已覆盖
                    </span>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {binarySecurityObservabilityViewModel ? (
            <section className="space-y-4 rounded-[2rem] border border-emerald-200 bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.10),_transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-700">Binary Security Health</div>
                  <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">编排器诊断总览</h2>
                  <p className="mt-2 max-w-3xl text-sm text-slate-600">
                    这一屏优先回答“编排有没有卡住、聚合是否完整、状态事件是否积压、锁和归档是否拖慢收口”，不再把指标族数量当作核心 KPI。
                  </p>
                </div>
                <span className="inline-flex rounded-full border border-emerald-200 bg-white/85 px-3 py-1 text-xs font-black text-emerald-800">
                  诊断优先视图
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {binarySecurityObservabilityViewModel.overviewCards.map((item) => (
                  <div key={item.label} className="rounded-[1.4rem] border border-emerald-100 bg-white/90 px-4 py-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3 text-slate-500">
                      <span className="text-[11px] font-black uppercase tracking-[0.16em]">{item.label}</span>
                      <span>{item.icon}</span>
                    </div>
                    <div className={`mt-3 text-2xl font-black tracking-tight ${item.tone}`}>{item.value}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.hint}</div>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 xl:grid-cols-3">
                {binarySecurityObservabilityViewModel.alerts.map((alert) => (
                  <div key={alert.label} className={`rounded-2xl border px-4 py-3 shadow-sm ${alert.tone}`}>
                    <div className="text-sm font-black">{alert.label}</div>
                    <div className="mt-1 text-xs leading-5 opacity-90">{alert.text}</div>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                <ReducerMetricList title="编排推进摘要" items={binarySecurityObservabilityViewModel.pipelineSummary} emptyText="暂无编排摘要。" />
                <ReducerMetricList title="Reducer/锁摘要" items={binarySecurityObservabilityViewModel.reducerSummary} emptyText="暂无 reducer 摘要。" />
              </div>

              <ReducerMetricList title="后台同步摘要" items={binarySecurityObservabilityViewModel.syncSummary} emptyText="暂无后台同步摘要。" />

              <section className="rounded-[1.6rem] border border-cyan-200 bg-[linear-gradient(180deg,#f8fdff_0%,#ffffff_100%)] p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-700">Task List Query</div>
                    <h3 className="mt-2 text-lg font-black tracking-tight text-slate-900">任务列表查询性能</h3>
                    <p className="mt-2 max-w-3xl text-sm text-slate-600">
                      这里专门看 `binary-security` 任务列表读路径的总耗时和分段耗时，直接定位到底是总数统计、分页查询、项目统计、阶段聚合还是序列化拖慢了列表页。
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  {binarySecurityObservabilityViewModel.taskListPerformance.topCards.map((item) => (
                    <div key={item.label} className="rounded-2xl border border-cyan-100 bg-white px-4 py-4 shadow-sm">
                      <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{item.label}</div>
                      <div className={`mt-3 text-2xl font-black tracking-tight ${item.tone}`}>{item.value}</div>
                      <div className="mt-1 text-xs text-slate-500">{item.hint}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid gap-3 xl:grid-cols-3">
                  {binarySecurityObservabilityViewModel.taskListPerformance.alerts.map((alert) => (
                    <div key={alert.label} className={`rounded-2xl border px-4 py-3 shadow-sm ${alert.tone}`}>
                      <div className="text-sm font-black">{alert.label}</div>
                      <div className="mt-1 text-xs leading-5 opacity-90">{alert.text}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 overflow-auto rounded-2xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-3">查询分段</th>
                        <th className="px-3 py-3 text-right">P95</th>
                        <th className="px-3 py-3 text-right">均值</th>
                        <th className="px-3 py-3 text-right">样本数</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {binarySecurityObservabilityViewModel.taskListPerformance.stageRows.length ? (
                        binarySecurityObservabilityViewModel.taskListPerformance.stageRows.map((item) => (
                          <tr key={item.stage} className="hover:bg-slate-50">
                            <td className="px-3 py-3 font-semibold text-slate-800">{item.stage}</td>
                            <td className={`px-3 py-3 text-right font-mono text-[11px] font-black ${item.tone}`}>{formatSeconds(item.p95Seconds)}</td>
                            <td className="px-3 py-3 text-right font-mono text-[11px] text-slate-700">{formatSeconds(item.avgSeconds)}</td>
                            <td className="px-3 py-3 text-right font-mono text-[11px] text-slate-700">{formatNumber(item.count)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                            当前还没有采集到任务列表分段耗时样本。
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {binarySecurityObservabilityViewModel.groupCounts.map((item) => (
                  <div key={item.group} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">{GROUP_LABELS[item.group]}</div>
                    <div className="mt-1 text-base font-black text-slate-800">{formatNumber(item.count)}</div>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <section className={`grid gap-4 ${dataflowVulnOverviewViewModel ? 'md:grid-cols-2 xl:grid-cols-4' : 'xl:grid-cols-4'}`}>
              {dataflowVulnOverviewViewModel
                ? dataflowVulnOverviewViewModel.topCards.map((item) => <HeadlineMetricCard key={item.label} label={item.label} value={item.value} hint={item.hint} tone={item.tone} />)
                : viewModel.kpis.map((item) => <MetricCard key={item.label} label={item.label} value={item.value} icon={item.icon} />)}
            </section>
          )}

          {dataflowAnalysisViewModel ? (
            <section className="space-y-4 rounded-[2rem] border border-teal-200 bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.10),_transparent_36%),linear-gradient(180deg,#ffffff_0%,#f0fdfa_100%)] p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.2em] text-teal-700">Dataflow Analysis Cluster</div>
                  <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900">数据流分析聚合观测</h2>
                  <p className="mt-2 max-w-3xl text-sm text-slate-600">
                    当前展示的是 DFA `metrics/aggregate` 聚合视图，不再只看 API Pod。本区重点看积压、租约/心跳健康、时延、失败归因和 token/trace 复杂度。
                  </p>
                </div>
                <span className="inline-flex rounded-full border border-teal-200 bg-white/80 px-3 py-1 text-xs font-black text-teal-800">
                  aggregate {formatMetricValue(metricValueByName(viewModel.rows, 'secflow_dfa_metrics_aggregate_up') ?? Number.NaN)} / db{' '}
                  {formatMetricValue(metricValueByName(viewModel.rows, 'secflow_dfa_db_up') ?? Number.NaN)}
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                {dataflowAnalysisViewModel.kpis.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-teal-100 bg-white/85 px-4 py-3 shadow-sm">
                    <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{item.label}</div>
                    <div className={`mt-2 text-xl font-black ${item.tone}`}>{item.value}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.hint}</div>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 xl:grid-cols-3">
                {dataflowAnalysisViewModel.alerts.map((alert) => (
                  <div key={alert.label} className={`rounded-2xl border px-4 py-3 shadow-sm ${alert.tone}`}>
                    <div className="text-sm font-black">{alert.label}</div>
                    <div className="mt-1 text-xs leading-5 opacity-90">{alert.text}</div>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
                <div className="rounded-[1.6rem] border border-teal-100 bg-white/90 p-4 shadow-sm">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">负载与成本</div>
                  <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">Queue / Runtime / Token</h3>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {dataflowAnalysisViewModel.loadCards.map((item) => (
                      <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{item.label}</div>
                        <div className={`mt-2 text-lg font-black ${item.tone}`}>{item.value}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.hint}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1.6rem] border border-teal-100 bg-white/90 p-4 shadow-sm">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">失败与调度</div>
                  <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">Failure Category / Dispatch</h3>
                  <div className="mt-4 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {dataflowAnalysisViewModel.failureCategories.length ? (
                        dataflowAnalysisViewModel.failureCategories.slice(0, 6).map((item) => (
                          <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{item.label}</div>
                            <div className={`mt-2 text-lg font-black ${item.tone}`}>{formatNumber(item.value)}</div>
                            <div className="mt-1 text-xs text-slate-500">cluster failure category snapshot</div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 sm:col-span-2">
                          当前没有 failure category 聚合指标。
                        </div>
                      )}
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                      <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Dispatch Summary</div>
                      <div className="mt-3 space-y-2">
                        {dataflowAnalysisViewModel.dispatchSummary.length ? (
                          dataflowAnalysisViewModel.dispatchSummary.map((item) => (
                            <div key={item.label} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                              <div className="min-w-0 truncate text-sm font-semibold text-slate-700">{item.label}</div>
                              <div className={`font-mono text-sm font-black ${item.tone}`}>{formatNumber(item.value)}</div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">当前没有 dispatch 聚合指标。</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.6rem] border border-teal-100 bg-white/90 p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Worker Detail</div>
                      <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">执行槽位明细</h3>
                      <p className="mt-2 max-w-3xl text-sm text-slate-500">
                      任务列表首屏与摘要视图使用轻量 summary；此处仍按需读取 DFA worker cluster capacity 明细，用于核对聚合指标背后的具体 owner / task 归属。
                      </p>
                    </div>
                  <div className="text-right text-xs text-slate-400">
                    <div>最近刷新</div>
                    <div className="mt-1 font-semibold text-slate-500">{formatTime(dfaWorkerDetailState.refreshedAt)}</div>
                  </div>
                </div>
                {selectedDfaWorkerFilter ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-xs text-cyan-800">
                    <span className="font-bold">已联动筛选 Worker：</span>
                    <span className="rounded-full bg-white px-2 py-1 font-mono">{selectedDfaWorkerFilter}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedDfaWorkerFilter('')}
                      className="rounded-full border border-cyan-200 bg-white px-2 py-1 font-semibold text-cyan-700 hover:bg-cyan-100"
                    >
                      清除筛选
                    </button>
                  </div>
                ) : null}
                {dfaWorkerDetailState.loading ? (
                  <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 size={16} className="animate-spin" />
                    正在读取 worker 明细...
                  </div>
                ) : dfaWorkerDetailState.error && !dfaWorkerDetailState.data ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                    暂无 worker 明细：{dfaWorkerDetailState.error}
                  </div>
                ) : (
                  <>
                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      {[
                        { label: 'Worker 数', value: dfaWorkerDetailState.data?.worker_count ?? '-', hint: `健康 ${dfaWorkerDetailState.data?.healthy_workers ?? 0} / 失联 ${dfaWorkerDetailState.data?.stale_workers ?? 0}` },
                        { label: '总槽位', value: dfaWorkerDetailState.data?.total_capacity ?? '-', hint: 'worker max_concurrent_jobs 汇总' },
                        { label: '运行中', value: dfaWorkerDetailState.data?.running_jobs ?? '-', hint: 'active running jobs' },
                        { label: '空闲 / 排队', value: `${dfaWorkerDetailState.data?.available_slots ?? '-'} / ${dfaWorkerDetailState.data?.queued_jobs ?? '-'}`, hint: 'available slots / queued jobs' },
                      ].map((item) => (
                        <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{item.label}</div>
                          <div className="mt-2 text-lg font-black text-slate-900">{item.value}</div>
                          <div className="mt-1 text-xs text-slate-500">{item.hint}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 space-y-3">
                      {(dfaWorkerDetailState.data?.workers || []).length ? (
                        dfaWorkerDetailState.data?.workers.map((worker) => (
                          <div
                            key={worker.worker_id}
                            onClick={() => setSelectedDfaWorkerFilter((current) => current === worker.worker_id ? '' : worker.worker_id)}
                            className={`rounded-2xl border px-4 py-4 ${
                              worker.healthy ? 'border-slate-200 bg-slate-50/70' : 'border-rose-200 bg-rose-50/80'
                            } ${selectedDfaWorkerFilter === worker.worker_id ? 'ring-2 ring-cyan-300 ring-offset-1' : 'cursor-pointer hover:border-cyan-200'}`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-sm font-black text-slate-900">{worker.host_name || worker.worker_id}</div>
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${worker.healthy ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                    {worker.healthy ? 'healthy' : 'unhealthy'}
                                  </span>
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                    活动任务 {worker.active_jobs.length}
                                  </span>
                                </div>
                                <div className="mt-1 font-mono text-[11px] text-slate-400 break-all">{worker.worker_id}</div>
                                <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                                  <span>槽位 {worker.running_jobs}/{worker.max_concurrent_jobs}</span>
                                  <span>空闲 {worker.available_slots}</span>
                                  <span>来源 {worker.source || 'worker_registry'}</span>
                                  <span>心跳 {worker.last_heartbeat_at ? formatTime(new Date(worker.last_heartbeat_at).getTime()) : '-'}</span>
                                </div>
                                <div className="mt-2 text-[11px] text-cyan-700">点击可联动过滤下方 Prometheus Samples</div>
                                {worker.error ? <div className="mt-2 text-xs text-rose-600">{worker.error}</div> : null}
                              </div>
                            </div>
                            <div className="mt-3 grid gap-2 lg:grid-cols-2">
                              {worker.active_jobs.length ? (
                                worker.active_jobs.map((job) => (
                                  <div key={`${worker.worker_id}:${job.task_id}`} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="min-w-0 truncate text-sm font-bold text-slate-900" title={job.task_name}>{job.task_name}</div>
                                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{job.status}</span>
                                    </div>
                                    <div className="mt-2 space-y-1 text-xs text-slate-500">
                                      <div className="font-mono break-all">task_id: {job.task_id}</div>
                                      <div className="truncate" title={job.input_path}>input: {job.input_path}</div>
                                      <div>dispatch: {job.dispatch_status || '-'}</div>
                                      <div>lease: {job.execution_lease_until ? formatTime(new Date(job.execution_lease_until).getTime()) : '-'}</div>
                                      <div>heartbeat: {job.execution_heartbeat_at ? formatTime(new Date(job.execution_heartbeat_at).getTime()) : '-'}</div>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 lg:col-span-2">
                                  当前无活跃任务。
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                          当前未发现可用的 DFA worker 明细。
                        </div>
                      )}
                    </div>
                    {dfaWorkerDetailState.error ? (
                      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        聚合指标已更新，但 worker 明细抓取有告警：{dfaWorkerDetailState.error}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </section>
          ) : null}

          {entryAnalysisViewModel ? (
            <section className="space-y-4 rounded-[2rem] border border-indigo-200 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.10),_transparent_36%),linear-gradient(180deg,#ffffff_0%,#eef2ff_100%)] p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.2em] text-indigo-700">Entry Analysis Business</div>
                  <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900">入口分析业务聚合观测</h2>
                  <p className="mt-2 max-w-3xl text-sm text-slate-600">
                    面向服务级聚合快照，重点看排队、执行、轮次、Worker/Judge 负载以及失败归因；这里不是单任务的 R1/R2/R3/R4 详情页，而是集群级健康视图。
                  </p>
                </div>
                <span className="inline-flex rounded-full border border-indigo-200 bg-white/80 px-3 py-1 text-xs font-black text-indigo-800">
                  retry {formatNumber(metricValueByName(viewModel.rows, 'secflow_ea_retry_total'))} / timeout {formatNumber(metricValueByName(viewModel.rows, 'secflow_ea_timeout_total'))}
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                {entryAnalysisViewModel.kpis.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-indigo-100 bg-white/85 px-4 py-3 shadow-sm">
                    <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{item.label}</div>
                    <div className={`mt-2 text-xl font-black ${item.tone}`}>{item.value}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.hint}</div>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 xl:grid-cols-3">
                {entryAnalysisViewModel.riskAlerts.map((alert) => (
                  <div key={alert.label} className={`rounded-2xl border px-4 py-3 shadow-sm ${alert.tone}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-black">{alert.label}</div>
                        <div className="mt-1 text-xs leading-5 opacity-85">{alert.text}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const focus = focusedEntryStageRow?.stage || selectedEntryStage;
                          if (focus && focus !== 'all') sessionStorage.setItem(ENTRY_ANALYSIS_STAGE_FOCUS_STORAGE_KEY, String(focus));
                          else sessionStorage.removeItem(ENTRY_ANALYSIS_STAGE_FOCUS_STORAGE_KEY);
                          sessionStorage.setItem(ENTRY_ANALYSIS_RISK_FOCUS_STORAGE_KEY, entryAnalysisRiskKeyFromLabel(alert.label));
                          window.dispatchEvent(new CustomEvent('secflow-navigate-view', { detail: { view: 'entry-analysis-task' } }));
                        }}
                        className="rounded-xl border border-current/20 bg-white/70 px-3 py-2 text-[11px] font-black transition hover:bg-white"
                      >
                        带着风险排查
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                <div className="rounded-[1.6rem] border border-indigo-100 bg-white/90 p-4 shadow-sm">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">角色与吞吐</div>
                  <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">Worker / Judge / Session 负载</h3>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {entryAnalysisViewModel.roleSummary.map((item) => (
                      <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{item.label}</div>
                        <div className={`mt-2 text-lg font-black ${item.tone}`}>{item.value}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.hint}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1.6rem] border border-indigo-100 bg-white/90 p-4 shadow-sm">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">失败与模块</div>
                  <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">异常归因 / Top Modules</h3>
                  <div className="mt-4 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {entryAnalysisViewModel.failureSummary.map((item) => (
                        <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{item.label}</div>
                          <div className={`mt-2 text-lg font-black ${item.tone}`}>{formatMetricValue(item.value ?? Number.NaN)}</div>
                          <div className="mt-1 text-xs text-slate-500">{item.hint}</div>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                      <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">模块热度</div>
                      <div className="mt-3 space-y-2">
                        {entryAnalysisViewModel.topModules.length ? (
                          entryAnalysisViewModel.topModules.map((item) => (
                            <div key={item.name} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                              <div className="min-w-0 truncate text-sm font-semibold text-slate-700">{item.name}</div>
                              <div className="font-mono text-sm font-black text-indigo-700">{formatNumber(item.value)}</div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">当前没有模块级聚合指标。</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.6rem] border border-indigo-100 bg-white/90 p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Worker Detail</div>
                    <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">执行槽位明细</h3>
                    <p className="mt-2 max-w-3xl text-sm text-slate-500">
                      直接复用入口分析任务页的槽位聚合接口，和任务页保持同一口径，用于从性能看板快速下钻到具体 worker / owner / active task。
                    </p>
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    <div>最近刷新</div>
                    <div className="mt-1 font-semibold text-slate-500">{formatTime(entryWorkerDetailState.refreshedAt)}</div>
                  </div>
                </div>
                {selectedEntryWorkerFilter ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs text-indigo-800">
                    <span className="font-bold">已联动筛选 Worker：</span>
                    <span className="rounded-full bg-white px-2 py-1 font-mono">{selectedEntryWorkerFilter}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedEntryWorkerFilter('')}
                      className="rounded-full border border-indigo-200 bg-white px-2 py-1 font-semibold text-indigo-700 hover:bg-indigo-100"
                    >
                      清除筛选
                    </button>
                  </div>
                ) : null}
                {entryWorkerDetailState.loading ? (
                  <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 size={16} className="animate-spin" />
                    正在读取 worker 明细...
                  </div>
                ) : entryWorkerDetailState.error && !entryWorkerDetailState.data ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                    暂无 worker 明细：{entryWorkerDetailState.error}
                  </div>
                ) : (
                  <>
                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      {[
                        { label: 'Worker 数', value: entryWorkerDetailState.data?.worker_count ?? '-', hint: '完整集群可见 worker 数' },
                        { label: '总槽位', value: entryWorkerDetailState.data?.total_capacity ?? '-', hint: 'worker max_concurrent_jobs 汇总' },
                        { label: '运行中', value: entryWorkerDetailState.data?.running_jobs ?? '-', hint: 'active running jobs' },
                        { label: '空闲 / 排队', value: `${entryWorkerDetailState.data?.available_slots ?? '-'} / ${entryWorkerDetailState.data?.queued_jobs ?? '-'}`, hint: 'available slots / queued jobs' },
                      ].map((item) => (
                        <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{item.label}</div>
                          <div className="mt-2 text-lg font-black text-slate-900">{item.value}</div>
                          <div className="mt-1 text-xs text-slate-500">{item.hint}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 space-y-3">
                      {(entryWorkerDetailState.data?.workers || []).length ? (
                        entryWorkerDetailState.data?.workers.map((worker) => (
                          <div
                            key={worker.worker_id}
                            onClick={() => setSelectedEntryWorkerFilter((current) => current === worker.worker_id ? '' : worker.worker_id)}
                            className={`rounded-2xl border px-4 py-4 ${
                              worker.healthy ? 'border-slate-200 bg-slate-50/70' : 'border-rose-200 bg-rose-50/80'
                            } ${selectedEntryWorkerFilter === worker.worker_id ? 'ring-2 ring-indigo-300 ring-offset-1' : 'cursor-pointer hover:border-indigo-200'}`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-sm font-black text-slate-900">{worker.pod_name || worker.worker_id}</div>
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${worker.healthy ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                    {worker.healthy ? 'healthy' : worker.source === 'stale_owner' ? 'stale owner' : 'unhealthy'}
                                  </span>
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                    活动任务 {worker.active_tasks.length}
                                  </span>
                                </div>
                                <div className="mt-1 font-mono text-[11px] text-slate-400 break-all">{worker.url || worker.pod_ip || worker.worker_id}</div>
                                <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                                  <span>槽位 {worker.running_jobs}/{worker.max_concurrent_jobs}</span>
                                  <span>空闲 {worker.available_slots}</span>
                                  <span>来源 {worker.source || 'worker_registry'}</span>
                                  <span>心跳 {worker.last_heartbeat_at ? formatTime(new Date(worker.last_heartbeat_at).getTime()) : '-'}</span>
                                </div>
                                <div className="mt-2 text-[11px] text-indigo-700">点击可联动过滤下方 Prometheus Samples</div>
                                {worker.error ? <div className="mt-2 text-xs text-rose-600">{worker.error}</div> : null}
                              </div>
                            </div>
                            <div className="mt-3 grid gap-2 lg:grid-cols-2">
                              {worker.active_tasks.length ? (
                                worker.active_tasks.map((job) => (
                                  <div key={`${worker.worker_id}:${job.task_id}`} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="min-w-0 truncate text-sm font-bold text-slate-900" title={job.task_id}>{job.task_id}</div>
                                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{job.status}</span>
                                    </div>
                                    <div className="mt-2 space-y-1 text-xs text-slate-500">
                                      <div className="font-mono break-all">task_id: {job.task_id}</div>
                                      <div className="truncate" title={job.entry_id || '-'}>entry: {job.entry_id || '-'}</div>
                                      <div>owner: {worker.pod_name || worker.worker_id}</div>
                                      <div>lease: {job.lease_expires_at ? formatTime(new Date(job.lease_expires_at).getTime()) : '-'}</div>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 lg:col-span-2">
                                  当前无活跃任务。
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                          当前未发现可用的入口分析 worker 明细。
                        </div>
                      )}
                    </div>
                    {entryWorkerDetailState.error ? (
                      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        聚合指标已更新，但 worker 明细抓取有告警：{entryWorkerDetailState.error}
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                {entryAnalysisViewModel.stageCards.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-indigo-100 bg-white/85 px-4 py-3 shadow-sm">
                    <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{item.label}</div>
                    <div className={`mt-2 text-xl font-black ${item.tone}`}>{item.value}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.hint}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-[1.6rem] border border-indigo-100 bg-white/90 p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">阶段聚焦</div>
                    <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">按阶段查看诊断</h3>
                    <div className="mt-1 text-xs text-slate-500">点击阶段后会切换到对应的诊断卡，并支持把下方原始指标表过滤到该阶段。</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedEntryStage('all')}
                      className={`rounded-full border px-3 py-1 text-xs font-black transition ${
                        selectedEntryStage === 'all' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white'
                      }`}
                    >
                      全部阶段
                    </button>
                    {entryAnalysisViewModel.stageRows.map((item) => (
                      <button
                        key={item.stage}
                        type="button"
                        onClick={() => setSelectedEntryStage(item.stage as 'R1' | 'R2' | 'R3' | 'R4')}
                        className={`rounded-full border px-3 py-1 text-xs font-black transition ${
                          selectedEntryStage === item.stage ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white'
                        }`}
                      >
                        {item.stage}
                      </button>
                    ))}
                  </div>
                </div>

                {focusedEntryStageRow ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                    {[
                      { label: '阶段样本', value: formatNumber(focusedEntryStageRow.totalRuns, 0), hint: 'stage_rounds total', tone: focusedEntryStageRow.healthTone },
                      { label: '通过 / 失败', value: `${formatNumber(focusedEntryStageRow.passedRuns, 0)} / ${formatNumber(focusedEntryStageRow.failedRuns, 0)}`, hint: 'passed / failed', tone: focusedEntryStageRow.failedRuns > focusedEntryStageRow.passedRuns ? 'text-rose-700' : 'text-emerald-700' },
                      { label: '重试 / 运行中', value: `${formatNumber(focusedEntryStageRow.retryRuns, 0)} / ${formatNumber(focusedEntryStageRow.runningRuns, 0)}`, hint: 'retry / running', tone: focusedEntryStageRow.retryRuns > 0 || focusedEntryStageRow.runningRuns > 0 ? 'text-amber-700' : 'text-slate-900' },
                      { label: '平均耗时', value: formatSeconds(focusedEntryStageRow.avgDurationSeconds), hint: 'stage_duration_seconds 均值', tone: (focusedEntryStageRow.avgDurationSeconds || 0) > 180 ? 'text-rose-700' : 'text-slate-900' },
                      { label: 'Worker / Judge', value: `${formatNumber(focusedEntryStageRow.workerCalls, 0)} / ${formatNumber(focusedEntryStageRow.judgeCalls, 0)}`, hint: 'stage_role_total', tone: 'text-indigo-700' },
                      { label: 'Sessions', value: formatNumber(focusedEntryStageRow.sessionCount, 0), hint: 'stage_session_total', tone: focusedEntryStageRow.sessionCount > 0 ? 'text-slate-900' : 'text-amber-700' },
                    ].map((item) => (
                      <div key={item.label} className="rounded-2xl border border-indigo-100 bg-indigo-50/40 px-4 py-3">
                        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{item.label}</div>
                        <div className={`mt-2 text-xl font-black ${item.tone}`}>{item.value}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.hint}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">当前展示全部阶段总览，选择一个阶段即可进入聚焦诊断。</div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!focusedEntryStageRow) return;
                      setSearchKeyword(`stage=${focusedEntryStageRow.stage.toLowerCase()}`);
                    }}
                    disabled={!focusedEntryStageRow}
                    className={`rounded-xl border px-3 py-2 text-xs font-black transition ${
                      focusedEntryStageRow ? 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100' : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
                    }`}
                  >
                    在原始指标中过滤当前阶段
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEntryStage('all');
                      setSearchKeyword('');
                    }}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-white"
                  >
                    清空阶段聚焦
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const focus = focusedEntryStageRow?.stage || selectedEntryStage;
                      if (focus && focus !== 'all') sessionStorage.setItem(ENTRY_ANALYSIS_STAGE_FOCUS_STORAGE_KEY, String(focus));
                      else sessionStorage.removeItem(ENTRY_ANALYSIS_STAGE_FOCUS_STORAGE_KEY);
                      sessionStorage.removeItem(ENTRY_ANALYSIS_RISK_FOCUS_STORAGE_KEY);
                      window.dispatchEvent(new CustomEvent('secflow-navigate-view', { detail: { view: 'entry-analysis-task' } }));
                    }}
                    className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700 transition hover:bg-indigo-100"
                  >
                    前往入口分析任务页
                  </button>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <div className="rounded-[1.6rem] border border-indigo-100 bg-white/90 p-4 shadow-sm">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">阶段状态图</div>
                  <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">R1 / R2 / R3 / R4 运行态</h3>
                  <div className="mt-4 h-72">
                    {entryAnalysisViewModel.stageStatusChart.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={entryAnalysisViewModel.stageStatusChart} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                          <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                          <Tooltip formatter={(value: number) => formatMetricValue(Number(value))} />
                          <Bar dataKey="passed" stackId="stage" fill="#10b981" radius={[6, 6, 0, 0]} onClick={(data) => setSelectedEntryStage(String(data?.name || 'all') as 'R1' | 'R2' | 'R3' | 'R4' | 'all')} />
                          <Bar dataKey="failed" stackId="stage" fill="#ef4444" radius={[6, 6, 0, 0]} onClick={(data) => setSelectedEntryStage(String(data?.name || 'all') as 'R1' | 'R2' | 'R3' | 'R4' | 'all')} />
                          <Bar dataKey="retry" stackId="stage" fill="#f59e0b" radius={[6, 6, 0, 0]} onClick={(data) => setSelectedEntryStage(String(data?.name || 'all') as 'R1' | 'R2' | 'R3' | 'R4' | 'all')} />
                          <Bar dataKey="running" stackId="stage" fill="#0ea5e9" radius={[6, 6, 0, 0]} onClick={(data) => setSelectedEntryStage(String(data?.name || 'all') as 'R1' | 'R2' | 'R3' | 'R4' | 'all')} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyCard text="当前还没有阶段级指标样本。" />
                    )}
                  </div>
                </div>

                <div className="rounded-[1.6rem] border border-indigo-100 bg-white/90 p-4 shadow-sm">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">阶段健康矩阵</div>
                  <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">阶段级诊断明细</h3>
                  <div className="mt-4 overflow-auto rounded-2xl border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-3 py-3">阶段</th>
                          <th className="px-3 py-3">样本</th>
                          <th className="px-3 py-3">通过</th>
                          <th className="px-3 py-3">失败</th>
                          <th className="px-3 py-3">重试</th>
                          <th className="px-3 py-3">运行中</th>
                          <th className="px-3 py-3">平均耗时</th>
                          <th className="px-3 py-3">Worker/Judge</th>
                          <th className="px-3 py-3">Sessions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {entryAnalysisViewModel.stageRows.length ? (
                          entryAnalysisViewModel.stageRows.map((item) => (
                            <tr key={item.stage} className={`cursor-pointer hover:bg-slate-50 ${selectedEntryStage === item.stage ? 'bg-indigo-50/70' : ''}`} onClick={() => setSelectedEntryStage(item.stage as 'R1' | 'R2' | 'R3' | 'R4')}>
                              <td className="px-3 py-3">
                                <div className={`font-black ${item.healthTone}`}>{item.stage}</div>
                              </td>
                              <td className="px-3 py-3 font-mono text-slate-800">{formatNumber(item.totalRuns, 0)}</td>
                              <td className="px-3 py-3 font-mono text-emerald-700">{formatNumber(item.passedRuns, 0)}</td>
                              <td className="px-3 py-3 font-mono text-rose-700">{formatNumber(item.failedRuns, 0)}</td>
                              <td className="px-3 py-3 font-mono text-amber-700">{formatNumber(item.retryRuns, 0)}</td>
                              <td className="px-3 py-3 font-mono text-sky-700">{formatNumber(item.runningRuns, 0)}</td>
                              <td className="px-3 py-3 font-mono text-slate-800">{formatSeconds(item.avgDurationSeconds)}</td>
                              <td className="px-3 py-3 font-mono text-slate-800">
                                {formatNumber(item.workerCalls, 0)} / {formatNumber(item.judgeCalls, 0)}
                              </td>
                              <td className="px-3 py-3 font-mono text-slate-800">{formatNumber(item.sessionCount, 0)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">
                              当前没有阶段级样本。
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {b2sBusinessViewModel ? (
            <section className="rounded-[2rem] border border-cyan-200 bg-[radial-gradient(circle_at_top_left,_rgba(6,182,212,0.12),_transparent_35%),linear-gradient(180deg,#ffffff_0%,#ecfeff_100%)] p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-700">Binary To Source Business</div>
                  <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900">二进制逆向业务指标</h2>
                  <p className="mt-2 max-w-3xl text-sm text-slate-600">
                    来自 PI 任务内部埋点，不从日志反推；用于观察头文件还原、函数体还原、批次吞吐、Token/成本与产物规模。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex rounded-full border border-cyan-200 bg-white/80 px-3 py-1 text-xs font-black text-cyan-800">
                    覆盖率 {b2sBusinessViewModel.coverageRate == null ? '-' : `${formatNumber(b2sBusinessViewModel.coverageRate, 1)}%`}
                  </span>
                  <span className="inline-flex rounded-full border border-cyan-200 bg-white/80 px-3 py-1 text-xs font-black text-cyan-800">
                    最近样本 {formatTime(b2sBusinessViewModel.latestSeenAt)}
                  </span>
                </div>
              </div>
              {(b2sBusinessViewModel.availableItems || 0) <= 0 ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
                  <div className="text-sm font-black text-amber-900">暂无有效 runtime metrics 样本</div>
                  <p className="mt-1 text-sm text-amber-800">
                    当前 B2S 已看到 {formatNumber(b2sBusinessViewModel.missingItems)} 个缺失项。看板不会用缺失样本推导平均耗时，避免把旧任务或尚未上报的任务误读为 0。
                  </p>
                  {b2sBusinessViewModel.missingReasons.length ? (
                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                      {b2sBusinessViewModel.missingReasons.map((item) => (
                        <div key={item.reason} className="rounded-xl border border-amber-100 bg-white/80 px-3 py-2">
                          <div className="text-[11px] font-black uppercase tracking-[0.14em] text-amber-600">{item.reason}</div>
                          <div className="mt-1 text-lg font-black text-amber-900">{formatNumber(item.value)}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-cyan-700">任务历史聚合（终态样本）</div>
                  <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    {[
                      { label: '头文件平均耗时', value: formatSeconds(b2sBusinessViewModel.headerAvgSeconds), hint: 'terminal header_synthesis', tone: 'text-cyan-900' },
                      { label: '函数体平均耗时', value: formatSeconds(b2sBusinessViewModel.bodyAvgSeconds), hint: 'terminal body_generation', tone: 'text-cyan-900' },
                      { label: '批次平均耗时', value: formatSeconds(b2sBusinessViewModel.batchAvgSeconds), hint: 'batch duration', tone: 'text-cyan-900' },
                      { label: '加权函数吞吐', value: `${formatNumber(b2sBusinessViewModel.weightedFunctionThroughput ?? b2sBusinessViewModel.functionThroughput, 3)} /s`, hint: 'completed functions / body seconds', tone: 'text-emerald-700' },
                      { label: '覆盖率', value: b2sBusinessViewModel.coverageRate == null ? '-' : `${formatNumber(b2sBusinessViewModel.coverageRate, 1)}%`, hint: `available ${formatNumber(b2sBusinessViewModel.availableItems)} / missing ${formatNumber(b2sBusinessViewModel.missingItems)}`, tone: (b2sBusinessViewModel.missingItems || 0) > 0 ? 'text-amber-700' : 'text-emerald-700' },
                      { label: '批次重试率', value: b2sBusinessViewModel.batchRetryRate == null ? '-' : `${formatNumber(b2sBusinessViewModel.batchRetryRate * 100, 1)}%`, hint: 'extra attempts / attempts', tone: (b2sBusinessViewModel.batchRetryRate || 0) > 0.1 ? 'text-amber-700' : 'text-emerald-700' },
                      { label: '校验通过率', value: b2sBusinessViewModel.batchValidationPassRate == null ? '-' : `${formatNumber(b2sBusinessViewModel.batchValidationPassRate * 100, 1)}%`, hint: 'passed batches / batches', tone: (b2sBusinessViewModel.batchValidationPassRate || 0) < 0.9 ? 'text-amber-700' : 'text-emerald-700' },
                      { label: '失败批次占比', value: b2sBusinessViewModel.batchFailureRate == null ? '-' : `${formatNumber(b2sBusinessViewModel.batchFailureRate * 100, 1)}%`, hint: 'failed batches / batches', tone: (b2sBusinessViewModel.batchFailureRate || 0) > 0 ? 'text-rose-700' : 'text-emerald-700' },
                      { label: '平均 Attempts', value: formatNumber(b2sBusinessViewModel.avgAttemptsPerBatch, 2), hint: 'attempts per batch', tone: (b2sBusinessViewModel.avgAttemptsPerBatch || 0) > 1.2 ? 'text-amber-700' : 'text-slate-900' },
                      { label: 'Token / 成本', value: `${formatNumber(b2sBusinessViewModel.tokenTotal)} / ${formatMetricValue(b2sBusinessViewModel.costTotal ?? Number.NaN)}`, hint: 'runtime llm summary', tone: 'text-indigo-700' },
                      { label: '同步候选任务', value: formatNumber(b2sBusinessViewModel.syncCandidates), hint: '后台状态同步器当前关注的活跃任务', tone: (b2sBusinessViewModel.syncCandidates || 0) > 0 ? 'text-cyan-700' : 'text-slate-900' },
                      { label: '最近同步结果', value: `${formatNumber(b2sBusinessViewModel.syncLastSucceeded)} / ${formatNumber(b2sBusinessViewModel.syncLastAttempted)}`, hint: `changed ${formatNumber(b2sBusinessViewModel.syncLastChanged)} · failed ${formatNumber(b2sBusinessViewModel.syncLastFailed)}`, tone: (b2sBusinessViewModel.syncLastFailed || 0) > 0 ? 'text-rose-700' : 'text-emerald-700' },
                      { label: '同步耗时', value: formatSeconds(b2sBusinessViewModel.syncLastDurationSeconds), hint: `最近运行 ${formatTime(b2sBusinessViewModel.syncLastRunAt)}`, tone: (b2sBusinessViewModel.syncLastDurationSeconds || 0) > 5 ? 'text-amber-700' : 'text-slate-900' },
                      { label: '累计同步异常', value: formatNumber(b2sBusinessViewModel.syncTotalFailedTasks), hint: `ticks ${formatNumber(b2sBusinessViewModel.syncTotalTicks)}`, tone: (b2sBusinessViewModel.syncTotalFailedTasks || 0) > 0 ? 'text-rose-700' : 'text-emerald-700' },
                    ].map((item) => (
                      <div key={item.label} className="rounded-2xl border border-cyan-100 bg-white/80 px-4 py-3 shadow-sm">
                        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{item.label}</div>
                        <div className={`mt-2 text-xl font-black ${item.tone}`}>{item.value}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.hint}</div>
                      </div>
                    ))}
                  </div>
                  {b2sBusinessViewModel.runningHeaderAvgSeconds != null || b2sBusinessViewModel.runningBodyAvgSeconds != null ? (
                    <>
                      <div className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-cyan-700">运行中实时指标（不参与历史均值）</div>
                      <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        {[
                          { label: '运行中头文件耗时', value: formatSeconds(b2sBusinessViewModel.runningHeaderAvgSeconds), hint: 'running header_synthesis', tone: 'text-cyan-900' },
                          { label: '运行中函数体耗时', value: formatSeconds(b2sBusinessViewModel.runningBodyAvgSeconds), hint: 'running body_generation', tone: 'text-cyan-900' },
                        ].map((item) => (
                          <div key={item.label} className="rounded-2xl border border-cyan-100 bg-white/70 px-4 py-3">
                            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{item.label}</div>
                            <div className={`mt-2 text-xl font-black ${item.tone}`}>{item.value}</div>
                            <div className="mt-1 text-xs text-slate-500">{item.hint}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                </>
              )}
            </section>
          ) : null}

          {b2sCacheViewModel ? (
            <section className="rounded-[2rem] border border-emerald-200 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_35%),linear-gradient(180deg,#ffffff_0%,#ecfdf5_100%)] p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700">Binary To Source Cache</div>
                  <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900">二进制逆向缓存指标</h2>
                  <p className="mt-2 max-w-3xl text-sm text-slate-600">
                    观察 ELF 级缓存请求、命中、绕过、覆盖和当前缓存条目数量，辅助判断相同输入是否被有效复用。
                  </p>
                </div>
                <span className="inline-flex rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-xs font-black text-emerald-800">
                  命中率 {b2sCacheViewModel.hitRate == null ? '-' : `${formatNumber(b2sCacheViewModel.hitRate, 1)}%`}
                </span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                {[
                  { label: '缓存请求', value: formatNumber(b2sCacheViewModel.requestsTotal), hint: 'requests total', tone: 'text-slate-900' },
                  { label: '缓存命中', value: formatNumber(b2sCacheViewModel.hitsTotal), hint: 'hits total', tone: 'text-emerald-700' },
                  { label: '缓存未命中', value: formatNumber(b2sCacheViewModel.missesTotal), hint: 'misses total', tone: 'text-amber-700' },
                  { label: '主动绕过', value: formatNumber(b2sCacheViewModel.bypassedTotal), hint: 'reuse_cache=false', tone: 'text-rose-700' },
                  { label: '缓存覆盖', value: formatNumber(b2sCacheViewModel.replacedTotal), hint: 'replace total', tone: 'text-indigo-700' },
                  { label: '当前条目', value: formatNumber(b2sCacheViewModel.entries), hint: 'ready cache entries', tone: 'text-slate-900' },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-emerald-100 bg-white/80 px-4 py-3 shadow-sm">
                    <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{item.label}</div>
                    <div className={`mt-2 text-xl font-black ${item.tone}`}>{item.value}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.hint}</div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {systemAnalysisViewModel ? (
            <section className="space-y-4 rounded-[2rem] border border-sky-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_34%),linear-gradient(180deg,#ffffff_0%,#f0f9ff_100%)] p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.22em] text-sky-700">System Analysis Observability</div>
                  <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900">系统分析专属观测</h2>
                  <p className="mt-2 max-w-3xl text-sm text-slate-600">
                    以运行总览、阶段健康、AI 成本、并发治理和质量收益为主视图，优先回答“卡在哪、贵不贵、并发是否打满、失败是否集中”。
                  </p>
                </div>
                <span className="inline-flex rounded-full border border-sky-200 bg-white/80 px-3 py-1 text-xs font-black text-sky-800">
                  worker {formatNumber(systemWorkerDetailState.data?.worker_count)} / slots {formatNumber(systemWorkerDetailState.data?.total_capacity)}
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                {systemAnalysisViewModel.overviewCards.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-sky-100 bg-white/85 px-4 py-3 shadow-sm">
                    <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{item.label}</div>
                    <div className={`mt-2 text-2xl font-black ${item.tone}`}>{item.value}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.hint}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-[1.4rem] border border-sky-100 bg-white/85 px-4 py-3 shadow-sm">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">快速摘要</div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                  {systemAnalysisViewModel.compactSummary.map((item) => (
                    <div key={item.label} className="inline-flex items-center gap-2 text-sm">
                      <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">{item.label}</span>
                      <span className={`font-mono font-black ${item.tone}`}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[1.6rem] border border-sky-100 bg-white/90 p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Worker Detail</div>
                    <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">执行槽位明细</h3>
                    <p className="mt-2 max-w-3xl text-sm text-slate-500">
                      直接复用系统分析任务页的 worker cluster capacity 接口，和任务列表保持同一口径，用于核对聚合指标背后的具体 owner / task 归属，并支持动态扩缩容自动识别 worker。
                    </p>
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    <div>最近刷新</div>
                    <div className="mt-1 font-semibold text-slate-500">{formatTime(systemWorkerDetailState.refreshedAt)}</div>
                  </div>
                </div>
                {selectedSystemWorkerFilter ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-800">
                    <span className="font-bold">已联动筛选 Worker：</span>
                    <span className="rounded-full bg-white px-2 py-1 font-mono">{selectedSystemWorkerFilter}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedSystemWorkerFilter('')}
                      className="rounded-full border border-sky-200 bg-white px-2 py-1 font-semibold text-sky-700 hover:bg-sky-100"
                    >
                      清除筛选
                    </button>
                  </div>
                ) : null}
                {systemWorkerDetailState.loading ? (
                  <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 size={16} className="animate-spin" />
                    正在读取 worker 明细...
                  </div>
                ) : systemWorkerDetailState.error && !systemWorkerDetailState.data ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                    暂无 worker 明细：{systemWorkerDetailState.error}
                  </div>
                ) : (
                  <>
                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      {[
                        { label: 'Worker 数', value: systemWorkerDetailState.data?.worker_count ?? '-', hint: '完整集群可见 worker 数' },
                        { label: '总槽位', value: systemWorkerDetailState.data?.total_capacity ?? '-', hint: 'runner capacity 汇总' },
                        { label: '运行中', value: systemWorkerDetailState.data?.busy_slots ?? '-', hint: 'active running jobs' },
                        { label: '空闲 / 排队', value: `${systemWorkerDetailState.data?.available_slots ?? '-'} / ${systemWorkerDetailState.data?.queued_jobs ?? '-'}`, hint: 'available slots / queued jobs' },
                      ].map((item) => (
                        <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{item.label}</div>
                          <div className="mt-2 text-lg font-black text-slate-900">{item.value}</div>
                          <div className="mt-1 text-xs text-slate-500">{item.hint}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 space-y-3">
                      {(systemWorkerDetailState.data?.workers || []).length ? (
                        systemWorkerDetailState.data?.workers.map((worker) => (
                          <div
                            key={worker.worker_id}
                            onClick={() => setSelectedSystemWorkerFilter((current) => current === worker.worker_id ? '' : worker.worker_id)}
                            className={`rounded-2xl border px-4 py-4 ${
                              worker.healthy ? 'border-slate-200 bg-slate-50/70' : 'border-rose-200 bg-rose-50/80'
                            } ${selectedSystemWorkerFilter === worker.worker_id ? 'ring-2 ring-sky-300 ring-offset-1' : 'cursor-pointer hover:border-sky-200'}`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-sm font-black text-slate-900">{worker.host_name || worker.worker_id}</div>
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${worker.healthy ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                    {worker.healthy ? 'healthy' : 'unhealthy'}
                                  </span>
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                    活动任务 {worker.active_jobs.length}
                                  </span>
                                </div>
                                <div className="mt-1 font-mono text-[11px] text-slate-400 break-all">{worker.worker_id}</div>
                                <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                                  <span>槽位 {worker.running_jobs}/{worker.max_concurrent_jobs}</span>
                                  <span>空闲 {worker.available_slots}</span>
                                  <span>来源 {worker.source || 'runner_registry'}</span>
                                  <span>心跳 {worker.last_heartbeat_at ? formatTime(new Date(worker.last_heartbeat_at).getTime()) : '-'}</span>
                                </div>
                                <div className="mt-2 text-[11px] text-sky-700">点击可联动过滤下方 Prometheus Samples</div>
                                {worker.error ? <div className="mt-2 text-xs text-rose-600">{worker.error}</div> : null}
                              </div>
                            </div>
                            <div className="mt-3 grid gap-2 lg:grid-cols-2">
                              {worker.active_jobs.length ? (
                                worker.active_jobs.map((job) => (
                                  <div key={`${worker.worker_id}:${job.task_id}`} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="min-w-0 truncate text-sm font-bold text-slate-900" title={job.task_id}>{job.task_id}</div>
                                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{job.status}</span>
                                    </div>
                                    <div className="mt-2 space-y-1 text-xs text-slate-500">
                                      <div className="font-mono break-all">task_id: {job.task_id}</div>
                                      <div className="truncate" title={job.input_path || '-'}>input: {job.input_path || '-'}</div>
                                      <div>mode: {job.analysis_mode || '-'}</div>
                                      <div>owner: {worker.host_name || worker.worker_id}</div>
                                      <div>lease: {job.execution_lease_until ? formatTime(new Date(job.execution_lease_until).getTime()) : '-'}</div>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 lg:col-span-2">
                                  当前无活跃任务。
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                          当前未发现可用的系统分析 worker 明细。
                        </div>
                      )}
                    </div>
                    {systemWorkerDetailState.error ? (
                      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        聚合指标已更新，但 worker 明细抓取有告警：{systemWorkerDetailState.error}
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                <div className="rounded-[1.6rem] border border-sky-100 bg-white/85 p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">阶段健康</div>
                      <h3 className="mt-2 text-lg font-black tracking-tight text-slate-900">Stage 健康矩阵</h3>
                    </div>
                    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-500">
                      runs / duration / score / cost
                    </span>
                  </div>
                  <div className="mt-4 overflow-auto rounded-2xl border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-3 py-3">阶段</th>
                          <th className="px-3 py-3">运行</th>
                          <th className="px-3 py-3">成功率</th>
                          <th className="px-3 py-3">均时</th>
                          <th className="px-3 py-3">轮次</th>
                          <th className="px-3 py-3">均分</th>
                          <th className="px-3 py-3">均成本</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {systemAnalysisViewModel.stageRows.length ? (
                          systemAnalysisViewModel.stageRows.map((row) => (
                            <tr key={row.stage} className="hover:bg-slate-50">
                              <td className="px-3 py-3 font-mono text-[11px] font-bold text-slate-800">{row.stage}</td>
                              <td className="px-3 py-3 font-mono text-[11px] text-slate-700">
                                {formatNumber(row.totalRuns)} / {formatNumber(row.successRuns)} / {formatNumber(row.failedRuns)}
                                <div className="text-[10px] text-slate-400">all / ok / fail</div>
                              </td>
                              <td className={`px-3 py-3 font-mono text-[11px] font-bold ${(row.successRate || 0) < 70 ? 'text-rose-700' : 'text-emerald-700'}`}>
                                {row.successRate == null ? '-' : `${formatNumber(row.successRate, 1)}%`}
                              </td>
                              <td className="px-3 py-3 font-mono text-[11px] text-slate-800">{formatSeconds(row.avgDurationSeconds)}</td>
                              <td className="px-3 py-3 font-mono text-[11px] text-slate-800">{formatNumber(row.avgRounds, 2)}</td>
                              <td className="px-3 py-3 font-mono text-[11px] text-slate-800">{formatNumber(row.avgScore, 1)}</td>
                              <td className="px-3 py-3 font-mono text-[11px] text-slate-800">{formatMetricValue(row.avgCost ?? Number.NaN)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                              当前还没有可聚合的阶段级指标。
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-[1.6rem] border border-sky-100 bg-white/85 p-4 shadow-sm">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">运行风险</div>
                    <div className="mt-3 grid gap-3">
                      {systemAnalysisViewModel.riskAlerts.map((alert) => (
                        <div key={alert.label} className={`rounded-2xl border px-4 py-3 shadow-sm ${alert.tone}`}>
                          <div className="text-sm font-black">{alert.label}</div>
                          <div className="mt-1 text-xs leading-5 opacity-85">{alert.text}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[1.6rem] border border-sky-100 bg-white/85 p-4 shadow-sm">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">失败归因</div>
                    <div className="mt-3 space-y-2">
                      {systemAnalysisViewModel.failureCategories.length ? (
                        systemAnalysisViewModel.failureCategories.slice(0, 6).map((item) => (
                          <div key={item.label} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                            <div className="text-xs font-black text-slate-700">{item.label}</div>
                            <div className={`font-mono text-sm font-black ${item.tone}`}>{formatNumber(item.value)}</div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">暂无失败分类指标。</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                {[
                  { title: '并发治理', items: systemAnalysisViewModel.governanceCards },
                  { title: 'AI 成本', items: systemAnalysisViewModel.costCards },
                  { title: '质量收益', items: systemAnalysisViewModel.qualityCards },
                ].map((block) => (
                  <div key={block.title} className="rounded-[1.6rem] border border-sky-100 bg-white/85 p-4 shadow-sm">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{block.title}</div>
                    <div className="mt-3 grid gap-2">
                      {block.items.map((item) => (
                        <div key={item.label} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                          <div>
                            <div className="text-xs font-black text-slate-700">{item.label}</div>
                            <div className="text-[11px] text-slate-500">{item.hint}</div>
                          </div>
                          <div className={`font-mono text-sm font-black ${item.tone}`}>{item.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <div className="rounded-[1.6rem] border border-sky-100 bg-white/85 p-4 shadow-sm">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">断点续跑</div>
                  <h3 className="mt-2 text-lg font-black tracking-tight text-slate-900">续跑有效性</h3>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {systemAnalysisViewModel.checkpointCards.map((item) => (
                      <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{item.label}</div>
                        <div className={`mt-2 text-xl font-black ${item.tone}`}>{item.value}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.hint}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 h-56">
                    {systemAnalysisViewModel.checkpointChart.some((item) => item.value > 0) ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={systemAnalysisViewModel.checkpointChart} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                          <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                          <Tooltip formatter={(value: number) => formatMetricValue(Number(value))} />
                          <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                            {systemAnalysisViewModel.checkpointChart.map((entry) => (
                              <Cell key={entry.name} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyCard text="当前没有断点续跑相关样本。" />
                    )}
                  </div>
                </div>

                <div className="rounded-[1.6rem] border border-sky-100 bg-white/85 p-4 shadow-sm">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">并发治理</div>
                  <h3 className="mt-2 text-lg font-black tracking-tight text-slate-900">并发命中率</h3>
                  <p className="mt-2 text-sm text-slate-500">
                    这里用 `tasks_running / workers(capacity)` 观察当前命中情况，同时把 slack 和 pending 一起摆出来，方便判断是容量不够还是调度没打满。
                  </p>
                  <div className="mt-4 h-72">
                    {systemAnalysisViewModel.concurrencyChart.some((item) => item.value > 0) ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={systemAnalysisViewModel.concurrencyChart} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                          <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                          <Tooltip formatter={(value: number) => formatMetricValue(Number(value))} />
                          <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                            {systemAnalysisViewModel.concurrencyChart.map((entry) => (
                              <Cell key={entry.name} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyCard text="当前没有并发负载样本。" />
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-[1.6rem] border border-sky-100 bg-white/85 p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">阶段关联</div>
                    <h3 className="mt-2 text-lg font-black tracking-tight text-slate-900">并发拖慢嫌疑阶段</h3>
                    <p className="mt-2 text-sm text-slate-500">
                      用 `运行中轮次 + 平均时长 + 成功率惩罚` 组合成轻量 pressure score，优先找最可能影响并发命中率的阶段。
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {systemAnalysisViewModel.stagePressureCards.map((item) => (
                      <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{item.label}</div>
                        <div className={`mt-2 text-lg font-black ${item.tone}`}>{item.value}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.hint}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <div className="h-64 rounded-2xl border border-slate-200 bg-white p-3">
                    {systemAnalysisViewModel.stagePressureRows.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={systemAnalysisViewModel.stagePressureRows} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                          <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="stage" tick={{ fontSize: 11, fill: '#64748b' }} interval={0} angle={-12} textAnchor="end" height={58} />
                          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                          <Tooltip formatter={(value: number, key: string) => (key === 'avgDurationSeconds' ? formatSeconds(Number(value)) : formatMetricValue(Number(value)))} />
                          <Bar dataKey="pressureScore" radius={[8, 8, 0, 0]}>
                            {systemAnalysisViewModel.stagePressureRows.map((entry) => (
                              <Cell key={entry.stage} fill={entry.pressureScore >= 8 ? '#ef4444' : entry.pressureScore >= 4 ? '#f59e0b' : '#10b981'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyCard text="当前没有足够的阶段样本用于推导压力分。" />
                    )}
                  </div>

                  <div className="space-y-2">
                    {systemAnalysisViewModel.stagePressureRows.length ? (
                      systemAnalysisViewModel.stagePressureRows.map((item) => (
                        <div key={item.stage} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-black text-slate-800">{item.stage}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              running {formatNumber(item.runningRuns)} · avg {formatSeconds(item.avgDurationSeconds)} · success {item.successRate == null ? '-' : `${formatNumber(item.successRate, 1)}%`}
                            </div>
                          </div>
                          <div className={`font-mono text-sm font-black ${item.tone}`}>{formatNumber(item.pressureScore, 1)}</div>
                        </div>
                      ))
                    ) : (
                      <EmptyCard text="当前没有可展示的阶段压力排行。" />
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-[1.6rem] border border-sky-100 bg-white/85 p-4 shadow-sm">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">指标口径</div>
                <h3 className="mt-2 text-lg font-black tracking-tight text-slate-900">系统分析观测说明</h3>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    {
                      label: '并发利用率',
                      text: '`worker_running / worker_capacity`；优先使用 runtime snapshot，而不是仅用任务状态近似。',
                    },
                    {
                      label: '续跑完成率',
                      text: '`checkpoint overall_done / any checkpoint task`；表示进入断点续跑语义的任务中，有多少最终完成。',
                    },
                    {
                      label: '阶段健康矩阵',
                      text: '`运行/成功率/均时/均轮次/均分/均成本` 都来自阶段级 metrics 聚合，不是前端从日志反推。',
                    },
                    {
                      label: '阶段压力分',
                      text: '由 `运行中轮次 + 平均时长 + 成功率惩罚` 组合得到，用于快速找出最可能拖慢并发的 stage。',
                    },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-xs font-black text-slate-800">{item.label}</div>
                      <div className="mt-2 text-[11px] leading-5 text-slate-500">{item.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {dataflowVulnOverviewViewModel ? (
            <DataflowVulnObservabilitySection
              viewModel={dataflowVulnOverviewViewModel}
              formatters={{ formatMetricValue, formatNumber, formatSeconds }}
            />
          ) : null}

          {firmwareUnpackerViewModel ? (
            <section className="space-y-4 rounded-[2rem] border border-amber-200 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.12),_transparent_34%),linear-gradient(180deg,#ffffff_0%,#fff7ed_100%)] p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-700">Firmware Unpacker Health</div>
                  <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900">固件解包运行健康</h2>
                  <p className="mt-2 max-w-3xl text-sm text-slate-600">
                    优先展示任务状态、队列积压、Worker 在线能力、并发槽位和清理异常；原始 Prometheus 样本仍保留在下方用于排障。
                  </p>
                </div>
                <span className="inline-flex rounded-full border border-amber-200 bg-white/80 px-3 py-1 text-xs font-black text-amber-800">
                  专属聚合视图
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                {firmwareUnpackerViewModel.kpis.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-amber-100 bg-white/85 px-4 py-3 shadow-sm">
                    <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{item.label}</div>
                    <div className={`mt-2 text-2xl font-black ${item.tone}`}>{item.value}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.hint}</div>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 xl:grid-cols-3">
                {firmwareUnpackerViewModel.alerts.map((alert) => (
                  <div key={alert.label} className={`rounded-2xl border px-4 py-3 shadow-sm ${alert.tone}`}>
                    <div className="text-sm font-black">{alert.label}</div>
                    <div className="mt-1 text-xs leading-5 opacity-85">{alert.text}</div>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {[
                  { title: '任务状态分布', data: firmwareUnpackerViewModel.taskStatusChart },
                  { title: '队列状态', data: firmwareUnpackerViewModel.queueChart },
                  { title: 'Worker 与并发槽位', data: firmwareUnpackerViewModel.workerChart },
                  { title: 'HTTP 请求 Top 6', data: firmwareUnpackerViewModel.httpTop.map((item) => ({ ...item, fill: '#0f766e' })) },
                ].map((chart) => (
                  <div key={chart.title} className="rounded-[1.6rem] border border-amber-100 bg-white/85 p-4 shadow-sm">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{chart.title}</div>
                    <div className="mt-3 h-64">
                      {chart.data.some((item) => item.value > 0) ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chart.data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                            <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} interval={0} angle={-12} textAnchor="end" height={58} />
                            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                            <Tooltip formatter={(value: number) => formatMetricValue(Number(value))} />
                            <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                              {chart.data.map((entry) => (
                                <Cell key={`${chart.title}-${entry.name}`} fill={entry.fill || '#0f766e'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <EmptyCard text="当前指标值均为 0" />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="rounded-[1.6rem] border border-amber-100 bg-white/85 p-4 shadow-sm">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">异常 / 调度 / 清理</div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {firmwareUnpackerViewModel.operations.map((item) => (
                      <div key={item.label} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                        <div className="text-xs font-black text-slate-700">{item.label}</div>
                        <div className={`mt-1 text-lg font-black ${item.tone}`}>{formatNumber(item.value)}</div>
                        <div className="text-[11px] text-slate-500">{item.hint}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-[1.6rem] border border-amber-100 bg-white/85 p-4 shadow-sm">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">AI / Token / Cost</div>
                  <div className="mt-3 grid gap-2">
                    {firmwareUnpackerViewModel.aiSummary.map((item) => (
                      <div key={item.label} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                        <div>
                          <div className="text-xs font-black text-slate-700">{item.label}</div>
                          <div className="text-[11px] text-slate-500">{item.hint}</div>
                        </div>
                        <div className={`font-mono text-sm font-black ${item.tone}`}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {binarySecurityObservabilityViewModel ? null : dataflowVulnOverviewViewModel ? (
            <DataflowVulnSignalsSection
              viewModel={dataflowVulnOverviewViewModel}
              formatters={{ formatMetricValue, formatNumber, formatSeconds }}
            />
          ) : (
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
          )}

          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">原始指标</div>
                <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900">Prometheus Samples</h2>
                {activeServiceKey === 'dataflow-vuln' ? (
                  <p className="mt-2 max-w-3xl text-sm text-slate-500">默认聚焦 cycle、runtime、AI、plugin 与 execution/queue 相关样本，避免全量 Prometheus 噪音淹没业务信号。</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {activeServiceKey === 'dataflow-vuln' ? <DataflowVulnSampleScopeFilter activeScope={dataflowVulnSampleScope} onChange={setDataflowVulnSampleScope} /> : null}
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
            {activeServiceKey === 'dataflow-analysis' && selectedDfaWorkerFilter ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-xs text-cyan-800">
                <span className="font-bold">当前按 DFA Worker 过滤：</span>
                <span className="rounded-full bg-white px-2 py-1 font-mono">{selectedDfaWorkerFilter}</span>
                <button
                  type="button"
                  onClick={() => setSelectedDfaWorkerFilter('')}
                  className="rounded-full border border-cyan-200 bg-white px-2 py-1 font-semibold text-cyan-700 hover:bg-cyan-100"
                >
                  清除筛选
                </button>
              </div>
            ) : null}
            {activeServiceKey === 'system-analysis' && selectedSystemWorkerFilter ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-800">
                <span className="font-bold">当前按 SA Worker 过滤：</span>
                <span className="rounded-full bg-white px-2 py-1 font-mono">{selectedSystemWorkerFilter}</span>
                <button
                  type="button"
                  onClick={() => setSelectedSystemWorkerFilter('')}
                  className="rounded-full border border-sky-200 bg-white px-2 py-1 font-semibold text-sky-700 hover:bg-sky-100"
                >
                  清除筛选
                </button>
              </div>
            ) : null}
            {activeServiceKey === 'entry-analysis' && selectedEntryWorkerFilter ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs text-indigo-800">
                <span className="font-bold">当前按 Entry Worker 过滤：</span>
                <span className="rounded-full bg-white px-2 py-1 font-mono">{selectedEntryWorkerFilter}</span>
                <button
                  type="button"
                  onClick={() => setSelectedEntryWorkerFilter('')}
                  className="rounded-full border border-indigo-200 bg-white px-2 py-1 font-semibold text-indigo-700 hover:bg-indigo-100"
                >
                  清除筛选
                </button>
              </div>
            ) : null}

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
              {[
                {
                  label: '快照可用性',
                  value: reducerViewModel.snapshotMeta.available ? '可用' : '不可用',
                  hint: reducerViewModel.snapshotMeta.sourcePod ? `来源 ${reducerViewModel.snapshotMeta.sourcePod}` : '暂无来源 Pod',
                  tone: reducerViewModel.snapshotMeta.available ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800',
                },
                {
                  label: '快照新鲜度',
                  value: reducerViewModel.snapshotMeta.stale ? '已过期' : '新鲜',
                  hint: reducerViewModel.snapshotMeta.generatedAtTimestamp ? `生成于 ${formatTime(reducerViewModel.snapshotMeta.generatedAtTimestamp * 1000)}` : '暂无生成时间',
                  tone: reducerViewModel.snapshotMeta.stale ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-sky-200 bg-sky-50 text-sky-800',
                },
                {
                  label: '快照年龄',
                  value: formatSeconds(reducerViewModel.snapshotMeta.ageSeconds),
                  hint: 'Redis reducer snapshot age',
                  tone: (reducerViewModel.snapshotMeta.ageSeconds || 0) > 30 ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-700',
                },
                {
                  label: '历史曲线说明',
                  value: '浏览器会话',
                  hint: '下方曲线只保留当前浏览器会话内的短时历史，不是持久化时序库趋势。',
                  tone: 'border-slate-200 bg-slate-50 text-slate-700',
                },
              ].map((item) => (
                <div key={item.label} className={`rounded-[1.4rem] border px-4 py-4 shadow-sm ${item.tone}`}>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em]">{item.label}</div>
                  <div className="mt-3 text-2xl font-black tracking-tight">{item.value}</div>
                  <div className="mt-1 text-xs opacity-85">{item.hint}</div>
                </div>
              ))}
            </div>

            <div className="grid gap-3 xl:grid-cols-6">
              {[
                {
                  label: '慢事件数',
                  value: formatNumber(reducerEventState.data?.summary?.slow_event_count ?? 0),
                  hint: '处理耗时 >= 1s',
                  tone: 'border-amber-200 bg-amber-50 text-amber-800',
                },
                {
                  label: '失败事件数',
                  value: formatNumber(reducerEventState.data?.summary?.failed_like_count ?? 0),
                  hint: 'retryable / dead_letter / failed-like',
                  tone: 'border-rose-200 bg-rose-50 text-rose-800',
                },
                {
                  label: 'P95 处理耗时',
                  value: formatMilliseconds(reducerEventState.data?.summary?.p95_processing_duration_ms ?? null),
                  hint: '用于识别长尾',
                  tone: 'border-sky-200 bg-sky-50 text-sky-800',
                },
                {
                  label: '平均处理耗时',
                  value: formatMilliseconds(reducerEventState.data?.summary?.avg_processing_duration_ms ?? null),
                  hint: '仅统计有处理时长样本',
                  tone: 'border-slate-200 bg-slate-50 text-slate-700',
                },
                {
                  label: '最长处理耗时',
                  value: formatMilliseconds(reducerEventState.data?.summary?.max_processing_duration_ms ?? null),
                  hint: '单条最慢样本',
                  tone: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800',
                },
                {
                  label: '事件容量',
                  value: reducerEventState.data?.truncated ? '10,000+' : formatNumber(reducerEventState.data?.total ?? 0),
                  hint: reducerEventState.data?.truncated ? '已触发 10,000 条上限截断' : '过滤后总数',
                  tone: 'border-teal-200 bg-teal-50 text-teal-800',
                },
              ].map((item) => (
                <div key={item.label} className={`rounded-[1.4rem] border px-4 py-4 shadow-sm ${item.tone}`}>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em]">{item.label}</div>
                  <div className="mt-3 text-2xl font-black tracking-tight">{item.value}</div>
                  <div className="mt-1 text-xs opacity-85">{item.hint}</div>
                </div>
              ))}
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

            <div className="rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">全局事件明细</div>
                  <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">事件处理记录</h3>
                  <p className="mt-2 text-sm text-slate-500">用于直接观察 reducer 处理时间、处理者、失败结果和当前积压状态，不区分项目，最多浏览 10,000 条。</p>
                </div>
                <div className="text-xs text-slate-500">
                  最近刷新 {formatTime(reducerEventState.refreshedAt)}
                </div>
              </div>

              <div className="mt-4 grid gap-3 xl:grid-cols-6">
                <label className="text-xs font-semibold text-slate-600">
                  状态
                  <select
                    value={reducerEventStatusFilter}
                    onChange={(event) => {
                      setReducerEventStatusFilter(event.target.value);
                      setReducerEventPage(1);
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    <option value="all">全部状态</option>
                    <option value="pending">pending</option>
                    <option value="processing">processing</option>
                    <option value="retryable">retryable</option>
                    <option value="dead_letter">dead_letter</option>
                    <option value="processed">processed</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  排序
                  <select
                    value={reducerEventSortBy}
                    onChange={(event) => {
                      setReducerEventSortBy(event.target.value as ReducerEventSortBy);
                      setReducerEventPage(1);
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    <option value="processed_at">最近处理时间</option>
                    <option value="duration_ms">处理耗时</option>
                    <option value="created_at">创建时间</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  排序方向
                  <select
                    value={reducerEventSortOrder}
                    onChange={(event) => {
                      setReducerEventSortOrder(event.target.value as ReducerEventSortOrder);
                      setReducerEventPage(1);
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    <option value="desc">降序</option>
                    <option value="asc">升序</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  事件类型
                  <input
                    value={reducerEventTypeFilter}
                    onChange={(event) => {
                      setReducerEventTypeFilter(event.target.value);
                      setReducerEventPage(1);
                    }}
                    placeholder="如 downstream_terminal_observed"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  处理者 Pod
                  <input
                    value={reducerEventHandlerFilter}
                    onChange={(event) => {
                      setReducerEventHandlerFilter(event.target.value);
                      setReducerEventPage(1);
                    }}
                    placeholder="如 reducer-pod-1"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Task ID
                  <input
                    value={reducerEventTaskFilter}
                    onChange={(event) => {
                      setReducerEventTaskFilter(event.target.value);
                      setReducerEventPage(1);
                    }}
                    placeholder="按 task_id 过滤"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  />
                </label>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-600">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={reducerEventFailedOnly}
                    onChange={(event) => {
                      setReducerEventFailedOnly(event.target.checked);
                      setReducerEventPage(1);
                    }}
                  />
                  只看失败
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={reducerEventSlowOnly}
                    onChange={(event) => {
                      setReducerEventSlowOnly(event.target.checked);
                      setReducerEventPage(1);
                    }}
                  />
                  只看慢事件
                </label>
                <label className="inline-flex items-center gap-2">
                  每页
                  <select
                    value={reducerEventPageSize}
                    onChange={(event) => {
                      setReducerEventPageSize(Number(event.target.value));
                      setReducerEventPage(1);
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700"
                  >
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => void loadReducerEvents()}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw size={14} />
                  刷新记录
                </button>
              </div>

              {reducerEventState.error ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{reducerEventState.error}</div>
              ) : null}

              <div className="mt-4">
                <ExecutionTable minWidth={1540}>
                  <ExecutionTableHead>
                    <tr>
                      <ExecutionTableTh>处理时间</ExecutionTableTh>
                      <ExecutionTableTh>事件 ID</ExecutionTableTh>
                      <ExecutionTableTh>事件类型</ExecutionTableTh>
                      <ExecutionTableTh>状态</ExecutionTableTh>
                      <ExecutionTableTh>处理结果</ExecutionTableTh>
                      <ExecutionTableTh>处理者</ExecutionTableTh>
                      <ExecutionTableTh>任务 ID</ExecutionTableTh>
                      <ExecutionTableTh>阶段</ExecutionTableTh>
                      <ExecutionTableTh align="right">尝试次数</ExecutionTableTh>
                      <ExecutionTableTh align="right">排队耗时</ExecutionTableTh>
                      <ExecutionTableTh align="right">处理耗时</ExecutionTableTh>
                      <ExecutionTableTh align="right">总耗时</ExecutionTableTh>
                      <ExecutionTableTh>错误/失败原因</ExecutionTableTh>
                    </tr>
                  </ExecutionTableHead>
                  <tbody>
                    {reducerEventState.loading && !(reducerEventState.data?.items?.length) ? (
                      <ExecutionTableEmptyRow colSpan={13} message="正在加载 reducer 事件记录..." />
                    ) : reducerEventState.data?.items?.length ? (
                      reducerEventState.data.items.map((item) => (
                        <tr key={item.event_id} className={reducerRowClassName(item)}>
                          <ExecutionTableTd className="font-mono text-[11px] text-slate-700">{item.processed_at ? formatTime(new Date(item.processed_at).getTime()) : '-'}</ExecutionTableTd>
                          <ExecutionTableTd className="font-mono text-[11px] text-slate-800">{item.event_id}</ExecutionTableTd>
                          <ExecutionTableTd className="font-mono text-[11px] text-slate-700">{item.event_type}</ExecutionTableTd>
                          <ExecutionTableTd>
                            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                              {item.queue_status}
                            </span>
                          </ExecutionTableTd>
                          <ExecutionTableTd>
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
                              reducerFailedKinds.has(item.failure_kind)
                                ? 'border-rose-200 bg-rose-50 text-rose-700'
                                : item.result === 'success'
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-slate-200 bg-slate-50 text-slate-700'
                            }`}>
                              {item.result}
                            </span>
                          </ExecutionTableTd>
                          <ExecutionTableTd className="font-mono text-[11px] text-slate-700">{item.handler_pod || '-'}</ExecutionTableTd>
                          <ExecutionTableTd className="font-mono text-[11px] text-slate-800">{item.task_id}</ExecutionTableTd>
                          <ExecutionTableTd className="text-slate-700">{item.stage_name || '-'}</ExecutionTableTd>
                          <ExecutionTableTd align="right" className="font-mono text-[11px] text-slate-800">{formatNumber(item.attempts)}</ExecutionTableTd>
                          <ExecutionTableTd align="right" className="font-mono text-[11px] text-slate-700">{formatMilliseconds(item.queue_wait_ms)}</ExecutionTableTd>
                          <ExecutionTableTd align="right" className={`font-mono text-[11px] ${(item.processing_duration_ms ?? 0) >= 1000 ? 'text-amber-700 font-black' : 'text-slate-800'}`}>{formatMilliseconds(item.processing_duration_ms)}</ExecutionTableTd>
                          <ExecutionTableTd align="right" className="font-mono text-[11px] text-slate-800">{formatMilliseconds(item.end_to_end_duration_ms)}</ExecutionTableTd>
                          <ExecutionTableTd className="max-w-[24rem] text-xs text-slate-600">
                            {item.last_error || item.failure_reason || '-'}
                          </ExecutionTableTd>
                        </tr>
                      ))
                    ) : (
                      <ExecutionTableEmptyRow colSpan={13} message="当前没有符合条件的 reducer 事件记录。" />
                    )}
                  </tbody>
                </ExecutionTable>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
                <div>
                  第 {formatNumber(reducerEventState.data?.page ?? reducerEventPage)} 页 / 共 {formatNumber(Math.max(1, Math.ceil((reducerEventState.data?.total ?? 0) / Math.max(1, reducerEventPageSize))))} 页
                  ，总计 {reducerEventState.data?.truncated ? '10,000+' : formatNumber(reducerEventState.data?.total ?? 0)} 条
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={reducerEventPage <= 1}
                    onClick={() => setReducerEventPage((current) => Math.max(1, current - 1))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    上一页
                  </button>
                  <button
                    type="button"
                    disabled={reducerEventPage >= Math.max(1, Math.ceil((reducerEventState.data?.total ?? 0) / Math.max(1, reducerEventPageSize)))}
                    onClick={() => setReducerEventPage((current) => current + 1)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    下一页
                  </button>
                </div>
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
              {dataflowVulnAiViewModel ? (
                <DataflowVulnAiSection
                  viewModel={dataflowVulnAiViewModel}
                  formatters={{ formatMetricValue, formatNumber, formatSeconds }}
                />
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
                </>
              )}

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
