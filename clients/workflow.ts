
import { API_BASE, handleResponse, getHeaders } from './base';
import { AppTemplate, JobTemplate, WorkflowTemplate, WorkflowInstance, AppWorkflow, AppWorkflowLogs, IngressController, WorkflowInstanceNodeLogListResponse, ServiceAccessInfo, DomainBindingRecord, LlmProviderDetail, LlmProviderSummary, TemplateTag } from '../types/types';

const getWsBase = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
};

export const workflowApi = {
  /**
   * 健康检查
   */
  getHealth: async (): Promise<{ status: string; service: string }> => {
    const response = await fetch(`${API_BASE}/api/workflow/health`, { headers: getHeaders() });
    return handleResponse(response);
  },

  // --- App Templates ---
  listAppTemplates: async (params: { scope?: string; project_id?: string; tag_keys?: string } = {}): Promise<{ items: AppTemplate[]; total: number }> => {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.set(key, String(value));
      }
    });
    const query = queryParams.toString();
    const response = await fetch(`${API_BASE}/api/workflow/app-templates?${query}`, { headers: getHeaders() });
    return handleResponse(response);
  },
  getAppTemplate: async (id: string, projectId?: string): Promise<AppTemplate> => {
    const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : '';
    const response = await fetch(`${API_BASE}/api/workflow/app-templates/${id}${query}`, { headers: getHeaders() });
    return handleResponse(response);
  },
  createAppTemplate: async (payload: any): Promise<AppTemplate> => {
    const response = await fetch(`${API_BASE}/api/workflow/app-templates`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    return handleResponse(response);
  },
  updateAppTemplate: async (id: string, payload: any): Promise<AppTemplate> => {
    const response = await fetch(`${API_BASE}/api/workflow/app-templates/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    return handleResponse(response);
  },
  deleteAppTemplate: async (id: string) => {
    const response = await fetch(`${API_BASE}/api/workflow/app-templates/${id}`, { method: 'DELETE', headers: getHeaders() });
    return handleResponse(response);
  },

  // --- Job Templates ---
  listJobTemplates: async (params: { scope?: string; project_id?: string; tag_keys?: string } = {}): Promise<{ items: JobTemplate[]; total: number }> => {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.set(key, String(value));
      }
    });
    const query = queryParams.toString();
    const response = await fetch(`${API_BASE}/api/workflow/job-templates?${query}`, { headers: getHeaders() });
    return handleResponse(response);
  },
  getJobTemplate: async (id: string, projectId?: string): Promise<JobTemplate> => {
    const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : '';
    const response = await fetch(`${API_BASE}/api/workflow/job-templates/${id}${query}`, { headers: getHeaders() });
    return handleResponse(response);
  },
  createJobTemplate: async (payload: any): Promise<JobTemplate> => {
    const response = await fetch(`${API_BASE}/api/workflow/job-templates`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    return handleResponse(response);
  },
  updateJobTemplate: async (id: string, payload: any): Promise<JobTemplate> => {
    const response = await fetch(`${API_BASE}/api/workflow/job-templates/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    return handleResponse(response);
  },
  deleteJobTemplate: async (id: string) => {
    const response = await fetch(`${API_BASE}/api/workflow/job-templates/${id}`, { method: 'DELETE', headers: getHeaders() });
    return handleResponse(response);
  },

  listTemplateTags: async (params: { category?: string; enabled?: boolean; keyword?: string } = {}): Promise<{ items: TemplateTag[]; total: number }> => {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.set(key, String(value));
      }
    });
    const query = queryParams.toString();
    const response = await fetch(`${API_BASE}/api/workflow/template-tags?${query}`, { headers: getHeaders() });
    return handleResponse(response);
  },
  createTemplateTag: async (payload: Partial<TemplateTag>): Promise<TemplateTag> => {
    const response = await fetch(`${API_BASE}/api/workflow/template-tags`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  // --- Workflow Templates ---
  listWorkflowTemplates: async (params: { scope?: string; project_id?: string } = {}): Promise<{ items: WorkflowTemplate[]; total: number }> => {
    const query = new URLSearchParams(params as any).toString();
    const response = await fetch(`${API_BASE}/api/workflow/workflow-templates?${query}`, { headers: getHeaders() });
    return handleResponse(response);
  },
  getWorkflowTemplate: async (id: string): Promise<WorkflowTemplate> => {
    const response = await fetch(`${API_BASE}/api/workflow/workflow-templates/${id}`, { headers: getHeaders() });
    return handleResponse(response);
  },
  deleteWorkflowTemplate: async (id: string) => {
    const response = await fetch(`${API_BASE}/api/workflow/workflow-templates/${id}`, { method: 'DELETE', headers: getHeaders() });
    return handleResponse(response);
  },

  // --- Workflow Instances ---
  listInstances: async (params: { project_id?: string; status?: string; page?: number; page_size?: number } = {}): Promise<{ item: WorkflowInstance[]; total: number }> => {
    const queryParams = new URLSearchParams();
    if (params.project_id) queryParams.set('project_id', params.project_id);
    if (params.status) queryParams.set('status', params.status);
    if (params.page) queryParams.set('page', String(params.page));
    if (params.page_size) queryParams.set('page_size', String(params.page_size));
    const query = queryParams.toString();
    const response = await fetch(`${API_BASE}/api/workflow/workflow-instances?${query}`, { headers: getHeaders() });
    return handleResponse(response);
  },
  getInstance: async (id: string): Promise<WorkflowInstance> => {
    const response = await fetch(`${API_BASE}/api/workflow/workflow-instances/${id}`, { headers: getHeaders() });
    return handleResponse(response);
  },
  createInstance: async (payload: any): Promise<WorkflowInstance> => {
    const response = await fetch(`${API_BASE}/api/workflow/workflow-instances`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    return handleResponse(response);
  },
  updateInstance: async (id: string, payload: any): Promise<WorkflowInstance> => {
    const response = await fetch(`${API_BASE}/api/workflow/workflow-instances/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    return handleResponse(response);
  },
  initializeInstance: async (id: string, force: boolean = false) => {
    const response = await fetch(`${API_BASE}/api/workflow/workflow-instances/${id}/initialize`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ force })
    });
    return handleResponse(response);
  },
  uninitializeInstance: async (id: string) => {
    const response = await fetch(`${API_BASE}/api/workflow/workflow-instances/${id}/uninitialize`, { method: 'POST', headers: getHeaders() });
    return handleResponse(response);
  },
  startInstance: async (id: string) => {
    const response = await fetch(`${API_BASE}/api/workflow/workflow-instances/${id}/start`, { method: 'POST', headers: getHeaders() });
    return handleResponse(response);
  },
  stopInstance: async (id: string) => {
    const response = await fetch(`${API_BASE}/api/workflow/workflow-instances/${id}/stop`, { method: 'POST', headers: getHeaders() });
    return handleResponse(response);
  },
  syncInstanceStatus: async (id: string) => {
    const response = await fetch(`${API_BASE}/api/workflow/workflow-instances/${id}/sync-status`, { method: 'POST', headers: getHeaders() });
    return handleResponse(response);
  },
  activateInstance: async (id: string) => {
    const response = await fetch(`${API_BASE}/api/workflow/workflow-instances/${id}/activate`, { method: 'POST', headers: getHeaders() });
    return handleResponse(response);
  },
  deactivateInstance: async (id: string) => {
    const response = await fetch(`${API_BASE}/api/workflow/workflow-instances/${id}/deactivate`, { method: 'POST', headers: getHeaders() });
    return handleResponse(response);
  },
  deleteInstance: async (id: string) => {
    const response = await fetch(`${API_BASE}/api/workflow/workflow-instances/${id}`, { method: 'DELETE', headers: getHeaders() });
    return handleResponse(response);
  },
  triggerInstance: async (id: string) => {
    const response = await fetch(`${API_BASE}/api/workflow/workflow-instances/${id}/trigger`, { method: 'POST', headers: getHeaders() });
    return handleResponse(response);
  },
  // --- Workflow Nodes & Edges ---
  createNode: async (instanceId: string, payload: any) => {
    const response = await fetch(`${API_BASE}/api/workflow/workflow-instances/${instanceId}/nodes`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    return handleResponse(response);
  },
  listNodes: async (instanceId: string) => {
    const response = await fetch(`${API_BASE}/api/workflow/workflow-instances/${instanceId}/nodes`, { headers: getHeaders() });
    return handleResponse(response);
  },
  getNode: async (instanceId: string, nodeId: string) => {
    const response = await fetch(`${API_BASE}/api/workflow/workflow-instances/${instanceId}/nodes/${nodeId}`, { headers: getHeaders() });
    return handleResponse(response);
  },
  getNodeAccessInfo: async (instanceId: string, nodeId: string) => {
    const response = await fetch(
      `${API_BASE}/api/workflow/workflow-instances/${instanceId}/nodes/${nodeId}/access-info`,
      { headers: getHeaders() }
    );
    return handleResponse(response);
  },
  updateNode: async (instanceId: string, nodeId: string, payload: any) => {
    const response = await fetch(`${API_BASE}/api/workflow/workflow-instances/${instanceId}/nodes/${nodeId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    return handleResponse(response);
  },
  deleteNode: async (instanceId: string, nodeId: string) => {
    const response = await fetch(`${API_BASE}/api/workflow/workflow-instances/${instanceId}/nodes/${nodeId}`, { method: 'DELETE', headers: getHeaders() });
    return handleResponse(response);
  },
  updateEdge: async (instanceId: string, payload: any) => {
    const response = await fetch(`${API_BASE}/api/workflow/workflow-instances/${instanceId}/edges`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    return handleResponse(response);
  },
  getNodeLogs: async (instanceId: string, nodeId: string, params: { tail_lines?: number; container?: string; previous?: boolean; timestamp?: boolean } = {}): Promise<{ logs: string }> => {
    const query = new URLSearchParams(params as any).toString();
    const response = await fetch(`${API_BASE}/api/workflow/workflow-instances/${instanceId}/nodes/${nodeId}/logs?${query}`, { headers: getHeaders() });
    return handleResponse(response);
  },
  getInstanceNodeLogs: async (
    instanceId: string,
    params: { node_id?: string; page?: number; page_size?: number } = {}
  ): Promise<WorkflowInstanceNodeLogListResponse> => {
    const queryParams = new URLSearchParams();
    if (params.node_id) queryParams.set('node_id', params.node_id);
    if (params.page) queryParams.set('page', String(params.page));
    if (params.page_size) queryParams.set('page_size', String(params.page_size));
    const query = queryParams.toString();
    const response = await fetch(`${API_BASE}/api/workflow/workflow-instances/${instanceId}/logs?${query}`, { headers: getHeaders() });
    return handleResponse(response);
  },

  // --- Ingress Controllers ---
  getIngressControllers: async (): Promise<{ controllers: IngressController[] }> => {
    const response = await fetch(`${API_BASE}/api/workflow/app-workflows/ingress-controllers`, {
      headers: getHeaders()
    });
    return handleResponse(response);
  },
  getNginxIngressIps: async (): Promise<{ items: IngressController[]; total: number }> => {
    const response = await fetch(`${API_BASE}/api/workflow/workflow-instances/ingress-nginx-ips`, {
      headers: getHeaders()
    });
    return handleResponse(response);
  },

  // --- App Workflows ---
  listAppWorkflowLlmProviders: async (): Promise<{ items: LlmProviderSummary[]; total: number; default_provider_key?: string | null }> => {
    const response = await fetch(`${API_BASE}/api/workflow/app-workflows/llm-providers`, { headers: getHeaders() });
    return handleResponse(response);
  },
  getAppWorkflowLlmProvider: async (providerKey: string): Promise<LlmProviderDetail> => {
    const response = await fetch(`${API_BASE}/api/workflow/app-workflows/llm-providers/${encodeURIComponent(providerKey)}`, { headers: getHeaders() });
    return handleResponse(response);
  },
  listAppWorkflows: async (params: { project_id?: string; status?: string } = {}): Promise<{ items: AppWorkflow[]; total: number }> => {
    const queryParams = new URLSearchParams();
    if (params.project_id) queryParams.set('project_id', params.project_id);
    if (params.status) queryParams.set('status', params.status);
    const query = queryParams.toString();
    const response = await fetch(`${API_BASE}/api/workflow/app-workflows?${query}`, { headers: getHeaders() });
    return handleResponse(response);
  },
  getAppWorkflow: async (id: string): Promise<AppWorkflow> => {
    const response = await fetch(`${API_BASE}/api/workflow/app-workflows/${id}`, { headers: getHeaders() });
    return handleResponse(response);
  },
  createAppWorkflow: async (payload: any): Promise<AppWorkflow> => {
    const response = await fetch(`${API_BASE}/api/workflow/app-workflows`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    return handleResponse(response);
  },
  updateAppWorkflow: async (id: string, payload: any): Promise<AppWorkflow> => {
    const response = await fetch(`${API_BASE}/api/workflow/app-workflows/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    return handleResponse(response);
  },
  initializeAppWorkflow: async (id: string, force: boolean = false): Promise<any> => {
    const response = await fetch(`${API_BASE}/api/workflow/app-workflows/${id}/initialize?force=${force}`, {
      method: 'POST',
      headers: getHeaders()
    });
    return handleResponse(response);
  },
  uninitializeAppWorkflow: async (id: string): Promise<any> => {
    const response = await fetch(`${API_BASE}/api/workflow/app-workflows/${id}/uninitialize`, {
      method: 'POST',
      headers: getHeaders()
    });
    return handleResponse(response);
  },
  startAppWorkflow: async (id: string): Promise<any> => {
    const response = await fetch(`${API_BASE}/api/workflow/app-workflows/${id}/start`, {
      method: 'POST',
      headers: getHeaders()
    });
    return handleResponse(response);
  },
  stopAppWorkflow: async (id: string): Promise<any> => {
    const response = await fetch(`${API_BASE}/api/workflow/app-workflows/${id}/stop`, {
      method: 'POST',
      headers: getHeaders()
    });
    return handleResponse(response);
  },
  syncAppWorkflowStatus: async (id: string): Promise<any> => {
    const response = await fetch(`${API_BASE}/api/workflow/app-workflows/${id}/sync-status`, {
      method: 'POST',
      headers: getHeaders()
    });
    return handleResponse(response);
  },
  deleteAppWorkflow: async (id: string): Promise<any> => {
    const response = await fetch(`${API_BASE}/api/workflow/app-workflows/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    return handleResponse(response);
  },
  getAppWorkflowLogs: async (id: string): Promise<AppWorkflowLogs> => {
    const response = await fetch(`${API_BASE}/api/workflow/app-workflows/${id}/logs`, { headers: getHeaders() });
    return handleResponse(response);
  },
  getAppWorkflowAccessInfo: async (id: string): Promise<ServiceAccessInfo> => {
    const response = await fetch(`${API_BASE}/api/workflow/app-workflows/${id}/access-info`, { headers: getHeaders() });
    return handleResponse(response);
  },
  listAppWorkflowDomainBindings: async (id: string): Promise<DomainBindingRecord[]> => {
    const response = await fetch(`${API_BASE}/api/workflow/app-workflows/${id}/domain-bindings`, { headers: getHeaders() });
    return handleResponse(response);
  },
  bindAppWorkflowIngress: async (id: string, payload: {
    create_ingress?: boolean;
    ingress_type: string;
    ingress_host: string;
    ingress_ip: string;
    path?: string;
    path_type?: string;
  }): Promise<AppWorkflow> => {
    const response = await fetch(`${API_BASE}/api/workflow/app-workflows/${id}/ingress-binding`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    return handleResponse(response);
  },
  createTerminalProxyConnection: (
    projectId: string,
    podName: string,
    containerName?: string,
    command: string = '/bin/bash'
  ): WebSocket => {
    const token = localStorage.getItem('secflow_token');
    const params = new URLSearchParams({ project_id: projectId, command });
    if (containerName) params.append('container', containerName);
    if (token) params.append('token', token);
    const wsUrl = `${getWsBase()}/api/workflow/ws/pods/${encodeURIComponent(podName)}/exec?${params.toString()}`;
    return new WebSocket(wsUrl);
  }
};
