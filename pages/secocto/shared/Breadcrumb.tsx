import React from 'react';
import { ChevronRight } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

/**
 * 简易面包屑 — 与 secocto-ui SkillDetail 等子页顶部的 .breadcrumb 等价。
 * 可点击项渲染为 hover 高亮按钮,末项不可点(当前位置)。
 * 用 lucide-react 的 ChevronRight 作为分隔符,沿用 Chimera 现有图标体系。
 */
export const Breadcrumb: React.FC<{ items: BreadcrumbItem[] }> = ({ items }) => (
  <nav aria-label="面包屑" className="flex items-center gap-1 text-xs text-theme-text-secondary mb-3">
    {items.map((item, idx) => {
      const isLast = idx === items.length - 1;
      const node = item.onClick && !isLast ? (
        <button
          onClick={item.onClick}
          className="hover:text-brand-primary transition-colors truncate max-w-[200px]"
          title={item.label}
        >
          {item.label}
        </button>
      ) : (
        <span className={`truncate max-w-[300px] ${isLast ? 'text-theme-text-primary font-medium' : ''}`} title={item.label}>
          {item.label}
        </span>
      );
      return (
        <React.Fragment key={idx}>
          {node}
          {!isLast && <ChevronRight size={12} className="text-theme-text-faint shrink-0" />}
        </React.Fragment>
      );
    })}
  </nav>
);
