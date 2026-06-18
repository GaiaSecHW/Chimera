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

  // DELETE /tasks/{id} — 清掉脏 task(例如 422 拒绝 / 0 函数失败后),前端紧接
  // setCodemapStatus(null) 即可让自动派发 effect 用当前正确的 target_path 重派。
  deleteTask: async (taskId: string): Promise<void> => {
    const response = await fetch(`${MANAGER_BASE}/tasks/${encodeURIComponent(taskId)}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    await handleResponse(response);
  },

  // DELETE /projects/{db}/purge — 销毁式清理:停 serve、DROP 空库、删 manager
  // 工作区目录、清 registry 行。用户在「图谱为空」横幅点「更正代码目录」时调用,
  // 让接下来的 triggerBuild 用正确 target_dir 从零重建。注意:只读卷上的用户
  // 上传源码绝不会被动到,只清 manager 自己的 workspace + 图谱 DB。
  purgeProject: async (dbName: string): Promise<void> => {
    const response = await fetch(
      `${MANAGER_BASE}/projects/${encodeURIComponent(dbName)}/purge`,
      { method: 'DELETE', headers: getHeaders() },
    );
    await handleResponse(response);
  },
};

// 知识图谱构建是项目维度、幂等的:固定 task_id = kg-<projectId>,product_id=projectId
// → manager 算出的 db_name 不变 → 一个项目始终一张图。KnowledgeGraphPage 与
// TestInputPage 都用同一份 task_id,确保切 tab 不会重复派发(POST /tasks 幂等兜底)。
export const buildCodemapTaskId = (projectId: string): string => `kg-${projectId}`;

// manager 读取代码的文件系统根。manager 挂载了平台 fileserver 的共享卷到 /data,
// 上传代码物理路径是 /data/files/<projectId>/<target_path>;而 fileserver API 返回的
// target_path 只是 /user_input/code/<id>(缺前缀)。这里补全成 manager 视角的绝对路径。
export const MANAGER_SOURCE_ROOT = '/data/files';
export const buildManagerTargetDir = (projectId: string, targetPath: string): string =>
  `${MANAGER_SOURCE_ROOT}/${projectId}${targetPath.startsWith('/') ? '' : '/'}${targetPath}`;

// manager FSM 仍在进行的状态;completed/failed/paused/deleted 为终态(不再轮询)。
export const IN_PROGRESS_STATUSES: ReadonlySet<string> = new Set([
  'queued',
  'accepted',
  'building_analyze',
  'building_repair',
]);

// fileserver 上传记录里"文件已落盘、可被 analyze 扫描"的状态。
// 派发 manager 任务前必须命中其一,否则 analyze 扫到空目录直接失败。
export const USABLE_UPLOAD_STATUSES: ReadonlySet<string> = new Set([
  'succeeded',
  'partial_failed',
]);

// 长文案,用于 KnowledgeGraphPage 的顶部横幅(空间充足)。
export const STATUS_LABELS: Record<string, string> = {
  queued: '排队中',
  accepted: '静态分析中…',
  building_analyze: '解析代码中',
  building_repair: '补全调用关系中',
  completed: '已完成',
  failed: '构建失败',
};

// 短文案,用于 TestInputPage 行内 chip(表格"操作"列空间紧张)。
export const STATUS_LABELS_SHORT: Record<string, string> = {
  queued: '排队中',
  accepted: '静态分析中',
  building_analyze: '静态分析中',
  building_repair: '调用链修复中',
  completed: '已完成',
  failed: '失败',
};
