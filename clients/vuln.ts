import { API_BASE, getHeaders, getJsonWithDedupe, handleResponse } from './base';

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

const publicJson = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(errorData.detail || errorData.error || errorData.message || `API Error (${response.status})`);
  }
  return response.json();
};

export const vulnApi = {
  getHealth: async (): Promise<{ status: string; service: string }> =>
    handleResponse(await fetch(`${API_BASE}/api/vuln/health`, { headers: getHeaders() })),

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

  listCases: async (params: { project_id?: string; current_stage?: string; source_service_name?: string; source_task_id?: string; source_execution_id?: string; pool_type?: string; evolution_task_id?: string; evolution_round?: number } = {}): Promise<{ items: any[]; total: number }> => {
    const query = new URLSearchParams(params as any).toString();
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
    const query = new URLSearchParams(params as any).toString();
    return handleResponse(await fetch(`${API_BASE}/api/vuln/actions/ops/queue?${query}`, { headers: getHeaders() }));
  },

  reconcileActionTimeouts: async (params: { project_id?: string } = {}): Promise<{ status: string; count: number; items: any[] }> => {
    const query = new URLSearchParams(params as any).toString();
    return handleResponse(await fetch(`${API_BASE}/api/vuln/actions/ops/queue/reconcile-timeouts?${query}`, {
      method: 'POST',
      headers: getHeaders()
    }));
  },

  listManualTasks: async (params: { project_id?: string; status?: string } = {}): Promise<{ items: any[]; total: number }> => {
    const query = new URLSearchParams(params as any).toString();
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
