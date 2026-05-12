import { API_BASE, getHeaders, handleResponse } from './base';

export interface BinaryEvolutionPreviewSource {
  source_task_id: string;
  source_execution_id?: string | null;
  source_run_id?: string | null;
  source_title?: string | null;
  selected_case_ids: string[];
  all_case_ids: string[];
  auto_expanded_case_ids: string[];
  blocked_reasons: string[];
  replay_ready: boolean;
  replay_reason?: string | null;
  source_task_summary: Record<string, any>;
}

export interface BinaryEvolutionPreviewResponse {
  project_id: string;
  requested_case_ids: string[];
  effective_case_ids: string[];
  can_create: boolean;
  blocked_reasons: string[];
  sources: BinaryEvolutionPreviewSource[];
}

export interface BinaryEvolutionTaskSummary {
  task_id: string;
  project_id: string;
  title: string;
  status: string;
  objective?: string | null;
  metrics: Record<string, any>;
  current_round: number;
  best_round?: number | null;
  overall_score?: number | null;
  convergence_reason?: string | null;
  apply_status: string;
  source_task_ids: string[];
  source_case_ids: string[];
  config: Record<string, any>;
  message?: string | null;
  created_by: string;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  updated_at: string;
}

export interface BinaryEvolutionRound {
  round_no: number;
  status: string;
  metrics: Record<string, any>;
  score?: number | null;
  score_reason?: string | null;
  adjustment_summary?: string | null;
  convergence_decision?: boolean | null;
  convergence_reason?: string | null;
  derived_tasks: Array<Record<string, any>>;
  diff_summary: Record<string, any>;
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BinaryEvolutionTaskDetail extends BinaryEvolutionTaskSummary {
  preview: BinaryEvolutionPreviewResponse;
  agent_state_roots: Record<string, string>;
  default_agent_source_dirs: Record<string, string>;
  sources: Array<Record<string, any>>;
  rounds: BinaryEvolutionRound[];
  artifacts: Array<Record<string, any>>;
  events: Array<Record<string, any>>;
}

export interface BinaryEvolutionConfigPayload {
  max_concurrent_tasks: number;
  max_concurrent_source_tasks: number;
  default_min_rounds: number;
  default_max_rounds: number;
  evolution_agent_model: string;
  evolution_agent_timeout_seconds: number;
  evolution_agent_context_window: number;
}

export interface BinaryEvolutionConfigResponse {
  config: BinaryEvolutionConfigPayload;
  updated_at?: string | null;
}

export interface BinaryEvolutionCreatePayload {
  case_ids: string[];
  title: string;
  objective?: string;
  metrics?: Record<string, boolean>;
  min_rounds?: number;
  max_rounds?: number;
  max_concurrent_source_tasks?: number;
  profile_id?: string;
  model?: string;
  provider?: string;
  review_profile?: string;
  agent_run_timeout_seconds?: number;
}

const basePath = `${API_BASE}/api/app/binary-evolution`;

export const binaryEvolutionApi = {
  getHealth: async (): Promise<Record<string, any>> =>
    handleResponse(await fetch(`${basePath}/health`, { headers: getHeaders() })),

  getConfig: async (): Promise<BinaryEvolutionConfigResponse> =>
    handleResponse(await fetch(`${basePath}/config`, { headers: getHeaders() })),

  updateConfig: async (payload: BinaryEvolutionConfigPayload): Promise<BinaryEvolutionConfigResponse> =>
    handleResponse(await fetch(`${basePath}/config`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  previewTask: async (projectId: string, caseIds: string[]): Promise<BinaryEvolutionPreviewResponse> =>
    handleResponse(await fetch(`${basePath}/projects/${encodeURIComponent(projectId)}/tasks/preview`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ case_ids: caseIds }),
    })),

  createTask: async (projectId: string, payload: BinaryEvolutionCreatePayload): Promise<BinaryEvolutionTaskSummary> =>
    handleResponse(await fetch(`${basePath}/projects/${encodeURIComponent(projectId)}/tasks`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  listTasks: async (projectId: string): Promise<BinaryEvolutionTaskSummary[]> =>
    handleResponse(await fetch(`${basePath}/projects/${encodeURIComponent(projectId)}/tasks`, { headers: getHeaders() })),

  getTask: async (projectId: string, taskId: string): Promise<BinaryEvolutionTaskDetail> =>
    handleResponse(await fetch(`${basePath}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`, { headers: getHeaders() })),

  listRounds: async (projectId: string, taskId: string): Promise<BinaryEvolutionRound[]> =>
    handleResponse(await fetch(`${basePath}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/rounds`, { headers: getHeaders() })),

  applyTask: async (projectId: string, taskId: string): Promise<{ status: string; task_id: string; snapshot_path?: string | null; message: string }> =>
    handleResponse(await fetch(`${basePath}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/apply`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  deleteTask: async (projectId: string, taskId: string): Promise<{ success: boolean; message: string }> =>
    handleResponse(await fetch(`${basePath}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`, {
      method: 'DELETE',
      headers: getHeaders(),
    })),
};
