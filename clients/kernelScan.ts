import { API_BASE, getHeaders, handleResponse } from './base';

const PREFIX = `${API_BASE}/api/app/kernel-scan`;

const withQuery = (path: string, params: Record<string, string | number | boolean | undefined | null>) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      query.set(key, String(value));
    }
  });
  const text = query.toString();
  return text ? `${path}?${text}` : path;
};

const noStoreHeaders = () => ({
  ...getHeaders(),
  'Cache-Control': 'no-cache, no-store, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
});

const noStoreGetInit = (): RequestInit => ({
  headers: noStoreHeaders(),
  cache: 'no-store',
});

const withCacheBust = (path: string) => withQuery(path, { _: Date.now() });

export type KernelScanCategory = 'attack_entry' | 'vuln_scan' | 'vuln_verify';

export interface KernelScanCapability {
  service: string;
  categories: KernelScanCategory[];
  executor_modes: string[];
  default_executor_mode?: string | null;
  max_parallel_tasks: number;
}

export interface KernelScanReadyState {
  status: string;
  ready: boolean;
  checks: Record<string, boolean>;
}

export interface KernelScanTaskSummary {
  task_id: string;
  project_id?: string | null;
  category: KernelScanCategory;
  title: string;
  status: string;
  target_path: string;
  created_by: string;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  message?: string | null;
}

export interface KernelScanTaskDetail extends KernelScanTaskSummary {
  executor_mode?: string | null;
  model?: string | null;
  result_summary?: string | null;
}

export interface KernelScanCreateTaskPayload {
  project_id?: string;
  category: KernelScanCategory;
  title: string;
  target_path: string;
  executor_mode?: string;
  model?: string;
  parallel_count?: number;
}

export const kernelScanApi = {
  getReady: async (): Promise<KernelScanReadyState> => {
    const response = await fetch(withCacheBust(`${PREFIX}/ready`), noStoreGetInit());
    return handleResponse(response);
  },

  getCapabilities: async (): Promise<KernelScanCapability> => {
    const response = await fetch(`${PREFIX}/capabilities`, noStoreGetInit());
    return handleResponse(response);
  },

  listTasks: async (projectId: string, category?: KernelScanCategory): Promise<KernelScanTaskSummary[]> => {
    const url = withQuery(`${PREFIX}/tasks`, { project_id: projectId, category });
    const response = await fetch(url, noStoreGetInit());
    return handleResponse(response);
  },

  getTask: async (taskId: string): Promise<KernelScanTaskDetail> => {
    const response = await fetch(`${PREFIX}/tasks/${taskId}`, noStoreGetInit());
    return handleResponse(response);
  },

  createTask: async (payload: KernelScanCreateTaskPayload): Promise<KernelScanTaskSummary> => {
    const response = await fetch(`${PREFIX}/tasks`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  cancelTask: async (taskId: string): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${PREFIX}/tasks/${taskId}/cancel`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  retryTask: async (taskId: string): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${PREFIX}/tasks/${taskId}/retry`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  deleteTask: async (taskId: string): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${PREFIX}/tasks/${taskId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },
};
