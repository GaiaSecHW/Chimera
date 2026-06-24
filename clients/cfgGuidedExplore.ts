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

const BASE = `${API_BASE}/api/app/cfg-guided-explore`;

// ── Agent execution trace (parsed from worker main_*.log) ────────────────────
export interface CfgAgentTraceStep {
  ts: string;
  label: string;
  detail: string;
}

export interface CfgAgentTraceEntryCandidate {
  func_id?: string;
  name?: string;
  signature?: string;
  file?: string;
  start_line?: number;
  end_line?: number;
}

export interface CfgAgentSession {
  log_file?: string;
  model?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  llm_duration_sec?: number | null;
  vuln_count?: number | null;
  entry_candidates: CfgAgentTraceEntryCandidate[];
  steps: CfgAgentTraceStep[];
}

export interface CfgAgentTraceResponse {
  task_id: string;
  available: boolean;
  agent_session?: CfgAgentSession | null;
}

// ── cparser4cm session.json (the real audit-walk record) ─────────────────────
/** One codemap tool invocation. `result` (callees/callers) is present only on
 *  tasks run after the image-layer call-graph override; older tasks omit it. */
export interface CfgCodemapQuery {
  command: 'getfunctioninfo' | 'getcallee' | 'getcaller' | string;
  function_id: string;
  params: { func?: string | null; file?: string | null } & Record<string, any>;
  timestamp: string;
  result?: {
    callees?: Array<{ id?: string; function_id?: string; name?: string; signature?: string; file_path?: string; call_line?: number } & Record<string, any>>;
    callers?: Array<{ id?: string; function_id?: string; name?: string; signature?: string; file_path?: string; call_line?: number } & Record<string, any>>;
  } & Record<string, any>;
}

export interface CfgFunctionTaintState {
  function: string;
  tainted_params_in: string[];
  via_call_chain: any[];
  desc: string;
  analyzed: boolean;
}

export interface CfgAuditResult {
  function: string;
  result: string; // 'safe' | 'vulnerable' | ...
  vuln_line: number;
  confidence: number | null;
  desc: string;
  timestamp: string;
}

export interface CfgCparserSession {
  version: string;
  session_id: string;
  created_at: string;
  updated_at: string;
  project: Record<string, any>;
  codemap_function_resolutions: Record<string, any>;
  codemap_queries: CfgCodemapQuery[];
  function_taint_states: Record<string, CfgFunctionTaintState>;
  audit_results: Record<string, CfgAuditResult>;
}

export interface CfgWalkFunction {
  function_id: string;
  callees?: { id: string; name?: string | null; call_line?: number | null }[];
  name: string;
  signature?: string | null;
  file_path?: string | null;
  start_line?: number | null;
  end_line?: number | null;
  code?: {
    file?: string;
    abs_path?: string;
    start_line: number;
    end_line: number;
    focus_line?: number | null;
    lines: { n: number; text: string }[];
  } | null;
  resolved: boolean;
}

export interface CfgWalkFunctionsResponse {
  task_id: string;
  available: boolean;
  upload_id: string;
  resolved_count: number;
  functions: CfgWalkFunction[];
}

export const cfgGuidedExploreApi = {
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

  getAgentTrace: async (taskId: string): Promise<CfgAgentTraceResponse> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/sessions/agent-trace`, { headers: getHeaders() })),

  // The cparser4cm session.json — the real audit walk (tool queries, taint
  // states, per-function verdicts). Served raw via the session-file endpoint.
  getCparserSession: async (taskId: string): Promise<CfgCparserSession> =>
    handleResponse(await fetch(
      `${BASE}/tasks/${encodeURIComponent(taskId)}/sessions/file?path=${encodeURIComponent(`cparser_sessions/${taskId}/session.json`)}`,
      { headers: getHeaders() },
    )),

  // Resolve walked fids → real name/signature/code via codemap-manager + disk.
  getWalkFunctions: async (taskId: string): Promise<CfgWalkFunctionsResponse> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/walk-functions`, { headers: getHeaders() })),

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

  // ── Config ────────────────────────────────────────────────────────────────
  getConfig: async (projectId: string): Promise<AppDfaServiceConfig> =>
    handleResponse(await fetch(`${BASE}/config?project_id=${encodeURIComponent(projectId)}`, { headers: getHeaders() })),

  saveConfig: async (config: AppDfaServiceConfig): Promise<AppDfaServiceConfig> =>
    handleResponse(await fetchWithRetry(`${BASE}/config`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ project_id: config.project_id, config }),
    }, { retries: 5, retryDelayMs: 800 })),

};
