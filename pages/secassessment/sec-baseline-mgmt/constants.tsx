import React from 'react';
import type { SyncStatus, Priority, NodeType, OrgNodeType, NodeSources } from './types';

// 同步状态映射
export const SYNC_MAP: Record<SyncStatus, { label: string; dot: string; badge: string }> = {
  unsync: { label: '未同步', dot: 'bg-theme-text-faint', badge: 'bg-theme-elevated text-theme-text-muted border-theme-border' },
  syncing: { label: '同步中', dot: 'bg-amber-400', badge: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  synced: { label: '已同步', dot: 'bg-emerald-400', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
  sync_failed: { label: '同步失败', dot: 'bg-rose-400', badge: 'bg-rose-500/15 text-rose-400 border-rose-500/20' },
};

// 优先级映射
export const PRIORITY_MAP: Record<Priority, { label: string; badge: string }> = {
  high: { label: 'HIGH', badge: 'bg-rose-500/15 text-rose-400 border-rose-500/20' },
  medium: { label: 'MEDIUM', badge: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  low: { label: 'LOW', badge: 'bg-sky-500/15 text-sky-400 border-sky-500/20' },
};

// 操作日志 action 映射
export const ACTION_BADGE: Record<string, string> = {
  create: 'bg-brand-soft text-brand-primary border-brand-border',
  update: 'bg-sky-500/15 text-sky-400 border-sky-500/20',
  delete: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
  sync_started: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  sync_success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  sync_failed: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
};

export const NODE_TYPE_LABEL: Record<NodeType, string> = {
  level1: '一级维度',
  level2: '二级维度',
  item: '检查项',
};

export const ORG_TYPE_LABEL: Record<OrgNodeType, string> = {
  bg: 'BG',
  bu: 'BU',
  product: '产品',
};

export const ORG_TYPE_ICON: Record<OrgNodeType, string> = {
  bg: 'building-2',
  bu: 'git-branch',
  product: 'box',
};

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

export const SyncBadge: React.FC<{ status: SyncStatus }> = ({ status }) => {
  const m = SYNC_MAP[status] || SYNC_MAP.unsync;
  return <Badge className={m.badge} dot={m.dot}>{m.label}</Badge>;
};

export const PriorityBadge: React.FC<{ priority?: Priority | null }> = ({ priority }) => {
  if (!priority) return <span className="text-xs text-theme-text-faint">—</span>;
  const m = PRIORITY_MAP[priority];
  return <Badge className={m.badge}>{m.label}</Badge>;
};

// sources 归一化为 {document, section}[]
export function normalizeSources(sources: NodeSources): { document: string; section?: string }[] {
  if (!sources || !Array.isArray(sources) || sources.length === 0) return [];
  if (typeof sources[0] === 'string') {
    return (sources as string[]).map((s) => ({ document: s, section: '' }));
  }
  return sources as { document: string; section?: string }[];
}

// sources 序列化为多行文本(level2: 每行一条;item: 每行 "文档 | 章节")
export function sourcesToText(sources: NodeSources, itemType: 'level2' | 'item'): string {
  const list = normalizeSources(sources);
  if (itemType === 'level2') {
    return list.map((s) => s.document).join('\n');
  }
  return list.map((s) => `${s.document}${s.section ? ` | ${s.section}` : ''}`).join('\n');
}

// 多行文本解析为 sources
export function textToSources(text: string, itemType: 'level2' | 'item'): NodeSources {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  if (itemType === 'level2') return lines;
  return lines.map((l) => {
    const [document, section] = l.split('|').map((x) => x?.trim() || '');
    return { document, section: section || '' };
  });
}

// 覆盖率安全取数
export function coveragePercent(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return isNaN(n) ? 0 : n;
}
