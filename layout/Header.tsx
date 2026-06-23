import { ChevronDown, Lock, LogOut, Moon, RotateCw, Sun } from 'lucide-react';
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
    if (!item.role) return { background: '#6366f1', color: '#fff', boxShadow: '0 2px 12px rgba(99,102,241,0.32)' };
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

  return (
    <header className="bg-theme-header border-b border-theme-sidebar shadow-brand z-20 sticky top-0">
      <div className="h-14 px-6 xl:px-10 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <ThemeLogo size="small" showBadge={false} />
        </div>

        <div className="flex justify-start min-w-0 overflow-visible">
          <nav className="flex items-center gap-1 flex-wrap max-w-full">
            {visibleNavItems.map((item) => {
              const isActive = currentTopLevelNav === item.id;

              if (item.id === 'assets-center') {
                return (
                  <React.Fragment key={item.id}>
                    {item.showDividerBefore && (
                      <div className="w-px h-4 bg-theme-text-faint/20 mx-1.5 shrink-0" />
                    )}
                    <div
                      className="relative shrink-0"
                      ref={assetsCenterRef}
                      onMouseEnter={handleAssetsCenterEnter}
                      onMouseLeave={handleAssetsCenterLeave}
                    >
                      <button
                        onClick={() => setIsAssetsCenterOpen((v) => !v)}
                        style={getTabStyle(item, isActive)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                          isActive ? '' : 'hover:bg-theme-sidebar-muted hover:text-theme-text-inverse'
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
                    {item.showDividerBefore && (
                      <div className="w-px h-4 bg-theme-text-faint/20 mx-1.5 shrink-0" />
                    )}
                    <div
                      className="relative shrink-0"
                      ref={systemAdminRef}
                      onMouseEnter={handleSystemAdminEnter}
                      onMouseLeave={handleSystemAdminLeave}
                    >
                      <button
                        onClick={() => setIsSystemAdminOpen((v) => !v)}
                        style={getTabStyle(item, isActive)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                          isActive ? '' : 'hover:bg-theme-sidebar-muted hover:text-theme-text-inverse'
                        }`}
                      >
                        {item.label}
                        <ChevronDown size={12} className={`transition-transform ${isSystemAdminOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isSystemAdminOpen && (
                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-44 bg-theme-surface border border-theme-border rounded-xl shadow-brand p-2 z-50">
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
                  {item.showDividerBefore && (
                    <div className="w-px h-4 bg-theme-text-faint/20 mx-1.5 shrink-0" />
                  )}
                  <button
                    onClick={() => onSelectTopLevelNav(item.id)}
                    style={getTabStyle(item, isActive)}
                    className={`px-3 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                      isActive ? '' : 'hover:bg-theme-sidebar-muted hover:text-theme-text-inverse'
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
          <div className="relative min-w-0 max-w-[18rem]" ref={projectDropdownRef}>
            <button
              onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
              className="flex items-center gap-3 px-4 py-2.5 theme-shell-muted rounded-lg text-sm font-semibold min-w-[12rem] max-w-[18rem]"
            >
              <div className="w-2.5 h-2.5 rounded-full bg-brand-primary shrink-0" />
              <span className="truncate">{currentProject.name}</span>
              <ChevronDown size={16} className="shrink-0" />
            </button>
            {isProjectDropdownOpen && (
              <div className="absolute top-full right-0 mt-3 w-80 bg-theme-header border border-theme-sidebar rounded-xl shadow-brand p-3 z-50">
                <input
                  placeholder="过滤项目..."
                  className="w-full px-4 py-3 bg-theme-sidebar text-theme-text-inverse rounded-lg text-xs outline-none placeholder:text-theme-text-faint"
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <div className="max-h-60 overflow-y-auto mt-2 space-y-1">
                  {projects.filter((p) => p.name.includes(searchQuery)).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedProjectId(p.id);
                        setIsProjectDropdownOpen(false);
                      }}
                      className={`w-full text-left px-4 py-3 rounded-xl text-xs font-medium ${
                        selectedProjectId === p.id ? 'theme-shell-active' : 'text-theme-text-soft hover:bg-theme-sidebar hover:text-theme-text-inverse'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button onClick={() => fetchProjects(true)} className="p-3 text-theme-text-faint hover:text-brand-primary transition-all shrink-0">
            <RotateCw size={20} className={isRefreshing ? 'animate-spin' : ''} />
          </button>

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
              className="group flex items-center gap-3 p-1 pr-4 bg-theme-header rounded-lg hover:bg-theme-sidebar transition-all active:scale-95 shadow-brand"
            >
              <div className="w-10 h-10 rounded-xl bg-logo-surface flex items-center justify-center text-theme-text-inverse font-semibold text-sm border shadow-inner group-hover:rotate-6 transition-transform" style={{ borderColor: 'color-mix(in srgb, var(--brand-primary) 42%, rgba(255,255,255,0.08))' }}>
                {user?.username?.[0]?.toUpperCase()}
              </div>
              <div className="text-left hidden md:block">
                <p className="text-[10px] font-medium text-theme-text-inverse leading-tight">{user?.username}</p>
                <p className="text-[8px] font-medium text-theme-text-faint uppercase tracking-widest">{getPlatformRoleLabel(userAccess.platformRole)}</p>
              </div>
              <ChevronDown size={14} className={`text-theme-text-faint transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {isUserMenuOpen && (
              <div className="absolute top-full right-0 mt-3 w-64 bg-theme-surface border border-theme-border rounded-xl shadow-brand overflow-hidden animate-in fade-in zoom-in-95 duration-200 z-50 p-2 border-t-4 border-t-brand-primary">
                <div className="px-4 py-4 border-b border-theme-border mb-1">
                  <p className="text-[9px] font-medium text-theme-text-faint uppercase tracking-widest">Current Identity</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <div className="w-10 h-10 rounded-xl bg-theme-elevated flex items-center justify-center text-theme-text-primary font-semibold">
                      {user?.username?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-theme-text-primary leading-tight">{user?.username}</p>
                      <span className="text-[8px] font-medium uppercase text-brand-primary bg-brand-soft px-1.5 py-0.5 rounded border border-brand-border mt-1 inline-block">
                        UID: {user?.id}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-1 space-y-0.5">
                  <button
                    onClick={() => {
                      setCurrentView('change-password');
                      setIsUserMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-xs font-medium text-theme-text-secondary hover:bg-theme-elevated rounded-xl transition-all"
                  >
                    <Lock size={16} className="text-theme-text-faint" /> 修改密码
                  </button>
                </div>

                <div className="h-px bg-theme-elevated my-1 mx-2" />

                <button
                  onClick={() => {
                    handleLogout();
                    setIsUserMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-xs font-medium text-state-danger hover:bg-state-danger-soft rounded-xl transition-all uppercase tracking-widest"
                >
                  <LogOut size={16} /> 退出系统
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};