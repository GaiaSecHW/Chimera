import { API_BASE, getAuthHeaders, getHeaders, handleResponse, xhrUpload } from './base';
import type { XhrUploadProgress } from './base';

const BASE = `${API_BASE}/api/app/ai4red/chimera/redline`;

// --- Types ---

export interface RedlineTask {
  id: string;
  name: string;
  productId: string;
  productName?: string;
  versionId: string;
  versionNo?: string;
  status: string;
  execSuccess?: boolean;
  deliveryFileName?: string;
  deliveryFilePath?: string;
  parseErrorMessage?: string;
  execErrorMessage?: string;
  reportContent?: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  canModify?: boolean;
  canShare?: boolean;
}

export interface RedlineAgent {
  id: string;
  name: string;
  description?: string;
  type?: string;
  inputParams?: Record<string, any>;
}

export interface RedlineTaskAgent {
  id: string;
  taskId: string;
  agentId: string;
  agentName?: string;
  agentType?: string;
  status: string;
  isSuccess?: boolean;
  result?: string;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface RedlineProductInfo {
  id: string;
  product: string;
  version: string;
  description?: string;
}

export interface RedlineDeliverableConfig {
  id: string;
  agentId: string;
  agentName?: string;
  deliverableUrl?: string;
  remark?: string;
}

export interface RedlineRedLineClause {
  id: string;
  name?: string;
  category?: string;
  content?: string;
  description?: string;
  redLineCategory?: string;
  bodyRequirement?: string;
  interpretationGuidance?: string;
}

export interface RedlineRedLineResult {
  id: string;
  taskId: string;
  redLineClauseId: string;
  executionId?: string;
  status: string;
  executionResult?: string;
}

export interface RedlineReportHistory {
  id: string;
  taskId: string;
  executionId: string;
  reportContent?: string;
  createdAt: string;
}

export interface RedlineMatchingRule {
  id: string;
  agentId: string;
  [key: string]: any;
}

// --- API Client ---

export const redlineVerificationApi = {
  // --- Tasks ---

  listTasks: async (): Promise<{ code: number; message: string; data: RedlineTask[] }> => {
    const resp = await fetch(`${BASE}/tasks`, { headers: getHeaders() });
    return handleResponse(resp);
  },

  createTask: async (payload: Partial<RedlineTask>): Promise<{ code: number; message: string; data: RedlineTask }> => {
    const resp = await fetch(`${BASE}/tasks`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(resp);
  },

  getTask: async (taskId: string): Promise<{ code: number; message: string; data: RedlineTask }> => {
    const resp = await fetch(`${BASE}/tasks/${taskId}`, { headers: getHeaders() });
    return handleResponse(resp);
  },

  updateTask: async (taskId: string, payload: Partial<RedlineTask>): Promise<{ code: number; message: string; data: RedlineTask }> => {
    const resp = await fetch(`${BASE}/tasks/${taskId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(resp);
  },

  deleteTask: async (taskId: string): Promise<{ code: number; message: string; data: any }> => {
    const resp = await fetch(`${BASE}/tasks/${taskId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  // --- Upload / Parse ---

  uploadFile: async (
    taskId: string,
    file: File,
    onProgress?: (p: XhrUploadProgress) => void,
  ): Promise<{ code: number; message: string; data: any }> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('envZone', 'green');
    return xhrUpload({
      url: `${BASE}/tasks/${taskId}/upload`,
      formData,
      headers: getAuthHeaders(),
      onProgress,
    });
  },

  parseTask: async (taskId: string): Promise<{ code: number; message: string; data: any }> => {
    const resp = await fetch(`${BASE}/tasks/${taskId}/parse`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  deleteAttachment: async (taskId: string): Promise<{ code: number; message: string; data: any }> => {
    const resp = await fetch(`${BASE}/tasks/${taskId}/attachment`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  stopTask: async (taskId: string): Promise<{ code: number; message: string; data: any }> => {
    const resp = await fetch(`${BASE}/tasks/${taskId}/stop`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  // --- Variables ---

  getVariables: async (taskId: string): Promise<{ code: number; message: string; data: any }> => {
    const resp = await fetch(`${BASE}/tasks/${taskId}/variable`, { headers: getHeaders() });
    return handleResponse(resp);
  },

  saveVariables: async (taskId: string, variables: Record<string, any>): Promise<{ code: number; message: string; data: any }> => {
    const resp = await fetch(`${BASE}/tasks/${taskId}/variables`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(variables),
    });
    return handleResponse(resp);
  },

  // --- Execution ---

  saveSelectedAgents: async (taskId: string, agentIds: string[]): Promise<{ code: number; message: string; data: any }> => {
    const resp = await fetch(`${BASE}/tasks/${taskId}/save-selected-agents`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ agentIds }),
    });
    return handleResponse(resp);
  },

  deleteTaskAgents: async (taskId: string): Promise<{ code: number; message: string; data: any }> => {
    const resp = await fetch(`${BASE}/tasks/${taskId}/task-agents`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  resetStatus: async (taskId: string): Promise<{ code: number; message: string; data: any }> => {
    const resp = await fetch(`${BASE}/tasks/${taskId}/reset-status`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  execute: async (taskId: string): Promise<{ code: number; message: string; data: any }> => {
    const resp = await fetch(`${BASE}/tasks/${taskId}/execute`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  getExecutionStatus: async (taskId: string): Promise<{ code: number; message: string; data: RedlineTaskAgent[] }> => {
    const resp = await fetch(`${BASE}/tasks/${taskId}/execution-status`, { headers: getHeaders() });
    return handleResponse(resp);
  },

  retryAgent: async (taskId: string, agentId: string): Promise<{ code: number; message: string; data: any }> => {
    const resp = await fetch(`${BASE}/tasks/${taskId}/retry`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ agentId }),
    });
    return handleResponse(resp);
  },

  stopAgent: async (taskId: string, taskAgentId: string): Promise<{ code: number; message: string; data: any }> => {
    const resp = await fetch(`${BASE}/tasks/${taskId}/agents/${taskAgentId}/stop`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  resetAndExecute: async (taskId: string): Promise<{ code: number; message: string; data: any }> => {
    const resp = await fetch(`${BASE}/tasks/${taskId}/reset-and-execute`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },

  // --- Red-line ---

  getRedLineResults: async (taskId: string, executionId?: string): Promise<{ code: number; message: string; data: RedlineRedLineResult[] }> => {
    const params = executionId ? `?executionId=${encodeURIComponent(executionId)}` : '';
    const resp = await fetch(`${BASE}/tasks/${taskId}/red-line-results${params}`, { headers: getHeaders() });
    return handleResponse(resp);
  },

  batchSaveRedLineResults: async (taskId: string, executionId: string, results: Partial<RedlineRedLineResult>[]): Promise<{ code: number; message: string; data: any }> => {
    const resp = await fetch(`${BASE}/tasks/${taskId}/red-line-results/batch`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ executionId, results }),
    });
    return handleResponse(resp);
  },

  updateRedLineResult: async (id: string, payload: Partial<RedlineRedLineResult>): Promise<{ code: number; message: string; data: any }> => {
    const resp = await fetch(`${BASE}/red-line-results/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(resp);
  },

  getRedLineClausesByIds: async (ids: string[]): Promise<{ code: number; message: string; data: RedlineRedLineClause[] }> => {
    const params = ids.map((id) => `ids=${encodeURIComponent(id)}`).join('&');
    const resp = await fetch(`${BASE}/red-line-clause/by-ids?${params}`, { headers: getHeaders() });
    return handleResponse(resp);
  },

  getAgentRedLineClauses: async (agentId: string): Promise<{ code: number; message: string; data: RedlineRedLineClause[] }> => {
    const resp = await fetch(`${BASE}/agent-red-line-clause/agent/${agentId}`, { headers: getHeaders() });
    return handleResponse(resp);
  },

  // --- History ---

  getReportHistory: async (taskId: string): Promise<{ code: number; message: string; data: RedlineReportHistory[] }> => {
    const resp = await fetch(`${BASE}/tasks/${taskId}/report-history`, { headers: getHeaders() });
    return handleResponse(resp);
  },

  // --- Auxiliary ---

  getAgents: async (): Promise<{ code: number; message: string; data: RedlineAgent[] }> => {
    const resp = await fetch(`${BASE}/agents`, { headers: getHeaders() });
    return handleResponse(resp);
  },

  getProducts: async (): Promise<{ code: number; message: string; data: string[] }> => {
    const resp = await fetch(`${BASE}/product-info/products`, { headers: getHeaders() });
    return handleResponse(resp);
  },

  getProductVersions: async (product: string): Promise<{ code: number; message: string; data: RedlineProductInfo[] }> => {
    const resp = await fetch(`${BASE}/product-info?product=${encodeURIComponent(product)}`, { headers: getHeaders() });
    return handleResponse(resp);
  },

  getDeliverableConfig: async (): Promise<{ code: number; message: string; data: RedlineDeliverableConfig[] }> => {
    const resp = await fetch(`${BASE}/deliverable-config`, { headers: getHeaders() });
    return handleResponse(resp);
  },

  getMatchingRulesByAgent: async (agentId: string): Promise<{ code: number; message: string; data: RedlineMatchingRule[] }> => {
    const resp = await fetch(`${BASE}/deliverable-matching-rule/by-agent/${agentId}`, { headers: getHeaders() });
    return handleResponse(resp);
  },

  // --- Sharing ---

  shareTask: async (taskId: string, userId: string): Promise<{ code: number; message: string; data: any }> => {
    const resp = await fetch(`${BASE}/task-shares?taskId=${encodeURIComponent(taskId)}&userId=${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(resp);
  },
};
