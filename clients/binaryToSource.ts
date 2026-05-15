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
    mock: boolean;
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
    mock: boolean;
  };
  attempts: B2SReviewAnalyticsAttempt[];
  issues: B2SReviewAnalyticsIssue[];
  dimensions: B2SReviewAnalyticsDimension[];
  trend?: B2SReviewAnalyticsTrend | null;
  function_matrix: B2SReviewAnalyticsFunction[];
  radar: B2SReviewAnalyticsRadar[];
  trend_insight?: B2SReviewAnalyticsTrend | null;
}

export const MOCK_B2S_REVIEW_ANALYTICS: B2SReviewAnalytics = {
  task_id: 'mock-task',
  item_id: 'mock-item',
  summary: { attempts: 3, final_verdict: 'PASS', final_confidence: 92, issue_closure_rate: 1, residual_risk: 'low', mock: true },
  attempts: [
    { attempt_no: 1, verdict: 'FAIL', total_functions: 10, verified_functions: 7, blocking_issues: 4, warnings: 0, semantic_score: 61, confidence: 58 },
    { attempt_no: 2, verdict: 'FAIL', total_functions: 10, verified_functions: 9, blocking_issues: 1, warnings: 1, semantic_score: 82, confidence: 76 },
    { attempt_no: 3, verdict: 'PASS', total_functions: 10, verified_functions: 10, blocking_issues: 0, warnings: 1, semantic_score: 96, confidence: 92 },
  ],
  issues: [
    { id: 'I1', label: 'Length Logic', display_label: '长度校验逻辑反转', description: '序列号长度判断方向错误，导致有效输入路径被错误处理。', function: 'sub_880', category: 'Validation', category_label: '输入校验', severity: 'blocking', severity_label: '阻断', introduced_attempt: 1, resolved_attempt: 2, status: 'resolved', status_label: '已解决' },
    { id: 'I2', label: 'Return Code', display_label: 'accepted 返回值错误', description: 'accepted 分支返回值与原始二进制语义不一致。', function: 'sub_880', category: 'Return', category_label: '返回语义', severity: 'blocking', severity_label: '阻断', introduced_attempt: 1, resolved_attempt: 2, status: 'resolved', status_label: '已解决' },
    { id: 'I3', label: 'Extra Check', display_label: '多余校验条件', description: '输出中出现原始逻辑不存在的 hex_len == 0 校验。', function: 'sub_880', category: 'Validation', category_label: '输入校验', severity: 'major', severity_label: '重要', introduced_attempt: 1, resolved_attempt: 2, status: 'resolved', status_label: '已解决' },
    { id: 'I4', label: 'Semantic', display_label: '语义问题', description: '还原代码与原始二进制语义存在偏差。', function: 'sub_E74', category: 'Semantic', category_label: '语义一致性', severity: 'major', severity_label: '重要', introduced_attempt: 2, resolved_attempt: 3, status: 'resolved', status_label: '已解决' },
  ],
  function_matrix: ['.init_proc', 'sub_880', 'start', 'sub_E74', 'sub_E90', 'sub_EC0', 'sub_F00', 'sub_F50', 'sub_F60', '.term_proc'].map((name) => ({
    function: name,
    attempts: [
      { attempt_no: 1, risk: name === 'sub_880' ? 'critical' : 'passed', score: name === 'sub_880' ? 42 : 82 },
      { attempt_no: 2, risk: name === 'sub_E74' ? 'warning' : 'passed', score: name === 'sub_E74' ? 78 : 91 },
      { attempt_no: 3, risk: 'passed', score: 96 },
    ],
  })),
  radar: [
    { attempt_no: 1, completeness: 92, control_flow: 66, return_semantics: 52, input_validation: 44, call_fidelity: 84, type_struct_fidelity: 80 },
    { attempt_no: 2, completeness: 96, control_flow: 88, return_semantics: 84, input_validation: 90, call_fidelity: 91, type_struct_fidelity: 88 },
    { attempt_no: 3, completeness: 100, control_flow: 96, return_semantics: 97, input_validation: 97, call_fidelity: 96, type_struct_fidelity: 95 },
  ],
  dimensions: [
    { key: 'logic_accuracy', label: '代码逻辑准确性', score: 97, initial_score: 64, delta: 33, delta_percent: 52, level: 'excellent', level_label: '优秀', description: '控制流、返回值和关键条件高度匹配原始程序', color_hint: 'logic', points: [{ attempt_no: 1, label: '第1轮', score: 64 }, { attempt_no: 2, label: '第2轮', score: 88 }, { attempt_no: 3, label: '第3轮', score: 97 }], components: {} },
    { key: 'data_structure_accuracy', label: '数据结构准确性', score: 96, initial_score: 83, delta: 13, delta_percent: 16, level: 'excellent', level_label: '优秀', description: '类型、结构体和参数含义还原合理', color_hint: 'structure', points: [{ attempt_no: 1, label: '第1轮', score: 83 }, { attempt_no: 2, label: '第2轮', score: 90 }, { attempt_no: 3, label: '第3轮', score: 96 }], components: {} },
    { key: 'readability', label: '可读性', score: 97, initial_score: 86, delta: 11, delta_percent: 13, level: 'excellent', level_label: '优秀', description: '命名、代码结构和表达便于人工审查', color_hint: 'readability', points: [{ attempt_no: 1, label: '第1轮', score: 86 }, { attempt_no: 2, label: '第2轮', score: 91 }, { attempt_no: 3, label: '第3轮', score: 97 }], components: {} },
  ],
  trend: {
    title: '质量显著提升',
    conclusion: '经过 3 轮评审修复，质量分从 78 提升至 97，累计提升 19 分。',
    tone: 'positive',
    primary_metric: '质量分',
    first_score: 78,
    final_score: 97,
    delta: 19,
    series: [],
  },
  trend_insight: null,
};

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

  getTaskItemReviewAnalytics: async (projectId: string, taskId: string, itemId: string, mock = false): Promise<B2SReviewAnalytics> => {
    if (mock) return { ...MOCK_B2S_REVIEW_ANALYTICS, task_id: taskId, item_id: itemId };
    const resp = await fetch(`${API_BASE}/api/app/binary-to-source/projects/${projectId}/tasks/${taskId}/items/${itemId}/review-analytics?mock=false`, {
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
