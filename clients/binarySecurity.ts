import { API_BASE, getHeaders, handleResponse } from './base';

export interface BinarySecurityInputFile {
  filename: string;
  size?: number;
  content_type?: string;
  relative_path?: string | null;
  metadata?: Record<string, any>;
}

export type BinarySecurityTaskType = 'binary' | 'source';

export interface BinarySecurityTask {
  id: string;
  project_id: string;
  task_type: BinarySecurityTaskType;
  name: string;
  status: string;
  current_stage?: string | null;
  firmware_path: string;
  stage_sequence: string[];
  is_queued: boolean;
  queue_position?: number | null;
  dispatcher_instance_id?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  high_risk_module_count: number;
  entry_count: number;
  vuln_result_count: number;
  firmware_item_count: number;
  unpacked_firmware_count: number;
  failed_firmware_count: number;
  stage_summaries: Array<{
    stage_name: string;
    sequence_no: number;
    status: string;
    retry_count: number;
    total_items: number;
    success_items: number;
    failed_items: number;
    skipped_items: number;
    running_items: number;
    started_at?: string | null;
    finished_at?: string | null;
    last_error?: string | null;
  }>;
}

export interface BinarySecurityTaskDetail extends BinarySecurityTask {
  description?: string | null;
  output_root: string;
  workspace_root: string;
  fileserver_subproject_name?: string | null;
  policy: Record<string, any>;
  summary: Record<string, any>;
  metrics: Record<string, any>;
  item_stats: Record<string, Record<string, number>>;
  stage_items: Array<{
    id: string;
    stage_name: string;
    item_key: string;
    item_name?: string | null;
    parent_key?: string | null;
    status: string;
    retry_count: number;
    downstream_service?: string | null;
    downstream_task_id?: string | null;
    input_ref: Record<string, any>;
    output_ref: Record<string, any>;
    result: Record<string, any>;
    error_message?: string | null;
    started_at?: string | null;
    finished_at?: string | null;
  }>;
}

export interface BinarySecurityTimeline {
  task_id: string;
  events: Array<{
    id: string;
    stage_name?: string | null;
    item_id?: string | null;
    item_key?: string | null;
    level: string;
    event_type: string;
    message: string;
    payload: Record<string, any>;
    created_at: string;
  }>;
}

export interface BinarySecurityArtifacts {
  task_id: string;
  workspace_root: string;
  output_root: string;
  fileserver_path?: string | null;
  files: Array<{ path: string; size: number }>;
}

export interface BinarySecurityProjectConfig {
  project_id: string;
  config: {
    max_stage_parallelism: number;
    max_retries_per_item: number;
    continue_on_item_failure: boolean;
    stage_parallelism: Record<string, number>;
    stage_options: Record<string, { enabled: boolean }>;
  };
}

export interface BinarySecurityServiceConfig {
  config: {
    max_concurrent_tasks: number;
    dispatch_timeout_seconds: number;
  };
}

export const binarySecurityApi = {
  listTasks: async (
    projectId: string,
    status?: string,
    taskType?: BinarySecurityTaskType,
  ): Promise<{ total: number; running_count: number; queued_count: number; max_concurrent_tasks: number; items: BinarySecurityTask[] }> => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (taskType) params.set('task_type', taskType);
    const q = params.size > 0 ? `?${params.toString()}` : '';
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks${q}`, {
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  getTask: async (projectId: string, taskId: string): Promise<BinarySecurityTaskDetail> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}`, {
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  getTimeline: async (projectId: string, taskId: string): Promise<BinarySecurityTimeline> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/timeline`, {
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  getArtifacts: async (projectId: string, taskId: string): Promise<BinarySecurityArtifacts> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/artifacts`, {
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  prepareTask: async (projectId: string): Promise<{ task_id: string }> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/prepare`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  createTask: async (
    projectId: string,
    payload: {
      task_id?: string;
      task_type?: BinarySecurityTaskType;
      name: string;
      description?: string;
      input_files: BinarySecurityInputFile[];
      output_root?: string;
      stage_options?: Record<string, { enabled: boolean }>;
      policy_overrides?: {
        max_stage_parallelism?: number;
        max_retries_per_item?: number;
        continue_on_item_failure?: boolean;
        stage_parallelism?: Record<string, number>;
      };
    },
  ): Promise<BinarySecurityTaskDetail> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(resp);
  },

  completeUploads: async (projectId: string, taskId: string, files: BinarySecurityInputFile[]): Promise<BinarySecurityTaskDetail> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/uploads/complete`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ files }),
    });
    return handleResponse(resp);
  },

  startTask: async (projectId: string, taskId: string): Promise<BinarySecurityTaskDetail> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/start`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  cancelTask: async (projectId: string, taskId: string) => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/cancel`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  retryTask: async (projectId: string, taskId: string) => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/retry`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  retryStage: async (projectId: string, taskId: string, stageName: string) => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/stages/${stageName}/retry`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  resumeTask: async (projectId: string, taskId: string) => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/resume`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  getProjectConfig: async (projectId: string): Promise<BinarySecurityProjectConfig> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/config`, {
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  getServiceConfig: async (): Promise<BinarySecurityServiceConfig> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/service/config`, {
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  updateServiceConfig: async (payload: BinarySecurityServiceConfig['config']): Promise<BinarySecurityServiceConfig> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/service/config`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(resp);
  },
};
