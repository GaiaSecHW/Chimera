import { API_BASE, getAuthHeaders, getHeaders, handleResponse, type XhrUploadProgress, xhrUpload } from './base';

// ---------------------------------------------------------------------------
//  M2M prefix — turing-ui-service external task APIs
//  Frontend uses /turing/api prefix, Vite proxy rewrites to /api and forwards
//  to http://turing.ai.icsl.huawei.com/turing-app-security
// ---------------------------------------------------------------------------
const PREFIX = `${API_BASE}/turing/api/v1/tasks`;
const UPLOAD_PREFIX = `${API_BASE}/turing/api/projects/upload`;

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export type AppScanTaskType = 'APK' | 'HAP';

export type AppScanStatus =
  | 'pending'
  | 'decompiling'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed';

export interface AppScanPhaseProgress {
  total: number;
  pending: number;
  running: number;
  success: number;
  failed: number;
}

export interface AppScanTaskProgress {
  phases: Record<string, AppScanPhaseProgress>;
}

export interface AppScanTokenUsage {
  input: number;
  cache_read: number;
  output: number;
  cost: number;
}

export interface AppScanTask {
  tool_task_id: string;
  status: AppScanStatus;
  progress: AppScanTaskProgress;
  token_usage: AppScanTokenUsage;
  created_at: number | null;
  started_at: number | null;
  completed_at: number | null;
  error: string | null;
}

export interface AppScanCreateRequest {
  project_id: string;
  task_id: string;
  file_path: string;
  task_type: AppScanTaskType;
}

export interface AppScanCreateResponse {
  tool_task_id: string;
  project_id: string;
  job_id: string;
  status: AppScanStatus;
}

export interface AppScanActionResponse {
  tool_task_id: string;
  status: string;
  message: string;
}

export interface AppScanTaskSummary {
  tool_task_id: string;
  external_project_id: string;
  external_task_id: string;
  task_type: string;
  status: string;
  created_at: string | null;
}

export interface AppScanListResponse {
  items: AppScanTaskSummary[];
  total: number;
}

export interface AppScanUploadResponse {
  status: string;
  project_id: string;
  file_path: string;
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

const withQuery = (
  path: string,
  params: Record<string, string | number | boolean | undefined | null>,
) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      query.set(key, String(value));
    }
  });
  const text = query.toString();
  const separator = path.includes('?') ? '&' : '?';
  return text ? `${path}${separator}${text}` : path;
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

// ---------------------------------------------------------------------------
//  API
// ---------------------------------------------------------------------------

export const appScanApi = {
  /**
   * 上传 APK/HAP 文件到 turing-ui-service。
   * 复用 turing 的 POST /api/projects/upload 接口。
   */
  async uploadFile(
    file: File,
    displayName: string,
    version = '1.0.0',
    signal?: AbortSignal,
    onProgress?: (event: XhrUploadProgress) => void,
  ): Promise<AppScanUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('display_name', displayName);
    formData.append('version', version);

    return xhrUpload<AppScanUploadResponse>({
      url: UPLOAD_PREFIX,
      formData,
      headers: getAuthHeaders(),
      signal,
      onProgress,
    });
  },

  /**
   * 创建 M2M 扫描任务。
   * POST /api/v1/tasks
   */
  async createTask(req: AppScanCreateRequest): Promise<AppScanCreateResponse> {
    const res = await fetch(PREFIX, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(req),
    });
    return handleResponse(res);
  },

  /**
   * 查询任务状态。
   * GET /api/v1/tasks/{toolTaskId}
   */
  async getTask(toolTaskId: string): Promise<AppScanTask> {
    const url = withQuery(`${PREFIX}/${encodeURIComponent(toolTaskId)}`, { _: Date.now() });
    const res = await fetch(url, noStoreGetInit());
    return handleResponse(res);
  },

  /**
   * 列出外部扫描任务。
   * GET /api/v1/tasks
   */
  async listTasks(
    projectId?: string,
    offset = 0,
    limit = 50,
  ): Promise<AppScanListResponse> {
    const url = withQuery(PREFIX, {
      project_id: projectId,
      offset,
      limit,
      _: Date.now(),
    });
    const res = await fetch(url, noStoreGetInit());
    return handleResponse(res);
  },

  /**
   * 删除任务。
   * DELETE /api/v1/tasks/{toolTaskId}
   */
  async deleteTask(toolTaskId: string): Promise<AppScanActionResponse> {
    const res = await fetch(`${PREFIX}/${encodeURIComponent(toolTaskId)}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  /**
   * 暂停任务。
   * POST /api/v1/tasks/{toolTaskId}/pause
   */
  async pauseTask(toolTaskId: string): Promise<AppScanActionResponse> {
    const res = await fetch(`${PREFIX}/${encodeURIComponent(toolTaskId)}/pause`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  /**
   * 恢复任务。
   * POST /api/v1/tasks/{toolTaskId}/resume
   */
  async resumeTask(toolTaskId: string): Promise<AppScanActionResponse> {
    const res = await fetch(`${PREFIX}/${encodeURIComponent(toolTaskId)}/resume`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },
};
