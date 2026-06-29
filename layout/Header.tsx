import { ChevronDown, Folder, Lock, LogOut, Moon, RotateCw, Sun } from 'lucide-react';
import {
  TopLevelNavKey,
  TopLevelNavItem,
  NAV_ROLE_CONFIG,
  getVisibleTopLevelNavItems,
  SYSTEM_ADMIN_CHILDREN,
  getSystemAdminActiveChild,
  ASSETS_CENTER_CHILDREN,
  getAssetsCenterActiveChild,
} from '../app/navigation';
import { SecurityProject, UserInfo, ViewType } from '../types/types';
import { getPlatformRoleLabel, getUserAccess } from '../utils/rbac';
import { ThemeLogo } from '../components/ThemeLogo';
import { useTheme } from '../theme/ThemeProvider';

import React, { useEffect, useRef, useState } from 'react';

const getTabStyle = (item: TopLevelNavItem, isActive: boolean): React.CSSProperties => {
  if (isActive) {
    if (!item.role) return { background: '#2563EB', color: '#fff', boxShadow: '0 2px 12px rgba(99,102,241,0.32)' };
    const cfg = NAV_ROLE_CONFIG[item.role!];
    return { background: cfg.activeBg, color: '#fff', boxShadow: `0 2px 12px ${cfg.color}52` };
  }
  if (item.role) {
    const cfg = NAV_ROLE_CONFIG[item.role];
    return { background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` };
  }
  return {};
};

interface HeaderProps {
  user: UserInfo | null;
  currentTopLevelNav: TopLevelNavKey;
  onSelectTopLevelNav: (nav: TopLevelNavKey) => void;
  currentView: ViewType | string;
  onSelectSystemAdminChild: (view: string) => void;
  onSelectAssetsCenterChild: (view: string) => void;
  projects: SecurityProject[];
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
  isProjectDropdownOpen: boolean;
  setIsProjectDropdownOpen: (open: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  fetchProjects: (showRefresh: boolean) => void;
  isRefreshing: boolean;
  setCurrentView: (view: ViewType | string) => void;
  handleLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTopLevelNav,
  onSelectTopLevelNav,
  currentView,
  onSelectSystemAdminChild,
  onSelectAssetsCenterChild,
  user,
  projects,
  selectedProjectId,
  setSelectedProjectId,
  isProjectDropdownOpen,
  setIsProjectDropdownOpen,
  searchQuery,
  setSearchQuery,
  fetchProjects,
  isRefreshing,
  setCurrentView,
  handleLogout,
}) => {
  const userAccess = getUserAccess(user);
  const { theme, setTheme } = useTheme();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const projectListRef = useRef<HTMLDivElement>(null);

  const [isSystemAdminOpen, setIsSystemAdminOpen] = useState(false);
  const systemAdminRef = useRef<HTMLDivElement>(null);
  const systemAdminTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isAssetsCenterOpen, setIsAssetsCenterOpen] = useState(false);
  const assetsCenterRef = useRef<HTMLDivElement>(null);
  const assetsCenterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSystemAdminEnter = () => {
    if (systemAdminTimerRef.current) clearTimeout(systemAdminTimerRef.current);
    setIsSystemAdminOpen(true);
  };
  const handleSystemAdminLeave = () => {
    systemAdminTimerRef.current = setTimeout(() => setIsSystemAdminOpen(false), 150);
  };

  const handleAssetsCenterEnter = () => {
    if (assetsCenterTimerRef.current) clearTimeout(assetsCenterTimerRef.current);
    setIsAssetsCenterOpen(true);
  };
  const handleAssetsCenterLeave = () => {
    assetsCenterTimerRef.current = setTimeout(() => setIsAssetsCenterOpen(false), 150);
  };

  const currentProject = projects.find((p) => p.id === selectedProjectId) || { name: '选择项目' };

  const visibleNavItems = getVisibleTopLevelNavItems(user);
  const activeSystemAdminChild = getSystemAdminActiveChild(String(currentView));
  const activeAssetsCenterChild = getAssetsCenterActiveChild(String(currentView));

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) setIsUserMenuOpen(false);
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(event.target as Node)) setIsProjectDropdownOpen(false);
      if (assetsCenterRef.current && !assetsCenterRef.current.contains(event.target as Node)) setIsAssetsCenterOpen(false);
      if (systemAdminRef.current && !systemAdminRef.current.contains(event.target as Node)) setIsSystemAdminOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isProjectDropdownOpen && projectListRef.current) {
      const selected = projectListRef.current.querySelector('[data-selected="true"]');
      if (selected) {
        selected.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [isProjectDropdownOpen]);

  return (
    <header className="bg-theme-header border-b border-theme-sidebar shadow-brand z-20 sticky top-0">
      <div className="h-14 px-4 flex items-center gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <ThemeLogo size="small" showBadge={false} />
        </div>

        <div className="flex justify-start  flex-1 min-w-0 overflow-visible">
          <nav className="flex items-center gap-1 max-w-full">
            {visibleNavItems.map((item) => {
              const isActive = currentTopLevelNav === item.id;

              if (item.id === 'assets-center') {
                return (
                  <React.Fragment key={item.id}>
                    <div
                      className="relative shrink-0"
                      ref={assetsCenterRef}
                      onMouseEnter={handleAssetsCenterEnter}
                      onMouseLeave={handleAssetsCenterLeave}
                    >
                      <button
                        onClick={() => setIsAssetsCenterOpen((v) => !v)}
                        className={`flex items-center gap-1 px-1 sm:px-1.5 lg:px-2 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                          isActive ? 'head-tab-active' : 'head-tab-hover'
                        }`}
                      >
                        {item.label}
                        <ChevronDown size={12} className={`transition-transform ${isAssetsCenterOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isAssetsCenterOpen && (
                        <div className="absolute top-full left-0 mt-2 w-36 bg-theme-surface border border-theme-border rounded-xl shadow-brand p-2 z-50">
                          {ASSETS_CENTER_CHILDREN.map((child) => {
                            const childActive = isActive && activeAssetsCenterChild === child.key;
                            return (
                              <button
                                key={child.key}
                                onClick={() => {
                                  onSelectAssetsCenterChild(child.defaultView);
                                  setIsAssetsCenterOpen(false);
                                }}
                                className={`w-full text-left px-3 py-2.5 text-xs font-medium rounded-xl transition-all ${
                                  childActive
                                    ? 'theme-shell-active'
                                    : 'text-theme-text-secondary hover:bg-theme-elevated'
                                }`}
                              >
                                {child.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </React.Fragment>
                );
              }

              if (item.id === 'system-admin') {
                return (
                  <React.Fragment key={item.id}>
                    <div
                      className="relative shrink-0"
                      ref={systemAdminRef}
                      onMouseEnter={handleSystemAdminEnter}
                      onMouseLeave={handleSystemAdminLeave}
                    >
                      <button
                        onClick={() => setIsSystemAdminOpen((v) => !v)}
                        className={`flex items-center gap-1 px-1 sm:px-1.5 lg:px-2 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                            isActive ? 'head-tab-active' : 'head-tab-hover'
                        }`}
                      >
                        {item.label}
                        <ChevronDown size={12} className={`transition-transform ${isSystemAdminOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isSystemAdminOpen && (
                        <div className="absolute top-full left-0 mt-2 w-44 bg-theme-surface border border-theme-border rounded-xl shadow-brand p-2 z-50">
                          {SYSTEM_ADMIN_CHILDREN.map((child) => {
                            const childActive = isActive && activeSystemAdminChild === child.key;
                            return (
                              <button
                                key={child.key}
                                onClick={() => {
                                  onSelectSystemAdminChild(child.defaultView);
                                  setIsSystemAdminOpen(false);
                                }}
                                className={`w-full text-left px-3 py-2.5 text-xs font-medium rounded-xl transition-all ${
                                  childActive
                                    ? 'theme-shell-active'
                                    : 'text-theme-text-secondary hover:bg-theme-elevated'
                                }`}
                              >
                                {child.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </React.Fragment>
                );
              }

              return (
                <React.Fragment key={item.id}>
                  <button
                    onClick={() => onSelectTopLevelNav(item.id)}
                    className={`px-1 sm:px-1.5 lg:px-2 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                        isActive ? 'head-tab-active' : 'head-tab-hover'
                    }`}
                  >
                    {item.label}
                  </button>
                </React.Fragment>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center justify-end gap-3 min-w-0">
          <div className="relative min-w-0 max-w-[15rem]" ref={projectDropdownRef}>
            <button
              onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
              className="flex items-center gap-2 px-1.5 py-1.5 max-w-[15rem] rounded-xl text-sm font-medium head-tab-hover"
            >
              <span className="truncate flex-1 text-left">{currentProject.name}</span>
              <span onClick={(e) => { e.stopPropagation(); fetchProjects(true); }} className="shrink-0 text-theme-text-faint text-theme-text-primary-hover transition-all">
                <RotateCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              </span>
              <ChevronDown size={14} className="shrink-0 text-theme-text-faint" />
            </button>
            {isProjectDropdownOpen && (
              <div className="absolute top-full right-0 mt-2 w-48 bg-theme-surface border border-theme-border rounded-lg shadow-overlay p-2 z-50">
                <input
                  placeholder="过滤项目..."
                  className="form-input w-full text-xs placeholder:text-theme-text-faint"
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <div ref={projectListRef} className="max-h-60 overflow-y-auto mt-1.5 space-y-0.5">
                  {projects.filter((p) => p.name.includes(searchQuery)).map((p) => (
                    <button
                      key={p.id}
                      data-selected={selectedProjectId === p.id ? 'true' : undefined}
                      onClick={() => {
                        setSelectedProjectId(p.id);
                        setIsProjectDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                        selectedProjectId === p.id ? 'theme-shell-active' : 'text-theme-text-secondary hover:bg-theme-elevated'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-3 text-theme-text-faint hover:text-brand-primary transition-all shrink-0"
            aria-label={theme === 'dark' ? '切换浅色主题' : '切换深色主题'}
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          <div className="relative shrink-0" ref={userMenuRef}>
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center gap-2 px-1 py-1 rounded-xl head-tab-hover"
            >
              <div className="w-6 h-6 bg-brand-soft flex items-center justify-center text-brand-primary text-sm rounded-full shrink-0">
                {user?.username?.[0]?.toUpperCase()}
              </div>
              <div className="text-left hidden md:block">
                <p className="text-xs font-medium text-theme-text-primary leading-tight">{user?.username}</p>
                <p className="text-[10px] font-medium text-theme-text-muted uppercase tracking-wider">{getPlatformRoleLabel(userAccess.platformRole)}</p>
              </div>
              <ChevronDown size={14} className={`text-theme-text-faint shrink-0 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {isUserMenuOpen && (
              <div className="absolute top-full right-0 mt-2 w-48 bg-theme-surface border border-theme-border rounded-lg shadow-overlay overflow-hidden animate-in fade-in zoom-in-95 duration-200 z-50 p-2">
                <div className="px-3 py-3 border-b border-theme-border mb-1">
                  <p className="text-[10px] font-medium text-theme-text-faint uppercase tracking-wider">Current Identity</p>
                  <div className="flex items-center gap-2.5 mt-1.5">
                    <div className="w-8 h-8 rounded-lg bg-brand-soft flex items-center justify-center text-brand-primary font-semibold text-sm shrink-0">
                      {user?.username?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-theme-text-primary leading-tight">{user?.username}</p>
                      <span className="text-[10px] font-medium uppercase text-brand-primary bg-brand-soft px-1.5 py-0.5 rounded-md border border-brand-border mt-1 inline-block">
                        UID: {user?.id}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-0.5">
                  <button
                    onClick={() => {
                      setCurrentView('change-password');
                      setIsUserMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-theme-text-secondary hover:bg-theme-elevated rounded-lg transition-colors"
                  >
                    <Lock size={14} className="text-theme-text-faint" /> 修改密码
                  </button>
                </div>

                <div className="h-px bg-theme-border my-1 mx-1" />

                <button
                  onClick={() => {
                    handleLogout();
                    setIsUserMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-state-danger hover:bg-state-danger-soft rounded-lg transition-colors uppercase tracking-wider"
                >
                  <LogOut size={14} /> 退出系统
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};