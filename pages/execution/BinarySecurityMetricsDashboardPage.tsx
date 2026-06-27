import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  X,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { api } from '../../clients/api';
import type { BinarySecurityStateEventInboxEventRecord, BinarySecurityStateEventInboxEventRecordPage } from '../../clients/binarySecurity';
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
  AgentObservabilitySummary,
  AgentPodRuntimeSnapshot,
  AgentProcessKillResponse,
  AgentProcessSnapshot,
  AgentRuntimeAggregateSummary,
  AgentTaskOwnershipSnapshot,
  AppDfaClusterCapacity,
  AppSaClusterCapacity,
  EntryAnalyseSlotClusterSummary,
} from '../../types/types';
import {
  DataflowVulnAiSection,
  DataflowVulnObservabilitySection,
  DataflowVulnSampleScopeFilter,
  DataflowVulnSignalsSection,
  HeadlineMetricCard,
} from './binarySecurityMetricsDataflowVuln';
import type { DataflowVulnAiViewModel, DataflowVulnOverviewViewModel, DataflowVulnSampleScope } from './binarySecurityMetricsDataflowVuln';
import { buildDataflowVulnAiViewModel, buildDataflowVulnOverviewViewModel, matchesDataflowVulnSampleScope } from './binarySecurityMetricsDataflowVulnBuilders';
import { buildUnifiedAgentRuntimeViewModel, type UnifiedAgentPodCard } from './agentRuntimeViewModel';
import { StatisticCard, PageHeader } from '../../design-system';

const LK = {
  primary: '#2563EB', primarySoft: '#7590ff', primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'var(--brand-primary-mask)',
  canvas: 'var(--bg-app)', surface: 'var(--bg-surface)', surfaceRaised: 'var(--bg-app)',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: 'var(--border-default)', borderSoft: 'var(--border-default)',
  ink: 'var(--text-primary)', inkSoft: 'var(--text-secondary)', body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)', mutedSoft: '#8b95a8',
  success: '#30A46C', warning: '#D97706', error: '#DC2626', info: '#4f8cff',
  critical: '#ff4d4f', high: '#ff8b3d', medium: '#f0b64c', low: '#49c5ff',
} as const;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

type MetricsState = {
  loading: boolean;
  rawText: string;
  error: string | null;
  refreshedAt: number | null;
};

type JsonTabState<T> = {
  loading: boolean;
  data: T | null;
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

const asArray = <T,>(value: T[] | null | undefined): T[] => (Array.isArray(value) ? value : []);
const resolveAgentOwnerKindLabel = (ownerKind: string | null | undefined): string => {
  if (ownerKind === 'tracked') return '正常进程';
  if (ownerKind === 'tracked_subprocess') return '子进程继承';
  if (ownerKind === 'tracked_inferred') return '推断归属';
  if (ownerKind === 'residual') return '残留进程';
  if (ownerKind === 'suspected_orphan') return '疑似孤儿';
  return '未归属进程';
};

const resolveAgentOwnerKindBadge = (ownerKind: string | null | undefined): { backgroundColor: string; color: string } => {
  if (ownerKind === 'tracked' || ownerKind === 'tracked_subprocess' || ownerKind === 'tracked_inferred') {
    return { backgroundColor: LK.success, color: LK.ink };
  }
  if (ownerKind === 'residual') return { backgroundColor: LK.error, color: LK.ink };
  if (ownerKind === 'suspected_orphan') return { backgroundColor: LK.warning, color: LK.ink };
  return { backgroundColor: LK.surfaceRaised, color: LK.ink };
};
const FIRST_BATCH_SUMMARY_SERVICES: BinarySecurityMetricsServiceKey[] = BINARY_SECURITY_METRICS_SERVICES.map((service) => service.key);
const supportsSummaryApi = (serviceKey: BinarySecurityMetricsServiceKey) => FIRST_BATCH_SUMMARY_SERVICES.includes(serviceKey);
const initialJsonTabState = <T,>(): JsonTabState<T> => ({ loading: false, data: null, error: null, refreshedAt: null });

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

type StateEventInboxState = {
  loading: boolean;
  data: BinarySecurityStateEventInboxEventRecordPage | null;
  error: string | null;
  refreshedAt: number | null;
};

type AgentObservabilityState = {
  loading: boolean;
  podsLoading: boolean;
  podsLoaded: boolean;
  detailLoading: boolean;
  detailLoaded: boolean;
  summary: AgentObservabilitySummary | null;
  processes: AgentProcessSnapshot[];
  tasks: AgentTaskOwnershipSnapshot[];
  pods: AgentPodRuntimeSnapshot[];
  runtimeSummary: AgentRuntimeAggregateSummary | null;
  error: string | null;
  refreshedAt: number | null;
};

type AgentPodDetailState = {
  loading: boolean;
  loaded: boolean;
  error: string | null;
  processes: AgentProcessSnapshot[];
  tasks: AgentTaskOwnershipSnapshot[];
};

type AgentKillHistoryEntry = {
  id: string;
  scope: 'single' | 'selected' | 'bulk';
  createdAt: number;
  response: AgentProcessKillResponse;
};

type StateEventInboxSortBy = 'processed_at' | 'duration_ms' | 'created_at';
type StateEventInboxSortOrder = 'asc' | 'desc';

type RestApiRouteSummary = {
  route: string;
  method: string;
  requestCount: number;
  avgSeconds: number | null;
  p50Seconds: number | null;
  p95Seconds: number | null;
  p99Seconds: number | null;
  approxMaxSeconds: number | null;
  status2xx: number;
  status4xx: number;
  status5xx: number;
  inflight: number;
};

type RestApiViewModel = {
  rows: RestApiRouteSummary[];
  totalRequests: number;
  totalInflight: number;
  avgSeconds: number | null;
  p95Seconds: number | null;
  slowRouteCount: number;
  errorRate: number | null;
  topByCount: Array<{ name: string; value: number }>;
  topByP95: Array<{ name: string; value: number }>;
  topBy5xx: Array<{ name: string; value: number }>;
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

type SummaryObservabilityResponse = {
  overview_cards?: Array<{ label: string; value: number | string | null; hint?: string; tone?: string }>;
  alerts?: Array<{ label: string; text: string; tone: string }>;
  status_counts?: Record<string, number>;
  metric_rows?: Array<{ name: string; family_name: string; labels: Record<string, string>; value: number }>;
};

type SummaryRestApiResponse = {
  rows: RestApiRouteSummary[];
  total_requests: number;
  total_inflight: number;
  avg_seconds: number | null;
  p95_seconds: number | null;
  slow_route_count: number;
  error_rate: number | null;
  top_by_count: Array<{ name: string; value: number }>;
  top_by_p95: Array<{ name: string; value: number }>;
  top_by_5xx: Array<{ name: string; value: number }>;
};

type SummaryAiResponse = {
  rows: Array<{ name: string; family_name: string; labels: Record<string, string>; value: number }>;
  cards: Array<{ label: string; value: number; hint: string }>;
  coverage: AiCoverage;
  coverage_label: string;
  family_count: number;
  role_chart: Array<{ name: string; value: number }>;
  token_chart: Array<{ name: string; value: number }>;
  coverage_text: string;
};

type SummaryObservabilityViewModel = {
  overviewCards: Array<{ label: string; value: string; hint: string; tone: string }>;
  alerts: Array<{ label: string; text: string; tone: string }>;
  statusRows: Array<{ label: string; value: number; tone: string }>;
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

type BinarySecurityStateEventInboxSnapshot = {
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
  stateEventInboxRunSuccess: number | null;
  stateEventInboxRunFailed: number | null;
  stateEventInboxRunLockBusy: number | null;
  stateEventInboxRunSkipped: number | null;
  stateEventInboxAvgDurationSeconds: number | null;
  eventAvgLagSeconds: number | null;
  lockWaitAvgSeconds: number | null;
  lockHeldAvgSeconds: number | null;
};

type StateEventInboxQueueCard = {
  label: string;
  value: number | null;
  hint: string;
  tone: string;
  icon: React.ReactNode;
};

type StateEventInboxBreakdownItem = {
  label: string;
  value: number | null;
  tone: string;
};

type BinarySecurityStateEventInboxViewModel = {
  snapshotMeta: {
    available: boolean;
    stale: boolean;
    ageSeconds: number | null;
    sourcePod: string | null;
    generatedAtTimestamp: number | null;
  };
  queueCards: StateEventInboxQueueCard[];
  queueBarData: Array<{ name: string; value: number | null; tone: string }>;
  ageBarData: Array<{ name: string; value: number | null; tone: string }>;
  healthSummary: Array<{ label: string; value: string; tone: string; hint: string }>;
  stateEventInboxRuns: StateEventInboxBreakdownItem[];
  stateEventInboxEventResults: StateEventInboxBreakdownItem[];
  deadLetters: StateEventInboxBreakdownItem[];
  fileWriteResults: StateEventInboxBreakdownItem[];
  activeLocks: StateEventInboxBreakdownItem[];
  timeSeries: Array<{
    time: string;
    pending: number | null;
    retryable: number | null;
    deadLetter: number | null;
    oldestPendingAge: number | null;
    stateEventInboxAvgDurationSeconds: number | null;
    eventAvgLagSeconds: number | null;
  }>;
};

type BinarySecurityObservabilityViewModel = {
  overviewCards: Array<{ label: string; value: string; hint: string; tone: string; icon: React.ReactNode }>;
  alerts: Array<{ label: string; text: string; tone: string }>;
  pipelineSummary: StateEventInboxBreakdownItem[];
  stateEventInboxSummary: StateEventInboxBreakdownItem[];
  syncSummary: StateEventInboxBreakdownItem[];
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
  'state-event-inbox': 'StateEventInbox',
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

const GROUP_BADGE: Record<BinarySecurityMetricsGroup, { backgroundColor: string; borderColor: string; color: string }> = {
  health: { backgroundColor: LK.success, borderColor: LK.success, color: LK.ink },
  orchestration: { backgroundColor: '#14b8a6', borderColor: '#14b8a6', color: LK.ink },
  'state-event-inbox': { backgroundColor: '#06b6d4', borderColor: '#06b6d4', color: LK.ink },
  lock: { backgroundColor: LK.warning, borderColor: LK.warning, color: LK.ink },
  http: { backgroundColor: LK.info, borderColor: LK.info, color: LK.ink },
  task: { backgroundColor: LK.surfaceRaised, borderColor: LK.border, color: LK.ink },
  queue: { backgroundColor: LK.warning, borderColor: LK.warning, color: LK.ink },
  worker: { backgroundColor: '#2563EB', borderColor: '#2563EB', color: LK.ink },
  duration: { backgroundColor: '#06b6d4', borderColor: '#06b6d4', color: LK.ink },
  'error-retry-timeout': { backgroundColor: LK.error, borderColor: LK.error, color: LK.ink },
  'llm-token-cost': { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6', color: LK.ink },
  'ai-agent': { backgroundColor: '#a855f7', borderColor: '#a855f7', color: LK.ink },
  'service-specific': { backgroundColor: LK.success, borderColor: LK.success, color: LK.ink },
  other: { backgroundColor: LK.surfaceRaised, borderColor: LK.border, color: LK.muted },
};

const AI_COVERAGE_BADGE: Record<AiCoverage, { backgroundColor: string; borderColor: string; color: string }> = {
  none: { backgroundColor: LK.surfaceRaised, borderColor: LK.border, color: LK.muted },
  basic: { backgroundColor: LK.warning, borderColor: LK.warning, color: LK.ink },
  partial: { backgroundColor: LK.info, borderColor: LK.info, color: LK.ink },
  complete: { backgroundColor: LK.success, borderColor: LK.success, color: LK.ink },
};

const AI_SERVICE_SCOPE: Record<BinarySecurityMetricsServiceKey, string> = {
  'binary-security': '编排层 AI 观测聚焦于模块筛选、继续/重试编排、AI 下游阶段活跃度与失败归因。',
  'binary-evolution': '进化中心 AI 观测聚焦 round 演进、agent 活跃度、重试/超时与轮次衍生结果。',
  'firmware-unpacker': '固件解包 AI 观测聚焦 AI 辅助/进化链路中的 token、成本、重试与失败分布。',
  'system-analysis': '系统分析 AI 观测覆盖 worker/judge/session、token/cost、失败分类与 stage round 统计。',
  'binary-to-source': '二进制逆向 AI 观测覆盖 review 尝试、session、token/cost、validator/judge 相关行为。',
  'entry-analysis': '入口分析 AI 观测覆盖 worker/judge/session、token/cost、轮次与失败/超时。',
  'dataflow-analysis': '数据流分析 AI 观测覆盖 judge/session、token/cost、轮次、trace 相关 AI 行为。',
  'dataflow-vuln-scan': '数据流漏洞挖掘 AI 观测覆盖 judge/session、token/cost、轮次、trace 与漏洞挖掘相关 AI 行为。',
  'dataflow-vuln': '数据流漏洞挖掘 AI 观测覆盖 cycle/review/plugin、runtime trace、token/cost 与失败分布。',
};

const toneToColor = (tone: string): string => {
  if (tone.includes('emerald')) return LK.success;
  if (tone.includes('rose')) return LK.error;
  if (tone.includes('amber')) return LK.warning;
  if (tone.includes('sky')) return LK.info;
  if (tone.includes('violet')) return '#8b5cf6';
  if (tone.includes('fuchsia')) return '#a855f7';
  if (tone.includes('teal')) return '#14b8a6';
  if (tone.includes('cyan')) return '#06b6d4';
  if (tone.includes('indigo')) return '#2563EB';
  if (tone.includes('slate-900')) return LK.ink;
  if (tone.includes('slate-800')) return LK.inkSoft;
  if (tone.includes('slate-700')) return LK.inkSoft;
  if (tone.includes('slate-600')) return LK.body;
  if (tone.includes('slate-500')) return LK.muted;
  return LK.body;
};

const CHART_COLOR = '#0f766e';
const AI_CHART_COLOR = '#7c3aed';
const CHART_GRID = LK.border;
const INITIAL_STATE: MetricsState = { loading: false, rawText: '', error: null, refreshedAt: null };
const ENTRY_ANALYSIS_STAGE_FOCUS_STORAGE_KEY = 'chimera:entryAnalysisStageFocus';
const ENTRY_ANALYSIS_RISK_FOCUS_STORAGE_KEY = 'chimera:entryAnalysisRiskFocus';

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
  if (value >= 3600) return`${formatNumber(value / 3600, 2)}h`;
  if (value >= 60) return`${formatNumber(value / 60, 2)}m`;
  return`${formatNumber(value, value >= 10 ? 1 : 2)}s`;
};

const formatBytes = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return '-';
  const abs = Math.abs(value);
  if (abs >= 1024 ** 3) return`${formatNumber(value / 1024 ** 3, 2)} GiB`;
  if (abs >= 1024 ** 2) return`${formatNumber(value / 1024 ** 2, 2)} MiB`;
  if (abs >= 1024) return`${formatNumber(value / 1024, 2)} KiB`;
  return`${formatNumber(value, 0)} B`;
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
  const fingerprint =`${metric.name} ${Object.keys(metric.labels).join(' ')} ${Object.values(metric.labels).join(' ')}`.toLowerCase();
  if (/_ai_/u.test(metric.name)) return true;
  return /(token|cost|llm|model|prompt|judge|review|agent|session|worker|cycle|round|plugin|advisor|reflection|validator)/u.test(fingerprint);
};

const metricGroupingFingerprint = (metric: ParsedMetricSample) => {
  const serviceNeutralName = metric.name.replace(/^firmware_unpacker_/u, '').replace(/^chimera_/u, '');
  return`${serviceNeutralName} ${Object.keys(metric.labels).join(' ')} ${Object.values(metric.labels).join(' ')}`.toLowerCase();
};

const BINARY_SECURITY_GROUP_RULES: Array<{ group: BinarySecurityMetricsGroup; pattern: RegExp }> = [
  { group: 'health', pattern: /metrics_aggregate_(scrape|partial|last_success)|stateEventInbox_snapshot_(available|age|stale|generated_at|source_info)/u },
  { group: 'lock', pattern: /task_state_lock_(wait|held|active)|lock_busy/u },
  { group: 'state-event-inbox', pattern: /state_(event|stateEventInbox|dead_letter|file_write)|archive_jobs_by_status/u },
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
  return entries.map(([key, value]) =>`${key}=${value}`).join(', ');
};

const metricDisplayName = (metric: ParsedMetricSample) => metric.name.replace(/^chimera_/u, '').replace(/_/gu, ' ');

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
      name: row.displayName.length > 18 ?`${row.displayName.slice(0, 18)}...` : row.displayName,
      value: row.value,
      group: row.group,
    })),
    insights: buildInsights(rows),
    groupCounts,
  };
};

const buildAggregateCoverageSummary = (rows: DisplayMetricRow[], serviceKey: BinarySecurityMetricsServiceKey): AggregateCoverageSummary | null => {
  if (serviceKey !== 'binary-security') return null;
  const expectedRows = rows.filter((row) => row.name === 'chimera_binary_security_metrics_aggregate_role_expected');
  const coveredRows = rows.filter((row) => row.name === 'chimera_binary_security_metrics_aggregate_role_covered');
  const attemptedRows = rows.filter((row) => row.name === 'chimera_binary_security_metrics_aggregate_scrape_targets');
  const successRows = rows.filter((row) => row.name === 'chimera_binary_security_metrics_aggregate_scrape_success_targets');
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
    rows.find((row) => row.name === 'chimera_binary_security_health_aggregate_partial') ||
    rows.find((row) => row.name === 'chimera_binary_security_metrics_aggregate_partial');
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
    { name: 'chimera_binary_security_health_pending_event_depth' },
    { name: 'chimera_binary_security_state_event_queue_depth', labels: { status: 'pending' } },
  ]);
  const retryableDepth = metricValueByName(rows, 'chimera_binary_security_state_event_queue_depth', { status: 'retryable' });
  const deadLetterDepth = firstMetricValue(rows, [
    { name: 'chimera_binary_security_health_dead_letter_depth' },
    { name: 'chimera_binary_security_state_event_queue_depth', labels: { status: 'dead_letter' } },
  ]);
  const oldestPendingAge = firstMetricValue(rows, [
    { name: 'chimera_binary_security_health_oldest_pending_age_seconds' },
    { name: 'chimera_binary_security_state_event_oldest_age_seconds', labels: { status: 'pending' } },
  ]);
  const stateEventInboxAvgDuration =
    firstMetricValue(rows, [{ name: 'chimera_binary_security_health_stateEventInbox_avg_duration_seconds' }]) ??
    histogramAverage(rows, 'chimera_binary_security_state_stateEventInbox_duration_seconds');
  const eventAvgLag =
    firstMetricValue(rows, [{ name: 'chimera_binary_security_health_event_avg_lag_seconds' }]) ??
    histogramAverage(rows, 'chimera_binary_security_state_event_lag_seconds');
  const lockWaitAvg =
    firstMetricValue(rows, [{ name: 'chimera_binary_security_health_lock_wait_avg_seconds' }]) ??
    histogramAverage(rows, 'chimera_binary_security_task_state_lock_wait_seconds');
  const lockHeldAvg =
    firstMetricValue(rows, [{ name: 'chimera_binary_security_health_lock_held_avg_seconds' }]) ??
    histogramAverage(rows, 'chimera_binary_security_task_state_lock_held_seconds');
  const activeLocks = sumMetric(rows, (row) => row.name === 'chimera_binary_security_task_state_lock_active');
  const deadLettersTotal = sumMetric(rows, (row) => row.name === 'chimera_binary_security_state_dead_letters_total');
  const stateEventInboxRunFailed = sumMetric(rows, (row) => row.name === 'chimera_binary_security_state_stateEventInbox_runs_total' && row.labels.result === 'failed');
  const stateEventInboxRunLockBusy = sumMetric(rows, (row) => row.name === 'chimera_binary_security_state_stateEventInbox_runs_total' && row.labels.result === 'lock_busy');
  const archiveQueued =
    firstMetricValue(rows, [{ name: 'chimera_binary_security_health_archive_queued_jobs' }]) ??
    sumMetric(rows, (row) => row.name === 'chimera_binary_security_archive_jobs_by_status' && row.labels.status === 'queued');
  const archiveRunning =
    firstMetricValue(rows, [{ name: 'chimera_binary_security_health_archive_running_jobs' }]) ??
    sumMetric(rows, (row) => row.name === 'chimera_binary_security_archive_jobs_by_status' && row.labels.status === 'running');
  const runningWorkers = sumMetric(rows, (row) => row.name === 'chimera_binary_security_active_workers' && row.labels.kind === 'running');
  const pendingWorkers = sumMetric(rows, (row) => row.name === 'chimera_binary_security_active_workers' && row.labels.kind === 'pending');
  const dispatchWorkers = sumMetric(rows, (row) => row.name === 'chimera_binary_security_active_workers' && row.labels.kind === 'dispatch');
  const alerts: Array<{ label: string; text: string; tone: string }> = [];
  const reconcileCandidates = metricValueByName(rows, 'chimera_binary_security_task_readless_reconcile_candidates');
  const reconcileLastAttempted = metricValueByName(rows, 'chimera_binary_security_task_readless_reconcile_last_attempted');
  const reconcileLastChanged = metricValueByName(rows, 'chimera_binary_security_task_readless_reconcile_last_changed');
  const reconcileLastFailed = metricValueByName(rows, 'chimera_binary_security_task_readless_reconcile_last_failed');
  const reconcileLastRunAt = metricValueByName(rows, 'chimera_binary_security_task_readless_reconcile_last_run_timestamp');
  const reconcileChangedTotal = metricValueByName(rows, 'chimera_binary_security_task_readless_reconcile_tasks_total', { result: 'changed' });
  const reconcileFailedTotal = metricValueByName(rows, 'chimera_binary_security_task_readless_reconcile_tasks_total', { result: 'failed' });
  const listQueryTotal = sumMetric(rows, (row) => row.name === 'chimera_binary_security_task_list_queries_total');
  const listQueryErrors = sumMetric(rows, (row) => row.name === 'chimera_binary_security_task_list_queries_total' && row.labels.result === 'error');
  const listQueryAvgSeconds = histogramAverage(rows, 'chimera_binary_security_task_list_query_duration_seconds');
  const listQueryP50Seconds = histogramQuantile(rows, 'chimera_binary_security_task_list_query_duration_seconds', 0.5);
  const listQueryP95Seconds = histogramQuantile(rows, 'chimera_binary_security_task_list_query_duration_seconds', 0.95);
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
      const p95Seconds = histogramQuantile(rows, 'chimera_binary_security_task_list_query_stage_duration_seconds', 0.95, { stage });
      const avgSeconds = histogramAverage(rows, 'chimera_binary_security_task_list_query_stage_duration_seconds', { stage });
      const count = metricValueByName(rows, 'chimera_binary_security_task_list_query_stage_duration_seconds_count', { stage });
      const severity = Math.max(p95Seconds || 0, avgSeconds || 0);
      const tone =
        severity > 1
          ? 'text-rose-400'
          : severity > 0.3
            ? 'text-amber-400'
            : severity > 0
              ? 'text-theme-text-secondary'
              : 'text-theme-text-muted';
      return { stage, p95Seconds, avgSeconds, count, tone };
    })
    .filter((item) => item.count != null || item.avgSeconds != null || item.p95Seconds != null)
    .sort((left, right) => (right.p95Seconds || 0) - (left.p95Seconds || 0));
  const taskListAlerts: Array<{ label: string; text: string; tone: string }> = [];

  if (aggregateCoverage?.partial) {
    alerts.push({
      label: '聚合不完整',
      text:`当前仅抓取到 ${formatNumber(aggregateCoverage.successful)}/${formatNumber(aggregateCoverage.attempted)} 个实例，聚合数值可能偏低。`,
      tone: 'border-amber-500/20 bg-amber-500/15 text-amber-400',
    });
  }
  if ((pendingDepth || 0) > 0 && (oldestPendingAge || 0) > 60) {
    alerts.push({
      label: '状态事件积压',
      text:`pending=${formatNumber(pendingDepth)}，最老事件年龄 ${formatSeconds(oldestPendingAge)}，状态收口已经明显滞后。`,
      tone: 'border-rose-500/20 bg-rose-500/15 text-rose-400',
    });
  }
  if ((deadLetterDepth || 0) > 0 || deadLettersTotal > 0) {
    alerts.push({
      label: '存在死信',
      text:`当前死信队列 ${formatNumber(deadLetterDepth)}，累计死信 ${formatNumber(deadLettersTotal)}，需要优先排查 stateEventInbox 应用失败原因。`,
      tone: 'border-rose-500/20 bg-rose-500/15 text-rose-400',
    });
  }
  if ((lockWaitAvg || 0) > 0.3 || activeLocks > 0) {
    alerts.push({
      label: '锁竞争偏高',
      text:`锁等待均值 ${formatSeconds(lockWaitAvg)}，活动锁 ${formatNumber(activeLocks)}，可能导致父任务收口变慢。`,
      tone: 'border-orange-500/20 bg-orange-500/15 text-orange-400',
    });
  }
  if ((archiveQueued || 0) > 0 || (archiveRunning || 0) > 0) {
    alerts.push({
      label: '归档仍在处理中',
      text:`archive queued=${formatNumber(archiveQueued)}，running=${formatNumber(archiveRunning)}，终态收口仍可能继续延迟。`,
      tone: 'border-sky-500/20 bg-sky-500/15 text-sky-400',
    });
  }
  if ((reconcileLastFailed || 0) > 0) {
    alerts.push({
      label: '后台状态同步失败',
      text:`最近一轮后台状态同步失败 ${formatNumber(reconcileLastFailed)} 个任务。列表查询已不再触发同步，请检查后台循环与下游状态拉取。`,
      tone: 'border-rose-500/20 bg-rose-500/15 text-rose-400',
    });
  }
  if (!alerts.length) {
    alerts.push({
      label: '编排侧整体平稳',
      text: '当前聚合结果没有显示明显的状态事件积压、死信或锁竞争放大信号，可以继续结合下方原始指标排查细节。',
      tone: 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400',
    });
  }
  const slowestTaskListStage = taskListStageRows[0];
  if ((listQueryP95Seconds || 0) > 1) {
    taskListAlerts.push({
      label: '任务列表长尾延迟偏高',
      text:`当前列表查询 P95 ${formatSeconds(listQueryP95Seconds)}，用户在任务列表页会明显感知等待。`,
      tone: 'border-rose-500/20 bg-rose-500/15 text-rose-400',
    });
  }
  if ((listQueryErrors || 0) > 0) {
    taskListAlerts.push({
      label: '任务列表查询存在错误',
      text:`累计错误 ${formatNumber(listQueryErrors)} / 总请求 ${formatNumber(listQueryTotal)}，需要排查读路径稳定性或聚合依赖异常。`,
      tone: 'border-rose-500/20 bg-rose-500/15 text-rose-400',
    });
  }
  if (slowestTaskListStage && (slowestTaskListStage.p95Seconds || 0) > 0.3) {
    taskListAlerts.push({
      label:`最慢分段：${taskListPerfStageLabel(slowestTaskListStage.stage)}`,
      text:`P95 ${formatSeconds(slowestTaskListStage.p95Seconds)}，均值 ${formatSeconds(slowestTaskListStage.avgSeconds)}。`,
      tone: (slowestTaskListStage.p95Seconds || 0) > 1 ? 'border-rose-500/20 bg-rose-500/15 text-rose-400' : 'border-amber-500/20 bg-amber-500/15 text-amber-400',
    });
  }
  if (!taskListAlerts.length) {
    taskListAlerts.push({
      label: '任务列表读路径平稳',
      text: '当前没有明显的任务列表查询慢点或错误积累，若页面仍慢，优先继续排查浏览器渲染或上游网络链路。',
      tone: 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400',
    });
  }

  return {
    overviewCards: [
      {
        label: '聚合完整性',
        value: aggregateCoverage?.partial ? '部分聚合' : '完整聚合',
        hint: aggregateCoverage ?`${formatNumber(aggregateCoverage.successful)}/${formatNumber(aggregateCoverage.attempted)} 实例可用` : '当前无聚合覆盖元数据',
        tone: aggregateCoverage?.partial ? 'text-amber-400' : 'text-emerald-400',
        icon: <ServerCog size={16} />,
      },
      {
        label: '待处理事件数',
        value: formatNumber(pendingDepth),
        hint: oldestPendingAge == null ? '未采集最老事件年龄' :`最老 ${formatSeconds(oldestPendingAge)}`,
        tone: (pendingDepth || 0) > 0 ? 'text-amber-400' : 'text-emerald-400',
        icon: <Database size={16} />,
      },
      {
        label: '死信队列深度',
        value: formatNumber(deadLetterDepth),
        hint:`累计死信 ${formatNumber(deadLettersTotal)}`,
        tone: (deadLetterDepth || 0) > 0 || deadLettersTotal > 0 ? 'text-rose-400' : 'text-emerald-400',
        icon: <ShieldAlert size={16} />,
      },
      {
        label: '锁等待均值',
        value: formatSeconds(lockWaitAvg),
        hint:`锁持有均值 ${formatSeconds(lockHeldAvg)}`,
        tone: (lockWaitAvg || 0) > 0.3 ? 'text-orange-400' : 'text-theme-text-primary',
        icon: <TimerReset size={16} />,
      },
      {
        label: 'StateEventInbox 平均耗时',
        value: formatSeconds(stateEventInboxAvgDuration),
        hint:`事件平均收口延迟 ${formatSeconds(eventAvgLag)}`,
        tone: (stateEventInboxAvgDuration || 0) > 1 ? 'text-amber-400' : 'text-theme-text-primary',
        icon: <Activity size={16} />,
      },
      {
        label: '锁忙 / 失败',
        value:`${formatNumber(stateEventInboxRunLockBusy)} / ${formatNumber(stateEventInboxRunFailed)}`,
        hint: 'stateEventInbox run 结果',
        tone: stateEventInboxRunFailed > 0 ? 'text-rose-400' : stateEventInboxRunLockBusy > 0 ? 'text-amber-400' : 'text-emerald-400',
        icon: <RefreshCw size={16} />,
      },
      {
        label: '归档处理队列',
        value:`${formatNumber(archiveQueued)} / ${formatNumber(archiveRunning)}`,
        hint: 'queued / running',
        tone: archiveQueued > 0 || archiveRunning > 0 ? 'text-sky-400' : 'text-theme-text-primary',
        icon: <GitBranch size={16} />,
      },
      {
        label: '活跃工作单元',
        value:`${formatNumber(runningWorkers)} / ${formatNumber(dispatchWorkers + pendingWorkers)}`,
        hint: 'running / dispatch+pending',
        tone: runningWorkers > 0 ? 'text-teal-400' : 'text-theme-text-primary',
        icon: <TrendingUp size={16} />,
      },
      {
        label: '同步候选任务',
        value: formatNumber(reconcileCandidates),
        hint:`最近运行 ${formatTime(reconcileLastRunAt)}`,
        tone: (reconcileCandidates || 0) > 0 ? 'text-cyan-400' : 'text-theme-text-primary',
        icon: <RefreshCw size={16} />,
      },
    ],
    alerts,
    pipelineSummary: [
      { label: 'running workers', value: runningWorkers, tone: 'text-teal-400' },
      { label: 'dispatch+pending workers', value: dispatchWorkers + pendingWorkers, tone: 'text-indigo-400' },
      { label: 'archive queued', value: archiveQueued, tone: archiveQueued > 0 ? 'text-sky-400' : 'text-theme-text-secondary' },
      { label: 'archive running', value: archiveRunning, tone: archiveRunning > 0 ? 'text-sky-400' : 'text-theme-text-secondary' },
      { label: 'retryable events', value: retryableDepth, tone: (retryableDepth || 0) > 0 ? 'text-amber-400' : 'text-theme-text-secondary' },
      { label: 'dead letters total', value: deadLettersTotal, tone: deadLettersTotal > 0 ? 'text-rose-400' : 'text-theme-text-secondary' },
    ],
    stateEventInboxSummary: [
      { label: 'oldest pending age', value: oldestPendingAge, tone: (oldestPendingAge || 0) > 60 ? 'text-rose-400' : 'text-theme-text-secondary' },
      { label: 'event avg lag', value: eventAvgLag, tone: (eventAvgLag || 0) > 30 ? 'text-rose-400' : 'text-theme-text-secondary' },
      { label: 'stateEventInbox avg duration', value: stateEventInboxAvgDuration, tone: (stateEventInboxAvgDuration || 0) > 1 ? 'text-amber-400' : 'text-theme-text-secondary' },
      { label: 'lock wait avg', value: lockWaitAvg, tone: (lockWaitAvg || 0) > 0.3 ? 'text-orange-400' : 'text-theme-text-secondary' },
      { label: 'lock held avg', value: lockHeldAvg, tone: (lockHeldAvg || 0) > 1.5 ? 'text-rose-400' : 'text-theme-text-secondary' },
      { label: 'active locks', value: activeLocks, tone: activeLocks > 0 ? 'text-orange-400' : 'text-theme-text-secondary' },
    ],
    syncSummary: [
      { label: 'last attempted', value: reconcileLastAttempted, tone: 'text-theme-text-secondary' },
      { label: 'last changed', value: reconcileLastChanged, tone: (reconcileLastChanged || 0) > 0 ? 'text-cyan-400' : 'text-theme-text-secondary' },
      { label: 'last failed', value: reconcileLastFailed, tone: (reconcileLastFailed || 0) > 0 ? 'text-rose-400' : 'text-emerald-400' },
      { label: 'changed total', value: reconcileChangedTotal, tone: (reconcileChangedTotal || 0) > 0 ? 'text-cyan-400' : 'text-theme-text-secondary' },
      { label: 'failed total', value: reconcileFailedTotal, tone: (reconcileFailedTotal || 0) > 0 ? 'text-rose-400' : 'text-emerald-400' },
    ],
    taskListPerformance: {
      topCards: [
        { label: '列表总请求', value: formatNumber(listQueryTotal), hint: 'task_list_queries_total', tone: 'text-theme-text-primary' },
        { label: '错误请求', value: formatNumber(listQueryErrors), hint: 'result=error', tone: listQueryErrors > 0 ? 'text-rose-400' : 'text-emerald-400' },
        { label: '平均耗时', value: formatSeconds(listQueryAvgSeconds), hint: 'overall avg', tone: (listQueryAvgSeconds || 0) > 0.5 ? 'text-amber-400' : 'text-theme-text-primary' },
        { label: 'P50', value: formatSeconds(listQueryP50Seconds), hint: 'overall p50', tone: (listQueryP50Seconds || 0) > 0.3 ? 'text-amber-400' : 'text-theme-text-primary' },
        {
          label: 'P95',
          value: formatSeconds(listQueryP95Seconds),
          hint: 'overall p95',
          tone: (listQueryP95Seconds || 0) > 1 ? 'text-rose-400' : (listQueryP95Seconds || 0) > 0.5 ? 'text-amber-400' : 'text-emerald-400',
        },
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

const buildRestApiViewModel = (rows: DisplayMetricRow[]): RestApiViewModel => {
  const routeMap = new Map<string, RestApiRouteSummary>();

  const ensureRoute = (route: string, method: string): RestApiRouteSummary => {
    const key =`${method} ${route}`;
    const existing = routeMap.get(key);
    if (existing) return existing;
    const created: RestApiRouteSummary = {
      route,
      method,
      requestCount: 0,
      avgSeconds: null,
      p50Seconds: null,
      p95Seconds: null,
      p99Seconds: null,
      approxMaxSeconds: null,
      status2xx: 0,
      status4xx: 0,
      status5xx: 0,
      inflight: 0,
    };
    routeMap.set(key, created);
    return created;
  };

  rows.forEach((row) => {
    if (row.group !== 'http') return;
    const route = row.labels.route || row.labels.path || '/';
    const method = row.labels.method || row.labels.http_method || 'ALL';
    const item = ensureRoute(route, method);

    if (/_request(s)?_(total|count)$/u.test(row.name) || /(http|api).*requests_total$/u.test(row.name)) {
      item.requestCount += row.value;
      const status = row.labels.status || row.labels.code || row.labels.status_code || '';
      if (/^2/u.test(status)) item.status2xx += row.value;
      else if (/^4/u.test(status)) item.status4xx += row.value;
      else if (/^5/u.test(status)) item.status5xx += row.value;
    }

    if (/(inflight|in_progress|running_requests)/u.test(row.name)) {
      item.inflight += row.value;
    }
  });

  for (const item of routeMap.values()) {
    item.avgSeconds =
      histogramAverage(rows, 'http_request_duration_seconds', { route: item.route, method: item.method }) ??
      histogramAverage(rows, 'api_request_duration_seconds', { route: item.route, method: item.method }) ??
      histogramAverage(rows, 'chimera_http_request_duration_seconds', { route: item.route, method: item.method }) ??
      histogramAverage(rows, 'chimera_api_request_duration_seconds', { route: item.route, method: item.method });
    item.p50Seconds =
      histogramQuantile(rows, 'http_request_duration_seconds', 0.5, { route: item.route, method: item.method }) ??
      histogramQuantile(rows, 'api_request_duration_seconds', 0.5, { route: item.route, method: item.method }) ??
      histogramQuantile(rows, 'chimera_http_request_duration_seconds', 0.5, { route: item.route, method: item.method }) ??
      histogramQuantile(rows, 'chimera_api_request_duration_seconds', 0.5, { route: item.route, method: item.method });
    item.p95Seconds =
      histogramQuantile(rows, 'http_request_duration_seconds', 0.95, { route: item.route, method: item.method }) ??
      histogramQuantile(rows, 'api_request_duration_seconds', 0.95, { route: item.route, method: item.method }) ??
      histogramQuantile(rows, 'chimera_http_request_duration_seconds', 0.95, { route: item.route, method: item.method }) ??
      histogramQuantile(rows, 'chimera_api_request_duration_seconds', 0.95, { route: item.route, method: item.method });
    item.p99Seconds =
      histogramQuantile(rows, 'http_request_duration_seconds', 0.99, { route: item.route, method: item.method }) ??
      histogramQuantile(rows, 'api_request_duration_seconds', 0.99, { route: item.route, method: item.method }) ??
      histogramQuantile(rows, 'chimera_http_request_duration_seconds', 0.99, { route: item.route, method: item.method }) ??
      histogramQuantile(rows, 'chimera_api_request_duration_seconds', 0.99, { route: item.route, method: item.method });
    item.approxMaxSeconds = Math.max(item.p99Seconds || 0, item.p95Seconds || 0, item.avgSeconds || 0) || null;
  }

  const resultRows = [...routeMap.values()].sort(
    (left, right) => (right.p95Seconds || 0) - (left.p95Seconds || 0) || right.requestCount - left.requestCount,
  );
  const totalRequests = resultRows.reduce((sum, item) => sum + item.requestCount, 0);
  const totalInflight = resultRows.reduce((sum, item) => sum + item.inflight, 0);
  const weightedDuration = resultRows.reduce((sum, item) => sum + (item.avgSeconds || 0) * item.requestCount, 0);
  const total5xx = resultRows.reduce((sum, item) => sum + item.status5xx, 0);

  return {
    rows: resultRows,
    totalRequests,
    totalInflight,
    avgSeconds: totalRequests > 0 ? weightedDuration / totalRequests : null,
    p95Seconds: resultRows.reduce<number | null>((max, item) => {
      if (item.p95Seconds == null) return max;
      return max == null ? item.p95Seconds : Math.max(max, item.p95Seconds);
    }, null),
    slowRouteCount: resultRows.filter((item) => (item.p95Seconds || 0) >= 1 || (item.avgSeconds || 0) >= 0.5).length,
    errorRate: totalRequests > 0 ? total5xx / totalRequests : null,
    topByCount: resultRows.slice(0, 6).sort((left, right) => right.requestCount - left.requestCount).map((item) => ({ name:`${item.method} ${item.route}`, value: item.requestCount })),
    topByP95: resultRows.slice(0, 6).sort((left, right) => (right.p95Seconds || 0) - (left.p95Seconds || 0)).map((item) => ({ name:`${item.method} ${item.route}`, value: item.p95Seconds || 0 })),
    topBy5xx: resultRows
      .slice(0, 6)
      .sort((left, right) => right.status5xx - left.status5xx)
      .filter((item) => item.status5xx > 0)
      .map((item) => ({ name:`${item.method} ${item.route}`, value: item.status5xx })),
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
    roleTotal: matchSum((row) => /_runtime_role_count$/u.test(row.name)),
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
    aiRows.filter((row) => /(_runtime_role_count|_ai_(session_total|round_total|retry_total|timeout_total|failure_total|token_usage_total|token_cost_total|review_total))$/u.test(row.name)).map((row) => row.familyName),
  );
  const lookup = canonicalLookup(aiRows);
  const roleChart = ['task_owner', 'lease_auditor']
    .map((role) => ({
      name: role,
      value: aiRows.filter((row) => /_runtime_role_count$/u.test(row.name) && row.labels.role === role).reduce((sum, row) => sum + row.value, 0),
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
      { label: '运行角色活跃数', value: lookup.roleTotal, hint: 'runtime_role_count 聚合', icon: <Activity size={16} /> },
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

const buildSummaryObservabilityViewModel = (summary: SummaryObservabilityResponse | null): SummaryObservabilityViewModel | null => {
  if (!summary) return null;
  const overviewCards = (summary.overview_cards || []).map((item) => ({
    label: item.label,
    value: typeof item.value === 'number' ? formatMetricValue(item.value) : String(item.value ?? '-'),
    hint: item.hint || '',
    tone: item.tone || 'text-theme-text-primary',
  }));
  const statusRows = Object.entries(summary.status_counts || {})
    .map(([label, value]) => ({
      label,
      value: Number(value) || 0,
      tone: label === 'failed' || label === 'error' ? 'text-rose-400' : label === 'running' ? 'text-teal-400' : 'text-theme-text-secondary',
    }))
    .sort((left, right) => right.value - left.value);
  return {
    overviewCards,
    alerts: summary.alerts || [],
    statusRows,
  };
};

const buildRowsFromSummaryMetricRows = (summary: SummaryObservabilityResponse | null): DisplayMetricRow[] =>
  (summary?.metric_rows || []).map((row) => {
    const labels = Object.fromEntries(Object.entries(row.labels || {}).map(([key, value]) => [key, String(value)])) as Record<string, string>;
    const metric: ParsedMetricSample = {
      name: row.name,
      familyName: row.family_name,
      labels,
      value: Number(row.value) || 0,
      type: 'gauge',
      help: null,
    };
    return {
      ...metric,
      group: detectGroup(metric, getBinarySecurityMetricsService('binary-security')),
      labelText: labelTextForMetric(labels),
      displayName: row.name,
    };
  });

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
  if (!(quantile >= 0 && quantile <= 1)) return null;
  const matchesLabels = (row: DisplayMetricRow) =>
    Object.entries(labels).every(([key, value]) => row.labels[key] === value);
  const buckets = rows
    .filter((row) => row.familyName === familyName && row.name.endsWith('_bucket') && matchesLabels(row))
    .map((row) => ({
      upperBound: row.labels.le === '+Inf' ? Number.POSITIVE_INFINITY : Number(row.labels.le),
      count: row.value,
    }))
    .filter((item) => Number.isFinite(item.upperBound) || item.upperBound === Number.POSITIVE_INFINITY)
    .sort((left, right) => left.upperBound - right.upperBound);
  if (!buckets.length) return null;
  const total = buckets[buckets.length - 1]?.count ?? 0;
  if (!(total > 0)) return null;
  const target = total * quantile;
  let previousUpperBound = 0;
  let previousCount = 0;
  for (const bucket of buckets) {
    if (bucket.count >= target) {
      if (!Number.isFinite(bucket.upperBound)) return previousUpperBound;
      const bucketCount = bucket.count - previousCount;
      if (!(bucketCount > 0)) return bucket.upperBound;
      const offset = (target - previousCount) / bucketCount;
      return previousUpperBound + (bucket.upperBound - previousUpperBound) * offset;
    }
    previousUpperBound = Number.isFinite(bucket.upperBound) ? bucket.upperBound : previousUpperBound;
    previousCount = bucket.count;
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
  const running = valueOrZero(metricValueByName(rows, 'chimera_sa_tasks_running'));
  const pending = valueOrZero(metricValueByName(rows, 'chimera_sa_tasks_pending'));
  const finished = valueOrZero(metricValueByName(rows, 'chimera_sa_tasks_finished'));
  const queueWaitAvg = averageFromSummary(rows, 'chimera_sa_queue_wait_seconds');
  const executionAvg = averageFromSummary(rows, 'chimera_sa_execution_seconds');
  const turnaroundAvg = averageFromSummary(rows, 'chimera_sa_turnaround_seconds');
  const workerCapacity = metricValueByName(rows, 'chimera_sa_worker_runtime', { kind: 'capacity' });
  const workerRunning = metricValueByName(rows, 'chimera_sa_worker_runtime', { kind: 'running' });
  const workerAvailableSlots = metricValueByName(rows, 'chimera_sa_worker_runtime', { kind: 'available_slots' });
  const workerRuntimeUtilization = metricValueByName(rows, 'chimera_sa_worker_utilization_ratio');
  const workers = valueOrZero(workerCapacity ?? metricValueByName(rows, 'chimera_sa_workers'));
  const judges = valueOrZero(metricValueByName(rows, 'chimera_sa_judges'));
  const sessions = valueOrZero(metricValueByName(rows, 'chimera_sa_sessions'));
  const retryTotal = valueOrZero(metricValueByName(rows, 'chimera_sa_retry_total'));
  const timeoutTotal = valueOrZero(metricValueByName(rows, 'chimera_sa_timeout_total'));
  const cancelTotal = valueOrZero(metricValueByName(rows, 'chimera_sa_cancel_total'));
  const tokenInputTotal = valueOrZero(metricValueByName(rows, 'chimera_sa_token_input_total'));
  const tokenOutputTotal = valueOrZero(metricValueByName(rows, 'chimera_sa_token_output_total'));
  const tokenCostTotal = metricValueByName(rows, 'chimera_sa_token_cost_total');
  const tokenInputRunning = valueOrZero(metricValueByName(rows, 'chimera_sa_token_input_running'));
  const tokenOutputRunning = valueOrZero(metricValueByName(rows, 'chimera_sa_token_output_running'));
  const tokenCostRunning = metricValueByName(rows, 'chimera_sa_token_cost_running');
  const moduleTotal = valueOrZero(metricValueByName(rows, 'chimera_sa_module_total'));
  const moduleCompletedTotal = valueOrZero(metricValueByName(rows, 'chimera_sa_module_completed_total'));
  const moduleFailedTotal = valueOrZero(metricValueByName(rows, 'chimera_sa_module_failed_total'));
  const checkpointAnyTasks = valueOrZero(metricValueByName(rows, 'chimera_sa_checkpoint_tasks', { state: 'any' }));
  const checkpointPartialTasks = valueOrZero(metricValueByName(rows, 'chimera_sa_checkpoint_tasks', { state: 'partial' }));
  const checkpointOverallDoneTasks = valueOrZero(metricValueByName(rows, 'chimera_sa_checkpoint_tasks', { state: 'overall_done' }));
  const firstRoundPassRate = averageFromSummary(rows, 'chimera_sa_effectiveness_first_round_pass_rate');
  const finalModulePassRate = averageFromSummary(rows, 'chimera_sa_effectiveness_final_module_pass_rate');
  const multiRoundPassRate = averageFromSummary(rows, 'chimera_sa_effectiveness_multi_round_pass_rate');
  const reflectionRounds = valueOrZero(metricValueByName(rows, 'chimera_sa_effectiveness_reflection_round_total'));
  const reclassifyTotal = valueOrZero(metricValueByName(rows, 'chimera_sa_effectiveness_reclassify_total'));
  const checkpointStageRows = rows
    .filter((row) => row.name === 'chimera_sa_checkpoint_stage_done_total')
    .sort((left, right) => left.labels.stage?.localeCompare(right.labels.stage || '', 'zh-CN') || 0);
  const checkpointS2Modules = valueOrZero(metricValueByName(rows, 'chimera_sa_checkpoint_module_done_total', { stage: 's2' }));
  const checkpointS3Modules = valueOrZero(metricValueByName(rows, 'chimera_sa_checkpoint_module_done_total', { stage: 's3' }));

  const failureCategories = rows
    .filter((row) => row.name === 'chimera_sa_failure_category_total')
    .sort((left, right) => right.value - left.value)
    .map((row) => ({
      label: row.labels.category || 'unknown',
      value: row.value,
      tone: row.labels.category === 'timeout' ? 'text-amber-400' : 'text-rose-400',
    }));

  const stageNames = Array.from(new Set(rows.filter((row) => row.name === 'chimera_sa_stage_rounds').map((row) => row.labels.stage || 'unknown'))).sort((left, right) =>
    left.localeCompare(right, 'zh-CN'),
  );
  const terminalStatuses = new Set(['passed', 'success', 'failed', 'error', 'cancelled', 'timeout']);
  const stageRows = stageNames.map((stage) => {
    const stageEntries = rows.filter(
      (row) =>
        [
          'chimera_sa_stage_rounds',
          'chimera_sa_stage_records_total',
          'chimera_sa_stage_duration_seconds',
          'chimera_sa_stage_token_total',
          'chimera_sa_stage_cost_total',
          'chimera_sa_stage_vote_pass_total',
          'chimera_sa_stage_vote_fail_total',
          'chimera_sa_stage_judge_score_sum',
          'chimera_sa_stage_judge_score_count',
          'chimera_sa_stage_review_pass_rate_sum',
          'chimera_sa_stage_review_pass_rate_count',
          'chimera_sa_stage_round_index_sum',
          'chimera_sa_stage_round_index_count',
        ].includes(row.name) && row.labels.stage === stage,
    );
    const statusValues = Array.from(new Set(stageEntries.map((row) => row.labels.status || 'unknown')));
    const totalRuns = statusValues.reduce((sum, status) => {
      const explicit = metricValueByName(rows, 'chimera_sa_stage_records_total', { stage, status });
      return sum + valueOrZero(explicit ?? metricValueByName(rows, 'chimera_sa_stage_rounds', { stage, status }));
    }, 0);
    const successRuns = statusValues.reduce((sum, status) => {
      const explicit = metricValueByName(rows, 'chimera_sa_stage_vote_pass_total', { stage, status });
      if (explicit != null) return sum + valueOrZero(explicit);
      return sum + (['passed', 'success', 'completed'].includes(status) ? valueOrZero(metricValueByName(rows, 'chimera_sa_stage_rounds', { stage, status })) : 0);
    }, 0);
    const failedRuns = statusValues.reduce((sum, status) => {
      const explicit = metricValueByName(rows, 'chimera_sa_stage_vote_fail_total', { stage, status });
      if (explicit != null) return sum + valueOrZero(explicit);
      return sum + (['failed', 'error', 'timeout', 'cancelled'].includes(status) ? valueOrZero(metricValueByName(rows, 'chimera_sa_stage_rounds', { stage, status })) : 0);
    }, 0);
    const runningRuns = statusValues
      .filter((status) => !terminalStatuses.has(status))
      .reduce((sum, status) => sum + valueOrZero(metricValueByName(rows, 'chimera_sa_stage_records_total', { stage, status }) ?? metricValueByName(rows, 'chimera_sa_stage_rounds', { stage, status })), 0);
    const totalDuration = statusValues.reduce((sum, status) => sum + valueOrZero(metricValueByName(rows, 'chimera_sa_stage_duration_seconds', { stage, status })), 0);
    const totalTokens = statusValues.reduce((sum, status) => sum + valueOrZero(metricValueByName(rows, 'chimera_sa_stage_token_total', { stage, status })), 0);
    const totalCost = statusValues.reduce((sum, status) => sum + valueOrZero(metricValueByName(rows, 'chimera_sa_stage_cost_total', { stage, status })), 0);
    const scoreSum = statusValues.reduce((sum, status) => sum + valueOrZero(metricValueByName(rows, 'chimera_sa_stage_judge_score_sum', { stage, status })), 0);
    const scoreCount = statusValues.reduce((sum, status) => sum + valueOrZero(metricValueByName(rows, 'chimera_sa_stage_judge_score_count', { stage, status })), 0);
    const roundIndexSum = statusValues.reduce((sum, status) => sum + valueOrZero(metricValueByName(rows, 'chimera_sa_stage_round_index_sum', { stage, status })), 0);
    const roundIndexCount = statusValues.reduce((sum, status) => sum + valueOrZero(metricValueByName(rows, 'chimera_sa_stage_round_index_count', { stage, status })), 0);
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
      const tone = pressureScore >= 8 ? 'text-rose-400' : pressureScore >= 4 ? 'text-amber-400' : 'text-emerald-400';
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
      text:`pending=${formatNumber(pending)} 已高于 workers=${formatNumber(workers)}，当前存在明显的排队压力。`,
      tone: 'border-amber-500/20 bg-amber-500/15 text-amber-400',
    });
  }
  if ((timeoutRate || 0) >= 10) {
    riskAlerts.push({
      label: '超时偏高',
      text:`timeout=${formatNumber(timeoutTotal)}，约占已结束任务的 ${formatNumber(timeoutRate, 1)}%。`,
      tone: 'border-rose-500/20 bg-rose-500/15 text-rose-400',
    });
  }
  if ((finalModulePassRate || 0) > 0 && (finalModulePassRate || 0) < 0.8) {
    riskAlerts.push({
      label: '最终通过率偏低',
      text:`final module pass rate 仅 ${formatNumber((finalModulePassRate || 0) * 100, 1)}%，需要重点观察评审闭环和重分类效果。`,
      tone: 'border-amber-500/20 bg-amber-500/15 text-amber-400',
    });
  }
  if (!riskAlerts.length) {
    riskAlerts.push({
      label: '整体平稳',
      text: '当前未发现明显的排队或超时放大信号，可以继续通过阶段健康表观察结构性问题。',
      tone: 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400',
    });
  }

  return {
    compactSummary: [
      { label: '排队/运行', value:`${formatNumber(pending)}/${formatNumber(running)}`, tone: queuePressure ? 'text-amber-400' : 'text-theme-text-secondary' },
      { label: '均排/均执', value:`${formatSeconds(queueWaitAvg)}/${formatSeconds(executionAvg)}`, tone: (queueWaitAvg || 0) > 300 || (executionAvg || 0) > 1800 ? 'text-amber-400' : 'text-theme-text-secondary' },
      { label: '首过/终过', value:`${firstRoundPassRate == null ? '-' :`${formatNumber(firstRoundPassRate * 100, 1)}%`}/${finalModulePassRate == null ? '-' :`${formatNumber(finalModulePassRate * 100, 1)}%`}`, tone: (finalModulePassRate || 0) < 0.8 ? 'text-amber-400' : 'text-emerald-400' },
      { label: '重试/超时', value:`${formatNumber(retryTotal)}/${formatNumber(timeoutTotal)}`, tone: timeoutTotal > 0 ? 'text-rose-400' : retryTotal > 0 ? 'text-amber-400' : 'text-theme-text-secondary' },
      { label: '并发命中', value: workerUtilization == null ? '-' :`${formatNumber(workerUtilization, 1)}%`, tone: (workerUtilization || 0) < 60 && effectiveRunning > 0 ? 'text-amber-400' : 'text-indigo-400' },
      { label: '续跑完成', value: resumedTaskCompletionRate == null ? '-' :`${formatNumber(resumedTaskCompletionRate, 1)}%`, tone: checkpointAnyTasks > 0 ? 'text-sky-400' : 'text-theme-text-muted' },
    ],
    overviewCards: [
      { label: '运行/排队', value:`${formatNumber(running)} / ${formatNumber(pending)}`, hint:`finished ${formatNumber(finished)}`, tone: running > 0 ? 'text-teal-400' : 'text-theme-text-primary' },
      { label: '平均排队', value: formatSeconds(queueWaitAvg), hint: 'queue_wait_seconds', tone: (queueWaitAvg || 0) > 300 ? 'text-amber-400' : 'text-theme-text-primary' },
      { label: '平均执行', value: formatSeconds(executionAvg), hint: 'execution_seconds', tone: (executionAvg || 0) > 1800 ? 'text-amber-400' : 'text-theme-text-primary' },
      { label: '平均周转', value: formatSeconds(turnaroundAvg), hint: 'turnaround_seconds', tone: (turnaroundAvg || 0) > 2400 ? 'text-rose-400' : 'text-theme-text-primary' },
      { label: 'Worker/Judge', value:`${formatNumber(workers)} / ${formatNumber(judges)}`, hint:`running ${formatNumber(effectiveRunning)} · sessions ${formatNumber(sessions)}`, tone: 'text-indigo-400' },
      { label: '模块完成', value: moduleTotal > 0 ?`${formatNumber(moduleCompletedTotal)} / ${formatNumber(moduleTotal)}` : '-', hint:`failed ${formatNumber(moduleFailedTotal)}`, tone: moduleFailedTotal > 0 ? 'text-amber-400' : 'text-emerald-400' },
      { label: '完成产能', value: tokenPerFinished == null ? '-' :`${formatNumber(tokenPerFinished, 0)} tok/task`, hint: '平均每个完成任务 token', tone: 'text-violet-400' },
    ],
    governanceCards: [
      { label: '待处理/Worker', value: pendingPerWorker == null ? '-' : formatNumber(pendingPerWorker, 2), hint: '背压强度', tone: (pendingPerWorker || 0) > 1 ? 'text-amber-400' : 'text-theme-text-primary' },
      { label: '可用槽位', value: formatNumber(effectiveAvailableSlots), hint:`capacity ${formatNumber(workers)} - running ${formatNumber(effectiveRunning)}`, tone: effectiveAvailableSlots > 0 ? 'text-emerald-400' : 'text-amber-400' },
      { label: 'Session/活跃单元', value: sessionPerUnit == null ? '-' : formatNumber(sessionPerUnit, 2), hint: 'worker+judge 承载会话密度', tone: (sessionPerUnit || 0) > 3 ? 'text-indigo-400' : 'text-theme-text-primary' },
      { label: '重试压力', value: retryPressure == null ? '-' : formatNumber(retryPressure, 2), hint: 'retry per finished task', tone: (retryPressure || 0) > 1 ? 'text-amber-400' : 'text-theme-text-primary' },
      { label: 'Checkpoint 续跑面', value: checkpointCoverage == null ? '-' :`${formatNumber(checkpointCoverage, 1)}%`, hint:`${formatNumber(checkpointPartialTasks)}/${formatNumber(checkpointAnyTasks)} partial`, tone: (checkpointCoverage || 0) > 0 ? 'text-sky-400' : 'text-theme-text-primary' },
      { label: 'Checkpoint 完整体', value:`${formatNumber(checkpointOverallDoneTasks)}`, hint: 'overall_done tasks', tone: checkpointOverallDoneTasks > 0 ? 'text-theme-text-primary' : 'text-emerald-400' },
      { label: '取消任务', value: formatNumber(cancelTotal), hint: 'cancel_total', tone: cancelTotal > 0 ? 'text-theme-text-primary' : 'text-emerald-400' },
    ],
    qualityCards: [
      { label: '超时率', value: timeoutRate == null ? '-' :`${formatNumber(timeoutRate, 1)}%`, hint:`timeout ${formatNumber(timeoutTotal)}`, tone: (timeoutRate || 0) > 10 ? 'text-rose-400' : 'text-emerald-400' },
      { label: '首轮通过率', value: firstRoundPassRate == null ? '-' :`${formatNumber(firstRoundPassRate * 100, 1)}%`, hint: 'effectiveness.first_round_pass_rate', tone: (firstRoundPassRate || 0) < 0.7 ? 'text-amber-400' : 'text-emerald-400' },
      { label: '最终通过率', value: finalModulePassRate == null ? '-' :`${formatNumber(finalModulePassRate * 100, 1)}%`, hint: 'effectiveness.final_module_pass_rate', tone: (finalModulePassRate || 0) < 0.8 ? 'text-amber-400' : 'text-emerald-400' },
      { label: '多轮兜底率', value: multiRoundPassRate == null ? '-' :`${formatNumber(multiRoundPassRate * 100, 1)}%`, hint: 'effectiveness.multi_round_pass_rate', tone: (multiRoundPassRate || 0) > 0 ? 'text-indigo-400' : 'text-theme-text-primary' },
      { label: '反思/重分类', value:`${formatNumber(reflectionRounds)} / ${formatNumber(reclassifyTotal)}`, hint: 'reflection / reclassify', tone: reflectionRounds > 0 || reclassifyTotal > 0 ? 'text-theme-text-primary' : 'text-emerald-400' },
    ],
    costCards: [
      { label: '输入 Token', value: formatNumber(tokenInputTotal), hint:`running ${formatNumber(tokenInputRunning)}`, tone: 'text-violet-400' },
      { label: '输出 Token', value: formatNumber(tokenOutputTotal), hint:`running ${formatNumber(tokenOutputRunning)}`, tone: 'text-violet-400' },
      { label: '累计成本', value: formatMetricValue(tokenCostTotal ?? Number.NaN), hint:`running ${formatMetricValue(tokenCostRunning ?? Number.NaN)}`, tone: 'text-fuchsia-400' },
      { label: '单任务成本', value: costPerFinished == null ? '-' : formatMetricValue(costPerFinished), hint: 'cost per finished task', tone: 'text-fuchsia-400' },
    ],
    stageRows,
    failureCategories,
    riskAlerts,
    checkpointCards: [
      {
        label: '续跑任务覆盖',
        value: checkpointAnyTasks > 0 ?`${formatNumber(checkpointAnyTasks)}` : '-',
        hint:`partial ${formatNumber(checkpointPartialTasks)} / done ${formatNumber(checkpointOverallDoneTasks)}`,
        tone: checkpointAnyTasks > 0 ? 'text-sky-400' : 'text-theme-text-muted',
      },
      {
        label: '续跑完成率',
        value: resumedTaskCompletionRate == null ? '-' :`${formatNumber(resumedTaskCompletionRate, 1)}%`,
        hint: 'overall_done / any checkpoint task',
        tone: (resumedTaskCompletionRate || 0) >= 80 ? 'text-emerald-400' : checkpointAnyTasks > 0 ? 'text-amber-400' : 'text-theme-text-muted',
      },
      {
        label: '阶段 checkpoint 均值',
        value: stageCheckpointCoverage == null ? '-' : formatNumber(stageCheckpointCoverage, 1),
        hint: '平均每个 checkpoint stage 被命中次数',
        tone: stageCheckpointCoverage != null ? 'text-theme-text-primary' : 'text-theme-text-muted',
      },
      {
        label: '模块恢复面',
        value:`${formatNumber(checkpointS2Modules)} / ${formatNumber(checkpointS3Modules)}`,
        hint: 's2 / s3 completed modules',
        tone: checkpointS2Modules > 0 || checkpointS3Modules > 0 ? 'text-sky-400' : 'text-theme-text-muted',
      },
    ],
    checkpointChart: [
      { name: 'partial', value: checkpointPartialTasks, fill: '#0ea5e9' },
      { name: 'overall_done', value: checkpointOverallDoneTasks, fill: '#10b981' },
      { name: 's2 modules', value: checkpointS2Modules, fill: '#2563EB' },
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
        hint: stagePressureLeader ?`score ${formatNumber(stagePressureLeader.pressureScore, 1)}` : '暂无阶段样本',
        tone: stagePressureLeader?.tone || 'text-theme-text-muted',
      },
      {
        label: '热点阶段数',
        value: formatNumber(hotStageCount),
        hint: 'pressure score >= 4',
        tone: hotStageCount > 0 ? 'text-amber-400' : 'text-emerald-400',
      },
      {
        label: '最高运行堆积',
        value: stagePressureLeader ? formatNumber(stagePressureLeader.runningRuns) : '-',
        hint: 'top stage running runs',
        tone: stagePressureLeader && stagePressureLeader.runningRuns > 0 ? 'text-rose-400' : 'text-theme-text-muted',
      },
    ],
    stagePressureRows,
  };
};

const buildBinarySecurityStateEventInboxSnapshot = (rows: DisplayMetricRow[]): BinarySecurityStateEventInboxSnapshot => ({
  capturedAt: Date.now(),
  pendingDepth: metricValueByName(rows, 'chimera_binary_security_state_event_queue_depth', { status: 'pending' }),
  processingDepth: metricValueByName(rows, 'chimera_binary_security_state_event_queue_depth', { status: 'processing' }),
  retryableDepth: metricValueByName(rows, 'chimera_binary_security_state_event_queue_depth', { status: 'retryable' }),
  deadLetterDepth: metricValueByName(rows, 'chimera_binary_security_state_event_queue_depth', { status: 'dead_letter' }),
  processedDepth: metricValueByName(rows, 'chimera_binary_security_state_event_queue_depth', { status: 'processed' }),
  oldestPendingAge: metricValueByName(rows, 'chimera_binary_security_state_event_oldest_age_seconds', { status: 'pending' }),
  oldestProcessingAge: metricValueByName(rows, 'chimera_binary_security_state_event_oldest_age_seconds', { status: 'processing' }),
  oldestRetryableAge: metricValueByName(rows, 'chimera_binary_security_state_event_oldest_age_seconds', { status: 'retryable' }),
  oldestDeadLetterAge: metricValueByName(rows, 'chimera_binary_security_state_event_oldest_age_seconds', { status: 'dead_letter' }),
  stateEventInboxRunSuccess: metricValueByName(rows, 'chimera_binary_security_state_stateEventInbox_runs_total', { result: 'success' }),
  stateEventInboxRunFailed: metricValueByName(rows, 'chimera_binary_security_state_stateEventInbox_runs_total', { result: 'failed' }),
  stateEventInboxRunLockBusy: metricValueByName(rows, 'chimera_binary_security_state_stateEventInbox_runs_total', { result: 'lock_busy' }),
  stateEventInboxRunSkipped: metricValueByName(rows, 'chimera_binary_security_state_stateEventInbox_runs_total', { result: 'skipped' }),
  stateEventInboxAvgDurationSeconds: histogramAverage(rows, 'chimera_binary_security_state_stateEventInbox_duration_seconds'),
  eventAvgLagSeconds: histogramAverage(rows, 'chimera_binary_security_state_event_lag_seconds'),
  lockWaitAvgSeconds: histogramAverage(rows, 'chimera_binary_security_task_state_lock_wait_seconds'),
  lockHeldAvgSeconds: histogramAverage(rows, 'chimera_binary_security_task_state_lock_held_seconds'),
});

const buildBinarySecurityStateEventInboxSnapshotMeta = (rows: DisplayMetricRow[]) => ({
  available: (metricValueByName(rows, 'chimera_binary_security_stateEventInbox_snapshot_available') || 0) > 0,
  stale: (metricValueByName(rows, 'chimera_binary_security_stateEventInbox_snapshot_stale') || 0) > 0,
  ageSeconds: metricValueByName(rows, 'chimera_binary_security_stateEventInbox_snapshot_age_seconds'),
  sourcePod: rows.find((row) => row.name === 'chimera_binary_security_stateEventInbox_snapshot_source_info')?.labels.pod || null,
  generatedAtTimestamp: metricValueByName(rows, 'chimera_binary_security_stateEventInbox_snapshot_generated_at_timestamp_seconds'),
});

const buildB2SBusinessViewModel = (rows: DisplayMetricRow[]): B2SBusinessViewModel => {
  const availableItems =
    metricValueByName(rows, 'chimera_binary_to_source_runtime_metric_available_items') ??
    metricValueByName(rows, 'chimera_binary_to_source_business_metric_available_items');
  const legacyMissing = metricValueByName(rows, 'chimera_binary_to_source_business_metric_missing_items');
  const missingReasons = rows
    .filter((row) => row.name === 'chimera_binary_to_source_runtime_metric_missing_items' && row.labels.reason !== 'none')
    .map((row) => ({ reason: row.labels.reason || 'unknown', value: row.value }))
    .sort((left, right) => right.value - left.value);
  const missingItems = missingReasons.length ? missingReasons.reduce((sum, item) => sum + item.value, 0) : legacyMissing;
  const totalItems = (availableItems || 0) + (missingItems || 0);
  const latestSeenSeconds = metricValueByName(rows, 'chimera_binary_to_source_latest_runtime_metric_seen_timestamp');
  return {
    availableItems,
    missingItems,
    coverageRate: totalItems > 0 ? ((availableItems || 0) / totalItems) * 100 : null,
    headerAvgSeconds:
      histogramAverage(rows, 'chimera_binary_to_source_completed_phase_duration_seconds', { phase: 'header_synthesis' }) ??
      histogramAverage(rows, 'chimera_binary_to_source_header_recovery_duration_seconds'),
    bodyAvgSeconds:
      histogramAverage(rows, 'chimera_binary_to_source_completed_phase_duration_seconds', { phase: 'body_generation' }) ??
      histogramAverage(rows, 'chimera_binary_to_source_body_recovery_duration_seconds'),
    batchAvgSeconds: histogramAverage(rows, 'chimera_binary_to_source_batch_recovery_duration_seconds'),
    runningHeaderAvgSeconds: histogramAverage(rows, 'chimera_binary_to_source_running_phase_duration_seconds', { phase: 'header_synthesis' }),
    runningBodyAvgSeconds: histogramAverage(rows, 'chimera_binary_to_source_running_phase_duration_seconds', { phase: 'body_generation' }),
    functionThroughput: metricValueByName(rows, 'chimera_binary_to_source_function_throughput'),
    weightedFunctionThroughput: metricValueByName(rows, 'chimera_binary_to_source_weighted_function_throughput'),
    batchRetryRate: metricValueByName(rows, 'chimera_binary_to_source_batch_retry_rate'),
    batchValidationPassRate: metricValueByName(rows, 'chimera_binary_to_source_batch_validation_pass_rate'),
    batchFailureRate: metricValueByName(rows, 'chimera_binary_to_source_batch_failure_rate'),
    avgAttemptsPerBatch: metricValueByName(rows, 'chimera_binary_to_source_avg_attempts_per_batch'),
    batchAttempts: metricValueByName(rows, 'chimera_binary_to_source_batch_attempts_total'),
    batchValidation: metricValueByName(rows, 'chimera_binary_to_source_batch_validation_total'),
    artifactBytes: metricValueByName(rows, 'chimera_binary_to_source_artifact_bytes'),
    tokenTotal: metricValueByName(rows, 'chimera_binary_to_source_llm_token_usage_total'),
    costTotal: metricValueByName(rows, 'chimera_binary_to_source_llm_token_cost_total'),
    latestSeenAt: latestSeenSeconds && latestSeenSeconds > 0 ? latestSeenSeconds * 1000 : null,
    missingReasons,
  };
};

const buildB2SCacheViewModel = (rows: DisplayMetricRow[]): B2SCacheViewModel => {
  const requests = metricValueByName(rows, 'chimera_binary_to_source_cache_requests_total');
  const hits = metricValueByName(rows, 'chimera_binary_to_source_cache_hits_total');
  const misses = metricValueByName(rows, 'chimera_binary_to_source_cache_misses_total');
  const bypassed = metricValueByName(rows, 'chimera_binary_to_source_cache_bypassed_total');
  const replaced = metricValueByName(rows, 'chimera_binary_to_source_cache_replace_total');
  const entries = metricValueByName(rows, 'chimera_binary_to_source_cache_entries');
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
      text:`存在 ${formatNumber(cleanupFailed)} 个失败的 workspace cleanup job，建议检查清理日志和目录权限。`,
      tone: 'border-amber-500/20 bg-amber-500/15 text-amber-400',
    });
  }
  if (workerDead > workerAlive && workerAlive > 0) {
    alerts.push({
      label: 'Worker 历史记录偏多',
      text:`当前 alive=${formatNumber(workerAlive)}，dead=${formatNumber(workerDead)}；dead 可能包含历史心跳记录，请以 alive 和近期心跳判断当前能力。`,
      tone: 'border-sky-500/20 bg-sky-500/15 text-sky-400',
    });
  }
  if (queuePending + queueQueued > 0 && slotCapacity && slotUsage < slotCapacity) {
    alerts.push({
      label: '可能调度延迟',
      text:`队列仍有 ${formatNumber(queuePending + queueQueued)} 个等待项，但并发槽未打满，需要关注 dispatcher/claim 状态。`,
      tone: 'border-rose-500/20 bg-rose-500/15 text-rose-400',
    });
  }
  if (!alerts.length && running + queuePending + queueQueued === 0) {
    alerts.push({
      label: '当前空闲',
      text: '没有运行中或排队中的固件解包任务，调度队列处于空闲状态。',
      tone: 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400',
    });
  }

  return {
    kpis: [
      { label: '运行中任务', value: formatNumber(running + archiving), hint:`running ${formatNumber(running)} / archiving ${formatNumber(archiving)}`, tone: running + archiving > 0 ? 'text-teal-400' : 'text-theme-text-primary' },
      { label: '排队/待领取', value: formatNumber(pending + claimed), hint:`pending ${formatNumber(pending)} / claimed ${formatNumber(claimed)}`, tone: pending + claimed > 0 ? 'text-amber-400' : 'text-theme-text-primary' },
      { label: '成功/失败任务', value:`${formatNumber(success)} / ${formatNumber(failed)}`, hint: '历史任务终态分布', tone: failed > 0 ? 'text-rose-400' : 'text-emerald-400' },
      { label: '活跃 Worker', value:`${formatNumber(workerAlive)} / ${formatNumber(workerTotal)}`, hint:`dead ${formatNumber(workerDead)}`, tone: workerAlive > 0 ? 'text-indigo-400' : 'text-rose-400' },
      { label: '并发使用率', value: slotUsageRate == null ? '-' :`${formatNumber(slotUsageRate, 1)}%`, hint:`${formatNumber(slotUsage)} / ${formatNumber(slotCapacity)} slots`, tone: slotUsageRate && slotUsageRate > 85 ? 'text-amber-400' : 'text-theme-text-primary' },
      { label: '清理失败数', value: formatNumber(cleanupFailed), hint:`cleanup success ${formatNumber(cleanupSuccess)}`, tone: cleanupFailed > 0 ? 'text-rose-400' : 'text-emerald-400' },
    ],
    taskStatusChart: buildFirmwareStatusChart(
      rows,
      'firmware_unpacker_tasks_by_status',
      'status',
      { pending: 'Pending', claimed: 'Claimed', running: 'Running', archiving: 'Archiving', success: 'Success', failed: 'Failed', cancelled: 'Cancelled' },
      { pending: '#f59e0b', claimed: '#0ea5e9', running: '#14b8a6', archiving: '#2563EB', success: '#10b981', failed: '#ef4444', cancelled: '#64748b' },
    ),
    queueChart: [
      { name: 'pending', value: queuePending, fill: '#f59e0b' },
      { name: 'queued', value: queueQueued, fill: '#0ea5e9' },
      { name: 'running', value: queueRunning, fill: '#14b8a6' },
      { name: 'leased', value: queueLeased, fill: '#2563EB' },
      { name: 'cleanup', value: cleanupPending, fill: '#a855f7' },
    ],
    workerChart: [
      { name: 'alive', value: workerAlive, fill: '#10b981' },
      { name: 'dead', value: workerDead, fill: '#f97316' },
      { name: 'slot usage', value: slotUsage, fill: '#14b8a6' },
      { name: 'slot capacity', value: valueOrZero(slotCapacity), fill: '#0f766e' },
      { name: 'executor', value: valueOrZero(executorCapacity), fill: '#2563EB' },
    ],
    httpTop: rows
      .filter((row) => row.name === 'firmware_unpacker_api_requests_total')
      .sort((left, right) => right.value - left.value)
      .slice(0, 6)
      .map((row) => ({
        name:`${row.labels.method || '-'} ${String(row.labels.path || '').replace('/api/app/firmware-unpacker/', '')}`,
        value: row.value,
      })),
    operations: [
      { label: '任务错误', value: taskErrors, hint: 'task_errors_total 聚合', tone: taskErrors > 0 ? 'text-rose-400' : 'text-emerald-400' },
      { label: 'DB 重试', value: dbRetry, hint: 'transient database retries', tone: dbRetry > 0 ? 'text-amber-400' : 'text-theme-text-primary' },
      { label: '调度反压', value: backpressure, hint: 'no free local execution slots', tone: (backpressure || 0) > 0 ? 'text-amber-400' : 'text-theme-text-primary' },
      { label: '已领取任务', value: claimedTotal, hint: 'claimed_tasks_total', tone: 'text-theme-text-primary' },
    ],
    aiSummary: [
      { label: 'AI 会话', value: formatNumber(aiSessions), hint: 'ai_session_total', tone: (aiSessions || 0) > 0 ? 'text-indigo-400' : 'text-theme-text-primary' },
      { label: 'AI 轮次', value: formatNumber(aiRounds), hint: 'ai_round_total', tone: (aiRounds || 0) > 0 ? 'text-indigo-400' : 'text-theme-text-primary' },
      { label: 'Token 总量', value: formatNumber(tokenTotal), hint: 'token_usage total', tone: (tokenTotal || 0) > 0 ? 'text-violet-400' : 'text-theme-text-primary' },
      { label: '成本', value: formatMetricValue(costTotal ?? Number.NaN), hint: 'cost_usage total', tone: (costTotal || 0) > 0 ? 'text-violet-400' : 'text-theme-text-primary' },
      { label: 'AI 失败', value: formatNumber(aiFailures), hint: '排除 unknown 的 failure 聚合', tone: aiFailures > 0 ? 'text-rose-400' : 'text-emerald-400' },
    ],
    alerts,
  };
};

const buildEntryAnalysisViewModel = (rows: DisplayMetricRow[]): EntryAnalysisViewModel => {
  const pending = metricValueByName(rows, 'chimera_ea_tasks_pending');
  const running = metricValueByName(rows, 'chimera_ea_tasks_running');
  const finished = metricValueByName(rows, 'chimera_ea_tasks_finished');
  const avgQueueWait = histogramAverage(rows, 'chimera_ea_queue_wait_seconds');
  const avgExecution = histogramAverage(rows, 'chimera_ea_execution_seconds');
  const avgTurnaround = histogramAverage(rows, 'chimera_ea_turnaround_seconds');
  const avgRoundDuration = histogramAverage(rows, 'chimera_ea_round_duration_seconds');
  const avgWorkerDuration = histogramAverage(rows, 'chimera_ea_worker_duration_seconds');
  const avgJudgeDuration = histogramAverage(rows, 'chimera_ea_judge_duration_seconds');
  const sessions = metricValueByName(rows, 'chimera_ea_sessions');
  const workers = metricValueByName(rows, 'chimera_ea_workers');
  const judges = metricValueByName(rows, 'chimera_ea_judges');
  const retryTotal = metricValueByName(rows, 'chimera_ea_retry_total');
  const timeoutTotal = metricValueByName(rows, 'chimera_ea_timeout_total');
  const cancelTotal = metricValueByName(rows, 'chimera_ea_cancel_total');
  const fileTotal = metricValueByName(rows, 'chimera_ea_file_total');
  const tokenInputTotal = metricValueByName(rows, 'chimera_ea_token_input_total');
  const tokenOutputTotal = metricValueByName(rows, 'chimera_ea_token_output_total');
  const tokenCostTotal = metricValueByName(rows, 'chimera_ea_token_cost_total');
  const tokenRunning = valueOrZero(metricValueByName(rows, 'chimera_ea_token_input_running')) + valueOrZero(metricValueByName(rows, 'chimera_ea_token_output_running'));
  const schedulerRunning = metricValueByName(rows, 'chimera_ea_scheduler_running');
  const workerServiceRunning = metricValueByName(rows, 'chimera_ea_worker_service_running');
  const failureSummary = rows
    .filter((row) => row.name === 'chimera_ea_failure_category_total')
    .sort((left, right) => right.value - left.value)
    .slice(0, 6)
    .map((row) => ({
      label: row.labels.category || 'unknown',
      value: row.value,
      hint: 'terminal failure category',
      tone: row.labels.category === 'timeout' || row.labels.category === 'error' ? 'text-rose-400' : 'text-amber-400',
    }));
  const topModules = rows
    .filter((row) => row.name === 'chimera_ea_module_total')
    .sort((left, right) => right.value - left.value)
    .slice(0, 6)
    .map((row) => ({
      name: row.labels.module || 'unknown',
      value: row.value,
    }));
  const stageRows = ['r1', 'r2', 'r3', 'r4']
    .map((stage) => {
      const passedRuns = valueOrZero(metricValueByName(rows, 'chimera_ea_stage_rounds', { stage, status: 'passed' }));
      const failedRuns = valueOrZero(metricValueByName(rows, 'chimera_ea_stage_rounds', { stage, status: 'failed' }));
      const retryRuns = valueOrZero(metricValueByName(rows, 'chimera_ea_stage_rounds', { stage, status: 'retry' }));
      const runningRuns = valueOrZero(metricValueByName(rows, 'chimera_ea_stage_rounds', { stage, status: 'running' }));
      const totalRuns = passedRuns + failedRuns + retryRuns + runningRuns;
      const durationSum =
        valueOrZero(metricValueByName(rows, 'chimera_ea_stage_duration_seconds_sum', { stage, status: 'passed' })) +
        valueOrZero(metricValueByName(rows, 'chimera_ea_stage_duration_seconds_sum', { stage, status: 'failed' })) +
        valueOrZero(metricValueByName(rows, 'chimera_ea_stage_duration_seconds_sum', { stage, status: 'completed' }));
      const durationCount =
        valueOrZero(metricValueByName(rows, 'chimera_ea_stage_duration_seconds_count', { stage, status: 'passed' })) +
        valueOrZero(metricValueByName(rows, 'chimera_ea_stage_duration_seconds_count', { stage, status: 'failed' })) +
        valueOrZero(metricValueByName(rows, 'chimera_ea_stage_duration_seconds_count', { stage, status: 'completed' }));
      const avgDurationSeconds = durationCount > 0 ? durationSum / durationCount : null;
      const workerCalls = valueOrZero(metricValueByName(rows, 'chimera_ea_stage_role_total', { stage, role: 'worker' }));
      const judgeCalls = valueOrZero(metricValueByName(rows, 'chimera_ea_stage_role_total', { stage, role: 'judge' }));
      const sessionCount = valueOrZero(metricValueByName(rows, 'chimera_ea_stage_session_total', { stage }));
      const failPressure = failedRuns + retryRuns;
      const healthTone =
        failPressure > passedRuns
          ? 'text-rose-400'
          : runningRuns > 0
            ? 'text-amber-400'
            : passedRuns > 0
              ? 'text-emerald-400'
              : 'text-theme-text-secondary';
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
      text:`pending=${formatNumber(pending)} 已明显高于 workers=${formatNumber(workers)}，当前入口分析存在排队压力。`,
      tone: 'border-amber-500/20 bg-amber-500/15 text-amber-400',
    });
  }
  if (slowestStage && (slowestStage.avgDurationSeconds || 0) > 180) {
    riskAlerts.push({
      label: '慢阶段',
      text:`${slowestStage.stage} 平均耗时 ${formatSeconds(slowestStage.avgDurationSeconds)}，已经高于阶段健康阈值，建议优先查看该阶段会话和下游依赖。`,
      tone: 'border-rose-500/20 bg-rose-500/15 text-rose-400',
    });
  }
  if (mostRetryStage && mostRetryStage.retryRuns > Math.max(2, mostRetryStage.passedRuns)) {
    riskAlerts.push({
      label: '重试放大',
      text:`${mostRetryStage.stage} 的 retry=${formatNumber(mostRetryStage.retryRuns, 0)}，已经高于通过样本 ${formatNumber(mostRetryStage.passedRuns, 0)}，可能存在提示词/评审门槛/输入质量问题。`,
      tone: 'border-amber-500/20 bg-amber-500/15 text-amber-400',
    });
  }
  const failureHeavyStage = [...stageRows].find((item) => item.failedRuns > item.passedRuns && item.failedRuns > 0) || null;
  if (failureHeavyStage) {
    riskAlerts.push({
      label: '失败偏高',
      text:`${failureHeavyStage.stage} 当前 failed=${formatNumber(failureHeavyStage.failedRuns, 0)}，超过 passed=${formatNumber(failureHeavyStage.passedRuns, 0)}，阶段内失败已经开始主导。`,
      tone: 'border-rose-500/20 bg-rose-500/15 text-rose-400',
    });
  }
  const sessionGapStage = [...stageRows].find((item) => (item.workerCalls > 0 || item.judgeCalls > 0) && item.sessionCount <= 0) || null;
  if (sessionGapStage) {
    riskAlerts.push({
      label: '会话记录缺口',
      text:`${sessionGapStage.stage} 已有 Worker/Judge 调用样本，但 session_total=0，这通常意味着会话记录或阶段事件没有完整落盘。`,
      tone: 'border-sky-500/20 bg-sky-500/15 text-sky-400',
    });
  }
  if (!riskAlerts.length) {
    riskAlerts.push({
      label: '整体平稳',
      text: '当前入口分析没有明显的排队放大、慢阶段、失败主导或会话缺口信号，可以继续通过阶段矩阵做细查。',
      tone: 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400',
    });
  }

  return {
    kpis: [
      { label: '排队任务', value: formatNumber(pending), hint: '当前 pending 任务数', tone: (pending || 0) > 0 ? 'text-amber-400' : 'text-theme-text-primary' },
      { label: '运行中任务', value: formatNumber(running), hint: '当前 running 任务数', tone: (running || 0) > 0 ? 'text-teal-400' : 'text-theme-text-primary' },
      { label: '平均排队时长', value: formatSeconds(avgQueueWait), hint: 'queue_wait_seconds 均值', tone: (avgQueueWait || 0) > 60 ? 'text-rose-400' : 'text-theme-text-primary' },
      { label: '平均执行时长', value: formatSeconds(avgExecution), hint: 'execution_seconds 均值', tone: (avgExecution || 0) > 300 ? 'text-amber-400' : 'text-theme-text-primary' },
      { label: '平均端到端时长', value: formatSeconds(avgTurnaround), hint: 'turnaround_seconds 均值', tone: (avgTurnaround || 0) > 600 ? 'text-rose-400' : 'text-theme-text-primary' },
      { label: '平均轮次耗时', value: formatSeconds(avgRoundDuration), hint: 'round_duration_seconds 均值', tone: (avgRoundDuration || 0) > 180 ? 'text-amber-400' : 'text-theme-text-primary' },
    ],
    roleSummary: [
      { label: 'Worker 平均耗时', value: formatSeconds(avgWorkerDuration), hint: 'worker_duration_seconds 均值', tone: 'text-indigo-400' },
      { label: 'Judge 平均耗时', value: formatSeconds(avgJudgeDuration), hint: 'judge_duration_seconds 均值', tone: 'text-fuchsia-400' },
      { label: '会话文件数', value: formatNumber(sessions), hint: 'session gauge', tone: (sessions || 0) > 0 ? 'text-theme-text-primary' : 'text-theme-text-muted' },
      { label: 'Worker / Judge', value:`${formatNumber(workers)} / ${formatNumber(judges)}`, hint: '当前聚合角色规模', tone: 'text-theme-text-primary' },
      { label: '运行中 Token', value: formatNumber(tokenRunning), hint: 'running input + output token snapshot', tone: tokenRunning > 0 ? 'text-violet-400' : 'text-theme-text-primary' },
      { label: '累计成本', value: formatMetricValue(tokenCostTotal ?? Number.NaN), hint:`input ${formatNumber(tokenInputTotal)} / output ${formatNumber(tokenOutputTotal)}`, tone: (tokenCostTotal || 0) > 0 ? 'text-violet-400' : 'text-theme-text-primary' },
      { label: '处理文件估算', value: formatNumber(fileTotal), hint: 'worker files / shard 估算', tone: 'text-theme-text-primary' },
      {
        label: '调度健康',
        value:`${formatNumber(schedulerRunning)} / ${formatNumber(workerServiceRunning)}`,
        hint: 'scheduler_running / worker_service_running',
        tone: schedulerRunning && workerServiceRunning ? 'text-emerald-400' : 'text-rose-400',
      },
      { label: '终态任务', value: formatNumber(finished), hint: '当前聚合 finished 任务数', tone: (finished || 0) > 0 ? 'text-emerald-400' : 'text-theme-text-primary' },
    ],
    failureSummary: [
      { label: '重试次数', value: retryTotal, hint: '额外 round 聚合', tone: (retryTotal || 0) > 0 ? 'text-amber-400' : 'text-theme-text-primary' },
      { label: '超时次数', value: timeoutTotal, hint: 'timeout total', tone: (timeoutTotal || 0) > 0 ? 'text-rose-400' : 'text-emerald-400' },
      { label: '取消次数', value: cancelTotal, hint: 'cancel total', tone: (cancelTotal || 0) > 0 ? 'text-theme-text-secondary' : 'text-emerald-400' },
      ...failureSummary,
    ],
    topModules,
    riskAlerts,
    stageCards: [
      {
        label: '阶段覆盖',
        value:`${formatNumber(stageRows.length, 0)} / 4`,
        hint: '当前有指标回传的阶段数',
        tone: stageRows.length >= 4 ? 'text-emerald-400' : 'text-amber-400',
      },
      {
        label: '最忙阶段',
        value: busiestStage ?`${busiestStage.stage} · ${formatNumber(busiestStage.totalRuns, 0)}` : '-',
        hint: '按 stage_rounds 总样本',
        tone: busiestStage ? busiestStage.healthTone : 'text-theme-text-primary',
      },
      {
        label: '最慢阶段',
        value: slowestStage ?`${slowestStage.stage} · ${formatSeconds(slowestStage.avgDurationSeconds)}` : '-',
        hint: '按 stage_duration_seconds 均值',
        tone: slowestStage && (slowestStage.avgDurationSeconds || 0) > 120 ? 'text-rose-400' : 'text-theme-text-primary',
      },
      {
        label: '重试最密集',
        value: mostRetryStage && mostRetryStage.retryRuns > 0 ?`${mostRetryStage.stage} · ${formatNumber(mostRetryStage.retryRuns, 0)}` : '-',
        hint: '按 stage retry 样本',
        tone: mostRetryStage && mostRetryStage.retryRuns > 0 ? 'text-amber-400' : 'text-emerald-400',
      },
      {
        label: '活跃阶段数',
        value: formatNumber(activeStageCount, 0),
        hint: '当前存在 running 样本的阶段',
        tone: activeStageCount > 0 ? 'text-teal-400' : 'text-theme-text-primary',
      },
    ],
    stageRows,
    stageStatusChart,
  };
};

const buildDataflowAnalysisViewModel = (rows: DisplayMetricRow[]): DataflowAnalysisViewModel => {
  const pending = metricValueByName(rows, 'chimera_dfa_cluster_tasks_pending');
  const running = metricValueByName(rows, 'chimera_dfa_cluster_tasks_running');
  const terminal = metricValueByName(rows, 'chimera_dfa_cluster_tasks_terminal');
  const leased = metricValueByName(rows, 'chimera_dfa_cluster_leased_tasks');
  const staleLeases = metricValueByName(rows, 'chimera_dfa_cluster_stale_leases');
  const heartbeatLive = metricValueByName(rows, 'chimera_dfa_cluster_heartbeat_live_tasks');
  const heartbeatStale = metricValueByName(rows, 'chimera_dfa_cluster_heartbeat_stale_tasks');
  const heartbeatAgeMax = metricValueByName(rows, 'chimera_dfa_cluster_heartbeat_age_seconds_max');
  const retryCount = metricValueByName(rows, 'chimera_dfa_cluster_retry_count');
  const timeoutCount = metricValueByName(rows, 'chimera_dfa_cluster_timeout_count');
  const cancelCount = metricValueByName(rows, 'chimera_dfa_cluster_cancel_count');
  const configuredWorkers = metricValueByName(rows, 'chimera_dfa_cluster_workers', { state: 'configured' });
  const observedActiveOwners = metricValueByName(rows, 'chimera_dfa_cluster_workers', { state: 'observed_active_owner' });
  const observedHeartbeatOwners = metricValueByName(rows, 'chimera_dfa_cluster_workers', { state: 'observed_live_heartbeat_owner' });
  const workerSlotCapacity = metricValueByName(rows, 'chimera_dfa_cluster_worker_slots', { kind: 'capacity' });
  const workerSlotBusy = metricValueByName(rows, 'chimera_dfa_cluster_worker_slots', { kind: 'busy' });
  const workerSlotFree = metricValueByName(rows, 'chimera_dfa_cluster_worker_slots', { kind: 'free' });
  const workerCapacityPerPod = metricValueByName(rows, 'chimera_dfa_cluster_worker_capacity_per_pod');
  const slotUtilizationRatio = metricValueByName(rows, 'chimera_dfa_cluster_worker_slot_utilization_ratio');
  const observedCoverageRatio = metricValueByName(rows, 'chimera_dfa_cluster_worker_observed_coverage_ratio');
  const queuePressureRatio = metricValueByName(rows, 'chimera_dfa_cluster_queue_pressure_ratio');
  const rounds = metricValueByName(rows, 'chimera_dfa_cluster_rounds');
  const judges = metricValueByName(rows, 'chimera_dfa_cluster_judges');
  const functions = metricValueByName(rows, 'chimera_dfa_cluster_functions');
  const traceDepthMax = metricValueByName(rows, 'chimera_dfa_cluster_trace_depth_max');
  const traceCallees = metricValueByName(rows, 'chimera_dfa_cluster_trace_callees');
  const tokenTotal = metricValueByName(rows, 'chimera_dfa_cluster_token_usage', { type: 'total' });
  const tokenRunning = metricValueByName(rows, 'chimera_dfa_cluster_running_token_usage', { type: 'total' });
  const tokenCost = metricValueByName(rows, 'chimera_dfa_cluster_token_cost');
  const runningCost = metricValueByName(rows, 'chimera_dfa_cluster_running_token_cost');
  const avgQueueWait = averageFromSummary(rows, 'chimera_dfa_cluster_queue_wait_seconds');
  const avgExecution = averageFromSummary(rows, 'chimera_dfa_cluster_execution_seconds');
  const avgTurnaround = averageFromSummary(rows, 'chimera_dfa_cluster_turnaround_seconds');
  const avgRoundDuration = averageFromSummary(rows, 'chimera_dfa_cluster_round_duration_seconds');
  const avgJudgeDuration = averageFromSummary(rows, 'chimera_dfa_cluster_judge_duration_seconds');

  const failureCategories = rows
    .filter((row) => row.name === 'chimera_dfa_cluster_failure_category')
    .sort((left, right) => right.value - left.value)
    .map((row) => ({
      label: row.labels.category || 'unknown',
      value: row.value,
      tone: row.labels.category === 'timeout' || row.labels.category === 'lease_lost' ? 'text-rose-400' : 'text-amber-400',
    }));

  const dispatchSummary = rows
    .filter((row) => row.name === 'chimera_dfa_cluster_dispatch_status')
    .sort((left, right) => right.value - left.value)
    .map((row) => ({
      label: row.labels.status || 'unknown',
      value: row.value,
      tone: row.labels.status === 'running' || row.labels.status === 'leased' ? 'text-teal-400' : 'text-theme-text-secondary',
    }));

  const alerts: Array<{ label: string; text: string; tone: string }> = [];
  if ((observedCoverageRatio || 0) > 0 && (observedCoverageRatio || 0) < 0.6) {
    alerts.push({
      label: '观测 Owner 偏少',
      text:`configured workers=${formatNumber(configuredWorkers)}，但当前仅观测到 ${formatNumber(observedActiveOwners)} 个 active owner，heartbeat owners=${formatNumber(observedHeartbeatOwners)}。需要核对 worker 可用性、调度分布或 lease 回收情况。`,
      tone: 'border-amber-500/20 bg-amber-500/15 text-amber-400',
    });
  }
  if ((slotUtilizationRatio || 0) >= 0.85) {
    alerts.push({
      label: '执行槽位逼近打满',
      text:`busy slots=${formatNumber(workerSlotBusy)} / capacity=${formatNumber(workerSlotCapacity)}，利用率约 ${formatNumber((slotUtilizationRatio || 0) * 100, 1)}%。继续进流时更容易放大排队时延。`,
      tone: 'border-rose-500/20 bg-rose-500/15 text-rose-400',
    });
  }
  if ((heartbeatStale || 0) > 0) {
    alerts.push({
      label: '存在心跳超时任务',
      text:`heartbeat stale=${formatNumber(heartbeatStale)}，max age=${formatSeconds(heartbeatAgeMax)}。这通常意味着 owner 卡死、Pod 抖动或 lease 续约链路异常。`,
      tone: 'border-rose-500/20 bg-rose-500/15 text-rose-400',
    });
  }
  if ((queuePressureRatio || 0) >= 1 || ((pending || 0) > 0 && (workerSlotFree || 0) <= 0)) {
    alerts.push({
      label: '队列压力偏高',
      text:`pending=${formatNumber(pending)}，free slots=${formatNumber(workerSlotFree)}，queue pressure 约 ${formatNumber((queuePressureRatio || 0) * 100, 1)}%。需要关注扩容、任务重量或租约释放速度。`,
      tone: 'border-amber-500/20 bg-amber-500/15 text-amber-400',
    });
  }
  if ((timeoutCount || 0) > 0 && ((timeoutCount || 0) >= 3 || (terminal || 0) > 0 && ((timeoutCount || 0) / (terminal || 1)) >= 0.2)) {
    alerts.push({
      label: '超时失败偏高',
      text:`timeout=${formatNumber(timeoutCount)}，terminal=${formatNumber(terminal)}。建议继续拆分是 queue wait、execution duration 还是 lease/heartbeat 问题。`,
      tone: 'border-rose-500/20 bg-rose-500/15 text-rose-400',
    });
  }
  if (!alerts.length) {
    alerts.push({
      label: '聚合视图平稳',
      text: '当前未见明显的容量打满、心跳超时或 owner 覆盖异常；可以继续结合 failure category 和 dispatch summary 做结构性观察。',
      tone: 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400',
    });
  }

  return {
    kpis: [
      { label: '排队任务', value: formatNumber(pending), hint: 'cluster pending tasks', tone: (pending || 0) > 0 ? 'text-amber-400' : 'text-theme-text-primary' },
      { label: '运行中任务', value: formatNumber(running), hint: 'cluster running tasks', tone: (running || 0) > 0 ? 'text-teal-400' : 'text-theme-text-primary' },
      { label: '有效租约', value: formatNumber(leased), hint: 'active leases', tone: (leased || 0) > 0 ? 'text-indigo-400' : 'text-theme-text-primary' },
      { label: '陈旧租约', value: formatNumber(staleLeases), hint: 'expired owned leases', tone: (staleLeases || 0) > 0 ? 'text-rose-400' : 'text-emerald-400' },
      { label: '心跳正常/超时', value:`${formatNumber(heartbeatLive)} / ${formatNumber(heartbeatStale)}`, hint:`max age ${formatSeconds(heartbeatAgeMax)}`, tone: (heartbeatStale || 0) > 0 ? 'text-rose-400' : 'text-emerald-400' },
      {
        label: 'Worker 配置/观测',
        value:`${formatNumber(configuredWorkers)} / ${formatNumber(observedActiveOwners)}`,
        hint:`heartbeat owners ${formatNumber(observedHeartbeatOwners)} · per pod ${formatNumber(workerCapacityPerPod)}`,
        tone: (observedActiveOwners || 0) > 0 ? 'text-cyan-400' : 'text-theme-text-muted',
      },
    ],
    loadCards: [
      {
        label: 'Busy / Free Slots',
        value:`${formatNumber(workerSlotBusy)} / ${formatNumber(workerSlotFree)}`,
        hint:`configured capacity ${formatNumber(workerSlotCapacity)} · observed owners ${formatNumber(observedActiveOwners)}`,
        tone: (workerSlotBusy || 0) > (workerSlotFree || 0) ? 'text-amber-400' : 'text-theme-text-primary',
      },
      { label: '平均排队', value: formatSeconds(avgQueueWait), hint: 'queue_wait_seconds', tone: (avgQueueWait || 0) > 120 ? 'text-rose-400' : 'text-theme-text-primary' },
      { label: '平均执行', value: formatSeconds(avgExecution), hint: 'execution_seconds', tone: (avgExecution || 0) > 900 ? 'text-amber-400' : 'text-theme-text-primary' },
      { label: '平均周转', value: formatSeconds(avgTurnaround), hint: 'turnaround_seconds', tone: (avgTurnaround || 0) > 1200 ? 'text-rose-400' : 'text-theme-text-primary' },
      { label: '平均轮次 / Judge', value:`${formatSeconds(avgRoundDuration)} / ${formatSeconds(avgJudgeDuration)}`, hint: 'round/judge duration', tone: 'text-theme-text-primary' },
      { label: '轮次 / Judge / Function', value:`${formatNumber(rounds)} / ${formatNumber(judges)} / ${formatNumber(functions)}`, hint: 'analysis scale snapshot', tone: 'text-indigo-400' },
      { label: 'Trace 深度 / Callee', value:`${formatNumber(traceDepthMax)} / ${formatNumber(traceCallees)}`, hint: 'trace complexity snapshot', tone: 'text-theme-text-primary' },
      { label: 'Token 总量 / 运行中', value:`${formatNumber(tokenTotal)} / ${formatNumber(tokenRunning)}`, hint: 'cluster token snapshot', tone: 'text-violet-400' },
      { label: '成本 / 运行中成本', value:`${formatMetricValue(tokenCost ?? Number.NaN)} / ${formatMetricValue(runningCost ?? Number.NaN)}`, hint: 'cluster token cost snapshot', tone: 'text-fuchsia-400' },
      { label: '重试 / 超时 / 取消', value:`${formatNumber(retryCount)} / ${formatNumber(timeoutCount)} / ${formatNumber(cancelCount)}`, hint: 'cluster failure pressure', tone: (timeoutCount || 0) > 0 ? 'text-rose-400' : 'text-theme-text-primary' },
      { label: '终态任务', value: formatNumber(terminal), hint: 'cluster terminal tasks', tone: (terminal || 0) > 0 ? 'text-emerald-400' : 'text-theme-text-primary' },
    ],
    failureCategories,
    dispatchSummary,
    alerts,
  };
};

const dedupeStateEventInboxHistory = (history: BinarySecurityStateEventInboxSnapshot[]) => {
  const result: BinarySecurityStateEventInboxSnapshot[] = [];
  for (const item of history) {
    const prev = result[result.length - 1];
    if (
      prev &&
      prev.pendingDepth === item.pendingDepth &&
      prev.processingDepth === item.processingDepth &&
      prev.retryableDepth === item.retryableDepth &&
      prev.deadLetterDepth === item.deadLetterDepth &&
      prev.oldestPendingAge === item.oldestPendingAge &&
      prev.stateEventInboxRunSuccess === item.stateEventInboxRunSuccess &&
      prev.stateEventInboxRunFailed === item.stateEventInboxRunFailed &&
      prev.stateEventInboxAvgDurationSeconds === item.stateEventInboxAvgDurationSeconds &&
      prev.eventAvgLagSeconds === item.eventAvgLagSeconds
    ) {
      result[result.length - 1] = item;
      continue;
    }
    result.push(item);
  }
  return result.slice(-24);
};

const buildBinarySecurityStateEventInboxViewModel = (rows: DisplayMetricRow[], history: BinarySecurityStateEventInboxSnapshot[]): BinarySecurityStateEventInboxViewModel => {
  const snapshot = buildBinarySecurityStateEventInboxSnapshot(rows);
  const snapshotMeta = buildBinarySecurityStateEventInboxSnapshotMeta(rows);
  const deadLetters = rows
    .filter((row) => row.name === 'chimera_binary_security_state_dead_letters_total')
    .sort((left, right) => right.value - left.value)
    .slice(0, 6)
    .map((row) => ({
      label:`${row.labels.event_type || 'unknown'} / ${row.labels.reason || 'unknown'}`,
      value: row.value,
      tone: (row.value || 0) > 0 ? 'text-rose-400' : 'text-theme-text-muted',
    }));
  const stateEventInboxEventResults = rows
    .filter((row) => row.name === 'chimera_binary_security_state_stateEventInbox_events_total')
    .sort((left, right) => right.value - left.value)
    .slice(0, 8)
    .map((row) => ({
      label:`${row.labels.event_type || 'unknown'} / ${row.labels.result || 'unknown'}`,
      value: row.value,
      tone: row.labels.result === 'processed' ? 'text-emerald-400' : 'text-rose-400',
    }));
  const fileWriteResults = rows
    .filter((row) => row.name === 'chimera_binary_security_state_file_writes_total')
    .sort((left, right) => right.value - left.value)
    .slice(0, 6)
    .map((row) => ({
      label:`${row.labels.target || 'unknown'} / ${row.labels.result || 'unknown'}`,
      value: row.value,
      tone: row.labels.result === 'success' ? 'text-emerald-400' : 'text-amber-400',
    }));
  const activeLocks = rows
    .filter((row) => row.name === 'chimera_binary_security_task_state_lock_active')
    .sort((left, right) => right.value - left.value)
    .map((row) => ({
      label: row.labels.operation || 'unknown',
      value: row.value,
      tone: (row.value || 0) > 0 ? 'text-indigo-400' : 'text-theme-text-muted',
    }));

  const queueCards: StateEventInboxQueueCard[] = [
    {
      label: '待处理事件',
      value: snapshot.pendingDepth,
      hint: snapshot.oldestPendingAge == null ? '未采集' :`最老 ${formatSeconds(snapshot.oldestPendingAge)}`,
      tone: (snapshot.pendingDepth || 0) > 0 ? 'border-amber-500/20 bg-amber-500/15 text-amber-400' : 'border-theme-border bg-theme-elevated text-theme-text-secondary',
      icon: <Database size={15} />,
    },
    {
      label: '处理中',
      value: snapshot.processingDepth,
      hint: snapshot.oldestProcessingAge == null ? '未采集' :`最老 ${formatSeconds(snapshot.oldestProcessingAge)}`,
      tone: (snapshot.processingDepth || 0) > 0 ? 'border-sky-500/20 bg-sky-500/15 text-sky-400' : 'border-theme-border bg-theme-elevated text-theme-text-secondary',
      icon: <Activity size={15} />,
    },
    {
      label: '可重试',
      value: snapshot.retryableDepth,
      hint: snapshot.oldestRetryableAge == null ? '未采集' :`最老 ${formatSeconds(snapshot.oldestRetryableAge)}`,
      tone: (snapshot.retryableDepth || 0) > 0 ? 'border-orange-500/20 bg-orange-500/15 text-orange-400' : 'border-theme-border bg-theme-elevated text-theme-text-secondary',
      icon: <RefreshCw size={15} />,
    },
    {
      label: '死信事件',
      value: snapshot.deadLetterDepth,
      hint: snapshot.oldestDeadLetterAge == null ? '未采集' :`最老 ${formatSeconds(snapshot.oldestDeadLetterAge)}`,
      tone: (snapshot.deadLetterDepth || 0) > 0 ? 'border-rose-500/20 bg-rose-500/15 text-rose-400' : 'border-theme-border bg-theme-elevated text-theme-text-secondary',
      icon: <ShieldAlert size={15} />,
    },
  ];

  const mergedHistory = dedupeStateEventInboxHistory([...history, snapshot]);
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
        label: 'StateEventInbox 平均单次耗时',
        value: formatSeconds(snapshot.stateEventInboxAvgDurationSeconds),
        tone: (snapshot.stateEventInboxAvgDurationSeconds || 0) > 1 ? 'text-amber-400' : 'text-theme-text-primary',
        hint: '来自`state_stateEventInbox_duration_seconds` 均值',
      },
      {
        label: '事件平均收口延迟',
        value: formatSeconds(snapshot.eventAvgLagSeconds),
        tone: (snapshot.eventAvgLagSeconds || 0) > 30 ? 'text-rose-400' : 'text-theme-text-primary',
        hint: '从事件创建到 stateEventInbox 应用完成',
      },
      {
        label: '锁等待均值',
        value: formatSeconds(snapshot.lockWaitAvgSeconds),
        tone: (snapshot.lockWaitAvgSeconds || 0) > 0.3 ? 'text-amber-400' : 'text-theme-text-primary',
        hint: '任务级状态锁竞争强度',
      },
      {
        label: '锁持有均值',
        value: formatSeconds(snapshot.lockHeldAvgSeconds),
        tone: (snapshot.lockHeldAvgSeconds || 0) > 1.5 ? 'text-rose-400' : 'text-theme-text-primary',
        hint: '串行应用期间锁占用时长',
      },
    ],
    stateEventInboxRuns: [
      { label: 'success', value: snapshot.stateEventInboxRunSuccess, tone: 'text-emerald-400' },
      { label: 'failed', value: snapshot.stateEventInboxRunFailed, tone: 'text-rose-400' },
      { label: 'lock_busy', value: snapshot.stateEventInboxRunLockBusy, tone: 'text-amber-400' },
      { label: 'skipped', value: snapshot.stateEventInboxRunSkipped, tone: 'text-theme-text-secondary' },
    ],
    stateEventInboxEventResults,
    deadLetters,
    fileWriteResults,
    activeLocks,
    timeSeries: mergedHistory.map((item) => ({
      time: new Date(item.capturedAt).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      pending: item.pendingDepth,
      retryable: item.retryableDepth,
      deadLetter: item.deadLetterDepth,
      oldestPendingAge: item.oldestPendingAge,
      stateEventInboxAvgDurationSeconds: item.stateEventInboxAvgDurationSeconds,
      eventAvgLagSeconds: item.eventAvgLagSeconds,
    })),
  };
};

const MetricCard: React.FC<{ label: string; value: number; icon: React.ReactNode }> = ({ label, value, icon }) => (
  <StatisticCard label={label} value={value} icon={icon} />
);

const EmptyCard: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ display: 'flex', height: '100%', minHeight: '220px', alignItems: 'center', justifyContent: 'center', borderRadius: '12px', borderWidth: '1px', borderStyle: 'dashed', borderColor: LK.border, backgroundColor: LK.surfaceRaised, padding: '24px', textAlign: 'center', fontSize: '14px', color: LK.muted }}>
    {text}
  </div>
);

const INITIAL_REDUCER_EVENT_STATE: StateEventInboxState = { loading: false, data: null, error: null, refreshedAt: null };

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
  podsLoading: false,
  podsLoaded: false,
  detailLoading: false,
  detailLoaded: false,
  summary: null,
  processes: [],
  tasks: [],
  pods: [],
  runtimeSummary: null,
  error: null,
  refreshedAt: null,
};

const buildAgentRuntimeSummaryFromState = (
  summary: AgentObservabilitySummary | null,
  pods: AgentPodRuntimeSnapshot[],
  processes: AgentProcessSnapshot[],
): AgentRuntimeAggregateSummary | null => {
  if (!summary) return null;
  return {
    total_pods: Number(summary.total_pods ?? pods.length),
    healthy_pods: Number(summary.healthy_pods ?? pods.filter((item) => item.healthy !== false).length),
    total_processes: processes.length || Number(summary.active_processes || 0) + Number((summary as any).residual_processes || 0) + Number(summary.unknown_processes || 0),
    tracked_processes: Number(summary.active_processes || 0),
    residual_processes: Number((summary as any).residual_processes || 0),
    unknown_processes: Number(summary.unknown_processes || 0),
    killable_residual_processes: Number((summary as any).killable_residual_processes || 0),
    killable_unknown_processes: Number((summary as any).killable_unknown_processes || 0),
    aggregate_partial: Boolean(summary.aggregate_partial),
    aggregate_sources: summary.aggregate_sources ?? null,
    aggregate_fanout_errors: summary.aggregate_fanout_errors ?? null,
    aggregate_failed_targets: summary.aggregate_failed_targets || [],
    aggregate_all_sources_failed: Boolean(summary.aggregate_all_sources_failed),
    scanned_at: summary.scanned_at ?? null,
  };
};

const StateEventInboxMetricList: React.FC<{ title: string; items: StateEventInboxBreakdownItem[]; emptyText: string }> = ({ title, items, emptyText }) => (
  <div style={{ backgroundColor: LK.surface, borderColor: LK.border, borderWidth: '1px', borderStyle: 'solid', borderRadius: '12px', padding: '16px' }}>
    <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>{title}</div>
    <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {items.length ? (
        items.map((item) => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', borderRadius: '8px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, padding: '8px 12px' }}>
            <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px', fontWeight: 600, color: LK.inkSoft }}>{item.label}</div>
            <div style={{ fontFamily: MONO, fontSize: '12px', fontWeight: 600, color: toneToColor(item.tone) }}>{formatMetricValue(item.value)}</div>
          </div>
        ))
      ) : (
        <div style={{ borderRadius: '8px', border: `1px dashed ${LK.border}`, padding: '24px 12px', textAlign: 'center', fontSize: '14px', color: LK.muted }}>{emptyText}</div>
      )}
    </div>
  </div>
);

const stateEventInboxFailedKinds = new Set(['retryable', 'dead_letter', 'stateEventInbox_failed', 'lease_expired', 'unknown']);

function stateEventInboxRowStyle(item: BinarySecurityStateEventInboxEventRecord): React.CSSProperties {
  const baseStyle = {};
  if (stateEventInboxFailedKinds.has(item.failure_kind)) {
    return { ...baseStyle, backgroundColor: 'rgba(241, 93, 93, 0.15)' };
  }
  return baseStyle;
}

const BinarySecurityMetricsDashboardPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const executionMetricsApi = api.domains.execution.metrics;
  const binarySecurityExecutionApi = api.domains.execution.binarySecurity;
  const dataflowAnalysisApi = api.domains.execution.appDataflowAnalyse;
  const entryAnalysisApi = api.domains.execution.appEntryAnalyse;
  const systemAnalysisApi = api.domains.execution.appSystemAnalyse;
  const validSecondaryTabs = useMemo(
    () => new Set<BinarySecurityMetricsSecondaryTab>(BINARY_SECURITY_METRICS_SECONDARY_TABS.map((tab) => tab.key)),
    [],
  );
  const resolveSecondaryTabFromUrl = useCallback((): BinarySecurityMetricsSecondaryTab => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('secondary_tab');
    return tab && validSecondaryTabs.has(tab as BinarySecurityMetricsSecondaryTab)
      ? (tab as BinarySecurityMetricsSecondaryTab)
      : 'observability';
  }, [validSecondaryTabs]);
  const [activeServiceKey, setActiveServiceKey] = useState<BinarySecurityMetricsServiceKey>(BINARY_SECURITY_METRICS_SERVICES[0].key);
  const [activeSecondaryTab, setActiveSecondaryTab] = useState<BinarySecurityMetricsSecondaryTab>(() => resolveSecondaryTabFromUrl());
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
  const [dfaAgentPodKeyword, setDfaAgentPodKeyword] = useState('');
  const [dfaAgentTaskKeyword, setDfaAgentTaskKeyword] = useState('');
  const [dfaAgentPidKeyword, setDfaAgentPidKeyword] = useState('');
  const [dfaAgentOwnerFilter, setDfaAgentOwnerFilter] = useState<'all' | 'tracked' | 'residual' | 'unknown' | 'suspected_orphan'>('all');
  const [dfaAgentRoleFilter, setDfaAgentRoleFilter] = useState<'all' | string>('all');
  const [activeAgentPodDialog, setActiveAgentPodDialog] = useState<{ serviceKey: BinarySecurityMetricsServiceKey; podName: string } | null>(null);
  const [restApiRouteKeyword, setRestApiRouteKeyword] = useState('');
  const [restApiMethodFilter, setRestApiMethodFilter] = useState<'all' | string>('all');
  const [restApiSlowOnly, setRestApiSlowOnly] = useState(false);
  const [restApiHideInfra, setRestApiHideInfra] = useState(true);
  const [stateEventInboxHistoryByService, setStateEventInboxHistoryByService] = useState<Record<BinarySecurityMetricsServiceKey, BinarySecurityStateEventInboxSnapshot[]>>(
    Object.fromEntries(BINARY_SECURITY_METRICS_SERVICES.map((service) => [service.key, []])) as Record<BinarySecurityMetricsServiceKey, BinarySecurityStateEventInboxSnapshot[]>,
  );
  const [stateEventInboxMetricsState, setStateEventInboxMetricsState] = useState<MetricsState>(INITIAL_STATE);
  const [stateEventInboxEventState, setStateEventInboxState] = useState<StateEventInboxState>(INITIAL_REDUCER_EVENT_STATE);
  const [stateEventInboxEventPage, setStateEventInboxEventPage] = useState(1);
  const [stateEventInboxEventPageSize, setStateEventInboxEventPageSize] = useState(50);
  const [stateEventInboxEventSortBy, setStateEventInboxSortBy] = useState<StateEventInboxSortBy>('processed_at');
  const [stateEventInboxEventSortOrder, setStateEventInboxSortOrder] = useState<StateEventInboxSortOrder>('desc');
  const [stateEventInboxEventStatusFilter, setStateEventInboxEventStatusFilter] = useState<string>('all');
  const [stateEventInboxEventTypeFilter, setStateEventInboxEventTypeFilter] = useState('');
  const [stateEventInboxEventHandlerFilter, setStateEventInboxEventHandlerFilter] = useState('');
  const [stateEventInboxEventTaskFilter, setStateEventInboxEventTaskFilter] = useState('');
  const [stateEventInboxEventFailedOnly, setStateEventInboxEventFailedOnly] = useState(false);
  const [stateEventInboxEventSlowOnly, setStateEventInboxEventSlowOnly] = useState(false);
  const [stateByService, setStateByService] = useState<Record<BinarySecurityMetricsServiceKey, MetricsState>>(
    Object.fromEntries(BINARY_SECURITY_METRICS_SERVICES.map((service) => [service.key, INITIAL_STATE])) as Record<BinarySecurityMetricsServiceKey, MetricsState>,
  );
  const [observabilityStateByService, setObservabilityStateByService] = useState<Record<BinarySecurityMetricsServiceKey, JsonTabState<SummaryObservabilityResponse>>>(
    Object.fromEntries(BINARY_SECURITY_METRICS_SERVICES.map((service) => [service.key, initialJsonTabState<SummaryObservabilityResponse>()])) as Record<BinarySecurityMetricsServiceKey, JsonTabState<SummaryObservabilityResponse>>,
  );
  const [restApiStateByService, setRestApiStateByService] = useState<Record<BinarySecurityMetricsServiceKey, JsonTabState<SummaryRestApiResponse>>>(
    Object.fromEntries(BINARY_SECURITY_METRICS_SERVICES.map((service) => [service.key, initialJsonTabState<SummaryRestApiResponse>()])) as Record<BinarySecurityMetricsServiceKey, JsonTabState<SummaryRestApiResponse>>,
  );
  const [aiStateByService, setAiStateByService] = useState<Record<BinarySecurityMetricsServiceKey, JsonTabState<SummaryAiResponse>>>(
    Object.fromEntries(BINARY_SECURITY_METRICS_SERVICES.map((service) => [service.key, initialJsonTabState<SummaryAiResponse>()])) as Record<BinarySecurityMetricsServiceKey, JsonTabState<SummaryAiResponse>>,
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
  const [agentPodDetails, setAgentPodDetails] = useState<Record<string, AgentPodDetailState>>({});
  const [selectedAgentPids, setSelectedAgentPids] = useState<number[]>([]);
  const [selectedAgentTaskId, setSelectedAgentTaskId] = useState<string>('');
  const [agentKillHistory, setAgentKillHistory] = useState<AgentKillHistoryEntry[]>([]);
  const previousProjectIdRef = useRef(projectId);

  useEffect(() => {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('secondary_tab', activeSecondaryTab);
    window.history.replaceState(window.history.state, '',`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  }, [activeSecondaryTab]);

  useEffect(() => {
    const handlePopState = () => {
      setActiveSecondaryTab(resolveSecondaryTabFromUrl());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [resolveSecondaryTabFromUrl]);

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
        serviceKey === 'dataflow-analysis'
          ? dataflowAnalysisApi.getWorkerClusterCapacity()
          : Promise.resolve(null),
        serviceKey === 'entry-analysis'
          ? entryAnalysisApi.getSlotCluster()
          : Promise.resolve(null),
        serviceKey === 'system-analysis'
          ? systemAnalysisApi.getWorkerClusterCapacity()
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
          const data = await dataflowAnalysisApi.getWorkerClusterCapacity();
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
          const data = await entryAnalysisApi.getSlotCluster();
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
          const data = await systemAnalysisApi.getWorkerClusterCapacity();
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

  const loadObservabilitySummary = async (serviceKey: BinarySecurityMetricsServiceKey) => {
    if (!supportsSummaryApi(serviceKey)) {
      await loadMetrics(serviceKey);
      return;
    }
    setObservabilityStateByService((current) => ({
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
      const [data, dfaWorkerData, entryWorkerData, systemWorkerData] = await Promise.all([
        executionMetricsApi.getServiceObservabilitySummary(serviceKey) as Promise<SummaryObservabilityResponse>,
        serviceKey === 'dataflow-analysis' ? dataflowAnalysisApi.getWorkerClusterCapacity() : Promise.resolve(null),
        serviceKey === 'entry-analysis' ? entryAnalysisApi.getSlotCluster() : Promise.resolve(null),
        serviceKey === 'system-analysis' ? systemAnalysisApi.getWorkerClusterCapacity() : Promise.resolve(null),
      ]);
      setObservabilityStateByService((current) => ({
        ...current,
        [serviceKey]: { loading: false, data, error: null, refreshedAt: Date.now() },
      }));
      if (serviceKey === 'dataflow-analysis') {
        setDfaWorkerDetailState({ loading: false, data: dfaWorkerData, error: null, refreshedAt: Date.now() });
      }
      if (serviceKey === 'entry-analysis') {
        setEntryWorkerDetailState({ loading: false, data: entryWorkerData, error: null, refreshedAt: Date.now() });
      }
      if (serviceKey === 'system-analysis') {
        setSystemWorkerDetailState({ loading: false, data: systemWorkerData, error: null, refreshedAt: Date.now() });
      }
    } catch (error: any) {
      setObservabilityStateByService((current) => ({
        ...current,
        [serviceKey]: { ...current[serviceKey], loading: false, error: error?.message || '摘要抓取失败', refreshedAt: Date.now() },
      }));
    }
  };

  const loadRestApiSummary = async (serviceKey: BinarySecurityMetricsServiceKey) => {
    if (!supportsSummaryApi(serviceKey)) {
      await loadMetrics(serviceKey);
      return;
    }
    setRestApiStateByService((current) => ({
      ...current,
      [serviceKey]: { ...current[serviceKey], loading: true, error: null },
    }));
    try {
      const data = await executionMetricsApi.getServiceRestApiSummary(serviceKey) as SummaryRestApiResponse;
      setRestApiStateByService((current) => ({
        ...current,
        [serviceKey]: { loading: false, data, error: null, refreshedAt: Date.now() },
      }));
    } catch (error: any) {
      setRestApiStateByService((current) => ({
        ...current,
        [serviceKey]: { ...current[serviceKey], loading: false, error: error?.message || 'REST API 摘要抓取失败', refreshedAt: Date.now() },
      }));
    }
  };

  const loadAiSummary = async (serviceKey: BinarySecurityMetricsServiceKey) => {
    if (!supportsSummaryApi(serviceKey)) {
      await loadMetrics(serviceKey);
      return;
    }
    setAiStateByService((current) => ({
      ...current,
      [serviceKey]: { ...current[serviceKey], loading: true, error: null },
    }));
    try {
      const data = await executionMetricsApi.getServiceAiSummary(serviceKey) as SummaryAiResponse;
      setAiStateByService((current) => ({
        ...current,
        [serviceKey]: { loading: false, data, error: null, refreshedAt: Date.now() },
      }));
    } catch (error: any) {
      setAiStateByService((current) => ({
        ...current,
        [serviceKey]: { ...current[serviceKey], loading: false, error: error?.message || 'AI 摘要抓取失败', refreshedAt: Date.now() },
      }));
    }
  };

  const loadStateEventInboxMetrics = async () => {
    setStateEventInboxMetricsState((current) => ({ ...current, loading: true, error: null }));
    try {
      const rawText = await executionMetricsApi.getBinarySecurityStateEventMetrics();
      const rows = buildServiceViewModel(rawText, getBinarySecurityMetricsService('binary-security')).rows;
      const snapshot = buildBinarySecurityStateEventInboxSnapshot(rows);
      setStateEventInboxHistoryByService((current) => ({
        ...current,
        'binary-security': dedupeStateEventInboxHistory([...(current['binary-security'] || []), snapshot]),
      }));
      setStateEventInboxMetricsState({ loading: false, rawText, error: null, refreshedAt: Date.now() });
    } catch (error: any) {
      setStateEventInboxMetricsState((current) => ({
        ...current,
        loading: false,
        error: error?.message || 'StateEventInbox 指标抓取失败',
        refreshedAt: Date.now(),
      }));
    }
  };

  const loadStateEventInboxEvents = async () => {
    setStateEventInboxState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await binarySecurityExecutionApi.getStateEventInboxEvents({
        page: stateEventInboxEventPage,
        page_size: stateEventInboxEventPageSize,
        sort_by: stateEventInboxEventSortBy,
        sort_order: stateEventInboxEventSortOrder,
        status: stateEventInboxEventStatusFilter === 'all' ? [] : [stateEventInboxEventStatusFilter],
        event_type: stateEventInboxEventTypeFilter.trim() || undefined,
        handler_pod: stateEventInboxEventHandlerFilter.trim() || undefined,
        task_id: stateEventInboxEventTaskFilter.trim() || undefined,
        failed_only: stateEventInboxEventFailedOnly,
        slow_only: stateEventInboxEventSlowOnly,
      });
      setStateEventInboxState({
        loading: false,
        data,
        error: null,
        refreshedAt: Date.now(),
      });
    } catch (error: any) {
      setStateEventInboxState((current) => ({
        ...current,
        loading: false,
        error: error?.message || 'StateEventInbox 事件记录抓取失败',
        refreshedAt: Date.now(),
      }));
    }
  };

  const agentObservabilityEnabled =
    activeServiceKey === 'entry-analysis' || activeServiceKey === 'system-analysis' || activeServiceKey === 'dataflow-analysis';

  const loadAgentObservability = async (serviceKey: BinarySecurityMetricsServiceKey, options?: { loadDetails?: boolean }) => {
    if (!projectId || !(serviceKey === 'entry-analysis' || serviceKey === 'system-analysis' || serviceKey === 'dataflow-analysis')) {
      setAgentState(INITIAL_AGENT_STATE);
      setAgentPodDetails({});
      return;
    }
    setAgentState((current) => ({ ...current, loading: true, error: null }));
    try {
      if (serviceKey === 'dataflow-analysis' || serviceKey === 'entry-analysis' || serviceKey === 'system-analysis') {
        const summary = await executionMetricsApi.getAgentObservabilitySummary(serviceKey, projectId) as AgentObservabilitySummary;
        const pods = options?.loadDetails
          ? await executionMetricsApi.getAgentPods(serviceKey, projectId) as AgentPodRuntimeSnapshot[]
          : [];
        let processes: AgentProcessSnapshot[] = [];
        let tasks: AgentTaskOwnershipSnapshot[] = [];
        let runtimeSummary = buildAgentRuntimeSummaryFromState(summary, pods, processes);
        if (options?.loadDetails) {
          setAgentState((current) => ({ ...current, podsLoading: true, detailLoading: true }));
        }
        setAgentState({
          loading: false,
          podsLoading: false,
          podsLoaded: Boolean(options?.loadDetails),
          detailLoading: false,
          detailLoaded: false,
          summary,
          processes,
          tasks,
          pods,
          runtimeSummary,
          error: null,
          refreshedAt: Date.now(),
        });
        setAgentPodDetails({});
        return;
      }
    } catch (error: any) {
      setAgentState((current) => ({
        ...current,
        loading: false,
        podsLoading: false,
        detailLoading: false,
        error: error?.message || '智能体观测抓取失败',
        refreshedAt: Date.now(),
      }));
    }
  };

  const ensureAgentPodsLoaded = useCallback(async (serviceKey: BinarySecurityMetricsServiceKey) => {
    if (!projectId || !agentObservabilityEnabled) return;
    if (agentState.podsLoaded || agentState.podsLoading) return;
    setAgentState((current) => ({ ...current, podsLoading: true, error: null }));
    try {
      const pods = await executionMetricsApi.getAgentPods(serviceKey, projectId) as AgentPodRuntimeSnapshot[];
      setAgentState((current) => ({
        ...current,
        podsLoading: false,
        podsLoaded: true,
        pods,
        runtimeSummary: buildAgentRuntimeSummaryFromState(current.summary, pods, current.processes),
        refreshedAt: Date.now(),
      }));
    } catch (error: any) {
      setAgentState((current) => ({
        ...current,
        podsLoading: false,
        error: error?.message || 'Pod 列表抓取失败',
        refreshedAt: Date.now(),
      }));
    }
  }, [agentObservabilityEnabled, agentState.podsLoaded, agentState.podsLoading, executionMetricsApi, projectId]);

  const ensureAgentPodDetail = useCallback(async (serviceKey: BinarySecurityMetricsServiceKey, podName: string) => {
    if (!projectId || !agentObservabilityEnabled || !podName) return;
    if (!agentState.podsLoaded) {
      await ensureAgentPodsLoaded(serviceKey);
    }
    const cacheKey =`${serviceKey}:${podName}`;
    const existing = agentPodDetails[cacheKey];
    if (existing?.loading || existing?.loaded) return;
    setAgentPodDetails((current) => ({
      ...current,
      [cacheKey]: { loading: true, loaded: false, error: null, processes: [], tasks: [] },
    }));
    try {
      const [processes, tasks] = await Promise.all([
        executionMetricsApi.getAgentProcessesByPod(serviceKey, projectId, podName) as Promise<AgentProcessSnapshot[]>,
        executionMetricsApi.getAgentTasksByPod(serviceKey, projectId, podName) as Promise<AgentTaskOwnershipSnapshot[]>,
      ]);
      setAgentPodDetails((current) => ({
        ...current,
        [cacheKey]: { loading: false, loaded: true, error: null, processes, tasks },
      }));
    } catch (error: any) {
      setAgentPodDetails((current) => ({
        ...current,
        [cacheKey]: { loading: false, loaded: false, error: error?.message || 'Pod 明细抓取失败', processes: [], tasks: [] },
      }));
    }
  }, [agentObservabilityEnabled, agentPodDetails, agentState.podsLoaded, ensureAgentPodsLoaded, executionMetricsApi, projectId]);

  useEffect(() => {
    if (activeSecondaryTab === 'observability') {
      if (supportsSummaryApi(activeServiceKey)) {
        const current = observabilityStateByService[activeServiceKey];
        if (!current.data && !current.loading && !current.error) {
          void loadObservabilitySummary(activeServiceKey);
        }
      } else {
        const current = stateByService[activeServiceKey];
        if (!current.rawText && !current.loading && !current.error) {
          void loadMetrics(activeServiceKey);
        }
      }
      return;
    }
    if (activeSecondaryTab === 'rest-api') {
      if (supportsSummaryApi(activeServiceKey)) {
        const current = restApiStateByService[activeServiceKey];
        if (!current.data && !current.loading && !current.error) {
          void loadRestApiSummary(activeServiceKey);
        }
      } else {
        const current = stateByService[activeServiceKey];
        if (!current.rawText && !current.loading && !current.error) {
          void loadMetrics(activeServiceKey);
        }
      }
      return;
    }
    if (activeSecondaryTab === 'ai-zone') {
      if (supportsSummaryApi(activeServiceKey)) {
        const current = aiStateByService[activeServiceKey];
        if (!current.data && !current.loading && !current.error) {
          void loadAiSummary(activeServiceKey);
        }
      } else {
        const current = stateByService[activeServiceKey];
        if (!current.rawText && !current.loading && !current.error) {
          void loadMetrics(activeServiceKey);
        }
      }
    }
  }, [activeSecondaryTab, activeServiceKey, aiStateByService, observabilityStateByService, restApiStateByService, stateByService]);

  useEffect(() => {
    if (activeServiceKey !== 'binary-security') return;
    if (activeSecondaryTab !== 'state-event-inbox') return;
    if (!stateEventInboxMetricsState.rawText && !stateEventInboxMetricsState.loading && !stateEventInboxMetricsState.error) {
      void loadStateEventInboxMetrics();
    }
  }, [activeSecondaryTab, activeServiceKey, stateEventInboxMetricsState]);

  useEffect(() => {
    if (activeServiceKey !== 'binary-security') return;
    if (activeSecondaryTab !== 'state-event-inbox') return;
    void loadStateEventInboxEvents();
  }, [
    activeSecondaryTab,
    activeServiceKey,
    stateEventInboxEventPage,
    stateEventInboxEventPageSize,
    stateEventInboxEventSortBy,
    stateEventInboxEventSortOrder,
    stateEventInboxEventStatusFilter,
    stateEventInboxEventTypeFilter,
    stateEventInboxEventHandlerFilter,
    stateEventInboxEventTaskFilter,
    stateEventInboxEventFailedOnly,
    stateEventInboxEventSlowOnly,
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
      if (activeSecondaryTab === 'observability') {
        void (supportsSummaryApi(activeServiceKey) ? loadObservabilitySummary(activeServiceKey) : loadMetrics(activeServiceKey));
      } else if (activeSecondaryTab === 'rest-api') {
        void (supportsSummaryApi(activeServiceKey) ? loadRestApiSummary(activeServiceKey) : loadMetrics(activeServiceKey));
      } else if (activeSecondaryTab === 'ai-zone') {
        void (supportsSummaryApi(activeServiceKey) ? loadAiSummary(activeServiceKey) : loadMetrics(activeServiceKey));
      }
      if (activeServiceKey === 'binary-security' && activeSecondaryTab === 'state-event-inbox') {
        void loadStateEventInboxMetrics();
        void loadStateEventInboxEvents();
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
    if (previousProjectIdRef.current !== projectId) {
      setActiveSecondaryTab(resolveSecondaryTabFromUrl());
    }
    setAgentState(INITIAL_AGENT_STATE);
    setAgentPodDetails({});
    setSelectedAgentPids([]);
    setSelectedAgentTaskId('');
    setDfaAgentPodKeyword('');
    setDfaAgentTaskKeyword('');
    setDfaAgentPidKeyword('');
    setDfaAgentOwnerFilter('all');
    setDfaAgentRoleFilter('all');
    setActiveAgentPodDialog(null);
    previousProjectIdRef.current = projectId;
  }, [activeServiceKey, projectId, resolveSecondaryTabFromUrl]);

  const activeState = stateByService[activeServiceKey];
  const activeObservabilityState = observabilityStateByService[activeServiceKey];
  const activeRestApiState = restApiStateByService[activeServiceKey];
  const activeAiState = aiStateByService[activeServiceKey];
  const activeTabLoading =
    activeSecondaryTab === 'observability' && supportsSummaryApi(activeServiceKey)
      ? activeObservabilityState.loading && !activeObservabilityState.data
      : activeSecondaryTab === 'rest-api' && supportsSummaryApi(activeServiceKey)
        ? activeRestApiState.loading && !activeRestApiState.data
        : activeSecondaryTab === 'ai-zone' && supportsSummaryApi(activeServiceKey)
          ? activeAiState.loading && !activeAiState.data
          : activeState.loading && !activeState.rawText;
  const activeTabError =
    activeSecondaryTab === 'observability' && supportsSummaryApi(activeServiceKey)
      ? (!activeObservabilityState.data ? activeObservabilityState.error : null)
      : activeSecondaryTab === 'rest-api' && supportsSummaryApi(activeServiceKey)
        ? (!activeRestApiState.data ? activeRestApiState.error : null)
        : activeSecondaryTab === 'ai-zone' && supportsSummaryApi(activeServiceKey)
          ? (!activeAiState.data ? activeAiState.error : null)
          : !activeState.rawText
            ? activeState.error
            : null;
  const activeRefreshTimestamp =
    activeServiceKey === 'binary-security' && activeSecondaryTab === 'state-event-inbox'
      ? stateEventInboxMetricsState.refreshedAt
      : activeSecondaryTab === 'observability' && supportsSummaryApi(activeServiceKey)
        ? activeObservabilityState.refreshedAt
        : activeSecondaryTab === 'rest-api' && supportsSummaryApi(activeServiceKey)
          ? activeRestApiState.refreshedAt
          : activeSecondaryTab === 'ai-zone' && supportsSummaryApi(activeServiceKey)
            ? activeAiState.refreshedAt
            : activeState.refreshedAt;
  const viewModel = useMemo(() => buildServiceViewModel(activeState.rawText, activeService), [activeService, activeState.rawText]);
  const binarySecuritySummaryRows = useMemo(
    () => (activeServiceKey === 'binary-security' ? buildRowsFromSummaryMetricRows(activeObservabilityState.data) : []),
    [activeObservabilityState.data, activeServiceKey],
  );
  const observabilityRows =
    activeServiceKey === 'binary-security' && supportsSummaryApi(activeServiceKey) && activeObservabilityState.data
      ? binarySecuritySummaryRows
      : viewModel.rows;
  const aggregateCoverage = useMemo(
    () => buildAggregateCoverageSummary(observabilityRows, activeServiceKey),
    [activeServiceKey, observabilityRows],
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
  const summaryObservabilityViewModel = useMemo(
    () => (supportsSummaryApi(activeServiceKey) && activeServiceKey !== 'binary-security' ? buildSummaryObservabilityViewModel(activeObservabilityState.data) : null),
    [activeObservabilityState.data, activeServiceKey],
  );
  const restApiViewModel = useMemo(
    () =>
      supportsSummaryApi(activeServiceKey) && activeRestApiState.data
        ? {
            rows: activeRestApiState.data.rows || [],
            totalRequests: activeRestApiState.data.total_requests || 0,
            totalInflight: activeRestApiState.data.total_inflight || 0,
            avgSeconds: activeRestApiState.data.avg_seconds,
            p95Seconds: activeRestApiState.data.p95_seconds,
            slowRouteCount: activeRestApiState.data.slow_route_count || 0,
            errorRate: activeRestApiState.data.error_rate,
            topByCount: activeRestApiState.data.top_by_count || [],
            topByP95: activeRestApiState.data.top_by_p95 || [],
            topBy5xx: activeRestApiState.data.top_by_5xx || [],
          }
        : buildRestApiViewModel(viewModel.rows),
    [activeRestApiState.data, activeServiceKey, viewModel.rows],
  );
  const restApiMethods = useMemo(
    () => Array.from(new Set(restApiViewModel.rows.map((item) => item.method))).sort((left, right) => left.localeCompare(right, 'zh-CN')),
    [restApiViewModel.rows],
  );
  const filteredRestApiRows = useMemo(() => {
    const keyword = restApiRouteKeyword.trim().toLowerCase();
    return restApiViewModel.rows.filter((item) => {
      if (restApiMethodFilter !== 'all' && item.method !== restApiMethodFilter) return false;
      if (restApiSlowOnly && (item.p95Seconds || 0) < 1 && (item.avgSeconds || 0) < 0.5) return false;
      if (restApiHideInfra) {
        const route = item.route.toLowerCase();
        if (route.includes('/metrics') || route.includes('/health') || route.includes('/ready')) return false;
        if (item.method === 'OPTIONS') return false;
      }
      if (!keyword) return true;
      return`${item.method} ${item.route}`.toLowerCase().includes(keyword);
    });
  }, [restApiHideInfra, restApiMethodFilter, restApiRouteKeyword, restApiSlowOnly, restApiViewModel.rows]);
  const focusedEntryStageRow = useMemo(() => {
    if (!entryAnalysisViewModel || selectedEntryStage === 'all') return null;
    return entryAnalysisViewModel.stageRows.find((item) => item.stage === selectedEntryStage) || null;
  }, [entryAnalysisViewModel, selectedEntryStage]);
  const stateEventInboxViewModel = useMemo(
    () =>
      activeServiceKey === 'binary-security'
        ? buildBinarySecurityStateEventInboxViewModel(
            buildServiceViewModel(stateEventInboxMetricsState.rawText, getBinarySecurityMetricsService('binary-security')).rows,
            stateEventInboxHistoryByService[activeServiceKey] || [],
          )
        : null,
    [activeServiceKey, stateEventInboxHistoryByService, stateEventInboxMetricsState.rawText],
  );
  const binarySecurityObservabilityViewModel = useMemo(
    () => (activeServiceKey === 'binary-security' ? buildBinarySecurityObservabilityViewModel(observabilityRows, aggregateCoverage) : null),
    [activeServiceKey, aggregateCoverage, observabilityRows],
  );
  const unifiedAgentRuntimeViewModel = useMemo(() => {
    if (!agentObservabilityEnabled) return null;
    const slotWorkers =
      activeServiceKey === 'entry-analysis'
        ? entryWorkerDetailState.data?.workers || []
        : activeServiceKey === 'system-analysis'
          ? systemWorkerDetailState.data?.workers || []
          : activeServiceKey === 'dataflow-analysis'
            ? dfaWorkerDetailState.data?.workers || []
            : [];
    return buildUnifiedAgentRuntimeViewModel({
      slotWorkers,
      runtimeSummary: agentState.runtimeSummary,
      agentPods: agentState.pods,
    });
  }, [
    activeServiceKey,
    agentObservabilityEnabled,
    agentState.pods,
    agentState.runtimeSummary,
    dfaWorkerDetailState.data?.workers,
    entryWorkerDetailState.data?.workers,
    systemWorkerDetailState.data?.workers,
  ]);

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
      return`${row.name} ${row.labelText} ${row.help || ''}`.toLowerCase().includes(keyword);
    });
  }, [activeServiceKey, dataflowVulnSampleScope, groupFilter, searchKeyword, selectedDfaWorkerFilter, selectedEntryWorkerFilter, selectedSystemWorkerFilter, viewModel.rows]);

  const effectiveAiViewModel = useMemo<AiViewModel>(
    () =>
      supportsSummaryApi(activeServiceKey) && activeAiState.data
        ? {
            rows: (activeAiState.data.rows || []).map((row) => {
              const labels = Object.fromEntries(
                Object.entries(row.labels || {}).map(([key, value]) => [key, String(value)]),
              ) as Record<string, string>;
              return {
              name: row.name,
              familyName: row.family_name,
              labels,
              value: row.value,
              type: 'gauge' as const,
              help: null,
              group: 'ai-agent' as BinarySecurityMetricsGroup,
              labelText: Object.entries(labels).map(([key, value]) =>`${key}=${value}`).join(', '),
              displayName: row.name,
              };
            }),
            cards: (activeAiState.data.cards || []).map((item, index) => ({
              ...item,
              icon: [<Brain size={16} key="brain" />, <Coins size={16} key="coins" />, <Bot size={16} key="bot" />, <Activity size={16} key="activity" />, <Gauge size={16} key="gauge" />, <BarChart3 size={16} key="bar" />][index] || <Brain size={16} key={`icon-${index}`} />,
            })),
            coverage: activeAiState.data.coverage,
            coverageLabel: activeAiState.data.coverage_label,
            familyCount: activeAiState.data.family_count,
            roleChart: activeAiState.data.role_chart || [],
            tokenChart: activeAiState.data.token_chart || [],
            coverageText: activeAiState.data.coverage_text,
          }
        : aiViewModel,
    [activeAiState.data, activeServiceKey, aiViewModel],
  );

  const aiRows = useMemo(() => {
    const keyword = aiSearchKeyword.trim().toLowerCase();
    return effectiveAiViewModel.rows.filter((row) => {
      if (aiRoleFilter !== 'all') {
        const roleHit = Object.values(row.labels).some((value) => value === aiRoleFilter);
        if (!roleHit) return false;
      }
      if (!keyword) return true;
      return`${row.name} ${row.labelText} ${row.help || ''}`.toLowerCase().includes(keyword);
    });
  }, [aiRoleFilter, aiSearchKeyword, effectiveAiViewModel.rows]);

  const aiRoles = useMemo(() => {
    const roles = new Set<string>();
    effectiveAiViewModel.rows.forEach((row) => {
      Object.entries(row.labels).forEach(([key, value]) => {
        if ((BINARY_SECURITY_AI_DIMENSION_LABEL_KEYS as readonly string[]).includes(key) && value) {
          roles.add(value);
        }
      });
    });
    return Array.from(roles).sort((left, right) => left.localeCompare(right, 'zh-CN'));
  }, [effectiveAiViewModel.rows]);

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

  const loadedAgentProcesses = useMemo(
    () => Object.values(agentPodDetails).flatMap((item) => item.processes || []),
    [agentPodDetails],
  );

  const selectedKillablePids = useMemo(
    () => selectedAgentPids.filter((pid) => loadedAgentProcesses.some((item) => item.pid === pid && item.kill_allowed)),
    [loadedAgentProcesses, selectedAgentPids],
  );

  const dfaAgentRoleOptions = useMemo(() => {
    const roles = new Set<string>();
    loadedAgentProcesses.forEach((item) => {
      if (item.role_kind) roles.add(item.role_kind);
    });
    return Array.from(roles).sort((left, right) => left.localeCompare(right, 'zh-CN'));
  }, [loadedAgentProcesses]);
  const requiresAgentDetailFiltering = Boolean(
    dfaAgentTaskKeyword.trim() ||
    dfaAgentPidKeyword.trim() ||
    dfaAgentOwnerFilter !== 'all' ||
    dfaAgentRoleFilter !== 'all',
  );

  useEffect(() => {
    if (activeSecondaryTab !== 'agent' || !agentObservabilityEnabled || !requiresAgentDetailFiltering) return;
    if (!agentState.podsLoaded) {
      void ensureAgentPodsLoaded(activeServiceKey);
      return;
    }
    (unifiedAgentRuntimeViewModel?.podCards || []).forEach((pod) => {
      if (pod.pod_name) {
        void ensureAgentPodDetail(activeServiceKey, pod.pod_name);
      }
    });
  }, [activeSecondaryTab, activeServiceKey, agentObservabilityEnabled, agentState.podsLoaded, ensureAgentPodDetail, ensureAgentPodsLoaded, requiresAgentDetailFiltering, unifiedAgentRuntimeViewModel?.podCards]);

  const filteredDfaPods = useMemo(() => {
    if (!agentObservabilityEnabled) return [] as UnifiedAgentPodCard[];
    const podKeyword = dfaAgentPodKeyword.trim().toLowerCase();
    const taskKeyword = dfaAgentTaskKeyword.trim().toLowerCase();
    const pidKeyword = dfaAgentPidKeyword.trim();
    return (unifiedAgentRuntimeViewModel?.podCards || []).filter((pod) => {
      if (podKeyword) {
        const fingerprint =`${pod.pod_name || ''} ${pod.worker_id || ''}`.toLowerCase();
        if (!fingerprint.includes(podKeyword)) return false;
      }
      const detail = agentPodDetails[`${activeServiceKey}:${pod.pod_name}`];
      const podProcesses = detail?.processes || [];
      const podTasks = detail?.tasks || [];
      const matchingProcesses = podProcesses.filter((item) => {
        if (dfaAgentOwnerFilter !== 'all' && item.owner_kind !== dfaAgentOwnerFilter) return false;
        if (dfaAgentRoleFilter !== 'all' && item.role_kind !== dfaAgentRoleFilter) return false;
        if (taskKeyword) {
          const fingerprint =`${item.task_id || ''} ${item.task_name || ''}`.toLowerCase();
          if (!fingerprint.includes(taskKeyword)) return false;
        }
        if (pidKeyword) {
          const fingerprint =`${item.pid} ${item.pgid ?? ''} ${item.ppid ?? ''}`;
          if (!fingerprint.includes(pidKeyword)) return false;
        }
        return true;
      });
      const matchingTasks = podTasks.filter((item) => {
        if (!taskKeyword) return true;
        return`${item.task_id || ''} ${item.task_name || ''}`.toLowerCase().includes(taskKeyword);
      });
      if ((taskKeyword || pidKeyword || dfaAgentOwnerFilter !== 'all' || dfaAgentRoleFilter !== 'all') && matchingProcesses.length === 0 && matchingTasks.length === 0) {
        return false;
      }
      return true;
    });
  }, [
    activeServiceKey,
    agentPodDetails,
    agentObservabilityEnabled,
    dfaAgentOwnerFilter,
    dfaAgentPidKeyword,
    dfaAgentPodKeyword,
    dfaAgentRoleFilter,
    dfaAgentTaskKeyword,
    unifiedAgentRuntimeViewModel?.podCards,
  ]);

  const openAgentPodDialog = useCallback((serviceKey: BinarySecurityMetricsServiceKey, podName: string) => {
    setSelectedAgentPids([]);
    setActiveAgentPodDialog({ serviceKey, podName });
    void ensureAgentPodDetail(serviceKey, podName);
  }, [ensureAgentPodDetail]);

  const closeAgentPodDialog = useCallback(() => {
    setActiveAgentPodDialog(null);
    setSelectedAgentPids([]);
  }, []);

  const activeAgentPodCard = useMemo(
    () => (
      activeAgentPodDialog
        ? (unifiedAgentRuntimeViewModel?.podCards || []).find((pod) => pod.pod_name === activeAgentPodDialog.podName) || null
        : null
    ),
    [activeAgentPodDialog, unifiedAgentRuntimeViewModel?.podCards],
  );

  const activeAgentPodDetail = useMemo(
    () => (
      activeAgentPodDialog
        ? agentPodDetails[`${activeAgentPodDialog.serviceKey}:${activeAgentPodDialog.podName}`] || null
        : null
    ),
    [activeAgentPodDialog, agentPodDetails],
  );

  const activeAgentPodTasks = useMemo(() => {
    if (!activeAgentPodDetail) return [] as AgentTaskOwnershipSnapshot[];
    const keyword = dfaAgentTaskKeyword.trim().toLowerCase();
    return (activeAgentPodDetail.tasks || []).filter((item) => {
      if (!keyword) return true;
      return`${item.task_id || ''} ${item.task_name || ''}`.toLowerCase().includes(keyword);
    });
  }, [activeAgentPodDetail, dfaAgentTaskKeyword]);

  const activeAgentPodProcesses = useMemo(() => {
    if (!activeAgentPodDetail) return [] as AgentProcessSnapshot[];
    const taskKeyword = dfaAgentTaskKeyword.trim().toLowerCase();
    const pidKeyword = dfaAgentPidKeyword.trim();
    return (activeAgentPodDetail.processes || []).filter((item) => {
      if (dfaAgentOwnerFilter !== 'all' && item.owner_kind !== dfaAgentOwnerFilter) return false;
      if (dfaAgentRoleFilter !== 'all' && item.role_kind !== dfaAgentRoleFilter) return false;
      if (taskKeyword) {
        const fingerprint =`${item.task_id || ''} ${item.task_name || ''}`.toLowerCase();
        if (!fingerprint.includes(taskKeyword)) return false;
      }
      if (pidKeyword) {
        const fingerprint =`${item.pid} ${item.pgid ?? ''} ${item.ppid ?? ''}`;
        if (!fingerprint.includes(pidKeyword)) return false;
      }
      return true;
    });
  }, [activeAgentPodDetail, dfaAgentOwnerFilter, dfaAgentPidKeyword, dfaAgentRoleFilter, dfaAgentTaskKeyword]);

  const activeAgentPodKillablePids = useMemo(
    () => activeAgentPodProcesses.filter((item) => item.kill_allowed).map((item) => item.pid),
    [activeAgentPodProcesses],
  );

  const selectedKillablePidsForActivePod = useMemo(
    () => selectedAgentPids.filter((pid) => activeAgentPodKillablePids.includes(pid)),
    [activeAgentPodKillablePids, selectedAgentPids],
  );

  const allKillableSelectedForActivePod =
    activeAgentPodKillablePids.length > 0 && selectedKillablePidsForActivePod.length === activeAgentPodKillablePids.length;

  const toggleAgentProcessSelection = useCallback((pid: number, checked: boolean) => {
    setSelectedAgentPids((current) => {
      if (checked) {
        return current.includes(pid) ? current : [...current, pid];
      }
      return current.filter((item) => item !== pid);
    });
  }, []);

  const toggleAllAgentProcessSelection = useCallback((checked: boolean) => {
    setSelectedAgentPids((current) => {
      const remaining = current.filter((pid) => !activeAgentPodKillablePids.includes(pid));
      return checked ? [...remaining, ...activeAgentPodKillablePids] : remaining;
    });
  }, [activeAgentPodKillablePids]);

  const killSingleOrphan = async (process: AgentProcessSnapshot) => {
    if (!projectId || !agentObservabilityEnabled) return;
    if (!process.kill_allowed) {
      await showAlert({
        title: '不允许终止',
        message: process.kill_block_reason || '当前进程不满足终止条件。',
      });
      return;
    }
    const suspected = process.owner_kind === 'unknown' || process.owner_kind === 'suspected_orphan';
    const confirmed = await showConfirm({
      title: suspected ? '终止疑似孤儿智能体进程' : '终止孤儿智能体进程',
      message: suspected
        ?`该进程当前为“疑似孤儿”，可能仍处于退出宽限或归属切换中。\nPID=${process.pid} PGID=${process.pgid ?? '-'}。\n请仅在确认无活动任务归属后继续，操作不可撤销。`
        :`仅针对“已判定为明确孤儿”的智能体进程。\nPID=${process.pid} PGID=${process.pgid ?? '-'}。\n不影响运行中受控任务，操作不可撤销。`,
      confirmText: '确认杀死',
      danger: true,
    });
    if (!confirmed) return;
    const result = await executionMetricsApi.killAgentProcess(activeServiceKey, projectId, process.pid) as AgentProcessKillResponse;
    pushAgentKillHistory('single', result,`single-${process.pid}-${Date.now()}`);
    await showAlert({
      title: '执行结果',
      message:`请求 ${result.requested}，命中 ${result.matched}，成功 ${result.succeeded}，失败 ${result.failed}，跳过 ${result.skipped}`,
    });
    setSelectedAgentPids((current) => current.filter((pid) => pid !== process.pid));
    await loadAgentObservability(activeServiceKey, { loadDetails: true });
  };

  const killSelectedOrphans = async () => {
    if (!projectId || !agentObservabilityEnabled || selectedKillablePids.length === 0) return;
    const confirmed = await showConfirm({
      title: '批量杀死选中孤儿',
      message:`仅针对“已判定为明确孤儿”的智能体进程。\n本次将处理 ${selectedKillablePids.length} 个 PID，不影响运行中受控任务，操作不可撤销。`,
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
    pushAgentKillHistory('selected', { ...summary, items },`selected-${Date.now()}`);
    await showAlert({
      title: '批量执行结果',
      message:`请求 ${summary.requested}，命中 ${summary.matched}，成功 ${summary.succeeded}，失败 ${summary.failed}，跳过 ${summary.skipped}`,
    });
    setSelectedAgentPids([]);
    await loadAgentObservability(activeServiceKey, { loadDetails: true });
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
    pushAgentKillHistory('bulk', result,`bulk-${Date.now()}`);
    await showAlert({
      title: '执行结果',
      message:`请求 ${result.requested}，命中 ${result.matched}，成功 ${result.succeeded}，失败 ${result.failed}，跳过 ${result.skipped}`,
    });
    setSelectedAgentPids([]);
    await loadAgentObservability(activeServiceKey, { loadDetails: true });
  };

  const killAllSuspectedOrphans = async () => {
    if (!projectId || !agentObservabilityEnabled) return;
    const confirmed = await showConfirm({
      title: '批量终止疑似孤儿',
      message: '这些进程当前属于“疑似孤儿”，可能仍处于退出宽限或归属切换中。仅在确认无活动任务归属后继续，操作不可撤销。',
      confirmText: '确认终止',
      danger: true,
    });
    if (!confirmed) return;
    const result = await executionMetricsApi.killAllSuspectedOrphanProcesses(activeServiceKey, projectId) as AgentProcessKillResponse;
    pushAgentKillHistory('bulk', result,`bulk-suspected-${Date.now()}`);
    await showAlert({
      title: '执行结果',
      message:`请求 ${result.requested}，命中 ${result.matched}，成功 ${result.succeeded}，失败 ${result.failed}，跳过 ${result.skipped}`,
    });
    setSelectedAgentPids([]);
    await loadAgentObservability(activeServiceKey, { loadDetails: true });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '32px 32px 40px 32px' }}>
      <PageHeader
        title="性能看板"
        description="面向二进制安全链路的轻量指标看板，按微服务和 Tab 拉取后端 summary 数据；原始 Prometheus 指标保留为兜底排查入口。"
        actions={
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '8px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '8px 12px', fontSize: '14px', fontWeight: 600, color: LK.body }}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(event) => setAutoRefresh(event.target.checked)}
                style={{ height: '16px', width: '16px', borderRadius: '4px', border: `1px solid ${LK.border}`, color: '#14b8a6' }}
              />
              自动刷新 30s
            </label>
            <button
              type="button"
              onClick={() => {
                if (activeServiceKey === 'binary-security' && activeSecondaryTab === 'state-event-inbox') {
                  void loadStateEventInboxMetrics();
                  return;
                }
                if (activeSecondaryTab === 'agent' && agentObservabilityEnabled) {
                  void loadAgentObservability(activeServiceKey);
                  return;
                }
                if (activeSecondaryTab === 'observability') {
                  void (supportsSummaryApi(activeServiceKey) ? loadObservabilitySummary(activeServiceKey) : loadMetrics(activeServiceKey));
                  return;
                }
                if (activeSecondaryTab === 'rest-api') {
                  void (supportsSummaryApi(activeServiceKey) ? loadRestApiSummary(activeServiceKey) : loadMetrics(activeServiceKey));
                  return;
                }
                if (activeSecondaryTab === 'ai-zone') {
                  void (supportsSummaryApi(activeServiceKey) ? loadAiSummary(activeServiceKey) : loadMetrics(activeServiceKey));
                }
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '8px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '10px 16px', fontSize: '14px', fontWeight: 600, color: LK.inkSoft, cursor: 'pointer', transition: 'background-color 0.15s' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = LK.surfaceRaised}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = LK.surface}
            >
              <RefreshCw size={16} />
              刷新
            </button>
          </div>
        }
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', fontSize: '12px', fontWeight: 600, color: LK.muted }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '9999px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '4px 12px' }}>
          <ServerCog size={13} />
          {activeService.serviceName}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '9999px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '4px 12px' }}>
          <TimerReset size={13} />
          最近刷新：{formatTime(activeRefreshTimestamp)}
        </span>
      </div>

      <section style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '8px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
          {BINARY_SECURITY_METRICS_SERVICES.map((service) => {
            const state = stateByService[service.key];
            const observabilityTabState = observabilityStateByService[service.key];
            const restTabState = restApiStateByService[service.key];
            const aiTabState = aiStateByService[service.key];
            const hasAnySummaryData = Boolean(observabilityTabState.data || restTabState.data || aiTabState.data);
            const summaryLoading = observabilityTabState.loading || restTabState.loading || aiTabState.loading;
            const summaryError = observabilityTabState.error || restTabState.error || aiTabState.error;
            const active = service.key === activeServiceKey;
            const buttonStyle = active
              ? { border: `1px solid ${LK.primary}`, backgroundColor: LK.primary, color: '#ffffff' }
              : { border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, color: LK.inkSoft };
            return (
              <button
                key={service.key}
                type="button"
                onClick={() => setActiveServiceKey(service.key)}
                style={{ borderRadius: '12px', border: buttonStyle.border, backgroundColor: buttonStyle.backgroundColor, color: buttonStyle.color, padding: '12px 16px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = LK.surface; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = LK.surfaceRaised; }}
              >
                <div style={{ fontSize: '14px', fontWeight: 600 }}>{service.label}</div>
                <div style={{ marginTop: '4px', fontSize: '11px', color: active ? LK.mutedSoft : LK.muted }}>
                  {supportsSummaryApi(service.key)
                    ? summaryLoading
                      ? '抓取中...'
                      : summaryError && !hasAnySummaryData
                        ? '抓取失败'
                        : hasAnySummaryData
                          ? '已更新'
                          : '待抓取'
                    : state.loading
                      ? '抓取中...'
                      : state.error
                        ? '抓取失败'
                        : state.refreshedAt
                          ? '已更新'
                          : '待抓取'}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '8px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
          {BINARY_SECURITY_METRICS_SECONDARY_TABS.map((tab) => {
            const active = tab.key === activeSecondaryTab;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveSecondaryTab(tab.key)}
                className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
 active ? 'bg-teal-600 text-white' : 'bg-theme-elevated text-theme-text-secondary hover:bg-theme-elevated'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      {activeTabLoading ? (
        <section style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '48px 24px', textAlign: 'center' }}>
          <Loader2 className="mx-auto animate-spin" style={{ color: LK.muted, margin: '0 auto' }} size={24} />
          <p style={{ marginTop: '16px', fontSize: '14px', color: LK.muted }}>正在抓取 {activeService.label} 的指标...</p>
        </section>
      ) : activeTabError ? (
        <section style={{ borderRadius: '12px', border: `1px solid ${LK.error}`, backgroundColor: 'rgba(241, 93, 93, 0.1)', padding: '48px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: '14px', fontWeight: 600, color: LK.error }}>{activeTabError}</p>
        </section>
      ) : activeSecondaryTab === 'observability' ? (
        <>
          {aggregateCoverage ? (
            <section
              style={{
                borderRadius: '12px',
                border: `1px solid ${aggregateCoverage.partial ? LK.warning : LK.success}`,
                backgroundColor: aggregateCoverage.partial ? 'rgba(213, 161, 58, 0.1)' : 'rgba(69, 192, 111, 0.1)',
                padding: '16px 20px'
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                <div>
                  <h2 style={{ marginTop: '8px', fontSize: '18px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>当前展示的是二进制安全编排器聚合健康视图</h2>
                  <p style={{ marginTop: '8px', fontSize: '14px', color: LK.inkSoft }}>
                    当前角色覆盖 {aggregateCoverage.successful}/{aggregateCoverage.attempted}。
                    {aggregateCoverage.partial
                      ? ' 当前为部分聚合结果，说明至少有一个预期角色没有成功提供聚合数据，数值可能偏低。'
                      : ' 当前结果已覆盖本次预期角色，可以作为编排层健康判断的主视图。'}
                  </p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {aggregateCoverage.attemptedByRole.map((item) => (
                    <span
                      key={item.role}
 style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '9999px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '4px 12px', fontSize: '12px', fontWeight: 600, color: LK.inkSoft }}
                    >
                      {item.role}: {formatNumber(item.successful, 0)}/{formatNumber(item.attempted, 0)} 已覆盖
                    </span>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {summaryObservabilityViewModel ? (
            <section style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderRadius: '12px', border: '1px solid #14b8a6', backgroundColor: LK.surface, padding: '20px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                <div>
                  <h2 style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>{activeService.label} 轻量观测摘要</h2>
                  <p style={{ marginTop: '8px', maxWidth: '48rem', fontSize: '14px', color: LK.inkSoft }}>
                    当前 Tab 使用后端`metrics/summary` JSON，不再下载整包 Prometheus 文本；槽位和智能体明细仍由各自独立接口按需加载。
                  </p>
                </div>
                <span style={{ display: 'inline-flex', borderRadius: '9999px', border: '1px solid #14b8a6', backgroundColor: 'rgba(20, 184, 166, 0.15)', padding: '4px 12px', fontSize: '12px', fontWeight: 600, color: '#14b8a6' }}>
                  summary endpoint
                </span>
              </div>

              <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                {summaryObservabilityViewModel.overviewCards.map((item) => (
                  <div key={item.label} style={{ borderRadius: '12px', border: `1px solid #14b8a6`, backgroundColor: 'rgba(20, 184, 166, 0.1)', padding: '12px 16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>{item.label}</div>
                    <div className={`mt-2 text-xl font-semibold ${item.tone}`}>{item.value}</div>
                    <div style={{ marginTop: '4px', fontSize: '12px', color: LK.muted }}>{item.hint}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                {summaryObservabilityViewModel.alerts.map((alert) => (
 <div key={alert.label} className={`rounded-2xl border px-4 py-3 ${alert.tone}`}>
                    <div style={{ fontSize: '14px', fontWeight: 600 }}>{alert.label}</div>
                    <div style={{ marginTop: '4px', fontSize: '12px', lineHeight: '1.25rem', opacity: 0.9 }}>{alert.text}</div>
                  </div>
                ))}
              </div>

              <div style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '16px' }}>
                <h3 style={{ marginTop: '8px', fontSize: '18px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>任务状态分布</h3>
                <div style={{ marginTop: '16px', display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                  {summaryObservabilityViewModel.statusRows.length ? (
                    summaryObservabilityViewModel.statusRows.map((item) => (
                      <div key={item.label} style={{ borderRadius: '8px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '8px 12px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: LK.muted }}>{item.label}</div>
                        <div className={`mt-1 text-base font-semibold ${item.tone}`}>{formatNumber(item.value)}</div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-theme-border px-3 py-6 text-center text-sm text-theme-text-muted sm:col-span-2 xl:col-span-6">
                      当前 summary 暂无任务状态分布。
                    </div>
                  )}
                </div>
              </div>
            </section>
          ) : binarySecurityObservabilityViewModel ? (
            <section style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderRadius: '12px', border: '1px solid #10b981', backgroundColor: LK.surface, padding: '20px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                <div>
                  <h2 style={{ marginTop: '8px', fontSize: '24px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>编排器诊断总览</h2>
                  <p style={{ marginTop: '8px', maxWidth: '48rem', fontSize: '14px', color: LK.inkSoft }}>
                    这一屏优先回答“编排有没有卡住、聚合是否完整、状态事件是否积压、锁和归档是否拖慢收口”，不再把指标族数量当作核心 KPI。
                  </p>
                </div>
                <span style={{ display: 'inline-flex', borderRadius: '9999px', border: `1px solid ${LK.success}`, backgroundColor: 'rgba(69, 192, 111, 0.15)', padding: '4px 12px', fontSize: '12px', fontWeight: 600, color: LK.success }}>
                  诊断优先视图
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {binarySecurityObservabilityViewModel.overviewCards.map((item) => (
                  <div key={item.label} style={{ borderRadius: '12px', border: `1px solid ${LK.success}`, backgroundColor: 'rgba(69, 192, 111, 0.1)', padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', color: LK.muted }}>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">{item.label}</span>
                      <span>{item.icon}</span>
                    </div>
                    <div className={`mt-3 text-2xl font-bold tracking-tight ${item.tone}`}>{item.value}</div>
                    <div style={{ marginTop: '4px', fontSize: '12px', color: LK.muted }}>{item.hint}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                {binarySecurityObservabilityViewModel.alerts.map((alert) => (
 <div key={alert.label} className={`rounded-2xl border px-4 py-3 ${alert.tone}`}>
                    <div style={{ fontSize: '14px', fontWeight: 600 }}>{alert.label}</div>
                    <div style={{ marginTop: '4px', fontSize: '12px', lineHeight: '1.25rem', opacity: 0.9 }}>{alert.text}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: '1.05fr 0.95fr' }}>
                <StateEventInboxMetricList title="编排推进摘要" items={binarySecurityObservabilityViewModel.pipelineSummary} emptyText="暂无编排摘要。" />
                <StateEventInboxMetricList title="StateEventInbox/锁摘要" items={binarySecurityObservabilityViewModel.stateEventInboxSummary} emptyText="暂无 stateEventInbox 摘要。" />
              </div>

              <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: '1.05fr 0.95fr' }}>
                <StateEventInboxMetricList title="后台同步摘要" items={binarySecurityObservabilityViewModel.syncSummary} emptyText="暂无后台同步摘要。" />
                <div style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '16px' }}>
                  <h3 style={{ marginTop: '8px', fontSize: '18px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>任务列表查询性能</h3>
                  <p style={{ marginTop: '8px', fontSize: '14px', color: LK.muted }}>
                    只展示列表读路径性能，不夹带同步副作用。这里可以直接看整体延迟、错误，以及最慢子分段是否出在计数、聚合还是序列化。
                  </p>

                  <div style={{ marginTop: '16px', display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
                    {binarySecurityObservabilityViewModel.taskListPerformance.topCards.map((item) => (
                      <div key={item.label} style={{ borderRadius: '12px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, padding: '12px 16px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>{item.label}</div>
                        <div className={`mt-2 text-lg font-semibold ${item.tone}`}>{item.value}</div>
                        <div style={{ marginTop: '4px', fontSize: '12px', color: LK.muted }}>{item.hint}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {binarySecurityObservabilityViewModel.taskListPerformance.alerts.map((alert) => (
 <div key={alert.label} className={`rounded-2xl border px-4 py-3 ${alert.tone}`}>
                        <div style={{ fontSize: '14px', fontWeight: 600 }}>{alert.label}</div>
                        <div style={{ marginTop: '4px', fontSize: '12px', lineHeight: '1.25rem', opacity: 0.9 }}>{alert.text}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full divide-y divide-theme-border text-left text-sm">
                      <thead className="bg-theme-elevated">
                        <tr>
                          <th style={{ padding: '8px 12px', fontWeight: 600, color: LK.muted }}>分段</th>
                          <th style={{ padding: '8px 12px', fontWeight: 600, color: LK.muted }}>调用次数</th>
                          <th style={{ padding: '8px 12px', fontWeight: 600, color: LK.muted }}>平均耗时</th>
                          <th style={{ padding: '8px 12px', fontWeight: 600, color: LK.muted }}>P95</th>
                        </tr>
                      </thead>
                      <tbody style={{ display: 'flex', flexDirection: 'column', borderBottom:`1px solid ${LK.borderSoft}`, backgroundColor: LK.surface }}>
                        {binarySecurityObservabilityViewModel.taskListPerformance.stageRows.length ? (
                          binarySecurityObservabilityViewModel.taskListPerformance.stageRows.map((item) => (
                            <tr key={item.stage}>
                              <td className="px-3 py-2 font-semibold text-theme-text-secondary">{item.stage}</td>
                              <td className="px-3 py-2 font-mono text-theme-text-muted">{formatNumber(item.count)}</td>
                              <td className={`px-3 py-2 font-mono ${item.tone}`}>{formatSeconds(item.avgSeconds)}</td>
                              <td className={`px-3 py-2 font-mono ${item.tone}`}>{formatSeconds(item.p95Seconds)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="px-3 py-8 text-center text-sm text-theme-text-muted">
                              暂无任务列表分段性能指标。
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {binarySecurityObservabilityViewModel.groupCounts.map((item) => (
                  <div key={item.group} className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2">
                    <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: LK.muted }}>{GROUP_LABELS[item.group]}</div>
                    <div className="mt-1 text-base font-semibold text-theme-text-primary">{formatNumber(item.count)}</div>
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
 <section className="space-y-4 rounded-xl border border-teal-500/20 bg-theme-surface p-5">
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                <div>
                  <h2 style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>数据流分析聚合观测</h2>
                  <p style={{ marginTop: '8px', maxWidth: '48rem', fontSize: '14px', color: LK.inkSoft }}>
                    当前展示的是 DFA`metrics/aggregate` 聚合视图，不再只看 API Pod。本区重点看积压、租约/心跳健康、时延、失败归因和 token/trace 复杂度。
                  </p>
                </div>
                <span style={{ display: 'inline-flex', borderRadius: '9999px', border: '1px solid #14b8a6', backgroundColor: 'rgba(20, 184, 166, 0.15)', padding: '4px 12px', fontSize: '12px', fontWeight: 600, color: '#14b8a6' }}>
                  aggregate {formatMetricValue(metricValueByName(viewModel.rows, 'chimera_dfa_metrics_aggregate_up') ?? Number.NaN)} / db{' '}
                  {formatMetricValue(metricValueByName(viewModel.rows, 'chimera_dfa_db_up') ?? Number.NaN)}
                </span>
              </div>

              <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                {dataflowAnalysisViewModel.kpis.map((item) => (
 <div key={item.label} className="rounded-2xl border border-teal-500/20 bg-theme-surface px-4 py-3">
                    <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>{item.label}</div>
                    <div className={`mt-2 text-xl font-semibold ${item.tone}`}>{item.value}</div>
                    <div style={{ marginTop: '4px', fontSize: '12px', color: LK.muted }}>{item.hint}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                {dataflowAnalysisViewModel.alerts.map((alert) => (
 <div key={alert.label} className={`rounded-2xl border px-4 py-3 ${alert.tone}`}>
                    <div style={{ fontSize: '14px', fontWeight: 600 }}>{alert.label}</div>
                    <div style={{ marginTop: '4px', fontSize: '12px', lineHeight: '1.25rem', opacity: 0.9 }}>{alert.text}</div>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
 <div className="rounded-[1.6rem] border border-teal-500/20 bg-theme-elevated p-4">
                  <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>负载与成本</div>
                  <h3 style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>Queue / Runtime / Token</h3>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {dataflowAnalysisViewModel.loadCards.map((item) => (
                      <div key={item.label} style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '12px 16px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>{item.label}</div>
                        <div className={`mt-2 text-lg font-semibold ${item.tone}`}>{item.value}</div>
                        <div style={{ marginTop: '4px', fontSize: '12px', color: LK.muted }}>{item.hint}</div>
                      </div>
                    ))}
                  </div>
                </div>

 <div className="rounded-[1.6rem] border border-teal-500/20 bg-theme-elevated p-4">
                  <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>失败与调度</div>
                  <h3 style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>Failure Category / Dispatch</h3>
                  <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {dataflowAnalysisViewModel.failureCategories.length ? (
                        dataflowAnalysisViewModel.failureCategories.slice(0, 6).map((item) => (
                          <div key={item.label} style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '12px 16px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>{item.label}</div>
                            <div className={`mt-2 text-lg font-semibold ${item.tone}`}>{formatNumber(item.value)}</div>
                            <div style={{ marginTop: '4px', fontSize: '12px', color: LK.muted }}>cluster failure category snapshot</div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-theme-border px-4 py-6 text-center text-sm text-theme-text-muted sm:col-span-2">
                          当前没有 failure category 聚合指标。
                        </div>
                      )}
                    </div>
                    <div style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '12px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>Dispatch Summary</div>
                      <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {dataflowAnalysisViewModel.dispatchSummary.length ? (
                          dataflowAnalysisViewModel.dispatchSummary.map((item) => (
                            <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', borderRadius: '8px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, padding: '8px 12px' }}>
                              <div className="min-w-0 truncate text-sm font-semibold text-theme-text-secondary">{item.label}</div>
                              <div className={`font-mono text-sm font-semibold ${item.tone}`}>{formatNumber(item.value)}</div>
                            </div>
                          ))
                        ) : (
                          <div style={{ borderRadius: '8px', border: `1px dashed ${LK.border}`, padding: '24px 12px', textAlign: 'center', fontSize: '14px', color: LK.muted }}>当前没有 dispatch 聚合指标。</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

 <div className="rounded-[1.6rem] border border-teal-500/20 bg-theme-elevated p-4">
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                  <div>
                    <h3 style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>执行槽位明细</h3>
                    <p className="mt-2 max-w-3xl text-sm text-theme-text-muted">
                      直接复用 DFA worker cluster capacity 接口，和任务列表页保持同一口径，用于核对聚合指标背后的具体 owner / task 归属。
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '12px', color: LK.muted }}>
                    <div>最近刷新</div>
                    <div className="mt-1 font-semibold text-theme-text-muted">{formatTime(dfaWorkerDetailState.refreshedAt)}</div>
                  </div>
                </div>
                {selectedDfaWorkerFilter ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-cyan-500/20 bg-cyan-500/15 px-4 py-3 text-xs text-cyan-400">
                    <span style={{ fontWeight: 600 }}>已联动筛选 Worker：</span>
                    <span style={{ borderRadius: '9999px', backgroundColor: LK.surface, padding: '4px 8px', fontFamily: MONO }}>{selectedDfaWorkerFilter}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedDfaWorkerFilter('')}
                      className="rounded-full border border-cyan-500/20 bg-theme-elevated px-2 py-1 font-semibold text-cyan-400 hover:bg-cyan-500/15"
                    >
                      清除筛选
                    </button>
                  </div>
                ) : null}
                {dfaWorkerDetailState.loading ? (
                  <div className="mt-4 flex items-center gap-2 text-sm text-theme-text-muted">
                    <Loader2 size={16} className="animate-spin" />
                    正在读取 worker 明细...
                  </div>
                ) : dfaWorkerDetailState.error && !dfaWorkerDetailState.data ? (
                  <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-400">
                    暂无 worker 明细：{dfaWorkerDetailState.error}
                  </div>
                ) : (
                  <>
                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      {[
                        { label: 'Worker 数', value: dfaWorkerDetailState.data?.worker_count ?? '-', hint:`健康 ${dfaWorkerDetailState.data?.healthy_workers ?? 0} / 活跃失联 ${dfaWorkerDetailState.data?.stale_workers ?? 0}${typeof (dfaWorkerDetailState.data as any)?.retired_workers === 'number' ?` / 退休残留 ${(dfaWorkerDetailState.data as any).retired_workers}` : ''}` },
                        { label: '总槽位', value: dfaWorkerDetailState.data?.total_capacity ?? '-', hint: 'worker max_concurrent_jobs 汇总' },
                        { label: '运行中', value: dfaWorkerDetailState.data?.running_jobs ?? '-', hint: 'active running jobs' },
                        { label: '空闲 / 排队', value:`${dfaWorkerDetailState.data?.available_slots ?? '-'} / ${dfaWorkerDetailState.data?.queued_jobs ?? '-'}`, hint: 'available slots / queued jobs' },
                      ].map((item) => (
                        <div key={item.label} style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '12px 16px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>{item.label}</div>
                          <div className="mt-2 text-lg font-semibold text-theme-text-primary">{item.value}</div>
                          <div style={{ marginTop: '4px', fontSize: '12px', color: LK.muted }}>{item.hint}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {(dfaWorkerDetailState.data?.workers || []).length ? (
                        asArray(dfaWorkerDetailState.data?.workers).map((worker) => (
                          <div
                            key={worker.worker_id}
                            onClick={() => setSelectedDfaWorkerFilter((current) => current === worker.worker_id ? '' : worker.worker_id)}
                            className={`rounded-2xl border px-4 py-4 ${
                              worker.healthy ? 'border-theme-border bg-theme-elevated' : 'border-rose-500/20 bg-rose-500/10'
                            } ${selectedDfaWorkerFilter === worker.worker_id ? 'ring-2 ring-cyan-300 ring-offset-1' : 'cursor-pointer hover:border-cyan-500/20'}`}
                          >
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                                  <div style={{ fontSize: '14px', fontWeight: 600, color: LK.ink }}>{worker.host_name || worker.worker_id}</div>
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${worker.healthy ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                                    {worker.healthy ? 'healthy' : 'unhealthy'}
                                  </span>
                                  <span style={{ borderRadius: '9999px', backgroundColor: LK.surfaceRaised, padding: '2px 8px', fontSize: '10px', fontWeight: 600, color: LK.body }}>
                                    活动任务 {asArray(worker.active_jobs).length}
                                  </span>
                                </div>
                                <div className="mt-1 font-mono text-[11px] text-theme-text-muted break-all">{worker.worker_id}</div>
                                <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '12px', color: LK.muted }}>
                                  <span>槽位 {worker.running_jobs}/{worker.max_concurrent_jobs}</span>
                                  <span>空闲 {worker.available_slots}</span>
                                  <span>来源 {worker.source || 'worker_registry'}</span>
                                  <span>心跳 {worker.last_heartbeat_at ? formatTime(new Date(worker.last_heartbeat_at).getTime()) : '-'}</span>
                                </div>
                                <div className="mt-2 text-[11px] text-cyan-400">点击可联动过滤下方 Prometheus Samples</div>
                                {worker.error ? <div style={{ marginTop: '8px', fontSize: '12px', color: LK.error }}>{worker.error}</div> : null}
                              </div>
                            </div>
                            <div className="mt-3 grid gap-2 lg:grid-cols-2">
                              {asArray(worker.active_jobs).length ? (
                                asArray(worker.active_jobs).map((job) => (
                                  <div key={`${worker.worker_id}:${job.task_id}`} className="rounded-xl border border-theme-border bg-theme-surface px-3 py-3">
                                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                                      <div className="min-w-0 truncate text-sm font-bold text-theme-text-primary" title={job.task_name}>{job.task_name}</div>
                                      <span style={{ borderRadius: '9999px', backgroundColor: LK.surfaceRaised, padding: '2px 8px', fontSize: '10px', fontWeight: 600, color: LK.body }}>{job.status}</span>
                                    </div>
                                    <div className="mt-2 space-y-1 text-xs text-theme-text-muted">
                                      <div className="font-mono break-all">task_id: {job.task_id}</div>
                                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.input_path}>input: {job.input_path}</div>
                                      <div>dispatch: {job.dispatch_status || '-'}</div>
                                      <div>lease: {job.execution_lease_until ? formatTime(new Date(job.execution_lease_until).getTime()) : '-'}</div>
                                      <div>heartbeat: {job.execution_heartbeat_at ? formatTime(new Date(job.execution_heartbeat_at).getTime()) : '-'}</div>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="rounded-xl border border-dashed border-theme-border px-4 py-6 text-center text-sm text-theme-text-muted lg:col-span-2">
                                  当前无活跃任务。
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-theme-border px-4 py-10 text-center text-sm text-theme-text-muted">
                          当前未发现可用的 DFA worker 明细。
                        </div>
                      )}
                    </div>
                    {dfaWorkerDetailState.error ? (
                      <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/15 px-4 py-3 text-sm text-amber-400">
                        聚合指标已更新，但 worker 明细抓取有告警：{dfaWorkerDetailState.error}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </section>
          ) : null}

          {entryAnalysisViewModel ? (
 <section className="space-y-4 rounded-xl border border-indigo-500/20 bg-theme-surface p-5">
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                <div>
                  <h2 style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>入口分析业务聚合观测</h2>
                  <p style={{ marginTop: '8px', maxWidth: '48rem', fontSize: '14px', color: LK.inkSoft }}>
                    面向服务级聚合快照，重点看排队、执行、轮次、Worker/Judge 负载以及失败归因；这里不是单任务的 R1/R2/R3/R4 详情页，而是集群级健康视图。
                  </p>
                </div>
 <span className="inline-flex rounded-full border border-indigo-500/20 bg-theme-elevated px-3 py-1 text-xs font-semibold text-indigo-400">
                  retry {formatNumber(metricValueByName(viewModel.rows, 'chimera_ea_retry_total'))} / timeout {formatNumber(metricValueByName(viewModel.rows, 'chimera_ea_timeout_total'))}
                </span>
              </div>

              <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                {entryAnalysisViewModel.kpis.map((item) => (
 <div key={item.label} className="rounded-2xl border border-indigo-500/20 bg-theme-surface px-4 py-3">
                    <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>{item.label}</div>
                    <div className={`mt-2 text-xl font-semibold ${item.tone}`}>{item.value}</div>
                    <div style={{ marginTop: '4px', fontSize: '12px', color: LK.muted }}>{item.hint}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                {entryAnalysisViewModel.riskAlerts.map((alert) => (
 <div key={alert.label} className={`rounded-2xl border px-4 py-3 ${alert.tone}`}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 600 }}>{alert.label}</div>
                        <div className="mt-1 text-xs leading-5 opacity-85">{alert.text}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const focus = focusedEntryStageRow?.stage || selectedEntryStage;
                          if (focus && focus !== 'all') sessionStorage.setItem(ENTRY_ANALYSIS_STAGE_FOCUS_STORAGE_KEY, String(focus));
                          else sessionStorage.removeItem(ENTRY_ANALYSIS_STAGE_FOCUS_STORAGE_KEY);
                          sessionStorage.setItem(ENTRY_ANALYSIS_RISK_FOCUS_STORAGE_KEY, entryAnalysisRiskKeyFromLabel(alert.label));
                          window.dispatchEvent(new CustomEvent('chimera-navigate-view', { detail: { view: 'entry-analysis-task' } }));
                        }}
 className="rounded-xl border border-current/20 bg-theme-surface px-3 py-2 text-[11px] font-semibold transition hover:bg-theme-surface"
                      >
                        带着风险排查
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: '1.05fr 0.95fr' }}>
                <div style={{ borderRadius: '12px', border: `1px solid #2563EB`, backgroundColor: 'rgba(99, 102, 241, 0.1)', padding: '16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>角色与吞吐</div>
                  <h3 style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>Worker / Judge / Session 负载</h3>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {entryAnalysisViewModel.roleSummary.map((item) => (
                      <div key={item.label} style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '12px 16px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>{item.label}</div>
                        <div className={`mt-2 text-lg font-semibold ${item.tone}`}>{item.value}</div>
                        <div style={{ marginTop: '4px', fontSize: '12px', color: LK.muted }}>{item.hint}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ borderRadius: '12px', border: `1px solid #2563EB`, backgroundColor: 'rgba(99, 102, 241, 0.1)', padding: '16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>失败与模块</div>
                  <h3 style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>异常归因 / Top Modules</h3>
                  <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {entryAnalysisViewModel.failureSummary.map((item) => (
                        <div key={item.label} style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '12px 16px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>{item.label}</div>
                          <div className={`mt-2 text-lg font-semibold ${item.tone}`}>{formatMetricValue(item.value ?? Number.NaN)}</div>
                          <div style={{ marginTop: '4px', fontSize: '12px', color: LK.muted }}>{item.hint}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '12px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>模块热度</div>
                      <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {entryAnalysisViewModel.topModules.length ? (
                          entryAnalysisViewModel.topModules.map((item) => (
                            <div key={item.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', borderRadius: '8px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, padding: '8px 12px' }}>
                              <div className="min-w-0 truncate text-sm font-semibold text-theme-text-secondary">{item.name}</div>
                              <div className="font-mono text-sm font-semibold text-indigo-400">{formatNumber(item.value)}</div>
                            </div>
                          ))
                        ) : (
                          <div style={{ borderRadius: '8px', border: `1px dashed ${LK.border}`, padding: '24px 12px', textAlign: 'center', fontSize: '14px', color: LK.muted }}>当前没有模块级聚合指标。</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ borderRadius: '12px', border: `1px solid #2563EB`, backgroundColor: 'rgba(99, 102, 241, 0.1)', padding: '16px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                  <div>
                    <h3 style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>执行槽位明细</h3>
                    <p className="mt-2 max-w-3xl text-sm text-theme-text-muted">
                      直接复用入口分析任务页的槽位聚合接口，和任务页保持同一口径，用于从性能看板快速下钻到具体 worker / owner / active task。
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '12px', color: LK.muted }}>
                    <div>最近刷新</div>
                    <div className="mt-1 font-semibold text-theme-text-muted">{formatTime(entryWorkerDetailState.refreshedAt)}</div>
                  </div>
                </div>
                {selectedEntryWorkerFilter ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-indigo-500/20 bg-indigo-500/15 px-4 py-3 text-xs text-indigo-400">
                    <span style={{ fontWeight: 600 }}>已联动筛选 Worker：</span>
                    <span style={{ borderRadius: '9999px', backgroundColor: LK.surface, padding: '4px 8px', fontFamily: MONO }}>{selectedEntryWorkerFilter}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedEntryWorkerFilter('')}
                      className="rounded-full border border-indigo-500/20 bg-theme-elevated px-2 py-1 font-semibold text-indigo-400 hover:bg-indigo-500/15"
                    >
                      清除筛选
                    </button>
                  </div>
                ) : null}
                {entryWorkerDetailState.loading ? (
                  <div className="mt-4 flex items-center gap-2 text-sm text-theme-text-muted">
                    <Loader2 size={16} className="animate-spin" />
                    正在读取 worker 明细...
                  </div>
                ) : entryWorkerDetailState.error && !entryWorkerDetailState.data ? (
                  <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-400">
                    暂无 worker 明细：{entryWorkerDetailState.error}
                  </div>
                ) : (
                  <>
                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      {[
                        { label: 'Worker 数', value: entryWorkerDetailState.data?.worker_count ?? '-', hint: '完整集群可见 worker 数' },
                        { label: '总槽位', value: entryWorkerDetailState.data?.total_capacity ?? '-', hint: 'worker max_concurrent_jobs 汇总' },
                        { label: '运行中', value: entryWorkerDetailState.data?.running_jobs ?? '-', hint: 'active running jobs' },
                        { label: '空闲 / 排队', value:`${entryWorkerDetailState.data?.available_slots ?? '-'} / ${entryWorkerDetailState.data?.queued_jobs ?? '-'}`, hint: 'available slots / queued jobs' },
                      ].map((item) => (
                        <div key={item.label} style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '12px 16px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>{item.label}</div>
                          <div className="mt-2 text-lg font-semibold text-theme-text-primary">{item.value}</div>
                          <div style={{ marginTop: '4px', fontSize: '12px', color: LK.muted }}>{item.hint}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {(entryWorkerDetailState.data?.workers || []).length ? (
                        asArray(entryWorkerDetailState.data?.workers).map((worker) => (
                          <div
                            key={worker.worker_id}
                            onClick={() => setSelectedEntryWorkerFilter((current) => current === worker.worker_id ? '' : worker.worker_id)}
                            className={`rounded-2xl border px-4 py-4 ${
                              worker.healthy ? 'border-theme-border bg-theme-elevated' : 'border-rose-500/20 bg-rose-500/10'
                            } ${selectedEntryWorkerFilter === worker.worker_id ? 'ring-2 ring-indigo-300 ring-offset-1' : 'cursor-pointer hover:border-indigo-500/20'}`}
                          >
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                                  <div style={{ fontSize: '14px', fontWeight: 600, color: LK.ink }}>{worker.pod_name || worker.worker_id}</div>
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${worker.healthy ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                                    {worker.healthy ? 'healthy' : worker.source === 'stale_owner' ? 'stale owner' : 'unhealthy'}
                                  </span>
                                  <span style={{ borderRadius: '9999px', backgroundColor: LK.surfaceRaised, padding: '2px 8px', fontSize: '10px', fontWeight: 600, color: LK.body }}>
                                    活动任务 {asArray(worker.active_tasks).length}
                                  </span>
                                </div>
                                <div className="mt-1 font-mono text-[11px] text-theme-text-muted break-all">{worker.url || worker.pod_ip || worker.worker_id}</div>
                                <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '12px', color: LK.muted }}>
                                  <span>槽位 {worker.running_jobs}/{worker.max_concurrent_jobs}</span>
                                  <span>空闲 {worker.available_slots}</span>
                                  <span>来源 {worker.source || 'worker_registry'}</span>
                                  <span>心跳 {worker.last_heartbeat_at ? formatTime(new Date(worker.last_heartbeat_at).getTime()) : '-'}</span>
                                </div>
                                <div className="mt-2 text-[11px] text-indigo-400">点击可联动过滤下方 Prometheus Samples</div>
                                {worker.error ? <div style={{ marginTop: '8px', fontSize: '12px', color: LK.error }}>{worker.error}</div> : null}
                              </div>
                            </div>
                            <div className="mt-3 grid gap-2 lg:grid-cols-2">
                              {asArray(worker.active_tasks).length ? (
                                asArray(worker.active_tasks).map((job) => (
                                  <div key={`${worker.worker_id}:${job.task_id}`} className="rounded-xl border border-theme-border bg-theme-surface px-3 py-3">
                                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                                      <div className="min-w-0 truncate text-sm font-bold text-theme-text-primary" title={job.task_id}>{job.task_id}</div>
                                      <span style={{ borderRadius: '9999px', backgroundColor: LK.surfaceRaised, padding: '2px 8px', fontSize: '10px', fontWeight: 600, color: LK.body }}>{job.status}</span>
                                    </div>
                                    <div className="mt-2 space-y-1 text-xs text-theme-text-muted">
                                      <div className="font-mono break-all">task_id: {job.task_id}</div>
                                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.entry_id || '-'}>entry: {job.entry_id || '-'}</div>
                                      <div>owner: {worker.pod_name || worker.worker_id}</div>
                                      <div>lease: {job.lease_expires_at ? formatTime(new Date(job.lease_expires_at).getTime()) : '-'}</div>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="rounded-xl border border-dashed border-theme-border px-4 py-6 text-center text-sm text-theme-text-muted lg:col-span-2">
                                  当前无活跃任务。
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-theme-border px-4 py-10 text-center text-sm text-theme-text-muted">
                          当前未发现可用的入口分析 worker 明细。
                        </div>
                      )}
                    </div>
                    {entryWorkerDetailState.error ? (
                      <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/15 px-4 py-3 text-sm text-amber-400">
                        聚合指标已更新，但 worker 明细抓取有告警：{entryWorkerDetailState.error}
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                {entryAnalysisViewModel.stageCards.map((item) => (
 <div key={item.label} className="rounded-2xl border border-indigo-500/20 bg-theme-surface px-4 py-3">
                    <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>{item.label}</div>
                    <div className={`mt-2 text-xl font-semibold ${item.tone}`}>{item.value}</div>
                    <div style={{ marginTop: '4px', fontSize: '12px', color: LK.muted }}>{item.hint}</div>
                  </div>
                ))}
              </div>

              <div style={{ borderRadius: '12px', border: `1px solid #2563EB`, backgroundColor: 'rgba(99, 102, 241, 0.1)', padding: '16px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>阶段聚焦</div>
                    <h3 style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>按阶段查看诊断</h3>
                    <div style={{ marginTop: '4px', fontSize: '12px', color: LK.muted }}>点击阶段后会切换到对应的诊断卡，并支持把下方原始指标表过滤到该阶段。</div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setSelectedEntryStage('all')}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                        selectedEntryStage === 'all' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-theme-border bg-theme-elevated text-theme-text-secondary hover:bg-theme-elevated'
                      }`}
                    >
                      全部阶段
                    </button>
                    {entryAnalysisViewModel.stageRows.map((item) => (
                      <button
                        key={item.stage}
                        type="button"
                        onClick={() => setSelectedEntryStage(item.stage as 'R1' | 'R2' | 'R3' | 'R4')}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                          selectedEntryStage === item.stage ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-theme-border bg-theme-elevated text-theme-text-secondary hover:bg-theme-elevated'
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
                      { label: '通过 / 失败', value:`${formatNumber(focusedEntryStageRow.passedRuns, 0)} / ${formatNumber(focusedEntryStageRow.failedRuns, 0)}`, hint: 'passed / failed', tone: focusedEntryStageRow.failedRuns > focusedEntryStageRow.passedRuns ? 'text-rose-400' : 'text-emerald-400' },
                      { label: '重试 / 运行中', value:`${formatNumber(focusedEntryStageRow.retryRuns, 0)} / ${formatNumber(focusedEntryStageRow.runningRuns, 0)}`, hint: 'retry / running', tone: focusedEntryStageRow.retryRuns > 0 || focusedEntryStageRow.runningRuns > 0 ? 'text-amber-400' : 'text-theme-text-primary' },
                      { label: '平均耗时', value: formatSeconds(focusedEntryStageRow.avgDurationSeconds), hint: 'stage_duration_seconds 均值', tone: (focusedEntryStageRow.avgDurationSeconds || 0) > 180 ? 'text-rose-400' : 'text-theme-text-primary' },
                      { label: 'Worker / Judge', value:`${formatNumber(focusedEntryStageRow.workerCalls, 0)} / ${formatNumber(focusedEntryStageRow.judgeCalls, 0)}`, hint: 'stage_role_total', tone: 'text-indigo-400' },
                      { label: 'Sessions', value: formatNumber(focusedEntryStageRow.sessionCount, 0), hint: 'stage_session_total', tone: focusedEntryStageRow.sessionCount > 0 ? 'text-theme-text-primary' : 'text-amber-400' },
                    ].map((item) => (
                      <div key={item.label} className="rounded-2xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-3">
                        <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>{item.label}</div>
                        <div className={`mt-2 text-xl font-semibold ${item.tone}`}>{item.value}</div>
                        <div style={{ marginTop: '4px', fontSize: '12px', color: LK.muted }}>{item.hint}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-theme-border px-4 py-8 text-center text-sm text-theme-text-muted">当前展示全部阶段总览，选择一个阶段即可进入聚焦诊断。</div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!focusedEntryStageRow) return;
                      setSearchKeyword(`stage=${focusedEntryStageRow.stage.toLowerCase()}`);
                    }}
                    disabled={!focusedEntryStageRow}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                      focusedEntryStageRow ? 'border-indigo-500/20 bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/15' : 'cursor-not-allowed border-theme-border bg-theme-elevated text-theme-text-muted'
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
                    className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-xs font-semibold text-theme-text-secondary transition hover:bg-theme-surface"
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
                      window.dispatchEvent(new CustomEvent('chimera-navigate-view', { detail: { view: 'entry-analysis-task' } }));
                    }}
                    className="rounded-xl border border-indigo-500/20 bg-indigo-500/15 px-3 py-2 text-xs font-semibold text-indigo-400 transition hover:bg-indigo-500/15"
                  >
                    前往入口分析任务页
                  </button>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <div style={{ borderRadius: '12px', border: `1px solid #2563EB`, backgroundColor: 'rgba(99, 102, 241, 0.1)', padding: '16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>阶段状态图</div>
                  <h3 style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>R1 / R2 / R3 / R4 运行态</h3>
                  <div style={{ marginTop: '16px', height: '288px' }}>
                    {entryAnalysisViewModel.stageStatusChart.length ? (
                      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
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

                <div style={{ borderRadius: '12px', border: `1px solid #2563EB`, backgroundColor: 'rgba(99, 102, 241, 0.1)', padding: '16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>阶段健康矩阵</div>
                  <h3 style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>阶段级诊断明细</h3>
                  <div style={{ marginTop: '16px', overflow: 'auto', borderRadius: '12px', border: `1px solid ${LK.border}` }}>
                    <table className="min-w-full divide-y divide-theme-border text-left text-xs">
                      <thead style={{ backgroundColor: LK.surfaceRaised, color: LK.muted }}>
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
                      <tbody style={{ display: 'flex', flexDirection: 'column', borderBottom:`1px solid ${LK.borderSoft}`, backgroundColor: LK.surface }}>
                        {entryAnalysisViewModel.stageRows.length ? (
                          entryAnalysisViewModel.stageRows.map((item) => (
                            <tr key={item.stage} className={`cursor-pointer hover:bg-theme-elevated ${selectedEntryStage === item.stage ? 'bg-indigo-50/70' : ''}`} onClick={() => setSelectedEntryStage(item.stage as 'R1' | 'R2' | 'R3' | 'R4')}>
                              <td className="px-3 py-3">
                                <div className={`font-semibold ${item.healthTone}`}>{item.stage}</div>
                              </td>
                              <td style={{ padding: '12px', fontFamily: MONO, color: LK.ink }}>{formatNumber(item.totalRuns, 0)}</td>
                              <td className="px-3 py-3 font-mono text-emerald-400">{formatNumber(item.passedRuns, 0)}</td>
                              <td className="px-3 py-3 font-mono text-rose-400">{formatNumber(item.failedRuns, 0)}</td>
                              <td className="px-3 py-3 font-mono text-amber-400">{formatNumber(item.retryRuns, 0)}</td>
                              <td className="px-3 py-3 font-mono text-sky-400">{formatNumber(item.runningRuns, 0)}</td>
                              <td style={{ padding: '12px', fontFamily: MONO, color: LK.ink }}>{formatSeconds(item.avgDurationSeconds)}</td>
                              <td style={{ padding: '12px', fontFamily: MONO, color: LK.ink }}>
                                {formatNumber(item.workerCalls, 0)} / {formatNumber(item.judgeCalls, 0)}
                              </td>
                              <td style={{ padding: '12px', fontFamily: MONO, color: LK.ink }}>{formatNumber(item.sessionCount, 0)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={9} className="px-4 py-10 text-center text-sm text-theme-text-muted">
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
 <section className="rounded-xl border border-cyan-500/20 bg-theme-surface p-5">
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                <div>
                  <h2 style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>二进制逆向业务指标</h2>
                  <p style={{ marginTop: '8px', maxWidth: '48rem', fontSize: '14px', color: LK.inkSoft }}>
                    来自 PI 任务内部埋点，不从日志反推；用于观察头文件还原、函数体还原、批次吞吐、Token/成本与产物规模。
                  </p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
 <span className="inline-flex rounded-full border border-cyan-500/20 bg-theme-elevated px-3 py-1 text-xs font-semibold text-cyan-400">
                    覆盖率 {b2sBusinessViewModel.coverageRate == null ? '-' :`${formatNumber(b2sBusinessViewModel.coverageRate, 1)}%`}
                  </span>
 <span className="inline-flex rounded-full border border-cyan-500/20 bg-theme-elevated px-3 py-1 text-xs font-semibold text-cyan-400">
                    最近样本 {formatTime(b2sBusinessViewModel.latestSeenAt)}
                  </span>
                </div>
              </div>
              {(b2sBusinessViewModel.availableItems || 0) <= 0 ? (
                <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                  <div className="text-sm font-semibold text-amber-300">暂无有效 runtime metrics 样本</div>
                  <p className="mt-1 text-sm text-amber-400">
                    当前 B2S 已看到 {formatNumber(b2sBusinessViewModel.missingItems)} 个缺失项。看板不会用缺失样本推导平均耗时，避免把旧任务或尚未上报的任务误读为 0。
                  </p>
                  {b2sBusinessViewModel.missingReasons.length ? (
                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                      {b2sBusinessViewModel.missingReasons.map((item) => (
 <div key={item.reason} className="rounded-xl border border-amber-500/20 bg-theme-surface px-3 py-2">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-400">{item.reason}</div>
                          <div className="mt-1 text-lg font-semibold text-amber-300">{formatNumber(item.value)}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">任务历史聚合（终态样本）</div>
                  <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    {[
                      { label: '头文件平均耗时', value: formatSeconds(b2sBusinessViewModel.headerAvgSeconds), hint: 'terminal header_synthesis', tone: 'text-cyan-300' },
                      { label: '函数体平均耗时', value: formatSeconds(b2sBusinessViewModel.bodyAvgSeconds), hint: 'terminal body_generation', tone: 'text-cyan-300' },
                      { label: '批次平均耗时', value: formatSeconds(b2sBusinessViewModel.batchAvgSeconds), hint: 'batch duration', tone: 'text-cyan-300' },
                      { label: '加权函数吞吐', value:`${formatNumber(b2sBusinessViewModel.weightedFunctionThroughput ?? b2sBusinessViewModel.functionThroughput, 3)} /s`, hint: 'completed functions / body seconds', tone: 'text-emerald-400' },
                      { label: '覆盖率', value: b2sBusinessViewModel.coverageRate == null ? '-' :`${formatNumber(b2sBusinessViewModel.coverageRate, 1)}%`, hint:`available ${formatNumber(b2sBusinessViewModel.availableItems)} / missing ${formatNumber(b2sBusinessViewModel.missingItems)}`, tone: (b2sBusinessViewModel.missingItems || 0) > 0 ? 'text-amber-400' : 'text-emerald-400' },
                      { label: '批次重试率', value: b2sBusinessViewModel.batchRetryRate == null ? '-' :`${formatNumber(b2sBusinessViewModel.batchRetryRate * 100, 1)}%`, hint: 'extra attempts / attempts', tone: (b2sBusinessViewModel.batchRetryRate || 0) > 0.1 ? 'text-amber-400' : 'text-emerald-400' },
                      { label: '校验通过率', value: b2sBusinessViewModel.batchValidationPassRate == null ? '-' :`${formatNumber(b2sBusinessViewModel.batchValidationPassRate * 100, 1)}%`, hint: 'passed batches / batches', tone: (b2sBusinessViewModel.batchValidationPassRate || 0) < 0.9 ? 'text-amber-400' : 'text-emerald-400' },
                      { label: '失败批次占比', value: b2sBusinessViewModel.batchFailureRate == null ? '-' :`${formatNumber(b2sBusinessViewModel.batchFailureRate * 100, 1)}%`, hint: 'failed batches / batches', tone: (b2sBusinessViewModel.batchFailureRate || 0) > 0 ? 'text-rose-400' : 'text-emerald-400' },
                      { label: '平均 Attempts', value: formatNumber(b2sBusinessViewModel.avgAttemptsPerBatch, 2), hint: 'attempts per batch', tone: (b2sBusinessViewModel.avgAttemptsPerBatch || 0) > 1.2 ? 'text-amber-400' : 'text-theme-text-primary' },
                      { label: 'Token / 成本', value:`${formatNumber(b2sBusinessViewModel.tokenTotal)} / ${formatMetricValue(b2sBusinessViewModel.costTotal ?? Number.NaN)}`, hint: 'runtime llm summary', tone: 'text-indigo-400' },
                    ].map((item) => (
 <div key={item.label} className="rounded-2xl border border-cyan-500/20 bg-theme-surface px-4 py-3">
                        <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>{item.label}</div>
                        <div className={`mt-2 text-xl font-semibold ${item.tone}`}>{item.value}</div>
                        <div style={{ marginTop: '4px', fontSize: '12px', color: LK.muted }}>{item.hint}</div>
                      </div>
                    ))}
                  </div>
                  {b2sBusinessViewModel.runningHeaderAvgSeconds != null || b2sBusinessViewModel.runningBodyAvgSeconds != null ? (
                    <>
                      <div className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">运行中实时指标（不参与历史均值）</div>
                      <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        {[
                          { label: '运行中头文件耗时', value: formatSeconds(b2sBusinessViewModel.runningHeaderAvgSeconds), hint: 'running header_synthesis', tone: 'text-cyan-300' },
                          { label: '运行中函数体耗时', value: formatSeconds(b2sBusinessViewModel.runningBodyAvgSeconds), hint: 'running body_generation', tone: 'text-cyan-300' },
                        ].map((item) => (
 <div key={item.label} className="rounded-2xl border border-cyan-500/20 bg-theme-surface px-4 py-3">
                            <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>{item.label}</div>
                            <div className={`mt-2 text-xl font-semibold ${item.tone}`}>{item.value}</div>
                            <div style={{ marginTop: '4px', fontSize: '12px', color: LK.muted }}>{item.hint}</div>
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
 <section className="rounded-xl border border-emerald-500/20 bg-theme-surface p-5">
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                <div>
                  <h2 style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>二进制逆向缓存指标</h2>
                  <p style={{ marginTop: '8px', maxWidth: '48rem', fontSize: '14px', color: LK.inkSoft }}>
                    观察 ELF 级缓存请求、命中、绕过、覆盖和当前缓存条目数量，辅助判断相同输入是否被有效复用。
                  </p>
                </div>
 <span className="inline-flex rounded-full border border-emerald-500/20 bg-theme-elevated px-3 py-1 text-xs font-semibold text-emerald-400">
                  命中率 {b2sCacheViewModel.hitRate == null ? '-' :`${formatNumber(b2sCacheViewModel.hitRate, 1)}%`}
                </span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                {[
                  { label: '缓存请求', value: formatNumber(b2sCacheViewModel.requestsTotal), hint: 'requests total', tone: 'text-theme-text-primary' },
                  { label: '缓存命中', value: formatNumber(b2sCacheViewModel.hitsTotal), hint: 'hits total', tone: 'text-emerald-400' },
                  { label: '缓存未命中', value: formatNumber(b2sCacheViewModel.missesTotal), hint: 'misses total', tone: 'text-amber-400' },
                  { label: '主动绕过', value: formatNumber(b2sCacheViewModel.bypassedTotal), hint: 'reuse_cache=false', tone: 'text-rose-400' },
                  { label: '缓存覆盖', value: formatNumber(b2sCacheViewModel.replacedTotal), hint: 'replace total', tone: 'text-indigo-400' },
                  { label: '当前条目', value: formatNumber(b2sCacheViewModel.entries), hint: 'ready cache entries', tone: 'text-theme-text-primary' },
                ].map((item) => (
 <div key={item.label} className="rounded-2xl border border-emerald-500/20 bg-theme-surface px-4 py-3">
                    <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>{item.label}</div>
                    <div className={`mt-2 text-xl font-semibold ${item.tone}`}>{item.value}</div>
                    <div style={{ marginTop: '4px', fontSize: '12px', color: LK.muted }}>{item.hint}</div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {systemAnalysisViewModel ? (
 <section className="space-y-4 rounded-xl border border-sky-500/20 bg-theme-surface p-5">
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                <div>
                  <h2 style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>系统分析专属观测</h2>
                  <p style={{ marginTop: '8px', maxWidth: '48rem', fontSize: '14px', color: LK.inkSoft }}>
                    以运行总览、阶段健康、AI 成本、并发治理和质量收益为主视图，优先回答“卡在哪、贵不贵、并发是否打满、失败是否集中”。
                  </p>
                </div>
 <span className="inline-flex rounded-full border border-sky-500/20 bg-theme-elevated px-3 py-1 text-xs font-semibold text-sky-400">
                  worker {formatNumber(systemWorkerDetailState.data?.worker_count)} / slots {formatNumber(systemWorkerDetailState.data?.total_capacity)}
                </span>
              </div>

              <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                {systemAnalysisViewModel.overviewCards.map((item) => (
 <div key={item.label} className="rounded-2xl border border-sky-500/20 bg-theme-surface px-4 py-3">
                    <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>{item.label}</div>
                    <div className={`mt-2 text-2xl font-bold ${item.tone}`}>{item.value}</div>
                    <div style={{ marginTop: '4px', fontSize: '12px', color: LK.muted }}>{item.hint}</div>
                  </div>
                ))}
              </div>

 <div className="rounded-[1.4rem] border border-sky-500/20 bg-theme-elevated px-4 py-3">
                <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>快速摘要</div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                  {systemAnalysisViewModel.compactSummary.map((item) => (
                    <div key={item.label} className="inline-flex items-center gap-2 text-sm">
                      <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: LK.muted }}>{item.label}</span>
                      <span className={`font-mono font-semibold ${item.tone}`}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

 <div className="rounded-[1.6rem] border border-sky-500/20 bg-theme-elevated p-4">
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                  <div>
                    <h3 style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>执行槽位明细</h3>
                    <p className="mt-2 max-w-3xl text-sm text-theme-text-muted">
                      直接复用系统分析任务页的 worker cluster capacity 接口，和任务列表保持同一口径，用于核对聚合指标背后的具体 owner / task 归属，并支持动态扩缩容自动识别 worker。
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '12px', color: LK.muted }}>
                    <div>最近刷新</div>
                    <div className="mt-1 font-semibold text-theme-text-muted">{formatTime(systemWorkerDetailState.refreshedAt)}</div>
                  </div>
                </div>
                {selectedSystemWorkerFilter ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-sky-500/20 bg-sky-500/15 px-4 py-3 text-xs text-sky-400">
                    <span style={{ fontWeight: 600 }}>已联动筛选 Worker：</span>
                    <span style={{ borderRadius: '9999px', backgroundColor: LK.surface, padding: '4px 8px', fontFamily: MONO }}>{selectedSystemWorkerFilter}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedSystemWorkerFilter('')}
                      className="rounded-full border border-sky-500/20 bg-theme-elevated px-2 py-1 font-semibold text-sky-400 hover:bg-sky-500/15"
                    >
                      清除筛选
                    </button>
                  </div>
                ) : null}
                {systemWorkerDetailState.loading ? (
                  <div className="mt-4 flex items-center gap-2 text-sm text-theme-text-muted">
                    <Loader2 size={16} className="animate-spin" />
                    正在读取 worker 明细...
                  </div>
                ) : systemWorkerDetailState.error && !systemWorkerDetailState.data ? (
                  <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-400">
                    暂无 worker 明细：{systemWorkerDetailState.error}
                  </div>
                ) : (
                  <>
                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      {[
                        { label: 'Worker 数', value: systemWorkerDetailState.data?.worker_count ?? '-', hint: '完整集群可见 worker 数' },
                        { label: '总槽位', value: systemWorkerDetailState.data?.total_capacity ?? '-', hint: 'runner capacity 汇总' },
                        { label: '运行中', value: systemWorkerDetailState.data?.busy_slots ?? '-', hint: 'active running jobs' },
                        { label: '空闲 / 排队', value:`${systemWorkerDetailState.data?.available_slots ?? '-'} / ${systemWorkerDetailState.data?.queued_jobs ?? '-'}`, hint: 'available slots / queued jobs' },
                      ].map((item) => (
                        <div key={item.label} style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '12px 16px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>{item.label}</div>
                          <div className="mt-2 text-lg font-semibold text-theme-text-primary">{item.value}</div>
                          <div style={{ marginTop: '4px', fontSize: '12px', color: LK.muted }}>{item.hint}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {(systemWorkerDetailState.data?.workers || []).length ? (
                        asArray(systemWorkerDetailState.data?.workers).map((worker) => (
                          <div
                            key={worker.worker_id}
                            onClick={() => setSelectedSystemWorkerFilter((current) => current === worker.worker_id ? '' : worker.worker_id)}
                            className={`rounded-2xl border px-4 py-4 ${
                              worker.healthy ? 'border-theme-border bg-theme-elevated' : 'border-rose-500/20 bg-rose-500/10'
                            } ${selectedSystemWorkerFilter === worker.worker_id ? 'ring-2 ring-sky-300 ring-offset-1' : 'cursor-pointer hover:border-sky-500/20'}`}
                          >
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                                  <div style={{ fontSize: '14px', fontWeight: 600, color: LK.ink }}>{worker.host_name || worker.worker_id}</div>
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${worker.healthy ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                                    {worker.healthy ? 'healthy' : 'unhealthy'}
                                  </span>
                                  <span style={{ borderRadius: '9999px', backgroundColor: LK.surfaceRaised, padding: '2px 8px', fontSize: '10px', fontWeight: 600, color: LK.body }}>
                                    活动任务 {asArray(worker.active_jobs).length}
                                  </span>
                                </div>
                                <div className="mt-1 font-mono text-[11px] text-theme-text-muted break-all">{worker.worker_id}</div>
                                <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '12px', color: LK.muted }}>
                                  <span>槽位 {worker.running_jobs}/{worker.max_concurrent_jobs}</span>
                                  <span>空闲 {worker.available_slots}</span>
                                  <span>来源 {worker.source || 'runner_registry'}</span>
                                  <span>心跳 {worker.last_heartbeat_at ? formatTime(new Date(worker.last_heartbeat_at).getTime()) : '-'}</span>
                                </div>
                                <div className="mt-2 text-[11px] text-sky-400">点击可联动过滤下方 Prometheus Samples</div>
                                {worker.error ? <div style={{ marginTop: '8px', fontSize: '12px', color: LK.error }}>{worker.error}</div> : null}
                              </div>
                            </div>
                            <div className="mt-3 grid gap-2 lg:grid-cols-2">
                              {asArray(worker.active_jobs).length ? (
                                asArray(worker.active_jobs).map((job) => (
                                  <div key={`${worker.worker_id}:${job.task_id}`} className="rounded-xl border border-theme-border bg-theme-surface px-3 py-3">
                                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                                      <div className="min-w-0 truncate text-sm font-bold text-theme-text-primary" title={job.task_id}>{job.task_id}</div>
                                      <span style={{ borderRadius: '9999px', backgroundColor: LK.surfaceRaised, padding: '2px 8px', fontSize: '10px', fontWeight: 600, color: LK.body }}>{job.status}</span>
                                    </div>
                                    <div className="mt-2 space-y-1 text-xs text-theme-text-muted">
                                      <div className="font-mono break-all">task_id: {job.task_id}</div>
                                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.input_path || '-'}>input: {job.input_path || '-'}</div>
                                      <div>mode: {job.analysis_mode || '-'}</div>
                                      <div>owner: {worker.host_name || worker.worker_id}</div>
                                      <div>lease: {job.execution_lease_until ? formatTime(new Date(job.execution_lease_until).getTime()) : '-'}</div>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="rounded-xl border border-dashed border-theme-border px-4 py-6 text-center text-sm text-theme-text-muted lg:col-span-2">
                                  当前无活跃任务。
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-theme-border px-4 py-10 text-center text-sm text-theme-text-muted">
                          当前未发现可用的系统分析 worker 明细。
                        </div>
                      )}
                    </div>
                    {systemWorkerDetailState.error ? (
                      <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/15 px-4 py-3 text-sm text-amber-400">
                        聚合指标已更新，但 worker 明细抓取有告警：{systemWorkerDetailState.error}
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                <div style={{ borderRadius: '12px', border: `1px solid ${LK.info}`, backgroundColor: 'rgba(79, 140, 255, 0.1)', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>阶段健康</div>
                      <h3 style={{ marginTop: '8px', fontSize: '18px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>Stage 健康矩阵</h3>
                    </div>
                    <span className="inline-flex rounded-full border border-theme-border bg-theme-elevated px-3 py-1 text-[11px] font-bold text-theme-text-muted">
                      runs / duration / score / cost
                    </span>
                  </div>
                  <div style={{ marginTop: '16px', overflow: 'auto', borderRadius: '12px', border: `1px solid ${LK.border}` }}>
                    <table className="min-w-full divide-y divide-theme-border text-left text-xs">
                      <thead style={{ backgroundColor: LK.surfaceRaised, color: LK.muted }}>
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
                      <tbody style={{ display: 'flex', flexDirection: 'column', borderBottom:`1px solid ${LK.borderSoft}`, backgroundColor: LK.surface }}>
                        {systemAnalysisViewModel.stageRows.length ? (
                          systemAnalysisViewModel.stageRows.map((row) => (
                            <tr key={row.stage} style={{ cursor: 'pointer', transition: 'background-color 0.15s' }}>
                              <td className="px-3 py-3 font-mono text-[11px] font-bold text-theme-text-primary">{row.stage}</td>
                              <td style={{ padding: '12px', fontFamily: MONO, fontSize: '11px', color: LK.inkSoft }}>
                                {formatNumber(row.totalRuns)} / {formatNumber(row.successRuns)} / {formatNumber(row.failedRuns)}
                                <div className="text-[10px] text-theme-text-muted">all / ok / fail</div>
                              </td>
                              <td className={`px-3 py-3 font-mono text-[11px] font-bold ${(row.successRate || 0) < 70 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                {row.successRate == null ? '-' :`${formatNumber(row.successRate, 1)}%`}
                              </td>
                              <td style={{ padding: '12px', fontFamily: MONO, fontSize: '11px', color: LK.ink }}>{formatSeconds(row.avgDurationSeconds)}</td>
                              <td style={{ padding: '12px', fontFamily: MONO, fontSize: '11px', color: LK.ink }}>{formatNumber(row.avgRounds, 2)}</td>
                              <td style={{ padding: '12px', fontFamily: MONO, fontSize: '11px', color: LK.ink }}>{formatNumber(row.avgScore, 1)}</td>
                              <td style={{ padding: '12px', fontFamily: MONO, fontSize: '11px', color: LK.ink }}>{formatMetricValue(row.avgCost ?? Number.NaN)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={7} className="px-4 py-8 text-center text-sm text-theme-text-muted">
                              当前还没有可聚合的阶段级指标。
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-4">
                  <div style={{ borderRadius: '12px', border: `1px solid ${LK.info}`, backgroundColor: 'rgba(79, 140, 255, 0.1)', padding: '16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>运行风险</div>
                    <div className="mt-3 grid gap-3">
                      {systemAnalysisViewModel.riskAlerts.map((alert) => (
 <div key={alert.label} className={`rounded-2xl border px-4 py-3 ${alert.tone}`}>
                          <div style={{ fontSize: '14px', fontWeight: 600 }}>{alert.label}</div>
                          <div className="mt-1 text-xs leading-5 opacity-85">{alert.text}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ borderRadius: '12px', border: `1px solid ${LK.info}`, backgroundColor: 'rgba(79, 140, 255, 0.1)', padding: '16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>失败归因</div>
                    <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {systemAnalysisViewModel.failureCategories.length ? (
                        systemAnalysisViewModel.failureCategories.slice(0, 6).map((item) => (
                          <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', borderRadius: '8px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, padding: '8px 12px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: LK.inkSoft }}>{item.label}</div>
                            <div className={`font-mono text-sm font-semibold ${item.tone}`}>{formatNumber(item.value)}</div>
                          </div>
                        ))
                      ) : (
                        <div style={{ borderRadius: '8px', border: `1px dashed ${LK.border}`, padding: '24px 12px', textAlign: 'center', fontSize: '14px', color: LK.muted }}>暂无失败分类指标。</div>
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
                  <div key={block.title} style={{ borderRadius: '12px', border: `1px solid ${LK.info}`, backgroundColor: 'rgba(79, 140, 255, 0.1)', padding: '16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>{block.title}</div>
                    <div className="mt-3 grid gap-2">
                      {block.items.map((item) => (
                        <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', borderRadius: '8px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, padding: '8px 12px' }}>
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: LK.inkSoft }}>{item.label}</div>
                            <div style={{ fontSize: '11px', color: LK.muted }}>{item.hint}</div>
                          </div>
                          <div className={`font-mono text-sm font-semibold ${item.tone}`}>{item.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <div style={{ borderRadius: '12px', border: `1px solid ${LK.info}`, backgroundColor: 'rgba(79, 140, 255, 0.1)', padding: '16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>断点续跑</div>
                  <h3 style={{ marginTop: '8px', fontSize: '18px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>续跑有效性</h3>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {systemAnalysisViewModel.checkpointCards.map((item) => (
                      <div key={item.label} style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '12px 16px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>{item.label}</div>
                        <div className={`mt-2 text-xl font-semibold ${item.tone}`}>{item.value}</div>
                        <div style={{ marginTop: '4px', fontSize: '12px', color: LK.muted }}>{item.hint}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 h-56">
                    {systemAnalysisViewModel.checkpointChart.some((item) => item.value > 0) ? (
                      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
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

                <div style={{ borderRadius: '12px', border: `1px solid ${LK.info}`, backgroundColor: 'rgba(79, 140, 255, 0.1)', padding: '16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>并发治理</div>
                  <h3 style={{ marginTop: '8px', fontSize: '18px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>并发命中率</h3>
                  <p style={{ marginTop: '8px', fontSize: '14px', color: LK.muted }}>
                    这里用`tasks_running / workers(capacity)` 观察当前命中情况，同时把 slack 和 pending 一起摆出来，方便判断是容量不够还是调度没打满。
                  </p>
                  <div style={{ marginTop: '16px', height: '288px' }}>
                    {systemAnalysisViewModel.concurrencyChart.some((item) => item.value > 0) ? (
                      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
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

              <div style={{ borderRadius: '12px', border: `1px solid ${LK.info}`, backgroundColor: 'rgba(79, 140, 255, 0.1)', padding: '16px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>阶段关联</div>
                    <h3 style={{ marginTop: '8px', fontSize: '18px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>并发拖慢嫌疑阶段</h3>
                    <p style={{ marginTop: '8px', fontSize: '14px', color: LK.muted }}>
                      用`运行中轮次 + 平均时长 + 成功率惩罚` 组合成轻量 pressure score，优先找最可能影响并发命中率的阶段。
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {systemAnalysisViewModel.stagePressureCards.map((item) => (
                      <div key={item.label} style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '12px 16px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>{item.label}</div>
                        <div className={`mt-2 text-lg font-semibold ${item.tone}`}>{item.value}</div>
                        <div style={{ marginTop: '4px', fontSize: '12px', color: LK.muted }}>{item.hint}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <div className="h-64 rounded-2xl border border-theme-border bg-theme-surface p-3">
                    {systemAnalysisViewModel.stagePressureRows.length ? (
                      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
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
                        <div key={item.stage} className="flex items-center justify-between gap-3 rounded-xl border border-theme-border bg-theme-surface px-4 py-3">
                          <div style={{ minWidth: 0 }}>
                            <div className="truncate text-sm font-semibold text-theme-text-primary">{item.stage}</div>
                            <div style={{ marginTop: '4px', fontSize: '12px', color: LK.muted }}>
                              running {formatNumber(item.runningRuns)} · avg {formatSeconds(item.avgDurationSeconds)} · success {item.successRate == null ? '-' :`${formatNumber(item.successRate, 1)}%`}
                            </div>
                          </div>
                          <div className={`font-mono text-sm font-semibold ${item.tone}`}>{formatNumber(item.pressureScore, 1)}</div>
                        </div>
                      ))
                    ) : (
                      <EmptyCard text="当前没有可展示的阶段压力排行。" />
                    )}
                  </div>
                </div>
              </div>

              <div style={{ borderRadius: '12px', border: `1px solid ${LK.info}`, backgroundColor: 'rgba(79, 140, 255, 0.1)', padding: '16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>指标口径</div>
                <h3 style={{ marginTop: '8px', fontSize: '18px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>系统分析观测说明</h3>
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
                      text: '由`运行中轮次 + 平均时长 + 成功率惩罚` 组合得到，用于快速找出最可能拖慢并发的 stage。',
                    },
                  ].map((item) => (
                    <div key={item.label} style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '12px 16px' }}>
                      <div className="text-xs font-semibold text-theme-text-primary">{item.label}</div>
                      <div className="mt-2 text-[11px] leading-5 text-theme-text-muted">{item.text}</div>
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
 <section className="space-y-4 rounded-xl border border-amber-500/20 bg-theme-surface p-5">
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                <div>
                  <h2 style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>固件解包运行健康</h2>
                  <p style={{ marginTop: '8px', maxWidth: '48rem', fontSize: '14px', color: LK.inkSoft }}>
                    优先展示任务状态、队列积压、Worker 在线能力、并发槽位和清理异常；原始 Prometheus 样本仍保留在下方用于排障。
                  </p>
                </div>
 <span className="inline-flex rounded-full border border-amber-500/20 bg-theme-elevated px-3 py-1 text-xs font-semibold text-amber-400">
                  专属聚合视图
                </span>
              </div>

              <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                {firmwareUnpackerViewModel.kpis.map((item) => (
 <div key={item.label} className="rounded-2xl border border-amber-500/20 bg-theme-surface px-4 py-3">
                    <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>{item.label}</div>
                    <div className={`mt-2 text-2xl font-bold ${item.tone}`}>{item.value}</div>
                    <div style={{ marginTop: '4px', fontSize: '12px', color: LK.muted }}>{item.hint}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                {firmwareUnpackerViewModel.alerts.map((alert) => (
 <div key={alert.label} className={`rounded-2xl border px-4 py-3 ${alert.tone}`}>
                    <div style={{ fontSize: '14px', fontWeight: 600 }}>{alert.label}</div>
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
 <div key={chart.title} className="rounded-[1.6rem] border border-amber-500/20 bg-theme-elevated p-4">
                    <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>{chart.title}</div>
                    <div className="mt-3 h-64">
                      {chart.data.some((item) => item.value > 0) ? (
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
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
 <div className="rounded-[1.6rem] border border-amber-500/20 bg-theme-elevated p-4">
                  <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>异常 / 调度 / 清理</div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {firmwareUnpackerViewModel.operations.map((item) => (
                      <div key={item.label} className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2">
                        <div style={{ fontSize: '12px', fontWeight: 600, color: LK.inkSoft }}>{item.label}</div>
                        <div className={`mt-1 text-lg font-semibold ${item.tone}`}>{formatNumber(item.value)}</div>
                        <div style={{ fontSize: '11px', color: LK.muted }}>{item.hint}</div>
                      </div>
                    ))}
                  </div>
                </div>
 <div className="rounded-[1.6rem] border border-amber-500/20 bg-theme-elevated p-4">
                  <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>AI / Token / Cost</div>
                  <div className="mt-3 grid gap-2">
                    {firmwareUnpackerViewModel.aiSummary.map((item) => (
                      <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', borderRadius: '8px', border: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surfaceRaised, padding: '8px 12px' }}>
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: LK.inkSoft }}>{item.label}</div>
                          <div style={{ fontSize: '11px', color: LK.muted }}>{item.hint}</div>
                        </div>
                        <div className={`font-mono text-sm font-semibold ${item.tone}`}>{item.value}</div>
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
              <div style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>热点指标</div>
                    <h2 style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>关键样本 Top 8</h2>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-theme-border bg-theme-elevated px-3 py-1 text-[11px] font-bold text-theme-text-muted">
                    <BarChart3 size={12} />
                    当前快照
                  </span>
                </div>
                <div style={{ marginTop: '16px', height: '288px' }}>
                  {viewModel.chartData.length ? (
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
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

              <div style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>关键摘要</div>
                <h2 style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>高优先级指标</h2>
                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {viewModel.insights.length ? (
                    viewModel.insights.slice(0, 8).map((item) => (
                      <div key={item.label} style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                          <div>
                            <div className="text-sm font-semibold text-theme-text-primary">{item.label}</div>
                            <div style={{ marginTop: '4px', fontSize: '12px', color: LK.muted }}>{item.hint}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-semibold text-theme-text-primary">{formatMetricValue(item.value)}</div>
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
                    <div key={item.group} className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2">
                      <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: LK.muted }}>{GROUP_LABELS[item.group]}</div>
                      <div className="mt-1 text-base font-semibold text-theme-text-primary">{formatNumber(item.count)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          <section style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '20px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>原始指标</div>
                <h2 style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>Prometheus Samples</h2>
                {activeServiceKey === 'dataflow-vuln' ? (
                  <p className="mt-2 max-w-3xl text-sm text-theme-text-muted">默认聚焦 cycle、runtime、AI、plugin 与 execution/queue 相关样本，避免全量 Prometheus 噪音淹没业务信号。</p>
                ) : null}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {activeServiceKey === 'dataflow-vuln' ? <DataflowVulnSampleScopeFilter activeScope={dataflowVulnSampleScope} onChange={setDataflowVulnSampleScope} /> : null}
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ pointerEvents: 'none', position: 'absolute', left: '12px', top: '10px', color: LK.muted }} />
                  <input value={searchKeyword} onChange={(event) => setSearchKeyword(event.target.value)} placeholder="搜索指标名 / labels / help" className="form-input" />
                </div>
                <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value as 'all' | BinarySecurityMetricsGroup)} style={{ borderRadius: '8px', border: `1px solid ${LK.border}`, padding: '8px 12px', fontSize: '14px', color: LK.inkSoft }}>
                  <option value="all">全部分组</option>
                  {(Object.keys(GROUP_LABELS) as BinarySecurityMetricsGroup[]).map((group) => (
                    <option key={group} value={group}>{GROUP_LABELS[group]}</option>
                  ))}
                </select>
              </div>
            </div>
            {activeServiceKey === 'dataflow-analysis' && selectedDfaWorkerFilter ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-cyan-500/20 bg-cyan-500/15 px-4 py-3 text-xs text-cyan-400">
                <span style={{ fontWeight: 600 }}>当前按 DFA Worker 过滤：</span>
                <span style={{ borderRadius: '9999px', backgroundColor: LK.surface, padding: '4px 8px', fontFamily: MONO }}>{selectedDfaWorkerFilter}</span>
                <button
                  type="button"
                  onClick={() => setSelectedDfaWorkerFilter('')}
                  className="rounded-full border border-cyan-500/20 bg-theme-elevated px-2 py-1 font-semibold text-cyan-400 hover:bg-cyan-500/15"
                >
                  清除筛选
                </button>
              </div>
            ) : null}
            {activeServiceKey === 'system-analysis' && selectedSystemWorkerFilter ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-sky-500/20 bg-sky-500/15 px-4 py-3 text-xs text-sky-400">
                <span style={{ fontWeight: 600 }}>当前按 SA Worker 过滤：</span>
                <span style={{ borderRadius: '9999px', backgroundColor: LK.surface, padding: '4px 8px', fontFamily: MONO }}>{selectedSystemWorkerFilter}</span>
                <button
                  type="button"
                  onClick={() => setSelectedSystemWorkerFilter('')}
                  className="rounded-full border border-sky-500/20 bg-theme-elevated px-2 py-1 font-semibold text-sky-400 hover:bg-sky-500/15"
                >
                  清除筛选
                </button>
              </div>
            ) : null}
            {activeServiceKey === 'entry-analysis' && selectedEntryWorkerFilter ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-indigo-500/20 bg-indigo-500/15 px-4 py-3 text-xs text-indigo-400">
                <span style={{ fontWeight: 600 }}>当前按 Entry Worker 过滤：</span>
                <span style={{ borderRadius: '9999px', backgroundColor: LK.surface, padding: '4px 8px', fontFamily: MONO }}>{selectedEntryWorkerFilter}</span>
                <button
                  type="button"
                  onClick={() => setSelectedEntryWorkerFilter('')}
                  className="rounded-full border border-indigo-500/20 bg-theme-elevated px-2 py-1 font-semibold text-indigo-400 hover:bg-indigo-500/15"
                >
                  清除筛选
                </button>
              </div>
            ) : null}

            <div style={{ marginTop: '16px', overflow: 'auto', borderRadius: '12px', border: `1px solid ${LK.border}` }}>
              <table className="min-w-full divide-y divide-theme-border text-left text-xs">
                <thead style={{ backgroundColor: LK.surfaceRaised, color: LK.muted }}>
                  <tr>
                    <th className="px-3 py-3">指标名</th>
                    <th className="px-3 py-3">Labels</th>
                    <th className="px-3 py-3">Value</th>
                    <th className="px-3 py-3">Type</th>
                    <th className="px-3 py-3">Group</th>
                  </tr>
                </thead>
                <tbody style={{ display: 'flex', flexDirection: 'column', borderBottom:`1px solid ${LK.borderSoft}`, backgroundColor: LK.surface }}>
                  {filteredRows.map((row) => (
                    <tr key={`${row.name}:${row.labelText}`} style={{ cursor: 'pointer', transition: 'background-color 0.15s' }}>
                      <td className="px-3 py-3 align-top">
                        <div className="font-mono text-[11px] font-bold text-theme-text-primary">{row.name}</div>
                        {row.help ? <div className="mt-1 max-w-[34rem] text-[11px] text-theme-text-muted">{row.help}</div> : null}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-theme-text-secondary">{row.labelText}</td>
                      <td className="px-3 py-3 font-mono text-[11px] font-semibold text-theme-text-primary">{formatMetricValue(row.value)}</td>
                      <td className="px-3 py-3 uppercase text-theme-text-secondary">{row.type}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${GROUP_BADGE[row.group]}`}>
                          {GROUP_LABELS[row.group]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredRows.length === 0 ? <div className="px-4 py-10 text-center text-sm text-theme-text-muted">没有符合过滤条件的指标</div> : null}
            </div>
          </section>
        </>
      ) : activeSecondaryTab === 'state-event-inbox' ? (
        activeServiceKey !== 'binary-security' ? (
          <section style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '48px 24px', textAlign: 'center' }}>
            <div className="mx-auto max-w-2xl">
              <h2 style={{ marginTop: '8px', fontSize: '24px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>当前服务无独立 stateEventInbox 观测</h2>
              <p className="mt-3 text-sm text-theme-text-muted">`StateEventInbox` Tab 当前只对`二进制安全编排器` 开放，用来持续观测状态事件队列、收口时延、死信、锁竞争和落盘行为。
              </p>
            </div>
          </section>
        ) : stateEventInboxMetricsState.loading && !stateEventInboxMetricsState.rawText ? (
          <section style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '48px 24px', textAlign: 'center' }}>
            <Loader2 className="mx-auto animate-spin text-theme-text-muted" size={24} />
            <p className="mt-4 text-sm text-theme-text-muted">正在抓取 stateEventInbox 指标...</p>
          </section>
        ) : stateEventInboxMetricsState.error && !stateEventInboxMetricsState.rawText ? (
 <section className="rounded-xl border border-rose-500/20 bg-rose-500/15 px-6 py-12 text-center">
            <p className="text-sm font-semibold text-rose-400">{stateEventInboxMetricsState.error}</p>
          </section>
        ) : stateEventInboxViewModel ? (
 <section className="space-y-4 rounded-xl border border-theme-border bg-theme-surface p-5">
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
              <div>
                <h2 style={{ marginTop: '8px', fontSize: '24px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>状态收口观测</h2>
                <p className="mt-2 max-w-3xl text-sm text-theme-text-muted">
                  持续观测 stateEventInbox 是否在及时消费状态事件、是否出现队列积压、锁竞争、死信和文件落盘异常，专门对应“下游已恢复但父任务仍然失败/不收敛”的问题。
                </p>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
 <span className="inline-flex items-center gap-2 rounded-full border border-theme-border bg-theme-elevated px-3 py-1 text-[11px] font-bold text-theme-text-secondary">
                  <TrendingUp size={12} />
                  历史窗口 {formatNumber(stateEventInboxViewModel.timeSeries.length)} 点
                </span>
 <span className="inline-flex items-center gap-2 rounded-full border border-theme-border bg-theme-elevated px-3 py-1 text-[11px] font-bold text-theme-text-secondary">
                  <GitBranch size={12} />
                  30s 自动刷新可形成连续曲线
                </span>
              </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-4">
              {[
                {
                  label: '快照可用性',
                  value: stateEventInboxViewModel.snapshotMeta.available ? '可用' : '不可用',
                  hint: stateEventInboxViewModel.snapshotMeta.sourcePod ?`来源 ${stateEventInboxViewModel.snapshotMeta.sourcePod}` : '暂无来源 Pod',
                  tone: stateEventInboxViewModel.snapshotMeta.available ? 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400' : 'border-rose-500/20 bg-rose-500/15 text-rose-400',
                },
                {
                  label: '快照新鲜度',
                  value: stateEventInboxViewModel.snapshotMeta.stale ? '已过期' : '新鲜',
                  hint: stateEventInboxViewModel.snapshotMeta.generatedAtTimestamp ?`生成于 ${formatTime(stateEventInboxViewModel.snapshotMeta.generatedAtTimestamp * 1000)}` : '暂无生成时间',
                  tone: stateEventInboxViewModel.snapshotMeta.stale ? 'border-amber-500/20 bg-amber-500/15 text-amber-400' : 'border-sky-500/20 bg-sky-500/15 text-sky-400',
                },
                {
                  label: '快照年龄',
                  value: formatSeconds(stateEventInboxViewModel.snapshotMeta.ageSeconds),
                  hint: 'Redis stateEventInbox snapshot age',
                  tone: (stateEventInboxViewModel.snapshotMeta.ageSeconds || 0) > 30 ? 'border-amber-500/20 bg-amber-500/15 text-amber-400' : 'border-theme-border bg-theme-elevated text-theme-text-secondary',
                },
                {
                  label: '历史曲线说明',
                  value: '浏览器会话',
                  hint: '下方曲线只保留当前浏览器会话内的短时历史，不是持久化时序库趋势。',
                  tone: 'border-theme-border bg-theme-elevated text-theme-text-secondary',
                },
              ].map((item) => (
 <div key={item.label} className={`rounded-[1.4rem] border px-4 py-4 ${item.tone}`}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em]">{item.label}</div>
                  <div className="mt-3 text-2xl font-bold tracking-tight">{item.value}</div>
                  <div className="mt-1 text-xs opacity-85">{item.hint}</div>
                </div>
              ))}
            </div>

            <div className="grid gap-3 xl:grid-cols-4">
              {stateEventInboxViewModel.queueCards.map((item) => (
 <div key={item.label} className={`rounded-[1.4rem] border px-4 py-4 ${item.tone}`}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em]">{item.label}</div>
                    <span>{item.icon}</span>
                  </div>
                  <div className="mt-3 text-3xl font-bold tracking-tight">{formatNumber(item.value)}</div>
                  <div className="mt-1 text-xs opacity-80">{item.hint}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: '1.05fr 0.95fr' }}>
              <div style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>队列走势</div>
                    <h3 style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>Pending / Retryable / Dead Letter</h3>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-theme-border bg-theme-elevated px-3 py-1 text-[11px] font-bold text-theme-text-muted">
                    <BarChart3 size={12} />
                    客户端历史
                  </span>
                </div>
                <div style={{ marginTop: '16px', height: '288px' }}>
                  {stateEventInboxViewModel.timeSeries.length ? (
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
                      <LineChart data={stateEventInboxViewModel.timeSeries} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
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
                    <EmptyCard text="开启自动刷新后，这里会持续显示 stateEventInbox 队列走势。" />
                  )}
                </div>
              </div>

              <div style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>收口时延</div>
                <h3 style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>事件老化 / 平均耗时</h3>
                <div style={{ marginTop: '16px', height: '288px' }}>
                  {stateEventInboxViewModel.timeSeries.length ? (
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
                      <LineChart data={stateEventInboxViewModel.timeSeries} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                        <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#64748b' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                        <Tooltip formatter={(value: number) => formatSeconds(Number(value))} />
                        <Line type="monotone" dataKey="oldestPendingAge" stroke="#f59e0b" strokeWidth={2.4} dot={false} />
                        <Line type="monotone" dataKey="eventAvgLagSeconds" stroke="#0f766e" strokeWidth={2.2} dot={false} />
                        <Line type="monotone" dataKey="stateEventInboxAvgDurationSeconds" stroke="#7c3aed" strokeWidth={2.2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyCard text="这里会观察最老 pending 事件年龄、平均收口延迟和 stateEventInbox 平均处理耗时。" />
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <div style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>即时状态</div>
                <h3 style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>队列快照与处理均值</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {stateEventInboxViewModel.healthSummary.map((item) => (
                    <div key={item.label} style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '12px 16px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>{item.label}</div>
                      <div className={`mt-2 text-2xl font-bold ${item.tone}`}>{item.value}</div>
                      <div style={{ marginTop: '4px', fontSize: '12px', color: LK.muted }}>{item.hint}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>Queue Depth</div>
                    <div className="mt-3 h-48">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
                        <BarChart data={stateEventInboxViewModel.queueBarData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                          <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                          <Tooltip formatter={(value: number) => formatMetricValue(Number(value))} />
                          <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                            {stateEventInboxViewModel.queueBarData.map((entry) => (
                              <Cell key={entry.name} fill={entry.tone} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>Oldest Age</div>
                    <div className="mt-3 h-48">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
                        <BarChart data={stateEventInboxViewModel.ageBarData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                          <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                          <Tooltip formatter={(value: number) => formatSeconds(Number(value))} />
                          <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                            {stateEventInboxViewModel.ageBarData.map((entry) => (
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
                <StateEventInboxMetricList title="StateEventInbox Runs" items={stateEventInboxViewModel.stateEventInboxRuns} emptyText="暂无 stateEventInbox 运行统计。" />
                <StateEventInboxMetricList title="StateEventInbox Event Result" items={stateEventInboxViewModel.stateEventInboxEventResults} emptyText="暂无事件应用结果。" />
                <StateEventInboxMetricList title="Dead Letters" items={stateEventInboxViewModel.deadLetters} emptyText="当前没有死信事件。" />
                <StateEventInboxMetricList title="Task State Lock / File Writes" items={[...stateEventInboxViewModel.activeLocks, ...stateEventInboxViewModel.fileWriteResults].slice(0, 8)} emptyText="暂无锁和文件落盘统计。" />
              </div>
            </div>
          </section>
        ) : (
          <section style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '48px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: '14px', color: LK.muted }}>StateEventInbox 指标还没有准备好，请刷新后重试。</p>
          </section>
        )
      ) : activeSecondaryTab === 'agent' ? (
        agentObservabilityEnabled ? (
          <div className="space-y-4">
 <section className="rounded-xl border border-cyan-500/20 bg-theme-surface p-5">
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-400">
                    {activeServiceKey === 'dataflow-analysis' ? 'DFA Agent Runtime' : activeServiceKey === 'entry-analysis' ? 'Entry Agent Runtime' : 'System Agent Runtime'}
                  </div>
                  <h2 style={{ marginTop: '8px', fontSize: '24px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>按 Worker Pod 展开的智能体运行面板</h2>
                  <p style={{ marginTop: '8px', maxWidth: '48rem', fontSize: '14px', color: LK.inkSoft }}>
                    这里直接消费 worker 公共智能体运行层的聚合快照，不再复用旧的进程/会话聚合表。重点看每个 Pod 里实际活着的智能体进程、任务归属，以及已确认孤儿和疑似孤儿。
                  </p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => void loadAgentObservability(activeServiceKey)}
                    className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-theme-surface px-3 py-2 text-sm font-bold text-cyan-400 hover:bg-cyan-500/15"
                  >
                    <RefreshCw size={14} />
                    刷新概览
                  </button>
                  <button
                    type="button"
                    onClick={() => void ensureAgentPodsLoaded(activeServiceKey)}
                    className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated"
                  >
                    <Loader2 size={14} className={agentState.podsLoading ? 'animate-spin' : ''} />
                    {agentState.podsLoaded ? '刷新 Pod 列表' : '加载 Pod 列表'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void killAllOrphans()}
                    disabled={(agentState.runtimeSummary?.killable_residual_processes || 0) <= 0}
                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold ${
                      (agentState.runtimeSummary?.killable_residual_processes || 0) > 0
                        ? 'border-rose-500/20 bg-rose-500/15 text-rose-400 hover:bg-rose-500/15'
                        : 'border-theme-border bg-theme-elevated text-theme-text-muted'
                    }`}
                  >
                    <ShieldAlert size={14} />
                    批量终止残留进程
                  </button>
                  <button
                    type="button"
                    onClick={() => void killAllSuspectedOrphans()}
                    disabled={(agentState.runtimeSummary?.killable_unknown_processes || 0) <= 0}
                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold ${
                      (agentState.runtimeSummary?.killable_unknown_processes || 0) > 0
                        ? 'border-amber-500/20 bg-amber-500/15 text-amber-400 hover:bg-amber-500/15'
                        : 'border-theme-border bg-theme-elevated text-theme-text-muted'
                    }`}
                  >
                    <TimerReset size={14} />
                    批量终止未归属进程
                  </button>
                </div>
              </div>

              <div className="mt-3 text-xs text-theme-text-muted">
                默认仅拉取`summary`。Pod 列表需要手工加载；进程和任务明细会在展开 Pod、使用明细筛选或加载 Pod 列表后再按需获取。
              </div>

              {agentState.error ? (
                <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-400">
                  {agentState.error}
                </div>
              ) : null}

              {unifiedAgentRuntimeViewModel?.aggregatePartial ? (
                <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/15 px-4 py-3 text-sm text-amber-300">
                  <div className="font-semibold">{unifiedAgentRuntimeViewModel?.aggregateAllSourcesFailed ? '全部 Worker Pod 观测失败' : '部分 Pod 观测失败'}</div>
                  <div className="mt-1">
                    本次聚合仅覆盖 {formatNumber(unifiedAgentRuntimeViewModel?.aggregateSources)} 个来源，失败目标 {formatNumber(unifiedAgentRuntimeViewModel?.aggregateFailedTargetCount)} 个。
                    {unifiedAgentRuntimeViewModel?.aggregateAllSourcesFailed ? ' 当前展示的是失败态，而不是“真实 0 进程”。' : ' 页面仍会展示已成功返回的 Pod 数据。'}
                  </div>
                  {unifiedAgentRuntimeViewModel?.aggregateFanoutErrors ? (
                    <div className="mt-2 text-xs text-amber-400">fanout errors: {formatNumber(unifiedAgentRuntimeViewModel?.aggregateFanoutErrors)}</div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                {[
                  { label: 'Worker Pods', value: formatNumber(unifiedAgentRuntimeViewModel?.totalPods), hint:`healthy ${formatNumber(unifiedAgentRuntimeViewModel?.healthyPods)} / scanned ${formatTime((unifiedAgentRuntimeViewModel?.scannedAt ?? agentState.refreshedAt) ?? null)}`, tone: 'text-theme-text-primary' },
                  { label: '总槽位 / 占用', value:`${formatNumber(unifiedAgentRuntimeViewModel?.totalCapacity)} / ${formatNumber(unifiedAgentRuntimeViewModel?.busySlots)}`, hint:`空闲 ${formatNumber(unifiedAgentRuntimeViewModel?.availableSlots)} / 排队 ${formatNumber(unifiedAgentRuntimeViewModel?.queuedJobs)}`, tone: 'text-sky-400' },
                  { label: '智能体进程总数', value: formatNumber(unifiedAgentRuntimeViewModel?.totalProcesses), hint:`正常 ${formatNumber(unifiedAgentRuntimeViewModel?.trackedProcesses)} / 任务 ${formatNumber(unifiedAgentRuntimeViewModel?.ownedTasks)}`, tone: 'text-cyan-400' },
                  { label: '残留进程', value: formatNumber(unifiedAgentRuntimeViewModel?.residualProcesses), hint:`运行中任务 ${formatNumber(unifiedAgentRuntimeViewModel?.runningTasks)}`, tone: 'text-rose-400' },
                  { label: '未归属进程', value: formatNumber(unifiedAgentRuntimeViewModel?.unknownProcesses), hint:`Pod 并集 ${formatNumber(unifiedAgentRuntimeViewModel?.totalPods)}`, tone: 'text-amber-400' },
                  { label: '智能体上限 / 占用', value:`${formatNumber(unifiedAgentRuntimeViewModel?.agentTotalCapacity)} / ${formatNumber(unifiedAgentRuntimeViewModel?.agentInUse)}`, hint:`等待 ${formatNumber(unifiedAgentRuntimeViewModel?.agentWaitingRequests)} / RSS ${formatBytes(unifiedAgentRuntimeViewModel?.agentRssTotalBytes || 0)}`, tone: 'text-violet-400' },
                  { label: 'Pod 缺口', value:`${formatNumber(unifiedAgentRuntimeViewModel?.slotOnlyPods)} / ${formatNumber(unifiedAgentRuntimeViewModel?.agentOnlyPods)}`, hint: 'slot_only / agent_only', tone: (Number(unifiedAgentRuntimeViewModel?.slotOnlyPods || 0) + Number(unifiedAgentRuntimeViewModel?.agentOnlyPods || 0)) > 0 ? 'text-amber-400' : 'text-emerald-400' },
                ].map((item) => (
 <div key={item.label} className="rounded-2xl border border-cyan-500/20 bg-theme-surface px-4 py-3">
                    <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.16em', color: LK.muted }}>{item.label}</div>
                    <div className={`mt-2 text-2xl font-bold ${item.tone}`}>{item.value}</div>
                    <div style={{ marginTop: '4px', fontSize: '12px', color: LK.muted }}>{item.hint}</div>
                  </div>
                ))}
              </div>
            </section>

            <section style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '20px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>本地过滤</div>
                  <h3 style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>按 Pod / 任务 / PID / 归属筛选</h3>
                </div>
                <div className="text-xs text-theme-text-muted">
                  每个 worker Pod 独立成表，只展示真实智能体进程，再反查关联任务
                </div>
              </div>
              <div style={{ marginTop: '16px', display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ pointerEvents: 'none', position: 'absolute', left: '12px', top: '10px', color: LK.muted }} />
                  <input value={dfaAgentPodKeyword} onChange={(event) => setDfaAgentPodKeyword(event.target.value)} placeholder="筛选 Pod 名 / worker_id" className="form-input w-full" />
                </div>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ pointerEvents: 'none', position: 'absolute', left: '12px', top: '10px', color: LK.muted }} />
                  <input value={dfaAgentTaskKeyword} onChange={(event) => setDfaAgentTaskKeyword(event.target.value)} placeholder="筛选 task id / task name" className="form-input w-full" />
                </div>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ pointerEvents: 'none', position: 'absolute', left: '12px', top: '10px', color: LK.muted }} />
                  <input value={dfaAgentPidKeyword} onChange={(event) => setDfaAgentPidKeyword(event.target.value)} placeholder="筛选 PID / PGID / PPID" className="form-input w-full" />
                </div>
                <select value={dfaAgentOwnerFilter} onChange={(event) => setDfaAgentOwnerFilter(event.target.value as 'all' | 'tracked' | 'residual' | 'unknown' | 'suspected_orphan')} style={{ borderRadius: '8px', border: `1px solid ${LK.border}`, padding: '8px 12px', fontSize: '14px', color: LK.inkSoft }}>
                  <option value="all">全部归属</option>
                  <option value="tracked">正常进程</option>
                  <option value="residual">残留进程</option>
                  <option value="suspected_orphan">疑似孤儿</option>
                  <option value="unknown">未归属进程</option>
                </select>
                <select value={dfaAgentRoleFilter} onChange={(event) => setDfaAgentRoleFilter(event.target.value)} style={{ borderRadius: '8px', border: `1px solid ${LK.border}`, padding: '8px 12px', fontSize: '14px', color: LK.inkSoft }}>
                  <option value="all">全部角色</option>
                  {dfaAgentRoleOptions.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>
              {requiresAgentDetailFiltering && !agentState.podsLoaded ? (
                <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/15 px-4 py-3 text-xs text-amber-300">
                  当前过滤条件依赖 Pod/进程明细，页面会先自动拉取 Pod 列表，再按需补拉对应 Pod 的进程和任务数据。
                </div>
              ) : null}
            </section>

            <section className="space-y-3">
              {agentState.loading && !agentState.refreshedAt ? (
                <section style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '48px 24px', textAlign: 'center' }}>
                  <Loader2 className="mx-auto animate-spin text-theme-text-muted" size={24} />
                  <p className="mt-4 text-sm text-theme-text-muted">
                    正在抓取{activeServiceKey === 'dataflow-analysis' ? '数据流分析' : activeServiceKey === 'entry-analysis' ? '入口分析' : '系统分析'} worker Pod 智能体概览...
                  </p>
                </section>
              ) : !agentState.podsLoaded ? (
 <section className="rounded-xl border border-dashed border-theme-border bg-theme-surface px-6 py-12 text-center">
                  <p style={{ fontSize: '14px', color: LK.muted }}>当前只加载了聚合概览。点击“加载 Pod 列表”后再查看各 Worker Pod 详情。</p>
                </section>
              ) : filteredDfaPods.length ? (
                filteredDfaPods.map((pod) => {
                  return (
 <section key={pod.pod_name} className={`rounded-[1.8rem] border ${pod.healthy ? 'border-theme-border bg-theme-elevated' : 'border-rose-500/20 bg-rose-500/10'}`}>
                      <button
                        type="button"
                        onClick={() => openAgentPodDialog(activeServiceKey, pod.pod_name)}
                        className="flex w-full flex-wrap items-start justify-between gap-4 px-5 py-4 text-left"
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                            <div className="text-base font-semibold text-theme-text-primary">{pod.pod_name}</div>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${pod.healthy ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                              {pod.healthy ? 'healthy' : 'partial/unhealthy'}
                            </span>
                            <span style={{ borderRadius: '9999px', backgroundColor: LK.surfaceRaised, padding: '2px 8px', fontSize: '10px', fontWeight: 600, color: LK.body }}>
                              worker {pod.worker_id || '-'}
                            </span>
                            {pod.mismatch !== 'none' ? (
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${pod.mismatch === 'slot_only' ? 'bg-amber-500/15 text-amber-400' : 'bg-violet-500/15 text-violet-400'}`}>
                                {pod.mismatch === 'slot_only' ? 'slot_only' : 'agent_only'}
                              </span>
                            ) : null}
                          </div>
                          <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '12px', color: LK.muted }}>
                            <span>槽位 {formatNumber(pod.running_jobs)}/{formatNumber(pod.max_concurrent_jobs)}</span>
                            <span>空闲 {formatNumber(pod.available_slots)}</span>
                            <span>排队 {formatNumber(pod.queued_jobs)}</span>
                            <span>智能体 {formatNumber(pod.agent_process_in_use)}/{formatNumber(pod.agent_process_limit)}</span>
                            <span>进程 {formatNumber(pod.process_count)}</span>
                            <span>正常进程 {formatNumber(pod.tracked_process_count)}</span>
                            <span className="text-rose-400">残留进程 {formatNumber(pod.residual_process_count)}</span>
                            <span className="text-amber-400">未归属进程 {formatNumber(pod.unknown_process_count)}</span>
                            <span>任务 {formatNumber(pod.running_task_count)}/{formatNumber(pod.task_count)}</span>
                            <span>扫描 {pod.last_scanned_at ? formatTime(new Date(pod.last_scanned_at).getTime()) : '-'}</span>
                          </div>
                          {pod.scan_errors ? (
                            <div style={{ marginTop: '8px', fontSize: '12px', color: LK.error }}>scan errors: {formatNumber(pod.scan_errors)}</div>
                          ) : null}
                          {pod.error ? (
                            <div style={{ marginTop: '8px', fontSize: '12px', color: LK.error }}>{pod.error}</div>
                          ) : null}
                        </div>
                        <div className="rounded-full border border-theme-border bg-theme-elevated px-3 py-1 text-xs font-bold text-theme-text-secondary">
                          查看详情
                        </div>
                      </button>
                    </section>
                  );
                })
              ) : (
                <section style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '48px 24px', textAlign: 'center' }}>
                  <p style={{ fontSize: '14px', color: LK.muted }}>当前没有匹配过滤条件的 worker Pod 运行态。</p>
                </section>
              )}
            </section>
            {agentKillHistory.length ? (
              <section style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>最近处置</div>
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {agentKillHistory.map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-xs text-theme-text-secondary">
                      <div className="font-bold text-theme-text-primary">{entry.scope}</div>
                      <div className="mt-1">requested {entry.response.requested} / matched {entry.response.matched} / ok {entry.response.succeeded} / failed {entry.response.failed} / skipped {entry.response.skipped}</div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            {activeAgentPodDialog && activeAgentPodCard ? (
              <div
                className="fixed inset-0 z-[320] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
                onClick={closeAgentPodDialog}
              >
                <div
 className="relative flex max-h-[92vh] w-[min(96vw,1720px)] flex-col overflow-hidden rounded-xl border border-theme-border bg-theme-surface"
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={closeAgentPodDialog}
 className="absolute right-4 top-4 z-10 rounded-full border border-theme-border bg-theme-elevated p-2 text-theme-text-muted transition hover:bg-theme-elevated hover:text-theme-text-primary"
                    title="关闭"
                    aria-label="关闭"
                  >
                    <X size={18} />
                  </button>
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-theme-border px-6 py-5">
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                        <div className="text-xl font-semibold tracking-tight text-theme-text-primary">{activeAgentPodCard.pod_name}</div>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${activeAgentPodCard.healthy ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                          {activeAgentPodCard.healthy ? 'healthy' : 'partial/unhealthy'}
                        </span>
                        <span className="rounded-full bg-theme-elevated px-2.5 py-1 text-[11px] font-bold text-theme-text-secondary">
                          {activeService.serviceName}
                        </span>
                        <span className="rounded-full bg-theme-elevated px-2.5 py-1 text-[11px] font-bold text-theme-text-secondary">
                          worker {activeAgentPodCard.worker_id || '-'}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-theme-text-muted">
                        <span>槽位 {formatNumber(activeAgentPodCard.running_jobs)}/{formatNumber(activeAgentPodCard.max_concurrent_jobs)}</span>
                        <span>空闲 {formatNumber(activeAgentPodCard.available_slots)}</span>
                        <span>排队 {formatNumber(activeAgentPodCard.queued_jobs)}</span>
                        <span>智能体 {formatNumber(activeAgentPodCard.agent_process_in_use)}/{formatNumber(activeAgentPodCard.agent_process_limit)}</span>
                        <span>进程 {formatNumber(activeAgentPodCard.process_count)}</span>
                        <span>任务 {formatNumber(activeAgentPodCard.running_task_count)}/{formatNumber(activeAgentPodCard.task_count)}</span>
                        <span>扫描 {activeAgentPodCard.last_scanned_at ? formatTime(new Date(activeAgentPodCard.last_scanned_at).getTime()) : '-'}</span>
                      </div>
                      {activeAgentPodCard.error ? (
                        <div style={{ marginTop: '8px', fontSize: '12px', color: LK.error }}>{activeAgentPodCard.error}</div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => toggleAllAgentProcessSelection(!allKillableSelectedForActivePod)}
                        disabled={activeAgentPodKillablePids.length === 0}
                        className={`rounded-xl border px-4 py-2 text-sm font-bold ${
                          activeAgentPodKillablePids.length
                            ? 'border-theme-border bg-theme-elevated text-theme-text-secondary hover:bg-theme-elevated'
                            : 'border-theme-border bg-theme-elevated text-theme-text-muted'
                        }`}
                      >
                        {allKillableSelectedForActivePod ? '取消全选可终止进程' : '全选可终止进程'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void killSelectedOrphans()}
                        disabled={selectedKillablePidsForActivePod.length === 0}
                        className={`rounded-xl border px-4 py-2 text-sm font-bold ${
                          selectedKillablePidsForActivePod.length
                            ? 'border-rose-500/20 bg-rose-500/15 text-rose-400 hover:bg-rose-500/15'
                            : 'border-theme-border bg-theme-elevated text-theme-text-muted'
                        }`}
                      >
                        终止选中进程（{selectedKillablePidsForActivePod.length}）
                      </button>
                      <button
                        type="button"
                        onClick={closeAgentPodDialog}
                        className="rounded-xl border border-theme-border bg-theme-surface px-4 py-2 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated"
                      >
                        关闭
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
                    {!activeAgentPodDetail?.loading && !activeAgentPodDetail?.loaded && !activeAgentPodDetail?.error ? (
                      <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4 text-sm text-theme-text-muted">
                        当前 Pod 已保留在槽位/智能体并集视图中，进程与任务明细尚未加载。
                      </div>
                    ) : null}
                    {activeAgentPodDetail?.loading ? (
                      <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4 text-sm text-theme-text-muted">
                        正在加载该 Pod 的进程与任务明细...
                      </div>
                    ) : null}
                    {activeAgentPodDetail?.error ? (
                      <div className="rounded-2xl border border-rose-500/20 bg-rose-500/15 px-4 py-4 text-sm text-rose-400">
                        {activeAgentPodDetail.error}
                      </div>
                    ) : null}

                    <section className="rounded-[1.8rem] border border-theme-border bg-theme-elevated p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>关联任务</div>
                          <h4 style={{ marginTop: '8px', fontSize: '18px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>Task Ownership</h4>
                        </div>
                        <div className="text-xs font-semibold text-theme-text-muted">共 {formatNumber(activeAgentPodTasks.length)} 条</div>
                      </div>
                      <div className="mt-4 overflow-auto rounded-2xl border border-theme-border bg-theme-surface">
                        <table className="min-w-[980px] divide-y divide-theme-border text-left text-xs">
                          <thead style={{ backgroundColor: LK.surfaceRaised, color: LK.muted }}>
                            <tr>
                              <th className="px-3 py-3">任务</th>
                              <th className="px-3 py-3">状态</th>
                              <th className="px-3 py-3">归属</th>
                              <th className="px-3 py-3">阶段</th>
                              <th className="px-3 py-3">角色</th>
                              <th className="px-3 py-3">关联进程</th>
                            </tr>
                          </thead>
                          <tbody style={{ display: 'flex', flexDirection: 'column', borderBottom:`1px solid ${LK.borderSoft}`, backgroundColor: LK.surface }}>
                            {activeAgentPodTasks.length ? (
                              activeAgentPodTasks.map((task) => (
                                <tr key={`${activeAgentPodCard.pod_name}:${task.task_id}:${task.stage_key || '-'}`} style={{ cursor: 'pointer', transition: 'background-color 0.15s' }}>
                                  <td className="px-3 py-3 align-top">
                                    <button
                                      type="button"
                                      onClick={() => window.dispatchEvent(new CustomEvent('chimera-navigate-view', {
                                        detail: activeServiceKey === 'dataflow-analysis'
                                          ? { view: 'dataflow-analysis-detail', dataflowAnalysisTaskId: task.task_id }
                                          : activeServiceKey === 'entry-analysis'
                                            ? { view: 'entry-analysis-detail', entryAnalysisTaskId: task.task_id }
                                            : { view: 'system-analysis-detail', systemAnalysisTaskId: task.task_id },
                                      }))}
                                      className="max-w-[20rem] truncate text-left font-semibold text-cyan-400 hover:text-cyan-300"
                                      title={task.task_name || task.task_id}
                                    >
                                      {task.task_name || task.task_id}
                                    </button>
                                    <div className="mt-1 font-mono text-[10px] text-theme-text-muted">{task.task_id}</div>
                                  </td>
                                  <td className="px-3 py-3 text-theme-text-secondary">{task.task_status || '-'}</td>
                                  <td className="px-3 py-3">
                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                      task.ownership_status === 'tracked'
                                        ? 'bg-emerald-500/15 text-emerald-400'
                                        : task.ownership_status === 'residual'
                                          ? 'bg-rose-500/15 text-rose-400'
                                          : 'bg-amber-500/15 text-amber-400'
                                    }`}>
                                      {task.ownership_status === 'tracked' ? '运行中任务' : task.ownership_status === 'residual' ? '残留任务' : '未归属'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-3 text-theme-text-secondary">{task.stage_key || '-'}</td>
                                  <td className="px-3 py-3 text-theme-text-secondary">{asArray(task.agent_roles).join(', ') || '-'}</td>
                                  <td style={{ padding: '12px', fontFamily: MONO, fontSize: '11px', color: LK.inkSoft }}>{asArray(task.process_pids).join(', ') || '-'}</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={6} className="px-4 py-8 text-center text-sm text-theme-text-muted">
                                  当前 Pod 没有匹配过滤条件的关联任务。
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>

                    <section className="rounded-[1.8rem] border border-theme-border bg-theme-elevated p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>智能体进程</div>
                          <h4 style={{ marginTop: '8px', fontSize: '18px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>Processes</h4>
                        </div>
                        <div className="text-xs font-semibold text-theme-text-muted">
                          共 {formatNumber(activeAgentPodProcesses.length)} 条，可终止 {formatNumber(activeAgentPodKillablePids.length)} 条
                        </div>
                      </div>
                      <div className="mt-4 overflow-auto rounded-2xl border border-theme-border bg-theme-surface">
                        <table className="min-w-[1480px] divide-y divide-theme-border text-left text-xs">
                          <thead style={{ backgroundColor: LK.surfaceRaised, color: LK.muted }}>
                            <tr>
                              <th className="px-3 py-3">
                                <input
                                  type="checkbox"
                                  checked={allKillableSelectedForActivePod}
                                  onChange={(event) => toggleAllAgentProcessSelection(event.target.checked)}
                                  disabled={activeAgentPodKillablePids.length === 0}
                                  className="h-4 w-4 rounded border-theme-border text-rose-400 focus:ring-rose-500"
                                />
                              </th>
                              <th className="px-3 py-3">PID / PGID</th>
                              <th className="px-3 py-3">角色</th>
                              <th className="px-3 py-3">任务</th>
                              <th className="px-3 py-3">阶段</th>
                              <th className="px-3 py-3">所属判定</th>
                              <th className="px-3 py-3">原因</th>
                              <th className="px-3 py-3">RSS</th>
                              <th className="px-3 py-3">CWD / Workspace</th>
                              <th className="px-3 py-3">命令</th>
                              <th className="px-3 py-3">操作</th>
                            </tr>
                          </thead>
                          <tbody style={{ display: 'flex', flexDirection: 'column', borderBottom:`1px solid ${LK.borderSoft}`, backgroundColor: LK.surface }}>
                            {activeAgentPodProcesses.length ? (
                              activeAgentPodProcesses.map((process) => (
                                <tr key={`${activeAgentPodCard.pod_name}:${process.pid}`} style={{ cursor: 'pointer', transition: 'background-color 0.15s' }}>
                                  <td className="px-3 py-3 align-top">
                                    <input
                                      type="checkbox"
                                      checked={selectedAgentPids.includes(process.pid)}
                                      onChange={(event) => toggleAgentProcessSelection(process.pid, event.target.checked)}
                                      disabled={!process.kill_allowed}
                                      className="h-4 w-4 rounded border-theme-border text-rose-400 focus:ring-rose-500"
                                    />
                                  </td>
                                  <td style={{ padding: '12px', fontFamily: MONO, fontSize: '11px', color: LK.inkSoft }}>
                                    <div>PID {process.pid}</div>
                                    <div className="text-theme-text-muted">PGID {process.pgid ?? '-'} / PPID {process.ppid ?? '-'}</div>
                                  </td>
                                  <td className="px-3 py-3">
                                    <div className="font-semibold text-theme-text-secondary">{process.runtime_kind || '-'}</div>
                                    <div style={{ marginTop: '4px', fontSize: '10px', color: LK.muted }}>{process.role_kind || '-'}</div>
                                  </td>
                                  <td className="px-3 py-3 align-top">
                                    {process.task_id ? (
                                      <button
                                        type="button"
                                        onClick={() => window.dispatchEvent(new CustomEvent('chimera-navigate-view', {
                                          detail: activeServiceKey === 'dataflow-analysis'
                                            ? { view: 'dataflow-analysis-detail', dataflowAnalysisTaskId: process.task_id }
                                            : activeServiceKey === 'entry-analysis'
                                              ? { view: 'entry-analysis-detail', entryAnalysisTaskId: process.task_id }
                                              : { view: 'system-analysis-detail', systemAnalysisTaskId: process.task_id },
                                        }))}
                                        className="max-w-[16rem] truncate text-left font-semibold text-cyan-400 hover:text-cyan-300"
                                        title={process.task_name || process.task_id}
                                      >
                                        {process.task_name || process.task_id}
                                      </button>
                                    ) : (
                                      <span className="text-theme-text-muted">未关联任务</span>
                                    )}
                                    <div className="mt-1 font-mono text-[10px] text-theme-text-muted">{process.task_id || '-'}</div>
                                  </td>
                                  <td className="px-3 py-3">
                                    <div className="text-theme-text-secondary">{process.task_status || '-'}</div>
                                    <div style={{ marginTop: '4px', fontSize: '10px', color: LK.muted }}>{process.stage_key || '-'}</div>
                                  </td>
                                  <td className="px-3 py-3">
                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${resolveAgentOwnerKindBadge(process.owner_kind)}`}>
                                      {resolveAgentOwnerKindLabel(process.owner_kind)}
                                    </span>
                                  </td>
                                  <td className="px-3 py-3 text-[11px] text-theme-text-muted">
                                    <div>{process.owner_reason || '-'}</div>
                                    {process.kill_block_reason ? <div style={{ marginTop: '4px', fontSize: '10px', color: LK.muted }}>{process.kill_block_reason}</div> : null}
                                  </td>
                                  <td style={{ padding: '12px', fontFamily: MONO, fontSize: '11px', color: LK.inkSoft }}>{formatBytes(process.rss_bytes)}</td>
                                  <td className="px-3 py-3 align-top text-[11px] text-theme-text-muted">
                                    <div className="max-w-[22rem] break-all">{process.cwd || '-'}</div>
                                    {process.workspace_root ? <div className="mt-1 max-w-[22rem] break-all text-theme-text-muted">workspace: {process.workspace_root}</div> : null}
                                    {process.match_source || process.match_confidence ? <div style={{ marginTop: '4px', fontSize: '10px', color: LK.muted }}>match: {process.match_source || '-'} / {process.match_confidence || '-'}</div> : null}
                                  </td>
                                  <td className="px-3 py-3 align-top text-[11px] text-theme-text-muted">
                                    <div className="max-w-[26rem] break-all font-mono">{process.command || '-'}</div>
                                  </td>
                                  <td className="px-3 py-3">
                                    <button
                                      type="button"
                                      onClick={() => void killSingleOrphan(process)}
                                      disabled={!process.kill_allowed}
                                      className={`rounded-lg border px-3 py-1.5 text-[11px] font-bold ${
                                        process.kill_allowed
                                          ? process.owner_kind === 'suspected_orphan' || process.owner_kind === 'unknown'
                                            ? 'border-amber-500/20 bg-amber-500/15 text-amber-400 hover:bg-amber-500/15'
                                            : 'border-rose-500/20 bg-rose-500/15 text-rose-400 hover:bg-rose-500/15'
                                          : 'border-theme-border bg-theme-elevated text-theme-text-muted'
                                      }`}
                                      title={process.kill_allowed ? undefined : process.kill_block_reason || '当前进程不满足终止条件'}
                                    >
                                      终止
                                    </button>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={11} className="px-4 py-8 text-center text-sm text-theme-text-muted">
                                  当前 Pod 没有匹配过滤条件的进程。
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <section style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '48px 24px', textAlign: 'center' }}>
            <div className="mx-auto max-w-2xl">
              <h2 style={{ marginTop: '8px', fontSize: '24px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>当前服务未接入智能体观测</h2>
              <p className="mt-3 text-sm text-theme-text-muted">`智能体` Tab 当前仅对入口分析、系统分析和数据流分析开放。其他服务继续使用`AI专区` 查看 AI 指标。
              </p>
            </div>
          </section>
        )
      ) : (
        <>
          <section style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '24px' }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fuchsia-500">AI/智能体</div>
                <h2 style={{ marginTop: '8px', fontSize: '24px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>AI专区</h2>
                <p className="mt-2 max-w-3xl text-sm text-theme-text-muted">{effectiveAiViewModel.coverageText}</p>
              </div>
              <div className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${AI_COVERAGE_BADGE[effectiveAiViewModel.coverage]}`}>
                {effectiveAiViewModel.coverageLabel}
              </div>
            </div>
          </section>

          {effectiveAiViewModel.rows.length === 0 ? (
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
                    {effectiveAiViewModel.cards.map((item) => (
                      <MetricCard key={item.label} label={item.label} value={item.value} icon={item.icon} />
                    ))}
                  </section>

                  <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                    <div style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '20px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>埋点覆盖</div>
                      <h3 style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>AI 指标摘要</h3>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
                          <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>识别到的 AI 指标族</div>
                          <div className="mt-3 text-3xl font-bold text-theme-text-primary">{formatNumber(effectiveAiViewModel.familyCount)}</div>
                        </div>
                        <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
                          <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>Canonical 契约</div>
                          <div className="mt-3 text-base font-semibold text-theme-text-primary">{effectiveAiViewModel.coverageLabel}</div>
                        </div>
                      </div>
                      <div className="mt-4 rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
                        <div className="text-sm font-bold text-theme-text-primary">已识别 canonical 维度</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {BINARY_SECURITY_CANONICAL_AI_METRICS.map((item) => {
                            const hit = effectiveAiViewModel.rows.some((row) => row.name.includes(item.key.replace(/-/gu, '_')) || (row.help || '').includes(item.label));
                            return (
                              <span key={item.key} className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${hit ? 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400' : 'border-theme-border bg-theme-elevated text-theme-text-muted'}`}>
                                {item.label}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '20px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>角色分布</div>
                      <h3 style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>AI 角色分布图</h3>
                      <div style={{ marginTop: '16px', height: '288px' }}>
                        {effectiveAiViewModel.roleChart.length ? (
                          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
                            <BarChart data={effectiveAiViewModel.roleChart} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
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

                  <section style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '20px' }}>
                    <h3 style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>AI Token/Cost 图</h3>
                    <div style={{ marginTop: '16px', height: '288px' }}>
                      {effectiveAiViewModel.tokenChart.length ? (
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
                          <BarChart data={effectiveAiViewModel.tokenChart} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
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

              <section style={{ borderRadius: '12px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '20px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: LK.muted }}>AI 指标表</div>
                    <h3 style={{ marginTop: '8px', fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em', color: LK.ink }}>AI/智能体指标明细</h3>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ position: 'relative' }}>
                      <Search size={14} style={{ pointerEvents: 'none', position: 'absolute', left: '12px', top: '10px', color: LK.muted }} />
                      <input value={aiSearchKeyword} onChange={(event) => setAiSearchKeyword(event.target.value)} placeholder="搜索 AI 指标名 / labels / help" className="form-input" />
                    </div>
                    <select value={aiRoleFilter} onChange={(event) => setAiRoleFilter(event.target.value)} style={{ borderRadius: '8px', border: `1px solid ${LK.border}`, padding: '8px 12px', fontSize: '14px', color: LK.inkSoft }}>
                      <option value="all">全部角色/类型</option>
                      {aiRoles.map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ marginTop: '16px', overflow: 'auto', borderRadius: '12px', border: `1px solid ${LK.border}` }}>
                  <table className="min-w-full divide-y divide-theme-border text-left text-xs">
                    <thead style={{ backgroundColor: LK.surfaceRaised, color: LK.muted }}>
                      <tr>
                        <th className="px-3 py-3">指标名</th>
                        <th className="px-3 py-3">Labels</th>
                        <th className="px-3 py-3">Value</th>
                        <th className="px-3 py-3">Type</th>
                      </tr>
                    </thead>
                    <tbody style={{ display: 'flex', flexDirection: 'column', borderBottom:`1px solid ${LK.borderSoft}`, backgroundColor: LK.surface }}>
                      {aiRows.map((row) => (
                        <tr key={`${row.name}:${row.labelText}`} style={{ cursor: 'pointer', transition: 'background-color 0.15s' }}>
                          <td className="px-3 py-3 align-top">
                            <div className="font-mono text-[11px] font-bold text-theme-text-primary">{row.name}</div>
                            {row.help ? <div className="mt-1 max-w-[34rem] text-[11px] text-theme-text-muted">{row.help}</div> : null}
                          </td>
                          <td className="px-3 py-3 font-mono text-[11px] text-theme-text-secondary">{row.labelText}</td>
                          <td className="px-3 py-3 font-mono text-[11px] font-semibold text-theme-text-primary">{formatMetricValue(row.value)}</td>
                          <td className="px-3 py-3 uppercase text-theme-text-secondary">{row.type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {aiRows.length === 0 ? <div className="px-4 py-10 text-center text-sm text-theme-text-muted">没有符合过滤条件的 AI 指标</div> : null}
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
};

export { BinarySecurityMetricsDashboardPage };
export default BinarySecurityMetricsDashboardPage;
