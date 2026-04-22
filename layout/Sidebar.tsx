import React from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { SIDEBAR_SECTIONS, SidebarHealthStatus } from '../app/navigation';
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
  aiAgentFrameworkHealth?: SidebarHealthStatus['aiAgentFrameworkHealth'];
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
  aiAgentFrameworkHealth = null,
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
    aiAgentFrameworkHealth,
  };

  const sections = (SIDEBAR_SECTIONS[activeTopLevelNav as keyof typeof SIDEBAR_SECTIONS] || []).map((section) => ({
    ...section,
    items: section.items.filter((item) => canAccessView(user, item.id)),
  })).filter((section) => section.items.length > 0);

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
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => !disabled && setCurrentView(item.id)}
                      title={disabled ? projectGuardTitle : undefined}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-all ${
                        disabled
                          ? 'bg-slate-900/50 text-slate-600 cursor-not-allowed opacity-60'
                          : isActive
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <span className={`shrink-0 ${!isActive ? healthColor : ''}`}><Icon size={16} /></span>
                      {!isSidebarCollapsed && (
                        <span className={`text-sm font-bold truncate ${isActive ? 'text-white' : ''}`}>{item.label}</span>
                      )}
                    </button>
                  );
                })}
              </div>
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
