import { API_BASE, getHeaders, getJsonWithDedupe, handleResponse } from './base';
import type { ServiceHealthMeta } from '../components/execution/serviceHealthMeta';

export interface VulnCaseDisplaySummary {
  title?: string;
  subtitle?: string;
  severity?: string;
  confidence?: number;
  current_stage?: string;
  decision_status?: string;
  validation_result?: string | null;
  finished_reason?: string | null;
  reporter?: Record<string, any>;
  subject?: Record<string, any>;
  source_task?: Record<string, any> | null;
  source_report_ids?: string[];
  reported_at?: string | null;
  key_points?: string[];
  current_report_id?: string | null;
  current_report_title?: string | null;
  current_report_updated_at?: string | null;
}

export interface VulnCaseReportSummary {
  report_id: string;
  title: string;
  report_kind: string;
  render_format: string;
  stage: string;
  storage_path?: string | null;
  fileserver_path?: string | null;
  download_url?: string | null;
  excerpt?: string | null;
  generated_by?: string | null;
  generated_at?: string | null;
  source_service_id?: string | null;
  result_id?: string | null;
}

export interface VulnCaseEvidenceSummary {
  summary?: string | null;
  reproduction_hint?: string | null;
  references?: any[];
  artifacts?: any[];
  proof_items?: Array<Record<string, any>>;
}

export interface VulnCaseWorkspaceSummary {
  timeline_count?: number;
  action_count?: number;
  manual_task_count?: number;
  result_count?: number;
  related_execution_refs?: Array<{ key: string; value: string }>;
  files_root_path?: string | null;
}

export interface VulnCaseReportDocument extends VulnCaseReportSummary {
  content?: string;
}

export interface VulnCaseReportListResponse {
  items: VulnCaseReportSummary[];
  total: number;
  current_report_id?: string | null;
}

export interface DownloadCenterJob {
  job_id: string;
  project_id: string;
  source_type: string;
  scope_type: 'single' | 'batch' | string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'expired' | string;
  report_ids: string[];
  report_count: number;
  output_format: string;
  output_filename?: string | null;
  output_size_bytes: number;
  created_by?: string | null;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  expires_at?: string | null;
  last_error?: string | null;
  downloadable: boolean;
}

export interface DownloadCenterJobListResponse {
  items: DownloadCenterJob[];
  total: number;
}

export interface DownloadCenterStatsResponse {
  total: number;
  pending: number;
  processing: number;
  succeeded: number;
  failed: number;
  expired: number;
  downloadable: number;
}

export interface VulnThreatModelTemplate {
  id: string;
  scope: string;
  name: string;
  description?: string;
}

export interface VulnAutoVerifyContext {
  case_id: string;
  project_id: string;
  case_title: string;
  source_root?: string | null;
  binary_root?: string | null;
  report_id?: string | null;
  report_preview?: string;
  path_status: Record<string, { ok: boolean; source?: string | null; message?: string | null }>;
  default_task_name: string;
  default_model: string;
  default_concurrency: number;
}

export interface VulnAutoVerifyTaskCreatePayload {
  name: string;
  threat_model_markdown?: string | null;
  template_id?: string | null;
  model: string;
  concurrency: number;
  advance_to_validation: boolean;
}

export interface VulnAutoVerifyTaskCreateResponse {
  case_id: string;
  project_id: string;
  vuln_verify_task_id?: string;
  report_data_url?: string | null;
  materialized_root?: string;
  reports_dir?: string;
  threat_path?: string;
  task?: any;
}

export interface VulnAutoVerifyTaskSyncPayload {
  vuln_verify_task_id?: string;
}

export interface VulnAutoVerifyTaskSyncResponse {
  case_id: string;
  project_id: string;
  vuln_verify_task_id: string;
  task_status: string;
  case_stage: string;
  case_status: string;
  validation_result: 'vulnerable' | 'not_vulnerable' | 'inconclusive' | string;
  report_data_url?: string | null;
  verdicts: Record<string, number>;
  total_reports?: number;
  task?: any;
  report_data?: any;
  report_error?: string | null;
}

export interface VulnAutoVerifyTaskBatchSyncPayload {
  project_id: string;
  case_ids: string[];
  only_with_auto_verify_task?: boolean;
  max_concurrency?: number | null;
}

export interface VulnAutoVerifyTaskBatchSyncResponse {
  project_id: string;
  total: number;
  processed: number;
  synced: number;
  skipped: number;
  failed: number;
  summary: Record<string, any>;
  items: Array<{
    case_id: string;
    status: 'synced' | 'skipped' | 'failed' | string;
    message: string;
    reason?: string | null;
    vuln_verify_task_id?: string | null;
    task_status?: string | null;
    case_status?: string | null;
    validation_result?: string | null;
    total_reports?: number | null;
    verdicts?: Record<string, number> | null;
  }>;
}

const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const asString = (value: unknown, fallback = ''): string => (
  typeof value === 'string' ? value : value == null ? fallback : String(value)
);

const asNullableString = (value: unknown): string | null => {
  const normalized = asString(value).trim();
  return normalized ? normalized : null;
};

type VulnHealthResponse = {
  status: string;
  service: string;
} & ServiceHealthMeta;

const normalizeHealth = (value: unknown): VulnHealthResponse => {
  const record = asRecord(value);
  return {
    status: asString(record.status, typeof value === 'string' ? value : 'unknown'),
    service: asString(record.service),
    service_id: asNullableString(record.service_id),
    service_name: asNullableString(record.service_name),
    build_version: asNullableString(record.build_version),
    service_version: asNullableString(record.service_version),
    image_tag: asNullableString(record.image_tag),
    git_tag: asNullableString(record.git_tag),
    git_commit: asNullableString(record.git_commit),
    built_at: asNullableString(record.built_at),
    version: asNullableString(record.version),
  };
};

const publicJson = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(errorData.detail || errorData.error || errorData.message || `API Error (${response.status})`);
  }
  return response.json();
};

export interface VulnCaseListParams {
  project_id?: string;
  current_stage?: string;
  severity?: string;
  reporter_type?: string;
  cvss_band?: string;
  search?: string;
  sort_field?: string;
  sort_direction?: 'asc' | 'desc';
  page?: number;
  page_size?: number;
  limit?: number;
  offset?: number;
  source_service_name?: string;
  source_task_id?: string;
  source_execution_id?: string;
  pool_type?: string;
  evolution_task_id?: string;
  evolution_round?: number;
  global_vuln_id?: string;
  final_result?: 'vulnerable' | 'not_vulnerable' | 'inconclusive' | 'analyzing';
}

export interface VulnCaseListResponse {
  items: any[];
  total: number;
  page: number;
  page_size: number;
}

const buildQueryString = (params: Record<string, any>): string => {
  const query = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(params)) {
    if (rawValue === undefined || rawValue === null) continue;
    const value = String(rawValue).trim();
    if (!value || value === 'undefined' || value === 'null') continue;
    query.set(key, value);
  }
  return query.toString();
};

export const vulnApi = {
  getHealth: async (): Promise<VulnHealthResponse> =>
    normalizeHealth(await handleResponse(await fetch(`${API_BASE}/api/vuln/health`, { headers: getHeaders() }))),

  getOverview: async (projectId?: string): Promise<any> => {
    const query = new URLSearchParams(projectId ? { project_id: projectId } : {}).toString();
    return handleResponse(await fetch(`${API_BASE}/api/vuln/cases/ops/dashboard/overview?${query}`, { headers: getHeaders() }));
  },

  getProjectConfig: async (projectId: string): Promise<any> =>
    getJsonWithDedupe(`${API_BASE}/api/vuln/config?project_id=${encodeURIComponent(projectId)}`, { headers: getHeaders() }),

  updateProjectConfig: async (projectId: string, config: Record<string, any>): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/config`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ project_id: projectId, config }),
    })),

  listServices: async (): Promise<{ items: any[]; total: number }> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/services`, { headers: getHeaders() })),

  heartbeatService: async (serviceId: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/services/heartbeat/${serviceId}`, {
      method: 'POST',
      headers: getHeaders()
    })),

  unregisterService: async (serviceId: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/services/unregister/${serviceId}`, {
      method: 'DELETE',
      headers: getHeaders()
    })),

  registerService: async (payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/services/register`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    })),

  listConfirmEngines: async (): Promise<{ engines: any[] }> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/admin/vuln-confirm/engines`, { headers: getHeaders() })),

  createConfirmEngine: async (payload: { engine_name: string; endpoint: string; version: string; bind_tools: string[] }) =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/admin/vuln-confirm/engines`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  updateConfirmEngine: async (engineName: string, payload: { endpoint: string; version: string; bind_tools: string[] }) =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/admin/vuln-confirm/engines/${encodeURIComponent(engineName)}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  deleteConfirmEngine: async (engineName: string): Promise<void> => {
    const resp = await fetch(`${API_BASE}/api/vuln/admin/vuln-confirm/engines/${encodeURIComponent(engineName)}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (resp.status !== 204) await handleResponse(resp);
  },

  createCase: async (payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/cases`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    })),

  createDraftCase: async (payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/cases/draft`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    })),

  listCases: async (params: VulnCaseListParams = {}): Promise<VulnCaseListResponse> => {
    const query = buildQueryString(params as any);
    return handleResponse(await fetch(`${API_BASE}/api/vuln/cases?${query}`, { headers: getHeaders() }));
  },

  getCaseDetail: async (caseId: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/cases/${caseId}`, { headers: getHeaders() })),

  getCaseReport: async (caseId: string, reportId?: string): Promise<VulnCaseReportDocument> => {
    const query = reportId ? `?report_id=${encodeURIComponent(reportId)}` : '';
    return handleResponse(await fetch(`${API_BASE}/api/vuln/cases/${caseId}/report${query}`, { headers: getHeaders() }));
  },

  listCaseReports: async (caseId: string): Promise<VulnCaseReportListResponse> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/cases/${caseId}/reports`, { headers: getHeaders() })),

  getAutoVerifyContext: async (caseId: string): Promise<VulnAutoVerifyContext> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/cases/${encodeURIComponent(caseId)}/auto-verify/context`, { headers: getHeaders() })),

  createAutoVerifyTask: async (caseId: string, payload: VulnAutoVerifyTaskCreatePayload): Promise<VulnAutoVerifyTaskCreateResponse> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/cases/${encodeURIComponent(caseId)}/auto-verify/tasks`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  syncAutoVerifyTask: async (caseId: string, payload: VulnAutoVerifyTaskSyncPayload = {}): Promise<VulnAutoVerifyTaskSyncResponse> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/cases/${encodeURIComponent(caseId)}/auto-verify/sync`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  syncAutoVerifyTasksBatch: async (payload: VulnAutoVerifyTaskBatchSyncPayload): Promise<VulnAutoVerifyTaskBatchSyncResponse> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/cases/auto-verify/sync-batch`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  listThreatModelTemplates: async (projectId?: string): Promise<{ items: VulnThreatModelTemplate[]; total: number }> => {
    const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : '';
    return handleResponse(await fetch(`${API_BASE}/api/vuln/threat-model-templates${query}`, { headers: getHeaders() }));
  },

  renderThreatModelTemplate: async (templateId: string, payload: { case_id: string; variables?: Record<string, any> }): Promise<{ template_id: string; name: string; content: string; variables: Record<string, string> }> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/threat-model-templates/${encodeURIComponent(templateId)}/render`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  listDownloadJobs: async (projectId: string): Promise<DownloadCenterJobListResponse> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/cases/download-center/jobs?project_id=${encodeURIComponent(projectId)}`, { headers: getHeaders() })),

  getDownloadJobStats: async (projectId: string): Promise<DownloadCenterStatsResponse> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/cases/download-center/stats?project_id=${encodeURIComponent(projectId)}`, { headers: getHeaders() })),

  createDownloadJob: async (payload: { project_id: string; report_ids: string[] }): Promise<DownloadCenterJob> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/cases/download-center/jobs`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  getDownloadJob: async (jobId: string): Promise<DownloadCenterJob> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/cases/download-center/jobs/${encodeURIComponent(jobId)}`, { headers: getHeaders() })),

  retryDownloadJob: async (jobId: string): Promise<DownloadCenterJob> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/cases/download-center/jobs/${encodeURIComponent(jobId)}/retry`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  deleteDownloadJob: async (jobId: string): Promise<DownloadCenterJob> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/cases/download-center/jobs/${encodeURIComponent(jobId)}`, {
      method: 'DELETE',
      headers: getHeaders(),
    })),

  downloadDownloadJobBlob: async (jobId: string): Promise<Blob> => {
    const response = await fetch(`${API_BASE}/api/vuln/cases/download-center/jobs/${encodeURIComponent(jobId)}/download`, {
      headers: getHeaders(),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(errorData.detail || errorData.error || errorData.message || `API Error (${response.status})`);
    }
    return response.blob();
  },

  updateCase: async (caseId: string, payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/cases/${caseId}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    })),

  deleteCase: async (caseId: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/cases/${caseId}`, {
      method: 'DELETE',
      headers: getHeaders()
    })),

  getCaseTimeline: async (caseId: string): Promise<{ items: any[]; total: number }> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/cases/${caseId}/timeline`, { headers: getHeaders() })),

  getRecommendedActions: async (caseId: string): Promise<{ items: any[]; total: number }> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/cases/${caseId}/recommended-actions`, { headers: getHeaders() })),

  listActionQueue: async (params: { project_id?: string; execution_status?: string } = {}): Promise<{ items: any[]; total: number }> => {
    const query = buildQueryString(params as any);
    return handleResponse(await fetch(`${API_BASE}/api/vuln/actions/ops/queue?${query}`, { headers: getHeaders() }));
  },

  reconcileActionTimeouts: async (params: { project_id?: string } = {}): Promise<{ status: string; count: number; items: any[] }> => {
    const query = buildQueryString(params as any);
    return handleResponse(await fetch(`${API_BASE}/api/vuln/actions/ops/queue/reconcile-timeouts?${query}`, {
      method: 'POST',
      headers: getHeaders()
    }));
  },

  listManualTasks: async (params: { project_id?: string; status?: string } = {}): Promise<{ items: any[]; total: number }> => {
    const query = buildQueryString(params as any);
    return handleResponse(await fetch(`${API_BASE}/api/vuln/cases/ops/manual-tasks?${query}`, { headers: getHeaders() }));
  },

  createManualTask: async (caseId: string, payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/cases/${caseId}/manual-tasks`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    })),

  updateManualTaskStatus: async (caseId: string, taskId: string, payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/cases/${caseId}/manual-tasks/${taskId}/status`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    })),

  transitionStage: async (caseId: string, payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/cases/${caseId}/stage-transition`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    })),

  updateReceiveStatus: async (caseId: string, payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/cases/${caseId}/receive/status`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    })),

  finishCase: async (caseId: string, payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/cases/${caseId}/finish`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    })),

  submitDecision: async (caseId: string, payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/cases/${caseId}/decisions`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    })),

  submitTriageDecision: async (caseId: string, payload: { triage_decision: 'issue' | 'vulnerable' | 'non_issue'; summary?: string }): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/cases/${caseId}/triage/decision`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  submitValidationResult: async (caseId: string, payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/cases/${caseId}/validation/result`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    })),

  dispatchActions: async (caseId: string, payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/cases/${caseId}/actions/dispatch`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    })),

  autoOrchestrate: async (caseId: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/cases/${caseId}/orchestrate/auto`, {
      method: 'POST',
      headers: getHeaders()
    })),

  submitActionCallback: async (actionId: string, payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/actions/${actionId}/callback`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    })),

  controlAction: async (actionId: string, payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/actions/${actionId}/control`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    })),

  triggerMockAction: async (caseId: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/actions/mock-dispatch/${caseId}`, {
      method: 'POST',
      headers: getHeaders()
    })),

  getPublicIntakeCatalog: async (): Promise<any> =>
    publicJson(`${API_BASE}/api/vuln/public/intake/catalog`),

  getPublicIntakeExample: async (kind: 'cli' | 'plugin' | 'skill' | 'openapi'): Promise<any> =>
    publicJson(`${API_BASE}/api/vuln/public/intake/examples/${kind}`),

  getPublicIntakeSpec: async (): Promise<any> =>
    publicJson(`${API_BASE}/api/vuln/public/intake/spec/openapi`),

  downloadPublicCliSdkUrl: () => `${API_BASE}/api/vuln/public/intake/sdk/cli`,

  downloadPublicPluginSdkUrl: () => `${API_BASE}/api/vuln/public/intake/sdk/plugin`,

  downloadPublicSkillSdkUrl: () => `${API_BASE}/api/vuln/public/intake/sdk/skill`,

  getPublicOpenApiSpecUrl: () => `${API_BASE}/api/vuln/public/intake/spec/openapi`,

  submitAuthenticatedIntake: async (payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/public/intake/submissions`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),
};
