import React, { useState } from 'react';
import { ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { SIDEBAR_SECTIONS, SidebarHealthStatus } from '../app/navigation';
import { UserInfo, ViewType } from '../types/types';
import { canAccessView } from '../utils/rbac';

const FRONTEND_BUILD_VERSION =
  typeof __APP_BUILD_VERSION__ === 'string' && __APP_BUILD_VERSION__.trim()
    ? __APP_BUILD_VERSION__.trim()
    : null;

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

  const sections = (SIDEBAR_SECTIONS[activeTopLevelNav as keyof typeof SIDEBAR_SECTIONS] || []).map((section) => ({
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
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-all ${
                          disabled
                            ? 'bg-slate-900/50 text-slate-600 cursor-not-allowed opacity-60'
                            : hasActiveSubItem
                              ? 'bg-slate-800 text-white'
                              : isActive
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <span className={`shrink-0 ${!isActive && !hasActiveSubItem ? healthColor : ''}`}><Icon size={16} /></span>
                        {!isSidebarCollapsed && (
                          <>
                            <span className={`flex-1 text-sm font-bold truncate ${isActive || hasActiveSubItem ? 'text-white' : ''}`}>{item.label}</span>
                            {hasSubItems && (
                              <span className="shrink-0 text-slate-500">
                                {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                              </span>
                            )}
                          </>
                        )}
                      </button>

                      {/* Sub-items */}
                      {hasSubItems && isExpanded && !isSidebarCollapsed && (
                        <div className="mt-1 ml-4 space-y-0.5 border-l border-slate-700 pl-3">
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
                                      ? 'text-slate-600 cursor-not-allowed opacity-60'
                                      : subActive
                                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 font-semibold'
                                        : 'text-slate-400 hover:bg-slate-800 hover:text-white font-medium'
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

      <div className="p-5 border-t border-slate-800">
        {!isSidebarCollapsed ? (
          <div className="space-y-3">
            {FRONTEND_BUILD_VERSION ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
                  Frontend
                </div>
                <div className="mt-1 break-all font-mono text-[11px] text-slate-300">
                  {FRONTEND_BUILD_VERSION}
                </div>
              </div>
            ) : null}
            <div className="flex justify-end">
              <button onClick={() => setIsSidebarCollapsed(true)} className="p-3 rounded-2xl bg-slate-800/50 text-slate-500 hover:text-white hover:bg-slate-800 transition-colors">
                <PanelLeftClose size={18} />
              </button>
            </div>
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
