
import { API_BASE, handleResponse, getHeaders } from './base';
import { UserInfo, Role, UserSession, DetailedSession, MachineToken } from '../types/types';

export const authApi = {
  // 3.1 认证与令牌接口
  login: async (credentials: any) => {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    return handleResponse(response);
  },
  
  validateHumanToken: async (): Promise<UserInfo> => {
    const response = await fetch(`${API_BASE}/api/auth/validate-human-token`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  validateToken: async (): Promise<UserInfo> => {
    return authApi.validateHumanToken();
  },

  // 3.1.2 申请机机 Token (申请专用)
  applyMachineToken: async (payload: { machine_code: string; description?: string }): Promise<MachineToken> => {
    const response = await fetch(`${API_BASE}/api/auth/machine-token`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  // 3.4 机机 Token 管理接口 (CRUD & Control)
  listMachineTokens: async (): Promise<MachineToken[]> => {
    const response = await fetch(`${API_BASE}/api/auth/machine-tokens`, { headers: getHeaders() });
    return handleResponse(response);
  },

  createMachineToken: async (payload: { machine_code: string; description?: string; expires_at?: string | null }): Promise<MachineToken & { token?: string }> => {
    const response = await fetch(`${API_BASE}/api/auth/machine-tokens`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  updateMachineToken: async (tokenId: number, payload: { description?: string; expires_at?: string | null }): Promise<any> => {
    const response = await fetch(`${API_BASE}/api/auth/machine-tokens/${tokenId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  deleteMachineToken: async (tokenId: number): Promise<any> => {
    const response = await fetch(`${API_BASE}/api/auth/machine-tokens/${tokenId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  enableMachineToken: async (tokenId: number): Promise<any> => {
    const response = await fetch(`${API_BASE}/api/auth/machine-tokens/${tokenId}/enable`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  disableMachineToken: async (tokenId: number): Promise<any> => {
    const response = await fetch(`${API_BASE}/api/auth/machine-tokens/${tokenId}/disable`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  regenerateMachineToken: async (tokenId: number): Promise<MachineToken & { token: string }> => {
    const response = await fetch(`${API_BASE}/api/auth/machine-tokens/${tokenId}/regenerate`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  getProjectMachineToken: async (projectId: string): Promise<MachineToken> => {
    const response = await fetch(`${API_BASE}/api/auth/machine-tokens/projects/${projectId}`, {
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  refreshProjectMachineToken: async (projectId: string): Promise<MachineToken> => {
    const response = await fetch(`${API_BASE}/api/auth/machine-tokens/projects/${projectId}/refresh`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  // 3.2 用户管理接口
  listUsers: async (): Promise<UserInfo[]> => {
    const response = await fetch(`${API_BASE}/api/auth/users/user_list`, { headers: getHeaders() });
    return handleResponse(response);
  },

  createUser: async (payload: { username: string; password?: string; role_ids?: number[] }): Promise<UserInfo> => {
    const response = await fetch(`${API_BASE}/api/auth/users`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  getUser: async (userId: number): Promise<UserInfo> => {
    const response = await fetch(`${API_BASE}/api/auth/users/${userId}`, { headers: getHeaders() });
    return handleResponse(response);
  },

  updateUser: async (userId: number, payload: { username?: string; is_active?: boolean; password?: string }): Promise<any> => {
    const response = await fetch(`${API_BASE}/api/auth/users/${userId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  deleteUser: async (userId: number): Promise<any> => {
    const response = await fetch(`${API_BASE}/api/auth/users/${userId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  // 用户-角色关联
  getUserRoles: async (userId: number): Promise<{ user_id: number; role_ids: number[]; role_names: string[] }> => {
    const response = await fetch(`${API_BASE}/api/auth/users/${userId}/role`, { headers: getHeaders() });
    return handleResponse(response);
  },

  bindUserRoles: async (userId: number, roleIds: number[]): Promise<any> => {
    const response = await fetch(`${API_BASE}/api/auth/users/${userId}/role`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ role_ids: roleIds }),
    });
    return handleResponse(response);
  },

  getUserPlatformRole: async (userId: number): Promise<{ user_id: number; platform_role: string; role_names: string[] }> => {
    const response = await fetch(`${API_BASE}/api/auth/users/${userId}/platform-role`, { headers: getHeaders() });
    return handleResponse(response);
  },

  updateUserPlatformRole: async (userId: number, roleName: 'ordinary_admin' | 'ordinary_user'): Promise<any> => {
    const response = await fetch(`${API_BASE}/api/auth/users/${userId}/platform-role`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ role_name: roleName }),
    });
    return handleResponse(response);
  },

  // 密码管理
  changePasswordAdmin: async (userId: number, payload: any): Promise<any> => {
    const response = await fetch(`${API_BASE}/api/auth/users/${userId}/password`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  // 在线会话管理
  listOnlineSessions: async (): Promise<UserSession[]> => {
    const response = await fetch(`${API_BASE}/api/auth/users/sessions/online`, { headers: getHeaders() });
    return handleResponse(response);
  },

  getUserSessions: async (userId: number): Promise<DetailedSession[]> => {
    const response = await fetch(`${API_BASE}/api/auth/users/${userId}/sessions`, { headers: getHeaders() });
    return handleResponse(response);
  },

  revokeUserSessions: async (userId: number): Promise<any> => {
    const response = await fetch(`${API_BASE}/api/auth/users/${userId}/sessions`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  // 3.3 角色管理接口
  listRoles: async (): Promise<Role[]> => {
    const response = await fetch(`${API_BASE}/api/auth/role_list`, { headers: getHeaders() });
    return handleResponse(response);
  },

  createRole: async (payload: { name: string; description?: string }): Promise<Role> => {
    const response = await fetch(`${API_BASE}/api/auth/role`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  updateRole: async (roleId: number, payload: { name?: string; description?: string }): Promise<any> => {
    const response = await fetch(`${API_BASE}/api/auth/role/${roleId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  deleteRole: async (roleId: number): Promise<any> => {
    const response = await fetch(`${API_BASE}/api/auth/role/${roleId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(response);
  }
};
