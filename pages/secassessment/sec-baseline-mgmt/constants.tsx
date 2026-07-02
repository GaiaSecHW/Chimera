import React from 'react';
import type { SyncStatus, Priority, NodeType, OrgNodeType, NodeSources } from './types';

// 同步状态映射
export const SYNC_MAP: Record<SyncStatus, { label: string; dot: string; badge: string }> = {
  unsync: { label: '未同步', dot: 'bg-theme-text-faint', badge: 'bg-theme-elevated text-theme-text-muted border-theme-border' },
  syncing: { label: '同步中', dot: 'bg-amber-400', badge: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  synced: { label: '已同步', dot: 'bg-emerald-400', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
  sync_failed: { label: '同步失败', dot: 'bg-rose-400', badge: 'bg-rose-500/15 text-rose-400 border-rose-500/20' },
};

// 优先级映射(L1 最高 ~ L5 最低,五级)
export const PRIORITY_MAP: Record<Priority, { label: string; badge: string }> = {
  L1: { label: 'L1', badge: 'bg-rose-500/15 text-rose-400 border-rose-500/20' },
  L2: { label: 'L2', badge: 'bg-orange-500/15 text-orange-400 border-orange-500/20' },
  L3: { label: 'L3', badge: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  L4: { label: 'L4', badge: 'bg-sky-500/15 text-sky-400 border-sky-500/20' },
  L5: { label: 'L5', badge: 'bg-slate-500/15 text-slate-400 border-slate-500/20' },
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
  const m = PRIORITY_MAP[priority as Priority];
  if (!m) return <Badge className="bg-theme-elevated text-theme-text-muted border-theme-border">{priority}</Badge>;
  return <Badge className={m.badge}>{m.label}</Badge>;
};

// sources 归一化为 {document, section}[](按 \n 分行,首个 | 拆文档/章节)
export function normalizeSources(sources: NodeSources): { document: string; section?: string }[] {
  if (typeof sources !== 'string' || !sources.trim()) return [];
  return sources.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const idx = l.indexOf('|');
    if (idx < 0) return { document: l, section: '' };
    return { document: l.slice(0, idx).trim(), section: l.slice(idx + 1).trim() };
  });
}

// sources 序列化为多行文本(后端本就是文本字符串,直接返回)
export function sourcesToText(sources: NodeSources, _itemType: 'level2' | 'item'): string {
  return typeof sources === 'string' ? sources : '';
}

// 多行文本解析为 sources(后端存储为文本字符串)
export function textToSources(text: string, _itemType: 'level2' | 'item'): NodeSources {
  const trimmed = text.trim();
  return trimmed || null;
}

// 覆盖率安全取数
export function coveragePercent(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return isNaN(n) ? 0 : n;
}
