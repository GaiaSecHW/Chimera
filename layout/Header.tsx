import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Lock, LogOut, RotateCw, Settings, UserCog } from 'lucide-react';
import { getVisibleTopLevelNavItems, TopLevelNavKey } from '../app/navigation';
import { SecurityProject, UserInfo, ViewType } from '../types/types';
import { getPlatformRoleLabel, getUserAccess, getUserCenterDefaultView } from '../utils/rbac';
import { ThemeLogo } from '../components/ThemeLogo';

const FRONTEND_BUILD_VERSION = String(
  typeof __CHIMERA_BUILD_VERSION__ !== 'undefined' ? __CHIMERA_BUILD_VERSION__ : '',
).trim() || 'dev';

interface HeaderProps {
  user: UserInfo | null;
  currentTopLevelNav: TopLevelNavKey;
  onSelectTopLevelNav: (nav: TopLevelNavKey) => void;
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
  const visibleTopLevelNavItems = getVisibleTopLevelNavItems(user);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const currentProject = projects.find((p) => p.id === selectedProjectId) || { name: '选择项目' };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="bg-theme-header border-b border-theme-sidebar shadow-panel z-20 sticky top-0 backdrop-blur">
      <div className="h-20 px-6 xl:px-10 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <ThemeLogo buildVersion={FRONTEND_BUILD_VERSION} />
        </div>

        <div className="flex justify-center min-w-0">
          <nav className="flex items-center gap-2 overflow-x-auto no-scrollbar max-w-full">
            {visibleTopLevelNavItems.map((item) => {
              const isActive = currentTopLevelNav === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTopLevelNav(item.id)}
                  className={`px-5 py-3 rounded-2xl text-sm font-black whitespace-nowrap transition-all ${
                    isActive
                      ? 'theme-shell-active'
                      : 'theme-shell-muted'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center justify-end gap-3 min-w-0">
          <div className="relative min-w-0 max-w-[18rem]">
            <button
              onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
              className="flex items-center gap-3 px-4 py-2.5 theme-shell-muted rounded-2xl text-sm font-black min-w-[12rem] max-w-[18rem]"
            >
              <div className="w-2.5 h-2.5 rounded-full bg-brand-primary shrink-0" />
              <span className="truncate">{currentProject.name}</span>
              <ChevronDown size={16} className="shrink-0" />
            </button>
            {isProjectDropdownOpen && (
              <div className="absolute top-full right-0 mt-3 w-80 bg-theme-surface border border-theme-border rounded-3xl shadow-panel p-3 z-50">
                <input
                  placeholder="过滤项目..."
                  className="w-full px-4 py-3 bg-theme-elevated text-theme-text-primary rounded-2xl text-xs outline-none placeholder:text-theme-text-faint"
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
                      className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold ${
                        selectedProjectId === p.id ? 'theme-shell-active' : 'text-theme-text-soft hover:bg-theme-elevated hover:text-theme-text-primary'
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

          <div className="relative shrink-0" ref={userMenuRef}>
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="group flex items-center gap-3 p-1 pr-4 bg-theme-header rounded-2xl hover:bg-theme-elevated transition-all active:scale-95 shadow-panel"
            >
              <div className="w-10 h-10 rounded-xl bg-logo-surface flex items-center justify-center text-theme-text-inverse font-black text-sm border shadow-inner group-hover:rotate-6 transition-transform" style={{ borderColor: 'color-mix(in srgb, var(--brand-primary) 42%, rgba(255,255,255,0.08))' }}>
                {user?.username?.[0]?.toUpperCase()}
              </div>
              <div className="text-left hidden md:block">
                <p className="text-[10px] font-black text-theme-text-primary leading-tight">{user?.username}</p>
                <p className="text-[8px] font-bold text-theme-text-faint uppercase tracking-widest">{getPlatformRoleLabel(userAccess.platformRole)}</p>
              </div>
              <ChevronDown size={14} className={`text-theme-text-faint transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {isUserMenuOpen && (
              <div className="absolute top-full right-0 mt-3 w-64 bg-theme-surface border border-theme-border rounded-[2rem] shadow-brand overflow-hidden animate-in fade-in zoom-in-95 duration-200 z-50 p-2 border-t-4 border-t-brand-primary">
                <div className="px-4 py-4 border-b border-theme-border mb-1">
                  <p className="text-[9px] font-black text-theme-text-faint uppercase tracking-widest">Current Identity</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <div className="w-10 h-10 rounded-xl bg-theme-elevated flex items-center justify-center text-theme-text-primary font-black">
                      {user?.username?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-black text-theme-text-primary leading-tight">{user?.username}</p>
                      <span className="text-[8px] font-black uppercase text-brand-primary bg-brand-soft px-1.5 py-0.5 rounded border border-brand-border mt-1 inline-block">
                        UID: {user?.id}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-1 space-y-0.5">
                  <button
                    onClick={() => {
                      setCurrentView('sys-settings');
                      setIsUserMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-theme-text-secondary hover:bg-theme-elevated rounded-xl transition-all"
                  >
                    <Settings size={16} className="text-theme-text-faint" /> 系统设置
                  </button>
                  {userAccess.canAccessUserCenter && (
                    <button
                      onClick={() => {
                        setCurrentView(getUserCenterDefaultView(user));
                        setIsUserMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-theme-text-secondary hover:bg-theme-elevated rounded-xl transition-all"
                    >
                      <UserCog size={16} className="text-theme-text-faint" /> 用户管理
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setCurrentView('change-password');
                      setIsUserMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-theme-text-secondary hover:bg-theme-elevated rounded-xl transition-all"
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
                  className="w-full flex items-center gap-3 px-4 py-3 text-xs font-black text-state-danger hover:bg-state-danger-soft rounded-xl transition-all uppercase tracking-widest"
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
