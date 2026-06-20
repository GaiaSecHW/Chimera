import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { SIDEBAR_SECTIONS, SidebarHealthStatus, TOP_LEVEL_NAV_ITEMS, NAV_ROLE_CONFIG, getSystemAdminSidebarSections } from '../app/navigation';
import { UserInfo, ViewType } from '../types/types';
import { canAccessView } from '../utils/rbac';

interface SidebarProps {
  user: UserInfo | null;
  currentView: ViewType | string;
  activeTopLevelNav: string;
  hasSelectedProject: boolean;
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

  const rawSections = activeTopLevelNav === 'system-admin'
    ? getSystemAdminSidebarSections(String(currentView))
    : (SIDEBAR_SECTIONS[activeTopLevelNav as keyof typeof SIDEBAR_SECTIONS] || []);

  const sections = rawSections.map((section) => ({
    ...section,
    items: section.items.filter((item) => canAccessView(user, item.id)),
  })).filter((section) => section.items.length > 0);

  // Compute which items with subItems should be auto-expanded based on current view
  const autoExpanded = new Set<string>();
  sections.forEach((section) => {
    section.items.forEach((item) => {
      if (item.subItems?.some((sub) => [sub.id, ...(sub.aliases || [])].includes(String(currentView)))) {
        autoExpanded.add(item.id);
      }
    });
  });
  const [expandedItems, setExpandedItems] = useState<Set<string>>(autoExpanded);

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const navRole = TOP_LEVEL_NAV_ITEMS.find((i) => i.id === activeTopLevelNav)?.role;
  const roleConfig = navRole ? NAV_ROLE_CONFIG[navRole] : null;

  return (
    <aside className="w-60 bg-theme-sidebar text-theme-text-soft flex flex-col z-30 shadow-brand shrink-0">
      {roleConfig && (
        <div className="px-5 pt-4 pb-1 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: roleConfig.color }} />
          <span className="text-[10px] font-medium uppercase tracking-[0.22em]" style={{ color: roleConfig.color }}>
            {roleConfig.label}
          </span>
        </div>
      )}
      <nav className="flex-1 px-4 py-5 overflow-y-auto custom-scrollbar">
        <div className="space-y-5">
          {sections.map((section) => (
            <div key={section.title} className="space-y-2">
              <div className="px-3 text-[10px] font-medium uppercase tracking-[0.22em] text-theme-text-faint">
                {section.title}
              </div>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const disabled = !!item.requiresProject && projectGuard;
                  const healthStatus = item.healthKey ? healthStatusMap[item.healthKey] : null;
                  const healthColor = healthStatus === true ? 'text-green-400' : healthStatus === false ? 'text-rose-400' : '';
                  const isActive = [item.id, ...(item.aliases || [])].includes(String(currentView));
                  const hasSubItems = !!(item.subItems && item.subItems.length > 0);
                  const isExpanded = expandedItems.has(item.id);
                  const hasActiveSubItem = hasSubItems && item.subItems!.some((sub) =>
                    [sub.id, ...(sub.aliases || [])].includes(String(currentView))
                  );
                  const Icon = item.icon;

                  return (
                    <div key={item.id}>
                      <button
                        onClick={() => {
                          if (disabled) return;
                          if (hasSubItems) toggleExpand(item.id);
                          else setCurrentView(item.id);
                        }}
                        title={disabled ? projectGuardTitle : undefined}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                          disabled
                            ? 'bg-theme-sidebar/50 text-theme-text-faint cursor-not-allowed opacity-60'
                            : hasActiveSubItem
                              ? 'theme-shell-muted text-theme-text-inverse'
                              : isActive
                                ? 'theme-shell-active'
                                : 'text-theme-text-soft hover:bg-theme-sidebar-muted hover:text-theme-text-inverse'
                        }`}
                      >
                        <span className={`shrink-0 ${!isActive && !hasActiveSubItem ? healthColor : ''}`}><Icon size={16} /></span>
                        <span className={`flex-1 text-sm font-medium truncate ${isActive || hasActiveSubItem ? 'text-theme-text-inverse' : ''}`}>{item.label}</span>
                        {hasSubItems && (
                          <span className="shrink-0 text-theme-text-faint">
                            {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          </span>
                        )}
                      </button>

                      {/* Sub-items */}
                      {hasSubItems && isExpanded && (
                        <div className="mt-1 ml-4 space-y-0.5 border-l border-theme-sidebar pl-3">
                          {item.subItems!
                            .filter((sub) => canAccessView(user, sub.id))
                            .map((sub) => {
                              const subDisabled = !!sub.requiresProject && projectGuard;
                              const subActive = [sub.id, ...(sub.aliases || [])].includes(String(currentView));
                              return (
                                <button
                                  key={sub.id}
                                  onClick={() => !subDisabled && setCurrentView(sub.id)}
                                  title={subDisabled ? projectGuardTitle : undefined}
                                  className={`w-full flex items-center px-3 py-2 rounded-xl text-left text-sm transition-all ${
                                    subDisabled
                                      ? 'text-theme-text-faint cursor-not-allowed opacity-60'
                                      : subActive
                                        ? 'theme-shell-active font-semibold'
                                        : 'text-theme-text-faint hover:bg-theme-sidebar-muted hover:text-theme-text-inverse font-medium'
                                  }`}
                                >
                                  {sub.label}
                                </button>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>
    </aside>
  );
};
