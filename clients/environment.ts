import { API_BASE, handleResponse, getHeaders, xhrUpload, XhrUploadProgress, fetchWithRetry } from './base';
import { Agent, AgentStats, EnvTemplate, AsyncTask, TaskLog, AgentService, Workspace, DaemonServicesResponse, DaemonServiceLogs, AgentTtydConnectionInfo, AgentIngressRouteInfo, AiHelperService, AiHelperRuntimeEnv, AiAgentItem, AiAgentSession, AiBatchSession, AiBatchRound, AiBatchSessionSummary, ProjectAiAgentItem, AiAgentLlmProviderSummary, AiAgentLlmProviderDetail, AiAgentLlmApplyResult, AiAgentLlmBatchApplyResult, TemplateLlmProviderSummary, TemplateLlmProviderDetail, TemplateLlmBindingPreview, TemplateLlmProviderBinding, TemplateComposeSourceInfo, AiSessionStreamEvent, AiBatchStreamEvent, ProjectAiAgentSessionGlobalListResponse, ProjectAiAgentSessionBatchTerminateResult, ProjectAiAgentSessionTerminateTarget, AgentStatusEvent, AgentDiagnostics } from '../types/types';
import { trackUploadTask } from '../services/uploadCenter';

const normalizeTask = (raw: any): AsyncTask => ({
  id: raw?.id || raw?.task_id || '',
  type: raw?.type || raw?.task_type || '',
  status: raw?.status || 'pending',
  service_name: raw?.service_name || '',
  progress: typeof raw?.progress === 'number' ? raw.progress : Number(raw?.progress || 0),
  create_time: raw?.create_time || raw?.created_at || '',
  agent_key: raw?.agent_key || '',
  project_id: raw?.project_id || '',
  message: raw?.message || '',
  created_at: raw?.created_at || raw?.create_time || '',
  started_at: raw?.started_at || '',
  completed_at: raw?.completed_at || '',
  log_count: typeof raw?.log_count === 'number' ? raw.log_count : Number(raw?.log_count || 0),
});

const normalizeTaskLog = (raw: any): TaskLog => ({
  timestamp: raw?.timestamp || '',
  level: raw?.level || 'INFO',
  message: raw?.message || '',
});

const parseSseChunk = (rawChunk: string): any[] => {
  return rawChunk
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const dataLines = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim());
      const data = dataLines.join('\n');
      if (!data || data === '[DONE]') return null;
      try {
        return JSON.parse(data);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
};

export interface TemplateUploadProgress {
  loaded_bytes: number;
  total_bytes: number;
  speed_bytes_per_sec: number;
  elapsed_ms: number;
}

const toUploadProgress = (event: XhrUploadProgress): TemplateUploadProgress => ({
  loaded_bytes: event.loaded_bytes,
  total_bytes: event.total_bytes,
  speed_bytes_per_sec: event.speed_bytes_per_sec,
  elapsed_ms: event.elapsed_ms,
});

export const environmentApi = {
  // Global Health Check
  getHealth: async (): Promise<{ status: string }> => {
    const response = await fetch(`${API_BASE}/api/agent/health`, { headers: getHeaders() });
    return handleResponse(response);
  },

  // System Config
  getExternalIps: async (): Promise<{ external_agent_ips: string[]; count: number }> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/system/external-agent-ips`, { headers: getHeaders() })),

  // Workspaces
  getWorkspaces: async (): Promise<{ workspaces: Workspace[] }> => 
    handleResponse(await fetch(`${API_BASE}/api/agent/workspace`, { headers: getHeaders() })),

  // Agents
  getAgents: async (
    projectId: string,
    params: { page?: number; per_page?: number; workspace_id?: string } = {}
  ): Promise<{ agents: Agent[]; total: number; page?: number; per_page?: number }> => {
    const query = new URLSearchParams({ ...params as any, project_id: projectId }).toString();
    return handleResponse(await fetch(`${API_BASE}/api/agent/agents?${query}`, { headers: getHeaders() }));
  },
  getAgentStats: async (projectId: string): Promise<AgentStats> => 
    handleResponse(await fetch(`${API_BASE}/api/agent/agents/stats?project_id=${projectId}`, { headers: getHeaders() })),
  getAgentDetail: async (key: string, projectId: string): Promise<Agent> => 
    handleResponse(await fetch(`${API_BASE}/api/agent/agents/${key}?project_id=${projectId}`, { headers: getHeaders() })),
  getAgentDiagnostics: async (
    key: string,
    projectId: string
  ): Promise<AgentDiagnostics> =>
    handleResponse(await fetch(
      `${API_BASE}/api/agent/agents/${encodeURIComponent(key)}/diagnostics?project_id=${encodeURIComponent(projectId)}`,
      { headers: getHeaders() }
    )),
  getAgentStatusHistory: async (
    key: string,
    projectId: string,
    limit = 100
  ): Promise<{ project_id: string; agent_key: string; limit: number; total: number; items: AgentStatusEvent[] }> =>
    handleResponse(await fetch(
      `${API_BASE}/api/agent/agents/${encodeURIComponent(key)}/status-history?project_id=${encodeURIComponent(projectId)}&limit=${Math.max(1, Math.min(limit, 100))}`,
      { headers: getHeaders() }
    )),
  clearAgentStatusHistory: async (
    key: string,
    projectId: string
  ): Promise<{ project_id: string; agent_key: string; deleted: number; message: string }> =>
    handleResponse(await fetch(
      `${API_BASE}/api/agent/agents/${encodeURIComponent(key)}/status-history?project_id=${encodeURIComponent(projectId)}`,
      { method: 'DELETE', headers: getHeaders() }
    )),
  cleanupAgents: async (projectId: string, dryRun = false, cleanupK8sResources = true, force = false): Promise<any> => 
    handleResponse(await fetch(`${API_BASE}/api/agent/agents/cleanup`, { 
      method: 'POST', 
      headers: getHeaders(), 
      body: JSON.stringify({ project_id: projectId, dry_run: dryRun, cleanup_k8s_resources: cleanupK8sResources, force }) 
    })),
  refreshAgents: async () => 
    handleResponse(await fetch(`${API_BASE}/api/agent/agents/refresh`, { method: 'POST', headers: getHeaders() })),

  // Templates (Global, no project_id)
  getTemplates: async (page = 1, perPage = 20): Promise<{ templates: EnvTemplate[]; total: number }> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/templates?page=${page}&per_page=${perPage}`, { headers: getHeaders() })),
  getTemplateDetail: async (templateId: number): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/templates/id/${templateId}`, { headers: getHeaders() })),
  getTemplateByName: async (name: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/templates/by-name/${encodeURIComponent(name)}`, { headers: getHeaders() })),
  updateTemplateBasic: async (
    templateId: number,
    data: {
      name?: string;
      description?: string;
      visibility?: 'shared' | 'private';
      tags?: string[];
      web_port_presets?: Array<{
        name?: string;
        port: number;
        protocol?: 'http' | 'https';
        backend_protocol?: 'http' | 'https';
        description?: string;
        path?: string;
        websocket_enabled?: boolean;
        tls_enabled?: boolean;
        ingress_tls_enabled?: boolean;
      }>;
    }
  ): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/templates/id/${templateId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data)
    })),
  getTemplateWebPorts: async (templateId: number): Promise<{
    template_id: number;
    template_name: string;
    web_port_presets: Array<{
      name?: string;
      port: number;
      protocol?: 'http' | 'https';
      backend_protocol?: 'http' | 'https';
      description?: string;
      path?: string;
      websocket_enabled?: boolean;
      tls_enabled?: boolean;
      ingress_tls_enabled?: boolean;
    }>;
    permissions?: { can_manage?: boolean };
  }> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/templates/id/${templateId}/web-ports`, { headers: getHeaders() })),
  updateTemplateWebPorts: async (
    templateId: number,
    webPortPresets: Array<{
      name?: string;
      port: number;
      protocol?: 'http' | 'https';
      backend_protocol?: 'http' | 'https';
      description?: string;
      path?: string;
      websocket_enabled?: boolean;
      tls_enabled?: boolean;
      ingress_tls_enabled?: boolean;
    }>
  ): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/templates/id/${templateId}/web-ports`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ web_port_presets: webPortPresets })
    })),
  listTemplateLlmProviders: async (projectId = ''): Promise<{ project_id: string; default_provider_key?: string | null; items: TemplateLlmProviderSummary[]; total: number }> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/templates/llm-providers${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''}`, { headers: getHeaders() })),
  getTemplateLlmProvider: async (projectId: string, providerKey: string): Promise<TemplateLlmProviderDetail> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/templates/llm-providers/${encodeURIComponent(providerKey)}${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''}`, { headers: getHeaders() })),
  previewTemplateLlmBinding: async (
    projectId: string,
    providerKeys: string[],
    targetServices: '*' | string[] = '*',
  ): Promise<TemplateLlmBindingPreview> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/templates/llm-providers/preview`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ project_id: projectId, provider_keys: providerKeys, target_services: targetServices }),
    })),
  regenerateTemplateWithLlmProviders: async (
    templateId: number,
    binding: TemplateLlmProviderBinding,
  ): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/templates/id/${templateId}/regenerate-with-llm-providers`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(binding),
    })),
  restoreTemplateOriginalCompose: async (templateId: number): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/templates/id/${templateId}/restore-original-compose`, {
      method: 'POST',
      headers: getHeaders(),
    })),
  getTemplateComposeSource: async (templateId: number): Promise<TemplateComposeSourceInfo> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/templates/id/${templateId}/compose-source`, {
      headers: getHeaders(),
    })),
  getTemplateFiles: async (templateId: number, path = ''): Promise<{ files: any[] }> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/templates/id/${templateId}/files?path=${path}`, { headers: getHeaders() })),
  
  getTemplateFileContent: async (templateId: number, filePath: string): Promise<{ content: string }> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/templates/id/${templateId}/files/content?path=${encodeURIComponent(filePath)}`, { headers: getHeaders() })),
  
  updateTemplateFileContent: async (templateId: number, filePath: string, content: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/templates/id/${templateId}/files/content`, {
      method: 'PUT', 
      headers: getHeaders(), 
      body: JSON.stringify({ path: filePath, content }) 
    })),

  deleteTemplateFile: async (templateId: number, filePath: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/templates/id/${templateId}/files`, {
      method: 'DELETE',
      headers: getHeaders(),
      body: JSON.stringify({ path: filePath })
    })),

  deleteTemplateDirectory: async (templateId: number, dirPath: string, force = false): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/templates/id/${templateId}/directories`, {
      method: 'DELETE',
      headers: getHeaders(),
      body: JSON.stringify({ path: dirPath, force })
    })),

  deleteTemplate: async (templateId: number) =>
    handleResponse(await fetch(`${API_BASE}/api/agent/templates/id/${templateId}`, { method: 'DELETE', headers: getHeaders() })),

  batchDeleteTemplates: async (templateIds: number[]) => {
    return Promise.all(templateIds.map(id => environmentApi.deleteTemplate(id)));
  },
  
  uploadTemplate: async (formData: FormData, options?: {
    onProgress?: (progress: TemplateUploadProgress) => void;
    signal?: AbortSignal;
    trackGlobal?: boolean;
    sourceLabel?: string;
  }) => {
    const headers = getHeaders();
    const uploadHeaders: Record<string, string> = { ...headers };
    delete uploadHeaders['Content-Type'];
    const file = formData.get('file');
    const fileName = file instanceof File ? file.name : 'template-file';
    const fileSize = file instanceof File ? file.size : 0;

    const execute = (params?: { signal?: AbortSignal; onProgress?: (progress: TemplateUploadProgress) => void }) => xhrUpload<any>({
      url: `${API_BASE}/api/agent/templates`,
      method: 'POST',
      headers: uploadHeaders,
      formData,
      signal: params?.signal ?? options?.signal,
      onProgress: (event) => {
        const progress = toUploadProgress(event);
        options?.onProgress?.(progress);
        params?.onProgress?.(progress);
      },
    });
    if (options?.trackGlobal === false) return execute();
    return trackUploadTask({
      source: options?.sourceLabel || '环境模板上传',
      name: fileName,
      size: fileSize,
      run: ({ signal, onProgress }) => execute({ signal, onProgress }),
    });
  },

  copyTemplate: async (
    sourceTemplateId: number,
    data: { target_name: string; visibility?: 'shared' | 'private'; description?: string }
  ): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/templates/id/${sourceTemplateId}/copy`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data)
    })),

  getParsedCompose: async (templateId: number): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/templates/id/${templateId}/parsed`, { headers: getHeaders() })),

  triggerParse: async (templateId: number): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/templates/id/${templateId}/parse`, {
      method: 'POST',
      headers: getHeaders()
    })),

  // Tasks
  getTasks: async (projectId: string, params: { type?: string; status?: string; agent_key?: string } = {}): Promise<{ task: AsyncTask[]; total: number }> => {
    const query = new URLSearchParams({ ...params as any, project_id: projectId }).toString();
    const raw = await handleResponse(await fetch(`${API_BASE}/api/agent/task?${query}`, { headers: getHeaders() }));
    const list = (raw?.task || raw?.tasks || raw?.secflow_agent_tasks || []).map((item: any) => normalizeTask(item));
    return {
      ...raw,
      task: list,
      tasks: list,
      total: raw?.total || list.length,
    };
  },
  getTaskDetail: async (id: string, projectId: string): Promise<AsyncTask> => 
    normalizeTask(await handleResponse(await fetch(`${API_BASE}/api/agent/task/${id}?project_id=${projectId}`, { headers: getHeaders() }))),
  getTaskLogs: async (id: string, projectId: string, page = 1): Promise<{ log: TaskLog[]; total: number }> => 
    (async () => {
      const raw = await handleResponse(await fetch(`${API_BASE}/api/agent/task/${id}/logs?page=${page}&project_id=${projectId}`, { headers: getHeaders() }));
      const list = (raw?.log || raw?.logs || []).map((item: any) => normalizeTaskLog(item));
      return {
        ...raw,
        log: list,
        logs: list,
        total: raw?.total || list.length,
      };
    })(),
  deploy: async (data: { service_name: string; agent_key: string; template_name: string; project_id: string; extra_params?: any }) => 
    handleResponse(await fetch(`${API_BASE}/api/agent/task/deploy`, { 
      method: 'POST', 
      headers: getHeaders(), 
      body: JSON.stringify(data) 
    })),
  deployBatch: async (data: { project_id: string; deployments: Array<{ service_name: string; agent_key: string; template_name: string; extra_params?: any }> }) =>
    handleResponse(await fetch(`${API_BASE}/api/agent/task/deploy/batch`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data)
    })),
  undeploy: async (data: { service_name: string; agent_key: string; project_id: string }) => 
    handleResponse(await fetch(`${API_BASE}/api/agent/task/undeploy`, { 
      method: 'POST', 
      headers: getHeaders(), 
      body: JSON.stringify(data) 
    })),
  deleteTask: async (id: string, projectId: string) => 
    handleResponse(await fetch(`${API_BASE}/api/agent/task/${id}?project_id=${projectId}`, { 
      method: 'DELETE', 
      headers: getHeaders() 
    })),
  clearTasks: async (projectId: string) =>
    handleResponse(await fetch(`${API_BASE}/api/agent/task?project_id=${projectId}`, {
      method: 'DELETE',
      headers: getHeaders()
    })),

  getGlobalServices: async (
    projectId: string,
    params: { page?: number; per_page?: number; status?: string; q?: string; agent_key?: string; include_stale?: boolean } = {}
  ): Promise<{ items: AgentService[]; total: number; page: number; per_page: number; project_id: string }> => {
    const query = new URLSearchParams({
      ...params as any,
      project_id: projectId,
      include_stale: params.include_stale ? 'true' : 'false'
    }).toString();
    return handleResponse(await fetch(`${API_BASE}/api/agent/services/global?${query}`, { headers: getHeaders() }));
  },
  cleanupOfflineGlobalServices: async (projectId: string, dryRun = false): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/services/global/cleanup-offline`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ project_id: projectId, dry_run: dryRun })
    })),
  getGlobalIngress: async (
    projectId: string,
    params: { include_deleted?: boolean } = {}
  ): Promise<{ project_id: string; items: any[]; stats: any }> => {
    const query = new URLSearchParams({
      project_id: projectId,
      include_deleted: params.include_deleted ? 'true' : 'false'
    }).toString();
    return handleResponse(await fetch(`${API_BASE}/api/agent/services/global/ingress?${query}`, { headers: getHeaders() }));
  },

  listAiHelpers: async (
    projectId: string,
    params: { agent_key?: string; health_status?: string } = {}
  ): Promise<{ project_id: string; items: AiHelperService[]; total: number }> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/ai-helpers?${new URLSearchParams({ project_id: projectId, ...(params as any) }).toString()}`, { headers: getHeaders() })),

  listProjectAiAgents: async (
    projectId: string,
    params: { agent_key?: string; health_status?: string; backend_type?: string; installed?: boolean } = {}
  ): Promise<{ project_id: string; items: ProjectAiAgentItem[]; total: number }> => {
    const query = new URLSearchParams({
      project_id: projectId,
      ...(params.agent_key ? { agent_key: params.agent_key } : {}),
      ...(params.health_status ? { health_status: params.health_status } : {}),
      ...(params.backend_type ? { backend_type: params.backend_type } : {}),
      ...(typeof params.installed === 'boolean' ? { installed: params.installed ? 'true' : 'false' } : {}),
    }).toString();
    return handleResponse(await fetch(`${API_BASE}/api/agent/ai-agents?${query}`, { headers: getHeaders() }));
  },

  listAiAgentLlmProviders: async (projectId = ''): Promise<{ project_id: string; default_provider_key?: string | null; items: AiAgentLlmProviderSummary[]; total: number }> =>
    handleResponse(await fetchWithRetry(`${API_BASE}/api/agent/ai-agents/llm-providers${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''}`, { headers: getHeaders() }, { retries: 2, retryDelayMs: 350 })),

  getAiAgentLlmProvider: async (projectId: string, providerKey: string, backendType?: string): Promise<AiAgentLlmProviderDetail> => {
    const query = new URLSearchParams({
      ...(projectId ? { project_id: projectId } : {}),
      ...(backendType ? { backend_type: backendType } : {}),
    }).toString();
    return handleResponse(await fetchWithRetry(`${API_BASE}/api/agent/ai-agents/llm-providers/${encodeURIComponent(providerKey)}?${query}`, { headers: getHeaders() }, { retries: 2, retryDelayMs: 350 }));
  },

  applyAiAgentLlmProvider: async (
    projectId: string,
    agentKey: string,
    serviceName: string,
    agentId: string,
    providerKey: string,
    refresh = false,
  ): Promise<AiAgentLlmApplyResult> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/ai-agents/${encodeURIComponent(agentKey)}/${encodeURIComponent(serviceName)}/${encodeURIComponent(agentId)}/apply-llm-provider`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ project_id: projectId, provider_key: providerKey, refresh }),
    })),

  batchApplyAiAgentLlmProvider: async (
    projectId: string,
    providerKey: string,
    targets: Array<{ agent_key: string; service_name: string; agent_id: string }>,
    refresh = false,
  ): Promise<AiAgentLlmBatchApplyResult> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/ai-agents/apply-llm-provider/batch`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ project_id: projectId, provider_key: providerKey, targets, refresh }),
    })),

  getAiHelperDetail: async (projectId: string, agentKey: string, serviceName: string): Promise<AiHelperService> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/ai-helpers/${encodeURIComponent(agentKey)}/${encodeURIComponent(serviceName)}?project_id=${encodeURIComponent(projectId)}`, { headers: getHeaders() })),

  listAiHelperAgents: async (projectId: string, agentKey: string, serviceName: string): Promise<{ default_agent_id?: string; items: AiAgentItem[]; total: number }> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/ai-helpers/${encodeURIComponent(agentKey)}/${encodeURIComponent(serviceName)}/agents?project_id=${encodeURIComponent(projectId)}`, { headers: getHeaders() })),

  createAiHelperAgent: async (projectId: string, agentKey: string, serviceName: string, payload: any): Promise<AiAgentItem> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/ai-helpers/${encodeURIComponent(agentKey)}/${encodeURIComponent(serviceName)}/agents?project_id=${encodeURIComponent(projectId)}`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(payload) })),

  updateAiHelperAgent: async (projectId: string, agentKey: string, serviceName: string, agentId: string, payload: any): Promise<AiAgentItem> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/ai-helpers/${encodeURIComponent(agentKey)}/${encodeURIComponent(serviceName)}/agents/${encodeURIComponent(agentId)}?project_id=${encodeURIComponent(projectId)}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(payload) })),

  deleteAiHelperAgent: async (projectId: string, agentKey: string, serviceName: string, agentId: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/ai-helpers/${encodeURIComponent(agentKey)}/${encodeURIComponent(serviceName)}/agents/${encodeURIComponent(agentId)}?project_id=${encodeURIComponent(projectId)}`, { method: 'DELETE', headers: getHeaders(), body: JSON.stringify({ project_id: projectId }) })),

  runAiHelperAgentAction: async (projectId: string, agentKey: string, serviceName: string, agentId: string, action: 'activate' | 'start' | 'stop'): Promise<AiAgentItem> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/ai-helpers/${encodeURIComponent(agentKey)}/${encodeURIComponent(serviceName)}/agents/${encodeURIComponent(agentId)}/${action}?project_id=${encodeURIComponent(projectId)}`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ project_id: projectId }) })),

  getAiHelperAgentEnv: async (projectId: string, agentKey: string, serviceName: string, agentId: string): Promise<{ name: string; env: Record<string, string> }> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/ai-helpers/${encodeURIComponent(agentKey)}/${encodeURIComponent(serviceName)}/agents/${encodeURIComponent(agentId)}/env?project_id=${encodeURIComponent(projectId)}`, { headers: getHeaders() })),

  getAiHelperRuntimeEnv: async (projectId: string, agentKey: string, serviceName: string): Promise<AiHelperRuntimeEnv> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/ai-helpers/${encodeURIComponent(agentKey)}/${encodeURIComponent(serviceName)}/helper-env?project_id=${encodeURIComponent(projectId)}`, { headers: getHeaders() })),

  replaceAiHelperAgentEnv: async (projectId: string, agentKey: string, serviceName: string, agentId: string, env: Record<string, string>): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/ai-helpers/${encodeURIComponent(agentKey)}/${encodeURIComponent(serviceName)}/agents/${encodeURIComponent(agentId)}/env?project_id=${encodeURIComponent(projectId)}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify({ project_id: projectId, env }) })),

  deleteAiHelperAgentEnvKeys: async (projectId: string, agentKey: string, serviceName: string, agentId: string, keys: string[]): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/ai-helpers/${encodeURIComponent(agentKey)}/${encodeURIComponent(serviceName)}/agents/${encodeURIComponent(agentId)}/env?project_id=${encodeURIComponent(projectId)}`, { method: 'DELETE', headers: getHeaders(), body: JSON.stringify({ project_id: projectId, keys }) })),

  listAiHelperSessions: async (projectId: string, agentKey: string, serviceName: string): Promise<{ items: AiAgentSession[]; total: number }> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/ai-helpers/${encodeURIComponent(agentKey)}/${encodeURIComponent(serviceName)}/sessions?project_id=${encodeURIComponent(projectId)}`, { headers: getHeaders() })),

  listProjectAiAgentSessions: async (
    projectId: string,
    params: {
      page?: number;
      per_page?: number;
      q?: string;
      node?: string;
      service_name?: string;
      status?: string;
      invalid_filter?: 'all' | 'invalid' | 'normal';
      invalid_reason?: string;
    } = {}
  ): Promise<ProjectAiAgentSessionGlobalListResponse> => {
    const query = new URLSearchParams({
      project_id: projectId,
      ...(params.page ? { page: String(params.page) } : {}),
      ...(params.per_page ? { per_page: String(params.per_page) } : {}),
      ...(params.q ? { q: params.q } : {}),
      ...(params.node ? { node: params.node } : {}),
      ...(params.service_name ? { service_name: params.service_name } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.invalid_filter ? { invalid_filter: params.invalid_filter } : {}),
      ...(params.invalid_reason ? { invalid_reason: params.invalid_reason } : {}),
    }).toString();
    return handleResponse(await fetch(`${API_BASE}/api/agent/ai-helpers/sessions/global?${query}`, { headers: getHeaders() }));
  },

  batchTerminateAiAgentSessions: async (
    projectId: string,
    targets: ProjectAiAgentSessionTerminateTarget[],
  ): Promise<ProjectAiAgentSessionBatchTerminateResult> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/ai-helpers/sessions/global/delete-batch`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ project_id: projectId, targets }),
    })),

  createAiHelperSession: async (
    projectId: string,
    agentKey: string,
    serviceName: string,
    payload: {
      agent_id?: string;
      agent_ids?: string[];
      session_mode?: 'pipe' | 'pty' | 'invoke';
      metadata?: Record<string, any>;
    }
  ): Promise<AiAgentSession> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/ai-helpers/${encodeURIComponent(agentKey)}/${encodeURIComponent(serviceName)}/sessions?project_id=${encodeURIComponent(projectId)}`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ ...payload, project_id: projectId }) })),

  getAiHelperSession: async (projectId: string, agentKey: string, serviceName: string, sessionId: string): Promise<AiAgentSession> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/ai-helpers/${encodeURIComponent(agentKey)}/${encodeURIComponent(serviceName)}/sessions/${encodeURIComponent(sessionId)}?project_id=${encodeURIComponent(projectId)}`, { headers: getHeaders() })),

  deleteAiHelperSession: async (projectId: string, agentKey: string, serviceName: string, sessionId: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/ai-helpers/${encodeURIComponent(agentKey)}/${encodeURIComponent(serviceName)}/sessions/${encodeURIComponent(sessionId)}?project_id=${encodeURIComponent(projectId)}`, { method: 'DELETE', headers: getHeaders(), body: JSON.stringify({ project_id: projectId }) })),

  sendAiHelperSessionMessage: async (projectId: string, agentKey: string, serviceName: string, sessionId: string, content: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/ai-helpers/${encodeURIComponent(agentKey)}/${encodeURIComponent(serviceName)}/sessions/${encodeURIComponent(sessionId)}/messages?project_id=${encodeURIComponent(projectId)}`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ project_id: projectId, role: 'user', content }) })),

  sendAiHelperSessionMessageStream: async (
    projectId: string,
    agentKey: string,
    serviceName: string,
    sessionId: string,
    content: string,
    handlers: {
      onEvent: (event: AiSessionStreamEvent) => void;
      onDone?: () => void;
      onError?: (error: Error) => void;
    }
  ): Promise<void> => {
    const response = await fetch(
      `${API_BASE}/api/agent/ai-helpers/${encodeURIComponent(agentKey)}/${encodeURIComponent(serviceName)}/sessions/${encodeURIComponent(sessionId)}/messages?project_id=${encodeURIComponent(projectId)}&stream=true`,
      { method: 'POST', headers: getHeaders(), body: JSON.stringify({ project_id: projectId, role: 'user', content }) }
    );
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(errorData?.detail || errorData?.error || errorData?.message || '流式发送失败');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('浏览器当前不支持流式响应读取');
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        parts.forEach((part) => {
          parseSseChunk(part + '\n\n').forEach((event) => handlers.onEvent(event as AiSessionStreamEvent));
        });
      }
      if (buffer.trim()) {
        parseSseChunk(buffer).forEach((event) => handlers.onEvent(event as AiSessionStreamEvent));
      }
      handlers.onDone?.();
    } catch (error: any) {
      handlers.onError?.(error);
      throw error;
    }
  },

  createAiBatchSession: async (
    projectId: string,
    payload: {
      session_mode?: 'pipe' | 'pty' | 'invoke';
      metadata?: Record<string, any>;
      helpers: Array<{
        agent_key: string;
        service_name: string;
        agent_id?: string;
        agent_ids?: string[];
        session_mode?: 'pipe' | 'pty' | 'invoke';
      }>;
    }
  ): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/ai-helpers/sessions/batch`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ ...payload, project_id: projectId }) })),

  listAiBatchSessions: async (projectId: string): Promise<{ project_id: string; items: AiBatchSessionSummary[]; total: number }> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/ai-helpers/sessions/batch?project_id=${encodeURIComponent(projectId)}`, { headers: getHeaders() })),

  getAiBatchSession: async (batchId: string): Promise<AiBatchSession> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/ai-helpers/sessions/batch/${encodeURIComponent(batchId)}`, { headers: getHeaders() })),

  deleteAiBatchSession: async (batchId: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/ai-helpers/sessions/batch/${encodeURIComponent(batchId)}`, { method: 'DELETE', headers: getHeaders() })),

  getAiBatchMessages: async (batchId: string): Promise<{ batch_id: string; items: AiBatchRound[]; total: number }> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/ai-helpers/sessions/batch/${encodeURIComponent(batchId)}/messages`, { headers: getHeaders() })),

  sendAiBatchMessage: async (batchId: string, content: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/ai-helpers/sessions/batch/${encodeURIComponent(batchId)}/messages`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ role: 'user', content }) })),

  sendAiBatchMessageStream: async (
    batchId: string,
    content: string,
    handlers: {
      onEvent: (event: AiBatchStreamEvent) => void;
      onDone?: () => void;
      onError?: (error: Error) => void;
    }
  ): Promise<void> => {
    const response = await fetch(
      `${API_BASE}/api/agent/ai-helpers/sessions/batch/${encodeURIComponent(batchId)}/messages?stream=true`,
      { method: 'POST', headers: getHeaders(), body: JSON.stringify({ role: 'user', content }) }
    );
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(errorData?.detail || errorData?.error || errorData?.message || '批量流式发送失败');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('浏览器当前不支持流式响应读取');
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        parts.forEach((part) => {
          parseSseChunk(part + '\n\n').forEach((event) => handlers.onEvent(event as AiBatchStreamEvent));
        });
      }
      if (buffer.trim()) {
        parseSseChunk(buffer).forEach((event) => handlers.onEvent(event as AiBatchStreamEvent));
      }
      handlers.onDone?.();
    } catch (error: any) {
      handlers.onError?.(error);
      throw error;
    }
  },
  deleteGlobalIngressBatch: async (projectId: string, routeIds: string[]): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/services/global/ingress/delete-batch`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ project_id: projectId, route_ids: routeIds })
    })),
  cleanupStaleGlobalIngress: async (projectId: string, dryRun = false): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/services/global/ingress/cleanup-stale`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ project_id: projectId, dry_run: dryRun })
    })),
  clearAllGlobalIngress: async (projectId: string, includeDeleted = false): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/services/global/ingress/clear-all`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ project_id: projectId, include_deleted: includeDeleted })
    })),
  getGlobalAgentIngress: async (
    projectId: string,
    params: { include_deleted?: boolean; page?: number; per_page?: number } = {}
  ): Promise<{ project_id: string; items: any[]; stats: any; total?: number; page?: number; per_page?: number }> => {
    const query = new URLSearchParams({
      project_id: projectId,
      include_deleted: params.include_deleted ? 'true' : 'false',
      ...(params.page ? { page: String(params.page) } : {}),
      ...(params.per_page ? { per_page: String(params.per_page) } : {}),
    }).toString();
    return handleResponse(await fetch(`${API_BASE}/api/agent/agents/global/ingress?${query}`, { headers: getHeaders() }));
  },
  deleteGlobalAgentIngressBatch: async (projectId: string, routeIds: string[]): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/agents/global/ingress/delete-batch`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ project_id: projectId, route_ids: routeIds })
    })),
  cleanupStaleGlobalAgentIngress: async (projectId: string, dryRun = false): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/agents/global/ingress/cleanup-stale`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ project_id: projectId, dry_run: dryRun })
    })),
  clearAllGlobalAgentIngress: async (projectId: string, includeDeleted = false): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/agents/global/ingress/clear-all`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ project_id: projectId, include_deleted: includeDeleted })
    })),

  syncGlobalServices: async (data?: { project_id?: string; agent_key?: string; stale_only?: boolean }): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/services/global/sync`, {
      method: 'POST',
      headers: getHeaders(),
      body: data ? JSON.stringify(data) : undefined
    })),

  getGlobalServiceSyncHistory: async (params: { project_id?: string; page?: number; per_page?: number } = {}): Promise<any> => {
    const query = new URLSearchParams({ ...params as any }).toString();
    return handleResponse(await fetch(`${API_BASE}/api/agent/services/global/sync/history${query ? `?${query}` : ''}`, {
      headers: getHeaders()
    }));
  },
  deleteGlobalServiceSyncHistoryItem: async (syncId: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/services/global/sync/history/${encodeURIComponent(syncId)}`, {
      method: 'DELETE',
      headers: getHeaders()
    })),
  clearGlobalServiceSyncHistory: async (projectId?: string): Promise<any> => {
    const query = new URLSearchParams(projectId ? { project_id: projectId } : {}).toString();
    return handleResponse(await fetch(`${API_BASE}/api/agent/services/global/sync/history${query ? `?${query}` : ''}`, {
      method: 'DELETE',
      headers: getHeaders()
    }));
  },

  // Proxies
  getAgentServices: async (key: string): Promise<{ services: AgentService[] }> => 
    handleResponse(await fetch(`${API_BASE}/api/agent/agent/${key}/services`, { headers: getHeaders() })),
  startAgentService: async (key: string, serviceName: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/agent/${key}/services/${encodeURIComponent(serviceName)}/start`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({})
    })),
  stopAgentService: async (key: string, serviceName: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/agent/${key}/services/${encodeURIComponent(serviceName)}/stop`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({})
    })),
  deleteAgentService: async (key: string, serviceName: string, projectId?: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/agent/${key}/services/${encodeURIComponent(serviceName)}${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''}`, {
      method: 'DELETE',
      headers: getHeaders()
    })),
  getAgentServiceDetail: async (key: string, serviceName: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/agent/${key}/services/${encodeURIComponent(serviceName)}`, {
      headers: getHeaders()
    })),
  getAgentServiceLogs: async (key: string, serviceName: string, tail = 200): Promise<{ logs?: string; error?: string }> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/agent/${key}/services/${encodeURIComponent(serviceName)}/logs?tail=${tail}`, {
      headers: getHeaders()
    })),
  getAgentServiceFiles: async (key: string, serviceName: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/agent/${key}/services/${encodeURIComponent(serviceName)}/files`, {
      headers: getHeaders()
    })),
  execAgentServiceCommand: async (
    key: string,
    serviceName: string,
    data: { container: string; command: string; user?: string }
  ): Promise<{ output?: string; error?: string }> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/agent/${key}/services/${encodeURIComponent(serviceName)}/exec`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data)
    })),
  getAgentServiceExecWsConnection: async (
    key: string,
    serviceName: string,
    params: { project_id?: string; container?: string; shell?: string; user?: string; mode?: 'attach' | 'shell' } = {}
  ): Promise<any> => {
    const query = new URLSearchParams();
    if (params.project_id) query.append('project_id', params.project_id);
    if (params.container) query.append('container', params.container);
    if (params.shell) query.append('shell', params.shell);
    if (params.user) query.append('user', params.user);
    if (params.mode) query.append('mode', params.mode);
    return handleResponse(await fetch(`${API_BASE}/api/agent/agent/${key}/services/${encodeURIComponent(serviceName)}/exec/ws-connection?${query.toString()}`, {
      headers: getHeaders()
    }));
  },
  getAgentHealth: async (key: string): Promise<any> => 
    handleResponse(await fetch(`${API_BASE}/api/agent/agent/${key}/health`, { headers: getHeaders() })),
  getDaemonAgentInfo: async (key: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/agent/${key}/daemon-agent-info`, { headers: getHeaders() })),
  getDaemonAgentHealth: async (key: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/agent/${key}/daemon-agent-health`, { headers: getHeaders() })),
  getAgentTtydConnection: async (key: string): Promise<AgentTtydConnectionInfo> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/agent/${key}/ttyd/connection`, { headers: getHeaders() })),
  listAgentIngressRoutes: async (key: string, projectId: string): Promise<{ total: number; items: AgentIngressRouteInfo[] }> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/agent/${key}/ingress-routes?project_id=${projectId}`, { headers: getHeaders() })),
  createAgentIngressRoute: async (
    key: string,
    data: {
      project_id: string;
      target_port: number;
      host?: string;
      host_prefix?: string;
      path?: string;
      service_port?: number;
      websocket_enabled?: boolean;
      tls_enabled?: boolean;
      backend_protocol?: 'http' | 'https';
      force_recreate?: boolean;
      metadata?: Record<string, any>;
    }
  ): Promise<AgentIngressRouteInfo> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/agent/${key}/ingress-routes`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data)
    })),
  deleteAgentIngressRoute: async (key: string, routeId: string, projectId: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/agent/${key}/ingress-routes/${routeId}?project_id=${projectId}`, {
      method: 'DELETE',
      headers: getHeaders()
    })),

  // Daemon Services (守护进程服务)
  getDaemonServices: async (key: string): Promise<DaemonServicesResponse> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/agent/${key}/daemon-services`, { headers: getHeaders() })),

  startDaemonService: async (key: string, serviceName: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/agent/${key}/daemon-services/${serviceName}/start`, {
      method: 'POST',
      headers: getHeaders()
    })),

  stopDaemonService: async (key: string, serviceName: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/agent/${key}/daemon-services/${serviceName}/stop`, {
      method: 'POST',
      headers: getHeaders()
    })),

  restartDaemonService: async (key: string, serviceName: string): Promise<any> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/agent/${key}/daemon-services/${serviceName}/restart`, {
      method: 'POST',
      headers: getHeaders()
    })),

  getDaemonServiceLogs: async (key: string, serviceName: string, type = 'stdout', lines = 100): Promise<DaemonServiceLogs> =>
    handleResponse(await fetch(`${API_BASE}/api/agent/agent/${key}/daemon-services/${serviceName}/logs?type=${type}&lines=${lines}`, {
      headers: getHeaders()
    })),
};
