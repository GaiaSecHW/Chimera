import { API_BASE, getHeaders, getJsonWithDedupe, handleResponse } from './base';
import type { ServiceHealthMeta } from '../components/execution/serviceHealthMeta';
import {
  ProjectFilesystemChildrenResponse,
  ProjectFilesystemRootResponse,
} from '../types/types';

const PREFIX = `${API_BASE}/api/dataflow-vuln-scan`;
const MANAGER_PREFIX = `${API_BASE}/api/dataflow-vuln-scan-admin-proxy`;

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

export interface DataflowAgentStateRootPayload {
  root_dir: DataflowInputRef;
}

export type DataflowVulnScanHealth = {
  status: string;
  pod_id: string;
  database: string;
  scheduler: string;
  scheduler_role?: string;
  worker_enabled?: string;
} & ServiceHealthMeta;

export interface DataflowAgentStateDir {
  agent_id: string;
  root_dir: string;
  skills_dir: string;
  memory_dir: string;
  source: 'shared_default' | 'task_override';
}

export interface DataflowScanTaskListItem {
  task_id: string;
  project_id: string;
  task_purpose?: 'normal' | 'evolution';
  task_origin_type?: string | null;
  parent_task_id?: string | null;
  parent_task_type?: string | null;
  parent_stage_name?: string | null;
  parent_stage_item_id?: string | null;
  parent_stage_item_key?: string | null;
  origin_mode?: 'manual' | 'binary' | 'source' | string;
  origin_label?: string | null;
  parent_task_display?: string | null;
  profile_id: string;
  profile_version: number;
  title?: string;
  status: string;
  control_state?: string;
  latest_attempt_no: number;
  priority: number;
  created_by: string;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  updated_at?: string | null;
  message?: string | null;
  latest_execution_id?: string | null;
  owner_pod_id?: string | null;
  heartbeat_at?: string | null;
  heartbeat_age_seconds?: number | null;
  dispatch_status?: string | null;
  slot_binding_state?: string | null;
  slot_binding_reason?: string | null;
  latest_run_id?: string | null;
  latest_run_status?: string | null;
  run_name?: string | null;
  runs_root?: string | null;
  run_path?: string | null;
  run?: Partial<DataflowRunSummary> | null;
  latest_run?: Partial<DataflowRunSummary> | null;
  auto_report_vulnerabilities?: boolean;
  vuln_report_status?: Record<string, any>;
  abnormal_reason_title?: string | null;
  abnormal_reason_code?: string | null;
  abnormal_reason_category?: string | null;
}

export type DataflowScanTask = DataflowScanTaskListItem;

export interface DataflowScanTaskListResponse {
  items: DataflowScanTaskListItem[];
  total: number;
  page: number;
  per_page: number;
  projection_backfill_pending?: boolean;
  projection_backfill_enqueued?: boolean;
  projection_total_missing?: number;
}

export interface DataflowScanTaskStats {
  total: number;
  pending: number;
  running: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  projection_backfill_pending?: boolean;
}

export interface DataflowScanTaskDetail extends DataflowScanTaskListItem {
  agent_state_dirs?: Record<string, DataflowAgentStateDir>;
  parent_project_id?: string | null;
  retry_count: number;
  max_retry_count: number;
  title: string;
  task_markdown: string;
  artifact_refs: DataflowArtifactRef[];
  runtime_overrides: Record<string, any>;
  task_metadata?: Record<string, any>;
  input_summary?: Record<string, any>;
  output_summary?: Record<string, any>;
  effective_config_summary?: Record<string, any>;
  task_root?: string | null;
  run_root?: string | null;
  workspace_root?: string | null;
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

export interface DataflowTaskTimelineEvent {
  id: string;
  task_id: string;
  project_id: string;
  execution_id: string;
  attempt_no?: number | null;
  stage_name?: string | null;
  stage_key?: string | null;
  event_type: string;
  level?: string | null;
  message: string;
  payload?: Record<string, any>;
  created_at: string;
}

export interface DataflowTaskTimelineResponse {
  task_id: string;
  items: DataflowTaskTimelineEvent[];
}

export interface DataflowTaskTimelineActionResponse {
  status: string;
  task_id: string;
  message: string;
  deleted_event_count: number;
}

export interface DataflowEffectiveConfig {
  project_id: string;
  default_profile_id?: string | null;
  effective_config: Record<string, any>;
}

export interface DataflowServiceEffectiveConfig {
  service_name: string;
  api_prefix: string;
  agent_storage?: {
    mode?: string;
    project_id_placeholder?: string;
    shared_root_template?: string;
    agents?: Array<{
      agent_id: string;
      root_dir_template: string;
      skills_dir_template: string;
      memory_dir_template: string;
      source: 'shared_default';
    }>;
  };
  config: Record<string, any>;
}

export interface DataflowServiceRuntimeConfig {
  service_name: string;
  api_prefix: string;
  config: {
    scheduler?: {
      enabled?: boolean;
      role?: string;
      worker_capacity?: number;
      poll_interval_seconds?: number;
      heartbeat_interval_seconds?: number;
      worker_timeout_seconds?: number;
      worker_retention_seconds?: number;
      cleanup_interval_seconds?: number;
      reservation_lease_seconds?: number;
      worker_queue_depth?: number;
      dispatch_batch_size?: number;
      requeue_stuck_dispatch_after_seconds?: number;
    };
    dataflow_worker?: {
      advertise_url_template?: string;
      timeout?: number;
      dispatch_retry_interval_seconds?: number;
      dispatch_max_retries?: number;
    };
    [key: string]: any;
  };
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

export interface DataflowVulnWorkerActiveJob {
  execution_id: string;
  task_id?: string | null;
  task_title?: string | null;
  status: string;
  worker_job_id: string;
  worker_url?: string | null;
  dispatch_status?: string | null;
  started_at?: string | null;
  updated_at?: string | null;
  run_name?: string | null;
  run_path?: string | null;
  project_id?: string | null;
  mapped: boolean;
  mapping_reason: string;
}

export interface DataflowVulnWorkerCapacity {
  worker_id: string;
  host_name: string;
  healthy: boolean;
  max_concurrent_jobs: number;
  running_jobs: number;
  available_slots: number;
  source: string;
  last_heartbeat_at?: string | null;
  error?: string | null;
  active_jobs: DataflowVulnWorkerActiveJob[];
}

export interface DataflowVulnClusterCapacity {
  worker_count: number;
  healthy_workers: number;
  stale_workers: number;
  total_capacity: number;
  running_jobs: number;
  queued_jobs: number;
  available_slots: number;
  updated_at: string;
  detail_mode?: 'summary' | 'detail';
  workers: DataflowVulnWorkerCapacity[];
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
  task_purpose?: 'normal' | 'evolution';
  agent_state_roots?: Record<string, DataflowAgentStateRootPayload>;
  task_origin_type?: 'manual' | 'binary_security';
  parent_project_id?: string;
  parent_task_id?: string;
  parent_task_type?: 'binary' | 'source' | 'binary_module';
  parent_stage_name?: string;
  parent_stage_item_id?: string;
  parent_stage_item_key?: string;
  auto_report_vulnerabilities?: boolean;
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
  linked_task_purpose?: 'normal' | 'evolution' | null;
  linked_task_agent_state_dirs?: Record<string, DataflowAgentStateDir>;
  linked_task_detail?: DataflowScanTaskDetail | null;
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

export interface DataflowRunCheckpoint {
  schema_version?: number;
  timestamp?: string;
  cycle?: number;
  phase?: string;
  step_key?: string;
  node_id?: string;
  node_kind?: string;
  status?: string;
  terminal_status?: boolean;
  resume_policy?: string;
  agent_id?: string;
  session_id?: string;
  detail?: string;
  started_at?: string;
  started_epoch?: number;
  finished_at?: string;
  finished_epoch?: number;
  duration_ms?: number;
  duration_seconds?: number;
  elapsed_seconds?: number;
  extra?: Record<string, any>;
  path?: string;
  mtime?: number;
  [key: string]: any;
}

export interface DataflowRunOverview extends DataflowRunSummary {
  config: Record<string, any>;
  error?: string | null;
  cycles: Record<string, any>[];
  results: Record<string, any>[];
  removed_results: Record<string, any>[];
  manifests: Record<string, any>;
  latest_issues: Record<string, any>[];
  atomic_work_path: string;
  files?: DataflowRunFile[];
  sessions?: DataflowRunSession[];
  run_log?: string;
  command?: string[];
  command_display?: string;
  current_step?: DataflowRunCheckpoint;
  step_history?: DataflowRunCheckpoint[];
  cycle_timing?: Record<string, any>;
  raw: Record<string, any>;
  linked_task_detail?: DataflowScanTaskDetail | null;
}

export interface DataflowRunDetail extends DataflowRunOverview {
  files: DataflowRunFile[];
  sessions: DataflowRunSession[];
  run_log: string;
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
  resume_preflight?: Record<string, any>;
}

export interface DataflowRunRetryPreview {
  success: boolean;
  run_id: string;
  project_id: string;
  can_retry: boolean;
  reason?: string;
  process_state?: DataflowRunProcessState;
  resume_preflight?: Record<string, any>;
}

export interface DataflowVulnReportResponse {
  status: string;
  enabled: boolean;
  total: number;
  reported: number;
  failed: number;
  pending: number;
  items: Record<string, any>[];
  error?: string | null;
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

const fetchRunDetailWithFallback = async <T,>(runId: string): Promise<T> => {
  const encoded = encodeURIComponent(runId);
  const primary = await fetch(`${PREFIX}/runs/${encoded}/detail`, { headers: getHeaders() });
  if (primary.status !== 404) {
    return handleResponse(primary);
  }
  const fallback = await fetch(`${PREFIX}/runs/${encoded}`, { headers: getHeaders() });
  return handleResponse(fallback);
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

const unwrapPagedList = <T,>(
  payload: unknown,
  defaults?: { page?: number; per_page?: number },
): { items: T[]; total: number; page: number; per_page: number; [key: string]: unknown } => {
  const items = unwrapList<T>(payload);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      items,
      total: items.length,
      page: defaults?.page ?? 1,
      per_page: defaults?.per_page ?? items.length,
    };
  }
  const envelope = payload as Record<string, unknown>;
  const total = Number(envelope.total);
  const page = Number(envelope.page);
  const perPage = Number(envelope.per_page);
  return {
    ...envelope,
    items,
    total: Number.isFinite(total) ? total : items.length,
    page: Number.isFinite(page) && page > 0 ? page : (defaults?.page ?? 1),
    per_page: Number.isFinite(perPage) && perPage > 0 ? perPage : (defaults?.per_page ?? items.length),
  };
};

export const dataflowVulnScannerApi = {
  getHealth: async (): Promise<DataflowVulnScanHealth> => {
    const response = await fetch(`${PREFIX}/health`, { headers: getHeaders() });
    return handleResponse(response);
  },

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

  listTasks: async (params: {
    projectId?: string;
    page?: number;
    per_page?: number;
    status?: string;
    search?: string;
    slot_binding_state?: string;
    report_status?: string;
    model?: string;
    mode?: 'manual' | 'binary' | 'source';
    parent_task_id?: string;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
    profileId?: string;
  } = {}): Promise<DataflowScanTaskListResponse> => {
    const payload = await getJsonWithDedupe<any>(withQuery(`${PREFIX}/tasks`, {
      project_id: params.projectId,
      page: params.page,
      per_page: params.per_page,
      status: params.status,
      search: params.search,
      slot_binding_state: params.slot_binding_state,
      report_status: params.report_status,
      model: params.model,
      mode: params.mode,
      parent_task_id: params.parent_task_id,
      sort_by: params.sort_by,
      sort_order: params.sort_order,
      profile_id: params.profileId,
    }), { headers: getHeaders() });
    return unwrapPagedList<DataflowScanTaskListItem>(payload, {
      page: params.page,
      per_page: params.per_page,
    });
  },

  getTaskStats: async (params: {
    projectId?: string;
    status?: string;
    search?: string;
    slot_binding_state?: string;
    report_status?: string;
    model?: string;
    mode?: 'manual' | 'binary' | 'source';
    parent_task_id?: string;
    profileId?: string;
  } = {}): Promise<DataflowScanTaskStats> => {
    return getJsonWithDedupe(withQuery(`${PREFIX}/tasks/stats`, {
      project_id: params.projectId,
      status: params.status,
      search: params.search,
      slot_binding_state: params.slot_binding_state,
      report_status: params.report_status,
      model: params.model,
      mode: params.mode,
      parent_task_id: params.parent_task_id,
      profile_id: params.profileId,
    }), { headers: getHeaders() });
  },

  getWorkerClusterCapacity: async (): Promise<DataflowVulnClusterCapacity> => {
    return getJsonWithDedupe(`${PREFIX}/workers/cluster-capacity`, { headers: getHeaders() });
  },

  getWorkerClusterCapacitySummary: async (): Promise<DataflowVulnClusterCapacity> => {
    const response = await fetch(`${PREFIX}/workers/cluster-capacity/summary`, { headers: getHeaders() });
    if (response.status === 404) {
      const fallbackResponse = await fetch(`${PREFIX}/workers/cluster-capacity`, { headers: getHeaders() });
      const payload = await handleResponse(fallbackResponse);
      return {
        ...payload,
        detail_mode: payload.detail_mode || 'detail',
      };
    }
    return handleResponse(response);
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

  getTaskTimeline: async (taskId: string): Promise<DataflowTaskTimelineResponse> => {
    const response = await fetch(`${PREFIX}/tasks/${encodeURIComponent(taskId)}/timeline`, { headers: getHeaders() });
    return handleResponse(response);
  },

  clearTaskTimeline: async (taskId: string): Promise<DataflowTaskTimelineActionResponse> => {
    const response = await fetch(`${PREFIX}/tasks/${encodeURIComponent(taskId)}/timeline`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  deleteTaskTimelineEvent: async (taskId: string, eventId: string): Promise<DataflowTaskTimelineActionResponse> => {
    const response = await fetch(`${PREFIX}/tasks/${encodeURIComponent(taskId)}/timeline/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
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

  getRun: async (runId: string): Promise<DataflowRunOverview> => {
    const response = await fetch(`${PREFIX}/runs/${encodeURIComponent(runId)}`, { headers: getHeaders() });
    return handleResponse(response);
  },

  getRunDetail: async (runId: string): Promise<DataflowRunDetail> => {
    return fetchRunDetailWithFallback<DataflowRunDetail>(runId);
  },

  reportRunVulnerabilities: async (runId: string, resultFiles: string[]): Promise<DataflowVulnReportResponse> => {
    const response = await fetch(`${PREFIX}/runs/${encodeURIComponent(runId)}/report-vulnerabilities`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ result_files: resultFiles }),
    });
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

  previewRetryRun: async (runId: string, payload: DataflowRunRetryPayload = {}): Promise<DataflowRunRetryPreview> => {
    const response = await fetch(`${PREFIX}/runs/${encodeURIComponent(runId)}/retry/preview`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
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

  deleteTask: async (taskId: string): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${PREFIX}/tasks/${encodeURIComponent(taskId)}`, {
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

  getServiceConfig: async (): Promise<DataflowServiceRuntimeConfig> => {
    const response = await fetch(`${PREFIX}/service/config`, { headers: getHeaders() });
    return handleResponse(response);
  },

  saveServiceConfig: async (config: DataflowServiceRuntimeConfig['config']): Promise<DataflowServiceRuntimeConfig> => {
    const response = await fetch(`${PREFIX}/service/config`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ config }),
    });
    return handleResponse(response);
  },

  listWorkers: async (): Promise<DataflowSchedulerWorker[]> => {
    const response = await fetch(`${MANAGER_PREFIX}/scheduler/workers`, { headers: getHeaders() });
    return unwrapList<DataflowSchedulerWorker>(await handleResponse(response));
  },

  drainWorker: async (podId: string): Promise<{ message: string }> => {
    const response = await fetch(`${MANAGER_PREFIX}/scheduler/workers/${encodeURIComponent(podId)}/drain`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  activateWorker: async (podId: string): Promise<{ message: string }> => {
    const response = await fetch(`${MANAGER_PREFIX}/scheduler/workers/${encodeURIComponent(podId)}/activate`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },
};
