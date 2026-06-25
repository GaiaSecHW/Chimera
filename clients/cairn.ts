import { getHeaders, handleResponse } from './base';

const CAIRN_BASE = '/cairn-api';

export const cairnApi = {
  createProject: async (payload: {
    title?: string;
    origin: string;
    goal: string;
  }): Promise<{ project: { id: string; title: string; status: string }; [key: string]: any }> => {
    const response = await fetch(`${CAIRN_BASE}/projects`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  listProjects: async (): Promise<Array<{ id: string; title: string; status: string; created_at: string }>> => {
    const response = await fetch(`${CAIRN_BASE}/projects`, {
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  getProject: async (projectId: string): Promise<any> => {
    const response = await fetch(`${CAIRN_BASE}/projects/${encodeURIComponent(projectId)}`, {
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  deleteProject: async (projectId: string): Promise<void> => {
    const response = await fetch(`${CAIRN_BASE}/projects/${encodeURIComponent(projectId)}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!response.ok && response.status !== 204) {
      throw new Error(`删除 cairn 项目失败: ${response.status}`);
    }
  },
};
