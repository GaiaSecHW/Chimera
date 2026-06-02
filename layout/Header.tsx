import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Lock, LogOut, RotateCw, Settings, Shield, UserCog } from 'lucide-react';
import { TopLevelNavKey, TOP_LEVEL_NAV_ITEMS } from '../app/navigation';
import { SecurityProject, UserInfo, ViewType } from '../types/types';
import { getPlatformRoleLabel, getUserAccess, getUserCenterDefaultView } from '../utils/rbac';

const FRONTEND_BUILD_VERSION = String(
  typeof __SECFLOW_BUILD_VERSION__ !== 'undefined' ? __SECFLOW_BUILD_VERSION__ : '',
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
    <header className="bg-slate-900 border-b border-slate-800 shadow-sm z-20 sticky top-0">
      <div className="h-20 px-6 xl:px-10 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-11 h-11 bg-blue-600 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/30">
            <Shield className="text-white" size={24} />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="block text-xl font-black text-white tracking-tighter">SecFlow</span>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                {FRONTEND_BUILD_VERSION}
              </span>
            </div>
            <span className="block text-[10px] font-black text-blue-400 uppercase tracking-[0.25em] truncate">
              Security Platform
            </span>
          </div>
        </div>

        <div className="flex justify-center min-w-0">
          <nav className="flex items-center gap-2 overflow-x-auto no-scrollbar max-w-full">
            {TOP_LEVEL_NAV_ITEMS.map((item) => {
              const isActive = currentTopLevelNav === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTopLevelNav(item.id)}
                  className={`px-5 py-3 rounded-2xl text-sm font-black whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
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
              className="flex items-center gap-3 px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-2xl text-sm font-black text-slate-100 hover:bg-slate-700 transition-all min-w-[12rem] max-w-[18rem]"
            >
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
              <span className="truncate">{currentProject.name}</span>
              <ChevronDown size={16} className="shrink-0" />
            </button>
            {isProjectDropdownOpen && (
              <div className="absolute top-full right-0 mt-3 w-80 bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl p-3 z-50">
                <input
                  placeholder="过滤项目..."
                  className="w-full px-4 py-3 bg-slate-800 text-slate-100 rounded-2xl text-xs outline-none placeholder:text-slate-500"
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
                        selectedProjectId === p.id ? 'bg-blue-600 text-white' : 'text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button onClick={() => fetchProjects(true)} className="p-3 text-slate-500 hover:text-blue-400 transition-all shrink-0">
            <RotateCw size={20} className={isRefreshing ? 'animate-spin' : ''} />
          </button>

          <div className="relative shrink-0" ref={userMenuRef}>
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="group flex items-center gap-3 p-1 pr-4 bg-slate-900 rounded-2xl hover:bg-slate-800 transition-all active:scale-95 shadow-xl shadow-slate-900/10"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-sm border-2 border-slate-900 shadow-inner group-hover:rotate-6 transition-transform">
                {user?.username?.[0]?.toUpperCase()}
              </div>
              <div className="text-left hidden md:block">
                <p className="text-[10px] font-black text-white leading-tight">{user?.username}</p>
                <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">{getPlatformRoleLabel(userAccess.platformRole)}</p>
              </div>
              <ChevronDown size={14} className={`text-slate-500 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {isUserMenuOpen && (
              <div className="absolute top-full right-0 mt-3 w-64 bg-white border border-slate-200 rounded-[2rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 z-50 p-2 border-t-4 border-t-blue-600">
                <div className="px-4 py-4 border-b border-slate-50 mb-1">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Current Identity</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-800 font-black">
                      {user?.username?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-800 leading-tight">{user?.username}</p>
                      <span className="text-[8px] font-black uppercase text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 mt-1 inline-block">
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
                    className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded-xl transition-all"
                  >
                    <Settings size={16} className="text-slate-400" /> 系统设置
                  </button>
                  {userAccess.canAccessUserCenter && (
                    <button
                      onClick={() => {
                        setCurrentView(getUserCenterDefaultView(user));
                        setIsUserMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded-xl transition-all"
                    >
                      <UserCog size={16} className="text-slate-400" /> 用户管理
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setCurrentView('change-password');
                      setIsUserMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded-xl transition-all"
                  >
                    <Lock size={16} className="text-slate-400" /> 修改密码
                  </button>
                </div>

                <div className="h-px bg-slate-50 my-1 mx-2" />

                <button
                  onClick={() => {
                    handleLogout();
                    setIsUserMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-xs font-black text-red-500 hover:bg-red-50 rounded-xl transition-all uppercase tracking-widest"
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
