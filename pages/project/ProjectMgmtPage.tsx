import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle2,
  CheckSquare,
  Edit3,
  FileText,
  Globe,
  Layers,
  Loader2,
  Lock,
  Package,
  Plus,
  RefreshCw,
  Search,
  Square,
  Trash2,
  User,
  GitBranch,
} from 'lucide-react';
import { api } from '../../clients/api';
import { orgApi, UserPermissionInfo } from '../../clients/org';
import { Department, ProductTreeNode, ProductVersionNode, SecurityProject } from '../../types/types';
import { StatusBadge } from '../../components/StatusBadge';

interface ProjectMgmtPageProps {
  projects: SecurityProject[];
  setActiveProjectId: (id: string) => void;
  setCurrentView: (view: string) => void;
  refreshProjects: (showRefresh?: boolean) => Promise<void>;
}

interface ProjectFormState {
  name: string;
  description: string;
  is_public: boolean;
  department_id: string;
  product_version_id: string;
}

const EMPTY_FORM: ProjectFormState = {
  name: '',
  description: '',
  is_public: false,
  department_id: '',
  product_version_id: '',
};

export const ProjectMgmtPage: React.FC<ProjectMgmtPageProps> = ({
  projects,
  setActiveProjectId,
  setCurrentView,
  refreshProjects,
}) => {
  const projectApi = api.domains.project;
  const [searchTerm, setSearchTerm] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState<{ show: boolean; ids: string[] }>({ show: false, ids: [] });
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<SecurityProject | null>(null);
  const [newProject, setNewProject] = useState<ProjectFormState>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<ProjectFormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [departments, setDepartments] = useState<Department[]>([]);
  const [userPermissions, setUserPermissions] = useState<UserPermissionInfo | null>(null);
  const [productTree, setProductTree] = useState<ProductTreeNode[]>([]);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [departmentList, permissions, productTreeResponse] = await Promise.all([
          orgApi.listDepartments(),
          orgApi.getUserPermissions(),
          projectApi.products.getTree(),
        ]);
        setDepartments(departmentList || []);
        setUserPermissions(permissions);
        setProductTree(productTreeResponse?.products || []);
      } catch (fetchError) {
        console.error('获取项目空间权限上下文失败:', fetchError);
      }
    };
    bootstrap();
  }, []);

  const allowedDepartmentIds = useMemo(() => {
    if (!userPermissions) return [];
    if (userPermissions.is_admin) {
      return departments.map((department) => department.id);
    }
    if (userPermissions.platform_role === 'ordinary_admin') {
      return userPermissions.manageable_department_ids || [];
    }
    return userPermissions.department_ids || [];
  }, [departments, userPermissions]);

  const selectableDepartments = useMemo(() => {
    if (!userPermissions) return [];
    if (userPermissions.is_admin) return departments;
    const allowedSet = new Set(allowedDepartmentIds);
    return departments.filter((department) => allowedSet.has(department.id));
  }, [allowedDepartmentIds, departments, userPermissions]);

  const productVersionOptions = useMemo(() => {
    const flatNodes = (nodes: ProductTreeNode[]): ProductTreeNode[] =>
      nodes.flatMap((node) => [node, ...flatNodes(node.children || [])]);

    return flatNodes(productTree)
      .filter((node) => node.is_leaf)
      .flatMap((node) =>
        (node.versions || []).map((version: ProductVersionNode) => ({
          product: node,
          version,
          label: `${node.name} / ${version.version}${version.name ? ` · ${version.name}` : ''}`,
        }))
      );
  }, [productTree]);

  const filteredProjects = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return (projects || []).filter((project) => {
      if (!project) return false;
      if (!term) return true;
      return [
        project.name || '',
        project.id || '',
        project.description || '',
        project.k8s_namespace || '',
        project.owner_name || '',
        project.department_name || '',
        project.product_name || '',
        project.product_path || '',
        project.product_version || '',
        project.product_version_name || '',
      ].some((value) => value.toLowerCase().includes(term));
    });
  }, [projects, searchTerm]);

  const publicProjects = useMemo(
    () => filteredProjects.filter((project) => project.is_public),
    [filteredProjects]
  );
  const departmentProjects = useMemo(
    () => filteredProjects.filter((project) => !project.is_public),
    [filteredProjects]
  );
  const manageableProjects = useMemo(
    () => filteredProjects.filter((project) => project.can_manage),
    [filteredProjects]
  );

  const isAllSelected = manageableProjects.length > 0 && manageableProjects.every((project) => selectedIds.has(project.id));

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshProjects(true);
    } finally {
      setIsRefreshing(false);
    }
  };

  const getDefaultDepartmentId = () => {
    const defaultDepartment = selectableDepartments[0];
    return defaultDepartment ? String(defaultDepartment.id) : '';
  };

  const openCreateModal = () => {
    setError(null);
    setNewProject({
      ...EMPTY_FORM,
      department_id: getDefaultDepartmentId(),
      product_version_id: productVersionOptions[0]?.version.id || '',
    });
    setIsCreateModalOpen(true);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProject.department_id) {
      setError('请选择项目归属部门');
      return;
    }
    if (!newProject.product_version_id) {
      setError('请选择产品版本');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await projectApi.projects.create({
        name: newProject.name,
        description: newProject.description,
        is_public: newProject.is_public,
        department_id: Number(newProject.department_id),
        product_version_id: newProject.product_version_id,
      });
      setIsCreateModalOpen(false);
      setNewProject(EMPTY_FORM);
      await refreshProjects();
    } catch (err: any) {
      setError(err.message || '创建项目失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;
    if (!editForm.department_id) {
      setError('请选择项目归属部门');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await projectApi.projects.update(editingProject.id, {
        name: editForm.name,
        description: editForm.description,
        is_public: editForm.is_public,
        department_id: Number(editForm.department_id),
        product_version_id: editForm.product_version_id || null,
      });
      setIsEditModalOpen(false);
      setEditingProject(null);
      await refreshProjects();
    } catch (err: any) {
      setError(err.message || '更新项目失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (event: React.MouseEvent, project: SecurityProject) => {
    event.stopPropagation();
    if (!project.can_manage) {
      return;
    }
    setEditingProject(project);
    setEditForm({
      name: project.name,
      description: project.description || '',
      is_public: !!project.is_public,
      department_id: project.department_id ? String(project.department_id) : getDefaultDepartmentId(),
      product_version_id: project.product_version_id || '',
    });
    setError(null);
    setIsEditModalOpen(true);
  };

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(manageableProjects.map((project) => project.id)));
  };

  const toggleSelect = (event: React.MouseEvent, project: SecurityProject) => {
    event.stopPropagation();
    if (!project.can_manage) return;

    const next = new Set(selectedIds);
    if (next.has(project.id)) {
      next.delete(project.id);
    } else {
      next.add(project.id);
    }
    setSelectedIds(next);
  };

  const handleDeleteClick = (event: React.MouseEvent, ids: string[]) => {
    event.stopPropagation();
    if (ids.length === 0) return;
    setShowConfirm({ show: true, ids });
  };

  const executeDelete = async () => {
    if (showConfirm.ids.length === 0) return;
    setIsDeleting(true);
    try {
      await Promise.all(showConfirm.ids.map((id) => projectApi.projects.delete(id)));
      setShowConfirm({ show: false, ids: [] });
      setSelectedIds(new Set());
      await refreshProjects();
    } catch (err: any) {
      setError(err.message || '删除项目失败');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRowClick = (id: string) => {
    setActiveProjectId(id);
    setCurrentView('project-detail');
  };

  const renderProjectSection = (
    title: string,
    subtitle: string,
    emptyText: string,
    projectsInSection: SecurityProject[],
    accent: 'green' | 'amber'
  ) => {
    const accentClasses = accent === 'green'
      ? {
          panel: 'border-green-100 bg-gradient-to-br from-green-50 via-white to-emerald-50',
          icon: 'bg-green-600 text-white',
          badge: 'bg-green-100 text-green-700',
          action: 'text-green-700',
        }
      : {
          panel: 'border-amber-100 bg-gradient-to-br from-amber-50 via-white to-orange-50',
          icon: 'bg-amber-600 text-white',
          badge: 'bg-amber-100 text-amber-700',
          action: 'text-amber-700',
        };

    return (
      <section className={`border rounded-[2.5rem] shadow-sm overflow-hidden ${accentClasses.panel}`}>
        <div className="px-8 py-6 border-b border-white/80 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-[1.25rem] flex items-center justify-center shadow-lg ${accentClasses.icon}`}>
              {accent === 'green' ? <Globe size={26} /> : <Building2 size={26} />}
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-800">{title}</h3>
              <p className="text-sm text-slate-500 font-medium">{subtitle}</p>
            </div>
          </div>
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest ${accentClasses.badge}`}>
            <Layers size={14} />
            {projectsInSection.length} 个项目
          </div>
        </div>

        {projectsInSection.length > 0 ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 p-6">
            {projectsInSection.map((project) => {
              const selected = selectedIds.has(project.id);
              return (
                <article
                  key={project.id}
                  onClick={() => handleRowClick(project.id)}
                  className={`group rounded-[2rem] border bg-white/90 backdrop-blur-sm p-6 transition-all cursor-pointer shadow-sm hover:shadow-xl hover:-translate-y-1 ${
                    selected ? 'border-blue-500 ring-4 ring-blue-500/10' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <button
                      onClick={(event) => toggleSelect(event, project)}
                      disabled={!project.can_manage}
                      className={`mt-1 p-2 rounded-xl transition-all ${
                        project.can_manage ? 'hover:bg-slate-100' : 'cursor-not-allowed opacity-40'
                      }`}
                      title={project.can_manage ? '选择项目' : '仅可查看，无法批量操作'}
                    >
                      {selected ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} className="text-slate-300" />}
                    </button>

                    <div className="flex-1 min-w-0 space-y-4">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                        <div className="space-y-2 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-xl font-black text-slate-800 truncate">{project.name}</h4>
                            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-black ${accentClasses.badge}`}>
                              {project.is_public ? <Globe size={12} /> : <Lock size={12} />}
                              {project.is_public ? '公开项目' : '部门项目'}
                            </span>
                            {project.can_manage ? (
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-[11px] font-black">
                                <Edit3 size={12} />
                                可管理
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-100 text-slate-500 text-[11px] font-black">
                                <Lock size={12} />
                                只读可见
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-500">
                            <span className="inline-flex items-center gap-1.5">
                              <Building2 size={14} className="text-slate-300" />
                              {project.department_name || '未绑定归属部门'}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <User size={14} className="text-slate-300" />
                              {project.owner_name || '未知负责人'}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <Calendar size={14} className="text-slate-300" />
                              {project.created_at ? new Date(project.created_at).toLocaleDateString() : '未知时间'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-start md:self-center">
                          {project.can_manage && (
                            <>
                              <button
                                onClick={(event) => openEditModal(event, project)}
                                className="p-3 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-all"
                                title="编辑项目"
                              >
                                <Edit3 size={18} />
                              </button>
                              <button
                                onClick={(event) => handleDeleteClick(event, [project.id])}
                                className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"
                                title="删除项目"
                              >
                                <Trash2 size={18} />
                              </button>
                            </>
                          )}
                          <div className={`p-3 rounded-2xl bg-slate-100 ${accentClasses.action}`}>
                            <ArrowRight size={18} />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 text-sm text-slate-600">
                        <FileText size={16} className="text-slate-300 shrink-0 mt-0.5" />
                        <p className="line-clamp-2 leading-relaxed">
                          {project.description || '未填写项目描述。'}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-slate-50 px-4 py-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">产品路径</p>
                          <p className="text-sm font-bold text-slate-700 mt-1 break-all">{project.product_path || '未归属版本'}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 px-4 py-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">产品版本</p>
                          <p className="text-sm font-bold text-slate-700 mt-1 break-all">{project.product_version || project.product_version_name || '未归属版本'}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 px-4 py-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">命名空间</p>
                          <p className="text-sm font-bold text-slate-700 mt-1 break-all">{project.k8s_namespace || '系统自动生成'}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 px-4 py-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">状态</p>
                          <div className="mt-2">
                            <StatusBadge status={project.status || 'active'} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="py-20 text-center">
            <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mx-auto mb-4 text-slate-300">
              {accent === 'green' ? <Globe size={30} /> : <Building2 size={30} />}
            </div>
            <p className="text-sm font-black text-slate-400 uppercase tracking-widest">{emptyText}</p>
          </div>
        )}
      </section>
    );
  };

  const renderDepartmentSelect = (
    value: string,
    onChange: (departmentId: string) => void,
    helperText: string
  ) => (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">归属部门 *</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full px-6 py-4 bg-slate-50 rounded-2xl border-none outline-none focus:ring-4 ring-blue-500/10 font-bold text-slate-800 transition-all"
      >
        <option value="">请选择归属部门</option>
        {selectableDepartments.map((department) => (
          <option key={department.id} value={department.id}>
            {department.name}
          </option>
        ))}
      </select>
      <p className="text-[11px] text-slate-400 ml-1">{helperText}</p>
    </div>
  );

  const renderProductVersionSelect = (
    value: string,
    onChange: (productVersionId: string) => void,
    helperText: string
  ) => (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">产品版本 *</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full px-6 py-4 bg-slate-50 rounded-2xl border-none outline-none focus:ring-4 ring-blue-500/10 font-bold text-slate-800 transition-all"
      >
        <option value="">请选择产品版本</option>
        {productVersionOptions.map((option) => (
          <option key={option.version.id} value={option.version.id}>
            {option.label}
          </option>
        ))}
      </select>
      <p className="text-[11px] text-slate-400 ml-1">{helperText}</p>
    </div>
  );

  return (
    <div className="p-10 space-y-8 animate-in fade-in duration-500 pb-24 relative">
      <div className="flex flex-col md:flex-row justify-between items-end gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-500/20">
              <Layers size={24} />
            </div>
            <h2 className="text-3xl font-black text-slate-800 tracking-tight">项目空间</h2>
          </div>
          <p className="text-slate-500 font-medium">公开项目与部门归属项目分区展示，统一按部门层级控制访问与管理</p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={handleRefresh}
            className="p-4 bg-white border border-slate-200 text-slate-500 rounded-2xl hover:bg-slate-50 transition-all shadow-sm active:scale-95"
            title="刷新列表"
          >
            <RefreshCw size={20} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={openCreateModal}
            disabled={!userPermissions || selectableDepartments.length === 0}
            className="flex items-center gap-2 bg-slate-900 text-white px-8 py-4 rounded-2xl font-black hover:bg-slate-800 shadow-xl shadow-slate-900/10 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={20} /> 初始化项目
          </button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="sticky top-4 z-50 bg-slate-900 px-8 py-4 rounded-3xl shadow-2xl flex items-center justify-between animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white">
              <CheckCircle2 size={20} />
            </div>
            <span className="text-sm font-black text-white">已选中 {selectedIds.size} 个可管理项目</span>
          </div>
          <div className="flex gap-4">
            <button
              onClick={(event) => handleDeleteClick(event, Array.from(selectedIds))}
              className="px-6 py-2.5 bg-red-500/10 text-red-400 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:bg-red-500/20 transition-all"
            >
              <Trash2 size={16} /> 批量删除
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-6 py-2.5 bg-white/5 text-slate-400 rounded-xl text-xs font-black uppercase tracking-widest hover:text-white transition-all"
            >
              取消选择
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">总项目数</p>
            <h3 className="text-3xl font-black text-slate-800 mt-1">{projects.length}</h3>
          </div>
          <Layers className="text-blue-100" size={40} />
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">公开项目</p>
            <h3 className="text-3xl font-black text-green-600 mt-1">{projects.filter((project) => project.is_public).length}</h3>
          </div>
          <Globe className="text-green-100" size={40} />
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">部门项目</p>
            <h3 className="text-3xl font-black text-amber-600 mt-1">{projects.filter((project) => !project.is_public).length}</h3>
          </div>
          <Building2 className="text-amber-100" size={40} />
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">可管理项目</p>
            <h3 className="text-3xl font-black text-blue-600 mt-1">{projects.filter((project) => project.can_manage).length}</h3>
          </div>
          <Edit3 className="text-blue-100" size={40} />
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">未归属版本</p>
            <h3 className="text-3xl font-black text-slate-800 mt-1">{projects.filter((project) => !project.product_version_id).length}</h3>
          </div>
          <GitBranch className="text-slate-100" size={40} />
        </div>
      </div>

      {userPermissions?.platform_role === 'ordinary_admin' && (
        <div className="bg-amber-50 border border-amber-100 text-amber-700 px-6 py-4 rounded-[2rem] text-sm font-semibold">
          普通管理员只能编辑或删除所属部门及下级部门归属的项目；上级部门管理员可见下级部门项目，因此也可在其部门树范围内进行维护。
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
        <input
          type="text"
          placeholder="搜索项目名称、负责人、归属部门、产品路径、版本号或命名空间..."
          className="w-full pl-16 pr-20 py-5 bg-white border border-slate-200 rounded-[2rem] text-sm outline-none focus:ring-4 ring-blue-500/5 transition-all font-medium shadow-sm"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
        <button
          onClick={toggleSelectAll}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-2xl hover:bg-slate-100 transition-all"
          title={isAllSelected ? '取消全选可管理项目' : '全选可管理项目'}
        >
          {isAllSelected ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} className="text-slate-400" />}
        </button>
      </div>

      {renderProjectSection(
        '公开项目',
        '所有登录用户均可查看，适合作为跨部门共享项目空间。',
        '当前没有公开项目',
        publicProjects,
        'green'
      )}

      {renderProjectSection(
        '部门归属项目',
        '展示登录用户所属部门树范围内可见的项目，私有项目按部门层级进行访问控制。',
        '当前没有部门归属项目',
        departmentProjects,
        'amber'
      )}

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white w-full max-w-xl rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-10 pb-0">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-[1.5rem] flex items-center justify-center mb-6">
                <Plus size={32} />
              </div>
              <h3 className="text-3xl font-black text-slate-800 tracking-tight">初始化项目空间</h3>
              <p className="text-slate-500 mt-2 font-medium">项目会绑定归属部门，访问与编辑权限均按部门层级自动判定。</p>
            </div>

            <form onSubmit={handleCreateProject} className="p-10 space-y-6">
              {error && (
                <div className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl text-xs font-black flex items-center gap-3">
                  <AlertTriangle size={16} /> {error}
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">项目名称 *</label>
                <input
                  required
                  placeholder="例如：核心业务 API 渗透测试"
                  className="w-full px-6 py-4 bg-slate-50 rounded-2xl border-none outline-none focus:ring-4 ring-blue-500/10 font-bold text-slate-800 transition-all"
                  value={newProject.name}
                  onChange={(event) => setNewProject({ ...newProject, name: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">项目简述</label>
                <textarea
                  rows={3}
                  placeholder="描述该项目的评估目标与范围..."
                  className="w-full px-6 py-4 bg-slate-50 rounded-2xl border-none outline-none focus:ring-4 ring-blue-500/10 font-bold text-slate-800 transition-all resize-none"
                  value={newProject.description}
                  onChange={(event) => setNewProject({ ...newProject, description: event.target.value })}
                />
              </div>

              {renderDepartmentSelect(
                newProject.department_id,
                (department_id) => setNewProject({ ...newProject, department_id }),
                '私有项目仅对该部门及其上级部门可见；公开项目仍保留归属部门以便后续管理。'
              )}

              {renderProductVersionSelect(
                newProject.product_version_id,
                (product_version_id) => setNewProject({ ...newProject, product_version_id }),
                '新建项目必须绑定到一个产品版本，版本从全局产品树的叶子节点下选择。'
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">项目可见性 *</label>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setNewProject({ ...newProject, is_public: true })}
                    className={`flex-1 py-4 rounded-2xl font-black transition-all ${
                      newProject.is_public
                        ? 'bg-green-600 text-white shadow-lg shadow-green-500/20'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    <Globe size={20} className="mx-auto mb-2" />
                    公开项目
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewProject({ ...newProject, is_public: false })}
                    className={`flex-1 py-4 rounded-2xl font-black transition-all ${
                      !newProject.is_public
                        ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    <Lock size={20} className="mx-auto mb-2" />
                    部门项目
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-2 ml-1">
                  {newProject.is_public
                    ? '公开项目：所有用户可见，但仍由归属部门管理员负责维护。'
                    : '部门项目：仅归属部门及上级部门用户可见。'}
                </p>
              </div>

              <div className="pt-4 flex gap-4">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black hover:bg-slate-200 transition-all"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black hover:bg-blue-700 shadow-xl shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : <Plus size={20} />}
                  立即创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showConfirm.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-10 text-center">
              <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-8">
                <AlertTriangle size={48} />
              </div>
              <h3 className="text-2xl font-black text-slate-800">确认删除项目？</h3>
              <p className="text-slate-500 mt-4 font-medium leading-relaxed">
                您正准备移除 <span className="text-red-600 font-black">{showConfirm.ids.length}</span> 个项目空间。
                此操作将同步销毁关联的 <span className="text-red-600 font-black">K8S Namespace</span> 及其中运行的所有容器资产，且不可恢复。
              </p>
            </div>
            <div className="px-10 pb-10 flex gap-4">
              <button
                onClick={() => setShowConfirm({ show: false, ids: [] })}
                disabled={isDeleting}
                className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black hover:bg-slate-200 transition-all"
              >
                保留
              </button>
              <button
                onClick={executeDelete}
                disabled={isDeleting}
                className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black hover:bg-red-700 shadow-xl shadow-red-500/20 transition-all flex items-center justify-center gap-2"
              >
                {isDeleting ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {isEditModalOpen && editingProject && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white w-full max-w-xl rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-10 pb-0">
              <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-[1.5rem] flex items-center justify-center mb-6">
                <Edit3 size={32} />
              </div>
              <h3 className="text-3xl font-black text-slate-800 tracking-tight">编辑项目</h3>
              <p className="text-slate-500 mt-2 font-medium">仅归属部门管理员及其上级部门管理员可维护项目信息。</p>
            </div>

            <form onSubmit={handleEditProject} className="p-10 space-y-6">
              {error && (
                <div className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl text-xs font-black flex items-center gap-3">
                  <AlertTriangle size={16} /> {error}
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">项目名称 *</label>
                <input
                  required
                  placeholder="例如：核心业务 API 渗透测试"
                  className="w-full px-6 py-4 bg-slate-50 rounded-2xl border-none outline-none focus:ring-4 ring-amber-500/10 font-bold text-slate-800 transition-all"
                  value={editForm.name}
                  onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">项目简述</label>
                <textarea
                  rows={3}
                  placeholder="描述该项目的评估目标与范围..."
                  className="w-full px-6 py-4 bg-slate-50 rounded-2xl border-none outline-none focus:ring-4 ring-amber-500/10 font-bold text-slate-800 transition-all resize-none"
                  value={editForm.description}
                  onChange={(event) => setEditForm({ ...editForm, description: event.target.value })}
                />
              </div>

              {renderDepartmentSelect(
                editForm.department_id,
                (department_id) => setEditForm({ ...editForm, department_id }),
                '归属部门决定私有项目的可见范围，同时决定哪些部门管理员可编辑和删除项目。'
              )}

              {renderProductVersionSelect(
                editForm.product_version_id,
                (product_version_id) => setEditForm({ ...editForm, product_version_id }),
                '可切换到其他产品版本；历史项目允许暂时为空，但建议尽快补齐。'
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">项目可见性 *</label>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setEditForm({ ...editForm, is_public: true })}
                    className={`flex-1 py-4 rounded-2xl font-black transition-all ${
                      editForm.is_public
                        ? 'bg-green-600 text-white shadow-lg shadow-green-500/20'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    <Globe size={20} className="mx-auto mb-2" />
                    公开项目
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditForm({ ...editForm, is_public: false })}
                    className={`flex-1 py-4 rounded-2xl font-black transition-all ${
                      !editForm.is_public
                        ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    <Lock size={20} className="mx-auto mb-2" />
                    部门项目
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-2 ml-1">
                  {editForm.is_public
                    ? '公开项目：所有用户可见，编辑/删除仍受归属部门管理员控制。'
                    : '部门项目：仅归属部门与上级部门用户可见。'}
                </p>
              </div>

              <div className="pt-4 flex gap-4">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black hover:bg-slate-200 transition-all"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-4 bg-amber-600 text-white rounded-2xl font-black hover:bg-amber-700 shadow-xl shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : <Edit3 size={20} />}
                  保存修改
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
