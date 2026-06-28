import { getHeaders, getAuthHeaders, handleResponse } from '../../../clients/base';
import type {
  BaselineWithProduct,
  BaselineDetail,
  BaselineUpdate,
  BaselinePreview,
  NodeOut,
  NodeCreate,
  NodeUpdate,
  OrgTreeNode,
  OrgNode,
  OrgNodeCreate,
  OrgNodeUpdate,
  SyncResult,
  LogOut,
  EventOut,
} from './types';

// 开发期直连后端;k8s 环境由运维设 VITE_SEC_BASELINE_API_BASE='' (空) 切换为相对路径,
// 经 ingress/gateway 路由到基线服务,前端代码无需改动。
const SEC_BASELINE_API_BASE =
  String(import.meta.env.VITE_SEC_BASELINE_API_BASE ?? 'http://localhost:8000');
const PREFIX = `${SEC_BASELINE_API_BASE}/api`;

// 网络层错误(后端离线/CORS/连接拒绝)中文化:fetch 直接抛 TypeError,
// 不进 handleResponse,故在此拦截并抛友好提示,页面 catch 后 showAlert。
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

function friendlyFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, init).catch((e) => {
    if (isNetworkError(e)) {
      throw new Error('无法连接基线服务,请检查后端是否启动(默认 localhost:8000)');
    }
    throw e;
  });
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await friendlyFetch(url, init);
  return handleResponse(response) as Promise<T>;
}

function withQuery(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const secBaselineApi = {
  // ===== 组织树 =====
  getOrgTree: () =>
    request<OrgTreeNode[]>(`${PREFIX}/product-org/tree`, { headers: getHeaders() }),

  createOrgNode: (payload: OrgNodeCreate) =>
    request<OrgNode>(`${PREFIX}/product-org`, {
      method: 'POST', headers: getHeaders(), body: JSON.stringify(payload),
    }),

  updateOrgNode: (nodeId: number, payload: OrgNodeUpdate) =>
    request<OrgNode>(`${PREFIX}/product-org/${nodeId}`, {
      method: 'PUT', headers: getHeaders(), body: JSON.stringify(payload),
    }),

  deleteOrgNode: (nodeId: number) =>
    request<void>(`${PREFIX}/product-org/${nodeId}`, { method: 'DELETE', headers: getHeaders() }),

  // ===== 基线 =====
  listBaselines: (params: { product_org_id?: number; keyword?: string; sync_status?: string } = {}) =>
    request<BaselineWithProduct[]>(`${PREFIX}/baselines${withQuery(params as any)}`, { headers: getHeaders() }),

  getBaseline: (id: number) =>
    request<BaselineDetail>(`${PREFIX}/baselines/${id}`, { headers: getHeaders() }),

  updateBaseline: (id: number, payload: BaselineUpdate) =>
    request<BaselineDetail>(`${PREFIX}/baselines/${id}`, {
      method: 'PUT', headers: getHeaders(), body: JSON.stringify(payload),
    }),

  deleteBaseline: (id: number) =>
    request<void>(`${PREFIX}/baselines/${id}`, { method: 'DELETE', headers: getHeaders() }),

  previewBaseline: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<BaselinePreview>(`${PREFIX}/baselines/preview`, {
      method: 'POST', headers: getAuthHeaders(), body: fd,
    });
  },

  downloadImportTemplate: async (): Promise<Blob> => {
    const response = await friendlyFetch(`${PREFIX}/baselines/import-template`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error(`下载模板失败 (${response.status})`);
    return response.blob();
  },

  createBaseline: (payload: {
    file: File;
    baseline_name?: string;
    baseline_name_en?: string;
    baseline_code?: string;
    category?: string;
    version?: string;
    product_org_id: number;
  }) => {
    const fd = new FormData();
    fd.append('file', payload.file);
    if (payload.baseline_name) fd.append('baseline_name', payload.baseline_name);
    if (payload.baseline_name_en) fd.append('baseline_name_en', payload.baseline_name_en);
    if (payload.baseline_code) fd.append('baseline_code', payload.baseline_code);
    if (payload.category) fd.append('category', payload.category);
    if (payload.version) fd.append('version', payload.version);
    fd.append('product_org_id', String(payload.product_org_id));
    return request<BaselineDetail>(`${PREFIX}/baselines`, {
      method: 'POST', headers: getAuthHeaders(), body: fd,
    });
  },

  // ===== 节点 =====
  listNodes: (baselineId: number) =>
    request<NodeOut[]>(`${PREFIX}/baselines/${baselineId}/nodes`, { headers: getHeaders() }),

  createNode: (baselineId: number, payload: NodeCreate) =>
    request<NodeOut>(`${PREFIX}/baselines/${baselineId}/nodes`, {
      method: 'POST', headers: getHeaders(), body: JSON.stringify(payload),
    }),

  updateNode: (baselineId: number, nodeId: number, payload: NodeUpdate) =>
    request<NodeOut>(`${PREFIX}/baselines/${baselineId}/nodes/${nodeId}`, {
      method: 'PUT', headers: getHeaders(), body: JSON.stringify(payload),
    }),

  deleteNode: (baselineId: number, nodeId: number) =>
    request<void>(`${PREFIX}/baselines/${baselineId}/nodes/${nodeId}`, { method: 'DELETE', headers: getHeaders() }),

  // ===== 同步 =====
  syncBaseline: (id: number) =>
    request<SyncResult>(`${PREFIX}/baselines/${id}/sync`, { method: 'POST', headers: getHeaders() }),

  // ===== 日志 / 事件 =====
  getLogs: (id: number) =>
    request<LogOut[]>(`${PREFIX}/baselines/${id}/logs`, { headers: getHeaders() }),

  getEvents: (id: number) =>
    request<EventOut[]>(`${PREFIX}/baselines/${id}/events`, { headers: getHeaders() }),

  // ===== 元信息 =====
  getMe: () =>
    request<{ person_id: string; person_name: string; role: string }>(`${PREFIX}/me`, { headers: getHeaders() }),
};
