import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  CheckSquare,
  Edit3,
  Globe,
  Layers,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Square,
  Trash2,
  GitBranch,
} from 'lucide-react';
import { api } from '../../clients/api';
import { orgApi, UserPermissionInfo } from '../../clients/org';
import { Department, ProductTreeNode, ProductVersionNode, SecurityProject } from '../../types/types';
import { StatusBadge } from '../../components/StatusBadge';

interface ProjectMgmtPageProps {
  projects: SecurityProject[];
  setSelectedProjectId: (id: string) => void;
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

// LOKI design tokens (DESIGN.md) — page-local palette.
const LK = {
  primary: '#4f73ff',
  primarySoft: '#7590ff',
  primaryDeep: '#3f63f1',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: '#070d18',
  surface: '#111a2b',
  surfaceRaised: '#18233a',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: '#26324a',
  borderSoft: '#1b2438',
  ink: '#f5f7ff',
  inkSoft: '#d6def0',
  body: '#a4aec4',
  muted: '#72809a',
  mutedSoft: '#8b95a8',
  success: '#45c06f',
  warning: '#d5a13a',
  error: '#f15d5d',
  info: '#4f8cff',
} as const;

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

export const ProjectMgmtPage: React.FC<ProjectMgmtPageProps> = ({
  projects,
  setSelectedProjectId,
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
  const productCount = useMemo(
    () => new Set(
      projects
        .map((project) => String(project.product_id || project.product_name || project.product_path || '').trim())
        .filter(Boolean)
    ).size,
    [projects]
  );
  const versionCount = useMemo(
    () => new Set(
      projects
        .map((project) => String(project.product_version_id || project.product_version || project.product_version_name || '').trim())
        .filter(Boolean)
    ).size,
    [projects]
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

  const switchToProject = (id: string) => {
    setSelectedProjectId(id);
  };

  const handleRowClick = (id: string) => {
    switchToProject(id);
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
    const accentColor = accent === 'green' ? LK.success : LK.warning;
    const Icon = accent === 'green' ? Globe : Building2;

    return (
      <section
        className="overflow-hidden rounded-xl"
        style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
      >
        <div
          className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between"
          style={{ borderBottom: `1px solid ${LK.borderSoft}` }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-md"
              style={{ backgroundColor: `${accentColor}22`, color: accentColor }}
            >
              <Icon size={18} />
            </div>
            <div>
              <h3 className="text-base font-semibold leading-6" style={{ color: LK.ink }}>
                {title}
              </h3>
              <p className="text-xs" style={{ color: LK.muted }}>
                {subtitle}
              </p>
            </div>
          </div>
          <span
            className="inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-xs font-medium md:self-auto"
            style={{ backgroundColor: `${accentColor}22`, color: accentColor }}
          >
            <Layers size={13} />
            {projectsInSection.length} 个项目
          </span>
        </div>

        {projectsInSection.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider" style={{ color: LK.mutedSoft }}>
                  <th className="w-12 px-3 py-2.5 font-medium" style={{ borderBottom: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>选择</th>
                  <th className="min-w-[240px] px-3 py-2.5 font-medium" style={{ borderBottom: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>项目</th>
                  <th className="min-w-[110px] px-3 py-2.5 font-medium" style={{ borderBottom: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>可见性</th>
                  <th className="min-w-[140px] px-3 py-2.5 font-medium" style={{ borderBottom: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>归属部门</th>
                  <th className="min-w-[110px] px-3 py-2.5 font-medium" style={{ borderBottom: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>负责人</th>
                  <th className="min-w-[200px] px-3 py-2.5 font-medium" style={{ borderBottom: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>产品版本</th>
                  <th className="min-w-[180px] px-3 py-2.5 font-medium" style={{ borderBottom: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>命名空间</th>
                  <th className="min-w-[90px] px-3 py-2.5 font-medium" style={{ borderBottom: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>状态</th>
                  <th className="min-w-[140px] px-3 py-2.5 font-medium" style={{ borderBottom: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>创建时间</th>
                  <th className="w-36 px-3 py-2.5 text-right font-medium" style={{ borderBottom: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {projectsInSection.map((project) => {
                  const selected = selectedIds.has(project.id);
                  return (
                    <tr
                      key={project.id}
                      onClick={() => handleRowClick(project.id)}
                      className="cursor-pointer transition-colors"
                      style={{
                        backgroundColor: selected ? LK.primaryMuted : 'transparent',
                        boxShadow: selected ? `inset 2px 0 0 ${LK.primary}` : 'none',
                      }}
                      onMouseEnter={(e) => {
                        if (!selected) e.currentTarget.style.backgroundColor = LK.surfaceRaised;
                      }}
                      onMouseLeave={(e) => {
                        if (!selected) e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <td className="px-3 py-3 align-top" style={{ borderBottom: `1px solid ${LK.borderSoft}` }}>
                        <button
                          onClick={(event) => toggleSelect(event, project)}
                          disabled={!project.can_manage}
                          className="p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                          style={{ color: project.can_manage ? (selected ? LK.primary : LK.muted) : LK.muted }}
                          title={project.can_manage ? '选择项目' : '仅可查看，无法批量操作'}
                        >
                          {selected ? <CheckSquare size={16} /> : <Square size={16} />}
                        </button>
                      </td>
                      <td className="px-3 py-3 align-top" style={{ borderBottom: `1px solid ${LK.borderSoft}` }}>
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-semibold" style={{ color: LK.ink }}>
                              {project.name}
                            </span>
                            {project.can_manage ? (
                              <span
                                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                                style={{ backgroundColor: LK.primaryMuted, color: LK.primary }}
                              >
                                <Edit3 size={11} />
                                可管理
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                                style={{ backgroundColor: LK.surfaceRaised, color: LK.muted }}
                              >
                                <Lock size={11} />
                                只读
                              </span>
                            )}
                          </div>
                          <div className="line-clamp-2 text-xs leading-5" style={{ color: LK.body }}>
                            {project.description || '未填写项目描述。'}
                          </div>
                          <div className="text-[11px]" style={{ color: LK.muted, fontFamily: MONO }}>
                            {project.id}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top" style={{ borderBottom: `1px solid ${LK.borderSoft}` }}>
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                          style={{ backgroundColor: `${accentColor}22`, color: accentColor }}
                        >
                          {project.is_public ? <Globe size={11} /> : <Lock size={11} />}
                          {project.is_public ? '公开' : '部门'}
                        </span>
                      </td>
                      <td className="px-3 py-3 align-top text-sm" style={{ borderBottom: `1px solid ${LK.borderSoft}`, color: LK.body }}>
                        {project.department_name || '未绑定'}
                      </td>
                      <td className="px-3 py-3 align-top text-sm" style={{ borderBottom: `1px solid ${LK.borderSoft}`, color: LK.body }}>
                        {project.owner_name || '未知'}
                      </td>
                      <td className="px-3 py-3 align-top" style={{ borderBottom: `1px solid ${LK.borderSoft}` }}>
                        <div className="space-y-0.5">
                          <div className="text-sm font-medium" style={{ color: LK.inkSoft }}>
                            {project.product_version || project.product_version_name || '未归属版本'}
                          </div>
                          <div className="break-all text-[11px]" style={{ color: LK.muted, fontFamily: MONO }}>
                            {project.product_path || '—'}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top" style={{ borderBottom: `1px solid ${LK.borderSoft}` }}>
                        <span
                          className="inline-block max-w-[200px] break-all rounded px-1.5 py-0.5 text-xs"
                          style={{ backgroundColor: LK.surfaceRaised, color: LK.body, fontFamily: MONO }}
                        >
                          {project.k8s_namespace || '系统自动生成'}
                        </span>
                      </td>
                      <td className="px-3 py-3 align-top" style={{ borderBottom: `1px solid ${LK.borderSoft}` }}>
                        <StatusBadge status={project.status || 'active'} />
                      </td>
                      <td className="px-3 py-3 align-top text-xs" style={{ borderBottom: `1px solid ${LK.borderSoft}`, color: LK.muted }}>
                        {project.created_at ? new Date(project.created_at).toLocaleString() : '未知'}
                      </td>
                      <td className="px-3 py-3 align-top" style={{ borderBottom: `1px solid ${LK.borderSoft}` }}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              switchToProject(project.id);
                            }}
                            className="rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors"
                            style={{ color: LK.body }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.surfaceRaised; e.currentTarget.style.color = LK.ink; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = LK.body; }}
                            title="切换到此项目"
                          >
                            切换
                          </button>
                          {project.can_manage && (
                            <>
                              <button
                                onClick={(event) => openEditModal(event, project)}
                                className="rounded-md p-1.5 transition-colors"
                                style={{ color: LK.muted }}
                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.primaryMuted; e.currentTarget.style.color = LK.primary; }}
                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = LK.muted; }}
                                title="编辑项目"
                              >
                                <Edit3 size={15} />
                              </button>
                              <button
                                onClick={(event) => handleDeleteClick(event, [project.id])}
                                className="rounded-md p-1.5 transition-colors"
                                style={{ color: LK.muted }}
                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${LK.error}22`; e.currentTarget.style.color = LK.error; }}
                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = LK.muted; }}
                                title="删除项目"
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                          <span style={{ color: accentColor }} className="p-1.5">
                            <ArrowRight size={15} />
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-md"
              style={{ backgroundColor: LK.surfaceRaised, color: LK.muted }}
            >
              <Icon size={20} />
            </div>
            <p className="text-sm" style={{ color: LK.muted }}>
              {emptyText}
            </p>
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
      <label className="text-xs font-medium" style={{ color: LK.mutedSoft }}>归属部门 *</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
        style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
        onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
        onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
      >
        <option value="">请选择归属部门</option>
        {selectableDepartments.map((department) => (
          <option key={department.id} value={department.id}>
            {department.name}
          </option>
        ))}
      </select>
      <p className="text-[11px]" style={{ color: LK.muted }}>{helperText}</p>
    </div>
  );

  const renderProductVersionSelect = (
    value: string,
    onChange: (productVersionId: string) => void,
    helperText: string
  ) => (
    <div className="space-y-1.5">
      <label className="text-xs font-medium" style={{ color: LK.mutedSoft }}>产品版本 *</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
        style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
        onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
        onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
      >
        <option value="">请选择产品版本</option>
        {productVersionOptions.map((option) => (
          <option key={option.version.id} value={option.version.id}>
            {option.label}
          </option>
        ))}
      </select>
      <p className="text-[11px]" style={{ color: LK.muted }}>{helperText}</p>
    </div>
  );

  return (
    <div
      className="space-y-4 px-5 py-5 pb-20 md:px-6 2xl:px-8"
      style={{ backgroundColor: LK.canvas, minHeight: '100%', color: LK.inkSoft }}
    >
      <div className="flex flex-col items-end justify-between gap-3 pb-4 md:flex-row" style={{ borderBottom: `1px solid ${LK.borderSoft}` }}>
        <div>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ backgroundColor: LK.primaryMuted, color: LK.primary }}
          >
            <Layers size={13} /> 项目空间
          </span>
          <h1 className="mt-3 text-2xl font-semibold leading-8 tracking-tight" style={{ color: LK.ink }}>
            项目空间
          </h1>
          <p className="mt-1.5 text-sm leading-6" style={{ color: LK.body }}>
            公开项目与部门归属项目分区展示，统一按部门层级控制访问与管理。
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            className="rounded-lg p-2.5 transition-colors"
            style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}`, color: LK.body }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = LK.primary; e.currentTarget.style.color = LK.primarySoft; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = LK.border; e.currentTarget.style.color = LK.body; }}
            title="刷新列表"
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={openCreateModal}
            disabled={!userPermissions || selectableDepartments.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: LK.primary, color: '#ffffff' }}
            onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = LK.primaryDeep; }}
            onMouseLeave={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = LK.primary; }}
          >
            <Plus size={16} /> 初始化项目
          </button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div
          className="sticky top-3 z-30 flex items-center justify-between rounded-lg px-4 py-2.5"
          style={{ backgroundColor: LK.surfaceGlass, backdropFilter: 'blur(8px)', border: `1px solid ${LK.primary}` }}
        >
          <div className="flex items-center gap-2.5">
            <span style={{ color: LK.primary }}>
              <CheckCircle2 size={16} />
            </span>
            <span className="text-sm font-medium" style={{ color: LK.ink }}>
              已选中 {selectedIds.size} 个可管理项目
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={(event) => handleDeleteClick(event, Array.from(selectedIds))}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
              style={{ backgroundColor: `${LK.error}22`, color: LK.error }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = `${LK.error}3a`)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = `${LK.error}22`)}
            >
              <Trash2 size={14} /> 批量删除
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
              style={{ backgroundColor: LK.surfaceRaised, color: LK.body }}
              onMouseEnter={(e) => (e.currentTarget.style.color = LK.ink)}
              onMouseLeave={(e) => (e.currentTarget.style.color = LK.body)}
            >
              取消选择
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '产品数', value: productCount, icon: Layers, color: LK.primary },
          { label: '版本数', value: versionCount, icon: GitBranch, color: LK.success },
          { label: '项目总数', value: projects.length, icon: Building2, color: LK.warning },
        ].map((stat) => (
          <div
            key={stat.label}
            className="flex items-center justify-between rounded-xl px-4 py-3"
            style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
          >
            <div>
              <div className="text-xs" style={{ color: LK.muted }}>
                {stat.label}
              </div>
              <div className="mt-1 text-2xl font-semibold leading-7 tabular-nums" style={{ color: stat.color }}>
                {stat.value}
              </div>
            </div>
            <div
              className="flex h-9 w-9 items-center justify-center rounded-md"
              style={{ backgroundColor: `${stat.color}22`, color: stat.color }}
            >
              <stat.icon size={18} />
            </div>
          </div>
        ))}
      </div>

      {userPermissions?.platform_role === 'ordinary_admin' && (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{ backgroundColor: `${LK.warning}14`, border: `1px solid ${LK.warning}40`, color: LK.warning }}
        >
          普通管理员只能编辑或删除所属部门及下级部门归属的项目；上级部门管理员可见下级部门项目，因此也可在其部门树范围内进行维护。
        </div>
      )}

      <div
        className="flex items-center gap-2 rounded-lg px-3"
        style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
      >
        <Search size={16} style={{ color: LK.muted }} />
        <input
          type="text"
          placeholder="搜索项目名称、负责人、归属部门、产品路径、版本号或命名空间..."
          className="w-full bg-transparent py-2.5 text-sm outline-none"
          style={{ color: LK.inkSoft }}
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
        <button
          onClick={toggleSelectAll}
          className="p-1.5 transition-colors"
          style={{ color: isAllSelected ? LK.primary : LK.muted }}
          onMouseEnter={(e) => (e.currentTarget.style.color = LK.primarySoft)}
          onMouseLeave={(e) => (e.currentTarget.style.color = isAllSelected ? LK.primary : LK.muted)}
          title={isAllSelected ? '取消全选可管理项目' : '全选可管理项目'}
        >
          {isAllSelected ? <CheckSquare size={16} /> : <Square size={16} />}
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
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in"
          style={{ backgroundColor: 'rgba(5, 10, 20, 0.72)', backdropFilter: 'blur(6px)' }}
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-2xl animate-in"
            style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
          >
            <div className="flex items-start gap-3 px-6 pb-0 pt-6" style={{ borderBottom: `1px solid ${LK.borderSoft}` }}>
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                style={{ backgroundColor: LK.primaryMuted, color: LK.primary }}
              >
                <Plus size={18} />
              </div>
              <div className="flex-1 pb-5">
                <h3 className="text-lg font-semibold leading-7" style={{ color: LK.ink }}>
                  初始化项目空间
                </h3>
                <p className="mt-0.5 text-sm" style={{ color: LK.muted }}>
                  项目会绑定归属部门，访问与编辑权限均按部门层级自动判定。
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-4 px-6 py-5">
              {error && (
                <div
                  className="flex items-center gap-2 rounded-md px-3 py-2.5 text-xs"
                  style={{ backgroundColor: `${LK.error}14`, border: `1px solid ${LK.error}40`, color: LK.error }}
                >
                  <AlertTriangle size={14} /> {error}
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: LK.mutedSoft }}>项目名称 *</label>
                <input
                  required
                  placeholder="例如：核心业务 API 渗透测试"
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                  style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
                  value={newProject.name}
                  onChange={(event) => setNewProject({ ...newProject, name: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: LK.mutedSoft }}>项目简述</label>
                <textarea
                  rows={3}
                  placeholder="描述该项目的评估目标与范围..."
                  className="w-full resize-none rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                  style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
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
                <label className="text-xs font-medium" style={{ color: LK.mutedSoft }}>项目可见性 *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewProject({ ...newProject, is_public: true })}
                    className="flex flex-col items-center gap-1.5 rounded-lg px-3 py-3 text-sm font-medium transition-colors"
                    style={{
                      backgroundColor: newProject.is_public ? LK.primaryMuted : LK.surfaceRaised,
                      border: `1px solid ${newProject.is_public ? LK.primary : LK.border}`,
                      color: newProject.is_public ? LK.primary : LK.body,
                    }}
                  >
                    <Globe size={18} />
                    公开项目
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewProject({ ...newProject, is_public: false })}
                    className="flex flex-col items-center gap-1.5 rounded-lg px-3 py-3 text-sm font-medium transition-colors"
                    style={{
                      backgroundColor: !newProject.is_public ? LK.primaryMuted : LK.surfaceRaised,
                      border: `1px solid ${!newProject.is_public ? LK.primary : LK.border}`,
                      color: !newProject.is_public ? LK.primary : LK.body,
                    }}
                  >
                    <Lock size={18} />
                    部门项目
                  </button>
                </div>
                <p className="text-[11px]" style={{ color: LK.muted }}>
                  {newProject.is_public
                    ? '公开项目：所有用户可见，但仍由归属部门管理员负责维护。'
                    : '部门项目：仅归属部门及上级部门用户可见。'}
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
                  style={{ backgroundColor: LK.surfaceRaised, color: LK.body, border: `1px solid ${LK.border}` }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = LK.ink)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = LK.body)}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                  style={{ backgroundColor: LK.primary, color: '#ffffff' }}
                  onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = LK.primaryDeep; }}
                  onMouseLeave={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = LK.primary; }}
                >
                  {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                  立即创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showConfirm.show && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in"
          style={{ backgroundColor: 'rgba(5, 10, 20, 0.72)', backdropFilter: 'blur(6px)' }}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl animate-in"
            style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
          >
            <div className="px-6 py-7 text-center">
              <div
                className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-md"
                style={{ backgroundColor: `${LK.error}14`, color: LK.error }}
              >
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-lg font-semibold" style={{ color: LK.ink }}>
                确认删除项目？
              </h3>
              <p className="mt-2.5 text-sm leading-6" style={{ color: LK.body }}>
                您正准备移除 <span style={{ color: LK.error }} className="font-semibold">{showConfirm.ids.length}</span> 个项目空间。
                此操作将同步销毁关联的 <span style={{ color: LK.error }} className="font-semibold">K8S Namespace</span> 及其中运行的所有容器资产，且不可恢复。
              </p>
            </div>
            <div className="flex gap-2 px-6 pb-6">
              <button
                onClick={() => setShowConfirm({ show: false, ids: [] })}
                disabled={isDeleting}
                className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
                style={{ backgroundColor: LK.surfaceRaised, color: LK.body, border: `1px solid ${LK.border}` }}
              >
                保留
              </button>
              <button
                onClick={executeDelete}
                disabled={isDeleting}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                style={{ backgroundColor: LK.error, color: '#ffffff' }}
              >
                {isDeleting ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {isEditModalOpen && editingProject && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in"
          style={{ backgroundColor: 'rgba(5, 10, 20, 0.72)', backdropFilter: 'blur(6px)' }}
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-2xl animate-in"
            style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
          >
            <div className="flex items-start gap-3 px-6 pb-0 pt-6" style={{ borderBottom: `1px solid ${LK.borderSoft}` }}>
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                style={{ backgroundColor: LK.primaryMuted, color: LK.primary }}
              >
                <Edit3 size={18} />
              </div>
              <div className="flex-1 pb-5">
                <h3 className="text-lg font-semibold leading-7" style={{ color: LK.ink }}>
                  编辑项目
                </h3>
                <p className="mt-0.5 text-sm" style={{ color: LK.muted }}>
                  仅归属部门管理员及其上级部门管理员可维护项目信息。
                </p>
              </div>
            </div>

            <form onSubmit={handleEditProject} className="space-y-4 px-6 py-5">
              {error && (
                <div
                  className="flex items-center gap-2 rounded-md px-3 py-2.5 text-xs"
                  style={{ backgroundColor: `${LK.error}14`, border: `1px solid ${LK.error}40`, color: LK.error }}
                >
                  <AlertTriangle size={14} /> {error}
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: LK.mutedSoft }}>项目名称 *</label>
                <input
                  required
                  placeholder="例如：核心业务 API 渗透测试"
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                  style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
                  value={editForm.name}
                  onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: LK.mutedSoft }}>项目简述</label>
                <textarea
                  rows={3}
                  placeholder="描述该项目的评估目标与范围..."
                  className="w-full resize-none rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                  style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
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
                <label className="text-xs font-medium" style={{ color: LK.mutedSoft }}>项目可见性 *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditForm({ ...editForm, is_public: true })}
                    className="flex flex-col items-center gap-1.5 rounded-lg px-3 py-3 text-sm font-medium transition-colors"
                    style={{
                      backgroundColor: editForm.is_public ? LK.primaryMuted : LK.surfaceRaised,
                      border: `1px solid ${editForm.is_public ? LK.primary : LK.border}`,
                      color: editForm.is_public ? LK.primary : LK.body,
                    }}
                  >
                    <Globe size={18} />
                    公开项目
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditForm({ ...editForm, is_public: false })}
                    className="flex flex-col items-center gap-1.5 rounded-lg px-3 py-3 text-sm font-medium transition-colors"
                    style={{
                      backgroundColor: !editForm.is_public ? LK.primaryMuted : LK.surfaceRaised,
                      border: `1px solid ${!editForm.is_public ? LK.primary : LK.border}`,
                      color: !editForm.is_public ? LK.primary : LK.body,
                    }}
                  >
                    <Lock size={18} />
                    部门项目
                  </button>
                </div>
                <p className="text-[11px]" style={{ color: LK.muted }}>
                  {editForm.is_public
                    ? '公开项目：所有用户可见，编辑/删除仍受归属部门管理员控制。'
                    : '部门项目：仅归属部门与上级部门用户可见。'}
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
                  style={{ backgroundColor: LK.surfaceRaised, color: LK.body, border: `1px solid ${LK.border}` }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = LK.ink)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = LK.body)}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                  style={{ backgroundColor: LK.primary, color: '#ffffff' }}
                  onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = LK.primaryDeep; }}
                  onMouseLeave={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = LK.primary; }}
                >
                  {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <Edit3 size={16} />}
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
