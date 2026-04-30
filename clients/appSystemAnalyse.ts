import { API_BASE, getHeaders, handleResponse } from './base';
import {
  AppSaTaskCreateRequest,
  AppSaTaskDetail,
  AppSaTaskItem,
  SystemAnalysisModelsConfig,
  SystemAnalysisPromptTemplate,
  SystemAnalysisServiceConfig,
} from '../types/types';

const BASE = `${API_BASE}/api/app/system-analyse`;

// ── 模型配置内置默认值（与后端 _DEFAULT_MODELS_CONFIG 保持同步）────────────────
export const DEFAULT_MODELS_CONFIG: SystemAnalysisModelsConfig = {
  providers: {
    icsl_vllm_1: {
      baseUrl: 'http://172.31.29.10:8000/v1/',
      api: 'openai-completions',
      apiKey: '1234',
      models: [{ id: 'zai-org/GLM-5', reasoning: true }],
    },
    icsl_vllm_2: {
      baseUrl: 'http://172.31.29.10:8003/v1/',
      api: 'openai-completions',
      apiKey: '12345',
      models: [{ id: 'MiniMax/MiniMax-M2.5', reasoning: true }],
    },
    gptplus_glm: {
      baseUrl: 'https://az.gptplus5.com/v1',
      api: 'openai-completions',
      apiKey: 'sk-8zyyvaRQ6QlQzwONikzreTNlRqbLBokuUFH70Akk0AMTcF6y',
      models: [{ id: 'glm-5.1', reasoning: true }],
    },
    gptplus_minimax: {
      baseUrl: 'https://az.gptplus5.com/v1',
      api: 'openai-completions',
      apiKey: 'sk-8zyyvaRQ6QlQzwONikzreTNlRqbLBokuUFH70Akk0AMTcF6y',
      models: [{ id: 'MiniMax-M2.7', reasoning: true }],
    },
    gptplus_openai: {
      baseUrl: 'https://az.gptplus5.com/v1',
      api: 'openai-completions',
      apiKey: 'sk-8zyyvaRQ6QlQzwONikzreTNlRqbLBokuUFH70Akk0AMTcF6y',
      models: [{ id: 'gpt-5.4', reasoning: false }],
    },
  },
  updated_at: null,
};

export const appSystemAnalyseApi = {
  // ── Health ────────────────────────────────────────────────────────────────
  getHealth: async (): Promise<{ status: string }> =>
    handleResponse(await fetch(`${BASE}/health`, { headers: getHeaders() })),

  // ── Tasks ─────────────────────────────────────────────────────────────────
  createTask: async (payload: AppSaTaskCreateRequest): Promise<AppSaTaskDetail> =>
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
  }): Promise<{ items: AppSaTaskItem[]; total: number; page: number; per_page: number }> => {
    const query = new URLSearchParams({ project_id: params.project_id });
    if (params.page) query.append('page', String(params.page));
    if (params.per_page) query.append('per_page', String(params.per_page));
    if (params.status) query.append('status', params.status);
    return handleResponse(await fetch(`${BASE}/tasks?${query.toString()}`, { headers: getHeaders() }));
  },

  getTask: async (taskId: string): Promise<AppSaTaskDetail> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}`, { headers: getHeaders() })),

  cancelTask: async (taskId: string): Promise<AppSaTaskItem> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/cancel`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  restartTask: async (taskId: string): Promise<AppSaTaskDetail> =>
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

  // ── Prompts ───────────────────────────────────────────────────────────────
  listPrompts: async (params: {
    page?: number;
    per_page?: number;
    category?: string;
    keyword?: string;
    is_enabled?: boolean;
  } = {}): Promise<{ items: SystemAnalysisPromptTemplate[]; total: number; page: number; per_page: number }> => {
    const query = new URLSearchParams();
    if (params.page) query.append('page', String(params.page));
    if (params.per_page) query.append('per_page', String(params.per_page));
    if (params.category) query.append('category', params.category);
    if (params.keyword) query.append('keyword', params.keyword);
    if (typeof params.is_enabled === 'boolean') query.append('is_enabled', String(params.is_enabled));
    return handleResponse(await fetch(`${BASE}/prompts?${query.toString()}`, { headers: getHeaders() }));
  },

  getPrompt: async (promptId: string): Promise<SystemAnalysisPromptTemplate> =>
    handleResponse(await fetch(`${BASE}/prompts/${encodeURIComponent(promptId)}`, { headers: getHeaders() })),

  createPrompt: async (payload: {
    name: string;
    category: string;
    description?: string;
    content: string;
    variables_json?: string[];
    is_default?: boolean;
    is_enabled?: boolean;
  }): Promise<SystemAnalysisPromptTemplate> =>
    handleResponse(await fetch(`${BASE}/prompts`, {
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
    handleResponse(await fetch(`${BASE}/prompts/${encodeURIComponent(promptId)}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  deletePrompt: async (promptId: string): Promise<void> =>
    handleResponse(await fetch(`${BASE}/prompts/${encodeURIComponent(promptId)}`, {
      method: 'DELETE',
      headers: getHeaders(),
    })),

  clonePrompt: async (promptId: string, name: string): Promise<SystemAnalysisPromptTemplate> =>
    handleResponse(await fetch(`${BASE}/prompts/${encodeURIComponent(promptId)}/clone`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name }),
    })),

  // ── Config ────────────────────────────────────────────────────────────────
  getConfig: async (projectId: string): Promise<SystemAnalysisServiceConfig> =>
    handleResponse(await fetch(`${BASE}/config?project_id=${encodeURIComponent(projectId)}`, { headers: getHeaders() })),

  saveConfig: async (config: SystemAnalysisServiceConfig): Promise<SystemAnalysisServiceConfig> =>
    handleResponse(await fetch(`${BASE}/config`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ project_id: config.project_id, config }),
    })),

  // ── Models config ─────────────────────────────────────────────────────────
  getModels: async (): Promise<SystemAnalysisModelsConfig> => {
    const response = await fetch(`${BASE}/models`, { headers: getHeaders() });
    // 404 means the endpoint / table doesn't exist yet on this deployment — return built-in defaults
    if (response.status === 404) return DEFAULT_MODELS_CONFIG;
    const data = await handleResponse(response);
    // Guard: if backend returned HTML / non-object / null providers, fall back to defaults
    if (!data || typeof data !== 'object' || !data.providers || typeof data.providers !== 'object') {
      return DEFAULT_MODELS_CONFIG;
    }
    return data as SystemAnalysisModelsConfig;
  },

  saveModels: async (config: SystemAnalysisModelsConfig): Promise<SystemAnalysisModelsConfig> =>
    handleResponse(await fetch(`${BASE}/models`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ config }),
    })),
};
