
import React, { useState, useEffect } from 'react';
import { Shield, Plus, Search, RefreshCw, Loader2, Trash2, Edit3, ShieldCheck, UserCheck, Activity, Users, Hash, Clock, X } from 'lucide-react';
import { api } from '../../clients/api';
import { showConfirm } from '../../components/DialogService';
import { Role } from '../../types/types';
import { Modal, DataTable, DataTableColumn } from '../../design-system';

export const RoleMgmtPage: React.FC = () => {
  const platformApi = api.domains.platform;
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '' });

  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const data = await platformApi.auth.listRoles();
      setRoles(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      if (editingRole) {
        await platformApi.auth.updateRole(editingRole.id, formData);
      } else {
        await platformApi.auth.createRole(formData);
      }
      setIsModalOpen(false);
      setEditingRole(null);
      setFormData({ name: '', description: '' });
      fetchRoles();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const filteredRoles = roles.filter(r =>
    r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columns: DataTableColumn<Role>[] = [
    {
      key: 'name',
      header: '角色标识 / ID',
      render: (role) => (
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-500/15 text-indigo-400 rounded-2xl flex items-center justify-center font-black shadow-inner group-hover:bg-indigo-600 group-hover:text-white transition-all">
            <Shield size={20} />
          </div>
          <div>
            <p className="text-sm font-black text-theme-text-primary uppercase tracking-tight">{role.name}</p>
            <p className="text-[10px] text-theme-text-muted font-mono mt-0.5">RID: {role.id.toString().padStart(4, '0')}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'description',
      header: '职责权限描述',
      render: (role) => (
        <p className="text-xs font-medium text-theme-text-muted line-clamp-1 italic max-w-[300px]">"{role.description || '未提供详细职责描述信息。'}"</p>
      ),
    },
    {
      key: 'user_count',
      header: '关联用户数',
      align: 'center',
      render: (role) => (
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-theme-elevated text-theme-text-secondary rounded-full text-[10px] font-black border border-theme-border">
          <Users size={12} /> {(role as any).user_ids?.length || 0}
        </div>
      ),
    },
    {
      key: 'updated_at',
      header: '最近更新',
      render: (role) => (
        <div className="flex items-center gap-2 text-[10px] font-bold text-theme-text-muted uppercase">
          <Clock size={12} /> {role.updated_at?.split('T')[0] || '2024-01-01'}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '操作',
      align: 'right',
      render: (role) => (
        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
          <button
            onClick={() => { setEditingRole(role); setFormData({ name: role.name, description: role.description }); setIsModalOpen(true); }}
            className="p-3 bg-theme-bg-app border border-theme-border text-theme-text-muted hover:text-indigo-400 rounded-xl transition-all"
            title="编辑角色"
          >
            <Edit3 size={16} />
          </button>
          <button
            onClick={() => void handleDeleteRole(role)}
            className="p-3 bg-red-500/15 text-red-400 border border-transparent hover:border-red-500/20 rounded-xl transition-all"
            title="彻底删除"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  const handleDeleteRole = async (role: Role) => {
    const confirmed = await showConfirm({
      title: '删除角色定义',
      message: '确认彻底删除该角色定义？所有关联此角色的用户将失去相应权限。',
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    await platformApi.auth.deleteRole(role.id);
    await fetchRoles();
  };

  return (
    <div className="p-10 space-y-8 animate-in fade-in duration-500 pb-24 h-full overflow-y-auto custom-scrollbar">
      <div className="flex justify-between items-end">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
 <div className="p-3 bg-indigo-600 text-white rounded-[1.25rem] shadow-indigo-500/20">
               <Shield size={28} />
             </div>
             <div>
               <h2 className="text-3xl font-black text-theme-text-primary tracking-tight">角色定义管理</h2>
             </div>
          </div>
        </div>
        <div className="flex gap-4">
 <button onClick={fetchRoles} className="p-4 bg-theme-bg-app border border-theme-border text-theme-text-muted rounded-2xl hover:bg-theme-elevated transition-all active:scale-95">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
 <button onClick={() => { setEditingRole(null); setFormData({ name: '', description: '' }); setIsModalOpen(true); }} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 shadow-indigo-500/20 hover:bg-indigo-700 transition-all active:scale-95">
            <Plus size={20} /> 定义新角色
          </button>
        </div>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
 <div className="bg-theme-surface p-8 rounded-[3rem] text-white flex flex-col justify-between group overflow-hidden relative">
           <ShieldCheck className="absolute right-[-20px] top-[-20px] w-32 h-32 opacity-10 rotate-12 group-hover:rotate-0 transition-transform duration-700" />
           <p className="text-theme-text-muted text-[10px] font-black uppercase tracking-widest relative z-10">已定义角色</p>
           <h3 className="text-5xl font-black mt-4 relative z-10">{roles.length}</h3>
        </div>
 <div className="bg-theme-bg-app p-8 rounded-[3rem] border border-theme-border col-span-3 flex items-center gap-8">
           <div className="w-16 h-16 bg-indigo-500/15 text-indigo-400 rounded-3xl flex items-center justify-center shrink-0">
             <Activity size={32} />
           </div>
           <div>
             <h4 className="text-lg font-black text-theme-text-primary">RBAC 模型说明</h4>
             <p className="text-sm text-theme-text-muted mt-1 font-medium leading-relaxed">
               角色是权限的逻辑集合。通过为用户分配不同的角色，您可以实现基于职能的安全访问控制。角色定义支持多级继承与职责分离（SoD）原则。
             </p>
           </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="relative group">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-theme-text-faint group-focus-within:text-indigo-500 transition-colors" size={20} />
          <input
            type="text" placeholder="搜索角色名称或职责描述..."
 className="w-full pl-16 pr-8 py-5 bg-theme-bg-app border border-theme-border rounded-[2.5rem] text-sm outline-none focus:ring-4 ring-indigo-500/5 transition-all font-medium"
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        <DataTable
            columns={columns}
            data={filteredRoles}
            rowKey={role => String(role.id)}
            loading={loading && roles.length === 0}
            empty={
              <div className="py-40 text-center">
                <div className="w-20 h-20 bg-theme-bg-app rounded-full flex items-center justify-center mx-auto mb-4 text-slate-200">
                  <ShieldCheck size={40} />
                </div>
                <p className="text-sm font-black text-theme-text-muted uppercase tracking-widest">目前暂无匹配的角色定义</p>
              </div>
            }
            minWidth={800}
          />
      </div>

      {/* Create/Edit Modal */}
      <Modal open={isModalOpen} onClose={() => setIsModalOpen(false)} className="max-w-md">
              <div className="p-10 pb-4 border-b border-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-4">
 <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-indigo-500/20">
                    {editingRole ? <Edit3 size={24} /> : <Plus size={24} />}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-theme-text-primary">{editingRole ? '更新角色定义' : '定义新角色'}</h3>
                    <p className="text-[10px] text-theme-text-muted font-bold uppercase mt-0.5">RBAC Blueprinting</p>
                  </div>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-3 text-theme-text-faint hover:text-theme-text-secondary"><X size={28} /></button>
              </div>
              <form onSubmit={handleSubmit} className="p-10 space-y-6">
                 <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-theme-text-muted uppercase tracking-widest ml-1">角色标识名称 *</label>
                    <input
                      required placeholder="e.g. security_auditor"
                      className="w-full px-6 py-4 bg-theme-bg-app rounded-2xl border-none outline-none focus:ring-4 ring-indigo-500/10 font-bold text-theme-text-primary"
                      value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                    />
                 </div>
                 <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-theme-text-muted uppercase tracking-widest ml-1">权限职责描述</label>
                    <textarea
                      rows={3} placeholder="描述该角色所涵盖的功能边界与操作权限..."
                      className="w-full px-6 py-4 bg-theme-bg-app rounded-2xl border-none outline-none focus:ring-4 ring-indigo-500/10 font-bold text-theme-text-primary resize-none"
                      value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}
                    />
                 </div>
                 <div className="flex gap-4">
                    <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-5 bg-theme-elevated text-theme-text-secondary rounded-2xl font-black hover:bg-theme-elevated transition-all">取消</button>
 <button disabled={formLoading} className="flex-1 py-5 bg-indigo-600 text-white rounded-2xl font-black shadow-indigo-500/20 hover:bg-indigo-700 transition-all flex items-center justify-center gap-3">
                       {formLoading ? <Loader2 className="animate-spin" size={20} /> : <UserCheck size={20} />}
                       {editingRole ? '应用更改' : '立即定义'}
                    </button>
                 </div>
              </form>
      </Modal>
    </div>
  );
};
