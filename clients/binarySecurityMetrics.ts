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
  | 'http'
  | 'task'
  | 'queue'
  | 'worker'
  | 'duration'
  | 'error-retry-timeout'
  | 'llm-token-cost'
  | 'service-specific';

export interface BinarySecurityMetricsServiceDefinition {
  key: BinarySecurityMetricsServiceKey;
  label: string;
  serviceName: string;
  metricsPath: string;
  preferredGroups: BinarySecurityMetricsGroup[];
  serviceSpecificKeywords: string[];
}

export const BINARY_SECURITY_METRICS_SERVICES: BinarySecurityMetricsServiceDefinition[] = [
  {
    key: 'binary-security',
    label: '二进制安全编排器',
    serviceName: 'secflow-app-binary-security',
    metricsPath: `${API_BASE}/api/app/binary-security/metrics`,
    preferredGroups: ['task', 'queue', 'worker', 'error-retry-timeout', 'duration', 'http', 'llm-token-cost', 'service-specific'],
    serviceSpecificKeywords: ['stage', 'dispatch', 'downstream', 'archive', 'module'],
  },
  {
    key: 'binary-evolution',
    label: '进化中心',
    serviceName: 'secflow-app-binary-evolution-center',
    metricsPath: `${API_BASE}/api/app/binary-evolution/metrics`,
    preferredGroups: ['task', 'worker', 'duration', 'llm-token-cost', 'error-retry-timeout', 'http', 'queue', 'service-specific'],
    serviceSpecificKeywords: ['round', 'score', 'selection', 'source_task', 'evolution'],
  },
  {
    key: 'firmware-unpacker',
    label: '固件解包',
    serviceName: 'secflow-app-firmware-unpacker',
    metricsPath: `${API_BASE}/api/app/firmware-unpacker/metrics`,
    preferredGroups: ['task', 'duration', 'worker', 'error-retry-timeout', 'queue', 'http', 'llm-token-cost', 'service-specific'],
    serviceSpecificKeywords: ['firmware', 'resource', 'evolution', 'skill', 'round'],
  },
  {
    key: 'system-analysis',
    label: '系统分析',
    serviceName: 'secflow-app-system-analyse',
    metricsPath: `${API_BASE}/api/app/system-analyse/metrics`,
    preferredGroups: ['task', 'duration', 'llm-token-cost', 'worker', 'error-retry-timeout', 'http', 'queue', 'service-specific'],
    serviceSpecificKeywords: ['session', 'round', 'review', 'judge', 'timeout', 'system'],
  },
  {
    key: 'binary-to-source',
    label: '二进制逆向',
    serviceName: 'secflow-app-binary-to-source',
    metricsPath: `${API_BASE}/api/app/binary-to-source/metrics`,
    preferredGroups: ['task', 'duration', 'llm-token-cost', 'error-retry-timeout', 'http', 'worker', 'queue', 'service-specific'],
    serviceSpecificKeywords: ['review', 'quality', 'attempt', 'artifact', 'function'],
  },
  {
    key: 'entry-analysis',
    label: '入口分析',
    serviceName: 'secflow-app-entry-analyse',
    metricsPath: `${API_BASE}/api/app/entry-analyse/metrics`,
    preferredGroups: ['task', 'duration', 'llm-token-cost', 'worker', 'error-retry-timeout', 'http', 'queue', 'service-specific'],
    serviceSpecificKeywords: ['session', 'round', 'review', 'judge', 'entry'],
  },
  {
    key: 'dataflow-analysis',
    label: '数据流分析',
    serviceName: 'secflow-app-dataflow-analyse',
    metricsPath: `${API_BASE}/api/app/dataflow-analyse/metrics`,
    preferredGroups: ['task', 'duration', 'llm-token-cost', 'worker', 'error-retry-timeout', 'http', 'queue', 'service-specific'],
    serviceSpecificKeywords: ['session', 'round', 'review', 'judge', 'trace', 'dataflow'],
  },
  {
    key: 'dataflow-vuln',
    label: '数据流漏洞挖掘',
    serviceName: 'secflow-app-dataflow-vuln-scanner',
    metricsPath: `${API_BASE}/api/app/dataflow-vuln-scanner/metrics`,
    preferredGroups: ['task', 'duration', 'llm-token-cost', 'queue', 'worker', 'error-retry-timeout', 'http', 'service-specific'],
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
};
