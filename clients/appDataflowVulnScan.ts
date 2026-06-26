import { API_BASE, getHeaders, getJsonWithDedupe, handleResponse, fetchWithRetry } from './base';
import type { ServiceHealthMeta } from '../components/execution/serviceHealthMeta';
import {
  AppDfaSessionIndex,
  AppDfaServiceConfig,
  AppDfaSessionMeta,
  AppDfaSessionSnapshot,
  AppDfaStagesJson,
  AppDfaClusterCapacity,
  AppDfaTaskListStats,
  AppDfaTaskTimeline,
  AppDfaTaskCreateRequest,
  AppDfaTaskDetail,
  AppDfaTaskEvaluation,
  AppDfaTaskItem,
  AppDfaTaskResult,
} from '../types/types';

const BASE = `${API_BASE}/api/app/dataflow-vuln-scan`;

export interface DataflowVulnTraceTreeNode {
  run_id: string;
  function_name: string;
  source_file: string;
  line_hint: string;
  depth: number;
  status: string;
  taint_inputs: Array<{
    symbol: string;
    kind: string;
    line?: string;
    description?: string;
  }>;
  taint_summary: Array<{
    from_symbol: string;
    to_symbol: string;
    line: string;
    operation: string;
    evidence: string;
    termination_reason?: string;
  }>;
  child_count: number;
  followup_status: string;
  followup_reason?: string;
  findings_count: number;
  termination_reasons: string[];
  children: DataflowVulnTraceTreeNode[];
  /** Pruned branch marker */
  pruned?: boolean;
  /** Reason this branch was pruned (skipped/merged/cycle/depth_limit) */
  prune_reason?: string;
  /** Taint constraints inferred at callsite (for pruned branches) */
  taint_constraints?: Array<{
    kind: string;
    target_symbol: string;
    target_arg_index: number;
    evidence: string;
    confidence: string;
  }>;
}

export interface DataflowVulnGraphResponse {
  task_id: string;
  available: boolean;
  run_root: string;
  summary: Record<string, number>;
  trace_tree?: DataflowVulnTraceTreeNode | null;
  graph: Record<string, any>;
}

export const appDataflowVulnScanApi = {
  // ── Health ────────────────────────────────────────────────────────────────
  getHealth: async (): Promise<{ status: string } & ServiceHealthMeta> =>
    getJsonWithDedupe(`${BASE}/health`, { headers: getHeaders() }),

  // ── Tasks ─────────────────────────────────────────────────────────────────
  createTask: async (payload: AppDfaTaskCreateRequest): Promise<AppDfaTaskDetail> =>
    handleResponse(await fetchWithRetry(`${BASE}/tasks`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    }, {
      retries: 3,
      retryDelayMs: 500,
      retryOnStatus: [408, 429, 500, 502, 503, 504],
    })),

  listTasks: async (params: {
    project_id: string;
    page?: number;
    per_page?: number;
    status?: string;
    mode?: 'manual' | 'binary' | 'source';
    parent_task_id?: string;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
  }): Promise<{ items: AppDfaTaskItem[]; total: number; page: number; per_page: number }> => {
    const query = new URLSearchParams({ project_id: params.project_id });
    if (params.page) query.append('page', String(params.page));
    if (params.per_page) query.append('per_page', String(params.per_page));
    if (params.status) query.append('status', params.status);
    if (params.mode) query.append('mode', params.mode);
    if (params.parent_task_id) query.append('parent_task_id', params.parent_task_id);
    if (params.sort_by) query.append('sort_by', params.sort_by);
    if (params.sort_order) query.append('sort_order', params.sort_order);
    return getJsonWithDedupe(`${BASE}/tasks?${query.toString()}`, { headers: getHeaders() });
  },

  getTaskStats: async (params: {
    project_id: string;
    status?: string;
    mode?: 'manual' | 'binary' | 'source';
    parent_task_id?: string;
    parent_stage_item_id?: string;
  }): Promise<AppDfaTaskListStats> => {
    const query = new URLSearchParams({ project_id: params.project_id });
    if (params.status) query.append('status', params.status);
    if (params.mode) query.append('mode', params.mode);
    if (params.parent_task_id) query.append('parent_task_id', params.parent_task_id);
    if (params.parent_stage_item_id) query.append('parent_stage_item_id', params.parent_stage_item_id);
    return getJsonWithDedupe(`${BASE}/tasks/stats?${query.toString()}`, { headers: getHeaders() });
  },

  getWorkerClusterCapacity: async (): Promise<AppDfaClusterCapacity> =>
    getJsonWithDedupe(`${BASE}/workers/cluster-capacity`, { headers: getHeaders() }),

  getTask: async (taskId: string): Promise<AppDfaTaskDetail> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}`, { headers: getHeaders() })),

  getTimeline: async (taskId: string): Promise<AppDfaTaskTimeline> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/timeline`, { headers: getHeaders() })),

  clearTimeline: async (taskId: string): Promise<{ status: string; task_id: string; message: string; deleted_event_count: number }> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/timeline`, {
      method: 'DELETE',
      headers: getHeaders(),
    })),

  deleteTimelineEvent: async (taskId: string, eventId: string): Promise<{ status: string; task_id: string; message: string; deleted_event_count: number }> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/timeline/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      headers: getHeaders(),
    })),

  cancelTask: async (taskId: string): Promise<AppDfaTaskItem> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/cancel`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  deleteTask: async (taskId: string, deleteFiles = true): Promise<void> => {
    const resp = await fetch(
      `${BASE}/tasks/${encodeURIComponent(taskId)}?delete_files=${deleteFiles}`,
      { method: 'DELETE', headers: getHeaders() },
    );
    if (!resp.ok) await handleResponse(resp);
  },

  getTaskLogs: async (taskId: string): Promise<{ task_id: string; status: string; stages_json: AppDfaStagesJson }> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/logs`, { headers: getHeaders() })),

  getTaskResult: async (taskId: string): Promise<AppDfaTaskResult> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/result`, { headers: getHeaders() })),

  getTaskEvaluation: async (taskId: string): Promise<AppDfaTaskEvaluation> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/evaluation`, { headers: getHeaders() })),

  getVulnGraph: async (taskId: string): Promise<DataflowVulnGraphResponse> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/vuln-graph`, { headers: getHeaders() })),

  getVulnFindings: async (taskId: string): Promise<any> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/vuln-findings`, { headers: getHeaders() })),

  reportFinding: async (taskId: string, findingId: string): Promise<{ task_id: string; finding_id: string; report_id?: string; case_id?: string; status: string; duplicate?: boolean; error?: string }> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/vuln-findings/${encodeURIComponent(findingId)}/report`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  reportAllFindings: async (taskId: string): Promise<{ task_id: string; total_findings: number; unreported: number; results: any[] }> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/vuln-findings/report-all`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  getVulnStats: async (projectId: string): Promise<{ project_id: string; total_findings: number; reported: number; unreported: number }> =>
    getJsonWithDedupe(`${BASE}/vuln-stats?project_id=${encodeURIComponent(projectId)}`, { headers: getHeaders() }),

  reportAllProjectFindings: async (projectId: string): Promise<{ project_id: string; total_unreported: number; reported_ok: number; failed: number; results: any[] }> =>
    handleResponse(await fetch(`${BASE}/vuln-stats/report-all?project_id=${encodeURIComponent(projectId)}`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  getTasksVulnStatsBatch: async (taskIds: string[]): Promise<Record<string, { total: number; reported: number; unreported: number }>> => {
    if (!taskIds.length) return {};
    return getJsonWithDedupe(`${BASE}/tasks/vuln-stats-batch?task_ids=${encodeURIComponent(taskIds.join(','))}`, { headers: getHeaders() });
  },

  listTaskSessions: async (taskId: string): Promise<{ task_id: string; items: AppDfaSessionMeta[] }> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/sessions`, { headers: getHeaders() })),

  getTaskSessionIndex: async (taskId: string): Promise<AppDfaSessionIndex> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/sessions/index`, { headers: getHeaders() })),

  getTaskSessionFile: async (taskId: string, path: string): Promise<AppDfaSessionSnapshot> =>
    handleResponse(await fetch(
      `${BASE}/tasks/${encodeURIComponent(taskId)}/sessions/file?path=${encodeURIComponent(path)}`,
      { headers: getHeaders() },
    )),

  restartTask: async (taskId: string): Promise<AppDfaTaskDetail> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/restart`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  resumeTask: async (taskId: string): Promise<AppDfaTaskDetail> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/resume`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  generatePrompt: async (inputPath: string): Promise<{ prompt: string }> =>
    handleResponse(await fetch(`${BASE}/generate-prompt`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ input_path: inputPath }),
    })),

  // ── Config (global, shared across all projects) ───────────────────────────
  getConfig: async (): Promise<AppDfaServiceConfig> =>
    handleResponse(await fetch(`${BASE}/config`, { headers: getHeaders() })),

  saveConfig: async (config: AppDfaServiceConfig): Promise<AppDfaServiceConfig> =>
    handleResponse(await fetchWithRetry(`${BASE}/config`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ config }),
    }, { retries: 5, retryDelayMs: 800 })),

};
