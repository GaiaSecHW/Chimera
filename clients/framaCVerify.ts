import { API_BASE, fetchWithRetry, getHeaders, getJsonWithDedupe, handleResponse } from './base';
import type { ServiceHealthMeta } from '../components/execution/serviceHealthMeta';

const BASE = `${API_BASE}/api/app/frama-c`;
const TASK_CASE_IDS_QUERY_CHUNK_SIZE = 100;

export type FramaCStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled' | string;
export type FramaCVerdict = 'confirmed' | 'ruled_out' | 'unresolved' | 'unverified' | string;

export interface FramaCTaskCreateRequest {
  source_root: string;
  source_file?: string | null;
  function_name?: string | null;
  cwe_type?: string | null;
  problem_description?: string | null;
  problem_file_path?: string | null;
  threat_model_key?: string | null;
  model?: string | null;
  max_attempts?: number;
  task_key: string;
  name?: string | null;
  parent_task_id?: string | null;
  parent_task_type?: string | null;
  parent_stage_name?: string | null;
  parent_stage_item_id?: string | null;
  parent_stage_item_key?: string | null;
}

export interface FramaCAttempt {
  id: string;
  task_id: string;
  attempt_number: number;
  status: string;
  worker_id?: string | null;
  claim_expires_at?: string | null;
  scheduled_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  result?: Record<string, any> | null;
  failure_reason?: Record<string, any> | null;
  stdout?: string | null;
  stderr?: string | null;
}

export interface FramaCTask {
  id: string;
  project_id: string;
  name: string;
  source_root: string;
  source_file?: string | null;
  function_name?: string | null;
  cwe_type?: string | null;
  problem_description?: string | null;
  problem_file_path?: string | null;
  task_key: string;
  threat_model_key?: string | null;
  model?: string | null;
  max_attempts: number;
  created_by?: string | null;
  status: FramaCStatus;
  created_at?: string | null;
  updated_at?: string | null;
  parent_task_id?: string | null;
  parent_task_type?: string | null;
  parent_stage_name?: string | null;
  parent_stage_item_id?: string | null;
  parent_stage_item_key?: string | null;
}

export interface FramaCTaskDetail extends FramaCTask {
  attempts?: FramaCAttempt[];
  results?: FramaCResult[];
}

export interface FramaCResult {
  id: string;
  task_id: string;
  attempt_id?: string | null;
  verdict: FramaCVerdict;
  conclusion: string;
  ruled_out_by?: string[] | null;
  dimensions?: Record<string, { status?: boolean | null; detail?: string }> | null;
  exploitability?: {
    preconditions?: string | null;
    trigger_complexity?: string | null;
    worst_case_impact?: string | null;
  } | null;
  evidence?: Array<{ type: string; claim: string; finding: string }> | null;
  frama_c_details?: {
    eva_alarm_count?: number | null;
    wp_proof_ratio?: number | null;
    steps_completed?: number | null;
    duration_seconds?: number | null;
  } | null;
  raw_result?: Record<string, any> | null;
  created_at?: string | null;
}

export interface FramaCProjectStats {
  total_tasks: number;
  pending: number;
  running: number;
  success: number;
  failed: number;
  cancelled: number;
  total_results: number;
  confirmed: number;
  ruled_out: number;
  unresolved: number;
  unverified: number;
}

export interface FramaCTaskCaseIdsResponse {
  total: number;
  items: string[];
}

export interface FramaCArtifactItem {
  path: string;
  size: number;
}

export interface FramaCArtifactContent {
  path: string;
  offset: number;
  limit: number;
  size: number;
  content: string;
  truncated: boolean;
}

function normalizeCaseIds(caseIds?: string[] | null): string[] {
  if (!Array.isArray(caseIds)) return [];
  return caseIds
    .map((caseId) => String(caseId || '').trim())
    .filter(Boolean);
}

async function fetchTaskCaseIdsChunk(projectId: string, caseIds: string[]): Promise<FramaCTaskCaseIdsResponse> {
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

export const framaCApi = {
  getHealth: async (): Promise<{ status: string; service?: string } & ServiceHealthMeta> =>
    getJsonWithDedupe(`${BASE}/health`, { headers: getHeaders() }),

  getProjectStats: async (projectId: string): Promise<FramaCProjectStats> =>
    getJsonWithDedupe(`${BASE}/projects/${encodeURIComponent(projectId)}/stats`, { headers: getHeaders() }),

  listTasks: async (projectId: string, params?: { status?: string; verdict?: string; search?: string; limit?: number; offset?: number }): Promise<{ total: number; items: FramaCTask[] }> => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.verdict) query.set('verdict', params.verdict);
    if (params?.search) query.set('search', params.search);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    const suffix = query.toString() ? `?${query}` : '';
    return getJsonWithDedupe(`${BASE}/projects/${encodeURIComponent(projectId)}/tasks${suffix}`, { headers: getHeaders() });
  },

  listTaskCaseIds: async (projectId: string, params?: { caseIds?: string[] }): Promise<FramaCTaskCaseIdsResponse> => {
    const normalizedCaseIds = normalizeCaseIds(params?.caseIds);
    if (!normalizedCaseIds.length) {
      const response = await getJsonWithDedupe<FramaCTaskCaseIdsResponse>(`${BASE}/projects/${encodeURIComponent(projectId)}/task-case-ids`, { headers: getHeaders() });
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

  createTask: async (projectId: string, payload: FramaCTaskCreateRequest): Promise<FramaCTaskDetail> =>
    handleResponse(await fetchWithRetry(`${BASE}/projects/${encodeURIComponent(projectId)}/tasks`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    }, { retries: 2, retryDelayMs: 500, retryOnStatus: [408, 429, 500, 502, 503, 504] })),

  getTask: async (projectId: string, taskId: string): Promise<FramaCTaskDetail> =>
    handleResponse(await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`, { headers: getHeaders() })),

  getResults: async (projectId: string, taskId: string): Promise<FramaCResult[]> =>
    handleResponse(await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/results`, { headers: getHeaders() })),

  getProjectResults: async (projectId: string): Promise<FramaCResult[]> =>
    handleResponse(await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/results`, { headers: getHeaders() })),

  terminateTask: async (projectId: string, taskId: string): Promise<any> =>
    handleResponse(await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/terminate`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  deleteTask: async (projectId: string, taskId: string): Promise<any> =>
    handleResponse(await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`, {
      method: 'DELETE',
      headers: getHeaders(),
    })),

  rerunTask: async (projectId: string, taskId: string): Promise<any> =>
    handleResponse(await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/rerun`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  getArtifacts: async (projectId: string, taskId: string): Promise<{ task_id: string; items: FramaCArtifactItem[] }> =>
    getJsonWithDedupe(`${BASE}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/artifacts`, { headers: getHeaders() }),

  getArtifactContent: async (projectId: string, taskId: string, path: string, offset?: number, limit?: number): Promise<FramaCArtifactContent> => {
    const query = new URLSearchParams();
    query.set('path', path);
    if (offset) query.set('offset', String(offset));
    if (limit) query.set('limit', String(limit));
    return getJsonWithDedupe(`${BASE}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/artifacts/content?${query}`, { headers: getHeaders() });
  },

  streamTask: (projectId: string, taskId: string): EventSource =>
    new EventSource(`${BASE}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/stream`),
};
