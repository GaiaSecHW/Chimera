import { API_BASE, getAuthHeaders, getHeaders, handleResponse } from './base';

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
// mode 多选：dragon-tail(龙尾) / ram-horn(羊角) / lion-head(狮首)
export type ToolMode = 'dragon-tail' | 'ram-horn' | 'lion-head';
// upload_mode：archive(归档) / raw(原始)
export type ToolUploadMode = 'archive' | 'raw';

export interface ToolListItem {
  id: string;
  name: string;
  description?: string;
  kind: ToolKind;
  mode?: ToolMode[];
  upload_mode?: ToolUploadMode;
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
  model_alias_id?: number | null;
}

export interface ToolResponse {
  id: string;
  name: string;
  description?: string;
  kind: ToolKind;
  mode?: ToolMode[];
  upload_mode?: ToolUploadMode;
  status: ToolStatus;
  is_builtin: boolean;
  input_types?: ToolInputType[];
  submitted_by?: string;
  submitted_by_name?: string;
  reviewed_by?: string;
  reviewed_by_name?: string;
  review_note?: string;
  reviewed_at?: string;
  created_at?: string;
  updated_at?: string;
  microservice?: ToolMicroserviceDetail | null;
  agent?: ToolAgentDetail | null;
  health_status?: ToolHealthStatus;
}

/* 任务创建-agent harness 信息（kind=agent 时随 TaskCreateToolMenuItem 返回） */
export interface TaskCreateToolAgentInfo {
  agent_app_id: string;
  engine?: string;
  default_agent_name?: string;
  model_alias_id?: number | null;
  agent_harness_path?: string | null;
  agent_harness_repo_name?: string | null;
  agent_harness_gitea_url?: string | null;
  start_command?: string | null;
}

/* 任务创建-工具列表项（GET /api/tools/task-create-menu） */
export interface TaskCreateToolMenuItem {
  id: string;
  name: string;
  description?: string | null;
  kind: ToolKind;
  mode?: ToolMode[];
  upload_mode?: ToolUploadMode;
  task_type: string;          // = 工具 id，供调度中心建任务时作为任务类型标识
  input_types: ToolInputType[];
  icon?: string;
  order?: number;
  health_status?: ToolHealthStatus;
  agent?: TaskCreateToolAgentInfo | null;  // kind=agent 时返回，microservice 为 null
}

export interface TaskCreateToolMenuResponse {
  total: number;
  items: TaskCreateToolMenuItem[];
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
  model_alias_id?: number;
}

export interface ToolCreate {
  id: string;
  name: string;
  description?: string;
  kind: ToolKind;
  mode?: ToolMode[];
  upload_mode?: ToolUploadMode;
  input_types?: ToolInputType[];
  microservice?: ToolCreateMicroservice;
  agent?: ToolCreateAgent;
}

export interface ToolUpdate {
  name?: string;
  description?: string;
  input_types?: ToolInputType[];
  mode?: ToolMode[];
  upload_mode?: ToolUploadMode;
  microservice?: Partial<ToolCreateMicroservice>;
  agent?: Partial<ToolCreateAgent>;
}

// 创建工具参数（multipart/form-data，对齐后端 POST /api/tools 的 Form 字段）
export interface ToolCreateAgentParams {
  engine: string;
  default_agent_name: string;
  start_command?: string;
  input_requirements?: string;
  is_public: boolean;
  model_alias_id?: string;
}

export interface ToolCreateParams {
  id: string;
  name: string;
  description?: string;
  kind: ToolKind;
  mode?: ToolMode[];
  upload_mode?: ToolUploadMode;
  input_types?: ToolInputType[];
  view_id?: string;
  icon?: string;
  menu_group?: string;
  order?: number;
  catalog?: Record<string, unknown>;
  current_version?: string;
  microservice?: ToolCreateMicroservice;
  agent?: ToolCreateAgentParams;
  agent_harness_file?: File | null;
  agent_harness_file_type?: string;
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

  // 任务中心-创建任务工具列表（仅 online，全量返回，按 menu_group+order 排序）
  taskCreateMenu: async (): Promise<TaskCreateToolMenuResponse> => getJson('/task-create-menu'),

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

  // 五、注册工具（multipart/form-data：microservice 用 JSON 字段，agent 带 Harness 文件）
  create: async (params: ToolCreateParams): Promise<ToolResponse> => {
    const form = new FormData();
    form.append('kind', params.kind);
    form.append('id', params.id);
    form.append('name', params.name);
    if (params.description) form.append('description', params.description);
    if (params.input_types?.length) form.append('input_types', JSON.stringify(params.input_types));
    if (params.mode?.length) form.append('mode', JSON.stringify(params.mode));
    if (params.upload_mode) form.append('upload_mode', params.upload_mode);
    if (params.view_id) form.append('view_id', params.view_id);
    if (params.icon) form.append('icon', params.icon);
    if (params.menu_group) form.append('menu_group', params.menu_group);
    if (params.order != null) form.append('order', String(params.order));
    if (params.catalog) form.append('catalog', JSON.stringify(params.catalog));
    if (params.current_version) form.append('current_version', params.current_version);
    if (params.kind === 'microservice' && params.microservice) {
      form.append('microservice', JSON.stringify(params.microservice));
    } else if (params.kind === 'agent' && params.agent) {
      const a = params.agent;
      form.append('engine', a.engine);
      form.append('default_agent_name', a.default_agent_name);
      if (a.start_command) form.append('start_command', a.start_command);
      if (a.input_requirements) form.append('input_requirements', a.input_requirements);
      form.append('is_public', String(a.is_public));
      if (a.model_alias_id) form.append('model_alias_id', a.model_alias_id);
      if (params.agent_harness_file) {
        form.append('agent_harness_file', params.agent_harness_file);
        form.append('agent_harness_file_type', params.agent_harness_file_type || 'archive');
      }
    }
    return handleResponse(await fetch(`${TOOL_REGISTRY_BASE}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: form,
    })) as Promise<ToolResponse>;
  },

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

// toolid -> toolname 映射，供展示层把 reporter.name（toolid）翻译成人读名。
// 模块级缓存：成功后整会话复用；失败不缓存，下次调用自动重试。调用方对未命中项 fallback 原始 toolid 即可。
let _toolNameMapCache: Map<string, string> | null = null;
let _toolNameMapLoading: Promise<Map<string, string>> | null = null;

export async function getToolNameMap(): Promise<Map<string, string>> {
  if (_toolNameMapCache) return _toolNameMapCache;
  if (!_toolNameMapLoading) {
    _toolNameMapLoading = toolRegistryApi
      .list()
      .then(({ items }) => {
        const map = new Map<string, string>();
        for (const item of items || []) {
          if (item?.id && item.name) map.set(item.id, item.name);
        }
        _toolNameMapCache = map; // 仅缓存成功结果
        return map;
      })
      .catch(() => new Map<string, string>())
      .finally(() => {
        _toolNameMapLoading = null; // 允许失败后下次重试
      });
  }
  return _toolNameMapLoading;
}
