import { API_BASE, getAuthHeaders, getHeaders, handleResponse, type XhrUploadProgress, xhrUpload } from '../../clients/base';

// ---------------------------------------------------------------------------
//  M2M prefix — turing-ui-service external task APIs
//  Frontend uses /turing/api prefix, Vite proxy rewrites to /api and forwards
//  to http://turing.ai.icsl.huawei.com/turing-app-security
// ---------------------------------------------------------------------------
const PREFIX =`${API_BASE}/turing/api/v1/tasks`;
const UPLOAD_PREFIX =`${API_BASE}/turing/api/projects/upload`;
const MONITOR_PREFIX =`${API_BASE}/turing/api`;

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
//  Findings (漏洞报告)
// ---------------------------------------------------------------------------

export interface AppScanCallChainStep {
  step?: number;
  role?: string; // source | sink | check | propagation
  description?: string;
  action?: string;
  file?: string;
  line?: number;
  location?: string;
  code?: string;
}

export interface AppScanFinding {
  id: string;
  display_id: string | null;
  vuln_type: string;
  severity: string;
  title: string;
  description: string | null;
  status: string | null;
  validation_result: string | null;
  confidence: number | null;
  cvss_vector: string | null;
  cvss_score: number | null;
  cvss_explanation: string | null;
  total_score: number | null;
  call_chain: AppScanCallChainStep[] | null;
  source: unknown;
  sink: unknown;
  analysis: unknown;
  corrections: unknown;
  fix_suggestion: unknown;
  created_at: string | null;
  validated_at: string | null;
}

export interface AppScanFindingsSummary {
  total: number;
  confirmed: number;
  likely: number;
  possible: number;
  false_positive: number;
  pending_validation: number;
}

export interface AppScanTaskFindings {
  tool_task_id: string;
  status: string;
  summary: AppScanFindingsSummary;
  findings: AppScanFinding[];
}

// ---------------------------------------------------------------------------
//  Engine monitor (system monitoring)
// ---------------------------------------------------------------------------

export interface AppScanActiveProject {
  job_id: string;
  project_id: string;
  workspace: string;
  status: string;
  project_name: string;
}

export interface AppScanPoolStats {
  engine_running: boolean;
  active_projects: AppScanActiveProject[];
  task_counts: Record<string, number>;
  scheduling: { in_flight: number; total_dispatched: number; total_slots: number };
  keys: Record<string, { concurrency: number; in_flight: number }>;
  token_usage: Record<string, number>;
  queue: { length: number; oldest_age_seconds: number };
}

export interface AppScanOcServer {
  instance_id?: string;
  status?: string;
  base_url?: string;
  provider_id?: string;
  session_count?: number;
  started_at_epoch?: number;
  pid?: number;
}

export interface AppScanOcPod {
  pod_url?: string;
  error?: string;
  status?: {
    active?: number;
    total?: number;
    draining?: number;
    max_pool_size?: number;
    servers?: AppScanOcServer[];
  };
}

export interface AppScanOpencodeInstances {
  pods: AppScanOcPod[];
  job_bindings: { base_url: string; job_id: string }[];
  total_instances: number;
  total_active: number;
  error?: string;
}

export interface AppScanTokenJob {
  project_id?: string;
  project_name?: string;
  project_display_name?: string;
  job_id?: string;
  status?: string;
  model_name?: string;
  token_input?: number;
  token_cache_read?: number;
  token_output?: number;
  token_cost?: number;
  started_at?: number;
  created_at?: number;
  completed_at?: number;
}

export interface AppScanTokenStats {
  summary: { input: number; cache_read: number; output: number; cost: number };
  jobs: AppScanTokenJob[];
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
  return text ?`${path}${separator}${text}` : path;
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
   * 查询任务关联的漏洞发现列表。
   * GET /api/v1/tasks/{toolTaskId}/findings
   */
  async getTaskFindings(toolTaskId: string): Promise<AppScanTaskFindings> {
    const url = withQuery(`${PREFIX}/${encodeURIComponent(toolTaskId)}/findings`, { _: Date.now() });
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

  // -------------------------------------------------------------------------
  //  Engine monitor
  // -------------------------------------------------------------------------

  /**
   * 系统监控：扫描概览 + 并发控制 + 队列状态。
   * GET /api/pool-stats
   */
  async getPoolStats(): Promise<AppScanPoolStats> {
    const url = withQuery(`${MONITOR_PREFIX}/pool-stats`, { _: Date.now() });
    const res = await fetch(url, noStoreGetInit());
    return handleResponse(res);
  },

  /**
   * OpenCode 实例池监控。
   * GET /api/opencode-instances
   */
  async getOpencodeInstances(): Promise<AppScanOpencodeInstances> {
    const url = withQuery(`${MONITOR_PREFIX}/opencode-instances`, { _: Date.now() });
    const res = await fetch(url, noStoreGetInit());
    return handleResponse(res);
  },

  /**
   * Token 消耗统计。
   * GET /api/token-stats?since=&until=
   */
  async getTokenStats(since?: number, until?: number): Promise<AppScanTokenStats> {
    const url = withQuery(`${MONITOR_PREFIX}/token-stats`, { since, until, _: Date.now() });
    const res = await fetch(url, noStoreGetInit());
    return handleResponse(res);
  },
};
