import { API_BASE, getHeaders, handleResponse } from './base';

// Tool Registry API client.
// Spec: see doc/API-AgentApps.md / 工具注册中心 接口文档.
// Base path `/api/tools` is routed in dev by the catch-all `/api` vite proxy
// (vite.config.ts) to the secflow gateway, which forwards to
// `secflow-tool-registry`. No dedicated proxy entry required.

const TOOL_REGISTRY_BASE = `${API_BASE}/api/tools`;

export type ToolKind = 'microservice' | 'agent';
export type ToolStatus = 'draft' | 'pending' | 'online' | 'offline';
export type ToolHealthStatus = 'healthy' | 'unhealthy' | 'unknown';
export type ToolInputType = 'document' | 'code' | 'package' | 'other';

export interface ToolListItem {
  id: string;
  name: string;
  description?: string;
  kind: ToolKind;
  status: ToolStatus;
  is_builtin: boolean;
  input_types?: ToolInputType[];
  submitted_by?: string;
  submitted_by_name?: string;
  view_id?: string;
  icon?: string;
  menu_group?: string;
  order?: number;
  catalog?: Record<string, unknown> | null;
  current_version?: string;
  health_status?: ToolHealthStatus;
  created_at?: string;
  updated_at?: string;
}

export interface ToolMicroserviceDetail {
  tool_id?: string;
  namespace?: string;
  deployment?: string;
  api_prefix?: string;
  health_path?: string;
  service_port?: number;
  view_id?: string;
  icon?: string;
  menu_group?: string;
  order?: number;
  catalog?: Record<string, unknown> | null;
  current_version?: string;
  health_status?: ToolHealthStatus;
  last_health_check?: string;
}

export interface ToolAgentDetail {
  tool_id?: string;
  agent_app_id?: string;
  name?: string;
  engine?: string;
  agent_harness_gitea_url?: string;
  start_command?: string;
  input_requirements?: string;
  default_agent_name?: string;
  is_public?: boolean;
  agent_status?: string;
  view_id?: string;
  icon?: string;
  menu_group?: string;
  order?: number;
  catalog?: Record<string, unknown> | null;
  current_version?: string;
}

export interface ToolResponse {
  id: string;
  name: string;
  description?: string;
  kind: ToolKind;
  status: ToolStatus;
  is_builtin: boolean;
  input_types?: ToolInputType[];
  submitted_by?: string;
  submitted_by_name?: string;
  reviewed_by?: string;
  review_note?: string;
  reviewed_at?: string;
  created_at?: string;
  updated_at?: string;
  microservice?: ToolMicroserviceDetail | null;
  agent?: ToolAgentDetail | null;
  health_status?: ToolHealthStatus;
}

export interface ProbeTestResponse {
  reachable: boolean;
  url?: string;
  status_code?: number;
  reason?: string;
  elapsed_ms?: number;
}

export interface ToolReviewRecord {
  id: string;
  tool_id: string;
  action: 'submit' | 'approve' | 'reject';
  from_status?: ToolStatus;
  to_status?: ToolStatus;
  operator?: string;
  note?: string;
  created_at?: string;
}

export interface ToolOperationLog {
  id: string;
  tool_id: string;
  action: 'online' | 'offline' | 'edit_online';
  operator?: string;
  note?: string;
  created_at?: string;
}

export interface ToolCreateMicroservice {
  namespace: string;
  deployment: string;
  api_prefix: string;
  health_path: string;
  service_port: number;
  view_id: string;
  icon?: string;
  menu_group?: string;
  order?: number;
  catalog?: Record<string, unknown>;
  current_version?: string;
}

export interface ToolCreateAgent {
  engine: string;
  agent_harness_gitea_url: string;
  start_command?: string;
  input_requirements?: string;
  default_agent_name: string;
  is_public: boolean;
  view_id: string;
  icon?: string;
  menu_group?: string;
  order?: number;
  current_version?: string;
}

export interface ToolCreate {
  id: string;
  name: string;
  description?: string;
  kind: ToolKind;
  input_types?: ToolInputType[];
  microservice?: ToolCreateMicroservice;
  agent?: ToolCreateAgent;
}

export interface ToolUpdate {
  name?: string;
  description?: string;
  input_types?: ToolInputType[];
  microservice?: Partial<ToolCreateMicroservice>;
  agent?: Partial<ToolCreateAgent>;
}

export interface ProbeTestRequest {
  namespace: string;
  deployment: string;
  service_port: number;
  health_path: string;
}

interface ListResponse<T> { total: number; items: T[] }
interface PaginatedListResponse<T> { total: number; page: number; page_size: number; total_pages: number; items: T[] }

const buildQuery = (params?: Record<string, string | number | undefined | null>): string => {
  if (!params) return '';
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value !== undefined && value !== null) query.set(key, String(value));
  });
  const qs = query.toString();
  return qs ? `?${qs}` : '';
};

const postJson = async <T,>(path: string, body: unknown): Promise<T> =>
  handleResponse(await fetch(`${TOOL_REGISTRY_BASE}${path}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  })) as Promise<T>;

const putJson = async <T,>(path: string, body: unknown): Promise<T> =>
  handleResponse(await fetch(`${TOOL_REGISTRY_BASE}${path}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(body),
  })) as Promise<T>;

const getJson = async <T,>(path: string): Promise<T> =>
  handleResponse(await fetch(`${TOOL_REGISTRY_BASE}${path}`, { headers: getHeaders() })) as Promise<T>;

export const toolRegistryApi = {
  // 一、工具列表
  list: async (params?: { status?: ToolStatus; kind?: ToolKind; group?: string }): Promise<ListResponse<ToolListItem>> =>
    getJson(buildQuery(params)),

  listMenu: async (group?: string): Promise<ListResponse<ToolListItem>> =>
    getJson(`/menu${buildQuery(group ? { group } : undefined)}`),

  listMine: async (params?: { status?: ToolStatus; kind?: ToolKind; page?: number; page_size?: number }): Promise<PaginatedListResponse<ToolListItem>> =>
    getJson(`/my${buildQuery(params as Record<string, string | number | undefined | null>)}`),

  listPending: async (): Promise<ListResponse<ToolListItem>> => getJson('/pending'),

  listOverview: async (): Promise<ListResponse<ToolResponse>> => getJson('/overview'),

  get: async (id: string): Promise<ToolResponse> => getJson(`/${encodeURIComponent(id)}`),

  // 二、审批/操作记录
  listReviews: async (id: string): Promise<ListResponse<ToolReviewRecord>> => getJson(`/${encodeURIComponent(id)}/reviews`),
  listLogs: async (id: string): Promise<ListResponse<ToolOperationLog>> => getJson(`/${encodeURIComponent(id)}/logs`),

  // 四、探活连通性调试
  probeTest: async (payload: ProbeTestRequest): Promise<ProbeTestResponse> => postJson('/probe-test', payload),

  // 五、注册工具
  create: async (payload: ToolCreate): Promise<ToolResponse> => postJson('', payload),

  // 六、改信息
  update: async (id: string, payload: ToolUpdate): Promise<ToolResponse> => putJson(`/${encodeURIComponent(id)}`, payload),

  // 七、重新提交
  submit: async (id: string): Promise<{ id: string; status: ToolStatus; message: string }> => postJson(`/${encodeURIComponent(id)}/submit`, {}),

  // 八、审核
  review: async (id: string, payload: { action: 'approve' | 'reject'; review_note?: string }): Promise<ToolResponse> =>
    postJson(`/${encodeURIComponent(id)}/review`, payload),

  // 九、下架
  offline: async (id: string, payload?: { reason?: string }): Promise<ToolResponse> =>
    postJson(`/${encodeURIComponent(id)}/offline`, payload ?? {}),

  // 十、上架
  online: async (id: string): Promise<ToolResponse> => postJson(`/${encodeURIComponent(id)}/online`, {}),
};
