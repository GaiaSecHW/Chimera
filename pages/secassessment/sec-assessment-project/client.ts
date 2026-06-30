import { getHeaders, handleResponse } from '../../../clients/base';
import type {
  ProjectListItem,
  ProjectDetail,
  ExecutionResult,
  ExecutionUpdate,
  WorkerInfo,
  DrainResponse,
  SystemConfigRead,
  SystemConfigUpdate,
  SyncResult,
  OperationLogItem,
  EventItem,
  ChimeraTaskRequest,
  ChimeraTaskCreateResponse,
  ChimeraTaskStatusDTO,
  ChimeraDeleteResponse,
  BaselineNodeOut,
  BaselineOption,
} from './types';

// 项目管理服务(:8001)
const SEC_PROJECT_API_BASE =
  String(import.meta.env.VITE_SEC_PROJECT_API_BASE ?? 'http://127.0.0.1:8001');
// 基线服务(:8000,跨服务取基线节点树与基线下拉)
const SEC_BASELINE_API_BASE =
  String(import.meta.env.VITE_SEC_BASELINE_API_BASE ?? 'http://localhost:8000');

const P_API = `${SEC_PROJECT_API_BASE}/api`;
const P_M2M = `${SEC_PROJECT_API_BASE}/api/v1`;
const B_API = `${SEC_BASELINE_API_BASE}/api`;

// 网络层错误中文化
function isNetworkError(e: any): boolean {
  const msg = String(e?.message || '').toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('err_network') ||
    msg.includes('err_connection') ||
    msg.includes('err_name') ||
    msg.includes('err_internet')
  );
}

function friendlyFetchP(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, init).catch((e) => {
    if (isNetworkError(e)) {
      throw new Error('无法连接项目服务,请检查后端是否启动(默认 127.0.0.1:8001)');
    }
    throw e;
  });
}

function friendlyFetchB(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, init).catch((e) => {
    if (isNetworkError(e)) {
      throw new Error('无法连接基线服务,请检查后端是否启动(默认 localhost:8000)');
    }
    throw e;
  });
}

async function reqP<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await friendlyFetchP(url, init);
  return handleResponse(r) as Promise<T>;
}

async function reqB<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await friendlyFetchB(url, init);
  return handleResponse(r) as Promise<T>;
}

function withQuery(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const secAssessmentApi = {
  // ===== 项目 =====
  listProjects: (params: { keyword?: string; status?: string; sync_status?: string; offset?: number; limit?: number } = {}) =>
    reqP<ProjectListItem[]>(`${P_API}/projects${withQuery(params as any)}`, { headers: getHeaders() }),

  getProject: (id: number) =>
    reqP<ProjectDetail>(`${P_API}/projects/${id}`, { headers: getHeaders() }),

  updateExecution: (projectId: number, eid: number, payload: ExecutionUpdate) =>
    reqP<ExecutionResult>(`${P_API}/projects/${projectId}/executions/${eid}`, {
      method: 'PUT', headers: getHeaders(), body: JSON.stringify(payload),
    }),

  syncProject: (id: number) =>
    reqP<SyncResult>(`${P_API}/projects/${id}/sync`, { method: 'POST', headers: getHeaders() }),

  cancelProject: (id: number) =>
    reqP<Record<string, any>>(`${P_API}/projects/${id}/cancel`, { method: 'POST', headers: getHeaders() }),

  reExecuteProject: (id: number) =>
    reqP<Record<string, any>>(`${P_API}/projects/${id}/re-execute`, { method: 'POST', headers: getHeaders() }),

  getLogs: (id: number) =>
    reqP<OperationLogItem[]>(`${P_API}/projects/${id}/logs`, { headers: getHeaders() }),

  getEvents: (id: number) =>
    reqP<EventItem[]>(`${P_API}/projects/${id}/events`, { headers: getHeaders() }),

  // ===== Worker =====
  listWorkers: () =>
    reqP<WorkerInfo[]>(`${P_API}/workers`, { headers: getHeaders() }),

  drainWorker: (name: string) =>
    reqP<DrainResponse>(`${P_API}/workers/${name}/drain`, { method: 'POST', headers: getHeaders() }),

  // ===== 配置 =====
  getConfig: () =>
    reqP<SystemConfigRead>(`${P_API}/config`, { headers: getHeaders() }),

  updateConfig: (payload: SystemConfigUpdate) =>
    reqP<SystemConfigRead>(`${P_API}/config`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(payload) }),

  // ===== M2M 任务控制(用 chimera_need_taskId) =====
  pauseTask: (toolTaskId: string) =>
    reqP<Record<string, any>>(`${P_M2M}/tasks/${toolTaskId}/pause`, { method: 'POST', headers: getHeaders() }),

  resumeTask: (toolTaskId: string) =>
    reqP<Record<string, any>>(`${P_M2M}/tasks/${toolTaskId}/resume`, { method: 'POST', headers: getHeaders() }),

  deleteTask: (toolTaskId: string) =>
    reqP<ChimeraDeleteResponse>(`${P_M2M}/tasks/${toolTaskId}`, { method: 'DELETE', headers: getHeaders() }),

  getTaskStatus: (toolTaskId: string) =>
    reqP<ChimeraTaskStatusDTO>(`${P_M2M}/tasks/${toolTaskId}`, { headers: getHeaders() }),

  createTask: (payload: ChimeraTaskRequest) =>
    reqP<ChimeraTaskCreateResponse>(`${P_M2M}/tasks`, {
      method: 'POST', headers: getHeaders(), body: JSON.stringify(payload),
    }),

  // ===== 基线(跨服务,:8000) =====
  listBaselineOptions: () =>
    reqB<BaselineOption[]>(`${B_API}/baselines`, { headers: getHeaders() }),

  getBaselineNodes: (baselineId: number) =>
    reqB<BaselineNodeOut[]>(`${B_API}/baselines/${baselineId}/nodes`, { headers: getHeaders() }),

  // ===== 元信息 =====
  getMe: () =>
    reqP<{ person_id: string; person_name: string; role: string }>(`${P_API}/me`, { headers: getHeaders() }),
};
