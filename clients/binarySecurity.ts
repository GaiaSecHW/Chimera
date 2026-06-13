import type { ServiceHealthMeta } from '../components/execution/serviceHealthMeta';
import { API_BASE, getHeaders, getJsonWithDedupe, handleResponse } from './base';

export interface BinarySecurityHealth extends ServiceHealthMeta {
  status: string;
  service?: string | null;
  role?: string | null;
}

export interface BinarySecurityInputFile {
  filename: string;
  size?: number;
  content_type?: string;
  relative_path?: string | null;
  metadata?: Record<string, any>;
}

export type BinarySecurityTaskType = 'binary' | 'source' | 'binary_module';
export type BinarySecurityModuleSelectionMode = 'auto' | 'manual_confirm' | string;
export type BinarySecurityEntrySelectionMode = 'auto' | 'manual_confirm' | string;
export type BinarySecurityPipelineMode = 'barrier' | 'mixed_streaming';

export interface BinarySecurityStageOption {
  enabled: boolean;
}

export interface BinarySecurityTaskPolicy {
  max_stage_parallelism?: number;
  max_retries_per_item?: number;
  continue_on_item_failure?: boolean;
  pipeline_mode?: BinarySecurityPipelineMode;
  partial_success_stage_advancement?: Record<string, boolean>;
  stage_parallelism?: Record<string, number>;
  stage_options?: Record<string, BinarySecurityStageOption>;
  module_selection_mode?: BinarySecurityModuleSelectionMode;
  entry_selection_mode?: BinarySecurityEntrySelectionMode;
  module_risk_levels?: string[];
  [key: string]: any;
}

export interface BinarySecurityAbnormalEvidence {
  key: string;
  label: string;
  value: string;
}

export interface BinarySecurityAbnormalReason {
  is_abnormal: boolean;
  category: string;
  code: string;
  title: string;
  message: string;
  terminal: boolean;
  source_layer: string;
  status: string;
  service: string;
  stage_name?: string | null;
  item_key?: string | null;
  downstream_task_id?: string | null;
  downstream_service?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  evidence: BinarySecurityAbnormalEvidence[];
  recommended_action?: string | null;
  related_event_ids: string[];
}

export interface BinarySecurityAbnormalReasonEventSummary {
  event_id: string;
  created_at: string;
  reason: BinarySecurityAbnormalReason;
}

export interface BinarySecurityModuleContract {
  contract_version?: number;
  input_kind?: string | null;
  output_kind?: string | null;
  firmware_key?: string | null;
  firmware_name?: string | null;
  filename?: string | null;
  unpacked_root?: string | null;
  task_type?: BinarySecurityTaskType | string | null;
  module_key?: string | null;
  module_name?: string | null;
  module_dir?: string | null;
  descriptor_root?: string | null;
  source_dir?: string | null;
  source_root?: string | null;
  source_root_path?: string | null;
  files_list_path?: string | null;
  files_list?: string | null;
  entry_descriptor_root?: string | null;
  entry_files_list?: string | null;
  entry_descriptor_ready?: boolean;
  module_report?: string | null;
  primary_result_kind?: string | null;
  result_kinds?: string[];
  artifact_kind_summary?: Record<string, number>;
  result_kind_summary?: Record<string, number>;
  artifact_index_path?: string | null;
  result_summary_version?: number;
  risk_level?: string | null;
  risk_score?: number | null;
  rank?: number | null;
  file_count?: number | null;
  language?: string | null;
  module_type?: string | null;
  artifact_root?: string | null;
  archive_root?: string | null;
  entry_count?: number | null;
  entries?: BinarySecurityEntryContract[];
  entries_preview?: BinarySecurityEntryContract[];
  [key: string]: any;
}

export interface BinarySecurityEntryContract {
  entry_key?: string | null;
  firmware_key?: string | null;
  firmware_name?: string | null;
  module_key?: string | null;
  module_name?: string | null;
  module_dir?: string | null;
  descriptor_root?: string | null;
  source_dir?: string | null;
  source_root?: string | null;
  source_root_path?: string | null;
  module_input_path?: string | null;
  files_list_path?: string | null;
  entry_file?: string | null;
  file_name?: string | null;
  source_file?: string | null;
  definition_file?: string | null;
  function_name?: string | null;
  raw_function_name?: string | null;
  line_no?: string | null;
  definition_line?: string | null;
  definition_kind?: string | null;
  function_description?: string | null;
  entry_reason?: string | null;
  taint_params?: string[];
  artifact_root?: string | null;
  archive_root?: string | null;
  data_flow_root?: string | null;
  data_flow_files?: string[];
  primary_report_path?: string | null;
  data_flow_file?: string | null;
  input_contract?: BinarySecurityEntryContract | BinarySecurityModuleContract | null;
  [key: string]: any;
}

export interface BinarySecurityEntryOutputContract extends BinarySecurityEntryContract {
  module_input_path?: string | null;
  source_root_path?: string | null;
  source_dir?: string | null;
  definition_file?: string | null;
  definition_line?: string | null;
  definition_kind?: string | null;
  taint_params?: string[];
  function_description?: string | null;
  function_description_source?: string | null;
  entry_reason?: string | null;
  entry_reason_source?: string | null;
  taint_details?: Array<Record<string, any>>;
}

export interface BinarySecurityDataflowOutputContract extends BinarySecurityEntryOutputContract {
  source_file?: string | null;
  artifact_root?: string | null;
  archive_root?: string | null;
  data_flow_file?: string | null;
  data_flow_root?: string | null;
  primary_report_path?: string | null;
}

export type BinarySecurityStageItemInputContract = BinarySecurityModuleContract | BinarySecurityEntryOutputContract | BinarySecurityDataflowOutputContract;
export type BinarySecurityStageItemOutputContract = BinarySecurityModuleContract | BinarySecurityEntryOutputContract | BinarySecurityDataflowOutputContract;
export type BinarySecurityStageItemResultContract = BinarySecurityModuleContract | BinarySecurityEntryOutputContract | BinarySecurityDataflowOutputContract;

export interface BinarySecurityTask {
  id: string;
  project_id: string;
  task_type: BinarySecurityTaskType;
  name: string;
  status: string;
  runtime_phase?: string;
  tail_reconcile_state?: string;
  task_control_mode?: string;
  execution_epoch: number;
  current_stage?: string | null;
  last_error?: string | null;
  terminal_failure?: boolean;
  requeue_suppressed?: boolean;
  failure_code?: string | null;
  failure_category?: string | null;
  failure_message?: string | null;
  last_successful_downstream_sync_at?: string | null;
  last_sync_attempt_at?: string | null;
  last_sync_error_at?: string | null;
  last_sync_error_type?: string | null;
  last_sync_error_message?: string | null;
  active_sync_error_item_count?: number;
  never_synced_item_count?: number;
  stale_synced_item_count?: number;
  firmware_path: string;
  stage_sequence: string[];
  is_queued: boolean;
  queue_position?: number | null;
  queue_state?: 'queued' | 'db_pending_not_enqueued' | 'leased' | 'dispatching' | 'tail_reconciling' | 'idle' | string;
  recoverable_reason?: string | null;
  last_reconcile_at?: string | null;
  dispatcher_instance_id?: string | null;
  task_lease_owner_instance_id?: string | null;
  task_lease_expires_at?: string | null;
  task_lease_source?: string | null;
  tail_control_mode?: string;
  tail_has_runnable_unbound_items?: boolean;
  tail_unbound_runnable_item_count?: number;
  tail_bound_active_item_count?: number;
  tail_has_downstream_refs?: boolean;
  tail_takeover_required?: boolean;
  tail_takeover_reason?: string | null;
  reconcile_owner_instance_id?: string | null;
  reconcile_lease_expires_at?: string | null;
  reconcile_owner_pod_uid?: string | null;
  reconcile_owner_boot_id?: string | null;
  reconcile_generation?: number | null;
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
  module_selection_mode: BinarySecurityModuleSelectionMode;
  entry_selection_mode: BinarySecurityEntrySelectionMode;
  candidate_entry_count: number;
  selected_entry_count: number;
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
    retry_failed_supported?: boolean;
    retry_failed_reason?: string | null;
    retry_full_supported?: boolean;
    retry_full_reason?: string | null;
    total_items: number;
    success_items: number;
    failed_items: number;
    orchestration_failed_items?: number;
    downstream_missing_items?: number;
    cancelled_items?: number;
    downstream_status_counts?: Record<string, number>;
    skipped_items: number;
    running_items: number;
    started_at?: string | null;
    finished_at?: string | null;
    last_error?: string | null;
    abnormal_reason?: BinarySecurityAbnormalReason | null;
  }>;
  task_retry_supported: boolean;
  task_retry_reason?: string | null;
  task_continue_supported: boolean;
  task_continue_reason?: string | null;
  task_retry_failed_items_supported?: boolean;
  task_retry_failed_items_reason?: string | null;
  abnormal_reason_title?: string | null;
  abnormal_reason_code?: string | null;
  abnormal_reason_category?: string | null;
  abnormal_reason?: BinarySecurityAbnormalReason | null;
  cleanup_state?: {
    status?: string | null;
    partial_failed?: boolean;
    deferred_ref_count?: number;
    blocking_ref_count?: number;
    last_error?: string | null;
    last_attempt_at?: string | null;
    next_retry_at?: string | null;
  };
  manual_operation_state?: {
    overall: 'ready' | 'blocked' | 'in_progress' | string;
    summary: string;
    blocking_code?: string | null;
    blocking_reason?: string | null;
    operation_in_progress: boolean;
    operation_type?: string | null;
    operation_status?: string | null;
    operation_owner?: string | null;
    operation_started_at?: string | null;
    operation_expires_at?: string | null;
    operation_heartbeat_at?: string | null;
    current_step?: string | null;
    target_stage?: string | null;
    error_code?: string | null;
    error_message?: string | null;
    cleanup_partial_failed?: boolean;
    downstream_cleanup_result_count?: number;
    downstream_cleanup_blocking_count?: number;
    downstream_cleanup_blocking_refs?: Array<Record<string, any>>;
    downstream_cleanup_deferred_count?: number;
    downstream_cleanup_deferred_refs?: Array<Record<string, any>>;
    downstream_cleanup_warning_summary?: string | null;
    can_cancel: boolean;
    can_continue: boolean;
    can_retry: boolean;
    can_retry_failed_items?: boolean;
    can_retry_stage: boolean;
    can_retry_stage_failed_items?: boolean;
    can_retry_stage_full?: boolean;
    can_retry_archive: boolean;
    can_retry_archive_failed_items?: boolean;
    can_retry_archive_full?: boolean;
    can_delete: boolean;
    can_edit_policy: boolean;
    can_confirm_modules: boolean;
  };
}

export interface BinarySecurityCleanupSnapshot {
  requested_at?: string | null;
  previous_epoch?: number;
  stage_sequence?: string[];
  downstream_refs?: Array<{
    service?: string;
    task_id?: string;
    project_id?: string;
    stage_name?: string | null;
  }>;
  cleanup_counts?: {
    archive_jobs_deleted?: number;
    stage_items_deleted?: number;
    stage_runs_deleted?: number;
    timeline_events_deleted?: number;
    state_events_deleted?: number;
    [key: string]: number | undefined;
  };
  delete_cleanup_status?: string | null;
  workspace_root?: string | null;
  downstream_ref_count?: number;
  deleted_downstream_count?: number;
  force_delete?: boolean;
  cleanup_partial_failed?: boolean;
  downstream_cleanup_results?: Array<Record<string, any>>;
  downstream_cleanup_blocking_refs?: Array<Record<string, any>>;
  deferred_downstream_refs?: Array<Record<string, any>>;
  deferred_cleanup_attempts?: number;
  deferred_cleanup_last_error?: string | null;
  deferred_cleanup_last_attempt_at?: string | null;
  deferred_cleanup_next_retry_at?: string | null;
  deferred_cleanup_status?: string | null;
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
  candidate_entry_count: number;
  policy: BinarySecurityTaskPolicy;
  summary: Record<string, any> & {
    selected_modules?: BinarySecurityModuleContract[];
    candidate_modules?: BinarySecurityModuleContract[];
    system_analysis_modules?: BinarySecurityModuleContract[];
    b2s_results?: BinarySecurityModuleContract[];
    entry_results?: BinarySecurityEntryOutputContract[];
    dataflow_results?: BinarySecurityDataflowOutputContract[];
  };
  metrics: Record<string, any>;
  item_stats: Record<string, Record<string, number>>;
  stage_items_total?: number;
  stage_items_truncated?: boolean;
  stage_items: Array<{
    id: string;
    stage_name: string;
    item_key: string;
    item_name?: string | null;
    parent_key?: string | null;
    status: string;
    downstream_status?: string | null;
    downstream_binding_state?: string | null;
    total_retry_count?: number;
    rerun_count?: number;
    auto_retry_count?: number;
    downstream_create_attempts?: number;
    downstream_create_last_attempt_at?: string | null;
    downstream_create_next_retry_at?: string | null;
    downstream_create_last_error?: string | null;
    downstream_create_last_error_type?: string | null;
    downstream_create_recoverable?: boolean | null;
    downstream_binding_message?: string | null;
    retry_count: number;
    downstream_service?: string | null;
    downstream_task_id?: string | null;
    downstream_summary?: {
      high_risk_module_count?: number | null;
      medium_risk_module_count?: number | null;
      low_risk_module_count?: number | null;
      entry_count?: number | null;
      [key: string]: any;
    } | null;
    input_ref: BinarySecurityStageItemInputContract;
    output_ref: BinarySecurityStageItemOutputContract;
    result: BinarySecurityStageItemResultContract;
    error_message?: string | null;
    abnormal_reason?: BinarySecurityAbnormalReason | null;
    sync_status?: string | null;
    last_synced_at?: string | null;
    last_sync_attempt_at?: string | null;
    last_sync_success_at?: string | null;
    last_sync_error_at?: string | null;
    last_sync_error_message?: string | null;
    last_sync_error_type?: string | null;
    sync_freshness_state?: string | null;
    sync_observation_error_message?: string | null;
    sync_observation_error_type?: string | null;
    sync_observation_http_status?: number | null;
    first_started_at?: string | null;
    latest_started_at?: string | null;
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
    archive_source_primary_path?: string | null;
    archive_source_paths?: string[];
    source_root?: string | null;
    source_root_path?: string | null;
    source_dir?: string | null;
    archive_status: string;
    archive_root?: string | null;
    error_message?: string | null;
    abnormal_reason?: BinarySecurityAbnormalReason | null;
    attempts: number;
    created_at?: string | null;
    started_at?: string | null;
    completed_at?: string | null;
    updated_at?: string | null;
    retry_supported: boolean;
    retry_reason?: string | null;
    retry_failed_supported?: boolean;
    retry_failed_reason?: string | null;
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
  orchestration_observability?: BinarySecurityOrchestrationObservability;
  cleanup_snapshot?: BinarySecurityCleanupSnapshot;
  runtime_health?: BinarySecurityRuntimeHealth;
  abnormal_reason_history?: BinarySecurityAbnormalReasonEventSummary[];
}

export interface BinarySecurityRuntimeHealthEvidence {
  label: string;
  value?: string | null;
}

export interface BinarySecurityRuntimeHealthUnit {
  unit_key: string;
  unit_label: string;
  unit_kind: string;
  status: string;
  task_scoped: boolean;
  owner_instance_id?: string | null;
  started_at?: string | null;
  last_heartbeat_at?: string | null;
  age_seconds?: number | null;
  detail?: string | null;
  reason?: string | null;
  evidence: BinarySecurityRuntimeHealthEvidence[];
}

export interface BinarySecurityRuntimeHealthSummary {
  overall_status: string;
  active_unit_count: number;
  healthy_unit_count: number;
  degraded_unit_count: number;
  unhealthy_unit_count: number;
  last_updated_at?: string | null;
  message?: string | null;
}

export interface BinarySecurityRuntimeHealth {
  summary: BinarySecurityRuntimeHealthSummary;
  units: BinarySecurityRuntimeHealthUnit[];
}

export interface BinarySecurityStageItemPage {
  task_id: string;
  stage_name: string;
  total: number;
  page: number;
  per_page: number;
  items: BinarySecurityTaskDetail['stage_items'];
}

export interface BinarySecurityArchiveJobPage {
  task_id: string;
  stage_name?: string | null;
  total: number;
  page: number;
  per_page: number;
  items: BinarySecurityTaskDetail['archive_jobs'];
}

export interface BinarySecurityOverviewResponse {
  task_id: string;
  nodes: BinarySecurityOverviewNode[];
}

export interface BinarySecurityOrchestrationObservability {
  state_events?: {
    status_counts?: Record<string, number>;
    oldest_active_age_seconds?: number;
    processing?: Array<Record<string, any>>;
    dead_letters?: Array<Record<string, any>>;
    recent?: Array<Record<string, any>>;
  };
  task_state_lock?: {
    active?: boolean;
    owner_id?: string | null;
    operation?: string | null;
    lease_expires_at?: string | null;
    heartbeat_at?: string | null;
  };
  archive?: {
    by_stage?: Record<string, Record<string, number>>;
  };
  reconcile?: {
    latest_event_type?: string | null;
    latest_event_at?: string | null;
    latest_message?: string | null;
  };
  files?: {
    summary_path?: string | null;
    metadata_path?: string | null;
  };
}

export interface BinarySecurityOverviewBusinessDetail {
  total_items: number;
  success_items: number;
  failed_items: number;
  orchestration_failed_items: number;
  downstream_missing_items: number;
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
  abnormal_reason?: BinarySecurityAbnormalReason | null;
  retry_supported: boolean;
  retry_reason?: string | null;
  retry_failed_supported?: boolean;
  retry_failed_reason?: string | null;
  retry_full_supported?: boolean;
  retry_full_reason?: string | null;
  detail: BinarySecurityOverviewBusinessDetail | BinarySecurityOverviewArchiveDetail;
}

export interface BinarySecurityModuleSelection {
  task_id: string;
  status: string;
  selection_mode: BinarySecurityModuleSelectionMode;
  risk_levels: string[];
  requires_confirmation: boolean;
  system_analysis_modules: BinarySecurityModuleContract[];
  candidate_modules: BinarySecurityModuleContract[];
  selected_modules: BinarySecurityModuleContract[];
}

export interface BinarySecurityModuleReportDetail {
  task_id: string;
  module_key: string;
  module_name: string;
  module_report_path?: string | null;
  module_report_markdown?: string | null;
  risk_level?: string | null;
  risk_score?: number | null;
  file_count?: number | null;
  source_tags?: string[];
  available: boolean;
  warning?: string | null;
  error_message?: string | null;
}

export interface BinarySecurityEntrySelection {
  task_id: string;
  status: string;
  selection_mode: BinarySecurityEntrySelectionMode;
  requires_confirmation: boolean;
  candidate_entries: BinarySecurityEntryContract[];
  selected_entry_keys: string[];
  selected_entries: BinarySecurityEntryContract[];
  entry_results: BinarySecurityEntryOutputContract[];
  confirmed_at?: string | null;
}

export interface BinarySecurityTimeline {
  task_id: string;
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
  events: Array<{
    id: string;
    stage_name?: string | null;
    item_id?: string | null;
    item_key?: string | null;
    level: string;
    event_type: string;
    message: string;
    payload: Record<string, any>;
    compressed?: boolean;
    repeat_count?: number;
    created_at: string;
  }>;
}

export interface BinarySecurityReducerEventRecordSummary {
  pending_count: number;
  processing_count: number;
  retryable_count: number;
  dead_letter_count: number;
  processed_count: number;
  failed_like_count: number;
  slow_event_count: number;
  max_processing_duration_ms?: number | null;
  p95_processing_duration_ms?: number | null;
  avg_processing_duration_ms?: number | null;
}

export interface BinarySecurityReducerEventRecord {
  event_id: string;
  task_id: string;
  project_id: string;
  stage_name?: string | null;
  event_type: string;
  queue_status: string;
  attempts: number;
  leased_by?: string | null;
  created_at?: string | null;
  available_at?: string | null;
  lease_expires_at?: string | null;
  processed_at?: string | null;
  processing_started_at?: string | null;
  queue_wait_ms?: number | null;
  processing_duration_ms?: number | null;
  end_to_end_duration_ms?: number | null;
  result: string;
  failure_kind: string;
  failure_reason?: string | null;
  last_error?: string | null;
  handler_pod?: string | null;
  handler_instance?: string | null;
  idempotency_key?: string | null;
}

export interface BinarySecurityReducerEventRecordPage {
  total: number;
  page: number;
  page_size: number;
  truncated: boolean;
  items: BinarySecurityReducerEventRecord[];
  summary: BinarySecurityReducerEventRecordSummary;
}

export interface BinarySecurityArtifacts {
  task_id: string;
  workspace_root: string;
  output_root: string;
  fileserver_path?: string | null;
  grouped_by_index?: boolean;
  artifact_groups?: Array<{
    module_key: string;
    module_name?: string | null;
    source_root?: string | null;
    primary_result_kind?: string | null;
    result_kinds: string[];
    artifact_kind_summary: Record<string, number>;
    result_kind_summary: Record<string, number>;
    artifact_index_path?: string | null;
    result_summary_version: number;
    artifacts: Array<{
      relative_path: string;
      kind: string;
      size: number;
      stage?: string | null;
      section?: string | null;
      batch_no?: number | null;
      attempt_no?: number | null;
    }>;
  }>;
  total?: number;
  limit?: number;
  offset?: number;
  has_more?: boolean;
  files: Array<{ path: string; size: number }>;
}

export interface BinarySecurityProjectConfig {
  project_id: string;
  config: {
    max_stage_parallelism: number;
    max_retries_per_item: number;
    continue_on_item_failure: boolean;
    pipeline_mode: BinarySecurityPipelineMode;
    partial_success_stage_advancement: Record<string, boolean>;
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
  accepted?: boolean;
  action?: 'continue' | 'retry' | string;
  cancelled_downstream_count?: number;
  deleted_downstream_count?: number;
  deleted_event_count?: number;
  cleanup_status?: string | null;
}

export const binarySecurityApi = {
  getHealth: async (): Promise<BinarySecurityHealth> =>
    getJsonWithDedupe(`${API_BASE}/api/app/binary-security/health`, { headers: getHeaders() }),

  listTasks: async (
    projectId: string,
    query?: {
      status?: string;
      taskType?: BinarySecurityTaskType;
      search?: string;
      sortBy?: 'created_at' | 'updated_at' | 'started_at' | 'finished_at' | 'status' | 'name' | 'task_name';
      sortOrder?: 'asc' | 'desc';
      page?: number;
      pageSize?: number;
    },
  ): Promise<{
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
    running_count: number;
    queued_count: number;
    max_concurrent_tasks: number;
    project_stats?: BinarySecurityProjectStats;
    project_stage_aggregates?: BinarySecurityProjectStageAggregate[];
    items: BinarySecurityTask[];
  }> => {
    const params = new URLSearchParams();
    if (query?.status) params.set('status', query.status);
    if (query?.taskType) params.set('task_type', query.taskType);
    if (query?.search) params.set('search', query.search);
    if (query?.sortBy) params.set('sort_by', query.sortBy);
    if (query?.sortOrder) params.set('sort_order', query.sortOrder);
    if (query?.page) params.set('page', String(query.page));
    if (query?.pageSize) params.set('page_size', String(query.pageSize));
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

  getTaskStageItems: async (
    projectId: string,
    taskId: string,
    params: {
      stage_name: string;
      page?: number;
      per_page?: number;
      status?: string;
      downstream_status?: string;
      sync_status?: string;
      sort_by?: string;
      sort_direction?: 'asc' | 'desc';
    },
  ): Promise<BinarySecurityStageItemPage> => {
    const query = new URLSearchParams({
      stage_name: params.stage_name,
      page: String(params.page ?? 1),
      per_page: String(params.per_page ?? 100),
    });
    if (params.status) query.set('status', params.status);
    if (params.downstream_status) query.set('downstream_status', params.downstream_status);
    if (params.sync_status) query.set('sync_status', params.sync_status);
    if (params.sort_by) query.set('sort_by', params.sort_by);
    if (params.sort_direction) query.set('sort_direction', params.sort_direction);
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/stage-items?${query.toString()}`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    return handleResponse(resp);
  },

  getTaskOverview: async (projectId: string, taskId: string): Promise<BinarySecurityOverviewResponse> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/overview`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    return handleResponse(resp);
  },

  getTaskArchiveJobs: async (
    projectId: string,
    taskId: string,
    params?: { stage_name?: string; page?: number; per_page?: number },
  ): Promise<BinarySecurityArchiveJobPage> => {
    const query = new URLSearchParams();
    if (params?.stage_name) query.set('stage_name', params.stage_name);
    if (params?.page) query.set('page', String(params.page));
    if (params?.per_page) query.set('per_page', String(params.per_page));
    const suffix = query.size > 0 ? `?${query.toString()}` : '';
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/archive-jobs${suffix}`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    return handleResponse(resp);
  },

  getOrchestrationObservability: async (projectId: string, taskId: string): Promise<BinarySecurityOrchestrationObservability> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/orchestration-observability`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    return handleResponse(resp);
  },

  getReducerEvents: async (params?: {
    page?: number;
    page_size?: number;
    sort_by?: 'processed_at' | 'duration_ms' | 'created_at';
    sort_order?: 'asc' | 'desc';
    status?: string[];
    event_type?: string;
    handler_pod?: string;
    task_id?: string;
    failed_only?: boolean;
    slow_only?: boolean;
  }): Promise<BinarySecurityReducerEventRecordPage> => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.page_size) query.set('page_size', String(params.page_size));
    if (params?.sort_by) query.set('sort_by', params.sort_by);
    if (params?.sort_order) query.set('sort_order', params.sort_order);
    for (const value of params?.status || []) {
      if (value) query.append('status', value);
    }
    if (params?.event_type) query.set('event_type', params.event_type);
    if (params?.handler_pod) query.set('handler_pod', params.handler_pod);
    if (params?.task_id) query.set('task_id', params.task_id);
    if (params?.failed_only) query.set('failed_only', 'true');
    if (params?.slow_only) query.set('slow_only', 'true');
    const q = query.size > 0 ? `?${query.toString()}` : '';
    const resp = await fetch(`${API_BASE}/api/app/binary-security/reducer/events${q}`, {
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

  updateTaskPolicy: async (
    projectId: string,
    taskId: string,
    payload: {
      stage_options?: Record<string, BinarySecurityStageOption>;
      max_retries_per_item?: number;
      continue_on_item_failure?: boolean;
      partial_success_stage_advancement?: Record<string, boolean>;
      stage_parallelism?: Record<string, number>;
      module_selection_mode?: BinarySecurityModuleSelectionMode;
      entry_selection_mode?: BinarySecurityEntrySelectionMode;
      module_risk_levels?: string[];
    },
  ): Promise<BinarySecurityTaskDetail> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/policy`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(resp);
  },

  getTimeline: async (projectId: string, taskId: string, page = 1, pageSize = 200): Promise<BinarySecurityTimeline> => {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/timeline?${params.toString()}`, {
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
      module_name?: string;
      input_files: BinarySecurityInputFile[];
      output_root?: string;
      stage_options?: Record<string, { enabled: boolean }>;
      policy_overrides?: {
        max_stage_parallelism?: number;
        max_retries_per_item?: number;
        continue_on_item_failure?: boolean;
        pipeline_mode?: BinarySecurityPipelineMode;
        partial_success_stage_advancement?: Record<string, boolean>;
        stage_parallelism?: Record<string, number>;
        module_selection_mode?: 'auto' | 'manual_confirm';
        entry_selection_mode?: 'auto' | 'manual_confirm';
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

  deleteTask: async (projectId: string, taskId: string, options?: { force?: boolean }): Promise<BinarySecurityActionResult> => {
    const params = new URLSearchParams();
    if (options?.force) params.set('force', 'true');
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}${suffix}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  retryTask: async (projectId: string, taskId: string): Promise<BinarySecurityActionResult> => {
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

  retryArchiveStage: async (projectId: string, taskId: string, stageName: string): Promise<BinarySecurityActionResult> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/stages/${stageName}/archive/retry`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  retryArchiveJob: async (projectId: string, taskId: string, archiveJobId: string): Promise<BinarySecurityActionResult> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/archive-jobs/${archiveJobId}/retry`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  retryFailedItems: async (projectId: string, taskId: string): Promise<BinarySecurityActionResult> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/retry-failed-items`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  retryStageFailedItems: async (projectId: string, taskId: string, stageName: string): Promise<BinarySecurityActionResult> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/stages/${stageName}/retry-failed-items`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  retryStageFull: async (projectId: string, taskId: string, stageName: string): Promise<BinarySecurityActionResult> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/stages/${stageName}/retry-full`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  retryArchiveStageFailedItems: async (projectId: string, taskId: string, stageName: string): Promise<BinarySecurityActionResult> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/stages/${stageName}/archive/retry-failed-items`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  retryArchiveStageFull: async (projectId: string, taskId: string, stageName: string): Promise<BinarySecurityActionResult> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/stages/${stageName}/archive/retry-full`, {
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

  getModuleReport: async (projectId: string, taskId: string, moduleKey: string): Promise<BinarySecurityModuleReportDetail> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/module-report?module_key=${encodeURIComponent(moduleKey)}`, {
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

  getEntrySelection: async (projectId: string, taskId: string): Promise<BinarySecurityEntrySelection> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/entry-selection`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    return handleResponse(resp);
  },

  confirmEntrySelection: async (projectId: string, taskId: string, selectedEntryKeys: string[]): Promise<BinarySecurityTaskDetail> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-security/projects/${projectId}/tasks/${taskId}/entry-selection/confirm`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ selected_entry_keys: selectedEntryKeys }),
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
