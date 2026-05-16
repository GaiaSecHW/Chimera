import { API_BASE, getHeaders, handleResponse } from './base';

export interface B2SElfTaskInput {
  elf_path: string;
  file_list: string[];
  output_subdir?: string;
  metadata?: Record<string, any>;
}

export type B2SRunMode = 'fast' | 'deep';
export type B2SBudgetExhaustedAction = 'treat_as_passed' | 'treat_as_failed';

export interface B2SServiceConfig {
  project_id: string;
  budget_exhausted_action: B2SBudgetExhaustedAction;
  llm_provider_key?: string | null;
  effective_llm_provider?: B2SLlmProviderSummary | null;
  updated_at?: string | null;
}

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
  input_filenames?: string[];
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
  total_functions?: number | null;
  completed_functions?: number | null;
  failed_functions?: number | null;
  uncompleted_functions?: number | null;
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
  stage?: string | null;
  stage_order?: number | null;
  section?: string | null;
  section_order?: number | null;
  round?: string | null;
  round_order?: number | null;
  agent?: string | null;
  role?: string | null;
  batch_no?: number | null;
  attempt_no?: number | null;
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

export interface B2SArtifact extends Omit<B2SAdvancedFile, 'content' | 'truncated'> {
  id: string;
  relative_path: string;
  content_url: string;
}

export interface B2SArtifactsResponse {
  task_id: string;
  item_id: string;
  output_dir: string;
  work_dir?: string | null;
  artifacts: B2SArtifact[];
  counts: Record<string, number>;
}

export interface B2SArtifactContent {
  artifact_id: string;
  name: string;
  path: string;
  kind: string;
  mime_type: string;
  encoding: string;
  size: number;
  offset: number;
  limit: number;
  content: string;
  truncated: boolean;
  next_offset?: number | null;
}

export interface B2SReviewAnalyticsAttempt {
  attempt_no: number;
  label?: string | null;
  verdict: string;
  verdict_label?: string | null;
  total_functions: number;
  verified_functions: number;
  blocking_issues: number;
  warnings: number;
  semantic_score: number;
  confidence: number;
  quality_score?: number;
  issues_discovered?: number;
  issues_resolved?: number;
  issues_open_after_attempt?: number;
  status_label?: string | null;
}

export interface B2SReviewAnalyticsIssue {
  id: string;
  label: string;
  display_label?: string | null;
  description?: string | null;
  function: string;
  category: string;
  category_label?: string | null;
  severity: string;
  severity_label?: string | null;
  introduced_attempt: number;
  resolved_attempt?: number | null;
  status: string;
  status_label?: string | null;
}

export interface B2SReviewAnalyticsFunction {
  function: string;
  attempts: Array<{ attempt_no: number; risk: string; score: number }>;
}

export interface B2SReviewAnalyticsRadar {
  attempt_no: number;
  completeness: number;
  control_flow: number;
  return_semantics: number;
  input_validation: number;
  call_fidelity: number;
  type_struct_fidelity: number;
}

export interface B2SReviewAnalyticsTrendPoint {
  attempt_no: number;
  label: string;
  score: number;
}

export interface B2SReviewAnalyticsTrendSeries {
  key: string;
  label: string;
  color_hint?: string | null;
  points: B2SReviewAnalyticsTrendPoint[];
}

export interface B2SReviewAnalyticsTrend {
  title: string;
  conclusion: string;
  tone: 'positive' | 'neutral' | 'warning' | string;
  primary_metric: string;
  first_score: number;
  final_score: number;
  delta: number;
  series: B2SReviewAnalyticsTrendSeries[];
}

export interface B2SReviewAnalyticsDimension {
  key: string;
  label: string;
  score: number;
  initial_score: number;
  delta: number;
  delta_percent: number;
  level: string;
  level_label: string;
  description: string;
  formula?: string | null;
  color_hint?: string | null;
  points: B2SReviewAnalyticsTrendPoint[];
  components: Record<string, number>;
}

export interface B2SReviewAnalytics {
  task_id: string;
  item_id: string;
  status?: string;
  meta?: {
    schema_version: string;
    scoring_version: string;
    source: string;
    data_quality: string;
    generated_at?: string | null;
  };
  summary: {
    attempts: number;
    attempt_count?: number;
    final_verdict: string;
    final_verdict_label?: string | null;
    final_confidence: number;
    final_quality_score?: number;
    final_quality_label?: string | null;
    initial_quality_score?: number;
    quality_delta?: number;
    quality_delta_percent?: number;
    issue_total?: number;
    issue_resolved?: number;
    issue_remaining?: number;
    issue_closure_rate: number;
    residual_risk: string;
    residual_risk_label?: string | null;
  };
  attempts: B2SReviewAnalyticsAttempt[];
  issues: B2SReviewAnalyticsIssue[];
  dimensions: B2SReviewAnalyticsDimension[];
  trend?: B2SReviewAnalyticsTrend | null;
  function_matrix: B2SReviewAnalyticsFunction[];
  radar: B2SReviewAnalyticsRadar[];
  trend_insight?: B2SReviewAnalyticsTrend | null;
}

export interface B2STaskConfigInputItem {
  item_id: string;
  sequence_no: number;
  elf_path: string;
  source_elf_path?: string | null;
  output_dir: string;
  output_subdir?: string | null;
  file_list: string[];
}

export interface B2STaskConfigSnapshot {
  name: string;
  description?: string | null;
  priority: number;
  tags: string[];
  task_origin_type?: string | null;
  origin_label?: string | null;
  parent_project_id?: string | null;
  parent_task_id?: string | null;
  parent_task_type?: string | null;
  parent_stage_name?: string | null;
  parent_stage_item_id?: string | null;
  parent_stage_item_key?: string | null;
  mode?: string | null;
  mode_label?: string | null;
  engine?: string | null;
  llm_provider_key?: string | null;
  llm_provider_display_name?: string | null;
  llm_provider_type?: string | null;
  llm_provider_model?: string | null;
  concurrency?: number | null;
  agent_run_timeout_seconds?: number | null;
  agent_timeout_retry_enabled?: boolean | null;
  agent_timeout_max_retries?: number | null;
  budget_exhausted_action?: string | null;
  input_count: number;
  input_items: B2STaskConfigInputItem[];
}

export interface B2SAgentRuntimeEntry {
  key: string;
  label: string;
  item_id?: string | null;
  sequence_no?: number | null;
  item_name?: string | null;
  run_name?: string | null;
  stage?: string | null;
  agent?: string | null;
  role?: string | null;
  batch_no?: number | null;
  attempt_no?: number | null;
  relative_path?: string | null;
  full_path?: string | null;
  updated_at?: string | null;
  is_active: boolean;
  size: number;
}

export interface B2SAgentRuntimeSummary {
  total_sessions: number;
  active_agent_count: number;
  header_agent_count: number;
  executor_agent_count: number;
  validator_agent_count: number;
  active_agents: B2SAgentRuntimeEntry[];
}

export interface B2STaskResultItemSummary {
  item_id: string;
  sequence_no: number;
  item_name: string;
  elf_path: string;
  output_dir: string;
  status: string;
  result_file_count: number;
  key_result_files: string[];
  session_file_count: number;
  review_round_count: number;
  final_verdict?: string | null;
  final_verdict_label?: string | null;
}

export interface B2STaskResultSummary {
  task_id: string;
  success_items: number;
  partial_items: number;
  failed_items: number;
  cancelled_items: number;
  result_file_count: number;
  session_file_count: number;
  review_round_count: number;
  items: B2STaskResultItemSummary[];
}

export interface B2STaskObservabilityItem {
  item_id: string;
  sequence_no: number;
  item_name: string;
  status: string;
  duration_ms?: number | null;
  batch_count: number;
  session_count: number;
  attempt_count: number;
  final_verdict?: string | null;
  final_confidence: number;
  final_quality_score: number;
  issue_total: number;
  issue_resolved: number;
  issue_remaining: number;
}

export interface B2STaskObservability {
  task_id: string;
  total_duration_ms?: number | null;
  avg_item_duration_ms?: number | null;
  total_batches: number;
  avg_batches_per_item: number;
  total_sessions: number;
  active_agent_count: number;
  total_review_attempts: number;
  avg_review_attempts: number;
  passed_items: number;
  not_passed_items: number;
  issue_total: number;
  issue_resolved: number;
  issue_remaining: number;
  issue_closure_rate: number;
  completed_functions: number;
  total_functions: number;
  completed_bytes: number;
  total_bytes: number;
  avg_confidence: number;
  avg_quality_score: number;
  residual_risk_distribution: Record<string, number>;
  items: B2STaskObservabilityItem[];
}

export interface B2SSessionNode {
  node_id: string;
  item_id: string;
  sequence_no: number;
  item_name: string;
  run_name: string;
  stage: string;
  stage_order: number;
  section?: string | null;
  round?: string | null;
  round_order?: number | null;
  agent?: string | null;
  role?: string | null;
  batch_no?: number | null;
  attempt_no?: number | null;
  relative_path: string;
  full_path: string;
  size: number;
  updated_at?: string | null;
  is_active: boolean;
  kind: string;
}

export interface B2SSessionIndex {
  task_id: string;
  nodes: B2SSessionNode[];
  warnings: string[];
  generated_at?: string | null;
}

export interface B2SSessionFile {
  task_id: string;
  relative_path: string;
  full_path: string;
  size: number;
  content: string;
  truncated: boolean;
  next_offset?: number | null;
  offset: number;
  limit: number;
  mime_type: string;
}

export interface B2SRelationshipNode {
  node_id: string;
  node_type: string;
  item_id?: string | null;
  sequence_no?: number | null;
  title: string;
  subtitle?: string | null;
  status?: string | null;
  relative_path?: string | null;
  full_path?: string | null;
  batch_no?: number | null;
  attempt_no?: number | null;
  group_key?: string | null;
  is_active: boolean;
}

export interface B2SRelationshipEdge {
  edge_id: string;
  source_node_id: string;
  target_node_id: string;
  kind: string;
  label?: string | null;
}

export interface B2STaskRelationship {
  task_id: string;
  nodes: B2SRelationshipNode[];
  edges: B2SRelationshipEdge[];
  warnings: string[];
}

export interface B2STaskDetail extends B2STask {
  overall_progress?: B2SOverallProgress;
  task_config_snapshot?: B2STaskConfigSnapshot;
  effective_llm_provider?: B2SLlmProviderSummary | null;
  agent_runtime_summary?: B2SAgentRuntimeSummary | null;
  result_summary?: B2STaskResultSummary | null;
  observability_summary?: B2STaskObservability | null;
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
  getConfig: async (projectId: string): Promise<B2SServiceConfig> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-to-source/projects/${projectId}/config`, {
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  saveConfig: async (projectId: string, config: B2SServiceConfig): Promise<B2SServiceConfig> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-to-source/projects/${projectId}/config`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ config }),
    });
    return handleResponse(resp);
  },

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

  getTaskItemArtifacts: async (projectId: string, taskId: string, itemId: string): Promise<B2SArtifactsResponse> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-to-source/projects/${projectId}/tasks/${taskId}/items/${itemId}/artifacts`, {
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  getTaskItemArtifactContent: async (projectId: string, taskId: string, itemId: string, artifactId: string, offset = 0, limit = 512 * 1024): Promise<B2SArtifactContent> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-to-source/projects/${projectId}/tasks/${taskId}/items/${itemId}/artifacts/${artifactId}/content?offset=${offset}&limit=${limit}`, {
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  getTaskItemReviewAnalytics: async (projectId: string, taskId: string, itemId: string): Promise<B2SReviewAnalytics> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-to-source/projects/${projectId}/tasks/${taskId}/items/${itemId}/review-analytics`, {
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  getTaskSessions: async (projectId: string, taskId: string): Promise<B2SSessionIndex> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-to-source/projects/${projectId}/tasks/${taskId}/sessions`, {
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  getTaskSessionFile: async (projectId: string, taskId: string, path: string, offset = 0, limit = 512 * 1024): Promise<B2SSessionFile> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-to-source/projects/${projectId}/tasks/${taskId}/sessions/file?path=${encodeURIComponent(path)}&offset=${offset}&limit=${limit}`, {
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  getTaskRelationship: async (projectId: string, taskId: string): Promise<B2STaskRelationship> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-to-source/projects/${projectId}/tasks/${taskId}/relationships`, {
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  getTaskResult: async (projectId: string, taskId: string): Promise<B2STaskResultSummary> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-to-source/projects/${projectId}/tasks/${taskId}/result`, {
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  getTaskObservability: async (projectId: string, taskId: string): Promise<B2STaskObservability> => {
    const resp = await fetch(`${API_BASE}/api/app/binary-to-source/projects/${projectId}/tasks/${taskId}/observability`, {
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  rerunTask: async (projectId: string, taskId: string) => {
    const resp = await fetch(`${API_BASE}/api/app/binary-to-source/projects/${projectId}/tasks/${taskId}/rerun`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },
};
