import { API_BASE, getHeaders, handleResponse } from './base';

export interface B2SElfTaskInput {
  elf_path: string;
  file_list: string[];
  output_subdir?: string;
  metadata?: Record<string, any>;
}

export type B2SRunMode = 'fast' | 'deep';

export interface B2STaskCreatePayload {
  task_id?: string;
  name: string;
  description?: string;
  priority?: number;
  tags?: string[];
  llm_provider_key?: string;
  concurrency?: number;
  mode?: B2SRunMode;
  task_origin_type?: 'manual' | 'binary_security';
  parent_project_id?: string;
  parent_task_id?: string;
  parent_task_type?: 'binary' | 'source';
  parent_stage_name?: string;
  parent_stage_item_id?: string;
  parent_stage_item_key?: string;
  elf_tasks: B2SElfTaskInput[];
}

export interface B2SLlmProviderSummary {
  provider_key: string;
  display_name?: string;
  provider_type?: string;
  enabled: boolean;
  is_default: boolean;
  model?: string;
}

export interface B2STask {
  id: string;
  project_id: string;
  task_origin_type?: string | null;
  parent_project_id?: string | null;
  parent_task_id?: string | null;
  parent_task_type?: string | null;
  parent_stage_name?: string | null;
  parent_stage_item_id?: string | null;
  parent_stage_item_key?: string | null;
  origin_label?: string | null;
  parent_task_display?: string | null;
  mode?: string | null;
  mode_label?: string | null;
  name: string;
  status: string;
  total_items: number;
  pending_items: number;
  queued_items: number;
  running_items: number;
  success_items: number;
  partial_items: number;
  failed_items: number;
  cancelled_items: number;
  created_at?: string;
  updated_at?: string;
}

export interface B2SProgress {
  phase?: string;
  raw_phase?: string;
  phase_label?: string;
  message?: string;
  total_functions?: number;
  completed_functions?: number;
  total_bytes?: number;
  completed_bytes?: number;
  total_batches?: number;
  completed_batches?: number;
  current_batch?: number;
  current_attempt?: number;
  current_function?: string;
  percent?: number;
  bytes_percent?: number;
  batches_percent?: number;
}

export interface B2SOverallProgress {
  total_items: number;
  completed_items: number;
  total_functions?: number;
  completed_functions?: number;
  total_bytes?: number;
  completed_bytes?: number;
  total_batches?: number;
  completed_batches?: number;
  percent?: number;
  phase_summary?: Record<string, number>;
}

export interface B2SAdvancedFile {
  name: string;
  path: string;
  kind: string;
  size: number;
  content?: string | null;
  truncated?: boolean;
}

export interface B2SAdvancedBatch {
  name: string;
  batch_no?: number | null;
  source?: B2SAdvancedFile | null;
  disasm?: B2SAdvancedFile | null;
  reviews: B2SAdvancedFile[];
  review_snapshots: B2SAdvancedFile[];
}

export interface B2SAdvancedRun {
  name: string;
  path: string;
  batches: B2SAdvancedBatch[];
  agent_sessions: B2SAdvancedFile[];
  files: B2SAdvancedFile[];
}

export interface B2STaskItemAdvanced {
  task_id: string;
  item_id: string;
  sequence_no: number;
  mode?: string | null;
  mode_label?: string | null;
  output_dir: string;
  work_dir?: string | null;
  runs: B2SAdvancedRun[];
  ida_files: B2SAdvancedFile[];
}

export interface B2STaskDetail extends B2STask {
  overall_progress?: B2SOverallProgress;
  items: Array<{
    id: string;
    sequence_no: number;
    elf_path: string;
    output_dir: string;
    status: string;
    phase?: string;
    phase_label?: string;
    phase_message?: string;
    progress?: B2SProgress;
    failure_type?: string;
    error_reason?: string;
    generated_files: string[];
    started_at?: string;
    finished_at?: string;
  }>;
}

export const binaryToSourceApi = {
  listTasks: async (projectId: string, status?: string): Promise<{ total: number; items: B2STask[] }> => {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    const resp = await fetch(`${API_BASE}/api/app/binary-to-source/projects/${projectId}/tasks${q}`, {
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  getTask: async (projectId: string, taskId: string): Promise<B2STaskDetail> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-to-source/projects/${projectId}/tasks/${taskId}`, {
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  listLlmProviders: async (projectId: string): Promise<{ items: B2SLlmProviderSummary[]; total: number; default_provider_key?: string | null }> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-to-source/projects/${projectId}/llm-providers`, {
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  prepareTask: async (projectId: string): Promise<{ task_id: string }> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-to-source/projects/${projectId}/tasks/prepare`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  createTask: async (projectId: string, payload: B2STaskCreatePayload) => {
    const resp = await fetch(`${API_BASE}/api/app/binary-to-source/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(resp);
  },

  terminateTask: async (projectId: string, taskId: string) => {
    const resp = await fetch(`${API_BASE}/api/app/binary-to-source/projects/${projectId}/tasks/${taskId}/terminate`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  retryTask: async (projectId: string, taskId: string, itemIds?: string[]) => {
    const resp = await fetch(`${API_BASE}/api/app/binary-to-source/projects/${projectId}/tasks/${taskId}/retry`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ item_ids: itemIds }),
    });
    return handleResponse(resp);
  },

  deleteTask: async (projectId: string, taskId: string) => {
    const resp = await fetch(`${API_BASE}/api/app/binary-to-source/projects/${projectId}/tasks/${taskId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  getTaskItemAdvanced: async (projectId: string, taskId: string, itemId: string, includeContent = true): Promise<B2STaskItemAdvanced> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-to-source/projects/${projectId}/tasks/${taskId}/items/${itemId}/advanced?include_content=${includeContent ? 'true' : 'false'}`, {
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  rerunTask: async (projectId: string, taskId: string, options?: { clean_output?: boolean; cancel_running?: boolean }) => {
    const resp = await fetch(`${API_BASE}/api/app/binary-to-source/projects/${projectId}/tasks/${taskId}/rerun`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ clean_output: options?.clean_output ?? true, cancel_running: options?.cancel_running ?? true }),
    });
    return handleResponse(resp);
  },
};
