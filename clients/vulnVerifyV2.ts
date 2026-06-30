import { API_BASE, fetchWithRetry, getHeaders, getJsonWithDedupe, handleResponse } from './base';
import type { ServiceHealthMeta } from '../components/execution/serviceHealthMeta';

const BASE = `${API_BASE}/api/app/vuln-verify-v2`;
const TASK_CASE_IDS_QUERY_CHUNK_SIZE = 100;

export type VulnVerifyV2Status = 'pending' | 'running' | 'success' | 'failed' | 'cancelled' | string;

export interface VulnVerifyV2TaskCreateRequest {
  vuln_id: string;
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

export interface VulnVerifyV2TaskRuntime {
  status?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  resolved_model?: string | null;
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
  vuln_id?: string | null;
  status: VulnVerifyV2Status;
  created_at?: string | null;
  updated_at?: string | null;
  // 列表页一等展示字段投影（后端冗余列，无需再发 getTask / getProjectResults）
  verdict?: 'confirmed' | 'ruled_out' | 'unresolved' | null;
  root_cause_summary?: string | null;
  ruled_out_by?: string[] | null;
  runtime?: VulnVerifyV2TaskRuntime | null;
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

export interface VulnVerifyV2AdminPushRequest {
  task_ids?: string[];
  vuln_ids?: string[];
  limit?: number;
  dry_run?: boolean;
}

export interface VulnVerifyV2AdminPushResult {
  items: Array<{
    task_id: string;
    vuln_id?: string | null;
    status?: string | null;
    skipped?: boolean;
    reason?: string | null;
    dry_run?: boolean;
    payload?: Record<string, any>;
    push?: {
      ok: boolean;
      skipped?: boolean;
      attempts?: number;
      status_code?: number | null;
      error?: string | null;
    };
  }>;
  summary: {
    pushed: number;
    skipped: number;
    failed: number;
  };
}

function normalizeCaseIds(caseIds?: string[] | null): string[] {
  if (!Array.isArray(caseIds)) return [];
  return caseIds
    .map((caseId) => String(caseId || '').trim())
    .filter(Boolean);
}

async function fetchTaskCaseIdsChunk(projectId: string, caseIds: string[]): Promise<VulnVerifyV2TaskCaseIdsResponse> {
  const response = await handleResponse(await fetchWithRetry(`${BASE}/projects/${encodeURIComponent(projectId)}/task-case-ids/query`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ case_ids: caseIds }),
  }, { retries: 2, retryDelayMs: 300, retryOnStatus: [408, 429, 500, 502, 503, 504] }));
  const items = Array.isArray(response?.items) ? response.items.map((item: unknown) => String(item || '').trim()).filter(Boolean) : [];
  return {
    total: Number(response?.total || items.length),
    items,
  };
}

export const vulnVerifyV2Api = {
  getHealth: async (): Promise<{ status: string; service?: string } & ServiceHealthMeta> =>
    getJsonWithDedupe(`${BASE}/health`, { headers: getHeaders() }),

  getProjectStats: async (projectId: string): Promise<VulnVerifyV2ProjectStats> =>
    getJsonWithDedupe(`${BASE}/projects/${encodeURIComponent(projectId)}/stats`, { headers: getHeaders() }),

  listTasks: async (projectId: string, params?: { status?: string; verdict?: string; search?: string; limit?: number; offset?: number }): Promise<{ total: number; items: VulnVerifyV2Task[] }> => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.verdict) query.set('verdict', params.verdict);
    if (params?.search) query.set('search', params.search);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    const suffix = query.toString() ? `?${query}` : '';
    return getJsonWithDedupe(`${BASE}/projects/${encodeURIComponent(projectId)}/tasks${suffix}`, { headers: getHeaders() });
  },

  listTaskCaseIds: async (projectId: string, params?: { caseIds?: string[] }): Promise<VulnVerifyV2TaskCaseIdsResponse> => {
    const normalizedCaseIds = normalizeCaseIds(params?.caseIds);
    if (!normalizedCaseIds.length) {
      const response = await getJsonWithDedupe<VulnVerifyV2TaskCaseIdsResponse>(`${BASE}/projects/${encodeURIComponent(projectId)}/task-case-ids`, { headers: getHeaders() });
      const items = Array.isArray(response?.items) ? response.items.map((item: unknown) => String(item || '').trim()).filter(Boolean) : [];
      return {
        total: Number(response?.total || items.length),
        items,
      };
    }

    const deduped = Array.from(new Set(normalizedCaseIds));
    const merged = new Set<string>();
    for (let index = 0; index < deduped.length; index += TASK_CASE_IDS_QUERY_CHUNK_SIZE) {
      const chunk = deduped.slice(index, index + TASK_CASE_IDS_QUERY_CHUNK_SIZE);
      const response = await fetchTaskCaseIdsChunk(projectId, chunk);
      response.items.forEach((item) => merged.add(item));
    }
    const items = Array.from(merged);
    return { total: items.length, items };
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

  adminPushResults: async (payload: VulnVerifyV2AdminPushRequest): Promise<VulnVerifyV2AdminPushResult> =>
    handleResponse(await fetch(`${BASE}/admin/results/push`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),
};
