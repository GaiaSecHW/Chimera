// 安全功能基线管理 — 后端 schema 镜像(见后端 app/schemas/)

export type SyncStatus = 'unsync' | 'syncing' | 'synced' | 'sync_failed';
export type NodeType = 'level1' | 'level2' | 'item';
export type Priority = 'L1' | 'L2' | 'L3' | 'L4' | 'L5';
export type OrgNodeType = 'bg' | 'bu' | 'product';

export interface BaselineStats {
  total_items?: number | null;
  mapped_items?: number | null;
  unmapped_items?: number | null;
  total_level1_dimensions?: number | null;
  total_level2_dimensions?: number | null;
  level2_dimensions_with_items?: number | null;
  level2_dimensions_empty?: number | null;
  mapping_coverage_percent?: number | string | null;
}

export interface BaselineListItem {
  id: number;
  uuid: string;
  baseline_name: string;
  baseline_name_en?: string | null;
  baseline_code?: string | null;
  category?: string | null;
  version?: string | null;
  product_org_id: number;
  product_org_name?: string | null;
  total_items?: number | null;
  mapped_items?: number | null;
  unmapped_items?: number | null;
  mapping_coverage_percent?: number | string | null;
  sync_status: SyncStatus;
  sync_count: number;
  last_sync_time?: string | null;
  last_updated?: string | null;
  person_id?: string | null;
  person_name?: string | null;
  create_time: string;
}

export interface BaselineWithProduct extends BaselineListItem {
  bg_name?: string | null;
  bu_name?: string | null;
}

export interface BaselineDetail {
  id: number;
  uuid: string;
  baseline_name: string;
  baseline_name_en?: string | null;
  baseline_code?: string | null;
  category?: string | null;
  version?: string | null;
  product_org_id: number;
  product_org_uuid: string;
  product_org_name?: string | null;
  last_updated?: string | null;
  sync_status: SyncStatus;
  sync_count: number;
  last_sync_time?: string | null;
  person_id?: string | null;
  person_name?: string | null;
  create_time: string;
  stats?: BaselineStats | null;
}

export interface BaselineUpdate {
  baseline_name?: string;
  baseline_name_en?: string;
  baseline_code?: string;
  category?: string;
  version?: string;
}

export interface BaselinePreview {
  baseline_name?: string | null;
  baseline_name_en?: string | null;
  baseline_code?: string | null;
  category?: string | null;
  version?: string | null;
  stats: BaselineStats;
  nodes: NodePreviewItem[];
}

// sources: 后端存储为多行文本字符串(level2=纯文档名/item="文档|章节",\n 分隔)
export type NodeSources = string | null;

export interface NodeOut {
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
  priority?: Priority | null;
  is_key_ability?: boolean | null;
  sources?: NodeSources;
  sort_order?: number | null;
  person_id?: string | null;
  person_name?: string | null;
  create_time: string;
}

export interface NodeCreate {
  node_type: NodeType;
  parent_id?: number | null;
  code?: string;
  name: string;
  name_en?: string;
  sort_order?: number;
  objective?: string;
  sources?: NodeSources;
  description?: string;
  verification?: string;
  priority?: Priority;
  is_key_ability?: boolean;
}

export interface NodeUpdate {
  code?: string;
  name?: string;
  name_en?: string;
  sort_order?: number;
  objective?: string;
  sources?: NodeSources;
  description?: string;
  verification?: string;
  priority?: Priority;
  is_key_ability?: boolean;
}

export interface NodePreviewItem {
  node_type: NodeType;
  code?: string | null;
  name: string;
  name_en?: string | null;
  parent_code?: string | null;
  objective?: string | null;
  description?: string | null;
  verification?: string | null;
  priority?: Priority | null;
  is_key_ability?: boolean | null;
  sources?: NodeSources;
  sort_order?: number | null;
  person_id?: string | null;
  person_name?: string | null;
}

export interface OrgNode {
  id: number;
  uuid: string;
  parent_id?: number | null;
  parent_uuid?: string | null;
  node_type: OrgNodeType;
  name: string;
  sort_order?: number | null;
  person_id?: string | null;
  person_name?: string | null;
  create_time: string;
}

export interface OrgTreeNode extends OrgNode {
  children: OrgTreeNode[];
}

export interface OrgNodeCreate {
  name: string;
  sort_order?: number;
  parent_id?: number | null;
  node_type: OrgNodeType;
}

export interface OrgNodeUpdate {
  name?: string;
  sort_order?: number;
}

export interface SyncResult {
  success: boolean;
  message: string;
  sync_status: SyncStatus;
  sync_count: number;
  last_sync_time?: string | null;
}

export interface LogOut {
  id: number;
  uuid: string;
  target_table: string;
  target_id: number;
  target_uuid?: string | null;
  action: string;
  action_detail: string;
  person_id?: string | null;
  person_name?: string | null;
  create_time: string;
}

export interface EventOut {
  id: number;
  uuid: string;
  baseline_id: number;
  baseline_uuid?: string | null;
  target_table: string;
  target_id: number;
  target_uuid?: string | null;
  event_type: string;
  from_status?: string | null;
  to_status?: string | null;
  event_detail: string;
  person_id?: string | null;
  person_name?: string | null;
  create_time: string;
}
