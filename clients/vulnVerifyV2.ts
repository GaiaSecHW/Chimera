import { API_BASE, fetchWithRetry, getHeaders, getJsonWithDedupe, handleResponse } from './base';
import type { ServiceHealthMeta } from '../components/execution/serviceHealthMeta';

const BASE = `${API_BASE}/api/app/vuln-verify-v2`;

export type VulnVerifyV2Status = 'pending' | 'running' | 'success' | 'failed' | 'cancelled' | string;

export interface VulnVerifyV2TaskCreateRequest {
  case_id: string;
  name?: string | null;
  code_root?: string | null;
  raw_report?: string | null;
  reports_dir?: string | null;
  threat_path?: string | null;
  model?: string | null;
  max_attempts?: number;
  task_key?: string | null;
  file?: string | null;
  function?: string | null;
}

export interface VulnVerifyV2Attempt {
  id: string;
  task_id: string;
  attempt_number: number;
  status: string;
  worker_id?: string | null;
  scheduled_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  result?: Record<string, any> | null;
  failure_reason?: Record<string, any> | null;
}

export interface VulnVerifyV2Task {
  id: string;
  project_id: string;
  name: string;
  reports_dir: string;
  code_root: string;
  threat_path?: string | null;
  work_dir?: string | null;
  model?: string | null;
  max_attempts: number;
  created_by?: string | null;
  task_key: string;
  file?: string | null;
  function?: string | null;
  case_id: string;
  status: VulnVerifyV2Status;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface VulnVerifyV2TaskDetail extends VulnVerifyV2Task {
  attempts?: VulnVerifyV2Attempt[];
  results?: VulnVerifyV2Result[];
}

export interface VulnVerifyV2Result {
  id: string;
  task_id: string;
  case_id: string;
  attempt_id?: string | null;
  verdict: 'confirmed' | 'ruled_out' | 'unresolved' | string;
  dimensions?: Record<string, { status?: boolean | null; detail?: string }> | null;
  exploitability?: Record<string, any> | null;
  evidence?: any;
  raw_result?: Record<string, any> | null;
  created_at?: string | null;
}

export interface VulnVerifyV2ProjectStats {
  total_tasks: number;
  pending: number;
  running: number;
  success: number;
  failed: number;
  cancelled: number;
  total_results: number;
  confirmed?: number;
  ruled_out?: number;
  unresolved?: number;
  confirmed_count?: number;
  ruled_out_count?: number;
  unresolved_count?: number;
  verdict_counts?: Record<string, number>;
}

export interface VulnVerifyV2TaskCaseIdsResponse {
  total: number;
  items: string[];
}

export const vulnVerifyV2Api = {
  getHealth: async (): Promise<{ status: string; service?: string } & ServiceHealthMeta> =>
    getJsonWithDedupe(`${BASE}/health`, { headers: getHeaders() }),

  getProjectStats: async (projectId: string): Promise<VulnVerifyV2ProjectStats> =>
    getJsonWithDedupe(`${BASE}/projects/${encodeURIComponent(projectId)}/stats`, { headers: getHeaders() }),

  listTasks: async (projectId: string, params?: { status?: string; search?: string; limit?: number; offset?: number }): Promise<{ total: number; items: VulnVerifyV2Task[] }> => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.search) query.set('search', params.search);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    const suffix = query.toString() ? `?${query}` : '';
    return getJsonWithDedupe(`${BASE}/projects/${encodeURIComponent(projectId)}/tasks${suffix}`, { headers: getHeaders() });
  },

  listTaskCaseIds: async (projectId: string, params?: { caseIds?: string[] }): Promise<VulnVerifyV2TaskCaseIdsResponse> => {
    const query = new URLSearchParams();
    (params?.caseIds || []).forEach((caseId) => {
      const normalized = String(caseId || '').trim();
      if (normalized) query.append('case_ids', normalized);
    });
    const suffix = query.toString() ? `?${query}` : '';
    return getJsonWithDedupe(`${BASE}/projects/${encodeURIComponent(projectId)}/task-case-ids${suffix}`, { headers: getHeaders() });
  },

  createTask: async (projectId: string, payload: VulnVerifyV2TaskCreateRequest): Promise<VulnVerifyV2Task> =>
    handleResponse(await fetchWithRetry(`${BASE}/projects/${encodeURIComponent(projectId)}/tasks`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    }, { retries: 2, retryDelayMs: 500, retryOnStatus: [408, 429, 500, 502, 503, 504] })),

  getTask: async (projectId: string, taskId: string): Promise<VulnVerifyV2TaskDetail> =>
    handleResponse(await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`, { headers: getHeaders() })),

  getResults: async (projectId: string, taskId: string): Promise<VulnVerifyV2Result[]> =>
    handleResponse(await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/results`, { headers: getHeaders() })),

  getProjectResults: async (projectId: string): Promise<VulnVerifyV2Result[]> =>
    handleResponse(await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/results`, { headers: getHeaders() })),

  terminateTask: async (projectId: string, taskId: string): Promise<any> =>
    handleResponse(await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/terminate`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  rerunTask: async (projectId: string, taskId: string): Promise<any> =>
    handleResponse(await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/rerun`, {
      method: 'POST',
      headers: getHeaders(),
    })),
};
