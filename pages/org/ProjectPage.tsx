
import React, { useState, useEffect } from 'react';
import { FolderOpen, Plus, Search, RefreshCw, Loader2, Trash2, Edit3, Globe, Lock } from 'lucide-react';
import { orgApi, UserPermissionInfo } from '../../clients/org';
import { showConfirm } from '../../components/DialogService';
import { Project, Department } from '../../types/types';

export const ProjectPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [userPermissions, setUserPermissions] = useState<UserPermissionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '', is_public: false, department_ids: [] as number[] });

  useEffect(() => {
    fetchProjects();
    fetchDepartments();
    fetchUserPermissions();
  }, []);

  const manageableDepartmentIds = userPermissions?.manageable_department_ids || [];
  const isOrdinaryAdmin = userPermissions?.platform_role === 'ordinary_admin';
  const canManageOrgProjects = !!userPermissions?.can_manage_org_projects;

  const fetchUserPermissions = async () => {
    try {
      const data = await orgApi.getUserPermissions();
      setUserPermissions(data);
    } catch (e) {
      console.error('获取用户权限失败:', e);
    }
  };

  // 检查用户是否可以编辑/删除项目
  const canManageProject = (project: Project): boolean => {
    if (typeof project.can_manage === 'boolean') {
      return project.can_manage;
    }

    if (!userPermissions || !userPermissions.can_manage_org_projects) return false;

    // admin用户可以管理所有项目
    if (userPermissions.is_admin) return true;

    if (!project.org_id) {
      return false;
    }

    const boundDepartmentIds = (project.departments || [])
      .map(dept => Number(dept.id))
      .filter(deptId => Number.isFinite(deptId));

    if (boundDepartmentIds.length > 0) {
      return boundDepartmentIds.every(deptId => manageableDepartmentIds.includes(deptId));
    }

    const ownerDeptId = project.owner_department_id;
    if (ownerDeptId && manageableDepartmentIds.includes(ownerDeptId)) {
      return true;
    }

    return false;
  };

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const data = await orgApi.listUserDepartmentProjects();
      const enrichedProjects = await Promise.all(
        (data.projects || []).map(async project => {
          try {
            const orgProject = await orgApi.getOrgProjectByName(project.name);
            if (!orgProject) {
              return project;
            }

            const orgId = typeof orgProject.id === 'number' ? orgProject.id : Number(orgProject.id);
            return {
              ...project,
              org_id: Number.isFinite(orgId) ? orgId : undefined,
              departments: orgProject.departments?.length ? orgProject.departments : project.departments,
            };
          } catch (error) {
            console.error(`获取项目 ${project.name} 的组织架构信息失败:`, error);
            return project;
          }
        })
      );
      setProjects(enrichedProjects);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      const data = await orgApi.listDepartments();
      setDepartments(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageOrgProjects) {
      alert('当前账号没有项目权限管理权限');
      return;
    }
    if (isOrdinaryAdmin && formData.is_public) {
      alert('普通管理员只能创建绑定所属部门及下级部门的私有项目');
      return;
    }
    if (isOrdinaryAdmin && formData.department_ids.length === 0) {
      alert('普通管理员必须为项目绑定所属部门或下级部门');
      return;
    }
    setFormLoading(true);
    try {
      await orgApi.createProject({
        name: formData.name,
        description: formData.description,
        is_public: formData.is_public,
        department_ids: formData.department_ids
      });
      setIsCreateModalOpen(false);
      setFormData({ name: '', description: '', is_public: false, department_ids: [] });
      fetchProjects();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject) return;

    setFormLoading(true);
    try {
      // 使用项目空间ID更新项目
      // 如果有组织架构ID，则同时更新组织架构系统；否则只更新项目空间
      await orgApi.updateProject(
        selectedProject.project_space_id || selectedProject.id,
        {
          name: formData.name,
          description: formData.description,
          is_public: formData.is_public
        },
        selectedProject.org_id || undefined
      );
      setIsEditModalOpen(false);
      setSelectedProject(null);
      setFormData({ name: '', description: '', is_public: false, department_ids: [] });
      fetchProjects();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (project: Project) => {
    const confirmed = await showConfirm({
      title: '删除项目',
      message: `确认删除该项目 "${project.name}"？`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await orgApi.deleteProject(
        project.project_space_id || project.id,
        project.org_id || undefined
      );
      fetchProjects();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const openEditModal = (project: Project) => {
    if (isOrdinaryAdmin && !project.org_id) {
      alert('该项目未绑定到当前可管理的组织部门范围，无法由普通管理员修改');
      return;
    }
    setSelectedProject(project);
    setFormData({
      name: project.name,
      description: project.description || '',
      is_public: project.is_public,
      department_ids: []
    });
    setIsEditModalOpen(true);
  };

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-10 space-y-8 animate-in fade-in duration-500 pb-24 h-full overflow-y-auto">
      <div className="flex justify-between items-end">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-xl shadow-blue-500/20">
              <FolderOpen size={28} />
            </div>
            <div>
              <h2 className="text-3xl font-black text-slate-800 tracking-tight">项目权限管理</h2>
              <p className="text-slate-500 font-medium mt-1 uppercase tracking-widest text-[10px]">Project Permission Management</p>
            </div>
          </div>
        </div>
        <div className="flex gap-4">
          <button onClick={fetchProjects} className="p-4 bg-white border border-slate-200 text-slate-500 rounded-2xl hover:bg-slate-50 transition-all shadow-sm active:scale-95">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
          {canManageOrgProjects && (
            <button
              onClick={() => {
                setFormData({ name: '', description: '', is_public: false, department_ids: [] });
                setIsCreateModalOpen(true);
              }}
              className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all active:scale-95"
            >
              <Plus size={20} /> 创建新项目
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-slate-900 p-8 rounded-[3rem] text-white flex flex-col justify-between group overflow-hidden relative shadow-2xl">
          <FolderOpen className="absolute right-[-20px] top-[-20px] w-32 h-32 opacity-5 rotate-12 group-hover:rotate-0 transition-transform duration-700" />
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest relative z-10">总项目数</p>
          <h3 className="text-5xl font-black mt-4 relative z-10">{projects.length}</h3>
          <p className="text-blue-400 text-[10px] font-black uppercase mt-4 relative z-10 flex items-center gap-2">
            <FolderOpen size={12} /> Project Access Control
          </p>
        </div>
        <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">公开项目</p>
          <h3 className="text-4xl font-black mt-4 text-green-600">{projects.filter(p => p.is_public).length}</h3>
          <div className="h-1 bg-slate-100 rounded-full mt-4 overflow-hidden">
            <div className="h-full bg-green-500" style={{ width: `${(projects.filter(p => p.is_public).length / projects.length) * 100}%` }} />
          </div>
        </div>
        <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">私有项目</p>
          <h3 className="text-4xl font-black mt-4 text-amber-600">{projects.filter(p => !p.is_public).length}</h3>
          <div className="h-1 bg-slate-100 rounded-full mt-4 overflow-hidden">
            <div className="h-full bg-amber-500" style={{ width: `${(projects.filter(p => !p.is_public).length / projects.length) * 100}%` }} />
          </div>
        </div>
        <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm flex items-center gap-8">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center shrink-0">
            <Lock size={32} />
          </div>
          <div>
            <h4 className="text-lg font-black text-slate-800">权限控制</h4>
            <p className="text-sm text-slate-400 mt-1 font-medium">私有项目仅对绑定部门的成员可见。</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
          <input
            type="text" placeholder="搜索项目名称..."
            className="w-full pl-16 pr-8 py-5 bg-white border border-slate-200 rounded-[2.5rem] text-sm outline-none focus:ring-4 ring-blue-500/5 transition-all font-medium shadow-sm"
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="bg-white border border-slate-200 rounded-[3rem] shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 border-b border-slate-100 font-black text-[10px] text-slate-400 uppercase tracking-widest">
              <tr>
                <th className="px-8 py-6">项目信息</th>
                <th className="px-6 py-6 text-center">类型</th>
                <th className="px-6 py-6">创建时间</th>
                <th className="px-8 py-6 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={4} className="py-32 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" size={40} /></td></tr>
              ) : filteredProjects.length === 0 ? (
                <tr><td colSpan={4} className="py-32 text-center text-slate-400 font-bold">暂无项目数据</td></tr>
              ) : filteredProjects.map(project => (
                <tr key={project.id} className="hover:bg-slate-50 transition-all group">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-black shadow-inner">
                        <FolderOpen size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-800">{project.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">{project.description || '无描述'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-6 text-center">
                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase border transition-all ${
                      project.is_public
                        ? 'bg-green-50 text-green-600 border-green-100'
                        : 'bg-amber-50 text-amber-600 border-amber-100'
                    }`}>
                      {project.is_public ? '公开' : '私有'}
                    </span>
                  </td>
                  <td className="px-6 py-6 text-xs font-bold text-slate-500">
                    {project.created_at?.split('T')[0] || '2024-01-01'}
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      {canManageProject(project) ? (
                        <>
                          <button
                            onClick={() => openEditModal(project)}
                            className="p-3 bg-white border border-slate-200 text-slate-400 hover:text-blue-600 rounded-xl transition-all shadow-sm"
                            title="编辑项目"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(project)}
                            className="p-3 bg-red-50 text-red-400 border border-transparent hover:border-red-100 rounded-xl transition-all shadow-sm"
                            title="删除项目"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      ) : (
                        <span className="text-[10px] text-slate-300 font-medium px-3 py-1.5 bg-slate-50 rounded-full">只读</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Project Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-10 pb-4 border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                  <Plus size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800">创建新项目</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Create Project</p>
                </div>
              </div>
              <button onClick={() => setIsCreateModalOpen(false)} className="p-3 text-slate-300 hover:text-slate-600">
                <X size={28} />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-10 space-y-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">项目名称 *</label>
                <input
                  required placeholder="Project Name"
                  className="w-full px-6 py-4 bg-slate-50 rounded-2xl border-none outline-none focus:ring-4 ring-blue-500/10 font-bold text-slate-800"
                  value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">项目描述</label>
                <textarea
                  placeholder="Description"
                  rows={3}
                  className="w-full px-6 py-4 bg-slate-50 rounded-2xl border-none outline-none focus:ring-4 ring-blue-500/10 font-bold text-slate-800 resize-none"
                  value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">项目类型 *</label>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      if (!isOrdinaryAdmin) {
                        setFormData({ ...formData, is_public: true });
                      }
                    }}
                    disabled={isOrdinaryAdmin}
                    className={`flex-1 py-4 rounded-2xl font-black transition-all ${
                      formData.is_public 
                        ? 'bg-green-600 text-white shadow-lg shadow-green-500/20' 
                        : 'bg-slate-100 text-slate-400'
                    } ${isOrdinaryAdmin ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    <Globe size={20} className="mx-auto mb-2" />
                    公开项目
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, is_public: false })}
                    className={`flex-1 py-4 rounded-2xl font-black transition-all ${
                      !formData.is_public 
                        ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20' 
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    <Lock size={20} className="mx-auto mb-2" />
                    私有项目
                  </button>
                </div>
              </div>
              {!formData.is_public && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">绑定部门（多选）</label>
                  <div className="max-h-40 overflow-y-auto bg-slate-50 rounded-2xl p-4 space-y-2">
                    {departments.map(dept => (
                      <label key={dept.id} className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.department_ids.includes(dept.id)}
                          onChange={e => {
                            if (e.target.checked) {
                              setFormData({ ...formData, department_ids: [...formData.department_ids, dept.id] });
                            } else {
                              setFormData({ ...formData, department_ids: formData.department_ids.filter(id => id !== dept.id) });
                            }
                          }}
                          className="w-4 h-4 rounded"
                        />
                        <span className="text-sm font-bold text-slate-700">{dept.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {isOrdinaryAdmin && (
                <p className="text-xs text-slate-400 font-semibold">
                  普通管理员只能选择所属部门及下级部门，公开项目仅支持超级管理员创建。
                </p>
              )}
              <button disabled={formLoading} className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all flex items-center justify-center gap-3">
                {formLoading ? <Loader2 className="animate-spin" size={20} /> : <FolderOpen size={20} />}
                确认创建项目
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Project Modal */}
      {isEditModalOpen && selectedProject && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-10 pb-4 border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-600 rounded-2xl flex items-center justify-center text-white">
                  <Edit3 size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">编辑项目: {selectedProject.name}</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Edit Project</p>
                </div>
              </div>
              <button onClick={() => setIsEditModalOpen(false)} className="p-3 text-slate-300 hover:text-slate-600">
                <X size={28} />
              </button>
            </div>
            <form onSubmit={handleEdit} className="p-10 space-y-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">项目名称 *</label>
                <input
                  required placeholder="Project Name"
                  className="w-full px-6 py-4 bg-slate-50 rounded-2xl border-none outline-none focus:ring-4 ring-amber-500/10 font-bold text-slate-800"
                  value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">项目描述</label>
                <textarea
                  placeholder="Description"
                  rows={3}
                  className="w-full px-6 py-4 bg-slate-50 rounded-2xl border-none outline-none focus:ring-4 ring-amber-500/10 font-bold text-slate-800 resize-none"
                  value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">项目类型 *</label>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      if (!isOrdinaryAdmin) {
                        setFormData({ ...formData, is_public: true });
                      }
                    }}
                    disabled={isOrdinaryAdmin}
                    className={`flex-1 py-4 rounded-2xl font-black transition-all ${
                      formData.is_public 
                        ? 'bg-green-600 text-white shadow-lg shadow-green-500/20' 
                        : 'bg-slate-100 text-slate-400'
                    } ${isOrdinaryAdmin ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    <Globe size={20} className="mx-auto mb-2" />
                    公开项目
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, is_public: false })}
                    className={`flex-1 py-4 rounded-2xl font-black transition-all ${
                      !formData.is_public 
                        ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20' 
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    <Lock size={20} className="mx-auto mb-2" />
                    私有项目
                  </button>
                </div>
              </div>
              {isOrdinaryAdmin && (
                <p className="text-xs text-slate-400 font-semibold">
                  普通管理员不能将项目调整为公开项目，只能维护本部门树内已绑定的组织项目记录。
                </p>
              )}
              <button disabled={formLoading} className="w-full py-5 bg-amber-600 text-white rounded-2xl font-black shadow-xl shadow-amber-500/20 hover:bg-amber-700 transition-all flex items-center justify-center gap-3">
                {formLoading ? <Loader2 className="animate-spin" size={20} /> : <RefreshCw size={20} />}
                立即更新项目
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

const X = ({ size, className }: any) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
);
