import { API_BASE, getHeaders, handleResponse } from './base';

const PREFIX = `${API_BASE}/api/ai-agent-framework`;

const withQuery = (path: string, params: Record<string, string | number | undefined | null>) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      query.set(key, String(value));
    }
  });
  const text = query.toString();
  return text ? `${path}?${text}` : path;
};

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
  entry_input_task_type: string;
  final_output_task_type: string;
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

export interface AiwfTriggerTaskInput {
  task_id?: string;
  task_type?: string;
  title: string;
  task_markdown?: string;
  task_md_path?: string;
  metadata?: Record<string, any>;
  upstream_refs?: string[];
}

export interface AiwfCreateDefinitionPayload {
  name: string;
  description?: string;
  project_id: string;
  definition_json: Record<string, any>;
  trigger_type?: string;
  trigger_enabled?: boolean;
  is_active?: boolean;
  enabled?: boolean;
  max_concurrency?: number;
  priority_default?: number;
  workspace_base_dir?: string | null;
  execution_timeout_seconds?: number;
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

export interface AiwfWorkflowExecution {
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

export interface AiwfWorkflowExecutionEvent {
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
  listDefinitions: async (): Promise<AiwfWorkflowDefinition[]> => {
    const response = await fetch(`${PREFIX}/workflow-definitions`, { headers: getHeaders() });
    return handleResponse(response);
  },

  createDefinition: async (payload: AiwfCreateDefinitionPayload): Promise<AiwfWorkflowDefinition> => {
    const response = await fetch(`${PREFIX}/workflow-definitions`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  getDefinition: async (definitionId: string): Promise<AiwfWorkflowDefinition> => {
    const response = await fetch(`${PREFIX}/workflow-definitions/${encodeURIComponent(definitionId)}`, { headers: getHeaders() });
    return handleResponse(response);
  },

  deleteDefinition: async (definitionId: string): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${PREFIX}/workflow-definitions/${encodeURIComponent(definitionId)}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  listDefinitionVersions: async (definitionId: string): Promise<AiwfWorkflowDefinitionVersion[]> => {
    const response = await fetch(`${PREFIX}/workflow-definitions/${encodeURIComponent(definitionId)}/versions`, { headers: getHeaders() });
    return handleResponse(response);
  },

  getDefinitionVersion: async (definitionId: string, versionNo: number): Promise<AiwfWorkflowDefinitionVersion> => {
    const response = await fetch(`${PREFIX}/workflow-definitions/${encodeURIComponent(definitionId)}/versions/${versionNo}`, { headers: getHeaders() });
    return handleResponse(response);
  },

  activateDefinition: async (definitionId: string): Promise<AiwfWorkflowDefinition> => {
    const response = await fetch(`${PREFIX}/workflow-definitions/${encodeURIComponent(definitionId)}/activate`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  deactivateDefinition: async (definitionId: string): Promise<AiwfWorkflowDefinition> => {
    const response = await fetch(`${PREFIX}/workflow-definitions/${encodeURIComponent(definitionId)}/deactivate`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  createTriggerTask: async (definitionId: string, payload: { input_tasks: AiwfTriggerTaskInput[]; priority?: number }): Promise<AiwfTriggerTask> => {
    const response = await fetch(`${PREFIX}/workflow-definitions/${encodeURIComponent(definitionId)}/trigger-tasks`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  listTriggerTasks: async (): Promise<AiwfTriggerTask[]> => {
    const response = await fetch(`${PREFIX}/trigger-tasks`, { headers: getHeaders() });
    return handleResponse(response);
  },

  getTriggerTask: async (triggerTaskId: string): Promise<AiwfTriggerTask> => {
    const response = await fetch(`${PREFIX}/trigger-tasks/${encodeURIComponent(triggerTaskId)}`, { headers: getHeaders() });
    return handleResponse(response);
  },

  cancelTriggerTask: async (triggerTaskId: string): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${PREFIX}/trigger-tasks/${encodeURIComponent(triggerTaskId)}/cancel`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  retryTriggerTask: async (triggerTaskId: string): Promise<AiwfTriggerTask> => {
    const response = await fetch(`${PREFIX}/trigger-tasks/${encodeURIComponent(triggerTaskId)}/retry`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  listExecutions: async (): Promise<AiwfWorkflowExecution[]> => {
    const response = await fetch(`${PREFIX}/executions`, { headers: getHeaders() });
    return handleResponse(response);
  },

  getExecution: async (executionId: string): Promise<AiwfWorkflowExecution> => {
    const response = await fetch(`${PREFIX}/executions/${encodeURIComponent(executionId)}`, { headers: getHeaders() });
    return handleResponse(response);
  },

  getExecutionEvents: async (executionId: string): Promise<AiwfWorkflowExecutionEvent[]> => {
    const response = await fetch(`${PREFIX}/executions/${encodeURIComponent(executionId)}/events`, { headers: getHeaders() });
    return handleResponse(response);
  },

  getExecutionArtifacts: async (executionId: string): Promise<Record<string, any>> => {
    const response = await fetch(`${PREFIX}/executions/${encodeURIComponent(executionId)}/artifacts`, { headers: getHeaders() });
    return handleResponse(response);
  },

  cancelExecution: async (executionId: string): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${PREFIX}/executions/${encodeURIComponent(executionId)}/cancel`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  listWorkers: async (): Promise<AiwfSchedulerWorker[]> => {
    const response = await fetch(`${PREFIX}/scheduler/workers`, { headers: getHeaders() });
    return handleResponse(response);
  },

  getWorker: async (podId: string): Promise<AiwfSchedulerWorker> => {
    const response = await fetch(`${PREFIX}/scheduler/workers/${encodeURIComponent(podId)}`, { headers: getHeaders() });
    return handleResponse(response);
  },

  drainWorker: async (podId: string): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${PREFIX}/scheduler/workers/${encodeURIComponent(podId)}/drain`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  activateWorker: async (podId: string): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${PREFIX}/scheduler/workers/${encodeURIComponent(podId)}/activate`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  health: async (): Promise<Record<string, any>> => {
    const response = await fetch(withQuery(`${PREFIX}/health`, {}), { headers: getHeaders() });
    return handleResponse(response);
  },
};
