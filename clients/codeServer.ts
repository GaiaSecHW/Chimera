import { API_BASE, handleResponse, getHeaders } from './base';

export const codeServerApi = {
  // Health Check
  getHealth: async (): Promise<{ status: string }> => {
    const response = await fetch(`${API_BASE}/api/app/code-server/health`, { headers: getHeaders() });
    return handleResponse(response);
  },

  getDeployDefaults: async (): Promise<{
    default_image: string;
    preset_env: Record<string, string>;
    fileserver_mount_enabled: boolean;
    fileserver_mount_path: string;
    fileserver_project_root_prefix: string;
  }> =>
    handleResponse(await fetch(`${API_BASE}/api/app/code-server/deploy-defaults`, { headers: getHeaders() })),

  // Instances
  list: async (projectId: string): Promise<{ total: number; items: any[] }> => 
    handleResponse(await fetch(`${API_BASE}/api/app/code-server/projects/${projectId}/code-servers`, { headers: getHeaders() })),
  
  getDetail: async (projectId: string, name: string): Promise<any> => 
    handleResponse(await fetch(`${API_BASE}/api/app/code-server/projects/${projectId}/code-servers/${name}`, { headers: getHeaders() })),
  
  getStatus: async (projectId: string, name: string): Promise<any> => 
    handleResponse(await fetch(`${API_BASE}/api/app/code-server/projects/${projectId}/code-servers/${name}/status`, { headers: getHeaders() })),
  
  getLogs: async (projectId: string, name: string, tailLines: number = 100): Promise<{ code_server_name: string; logs: string }> => 
    handleResponse(await fetch(`${API_BASE}/api/app/code-server/projects/${projectId}/code-servers/${name}/logs?tail_lines=${tailLines}`, { headers: getHeaders() })),
  
  create: async (projectId: string, payload: any): Promise<{ task_id: string; task_type: string }> => 
    handleResponse(await fetch(`${API_BASE}/api/app/code-server/projects/${projectId}/code-servers`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    })),
  
  delete: async (projectId: string, name: string, deleteOutput = false): Promise<any> => 
    handleResponse(await fetch(`${API_BASE}/api/app/code-server/projects/${projectId}/code-servers`, {
      method: 'DELETE',
      headers: getHeaders(),
      body: JSON.stringify({ name, delete_output_pvcs: deleteOutput })
    })),
  
  restart: async (projectId: string, name: string): Promise<any> => 
    handleResponse(await fetch(`${API_BASE}/api/app/code-server/projects/${projectId}/code-servers/restart`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name })
    })),

  // Tasks
  getTasks: async (projectId: string): Promise<{ total: number; items: any[] }> => 
    handleResponse(await fetch(`${API_BASE}/api/app/code-server/projects/${projectId}/tasks`, { headers: getHeaders() })),
  
  getTaskDetail: async (projectId: string, taskId: string): Promise<any> => 
    handleResponse(await fetch(`${API_BASE}/api/app/code-server/projects/${projectId}/tasks/${taskId}`, { headers: getHeaders() })),

  deleteTask: async (projectId: string, taskId: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/app/code-server/projects/${projectId}/tasks/${taskId}`, {
      method: 'DELETE',
      headers: getHeaders()
    }))
};
