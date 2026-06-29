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
  // SS4: 整体态真相源 = aggregate_overall(三阶段 + deleted)。值域同 status
  // (building_*/completed/failed/accepted/deleted)。前端整体态消费方(横幅/
  // 地铁条/showCorrect)改读 overall;status 仅兼容 standalone 旧调用方。
  overall?: string;
  mode: string;
  db_name: string | null;
  error: string | null;
  progress?: CodemapBuildProgress | null;
  // 攻击入口识别(基础版)子阶段。status: running | done | failed(SS3 起四态,
  // 旧 ok 已并入 done;非阻塞,即便失败主构建仍继续 repair)。entries: 已识别攻击
  // 入口数(实时累计)。仅当该阶段已启动时后端才返回此字段。
  attack?: { status: string; entries: number } | null;
}

export interface CodemapTriggerResponse {
  task_id: string;
  status: string;
  overall?: string;
  db_name: string | null;
}

export interface CodemapServeResponse {
  db_name: string;
  ip: string;
  port: number;
  status: string;
}

// GET /uploads/{id}/audit/sources 的返回(直连 DozerDB,不起 serve)。入口识别
// 的状态 + 规模,供详情「知识图谱」框展示。graph_status:图生命周期
// (building/active/superseded/failed)。analysis:入口识别 headline(口径统一,
// 待办不计算):total 当前 kind/module 过滤下的源点条数 / attack_entries 攻击入口数
// (basic 判 YES 或拓扑提升顶,减折叠/人工否决,加人工确认)。scale:图规模指标
// (静态分析/修复阶段的真实产物,与入口数无关):functions 函数节点数 /
// files 文件节点数 / repaired_edges LLM 修复新建的 CALLS 边数 /
// repair_total 调用链修复进度分母(T1-T5 函数全集,排除 T6/excluded)/
// repair_done 已完成修复函数(complete + partial_complete,至少跑过一轮)。
// GET /uploads/{id}/build/analyze 的返回(SS1:构建状态模型按阶段拆分,静态分析
// 阶段独立接口)。analyze_status 是该阶段真相源(pending|running|done|failed);
// overall 是三阶段聚合出的对外整体态(沿用旧 status 值域,前端徽标只认它);
// scale.functions/files 由 manager 的 reconciler 收口进 task 行(读单行 O(1),
// 不查图;本地无 reconciler 时接口即时回退一次)。error 仅 failed 时有内容。
export interface CodemapBuildAnalyze {
  task_id: string;
  overall: string;
  analyze_status: string;   // pending | running | done | failed
  scale?: { functions: number; files: number };
  error: string | null;
}

// GET /uploads/{id}/build/repair 的返回(SS2:调用链修复阶段独立接口)。
// repair_status 是阶段真相源(pending|running|done|failed)。mode 决定前端口径:
// 增量(incremental)用 progress(分母=本次跑的 source 数,避免 50/50000 失真),
// 全量(full)用 scale 的 repair_done/repair_total。repair_total 是 analyze 末
// 封存的入队全集分母(repair 期间不重算);reconciler 只刷 repair_done 分子 +
// repaired_edges(LLM 新建 CALLS 边)。error 仅 failed 时有内容。
export interface CodemapBuildRepair {
  task_id: string;
  overall: string;
  repair_status: string;    // pending | running | done | failed
  mode: string;             // full | incremental
  progress: CodemapBuildProgress | null;
  repair_total: number;
  repair_done: number;
  repaired_edges: number;
  error: string | null;
}

// GET /uploads/{id}/build/attack-surface 的返回(SS3:攻击入口识别阶段独立接口)。
// attack_status 是阶段真相源(四态 pending|running|done|failed,旧 ok 已并入
// done)。entries 是全图绝对计数(同 count_attack_entries 口径,增量/全量不切口径,
// 取 manager 收口的 task 单行)。identification 是零-Cypher 的进展 headline。attack
// 非阻塞:failed 不带 error、不拖垮 overall;failed 但 entries>0 → 前端「结果可用
// (上次报错)」友好态。
export interface CodemapBuildAttackSurface {
  task_id: string;
  overall: string;
  attack_status: string | null;   // pending | running | done | failed
  entries: number;
  identification: { state: string; attack_status: string | null };
}

export interface CodemapAuditSources {
  db_name: string;
  graph_status: string;
  analysis: {    total: number;
    attack_entries: number;
  };
  scale?: {
    functions: number;
    files: number;
    repaired_edges: number;
    repair_total?: number;
    repair_done?: number;
  };
  total: number;
}


export const codemapManagerApi = {
  // POST /uploads/{id}/build — 提交构建(SS5 uploads 化,幂等按 PK + 未软删放行)。
  // task_id 由后端从 upload_id 合成(kg-<id>),前端不再传。target_dir 是 manager
  // 可见的文件系统路径(与 fileserver 共享卷)。多图谱:manager 据 upload_id 走
  // 匹配→clone→增量。返回 { task_id, overall, db_name }。
  triggerBuild: async (payload: {
    upload_id: string;
    product_id: string;
    product_name: string;
    target_dir: string;
    project_id?: string;
    mode?: string;
  }): Promise<CodemapTriggerResponse> => {
    const { upload_id, ...body } = payload;
    const response = await fetch(
      `${MANAGER_BASE}/uploads/${encodeURIComponent(upload_id)}/build`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(body),
      });
    return handleResponse(response);
  },

  // GET /tasks/{id} — 查询整体构建状态(overall + repair 进度 + attack 子阶段)。
  // 供地铁条/横幅取"整体到哪了";单阶段详情走 getBuildAnalyze/AttackSurface/Repair。
  // SS5: 入参改 uploadId,kg- 合成在内部。404=尚未构建(调用方区分"未构建")。
  // 轮询场景带 no-dedupe 绕过 base.ts 的 GET 去重缓存。
  getTaskStatus: async (uploadId: string): Promise<CodemapTaskStatus> => {
    const taskId = _buildTaskId(uploadId);
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

  // DELETE /uploads/{id}/build — 软删除构建(SS5):置 deleted 标记、杀进程组、归还
  // key,保留库/目录/task 行。前端紧接 setCodemapStatus(null) 即可让自动派发 effect
  // 用当前正确的 target_path 重派(POST 对 deleted 行放行)。与 purgeByUpload(销毁
  // 式)严格区分。
  deleteBuild: async (uploadId: string): Promise<void> => {
    const response = await fetch(
      `${MANAGER_BASE}/uploads/${encodeURIComponent(uploadId)}/build`,
      { method: 'DELETE', headers: getHeaders() },
    );
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

  // GET /uploads/{id}/build/analyze — 静态分析阶段独立接口(SS1)。读 manager
  // task 单行(O(1),稳态不查图):阶段态 analyze_status + 规模 scale.functions/
  // files + 聚合 overall。404=尚未构建。轮询带 no-dedupe 绕过 GET 去重缓存。
  getBuildAnalyze: async (uploadId: string): Promise<CodemapBuildAnalyze> => {
    const response = await fetch(
      `${MANAGER_BASE}/uploads/${encodeURIComponent(uploadId)}/build/analyze`,
      { headers: { ...getHeaders(), 'x-chimera-no-request-dedupe': '1' } },
    );
    return handleResponse(response);
  },

  // GET /uploads/{id}/build/repair — 调用链修复阶段独立接口(SS2)。读 manager
  // task 单行(O(1)):阶段态 repair_status + mode + progress 快照 + 封存/同步的
  // scale(repair_total/repair_done/repaired_edges)。404=尚未构建。轮询带
  // no-dedupe 绕过 GET 去重缓存。
  getBuildRepair: async (uploadId: string): Promise<CodemapBuildRepair> => {
    const response = await fetch(
      `${MANAGER_BASE}/uploads/${encodeURIComponent(uploadId)}/build/repair`,
      { headers: { ...getHeaders(), 'x-chimera-no-request-dedupe': '1' } },
    );
    return handleResponse(response);
  },

  // GET /uploads/{id}/build/attack-surface — 攻击入口识别阶段独立接口(SS3)。
  // 读 manager task 单行(O(1)):attack_status + entries(全图绝对计数)+ 零-
  // Cypher 的 identification headline。404=尚未构建。轮询带 no-dedupe。
  getBuildAttackSurface: async (uploadId: string): Promise<CodemapBuildAttackSurface> => {
    const response = await fetch(
      `${MANAGER_BASE}/uploads/${encodeURIComponent(uploadId)}/build/attack-surface`,
      { headers: { ...getHeaders(), 'x-chimera-no-request-dedupe': '1' } },
    );
    return handleResponse(response);
  },

  // POST /uploads/{id}/build/attack-surface — 只重跑攻击入口识别(不动 repair),
  // 回写 attack_status(running→done/failed)。也是「手动 /sources/run 后 manager
  // 状态停在 failed」的恢复出口。building 中后端返回 409。
  reidentify: async (uploadId: string): Promise<void> => {
    const response = await fetch(
      `${MANAGER_BASE}/uploads/${encodeURIComponent(uploadId)}/build/attack-surface`,
      { method: 'POST', headers: getHeaders() },
    );
    await handleResponse(response);
  },

  // POST /uploads/{id}/build/repair — 只重跑 repair(跳过 analyze;已修 gap 跳过,
  // 不浪费 token),与攻击面重跑互相独立。building 中后端返回 409。
  rerepair: async (uploadId: string): Promise<void> => {
    const response = await fetch(
      `${MANAGER_BASE}/uploads/${encodeURIComponent(uploadId)}/build/repair`,
      { method: 'POST', headers: getHeaders() },
    );
    await handleResponse(response);
  },
};

// 知识图谱身份下沉到「每条代码上传一图」(多图谱模型)。task_id = kg-<uploadId>
// 是 manager 内部寻址用的合成 id;SS5 起前端只传 upload_id,合成下沉到本模块内部
// (不再对外导出)。被 superseded 的历史上传点进去即历史快照。
const _buildTaskId = (uploadId: string): string => `kg-${uploadId}`;

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
