import { API_BASE, getHeaders, handleResponse } from './base';

export interface AiwfWorkflowDefinition {
  id: string;
  name: string;
  description?: string | null;
  project_id: string;
  root_workflow_id: string;
  trigger_type: string;
  trigger_enabled: boolean;
  is_active: boolean;
  enabled: boolean;
  max_concurrency: number;
  priority_default: number;
  workspace_base_dir?: string | null;
  execution_timeout_seconds: number;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface AiwfWorkflowDefinitionVersion {
  id: string;
  workflow_definition_id: string;
  version_no: number;
  created_by: string;
  created_at: string;
  definition_json: Record<string, any>;
}

export interface AiwfTaskItem {
  task_id: string;
  task_type: string;
  title: string;
  task_md_path: string;
  metadata: Record<string, any>;
  upstream_refs: string[];
}

export interface AiwfTriggerTask {
  id: string;
  workflow_definition_id: string;
  project_id: string;
  trigger_type: string;
  priority: number;
  status: string;
  submitted_by: string;
  started_at?: string | null;
  finished_at?: string | null;
  message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiwfExecution {
  id: string;
  trigger_task_id: string;
  workflow_definition_id: string;
  project_id: string;
  status: string;
  workspace_root?: string | null;
  output_manifest_path?: string | null;
  output_task_count: number;
  current_stage_id?: string | null;
  owner_pod_id?: string | null;
  lease_expires_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiwfExecutionEvent {
  id: string;
  execution_id: string;
  event_type: string;
  stage_id?: string | null;
  round_no?: number | null;
  level: string;
  message: string;
  payload_json?: Record<string, any> | null;
  created_at: string;
}

export interface AiwfSchedulerWorker {
  pod_id: string;
  host_name: string;
  capacity: number;
  running_count: number;
  last_heartbeat_at: string;
  status: string;
  metadata_json?: Record<string, any> | null;
}

export const aiAgentFrameworkApi = {
  getHealth: async (): Promise<{ status: string; pod_id: string; database: string; scheduler: string }> =>
    handleResponse(await fetch(`${API_BASE}/api/ai-agent-framework/health`, { headers: getHeaders() })),

  listDefinitions: async (): Promise<AiwfWorkflowDefinition[]> =>
    handleResponse(await fetch(`${API_BASE}/api/ai-agent-framework/workflow-definitions`, { headers: getHeaders() })),

  getDefinition: async (id: string): Promise<AiwfWorkflowDefinition> =>
    handleResponse(await fetch(`${API_BASE}/api/ai-agent-framework/workflow-definitions/${id}`, { headers: getHeaders() })),

  createDefinition: async (payload: Record<string, any>): Promise<AiwfWorkflowDefinition> =>
    handleResponse(await fetch(`${API_BASE}/api/ai-agent-framework/workflow-definitions`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  updateDefinition: async (id: string, payload: Record<string, any>): Promise<AiwfWorkflowDefinition> =>
    handleResponse(await fetch(`${API_BASE}/api/ai-agent-framework/workflow-definitions/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  deleteDefinition: async (id: string): Promise<{ success: boolean; message: string }> =>
    handleResponse(await fetch(`${API_BASE}/api/ai-agent-framework/workflow-definitions/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    })),

  listDefinitionVersions: async (id: string): Promise<AiwfWorkflowDefinitionVersion[]> =>
    handleResponse(await fetch(`${API_BASE}/api/ai-agent-framework/workflow-definitions/${id}/versions`, { headers: getHeaders() })),

  getDefinitionVersion: async (id: string, versionNo: number): Promise<AiwfWorkflowDefinitionVersion> =>
    handleResponse(await fetch(`${API_BASE}/api/ai-agent-framework/workflow-definitions/${id}/versions/${versionNo}`, { headers: getHeaders() })),

  activateDefinition: async (id: string): Promise<AiwfWorkflowDefinition> =>
    handleResponse(await fetch(`${API_BASE}/api/ai-agent-framework/workflow-definitions/${id}/activate`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  deactivateDefinition: async (id: string): Promise<AiwfWorkflowDefinition> =>
    handleResponse(await fetch(`${API_BASE}/api/ai-agent-framework/workflow-definitions/${id}/deactivate`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  createTriggerTask: async (definitionId: string, payload: { input_tasks: AiwfTaskItem[]; priority?: number | null }): Promise<AiwfTriggerTask> =>
    handleResponse(await fetch(`${API_BASE}/api/ai-agent-framework/workflow-definitions/${definitionId}/trigger-tasks`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    })),

  listTriggerTasks: async (): Promise<AiwfTriggerTask[]> =>
    handleResponse(await fetch(`${API_BASE}/api/ai-agent-framework/trigger-tasks`, { headers: getHeaders() })),

  getTriggerTask: async (id: string): Promise<AiwfTriggerTask> =>
    handleResponse(await fetch(`${API_BASE}/api/ai-agent-framework/trigger-tasks/${id}`, { headers: getHeaders() })),

  cancelTriggerTask: async (id: string): Promise<{ success: boolean; message: string }> =>
    handleResponse(await fetch(`${API_BASE}/api/ai-agent-framework/trigger-tasks/${id}/cancel`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  retryTriggerTask: async (id: string): Promise<AiwfTriggerTask> =>
    handleResponse(await fetch(`${API_BASE}/api/ai-agent-framework/trigger-tasks/${id}/retry`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  listExecutions: async (): Promise<AiwfExecution[]> =>
    handleResponse(await fetch(`${API_BASE}/api/ai-agent-framework/executions`, { headers: getHeaders() })),

  getExecution: async (id: string): Promise<AiwfExecution> =>
    handleResponse(await fetch(`${API_BASE}/api/ai-agent-framework/executions/${id}`, { headers: getHeaders() })),

  listExecutionEvents: async (id: string): Promise<AiwfExecutionEvent[]> =>
    handleResponse(await fetch(`${API_BASE}/api/ai-agent-framework/executions/${id}/events`, { headers: getHeaders() })),

  getExecutionArtifacts: async (id: string): Promise<{ execution_id: string; workspace_root?: string | null; output_manifest_path?: string | null; files: Array<{ path: string; size: number }> }> =>
    handleResponse(await fetch(`${API_BASE}/api/ai-agent-framework/executions/${id}/artifacts`, { headers: getHeaders() })),

  cancelExecution: async (id: string): Promise<{ success: boolean; message: string }> =>
    handleResponse(await fetch(`${API_BASE}/api/ai-agent-framework/executions/${id}/cancel`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  listWorkers: async (): Promise<AiwfSchedulerWorker[]> =>
    handleResponse(await fetch(`${API_BASE}/api/ai-agent-framework/scheduler/workers`, { headers: getHeaders() })),

  drainWorker: async (podId: string): Promise<{ success: boolean; message: string }> =>
    handleResponse(await fetch(`${API_BASE}/api/ai-agent-framework/scheduler/workers/${encodeURIComponent(podId)}/drain`, {
      method: 'POST',
      headers: getHeaders(),
    })),

  activateWorker: async (podId: string): Promise<{ success: boolean; message: string }> =>
    handleResponse(await fetch(`${API_BASE}/api/ai-agent-framework/scheduler/workers/${encodeURIComponent(podId)}/activate`, {
      method: 'POST',
      headers: getHeaders(),
    })),
};
