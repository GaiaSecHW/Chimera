import { API_BASE, getHeaders, handleResponse } from './base';
import {
  SystemAnalysisCapabilitiesResponse,
  SystemAnalysisPromptTemplate,
  SystemAnalysisReport,
  SystemAnalysisServiceConfig,
  SystemAnalysisTaskDetail,
  SystemAnalysisTaskItem,
  SystemAnalysisTaskNodesResponse,
} from '../types/types';

export const systemAnalysisApi = {
  getHealth: async (): Promise<{ message: string }> =>
    handleResponse(await fetch(`${API_BASE}/api/system-analysis/health`, { headers: getHeaders() })),

  getCapabilities: async (projectId: string): Promise<SystemAnalysisCapabilitiesResponse> =>
    handleResponse(await fetch(`${API_BASE}/api/system-analysis/capabilities/nodes?project_id=${encodeURIComponent(projectId)}`, { headers: getHeaders() })),

  getOverview: async (projectId: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/system-analysis/overview?project_id=${encodeURIComponent(projectId)}`, { headers: getHeaders() })),

  listPrompts: async (params: { page?: number; per_page?: number; category?: string; keyword?: string; is_enabled?: boolean } = {}): Promise<{ items: any[]; total: number; page: number; per_page: number }> => {
    const query = new URLSearchParams();
    if (params.page) query.append('page', String(params.page));
    if (params.per_page) query.append('per_page', String(params.per_page));
    if (params.category) query.append('category', params.category);
    if (params.keyword) query.append('keyword', params.keyword);
    if (typeof params.is_enabled === 'boolean') query.append('is_enabled', String(params.is_enabled));
    return handleResponse(await fetch(`${API_BASE}/api/system-analysis/prompts?${query.toString()}`, { headers: getHeaders() }));
  },

  getPrompt: async (promptId: string): Promise<SystemAnalysisPromptTemplate> =>
    handleResponse(await fetch(`${API_BASE}/api/system-analysis/prompts/${encodeURIComponent(promptId)}`, { headers: getHeaders() })),

  createPrompt: async (payload: {
    name: string;
    category: string;
    description?: string;
    content: string;
    variables_json?: string[];
    is_default?: boolean;
    is_enabled?: boolean;
  }): Promise<SystemAnalysisPromptTemplate> =>
    handleResponse(await fetch(`${API_BASE}/api/system-analysis/prompts`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  updatePrompt: async (promptId: string, payload: Partial<{
    name: string;
    category: string;
    description: string;
    content: string;
    variables_json: string[];
    is_default: boolean;
    is_enabled: boolean;
  }>): Promise<SystemAnalysisPromptTemplate> =>
    handleResponse(await fetch(`${API_BASE}/api/system-analysis/prompts/${encodeURIComponent(promptId)}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  deletePrompt: async (promptId: string): Promise<{ message: string }> =>
    handleResponse(await fetch(`${API_BASE}/api/system-analysis/prompts/${encodeURIComponent(promptId)}`, {
      method: 'DELETE',
      headers: getHeaders(),
    })),

  clonePrompt: async (promptId: string, name: string): Promise<SystemAnalysisPromptTemplate> =>
    handleResponse(await fetch(`${API_BASE}/api/system-analysis/prompts/${encodeURIComponent(promptId)}/clone`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name }),
    })),

  createTask: async (payload: {
    project_id: string;
    task_name: string;
    analysis_type: string;
    prompt_template_id?: string;
    prompt_content: string;
    execution_config?: { timeout_seconds?: number; max_concurrency?: number };
    targets: Array<{ agent_key: string; ai_agent_id: string }>;
  }): Promise<{ task_id: string; status: string }> =>
    handleResponse(await fetch(`${API_BASE}/api/system-analysis/tasks`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  listTasks: async (params: {
    project_id: string;
    page?: number;
    per_page?: number;
    status?: string;
    analysis_type?: string;
    created_by?: string;
    risk_level?: string;
  }): Promise<{ items: SystemAnalysisTaskItem[]; total: number; page: number; per_page: number }> => {
    const query = new URLSearchParams({ project_id: params.project_id });
    if (params.page) query.append('page', String(params.page));
    if (params.per_page) query.append('per_page', String(params.per_page));
    if (params.status) query.append('status', params.status);
    if (params.analysis_type) query.append('analysis_type', params.analysis_type);
    if (params.created_by) query.append('created_by', params.created_by);
    if (params.risk_level) query.append('risk_level', params.risk_level);
    return handleResponse(await fetch(`${API_BASE}/api/system-analysis/tasks?${query.toString()}`, { headers: getHeaders() }));
  },

  getTask: async (taskId: string): Promise<SystemAnalysisTaskDetail> =>
    handleResponse(await fetch(`${API_BASE}/api/system-analysis/tasks/${encodeURIComponent(taskId)}`, { headers: getHeaders() })),

  getTaskNodes: async (taskId: string): Promise<SystemAnalysisTaskNodesResponse> =>
    handleResponse(await fetch(`${API_BASE}/api/system-analysis/tasks/${encodeURIComponent(taskId)}/nodes`, { headers: getHeaders() })),

  getTaskReport: async (taskId: string): Promise<SystemAnalysisReport> =>
    handleResponse(await fetch(`${API_BASE}/api/system-analysis/tasks/${encodeURIComponent(taskId)}/report`, { headers: getHeaders() })),

  rerunTask: async (taskId: string): Promise<{ task_id: string; status: string }> =>
    handleResponse(await fetch(`${API_BASE}/api/system-analysis/tasks/${encodeURIComponent(taskId)}/rerun`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  cancelTask: async (taskId: string): Promise<{ task_id: string; status: string }> =>
    handleResponse(await fetch(`${API_BASE}/api/system-analysis/tasks/${encodeURIComponent(taskId)}/cancel`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  retryNode: async (taskId: string, agentKey: string): Promise<{ task_id: string; status: string }> =>
    handleResponse(await fetch(`${API_BASE}/api/system-analysis/tasks/${encodeURIComponent(taskId)}/retry-node`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ agent_key: agentKey }),
    })),

  getConfig: async (projectId: string): Promise<SystemAnalysisServiceConfig> =>
    handleResponse(await fetch(`${API_BASE}/api/system-analysis/config?project_id=${encodeURIComponent(projectId)}`, { headers: getHeaders() })),

  saveConfig: async (config: SystemAnalysisServiceConfig): Promise<SystemAnalysisServiceConfig> =>
    handleResponse(await fetch(`${API_BASE}/api/system-analysis/config`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(config),
    })),
};

