import { API_BASE, getHeaders, getJsonWithDedupe, handleResponse, fetchWithRetry } from './base';
import type { ServiceHealthMeta } from '../components/execution/serviceHealthMeta';

const BASE = `${API_BASE}/api/app/vuln-verify`;

export type VulnVerifyStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled' | 'cancelling' | string;

export interface VulnVerifyTaskCreateRequest {
  name: string;
  description?: string;
  reports_dir: string;
  source_root: string;
  binary_root?: string | null;
  threat_path?: string | null;
  model?: string;
  concurrency?: number;
  resume?: boolean;
}

export interface VulnVerifyTask {
  id: string;
  project_id: string;
  name: string;
  description?: string | null;
  status: VulnVerifyStatus;
  reports_dir: string;
  source_root: string;
  binary_root: string | null;
  threat_path: string | null;
  output_dir: string;
  model?: string | null;
  concurrency: number;
  resume: boolean;
  pid?: number | null;
  return_code?: number | null;
  worker_id?: string | null;
  error_reason?: string | null;
  progress?: Record<string, any>;
  result_summary?: Record<string, any>;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface VulnVerifyEvent {
  id: string;
  task_id: string;
  project_id: string;
  event_type: string;
  level: string;
  status?: string | null;
  message: string;
  payload?: Record<string, any>;
  created_at?: string | null;
}

export interface VulnVerifyTaskDetail extends VulnVerifyTask {
  events: VulnVerifyEvent[];
}

export interface VulnVerifyArtifact {
  path: string;
  size: number;
  modified_at?: string | null;
  kind: string;
}

export interface VulnVerifyResult {
  task_id: string;
  status: string;
  result_count: number;
  results: Record<string, any>[];
  summary: Record<string, any>;
}

export interface VulnVerifyReportDimension {
  status?: boolean | null;
  detail: string;
}

export interface VulnVerifyReportExploitability {
  preconditions?: string;
  complexity?: string;
  impact?: string;
}

export interface VulnVerifyReportEvidence {
  type: string;
  claim: string;
  finding: string;
}

export interface VulnVerifyReportItem {
  id: string;
  title: string;
  severity: string;
  verdict: string;
  ruled_out_by?: string | null;
  dimensions?: Record<string, VulnVerifyReportDimension>;
  root_cause?: string;
  exploit?: VulnVerifyReportExploitability | null;
  evidence?: VulnVerifyReportEvidence[];
  raw_result?: Record<string, any> | null;
}

export interface VulnVerifyReportGroup {
  id: string;
  file: string;
  function: string;
  report_count: number;
  verdicts: Record<string, number>;
  dominant: string;
  reports: VulnVerifyReportItem[];
}

export interface VulnVerifyReportData {
  task_id: string;
  status: string;
  title: string;
  target: string;
  total_verified: number;
  total_reports: number;
  total_groups: number;
  verdicts: Record<string, number>;
  severities: Record<string, number>;
  groups: VulnVerifyReportGroup[];
}

export interface VulnVerifyProjectStats {
  total_tasks: number;
  verified_tasks: number;
  total_results: number;
  confirmed_count: number;
  ruled_out_count: number;
  unresolved_count: number;
  unverified_count?: number;
}

export interface VulnVerifyServiceConfig {
  default_model?: string | null;
}

export interface VulnVerifyServiceConfigResponse {
  config: VulnVerifyServiceConfig;
  effective_default_model?: string | null;
  source?: string;
  updated_by?: string | null;
  updated_at?: string | null;
}

export const vulnVerifyApi = {
  getHealth: async (): Promise<{ status: string; service?: string } & ServiceHealthMeta> =>
    getJsonWithDedupe(`${BASE}/health`, { headers: getHeaders() }),

  getProjectStats: async (projectId: string): Promise<VulnVerifyProjectStats> =>
    getJsonWithDedupe(`${BASE}/projects/${encodeURIComponent(projectId)}/stats`, { headers: getHeaders() }),

  getServiceConfig: async (projectId: string): Promise<VulnVerifyServiceConfigResponse> =>
    handleResponse(await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/service-config`, { headers: getHeaders() })),

  saveServiceConfig: async (projectId: string, config: VulnVerifyServiceConfig): Promise<VulnVerifyServiceConfigResponse> =>
    handleResponse(await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/service-config`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ config }),
    })),

  listTasks: async (projectId: string, params?: { status?: string; search?: string; resultVerdict?: string; limit?: number; offset?: number }): Promise<{ total: number; items: VulnVerifyTask[] }> => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.search) query.set('search', params.search);
    if (params?.resultVerdict) query.set('result_verdict', params.resultVerdict);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    const suffix = query.toString() ? `?${query}` : '';
    return getJsonWithDedupe(`${BASE}/projects/${encodeURIComponent(projectId)}/tasks${suffix}`, { headers: getHeaders() });
  },

  createTask: async (projectId: string, payload: VulnVerifyTaskCreateRequest): Promise<VulnVerifyTask> =>
    handleResponse(await fetchWithRetry(`${BASE}/projects/${encodeURIComponent(projectId)}/tasks`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    }, { retries: 2, retryDelayMs: 500, retryOnStatus: [408, 429, 500, 502, 503, 504] })),

  getTask: async (projectId: string, taskId: string): Promise<VulnVerifyTaskDetail> =>
    handleResponse(await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`, { headers: getHeaders() })),

  terminateTask: async (projectId: string, taskId: string): Promise<{ status: string; task_id: string; message: string }> =>
    handleResponse(await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/terminate`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  rerunTask: async (projectId: string, taskId: string): Promise<{ status: string; task_id: string; message: string }> =>
    handleResponse(await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/rerun`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  getResult: async (projectId: string, taskId: string): Promise<VulnVerifyResult> =>
    handleResponse(await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/result`, { headers: getHeaders() })),

  getReportData: async (projectId: string, taskId: string): Promise<VulnVerifyReportData> =>
    handleResponse(await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/report-data`, { headers: getHeaders() })),

  listArtifacts: async (projectId: string, taskId: string): Promise<{ task_id: string; output_dir: string; items: VulnVerifyArtifact[] }> =>
    handleResponse(await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/artifacts`, { headers: getHeaders() })),

  getArtifactContent: async (projectId: string, taskId: string, path: string, limit = 512 * 1024): Promise<{ task_id: string; path: string; offset: number; limit: number; size: number; content: string; truncated: boolean }> =>
    handleResponse(await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/artifacts/content?path=${encodeURIComponent(path)}&limit=${limit}`, { headers: getHeaders() })),
};
