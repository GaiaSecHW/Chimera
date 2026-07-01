
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
  platform_role?: 'super_admin' | 'ordinary_admin' | 'developer' | 'ordinary_user';
  must_change_password?: boolean;
  department_member_id?: number | null;
  department_id?: number | null;
  department_name?: string | null;
  // 部门层级路径（根到当前部门）。后端 validate-token / login 响应应携带；
  // 缺失时 isIcslDepartment 回退到 department_name 字符串匹配。
  department_path?: { id: number; name: string }[] | null;
  created_at?: string;
  updated_at?: string;
}

export interface UserImportNormalizedRow {
  username: string;
  password_provided: boolean;
  platform_role: 'ordinary_admin' | 'developer' | 'ordinary_user';
  role_names: string[];
  department_name?: string | null;
  department_role?: 'leader' | 'vice_leader' | 'member' | null;
  is_active: boolean;
  force_password_change?: boolean;
}

export interface UserImportRowResult {
  row_no: number;
  username: string;
  status: 'valid' | 'error' | 'success';
  messages: string[];
  normalized?: UserImportNormalizedRow | null;
  generated_password?: string | null;
  user_id?: number | null;
}

export interface UserImportPreviewResponse {
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  rows: UserImportRowResult[];
}

export interface UserImportCommitResponse {
  total_rows: number;
  success_rows: number;
  failed_rows: number;
  rows: UserImportRowResult[];
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

export interface ProjectFileMount {
  subproject_id: number;
  directory_id?: number | null;
  mount_path: string;
  read_only?: boolean;
  display_path?: string;
  subproject_name?: string;
  directory_name?: string;
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

export interface TemplateTag {
  id?: string;
  tag_key: string;
  tag_label: string;
  category: string;
  description?: string;
  color?: string;
  is_system?: boolean;
  enabled?: boolean;
  sort_order?: number;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
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
  tags?: TemplateTag[];
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
  tags?: TemplateTag[];
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
  has_warning?: boolean;
  message?: string;
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
  project_file_mounts?: ProjectFileMount[];
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
  project_file_mounts?: ProjectFileMount[];
  resources?: ResourceRequirements;
  timeout_seconds?: number;
  create_service?: boolean;
  service_ports?: ServicePort[];
  service_type?: 'ClusterIP' | 'LoadBalancer' | 'NodePort';
  create_ingress?: boolean;
  ingress_type?: string;
  ingress_host?: string;
  ingress_ip?: string;
  llm_binding?: AppWorkflowLlmBinding | null;
  llm_bindings?: AppWorkflowLlmBinding[];
  started_at?: string;
  finished_at?: string;
  created_at: string;
  init_logs?: string;
}

export interface AppWorkflowLlmBinding {
  source: 'config_center' | 'custom';
  provider_key: string;
  config: LlmProviderDetail;
  bound_at?: string | null;
}

export interface AppWorkflowLlmBindingRequest {
  source: 'config_center' | 'custom';
  provider_key?: string;
  config?: LlmProviderDetail;
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
  project_file_mounts?: ProjectFileMount[];
  resources?: ResourceRequirements;
  create_service?: boolean;
  create_ingress?: boolean;
  ingress_type?: string;
  ingress_host?: string;
  ingress_ip?: string;
  llm_binding?: AppWorkflowLlmBinding | null;
  llm_bindings?: AppWorkflowLlmBinding[];
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
  token_scope?: 'global' | 'project';
  project_id?: string | null;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
  token?: string;
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

export interface DepartmentMemberImportNormalizedRow {
  username: string;
  department_id: number;
  department_name: string;
  role: 'leader' | 'vice_leader' | 'member';
  action: 'create' | 'skip_existing' | 'update_role';
  existing_member_id?: number | null;
  existing_department_id?: number | null;
  existing_department_name?: string | null;
}

export interface DepartmentMemberImportRowResult {
  row_no: number;
  username: string;
  status: 'valid' | 'error' | 'success' | 'skipped';
  messages: string[];
  normalized?: DepartmentMemberImportNormalizedRow | null;
  member_id?: number | null;
}

export interface DepartmentMemberImportPreviewResponse {
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  rows: DepartmentMemberImportRowResult[];
}

export interface DepartmentMemberImportCommitResponse {
  total_rows: number;
  success_rows: number;
  skipped_rows: number;
  failed_rows: number;
  rows: DepartmentMemberImportRowResult[];
}

export interface ProjectRole {
  user_id: string;
  username: string;
  role: string;
  created_at?: string;
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
  roles?: ProjectRole[];
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
  product_id?: string | null;
  product_name?: string | null;
  product_path?: string | null;
  product_version_id?: string | null;
  product_version_name?: string | null;
  product_version?: string | null;
  can_manage?: boolean;
  created_at?: string;
  updated_at?: string;
  k8s_namespace?: string;
  member_count?: number;
  roles?: ProjectRole[];
}

export interface ProductVersionNode {
  id: string;
  product_id: string;
  version: string;
  name?: string | null;
  description?: string | null;
  status: string;
  project_count: number;
  created_at: string;
  updated_at: string;
}

export interface ProductTreeNode {
  id: string;
  name: string;
  code: string;
  parent_id?: string | null;
  description?: string | null;
  sort_order: number;
  status: string;
  is_leaf: boolean;
  project_count: number;
  created_at: string;
  updated_at: string;
  children: ProductTreeNode[];
  versions: ProductVersionNode[];
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
  file_gateway?: {
    enabled: boolean;
    worker_name: string;
    service_name: string;
    deployment_exists: boolean;
    service_exists: boolean;
    ready_replicas: number;
    available_replicas: number;
  } | null;
}

export interface OutputPvcDetail {
  id: number;
  resource_uuid: string;
  name: string;
  description?: string | null;
  resource_type: 'document' | 'software' | 'code' | 'other' | 'output_pvc';
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
  file_gateway?: {
    enabled: boolean;
    worker_name: string;
    service_name: string;
    namespace?: string;
    worker_image?: string;
    service_exists: boolean;
    deployment_exists: boolean;
    replicas?: number;
    ready_replicas: number;
    available_replicas: number;
  } | null;
  in_use: boolean;
  use_message?: string;
  in_use_pods?: string[];
  in_use_jobs?: string[];
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

export interface ProjectPathDirectoryEntry {
  id: number;
  name: string;
  path: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectPathFileEntry {
  id: number;
  filename: string;
  original_filename: string;
  path: string;
  content_type?: string | null;
  size: number;
  sha256: string;
  storage_key: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectPathChildrenResponse {
  project_id: string;
  current_path: string;
  current_name: string;
  root_path: string;
  root_name: string;
  special_subproject_name: string;
  special_subproject_id: number;
  case_uuid?: string | null;
  directories: ProjectPathDirectoryEntry[];
  files: ProjectPathFileEntry[];
}

export interface ProjectFilesystemBreadcrumbItem {
  node_type: 'project' | 'subproject' | 'directory';
  name: string;
  path: string;
}

export interface ProjectFilesystemEntry {
  node_type: 'subproject' | 'directory' | 'file';
  name: string;
  path: string;
  content_type?: string | null;
  size?: number | null;
  updated_at?: string | null;
  has_children: boolean;
  special_badge?: string | null;
}

export interface ProjectFilesystemRootResponse {
  project_id: string;
  root_name: string;
  total: number;
  items: ProjectFilesystemEntry[];
}

export interface ProjectFilesystemChildrenResponse {
  project_id: string;
  current_path: string;
  current_name: string;
  breadcrumbs: ProjectFilesystemBreadcrumbItem[];
  directories: ProjectFilesystemEntry[];
  files: ProjectFilesystemEntry[];
}

export interface ProjectInputUploadBatchSummary {
  batch_id: string;
  status: 'pending' | 'processing' | 'succeeded' | 'partial_failed' | 'failed';
  mode: 'create' | 'append' | string;
  keep_original: boolean;
  submitted_file_count: number;
  processed_file_count: number;
  processed_size_bytes: number;
  error_summary?: string | null;
  created_at: string;
  finished_at?: string | null;
}

export interface ProjectInputUploadRecord {
  upload_id: string;
  project_id: string;
  input_type: 'code' | 'document' | 'software' | 'other' | string;
  status: 'pending' | 'processing' | 'succeeded' | 'partial_failed' | 'failed';
  display_name?: string | null;
  keep_original: boolean;
  batch_count: number;
  source_archive_count: number;
  stored_file_count: number;
  stored_total_size_bytes: number;
  target_path: string;
  last_error?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  finished_at?: string | null;
  latest_batch?: ProjectInputUploadBatchSummary | null;
}

export interface ProjectInputUploadListResponse {
  total: number;
  items: ProjectInputUploadRecord[];
  page: number;
  page_size: number;
}

export interface ProjectInputUploadStats {
  project_id: string;
  input_type: 'code' | 'document' | 'software' | 'other' | string;
  total_uploads: number;
  processing_uploads: number;
  succeeded_uploads: number;
  partial_failed_uploads: number;
  failed_uploads: number;
  stored_file_count: number;
  stored_total_size_bytes: number;
}

export interface ProjectInputOverview {
  project_id: string;
  categories: ProjectInputUploadStats[];
}

export interface ProjectInputUploadDetail extends ProjectInputUploadRecord {
  batches: ProjectInputUploadBatchSummary[];
}

export interface ProjectInputUploadBrowseEntry {
  name: string;
  relative_path: string;
  absolute_path: string;
  node_type: 'file' | 'directory' | string;
  size?: number | null;
  updated_at?: string | null;
  has_children: boolean;
  content_type?: string | null;
}

export interface ProjectInputUploadBrowseResponse {
  project_id: string;
  upload_id: string;
  input_type: string;
  target_path: string;
  current_relative_path: string;
  current_absolute_path: string;
  root_relative_path: string;
  root_absolute_path: string;
  current_name: string;
  breadcrumbs: ProjectFilesystemBreadcrumbItem[];
  directories: ProjectInputUploadBrowseEntry[];
  files: ProjectInputUploadBrowseEntry[];
}

export interface ProjectInputUploadResolveResponse {
  project_id: string;
  upload_id: string;
  input_type: string;
  target_path: string;
  relative_path: string;
  absolute_path: string;
  node_type: 'file' | 'directory' | string;
  name: string;
  size?: number | null;
  updated_at?: string | null;
  content_type?: string | null;
}

export interface VulnFileserverRoot {
  root_path: string;
  root_name: string;
  special_subproject_name: string;
  special_subproject_id?: number | null;
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
  status_reason?: string | null;
  pod_id?: string;
  services?: any[];
  is_allowed?: boolean;
  is_offline?: boolean;
  allow_reason?: string;
}

export interface AgentStatusEvent {
  id: number;
  project_id: string;
  agent_key: string;
  hostname?: string;
  ip_address?: string;
  from_status?: string;
  to_status?: string;
  edge_state_from?: 'online' | 'offline' | string;
  edge_state_to?: 'online' | 'offline' | string;
  direction?: '上线' | '下线' | string;
  reason_code?: string;
  reason_message?: string;
  source?: string;
  pod_id?: string;
  observed_at?: string | null;
  created_at?: string | null;
}

export interface AgentDiagnostics {
  project_id: string;
  agent_key: string;
  generated_at?: string;
  agent_snapshot?: {
    key?: string;
    project_id?: string;
    status?: string;
    ip_address?: string;
    hostname?: string;
    last_seen?: string | null;
    updated_at?: string | null;
    pod_id?: string | null;
    status_reason?: string | null;
  };
  refresh_diag?: {
    attempted_at?: string | null;
    completed_at?: string | null;
    success?: boolean | null;
    message?: string;
    service_total?: number;
    service_parse_skipped?: number;
    service_unhealthy_skipped?: number;
    agent_key_missing_skipped?: number;
    agent_saved?: number;
    pod_id?: string;
  };
  list_diag?: {
    generated_at?: string | null;
    project_id?: string | null;
    memory_lock_acquired?: boolean;
    memory_agents_count?: number;
    db_rows_count?: number;
    pod_id?: string;
  };
  event_diag?: {
    window_hours?: number;
    up_count_24h?: number;
    down_count_24h?: number;
    total_events?: number;
    latest_event?: AgentStatusEvent | null;
  };
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
  env_overrides?: Record<string, string>;
  file_overrides?: TemplateLlmMappedFile[];
  updated_at?: string;
}

export interface TemplateLlmMappedFile {
  name: string;
  path: string;
  content: string;
  format?: string;
  enabled?: boolean;
  provider_key?: string;
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
  mapped_file_paths?: string[];
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
  mapped_file_paths?: string[];
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
  merged_files?: TemplateLlmMappedFile[];
  mapped_file_paths?: string[];
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
  agent_hostname?: string;
  full_name?: string;
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
  image?: string;
  image_versions?: string[];
  template_id?: number | null;
  template_name?: string;
  template_tags?: string[];
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

export interface ProcessMonitorNode {
  service_uid?: string;
  project_id: string;
  agent_key: string;
  agent_hostname?: string;
  agent_ip?: string;
  service_name: string;
  image?: string;
  status?: string;
  template_id?: number | null;
  template_name?: string;
  template_tags?: string[];
  tags?: string[];
  is_stale?: boolean;
  last_seen_at?: string;
  updated_at?: string;
}

export interface ProcessItem {
  pid: number;
  ppid?: number;
  name?: string;
  username?: string;
  status?: string;
  cmdline?: string[];
  cwd?: string;
  exe?: string;
  create_time?: number;
}

export interface ProcessSyncCandidateTreeNode {
  name: string;
  path: string;
  type: 'dir' | 'file';
  has_children?: boolean;
  children?: ProcessSyncCandidateTreeNode[];
}

export interface ProcessSyncTaskHistoryItem {
  sync_id: string;
  project_id: string;
  agent_key: string;
  service_name: string;
  node_task_id?: string;
  id_consistent?: boolean;
  mode: 'pid_files' | 'path_files';
  status: string;
  request?: Record<string, any>;
  node_snapshot?: Record<string, any>;
  message?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ProcessSyncPreviewIssue {
  scope?: 'pid' | 'path' | string;
  pid?: number;
  path?: string;
  status?: string;
  reason?: string;
}

export interface ProcessSyncPreviewItem {
  source_path?: string;
  relative_path?: string;
  remote_relative_path?: string;
  entry_type?: string;
  size?: number | null;
  refs?: Array<Record<string, any>>;
}

export interface ProcessSyncPreviewResponse {
  project_id?: string;
  agent_key?: string;
  service_name?: string;
  mode: 'pid_files' | 'path_files';
  summary: {
    total_candidates: number;
    total_files: number;
    total_symlinks: number;
    estimated_total_bytes: number;
    failed_count: number;
    skipped_count: number;
  };
  items_preview: ProcessSyncPreviewItem[];
  issues: ProcessSyncPreviewIssue[];
  pid_summary?: Record<string, any>;
  target?: {
    remote_root_url?: string;
    remote_path_prefix?: string;
    sample_remote_paths?: string[];
  };
}

export interface ProcessSyncTaskDetailResponse {
  project_id: string;
  sync_id?: string;
  node_task_id?: string;
  id_consistent?: boolean;
  platform?: {
    sync_id?: string;
    project_id?: string;
    agent_key?: string;
    service_name?: string;
    mode?: string;
    status?: string;
    message?: string;
    created_at?: string;
    updated_at?: string;
    request?: Record<string, any>;
    node_snapshot?: Record<string, any>;
  };
  live?: {
    task?: Record<string, any>;
    progress?: Record<string, any>;
    events?: Record<string, any>;
    results?: Record<string, any>;
    errors?: Array<Record<string, any>>;
  };
  failure_summary?: {
    failed_count?: number;
    failed_samples?: Array<Record<string, any>>;
  };
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

export interface AiHelperRuntimeEnv {
  pid?: number | null;
  count?: number;
  updated_at?: string;
  env: Record<string, string>;
}

export interface AiAgentItem {
  agent_id: string;
  name: string;
  backend_type: string;
  command?: string;
  args?: string[];
  cwd?: string;
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
  llm_provider_keys?: string[];
  llm_provider_snapshot?: {
    provider_key?: string;
    display_name?: string;
    provider_type?: string;
    model?: string;
    api_base?: string;
    updated_at?: string | null;
    description?: string | null;
  } | null;
  llm_provider_snapshots?: Array<Record<string, any>>;
  llm_provider_applied_at?: string | null;
  llm_provider_mapped_env_keys?: string[];
  llm_provider_file_bindings?: AiAgentLlmFileBinding[];
  llm_provider_merge_strategy?: 'overwrite' | 'merge';
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
  updated_at?: string | null;
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

export interface AiAgentLlmFileBinding {
  name: string;
  path: string;
  content: string;
  format?: string;
  enabled?: boolean;
  provider_key?: string | null;
}

export interface AiAgentLlmConfigDraft {
  provider_keys: string[];
  env_overrides: Record<string, string>;
  file_overrides: AiAgentLlmFileBinding[];
  merge_strategy: 'overwrite' | 'merge';
}

export interface AiAgentBatchConfigureResult {
  project_id: string;
  provider_keys: string[];
  merge_strategy: 'overwrite' | 'merge';
  status: string;
  total: number;
  success_count: number;
  results: Array<{
    agent_key: string;
    service_name: string;
    agent_id: string;
    success: boolean;
    error?: string;
    provider_keys?: string[];
    merge_strategy?: 'overwrite' | 'merge';
    updated_config?: any;
  }>;
}

export interface AiSingleSessionMessage {
  role: string;
  content: string;
}

export interface AiSingleSession {
  session_id: string;
  backend?: string;
  agent_ids?: string[];
  session_mode?: 'pipe' | 'pty' | 'invoke';
  status?: 'ready' | 'broken' | 'closed';
  pty_pid?: number | null;
  backend_pid?: number | null;
  pty_started_at?: string | null;
  last_error?: string | null;
  metadata?: Record<string, any>;
  messages?: AiSingleSessionMessage[];
  vendor_session_id?: string | null;
  vendor_session_kind?: string | null;
  vendor_resume_mode?: string | null;
  vendor_session_initialized?: boolean | null;
  vendor_last_mode?: string | null;
  vendor_last_cmd?: string | null;
  vendor_last_error?: string | null;
  claude_session_id?: string | null;
  claude_workdir?: string | null;
  last_response?: AgentResponse | null;
  created_at?: string;
  updated_at?: string;
}

export interface AiAgentSession extends AiSingleSession {}

export interface AgentTraceEvent {
  id: string;
  category: string;
  message?: string;
  severity?: string;
  created?: number;
  source?: string;
  payload?: any;
}

export interface AgentResponseOutputItem {
  type: 'message' | 'reasoning' | 'trace_summary' | string;
  role?: string;
  text?: string;
}

export interface AgentResponse {
  id: string;
  object: 'agent.response';
  created: number;
  agent_id?: string;
  backend?: string;
  session_id?: string | null;
  mode?: 'invoke' | 'pipe' | 'pty' | string;
  status?: 'completed' | 'in_progress' | 'failed' | string;
  output_text?: string;
  output?: AgentResponseOutputItem[];
  trace?: AgentTraceEvent[];
  trace_truncated?: boolean;
  error?: string | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    reasoning_tokens?: number;
    total_tokens?: number;
  };
  success?: boolean;
  partial_success?: boolean;
  agent_count?: number;
  success_count?: number;
  results?: any[];
  session?: AiAgentSession;
}

export interface ProjectAiAgentSessionItem extends AiAgentSession {
  project_id: string;
  agent_key: string;
  service_name: string;
  agent_hostname?: string;
  agent_ip?: string;
  health_status?: string;
  is_invalid: boolean;
  invalid_reasons: string[];
}

export interface ProjectAiAgentSessionGlobalListResponse {
  project_id: string;
  items: ProjectAiAgentSessionItem[];
  total: number;
  page?: number;
  per_page?: number;
  filtered_total?: number;
  filters?: {
    nodes?: string[];
    service_names?: string[];
    statuses?: string[];
    invalid_reasons?: string[];
  };
  stats?: {
    total_sessions: number;
    normal_count: number;
    invalid_count: number;
    helper_total: number;
    helper_reachable_count: number;
    helper_unreachable_count: number;
  };
  helper_unreachable?: Array<{
    agent_key: string;
    service_name: string;
    agent_hostname?: string;
    agent_ip?: string;
    health_status?: string;
    error?: string;
  }>;
}

export interface ProjectAiAgentSessionTerminateTarget {
  agent_key: string;
  service_name: string;
  session_id: string;
}

export interface ProjectAiAgentSessionBatchTerminateResult {
  project_id: string;
  status: 'success' | 'partial_success' | 'failed' | string;
  total: number;
  success_count: number;
  failed_count: number;
  results: Array<ProjectAiAgentSessionTerminateTarget & {
    success: boolean;
    status_code?: number;
    error?: string;
    response?: any;
  }>;
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

export interface AiBatchSessionSummary {
  batch_id: string;
  project_id: string;
  status: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  session_mode?: 'pty' | 'pipe' | 'invoke' | string;
  helper_total: number;
  success_count: number;
  failed_count: number;
  pending_count: number;
}

export interface AiBatchSession {
  batch_id: string;
  project_id: string;
  status: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  session_mode?: 'pty' | 'pipe' | 'invoke' | string;
  items: AiBatchItem[];
}

export interface AiSessionStreamEvent {
  type:
    | 'start'
    | 'delta'
    | 'done'
    | 'error'
    | 'response.created'
    | 'response.output_text.delta'
    | 'response.reasoning.delta'
    | 'response.trace.item'
    | 'response.completed'
    | 'response.failed';
  session_id?: string;
  agent_id?: string;
  delta?: string;
  source?: string;
  session?: AiAgentSession;
  result?: any;
  error_message?: string;
  response_id?: string;
  response?: AgentResponse;
  item?: AgentTraceEvent;
}

export interface AiBatchStreamEvent {
  type: 'start' | 'item' | 'done' | 'error';
  batch_id?: string;
  round_no?: number;
  total_items?: number;
  role?: string;
  content?: string;
  status?: string;
  agent_key?: string;
  service_name?: string;
  success?: boolean;
  status_code?: number;
  response?: any;
  error?: string;
  error_message?: string;
  results?: any[];
  partial_success?: boolean;
}

export interface Workspace {
  id: string;
  name: string;
}

export type ScheduleTriggerType = 'cron' | 'interval' | 'manual';
export type ScheduleAuthMode = 'none' | 'bearer_passthrough' | 'machine_token' | 'static_bearer';
export type ScheduleExecutionStatus = 'queued' | 'leased' | 'dispatching' | 'retry_wait' | 'succeeded' | 'failed' | 'timeout' | 'cancelled';
export type LiteLLMVirtualKeyStatus = 'active' | 'disabled' | 'expired' | 'deleted';

export interface ScheduleJobSummary {
  id: string;
  project_id: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  trigger_type: ScheduleTriggerType;
  cron_expr?: string | null;
  interval_seconds?: number | null;
  timezone: string;
  target_method: string;
  target_url: string;
  target_headers: Record<string, any>;
  target_query: Record<string, any>;
  target_body_template: Record<string, any>;
  auth_mode: ScheduleAuthMode;
  static_bearer_token?: string | null;
  success_status_codes: number[];
  response_task_id_path?: string | null;
  dedupe_window_seconds: number;
  version: number;
  max_concurrency: number;
  dispatch_timeout_seconds?: number | null;
  retry_policy: Record<string, any>;
  target_bucket?: string | null;
  misfire_policy: 'skip' | 'fire_once' | 'catch_up_limited';
  paused_until?: string | null;
  deleted?: boolean;
  last_run_at?: string | null;
  next_run_at?: string | null;
  inflight_count?: number;
  last_execution_status?: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export type ScheduleJobDetail = ScheduleJobSummary;

export interface ScheduleExecution {
  id: string;
  schedule_job_id: string;
  project_id: string;
  trigger_source: string;
  status: ScheduleExecutionStatus;
  scheduled_for?: string | null;
  dedupe_key: string;
  attempt_no: number;
  lease_owner?: string | null;
  lease_expire_at?: string | null;
  heartbeat_at?: string | null;
  worker_pod?: string | null;
  target_bucket?: string | null;
  retry_at?: string | null;
  result_code?: string | null;
  result_reason?: string | null;
  request_snapshot: Record<string, any>;
  response_snapshot: Record<string, any>;
  http_status?: number | null;
  error_message?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  duration_ms?: number | null;
  downstream_task_id?: string | null;
  downstream_task_name?: string | null;
  trace_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleExecutionEvent {
  id: string;
  execution_id?: string;
  event_type: string;
  event_source?: string;
  attempt_no?: number | null;
  lease_token?: string | null;
  message: string;
  payload: Record<string, any>;
  created_at: string;
}

export interface ScheduleUserTaskEvent {
  id: string;
  project_id: string;
  user_task_id: string;
  task_type: string;
  event_category: string;
  event_type: string;
  result_status: string;
  event_source: string;
  actor?: string | null;
  message: string;
  payload: Record<string, any>;
  downstream_task_id?: string | null;
  dispatch_id?: string | null;
  sync_queue?: string | null;
  error_code?: string | null;
  created_at: string;
}

export interface ScheduleUserTaskEventListResponse {
  total: number;
  items: ScheduleUserTaskEvent[];
  page: number;
  page_size: number;
}

export interface ScheduleRuntimeOverview {
  queue?: {
    length: number;
    oldest_age_seconds: number;
    backend: string;
  };
  leader?: {
    token?: string | null;
    is_local: boolean;
    pod_name: string;
  };
  workers?: {
    local_pod: string;
    concurrency: number;
    inflight_executions: number;
  };
  stats?: {
    jobs_total: number;
    active_jobs: number;
    succeeded_total: number;
    failed_total: number;
  };
  redis_available: boolean;
}

export interface ScheduleRuntimeQueuePreviewItem {
  queue_key: string;
  queue_name: string;
  queue_group: 'execution' | 'maintenance' | 'user_task_sync' | string;
  queue_kind: 'fifo_ready' | 'delayed_zset' | 'sync_ready' | string;
  description: string;
  priority?: number | null;
  length: number;
  oldest_age_seconds: number;
  consumer_runtime: 'worker_runtime' | 'delete_worker_runtime' | 'user_task_sync_worker_runtime' | 'scheduler_runtime' | string;
  dedupe_enabled: boolean;
  has_enqueued_at_index: boolean;
  enabled: boolean;
  status: 'healthy' | 'idle' | 'disabled' | 'degraded' | 'scheduled' | string;
  backend?: string | null;
  next_due_in_seconds?: number | null;
}

export interface ScheduleRuntimeQueuePreviewGroup {
  group_key: 'execution' | 'maintenance' | 'user_task_sync' | string;
  group_name: string;
  items: ScheduleRuntimeQueuePreviewItem[];
}

export interface ScheduleRuntimeQueuePreview {
  redis_available: boolean;
  backend: string;
  refreshed_at: string;
  groups: ScheduleRuntimeQueuePreviewGroup[];
}

export interface ScheduleGlobalTaskOverview {
  stats: {
    total_tasks: number;
    unprocessed_tasks: number;
    scheduled_tasks: number;
    queued_tasks: number;
    retry_wait_tasks: number;
    running_tasks: number;
    succeeded_tasks: number;
    failed_tasks: number;
    cancelled_tasks: number;
  };
  queue: {
    depth: number;
    oldest_age_seconds: number;
    backend?: string | null;
  };
  workers: {
    active: number;
    concurrency: number;
    inflight: number;
  };
  health: {
    status: string;
    redis_available: boolean;
  };
  refreshed_at?: string | null;
}

export interface ScheduleGlobalTaskListItem {
  task_id: string;
  project_id?: string | null;
  project_name?: string | null;
  task_name: string;
  task_type?: string | null;
  root_task_key_prefix?: string | null;
  parent_task_key_prefix?: string | null;
  dispatched_task_key_prefix?: string | null;
  create_status?: string | null;
  dispatch_status?: string | null;
  dispatch_wait_reason?: string | null;
  dispatch_next_retry_at?: string | null;
  dispatch_wait_started_at?: string | null;
  dispatch_wait_attempt_count?: number | null;
  business_status?: string | null;
  queue_state?: string | null;
  queue_state_tone?: string | null;
  last_synced_at?: string | null;
  current_status?: string | null;
  display_status_group?: string | null;
  attempt_no?: number | null;
  retry_count?: number | null;
  is_retrying?: boolean | null;
  queue_depth_position?: number | null;
  downstream_task_id?: string | null;
  downstream_detail_view?: string | null;
  active_task_key_prefix?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  scheduled_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  last_error?: string | null;
}

export interface ScheduleGlobalTaskListResponse {
  items: ScheduleGlobalTaskListItem[];
  total: number;
  page: number;
  page_size: number;
  sort_field?: string | null;
  sort_direction?: string | null;
}

export interface ScheduleGlobalTaskDetail extends ScheduleGlobalTaskListItem {
  project_display_name?: string | null;
  status_summary?: Record<string, any> | null;
  current_dispatch?: Record<string, any> | null;
  latest_dispatch?: Record<string, any> | null;
  current_execution?: Record<string, any> | null;
  latest_execution?: Record<string, any> | null;
  recent_events?: Array<Record<string, any>>;
  latest_failure?: Record<string, any> | null;
}

export interface ScheduleJobRuntime {
  job_id: string;
  project_id: string;
  next_run_at?: string | null;
  last_run_at?: string | null;
  inflight_count: number;
  last_execution_status?: string | null;
  recent_error_rate: number;
}

export interface VirtualKey {
  id: string;
  project_id: string;
  name: string;
  alias?: string | null;
  status: LiteLLMVirtualKeyStatus;
  litellm_key_id?: string | null;
  key_suffix?: string | null;
  models: string[];
  metadata: Record<string, any>;
  budget_config: Record<string, any>;
  expires_at?: string | null;
  last_synced_at?: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export type ScheduleCenterUserTaskType =
  | 'binary_firmware_e2e'
  | 'source_scan_e2e'
  | 'kg_source_vuln_scan_e2e'
  | 'binary_module_e2e'
  | 'ai4red'
  | 'ai4app_fast'
  | 'ai4app_deep'
  | 'ai4web_fast'
  | 'ai4web_deep'
  | 'sechps_tool'
  | 'redline_verification_e2e';

export interface AgentAppSummary {
  id: string;
  name: string;
  engine: string;
  modelAliasId?: number | null;
  agentHarnessPath?: string | null;
  agentHarnessRepoName?: string | null;
  defaultAgentName: string;
  startCommand?: string | null;
}

export interface ScheduleCenterUserTaskInput {
  input_upload_id: string;
  input_type: string;
  input_label: string;
  target_path: string;
  latest_batch_id?: string | null;
  keep_original: boolean;
  selection_type?: 'file' | 'file_list' | 'directory' | string;
  relative_path?: string | null;
  relative_paths?: string[] | null;
  resolved_path?: string | null;
  display_name?: string | null;
}

export interface ScheduleCenterUserTask {
  id: string;
  project_id: string;
  task_type: ScheduleCenterUserTaskType | string;
  agent_app_id?: string | null;
  agent_app_name?: string | null;
  agent_app_engine?: string | null;
  agent_app_agent_name?: string | null;
  agent_model_alias_id?: number | null;
  agent_harness_path?: string | null;
  tool_work_dir?: string | null;
  instruction?: string | null;
  task_subtype?: string | null;
  task_subtype_name?: string | null;
  name: string;
  description?: string | null;
  module_name?: string | null;
  create_status: string;
  dispatch_status: string;
  dispatch_wait_reason?: string | null;
  dispatch_next_retry_at?: string | null;
  dispatch_wait_started_at?: string | null;
  dispatch_wait_attempt_count?: number;
  business_status: string;
  input_upload_count: number;
  inputs: ScheduleCenterUserTaskInput[];
  parent_task_key_id?: string | null;
  parent_task_key_name?: string | null;
  parent_task_key_prefix?: string | null;
  parent_task_capacity_pool_ids?: number[];
  root_task_key_id?: string | null;
  root_task_key_name?: string | null;
  root_task_key_prefix?: string | null;
  root_task_capacity_pool_ids?: number[];
  dispatched_task_key_id?: string | null;
  dispatched_task_key_name?: string | null;
  dispatched_task_key_prefix?: string | null;
  downstream_task_id?: string | null;
  downstream_detail_view?: string | null;
  downstream_status_raw?: string | null;
  downstream_status_mapped?: string | null;
  downstream_report_ready?: boolean;
  display_status?: string;
  sync_status?: string;
  sync_queue?: string | null;
  sync_required?: boolean;
  sync_policy_key?: string | null;
  last_synced_at?: string | null;
  last_sync_started_at?: string | null;
  next_sync_at?: string | null;
  sync_delay_seconds?: number | null;
  sync_attempt_count?: number;
  sync_consecutive_error_count?: number;
  sync_worker_id?: string | null;
  sync_lease_expires_at?: string | null;
  last_sync_error?: string | null;
  last_sync_http_status?: number | null;
  delete_status?: 'none' | 'queued' | 'running' | 'blocked' | 'failed' | string;
  delete_error?: string | null;
  delete_requested_at?: string | null;
  delete_started_at?: string | null;
  delete_finished_at?: string | null;
  last_error?: string | null;
  created_by: string;
  started_at?: string | null;
  finished_at?: string | null;
  updated_at: string;
  created_at: string;
}

export interface ScheduleCenterUserTaskListResponse {
  total: number;
  items: ScheduleCenterUserTask[];
  stats: Record<string, number>;
  page?: number;
  page_size?: number;
  sort_by?: string | null;
  sort_direction?: string | null;
}

/**
 * 项目下用户任务的 5 档状态统计（由后端按 display_status 收敛）。
 * GET /api/chirmera-platform-schedule/projects/{project_id}/user-tasks/stats
 *
 * 收敛口径：
 *  - pending:   pending、stopped
 *  - running:   running、dispatching、queued、created、unknown、retry_wait、paused 等非终态
 *  - failed:    failed
 *  - success:   success、partial_success
 *  - cancelled: cancelled
 */
export interface ScheduleCenterUserTaskStats {
  total: number;
  pending: number;
  running: number;
  failed: number;
  success: number;
  cancelled: number;
}

export interface ScheduleCenterUserTaskDeleteQueueItem {
  id: string;
  project_id: string;
  name: string;
  task_type: ScheduleCenterUserTaskType | string;
  display_status: string;
  delete_status: 'queued' | 'running' | 'blocked' | 'failed' | string;
  delete_error?: string | null;
  last_error?: string | null;
  downstream_task_id?: string | null;
  delete_requested_at?: string | null;
  delete_started_at?: string | null;
  delete_finished_at?: string | null;
  updated_at: string;
}

export interface ScheduleCenterUserTaskDeleteQueueResponse {
  total: number;
  items: ScheduleCenterUserTaskDeleteQueueItem[];
  page: number;
  page_size: number;
  stats: {
    queued_total: number;
    running_total: number;
    blocked_total: number;
    failed_total: number;
  };
}

export interface ScheduleCenterUserTaskCreatePayload {
  task_type: ScheduleCenterUserTaskType | string;
  name: string;
  description?: string;
  input_upload_ids: string[];
  input_binding?: {
    upload_id: string;
    selection_type: 'file' | 'file_list' | 'directory';
    relative_path?: string;
    relative_paths?: string[];
  };
  policy: Record<string, any>;
  dispatch_policy: Record<string, any>;
  module_name?: string;
  agent_app_id?: string;
  agent_app_name?: string;
  agent_app_engine?: string;
  agent_app_agent_name?: string;
  agent_model_alias_id?: number | null;
  agent_harness_path?: string;
  tool_work_dir?: string;
  instruction?: string;
  parent_task_key_id?: string;
  parent_task_key_name?: string;
  parent_task_key_prefix?: string;
  parent_task_key_secret?: string;
}

export interface ScheduleCenterUserTaskDispatch {
  id: string;
  user_task_id: string;
  project_id: string;
  dispatch_status: string;
  root_task_key_id?: string | null;
  root_task_key_name?: string | null;
  root_task_key_prefix?: string | null;
  root_task_capacity_pool_ids?: number[] | null;
  dispatched_task_key_id?: string | null;
  dispatched_task_key_name?: string | null;
  dispatched_task_key_prefix?: string | null;
  downstream_task_id?: string | null;
  downstream_detail_view?: string | null;
  downstream_status_raw?: string | null;
  downstream_status_mapped?: string | null;
  downstream_report_ready?: boolean;
  last_error?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ScheduleCenterUserTaskDispatchListResponse {
  total: number;
  items: ScheduleCenterUserTaskDispatch[];
}

export interface ScheduleCenterUserTaskBulkDeleteFilters {
  status?: string;
  task_type?: string;
  agent_app_id?: string;
  search?: string;
  has_error?: boolean;
  is_retrying?: boolean;
}

export interface ScheduleCenterUserTaskBulkDeleteRequest {
  task_ids?: string[];
  filters?: ScheduleCenterUserTaskBulkDeleteFilters;
  select_all_matching?: boolean;
}

export interface ScheduleCenterUserTaskBulkDeleteItemResult {
  task_id: string;
  task_type?: string | null;
  downstream_task_id?: string | null;
  status: string;
  message: string;
}

export interface ScheduleCenterUserTaskBulkDeleteResult {
  total_requested: number;
  queued_count: number;
  already_queued_count: number;
  failed_count: number;
  results: ScheduleCenterUserTaskBulkDeleteItemResult[];
}

export type ScheduleRuntimeTaskType =
  | 'binary_firmware_e2e'
  | 'source_scan_e2e'
  | 'kg_source_vuln_scan_e2e'
  | 'binary_module_e2e'
  | 'ai4red'
  | 'ai4app_fast'
  | 'ai4app_deep'
  | 'ai4web_fast'
  | 'ai4web_deep'
  | 'sechps_tool';

export type ScheduleDispatchMode = 'balanced' | 'fifo' | 'priority_first';
export type ScheduleQueueStrategy = 'strict_fifo' | 'capacity_aware';

export interface ScheduleRuntimeSchedulerPolicy {
  dispatch_mode: ScheduleDispatchMode;
  queue_strategy: ScheduleQueueStrategy;
  project_default_concurrency: number;
  target_default_concurrency: number;
  worker_concurrency: number;
  ready_backfill_batch_size: number;
  db_fallback_batch_size: number;
}

export interface ScheduleRuntimeUserTaskSyncPolicy {
  enabled: boolean;
  worker_concurrency: number;
  lease_seconds: number;
  heartbeat_interval_seconds: number;
  db_fallback_batch_size: number;
  queue_pop_timeout_seconds: number;
  reclaim_batch_size: number;
  dispatching_seconds: number;
  running_seconds: number;
  paused_seconds: number;
  terminal_verify_seconds: number;
  retry_initial_seconds: number;
  retry_max_seconds: number;
  failure_threshold: number;
}

export interface ScheduleRuntimeToolDefault {
  task_type: ScheduleRuntimeTaskType;
  label: string;
  create_task_enabled?: boolean | null;
  root_task_key_max_concurrency: number;
  capacity_pool_ids: number[];
  root_task_key_expires_at?: string | null;
}

export interface ScheduleRuntimeTimeWindow {
  name: string;
  enabled: boolean;
  start_time: string;
  end_time: string;
  scheduler_policy?: ScheduleRuntimeSchedulerPolicy | null;
  user_task_sync_policy?: ScheduleRuntimeUserTaskSyncPolicy | null;
  tool_defaults: ScheduleRuntimeToolDefault[];
}

export interface ScheduleRuntimeEffectiveConfig {
  source: 'default' | 'database';
  active_time_window_name?: string | null;
  timezone: string;
  scheduler_policy: ScheduleRuntimeSchedulerPolicy;
  user_task_sync_policy: ScheduleRuntimeUserTaskSyncPolicy;
  tool_defaults: ScheduleRuntimeToolDefault[];
}

export interface ScheduleRuntimeConfig {
  config_key: string;
  timezone: string;
  scheduler_policy: ScheduleRuntimeSchedulerPolicy;
  user_task_sync_policy: ScheduleRuntimeUserTaskSyncPolicy;
  tool_defaults: ScheduleRuntimeToolDefault[];
  time_windows: ScheduleRuntimeTimeWindow[];
  version: number;
  updated_by?: string | null;
  updated_at?: string | null;
  source: 'default' | 'database';
  effective_now: ScheduleRuntimeEffectiveConfig;
}

export interface VirtualKeyCreateResult extends VirtualKey {
  plain_text_key?: string | null;
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
  | 'home' | 'dashboard' | 'admin-dashboard' | 'project-mgmt' | 'project-detail' | 'product-mgmt' | 'static-packages' | 'static-package-detail' | 'deploy-script-mgmt'
  | 'task-nuzhua' | 'task-smart-jar' | 'task-apk-smart-scan' | 'task-binary-end-to-end' | 'task-web-end-to-end'
  | 'developer-atomic-capability' | 'developer-atomic-capability-overview' | 'developer-tools' | 'developer-tools-overview' | 'tool-registration'
  | 'public-resource-pvc-management' | 'public-resource-task-management' | 'test-input-release' | 'test-input-code' | 'test-input-doc' | 'test-input-tasks' | 'test-input-other' | 'pvc-management' | 'project-file-explorer' | 'fileserver-archive-tasks'
  | 'config-center-root' | 'config-center-llm' | 'config-center-llm-chat' | 'aigw-dashboard' | 'aigw-config' | 'aigw-keys' | 'aigw-logs' | 'aigw-admin' | 'chimera-platform-schedule'
  | 'chimera-platform-schedule-config' | 'task-center-timeline'
  | 'env-mgmt' | 'env-access' | 'env-management' | 'env-agent' | 'env-service' | 'env-ai-agent' | 'env-ai-agent-overview' | 'env-ai-helper' | 'env-ai-agent-manage' | 'env-ai-agent-session-manage' | 'env-ai-session' | 'env-ai-batch-session' | 'env-template' | 'env-tasks'
  | 'env-process-monitor-root' | 'env-process-monitor-overview' | 'env-process-monitor-detail' | 'env-process-monitor-tasks'
  | 'system-analysis-root' | 'system-analysis-overview' | 'system-analysis-task' | 'system-analysis-detail' | 'system-analysis-history' | 'system-analysis-prompt' | 'system-analysis-config'
  | 'workflow-instances' | 'workflow-instance-detail' | 'workflow-instance-logs' | 'workflow-jobs' | 'workflow-job-detail' | 'workflow-apps' | 'workflow-app-detail' | 'workflow-app-instances' | 'workflow-app-instance-detail'
  | 'pentest-root' | 'pentest-system'
  | 'pentest-threat' | 'pentest-exec-code' | 'pentest-exec-work' | 'pentest-dataflow'
  | 'pentest-dataflow-vuln-scan'
  | 'pentest-vuln-verify-v2' | 'pentest-web-vuln-verify'
  | 'pentest-exec-firmware-unpacker' | 'pentest-exec-firmware-task-list' | 'pentest-exec-firmware-config'
  | 'pentest-exec-b2s' | 'pentest-exec-b2s-root' | 'pentest-exec-b2s-task-list' | 'pentest-exec-b2s-create' | 'pentest-exec-b2s-queue' | 'pentest-exec-b2s-result' | 'pentest-exec-b2s-detail' | 'pentest-exec-b2s-advanced'
  | 'binary-security' | 'binary-security-root' | 'binary-security-task-list' | 'binary-security-detail' | 'binary-security-config'
  | 'source-security' | 'source-security-detail'
  | 'kg-source-security' | 'kg-source-security-detail'
  | 'binary-module-security' | 'binary-module-security-detail'
  | 'app-security-scan' | 'app-security-scan-detail' | 'app-security-scan-monitor'
  | 'cfg-db-vuln-tool' | 'cfg-db-vuln-detail'
  | 'redline-verification' | 'redline-verification-detail'
  | 'cairn-blackboard'
  | 'mobile-security-ipc-vuln'
  // [DISABLED] 数据流漏洞挖掘 - 方便后续复用
  // | 'pentest-exec-dataflow-vuln' | 'pentest-exec-dataflow-vuln-task-list' | 'pentest-exec-dataflow-vuln-task-detail' | 'pentest-exec-dataflow-vuln-system-config'
  // | 'binary-evolution-dataflow-vuln'
  | 'binary-evolution-center' | 'binary-evolution-firmware-unpacker'
  | 'pentest-report'
  | 'security-assessment' | 'vuln-engine' | 'vuln-overview' | 'vuln-intake' | 'vuln-list' | 'vuln-analysis' | 'vuln-analysis-detail' | 'vuln-analysis-verify-create' | 'vuln-verification' | 'vuln-verification-detail' | 'vuln-decision' | 'vuln-decision-detail' | 'vuln-queue' | 'vuln-services' | 'vuln-repro-config' | 'vuln-parameter-config'
  | 'sys-settings' | 'change-password'
  | 'user-mgmt-users' | 'user-mgmt-roles' | 'user-mgmt-perms' | 'user-mgmt-access' | 'user-mgmt-online' | 'user-mgmt-machine'
  | 'org-mgmt-departments' | 'org-mgmt-members' | 'org-mgmt-projects'
  | 'sec-assessment-project' | 'sec-baseline-mgmt';

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

export interface AiGatewayBackendUnit {
  id: number;
  capacity_pool_id: number;
  api_base_url: string;
  model_name: string;
  api_key_ciphertext?: string;
  api_key_fingerprint?: string;
  total_max_concurrency: number;
  priority_default: number;
  supports_chat_completions: boolean;
  supports_responses: boolean;
  supports_messages: boolean;
  enabled: boolean;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AiGatewayModelAlias {
  id: number;
  alias_name: string;
  max_tokens_default: number;
  temperature_default: number;
  enabled: boolean;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AiGatewayModelAliasBinding {
  id: number;
  model_alias_id: number;
  backend_unit_id: number;
  priority: number;
  weight: number;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AiGatewayProviderStat {
  model_name: string;
  request_count: number;
  avg_response_time: number;
  avg_first_token_latency?: number;
  avg_token_latency?: number;
  active_requests?: number;
  waiting_requests?: number;
  success_rate?: number;
  backend_unit_id?: number;
  model_alias_id?: number;
  backend_config_id?: number;
  backend_model_name?: string;
  backend_api_base_url?: string;
  adaptive_routing_score?: number;
}

export interface AiGatewayLlmKey {
  id: number;
  key_name: string;
  key_type: 'task' | 'work' | 'app' | string;
  app_id?: string;
  app_name?: string;
  parent_key_id?: number | null;
  key_prefix: string;
  max_concurrency: number;
  project_id?: string;
  project_name?: string;
  task_id: string;
  task_name?: string;
  sub_task_id: string;
  sub_task_name?: string;
  enabled: boolean;
  expires_at?: string | null;
  description: string;
  capacity_pool_ids: number[];
  // Legacy compatibility field; current aigw admin flow is capacity-pool scoped.
  model_alias_ids: number[];
  // Legacy compatibility field; current aigw admin flow does not edit task_bindings.
  task_bindings: AiGatewayLlmKeyTaskBindingInput[];
  created_at: string;
  updated_at: string;
}

export interface AiGatewayLlmKeyTaskBindingInput {
  task_id: string;
  sub_task_id: string;
}

export interface AiGatewayLlmKeyCreatePayload {
  key_name: string;
  key_type: 'task' | 'work' | 'app';
  app_id?: string;
  app_name?: string;
  parent_key_id?: number | null;
  max_concurrency: number;
  project_id?: string;
  project_name?: string;
  task_id: string;
  task_name?: string;
  sub_task_id: string;
  sub_task_name?: string;
  enabled: boolean;
  expires_at?: string | null;
  description: string;
  capacity_pool_ids: number[];
  // Legacy compatibility field; retained for backend/client compatibility only.
  model_alias_ids: number[];
  // Legacy compatibility field; retained for backend/client compatibility only.
  task_bindings: AiGatewayLlmKeyTaskBindingInput[];
}

export interface AiGatewayLlmKeyCreateResponse {
  key: AiGatewayLlmKey;
  secret: string;
}

export interface AiGatewayCapacityPool {
  id: number;
  pool_name: string;
  enabled: boolean;
  description: string;
  created_at?: string;
  updated_at?: string;
}

export interface AiGatewayConnectionTestResult {
  success?: boolean;
  reachable?: boolean;
  error?: string;
  error_message?: string;
  message?: string;
  latency_ms?: number;
  status_code?: number;
}

export interface AiGatewayLogSummary {
  id: number;
  created_at: string;
  updated_at: string;
  endpoint: string;
  is_stream: boolean;
  status_code: number;
  model_name: string;
  llm_key_id: number;
  llm_key_prefix: string;
  task_key_id: number;
  task_key_prefix: string;
  app_id: string;
  app_name?: string;
  task_id: string;
  sub_task_id: string;
  model_alias_id: number;
  capacity_pool_id: number;
  backend_unit_id: number;
  backend_config_id: number;
  backend_model_name: string;
  backend_api_base_url: string;
  fingerprint: string;
  response_time: number;
  first_token_latency: number;
  avg_token_latency: number;
  active_requests: number;
  request_preview: string;
  request_bytes: number;
  response_bytes: number;
  stream_bytes: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  gateway_cache_hit: boolean;
}

export interface AiGatewayLogListResponse {
  total: number;
  logs: AiGatewayLogSummary[];
}

export interface AiGatewayLogDetail extends AiGatewayLogSummary {
  request?: string;
  response?: string;
  stream_response?: string;
  provider_cached_tokens?: number;
  provider_cache_hit_tokens?: number;
  provider_cache_miss_tokens?: number;
  gateway_cache_key?: string;
  gateway_cache_saved_tokens?: number;
  gateway_cache_saved_cost?: number;
  usage_source?: string;
  pricing_version?: string;
  estimated_cost?: number;
}

export interface AiGatewayReplayResponse {
  original_request: string;
  modified_request: string;
  original_response: string;
  new_response: string;
  model_name: string;
  actual_model_name: string;
  response_time: number;
  error?: string;
}

export interface AiGatewayTokenStatsSummary {
  total_requests: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  total_estimated_cost: number;
  cache_saved_tokens: number;
  cache_saved_cost: number;
}

export interface AiGatewayProjectTokenStats {
  project_id: string;
  project_name: string;
  request_count: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost: number;
  cache_saved_tokens: number;
  cache_saved_cost: number;
  task_count: number;
}

export interface AiGatewayTaskTokenStats {
  task_id: string;
  task_name: string;
  project_id: string;
  project_name: string;
  request_count: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost: number;
  cache_saved_tokens: number;
  cache_saved_cost: number;
  sub_task_count: number;
}

export interface AiGatewaySubTaskTokenStats {
  sub_task_id: string;
  sub_task_name: string;
  task_id: string;
  task_name: string;
  project_id: string;
  project_name: string;
  request_count: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost: number;
  cache_saved_tokens: number;
  cache_saved_cost: number;
}

export interface AiGatewayTokenStatsTrendPoint {
  date: string;
  request_count: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost: number;
}

export type AnalysisRiskLevel = 'unknown' | 'low' | 'medium' | 'high' | 'critical';
export type AnalysisTaskStatus = 'pending' | 'preparing' | 'running' | 'partial_success' | 'success' | 'failed' | 'cancelled';
export type AnalysisTaskType =
  | 'general_env_check'
  | 'service_dependency_check'
  | 'tool_readiness_check'
  | 'network_connectivity_check'
  | 'custom';

export interface SystemAnalysisAiAgentOption {
  agent_id: string;
  agent_name: string;
}

export interface SystemAnalysisCapabilityNode {
  agent_key: string;
  agent_hostname?: string | null;
  agent_ip?: string | null;
  agent_status: string;
  helper_installed: boolean;
  helper_service_name?: string | null;
  helper_status?: string | null;
  available_ai_agents: SystemAnalysisAiAgentOption[];
  last_analysis_at?: string | null;
  last_analysis_summary?: string | null;
}

export interface SystemAnalysisCapabilitiesResponse {
  project_id: string;
  summary: {
    total_nodes: number;
    online_nodes: number;
    helper_ready_nodes: number;
    analyzable_nodes: number;
  };
  items: SystemAnalysisCapabilityNode[];
}

export interface SystemAnalysisTaskItem {
  task_id: string;
  project_id: string;
  task_name: string;
  analysis_type: AnalysisTaskType;
  status: AnalysisTaskStatus;
  risk_level: AnalysisRiskLevel;
  total_nodes: number;
  success_nodes: number;
  failed_nodes: number;
  created_by?: string | null;
  created_at: string;
  finished_at?: string | null;
}

export interface SystemAnalysisTaskDetail extends SystemAnalysisTaskItem {
  prompt_template_id?: string | null;
  prompt_content: string;
  running_nodes: number;
  cancelled_nodes: number;
  execution_config: {
    timeout_seconds?: number;
    max_concurrency?: number;
  };
  summary_json: Record<string, any>;
  started_at?: string | null;
}

export interface SystemAnalysisTaskNodeItem {
  agent_key: string;
  agent_hostname?: string | null;
  agent_ip?: string | null;
  helper_service_name: string;
  helper_session_id?: string | null;
  ai_agent_id: string;
  status: string;
  risk_level: AnalysisRiskLevel;
  result_summary?: string | null;
  error_message?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface SystemAnalysisTaskNodesResponse {
  task_id: string;
  items: SystemAnalysisTaskNodeItem[];
  total: number;
}

export interface SystemAnalysisReport {
  report_id: string;
  task_id: string;
  project_id: string;
  risk_level: AnalysisRiskLevel;
  summary_markdown: string;
  summary_json: Record<string, any>;
  generated_at: string;
}

export interface SystemAnalysisPromptTemplate {
  prompt_id: string;
  name: string;
  category: string;
  description?: string | null;
  content: string;
  variables_json: string[];
  version: number;
  is_default: boolean;
  is_enabled: boolean;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SystemAnalysisStageLoopConfig {
  min_rounds: number;
  pass_mode: 'majority' | 'all';
}

export interface SystemAnalysisAgentInstance {
  model: string;
  tools?: string[] | null;
  thinking_level?: string | null;
}

export interface SystemAnalysisRoleConfig {
  default_model?: string;
  default_tools?: string[];
  system_prompt_dir: string;
  default_thinking_level: string;
  agents?: SystemAnalysisAgentInstance[];
  stage_models?: Record<string, string>;
}

export interface SystemAnalysisPromptOverrideItem {
  content: string;
  source: 'default' | 'project';
  default_content?: string;
}

export interface SystemAnalysisPromptOverrideGroup {
  workers: Record<string, SystemAnalysisPromptOverrideItem>;
  judges: Record<string, SystemAnalysisPromptOverrideItem>;
}

export interface SystemAnalysisStagesConfig {
  classify: SystemAnalysisStageLoopConfig;
  refine: SystemAnalysisStageLoopConfig;
  analyse: SystemAnalysisStageLoopConfig;
  final_check: SystemAnalysisStageLoopConfig;
}

export interface SystemAnalysisSelfReflectionConfig {
  enabled: boolean;
  model: string;
  output_dir: string;
  max_session_lines: number;
}

export interface SystemAnalysisServiceConfig {
  project_id?: string;
  max_rounds_exceeded_action: 'treat_as_passed' | 'treat_as_failed';
  continue_on_module_failure: boolean;
  analyse_targets: string[];
  binary_arch: string[];
  security_focus_categories: string[];
  module_granularity: string;
  filter_engine: 'script' | 'agent';
  enable_final_check: boolean;
  super_fast_mode: boolean;
  worker_task_concurrency: number;
  parallel_modules: number;
  parallel_sub_workers: number;
  agent_max_retries: number;
  agent_retry_delay: number;
  agent_timeout_seconds: number;
  pi_max_retries: number;
  pi_retry_delay: number;
  model_stuck_timeout: number;
  model_stuck_max_activations: number;
  stages: SystemAnalysisStagesConfig;
  workers: SystemAnalysisRoleConfig;
  judges: SystemAnalysisRoleConfig;
  prompt_overrides: SystemAnalysisPromptOverrideGroup;
  output_dir: string;
  archive_dir: string;
  result_dir: string;
  start_stage: number;
  resume_workspace: string;
  self_reflection?: SystemAnalysisSelfReflectionConfig;
  updated_at?: string | null;
}

export interface SystemAnalysisModelEntry {
  id: string;
  reasoning: boolean;
}

export interface SystemAnalysisProviderConfig {
  baseUrl: string;
  api: string;
  apiKey: string;
  models: SystemAnalysisModelEntry[];
}

export interface SystemAnalysisModelsConfig {
  providers: Record<string, SystemAnalysisProviderConfig>;
  updated_at?: string | null;
}

export interface LlmProviderSummary {
  provider_key: string;
  display_name: string;
  provider_type: string;
  enabled: boolean;
  is_default: boolean;
  api_base: string;
  model: string;
  model_context_window: number;
  api_key: string;
  organization?: string | null;
  api_version?: string | null;
  timeout_seconds: number;
  max_tokens?: number | null;
  temperature?: number | null;
  env_bindings: Record<string, any>;
  file_bindings: LlmProviderFileBinding[];
  extra_config: Record<string, any>;
  description?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface LlmProviderFileBinding {
  name: string;
  path: string;
  content: string;
  format: 'json' | 'yaml' | 'yml' | 'toml' | 'env' | 'conf' | 'txt' | 'md' | 'xml' | 'ini' | 'other';
  enabled: boolean;
}

export interface LlmProviderDetail {
  provider_key: string;
  display_name: string;
  provider_type: string;
  enabled: boolean;
  is_default: boolean;
  api_base: string;
  model: string;
  model_context_window: number;
  api_key: string;
  organization?: string | null;
  api_version?: string | null;
  timeout_seconds: number;
  max_tokens?: number | null;
  temperature?: number | null;
  env_bindings: Record<string, any>;
  file_bindings: LlmProviderFileBinding[];
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
  model_context_window: number;
  api_key: string;
  organization?: string | null;
  api_version?: string | null;
  timeout_seconds: number;
  max_tokens?: number | null;
  temperature?: number | null;
  env_bindings: Record<string, any>;
  file_bindings: LlmProviderFileBinding[];
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

// ─── App System Analyse types ────────────────────────────────────────────────

export interface ExecutionAbnormalReasonEvidence {
  key?: string | null;
  label?: string | null;
  value?: string | null;
}

export interface ExecutionAbnormalReason {
  is_abnormal?: boolean;
  category?: string | null;
  code?: string | null;
  title?: string | null;
  message?: string | null;
  terminal?: boolean;
  source_layer?: string | null;
  status?: string | null;
  service?: string | null;
  stage_name?: string | null;
  item_key?: string | null;
  downstream_task_id?: string | null;
  downstream_service?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  evidence?: ExecutionAbnormalReasonEvidence[] | null;
  recommended_action?: string | null;
  related_event_ids?: string[] | null;
}

export interface ExecutionAbnormalReasonEventSummary {
  event_id?: string | null;
  created_at?: string | number | null;
  reason?: ExecutionAbnormalReason | null;
}

export interface AppSaTaskItem {
  task_id: string;
  project_id: string;
  analysis_mode?: 'binary' | 'source' | null;
  analysis_mode_label?: string | null;
  task_origin_type?: 'manual' | 'binary_security' | null;
  parent_project_id?: string | null;
  parent_task_id?: string | null;
  parent_task_type?: 'binary' | 'source' | 'binary_module' | null;
  parent_stage_name?: string | null;
  parent_stage_item_id?: string | null;
  parent_stage_item_key?: string | null;
  origin_label?: string | null;
  parent_task_display?: string | null;
  task_name: string;
  task_description?: string | null;
  input_path: string;
  output_path?: string | null;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'error' | 'cancelled';
  error?: string | null;
  abnormal_reason_title?: string | null;
  abnormal_reason_code?: string | null;
  abnormal_reason_category?: string | null;
  abnormal_reason?: ExecutionAbnormalReason | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  dispatcher_instance_id?: string | null;
  dispatch_started_at?: string | null;
  lease_epoch?: number | null;
  lease_expires_at?: string | null;
}

export interface AppSaTaskListItem {
  task_id: string;
  project_id: string;
  project_name?: string | null;
  analysis_mode?: 'binary' | 'source' | null;
  analysis_mode_label?: string | null;
  task_origin_type?: 'manual' | 'binary_security' | null;
  parent_project_id?: string | null;
  parent_task_id?: string | null;
  parent_task_type?: 'binary' | 'source' | 'binary_module' | null;
  parent_stage_name?: string | null;
  parent_stage_item_id?: string | null;
  parent_stage_item_key?: string | null;
  origin_label?: string | null;
  parent_task_display?: string | null;
  task_name: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'error' | 'cancelled';
  abnormal_reason_title?: string | null;
  abnormal_reason_code?: string | null;
  abnormal_reason_category?: string | null;
  abnormal_reason?: ExecutionAbnormalReason | null;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  dispatcher_instance_id?: string | null;
  dispatch_started_at?: string | null;
  lease_epoch?: number | null;
  lease_expires_at?: string | null;
}

export interface AppSaStageEvent {
  ts: number;
  type: string;
  data: Record<string, any>;
}

export interface AppSaStagesJson {
  events: AppSaStageEvent[];
  final?: boolean;
  event_count?: number;
  last_event_ts?: number | null;
  step_summary?: Record<string, {
    start_ts?: number | null;
    end_ts?: number | null;
    status?: 'pending' | 'running' | 'completed' | 'failed' | string;
  }>;
  latest_stage_data?: Record<string, Record<string, any>>;
}

export interface AppSaTaskDetail extends AppSaTaskItem {
  prompt_template_id?: string | null;
  prompt_content: string;
  result_json?: {
    result_file?: string | null;
    result_externalized?: boolean;
    status?: string | null;
    error?: string | null;
    module_count?: number;
    round_count?: number;
    total_duration_ms?: number | null;
    total_tokens?: Record<string, any> | null;
    preprocess_summary?: {
      total_input_file_count?: number | null;
      accepted_input_file_count?: number | null;
      selected_filter_engine?: 'script' | 'agent' | string | null;
      effective_filter_engine?: 'script' | 'agent' | string | null;
      fallback_reason?: string | null;
    } | null;
    summary?: Record<string, any> | null;
    [key: string]: any;
  } | null;
  stages_json?: AppSaStagesJson | null;
  task_config_json?: { analyse_targets?: string[]; binary_arch?: string[]; security_focus_categories?: string[]; module_granularity?: string; filter_engine?: 'script' | 'agent'; enable_final_check?: boolean; continue_on_module_failure?: boolean; super_fast_mode?: boolean; start_stage?: number; resume_workspace?: string; resolved_config_snapshot?: Record<string, any> } | null;
  agent_auth_json?: Record<string, any> | null;
  role_config_snapshot?: Record<string, any> | null;
  provider_runtime_summary?: Record<string, any> | null;
  llm_binding_snapshot?: Record<string, any> | null;
  /** 实际生效配置（task_config_json 覆盖项目配置后的合并结果） */
  effective_config_json?: { analyse_targets?: string[]; binary_arch?: string[]; security_focus_categories?: string[]; module_granularity?: string; filter_engine?: 'script' | 'agent'; enable_final_check?: boolean; continue_on_module_failure?: boolean; super_fast_mode?: boolean } | null;
  /** 每个字段的来源："task" = 任务级覆盖，"project" = 项目默认 */
  effective_config_source?: { analyse_targets?: 'task' | 'project'; binary_arch?: 'task' | 'project'; security_focus_categories?: 'task' | 'project'; module_granularity?: 'task' | 'project'; filter_engine?: 'task' | 'project'; enable_final_check?: 'task' | 'project'; continue_on_module_failure?: 'task' | 'project'; super_fast_mode?: 'task' | 'project' } | null;
  task_root?: string | null;
  run_root?: string | null;
  workspace_root?: string | null;
  output_root?: string | null;
  abnormal_reason_history?: ExecutionAbnormalReasonEventSummary[] | null;
  // 任务级模型/key 路由信息
  model_source?: 'config_center' | 'gateway' | string | null;
  key_type?: 'sk' | 'wsk' | string | null;
  key_info?: {
    type: string;
    id?: string | null;
    name?: string | null;
    prefix?: string | null;
    secret?: string | null;
    source?: string | null;
    sk_keys?: { provider: string; api_key: string; base_url: string; models: string[] }[];
  } | null;
  selected_models?: { worker?: string; reader?: string; judge?: string } | null;
  has_agent_task_key?: boolean | null;
  agent_task_key_prefix?: string | null;
}

export interface AppSaTaskResultSummary {
  module_count: number;
  high_risk_module_count: number;
  medium_risk_module_count: number;
  low_risk_module_count: number;
  total_file_count: number;
  threat_count: number;
}

export interface AppSaResultModuleSection {
  level: number;
  title: string;
  anchor: string;
}

export interface AppSaResultModule {
  module_name: string;
  rank: number;
  module_dir_path?: string | null;
  files_list_path?: string | null;
  module_report_path?: string | null;
  module_report_markdown?: string | null;
  files: string[];
  file_count: number;
  risk_level?: string | null;
  risk_score?: number | null;
  dependency_count?: number | null;
  reverse_dependency_count?: number | null;
  dependency_weight?: number | null;
  dependency_risk_bonus?: number | null;
  outer_layer_score?: number | null;
  report_sections: AppSaResultModuleSection[];
  report_preview?: string | null;
}

export interface AppSaTaskResult {
  task_id: string;
  available: boolean;
  status: string;
  output_root?: string | null;
  final_report_path?: string | null;
  modules_list_path?: string | null;
  module_dependency_graph_path?: string | null;
  module_dependency_db_path?: string | null;
  report_generation_type?: 'ai' | 'program' | 'unknown' | 'missing' | string;
  report_generation_label?: string | null;
  final_report_markdown?: string | null;
  module_dependency_graph?: {
    version?: number;
    direction?: string;
    summary?: { module_count?: number; edge_count?: number; symbol_export_count?: number; [key: string]: any };
    nodes?: Array<Record<string, any>>;
    edges?: Array<{ source: string; target: string; weight?: number; symbols?: string[]; needed?: string[]; files?: string[]; [key: string]: any }>;
    [key: string]: any;
  } | null;
  modules: AppSaResultModule[];
  summary: AppSaTaskResultSummary;
  warnings: string[];
}

export interface AppSaEvaluationSummary {
  task_id?: string;
  task_status?: string;
  error?: string | null;
  generated_at?: string;
  module_count?: number;
  completed_module_count?: number;
  failed_module_count?: number;
  completed_modules?: string[];
  failed_modules?: string[];
  round_count?: number;
  avg_rounds_per_module?: number;
  total_duration_ms?: number;
  avg_duration_ms?: number;
  total_token_usage?: Record<string, any>;
  total_tokens?: number;
  total_cost?: number;
  stage_summary?: Record<string, Record<string, any>>;
  effectiveness?: Record<string, any>;
  final_check_disabled?: boolean;
  missing_file_count?: number;
  missing_files?: string[];
  missing_files_preview?: string[];
  missing_files_computed_at?: string;
  [key: string]: any;
}

export interface AppSaEvaluationRound {
  task_id?: string;
  module_name?: string;
  stage?: string;
  round?: number;
  stage_round?: number;
  status?: string;
  raw_status?: string;
  started_at?: string;
  ended_at?: string;
  duration_ms?: number;
  worker?: Record<string, any>;
  judges?: Array<Record<string, any>>;
  metrics?: Record<string, any>;
  effectiveness?: Record<string, any>;
  module_completed?: boolean;
  completion_reason?: string;
  extra?: Record<string, any>;
  source_path?: string;
  [key: string]: any;
}

export interface AppSaTaskEvaluation {
  task_id: string;
  status: string;
  available: boolean;
  summary?: AppSaEvaluationSummary | null;
  rounds: AppSaEvaluationRound[];
  warnings: string[];
}

export interface AppSaTaskEvent {
  id: string;
  task_id: string;
  project_id: string;
  source?: string | null;
  level?: string | null;
  event_type: string;
  status?: string | null;
  stage_key?: string | null;
  stage_name?: string | null;
  module_name?: string | null;
  attempt?: number | null;
  worker_id?: string | null;
  execution_owner_id?: string | null;
  lease_epoch?: number | null;
  parent_task_id?: string | null;
  parent_stage_item_id?: string | null;
  message: string;
  payload?: Record<string, any> | null;
  payload_json?: Record<string, any> | null;
  created_at?: string | null;
  recorder_instance_id?: string | null;
  recorder_hostname?: string | null;
  recorder_pod_name?: string | null;
  recorder_node_name?: string | null;
  recorder_pod_ip?: string | null;
  recorder_role?: string | null;
  origin_instance_id?: string | null;
  origin_hostname?: string | null;
  origin_pod_name?: string | null;
  origin_node_name?: string | null;
  origin_role?: string | null;
}

export interface AppSaTaskTimeline {
  task_id: string;
  events: AppSaTaskEvent[];
}

export interface AppSaTaskStageEvents {
  task_id: string;
  status: string;
  final: boolean;
  events: AppSaStageEvent[];
}

export interface AppSaTaskActionResponse {
  status: string;
  task_id: string;
  message: string;
  deleted_event_count?: number | null;
}

export interface AppSaSessionMeta {
  session_id: string;
  session_name: string;
  relative_path: string;
  stage_group: string;
  role_name: string;
  size: number;
  mtime: number;
  event_count: number;
  line_count: number;
  is_active: boolean;
  display_name: string;
  warnings: string[];
}

export interface AppSaSessionIndexNode {
  node_id: string;
  relative_path: string;
  session_name: string;
  display_name: string;
  role: string;
  role_label: string;
  status: string;
  is_active: boolean;
  stage_key: string;
  stage_label: string;
  stage_order: number;
  stage_group: string;
  module_name?: string | null;
  attempt?: number | null;
  judge_index?: number | null;
  batch_index?: number | null;
  parent_relative_path?: string | null;
  parallel_group?: string | null;
  family_key?: string | null;
  flow_kind?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  started_ts?: number | null;
  last_event_at?: string | null;
  last_event_ts?: number | null;
  mtime: number;
  size: number;
  event_count: number;
  line_count: number;
  warnings: string[];
  session_header?: Record<string, any> | null;
  cwd?: string | null;
  model?: string | null;
  latest_round_ref?: Record<string, any> | null;
  round_refs: Array<Record<string, any>>;
  attempts_seen: number[];
}

export interface AppSaSessionIndexEdge {
  edge_id: string;
  source_node_id: string;
  target_node_id: string;
  kind: string;
  label: string;
}

export interface AppSaSessionIndexGroup {
  group_id: string;
  kind: string;
  label: string;
  stage_key?: string | null;
  module_name?: string | null;
  node_ids: string[];
}

export interface AppSaSessionIndex {
  task_id: string;
  status: string;
  sessions_root?: string | null;
  index_path?: string | null;
  generated_at?: string | null;
  summary?: Record<string, any> | null;
  nodes: AppSaSessionIndexNode[];
  edges: AppSaSessionIndexEdge[];
  groups: AppSaSessionIndexGroup[];
  warnings: string[];
}

export interface AppSaSessionEvent {
  type: string;
  line?: number;
  event_index?: number;
  timestamp?: string;
  display_timestamp?: string;
  role?: string;
  render_role?: string;
  provider?: string;
  modelId?: string;
  thinkingLevel?: string;
  thinkingLevelClass?: string;
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  parts?: Array<Record<string, any>>;
  summary?: string;
  raw_line?: string;
}

export interface AppSaSessionSnapshot {
  path: string;
  session_meta: Record<string, any>;
  events: AppSaSessionEvent[];
  warnings: string[];
  line_count: number;
}

export interface AgentObservabilitySummary {
  active_processes: number;
  residual_processes: number;
  killable_residual_processes: number;
  killable_unknown_processes?: number;
  unknown_processes: number;
  total_pods?: number | null;
  healthy_pods?: number | null;
  scan_errors?: number | null;
  aggregate_mode?: string | null;
  aggregate_partial?: boolean;
  aggregate_sources?: number | null;
  aggregate_fanout_errors?: number | null;
  aggregate_duration_seconds?: number | null;
  aggregate_cache_hit?: boolean;
  aggregate_cache_age_seconds?: number | null;
  aggregate_failed_targets?: string[];
  aggregate_all_sources_failed?: boolean;
  scanned_at?: number | null;
}

export interface AgentProcessSnapshot {
  pid: number;
  pgid?: number | null;
  ppid?: number | null;
  pod_name?: string | null;
  command?: string | null;
  cwd?: string | null;
  exe?: string | null;
  task_id?: string | null;
  task_name?: string | null;
  task_status?: string | null;
  stage_key?: string | null;
  role_kind?: string | null;
  runtime_kind?: string | null;
  match_source?: string | null;
  match_confidence?: string | null;
  workspace_root?: string | null;
  rss_bytes?: number | null;
  owner_kind: 'tracked' | 'residual' | 'unknown' | string;
  owner_reason?: string | null;
  kill_allowed?: boolean;
  kill_block_reason?: string | null;
  termination_state?: string | null;
}

export interface AgentTaskOwnershipSnapshot {
  task_id: string;
  task_name?: string | null;
  task_status?: string | null;
  stage_key?: string | null;
  pod_name?: string | null;
  process_count: number;
  agent_roles: string[];
  process_pids?: number[];
  ownership_status: 'tracked' | 'residual' | 'unknown' | string;
}

export interface AgentPodRuntimeSnapshot {
  pod_name: string;
  worker_id?: string | null;
  healthy?: boolean;
  process_count: number;
  tracked_process_count?: number;
  residual_process_count: number;
  unknown_process_count?: number;
  task_count?: number;
  running_task_count?: number;
  residual_task_count?: number;
  last_scanned_at?: number | null;
  scan_errors?: number;
  processes?: AgentProcessSnapshot[];
  tasks?: AgentTaskOwnershipSnapshot[];
}

export interface AgentRuntimeAggregateSummary {
  total_pods: number;
  healthy_pods: number;
  total_processes: number;
  tracked_processes: number;
  residual_processes: number;
  unknown_processes: number;
  killable_residual_processes: number;
  killable_unknown_processes: number;
  aggregate_partial?: boolean;
  aggregate_sources?: number | null;
  aggregate_fanout_errors?: number | null;
  aggregate_failed_targets?: string[];
  aggregate_all_sources_failed?: boolean;
  scanned_at?: number | null;
}

export interface AgentRuntimeAggregateResponse {
  summary: AgentRuntimeAggregateSummary;
  pods: AgentPodRuntimeSnapshot[];
  processes: AgentProcessSnapshot[];
  tasks: AgentTaskOwnershipSnapshot[];
}

export interface AgentProcessKillItem {
  pid: number;
  status: 'succeeded' | 'failed' | 'skipped' | string;
  reason?: string | null;
}

export interface AgentProcessKillResponse {
  requested: number;
  matched: number;
  succeeded: number;
  failed: number;
  skipped: number;
  items: AgentProcessKillItem[];
}

export interface AppSaTaskCreateRequest {
  project_id: string;
  task_name: string;
  input_path: string;
  output_path?: string;
  task_description?: string;
  prompt_template_id?: string;
  prompt_content?: string;
  analysis_mode?: 'binary' | 'source';
  analyse_targets?: string[];
  binary_arch?: string[];
  security_focus_categories?: string[];
  module_granularity?: string;
  filter_engine?: 'script' | 'agent';
  enable_final_check?: boolean;
  continue_on_module_failure?: boolean;
  task_origin_type?: 'manual' | 'binary_security';
  parent_project_id?: string;
  parent_task_id?: string;
  parent_task_type?: 'binary' | 'source' | 'binary_module';
  parent_stage_name?: string;
  parent_stage_item_id?: string;
  parent_stage_item_key?: string;
  // 手动任务模型选择（三类角色，从模型配置中心选）
  worker_model?: string;
  reader_model?: string;
  judge_model?: string;
}

export interface AppSaWorkerActiveJob {
  task_id: string;
  task_name: string;
  status: string;
  analysis_mode?: 'binary' | 'source' | null;
  parent_task_id?: string | null;
  parent_task_type?: 'binary' | 'source' | 'binary_module' | null;
  task_origin_type?: 'manual' | 'binary_security' | null;
  input_path: string;
  started_at?: string | null;
  updated_at?: string | null;
  dispatch_started_at?: string | null;
  execution_owner_id?: string | null;
  execution_lease_until?: string | null;
  lease_epoch?: number | null;
  mapped: boolean;
  mapping_reason: string;
}

export interface AppSaWorkerCapacity {
  worker_id: string;
  host_name: string;
  pod_name?: string | null;
  pod_ip?: string | null;
  healthy: boolean;
  max_concurrent_jobs: number;
  running_jobs: number;
  available_slots: number;
  queued_jobs?: number;
  source: string;
  last_heartbeat_at?: string | null;
  pod_created_at?: string | null;
  pod_started_at?: string | null;
  pod_metrics_at?: string | null;
  pod_cpu_usage_millicores?: number | null;
  pod_memory_usage_bytes?: number | null;
  pod_cpu_request_millicores?: number | null;
  pod_memory_request_bytes?: number | null;
  pod_cpu_limit_millicores?: number | null;
  pod_memory_limit_bytes?: number | null;
  agent_process_limit?: number;
  agent_process_in_use?: number;
  agent_process_available?: number;
  agent_waiting_requests?: number;
  agent_rss_total_bytes?: number;
  active_jobs: AppSaWorkerActiveJob[];
  error?: string | null;
}

export interface AppSaClusterCapacity {
  worker_count: number;
  healthy_workers: number;
  stale_workers: number;
  total_capacity: number;
  busy_slots: number;
  available_slots: number;
  queued_jobs: number;
  updated_at?: string | null;
  workers: AppSaWorkerCapacity[];
}

export interface AppSaClusterCapacitySummary {
  worker_count: number;
  healthy_workers: number;
  stale_workers: number;
  total_capacity: number;
  busy_slots: number;
  available_slots: number;
  queued_jobs: number;
  updated_at?: string | null;
}

export interface AppSaTaskListStats {
  total: number;
  pending: number;
  running: number;
  passed: number;
  failed: number;
  error: number;
  cancelled: number;
}


// ─── Entry Analysis Types ─────────────────────────────────────────────────────

export interface AppEaTaskItem {
  task_id: string;
  project_id: string;
  project_name?: string | null;
  task_origin_type?: 'manual' | 'binary_security' | null;
  parent_project_id?: string | null;
  parent_task_id?: string | null;
  parent_task_type?: 'binary' | 'source' | 'binary_module' | null;
  parent_stage_name?: string | null;
  parent_stage_item_id?: string | null;
  parent_stage_item_key?: string | null;
  origin_label?: string | null;
  parent_task_display?: string | null;
  task_name: string;
  task_description?: string | null;
  input_path: string;
  source_path?: string | null;
  module_name?: string | null;
  output_path?: string | null;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'error' | 'cancelled';
  owner_pod?: string | null;
  owner_role_guess?: string | null;
  owner_valid?: boolean;
  owner_live?: boolean;
  lease_expires_at?: string | null;
  lease_state?: 'none' | 'active' | 'expired' | 'awaiting_takeover' | 'reconcile_pending' | 'invalid_owner' | null;
  awaiting_takeover?: boolean;
  reconcile_pending?: boolean;
  reconcile_reason?: string | null;
  cancel_requested?: boolean;
  error?: string | null;
  abnormal_reason_title?: string | null;
  abnormal_reason_code?: string | null;
  abnormal_reason_category?: string | null;
  abnormal_reason?: ExecutionAbnormalReason | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface EntryAnalyseActiveTaskRef {
  task_id: string;
  entry_id?: string | null;
  status: string;
  lease_expires_at?: string | null;
  owner_role_guess?: string | null;
  owner_valid?: boolean;
  owner_live?: boolean;
  reconcile_reason?: string | null;
}

export interface EntryAnalyseWorkerSlot {
  worker_id: string;
  url?: string | null;
  pod_name: string;
  runtime_role?: string;
  pod_ip?: string | null;
  first_seen_at?: string | null;
  healthy: boolean;
  max_concurrent_tasks: number;
  max_concurrent_jobs: number;
  running_tasks: number;
  running_jobs: number;
  queued_jobs: number;
  available_slots: number;
  agent_process_limit: number;
  agent_process_in_use: number;
  agent_process_available: number;
  agent_waiting_requests: number;
  agent_waiting_tasks: number;
  agent_queue_oldest_wait_seconds: number;
  agent_rss_total_bytes: number;
  agent_rss_max_bytes: number;
  agent_snapshot_at?: string | null;
  last_heartbeat_at?: string | null;
  heartbeat_age_seconds?: number | null;
  consecutive_heartbeat_failures?: number;
  last_heartbeat_error?: string | null;
  last_heartbeat_duration_ms?: number | null;
  worker_role_state?: string;
  source: string;
  error?: string | null;
  pod_created_at?: string | null;
  pod_started_at?: string | null;
  pod_metrics_at?: string | null;
  pod_cpu_usage_millicores?: number | null;
  pod_memory_usage_bytes?: number | null;
  pod_cpu_request_millicores?: number | null;
  pod_memory_request_bytes?: number | null;
  pod_cpu_limit_millicores?: number | null;
  pod_memory_limit_bytes?: number | null;
  active_tasks: EntryAnalyseActiveTaskRef[];
  active_jobs?: Array<Record<string, any>>;
}

export interface EntryAnalyseSlotClusterSummary {
  worker_count: number;
  registry_visible_workers?: number;
  live_pod_count?: number;
  registry_missing_live_pods?: number;
  healthy_workers: number;
  stale_workers: number;
  live_stale_workers?: number;
  retired_workers?: number;
  stale_owner_workers?: number;
  total_capacity: number;
  busy_slots: number;
  running_invalid_owner?: number;
  running_invalid_owner_owner_alive?: number;
  running_jobs: number;
  available_slots: number;
  dispatch_limit?: number;
  dispatch_running?: number;
  dispatch_available?: number;
  agent_total_capacity: number;
  agent_in_use: number;
  agent_available: number;
  agent_waiting_requests: number;
  agent_waiting_tasks: number;
  agent_queue_oldest_wait_seconds: number;
  agent_rss_total_bytes: number;
  agent_rss_max_bytes: number;
  queued_tasks: number;
  queued_jobs: number;
  registry_cleanup_at?: string | null;
  registry_cleanup_deleted_rows?: number;
  updated_at?: string | null;
  workers: EntryAnalyseWorkerSlot[];
}

export interface AppEaStageEvent {
  ts: number;
  type: string;
  data: Record<string, any>;
}

/** Full event stream – returned by GET /tasks/{id}/logs. */
export interface AppEaStagesJson {
  events: AppEaStageEvent[];
  final?: boolean;
}

/** Lightweight summary embedded in GET /tasks/{id} (no events array). */
export interface AppEaStagesJsonSummary {
  event_count: number;
  final?: boolean;
}

/** Response shape of GET /tasks/{id}/logs */
export interface AppEaTaskLogsResponse {
  task_id: string;
  status: string;
  total_event_count: number;
  final: boolean;
  events: AppEaStageEvent[];
}

export interface AppEaTaskEvent {
  id: string;
  task_id: string;
  project_id: string;
  source?: string | null;
  level?: string | null;
  event_type: string;
  stage_key?: string | null;
  file_hash?: string | null;
  func_hash?: string | null;
  file_path?: string | null;
  function_name?: string | null;
  attempt?: number | null;
  status?: string | null;
  dispatch_status?: string | null;
  worker_id?: string | null;
  execution_owner_id?: string | null;
  execution_epoch?: number | null;
  message?: string | null;
  payload?: Record<string, any> | null;
  payload_json?: Record<string, any> | null;
  recorder_instance_id?: string | null;
  recorder_hostname?: string | null;
  recorder_pod_name?: string | null;
  recorder_node_name?: string | null;
  recorder_pod_ip?: string | null;
  recorder_role?: string | null;
  origin_instance_id?: string | null;
  origin_hostname?: string | null;
  origin_pod_name?: string | null;
  origin_node_name?: string | null;
  origin_pod_ip?: string | null;
  origin_role?: string | null;
  dedupe_key?: string | null;
  created_at: string;
}

export interface AppEaTaskEventSummary {
  total_events: number;
  latest_event_type?: string | null;
  latest_event_at?: string | null;
  latest_stage_key?: string | null;
  latest_function_name?: string | null;
  latest_attempt?: number | null;
}

export interface AppEaTaskTimelineResponse {
  task_id: string;
  events: AppEaTaskEvent[];
}

export interface AppEaTaskActionResponse {
  status: string;
  task_id?: string;
  message?: string | null;
  deleted_event_count?: number | null;
}

export interface AppEaFunctionCatalogItem {
  func_hash: string;
  file_hash?: string;
  file?: string;
  original_path?: string;
  name: string;
  signature?: string;
  start_line?: number;
  end_line?: number;
  r2j_state?: string;
  r2_source_incomplete?: boolean;
  r3w_state?: string;
  r3j_state?: string;
  r3_state?: string;
  r4_state?: string;
  rep_state?: string;
  has_external_input?: boolean | null;
  entry_role?: string;
  entry_category?: string;
  r4_decision?: string;
  is_entry?: boolean;
}

export interface AppEaFunctionDetail {
  func_hash: string;
  file_hash: string;
  name: string;
  signature: string;
  start_line?: number | null;
  end_line?: number | null;
  file_path: string;
  entry_role: string;
  entry_confidence?: number | null;
  entry_category: string;
  r3_decision: string;
  r4_decision: string;
  has_external_input: boolean;
  function_description: string;
  entry_reason: string;
  taint_details: Array<{
    param?: string;
    source?: string;
    type?: string;
    description?: string;
    [key: string]: unknown;
  }>;
  tag: string;
  callers: Array<{ name: string; func_hash: string }>;
  callees: Array<{ name: string; func_hash: string }>;
}

export interface AppEaResolvedKeyInfo {
  source: 'gateway' | 'config_center' | string;
  model: string;
  dispatched_model?: string | null;
  key_prefix?: string | null;
  key_masked?: string | null;
  key_source?: string | null;
  task_origin_type?: string | null;
  gateway_available_models?: string[] | null;
}

export interface AppEaTaskDetail extends AppEaTaskItem {
  prompt_template_id?: string | null;
  prompt_content: string;
  result_json?: Record<string, any> | null;
  stages_json?: AppEaStagesJsonSummary | null;
  task_config_json?: Record<string, any> | null;
  agent_auth_json?: Record<string, any> | null;
  role_config_snapshot?: Record<string, any> | null;
  provider_runtime_summary?: Record<string, any> | null;
  llm_binding_snapshot?: Record<string, any> | null;
  resolved_key_info?: AppEaResolvedKeyInfo | null;
  function_catalog?: AppEaFunctionCatalogItem[] | null;
  lean_mode?: boolean | null;
  task_root?: string | null;
  run_root?: string | null;
  workspace_root?: string | null;
  input_summary?: {
    files_list_path?: string | null;
  } | null;
  output_summary?: Record<string, any> | null;
  event_summary?: AppEaTaskEventSummary | null;
  abnormal_reason_history?: ExecutionAbnormalReasonEventSummary[] | null;
}

export interface AppEaTaskRuntimeSummary {
  task_id: string;
  project_id?: string | null;
  status: string;
  generated_at?: string | null;
  task_root?: string | null;
  run_root?: string | null;
  sessions_root?: string | null;
  session_index_path?: string | null;
  session_index_generated_at?: string | null;
  cache_hit?: boolean;
  cache_age_seconds?: number | null;
  session_count: number;
  active_session_count: number;
  worker_count: number;
  judge_count: number;
  sub_worker_count: number;
  latest_round?: number | null;
  active_rounds?: number[];
  active_stage_keys?: string[];
  active_roles?: string[];
  latest_active_event_at?: string | null;
  entry_count?: number | null;
  event_summary?: AppEaTaskEventSummary | null;
  warnings?: string[];
}

export interface AppEaEntryDetail {
  tag?: string;
  file?: string;
  line?: number;
  function: string;
  taints?: string[];
  taint_details?: { name: string; description?: string; source_kind?: string }[];
  func_hash?: string;
  signature?: string;
  entry_role?: string;
  entry_category?: string;
  entry_confidence?: number;
  confidence?: number;
  entry_type?: string;
  function_description?: string;
  entry_reason?: string;
}

export interface AppEaResultFunctionListItem {
  tag?: string;
  file?: string;
  line?: number;
  function: string;
  taints?: string[];
  entry_source_lines?: { line?: number; code?: string }[];
  function_description?: string;
  entry_reason?: string;
  taint_details?: { name: string; description?: string; source_kind?: string; description_source?: string }[];
  func_hash?: string;
  signature?: string;
  start_line?: number;
  end_line?: number;
  body_lines?: number;
  entry_category?: string;
  entry_role?: string;
  entry_confidence?: number;
}

export interface AppEaTaskResultSummary {
  module_name?: string | null;
  function_count: number;
  round_count: number;
  passed_round_count: number;
  total_duration_ms?: number | null;
  total_tokens: number;
  total_cost?: number | null;
}

export interface AppEaTaskResult {
  task_id: string;
  available: boolean;
  status: string;
  output_root?: string | null;
  result_file_path?: string | null;
  functions_list_path?: string | null;
  run_report_path?: string | null;
  final_report_path?: string | null;
  run_result_path?: string | null;
  result_markdown?: string | null;
  functions_list_markdown?: string | null;
  functions_list_items?: AppEaResultFunctionListItem[];
  functions: string[];
  entry_details?: AppEaEntryDetail[];
  run_report_markdown?: string | null;
  final_report_markdown?: string | null;
  result_json?: Record<string, any> | null;
  live_stats?: AppEaLiveStats | null;
  summary: AppEaTaskResultSummary;
  warnings: string[];
}

export interface AppEaLiveStats {
  total_functions: number;
  r2_done: number;
  r3_done: number;
  r4_kept: number;
  ext_entries: number;
  hdl_entries: number;
  cc_state: string;
  r6_state: string;
  duration_ms_since_start?: number | null;
}

export interface AppEaTaskEvaluation {
  task_id: string;
  status: string;
  available: boolean;
  source?: 'final_result' | 'runtime_snapshot' | 'none' | string;
  is_realtime?: boolean;
  snapshot_generated_at?: string | null;
  runtime_summary?: Record<string, any> | null;
  summary?: Record<string, any> | null;
  rounds: AppSaEvaluationRound[];
  warnings: string[];
}

export type AppEaSessionMeta = AppSaSessionMeta;
export type AppEaSessionEvent = AppSaSessionEvent;
export type AppEaSessionSnapshot = AppSaSessionSnapshot;
export type AppEaSessionIndexNode = AppSaSessionIndexNode;
export type AppEaSessionIndexEdge = AppSaSessionIndexEdge;
export type AppEaSessionIndexGroup = AppSaSessionIndexGroup;
export type AppEaSessionIndex = AppSaSessionIndex;
export type AppEaEvaluationRound = AppSaEvaluationRound;

export interface AppEaTaskCreateRequest {
  project_id: string;
  task_name: string;
  input_path: string;                // SA输出目录
  module_name: string;               // 具体模块名
  source_path?: string;              // 源码根目录
  input_contract?: Record<string, any>;
  output_path?: string;
  task_description?: string;
  prompt_template_id?: string;
  task_origin_type?: 'manual' | 'binary_security';
  parent_project_id?: string;
  parent_task_id?: string;
  parent_task_type?: 'binary' | 'source' | 'binary_module';
  parent_stage_name?: string;
  parent_stage_item_id?: string;
  parent_stage_item_key?: string;
  model?: string | null;               // 任务级模型（手动任务从模型配置中心选；非手动由编排器下发，缺省 auto）
}

export interface EntryAnalysisPromptTemplate {
  prompt_id: string;
  name: string;
  category: string;
  description?: string | null;
  content: string;
  variables_json?: string[] | null;
  version: number;
  is_default: boolean;
  is_enabled: boolean;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EntryAnalysisAgentInstance {
  model: string;
  tools?: string[] | null;
  system_prompt?: string | null;
  thinking_level?: string | null;
}

export interface EntryAnalysisRoleConfig {
  default_model?: string;
  default_tools?: string[];
  system_prompt_dir?: string;
  default_thinking_level?: string;
  agents?: EntryAnalysisAgentInstance[];
  stage_models?: Record<string, string>;
}

export interface EntryAnalysisServiceConfig {
  project_id?: string;
  max_rounds: number;
  max_rounds_exceeded_action: 'treat_as_passed' | 'treat_as_failed';
  min_rounds: number;
  pass_threshold: number;
  max_concurrent_tasks: number;
  agent_process_limit: number;
  agent_max_retries: number;
  agent_retry_delay: number;
  agent_run_timeout_seconds: number;
  agent_timeout_retry_enabled: boolean;
  agent_timeout_max_retries: number;
  pi_max_retries: number;
  pi_retry_delay: number;
  // 各阶段独立轮次配置（-1=无限，0=跳过，正整数=上限）
  r1a_max_rounds: number;
  r1b_max_rounds: number;
  r2_max_rounds: number;
  r3_max_rounds: number;
  r4_func_max_rounds: number;
  r4_final_max_rounds: number;
  report_func_max_rounds: number;
  report_final_max_rounds: number;
  workers: EntryAnalysisRoleConfig;
  judges: EntryAnalysisRoleConfig;
  output_dir: string;
  archive_dir: string;
  result_dir: string;
  // 快速模式：R2 完成后批量 LLM 预筛入口（不保证全面性）
  fast_mode: boolean;
  fast_mode_batch_size: number;
  // 极速模式：关闭所有 Judge，跳过报告阶段
  super_fast_mode: boolean;
  updated_at?: string | null;
}

export interface EntryAnalysisModelEntry {
  id: string;
  reasoning: boolean;
}

export interface EntryAnalysisProviderConfig {
  baseUrl: string;
  api: string;
  apiKey: string;
  models: EntryAnalysisModelEntry[];
}

export interface EntryAnalysisModelsConfig {
  providers: Record<string, EntryAnalysisProviderConfig>;
  updated_at?: string | null;
}


// ─── Dataflow Analysis Types ──────────────────────────────────────────────────

export interface AppDfaStageEvent {
  ts: number;
  type: string;
  data?: Record<string, any>;
}

export interface AppDfaTaskEvent {
  id: string;
  task_id: string;
  project_id: string;
  source: string;
  level: string;
  event_type: string;
  status?: string | null;
  worker_id?: string | null;
  execution_owner_id?: string | null;
  execution_epoch?: number | null;
  control_version?: number | null;
  dispatch_status?: string | null;
  function_name?: string | null;
  source_file?: string | null;
  line_hint?: string | null;
  parent_task_id?: string | null;
  parent_stage_item_id?: string | null;
  message: string;
  payload?: Record<string, any> | null;
  recorder_instance_id?: string | null;
  recorder_hostname?: string | null;
  recorder_pod_name?: string | null;
  recorder_node_name?: string | null;
  recorder_pod_ip?: string | null;
  recorder_role?: string | null;
  origin_instance_id?: string | null;
  origin_hostname?: string | null;
  origin_pod_name?: string | null;
  origin_node_name?: string | null;
  origin_pod_ip?: string | null;
  origin_role?: string | null;
  created_at?: string | null;
}

export interface AppDfaTaskTimeline {
  task_id: string;
  events: AppDfaTaskEvent[];
}

export interface AppDfaStagesJson {
  events: AppDfaStageEvent[];
  final?: boolean;
}

export interface AppDfaTaskItem {
  task_id: string;
  project_id: string;
  project_name?: string | null;
  task_origin_type?: 'manual' | 'binary_security' | null;
  parent_project_id?: string | null;
  parent_task_id?: string | null;
  parent_task_type?: 'binary' | 'source' | 'binary_module' | null;
  parent_stage_name?: string | null;
  parent_stage_item_id?: string | null;
  parent_stage_item_key?: string | null;
  origin_label?: string | null;
  parent_task_display?: string | null;
  task_name: string;
  task_description?: string | null;
  input_path: string;
  output_path?: string | null;
  prompt_template_id?: string | null;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'error' | 'cancelled';
  error?: string | null;
  abnormal_reason_title?: string | null;
  abnormal_reason_code?: string | null;
  abnormal_reason_category?: string | null;
  abnormal_reason?: ExecutionAbnormalReason | null;
  stages_json?: AppDfaStagesJson | null;
  task_config_json?: Record<string, any> | null;
  agent_auth_json?: Record<string, any> | null;
  role_config_snapshot?: Record<string, any> | null;
  provider_runtime_summary?: Record<string, any> | null;
  llm_binding_snapshot?: Record<string, any> | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  latest_started_at?: string | null;
  execution_duration_ms?: number | null;
  execution_owner_id?: string | null;
  execution_lease_until?: string | null;
  execution_heartbeat_at?: string | null;
  execution_epoch?: number | null;
  control_version?: number | null;
  rerun_count?: number | null;
  lease_lost_count?: number | null;
  dispatch_status?: string | null;
  vuln_total_count?: number | null;
  vuln_reported_count?: number | null;
  vuln_unreported_count?: number | null;
}

export interface AppDfaTaskListStats {
  total: number;
  pending: number;
  running: number;
  passed: number;
  failed: number;
  error: number;
  cancelled: number;
}

export interface AppDfaWorkerActiveJob {
  task_id: string;
  task_name: string;
  status: string;
  parent_task_id?: string | null;
  parent_task_type?: 'binary' | 'source' | 'binary_module' | null;
  task_origin_type?: 'manual' | 'binary_security' | null;
  input_path: string;
  started_at?: string | null;
  updated_at?: string | null;
  dispatch_status?: string | null;
  execution_owner_id?: string | null;
  execution_lease_until?: string | null;
  execution_heartbeat_at?: string | null;
  mapped: boolean;
  mapping_reason: string;
}

export interface AppDfaWorkerCapacity {
  worker_id: string;
  host_name: string;
  pod_name?: string | null;
  pod_ip?: string | null;
  healthy: boolean;
  max_concurrent_jobs: number;
  running_jobs: number;
  available_slots: number;
  source: string;
  last_heartbeat_at?: string | null;
  pod_created_at?: string | null;
  pod_started_at?: string | null;
  pod_metrics_at?: string | null;
  pod_cpu_usage_millicores?: number | null;
  pod_memory_usage_bytes?: number | null;
  pod_cpu_request_millicores?: number | null;
  pod_memory_request_bytes?: number | null;
  pod_cpu_limit_millicores?: number | null;
  pod_memory_limit_bytes?: number | null;
  active_jobs: AppDfaWorkerActiveJob[];
  error?: string | null;
}

export interface AppDfaClusterCapacity {
  worker_count: number;
  healthy_workers?: number;
  stale_workers?: number;
  total_capacity: number;
  running_jobs: number;
  queued_jobs: number;
  available_slots: number;
  updated_at?: string | null;
  workers: AppDfaWorkerCapacity[];
}

export interface AppDfaTaskDetail extends AppDfaTaskItem {
  prompt_content: string;
  result_json?: Record<string, any> | null;
  task_root?: string | null;
  run_root?: string | null;
  workspace_root?: string | null;
  input_summary?: {
    module_input_path?: string | null;
    source_root_path?: string | null;
  } | null;
  output_summary?: Record<string, any> | null;
  abnormal_reason_history?: ExecutionAbnormalReasonEventSummary[] | null;
}

export interface AppDfaTaskCreateRequest {
  project_id: string;
  task_name: string;
  input_path: string;
  module_input_path?: string;
  source_root_path?: string;
  output_path?: string;
  task_description?: string;
  prompt_template_id?: string;
  prompt_content?: string;
  source_file?: string;
  function_name?: string;
  line_hint?: string;
  definition_kind?: 'definition' | 'declaration' | 'unknown';
  taint_params?: string[];
  function_description?: string;
  function_description_source?: string;
  entry_reason?: string;
  entry_reason_source?: string;
  taint_details?: { name: string; description?: string; source_kind?: string }[];
  funcdb_path?: string;
  func_hash?: string;
  task_origin_type?: 'manual' | 'binary_security';
  parent_project_id?: string;
  parent_task_id?: string;
  parent_task_type?: 'binary' | 'source' | 'binary_module';
  parent_stage_name?: string;
  parent_stage_item_id?: string;
  parent_stage_item_key?: string;
  model?: string;
}

export interface AppDfaSessionMeta {
  session_id: string;
  session_name: string;
  relative_path: string;
  stage_group: string;
  role_name: string;
  size: number;
  mtime: number;
  event_count: number;
  message_count?: number;
  is_active: boolean;
  display_name: string;
  agent_session?: Record<string, any>;
}

export type AppDfaSessionIndexNode = AppSaSessionIndexNode;
export type AppDfaSessionIndexEdge = AppSaSessionIndexEdge;
export type AppDfaSessionIndexGroup = AppSaSessionIndexGroup;

export interface AppDfaSessionIndex {
  task_id: string;
  status: string;
  sessions_root?: string | null;
  index_path?: string | null;
  generated_at?: string | null;
  current_epoch?: string | null;
  summary?: Record<string, any> | null;
  nodes: AppDfaSessionIndexNode[];
  edges: AppDfaSessionIndexEdge[];
  groups: AppDfaSessionIndexGroup[];
  warnings: string[];
}

export interface AppDfaSessionEvent {
  type: string;
  event_index?: number;
  line?: number;
  timestamp?: string;
  display_timestamp?: string;
  role?: string;
  render_role?: string;
  parts?: Array<Record<string, any>>;
  message?: Record<string, any>;
  provider?: string;
  model?: string;
  modelId?: string;
  thinkingLevel?: string;
  raw_line?: string;
  summary?: string;
  [key: string]: any;
}

export interface AppDfaSessionSnapshot {
  task_id: string;
  path: string;
  line_count: number;
  events: AppDfaSessionEvent[];
  warnings: string[];
  session_meta?: Record<string, any> | null;
  meta?: AppDfaSessionMeta;
}

export interface AppDfaResultFile {
  name: string;
  relative_path: string;
  markdown?: string;
  size: number;
  mtime: number;
}

export interface AppDfaSourceSnippetLine {
  n: number;
  text: string;
}

export interface AppDfaSourceSnippet {
  file?: string;
  abs_path?: string;
  start_line: number;
  end_line: number;
  focus_line?: number | null;
  lines: AppDfaSourceSnippetLine[];
}

export interface AppDfaVulnFinding {
  id: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' | string;
  title: string;
  count?: number;
  location?: string;
  root_cause?: string;
  proposed_fix?: string;
  detail?: string;
  function?: string;
  vulnerability?: string;
  confidence?: number | string;
  flow?: string;
  alarm?: string;
  code?: string;
  entry_point?: string[];
  file?: string;
  line?: number;
  source?: Record<string, any>;
  sink?: Record<string, any>;
  dataflow_trace?: Array<Record<string, any>>;
  source_snippet?: AppDfaSourceSnippet;
}

export interface AppDfaTaskResult {
  task_id: string;
  available: boolean;
  status: AppDfaTaskItem['status'];
  output_root: string;
  warnings: string[];
  result_markdown: string;
  run_report_markdown: string;
  result_json?: Record<string, any> | null;
  output_files: AppDfaResultFile[];
  dataflow_files: AppDfaResultFile[];
  findings?: AppDfaVulnFinding[];
  summary: {
    function_count: number;
    round_count: number;
    passed_round_count: number;
    total_tokens: number;
    total_cost: number;
    effectiveness?: Record<string, any>;
    total_findings?: number;
    findings_by_severity?: Record<string, number>;
  };
}

export interface AppDfaEvaluationRound {
  round?: number;
  status?: string;
  passed?: boolean;
  function?: string;
  func?: string;
  entry?: string;
  metrics?: Record<string, any>;
  token_usage?: Record<string, any>;
  [key: string]: any;
}

export interface AppDfaTaskEvaluation {
  task_id: string;
  available: boolean;
  status: AppDfaTaskItem['status'];
  summary: AppDfaTaskResult['summary'];
  rounds: AppDfaEvaluationRound[];
  warnings: string[];
}


// ─── Vuln Graph Types ────────────────────────────────────────────────────────

export interface DataflowVulnTraceTreeNode {
  run_id: string;
  function_name: string;
  source_file: string;
  line_hint: string;
  depth: number;
  status: string;
  taint_inputs: Array<{
    symbol: string;
    kind: string;
    line?: string;
    description?: string;
  }>;
  taint_summary: Array<{
    from_symbol: string;
    to_symbol: string;
    line: string;
    operation: string;
    evidence: string;
    termination_reason?: string;
  }>;
  child_count: number;
  followup_status: string;
  followup_reason?: string;
  findings_count: number;
  termination_reasons: string[];
  children: DataflowVulnTraceTreeNode[];
  pruned?: boolean;
  prune_reason?: string;
  taint_constraints?: Array<{
    kind: string;
    target_symbol: string;
    target_arg_index: number;
    evidence: string;
    confidence: string;
  }>;
}

export interface DataflowVulnGraphResponse {
  task_id: string;
  available: boolean;
  run_root: string;
  summary: Record<string, number>;
  trace_tree?: DataflowVulnTraceTreeNode | null;
  graph: Record<string, any>;
}


// ─── Dataflow Analysis Config/Models Types ────────────────────────────────────

export interface AppDfaAgentInstance {
  model: string;
  tools?: string[] | null;
  thinking_level?: string | null;
}

export interface AppDfaRoleConfig {
  default_tools?: string[];
  system_prompt_dir?: string;
  default_thinking_level?: string;
  agents?: AppDfaAgentInstance[];
  stage_models?: Record<string, string>;
}

export interface AppDfaServiceConfig {
  project_id?: string;
  max_rounds: number;
  max_rounds_exceeded_review_strategy: 'treat_as_passed' | 'treat_as_failed';
  min_rounds: number;
  pass_threshold: number;
  agent_max_retries: number;
  agent_retry_delay: number;
  agent_run_timeout_seconds: number;
  agent_timeout_retry_enabled: boolean;
  agent_timeout_max_retries: number;
  pi_max_retries: number;
  pi_retry_delay: number;
  max_trace_depth: number;
  deep_trace_enabled: boolean;
  callee_concurrency: number;
  entry_screen_enabled?: boolean;
  entry_screen_whitelist?: string[];
  entry_screen_thinking_level?: string;
  branch_pruning_enabled?: boolean;
  workers: AppDfaRoleConfig;
  judges: AppDfaRoleConfig;
  output_dir: string;
  archive_dir: string;
  result_dir: string;
  updated_at?: string | null;
}

// ── 系统分析失败调试报告 ───────────────────────────────────────────────
export interface SaFailureDebugReportListItem {
  id: number;
  task_id: string;
  project_id: string;
  task_name: string;
  status: string; // pending | running | done | error
  error_kind?: string | null;
  failing_stage?: string | null;
  summary?: string | null;
  report_path?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface SaFailureDebugReportDetail extends SaFailureDebugReportListItem {
  report_json?: {
    phenomenon?: string;
    root_cause?: string;
    solution?: string;
    code_scene?: string;
    patch_code?: string;
    _model?: string;
  } | null;
  debug_error?: string | null;
}

// ── 失败诊断报告（debugger 角色 LLM 分析失败任务产出）──
export interface AppEaDebugReport {
  report_id: string;
  task_id: string;
  project_id: string;
  task_name: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'error';
  model?: string | null;
  task_status?: string | null;
  phenomenon?: string | null;
  root_cause?: string | null;
  solution?: string | null;
  code_scene?: string | null;
  patch_code?: string | null;
  report_path?: string | null;
  error?: string | null;
  owner_pod?: string | null;
  created_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface AppEaDebugReportListResponse {
  total: number;
  page: number;
  page_size: number;
  items: AppEaDebugReport[];
}
