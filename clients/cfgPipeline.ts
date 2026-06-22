import { API_BASE, getHeaders, getJsonWithDedupe, handleResponse, fetchWithRetry } from './base';

const BASE = `${API_BASE}/api/app/cfg-guided-explore`;

// ── Types (mirror deploy/api/routers/pipelines.py response shapes) ──────────

export interface CfgPipelineEntry {
  source_id?: string;
  function_id?: string;
  function_name: string;
  source_file?: string | null;
  line?: number | null;
  end_line?: number | null;
  signature?: string | null;
  entry_point_kind?: string | null;
  channel?: string | null;
  confidence?: string | null;
  taint_params?: (number | string)[];
  reason?: string | null;
  status?: string | null;
}

export interface CfgPipelineStageEntry {
  task_id: string | null;
  status: string;
  entry_count: number;
  total_source_points: number;
  warnings: string[];
}

export interface CfgPipelineStageVuln {
  summary: { total: number; pending: number; running: number; passed: number; failed: number; cancelled: number };
  children: any[];
}

export interface CfgPipelineDetail {
  pipeline_id: string;
  project_id: string;
  name: string;
  input_path: string;
  status: string;
  created_at?: string;
  stage_sequence: string[];
  stages: {
    entry_analysis: CfgPipelineStageEntry;
    dataflow_vuln_scan: CfgPipelineStageVuln;
  };
}

export interface CfgPipelineListItem {
  pipeline_id: string;
  project_id: string;
  name: string;
  input_path: string;
  status: string;
  created_at?: string;
  entry_count: number;
  audit_child_count: number;
}

export interface CfgPipelineEntriesResponse {
  pipeline_id: string;
  stage_status: string;
  database?: string | null;
  entry_count: number;
  total_source_points: number;
  entries: CfgPipelineEntry[];
  warnings: string[];
}

export interface CfgPipelineFindings {
  pipeline_id: string;
  total_findings: number;
  by_severity: Record<string, number>;
  children: { task_id: string; function_name: string; status: string; finding_count: number }[];
}

export interface CfgPipelineCreateRequest {
  project_id: string;
  name: string;
  input_path: string;
  source_root_path?: string;
  created_by?: string;
}

// ── Client ──────────────────────────────────────────────────────────────────

export const cfgPipelineApi = {
  getHealth: async (): Promise<{ status: string }> =>
    getJsonWithDedupe(`${BASE}/health`, { headers: getHeaders() }),

  createPipeline: async (payload: CfgPipelineCreateRequest): Promise<CfgPipelineDetail> =>
    handleResponse(await fetchWithRetry(`${BASE}/pipelines`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    }, { retries: 3, retryDelayMs: 500, retryOnStatus: [408, 429, 500, 502, 503, 504] })),

  listPipelines: async (params: { project_id: string; page?: number; per_page?: number }):
    Promise<{ items: CfgPipelineListItem[]; total: number; page: number; per_page: number }> => {
    const q = new URLSearchParams({ project_id: params.project_id });
    if (params.page) q.append('page', String(params.page));
    if (params.per_page) q.append('per_page', String(params.per_page));
    return getJsonWithDedupe(`${BASE}/pipelines?${q.toString()}`, { headers: getHeaders() });
  },

  getPipeline: async (pipelineId: string): Promise<CfgPipelineDetail> =>
    handleResponse(await fetch(`${BASE}/pipelines/${encodeURIComponent(pipelineId)}`, { headers: getHeaders() })),

  getEntries: async (pipelineId: string): Promise<CfgPipelineEntriesResponse> =>
    handleResponse(await fetch(`${BASE}/pipelines/${encodeURIComponent(pipelineId)}/entries`, { headers: getHeaders() })),

  fanOut: async (pipelineId: string, entries: CfgPipelineEntry[]):
    Promise<{ pipeline_id: string; created_count: number; created_task_ids: string[] }> =>
    handleResponse(await fetchWithRetry(`${BASE}/pipelines/${encodeURIComponent(pipelineId)}/fan-out`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ entries }),
    }, { retries: 2, retryDelayMs: 500, retryOnStatus: [429, 500, 502, 503, 504] })),

  getFindings: async (pipelineId: string): Promise<CfgPipelineFindings> =>
    getJsonWithDedupe(`${BASE}/pipelines/${encodeURIComponent(pipelineId)}/findings`, { headers: getHeaders() }),
};
