import type { DataflowVulnAiViewModel, DataflowVulnOverviewViewModel, DataflowVulnSampleScope } from './binarySecurityMetricsDataflowVuln';

type MetricRowLike = {
  name: string;
  labels: Record<string, string>;
  value: number;
};

type BuilderDeps = {
  averageFromSummary: (rows: MetricRowLike[], familyName: string, labels?: Record<string, string>) => number | null;
  formatMetricValue: (value: number) => string;
  formatNumber: (value: number | null | undefined, digits?: number) => string;
  formatSeconds: (value: number | null | undefined) => string;
  metricValueByName: (rows: MetricRowLike[], name: string, labels?: Record<string, string>) => number | null;
  sumMetric: (rows: MetricRowLike[], matcher: (row: MetricRowLike) => boolean) => number;
  valueOrZero: (value: number | null | undefined) => number;
};

export const matchesDataflowVulnSampleScope = (row: Pick<MetricRowLike, 'name'>, scope: DataflowVulnSampleScope) => {
  if (scope === 'all') return true;
  if (scope === 'cycle') return row.name.includes('chimera_dataflow_cycle_') || row.name === 'chimera_dataflow_run_summary_total' || row.name === 'chimera_dataflow_run_status';
  if (scope === 'runtime') return row.name.includes('chimera_dataflow_runtime_trace_') || row.name.includes('chimera_dataflow_token_usage_total');
  if (scope === 'ai') return row.name.includes('chimera_dataflow_ai_');
  if (scope === 'plugin') return row.name.includes('chimera_dataflow_plugin_');
  return (
    matchesDataflowVulnSampleScope(row, 'cycle') ||
    matchesDataflowVulnSampleScope(row, 'runtime') ||
    matchesDataflowVulnSampleScope(row, 'ai') ||
    matchesDataflowVulnSampleScope(row, 'plugin') ||
    row.name.includes('chimera_dataflow_execution_') ||
    row.name.includes('chimera_dataflow_queue_depth')
  );
};

export const buildDataflowVulnOverviewViewModel = (rows: MetricRowLike[], deps: BuilderDeps): DataflowVulnOverviewViewModel => {
  const { averageFromSummary, formatMetricValue, formatNumber, formatSeconds, metricValueByName, sumMetric, valueOrZero } = deps;
  const runningRuns = metricValueByName(rows, 'chimera_dataflow_run_status', { status: 'running' });
  const runQueueDepth = metricValueByName(rows, 'chimera_dataflow_queue_depth', { kind: 'run' });
  const executionQueueDepth = metricValueByName(rows, 'chimera_dataflow_queue_depth', { kind: 'execution' });
  const dispatchAvg = averageFromSummary(rows, 'chimera_dataflow_execution_dispatch_duration_seconds');
  const processAvg = averageFromSummary(rows, 'chimera_dataflow_execution_process_duration_seconds');
  const failedExecutions = metricValueByName(rows, 'chimera_dataflow_execution_status', { status: 'failed' });
  const cancelledExecutions = metricValueByName(rows, 'chimera_dataflow_execution_status', { status: 'cancelled' });
  const retryEvents = metricValueByName(rows, 'chimera_dataflow_execution_events_total', { event: 'retry' });
  const aiFailures = metricValueByName(rows, 'chimera_dataflow_ai_failure_total', { category: 'runtime' });
  const aiRetries = metricValueByName(rows, 'chimera_dataflow_ai_retry_total', { reason: 'retry' });
  const resultCount = metricValueByName(rows, 'chimera_dataflow_run_summary_total', { field: 'result_count' });
  const passedCount = metricValueByName(rows, 'chimera_dataflow_run_summary_total', { field: 'passed_count' });
  const failedCount = metricValueByName(rows, 'chimera_dataflow_run_summary_total', { field: 'failed_count' });
  const cyclesUsed = metricValueByName(rows, 'chimera_dataflow_run_summary_total', { field: 'cycles_used' });
  const runtimeTimeouts = sumMetric(rows, (row) => row.name === 'chimera_dataflow_runtime_trace_total' && row.labels.field === 'timeout_failures');
  const runtimeTruncations = sumMetric(rows, (row) => row.name === 'chimera_dataflow_runtime_trace_total' && row.labels.field === 'stdout_truncated');
  const runtimeOutputBytes = sumMetric(rows, (row) => row.name === 'chimera_dataflow_runtime_trace_total' && row.labels.field === 'output_bytes');

  const cycleField = (field: string) => metricValueByName(rows, 'chimera_dataflow_cycle_metrics', { field });
  const plateauFlag = (flag: string) => metricValueByName(rows, 'chimera_dataflow_cycle_plateau_flags', { flag });
  const runtimeField = (mode: string, field: string) => metricValueByName(rows, 'chimera_dataflow_runtime_trace_total', { mode, field });

  const plateauHints: Record<string, string> = {
    stagnant: '周期指标长时间不再推进',
    switched_to_closure: '已从继续挖掘切到闭环收束',
    abort: '本轮已触发终止',
    progress_gate_active: '当前被进展门控限制',
    no_effective_progress_failure: '因无有效进展导致失败',
    summary_artifact_unchanged: '摘要产物未变化',
    supporting_docs_unchanged: '支撑文档未变化',
    summary_repair_deferred_abort: '摘要修复被延迟并终止',
  };

  const runtimeModes = Array.from(new Set(rows.filter((row) => row.name === 'chimera_dataflow_runtime_trace_total').map((row) => row.labels.mode || 'unknown')))
    .sort((left, right) => left.localeCompare(right, 'zh-CN'))
    .map((mode) => {
      const calls = runtimeField(mode, 'calls');
      const durationSeconds = runtimeField(mode, 'duration_seconds');
      return {
        mode,
        calls,
        attempts: runtimeField(mode, 'attempts'),
        durationSeconds,
        avgDurationSeconds: calls && calls > 0 && durationSeconds != null ? durationSeconds / calls : null,
        timeoutFailures: runtimeField(mode, 'timeout_failures'),
        stdoutTruncated: runtimeField(mode, 'stdout_truncated'),
        outputBytes: runtimeField(mode, 'output_bytes'),
      };
    });
  const activePlateauCount = Object.keys(plateauHints).filter((flag) => (plateauFlag(flag) || 0) > 0).length;

  return {
    topCards: [
      { label: '运行中 Run', value: formatNumber(runningRuns), hint: 'run_status{status=running}', tone: (runningRuns || 0) > 0 ? 'text-teal-700' : 'text-slate-900' },
      { label: 'Run 队列', value: formatNumber(runQueueDepth), hint: 'queue_depth{kind=run}', tone: (runQueueDepth || 0) > 0 ? 'text-amber-700' : 'text-emerald-700' },
      { label: 'Execution 队列', value: formatNumber(executionQueueDepth), hint: 'queue_depth{kind=execution}', tone: (executionQueueDepth || 0) > 0 ? 'text-amber-700' : 'text-emerald-700' },
      { label: '平均派发时延', value: formatSeconds(dispatchAvg), hint: 'execution_dispatch_duration_seconds', tone: (dispatchAvg || 0) > 30 ? 'text-amber-700' : 'text-slate-900' },
      { label: '平均执行时长', value: formatSeconds(processAvg), hint: 'execution_process_duration_seconds', tone: (processAvg || 0) > 1800 ? 'text-rose-700' : 'text-slate-900' },
      { label: '失败 Execution', value: formatNumber(failedExecutions), hint: 'execution_status{status=failed}', tone: (failedExecutions || 0) > 0 ? 'text-rose-700' : 'text-emerald-700' },
      { label: '取消 Execution', value: formatNumber(cancelledExecutions), hint: 'execution_status{status=cancelled}', tone: (cancelledExecutions || 0) > 0 ? 'text-slate-700' : 'text-emerald-700' },
      { label: '重试事件', value: formatNumber(retryEvents), hint: 'execution_events_total{event=retry}', tone: (retryEvents || 0) > 0 ? 'text-amber-700' : 'text-emerald-700' },
    ],
    cycleCards: [
      { label: '最新漏洞数', value: formatNumber(cycleField('issue_count')), hint: 'cycle_metrics issue_count', tone: 'text-rose-700' },
      { label: '当前失败项', value: formatNumber(cycleField('current_failed')), hint: 'cycle_metrics current_failed', tone: (cycleField('current_failed') || 0) > 0 ? 'text-amber-700' : 'text-emerald-700' },
      { label: '历史已移除', value: formatNumber(cycleField('historical_removed')), hint: 'cycle_metrics historical_removed', tone: 'text-emerald-700' },
      { label: '未评审新增', value: formatNumber(cycleField('unreviewed_new')), hint: 'cycle_metrics unreviewed_new', tone: (cycleField('unreviewed_new') || 0) > 0 ? 'text-amber-700' : 'text-slate-900' },
      { label: '摘要规模', value: formatMetricValue(cycleField('summary_size') ?? Number.NaN), hint: 'cycle_metrics summary_size', tone: 'text-slate-900' },
      { label: '支撑文档数', value: formatNumber(cycleField('supporting_docs_count')), hint: 'cycle_metrics supporting_docs_count', tone: 'text-indigo-700' },
    ],
    chartData: [
      { name: '运行中 Run', value: valueOrZero(runningRuns), fill: '#0f766e' },
      { name: '失败 Exec', value: valueOrZero(failedExecutions), fill: '#e11d48' },
      { name: '取消 Exec', value: valueOrZero(cancelledExecutions), fill: '#64748b' },
      { name: '重试事件', value: valueOrZero(retryEvents), fill: '#f59e0b' },
      { name: '当前失败项', value: valueOrZero(cycleField('current_failed')), fill: '#fb7185' },
      { name: '未评审新增', value: valueOrZero(cycleField('unreviewed_new')), fill: '#f97316' },
      { name: 'AI 失败', value: valueOrZero(aiFailures), fill: '#7c3aed' },
      { name: 'Trace 超时', value: valueOrZero(runtimeTimeouts), fill: '#2563eb' },
    ],
    insightCards: [
      {
        label: '结果通过率',
        value: resultCount && resultCount > 0 && passedCount != null ?`${formatNumber((passedCount / resultCount) * 100, 1)}%` : '-',
        hint:`passed ${formatNumber(passedCount)} / results ${formatNumber(resultCount)}`,
        tone: resultCount && passedCount != null && resultCount > 0 && passedCount / resultCount < 0.7 ? 'text-amber-700' : 'text-emerald-700',
      },
      {
        label: '结果失败数',
        value: formatNumber(failedCount),
        hint: 'run_summary_total failed_count',
        tone: (failedCount || 0) > 0 ? 'text-rose-700' : 'text-emerald-700',
      },
      {
        label: '平均每结果周期',
        value: resultCount && resultCount > 0 && cyclesUsed != null ? formatNumber(cyclesUsed / resultCount, 2) : '-',
        hint:`cycles_used ${formatNumber(cyclesUsed)} / result_count ${formatNumber(resultCount)}`,
        tone: resultCount && cyclesUsed != null && resultCount > 0 && cyclesUsed / resultCount > 2 ? 'text-amber-700' : 'text-slate-900',
      },
      {
        label: '平台期激活数',
        value: formatNumber(activePlateauCount),
        hint: 'active plateau flags',
        tone: activePlateauCount > 0 ? 'text-rose-700' : 'text-emerald-700',
      },
      {
        label: 'AI 重试/失败',
        value:`${formatNumber(aiRetries)} / ${formatNumber(aiFailures)}`,
        hint: 'ai_retry_total / ai_failure_total',
        tone: (aiFailures || 0) > 0 ? 'text-rose-700' : (aiRetries || 0) > 0 ? 'text-amber-700' : 'text-emerald-700',
      },
      {
        label: 'Trace 超时/截断',
        value:`${formatNumber(runtimeTimeouts)} / ${formatNumber(runtimeTruncations)}`,
        hint: 'runtime timeout_failures / stdout_truncated',
        tone: (runtimeTimeouts || 0) > 0 || (runtimeTruncations || 0) > 0 ? 'text-amber-700' : 'text-emerald-700',
      },
      {
        label: 'Trace 输出总量',
        value: formatMetricValue(runtimeOutputBytes ?? Number.NaN),
        hint: 'runtime_trace_total output_bytes',
        tone: (runtimeOutputBytes || 0) > 0 ? 'text-slate-900' : 'text-slate-500',
      },
    ],
    plateauFlags: Object.entries(plateauHints).map(([label, hint]) => ({
      label,
      active: (plateauFlag(label) || 0) > 0,
      hint,
    })),
    runtimeModes,
  };
};

export const buildDataflowVulnAiViewModel = (rows: MetricRowLike[], deps: BuilderDeps): DataflowVulnAiViewModel => {
  const { formatMetricValue, formatNumber, formatSeconds, metricValueByName, sumMetric, valueOrZero } = deps;
  const roleValue = (role: string) => metricValueByName(rows, 'chimera_dataflow_ai_role_count', { role });
  const tokenValue = (type: string) => metricValueByName(rows, 'chimera_dataflow_ai_token_usage_total', { type });
  const cycleRounds = metricValueByName(rows, 'chimera_dataflow_ai_round_total', { kind: 'cycle' });
  const reviewRounds = metricValueByName(rows, 'chimera_dataflow_ai_round_total', { kind: 'review' });
  const retryTotal = metricValueByName(rows, 'chimera_dataflow_ai_retry_total', { reason: 'retry' });
  const timeoutTotal = metricValueByName(rows, 'chimera_dataflow_ai_timeout_total', { scope: 'plugin' });
  const failureTotal = metricValueByName(rows, 'chimera_dataflow_ai_failure_total', { category: 'runtime' });
  const reviewPartial = metricValueByName(rows, 'chimera_dataflow_ai_review_total', { result: 'partial' });
  const sessionTotal = metricValueByName(rows, 'chimera_dataflow_ai_session_total', { role: 'agent' });
  const costTotal = metricValueByName(rows, 'chimera_dataflow_ai_token_cost_total');
  const inputTokens = tokenValue('input');
  const outputTokens = tokenValue('output');
  const cacheReadTokens = tokenValue('cache_read');
  const cacheWriteTokens = tokenValue('cache_write');
  const totalTokens = tokenValue('total');
  const runtimeCalls = sumMetric(rows, (row) => row.name === 'chimera_dataflow_runtime_trace_total' && row.labels.field === 'calls');
  const runtimeTimeouts = sumMetric(rows, (row) => row.name === 'chimera_dataflow_runtime_trace_total' && row.labels.field === 'timeout_failures');
  const runtimeApiFailures = sumMetric(rows, (row) => row.name === 'chimera_dataflow_runtime_trace_total' && row.labels.field === 'api_failures');
  const runtimePiFailures = sumMetric(rows, (row) => row.name === 'chimera_dataflow_runtime_trace_total' && row.labels.field === 'pi_failures');
  const runtimeDuration = sumMetric(rows, (row) => row.name === 'chimera_dataflow_runtime_trace_total' && row.labels.field === 'duration_seconds');
  const pluginResults = rows
    .filter((row) => row.name === 'chimera_dataflow_plugin_results_total')
    .sort((left, right) => right.value - left.value)
    .slice(0, 4);

  return {
    topCards: [
      { label: 'Cycle 轮次', value: formatNumber(cycleRounds), hint: 'ai_round_total{kind=cycle}', tone: (cycleRounds || 0) > 0 ? 'text-indigo-700' : 'text-slate-900' },
      { label: 'Review 轮次', value: formatNumber(reviewRounds), hint: 'ai_round_total{kind=review}', tone: (reviewRounds || 0) > 0 ? 'text-fuchsia-700' : 'text-slate-900' },
      { label: 'AI 会话数', value: formatNumber(sessionTotal), hint: 'ai_session_total{role=agent}', tone: (sessionTotal || 0) > 0 ? 'text-sky-700' : 'text-slate-900' },
      { label: '总 Token', value: formatNumber(totalTokens), hint: 'ai_token_usage_total{type=total}', tone: (totalTokens || 0) > 0 ? 'text-violet-700' : 'text-slate-900' },
      { label: '累计成本', value: formatMetricValue(costTotal ?? Number.NaN), hint: 'ai_token_cost_total', tone: (costTotal || 0) > 0 ? 'text-violet-700' : 'text-slate-900' },
      { label: 'AI 重试/失败', value:`${formatNumber(retryTotal)} / ${formatNumber(failureTotal)}`, hint: 'retry / runtime failure', tone: (failureTotal || 0) > 0 ? 'text-rose-700' : (retryTotal || 0) > 0 ? 'text-amber-700' : 'text-emerald-700' },
    ],
    phaseCards: [
      { label: 'Plugin 超时', value: formatNumber(timeoutTotal), hint: 'ai_timeout_total{scope=plugin}', tone: (timeoutTotal || 0) > 0 ? 'text-rose-700' : 'text-emerald-700' },
      { label: 'Runtime 调用', value: formatNumber(runtimeCalls), hint: 'runtime_trace_total calls', tone: (runtimeCalls || 0) > 0 ? 'text-slate-900' : 'text-slate-500' },
      { label: 'Runtime 超时', value: formatNumber(runtimeTimeouts), hint: 'runtime_trace_total timeout_failures', tone: (runtimeTimeouts || 0) > 0 ? 'text-rose-700' : 'text-emerald-700' },
      { label: 'API / PI 失败', value:`${formatNumber(runtimeApiFailures)} / ${formatNumber(runtimePiFailures)}`, hint: 'runtime api_failures / pi_failures', tone: (runtimeApiFailures || 0) > 0 || (runtimePiFailures || 0) > 0 ? 'text-amber-700' : 'text-emerald-700' },
      { label: 'Runtime 总耗时', value: formatSeconds(runtimeDuration), hint: 'runtime_trace_total duration_seconds', tone: (runtimeDuration || 0) > 3600 ? 'text-amber-700' : 'text-slate-900' },
      { label: 'Partial Review', value: formatNumber(reviewPartial), hint: 'ai_review_total{result=partial}', tone: (reviewPartial || 0) > 0 ? 'text-fuchsia-700' : 'text-slate-900' },
    ],
    roleChart: [
      { name: 'agent', value: valueOrZero(roleValue('agent')), fill: '#7c3aed' },
      { name: 'plugin', value: valueOrZero(roleValue('plugin')), fill: '#db2777' },
    ].filter((item) => item.value > 0),
    tokenChart: [
      { name: 'input', value: valueOrZero(inputTokens), fill: '#7c3aed' },
      { name: 'output', value: valueOrZero(outputTokens), fill: '#db2777' },
      { name: 'cache_read', value: valueOrZero(cacheReadTokens), fill: '#0ea5e9' },
      { name: 'cache_write', value: valueOrZero(cacheWriteTokens), fill: '#14b8a6' },
    ].filter((item) => item.value > 0),
    reviewCards: pluginResults.length
      ? pluginResults.map((row) => ({
          label:`${row.labels.plugin || 'plugin'} / ${row.labels.result || 'unknown'}`,
          value: formatNumber(row.value),
          hint: 'plugin_results_total',
          tone: row.labels.result === 'success' ? 'text-emerald-700' : row.labels.result === 'partial' ? 'text-amber-700' : 'text-rose-700',
        }))
      : [{ label: 'Plugin 结果', value: '-', hint: '暂无 plugin_results_total', tone: 'text-slate-500' }],
  };
};
