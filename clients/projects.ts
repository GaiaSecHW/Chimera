import { API_BASE, handleResponse, getHeaders } from './base';
import { SecurityProject, K8sResourceList, NamespaceStatus } from '../types/types';

export const projectsApi = {
  // Health Check
  getHealth: async (): Promise<{ status: string; service: string }> => {
    const response = await fetch(`${API_BASE}/api/project/health`, { headers: getHeaders() });
    return handleResponse(response);
  },

  list: async (): Promise<{ total: number; projects: SecurityProject[] }> => {
    const response = await fetch(`${API_BASE}/api/project`, { headers: getHeaders() });
    return handleResponse(response);
  },
  
  getById: async (id: string): Promise<SecurityProject> => {
    const response = await fetch(`${API_BASE}/api/project/${id}`, { headers: getHeaders() });
    return handleResponse(response);
  },
  
  create: async (project: { name: string; description?: string; k8s_namespace?: string; is_public?: boolean; department_id?: number }): Promise<SecurityProject> => {
    const response = await fetch(`${API_BASE}/api/project`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(project),
    });
    return handleResponse(response);
  },
  
  update: async (id: string, project: { name?: string; description?: string; k8s_namespace?: string; is_public?: boolean; department_id?: number }): Promise<SecurityProject> => {
    const response = await fetch(`${API_BASE}/api/project/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(project),
    });
    return handleResponse(response);
  },
  
  delete: async (id: string): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE}/api/project/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },
  
  bindRole: async (projectId: string, payload: { user_id: string; role: string }) => {
    const response = await fetch(`${API_BASE}/api/project/${projectId}/role`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },
  
  unbindRole: async (projectId: string, userId: string) => {
    const response = await fetch(`${API_BASE}/api/project/${projectId}/role?user_id=${userId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },
  
  getNamespaceStatus: async (projectId: string): Promise<NamespaceStatus> => {
    const response = await fetch(`${API_BASE}/api/project/${projectId}/namespace`, { headers: getHeaders() });
    return handleResponse(response);
  },
  
  getK8sResources: async (projectId: string): Promise<K8sResourceList> => {
    const response = await fetch(`${API_BASE}/api/project/${projectId}/resources`, { headers: getHeaders() });
    return handleResponse(response);
  },

  rebuildIngressTls: async (projectId: string): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE}/api/project/${projectId}/tls-secret/rebuild`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },
  
  getPodLogs: async (projectId: string, podName: string, params: { tail_lines?: number; container?: string } = {}): Promise<{ logs: string }> => {
    const query = new URLSearchParams(params as any).toString();
    const response = await fetch(`${API_BASE}/api/project/${projectId}/pods/${podName}/logs?${query}`, { headers: getHeaders() });
    return handleResponse(response);
  }
};
