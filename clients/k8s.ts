import { API_BASE, getHeaders, handleResponse } from './base';

const getWsBase = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${API_BASE.replace(/^https?:\/\//, '')}`;
};

export const k8sApi = {
  getPods: async (projectId: string, labelSelector?: string): Promise<{ total: number; items: any[] }> => {
    const params = new URLSearchParams({ project_id: projectId });
    if (labelSelector) params.append('label_selector', labelSelector);
    const response = await fetch(`${API_BASE}/api/k8s/pods?${params.toString()}`, { headers: getHeaders() });
    return handleResponse(response);
  },

  getPodStatus: async (projectId: string, podName: string): Promise<any> => {
    const response = await fetch(
      `${API_BASE}/api/k8s/pods/${encodeURIComponent(podName)}/status?project_id=${encodeURIComponent(projectId)}`,
      { headers: getHeaders() }
    );
    return handleResponse(response);
  },

  getPodEvents: async (projectId: string, podName: string): Promise<any> => {
    const response = await fetch(
      `${API_BASE}/api/k8s/pods/${encodeURIComponent(podName)}/events?project_id=${encodeURIComponent(projectId)}`,
      { headers: getHeaders() }
    );
    return handleResponse(response);
  },

  getPodMetrics: async (projectId: string, podName: string): Promise<any> => {
    const response = await fetch(
      `${API_BASE}/api/k8s/pods/${encodeURIComponent(podName)}/metrics?project_id=${encodeURIComponent(projectId)}`,
      { headers: getHeaders() }
    );
    return handleResponse(response);
  },

  restartDeployment: async (projectId: string, deploymentName: string): Promise<any> => {
    const response = await fetch(
      `${API_BASE}/api/k8s/deployments/${encodeURIComponent(deploymentName)}/restart?project_id=${encodeURIComponent(projectId)}`,
      { method: 'POST', headers: getHeaders() }
    );
    return handleResponse(response);
  },

  recreateJob: async (projectId: string, jobName: string): Promise<any> => {
    const response = await fetch(
      `${API_BASE}/api/k8s/jobs/${encodeURIComponent(jobName)}/recreate?project_id=${encodeURIComponent(projectId)}`,
      { method: 'POST', headers: getHeaders() }
    );
    return handleResponse(response);
  },

  getServiceAccess: async (projectId: string, serviceName: string): Promise<any> => {
    const response = await fetch(
      `${API_BASE}/api/k8s/services/${encodeURIComponent(serviceName)}/access?project_id=${encodeURIComponent(projectId)}`,
      { headers: getHeaders() }
    );
    return handleResponse(response);
  },

  proxyServiceUrl: (projectId: string, serviceName: string, port: number, path = ''): string => {
    const normalizedPath = path.replace(/^\/+/, '');
    const token = localStorage.getItem('chimera_token') || '';
    const qs = new URLSearchParams({ project_id: projectId });
    if (token) qs.append('token', token);
    return `${API_BASE}/api/k8s/services/${encodeURIComponent(serviceName)}/proxy/${port}/${normalizedPath}?${qs.toString()}`;
  },

  createTerminalConnection: (projectId: string, podName: string, containerName?: string): WebSocket => {
    const token = localStorage.getItem('chimera_token');
    const params = new URLSearchParams({ project_id: projectId });
    if (containerName) params.append('container', containerName);
    if (token) params.append('token', token);
    const wsUrl = `${getWsBase()}/api/k8s/ws/pods/${encodeURIComponent(podName)}/exec?${params.toString()}`;
    return new WebSocket(wsUrl);
  }
};
