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
// building_attack_surface | building_repair | completed | failed | paused | deleted。
export interface CodemapTaskStatus {
  task_id: string;
  status: string;
  mode: string;
  db_name: string | null;
  error: string | null;
  progress?: CodemapBuildProgress | null;
  // 攻击入口识别(基础版)子阶段。status: running | ok | failed(非阻塞,
  // 即便失败主构建仍继续 repair)。entries: 已识别攻击入口数(实时累计)。
  // 仅当该阶段已启动时后端才返回此字段。
  attack?: { status: string; entries: number } | null;
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

// GET /uploads/{id}/audit/sources 的返回(直连 DozerDB,不起 serve)。入口识别
// 的状态分桶 + 规模,供详情「知识图谱」框展示。graph_status:图生命周期
// (building/active/superseded/failed)。analysis:入口识别分桶(NOT repair):
// identified 已判为入口 / pending 有 SP 未判 / confirmed|rejected 人工裁决。
// total:当前 kind/module 过滤下的源点条数(默认全量)。scale:图规模指标
// (静态分析/修复阶段的真实产物,与入口数无关):functions 函数节点数 /
// files 文件节点数 / repaired_edges LLM 修复新建的 CALLS 边数。
export interface CodemapAuditSources {
  db_name: string;
  graph_status: string;
  analysis: {
    total: number;
    identified: number;
    pending: number;
    confirmed: number;
    rejected: number;
  };
  scale?: {
    functions: number;
    files: number;
    repaired_edges: number;
  };
  total: number;
}


export const codemapManagerApi = {
  // POST /tasks — 提交构建(按 task_id 幂等)。target_dir 是 manager 可见的
  // 文件系统路径(与 fileserver 共享卷),来自 fileserver 的 resolve.target_path。
  // 多图谱(每条上传一图):task_id=kg-<uploadId>,携带真 product_id(空回退
  // projectId)、project_id、upload_id,manager 据 upload_id 走匹配→clone→增量。
  triggerBuild: async (payload: {
    task_id: string;
    product_id: string;
    product_name: string;
    target_dir: string;
    project_id?: string;
    upload_id?: string;
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

  // DELETE /projects/by-upload/{uploadId}/purge — 删某个代码上传时同步删它对应的
  // DozerDB 图库(按 uploadId 寻址,前端无需知道 db_name)。manager 会停掉在跑的
  // 构建、记删除意图台账、即时尽力删库;即使即时删失败(deferred),后台清道夫也会
  // 兜底,保证该库最终被删。best-effort:删源码主流程不应被它阻断。
  purgeByUpload: async (uploadId: string): Promise<void> => {
    const response = await fetch(
      `${MANAGER_BASE}/projects/by-upload/${encodeURIComponent(uploadId)}/purge`,
      { method: 'DELETE', headers: getHeaders() },
    );
    await handleResponse(response);
  },

  // GET /uploads/{id}/audit/sources — 入口识别状态分桶 + 规模(manager 直连
  // DozerDB,不起 serve)。详情「知识图谱」框的入口分析块取这里。轮询场景带
  // no-dedupe 绕过 base.ts 的 GET 去重缓存。
  getAuditSources: async (uploadId: string): Promise<CodemapAuditSources> => {
    const response = await fetch(
      `${MANAGER_BASE}/uploads/${encodeURIComponent(uploadId)}/audit/sources`,
      { headers: { ...getHeaders(), 'x-chimera-no-request-dedupe': '1' } },
    );
    return handleResponse(response);
  },

  // POST /uploads/{id}/reidentify — 只重跑攻击入口识别(不动 repair),回写
  // attack_status(running→ok/failed)。也是「手动 /sources/run 后 manager 状态
  // 停在 failed」的恢复出口。building 中后端返回 409。
  reidentify: async (uploadId: string): Promise<void> => {
    const response = await fetch(
      `${MANAGER_BASE}/uploads/${encodeURIComponent(uploadId)}/reidentify`,
      { method: 'POST', headers: getHeaders() },
    );
    await handleResponse(response);
  },

  // POST /uploads/{id}/rerepair — 只重跑 repair(跳过 analyze;已修 gap 跳过,
  // 不浪费 token),与攻击面重跑互相独立。building 中后端返回 409。
  rerepair: async (uploadId: string): Promise<void> => {
    const response = await fetch(
      `${MANAGER_BASE}/uploads/${encodeURIComponent(uploadId)}/rerepair`,
      { method: 'POST', headers: getHeaders() },
    );
    await handleResponse(response);
  },
};

// 知识图谱身份下沉到「每条代码上传一图」(多图谱模型)。task_id = kg-<uploadId>,
// 每条 code 上传记录各自独立的构建状态与图;被 superseded 的历史上传点进去即历史
// 快照。manager 据 upload_id 在该 product 的 active 图里按路径相似度匹配,命中则
// clone 源图 + 增量复用,未命中则全量新建。KnowledgeGraphPage 与 TestInputPage
// 都用同一 uploadId 算 task_id,切 tab 不重复派发(POST /tasks 幂等兜底)。
export const buildCodemapTaskId = (uploadId: string): string => `kg-${uploadId}`;

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
  'building_attack_surface',
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
  accepted: '已受理',
  building_analyze: '静态分析中…',
  building_attack_surface: '攻击入口识别中…',
  building_repair: '补全调用关系中',
  completed: '已完成',
  failed: '构建失败',
};

// 短文案,用于 TestInputPage 行内 chip(表格"操作"列空间紧张)。
export const STATUS_LABELS_SHORT: Record<string, string> = {
  queued: '排队中',
  accepted: '已受理',
  building_analyze: '静态分析中',
  building_attack_surface: '攻击入口识别中',
  building_repair: '调用链修复中',
  completed: '已完成',
  failed: '失败',
};
