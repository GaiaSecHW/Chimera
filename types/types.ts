
export type MenuStatus = 'available' | 'development' | 'planning';

export interface DynamicMenuItem {
  id: string;
  label: string;
  status: MenuStatus;
  children?: DynamicMenuItem[];
}

export interface UserInfo {
  id: number;
  username: string;
  is_active: boolean;
  role: string[];
  platform_role?: 'super_admin' | 'ordinary_admin' | 'ordinary_user';
  department_member_id?: number | null;
  department_id?: number | null;
  department_name?: string | null;
  created_at?: string;
  updated_at?: string;
}

// --- Workflow Service Types ---

export type WorkflowStatus = 'pending' | 'unready' | 'ready' | 'running' | 'succeeded' | 'failed' | 'stopped';
export type AppWorkflowStatus = 'pending' | 'unready' | 'ready';
export type AppNodeStatus = 'pending' | 'not_ready' | 'ready' | 'stopped' | 'failed';
export type TemplateScope = 'global' | 'project';
export type NodeType = 'app' | 'job';

export interface VolumeMount {
  pvc_name: string;
  mount_path: string;
  sub_path?: string;
  read_only?: boolean;
}

export interface EnvVarInput {
  name: string;
  source_key: string;
  default_value?: string;
}

export interface EnvVarOutput {
  name: string;
  description?: string;
}

export interface VolumeMountInput {
  mount_path: string;
  sub_path?: string;
  read_only?: boolean;
}

export interface VolumeMountOutput {
  mount_path: string;
  sub_path?: string;
  description?: string;
}

export interface ResourceRequirements {
  requests?: { cpu?: string; memory?: string };
  limits?: { cpu?: string; memory?: string };
}

export interface HealthCheck {
  type: 'http' | 'tcp' | 'exec';
  port?: number;
  path?: string;
  command?: string[];
  initial_delay_seconds?: number;
  period_seconds?: number;
  timeout_seconds?: number;
  failure_threshold?: number;
  success_threshold?: number;
}

export interface WorkflowContainer {
  name: string;
  image: string;
  command?: string[];
  args?: string[];
  env_vars?: Array<{ name: string; value: string }>;
  volume_mounts?: VolumeMount[];
  input_env_vars?: EnvVarInput[];
  input_volume_mounts?: VolumeMountInput[];
  output_env_vars?: EnvVarOutput[];
  output_volume_mounts?: VolumeMountOutput[];
  privileged?: boolean;
  image_pull_policy?: 'Always' | 'IfNotPresent' | 'Never';
  resources?: ResourceRequirements;
  liveness_probe?: HealthCheck;
  readiness_probe?: HealthCheck;
}

export interface ServicePort {
  name: string;
  port: number;
  target_port: number;
  protocol?: string;
}

export interface AppTemplate {
  id: string;
  name: string;
  description: string;
  scope: TemplateScope;
  project_id?: string;
  containers: WorkflowContainer[];
  service_ports?: ServicePort[];
  service_name?: string;
  create_service?: boolean;
  service_type?: 'ClusterIP' | 'LoadBalancer' | 'NodePort';
  replicas: number;
  created_by?: string;
  created_at: string;
  updated_at?: string;
}

export interface JobTemplate {
  id: string;
  name: string;
  description: string;
  scope: TemplateScope;
  project_id?: string;
  containers: WorkflowContainer[];
  backoff_limit: number;
  ttl_seconds_after_finished?: number;
  created_at: string;
}

export interface WorkflowNode {
  id: string;
  node_type: NodeType;
  template_id: string;
  name: string;
  position: { x: number; y: number };
  status?: WorkflowStatus;
}

export interface WorkflowEdge {
  edge_id: string;
  source: string;
  target: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  scope: TemplateScope;
  project_id?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  created_at: string;
}

export interface WorkflowInstance {
  id: string;
  name: string;
  description: string;
  status: WorkflowStatus;
  project_id: string;
  run_mode: 'once' | 'persistent';
  trigger_type: 'manual' | 'http';
  trigger_enabled: boolean;
  trigger_url?: string;
  is_active: boolean;
  run_count: number;
  last_run_at?: string;
  nodes: WorkflowNodeInstance[];
  edges?: WorkflowEdge[];
  created_by?: string;
  started_at?: string;
  finished_at?: string;
  created_at: string;
  updated_at: string;
}

export interface WorkflowNodeInstance {
  id: string;
  node_type: NodeType;
  template_id: string;
  name: string;
  status: WorkflowStatus;
  k8s_resource_name?: string;
  k8s_resource_type?: string;
  depends_on?: string[];
  downstream_node_ids?: string[];
  service_name?: string;
  timeout_seconds?: number;
  position?: { x: number; y: number };
  env_vars?: any[];
  volume_mounts?: any[];
  resources?: any;
  started_at?: string;
  finished_at?: string;
  message?: string;
  input_env_vars?: any[];
  input_volume_mounts?: any[];
  create_service?: boolean;
  service_ports?: ServicePort[];
  service_type?: 'ClusterIP' | 'LoadBalancer' | 'NodePort';
  create_ingress?: boolean;
  ingress_type?: string;
  ingress_host?: string;
  ingress_ip?: string;
  created_at: string;
}

export interface AppWorkflowNode {
  id: string;
  name: string;
  node_type: 'app';
  template_id: string;
  status: AppNodeStatus;
  k8s_resource_name?: string;
  k8s_resource_type?: string;
  service_name?: string;
  message?: string;
  env_vars?: Array<{ name: string; value: string }>;
  volume_mounts?: VolumeMount[];
  resources?: ResourceRequirements;
  timeout_seconds?: number;
  create_service?: boolean;
  service_ports?: ServicePort[];
  service_type?: 'ClusterIP' | 'LoadBalancer' | 'NodePort';
  create_ingress?: boolean;
  ingress_type?: string;
  ingress_host?: string;
  ingress_ip?: string;
  started_at?: string;
  finished_at?: string;
  created_at: string;
  init_logs?: string;
}

export interface AppWorkflow {
  id: string;
  name: string;
  description?: string;
  project_id: string;
  status: AppWorkflowStatus;
  workflow_type: 'simple_app';
  node: AppWorkflowNode;
  template_id: string;
  template_name: string;
  service_name: string;
  service_ports: ServicePort[];
  service_type?: 'ClusterIP' | 'LoadBalancer' | 'NodePort';
  replicas?: number;
  env_vars?: Array<{ name: string; value: string }>;
  volume_mounts?: VolumeMount[];
  resources?: ResourceRequirements;
  create_service?: boolean;
  create_ingress?: boolean;
  ingress_type?: string;
  ingress_host?: string;
  ingress_ip?: string;
  created_by?: string;
  created_at: string;
  updated_at?: string;
  started_at?: string;
  finished_at?: string;
  message?: string;
}

export interface AppWorkflowLogs {
  workflow_id: string;
  node_id: string;
  resource_name: string;
  pod_name: string;
  namespace: string;
  logs: string;
  container?: string;
  previous: boolean;
}

export interface DomainBindingRecord {
  id: string;
  instance_id: string;
  node_instance_id: string;
  node_id: string;
  project_id: string;
  service_name?: string;
  ingress_name?: string;
  ingress_type?: string;
  domain: string;
  ingress_ip?: string;
  service_port?: number;
  target_port?: number;
  binding_status: string;
  message?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ServiceAccessInfo {
  name?: string;
  type?: string;
  namespace?: string;
  cluster_ip?: string;
  ports?: Array<{
    name?: string;
    protocol?: string;
    port?: number;
    target_port?: number;
    node_port?: number;
  }>;
  access_urls?: Array<{
    type: string;
    url: string;
    port?: number;
    host?: string;
    path?: string;
    selected_ip?: string;
    ingress_name?: string;
    source?: string;
  }>;
  ingress_accesses?: Array<{
    ingress_name?: string;
    ingress_class_name?: string;
    host?: string;
    path?: string;
    path_type?: string;
    service_name?: string;
    service_port?: number;
    selected_ip?: string;
    url?: string;
    source?: string;
  }>;
  configured_ingress?: {
    create_ingress?: boolean;
    ingress_type?: string;
    ingress_host?: string;
    ingress_ip?: string;
  };
  domain_bindings?: DomainBindingRecord[];
  node_id?: string;
  node_name?: string;
  error?: string;
}

export interface WorkflowInstanceStoredLogPayload {
  task_id?: string;
  pod_name?: string;
  container?: string;
  logs?: string;
  fetched_at?: string;
  tail_lines?: number;
  previous?: boolean;
  status_when_fetched?: string;
}

export interface WorkflowInstanceNodeLogRecord {
  id: string;
  task_id?: string;
  node_id: string;
  node_name?: string;
  instance_id: string;
  project_id: string;
  node_type: NodeType;
  k8s_resource_name?: string;
  k8s_resource_type?: string;
  status: string;
  started_at?: string;
  finished_at?: string;
  duration_seconds?: number;
  message?: string;
  init_logs?: WorkflowInstanceStoredLogPayload;
  execution_logs?: WorkflowInstanceStoredLogPayload;
  log_updated_at?: string;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface WorkflowInstanceNodeLogListResponse {
  total: number;
  page: number;
  page_size: number;
  items: WorkflowInstanceNodeLogRecord[];
}

export interface IngressController {
  name: string;
  namespace: string;
  type: string;
  external_ip: string;
  cluster_ip: string;
  ports: Array<{ name: string; port: number; protocol: string }>;
  ingress_class: string;
}

// --- End Workflow Types ---

export interface Role {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  user_ids?: number[];
}

export interface UserSession {
  user_id: number;
  username: string;
  role: string[];
  ip_address: string;
  user_agent: string;
  login_at: string;
  last_active_at: string;
}

export interface DetailedSession {
  id: number;
  token_jti: string;
  ip_address: string;
  user_agent: string;
  status: 'active' | 'revoked' | 'expired';
  created_at: string;
  last_active_at: string;
  expires_at: string;
}

export interface MachineToken {
  id: number;
  machine_code: string;
  description: string;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
}

export interface Department {
  id: number;
  name: string;
  description?: string;
  parent_id?: number;
  created_at: string;
  updated_at: string;
}

export interface DepartmentMember {
  id: number;
  user_id: number;
  username: string;
  department_id: number;
  department_name: string;
  role: 'leader' | 'vice_leader' | 'member';
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: number | string;  // 支持项目空间的字符串ID
  name: string;
  description?: string;
  is_public: boolean;
  department_id?: number;
  department_name?: string;
  can_manage?: boolean;
  created_at: string;
  updated_at: string;
  departments?: Department[];
  project_space_id?: string;  // 项目空间的字符串ID
  org_id?: number;  // 组织架构系统的整数ID
  sync_error?: string;  // 同步错误信息
  owner_id?: string;
  owner_name?: string;
  owner_department_id?: number;
  owner_department_name?: string;
  roles?: any[];
}

export interface SecurityProject {
  id: string;
  name: string;
  description: string;
  owner_id?: string;
  owner_name?: string;
  status?: string;
  is_public?: boolean;
  department_id?: number | null;
  department_name?: string | null;
  can_manage?: boolean;
  created_at?: string;
  updated_at?: string;
  k8s_namespace?: string;
}

export interface ProjectResource {
  id: number;
  resource_uuid: string;
  name: string;
  resource_type: 'document' | 'software' | 'code' | 'other' | 'output_pvc';
  original_file_name: string;
  original_file_size: number;
  original_file_format?: string;
  upload_status: 'pending' | 'running' | 'completed' | 'failed';
  upload_message?: string;
  pvc_name?: string;
  pvc_namespace?: string;
  pvc_size?: number;
  extract_path?: string;
  project_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface ProjectTask {
  task_id: string;
  resource_id: number;
  project_id: string;
  task_type: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  progress: number;
  message?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectPVC {
  pvc_name: string;
  resource_type: string;
  namespace: string;
  capacity: string;
  status: string;
  storage_class: string;
  resource_id?: number;
  resource_name?: string;
}

export interface OutputPvcDetail {
  id: number;
  resource_uuid: string;
  name: string;
  description?: string | null;
  resource_type: 'output_pvc';
  pvc_name: string;
  pvc_namespace: string;
  pvc_size: string;
  status: string;
  project_ids: string[];
  pvc_k8s_status?: {
    name?: string;
    capacity?: string;
    status?: string;
    storage_class?: string;
    namespace?: string;
  } | null;
  in_use: boolean;
  use_message?: string;
  created_at: string;
  updated_at: string;
}

export interface PvcBrowserBreadcrumbItem {
  path: string;
  name: string;
}

export interface PvcBrowserNode {
  path: string;
  name: string;
  node_type: 'directory' | 'file';
  size?: number | null;
  updated_at?: number | null;
  content_type?: string | null;
  has_children: boolean;
  children?: PvcBrowserNode[];
}

export interface PvcBrowserRootResponse {
  resource_id: number;
  pvc_name: string;
  total: number;
  items: PvcBrowserNode[];
}

export interface PvcBrowserChildrenResponse {
  resource_id: number;
  pvc_name: string;
  current_path: string;
  breadcrumbs: PvcBrowserBreadcrumbItem[];
  directories: PvcBrowserNode[];
  files: PvcBrowserNode[];
}

export interface PvcBrowserFileResponse {
  path: string;
  filename: string;
  size: number;
  content_type?: string | null;
  truncated: boolean;
  base64: string;
}

export interface FileSubproject {
  id: number;
  project_id: string;
  name: string;
  description?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface FileDirectory {
  id: number;
  project_id: string;
  subproject_id: number;
  parent_id?: number | null;
  name: string;
  path_key: string;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ManagedFile {
  id: number;
  project_id: string;
  subproject_id: number;
  directory_id?: number | null;
  filename: string;
  original_filename: string;
  content_type?: string | null;
  size: number;
  sha256: string;
  storage_key: string;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExplorerBreadcrumbItem {
  node_type: 'project' | 'subproject' | 'directory';
  id: string;
  name: string;
  subproject_id?: number | null;
  directory_id?: number | null;
}

export interface FileExplorerNode {
  node_type: 'project' | 'subproject' | 'directory' | 'file';
  id: string;
  name: string;
  project_id: string;
  subproject_id?: number | null;
  directory_id?: number | null;
  file_id?: number | null;
  parent_directory_id?: number | null;
  path_key?: string | null;
  content_type?: string | null;
  size?: number | null;
  updated_at?: string | null;
  special_badge?: string | null;
  has_children: boolean;
  children?: FileExplorerNode[];
}

export interface ExplorerRootResponse {
  project_id: string;
  root_name: string;
  total: number;
  items: FileExplorerNode[];
}

export interface DirectoryChildrenResponse {
  project_id: string;
  subproject_id: number;
  directory_id?: number | null;
  current_name: string;
  current_path: string;
  breadcrumbs: ExplorerBreadcrumbItem[];
  directories: FileDirectory[];
  files: ManagedFile[];
}

export interface FilePreviewResponse {
  file_id: number;
  filename: string;
  content_type?: string | null;
  preview_mode: 'text' | 'image' | 'pdf' | 'audio' | 'video' | 'binary';
  preview_url: string;
  download_url: string;
}

export interface PVCStatistics {
  total_pvcs: number;
  total_storage_gi: number;
  status_counts: Record<string, number>;
  namespaces_count: number;
}

export interface Agent {
  key: string;
  hostname: string;
  full_name?: string;
  status: 'online' | 'offline' | 'error' | 'timeout' | 'unknown';
  ip_address: string;
  system_info?: any;
  daemon_info?: DaemonAgentInfo;
  project_id?: string;
  last_seen?: string;
  pod_id?: string;
  services?: any[];
  is_allowed?: boolean;
  is_offline?: boolean;
  allow_reason?: string;
}

// Docker Compose 解析相关类型定义

// 解析后的端口配置
export interface ComposePort {
  published: string;
  target: string;
  protocol: string;
}

// 解析后的卷挂载
export interface ComposeVolume {
  source: string;
  target: string;
  type: 'bind' | 'volume' | 'tmpfs';
  read_only?: boolean;
  mode?: string;
}

// 解析后的服务定义
export interface ComposeService {
  image?: string;
  ports?: ComposePort[];
  environment?: Record<string, string>;
  volumes?: ComposeVolume[];
  networks?: string[];
  depends_on?: string[];
  restart?: string;
  container_name?: string;
  build?: {
    context?: string;
    dockerfile?: string;
  };
  labels?: Record<string, string>;
  healthcheck?: any;
  deploy?: any;
}

// 解析后的完整 docker-compose 结构
export interface ParsedCompose {
  version?: string;
  services: Record<string, ComposeService>;
  networks?: Record<string, any>;
  volumes?: Record<string, any>;
  configs?: Record<string, any>;
  secrets?: Record<string, any>;
}

export interface EnvTemplate {
  id: number;
  name: string;
  type: string;
  description: string;
  file_size: number;
  updated_at: string;
  visibility?: 'shared' | 'private';
  owner_id?: string;
  owner_name?: string;
  tags?: string[];
  permissions?: {
    can_view?: boolean;
    can_manage?: boolean;
    can_copy?: boolean;
    can_delete?: boolean;
    can_update?: boolean;
  };

  // 新增字段
  metadata?: {
    parsed_compose?: ParsedCompose;
    parsed_at?: string;
    parse_error?: string | null;
    parse_status?: 'success' | 'error' | 'stale';
    content_hash?: string;
    tags?: string[];
    original_compose_backup?: TemplateComposeBackupInfo | null;
    llm_mix_state?: TemplateLlmMixState | null;
    llm_mix_history?: TemplateLlmMixHistoryEntry[];
    web_port_presets?: Array<{
      name?: string;
      port: number;
      protocol?: 'http' | 'https';
      backend_protocol?: 'http' | 'https';
      description?: string;
      path?: string;
      websocket_enabled?: boolean;
      tls_enabled?: boolean;
      ingress_tls_enabled?: boolean;
    }>;
  };
}

export interface TemplateLlmProviderBinding {
  provider_keys: string[];
  target_services: '*' | string[];
  updated_at?: string;
}

export interface TemplateComposeBackupInfo {
  file_path: string;
  source_type: 'yaml' | 'archive' | string;
  main_compose_path: string;
  created_at?: string;
}

export interface TemplateLlmMixState {
  provider_keys: string[];
  provider_snapshots?: Array<Record<string, any>>;
  mapped_env_keys?: string[];
  target_services: '*' | string[];
  generated_at?: string;
  generated_by?: string;
}

export interface TemplateLlmMixHistoryEntry {
  provider_keys: string[];
  target_services: '*' | string[];
  generated_at?: string;
  generated_by?: string;
  mapped_env_keys?: string[];
  provider_snapshots?: Array<Record<string, any>>;
}

export interface TemplateLlmProviderSummary {
  provider_key: string;
  display_name: string;
  provider_type: string;
  enabled: boolean;
  is_default: boolean;
  api_base: string;
  model: string;
  description?: string | null;
}

export interface TemplateLlmProviderDetail extends LlmProviderDetail {}

export interface TemplateLlmBindingPreview {
  project_id: string;
  provider_keys: string[];
  target_services: '*' | string[];
  source: string;
  provider_snapshots: Array<Record<string, any>>;
  merged_env: Record<string, string>;
  mapped_env_keys: string[];
  updated_at?: string;
}

export interface TemplateComposeSourceInfo {
  template_id: number;
  template_name: string;
  original_compose_backup: TemplateComposeBackupInfo | null;
  llm_mix_state: TemplateLlmMixState | null;
  llm_mix_history: TemplateLlmMixHistoryEntry[];
  current_source: string;
}

// 解析数据响应类型
export interface ParsedComposeResponse {
  template_name: string;
  parsed_compose: ParsedCompose | null;
  parse_status: 'success' | 'error' | 'stale';
  parsed_at?: string;
  parse_error?: string | null;
  is_stale?: boolean;
}

export interface AsyncTask {
  id: string;
  type: string;
  status: string;
  service_name: string;
  progress: number;
  create_time: string;
  agent_key: string;
  project_id?: string;
  message?: string;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
  log_count?: number;
}

export interface TaskLog {
  timestamp: string;
  level: string;
  message: string;
}

export interface StaticPackage {
  id: string;
  name: string;
  version: string;
  system: string;
  architecture: string;
  total_size: number;
  download_count: number;
  check_status: string;
  file_count?: number;
  original_package_path?: string;
  upload_time?: string;
}

export interface PackageStats {
  summary: {
    total_packages: number;
    total_size_human: string;
    total_downloads: number;
  };
  by_architecture: Array<{ architecture: string; package_count: number }>;
}

export interface FileItem {
  id: number;
  name: string;
  size: string;
  updatedAt: string;
}

export interface AgentStats {
  timestamp: string;
  project_id: string;
  summary: {
    total_agents: number;
    offline_agents: number;
    status_distribution: {
      online: number;
      offline: number;
      error: number;
      unknown: number;
    };
  };
  cleanup_info: {
    can_cleanup: boolean;
    offline_count: number;
    suggested_action: string;
  };
}

export interface TemplateFile {
  path: string;
  size: number;
  modified: string;
}

export interface PackageFile {
  path: string;
  name: string;
  size: number;
  download_count: number;
}

export interface NamespaceStatus {
  k8s_namespace: string;
  namespace: {
    status: string;
    created_at: string;
  };
}

export interface K8sResourceList {
  pods: Array<{
    name: string;
    node: string;
    ip: string;
    status: string;
  }>;
  services: Array<{
    name: string;
    type: string;
    cluster_ip: string;
    ports: string[];
  }>;
  ingresses: Array<{
    name: string;
    host: string;
    tls: any[];
  }>;
  pvcs: Array<{
    name: string;
    status: string;
    capacity: {
      storage: string;
    };
    storage_class: string;
  }>;
  deployments: Array<{
    name: string;
    replica: number;
    ready_replica: number;
  }>;
  configmaps: any[];
  secrets: any[];
}

export interface AgentService {
  id: string;
  name: string;
  image: string;
  template_id?: number | null;
  template_name?: string;
  status: string;
  ports: Record<string, string>;
  agent_key?: string;
  agent_hostname?: string;
  agent_ip?: string;
  service_uid?: string;
  is_stale?: boolean;
  source?: string;
  first_seen_at?: string;
  last_seen_at?: string;
  updated_at?: string;
  tags?: string[];
}

export interface AiHelperService {
  id: string;
  project_id: string;
  agent_key: string;
  agent_hostname?: string;
  agent_ip?: string;
  service_name: string;
  image: string;
  status: string;
  tags: string[];
  active_agent_id?: string | null;
  ai_agent_count: number;
  health_status?: string;
  health?: any;
  agents?: AiAgentItem[];
  last_seen_at?: string;
  updated_at?: string;
}

export interface AiAgentItem {
  agent_id: string;
  name: string;
  backend_type: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
  running: boolean;
  active: boolean;
  installed?: boolean;
  pid?: number | null;
  description?: string;
  health?: any;
  capabilities?: any;
  llm_provider_key?: string;
  llm_provider_snapshot?: {
    provider_key?: string;
    display_name?: string;
    provider_type?: string;
    model?: string;
    api_base?: string;
    updated_at?: string | null;
    description?: string | null;
  } | null;
  llm_provider_applied_at?: string | null;
  llm_provider_mapped_env_keys?: string[];
}

export interface ProjectAiAgentItem extends AiAgentItem {
  project_id: string;
  agent_key: string;
  agent_hostname?: string;
  agent_ip?: string;
  service_name: string;
  image: string;
  status: string;
  health_status?: string;
  helper_tags: string[];
  helper_health?: any;
  last_seen_at?: string;
  updated_at?: string;
}

export interface AiAgentLlmProviderSummary {
  provider_key: string;
  display_name: string;
  provider_type: string;
  enabled: boolean;
  is_default: boolean;
  api_base: string;
  model: string;
  description?: string | null;
}

export interface AiAgentLlmProviderDetail extends LlmProviderDetail {
  mapped_env_preview?: Record<string, string>;
}

export interface AiAgentLlmApplyResult {
  project_id: string;
  agent_key: string;
  service_name: string;
  agent_id: string;
  provider_key: string;
  refresh: boolean;
  mapped_env_preview: Record<string, string>;
  mapped_env_keys: string[];
  updated_agent: ProjectAiAgentItem | AiAgentItem;
}

export interface AiAgentLlmBatchApplyResult {
  project_id: string;
  provider_key: string;
  refresh: boolean;
  status: string;
  total: number;
  success_count: number;
  results: Array<{
    agent_key: string;
    service_name: string;
    agent_id: string;
    success: boolean;
    error?: string;
    provider_key?: string;
    mapped_env_preview?: Record<string, string>;
    mapped_env_keys?: string[];
    updated_agent?: ProjectAiAgentItem | AiAgentItem;
  }>;
}

export interface AiAgentSession {
  session_id: string;
  backend?: string;
  agent_ids?: string[];
  metadata?: Record<string, any>;
  messages?: Array<{ role: string; content: string }>;
  created_at?: string;
  updated_at?: string;
}

export interface AiBatchItem {
  agent_key: string;
  service_name: string;
  helper_session_id?: string | null;
  helper_agent_ids?: string[];
  status: string;
  last_error?: string;
  updated_at?: string;
}

export interface AiBatchRound {
  round_no: number;
  role: string;
  content: string;
  response: any;
  created_at?: string;
}

export interface AiBatchSession {
  batch_id: string;
  project_id: string;
  status: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  items: AiBatchItem[];
}

export interface Workspace {
  id: string;
  name: string;
}

// Deploy Script Management Types
export interface DeployScriptItem {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified_at: number;
}

export interface DeployScriptListResponse {
  path: string;
  total: number;
  items: DeployScriptItem[];
}

export type ViewType =
  | 'dashboard' | 'admin-dashboard' | 'project-mgmt' | 'project-detail' | 'static-packages' | 'static-package-detail' | 'deploy-script-mgmt'
  | 'public-resource-management' | 'test-input-release' | 'test-input-code' | 'test-input-doc' | 'test-input-tasks' | 'test-input-other' | 'pvc-management' | 'project-file-explorer'
  | 'config-center-root' | 'config-center-llm' | 'config-center-llm-chat'
  | 'env-mgmt' | 'env-agent' | 'env-service' | 'env-ai-agent' | 'env-ai-agent-overview' | 'env-ai-helper' | 'env-ai-agent-manage' | 'env-ai-session' | 'env-ai-batch-session' | 'env-template' | 'env-tasks'
  | 'workflow-instances' | 'workflow-instance-detail' | 'workflow-instance-logs' | 'workflow-jobs' | 'workflow-job-detail' | 'workflow-apps' | 'workflow-app-detail' | 'workflow-app-instances' | 'workflow-app-instance-detail'
  | 'engine-validation' | 'pentest-root' | 'pentest-risk' | 'pentest-system' 
  | 'pentest-threat' | 'pentest-orch' | 'pentest-exec-code' | 'pentest-exec-work' | 'pentest-exec-secmate' | 'pentest-report'
  | 'security-assessment' | 'vuln-engine' | 'vuln-overview' | 'vuln-intake' | 'vuln-analysis' | 'vuln-verification' | 'vuln-proof' | 'vuln-decision' | 'vuln-queue' | 'vuln-services' | 'vuln-repro-config'
  | 'sys-settings' | 'change-password'
  | 'user-mgmt-users' | 'user-mgmt-roles' | 'user-mgmt-perms' | 'user-mgmt-access' | 'user-mgmt-online' | 'user-mgmt-machine'
  | 'org-mgmt-departments' | 'org-mgmt-members' | 'org-mgmt-projects';

// Admin Dashboard Statistics Types
export interface AdminDashboardStats {
  users: {
    total: number;
    active: number;
    online: number;
  };
  roles: {
    total: number;
  };
  projects: {
    total: number;
  };
  agents: {
    total: number;
    online: number;
    statusDistribution: Record<string, number>;
  };
  resources: {
    totalPvcs: number;
    totalStorageGi: number;
    statusCounts: Record<string, number>;
  };
  workflows: {
    totalInstances: number;
    statusDistribution: Record<string, number>;
    templates: {
      appTemplates: number;
      jobTemplates: number;
    };
  };
  services: {
    id: string;
    name: string;
    apiPrefix?: string;
    status: 'healthy' | 'unhealthy' | 'degraded' | 'stale' | 'unknown' | 'unregistered';
    registered: boolean;
    source: 'menu' | 'direct' | 'catalog';
    replicas?: number | null;
    readyReplicas?: number | null;
    availableReplicas?: number | null;
    runtimeStatus?: string | null;
    deploymentName?: string | null;
  }[];
  lastUpdated: string;
}

export interface LlmProviderSummary {
  provider_key: string;
  display_name: string;
  provider_type: string;
  enabled: boolean;
  is_default: boolean;
  api_base: string;
  model: string;
  api_key: string;
  organization?: string | null;
  api_version?: string | null;
  timeout_seconds: number;
  max_tokens?: number | null;
  temperature?: number | null;
  env_bindings: Record<string, any>;
  extra_config: Record<string, any>;
  description?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface LlmProviderDetail {
  provider_key: string;
  display_name: string;
  provider_type: string;
  enabled: boolean;
  is_default: boolean;
  api_base: string;
  model: string;
  api_key: string;
  organization?: string | null;
  api_version?: string | null;
  timeout_seconds: number;
  max_tokens?: number | null;
  temperature?: number | null;
  env_bindings: Record<string, any>;
  extra_config: Record<string, any>;
  description?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface LlmProviderUpsertRequest {
  provider_key: string;
  display_name: string;
  provider_type: string;
  enabled: boolean;
  is_default: boolean;
  api_base: string;
  model: string;
  api_key: string;
  organization?: string | null;
  api_version?: string | null;
  timeout_seconds: number;
  max_tokens?: number | null;
  temperature?: number | null;
  env_bindings: Record<string, any>;
  extra_config: Record<string, any>;
  description?: string | null;
}

export interface LlmProviderTestResult {
  ok: boolean;
  provider_type: string;
  request_target: string;
  latency_ms: number;
  status_code?: number | null;
  response_preview?: string | null;
  error_message?: string | null;
}

export interface LlmProviderModelOption {
  value: string;
  label: string;
  source: 'remote' | 'configured' | 'manual';
}

export interface LlmProviderModelListResult {
  provider_key: string;
  provider_type: string;
  request_target?: string | null;
  status_code?: number | null;
  error_message?: string | null;
  items: LlmProviderModelOption[];
}

export interface LlmProviderChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmProviderChatTarget {
  provider_key: string;
  model: string;
  messages: LlmProviderChatMessage[];
}

export interface LlmProviderChatResult {
  provider_key: string;
  provider_type: string;
  model: string;
  ok: boolean;
  assistant_message?: string | null;
  latency_ms: number;
  status_code?: number | null;
  request_target?: string | null;
  error_message?: string | null;
}

export interface LlmProviderChatStreamEvent {
  type: 'start' | 'delta' | 'done' | 'error' | 'all_done';
  provider_key?: string;
  provider_type?: string;
  model?: string;
  delta?: string;
  ok?: boolean;
  assistant_message?: string | null;
  latency_ms?: number;
  status_code?: number | null;
  request_target?: string | null;
  error_message?: string | null;
}

// Daemon Service Types (守护进程服务)
export interface DaemonService {
  name: string;
  description: string;
  is_running: boolean;
  pid: number | null;
  start_time: string | null;
  uptime_seconds: number;
  fail_count: number;
  last_check: string;
  monitor_mode: 'self' | 'systemd' | 'supervisor';
}

export interface DaemonServicesResponse {
  code: number;
  message: string;
  data: {
    services: DaemonService[];
    total: number;
    running_count: number;
  };
}

export interface DaemonServiceLogs {
  code: number;
  message: string;
  data: {
    service_name: string;
    log_type: string;
    lines: string[];
    total_lines: number;
  };
}

export interface DaemonAgentServiceBrief {
  name: string;
  is_running: boolean;
  pid: number;
  uptime_seconds: number;
  fail_count: number;
  monitor_mode: string;
}

export interface DaemonAgentInfo {
  version?: string;
  go_version?: string;
  platform?: string;
  uuid?: string;
  project_id?: string;
  workspace?: string;
  server?: string;
  uptime_seconds?: number;
  start_time?: string;
  status?: string;
  services_total?: number;
  services_running?: number;
  services_stopped?: number;
  services_error?: number;
  services?: DaemonAgentServiceBrief[];
}

export interface AgentTtydConnectionInfo {
  agent_key: string;
  agent_ip: string;
  agent_status: string;
  ttyd_port: number;
  reachable: boolean;
  probe_error?: string | null;
  http_url: string;
  ws_url: string;
  open_path: string;
}

export interface AgentIngressRouteInfo {
  route_id: string;
  project_id: string;
  namespace: string;
  agent_key: string;
  target_port: number;
  external_ips: string[];
  host: string;
  path: string;
  ingress_type: string;
  path_type: string;
  service_port: number;
  ingress_name: string;
  service_name: string;
  tls_enabled: boolean;
  tls_secret_name?: string | null;
  backend_protocol?: 'http' | 'https' | null;
  websocket_enabled: boolean;
  status: string;
  access_url?: string | null;
  owner_service?: string | null;
  created_by?: string | null;
  metadata?: Record<string, any>;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
}
