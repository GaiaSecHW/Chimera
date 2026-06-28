import React, { useMemo, useState } from 'react';
import { Box, Building2, ChevronDown, ChevronRight, GitBranch, Landmark, Search, Settings2 } from 'lucide-react';
import type { OrgTreeNode } from '../types';

interface OrgTreePanelProps {
  tree: OrgTreeNode[];
  selectedId: number | null; // null = 全部(虚拟根)
  onSelect: (id: number | null) => void;
  onManage?: () => void;
  className?: string;
}

const ROOT_ID = -1; // 虚拟根"全部"用 -1 表示

export const OrgTreePanel: React.FC<OrgTreePanelProps> = ({ tree, selectedId, onSelect, onManage, className }) => {
  const [kw, setKw] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(() => {
    // 默认展开第一层 BG
    const s = new Set<number>();
    tree.forEach((n) => s.add(n.id));
    return s;
  });

  const toggle = (id: number) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const keyword = kw.trim().toLowerCase();

  // 节点或其子树是否命中关键字
  const nodeMatches = (n: OrgTreeNode): boolean => {
    if (!keyword) return true;
    if (n.name.toLowerCase().includes(keyword)) return true;
    return (n.children || []).some(nodeMatches);
  };

  const TypeIcon: React.FC<{ type: string; className?: string }> = ({ type, className }) => {
    const cls = className || '';
    switch (type) {
      case 'bg': return <Building2 size={13} className={`text-violet-400 ${cls}`} />;
      case 'bu': return <GitBranch size={13} className={`text-sky-400 ${cls}`} />;
      case 'product': return <Box size={13} className={`text-emerald-400 ${cls}`} />;
      default: return <Building2 size={13} className={cls} />;
    }
  };

  const renderNode = (n: OrgTreeNode, depth: number): React.ReactNode => {
    if (!nodeMatches(n)) return null;
    const children = n.children || [];
    const hasKids = children.length > 0;
    const isExpanded = expanded.has(n.id) || !!keyword;
    const selected = selectedId === n.id;
    return (
      <div key={n.id}>
        <button
          type="button"
          onClick={() => onSelect(n.id)}
          className={`w-full flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors ${
            selected ? 'bg-brand-soft text-brand-primary' : 'text-theme-text-secondary hover:bg-theme-sidebar-muted'
          }`}
          style={{ paddingLeft: 8 + depth * 14 }}
        >
          {hasKids ? (
            <span onClick={(e) => { e.stopPropagation(); toggle(n.id); }} className="shrink-0 text-theme-text-faint hover:text-theme-text-primary">
              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
          ) : <span className="w-3 shrink-0" />}
          <TypeIcon type={n.node_type} />
          <span className={`text-xs truncate flex-1 ${n.node_type === 'product' ? 'font-semibold' : ''}`}>{n.name}</span>
          {selected && <span className="text-brand-primary shrink-0">✓</span>}
        </button>
        {hasKids && isExpanded && (
          <div className="ml-1 border-l border-theme-border-subtle pl-1">
            {children.map((c) => renderNode(c, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const rootSelected = selectedId === null || selectedId === ROOT_ID;

  return (
    <aside className={`w-60 shrink-0 border-r border-theme-border-subtle bg-theme-sidebar flex flex-col ${className || ''}`}>
      <div className="px-4 py-3 border-b border-theme-border-subtle flex items-center justify-between">
        <div className="flex items-center gap-2 text-theme-text-secondary">
          <Landmark size={14} />
          <span className="text-xs font-semibold uppercase tracking-wider">组织树</span>
        </div>
        {onManage && (
          <button type="button" onClick={onManage} className="text-theme-text-faint hover:text-brand-primary" title="管理组织树">
            <Settings2 size={14} />
          </button>
        )}
      </div>
      <div className="p-3 border-b border-theme-border-subtle">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-theme-text-faint" size={13} />
          <input
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            placeholder="搜索组织..."
            className="form-input text-xs pl-8 py-2 w-full"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-2 text-sm">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`w-full flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors mb-1 ${
            rootSelected ? 'bg-brand-soft text-brand-primary' : 'text-theme-text-secondary hover:bg-theme-sidebar-muted'
          }`}
        >
          <Landmark size={13} className="text-amber-400" />
          <span className="text-xs font-semibold flex-1">全部产品</span>
          {rootSelected && <span className="text-brand-primary">✓</span>}
        </button>
        {tree.map((n) => renderNode(n, 0))}
        {tree.length === 0 && <div className="text-center text-theme-text-faint py-6 text-xs">暂无组织数据</div>}
      </div>
    </aside>
  );
};
