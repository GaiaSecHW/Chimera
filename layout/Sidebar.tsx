import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NavItem, SIDEBAR_SECTIONS, SidebarHealthStatus } from '../app/navigation';
import { UserInfo, ViewType } from '../types/types';
import { canAccessView } from '../utils/rbac';

interface SidebarProps {
  user: UserInfo | null;
  currentView: ViewType | string;
  activeTopLevelNav: string;
  hasSelectedProject: boolean;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (v: boolean) => void;
  setCurrentView: (v: ViewType | string) => void;
  resourceHealth?: SidebarHealthStatus['resourceHealth'];
  staticPackageHealth?: SidebarHealthStatus['staticPackageHealth'];
  projectHealth?: SidebarHealthStatus['projectHealth'];
  envHealth?: SidebarHealthStatus['envHealth'];
  codeAuditHealth?: SidebarHealthStatus['codeAuditHealth'];
  workflowHealth?: SidebarHealthStatus['workflowHealth'];
  vulnHealth?: SidebarHealthStatus['vulnHealth'];
  configCenterHealth?: SidebarHealthStatus['configCenterHealth'];
}

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  currentView,
  activeTopLevelNav,
  hasSelectedProject,
  isSidebarCollapsed,
  setIsSidebarCollapsed,
  setCurrentView,
  resourceHealth = null,
  staticPackageHealth = null,
  projectHealth = null,
  envHealth = null,
  codeAuditHealth = null,
  workflowHealth = null,
  vulnHealth = null,
  configCenterHealth = null,
}) => {
  const projectGuard = !hasSelectedProject;
  const projectGuardTitle = '请先选择项目';

  const healthStatusMap: SidebarHealthStatus = {
    resourceHealth,
    staticPackageHealth,
    projectHealth,
    envHealth,
    codeAuditHealth,
    workflowHealth,
    vulnHealth,
    configCenterHealth,
  };

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const matchesSelf = (item: NavItem) => [item.id, ...(item.aliases || [])].includes(String(currentView));

  const matchesItem = (item: NavItem): boolean => {
    if (matchesSelf(item)) return true;
    return (item.children || []).some(matchesItem);
  };

  const filterNavItem = (item: NavItem): NavItem | null => {
    const children = item.children?.map(filterNavItem).filter(Boolean) as NavItem[] | undefined;
    if (item.children) {
      return children && children.length > 0 ? { ...item, children } : null;
    }
    return canAccessView(user, item.id) ? item : null;
  };

  const sections = useMemo(() => (
    (SIDEBAR_SECTIONS[activeTopLevelNav as keyof typeof SIDEBAR_SECTIONS] || [])
      .map((section) => ({
        ...section,
        items: section.items.map(filterNavItem).filter(Boolean) as NavItem[],
      }))
      .filter((section) => section.items.length > 0)
  ), [activeTopLevelNav, user]);

  useEffect(() => {
    setExpandedGroups((prev) => {
      const next = { ...prev };
      let changed = false;

      const ensureActiveBranchExpanded = (item: NavItem): boolean => {
        const hasActiveDescendant = (item.children || []).some(ensureActiveBranchExpanded);
        const isActive = matchesSelf(item) || hasActiveDescendant;
        if (item.children?.length && isActive && !next[item.id]) {
          next[item.id] = true;
          changed = true;
        }
        return isActive;
      };

      sections.forEach((section) => section.items.forEach(ensureActiveBranchExpanded));
      return changed ? next : prev;
    });
  }, [currentView, sections]);

  const renderNavItem = (item: NavItem, depth = 0): React.ReactNode => {
    const disabled = !!item.requiresProject && projectGuard;
    const healthStatus = item.healthKey ? healthStatusMap[item.healthKey] : null;
    const healthColor = healthStatus === true ? 'text-green-400' : healthStatus === false ? 'text-rose-400' : '';
    const hasChildren = !!item.children?.length;
    const isCurrent = matchesSelf(item);
    const hasActiveChild = hasChildren && (item.children || []).some(matchesItem);
    const isExpanded = hasChildren ? (expandedGroups[item.id] ?? hasActiveChild) : false;
    const Icon = item.icon;
    const indentation = depth === 0 ? 'px-3' : 'pl-11 pr-3';
    const toneClass = disabled
      ? 'bg-slate-900/50 text-slate-600 cursor-not-allowed opacity-60'
      : isCurrent
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
        : hasChildren && (hasActiveChild || isExpanded)
          ? 'bg-slate-800 text-white'
          : depth > 0
            ? 'text-slate-400 hover:bg-slate-800/70 hover:text-white'
            : 'text-slate-300 hover:bg-slate-800 hover:text-white';

    const handleClick = () => {
      if (disabled) return;
      if (hasChildren) {
        if (isSidebarCollapsed) {
          setIsSidebarCollapsed(false);
          setExpandedGroups((prev) => ({ ...prev, [item.id]: true }));
          return;
        }
        setExpandedGroups((prev) => ({ ...prev, [item.id]: !isExpanded }));
        return;
      }
      setCurrentView(item.id);
    };

    return (
      <div key={item.id} className="space-y-1">
        <button
          onClick={handleClick}
          title={disabled ? projectGuardTitle : undefined}
          className={`w-full flex items-center gap-3 ${indentation} py-2.5 rounded-2xl text-left transition-all ${toneClass}`}
        >
          <span className={`shrink-0 ${!isCurrent ? healthColor : ''}`}><Icon size={16} /></span>
          {!isSidebarCollapsed && (
            <>
              <span className={`text-sm font-bold truncate ${isCurrent ? 'text-white' : ''}`}>{item.label}</span>
              {hasChildren ? (
                <span className="ml-auto shrink-0 text-slate-400">
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
              ) : null}
            </>
          )}
        </button>

        {!isSidebarCollapsed && hasChildren && isExpanded ? (
          <div className="space-y-1">
            {(item.children || []).map((child) => renderNavItem(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <aside className={`${isSidebarCollapsed ? 'w-24' : 'w-60'} bg-slate-900 text-slate-300 flex flex-col transition-all duration-300 z-30 shadow-2xl shrink-0`}>
      <nav className="flex-1 px-4 py-5 overflow-y-auto custom-scrollbar">
        <div className="space-y-5">
          {sections.map((section) => (
            <div key={section.title} className="space-y-2">
              {!isSidebarCollapsed && (
                <div className="px-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
                  {section.title}
                </div>
              )}
              <div className="space-y-1">{section.items.map((item) => renderNavItem(item))}</div>
            </div>
          ))}
        </div>
      </nav>

      <div className="p-5 border-t border-slate-800">
        {!isSidebarCollapsed ? (
          <div className="flex justify-end">
            <button onClick={() => setIsSidebarCollapsed(true)} className="p-3 rounded-2xl bg-slate-800/50 text-slate-500 hover:text-white hover:bg-slate-800 transition-colors">
              <PanelLeftClose size={18} />
            </button>
          </div>
        ) : (
          <button onClick={() => setIsSidebarCollapsed(false)} className="w-full flex justify-center p-3 text-slate-500 hover:text-white transition-colors">
            <PanelLeftOpen size={22} />
          </button>
        )}
      </div>
    </aside>
  );
};
