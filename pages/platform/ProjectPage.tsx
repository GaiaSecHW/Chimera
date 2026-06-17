import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Edit3, FolderOpen, Globe, Loader2, Lock, Plus, RefreshCw, Search, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../../clients/api';
import { UserPermissionInfo } from '../../clients/org';
import { showConfirm } from '../../components/DialogService';
import { Department, Project } from '../../types/types';

export const ProjectPage: React.FC = () => {
  const platformApi = api.domains.platform;
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
    void refreshPageData();
  }, []);

  const manageableDepartmentIds = userPermissions?.manageable_department_ids || [];
  const isOrdinaryAdmin = userPermissions?.platform_role === 'ordinary_admin';
  const canManageOrgProjects = !!userPermissions?.can_manage_org_projects;

  const canManageProject = (project: Project): boolean => {
    if (typeof project.can_manage === 'boolean') {
      return project.can_manage;
    }

    if (!userPermissions?.can_manage_org_projects) return false;
    if (userPermissions.is_admin) return true;
    if (!project.org_id) return false;

    const boundDepartmentIds = (project.departments || [])
      .map((dept) => Number(dept.id))
      .filter((deptId) => Number.isFinite(deptId));

    if (boundDepartmentIds.length > 0) {
      return boundDepartmentIds.every((deptId) => manageableDepartmentIds.includes(deptId));
    }

    const ownerDeptId = project.owner_department_id;
    return !!ownerDeptId && manageableDepartmentIds.includes(ownerDeptId);
  };

  const refreshPageData = async () => {
    setLoading(true);
    try {
      const [projectData, departmentData, permissionData] = await Promise.all([
        platformApi.org.listUserDepartmentProjects(),
        platformApi.org.listDepartments(),
        platformApi.org.getUserPermissions(),
      ]);
      setProjects(projectData.projects || []);
      setDepartments(departmentData || []);
      setUserPermissions(permissionData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const data = await platformApi.org.listUserDepartmentProjects();
      setProjects(data.projects || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
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
      await platformApi.org.createProject({
        name: formData.name,
        description: formData.description,
        is_public: formData.is_public,
        department_ids: formData.department_ids,
      });
      setIsCreateModalOpen(false);
      setFormData({ name: '', description: '', is_public: false, department_ids: [] });
      await fetchProjects();
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
      await platformApi.org.updateProject(
        selectedProject.project_space_id || selectedProject.id,
        {
          name: formData.name,
          description: formData.description,
          is_public: formData.is_public,
        },
        selectedProject.org_id || undefined,
      );
      setIsEditModalOpen(false);
      setSelectedProject(null);
      setFormData({ name: '', description: '', is_public: false, department_ids: [] });
      await fetchProjects();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (project: Project) => {
    const confirmed = await showConfirm({
      title: '删除项目',
      message:`确认删除该项目"${project.name}"？`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await platformApi.org.deleteProject(project.project_space_id || project.id, project.org_id || undefined);
      await fetchProjects();
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
      department_ids: [],
    });
    setIsEditModalOpen(true);
  };

  const filteredProjects = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return projects;
    return projects.filter((project) => {
      const haystacks = [
        project.name,
        project.description || '',
        project.department_name || '',
        project.owner_department_name || '',
      ];
      return haystacks.some((value) => value.toLowerCase().includes(keyword));
    });
  }, [projects, searchTerm]);

  const projectStats = useMemo(() => {
    const total = projects.length;
    const publicCount = projects.filter((project) => project.is_public).length;
    const privateCount = total - publicCount;
    const boundCount = projects.filter((project) => (project.departments || []).length > 0).length;
    return { total, publicCount, privateCount, boundCount };
  }, [projects]);

  const selectableDepartments = useMemo(() => {
    if (!isOrdinaryAdmin) return departments;
    const manageableSet = new Set(manageableDepartmentIds);
    return departments.filter((department) => manageableSet.has(department.id));
  }, [departments, isOrdinaryAdmin, manageableDepartmentIds]);

  const publicRatio = projectStats.total > 0 ? (projectStats.publicCount / projectStats.total) * 100 : 0;
  const privateRatio = projectStats.total > 0 ? (projectStats.privateCount / projectStats.total) * 100 : 0;

  return (
    <div className="p-10 space-y-8 animate-in fade-in duration-500 pb-24 h-full overflow-y-auto bg-theme-app">
      <div className="flex justify-between items-end">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
 <div className="p-3 bg-gradient-to-br from-blue-600 via-cyan-500 to-sky-500 text-white rounded-2xl">
              <FolderOpen size={28} />
            </div>
            <div>
              <h2 className="text-3xl font-black text-theme-text-primary tracking-tight">项目权限管理</h2>
            </div>
          </div>
        </div>
        <div className="flex gap-4">
 <button onClick={() => void refreshPageData()} className="p-4 bg-theme-bg-app backdrop-blur border border-theme-border text-theme-text-muted rounded-2xl hover:bg-theme-bg-app transition-all active:scale-95">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
          {canManageOrgProjects && (
            <button
              onClick={() => {
                setFormData({ name: '', description: '', is_public: false, department_ids: [] });
                setIsCreateModalOpen(true);
              }}
 className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 hover:bg-blue-700 transition-all active:scale-95"
            >
              <Plus size={20} /> 创建新项目
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
 <div className="bg-[linear-gradient(135deg,_#0f172a,_#1d4ed8_65%,_#38bdf8)] p-8 rounded-[3rem] text-white flex flex-col justify-between group overflow-hidden relative">
          <FolderOpen className="absolute right-[-20px] top-[-20px] w-32 h-32 opacity-5 rotate-12 group-hover:rotate-0 transition-transform duration-700" />
          <p className="text-slate-200 text-[10px] font-black uppercase tracking-widest relative z-10">总项目数</p>
          <h3 className="text-5xl font-black mt-4 relative z-10">{projectStats.total}</h3>
          <p className="text-sky-100 text-[10px] font-black uppercase mt-4 relative z-10 flex items-center gap-2">
            <Sparkles size={12} /> Unified Access View
          </p>
        </div>
 <div className="bg-theme-bg-app backdrop-blur p-8 rounded-[3rem] border border-emerald-500/20 flex flex-col justify-between">
          <p className="text-theme-text-muted text-[10px] font-black uppercase tracking-widest">公开项目</p>
          <h3 className="text-4xl font-black mt-4 text-green-400">{projectStats.publicCount}</h3>
          <div className="h-1 bg-theme-elevated rounded-full mt-4 overflow-hidden">
            <div className="h-full bg-green-500" style={{ width: `${publicRatio}%` }} />
          </div>
        </div>
 <div className="bg-theme-bg-app backdrop-blur p-8 rounded-[3rem] border border-amber-500/20 flex flex-col justify-between">
          <p className="text-theme-text-muted text-[10px] font-black uppercase tracking-widest">私有项目</p>
          <h3 className="text-4xl font-black mt-4 text-amber-400">{projectStats.privateCount}</h3>
          <div className="h-1 bg-theme-elevated rounded-full mt-4 overflow-hidden">
            <div className="h-full bg-amber-500" style={{ width: `${privateRatio}%` }} />
          </div>
        </div>
 <div className="bg-theme-bg-app backdrop-blur p-8 rounded-[3rem] border border-theme-border flex items-center gap-8">
          <div className="w-16 h-16 bg-cyan-500/15 text-cyan-400 rounded-3xl flex items-center justify-center shrink-0">
            <ShieldCheck size={32} />
          </div>
          <div>
            <h4 className="text-lg font-black text-theme-text-primary">组织绑定视图</h4>
            <p className="text-sm text-theme-text-muted mt-1 font-medium">已绑定部门的项目 {projectStats.boundCount} 个，私有项目仅对绑定部门成员可见。</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-theme-text-faint" size={20} />
          <input
            type="text"
            placeholder="搜索项目名称、部门或描述..."
 className="w-full pl-16 pr-8 py-5 bg-theme-bg-app backdrop-blur border border-theme-border rounded-[2.5rem] text-sm outline-none focus:ring-4 ring-blue-500/5 transition-all font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

 <div className="bg-theme-bg-app backdrop-blur border border-theme-border rounded-[3rem] overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-100/50 border-b border-theme-border font-black text-[10px] text-theme-text-muted uppercase tracking-widest">
              <tr>
                <th className="px-8 py-6">项目信息</th>
                <th className="px-6 py-6">部门范围</th>
                <th className="px-6 py-6 text-center">类型</th>
                <th className="px-6 py-6">创建时间</th>
                <th className="px-8 py-6 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={5} className="py-32 text-center"><Loader2 className="animate-spin mx-auto text-blue-400" size={40} /></td></tr>
              ) : filteredProjects.length === 0 ? (
                <tr><td colSpan={5} className="py-32 text-center text-theme-text-muted font-bold">暂无项目数据</td></tr>
              ) : filteredProjects.map((project) => (
                <tr key={project.id} className="hover:bg-theme-elevated transition-all group">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black shadow-inner ${project.is_public ? 'bg-emerald-500/15 text-emerald-400' : 'bg-blue-500/15 text-blue-400'}`}>
                        <FolderOpen size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-black text-theme-text-primary">{project.name}</p>
                        <p className="text-[10px] text-theme-text-muted font-mono mt-0.5">{project.description || '无描述'}</p>
                        {project.owner_department_name && (
                          <p className="mt-2 text-[10px] font-bold text-theme-text-muted flex items-center gap-1.5">
                            <Building2 size={12} />
                            归属部门: {project.owner_department_name}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-6">
                    <div className="flex flex-wrap gap-2">
                      {(project.departments || []).length > 0 ? (
                        (project.departments || []).map((department) => (
                          <span key={`${project.id}-${department.id}`} className="inline-flex items-center rounded-full border border-blue-500/20 bg-blue-500/15 px-3 py-1 text-[10px] font-black text-blue-400">
                            {department.name}
                          </span>
                        ))
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-theme-border bg-theme-bg-app px-3 py-1 text-[10px] font-black text-theme-text-muted">
                          {project.is_public ? '全员可访问' : '未绑定'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-6 text-center">
                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase border transition-all ${
                      project.is_public
                        ? 'bg-green-500/15 text-green-400 border-green-500/20'
                        : 'bg-amber-500/15 text-amber-400 border-amber-500/20'
                    }`}>
                      {project.is_public ? '公开' : '私有'}
                    </span>
                  </td>
                  <td className="px-6 py-6 text-xs font-bold text-theme-text-muted">
                    {project.created_at?.split('T')[0] || '2024-01-01'}
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      {canManageProject(project) ? (
                        <>
                          <button
                            onClick={() => openEditModal(project)}
 className="p-3 bg-theme-bg-app border border-theme-border text-theme-text-muted hover:text-blue-400 rounded-xl transition-all"
                            title="编辑项目"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            onClick={() => void handleDelete(project)}
 className="p-3 bg-red-500/15 text-red-400 border border-transparent hover:border-red-500/20 rounded-xl transition-all"
                            title="删除项目"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      ) : (
                        <span className="text-[10px] text-theme-text-faint font-medium px-3 py-1.5 bg-theme-bg-app rounded-full">只读</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
 <div className="bg-theme-bg-app w-full max-w-md rounded-[3rem] overflow-hidden animate-in zoom-in-95">
            <div className="p-10 pb-4 border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-4">
 <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white">
                  <Plus size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-theme-text-primary">创建新项目</h3>
                  <p className="text-[10px] text-theme-text-muted font-bold uppercase mt-0.5">Create Project</p>
                </div>
              </div>
              <button onClick={() => setIsCreateModalOpen(false)} className="p-3 text-theme-text-faint hover:text-theme-text-secondary">
                <X size={28} />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-10 space-y-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-theme-text-muted uppercase tracking-widest ml-1">项目名称 *</label>
                <input
                  required
                  placeholder="Project Name"
                  className="w-full px-6 py-4 bg-theme-bg-app rounded-2xl border-none outline-none focus:ring-4 ring-blue-500/10 font-bold text-theme-text-primary"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-theme-text-muted uppercase tracking-widest ml-1">项目描述</label>
                <textarea
                  placeholder="Description"
                  rows={3}
                  className="w-full px-6 py-4 bg-theme-bg-app rounded-2xl border-none outline-none focus:ring-4 ring-blue-500/10 font-bold text-theme-text-primary resize-none"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-theme-text-muted uppercase tracking-widest ml-1">项目类型 *</label>
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
 ? 'bg-green-600 text-white shadow-green-500/20'
                        : 'bg-theme-elevated text-theme-text-muted'
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
 ? 'bg-amber-600 text-white shadow-amber-500/20'
                        : 'bg-theme-elevated text-theme-text-muted'
                    }`}
                  >
                    <Lock size={20} className="mx-auto mb-2" />
                    私有项目
                  </button>
                </div>
              </div>
              {!formData.is_public && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-theme-text-muted uppercase tracking-widest ml-1">绑定部门（多选）</label>
                  <div className="max-h-40 overflow-y-auto bg-theme-bg-app rounded-2xl p-4 space-y-2">
                    {selectableDepartments.map((dept) => (
                      <label key={dept.id} className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.department_ids.includes(dept.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData({ ...formData, department_ids: [...formData.department_ids, dept.id] });
                            } else {
                              setFormData({ ...formData, department_ids: formData.department_ids.filter((id) => id !== dept.id) });
                            }
                          }}
                          className="w-4 h-4 rounded"
                        />
                        <span className="text-sm font-bold text-theme-text-secondary">{dept.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {isOrdinaryAdmin && (
                <p className="text-xs text-theme-text-muted font-semibold">
                  普通管理员只能选择所属部门及下级部门，公开项目仅支持超级管理员创建。
                </p>
              )}
 <button disabled={formLoading} className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black hover:bg-blue-700 transition-all flex items-center justify-center gap-3">
                {formLoading ? <Loader2 className="animate-spin" size={20} /> : <FolderOpen size={20} />}
                确认创建项目
              </button>
            </form>
          </div>
        </div>
      )}

      {isEditModalOpen && selectedProject && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
 <div className="bg-theme-bg-app w-full max-w-md rounded-[3rem] overflow-hidden animate-in zoom-in-95">
            <div className="p-10 pb-4 border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-600 rounded-2xl flex items-center justify-center text-white">
                  <Edit3 size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-theme-text-primary tracking-tight">编辑项目: {selectedProject.name}</h3>
                  <p className="text-[10px] text-theme-text-muted font-bold uppercase mt-0.5">Edit Project</p>
                </div>
              </div>
              <button onClick={() => setIsEditModalOpen(false)} className="p-3 text-theme-text-faint hover:text-theme-text-secondary">
                <X size={28} />
              </button>
            </div>
            <form onSubmit={handleEdit} className="p-10 space-y-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-theme-text-muted uppercase tracking-widest ml-1">项目名称 *</label>
                <input
                  required
                  placeholder="Project Name"
                  className="w-full px-6 py-4 bg-theme-bg-app rounded-2xl border-none outline-none focus:ring-4 ring-amber-500/10 font-bold text-theme-text-primary"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-theme-text-muted uppercase tracking-widest ml-1">项目描述</label>
                <textarea
                  placeholder="Description"
                  rows={3}
                  className="w-full px-6 py-4 bg-theme-bg-app rounded-2xl border-none outline-none focus:ring-4 ring-amber-500/10 font-bold text-theme-text-primary resize-none"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-theme-text-muted uppercase tracking-widest ml-1">项目类型 *</label>
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
 ? 'bg-green-600 text-white shadow-green-500/20'
                        : 'bg-theme-elevated text-theme-text-muted'
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
 ? 'bg-amber-600 text-white shadow-amber-500/20'
                        : 'bg-theme-elevated text-theme-text-muted'
                    }`}
                  >
                    <Lock size={20} className="mx-auto mb-2" />
                    私有项目
                  </button>
                </div>
              </div>
              {isOrdinaryAdmin && (
                <p className="text-xs text-theme-text-muted font-semibold">
                  普通管理员不能将项目调整为公开项目，只能维护本部门树内已绑定的组织项目记录。
                </p>
              )}
 <button disabled={formLoading} className="w-full py-5 bg-amber-600 text-white rounded-2xl font-black shadow-amber-500/20 hover:bg-amber-700 transition-all flex items-center justify-center gap-3">
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
