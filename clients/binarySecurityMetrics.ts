import { API_BASE, fetchWithRetry, getAuthHeaders, handleResponse } from './base';

export type BinarySecurityMetricsServiceKey =
  | 'binary-security'
  | 'binary-evolution'
  | 'firmware-unpacker'
  | 'system-analysis'
  | 'binary-to-source'
  | 'entry-analysis'
  | 'dataflow-analysis'
  | 'dataflow-vuln';

export type BinarySecurityMetricsGroup =
  | 'health'
  | 'orchestration'
  | 'reducer'
  | 'lock'
  | 'http'
  | 'task'
  | 'queue'
  | 'worker'
  | 'duration'
  | 'error-retry-timeout'
  | 'llm-token-cost'
  | 'ai-agent'
  | 'service-specific'
  | 'other';

export type BinarySecurityMetricsSecondaryTab = 'observability' | 'reducer' | 'ai-zone';

export type BinarySecurityCanonicalAiMetricKey =
  | 'request-total'
  | 'error-total'
  | 'session-total'
  | 'input-tokens-total'
  | 'output-tokens-total'
  | 'reasoning-tokens-total'
  | 'total-tokens-total'
  | 'cost-total'
  | 'input-tokens-running'
  | 'output-tokens-running'
  | 'reasoning-tokens-running'
  | 'total-tokens-running'
  | 'cost-running'
  | 'latency-seconds-total'
  | 'latency-count';

export interface BinarySecurityMetricsServiceDefinition {
  key: BinarySecurityMetricsServiceKey;
  label: string;
  serviceName: string;
  metricsPath: string;
  preferredGroups: BinarySecurityMetricsGroup[];
  serviceSpecificKeywords: string[];
}

export interface BinarySecurityCanonicalAiMetricDefinition {
  key: BinarySecurityCanonicalAiMetricKey;
  label: string;
  description: string;
}

export const BINARY_SECURITY_METRICS_SECONDARY_TABS: Array<{ key: BinarySecurityMetricsSecondaryTab; label: string }> = [
  { key: 'observability', label: '通用观测' },
  { key: 'reducer', label: 'Reducer' },
  { key: 'ai-zone', label: 'AI专区' },
];

export const BINARY_SECURITY_AI_DIMENSION_LABEL_KEYS = [
  'agent_id',
  'agent_key',
  'provider',
  'provider_key',
  'provider_name',
  'backend',
  'model',
  'model_name',
  'session_id',
  'conversation_id',
  'stage',
  'status',
  'role',
  'mode',
  'kind',
  'type',
  'token_type',
] as const;

export const BINARY_SECURITY_CANONICAL_AI_METRICS: BinarySecurityCanonicalAiMetricDefinition[] = [
  { key: 'request-total', label: 'AI 请求量', description: 'AI/LLM 调用累计值' },
  { key: 'error-total', label: 'AI 异常量', description: 'AI/LLM 调用失败、超时、异常累计值' },
  { key: 'session-total', label: '会话/Session', description: 'AI 相关会话、对话、session 总量' },
  { key: 'input-tokens-total', label: '输入 Tokens', description: '累计输入/Prompt tokens' },
  { key: 'output-tokens-total', label: '输出 Tokens', description: '累计输出/Completion tokens' },
  { key: 'reasoning-tokens-total', label: '推理 Tokens', description: '累计 reasoning tokens' },
  { key: 'total-tokens-total', label: '总 Tokens', description: '累计总 tokens' },
  { key: 'cost-total', label: '累计成本', description: '累计 AI/LLM 成本' },
  { key: 'input-tokens-running', label: '运行中输入 Tokens', description: '当前运行中任务的输入 token 快照' },
  { key: 'output-tokens-running', label: '运行中输出 Tokens', description: '当前运行中任务的输出 token 快照' },
  { key: 'reasoning-tokens-running', label: '运行中推理 Tokens', description: '当前运行中任务的 reasoning token 快照' },
  { key: 'total-tokens-running', label: '运行中总 Tokens', description: '当前运行中任务的总 token 快照' },
  { key: 'cost-running', label: '运行中成本', description: '当前运行中任务的 AI 成本快照' },
  { key: 'latency-seconds-total', label: '累计 AI 耗时', description: 'AI/LLM 请求累计耗时（秒）' },
  { key: 'latency-count', label: 'AI 耗时样本', description: 'AI/LLM 耗时样本数' },
];

export const BINARY_SECURITY_METRICS_SERVICES: BinarySecurityMetricsServiceDefinition[] = [
  {
    key: 'binary-security',
    label: '二进制安全编排器',
    serviceName: 'secflow-app-binary-security',
    metricsPath: `${API_BASE}/api/app/binary-security/metrics/aggregate`,
    preferredGroups: ['health', 'orchestration', 'reducer', 'lock', 'queue', 'worker', 'task', 'error-retry-timeout', 'duration', 'http', 'ai-agent', 'llm-token-cost', 'service-specific', 'other'],
    serviceSpecificKeywords: ['stage', 'dispatch', 'downstream', 'archive', 'module', 'state', 'reducer', 'lock', 'dead_letter'],
  },
  {
    key: 'binary-evolution',
    label: '进化中心',
    serviceName: 'secflow-app-binary-evolution-center',
    metricsPath: `${API_BASE}/api/app/binary-evolution/metrics`,
    preferredGroups: ['task', 'worker', 'duration', 'llm-token-cost', 'ai-agent', 'error-retry-timeout', 'http', 'queue', 'service-specific'],
    serviceSpecificKeywords: ['round', 'score', 'selection', 'source_task', 'evolution'],
  },
  {
    key: 'firmware-unpacker',
    label: '固件解包',
    serviceName: 'secflow-app-firmware-unpacker',
    metricsPath: `${API_BASE}/api/app/firmware-unpacker/metrics`,
    preferredGroups: ['task', 'duration', 'worker', 'error-retry-timeout', 'queue', 'http', 'llm-token-cost', 'ai-agent', 'service-specific'],
    serviceSpecificKeywords: ['evolution', 'skill', 'cleanup', 'orphan', 'maintenance'],
  },
  {
    key: 'system-analysis',
    label: '系统分析',
    serviceName: 'secflow-app-system-analyse',
    metricsPath: `${API_BASE}/api/app/system-analyse/metrics`,
    preferredGroups: ['task', 'duration', 'llm-token-cost', 'ai-agent', 'worker', 'error-retry-timeout', 'http', 'queue', 'service-specific'],
    serviceSpecificKeywords: ['session', 'round', 'review', 'judge', 'timeout', 'system'],
  },
  {
    key: 'binary-to-source',
    label: '二进制逆向',
    serviceName: 'secflow-app-binary-to-source',
    metricsPath: `${API_BASE}/api/app/binary-to-source/metrics`,
    preferredGroups: ['task', 'duration', 'llm-token-cost', 'ai-agent', 'error-retry-timeout', 'http', 'worker', 'queue', 'service-specific'],
    serviceSpecificKeywords: ['review', 'quality', 'attempt', 'artifact', 'function', 'business', 'header', 'body', 'batch', 'recovery', 'throughput', 'cache'],
  },
  {
    key: 'entry-analysis',
    label: '入口分析',
    serviceName: 'secflow-app-entry-analyse',
    metricsPath: `${API_BASE}/api/app/entry-analyse/metrics`,
    preferredGroups: ['task', 'duration', 'llm-token-cost', 'ai-agent', 'worker', 'error-retry-timeout', 'http', 'queue', 'service-specific'],
    serviceSpecificKeywords: ['entry', 'r1', 'r2', 'r3', 'r4', 'module'],
  },
  {
    key: 'dataflow-analysis',
    label: '数据流分析',
    serviceName: 'secflow-app-dataflow-analyse',
    metricsPath: `${API_BASE}/api/app/dataflow-analyse/metrics`,
    preferredGroups: ['task', 'duration', 'llm-token-cost', 'ai-agent', 'worker', 'error-retry-timeout', 'http', 'queue', 'service-specific'],
    serviceSpecificKeywords: ['session', 'round', 'review', 'judge', 'trace', 'dataflow'],
  },
  {
    key: 'dataflow-vuln',
    label: '数据流漏洞挖掘',
    serviceName: 'secflow-app-dataflow-vuln-scanner',
    metricsPath: `${API_BASE}/api/app/dataflow-vuln-scanner/metrics`,
    preferredGroups: ['task', 'duration', 'llm-token-cost', 'ai-agent', 'queue', 'worker', 'error-retry-timeout', 'http', 'service-specific'],
    serviceSpecificKeywords: ['cycle', 'candidate', 'issue', 'judge', 'vuln', 'execution'],
  },
];

const SERVICE_MAP = Object.fromEntries(BINARY_SECURITY_METRICS_SERVICES.map((service) => [service.key, service])) as Record<
  BinarySecurityMetricsServiceKey,
  BinarySecurityMetricsServiceDefinition
>;

export const getBinarySecurityMetricsService = (serviceKey: BinarySecurityMetricsServiceKey) => SERVICE_MAP[serviceKey];

export const binarySecurityMetricsApi = {
  listServices: (): BinarySecurityMetricsServiceDefinition[] => BINARY_SECURITY_METRICS_SERVICES,
  getServiceMetrics: async (serviceKey: BinarySecurityMetricsServiceKey): Promise<string> => {
    const service = getBinarySecurityMetricsService(serviceKey);
    const response = await fetchWithRetry(
      service.metricsPath,
      {
        method: 'GET',
        headers: {
          Accept: 'text/plain',
          ...getAuthHeaders(),
        },
      },
      { retries: 2, retryDelayMs: 400 },
    );
    const payload = await handleResponse(response);
    return typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  },
  getBinarySecurityReducerMetrics: async (): Promise<string> => {
    const response = await fetchWithRetry(
      `${API_BASE}/api/app/binary-security/metrics/reducer`,
      {
        method: 'GET',
        headers: {
          Accept: 'text/plain',
          ...getAuthHeaders(),
        },
      },
      { retries: 2, retryDelayMs: 400 },
    );
    const payload = await handleResponse(response);
    return typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  },
};
