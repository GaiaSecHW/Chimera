// 安全评估项目管理 — 后端 schema 镜像(见后端 app/schemas/)

// ===== 枚举 =====
export type ProjectStatus =
  | 'planning' | 'queued' | 'executing' | 'paused'
  | 'cancelled' | 'completed' | 'failed' | 'deleted';

export type ExecuteStatus = 'un_start' | 'pending' | 'executing' | 'finish';

export type ExecuteResult = 'PASS' | 'PARTIAL' | 'FAIL' | 'N_A' | 'MANUAL_REVIEW';

export type Confidence = 'high' | 'medium' | 'low';

export type SyncStatus = 'unsync' | 'syncing' | 'synced' | 'sync_failed';

export type WorkerStatus = 'online' | 'draining' | 'offline';

export type AgentEngineType = 'opencode' | 'opencode-serve' | 'ClaudeCode';

export type TimeoutUnit = 'second' | 'minute' | 'hour' | 'day';

export type NodeType = 'level1' | 'level2' | 'item';

// ===== 项目 =====
export interface ProjectListItem {
  id: number;
  uuid: string;
  project_name: string;
  chimera_need_taskId: string;
  project_status: ProjectStatus;
  baseline_id: number;
  baseline_name?: string | null;
  executor?: string | null;
  environment?: string | null;
  priority: number;
  retry_count: number;
  compliance_rate?: number | null;
  sync_status: SyncStatus;
  create_time?: string | null;
}

export interface ProjectDetail {
  id: number;
  uuid: string;
  project_name: string;
  project_status: ProjectStatus;
  chimera_need_taskId: string;
  baseline_id: number;
  baseline_uuid: string;
  baseline_name?: string | null;
  environment?: string | null;
  executor?: string | null;
  worker_id?: number | null;
  worker_name?: string | null;
  priority: number;
  retry_count: number;
  claim_version: number;
  chimera_env?: Record<string, any> | null;
  config_snapshot?: Record<string, any> | null;
  checkpoint?: Record<string, { status: string; artifacts?: string[] }> | null;
  error_message?: string | null;
  total_items?: number | null;
  finish_count?: number | null;
  compliance_rate?: number | null;
  sync_status: SyncStatus;
  create_time?: string | null;
}

// ===== 评估结果 =====
export interface ExecutionResult {
  id: number;
  uuid: string;
  project_id: number;
  baseline_id?: number | null;
  item_node_id: number;
  item_code?: string | null;
  execute_status: ExecuteStatus;
  execute_result?: ExecuteResult | null;
  confidence?: Confidence | null;
  summary?: string | null;
  recommendation?: string | null;
  evidence_set?: any;
  counter_evidence?: any;
  gaps?: any;
  configuration_dependency?: any;
  executor?: string | null;
  executed_time?: string | null;
  sync_status: SyncStatus;
}

export interface ExecutionUpdate {
  execute_result?: ExecuteResult | null;
  confidence?: Confidence | null;
  summary?: string | null;
  recommendation?: string | null;
  evidence_set?: any;
  counter_evidence?: any;
  gaps?: any;
  configuration_dependency?: any;
}

// ===== Worker =====
export interface WorkerInfo {
  id: number;
  uuid: string;
  worker_name: string;
  worker_status: WorkerStatus;
  current_project_id?: number | null;
  current_project_uuid?: string | null;
  last_heartbeat_time?: string | null;
  create_time?: string | null;
}

export interface DrainResponse {
  worker_name: string;
  worker_status: string;
  message: string;
}

// ===== 配置 =====
export interface SystemConfigRead {
  max_retry: number;
  max_agent_exec_count: number;
  concurrency: number;
  max_timeout_value: number;
  max_timeout_unit: TimeoutUnit;
  agent_engine_type: AgentEngineType;
  tool_type: string;
  update_time?: string | null;
  person_id?: string | null;
  person_name?: string | null;
}

export interface SystemConfigUpdate {
  max_retry?: number;
  max_agent_exec_count?: number;
  concurrency?: number;
  max_timeout_value?: number;
  max_timeout_unit?: TimeoutUnit;
  agent_engine_type?: AgentEngineType;
  tool_type?: string;
}

// ===== 同步 / 日志 / 事件 =====
export interface SyncResult {
  project_id: number;
  sync_status: SyncStatus;
  synced_executions: number;
  failed_executions: number;
  message: string;
}

export interface OperationLogItem {
  id: number;
  uuid: string;
  project_id: number;
  target_table: string;
  target_id: number;
  action: string;
  action_detail?: string | null;
  person_id?: string | null;
  person_name?: string | null;
  create_time?: string | null;
}

export interface EventItem {
  id: number;
  uuid: string;
  project_id: number;
  target_table: string;
  target_id: number;
  event_type: string;
  from_status?: string | null;
  to_status?: string | null;
  event_detail?: string | null;
  person_id?: string | null;
  person_name?: string | null;
  create_time?: string | null;
}

// ===== M2M Chimera 接口 =====
export interface ChimeraTaskRequest {
  project_id: string;
  task_id: string;
  task_name?: string | null;
  file_path: string;
  key: string;
  baseline_id: number;
  executor?: string | null;
  environment?: string | null;
  priority?: number;
  [key: string]: any;
}

export interface ChimeraTaskCreateResponse {
  tool_task_id: string;
}

export interface ChimeraTaskListItem {
  tool_task_id: string;
  status: string;
  project_name?: string | null;
  created_time?: string | null;
}

export interface ChimeraTaskListResponse {
  items: ChimeraTaskListItem[];
  total: number;
}

export interface ChimeraTaskStatusDTO {
  tool_task_id: string;
  status: string;
  progress?: Record<string, any> | null;
  created_time?: string | null;
  started_time?: string | null;
  completed_time?: string | null;
  error_message?: string | null;
}

export interface ChimeraDeleteResponse {
  tool_task_id: string;
  status: string;
  message: string;
}

// ===== 基线节点(跨服务,:8000,镜像 sec-baseline-mgmt/types.ts 子集) =====
export interface BaselineNodeOut {
  id: number;
  uuid: string;
  baseline_id: number;
  parent_id?: number | null;
  parent_uuid?: string | null;
  node_type: NodeType;
  code?: string | null;
  name: string;
  name_en?: string | null;
  objective?: string | null;
  description?: string | null;
  verification?: string | null;
  priority?: string | null;
  is_key_ability?: boolean | null;
  sources?: any;
  sort_order?: number | null;
}

export interface BaselineOption {
  id: number;
  uuid: string;
  baseline_name: string;
  baseline_code?: string | null;
  version?: string | null;
  category?: string | null;
  product_org_id?: number;
  product_org_name?: string | null;
  bg_name?: string | null;
  bu_name?: string | null;
  total_items?: number | null;
}

// 基线节点(扁平;来自项目服务 GET /api/projects/{id}/baseline-tree)
export interface BaselineNodeItem {
  id: number;
  uuid: string;
  parent_id?: number | null;
  node_type: NodeType;
  code?: string | null;
  name: string;
  priority?: string | null;
  is_key_ability?: boolean | null;
  sort_order?: number | null;
}

export interface BaselineTreeResponse {
  baseline_id: number;
  baseline_uuid: string;
  baseline_name: string;
  version?: string | null;
  nodes: BaselineNodeItem[];
}
