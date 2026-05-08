import { API_BASE, getHeaders, handleResponse } from './base';
import {
  AppDfaServiceConfig,
  AppDfaStagesJson,
  AppDfaTaskCreateRequest,
  AppDfaTaskDetail,
  AppDfaTaskItem,
} from '../types/types';

const BASE = `${API_BASE}/api/app/dataflow-analyse`;

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

  deleteTask: async (taskId: string, deleteFiles = true): Promise<void> => {
    const resp = await fetch(
      `${BASE}/tasks/${encodeURIComponent(taskId)}?delete_files=${deleteFiles}`,
      { method: 'DELETE', headers: getHeaders() },
    );
    if (!resp.ok) await handleResponse(resp);
  },

  getTaskLogs: async (taskId: string): Promise<{ task_id: string; status: string; stages_json: AppDfaStagesJson }> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/logs`, { headers: getHeaders() })),

  restartTask: async (taskId: string): Promise<AppDfaTaskDetail> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/restart`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  resumeTask: async (taskId: string): Promise<AppDfaTaskDetail> =>
    handleResponse(await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/resume`, {
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

};
