import React from 'react';
import type {
  ProjectStatus,
  ExecuteStatus,
  ExecuteResult,
  Confidence,
  SyncStatus,
  WorkerStatus,
  AgentEngineType,
  TimeoutUnit,
  NodeType,
  BaselineNodeOut,
  BaselineNodeItem,
} from './types';

// 项目状态映射(8 态)
export const PROJECT_STATUS_MAP: Record<ProjectStatus, { label: string; dot: string; badge: string }> = {
  planning: { label: '规划中', dot: 'bg-theme-text-faint', badge: 'bg-theme-elevated text-theme-text-muted border-theme-border' },
  queued: { label: '排队中', dot: 'bg-sky-400', badge: 'bg-sky-500/15 text-sky-400 border-sky-500/20' },
  executing: { label: '执行中', dot: 'bg-indigo-400', badge: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20' },
  paused: { label: '已暂停', dot: 'bg-amber-400', badge: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  cancelled: { label: '已取消', dot: 'bg-zinc-400', badge: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20' },
  completed: { label: '已完成', dot: 'bg-emerald-400', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
  failed: { label: '失败', dot: 'bg-rose-400', badge: 'bg-rose-500/15 text-rose-400 border-rose-500/20' },
  deleted: { label: '已删除', dot: 'bg-zinc-500', badge: 'bg-zinc-600/15 text-zinc-500 border-zinc-600/20' },
};

// 评估结果结论映射
export const EXEC_RESULT_MAP: Record<ExecuteResult, { label: string; badge: string }> = {
  PASS: { label: '通过', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
  PARTIAL: { label: '部分通过', badge: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  FAIL: { label: '不通过', badge: 'bg-rose-500/15 text-rose-400 border-rose-500/20' },
  N_A: { label: '不适用', badge: 'bg-sky-500/15 text-sky-400 border-sky-500/20' },
  MANUAL_REVIEW: { label: '人工复核', badge: 'bg-violet-500/15 text-violet-400 border-violet-500/20' },
};

// 评估执行状态映射
export const EXEC_STATUS_MAP: Record<ExecuteStatus, { label: string; badge: string }> = {
  un_start: { label: '未开始', badge: 'bg-theme-elevated text-theme-text-muted border-theme-border' },
  pending: { label: '待评估', badge: 'bg-sky-500/15 text-sky-400 border-sky-500/20' },
  executing: { label: '评估中', badge: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20' },
  finish: { label: '已完成', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
};

// 同步状态映射
export const SYNC_MAP: Record<SyncStatus, { label: string; dot: string; badge: string }> = {
  unsync: { label: '未同步', dot: 'bg-theme-text-faint', badge: 'bg-theme-elevated text-theme-text-muted border-theme-border' },
  syncing: { label: '同步中', dot: 'bg-amber-400', badge: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  synced: { label: '已同步', dot: 'bg-emerald-400', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
  sync_failed: { label: '同步失败', dot: 'bg-rose-400', badge: 'bg-rose-500/15 text-rose-400 border-rose-500/20' },
};

// Worker 状态映射
export const WORKER_STATUS_MAP: Record<WorkerStatus, { label: string; dot: string; badge: string }> = {
  online: { label: '在线', dot: 'bg-emerald-400', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
  draining: { label: '下线中', dot: 'bg-amber-400', badge: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  offline: { label: '离线', dot: 'bg-zinc-400', badge: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20' },
};

// 置信等级映射
export const CONFIDENCE_MAP: Record<Confidence, { label: string; badge: string }> = {
  high: { label: '高', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
  medium: { label: '中', badge: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  low: { label: '低', badge: 'bg-rose-500/15 text-rose-400 border-rose-500/20' },
};

// 优先级映射(基线节点 priority 字段,L1 最高 ~ L5 最低)
export const PRIORITY_MAP: Record<string, { label: string; badge: string }> = {
  L1: { label: 'L1', badge: 'bg-rose-500/15 text-rose-400 border-rose-500/20' },
  L2: { label: 'L2', badge: 'bg-orange-500/15 text-orange-400 border-orange-500/20' },
  L3: { label: 'L3', badge: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  L4: { label: 'L4', badge: 'bg-sky-500/15 text-sky-400 border-sky-500/20' },
  L5: { label: 'L5', badge: 'bg-slate-500/15 text-slate-400 border-slate-500/20' },
};

// 引擎类型映射
export const ENGINE_MAP: Record<AgentEngineType, { label: string; desc: string }> = {
  opencode: { label: 'opencode', desc: '本地 opencode 引擎,直接调用 LLM 网关' },
  'opencode-serve': { label: 'opencode-serve', desc: 'opencode 服务模式,经 opencode-serve 中转' },
  ClaudeCode: { label: 'ClaudeCode', desc: 'Claude Code 引擎,Anthropic 原生工具链' },
};

// 超时单位映射
export const TIMEOUT_UNIT_MAP: Record<TimeoutUnit, string> = {
  second: '秒',
  minute: '分钟',
  hour: '小时',
  day: '天',
};

// 操作日志/事件 action 徽章
export const ACTION_BADGE: Record<string, string> = {
  create: 'bg-brand-soft text-brand-primary border-brand-border',
  dispatch: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20',
  pause: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  resume: 'bg-sky-500/15 text-sky-400 border-sky-500/20',
  cancel: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20',
  re_execute: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
  delete: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
  sync_started: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  sync_success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  sync_failed: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
  config_update: 'bg-sky-500/15 text-sky-400 border-sky-500/20',
  status_change: 'bg-theme-elevated text-theme-text-muted border-theme-border',
  execution_result_changed: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
};

export const NODE_TYPE_LABEL: Record<NodeType, string> = {
  level1: '一级维度',
  level2: '二级维度',
  item: '检查项',
};

// 终态集合(不可变更操作,仅可删除/重新执行)
export const TERMINAL_STATES: ProjectStatus[] = ['cancelled', 'completed', 'failed'];

// 统一 Badge
export const Badge: React.FC<{
  className?: string;
  dot?: string;
  children: React.ReactNode;
}> = ({ className, dot, children }) => (
  <span className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider shrink-0 ${className || ''}`}>
    {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
    {children}
  </span>
);

export const ProjectStatusBadge: React.FC<{ status: ProjectStatus }> = ({ status }) => {
  const m = PROJECT_STATUS_MAP[status] || PROJECT_STATUS_MAP.planning;
  return <Badge className={m.badge} dot={m.dot}>{m.label}</Badge>;
};

export const SyncBadge: React.FC<{ status: SyncStatus }> = ({ status }) => {
  const m = SYNC_MAP[status] || SYNC_MAP.unsync;
  return <Badge className={m.badge} dot={m.dot}>{m.label}</Badge>;
};

export const WorkerStatusBadge: React.FC<{ status: WorkerStatus }> = ({ status }) => {
  const m = WORKER_STATUS_MAP[status] || WORKER_STATUS_MAP.offline;
  return <Badge className={m.badge} dot={m.dot}>{m.label}</Badge>;
};

export const ExecResultBadge: React.FC<{ result?: ExecuteResult | null }> = ({ result }) => {
  if (!result) return <span className="text-xs text-theme-text-faint">—</span>;
  const m = EXEC_RESULT_MAP[result];
  return <Badge className={m.badge}>{m.label}</Badge>;
};

export const ActionBadge: React.FC<{ action: string }> = ({ action }) => {
  const cls = ACTION_BADGE[action] || 'bg-theme-elevated text-theme-text-muted border-theme-border';
  return <Badge className={cls}>{action}</Badge>;
};

// helpers
export function fmtTime(s?: string | null): string {
  if (!s) return '—';
  return s.replace('T', ' ').slice(0, 19);
}

export function fmtPercent(v?: number | null): string {
  if (v == null) return '—';
  return `${Number(v).toFixed(2)}%`;
}

export function heartbeartStale(time?: string | null, thresholdMin = 10): boolean {
  if (!time) return true;
  const ts = new Date(time).getTime();
  if (isNaN(ts)) return true;
  return Date.now() - ts > thresholdMin * 60 * 1000;
}

// 基线节点建树
export interface BaselineTreeNode extends BaselineNodeOut {
  children: BaselineTreeNode[];
}

export function buildBaselineTree(nodes: BaselineNodeOut[]): BaselineTreeNode[] {
  const map = new Map<number, BaselineTreeNode>();
  const roots: BaselineTreeNode[] = [];
  nodes.forEach((n) => map.set(n.id, { ...n, children: [] }));
  nodes.forEach((n) => {
    const node = map.get(n.id)!;
    if (n.parent_id && map.has(n.parent_id)) {
      map.get(n.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  roots.forEach((r) => sortTree(r));
  return roots;
}

function sortTree(node: BaselineTreeNode) {
  node.children.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);
  node.children.forEach(sortTree);
}

export function collectLeaves(node: BaselineTreeNode, acc: BaselineTreeNode[] = []): BaselineTreeNode[] {
  if (node.node_type === 'item') acc.push(node);
  node.children.forEach((c) => collectLeaves(c, acc));
  return acc;
}

export function findNode(tree: BaselineTreeNode[], id: number): BaselineTreeNode | null {
  for (const n of tree) {
    if (n.id === id) return n;
    const c = findNode(n.children, id);
    if (c) return c;
  }
  return null;
}

// execute_result 色标(用于树 item 节点前缀圆点)
export function resultDotColor(result?: string | null): string {
  switch (result) {
    case 'PASS': return 'bg-emerald-400';
    case 'PARTIAL': return 'bg-amber-400';
    case 'FAIL': return 'bg-rose-400';
    case 'N_A': return 'bg-sky-400';
    case 'MANUAL_REVIEW': return 'bg-violet-400';
    default: return 'bg-theme-text-faint';
  }
}

// ===== BaselineNodeItem 树(来自项目服务 baseline-tree) =====
export interface ItemTreeNode extends BaselineNodeItem {
  children: ItemTreeNode[];
}

export function buildItemTree(nodes: BaselineNodeItem[]): ItemTreeNode[] {
  const map = new Map<number, ItemTreeNode>();
  const roots: ItemTreeNode[] = [];
  nodes.forEach((n) => map.set(n.id, { ...n, children: [] }));
  nodes.forEach((n) => {
    const node = map.get(n.id)!;
    if (n.parent_id && map.has(n.parent_id)) {
      map.get(n.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  roots.forEach(sortItemTree);
  return roots;
}

function sortItemTree(node: ItemTreeNode) {
  node.children.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);
  node.children.forEach(sortItemTree);
}

export function collectItemLeaves(node: ItemTreeNode, acc: ItemTreeNode[] = []): ItemTreeNode[] {
  if (node.node_type === 'item') acc.push(node);
  node.children.forEach((c) => collectItemLeaves(c, acc));
  return acc;
}

export function findItemNode(tree: ItemTreeNode[], id: number): ItemTreeNode | null {
  for (const n of tree) {
    if (n.id === id) return n;
    const c = findItemNode(n.children, id);
    if (c) return c;
  }
  return null;
}

// 统计 execution 分项计数
export function countByResult(executions: { execute_result?: string | null }[]): Record<string, number> {
  const c: Record<string, number> = { PASS: 0, PARTIAL: 0, FAIL: 0, N_A: 0, MANUAL_REVIEW: 0, NONE: 0 };
  executions.forEach((e) => {
    const r = e.execute_result || 'NONE';
    c[r] = (c[r] || 0) + 1;
  });
  return c;
}
