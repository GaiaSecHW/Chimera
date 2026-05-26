import { API_BASE, getHeaders, handleResponse } from './base';
import { ServiceHealthMeta } from '../components/execution/ServiceBuildVersion';
import {
  AppEaTaskActionResponse,
  AppEaTaskEvent,
  AppEaSessionIndex,
  AppEaSessionMeta,
  AppEaSessionSnapshot,
  AppEaTaskCreateRequest,
  AppEaTaskDetail,
  AppEaTaskEvaluation,
  AppEaTaskItem,
  AppEaTaskLogsResponse,
  AppEaTaskResult,
  AppEaTaskTimelineResponse,
  EntryAnalyseSlotClusterSummary,
  EntryAnalysisModelsConfig,
  EntryAnalysisPromptTemplate,
  EntryAnalysisServiceConfig,
} from '../types/types';

const BASE = `${API_BASE}/api/app/entry-analyse`;

// ── 模型配置内置默认值 ────────────────────────────────────────────────────────
export const DEFAULT_MODELS_CONFIG: EntryAnalysisModelsConfig = {
  providers: {
    icsl_vllm_1: {
      baseUrl: 'http://172.31.29.10:8000/v1/',
      api: 'openai-completions',
      apiKey: '1234',
      models: [{ id: 'zai-org/GLM-5', reasoning: true }],
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

export const appEntryAnalyseApi = {
  // ── Health ────────────────────────────────────────────────────────────────
  getHealth: async (): Promise<{ status: string } & ServiceHealthMeta> =>
    handleResponse(await fetch(`${BASE}/health`, { headers: getHeaders() })),

  // ── Tasks ─────────────────────────────────────────────────────────────────
  createTask: async (payload: AppEaTaskCreateRequest): Promise<AppEaTaskDetail> =>
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
    mode?: 'manual' | 'binary' | 'source';
    parent_task_id?: string;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
  }): Promise<{ items: AppEaTaskItem[]; total: number; page: number; per_page: number }> => {
    const query = new URLSearchParams({ project_id: params.project_id });
    if (params.page) query.append('page', String(params.page));
    if (params.per_page) query.append('per_page', String(params.per_page));
    if (params.status) query.append('status', params.status);
    if (params.mode) query.append('mode', params.mode);
    if (params.parent_task_id) query.append('parent_task_id', params.parent_task_id);
    if (params.sort_by) query.append('sort_by', params.sort_by);
    if (params.sort_order) query.append('sort_order', params.sort_order);
    return handleResponse(await fetch(`${BASE}/tasks?${query.toString()}`, { headers: getHeaders() }));
  },

  getSlotCluster: async (projectId: string): Promise<EntryAnalyseSlotClusterSummary> =>
    handleResponse(await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/slot-cluster`, { headers: getHeaders() })),

  getTask: async (taskId: string): Promise<AppEaTaskDetail> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}`, { headers: getHeaders() })),

  getTimeline: async (taskId: string): Promise<AppEaTaskTimelineResponse> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/timeline`, { headers: getHeaders() })),

  clearTimeline: async (taskId: string): Promise<AppEaTaskActionResponse> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/timeline`, {
      method: 'DELETE',
      headers: getHeaders(),
    })),

  deleteTimelineEvent: async (taskId: string, eventId: string): Promise<AppEaTaskActionResponse> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/timeline/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      headers: getHeaders(),
    })),

  getTaskResult: async (taskId: string): Promise<AppEaTaskResult> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/result`, { headers: getHeaders() })),

  getTaskEvaluation: async (taskId: string): Promise<AppEaTaskEvaluation> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/evaluation`, { headers: getHeaders() })),

  listTaskSessions: async (taskId: string): Promise<AppEaSessionMeta[]> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/sessions`, { headers: getHeaders() })),

  getTaskSessionIndex: async (taskId: string): Promise<AppEaSessionIndex> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/sessions/index`, { headers: getHeaders() })),

  getTaskSessionFile: async (taskId: string, path: string): Promise<AppEaSessionSnapshot> => {
    const query = new URLSearchParams({ path }).toString();
    return handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/sessions/file?${query}`, { headers: getHeaders() }));
  },

  cancelTask: async (taskId: string): Promise<AppEaTaskItem> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/cancel`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  restartTask: async (taskId: string): Promise<AppEaTaskDetail> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/restart`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  resumeTask: async (taskId: string): Promise<AppEaTaskDetail> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/resume`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  deleteTask: async (taskId: string, deleteFiles = true): Promise<AppEaTaskActionResponse> => {
    return handleResponse(await fetch(
      `${BASE}/tasks/${encodeURIComponent(taskId)}?delete_files=${deleteFiles}`,
      { method: 'DELETE', headers: getHeaders() },
    ));
  },

  getTaskLogs: async (taskId: string, since = 0): Promise<AppEaTaskLogsResponse> => {
    const q = since > 0 ? `?since=${since}` : '';
    return handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/logs${q}`, { headers: getHeaders() }));
  },

  generatePrompt: async (inputPath: string): Promise<{ prompt: string }> =>
    handleResponse(await fetch(`${BASE}/generate-prompt`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ input_path: inputPath }),
    })),

  listModules: async (basePath: string): Promise<{ modules: string[]; base_path: string }> =>
    handleResponse(await fetch(`${BASE}/modules?base_path=${encodeURIComponent(basePath)}`, { headers: getHeaders() })),

  // ── Prompts ───────────────────────────────────────────────────────────────
  listPrompts: async (params: {
    page?: number;
    per_page?: number;
    category?: string;
    keyword?: string;
    is_enabled?: boolean;
  } = {}): Promise<{ items: EntryAnalysisPromptTemplate[]; total: number; page: number; per_page: number }> => {
    const query = new URLSearchParams();
    if (params.page) query.append('page', String(params.page));
    if (params.per_page) query.append('per_page', String(params.per_page));
    if (params.category) query.append('category', params.category);
    if (params.keyword) query.append('keyword', params.keyword);
    if (typeof params.is_enabled === 'boolean') query.append('is_enabled', String(params.is_enabled));
    return handleResponse(await fetch(`${BASE}/prompts?${query.toString()}`, { headers: getHeaders() }));
  },

  getPrompt: async (promptId: string): Promise<EntryAnalysisPromptTemplate> =>
    handleResponse(await fetch(`${BASE}/prompts/${encodeURIComponent(promptId)}`, { headers: getHeaders() })),

  createPrompt: async (payload: {
    name: string;
    category: string;
    description?: string;
    content: string;
    variables_json?: string[];
    is_default?: boolean;
    is_enabled?: boolean;
  }): Promise<EntryAnalysisPromptTemplate> =>
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
  }>): Promise<EntryAnalysisPromptTemplate> =>
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

  clonePrompt: async (promptId: string, name: string): Promise<EntryAnalysisPromptTemplate> =>
    handleResponse(await fetch(`${BASE}/prompts/${encodeURIComponent(promptId)}/clone`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name }),
    })),

  // ── Config ────────────────────────────────────────────────────────────────
  getConfig: async (projectId: string): Promise<EntryAnalysisServiceConfig> =>
    handleResponse(await fetch(`${BASE}/config?project_id=${encodeURIComponent(projectId)}`, { headers: getHeaders() })),

  saveConfig: async (config: EntryAnalysisServiceConfig): Promise<EntryAnalysisServiceConfig> =>
    handleResponse(await fetch(`${BASE}/config`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ project_id: config.project_id, config }),
    })),

  // ── Models config ─────────────────────────────────────────────────────────
  getModels: async (): Promise<EntryAnalysisModelsConfig> => {
    const response = await fetch(`${BASE}/models`, { headers: getHeaders() });
    if (response.status === 404) return DEFAULT_MODELS_CONFIG;
    const data = await handleResponse(response);
    // Guard: if backend returned HTML / non-object / null providers, fall back to defaults
    if (!data || typeof data !== 'object' || !data.providers || typeof data.providers !== 'object') {
      return DEFAULT_MODELS_CONFIG;
    }
    return data as EntryAnalysisModelsConfig;
  },

  saveModels: async (config: EntryAnalysisModelsConfig): Promise<EntryAnalysisModelsConfig> =>
    handleResponse(await fetch(`${BASE}/models`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ config }),
    })),
};
