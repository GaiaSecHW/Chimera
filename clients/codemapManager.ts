import { API_BASE, getHeaders, handleResponse } from './base';

// codemap-lite manager 客户端。后端是独立的 FastAPI 服务(:8090),经 nginx
// 反代挂在 /api/codemap-manager/ 下(尾斜杠剥前缀,见 nginx-secflow-debug.conf)。
// 知识图谱标签按需调用:查/触发 analyze+repair 构建,完成后起 per-project serve。
const MANAGER_BASE = `${API_BASE}/api/codemap-manager`;

export interface CodemapBuildProgressSource {
  source_id: string;
  state: string;
  gaps_fixed?: number;
  gaps_total?: number;
}

export interface CodemapBuildProgress {
  total: number;
  completed: number;
  failed: number;
  sources?: CodemapBuildProgressSource[];
}

// GET /tasks/{id} 的返回。status: queued | accepted | building_analyze |
// building_repair | completed | failed | paused | deleted。
export interface CodemapTaskStatus {
  task_id: string;
  status: string;
  mode: string;
  db_name: string | null;
  error: string | null;
  progress?: CodemapBuildProgress | null;
}

export interface CodemapTriggerResponse {
  task_id: string;
  status: string;
  db_name: string | null;
}

export interface CodemapServeResponse {
  db_name: string;
  ip: string;
  port: number;
  status: string;
}

export const codemapManagerApi = {
  // POST /tasks — 提交构建(按 task_id 幂等)。target_dir 是 manager 可见的
  // 文件系统路径(与 fileserver 共享卷),来自 fileserver 的 resolve.target_path。
  triggerBuild: async (payload: {
    task_id: string;
    product_id: string;
    product_name: string;
    target_dir: string;
    mode?: string;
  }): Promise<CodemapTriggerResponse> => {
    const response = await fetch(`${MANAGER_BASE}/tasks`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  // GET /tasks/{id} — 查询构建状态 + repair 进度。任务不存在时后端返回 404,
  // handleResponse 会 throw(error.status === 404),由调用方区分“尚未构建”。
  // 轮询场景:带 x-chimera-no-request-dedupe 绕过 base.ts 的 GET 去重缓存。
  getTaskStatus: async (taskId: string): Promise<CodemapTaskStatus> => {
    const response = await fetch(`${MANAGER_BASE}/tasks/${encodeURIComponent(taskId)}`, {
      headers: { ...getHeaders(), 'x-chimera-no-request-dedupe': '1' },
    });
    return handleResponse(response);
  },

  // POST /projects/{db}/serve — 起(或复用)per-project serve 子进程,返回
  // ip:port。前端拿 ip:port 直连 serve 的静态页(浏览器须能直达该地址)。
  startServe: async (dbName: string): Promise<CodemapServeResponse> => {
    const response = await fetch(`${MANAGER_BASE}/projects/${encodeURIComponent(dbName)}/serve`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },
};
