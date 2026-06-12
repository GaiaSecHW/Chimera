import { API_BASE, getHeaders, handleResponse } from './base';

export const aigwApi = {
  listProviderStats: async (): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/aigw/stats/providers`, { headers: getHeaders() })),

  listRequestLogs: async (params?: Record<string, string | number>): Promise<any> => {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== '' && value !== undefined && value !== null) query.set(key, String(value));
    });
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return handleResponse(await fetch(`${API_BASE}/api/aigw/request-logs${suffix}`, { headers: getHeaders() }));
  },

  getRequestLogDetail: async (id: number | string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/aigw/request-logs/${id}`, { headers: getHeaders() })),

  clearRequestLogs: async (): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/aigw/request-logs`, {
      method: 'DELETE',
      headers: getHeaders(),
    })),

  replayRequestLog: async (id: number | string, payload?: { override?: Record<string, unknown> }): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/aigw/request-logs/${id}/replay`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload || { override: {} }),
    })),

  listBackendUnits: async (): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/aigw/backend-units`, { headers: getHeaders() })),

  createBackendUnit: async (payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/aigw/backend-units`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  updateBackendUnit: async (id: number | string, payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/aigw/backend-units/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  deleteBackendUnit: async (id: number | string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/aigw/backend-units/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    })),

  testBackendUnit: async (id: number | string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/aigw/backend-units/${id}/test`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  listModelAliases: async (): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/aigw/model-aliases`, { headers: getHeaders() })),

  createModelAlias: async (payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/aigw/model-aliases`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  updateModelAlias: async (id: number | string, payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/aigw/model-aliases/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  deleteModelAlias: async (id: number | string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/aigw/model-aliases/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    })),

  listBindings: async (): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/aigw/model-alias-bindings`, { headers: getHeaders() })),

  createBinding: async (payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/aigw/model-alias-bindings`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  updateBinding: async (id: number | string, payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/aigw/model-alias-bindings/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  deleteBinding: async (id: number | string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/aigw/model-alias-bindings/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    })),

  listCapacityPools: async (): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/aigw/capacity-pools`, { headers: getHeaders() })),

  createCapacityPool: async (payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/aigw/capacity-pools`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  updateCapacityPool: async (id: number | string, payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/aigw/capacity-pools/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  deleteCapacityPool: async (id: number | string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/aigw/capacity-pools/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    })),

  listLlmKeys: async (): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/aigw/llm-keys`, { headers: getHeaders() })),

  getLlmKey: async (id: number | string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/aigw/llm-keys/${id}`, { headers: getHeaders() })),

  createLlmKey: async (payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/aigw/llm-keys`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  updateLlmKey: async (id: number | string, payload: any): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/aigw/llm-keys/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  deleteLlmKey: async (id: number | string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/aigw/llm-keys/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    })),

  getTokenStatsSummary: async (params?: Record<string, string>): Promise<any> => {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== '' && value !== undefined && value !== null) query.set(key, String(value));
    });
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return handleResponse(await fetch(`${API_BASE}/api/aigw/token-stats/summary${suffix}`, { headers: getHeaders() }));
  },

  getTokenStatsByProject: async (params?: Record<string, string>): Promise<any> => {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== '' && value !== undefined && value !== null) query.set(key, String(value));
    });
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return handleResponse(await fetch(`${API_BASE}/api/aigw/token-stats/by-project${suffix}`, { headers: getHeaders() }));
  },

  getTokenStatsByTask: async (params?: Record<string, string>): Promise<any> => {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== '' && value !== undefined && value !== null) query.set(key, String(value));
    });
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return handleResponse(await fetch(`${API_BASE}/api/aigw/token-stats/by-task${suffix}`, { headers: getHeaders() }));
  },

  getTokenStatsBySubTask: async (params?: Record<string, string>): Promise<any> => {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== '' && value !== undefined && value !== null) query.set(key, String(value));
    });
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return handleResponse(await fetch(`${API_BASE}/api/aigw/token-stats/by-subtask${suffix}`, { headers: getHeaders() }));
  },

  getTokenStatsTrend: async (params?: Record<string, string | number>): Promise<any> => {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== '' && value !== undefined && value !== null) query.set(key, String(value));
    });
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return handleResponse(await fetch(`${API_BASE}/api/aigw/token-stats/trend${suffix}`, { headers: getHeaders() }));
  },
};
