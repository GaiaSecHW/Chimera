import { API_BASE, getHeaders, handleResponse } from './base';

const PREFIX = `${API_BASE}/api/app/ipc-audit`;

const withQuery = (path: string, params: Record<string, string | number | boolean | undefined | null>) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      query.set(key, String(value));
    }
  });
  const text = query.toString();
  return text ? `${path}?${text}` : path;
};

const noStoreHeaders = () => ({
  ...getHeaders(),
  'Cache-Control': 'no-cache, no-store, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
});

const noStoreGetInit = (): RequestInit => ({
  headers: noStoreHeaders(),
  cache: 'no-store',
});

const withCacheBust = (path: string) => withQuery(path, { _: Date.now() });

export interface IpcAuditCapability {
  service: string;
  runtime_mode: string;
  pipeline_modes: string[];
  executor_modes: Array<'mock' | 'codex_cli' | 'opencode_cli'>;
  default_executor_mode?: 'mock' | 'codex_cli' | 'opencode_cli' | null;
  input_kinds: string[];
  allow_custom_project_path: boolean;
  show_scan_strategy: boolean;
  supports_sessions: boolean;
  supports_sse: boolean;
  supports_poc: boolean;
  poc_runtime_available: boolean;
  default_workspace_id?: string | null;
  default_pipeline_mode?: string | null;
  artifact_kinds: string[];
  max_parallel_tasks: number;
}

export interface IpcAuditRuntimeConfig {
  max_parallel_tasks: number;
  default_max_parallel_tasks: number;
  active_attempts: number;
  updated_at?: string | null;
  updated_by?: string | null;
}

export interface IpcAuditWorkspaceSummary {
  workspace_id: string;
  display_name: string;
  allow_custom_project_path: boolean;
  supports_poc: boolean;
  default_pipeline_mode: string;
  is_default: boolean;
}

export interface IpcAuditWorkspaceTreeItem {
  name: string;
  path: string;
  kind: 'file' | 'directory';
}

export interface IpcAuditWorkspaceTree {
  workspace_id: string;
  path: string;
  items: IpcAuditWorkspaceTreeItem[];
}

export interface IpcAuditInputRef {
  kind: 'preset_project' | 'custom_project' | 'existing_audit_report';
  project_path?: string | null;
  report_path?: string | null;
}

export interface IpcAuditValidateInputResponse {
  valid: boolean;
  normalized_input_ref: IpcAuditInputRef;
  resolved_kind: 'directory' | 'file';
  message: string;
}

export interface IpcAuditPresetProject {
  project_key: string;
  project_path: string;
  display_name: string;
  source: string;
  has_idl: boolean;
  has_on_remote_request_cpp: boolean;
  has_existing_audit_report: boolean;
  has_existing_poc_report: boolean;
  last_scanned_at: string;
}

export interface IpcAuditPagedPresetProjects {
  items: IpcAuditPresetProject[];
  total: number;
  page: number;
  per_page: number;
}

export interface IpcAuditCatalogRefreshJob {
  refresh_job_id: string;
  workspace_id: string;
  source: string;
  status: string;
  requested_by: string;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  discovered_count?: number | null;
  error_message?: string | null;
  message?: string | null;
}

export interface IpcAuditTaskSummary {
  task_id: string;
  project_id?: string | null;
  workspace_id: string;
  title: string;
  pipeline_mode: string;
  status: string;
  current_stage?: string | null;
  input_ref: IpcAuditInputRef;
  latest_attempt_id?: string | null;
  created_by: string;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  message?: string | null;
}

export interface IpcAuditAttemptWorker {
  worker_id?: string | null;
  claimed_at?: string | null;
  heartbeat_at?: string | null;
  lease_expires_at?: string | null;
}

export interface IpcAuditStageRun {
  stage_name: 'audit' | 'poc';
  status: string;
  attempt_no: number;
  started_at?: string | null;
  finished_at?: string | null;
  return_code?: number | null;
  log_artifact_id?: string | null;
  message?: string | null;
}

export interface IpcAuditAttemptDetail {
  attempt_id: string;
  task_id: string;
  attempt_no: number;
  status: string;
  worker: IpcAuditAttemptWorker;
  effective_config: Record<string, any>;
  stage_runs: IpcAuditStageRun[];
  message?: string | null;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface IpcAuditTaskDetail extends IpcAuditTaskSummary {
  attempt_count: number;
  latest_attempt?: IpcAuditAttemptDetail | null;
}

export interface IpcAuditPagedTasks {
  items: IpcAuditTaskSummary[];
  total: number;
  page: number;
  per_page: number;
}

export interface IpcAuditEvent {
  event_seq: number;
  event_id: string;
  task_id: string;
  attempt_id?: string | null;
  stage_name?: string | null;
  event_type: string;
  level: string;
  message: string;
  payload: Record<string, any>;
  created_at: string;
}

export interface IpcAuditEventPage {
  items: IpcAuditEvent[];
  next_cursor?: number | null;
}

export interface IpcAuditArtifact {
  artifact_id: string;
  task_id: string;
  attempt_id: string;
  stage_name?: string | null;
  artifact_kind: string;
  display_name: string;
  relative_path: string;
  content_type: string;
  size: number;
  sha256?: string | null;
  preview_url: string;
  download_url: string;
  created_at: string;
}

export interface IpcAuditArtifactContent {
  artifact_id: string;
  content: string;
  truncated: boolean;
  content_type: string;
}

export interface IpcAuditArtifactList {
  task_id: string;
  attempt_id: string;
  items: IpcAuditArtifact[];
}

export interface IpcAuditStageLog {
  task_id: string;
  attempt_id: string;
  stage_name: string;
  content: string;
  next_cursor: number;
}

export interface IpcAuditStageSessionSummary {
  path: string;
  display_name: string;
  content_type: string;
  size: number;
  created_at: string;
}

export interface IpcAuditStageSessionFile {
  path: string;
  content: string;
  truncated: boolean;
  next_cursor?: number;
}

export interface IpcAuditSuccessResponse {
  success: boolean;
  task_id?: string | null;
  status?: string | null;
  message: string;
}

export const ipcAuditApi = {
  getCapabilities: async (): Promise<IpcAuditCapability> => {
    const response = await fetch(`${PREFIX}/capabilities`, noStoreGetInit());
    return handleResponse(response);
  },

  getHealth: async (): Promise<{ status: string; service: string }> => {
    const response = await fetch(`${PREFIX}/health`, noStoreGetInit());
    return handleResponse(response);
  },

  getReady: async (): Promise<{ status: string; service: string; ready: boolean; checks?: Record<string, boolean> | null }> => {
    const response = await fetch(withCacheBust(`${PREFIX}/ready`), noStoreGetInit());
    return handleResponse(response);
  },

  getRuntimeConfig: async (): Promise<IpcAuditRuntimeConfig> => {
    const response = await fetch(`${PREFIX}/runtime-config`, noStoreGetInit());
    return handleResponse(response);
  },

  updateRuntimeConfig: async (payload: { max_parallel_tasks: number }): Promise<IpcAuditRuntimeConfig> => {
    const response = await fetch(`${PREFIX}/runtime-config`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  listWorkspaces: async (): Promise<IpcAuditWorkspaceSummary[]> => {
    const response = await fetch(`${PREFIX}/workspaces`, noStoreGetInit());
    return handleResponse(response);
  },

  getWorkspace: async (workspaceId: string): Promise<IpcAuditWorkspaceSummary> => {
    const response = await fetch(`${PREFIX}/workspaces/${encodeURIComponent(workspaceId)}`, noStoreGetInit());
    return handleResponse(response);
  },

  browseWorkspaceTree: async (workspaceId: string, params: { path?: string; depth?: number; directoriesOnly?: boolean } = {}): Promise<IpcAuditWorkspaceTree> => {
    const response = await fetch(withQuery(`${PREFIX}/workspaces/${encodeURIComponent(workspaceId)}/tree`, {
      path: params.path,
      depth: params.depth,
      directories_only: params.directoriesOnly,
    }), noStoreGetInit());
    return handleResponse(response);
  },

  validateInput: async (workspaceId: string, inputRef: IpcAuditInputRef): Promise<IpcAuditValidateInputResponse> => {
    const response = await fetch(`${PREFIX}/inputs/validate`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ workspace_id: workspaceId, input_ref: inputRef }),
    });
    return handleResponse(response);
  },

  listPresetProjects: async (workspaceId: string, params: {
    keyword?: string;
    source?: string;
    hasIdl?: boolean;
    hasOnRemoteRequestCpp?: boolean;
    page?: number;
    perPage?: number;
  } = {}): Promise<IpcAuditPagedPresetProjects> => {
    const response = await fetch(withQuery(`${PREFIX}/workspaces/${encodeURIComponent(workspaceId)}/preset-projects`, {
      keyword: params.keyword,
      source: params.source,
      has_idl: params.hasIdl,
      has_on_remote_request_cpp: params.hasOnRemoteRequestCpp,
      page: params.page ?? 1,
      per_page: params.perPage ?? 50,
    }), noStoreGetInit());
    return handleResponse(response);
  },

  refreshPresetProjects: async (workspaceId: string, payload: { source?: 'entries_file' | 'bundle_scan'; writeEntriesFile?: boolean } = {}): Promise<IpcAuditCatalogRefreshJob> => {
    const response = await fetch(`${PREFIX}/workspaces/${encodeURIComponent(workspaceId)}/preset-projects:refresh`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        source: payload.source || 'bundle_scan',
        write_entries_file: payload.writeEntriesFile ?? false,
      }),
    });
    return handleResponse(response);
  },

  getCatalogRefreshJob: async (refreshJobId: string): Promise<IpcAuditCatalogRefreshJob> => {
    const response = await fetch(`${PREFIX}/catalog-refresh-jobs/${encodeURIComponent(refreshJobId)}`, noStoreGetInit());
    return handleResponse(response);
  },

  listTasks: async (params: {
    projectId?: string;
    workspaceId?: string;
    status?: string;
    stage?: string;
    keyword?: string;
    createdBy?: string;
    page?: number;
    perPage?: number;
  } = {}): Promise<IpcAuditPagedTasks> => {
    const response = await fetch(withQuery(`${PREFIX}/tasks`, {
      project_id: params.projectId,
      workspace_id: params.workspaceId,
      status: params.status,
      stage: params.stage,
      keyword: params.keyword,
      created_by: params.createdBy,
      page: params.page ?? 1,
      per_page: params.perPage ?? 50,
    }), noStoreGetInit());
    return handleResponse(response);
  },

  createTask: async (payload: {
    project_id?: string;
    title: string;
    workspace_id: string;
    pipeline_mode?: 'audit_then_poc' | 'audit_only' | 'poc_only';
    input_ref: IpcAuditInputRef;
    executor_mode?: 'mock' | 'codex_cli' | 'opencode_cli';
    model?: string;
    notes?: string;
    idempotency_key?: string;
  }): Promise<IpcAuditTaskSummary> => {
    const response = await fetch(`${PREFIX}/tasks`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  getTask: async (taskId: string): Promise<IpcAuditTaskDetail> => {
    const response = await fetch(`${PREFIX}/tasks/${encodeURIComponent(taskId)}`, noStoreGetInit());
    return handleResponse(response);
  },

  listAttempts: async (taskId: string): Promise<IpcAuditAttemptDetail[]> => {
    const response = await fetch(`${PREFIX}/tasks/${encodeURIComponent(taskId)}/attempts`, noStoreGetInit());
    return handleResponse(response);
  },

  getAttempt: async (taskId: string, attemptId: string): Promise<IpcAuditAttemptDetail> => {
    const response = await fetch(`${PREFIX}/tasks/${encodeURIComponent(taskId)}/attempts/${encodeURIComponent(attemptId)}`, noStoreGetInit());
    return handleResponse(response);
  },

  listEvents: async (taskId: string, params: { attemptId?: string; cursor?: number; limit?: number } = {}): Promise<IpcAuditEventPage> => {
    const response = await fetch(withQuery(`${PREFIX}/tasks/${encodeURIComponent(taskId)}/events`, {
      attempt_id: params.attemptId,
      cursor: params.cursor,
      limit: params.limit ?? 200,
    }), noStoreGetInit());
    return handleResponse(response);
  },

  getStageLog: async (taskId: string, attemptId: string, stageName: string, params: { lines?: number; cursor?: number } = {}): Promise<IpcAuditStageLog> => {
    const response = await fetch(withQuery(`${PREFIX}/tasks/${encodeURIComponent(taskId)}/attempts/${encodeURIComponent(attemptId)}/stages/${encodeURIComponent(stageName)}/log`, {
      lines: params.lines ?? 300,
      cursor: params.cursor,
    }), noStoreGetInit());
    return handleResponse(response);
  },

  listStageSessions: async (taskId: string, attemptId: string, stageName: string): Promise<IpcAuditStageSessionSummary[]> => {
    const response = await fetch(`${PREFIX}/tasks/${encodeURIComponent(taskId)}/attempts/${encodeURIComponent(attemptId)}/stages/${encodeURIComponent(stageName)}/sessions`, noStoreGetInit());
    return handleResponse(response);
  },

  getStageSessionFile: async (taskId: string, attemptId: string, stageName: string, path: string): Promise<IpcAuditStageSessionFile> => {
    const response = await fetch(withQuery(`${PREFIX}/tasks/${encodeURIComponent(taskId)}/attempts/${encodeURIComponent(attemptId)}/stages/${encodeURIComponent(stageName)}/session-file`, {
      path,
    }), noStoreGetInit());
    return handleResponse(response);
  },

  openStageSessionFileStream: (
    taskId: string,
    attemptId: string,
    stageName: string,
    path: string,
    params: { cursor?: number; pollMs?: number } = {},
  ): EventSource => {
    return new EventSource(withQuery(`${PREFIX}/tasks/${encodeURIComponent(taskId)}/attempts/${encodeURIComponent(attemptId)}/stages/${encodeURIComponent(stageName)}/session-file/stream`, {
      path,
      cursor: params.cursor ?? 0,
      poll_ms: params.pollMs ?? 1000,
    }));
  },

  listArtifacts: async (taskId: string, attemptId: string): Promise<IpcAuditArtifactList> => {
    const response = await fetch(`${PREFIX}/tasks/${encodeURIComponent(taskId)}/attempts/${encodeURIComponent(attemptId)}/artifacts`, noStoreGetInit());
    return handleResponse(response);
  },

  getArtifactContent: async (artifactId: string, params: { maxBytes?: number } = {}): Promise<IpcAuditArtifactContent> => {
    const response = await fetch(withQuery(`${PREFIX}/artifacts/${encodeURIComponent(artifactId)}/content`, {
      max_bytes: params.maxBytes ?? 1024 * 1024,
    }), noStoreGetInit());
    return handleResponse(response);
  },

  cancelTask: async (taskId: string): Promise<IpcAuditTaskSummary> => {
    const response = await fetch(`${PREFIX}/tasks/${encodeURIComponent(taskId)}/cancel`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  retryTask: async (taskId: string, payload: { retry_scope?: 'task' | 'from_stage'; stage?: 'audit' | 'poc' } = {}): Promise<IpcAuditTaskSummary> => {
    const response = await fetch(`${PREFIX}/tasks/${encodeURIComponent(taskId)}/retry`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        retry_scope: payload.retry_scope || 'task',
        stage: payload.stage,
      }),
    });
    return handleResponse(response);
  },

  deleteTask: async (taskId: string, deleteArtifacts = false): Promise<IpcAuditSuccessResponse> => {
    const response = await fetch(withQuery(`${PREFIX}/tasks/${encodeURIComponent(taskId)}`, {
      delete_artifacts: deleteArtifacts,
    }), {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },
};
