import { API_BASE, getHeaders, handleResponse } from './base';
import {
  AppDfaModelsConfig,
  AppDfaServiceConfig,
  AppDfaTaskCreateRequest,
  AppDfaTaskDetail,
  AppDfaTaskItem,
} from '../types/types';

const BASE = `${API_BASE}/api/app/dataflow-analyse`;

export const DEFAULT_DFA_MODELS_CONFIG: AppDfaModelsConfig = {
  providers: {
    icsl_vllm_1: {
      baseUrl: 'http://172.31.29.10:8000/v1/',
      api: 'openai-completions',
      apiKey: '1234',
      models: [{ id: 'zai-org/GLM-5', reasoning: true }],
    },
  },
  updated_at: null,
};

export const appDataflowAnalyseApi = {
  // ── Health ────────────────────────────────────────────────────────────────
  getHealth: async (): Promise<{ status: string }> =>
    handleResponse(await fetch(`${BASE}/health`, { headers: getHeaders() })),

  // ── Tasks ─────────────────────────────────────────────────────────────────
  createTask: async (payload: AppDfaTaskCreateRequest): Promise<AppDfaTaskDetail> =>
    handleResponse(await fetch(`${BASE}/tasks`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  listTasks: async (params: {
    project_id: string;
    page?: number;
    per_page?: number;
    status?: string;
  }): Promise<{ items: AppDfaTaskItem[]; total: number; page: number; per_page: number }> => {
    const query = new URLSearchParams({ project_id: params.project_id });
    if (params.page) query.append('page', String(params.page));
    if (params.per_page) query.append('per_page', String(params.per_page));
    if (params.status) query.append('status', params.status);
    return handleResponse(await fetch(`${BASE}/tasks?${query.toString()}`, { headers: getHeaders() }));
  },

  getTask: async (taskId: string): Promise<AppDfaTaskDetail> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}`, { headers: getHeaders() })),

  cancelTask: async (taskId: string): Promise<AppDfaTaskItem> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/cancel`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  restartTask: async (taskId: string): Promise<AppDfaTaskDetail> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/restart`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  generatePrompt: async (inputPath: string): Promise<{ prompt: string }> =>
    handleResponse(await fetch(`${BASE}/generate-prompt`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ input_path: inputPath }),
    })),

  // ── Config ────────────────────────────────────────────────────────────────
  getConfig: async (projectId: string): Promise<AppDfaServiceConfig> =>
    handleResponse(await fetch(`${BASE}/config?project_id=${encodeURIComponent(projectId)}`, { headers: getHeaders() })),

  saveConfig: async (config: AppDfaServiceConfig): Promise<AppDfaServiceConfig> =>
    handleResponse(await fetch(`${BASE}/config`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ project_id: config.project_id, config }),
    })),

  // ── Models config ─────────────────────────────────────────────────────────
  getModels: async (): Promise<AppDfaModelsConfig> => {
    const response = await fetch(`${BASE}/models`, { headers: getHeaders() });
    if (response.status === 404) return DEFAULT_DFA_MODELS_CONFIG;
    const data = await handleResponse(response);
    // Guard: if backend returned HTML / non-object / null providers, fall back to defaults
    if (!data || typeof data !== 'object' || !data.providers || typeof data.providers !== 'object') {
      return DEFAULT_DFA_MODELS_CONFIG;
    }
    return data as AppDfaModelsConfig;
  },

  saveModels: async (config: AppDfaModelsConfig): Promise<AppDfaModelsConfig> =>
    handleResponse(await fetch(`${BASE}/models`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ config }),
    })),
};
