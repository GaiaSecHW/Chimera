import React, { useState, useEffect } from 'react';
import { ShieldCheck, UserCheck, Search, RefreshCw, Loader2, CheckCircle2, ChevronRight, Layout, Database, Shield, ArrowRightLeft, User, Tags, X, Plus } from 'lucide-react';
import { PageHeader } from '../../design-system';
import { api } from '../../clients/api';
import { UserInfo, Role } from '../../types/types';

export const PermMgmtPage: React.FC = () => {
  const platformApi = api.domains.platform;
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [userRoles, setUserRoles] = useState<number[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [uData, rData] = await Promise.all([platformApi.auth.listUsers(), platformApi.auth.listRoles()]);
      setUsers(uData || []);
      setRoles(rData || []);
      if (uData && uData.length > 0) {
        handleUserSelect(uData[0].id);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUserSelect = async (userId: number) => {
    setSelectedUserId(userId);
    try {
      const data = await platformApi.auth.getUserRoles(userId);
      setUserRoles(data.role_ids || []);
    } catch (e) {
      console.error(e);
      setUserRoles([]);
    }
  };

  const toggleRole = (roleId: number) => {
    setUserRoles(prev =>
      prev.includes(roleId) ? prev.filter(id => id !== roleId) : [...prev, roleId]
    );
  };

  const saveAssignments = async () => {
    if (!selectedUserId) return;
    setIsSaving(true);
    try {
      await platformApi.auth.bindUserRoles(selectedUserId, userRoles);
      alert("权限分配成功应用");
      const uData = await platformApi.auth.listUsers();
      setUsers(uData || []);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredUsers = users.filter(u => u.username.toLowerCase().includes(searchTerm.toLowerCase()));
  const activeUser = users.find(u => u.id === selectedUserId);

  return (
    <div className="px-5 py-5 md:px-6 2xl:px-8 space-y-4 animate-in fade-in duration-500 pb-24 h-full overflow-hidden flex flex-col">
      <PageHeader
        title={<><div className="p-3 bg-purple-600 text-white rounded-2xl shadow-purple-500/20 inline-flex"><ArrowRightLeft size={28} /></div> 功能权限分配</>}
        actions={<div className="flex gap-4">
          <button onClick={loadInitialData} className="p-4 bg-theme-surface border border-theme-border text-theme-text-muted rounded-lg hover:bg-theme-elevated transition-all active:scale-95">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>}
      />

      <div className="flex-1 flex gap-10 min-h-0">
         {/* Left Column: User Explorer */}
         <div className="w-[400px] flex flex-col gap-6 shrink-0 min-h-0">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-theme-text-faint" size={18} />
              <input
                type="text" placeholder="检索用户列表..."
 className="form-input w-full pl-12 pr-4 text-xs"
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
 <div className="flex-1 bg-theme-surface border border-theme-border rounded-xl overflow-hidden flex flex-col min-h-0">
               <div className="px-8 py-5 border-b border-theme-border bg-slate-100/50 flex items-center justify-between">
                  <span className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest">Identities Directory</span>
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
               </div>
               <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
                  {filteredUsers.map(user => (
                    <div
                      key={user.id}
                      onClick={() => handleUserSelect(user.id)}
 className={`flex items-center justify-between p-4 rounded-xl cursor-pointer transition-all ${selectedUserId === user.id ? 'bg-purple-600 text-white shadow-purple-500/20' : 'hover:bg-theme-elevated text-theme-text-secondary'}`}
                    >
                       <div className="flex items-center gap-4 min-w-0">
 <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-semibold shadow-inner ${selectedUserId === user.id ? 'bg-theme-elevated' : 'bg-theme-elevated text-theme-text-muted'}`}>
                             {user.username[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                             <p className="text-sm font-semibold truncate">{user.username}</p>
                             <p className={`text-[9px] font-bold uppercase ${selectedUserId === user.id ? 'text-purple-200' : 'text-theme-text-muted'}`}>{user.role?.length || 0} Roles Attached</p>
                          </div>
                       </div>
                       <ChevronRight size={14} className={selectedUserId === user.id ? 'text-white' : 'text-slate-200'} />
                    </div>
                  ))}
               </div>
            </div>
         </div>

         {/* Right Column: Permission Matrix */}
         <div className="flex-1 flex flex-col gap-6 min-h-0">
 <div className="flex-1 bg-theme-surface border border-theme-border rounded-xl flex flex-col overflow-hidden min-h-0">
               <div className="p-10 border-b border-theme-border flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-6">
                     <div className="w-16 h-16 bg-purple-500/15 text-purple-400 rounded-lg flex items-center justify-center shadow-inner">
                        <Tags size={32} />
                     </div>
                     <div>
                        <h3 className="text-2xl font-bold text-theme-text-primary tracking-tight">
                           {activeUser ?`正在为 ${activeUser.username} 分配角色` : '请选择目标身份'}
                        </h3>
                     </div>
                  </div>
                  {selectedUserId && (
                    <button
                      onClick={saveAssignments}
                      disabled={isSaving}
 className="px-10 py-4 bg-purple-600 text-white rounded-lg font-medium text-sm hover:bg-purple-700 shadow-purple-500/20 transition-all flex items-center gap-3 active:scale-95 disabled:opacity-50"
                    >
                       {isSaving ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                       保存授权变更
                    </button>
                  )}
               </div>

               <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
                  {!selectedUserId ? (
                    <div className="h-full flex flex-col items-center justify-center text-theme-text-faint gap-6 opacity-30">
                       <Shield size={80} />
                       <p className="text-xl font-semibold uppercase tracking-widest">Select user from left pane</p>
                    </div>
                  ) : (
                    <div className="space-y-10">
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {roles.map(role => (
                            <div
                              key={role.id}
                              onClick={() => toggleRole(role.id)}
 className={`p-8 rounded-xl border-2 transition-all cursor-pointer group relative overflow-hidden flex flex-col justify-between min-h-[160px] ${userRoles.includes(role.id) ? 'bg-purple-500/15 border-purple-600 shadow-purple-500/5' : 'bg-theme-surface border-theme-border hover:border-purple-500/20'}`}
                            >
                               <div className="flex justify-between items-start">
                                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center font-semibold transition-all ${userRoles.includes(role.id) ? 'bg-purple-600 text-white' : 'bg-theme-surface text-theme-text-muted group-hover:bg-purple-500/15 group-hover:text-purple-400'}`}>
                                     <ShieldCheck size={24} />
                                  </div>
                                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${userRoles.includes(role.id) ? 'bg-purple-600 border-purple-600 text-white' : 'border-theme-border'}`}>
                                     {userRoles.includes(role.id) && <X size={12} strokeWidth={4} />}
                                  </div>
                               </div>
                               <div className="mt-4">
                                  <h5 className="font-semibold text-theme-text-primary uppercase tracking-tight">{role.name}</h5>
                                  <p className="text-[10px] text-theme-text-muted font-medium mt-1 leading-relaxed line-clamp-1">{role.description || 'No blueprint provided.'}</p>
                               </div>
                            </div>
                          ))}
                       </div>
                    </div>
                  )}
               </div>

               {selectedUserId && (
                 <div className="px-10 py-6 bg-theme-elevated border-t border-theme-border flex items-center gap-4">
                    <span className="text-[10px] font-medium text-theme-text-muted uppercase tracking-widest">Selected Roles:</span>
                    <div className="flex flex-wrap gap-2">
                       {userRoles.map(rid => {
                         const r = roles.find(ro => ro.id === rid);
                         return (
 <div key={rid} className="flex items-center gap-2 px-3 py-1.5 bg-theme-surface border border-purple-500/20 text-purple-400 rounded-xl text-[10px] font-medium">
                              {r?.name.toUpperCase()}
                              <button onClick={() => toggleRole(rid)} className="hover:text-red-500"><X size={12} strokeWidth={3} /></button>
                           </div>
                         );
                       })}
                       {userRoles.length === 0 && <span className="text-[10px] font-medium text-theme-text-faint uppercase italic">No permissions set</span>}
                    </div>
                 </div>
               )}
            </div>
         </div>
      </div>
    </div>
  );
};
