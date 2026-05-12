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
  last_error?: string | null;
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
  medium_risk_module_count: number;
  low_risk_module_count: number;
  candidate_module_count: number;
  selected_module_count: number;
  selected_risk_levels: string[];
  module_selection_mode: 'auto' | 'manual_confirm' | string;
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
    retry_supported: boolean;
    retry_reason?: string | null;
    total_items: number;
    success_items: number;
    failed_items: number;
    skipped_items: number;
    running_items: number;
    started_at?: string | null;
    finished_at?: string | null;
    last_error?: string | null;
  }>;
  task_retry_supported: boolean;
  task_retry_reason?: string | null;
  task_continue_supported: boolean;
  task_continue_reason?: string | null;
}

export interface BinarySecurityProjectStats {
  total: number;
  running: number;
  success: number;
  partial_success: number;
  failed: number;
  cancelled: number;
  selected_module_count: number;
  candidate_module_count: number;
  high_risk_module_count: number;
  entry_count: number;
  vuln_result_count: number;
  input_count: number;
  unpacked_firmware_count: number;
  failed_firmware_count: number;
}

export interface BinarySecurityProjectStageAggregate {
  stage_name: string;
  sequence_no: number;
  business: {
    task_count: number;
    total_items: number;
    success_items: number;
    failed_items: number;
    skipped_items: number;
    running_items: number;
    cancelled_items: number;
    status_counts: Record<string, number>;
  };
  archive: {
    job_count: number;
    success_count: number;
    failed_count: number;
    running_count: number;
    applying_count: number;
    pending_count: number;
    status_counts: Record<string, number>;
  };
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
  archive_jobs: Array<{
    id: string;
    stage_name: string;
    item_id: string;
    item_key?: string | null;
    downstream_service?: string | null;
    downstream_task_id?: string | null;
    archive_status: string;
    archive_root?: string | null;
    error_message?: string | null;
    attempts: number;
    created_at?: string | null;
    started_at?: string | null;
    completed_at?: string | null;
    updated_at?: string | null;
    copy_stats?: {
      copied_files?: number;
      copied_dirs?: number;
      copied_symlinks?: number;
      skipped_errors?: number;
      error_truncated?: boolean;
      errors?: Array<{
        source?: string;
        target?: string;
        error?: string;
      }>;
    };
  }>;
  overview_nodes: BinarySecurityOverviewNode[];
}

export interface BinarySecurityOverviewBusinessDetail {
  total_items: number;
  success_items: number;
  failed_items: number;
  skipped_items: number;
  running_items: number;
  cancelled_items: number;
  downstream_status_counts: Record<string, number>;
  downstream_services: string[];
  representative_item_key?: string | null;
  representative_downstream_task_id?: string | null;
}

export interface BinarySecurityOverviewArchiveDetail {
  job_count: number;
  success_count: number;
  failed_count: number;
  running_count: number;
  applying_count: number;
  pending_count: number;
  first_created_at?: string | null;
  last_updated_at?: string | null;
  duration_seconds?: number | null;
  latest_error?: string | null;
  jobs: BinarySecurityTaskDetail['archive_jobs'];
}

export interface BinarySecurityOverviewNode {
  node_id: string;
  node_type: 'business' | 'archive' | string;
  stage_name: string;
  sequence_no: number;
  title: string;
  status: string;
  status_label: string;
  started_at?: string | null;
  finished_at?: string | null;
  updated_at?: string | null;
  last_error?: string | null;
  retry_supported: boolean;
  retry_reason?: string | null;
  detail: BinarySecurityOverviewBusinessDetail | BinarySecurityOverviewArchiveDetail;
}

export interface BinarySecurityModuleSelection {
  task_id: string;
  status: string;
  selection_mode: 'auto' | 'manual_confirm' | string;
  risk_levels: string[];
  requires_confirmation: boolean;
  system_analysis_modules: Array<Record<string, any>>;
  candidate_modules: Array<Record<string, any>>;
  selected_modules: Array<Record<string, any>>;
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

export interface BinarySecurityActionResult {
  status: string;
  task_id: string;
  message: string;
  cancelled_downstream_count?: number;
  deleted_downstream_count?: number;
  deleted_event_count?: number;
  cleanup_status?: string | null;
}

export const binarySecurityApi = {
  listTasks: async (
    projectId: string,
    status?: string,
    taskType?: BinarySecurityTaskType,
  ): Promise<{
    total: number;
    running_count: number;
    queued_count: number;
    max_concurrent_tasks: number;
    project_stats?: BinarySecurityProjectStats;
    project_stage_aggregates?: BinarySecurityProjectStageAggregate[];
    items: BinarySecurityTask[];
  }> => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (taskType) params.set('task_type', taskType);
    const q = params.size > 0 ? `?${params.toString()}` : '';
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks${q}`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    return handleResponse(resp);
  },

  getTask: async (projectId: string, taskId: string): Promise<BinarySecurityTaskDetail> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    return handleResponse(resp);
  },

  updateTaskConcurrency: async (
    projectId: string,
    taskId: string,
    payload: { stage_parallelism: Record<string, number> },
  ): Promise<BinarySecurityTaskDetail> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/concurrency`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(resp);
  },

  getTimeline: async (projectId: string, taskId: string): Promise<BinarySecurityTimeline> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/timeline`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    return handleResponse(resp);
  },

  clearTimeline: async (projectId: string, taskId: string): Promise<BinarySecurityActionResult> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/timeline`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  deleteTimelineEvent: async (projectId: string, taskId: string, eventId: string): Promise<BinarySecurityActionResult> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/timeline/${eventId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  getArtifacts: async (projectId: string, taskId: string): Promise<BinarySecurityArtifacts> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/artifacts`, {
      headers: getHeaders(),
      cache: 'no-store',
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
        module_selection_mode?: 'auto' | 'manual_confirm';
        module_risk_levels?: string[];
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

  cancelTask: async (projectId: string, taskId: string): Promise<BinarySecurityActionResult> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/cancel`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  deleteTask: async (projectId: string, taskId: string): Promise<BinarySecurityActionResult> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}`, {
      method: 'DELETE',
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

  continueTask: async (projectId: string, taskId: string): Promise<BinarySecurityActionResult> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/continue`, {
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

  syncDownstreamStatus: async (
    projectId: string,
    taskId: string,
    payload?: { stage_name?: string; item_id?: string; force?: boolean },
  ): Promise<BinarySecurityActionResult> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/sync-downstream-status`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload || {}),
    });
    return handleResponse(resp);
  },

  getModuleSelection: async (projectId: string, taskId: string): Promise<BinarySecurityModuleSelection> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/module-selection`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    return handleResponse(resp);
  },

  confirmModuleSelection: async (projectId: string, taskId: string, selectedModuleKeys: string[]): Promise<BinarySecurityTaskDetail> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/module-selection/confirm`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ selected_module_keys: selectedModuleKeys }),
    });
    return handleResponse(resp);
  },

  getProjectConfig: async (projectId: string): Promise<BinarySecurityProjectConfig> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/config`, {
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  updateProjectConfig: async (projectId: string, payload: BinarySecurityProjectConfig['config']): Promise<BinarySecurityProjectConfig> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/config`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
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
