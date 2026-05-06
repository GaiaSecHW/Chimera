import { API_BASE, getHeaders, handleResponse } from './base';

const PREFIX = `${API_BASE}/api/dataflow-vuln-scanner`;

export interface DataflowProfileConfigPayload {
  model: string;
  thinking: string;
  review_profile?: string;
  max_review_cycles: number;
  worker_timeout: number;
  advisor_timeout: number;
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
  max_concurrency: number;
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
  profile_id: string;
  profile_version: number;
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
  owner_pod_id?: string | null;
  lease_expires_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  recovery_reason?: string | null;
  message?: string | null;
  workspace_root?: string | null;
  output_manifest_path?: string | null;
  output_task_count: number;
  created_at: string;
  updated_at: string;
}

export interface DataflowScanTaskEvent {
  event_id: string;
  execution_id: string;
  attempt_no: number;
  event_type: string;
  stage_id?: string | null;
  round_no?: number | null;
  level: string;
  message: string;
  payload_json?: Record<string, any> | null;
  created_at: string;
}

export interface DataflowArtifactFile {
  path: string;
  size: number;
}

export interface DataflowTaskArtifacts {
  task_id: string;
  execution_id?: string | null;
  workspace_root?: string | null;
  output_manifest_path?: string | null;
  files: DataflowArtifactFile[];
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
  thinking?: string;
  review_profile?: string;
  max_review_cycles?: number;
  worker_timeout?: number;
  advisor_timeout?: number;
  result_review_concurrency?: number;
  scan_options?: Record<string, any>;
  artifact_refs?: DataflowArtifactRef[];
  priority?: number;
  runtime_overrides?: Record<string, any>;
}

export interface DataflowProfilePayload {
  project_id: string;
  name: string;
  description?: string;
  template_kind: string;
  config_payload: DataflowProfileConfigPayload;
  is_default: boolean;
  enabled: boolean;
  max_concurrency: number;
  default_priority: number;
  max_retry_count: number;
  execution_timeout_seconds: number;
}

export interface DataflowTaskRun {
  execution_id: string;
  task_id: string;
  attempt_no: number;
  status: string;
  started_at?: string | null;
  finished_at?: string | null;
  message?: string | null;
  workspace_root?: string | null;
  output_manifest_path?: string | null;
  output_task_count: number;
  created_at: string;
  updated_at: string;
  run_summary?: Record<string, any>;
}

export interface DataflowRunFile {
  category: string;
  path: string;
  name: string;
  size: number;
  mtime: number;
  type: string;
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

  listTaskAttempts: async (taskId: string): Promise<DataflowScanTaskAttempt[]> => {
    const response = await fetch(`${PREFIX}/tasks/${encodeURIComponent(taskId)}/attempts`, { headers: getHeaders() });
    return unwrapList<DataflowScanTaskAttempt>(await handleResponse(response));
  },

  listTaskEvents: async (taskId: string): Promise<DataflowScanTaskEvent[]> => {
    const response = await fetch(`${PREFIX}/tasks/${encodeURIComponent(taskId)}/events`, { headers: getHeaders() });
    return unwrapList<DataflowScanTaskEvent>(await handleResponse(response));
  },

  getTaskArtifacts: async (taskId: string): Promise<DataflowTaskArtifacts> => {
    const response = await fetch(`${PREFIX}/tasks/${encodeURIComponent(taskId)}/artifacts`, { headers: getHeaders() });
    return handleResponse(response);
  },

  listTaskRuns: async (taskId: string): Promise<DataflowTaskRun[]> => {
    const response = await fetch(`${PREFIX}/tasks/${encodeURIComponent(taskId)}/runs`, { headers: getHeaders() });
    return unwrapList<DataflowTaskRun>(await handleResponse(response));
  },

  getTaskRun: async (taskId: string, executionId: string): Promise<Record<string, any>> => {
    const response = await fetch(`${PREFIX}/tasks/${encodeURIComponent(taskId)}/runs/${encodeURIComponent(executionId)}`, { headers: getHeaders() });
    return handleResponse(response);
  },

  getTaskRunCycle: async (taskId: string, executionId: string, cycle: number): Promise<Record<string, any>> => {
    const response = await fetch(`${PREFIX}/tasks/${encodeURIComponent(taskId)}/runs/${encodeURIComponent(executionId)}/cycles/${cycle}`, { headers: getHeaders() });
    return handleResponse(response);
  },

  listTaskRunSessions: async (taskId: string, executionId: string): Promise<Record<string, any>[]> => {
    const response = await fetch(`${PREFIX}/tasks/${encodeURIComponent(taskId)}/runs/${encodeURIComponent(executionId)}/sessions`, { headers: getHeaders() });
    return unwrapList<Record<string, any>>(await handleResponse(response));
  },

  listTaskRunFiles: async (taskId: string, executionId: string, limit = 1200): Promise<DataflowRunFile[]> => {
    const response = await fetch(withQuery(`${PREFIX}/tasks/${encodeURIComponent(taskId)}/runs/${encodeURIComponent(executionId)}/files`, { limit }), { headers: getHeaders() });
    return unwrapList<DataflowRunFile>(await handleResponse(response));
  },

  getTaskRunFile: async (taskId: string, executionId: string, path: string): Promise<Record<string, any>> => {
    const response = await fetch(withQuery(`${PREFIX}/tasks/${encodeURIComponent(taskId)}/runs/${encodeURIComponent(executionId)}/file`, { path }), { headers: getHeaders() });
    return handleResponse(response);
  },

  getTaskRunSessionFile: async (taskId: string, executionId: string, path: string): Promise<Record<string, any>> => {
    const response = await fetch(withQuery(`${PREFIX}/tasks/${encodeURIComponent(taskId)}/runs/${encodeURIComponent(executionId)}/session-file`, { path }), { headers: getHeaders() });
    return handleResponse(response);
  },

  getTaskRunLog: async (taskId: string, executionId: string, lines = 300): Promise<{ content: string }> => {
    const response = await fetch(withQuery(`${PREFIX}/tasks/${encodeURIComponent(taskId)}/runs/${encodeURIComponent(executionId)}/log`, { lines }), { headers: getHeaders() });
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

  requeueTask: async (taskId: string): Promise<DataflowScanTask> => {
    const response = await fetch(`${PREFIX}/tasks/${encodeURIComponent(taskId)}/requeue`, {
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
