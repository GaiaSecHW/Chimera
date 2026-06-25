import { API_BASE, handleResponse, getHeaders } from './base';
import { ProductTreeNode, ProductVersionNode, SecurityProject, K8sResourceList, NamespaceStatus } from '../types/types';

export interface ProjectMember {
  user_id: string;
  username: string;
  is_creator: boolean;
  department_name: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ProjectAddableUser {
  id: number;
  username: string;
  department_name: string | null;
  is_already_member: boolean;
}

export interface ProjectBatchMemberResult {
  results: { user_id: string; success: boolean; message?: string | null }[];
  succeeded: number;
  failed: number;
}

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
  
  create: async (project: { name: string; description?: string; k8s_namespace?: string; is_public?: boolean; department_id?: number; product_version_id: string }): Promise<SecurityProject> => {
    const response = await fetch(`${API_BASE}/api/project`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(project),
    });
    return handleResponse(response);
  },
  
  update: async (id: string, project: { name?: string; description?: string; k8s_namespace?: string; is_public?: boolean; department_id?: number; product_version_id?: string | null }): Promise<SecurityProject> => {
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

  listMembers: async (
    projectId: string,
    params: { search?: string; page?: number; page_size?: number } = {},
  ): Promise<{ items: ProjectMember[]; total: number }> => {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.page) query.set('page', String(params.page));
    if (params.page_size) query.set('page_size', String(params.page_size));
    const response = await fetch(`${API_BASE}/api/project/${projectId}/members?${query.toString()}`, { headers: getHeaders() });
    return handleResponse(response);
  },

  searchAddableUsers: async (
    projectId: string,
    q: string,
    limit = 20,
  ): Promise<{ items: ProjectAddableUser[]; total: number }> => {
    const query = new URLSearchParams({ q, limit: String(limit) });
    const response = await fetch(`${API_BASE}/api/project/${projectId}/users/search?${query.toString()}`, { headers: getHeaders() });
    return handleResponse(response);
  },

  batchAddMembers: async (
    projectId: string,
    userIds: string[],
  ): Promise<ProjectBatchMemberResult> => {
    const response = await fetch(`${API_BASE}/api/project/${projectId}/members/batch`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ user_ids: userIds }),
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

export const productsApi = {
  getTree: async (): Promise<{ total: number; products: ProductTreeNode[] }> => {
    const response = await fetch(`${API_BASE}/api/project/products/tree`, { headers: getHeaders() });
    return handleResponse(response);
  },

  create: async (payload: { name: string; code: string; parent_id?: string | null; description?: string; sort_order?: number }): Promise<ProductTreeNode> => {
    const response = await fetch(`${API_BASE}/api/project/products`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  update: async (productId: string, payload: { name?: string; code?: string; parent_id?: string | null; description?: string; sort_order?: number }): Promise<ProductTreeNode> => {
    const response = await fetch(`${API_BASE}/api/project/products/${productId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  delete: async (productId: string): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE}/api/project/products/${productId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  createVersion: async (productId: string, payload: { version: string; name?: string; description?: string }): Promise<ProductVersionNode> => {
    const response = await fetch(`${API_BASE}/api/project/products/${productId}/versions`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  updateVersion: async (versionId: string, payload: { version?: string; name?: string; description?: string }): Promise<ProductVersionNode> => {
    const response = await fetch(`${API_BASE}/api/project/products/versions/${versionId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  deleteVersion: async (versionId: string): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE}/api/project/products/versions/${versionId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },
};
