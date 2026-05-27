import { API_BASE, getHeaders, getJsonWithDedupe, handleResponse } from './base';
import type { FirmwareSessionIndexItem } from '../pages/execution/sessionParsing';
import { normalizeFirmwareSessionIndex } from '../pages/execution/sessionParsing';
export type { FirmwareSessionIndexItem } from '../pages/execution/sessionParsing';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FirmwareUnpackerHealth {
  status: string;
  worker_id?: string;
}

export interface FirmwareUnpackPayload {
  firmware_path: string;
  project_id?: string;
}

export interface FirmwareUnpackSubmitResult {
  task_id: string;
  status: string;
  message: string;
  input_path?: string;
  output_path?: string;
  run_path?: string;
}

export interface FirmwareUnpackTask {
  id: string;
  project_id: string | null;
  task_origin_type?: string | null;
  parent_project_id?: string | null;
  parent_task_id?: string | null;
  parent_task_type?: string | null;
  parent_stage_name?: string | null;
  parent_stage_item_id?: string | null;
  parent_stage_item_key?: string | null;
  origin_label?: string | null;
  parent_task_display?: string | null;
  firmware_path: string;
  output_path: string;
  /** pending | retry_preparing | running | cancelling | cancelled | success | failed */
  status: string;
  worker_id: string | null;
  result_status: string | null;
  result_message: string | null;
  rounds: number | null;
  error_message: string | null;
  matched_skill: string | null;
  matched_skill_version: number | null;
  matched_skill_score: number | null;
  fallback_to_llm: boolean;
  generated_skill_path: string | null;
  generated_skill_status: string | null;
  promotion_success_count: number | null;
  skill_generation_status: string | null;
  skill_generation_error: string | null;
  skill_generation_job_id: string | null;
  skill_generation_started_at: string | null;
  skill_generation_completed_at: string | null;
  latest_evolution_job_id: string | null;
  latest_evolution_status: string | null;
  latest_evolution_started_at: string | null;
  latest_evolution_completed_at: string | null;
  latest_evolution_final_skill_path: string | null;
  input_path?: string | null;
  run_path?: string | null;
  task_root?: string | null;
  run_root?: string | null;
  workspace_root?: string | null;
  archive_root?: string | null;
  runtime_root?: string | null;
  input_summary?: Record<string, any> | null;
  output_summary?: Record<string, any> | null;
  task_metadata?: Record<string, any> | null;
  created_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface FirmwareTaskResourceContainer {
  name: string | null;
  cpu_millicores: number;
  memory_mib: number;
}

export interface FirmwareTaskResourceUsage {
  task_id: string;
  worker_id: string | null;
  available: boolean;
  pod_name: string | null;
  namespace: string | null;
  phase: string | null;
  timestamp: string | null;
  window: string | null;
  cpu_millicores: number | null;
  memory_mib: number | null;
  pod_cpu_limit_millicores: number | null;
  pod_memory_limit_mib: number | null;
  containers: FirmwareTaskResourceContainer[];
  message: string | null;
}

export interface FirmwareTaskProgressPhase {
  key: string;
  label: string;
  status: string;
  detail: string | null;
  updated_at: string | null;
  current_round: number | null;
  total_rounds: number | null;
  duration_seconds: number | null;
}

export interface FirmwareTaskProgress {
  task_id: string;
  current_phase: string | null;
  summary: string | null;
  current_round: number | null;
  total_rounds: number | null;
  phases: FirmwareTaskProgressPhase[];
}

export interface FirmwareTaskLog {
  task_id: string;
  run_path: string | null;
  available: boolean;
  log_text: string;
  files: string[];
  phase: string | null;
  message: string | null;
}

export interface FirmwareTaskEvent {
  id: string;
  task_id: string;
  project_id: string | null;
  event_type: string;
  stage_key: string | null;
  status: string | null;
  summary: string;
  detail: Record<string, any> | null;
  owner_id: string | null;
  created_by: string | null;
  created_at: string | null;
}

export interface FirmwareTaskEventList {
  total: number;
  items: FirmwareTaskEvent[];
}

export interface FirmwareTaskTopLevelEntry {
  name: string;
  kind: string;
  file_count: number;
  dir_count: number;
  total_size_bytes: number;
}

export interface FirmwareTaskExtensionBreakdownItem {
  extension: string;
  file_count: number;
  total_size_bytes: number;
}

export interface FirmwareTaskLargestFileItem {
  path: string;
  size_bytes: number;
}

export interface FirmwareTaskDeepestPath {
  path: string;
  depth: number;
}

export interface FirmwareTaskResultSummary {
  top_level_entries: FirmwareTaskTopLevelEntry[];
  file_extension_breakdown: FirmwareTaskExtensionBreakdownItem[];
  largest_files: FirmwareTaskLargestFileItem[];
  deepest_path: FirmwareTaskDeepestPath | null;
  output_file_count: number;
  output_dir_count: number;
  output_total_size_bytes: number;
  largest_file_path: string | null;
  largest_file_size_bytes: number;
  top_level_entry_count: number;
  avg_file_size_bytes: number;
  small_file_count: number;
  medium_file_count: number;
  large_file_count: number;
  matched_skill: string | null;
  fallback_to_llm: boolean;
  generated_skill_path: string | null;
  generated_skill_status: string | null;
  promotion_success_count: number;
  skill_generation_status: string | null;
  skill_generation_error: string | null;
  skill_generation_job_id: string | null;
  skill_generation_started_at: string | null;
  skill_generation_completed_at: string | null;
  latest_evolution_job: string | null;
  latest_evolution_status: string | null;
  latest_evolution_started_at: string | null;
  latest_evolution_completed_at: string | null;
  latest_evolution_final_skill_path: string | null;
  executor_rounds: number;
  session_count: number;
  event_count: number;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
}

export interface FirmwareTaskResult {
  task_id: string;
  available: boolean;
  status: string;
  output_root: string | null;
  run_root: string | null;
  summary_path: string | null;
  reason_path: string | null;
  tokens_summary_path: string | null;
  summary_text: string | null;
  reason_text: string | null;
  warnings: string[];
  summary: FirmwareTaskResultSummary;
}

export interface FirmwareEvolutionSubmitResult {
  job_id: string;
  status: string;
  max_rounds: number;
}

export interface FirmwareRuntimeFileItem {
  path: string;
  kind: string;
  size_bytes: number;
  modified_at: string | null;
}

export interface FirmwareRuntimeFileList {
  root: string;
  total: number;
  truncated: boolean;
  items: FirmwareRuntimeFileItem[];
}

export interface FirmwareRuntimeFilePreview {
  blob: Blob;
  contentType: string;
  truncated: boolean;
}

export interface FirmwareEvolutionRound {
  id: string;
  job_id: string;
  round: number;
  status: string;
  tool_skill_path_before: string | null;
  tool_skill_path_after: string | null;
  tool_path_before: string | null;
  tool_path_after: string | null;
  tool_changed: boolean;
  review_result: string | null;
  summary_path: string | null;
  reason_path: string | null;
  source_skill_path: string | null;
  source_tool_path: string | null;
  started_without_matched_skill: boolean;
  generated_new_skill: boolean;
  generated_new_tool: boolean;
  executed_tool: boolean;
  tool_response_preview: string | null;
  metrics?: {
    tool_unpack_duration_seconds?: number | null;
    evolution_executor_tokens?: Record<string, number> | null;
    reviewer_tokens?: Record<string, number> | null;
    total_tokens?: Record<string, number> | null;
  } | null;
  tool_unpack_duration_seconds?: number | null;
  evolution_executor_tokens?: Record<string, number> | null;
  reviewer_tokens?: Record<string, number> | null;
  total_tokens?: Record<string, number> | null;
  created_at: string | null;
  completed_at: string | null;
}

export interface FirmwareEvolutionJob {
  id: string;
  task_id: string;
  project_id: string | null;
  status: string;
  current_round: number | null;
  max_rounds: number;
  current_stage: string | null;
  owner_id: string | null;
  lease_expires_at: string | null;
  attempts: number;
  error_message: string | null;
  created_by: string | null;
  created_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  final_skill_path: string | null;
  final_tool_path: string | null;
  replaced_skill_path: string | null;
  replaced_tool_path: string | null;
  review_passed: boolean;
  source_skill_path: string | null;
  source_tool_path: string | null;
  working_skill_path: string | null;
  working_tool_path: string | null;
  generated_new_skill: boolean;
  generated_new_tool: boolean;
  replacement_required: boolean;
  replacement_confirmed: boolean;
  effective_tool_path: string | null;
  started_without_matched_skill: boolean;
  run_root: string | null;
  session_root: string | null;
  task_output_path: string | null;
  round_count: number;
  rounds: FirmwareEvolutionRound[];
  source_task?: FirmwareUnpackTask | null;
}

export interface FirmwareEvolutionJobList {
  total: number;
  items: FirmwareEvolutionJob[];
}

export interface FirmwareEvolutionSessionIndex {
  version: number;
  session_root: string | null;
  items: FirmwareSessionIndexItem[];
}

export interface FirmwareTaskMetricsTask {
  status: string;
  result_status: string | null;
  current_stage: string | null;
  owner_id: string | null;
  created_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  last_progress_at: string | null;
  duration_seconds: number | null;
  queue_wait_seconds: number | null;
  running_seconds: number | null;
}

export interface FirmwareTaskMetricsResource {
  available: boolean;
  pod_name: string | null;
  namespace: string | null;
  cpu_millicores: number | null;
  memory_mib: number | null;
  pod_cpu_limit_millicores: number | null;
  pod_memory_limit_mib: number | null;
  cpu_usage_percent: number | null;
  memory_usage_percent: number | null;
  containers: FirmwareTaskResourceContainer[];
  message: string | null;
}

export interface FirmwareTaskMetricsProgress {
  current_phase: string | null;
  current_round: number | null;
  total_rounds: number | null;
  phase_count: number;
  completed_phase_count: number;
  failed_phase_count: number;
  running_phase_count: number;
}

export interface FirmwareTaskMetricsEvents {
  event_count: number;
  latest_event_type: string | null;
  latest_event_summary: string | null;
  latest_event_at: string | null;
}

export interface FirmwareTaskMetricsSessions {
  session_count: number;
  running_session_count: number;
  failed_session_count: number;
  closed_session_count: number;
}

export interface FirmwareTaskMetricsResult {
  cache_available: boolean;
  cache_updated_at: string | null;
  output_file_count: number;
  output_dir_count: number;
  output_total_size_bytes: number;
  largest_file_size_bytes: number;
  top_level_entry_count: number;
  small_file_count: number;
  medium_file_count: number;
  large_file_count: number;
  executor_rounds: number;
  fallback_to_llm: boolean;
  matched_skill: string | null;
}

export interface FirmwareTaskRoundTokenMetrics {
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
  total: number;
  cost: number;
}

export interface FirmwareTaskRoundOutputMetrics {
  output_file_count: number;
  output_dir_count: number;
  output_total_size_bytes: number;
  largest_file_size_bytes: number;
}

export interface FirmwareTaskRoundDeltaMetrics {
  file_count_delta: number;
  dir_count_delta: number;
  size_bytes_delta: number;
  baseline_round: number | null;
}

export interface FirmwareTaskRoundAgentMetrics {
  status?: string | null;
  passed?: boolean;
  duration_seconds: number | null;
  response_preview?: string | null;
  review_preview?: string | null;
  provider_role?: string | null;
  session_file?: string | null;
}

export interface FirmwareTaskRoundMetric {
  round: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  executor: FirmwareTaskRoundAgentMetrics;
  reviewer: FirmwareTaskRoundAgentMetrics;
  tokens: FirmwareTaskRoundTokenMetrics;
  output_snapshot: FirmwareTaskRoundOutputMetrics;
  output_delta: FirmwareTaskRoundDeltaMetrics;
  artifacts: {
    summary_present: boolean;
    reason_present: boolean;
    warnings: string[];
    summary_preview: string | null;
    reason_preview: string | null;
    summary_text?: string | null;
    reason_text?: string | null;
  };
  context: {
    matched_skill: string | null;
    fallback_to_llm: boolean;
    provider_role: string | null;
  };
  source_path: string | null;
  raw: Record<string, any>;
}

export interface FirmwareTaskMetricsRounds {
  available: boolean;
  round_count: number;
  completed_round_count: number;
  failed_round_count: number;
  running_round: number | null;
  total_duration_seconds: number;
  total_tokens: number;
  total_cost: number;
  output_growth_bytes: number;
  latest_round: number | null;
  summary: {
    status_counts: Record<string, number>;
    stage_summary: Record<string, { round_count: number; duration_seconds: number; token_total: number }>;
  };
  items: FirmwareTaskRoundMetric[];
  warnings: string[];
}

export interface FirmwareTaskMetricsHealth {
  is_terminal: boolean;
  has_owner: boolean;
  resource_available: boolean;
  result_cache_available: boolean;
  warnings: string[];
}

export interface FirmwareTaskMetrics {
  task_id: string;
  task: FirmwareTaskMetricsTask;
  resource: FirmwareTaskMetricsResource;
  progress: FirmwareTaskMetricsProgress;
  events: FirmwareTaskMetricsEvents;
  sessions: FirmwareTaskMetricsSessions;
  result: FirmwareTaskMetricsResult;
  rounds: FirmwareTaskMetricsRounds;
  health: FirmwareTaskMetricsHealth;
}

export interface FirmwareUnpackTaskList {
  total: number;
  offset: number;
  limit: number;
  items: FirmwareUnpackTask[];
}

export interface FirmwareWorkerInstance {
  worker_id: string;
  hostname: string | null;
  pod_ip: string | null;
  started_at: string | null;
  last_heartbeat: string | null;
  is_alive: boolean;
  active_tasks: number;
}

export interface FirmwareConcurrencyInfo {
  mode: string;
  resource_based: boolean;
  effective_max_concurrent: number;
  executor_capacity: number;
  manual_max_concurrent: number;
  auto_max_concurrent: number;
  cpu_based_limit: number | null;
  memory_based_limit: number | null;
  cpu_millis_per_task: number;
  memory_mb_per_task: number;
  reserved_cpu_millis: number;
  reserved_memory_mb: number;
  pod_cpu_limit_millicores: number | null;
  pod_memory_limit_mib: number | null;
  pod_cpu_request_millicores: number | null;
  pod_memory_request_mib: number | null;
}

export interface FirmwareClusterInfo {
  this_worker: string;
  total_workers: number;
  alive_workers: number;
  workers: FirmwareWorkerInstance[];
  task_counts: Record<string, number>;
  total_tasks: number;
  concurrency: FirmwareConcurrencyInfo;
}

export interface FirmwareConfigEntry {
  key: string;
  value: string;
  value_type: string;
  description: string | null;
  updated_at: string | null;
}

export interface FirmwareConfigList {
  total: number;
  items: FirmwareConfigEntry[];
}

export interface FirmwareLlmProviderSummary {
  provider_key: string;
  display_name: string;
  provider_type: string;
  enabled: boolean;
  is_default: boolean;
  model: string;
  description: string | null;
  updated_at: string | null;
}

export interface FirmwareLlmProviderSummaryList {
  total: number;
  default_provider_key: string | null;
  items: FirmwareLlmProviderSummary[];
}

export interface FirmwareLlmConfigFileModelOption {
  value: string;
  label: string;
  source: string | null;
}

export interface FirmwareLlmConfigFileSummary {
  config_file_key: string;
  display_name: string;
  provider_type: string;
  enabled: boolean;
  is_default: boolean;
  default_model: string | null;
  description: string | null;
  updated_at: string | null;
  model_options: FirmwareLlmConfigFileModelOption[];
}

export interface FirmwareLlmConfigFileSummaryList {
  total: number;
  items: FirmwareLlmConfigFileSummary[];
}

export interface FirmwareToolEntry {
  filename: string;
  path: string;
  name: string;
  format_id: string;
  description: string;
  extensions: string[];
  magic_hex: string;
  keywords: string[];
  binwalk_sigs: string[];
  skill_status: string;
  skill_version: number;
  family_id: string;
  promotion_success_count: number;
  promotion_threshold: number;
}

export interface FirmwareToolList {
  total: number;
  items: FirmwareToolEntry[];
}

export interface TaskListQuery {
  project_id?: string;
  status?: string;
  worker_id?: string;
  origin_mode?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : value == null ? fallback : String(value);

const asNullableString = (value: unknown): string | null =>
  value == null ? null : String(value);

const asNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asNullableNumber = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const asBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const lowered = String(value ?? '').trim().toLowerCase();
  return lowered === 'true' || lowered === '1' || lowered === 'yes';
};

const asArray = (value: unknown): any[] => Array.isArray(value) ? value : [];

const normalizeTask = (value: unknown): FirmwareUnpackTask => {
  const record = asRecord(value);
  return {
    id: asString(record.id),
    project_id: asNullableString(record.project_id),
    task_origin_type: asNullableString(record.task_origin_type),
    parent_project_id: asNullableString(record.parent_project_id),
    parent_task_id: asNullableString(record.parent_task_id),
    parent_task_type: asNullableString(record.parent_task_type),
    parent_stage_name: asNullableString(record.parent_stage_name),
    parent_stage_item_id: asNullableString(record.parent_stage_item_id),
    parent_stage_item_key: asNullableString(record.parent_stage_item_key),
    origin_label: asNullableString(record.origin_label),
    parent_task_display: asNullableString(record.parent_task_display),
    firmware_path: asString(record.firmware_path),
    output_path: asString(record.output_path),
    status: asString(record.status, 'unknown'),
    worker_id: asNullableString(record.owner_id ?? record.worker_id),
    result_status: asNullableString(record.result_status),
    result_message: asNullableString(record.result_message),
    rounds: asNullableNumber(record.rounds),
    error_message: asNullableString(record.error_message),
    matched_skill: asNullableString(record.matched_skill),
    matched_skill_version: asNullableNumber(record.matched_skill_version),
    matched_skill_score: asNullableNumber(record.matched_skill_score),
    fallback_to_llm: asBoolean(record.fallback_to_llm),
    generated_skill_path: asNullableString(record.generated_skill_path),
    generated_skill_status: asNullableString(record.generated_skill_status),
    promotion_success_count: asNullableNumber(record.promotion_success_count),
    skill_generation_status: asNullableString(record.skill_generation_status),
    skill_generation_error: asNullableString(record.skill_generation_error),
    skill_generation_job_id: asNullableString(record.skill_generation_job_id),
    skill_generation_started_at: asNullableString(record.skill_generation_started_at),
    skill_generation_completed_at: asNullableString(record.skill_generation_completed_at),
    latest_evolution_job_id: asNullableString(record.latest_evolution_job_id),
    latest_evolution_status: asNullableString(record.latest_evolution_status),
    latest_evolution_started_at: asNullableString(record.latest_evolution_started_at),
    latest_evolution_completed_at: asNullableString(record.latest_evolution_completed_at),
    latest_evolution_final_skill_path: asNullableString(record.latest_evolution_final_skill_path),
    input_path: asNullableString(record.input_path),
    run_path: asNullableString(record.run_path),
    task_root: asNullableString(record.task_root),
    run_root: asNullableString(record.run_root),
    workspace_root: asNullableString(record.workspace_root),
    archive_root: asNullableString(record.archive_root),
    runtime_root: asNullableString(record.runtime_root),
    input_summary: record.input_summary && typeof record.input_summary === 'object' ? asRecord(record.input_summary) : null,
    output_summary: record.output_summary && typeof record.output_summary === 'object' ? asRecord(record.output_summary) : null,
    task_metadata: record.task_metadata && typeof record.task_metadata === 'object' ? asRecord(record.task_metadata) : null,
    created_at: asNullableString(record.created_at),
    started_at: asNullableString(record.started_at),
    completed_at: asNullableString(record.completed_at),
  };
};

const normalizeTaskList = (value: unknown): FirmwareUnpackTaskList => {
  const record = asRecord(value);
  const rawItems = Array.isArray(value)
    ? value
    : asArray(record.items).length > 0
      ? asArray(record.items)
      : asArray(record.tasks).length > 0
        ? asArray(record.tasks)
        : asArray(record.item);
  const items = rawItems.map(normalizeTask);
  return {
    total: asNumber(record.total, items.length),
    offset: asNumber(record.offset, 0),
    limit: asNumber(record.limit, items.length || 20),
    items,
  };
};

const normalizeTaskResourceUsage = (value: unknown): FirmwareTaskResourceUsage => {
  const record = asRecord(value);
  const containers = asArray(record.containers).map((item) => {
    const entry = asRecord(item);
    return {
      name: asNullableString(entry.name),
      cpu_millicores: asNumber(entry.cpu_millicores, 0),
      memory_mib: asNumber(entry.memory_mib, 0),
    };
  });
  return {
    task_id: asString(record.task_id),
    worker_id: asNullableString(record.worker_id),
    available: asBoolean(record.available),
    pod_name: asNullableString(record.pod_name),
    namespace: asNullableString(record.namespace),
    phase: asNullableString(record.phase),
    timestamp: asNullableString(record.timestamp),
    window: asNullableString(record.window),
    cpu_millicores: asNullableNumber(record.cpu_millicores),
    memory_mib: asNullableNumber(record.memory_mib),
    pod_cpu_limit_millicores: asNullableNumber(record.pod_cpu_limit_millicores),
    pod_memory_limit_mib: asNullableNumber(record.pod_memory_limit_mib),
    containers,
    message: asNullableString(record.message),
  };
};

const normalizeTaskProgress = (value: unknown): FirmwareTaskProgress => {
  const record = asRecord(value);
  const phases = asArray(record.phases).map((item) => {
    const entry = asRecord(item);
    return {
      key: asString(entry.key),
      label: asString(entry.label),
      status: asString(entry.status, 'pending'),
      detail: asNullableString(entry.detail),
      updated_at: asNullableString(entry.updated_at),
      current_round: asNullableNumber(entry.current_round),
      total_rounds: asNullableNumber(entry.total_rounds),
      duration_seconds: asNullableNumber(entry.duration_seconds),
    };
  });
  return {
    task_id: asString(record.task_id),
    current_phase: asNullableString(record.current_phase),
    summary: asNullableString(record.summary),
    current_round: asNullableNumber(record.current_round),
    total_rounds: asNullableNumber(record.total_rounds),
    phases,
  };
};

const normalizeTaskEvent = (value: unknown): FirmwareTaskEvent => {
  const record = asRecord(value);
  return {
    task_id: asString(record.task_id),
    project_id: asNullableString(record.project_id),
    id: asString(record.id),
    event_type: asString(record.event_type, 'event'),
    stage_key: asNullableString(record.stage_key),
    status: asNullableString(record.status),
    summary: asString(record.summary),
    detail: record.detail && typeof record.detail === 'object' && !Array.isArray(record.detail)
      ? (record.detail as Record<string, any>)
      : null,
    owner_id: asNullableString(record.owner_id),
    created_by: asNullableString(record.created_by),
    created_at: asNullableString(record.created_at),
  };
};

const normalizeTaskLog = (value: unknown): FirmwareTaskLog => {
  const record = asRecord(value);
  return {
    task_id: asString(record.task_id),
    run_path: asNullableString(record.run_path),
    available: asBoolean(record.available),
    log_text: asString(record.log_text),
    files: asArray(record.files).map((item) => asString(item)).filter(Boolean),
    phase: asNullableString(record.phase),
    message: asNullableString(record.message),
  };
};

const normalizeTaskEventList = (value: unknown): FirmwareTaskEventList => {
  const record = asRecord(value);
  const items = asArray(record.items).map(normalizeTaskEvent);
  return {
    total: asNumber(record.total, items.length),
    items,
  };
};

const normalizeTaskResult = (value: unknown): FirmwareTaskResult => {
  const record = asRecord(value);
  const summary = asRecord(record.summary);
  return {
    task_id: asString(record.task_id),
    available: asBoolean(record.available),
    status: asString(record.status, 'unknown'),
    output_root: asNullableString(record.output_root),
    run_root: asNullableString(record.run_root),
    summary_path: asNullableString(record.summary_path),
    reason_path: asNullableString(record.reason_path),
    tokens_summary_path: asNullableString(record.tokens_summary_path),
    summary_text: asNullableString(record.summary_text),
    reason_text: asNullableString(record.reason_text),
    warnings: asArray(record.warnings).map((item) => asString(item)).filter(Boolean),
    summary: {
      top_level_entries: asArray(summary.top_level_entries).map((item) => {
        const entry = asRecord(item);
        return {
          name: asString(entry.name),
          kind: asString(entry.kind, 'file'),
          file_count: asNumber(entry.file_count, 0),
          dir_count: asNumber(entry.dir_count, 0),
          total_size_bytes: asNumber(entry.total_size_bytes, 0),
        };
      }),
      file_extension_breakdown: asArray(summary.file_extension_breakdown).map((item) => {
        const entry = asRecord(item);
        return {
          extension: asString(entry.extension, '(none)'),
          file_count: asNumber(entry.file_count, 0),
          total_size_bytes: asNumber(entry.total_size_bytes, 0),
        };
      }),
      largest_files: asArray(summary.largest_files).map((item) => {
        const entry = asRecord(item);
        return {
          path: asString(entry.path),
          size_bytes: asNumber(entry.size_bytes, 0),
        };
      }).filter((item) => item.path),
      deepest_path: summary.deepest_path && typeof summary.deepest_path === 'object' && !Array.isArray(summary.deepest_path)
        ? {
            path: asString(asRecord(summary.deepest_path).path),
            depth: asNumber(asRecord(summary.deepest_path).depth, 0),
          }
        : null,
      output_file_count: asNumber(summary.output_file_count, 0),
      output_dir_count: asNumber(summary.output_dir_count, 0),
      output_total_size_bytes: asNumber(summary.output_total_size_bytes, 0),
      largest_file_path: asNullableString(summary.largest_file_path),
      largest_file_size_bytes: asNumber(summary.largest_file_size_bytes, 0),
      top_level_entry_count: asNumber(summary.top_level_entry_count, 0),
      avg_file_size_bytes: asNumber(summary.avg_file_size_bytes, 0),
      small_file_count: asNumber(summary.small_file_count, 0),
      medium_file_count: asNumber(summary.medium_file_count, 0),
      large_file_count: asNumber(summary.large_file_count, 0),
      matched_skill: asNullableString(summary.matched_skill),
      fallback_to_llm: asBoolean(summary.fallback_to_llm),
      generated_skill_path: asNullableString(summary.generated_skill_path),
      generated_skill_status: asNullableString(summary.generated_skill_status),
      promotion_success_count: asNumber(summary.promotion_success_count, 0),
      skill_generation_status: asNullableString(summary.skill_generation_status),
      skill_generation_error: asNullableString(summary.skill_generation_error),
      skill_generation_job_id: asNullableString(summary.skill_generation_job_id),
      skill_generation_started_at: asNullableString(summary.skill_generation_started_at),
      skill_generation_completed_at: asNullableString(summary.skill_generation_completed_at),
      latest_evolution_job: asNullableString(summary.latest_evolution_job),
      latest_evolution_status: asNullableString(summary.latest_evolution_status),
      latest_evolution_started_at: asNullableString(summary.latest_evolution_started_at),
      latest_evolution_completed_at: asNullableString(summary.latest_evolution_completed_at),
      latest_evolution_final_skill_path: asNullableString(summary.latest_evolution_final_skill_path),
      executor_rounds: asNumber(summary.executor_rounds, 0),
      session_count: asNumber(summary.session_count, 0),
      event_count: asNumber(summary.event_count, 0),
      started_at: asNullableString(summary.started_at),
      completed_at: asNullableString(summary.completed_at),
      duration_seconds: summary.duration_seconds == null ? null : asNumber(summary.duration_seconds, 0),
    },
  };
};

const normalizeTaskMetrics = (value: unknown): FirmwareTaskMetrics => {
  const record = asRecord(value);
  const task = asRecord(record.task);
  const resource = asRecord(record.resource);
  const progress = asRecord(record.progress);
  const events = asRecord(record.events);
  const sessions = asRecord(record.sessions);
  const result = asRecord(record.result);
  const rounds = asRecord(record.rounds);
  const health = asRecord(record.health);
  const containers = asArray(resource.containers).map((item) => {
    const entry = asRecord(item);
    return {
      name: asNullableString(entry.name),
      cpu_millicores: asNumber(entry.cpu_millicores, 0),
      memory_mib: asNumber(entry.memory_mib, 0),
    };
  });
  return {
    task_id: asString(record.task_id),
    task: {
      status: asString(task.status, 'unknown'),
      result_status: asNullableString(task.result_status),
      current_stage: asNullableString(task.current_stage),
      owner_id: asNullableString(task.owner_id),
      created_at: asNullableString(task.created_at),
      started_at: asNullableString(task.started_at),
      completed_at: asNullableString(task.completed_at),
      last_progress_at: asNullableString(task.last_progress_at),
      duration_seconds: asNullableNumber(task.duration_seconds),
      queue_wait_seconds: asNullableNumber(task.queue_wait_seconds),
      running_seconds: asNullableNumber(task.running_seconds),
    },
    resource: {
      available: asBoolean(resource.available),
      pod_name: asNullableString(resource.pod_name),
      namespace: asNullableString(resource.namespace),
      cpu_millicores: asNullableNumber(resource.cpu_millicores),
      memory_mib: asNullableNumber(resource.memory_mib),
      pod_cpu_limit_millicores: asNullableNumber(resource.pod_cpu_limit_millicores),
      pod_memory_limit_mib: asNullableNumber(resource.pod_memory_limit_mib),
      cpu_usage_percent: asNullableNumber(resource.cpu_usage_percent),
      memory_usage_percent: asNullableNumber(resource.memory_usage_percent),
      containers,
      message: asNullableString(resource.message),
    },
    progress: {
      current_phase: asNullableString(progress.current_phase),
      current_round: asNullableNumber(progress.current_round),
      total_rounds: asNullableNumber(progress.total_rounds),
      phase_count: asNumber(progress.phase_count, 0),
      completed_phase_count: asNumber(progress.completed_phase_count, 0),
      failed_phase_count: asNumber(progress.failed_phase_count, 0),
      running_phase_count: asNumber(progress.running_phase_count, 0),
    },
    events: {
      event_count: asNumber(events.event_count, 0),
      latest_event_type: asNullableString(events.latest_event_type),
      latest_event_summary: asNullableString(events.latest_event_summary),
      latest_event_at: asNullableString(events.latest_event_at),
    },
    sessions: {
      session_count: asNumber(sessions.session_count, 0),
      running_session_count: asNumber(sessions.running_session_count, 0),
      failed_session_count: asNumber(sessions.failed_session_count, 0),
      closed_session_count: asNumber(sessions.closed_session_count, 0),
    },
    result: {
      cache_available: asBoolean(result.cache_available),
      cache_updated_at: asNullableString(result.cache_updated_at),
      output_file_count: asNumber(result.output_file_count, 0),
      output_dir_count: asNumber(result.output_dir_count, 0),
      output_total_size_bytes: asNumber(result.output_total_size_bytes, 0),
      largest_file_size_bytes: asNumber(result.largest_file_size_bytes, 0),
      top_level_entry_count: asNumber(result.top_level_entry_count, 0),
      small_file_count: asNumber(result.small_file_count, 0),
      medium_file_count: asNumber(result.medium_file_count, 0),
      large_file_count: asNumber(result.large_file_count, 0),
      executor_rounds: asNumber(result.executor_rounds, 0),
      fallback_to_llm: asBoolean(result.fallback_to_llm),
      matched_skill: asNullableString(result.matched_skill),
    },
    rounds: (() => {
      const summary = asRecord(rounds.summary);
      const statusCounts = asRecord(summary.status_counts);
      const stageSummaryRecord = asRecord(summary.stage_summary);
      const stage_summary: Record<string, { round_count: number; duration_seconds: number; token_total: number }> = {};
      Object.entries(stageSummaryRecord).forEach(([key, value]) => {
        const item = asRecord(value);
        stage_summary[key] = {
          round_count: asNumber(item.round_count, 0),
          duration_seconds: asNumber(item.duration_seconds, 0),
          token_total: asNumber(item.token_total, 0),
        };
      });
      const items = asArray(rounds.items).map((value) => {
        const item = asRecord(value);
        const executor = asRecord(item.executor);
        const reviewer = asRecord(item.reviewer);
        const tokens = asRecord(item.tokens);
        const outputSnapshot = asRecord(item.output_snapshot);
        const outputDelta = asRecord(item.output_delta);
        const artifacts = asRecord(item.artifacts);
        const context = asRecord(item.context);
        return {
          round: asNumber(item.round, 0),
          status: asString(item.status, 'unknown'),
          started_at: asNullableString(item.started_at),
          completed_at: asNullableString(item.completed_at),
          duration_seconds: asNullableNumber(item.duration_seconds),
          executor: {
            status: asNullableString(executor.status),
            duration_seconds: asNullableNumber(executor.duration_seconds),
            response_preview: asNullableString(executor.response_preview),
            provider_role: asNullableString(executor.provider_role),
            session_file: asNullableString(executor.session_file),
          },
          reviewer: {
            passed: asBoolean(reviewer.passed),
            duration_seconds: asNullableNumber(reviewer.duration_seconds),
            review_preview: asNullableString(reviewer.review_preview),
            provider_role: asNullableString(reviewer.provider_role),
            session_file: asNullableString(reviewer.session_file),
          },
          tokens: {
            input: asNumber(tokens.input, 0),
            output: asNumber(tokens.output, 0),
            cache_read: asNumber(tokens.cache_read, 0),
            cache_write: asNumber(tokens.cache_write, 0),
            total: asNumber(tokens.total, 0),
            cost: asNumber(tokens.cost, 0),
          },
          output_snapshot: {
            output_file_count: asNumber(outputSnapshot.output_file_count, 0),
            output_dir_count: asNumber(outputSnapshot.output_dir_count, 0),
            output_total_size_bytes: asNumber(outputSnapshot.output_total_size_bytes, 0),
            largest_file_size_bytes: asNumber(outputSnapshot.largest_file_size_bytes, 0),
          },
          output_delta: {
            file_count_delta: asNumber(outputDelta.file_count_delta, 0),
            dir_count_delta: asNumber(outputDelta.dir_count_delta, 0),
            size_bytes_delta: asNumber(outputDelta.size_bytes_delta, 0),
            baseline_round: asNullableNumber(outputDelta.baseline_round),
          },
          artifacts: {
            summary_present: asBoolean(artifacts.summary_present),
            reason_present: asBoolean(artifacts.reason_present),
            warnings: asArray(artifacts.warnings).map((warning) => asString(warning)).filter(Boolean),
            summary_preview: asNullableString(artifacts.summary_preview),
            reason_preview: asNullableString(artifacts.reason_preview),
            summary_text: asNullableString(artifacts.summary_text),
            reason_text: asNullableString(artifacts.reason_text),
          },
          context: {
            matched_skill: asNullableString(context.matched_skill),
            fallback_to_llm: asBoolean(context.fallback_to_llm),
            provider_role: asNullableString(context.provider_role),
          },
          source_path: asNullableString(item.source_path),
          raw: asRecord(item.raw),
        };
      });
      const normalizedStatusCounts: Record<string, number> = {};
      Object.entries(statusCounts).forEach(([key, value]) => {
        normalizedStatusCounts[key] = asNumber(value, 0);
      });
      return {
        available: asBoolean(rounds.available),
        round_count: asNumber(rounds.round_count, 0),
        completed_round_count: asNumber(rounds.completed_round_count, 0),
        failed_round_count: asNumber(rounds.failed_round_count, 0),
        running_round: asNullableNumber(rounds.running_round),
        total_duration_seconds: asNumber(rounds.total_duration_seconds, 0),
        total_tokens: asNumber(rounds.total_tokens, 0),
        total_cost: asNumber(rounds.total_cost, 0),
        output_growth_bytes: asNumber(rounds.output_growth_bytes, 0),
        latest_round: asNullableNumber(rounds.latest_round),
        summary: {
          status_counts: normalizedStatusCounts,
          stage_summary,
        },
        items,
        warnings: asArray(rounds.warnings).map((warning) => asString(warning)).filter(Boolean),
      };
    })(),
    health: {
      is_terminal: asBoolean(health.is_terminal),
      has_owner: asBoolean(health.has_owner),
      resource_available: asBoolean(health.resource_available),
      result_cache_available: asBoolean(health.result_cache_available),
      warnings: asArray(health.warnings).map((item) => asString(item)).filter(Boolean),
    },
  };
};

const normalizeHealth = (value: unknown): FirmwareUnpackerHealth => {
  const record = asRecord(value);
  return {
    status: asString(record.status, typeof value === 'string' ? value : 'unknown'),
    worker_id: record.worker_id == null ? undefined : asString(record.worker_id),
  };
};

const normalizeLlmConfigFileSummaryList = (value: unknown): FirmwareLlmConfigFileSummaryList => {
  const record = asRecord(value);
  const items = asArray(record.items).map((item) => {
    const entry = asRecord(item);
    return {
      config_file_key: asString(entry.config_file_key),
      display_name: asString(entry.display_name),
      provider_type: asString(entry.provider_type),
      enabled: asBoolean(entry.enabled),
      is_default: asBoolean(entry.is_default),
      default_model: asNullableString(entry.default_model),
      description: asNullableString(entry.description),
      updated_at: asNullableString(entry.updated_at),
      model_options: asArray(entry.model_options).map((option) => {
        const model = asRecord(option);
        return {
          value: asString(model.value),
          label: asString(model.label || model.value),
          source: asNullableString(model.source),
        };
      }).filter((option) => option.value),
    };
  });
  return {
    total: asNumber(record.total, items.length),
    items,
  };
};

const normalizeWorker = (value: unknown): FirmwareWorkerInstance => {
  const record = asRecord(value);
  return {
    worker_id: asString(record.worker_id),
    hostname: asNullableString(record.hostname),
    pod_ip: asNullableString(record.pod_ip),
    started_at: asNullableString(record.started_at),
    last_heartbeat: asNullableString(record.last_heartbeat),
    is_alive: asBoolean(record.is_alive),
    active_tasks: asNumber(record.active_tasks, 0),
  };
};

const normalizeClusterInfo = (value: unknown): FirmwareClusterInfo => {
  const record = asRecord(value);
  const workers = (
    asArray(record.workers).length > 0 ? asArray(record.workers) :
    asArray(record.instances).length > 0 ? asArray(record.instances) :
    asArray(record.items)
  ).map(normalizeWorker);
  const rawTaskCounts = asRecord(record.task_counts);
  const task_counts = Object.fromEntries(
    Object.entries(rawTaskCounts).map(([key, item]) => [key, asNumber(item, 0)])
  );
  const concurrencyRecord = asRecord(record.concurrency);
  return {
    this_worker: asString(record.this_worker),
    total_workers: asNumber(record.total_workers, workers.length),
    alive_workers: asNumber(record.alive_workers, workers.filter((item) => item.is_alive).length),
    workers,
    task_counts,
    total_tasks: asNumber(record.total_tasks, Object.values(task_counts).reduce((sum, count) => sum + count, 0)),
    concurrency: {
      mode: asString(concurrencyRecord.mode, 'auto'),
      resource_based: asBoolean(concurrencyRecord.resource_based),
      effective_max_concurrent: asNumber(concurrencyRecord.effective_max_concurrent, 1),
      executor_capacity: asNumber(concurrencyRecord.executor_capacity, 1),
      manual_max_concurrent: asNumber(concurrencyRecord.manual_max_concurrent, 1),
      auto_max_concurrent: asNumber(concurrencyRecord.auto_max_concurrent, 1),
      cpu_based_limit: asNullableNumber(concurrencyRecord.cpu_based_limit),
      memory_based_limit: asNullableNumber(concurrencyRecord.memory_based_limit),
      cpu_millis_per_task: asNumber(concurrencyRecord.cpu_millis_per_task, 250),
      memory_mb_per_task: asNumber(concurrencyRecord.memory_mb_per_task, 512),
      reserved_cpu_millis: asNumber(concurrencyRecord.reserved_cpu_millis, 100),
      reserved_memory_mb: asNumber(concurrencyRecord.reserved_memory_mb, 256),
      pod_cpu_limit_millicores: asNullableNumber(concurrencyRecord.pod_cpu_limit_millicores),
      pod_memory_limit_mib: asNullableNumber(concurrencyRecord.pod_memory_limit_mib),
      pod_cpu_request_millicores: asNullableNumber(concurrencyRecord.pod_cpu_request_millicores),
      pod_memory_request_mib: asNullableNumber(concurrencyRecord.pod_memory_request_mib),
    },
  };
};

const normalizeConfigEntry = (value: unknown): FirmwareConfigEntry => {
  const record = asRecord(value);
  return {
    key: asString(record.key),
    value: asString(record.value),
    value_type: asString(record.value_type, 'string'),
    description: asNullableString(record.description),
    updated_at: asNullableString(record.updated_at),
  };
};

const normalizeConfigList = (value: unknown): FirmwareConfigList => {
  const record = asRecord(value);
  const rawItems = Array.isArray(value)
    ? value
    : asArray(record.items).length > 0
      ? asArray(record.items)
      : asArray(record.configs);
  const items = rawItems.map(normalizeConfigEntry);
  return {
    total: asNumber(record.total, items.length),
    items,
  };
};

const normalizeLlmProviderSummary = (value: unknown): FirmwareLlmProviderSummary => {
  const record = asRecord(value);
  return {
    provider_key: asString(record.provider_key),
    display_name: asString(record.display_name),
    provider_type: asString(record.provider_type),
    enabled: asBoolean(record.enabled),
    is_default: asBoolean(record.is_default),
    model: asString(record.model),
    description: asNullableString(record.description),
    updated_at: asNullableString(record.updated_at),
  };
};

const normalizeLlmProviderSummaryList = (value: unknown): FirmwareLlmProviderSummaryList => {
  const record = asRecord(value);
  const items = asArray(record.items).map(normalizeLlmProviderSummary);
  return {
    total: asNumber(record.total, items.length),
    default_provider_key: asNullableString(record.default_provider_key),
    items,
  };
};

const normalizeSubmitResult = (value: unknown): FirmwareUnpackSubmitResult => {
  const record = asRecord(value);
  return {
    task_id: asString(record.task_id),
    status: asString(record.status, 'pending'),
    message: asString(record.message, '任务已提交'),
    input_path: record.input_path == null ? undefined : asString(record.input_path),
    output_path: record.output_path == null ? undefined : asString(record.output_path),
    run_path: record.run_path == null ? undefined : asString(record.run_path),
  };
};

const normalizeEvolutionSubmitResult = (value: unknown): FirmwareEvolutionSubmitResult => {
  const record = asRecord(value);
  return {
    job_id: asString(record.job_id),
    status: asString(record.status, 'pending'),
    max_rounds: asNumber(record.max_rounds, 3),
  };
};

const normalizeRuntimeFileItem = (value: unknown): FirmwareRuntimeFileItem => {
  const record = asRecord(value);
  return {
    path: asString(record.path),
    kind: asString(record.kind, 'file'),
    size_bytes: asNumber(record.size_bytes, 0),
    modified_at: asNullableString(record.modified_at),
  };
};

const normalizeRuntimeFileList = (value: unknown): FirmwareRuntimeFileList => {
  const record = asRecord(value);
  const items = asArray(record.items).map(normalizeRuntimeFileItem);
  return {
    root: asString(record.root, '/data/secflow-app-firmware-unpacker'),
    total: asNumber(record.total, items.length),
    truncated: asBoolean(record.truncated),
    items,
  };
};

const normalizeEvolutionRound = (value: unknown): FirmwareEvolutionRound => {
  const record = asRecord(value);
  const metricsRecord = asRecord(record.metrics);
  return {
    id: asString(record.id),
    job_id: asString(record.job_id),
    round: asNumber(record.round, 0),
    status: asString(record.status, 'unknown'),
    tool_skill_path_before: asNullableString(record.tool_skill_path_before),
    tool_skill_path_after: asNullableString(record.tool_skill_path_after),
    tool_path_before: asNullableString(record.tool_path_before) ?? asNullableString(record.tool_skill_path_before),
    tool_path_after: asNullableString(record.tool_path_after) ?? asNullableString(record.tool_skill_path_after),
    tool_changed: asBoolean(record.tool_changed),
    review_result: asNullableString(record.review_result),
    summary_path: asNullableString(record.summary_path),
    reason_path: asNullableString(record.reason_path),
    source_skill_path: asNullableString(record.source_skill_path),
    source_tool_path: asNullableString(record.source_tool_path) ?? asNullableString(record.source_skill_path),
    started_without_matched_skill: asBoolean(record.started_without_matched_skill),
    generated_new_skill: asBoolean(record.generated_new_skill),
    generated_new_tool: asBoolean(record.generated_new_tool || record.generated_new_skill),
    executed_tool: asBoolean(record.executed_tool),
    tool_response_preview: asNullableString(record.tool_response_preview),
    metrics: record.metrics == null ? null : {
      tool_unpack_duration_seconds: asNullableNumber(metricsRecord.tool_unpack_duration_seconds),
      evolution_executor_tokens: asRecord(metricsRecord.evolution_executor_tokens) as Record<string, number> | null,
      reviewer_tokens: asRecord(metricsRecord.reviewer_tokens) as Record<string, number> | null,
      total_tokens: asRecord(metricsRecord.total_tokens) as Record<string, number> | null,
    },
    tool_unpack_duration_seconds: asNullableNumber(record.tool_unpack_duration_seconds),
    evolution_executor_tokens: asRecord(record.evolution_executor_tokens) as Record<string, number> | null,
    reviewer_tokens: asRecord(record.reviewer_tokens) as Record<string, number> | null,
    total_tokens: asRecord(record.total_tokens) as Record<string, number> | null,
    created_at: asNullableString(record.created_at),
    completed_at: asNullableString(record.completed_at),
  };
};

const normalizeEvolutionJob = (value: unknown): FirmwareEvolutionJob => {
  const record = asRecord(value);
  return {
    id: asString(record.id),
    task_id: asString(record.task_id),
    project_id: asNullableString(record.project_id),
    status: asString(record.status, 'unknown'),
    current_round: asNullableNumber(record.current_round),
    max_rounds: asNumber(record.max_rounds, 3),
    current_stage: asNullableString(record.current_stage),
    owner_id: asNullableString(record.owner_id),
    lease_expires_at: asNullableString(record.lease_expires_at),
    attempts: asNumber(record.attempts, 0),
    error_message: asNullableString(record.error_message),
    created_by: asNullableString(record.created_by),
    created_at: asNullableString(record.created_at),
    started_at: asNullableString(record.started_at),
    completed_at: asNullableString(record.completed_at),
    final_skill_path: asNullableString(record.final_skill_path),
    final_tool_path: asNullableString(record.final_tool_path) ?? asNullableString(record.final_skill_path),
    replaced_skill_path: asNullableString(record.replaced_skill_path),
    replaced_tool_path: asNullableString(record.replaced_tool_path) ?? asNullableString(record.replaced_skill_path),
    review_passed: asBoolean(record.review_passed),
    source_skill_path: asNullableString(record.source_skill_path),
    source_tool_path: asNullableString(record.source_tool_path) ?? asNullableString(record.source_skill_path),
    working_skill_path: asNullableString(record.working_skill_path),
    working_tool_path: asNullableString(record.working_tool_path) ?? asNullableString(record.working_skill_path),
    generated_new_skill: asBoolean(record.generated_new_skill),
    generated_new_tool: asBoolean(record.generated_new_tool || record.generated_new_skill),
    replacement_required: asBoolean(record.replacement_required),
    replacement_confirmed: asBoolean(record.replacement_confirmed ?? !record.replacement_required),
    effective_tool_path: asNullableString(record.effective_tool_path),
    started_without_matched_skill: asBoolean(record.started_without_matched_skill),
    run_root: asNullableString(record.run_root),
    session_root: asNullableString(record.session_root),
    task_output_path: asNullableString(record.task_output_path),
    round_count: asNumber(record.round_count, 0),
    rounds: asArray(record.rounds).map(normalizeEvolutionRound),
    source_task: record.source_task ? normalizeTask(record.source_task) : null,
  };
};

const normalizeEvolutionJobList = (value: unknown): FirmwareEvolutionJobList => {
  const record = asRecord(value);
  const items = asArray(record.items).map(normalizeEvolutionJob);
  return {
    total: asNumber(record.total, items.length),
    items,
  };
};

const normalizeEvolutionSessionIndex = (value: unknown): FirmwareEvolutionSessionIndex => {
  const record = asRecord(value);
  const normalized = normalizeFirmwareSessionIndex(value);
  return {
    version: normalized.version,
    session_root: asNullableString(record.session_root),
    items: normalized.items,
  };
};

const normalizeToolEntry = (value: unknown): FirmwareToolEntry => {
  const record = asRecord(value);
  return {
    filename: asString(record.filename),
    path: asString(record.path),
    name: asString(record.name),
    format_id: asString(record.format_id),
    description: asString(record.description),
    extensions: asArray(record.extensions).map((item) => asString(item)).filter(Boolean),
    magic_hex: asString(record.magic_hex),
    keywords: asArray(record.keywords).map((item) => asString(item)).filter(Boolean),
    binwalk_sigs: asArray(record.binwalk_sigs).map((item) => asString(item)).filter(Boolean),
    skill_status: asString(record.skill_status, 'candidate'),
    skill_version: asNumber(record.skill_version, 1),
    family_id: asString(record.family_id),
    promotion_success_count: asNumber(record.promotion_success_count, 0),
    promotion_threshold: asNumber(record.promotion_threshold, 5),
  };
};

const normalizeToolList = (value: unknown): FirmwareToolList => {
  const record = asRecord(value);
  const items = asArray(record.items).map(normalizeToolEntry);
  return {
    total: asNumber(record.total, items.length),
    items,
  };
};

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const firmwareUnpackerApi = {
  /** GET /api/app/firmware-unpacker/health */
  getHealth: async (): Promise<FirmwareUnpackerHealth> => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/health`, { headers: getHeaders() });
    return normalizeHealth(await handleResponse(r));
  },

  /** POST /api/app/firmware-unpacker/unpack → task_id */
  unpack: async (payload: FirmwareUnpackPayload): Promise<FirmwareUnpackSubmitResult> => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/unpack`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return normalizeSubmitResult(await handleResponse(r));
  },

  /** GET /api/app/firmware-unpacker/tasks?... — dynamic query */
  listTasks: async (query: TaskListQuery = {}): Promise<FirmwareUnpackTaskList> => {
    const p = new URLSearchParams();
    if (query.project_id) p.set('project_id', query.project_id);
    if (query.status)     p.set('status',     query.status);
    if (query.worker_id)  p.set('worker_id',  query.worker_id);
    if (query.origin_mode) p.set('origin_mode', query.origin_mode);
    if (query.search)     p.set('search',     query.search);
    if (query.limit  != null) p.set('limit',  String(query.limit));
    if (query.offset != null) p.set('offset', String(query.offset));
    const payload = await getJsonWithDedupe<any>(`${API_BASE}/api/app/firmware-unpacker/tasks?${p}`, { headers: getHeaders() });
    return normalizeTaskList(payload);
  },

  /** GET /api/app/firmware-unpacker/tasks/{id} */
  getTask: async (taskId: string): Promise<FirmwareUnpackTask> => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/tasks/${taskId}`, { headers: getHeaders() });
    return normalizeTask(await handleResponse(r));
  },

  /** GET /api/app/firmware-unpacker/tasks/{id}/resource-usage */
  getTaskResourceUsage: async (taskId: string): Promise<FirmwareTaskResourceUsage> => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/tasks/${taskId}/resource-usage`, { headers: getHeaders() });
    return normalizeTaskResourceUsage(await handleResponse(r));
  },

  /** GET /api/app/firmware-unpacker/tasks/{id}/progress */
  getTaskProgress: async (taskId: string): Promise<FirmwareTaskProgress> => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/tasks/${taskId}/progress`, { headers: getHeaders() });
    return normalizeTaskProgress(await handleResponse(r));
  },

  /** GET /api/app/firmware-unpacker/tasks/{id}/logs */
  getTaskLogs: async (taskId: string, phase?: string): Promise<FirmwareTaskLog> => {
    const query = new URLSearchParams();
    if (phase) query.set('phase', phase);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/tasks/${taskId}/logs${suffix}`, { headers: getHeaders() });
    return normalizeTaskLog(await handleResponse(r));
  },

  /** GET /api/app/firmware-unpacker/tasks/{id}/events */
  getTaskEvents: async (taskId: string, limit = 200): Promise<FirmwareTaskEventList> => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/tasks/${taskId}/events?limit=${encodeURIComponent(String(limit))}`, { headers: getHeaders() });
    return normalizeTaskEventList(await handleResponse(r));
  },

  /** GET /api/app/firmware-unpacker/tasks/{id}/result */
  getTaskResult: async (taskId: string): Promise<FirmwareTaskResult> => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/tasks/${taskId}/result`, { headers: getHeaders() });
    return normalizeTaskResult(await handleResponse(r));
  },

  /** GET /api/app/firmware-unpacker/tasks/{id}/metrics */
  getTaskMetrics: async (taskId: string): Promise<FirmwareTaskMetrics> => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/tasks/${taskId}/metrics`, { headers: getHeaders() });
    return normalizeTaskMetrics(await handleResponse(r));
  },

  /** POST /api/app/firmware-unpacker/projects/{project_id}/tasks/{id}/evolution */
  createEvolutionJob: async (taskId: string, projectId?: string | null): Promise<FirmwareEvolutionSubmitResult> => {
    const path = projectId
      ? `${API_BASE}/api/app/firmware-unpacker/projects/${encodeURIComponent(projectId)}/tasks/${taskId}/evolution`
      : `${API_BASE}/api/app/firmware-unpacker/tasks/${taskId}/evolution`;
    const r = await fetch(path, {
      method: 'POST',
      headers: getHeaders(),
    });
    return normalizeEvolutionSubmitResult(await handleResponse(r));
  },

  /** GET /api/app/firmware-unpacker/projects/{project_id}/tasks/{id}/evolution-jobs */
  listEvolutionJobs: async (taskId: string, projectId?: string | null): Promise<FirmwareEvolutionJobList> => {
    const path = projectId
      ? `${API_BASE}/api/app/firmware-unpacker/projects/${encodeURIComponent(projectId)}/tasks/${taskId}/evolution-jobs`
      : `${API_BASE}/api/app/firmware-unpacker/tasks/${taskId}/evolution-jobs`;
    const r = await fetch(path, { headers: getHeaders() });
    return normalizeEvolutionJobList(await handleResponse(r));
  },

  /** GET /api/app/firmware-unpacker/projects/{project_id}/evolution-jobs */
  listAllEvolutionJobs: async (query: { project_id?: string | null; status?: string; search?: string; limit?: number; offset?: number } = {}): Promise<FirmwareEvolutionJobList> => {
    const p = new URLSearchParams();
    if (query.status) p.set('status', query.status);
    if (query.search) p.set('search', query.search);
    if (query.limit != null) p.set('limit', String(query.limit));
    if (query.offset != null) p.set('offset', String(query.offset));
    const suffix = p.toString() ? `?${p.toString()}` : '';
    const path = query.project_id
      ? `${API_BASE}/api/app/firmware-unpacker/projects/${encodeURIComponent(query.project_id)}/evolution-jobs${suffix}`
      : `${API_BASE}/api/app/firmware-unpacker/evolution-jobs${suffix}`;
    const r = await fetch(path, { headers: getHeaders() });
    return normalizeEvolutionJobList(await handleResponse(r));
  },

  /** GET /api/app/firmware-unpacker/runtime-files */
  listRuntimeFiles: async (projectId?: string | null, limit = 2000, root?: string | null): Promise<FirmwareRuntimeFileList> => {
    const query = new URLSearchParams({ limit: String(limit) });
    if (root) query.set('root', root);
    const path = projectId
      ? `${API_BASE}/api/app/firmware-unpacker/projects/${encodeURIComponent(projectId)}/runtime-files?${query.toString()}`
      : `${API_BASE}/api/app/firmware-unpacker/runtime-files?${query.toString()}`;
    const r = await fetch(path, { headers: getHeaders() });
    return normalizeRuntimeFileList(await handleResponse(r));
  },

  fetchRuntimeFilePreviewBlob: async (path: string, projectId?: string | null, maxBytes = 262144, root?: string | null): Promise<FirmwareRuntimeFilePreview> => {
    const query = new URLSearchParams({ path, max_bytes: String(maxBytes) });
    if (root) query.set('root', root);
    const target = projectId
      ? `${API_BASE}/api/app/firmware-unpacker/projects/${encodeURIComponent(projectId)}/runtime-files/content?${query.toString()}`
      : `${API_BASE}/api/app/firmware-unpacker/runtime-files/content?${query.toString()}`;
    const response = await fetch(target, { headers: getHeaders() });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `HTTP ${response.status}`);
    }
    return {
      blob: await response.blob(),
      contentType: response.headers.get('content-type') || '',
      truncated: String(response.headers.get('X-Runtime-Preview-Truncated') || '').toLowerCase() === 'true',
    };
  },

  /** GET /api/app/firmware-unpacker/evolution-jobs/{id} */
  getEvolutionJob: async (jobId: string): Promise<FirmwareEvolutionJob> => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/evolution-jobs/${jobId}`, { headers: getHeaders() });
    return normalizeEvolutionJob(await handleResponse(r));
  },

  /** GET /api/app/firmware-unpacker/evolution-jobs/{id}/rounds */
  getEvolutionRounds: async (jobId: string): Promise<FirmwareEvolutionRound[]> => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/evolution-jobs/${jobId}/rounds`, { headers: getHeaders() });
    return asArray(await handleResponse(r)).map(normalizeEvolutionRound);
  },

  /** GET /api/app/firmware-unpacker/evolution-jobs/{id}/sessions */
  getEvolutionSessions: async (jobId: string): Promise<FirmwareEvolutionSessionIndex> => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/evolution-jobs/${jobId}/sessions`, { headers: getHeaders() });
    return normalizeEvolutionSessionIndex(await handleResponse(r));
  },

  /** GET /api/app/firmware-unpacker/evolution-jobs/{id}/logs */
  getEvolutionLogs: async (jobId: string, round: number, role: string): Promise<FirmwareTaskLog> => {
    const query = new URLSearchParams({ round: String(round), role });
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/evolution-jobs/${jobId}/logs?${query.toString()}`, { headers: getHeaders() });
    return normalizeTaskLog(await handleResponse(r));
  },

  /** POST /api/app/firmware-unpacker/evolution-jobs/{id}/confirm-replacement */
  confirmEvolutionReplacement: async (jobId: string): Promise<{ message: string; task_id?: string | null }> => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/evolution-jobs/${jobId}/confirm-replacement`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(r);
  },

  /** POST /api/app/firmware-unpacker/evolution-jobs/{id}/cancel */
  cancelEvolutionJob: async (jobId: string): Promise<{ message: string; task_id?: string | null }> => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/evolution-jobs/${jobId}/cancel`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(r);
  },

  /** POST /api/app/firmware-unpacker/evolution-jobs/{id}/retry */
  retryEvolutionJob: async (jobId: string): Promise<{ message: string; task_id?: string | null }> => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/evolution-jobs/${jobId}/retry`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(r);
  },

  /** DELETE /api/app/firmware-unpacker/evolution-jobs/{id} */
  deleteEvolutionJob: async (jobId: string): Promise<{ message: string; task_id?: string | null }> => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/evolution-jobs/${jobId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(r);
  },

  /** DELETE /api/app/firmware-unpacker/tasks/{id} */
  deleteTask: async (taskId: string) => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/tasks/${taskId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(r);
  },

  /** POST /api/app/firmware-unpacker/tasks/{id}/cancel */
  cancelTask: async (taskId: string) => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/tasks/${taskId}/cancel`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(r);
  },

  /** POST /api/app/firmware-unpacker/tasks/{id}/retry */
  retryTask: async (taskId: string) => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/tasks/${taskId}/retry`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(r);
  },

  /** POST /api/app/firmware-unpacker/tasks/{id}/refresh-result-cache */
  refreshTaskResultCache: async (taskId: string) => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/tasks/${taskId}/refresh-result-cache`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(r);
  },

  /** POST /api/app/firmware-unpacker/tasks/batch-delete */
  batchDelete: async (taskIds: string[]) => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/tasks/batch-delete`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ task_ids: taskIds }),
    });
    return handleResponse(r);
  },

  /** GET /api/app/firmware-unpacker/cluster */
  getCluster: async (): Promise<FirmwareClusterInfo> => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/cluster`, { headers: getHeaders() });
    return normalizeClusterInfo(await handleResponse(r));
  },

  /** GET /api/app/firmware-unpacker/config */
  getConfig: async (): Promise<FirmwareConfigList> => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/config`, { headers: getHeaders() });
    return normalizeConfigList(await handleResponse(r));
  },

  /** GET /api/app/firmware-unpacker/llm/providers */
  getLlmProviders: async (): Promise<FirmwareLlmProviderSummaryList> => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/llm/providers`, { headers: getHeaders() });
    return normalizeLlmProviderSummaryList(await handleResponse(r));
  },

  /** GET /api/app/firmware-unpacker/llm/config-files */
  getLlmConfigFiles: async (): Promise<FirmwareLlmConfigFileSummaryList> => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/llm/config-files`, { headers: getHeaders() });
    return normalizeLlmConfigFileSummaryList(await handleResponse(r));
  },

  /** GET /api/app/firmware-unpacker/tools */
  getTools: async (): Promise<FirmwareToolList> => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/tools`, { headers: getHeaders() });
    return normalizeToolList(await handleResponse(r));
  },

  /** PUT /api/app/firmware-unpacker/config/{key} */
  updateConfig: async (key: string, value: string, description?: string) => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/config/${key}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ key, value, description }),
    });
    return normalizeConfigEntry(await handleResponse(r));
  },

  /** POST /api/app/firmware-unpacker/config/batch-update */
  batchUpdateConfig: async (updates: Array<{ key: string; value: string }>) => {
    const r = await fetch(`${API_BASE}/api/app/firmware-unpacker/config/batch-update`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(updates),
    });
    return normalizeConfigList(await handleResponse(r));
  },
};
