import { API_BASE, getHeaders, handleResponse } from './base';
import {
  ProjectFilesystemChildrenResponse,
  ProjectFilesystemRootResponse,
} from '../types/types';

const PREFIX = `${API_BASE}/api/dataflow-vuln-scanner`;

export interface DataflowProfileConfigPayload {
  model: string;
  review_profile?: string;
  max_review_cycles: number;
  worker_timeout?: number;
  advisor_timeout?: number;
  timeout_max_retries?: number;
  timeout_retry_interval_seconds?: number;
  result_review_concurrency: number;
  runtime_overrides: Record<string, any>;
}

export interface DataflowScanProfile {
  profile_id: string;
  project_id: string;
  name: string;
  description?: string | null;
  template_kind: string;
  config_payload: DataflowProfileConfigPayload;
  compiled_config: Record<string, any>;
  is_default: boolean;
  enabled: boolean;
  default_priority: number;
  max_retry_count: number;
  execution_timeout_seconds: number;
  created_by: string;
  updated_by: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface DataflowScanProfileVersion {
  version_id: string;
  profile_id: string;
  version: number;
  config_payload: DataflowProfileConfigPayload;
  compiled_config: Record<string, any>;
  created_by: string;
  created_at: string;
}

export interface DataflowArtifactRef {
  storage_key: string;
  relative_path?: string | null;
  filename?: string | null;
  metadata?: Record<string, any>;
}

export interface DataflowInputRef {
  source: 'project_filesystem' | 'fileserver_storage' | 'absolute_path' | string;
  path?: string | null;
  storage_key?: string | null;
  relative_path?: string | null;
  filename?: string | null;
  metadata?: Record<string, any>;
}

export interface DataflowScanTask {
  task_id: string;
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
  profile_id: string;
  profile_version: number;
  title?: string;
  status: string;
  latest_attempt_no: number;
  retry_count: number;
  max_retry_count: number;
  priority: number;
  created_by: string;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  message?: string | null;
  latest_execution_id?: string | null;
  run_name?: string | null;
  runs_root?: string | null;
  run_path?: string | null;
  run?: Partial<DataflowRunSummary> | null;
  latest_run?: Partial<DataflowRunSummary> | null;
}

export interface DataflowScanTaskDetail extends DataflowScanTask {
  title: string;
  task_markdown: string;
  artifact_refs: DataflowArtifactRef[];
  runtime_overrides: Record<string, any>;
  task_metadata?: Record<string, any>;
  attempts: DataflowScanTaskAttempt[];
}

export interface DataflowScanTaskAttempt {
  execution_id: string;
  task_id: string;
  attempt_no: number;
  status: string;
  run_id?: string | null;
  owner_pod_id?: string | null;
  process_pid?: number | null;
  process_host?: string | null;
  process_status?: string | null;
  process_started_at?: string | null;
  process_finished_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  recovery_reason?: string | null;
  message?: string | null;
  workspace_root?: string | null;
  output_manifest_path?: string | null;
  output_task_count: number;
  command?: string[];
  command_display?: string;
  created_at: string;
  updated_at: string;
}

export interface DataflowEffectiveConfig {
  project_id: string;
  default_profile_id?: string | null;
  effective_config: Record<string, any>;
}

export interface DataflowServiceEffectiveConfig {
  service_name: string;
  api_prefix: string;
  config: Record<string, any>;
}

export interface DataflowSchedulerWorker {
  pod_id: string;
  host_name: string;
  capacity: number;
  running_count: number;
  last_heartbeat_at?: string | null;
  status: string;
  metadata_json?: Record<string, any> | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface DataflowCreateTaskPayload {
  project_id: string;
  profile_id?: string;
  title: string;
  task_markdown?: string;
  workspace_dir?: DataflowInputRef;
  data_flow?: DataflowInputRef;
  source_dir?: DataflowInputRef;
  output_dir?: DataflowInputRef;
  model?: string;
  provider?: string;
  review_profile?: string;
  max_review_cycles?: number;
  timeout_max_retries?: number;
  timeout_retry_interval_seconds?: number;
  result_review_concurrency?: number;
  scan_options?: Record<string, any>;
  artifact_refs?: DataflowArtifactRef[];
  priority?: number;
  runtime_overrides?: Record<string, any>;
  task_origin_type?: 'manual' | 'binary_security';
  parent_project_id?: string;
  parent_task_id?: string;
  parent_task_type?: 'binary' | 'source';
  parent_stage_name?: string;
  parent_stage_item_id?: string;
  parent_stage_item_key?: string;
}

export interface DataflowProfilePayload {
  project_id: string;
  name: string;
  description?: string;
  template_kind: string;
  config_payload: DataflowProfileConfigPayload;
  is_default: boolean;
  enabled: boolean;
  default_priority: number;
  max_retry_count: number;
  execution_timeout_seconds: number;
}

export interface DataflowRunFile {
  category: string;
  path: string;
  name: string;
  size: number;
  mtime: number;
  type: string;
}

export interface DataflowRunProcessState {
  can_retry?: boolean;
  is_running?: boolean;
  is_queued?: boolean;
  reason?: string;
  source?: string;
  checked_at?: string;
  stale_after_seconds?: number;
  heartbeat_at?: string;
  heartbeat_age_seconds?: number | null;
  pid?: number | string | null;
  pod_id?: string | null;
  run_status?: string;
  trigger_status?: string;
  execution_status?: string;
  process_status?: string;
  [key: string]: any;
}

export interface DataflowRunSummary {
  run_id: string;
  project_id: string;
  source_type: string;
  source_key: string;
  linked_task_id?: string | null;
  linked_execution_id?: string | null;
  profile_id?: string | null;
  name: string;
  path: string;
  root_path: string;
  status: string;
  start_time: string;
  start_epoch: number;
  duration_seconds: number;
  last_activity: string;
  model: string;
  provider: string;
  thinking: string;
  review_profile: string;
  max_cycles: number;
  cycles_used: number;
  result_count: number;
  passed_count: number;
  failed_count: number;
  workflow_mode: string;
  updated_at?: string | null;
  process_state?: DataflowRunProcessState;
  retry_command_display?: string | null;
}

export interface DataflowRunSession {
  session_id: string;
  format: string;
  worker_id?: string;
  jsonl_path?: string;
  size: number;
  mtime: number;
  event_count?: number;
  line_count?: number;
  warnings?: string[];
  display_name?: string;
  stage_group?: string;
  role_name?: string;
  watch_project_path?: string;
  model?: string;
  raw_model?: string;
  provider?: string;
  thinking?: string;
  calls: Record<string, any>[];
}

export interface DataflowRunDetail extends DataflowRunSummary {
  config: Record<string, any>;
  error?: string | null;
  cycles: Record<string, any>[];
  results: Record<string, any>[];
  removed_results: Record<string, any>[];
  manifests: Record<string, any>;
  latest_issues: Record<string, any>[];
  atomic_work_path: string;
  files: DataflowRunFile[];
  sessions: DataflowRunSession[];
  run_log: string;
  command?: string[];
  command_display?: string;
  raw: Record<string, any>;
}

export interface DataflowRunCycle {
  cycle: number;
  global_reviews: Record<string, any>[];
  result_reviews: Record<string, any>[];
  summary_snapshot: string;
  metrics: Record<string, any>;
}

export interface DataflowRunResolve {
  run_id: string;
  project_id: string;
  run_name: string;
  root_path: string;
  source_type: string;
  linked_task_id?: string | null;
  linked_execution_id?: string | null;
}

export interface DataflowRunMutationResponse {
  success: boolean;
  run_id: string;
  project_id: string;
  status: string;
  message: string;
  linked_task_id?: string | null;
  linked_execution_id?: string | null;
  process_pid?: number | null;
  process_host?: string | null;
  process_signal?: string | null;
}

export interface DataflowRunRetryPayload {
  extra_cycles?: number;
  model?: string | null;
  provider?: string | null;
  clean_workspace?: boolean;
}

const withQuery = (path: string, params: Record<string, string | number | undefined | null>) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      query.set(key, String(value));
    }
  });
  const text = query.toString();
  return text ? `${path}?${text}` : path;
};

const unwrapList = <T,>(payload: unknown): T[] => {
  if (Array.isArray(payload)) return payload as T[];
  if (!payload || typeof payload !== 'object') return [];

  const envelope = payload as Record<string, unknown>;
  const candidates = [
    envelope.items,
    envelope.data,
    envelope.results,
    envelope.records,
    envelope.rows,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as T[];
    if (candidate && typeof candidate === 'object') {
      const nested = candidate as Record<string, unknown>;
      if (Array.isArray(nested.items)) return nested.items as T[];
      if (Array.isArray(nested.data)) return nested.data as T[];
      if (Array.isArray(nested.results)) return nested.results as T[];
      if (Array.isArray(nested.records)) return nested.records as T[];
      if (Array.isArray(nested.rows)) return nested.rows as T[];
    }
  }

  return [];
};

export const dataflowVulnScannerApi = {
  getCapabilities: async (): Promise<Record<string, any>> => {
    const response = await fetch(`${PREFIX}/capabilities`, { headers: getHeaders() });
    return handleResponse(response);
  },

  getProjectFilesystemRoot: async (projectId: string): Promise<ProjectFilesystemRootResponse> => {
    const response = await fetch(withQuery(`${PREFIX}/project-filesystem/root`, { project_id: projectId }), {
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  getProjectFilesystemChildren: async (projectId: string, path: string): Promise<ProjectFilesystemChildrenResponse> => {
    const response = await fetch(withQuery(`${PREFIX}/project-filesystem/children`, { project_id: projectId, path }), {
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  listTasks: async (params: { projectId?: string; status?: string; profileId?: string } = {}): Promise<DataflowScanTask[]> => {
    const response = await fetch(withQuery(`${PREFIX}/tasks`, {
      project_id: params.projectId,
      status: params.status,
      profile_id: params.profileId,
    }), { headers: getHeaders() });
    return unwrapList<DataflowScanTask>(await handleResponse(response));
  },

  createTask: async (payload: DataflowCreateTaskPayload): Promise<DataflowScanTask> => {
    const response = await fetch(`${PREFIX}/tasks`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  getTask: async (taskId: string): Promise<DataflowScanTaskDetail> => {
    const response = await fetch(`${PREFIX}/tasks/${encodeURIComponent(taskId)}`, { headers: getHeaders() });
    return handleResponse(response);
  },

  listRuns: async (projectId: string): Promise<DataflowRunSummary[]> => {
    const response = await fetch(withQuery(`${PREFIX}/runs`, { project_id: projectId }), { headers: getHeaders() });
    return unwrapList<DataflowRunSummary>(await handleResponse(response));
  },

  resolveRun: async (projectId: string, runName: string, rootPath: string): Promise<DataflowRunResolve> => {
    const response = await fetch(withQuery(`${PREFIX}/runs/resolve`, {
      project_id: projectId,
      run_name: runName,
      root_path: rootPath,
    }), { headers: getHeaders() });
    return handleResponse(response);
  },

  resolveRunByTask: async (projectId: string, taskId: string, executionId?: string | null): Promise<DataflowRunResolve> => {
    const response = await fetch(withQuery(`${PREFIX}/runs/by-task`, {
      project_id: projectId,
      task_id: taskId,
      execution_id: executionId || undefined,
    }), { headers: getHeaders() });
    return handleResponse(response);
  },

  getRun: async (runId: string): Promise<DataflowRunDetail> => {
    const response = await fetch(`${PREFIX}/runs/${encodeURIComponent(runId)}`, { headers: getHeaders() });
    return handleResponse(response);
  },

  getRunCycle: async (runId: string, cycle: number): Promise<DataflowRunCycle> => {
    const response = await fetch(`${PREFIX}/runs/${encodeURIComponent(runId)}/cycles/${cycle}`, { headers: getHeaders() });
    return handleResponse(response);
  },

  listRunSessions: async (runId: string): Promise<DataflowRunSession[]> => {
    const response = await fetch(`${PREFIX}/runs/${encodeURIComponent(runId)}/sessions`, { headers: getHeaders() });
    return unwrapList<DataflowRunSession>(await handleResponse(response));
  },

  listRunFiles: async (runId: string, limit = 1200): Promise<DataflowRunFile[]> => {
    const response = await fetch(withQuery(`${PREFIX}/runs/${encodeURIComponent(runId)}/files`, { limit }), { headers: getHeaders() });
    return unwrapList<DataflowRunFile>(await handleResponse(response));
  },

  getRunFile: async (runId: string, path: string): Promise<{ path: string; type: string; content: string }> => {
    const response = await fetch(withQuery(`${PREFIX}/runs/${encodeURIComponent(runId)}/file`, { path }), { headers: getHeaders() });
    return handleResponse(response);
  },

  getRunSessionFile: async (runId: string, path: string): Promise<Record<string, any>> => {
    const response = await fetch(withQuery(`${PREFIX}/runs/${encodeURIComponent(runId)}/session-file`, { path }), { headers: getHeaders() });
    return handleResponse(response);
  },

  getRunLog: async (runId: string, lines = 300): Promise<{ content: string }> => {
    const response = await fetch(withQuery(`${PREFIX}/runs/${encodeURIComponent(runId)}/log`, { lines }), { headers: getHeaders() });
    return handleResponse(response);
  },

  adoptRun: async (runId: string): Promise<DataflowRunMutationResponse> => {
    const response = await fetch(`${PREFIX}/runs/${encodeURIComponent(runId)}/adopt`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  cancelRun: async (runId: string): Promise<DataflowRunMutationResponse> => {
    const response = await fetch(`${PREFIX}/runs/${encodeURIComponent(runId)}/cancel`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  retryRun: async (runId: string, payload: DataflowRunRetryPayload = {}): Promise<DataflowRunMutationResponse> => {
    const response = await fetch(`${PREFIX}/runs/${encodeURIComponent(runId)}/retry`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  deleteRun: async (runId: string): Promise<DataflowRunMutationResponse> => {
    const response = await fetch(`${PREFIX}/runs/${encodeURIComponent(runId)}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  cancelTask: async (taskId: string): Promise<DataflowScanTask> => {
    const response = await fetch(`${PREFIX}/tasks/${encodeURIComponent(taskId)}/cancel`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  retryTask: async (taskId: string): Promise<DataflowScanTask> => {
    const response = await fetch(`${PREFIX}/tasks/${encodeURIComponent(taskId)}/retry`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  updatePriority: async (taskId: string, priority: number): Promise<DataflowScanTask> => {
    const response = await fetch(`${PREFIX}/tasks/${encodeURIComponent(taskId)}/priority`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ priority }),
    });
    return handleResponse(response);
  },

  listProfiles: async (projectId?: string): Promise<DataflowScanProfile[]> => {
    const response = await fetch(withQuery(`${PREFIX}/profiles`, { project_id: projectId }), { headers: getHeaders() });
    return unwrapList<DataflowScanProfile>(await handleResponse(response));
  },

  getProfile: async (profileId: string): Promise<DataflowScanProfile> => {
    const response = await fetch(`${PREFIX}/profiles/${encodeURIComponent(profileId)}`, { headers: getHeaders() });
    return handleResponse(response);
  },

  createProfile: async (payload: DataflowProfilePayload): Promise<DataflowScanProfile> => {
    const response = await fetch(`${PREFIX}/profiles`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  updateProfile: async (profileId: string, payload: Partial<DataflowProfilePayload>): Promise<DataflowScanProfile> => {
    const response = await fetch(`${PREFIX}/profiles/${encodeURIComponent(profileId)}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  enableProfile: async (profileId: string): Promise<DataflowScanProfile> => {
    const response = await fetch(`${PREFIX}/profiles/${encodeURIComponent(profileId)}/enable`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  disableProfile: async (profileId: string): Promise<DataflowScanProfile> => {
    const response = await fetch(`${PREFIX}/profiles/${encodeURIComponent(profileId)}/disable`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  setDefaultProfile: async (profileId: string): Promise<DataflowScanProfile> => {
    const response = await fetch(`${PREFIX}/profiles/${encodeURIComponent(profileId)}/set-default`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  listProfileVersions: async (profileId: string): Promise<DataflowScanProfileVersion[]> => {
    const response = await fetch(`${PREFIX}/profiles/${encodeURIComponent(profileId)}/versions`, { headers: getHeaders() });
    return unwrapList<DataflowScanProfileVersion>(await handleResponse(response));
  },

  getProjectEffectiveConfig: async (projectId: string): Promise<DataflowEffectiveConfig> => {
    const response = await fetch(`${PREFIX}/projects/${encodeURIComponent(projectId)}/config/effective`, { headers: getHeaders() });
    return handleResponse(response);
  },

  getServiceEffectiveConfig: async (): Promise<DataflowServiceEffectiveConfig> => {
    const response = await fetch(`${PREFIX}/service/config/effective`, { headers: getHeaders() });
    return handleResponse(response);
  },

  listWorkers: async (): Promise<DataflowSchedulerWorker[]> => {
    const response = await fetch(`${PREFIX}/admin/scheduler/workers`, { headers: getHeaders() });
    return unwrapList<DataflowSchedulerWorker>(await handleResponse(response));
  },

  drainWorker: async (podId: string): Promise<{ message: string }> => {
    const response = await fetch(`${PREFIX}/admin/scheduler/workers/${encodeURIComponent(podId)}/drain`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  activateWorker: async (podId: string): Promise<{ message: string }> => {
    const response = await fetch(`${PREFIX}/admin/scheduler/workers/${encodeURIComponent(podId)}/activate`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },
};
