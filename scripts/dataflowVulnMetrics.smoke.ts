import assert from 'node:assert/strict';

import {
  buildDataflowVulnAiViewModel,
  buildDataflowVulnOverviewViewModel,
  matchesDataflowVulnSampleScope,
} from '../pages/execution/binarySecurityMetricsDataflowVulnBuilders.ts';

type MetricRow = {
  name: string;
  labels: Record<string, string>;
  value: number;
};

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

const metricValueByName = (rows: MetricRow[], name: string, labels: Record<string, string> = {}) => {
  const matches = rows.filter((row) => row.name === name && Object.entries(labels).every(([key, value]) => row.labels[key] === value));
  if (!matches.length) return null;
  return matches.reduce((total, row) => total + row.value, 0);
};

const sumMetric = (rows: MetricRow[], matcher: (row: MetricRow) => boolean) => rows.filter(matcher).reduce((total, row) => total + row.value, 0);

const averageFromSummary = (rows: MetricRow[], familyName: string, labels: Record<string, string> = {}) => {
  const matchesLabels = (row: MetricRow) => Object.entries(labels).every(([key, value]) => row.labels[key] === value);
  const sum = rows.filter((row) => row.name === `${familyName}_sum` && matchesLabels(row)).reduce((total, row) => total + row.value, 0);
  const count = rows.filter((row) => row.name === `${familyName}_count` && matchesLabels(row)).reduce((total, row) => total + row.value, 0);
  return count > 0 ? sum / count : null;
};

const valueOrZero = (value: number | null | undefined) => (Number.isFinite(value || 0) ? value || 0 : 0);

const deps = {
  averageFromSummary,
  formatMetricValue,
  formatNumber,
  formatSeconds,
  metricValueByName,
  sumMetric,
  valueOrZero,
};

const rows: MetricRow[] = [
  { name: 'chimera_dataflow_run_status', labels: { status: 'running' }, value: 3 },
  { name: 'chimera_dataflow_queue_depth', labels: { kind: 'run' }, value: 2 },
  { name: 'chimera_dataflow_queue_depth', labels: { kind: 'execution' }, value: 5 },
  { name: 'chimera_dataflow_execution_dispatch_duration_seconds_sum', labels: {}, value: 60 },
  { name: 'chimera_dataflow_execution_dispatch_duration_seconds_count', labels: {}, value: 3 },
  { name: 'chimera_dataflow_execution_process_duration_seconds_sum', labels: {}, value: 5400 },
  { name: 'chimera_dataflow_execution_process_duration_seconds_count', labels: {}, value: 3 },
  { name: 'chimera_dataflow_execution_status', labels: { status: 'failed' }, value: 4 },
  { name: 'chimera_dataflow_execution_status', labels: { status: 'cancelled' }, value: 1 },
  { name: 'chimera_dataflow_execution_events_total', labels: { event: 'retry' }, value: 7 },
  { name: 'chimera_dataflow_cycle_metrics', labels: { field: 'issue_count' }, value: 9 },
  { name: 'chimera_dataflow_cycle_metrics', labels: { field: 'current_failed' }, value: 2 },
  { name: 'chimera_dataflow_cycle_metrics', labels: { field: 'historical_removed' }, value: 4 },
  { name: 'chimera_dataflow_cycle_metrics', labels: { field: 'unreviewed_new' }, value: 3 },
  { name: 'chimera_dataflow_cycle_metrics', labels: { field: 'summary_size' }, value: 2048 },
  { name: 'chimera_dataflow_cycle_metrics', labels: { field: 'supporting_docs_count' }, value: 6 },
  { name: 'chimera_dataflow_cycle_plateau_flags', labels: { flag: 'stagnant' }, value: 1 },
  { name: 'chimera_dataflow_cycle_plateau_flags', labels: { flag: 'abort' }, value: 0 },
  { name: 'chimera_dataflow_runtime_trace_total', labels: { mode: 'rpc', field: 'calls' }, value: 8 },
  { name: 'chimera_dataflow_runtime_trace_total', labels: { mode: 'rpc', field: 'attempts' }, value: 10 },
  { name: 'chimera_dataflow_runtime_trace_total', labels: { mode: 'rpc', field: 'duration_seconds' }, value: 240 },
  { name: 'chimera_dataflow_runtime_trace_total', labels: { mode: 'rpc', field: 'timeout_failures' }, value: 2 },
  { name: 'chimera_dataflow_runtime_trace_total', labels: { mode: 'rpc', field: 'stdout_truncated' }, value: 1 },
  { name: 'chimera_dataflow_runtime_trace_total', labels: { mode: 'rpc', field: 'output_bytes' }, value: 4096 },
  { name: 'chimera_dataflow_runtime_trace_total', labels: { mode: 'rpc', field: 'api_failures' }, value: 1 },
  { name: 'chimera_dataflow_runtime_trace_total', labels: { mode: 'rpc', field: 'pi_failures' }, value: 0 },
  { name: 'chimera_dataflow_ai_failure_total', labels: { category: 'runtime' }, value: 5 },
  { name: 'chimera_dataflow_ai_retry_total', labels: { reason: 'retry' }, value: 4 },
  { name: 'chimera_dataflow_run_summary_total', labels: { field: 'result_count' }, value: 10 },
  { name: 'chimera_dataflow_run_summary_total', labels: { field: 'passed_count' }, value: 7 },
  { name: 'chimera_dataflow_run_summary_total', labels: { field: 'failed_count' }, value: 3 },
  { name: 'chimera_dataflow_run_summary_total', labels: { field: 'cycles_used' }, value: 15 },
  { name: 'chimera_dataflow_ai_role_count', labels: { role: 'agent' }, value: 11 },
  { name: 'chimera_dataflow_ai_role_count', labels: { role: 'plugin' }, value: 5 },
  { name: 'chimera_dataflow_ai_round_total', labels: { kind: 'cycle' }, value: 12 },
  { name: 'chimera_dataflow_ai_round_total', labels: { kind: 'review' }, value: 5 },
  { name: 'chimera_dataflow_ai_timeout_total', labels: { scope: 'plugin' }, value: 2 },
  { name: 'chimera_dataflow_ai_review_total', labels: { result: 'partial' }, value: 5 },
  { name: 'chimera_dataflow_ai_session_total', labels: { role: 'agent' }, value: 9 },
  { name: 'chimera_dataflow_ai_token_cost_total', labels: {}, value: 12.5 },
  { name: 'chimera_dataflow_ai_token_usage_total', labels: { type: 'input' }, value: 1200 },
  { name: 'chimera_dataflow_ai_token_usage_total', labels: { type: 'output' }, value: 800 },
  { name: 'chimera_dataflow_ai_token_usage_total', labels: { type: 'cache_read' }, value: 50 },
  { name: 'chimera_dataflow_ai_token_usage_total', labels: { type: 'cache_write' }, value: 20 },
  { name: 'chimera_dataflow_ai_token_usage_total', labels: { type: 'total' }, value: 2070 },
  { name: 'chimera_dataflow_plugin_results_total', labels: { plugin: 'scanner', result: 'success' }, value: 4 },
  { name: 'chimera_dataflow_plugin_results_total', labels: { plugin: 'scanner', result: 'partial' }, value: 2 },
];

const overview = buildDataflowVulnOverviewViewModel(rows, deps);
assert.equal(overview.topCards[0]?.value, '3');
assert.equal(overview.topCards[3]?.value, '20.0s');
assert.equal(overview.topCards[4]?.value, '30.00m');
assert.equal(overview.cycleCards[0]?.value, '9');
assert.equal(overview.runtimeModes[0]?.mode, 'rpc');
assert.equal(overview.runtimeModes[0]?.avgDurationSeconds, 30);
assert.equal(overview.chartData.find((item) => item.name === 'AI 失败')?.value, 5);
assert.equal(overview.insightCards[0]?.value, '70.0%');
assert.equal(overview.insightCards[3]?.value, '1');

const ai = buildDataflowVulnAiViewModel(rows, deps);
assert.equal(ai.topCards[0]?.value, '12');
assert.equal(ai.topCards[3]?.value, '2,070');
assert.equal(ai.phaseCards[3]?.value, '1 / 0');
assert.deepEqual(
  ai.roleChart.map((item) => item.name),
  ['agent', 'plugin'],
);
assert.deepEqual(
  ai.tokenChart.map((item) => item.name),
  ['input', 'output', 'cache_read', 'cache_write'],
);
assert.equal(ai.reviewCards[0]?.label, 'scanner / success');

assert.equal(matchesDataflowVulnSampleScope({ name: 'chimera_dataflow_cycle_metrics' }, 'focus'), true);
assert.equal(matchesDataflowVulnSampleScope({ name: 'chimera_dataflow_ai_round_total' }, 'ai'), true);
assert.equal(matchesDataflowVulnSampleScope({ name: 'chimera_dataflow_plugin_results_total' }, 'plugin'), true);
assert.equal(matchesDataflowVulnSampleScope({ name: 'chimera_dataflow_runtime_trace_total' }, 'cycle'), false);

console.log('dataflowVulnMetrics smoke test passed');
