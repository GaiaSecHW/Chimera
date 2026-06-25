import { API_BASE, getHeaders, handleResponse } from './base';

export interface ScheduleCenterUploadTask {
  task_id: string;
  name: string;
  task_type: string;
  updated_at?: string;
  business_status?: string;
}

export interface ScheduleCenterUploadTaskListResponse {
  total: number;
  items: ScheduleCenterUploadTask[];
}

export const scheduleCenterApi = {
  getHealth: async (): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/health`, { headers: getHeaders() })),

  getRuntimeOverview: async (): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/runtime/overview`, { headers: getHeaders() })),

  getRuntimeQueuePreview: async (): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/runtime/queue-preview`, { headers: getHeaders() })),

  getTaskOverview: async (): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/tasks/overview`, { headers: getHeaders() })),

  getRuntimeConfig: async (): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/config/runtime`, { headers: getHeaders() })),

  saveRuntimeConfig: async (payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/config/runtime`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  resetRuntimeConfig: async (): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/config/runtime/reset`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  listGlobalTasks: async (params: Record<string, string | number | boolean | undefined | null>): Promise<any> => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      query.set(key, String(value));
    });
    const suffix = query.toString();
    return handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/tasks${suffix ? `?${suffix}` : ''}`, { headers: getHeaders() }));
  },

  getGlobalTask: async (taskId: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/tasks/${encodeURIComponent(taskId)}`, { headers: getHeaders() })),

  listJobs: async (projectId: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/projects/${encodeURIComponent(projectId)}/jobs`, { headers: getHeaders() })),

  getJob: async (projectId: string, jobId: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}`, { headers: getHeaders() })),

  createJob: async (projectId: string, payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/projects/${encodeURIComponent(projectId)}/jobs`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  updateJob: async (projectId: string, jobId: string, payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  enableJob: async (projectId: string, jobId: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}/enable`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  disableJob: async (projectId: string, jobId: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}/disable`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  triggerJob: async (projectId: string, jobId: string, payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}/trigger`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  listExecutions: async (projectId: string, jobId: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}/executions`, { headers: getHeaders() })),

  getJobRuntime: async (projectId: string, jobId: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}/runtime`, { headers: getHeaders() })),

  listUserTasks: async (
    projectId: string,
    params: Record<string, string | number | boolean | undefined | null> = {},
  ): Promise<any> => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      query.set(key, String(value));
    });
    const suffix = query.toString();
    return handleResponse(await fetch(
      `${API_BASE}/api/chirmera-platform-schedule/projects/${encodeURIComponent(projectId)}/user-tasks${suffix ? `?${suffix}` : ''}`,
      { headers: getHeaders() },
    ));
  },

  listUploadTasks: async (projectId: string, uploadId: string): Promise<ScheduleCenterUploadTaskListResponse> =>
    handleResponse(await fetch(
      `${API_BASE}/api/chirmera-platform-schedule/projects/${encodeURIComponent(projectId)}/uploads/${encodeURIComponent(uploadId)}/tasks`,
      { headers: getHeaders() },
    )),

  createUserTask: async (projectId: string, payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/projects/${encodeURIComponent(projectId)}/user-tasks`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  getUserTask: async (projectId: string, taskId: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/projects/${encodeURIComponent(projectId)}/user-tasks/${encodeURIComponent(taskId)}`, { headers: getHeaders() })),

  deleteUserTask: async (projectId: string, taskId: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/projects/${encodeURIComponent(projectId)}/user-tasks/${encodeURIComponent(taskId)}`, {
      method: 'DELETE',
      headers: getHeaders(),
    })),

  bulkDeleteUserTasks: async (projectId: string, payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/projects/${encodeURIComponent(projectId)}/user-tasks/bulk-delete`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  listUserTaskDeleteQueue: async (
    projectId: string,
    params: Record<string, string | number | boolean | undefined | null> = {},
  ): Promise<any> => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      query.set(key, String(value));
    });
    const suffix = query.toString();
    return handleResponse(await fetch(
      `${API_BASE}/api/chirmera-platform-schedule/projects/${encodeURIComponent(projectId)}/user-task-delete-queue${suffix ? `?${suffix}` : ''}`,
      { headers: getHeaders() },
    ));
  },

  dispatchUserTask: async (projectId: string, taskId: string, payload?: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/projects/${encodeURIComponent(projectId)}/user-tasks/${encodeURIComponent(taskId)}/dispatch`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload || {}),
    })),

  retryDispatchUserTask: async (projectId: string, taskId: string, payload?: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/projects/${encodeURIComponent(projectId)}/user-tasks/${encodeURIComponent(taskId)}/retry-dispatch`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload || {}),
    })),

  syncUserTask: async (projectId: string, taskId: string, payload?: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/projects/${encodeURIComponent(projectId)}/user-tasks/${encodeURIComponent(taskId)}/sync`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload || {}),
    })),

  listUserTaskEvents: async (
    projectId: string,
    taskId: string,
    params: Record<string, string | number | boolean | undefined | null> = {},
  ): Promise<any> => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      query.set(key, String(value));
    });
    const suffix = query.toString();
    return handleResponse(await fetch(
      `${API_BASE}/api/chirmera-platform-schedule/projects/${encodeURIComponent(projectId)}/user-tasks/${encodeURIComponent(taskId)}/events${suffix ? `?${suffix}` : ''}`,
      { headers: getHeaders() },
    ));
  },

  listProjectUserTaskEvents: async (
    projectId: string,
    params: Record<string, string | number | boolean | undefined | null> = {},
  ): Promise<any> => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      query.set(key, String(value));
    });
    const suffix = query.toString();
    return handleResponse(await fetch(
      `${API_BASE}/api/chirmera-platform-schedule/projects/${encodeURIComponent(projectId)}/user-task-events${suffix ? `?${suffix}` : ''}`,
      { headers: getHeaders() },
    ));
  },

  listGlobalUserTaskEvents: async (
    params: Record<string, string | number | boolean | undefined | null> = {},
  ): Promise<any> => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      query.set(key, String(value));
    });
    const suffix = query.toString();
    return handleResponse(await fetch(
      `${API_BASE}/api/chirmera-platform-schedule/user-task-events${suffix ? `?${suffix}` : ''}`,
      { headers: getHeaders() },
    ));
  },

  listUserTaskDispatches: async (projectId: string, taskId: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/projects/${encodeURIComponent(projectId)}/user-tasks/${encodeURIComponent(taskId)}/dispatches`, { headers: getHeaders() })),

  getExecution: async (projectId: string, executionId: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/projects/${encodeURIComponent(projectId)}/executions/${encodeURIComponent(executionId)}`, { headers: getHeaders() })),

  listExecutionEvents: async (projectId: string, executionId: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/projects/${encodeURIComponent(projectId)}/executions/${encodeURIComponent(executionId)}/events`, { headers: getHeaders() })),

  listKeys: async (projectId: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/projects/${encodeURIComponent(projectId)}/keys`, { headers: getHeaders() })),

  getKey: async (projectId: string, keyId: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/projects/${encodeURIComponent(projectId)}/keys/${encodeURIComponent(keyId)}`, { headers: getHeaders() })),

  createKey: async (projectId: string, payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/projects/${encodeURIComponent(projectId)}/keys`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  disableKey: async (projectId: string, keyId: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/projects/${encodeURIComponent(projectId)}/keys/${encodeURIComponent(keyId)}/disable`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  syncKey: async (projectId: string, keyId: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/projects/${encodeURIComponent(projectId)}/keys/${encodeURIComponent(keyId)}/sync`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  listKeyEvents: async (projectId: string, keyId: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/chirmera-platform-schedule/projects/${encodeURIComponent(projectId)}/keys/${encodeURIComponent(keyId)}/events`, { headers: getHeaders() })),
};
