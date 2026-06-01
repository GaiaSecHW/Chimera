import { API_BASE, getHeaders, getJsonWithDedupe, handleResponse } from './base';
import type { ServiceHealthMeta } from '../components/execution/serviceHealthMeta';
import {
  AppSaSessionIndex,
  AppSaSessionMeta,
  AppSaSessionSnapshot,
  AppSaClusterCapacity,
  AppSaClusterCapacitySummary,
  AppSaTaskListStats,
  AppSaStagesJson,
  AppSaTaskActionResponse,
  AppSaTaskCreateRequest,
  AppSaTaskDetail,
  AppSaTaskEvaluation,
  AppSaTaskItem,
  AppSaTaskListItem,
  AppSaTaskResult,
  AppSaTaskTimeline,
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
  getHealth: async (): Promise<{ status: string } & ServiceHealthMeta> =>
    getJsonWithDedupe(`${BASE}/health`, { headers: getHeaders() }),

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
    analysis_mode?: 'binary' | 'source' | '';
    parent_task_id?: string;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
  }): Promise<{ items: AppSaTaskListItem[]; total: number; page: number; per_page: number }> => {
    const query = new URLSearchParams({ project_id: params.project_id });
    if (params.page) query.append('page', String(params.page));
    if (params.per_page) query.append('per_page', String(params.per_page));
    if (params.status) query.append('status', params.status);
    if (params.analysis_mode) query.append('analysis_mode', params.analysis_mode);
    if (params.parent_task_id) query.append('parent_task_id', params.parent_task_id);
    if (params.sort_by) query.append('sort_by', params.sort_by);
    if (params.sort_order) query.append('sort_order', params.sort_order);
    return getJsonWithDedupe(`${BASE}/tasks?${query.toString()}`, { headers: getHeaders() });
  },

  getTaskStats: async (params: {
    project_id: string;
    status?: string;
    analysis_mode?: 'binary' | 'source' | '';
    parent_task_id?: string;
  }): Promise<AppSaTaskListStats> => {
    const query = new URLSearchParams({ project_id: params.project_id });
    if (params.status) query.append('status', params.status);
    if (params.analysis_mode) query.append('analysis_mode', params.analysis_mode);
    if (params.parent_task_id) query.append('parent_task_id', params.parent_task_id);
    return getJsonWithDedupe(`${BASE}/tasks/stats?${query.toString()}`, { headers: getHeaders() });
  },

  getWorkerClusterCapacitySummary: async (): Promise<AppSaClusterCapacitySummary> =>
    getJsonWithDedupe(`${BASE}/workers/cluster-capacity/summary`, { headers: getHeaders() }),

  getWorkerClusterCapacity: async (): Promise<AppSaClusterCapacity> =>
    getJsonWithDedupe(`${BASE}/workers/cluster-capacity`, { headers: getHeaders() }),

  getTask: async (taskId: string): Promise<AppSaTaskDetail> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}`, { headers: getHeaders() })),

  getTimeline: async (taskId: string): Promise<AppSaTaskTimeline> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/timeline`, { headers: getHeaders() })),

  clearTimeline: async (taskId: string): Promise<AppSaTaskActionResponse> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/timeline`, {
      method: 'DELETE',
      headers: getHeaders(),
    })),

  deleteTimelineEvent: async (taskId: string, eventId: string): Promise<AppSaTaskActionResponse> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/timeline/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      headers: getHeaders(),
    })),

  repairTaskOrigin: async (taskId: string, analysisMode: 'binary' | 'source'): Promise<AppSaTaskDetail> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/origin`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ analysis_mode: analysisMode }),
    })),

  getTaskResult: async (taskId: string): Promise<AppSaTaskResult> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/result`, { headers: getHeaders() })),

  getTaskEvaluation: async (taskId: string): Promise<AppSaTaskEvaluation> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/evaluation`, { headers: getHeaders() })),

  listTaskSessions: async (taskId: string): Promise<AppSaSessionMeta[]> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/sessions`, { headers: getHeaders() })),

  getTaskSessionIndex: async (taskId: string): Promise<AppSaSessionIndex> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/sessions/index`, { headers: getHeaders() })),

  getTaskSessionFile: async (taskId: string, path: string): Promise<AppSaSessionSnapshot> => {
    const query = new URLSearchParams({ path }).toString();
    return handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/sessions/file?${query}`, { headers: getHeaders() }));
  },

  cancelTask: async (taskId: string): Promise<AppSaTaskItem> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/cancel`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  deleteTask: async (taskId: string, deleteFiles = true): Promise<void> => {
    const resp = await fetch(
      `${BASE}/tasks/${encodeURIComponent(taskId)}?delete_files=${deleteFiles}`,
      { method: 'DELETE', headers: getHeaders() },
    );
    if (!resp.ok) await handleResponse(resp);
  },

  restartTask: async (taskId: string): Promise<AppSaTaskDetail> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/restart`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  resumeTask: async (taskId: string): Promise<AppSaTaskDetail> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/resume`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  getTaskLogs: async (taskId: string): Promise<{ task_id: string; status: string; stages_json: AppSaStagesJson }> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/logs`, { headers: getHeaders() })),

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
