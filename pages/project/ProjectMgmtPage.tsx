import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Server,
  Square,
  Trash2,
} from 'lucide-react';
import { api } from '../../clients/api';
import { API_BASE, getHeaders, handleResponse } from '../../clients/base';
import { orgApi, UserPermissionInfo } from '../../clients/org';
import { PageHeader } from '../../design-system';
import { Department, ProductTreeNode, ProductVersionNode, SecurityProject } from '../../types/types';
import { StatusBadge } from '../../components/StatusBadge';
import { useUiFeedback } from '../../components/UiFeedback';

interface ProjectMgmtPageProps {
  projects: SecurityProject[];
  setSelectedProjectId: (id: string) => void;
  setActiveProjectId: (id: string) => void;
  setCurrentView: (view: string) => void;
  refreshProjects: (showRefresh?: boolean) => Promise<void>;
  openCreateProjectOnNav?: boolean;
  onConsumeOpenCreateProject?: () => void;
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

export const ProjectMgmtPage: React.FC<ProjectMgmtPageProps> = ({
  projects,
  setSelectedProjectId,
  setActiveProjectId,
  setCurrentView,
  refreshProjects,
  openCreateProjectOnNav,
  onConsumeOpenCreateProject,
}) => {
  const projectApi = api.domains.project;
  const scheduleApi = api.domains.platform.scheduleCenter;
  const vulnApi = api.domains.vuln.vuln;
  const { confirm, feedbackNodes } = useUiFeedback();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    const saved = Number(localStorage.getItem('chimera:projectList:pageSize'));
    return saved && [10, 20, 50, 100].includes(saved) ? saved : 10;
  });
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

  // Placeholder counts for new stat blocks — will be wired to real API later
  const [taskCount, setTaskCount] = useState<number | null>(null);
  const [envCount, setEnvCount] = useState<number | null>(null);
  const [vulnCount, setVulnCount] = useState<number | null>(null);

  // ComboBox state for create dialog
  const [productSearch, setProductSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [versionSearch, setVersionSearch] = useState('');
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [showVersionDropdown, setShowVersionDropdown] = useState(false);

  const productDropdownRef = useRef<HTMLDivElement>(null);
  const versionDropdownRef = useRef<HTMLDivElement>(null);

  const loadStats = async () => {
    const envStats = (projects || []).map((p) =>
      fetch(`${API_BASE}/api/agent/agents/stats?project_id=${encodeURIComponent(p.id)}`, { headers: getHeaders() })
        .then((r) => handleResponse(r))
        .catch(() => null),
    );
    const [taskRes, vulnRes, ...envResults] = await Promise.allSettled([
      scheduleApi.listGlobalTasks({ page: 1, page_size: 1 }),
      vulnApi.getOverview(),
      ...envStats,
    ]);
    setTaskCount(taskRes.status === 'fulfilled' ? Number(taskRes.value?.total || 0) : null);
    setVulnCount(vulnRes.status === 'fulfilled' ? Number(vulnRes.value?.metrics?.total_cases || 0) : null);
    const envTotal = envResults.reduce<number>((sum, res) => {
      if (res.status === 'fulfilled' && res.value) {
        return sum + Number(res.value?.summary?.total_agents || 0);
      }
      return sum;
    }, 0);
    setEnvCount(envResults.some((res) => res.status === 'fulfilled') ? envTotal : null);
  };

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

  useEffect(() => {
    if (projects.length === 0) return;
    void loadStats();
  }, [projects.length]);

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (productDropdownRef.current && !productDropdownRef.current.contains(e.target as Node)) {
        setShowProductDropdown(false);
      }
      if (versionDropdownRef.current && !versionDropdownRef.current.contains(e.target as Node)) {
        setShowVersionDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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

  // ComboBox derived data
  const leafProducts = useMemo(() => {
    const flat = (nodes: ProductTreeNode[]): ProductTreeNode[] =>
      nodes.flatMap((n) => [n, ...flat(n.children || [])]);
    return flat(productTree).filter((n) => n.is_leaf);
  }, [productTree]);

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return leafProducts;
    return leafProducts.filter((p) => p.name.toLowerCase().includes(productSearch.toLowerCase()));
  }, [leafProducts, productSearch]);

  const selectedProductVersions = useMemo(() => {
    if (!selectedProductId) return [];
    const product = leafProducts.find((p) => String(p.id) === selectedProductId);
    return product?.versions || [];
  }, [selectedProductId, leafProducts]);

  const filteredVersions = useMemo(() => {
    if (!versionSearch.trim()) return selectedProductVersions;
    return selectedProductVersions.filter(
      (v) =>
        v.version.toLowerCase().includes(versionSearch.toLowerCase()) ||
        (v.name && v.name.toLowerCase().includes(versionSearch.toLowerCase()))
    );
  }, [selectedProductVersions, versionSearch]);

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

  const manageableProjects = useMemo(
    () => filteredProjects.filter((project) => project.can_manage),
    [filteredProjects]
  );

  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pagedProjects = useMemo(
    () => filteredProjects.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredProjects, safePage, pageSize]
  );
  const pageStart = filteredProjects.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const pageEnd = Math.min(safePage * pageSize, filteredProjects.length);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const handlePageSizeChange = (next: number) => {
    setPageSize(next);
    localStorage.setItem('chimera:projectList:pageSize', String(next));
    setCurrentPage(1);
  };

  const isAllSelected = manageableProjects.length > 0 && manageableProjects.every((project) => selectedIds.has(project.id));

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refreshProjects(true), loadStats()]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const getDefaultDepartmentId = () => {
    const defaultDepartment = selectableDepartments[0];
    return defaultDepartment ? String(defaultDepartment.id) : '';
  };

  const resetCreateForm = () => {
    setNewProject(EMPTY_FORM);
    setProductSearch('');
    setSelectedProductId(null);
    setVersionSearch('');
    setSelectedVersionId(null);
    setShowProductDropdown(false);
    setShowVersionDropdown(false);
  };

  const openCreateModal = () => {
    setError(null);
    resetCreateForm();
    setNewProject({
      ...EMPTY_FORM,
      department_id: getDefaultDepartmentId(),
    });
    setIsCreateModalOpen(true);
  };

  useEffect(() => {
    if (openCreateProjectOnNav) {
      openCreateModal();
      onConsumeOpenCreateProject?.();
    }
  }, [openCreateProjectOnNav, onConsumeOpenCreateProject]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProject.department_id) {
      setError('请选择项目归属部门');
      return;
    }
    if (!productSearch.trim()) {
      setError('请输入或选择产品名称');
      return;
    }
    if (!versionSearch.trim()) {
      setError('请输入或选择版本号');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      let productVersionId = selectedVersionId;

      if (!selectedProductId) {
        // New product + new version
        const newProd = await projectApi.products.create({ name: productSearch, code: productSearch });
        const newVer = await projectApi.products.createVersion(String(newProd.id), { version: versionSearch, name: versionSearch });
        productVersionId = newVer.id;
      } else if (!selectedVersionId) {
        // Existing product + new version
        const newVer = await projectApi.products.createVersion(selectedProductId, { version: versionSearch, name: versionSearch });
        productVersionId = newVer.id;
      }
      // else: existing product + existing version — selectedVersionId already set

      const createdProject = await projectApi.projects.create({
        name: newProject.name,
        description: newProject.description,
        is_public: false, // Always department project
        department_id: Number(newProject.department_id),
        product_version_id: productVersionId!,
      });
      const createdProjectName = createdProject.name || newProject.name || `${productSearch} / ${versionSearch}`;
      setIsCreateModalOpen(false);
      resetCreateForm();
      await refreshProjects();
      const goCreateTask = await confirm({
        title: '项目创建成功',
        message: `项目「${createdProjectName}」已初始化。是否前往测试任务中心创建测试任务？`,
        confirmText: '去创建任务',
        cancelText: '暂不',
      });
      if (goCreateTask) {
        sessionStorage.setItem('chimera:pendingNav', JSON.stringify({
          view: 'task-list',
          openCreateTask: true,
          projectId: createdProject.id,
        }));
        window.open(window.location.href, '_blank');
      }
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

  const renderDepartmentSelect = (
    value: string,
    onChange: (departmentId: string) => void,
    helperText: string
  ) => (
    <div className="space-y-1.5">
      <label className="text-xs font-medium" style={{ color: LK.mutedSoft }}>归属部门 <span className="required"> *</span></label>
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
      <label className="text-xs font-medium" style={{ color: LK.mutedSoft }}>产品版本 <span className="required"> *</span></label>
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
      {/* Page header */}
      <PageHeader
        title="项目概览"
        description="统一展示用户权限范围内的所有项目"
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              className="btn-icon"
              title="刷新列表"
              aria-label="刷新列表"
            >
              <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              disabled={!userPermissions || selectableDepartments.length === 0}
              className="btn btn-primary"
            >
              <Plus size={16} /> 初始化项目
            </button>
          </div>
        }
      />

      {/* Batch selection bar */}
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

      {/* Stat blocks — 4 columns */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: '项目', value: projects.length, icon: Building2, color: LK.primary },
          { label: '任务', value: taskCount !== null ? taskCount : '-', icon: Layers, color: LK.success },
          { label: '环境', value: envCount !== null ? envCount : '-', icon: Server, color: LK.warning },
          { label: '漏洞', value: vulnCount !== null ? vulnCount : '-', icon: AlertTriangle, color: LK.error },
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

      {/* Admin notice */}
      {userPermissions?.platform_role === 'ordinary_admin' && (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{ backgroundColor: `${LK.warning}14`, border: `1px solid ${LK.warning}40`, color: LK.warning }}
        >
          普通管理员只能编辑或删除所属部门及下级部门归属的项目；上级部门管理员可见下级部门项目，因此也可在其部门树范围内进行维护。
        </div>
      )}

      {/* Action bar: 初始化项目 -> 搜索框 -> 刷新 */}
      <div className="flex items-center gap-2">
        <button
          onClick={openCreateModal}
          disabled={!userPermissions || selectableDepartments.length === 0}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: LK.primary, color: '#ffffff' }}
          onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = LK.primaryDeep; }}
          onMouseLeave={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = LK.primary; }}
        >
          <Plus size={16} /> 初始化项目
        </button>
        <div className="relative flex flex-1 items-center">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-theme-text-faint" size={16} />
          <input
            type="text"
            placeholder="搜索项目名称、负责人、归属部门、产品路径、版本号..."
            className="form-input w-full pl-10 pr-10"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <button
            onClick={toggleSelectAll}
            className="absolute right-3 text-theme-text-muted transition-colors hover:text-theme-primary"
            title={isAllSelected ? '取消全选可管理项目' : '全选可管理项目'}
          >
            {isAllSelected ? <CheckSquare size={16} /> : <Square size={16} />}
          </button>
        </div>
        <button
          onClick={handleRefresh}
          className="shrink-0 rounded-lg p-2.5 transition-colors"
          style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}`, color: LK.body }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = LK.primary; e.currentTarget.style.color = LK.primarySoft; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = LK.border; e.currentTarget.style.color = LK.body; }}
          title="刷新列表"
        >
          <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Unified project table */}
      <section
        className="overflow-hidden rounded-xl"
        style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
      >
        {filteredProjects.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider" style={{ color: LK.mutedSoft }}>
                  <th className="whitespace-nowrap w-12 px-3 py-2.5 font-medium" style={{ borderBottom: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>选择</th>
                  <th className="whitespace-nowrap min-w-[180px] px-3 py-2.5 font-medium" style={{ borderBottom: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>项目</th>
                  <th className="whitespace-nowrap min-w-[140px] px-3 py-2.5 font-medium" style={{ borderBottom: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>归属部门</th>
                  <th className="whitespace-nowrap min-w-[110px] px-3 py-2.5 font-medium" style={{ borderBottom: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>项目成员</th>
                  <th className="whitespace-nowrap min-w-[200px] px-3 py-2.5 font-medium" style={{ borderBottom: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>产品版本</th>
                  <th className="whitespace-nowrap min-w-[140px] px-3 py-2.5 font-medium" style={{ borderBottom: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>创建时间</th>
                  <th className="whitespace-nowrap w-24 px-3 py-2.5 text-right font-medium" style={{ borderBottom: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {pagedProjects.map((project) => {
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
                      {/* 选择 */}
                      <td className="whitespace-nowrap px-3 py-3" style={{ borderBottom: `1px solid ${LK.borderSoft}` }}>
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
                      {/* 项目 — name only, clickable */}
                      <td className="whitespace-nowrap px-3 py-3" style={{ borderBottom: `1px solid ${LK.borderSoft}` }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRowClick(project.id); }}
                          className="text-sm font-semibold hover:underline"
                          style={{ color: LK.primary }}
                        >
                          {project.name}
                        </button>
                      </td>
                      {/* 归属部门 */}
                      <td className="whitespace-nowrap px-3 py-3 text-sm" style={{ borderBottom: `1px solid ${LK.borderSoft}`, color: LK.body }}>
                        {project.department_name || '未绑定'}
                      </td>
                      {/* 项目成员 */}
                      <td
                        className="whitespace-nowrap truncate max-w-[120px] px-3 py-3 text-sm"
                        style={{ borderBottom: `1px solid ${LK.borderSoft}`, color: LK.body }}
                        title={project.owner_name || '-'}
                      >
                        {project.owner_name || '-'}
                      </td>
                      {/* 产品版本 */}
                      <td className="whitespace-nowrap px-3 py-3" style={{ borderBottom: `1px solid ${LK.borderSoft}` }}>
                        <div className="text-sm font-medium" style={{ color: LK.inkSoft }}>
                          {project.product_version || project.product_version_name || '未归属版本'}
                        </div>
                      </td>
                      {/* 创建时间 */}
                      <td className="whitespace-nowrap px-3 py-3 text-xs" style={{ borderBottom: `1px solid ${LK.borderSoft}`, color: LK.muted }}>
                        {project.created_at ? new Date(project.created_at).toLocaleString() : '未知'}
                      </td>
                      {/* 操作 — edit + delete only */}
                      <td className="whitespace-nowrap px-3 py-3" style={{ borderBottom: `1px solid ${LK.borderSoft}` }}>
                        <div className="flex items-center justify-end gap-1">
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
              <Building2 size={20} />
            </div>
            <p className="text-sm" style={{ color: LK.muted }}>
              {searchTerm.trim() ? '没有匹配的项目' : '当前没有项目'}
            </p>
          </div>
        )}
      </section>

      {/* Pagination */}
      {filteredProjects.length > 0 && (
        <div
          className="flex flex-col items-center justify-between gap-3 rounded-xl px-4 py-3 md:flex-row"
          style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
        >
          <div className="text-xs" style={{ color: LK.muted }}>
            共 <span style={{ color: LK.inkSoft }} className="font-semibold">{filteredProjects.length}</span> 项，
            当前显示 <span style={{ color: LK.inkSoft }}>{pageStart}-{pageEnd}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: LK.muted }}>每页</span>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="rounded-md px-2 py-1 text-xs outline-none transition-colors"
                style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
              >
                {[10, 20, 50, 100].map((size) => (
                  <option key={size} value={size}>{size} 条</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="rounded-md p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                style={{ color: LK.body, border: `1px solid ${LK.border}` }}
                onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.color = LK.primary; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = LK.body; }}
                title="上一页"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="min-w-[60px] text-center text-xs tabular-nums" style={{ color: LK.inkSoft }}>
                {safePage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="rounded-md p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                style={{ color: LK.body, border: `1px solid ${LK.border}` }}
                onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.color = LK.primary; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = LK.body; }}
                title="下一页"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create project dialog */}
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
                <label className="text-xs font-medium" style={{ color: LK.mutedSoft }}>项目名称 <span className="required"> *</span></label>
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
                '项目仅对该部门及其上级部门可见；归属部门管理员负责维护。'
              )}

              {/* Product ComboBox */}
              <div className="space-y-1.5" ref={productDropdownRef}>
                <label className="text-xs font-medium" style={{ color: LK.mutedSoft }}>产品名称 <span className="required"> *</span></label>
                <div className="relative">
                  <input
                    placeholder="输入产品名称，或从列表选择..."
                    className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                    style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = LK.primary;
                      setShowProductDropdown(true);
                    }}
                    onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
                    value={productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      setSelectedProductId(null);
                      setVersionSearch('');
                      setSelectedVersionId(null);
                      setShowProductDropdown(true);
                    }}
                  />
                  {showProductDropdown && filteredProducts.length > 0 && (
                    <div
                      className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-lg py-1"
                      style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}`, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
                    >
                      {filteredProducts.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm transition-colors"
                          style={{ color: LK.inkSoft }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = LK.primaryMuted)}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setProductSearch(p.name);
                            setSelectedProductId(String(p.id));
                            setVersionSearch('');
                            setSelectedVersionId(null);
                            setShowProductDropdown(false);
                          }}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-[11px]" style={{ color: LK.muted }}>
                  {selectedProductId ? '已选择现有产品' : productSearch.trim() ? '将创建新产品' : '从产品树叶子节点选择，或输入新产品名称'}
                </p>
              </div>

              {/* Version ComboBox */}
              <div className="space-y-1.5" ref={versionDropdownRef}>
                <label className="text-xs font-medium" style={{ color: LK.mutedSoft }}>版本号 <span className="required"> *</span></label>
                <div className="relative">
                  <input
                    placeholder={selectedProductId ? '输入版本号，或从列表选择...' : '请先选择或输入产品名称'}
                    className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                    style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = LK.primary;
                      setShowVersionDropdown(true);
                    }}
                    onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
                    value={versionSearch}
                    onChange={(e) => {
                      setVersionSearch(e.target.value);
                      setSelectedVersionId(null);
                      setShowVersionDropdown(true);
                    }}
                  />
                  {showVersionDropdown && filteredVersions.length > 0 && (
                    <div
                      className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-lg py-1"
                      style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}`, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
                    >
                      {filteredVersions.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm transition-colors"
                          style={{ color: LK.inkSoft }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = LK.primaryMuted)}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setVersionSearch(v.version + (v.name ? ` · ${v.name}` : ''));
                            setSelectedVersionId(v.id);
                            setShowVersionDropdown(false);
                          }}
                        >
                          {v.version}{v.name ? ` · ${v.name}` : ''}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-[11px]" style={{ color: LK.muted }}>
                  {selectedVersionId ? '已选择现有版本' : versionSearch.trim() ? '将创建新版本' : '选择已有版本或输入新版本号'}
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setIsCreateModalOpen(false); resetCreateForm(); }}
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

      {/* Delete confirmation dialog */}
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

      {/* Edit project dialog */}
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
                <label className="text-xs font-medium" style={{ color: LK.mutedSoft }}>项目名称 <span className="required"> *</span></label>
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
      {feedbackNodes}
    </div>
  );
};
