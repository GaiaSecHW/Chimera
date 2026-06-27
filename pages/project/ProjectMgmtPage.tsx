import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Edit3,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Server,
  Trash2,
  Users,
} from 'lucide-react';
import { api } from '../../clients/api';
import { API_BASE, getHeaders, handleResponse } from '../../clients/base';
import { orgApi, UserPermissionInfo } from '../../clients/org';
import { DataTable, DataTableColumn, DropdownSelect, PageHeader } from '../../design-system';
import { Department, ProductTreeNode, ProductVersionNode, SecurityProject } from '../../types/types';
import { StatusBadge } from '../../components/StatusBadge';
import { useUiFeedback } from '../../components/UiFeedback';
import { ProjectMemberModal } from './ProjectMemberModal';

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

type ProjectSortField = 'created_at' | 'updated_at' | 'name' | 'department_name' | 'owner_name' | 'product_version';
type ProjectSortDirection = 'asc' | 'desc';

const PROJECT_SORT_FIELDS: readonly ProjectSortField[] = ['created_at', 'updated_at', 'name', 'department_name', 'owner_name', 'product_version'];

// LOKI design tokens (DESIGN.md) — page-local palette.
const LK = {
  primary: '#2563EB',
  primarySoft: '#7590ff',
  primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'var(--brand-primary-mask)',
  canvas: 'var(--bg-app)',
  surface: 'var(--bg-surface)',
  surfaceRaised: 'var(--bg-app)',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: 'var(--border-default)',
  borderSoft: 'var(--border-default)',
  ink: 'var(--text-primary)',
  inkSoft: 'var(--text-secondary)',
  body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)',
  mutedSoft: '#8b95a8',
  success: '#30A46C',
  warning: '#D97706',
  error: '#DC2626',
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
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    const saved = Number(localStorage.getItem('chimera:projectList:pageSize'));
    return saved && [10, 20, 50, 100].includes(saved) ? saved : 20;
  });
  const [sortField, setSortField] = useState<ProjectSortField>(() => {
    const saved = localStorage.getItem('chimera:projectList:sortField');
    return saved && (PROJECT_SORT_FIELDS as readonly string[]).includes(saved) ? (saved as ProjectSortField) : 'updated_at';
  });
  const [sortDirection, setSortDirection] = useState<ProjectSortDirection>(() => {
    return localStorage.getItem('chimera:projectList:sortDirection') === 'asc' ? 'asc' : 'desc';
  });
  const [tableProjects, setTableProjects] = useState<SecurityProject[]>([]);
  const [tableTotal, setTableTotal] = useState(0);
  const [tableLoading, setTableLoading] = useState(false);
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState<{ show: boolean; ids: string[] }>({ show: false, ids: [] });
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<SecurityProject | null>(null);
  const [memberModalProject, setMemberModalProject] = useState<SecurityProject | null>(null);
  const [newProject, setNewProject] = useState<ProjectFormState>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<ProjectFormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
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
    setVulnCount(vulnRes.status === 'fulfilled' ? Number(vulnRes.value?.human_finished_reason_counts?.vulnerable || 0) : null);
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

  // 成员管理权限：仅项目创建人或 super_admin。部门管理员有项目编辑/删除权(can_manage)
  // 但不能管理成员，故独立于 can_manage 判定。
  const canManageProjectMembers = (project: SecurityProject) => {
    if (!userPermissions) return false;
    return !!userPermissions.is_admin || String(userPermissions.user_id) === (project.owner_id || '');
  };

  const totalPages = Math.max(1, Math.ceil(tableTotal / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  // Debounce search input; reset to page 1 when the debounced term changes.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Server-side fetch: query backend whenever search / page / size / sort or a manual reload changes.
  useEffect(() => {
    let cancelled = false;
    setTableLoading(true);
    projectApi.projects
      .list({
        search: debouncedSearch.trim() || undefined,
        page: currentPage,
        page_size: pageSize,
        sort_by: sortField,
        sort_direction: sortDirection,
      })
      .then((data) => {
        if (cancelled) return;
        setTableProjects(data.projects || []);
        setTableTotal(data.total || 0);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('加载项目列表失败:', err);
        setTableProjects([]);
        setTableTotal(0);
      })
      .finally(() => {
        if (!cancelled) setTableLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, currentPage, pageSize, sortField, sortDirection, reloadTrigger]);

  // Keep current page in bounds when the total shrinks (e.g. after delete).
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

  const handleSortChange = (field: string, direction: 'asc' | 'desc') => {
    setSortField(field as ProjectSortField);
    setSortDirection(direction);
    setCurrentPage(1);
    localStorage.setItem('chimera:projectList:sortField', field);
    localStorage.setItem('chimera:projectList:sortDirection', direction);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setReloadTrigger((n) => n + 1);
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
      setReloadTrigger((n) => n + 1);
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

      await projectApi.projects.update(editingProject.id, {
        name: editForm.name,
        description: editForm.description,
        is_public: editForm.is_public,
        department_id: Number(editForm.department_id),
        product_version_id: productVersionId || null,
      });
      setIsEditModalOpen(false);
      setEditingProject(null);
      await refreshProjects();
      setReloadTrigger((n) => n + 1);
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
    setProductSearch(project.product_name || '');
    setSelectedProductId(project.product_id || null);
    setVersionSearch(project.product_version_name || '');
    setSelectedVersionId(project.product_version_id || null);
    setShowProductDropdown(false);
    setShowVersionDropdown(false);
    setError(null);
    setIsEditModalOpen(true);
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
      await refreshProjects();
      setReloadTrigger((n) => n + 1);
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
      <DropdownSelect
        value={value}
        onChange={onChange}
        options={[
          { value: '', label: '请选择归属部门' },
          ...selectableDepartments.map((department) => ({ value: String(department.id), label: department.name })),
        ]}
        placeholder="请选择归属部门"
        emptyText="暂无可用部门"
      />
      <p className="text-[11px]" style={{ color: LK.muted }}>{helperText}</p>
    </div>
  );

  const renderProductComboBox = () => (
    <div className="space-y-1.5" ref={productDropdownRef}>
      <label className="text-xs font-medium" style={{ color: LK.mutedSoft }}>产品名称 <span className="required"> *</span></label>
      <div className="relative">
        <input
          placeholder="输入产品名称，或从列表选择..."
          className="form-input w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
          onFocus={(e) => {
            setShowProductDropdown(true);
          }}
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
  );

  const renderVersionComboBox = () => (
    <div className="space-y-1.5" ref={versionDropdownRef}>
      <label className="text-xs font-medium" style={{ color: LK.mutedSoft }}>版本号 <span className="required"> *</span></label>
      <div className="relative">
        <input
          placeholder={selectedProductId ? '输入版本号，或从列表选择...' : '请先选择或输入产品名称'}
          className="form-input w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
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
                  setVersionSearch(v.name);
                  setSelectedVersionId(v.id);
                  setShowVersionDropdown(false);
                }}
              >
                {v.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="text-[11px]" style={{ color: LK.muted }}>
        {selectedVersionId ? '已选择现有版本' : versionSearch.trim() ? '将创建新版本' : '选择已有版本或输入新版本号'}
      </p>
    </div>
  );

  return (
    <div
      className="space-y-4 px-5 py-5 md:px-6 2xl:px-8"
      style={{ backgroundColor: LK.canvas, minHeight: '100%', color: LK.inkSoft }}
    >
      {/* Page header */}
      <PageHeader
        title="项目概览"
        description="统一展示用户权限范围内的所有项目"
      />

      {/* Stat blocks — 4 columns */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: '项目', value: tableTotal, icon: Building2, color: LK.primary },
          { label: '任务', value: taskCount !== null ? taskCount : '-', icon: Layers, color: LK.success },
          { label: '环境', value: envCount !== null ? envCount : '-', icon: Server, color: LK.warning },
          { label: '漏洞', value: vulnCount !== null ? vulnCount : '-', icon: AlertTriangle, color: LK.error },
        ].map((stat) => (
          <div
            key={stat.label}
            className="flex items-center justify-between rounded-xl p-4"
            style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
          >
            <div>
              <div className="text-xs" style={{ color: LK.muted }}>
                {stat.label}
              </div>
              <div className="mt-1 text-3xl font-semibold tabular-nums" style={{ color: stat.color }}>
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


      {/* Unified project table */}
      <section
        className="overflow-hidden rounded-xl"
        style={{ backgroundColor: LK.surface }}
      >
        <div className="flex items-center gap-2 px-4 py-3">
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
              className="form-input w-full pl-10"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <button
            onClick={handleRefresh}
            className="shrink-0 rounded-lg px-4 py-2.5 transition-colors"
            style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}`, color: LK.body }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = LK.primary; e.currentTarget.style.color = LK.primarySoft; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = LK.border; e.currentTarget.style.color = LK.body; }}
            title="刷新列表"
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        </div>
        {(() => {
          const columns: DataTableColumn<SecurityProject>[] = [
            {
              key: 'name',
              header: '项目',
              width: '20%',
              render: (project) => (
                <button
                  onClick={(e) => { e.stopPropagation(); handleRowClick(project.id); }}
                  className="text-sm hover:underline"
                  style={{ color: LK.primary }}
                >
                  {project.name}
                </button>
              ),
            },
            {
              key: 'department_name',
              header: '归属部门',
              width: '15%',
              sortable: true,
              sortKey: 'department_name',
              defaultDirection: 'asc',
              render: (project) => (
                <span className="text-sm" style={{ color: LK.body }}>
                  {project.department_name || '未绑定'}
                </span>
              ),
            },
            {
              key: 'product_version',
              header: '产品版本',
              width: '15%',
              sortable: true,
              sortKey: 'product_version',
              defaultDirection: 'asc',
              render: (project) => (
                <div className="text-sm font-medium" style={{ color: LK.inkSoft }}>
                  {project.product_version || project.product_version_name || '未归属版本'}
                </div>
              ),
            },
            {
              key: 'owner_name',
              header: '创建人',
              width: '15%',
              sortable: true,
              sortKey: 'owner_name',
              defaultDirection: 'asc',
              render: (project) => (
                <span className="text-sm" style={{ color: LK.body }}>
                  {project.owner_name || '-'}
                </span>
              ),
            },
            {
              key: 'created_at',
              header: '创建时间',
              width: '15%',
              sortable: true,
              sortKey: 'created_at',
              defaultDirection: 'desc',
              render: (project) => (
                <span className="whitespace-nowrap text-xs" style={{ color: LK.muted }}>
                  {project.created_at ? new Date(project.created_at).toLocaleString() : '未知'}
                </span>
              ),
            },
            {
              key: 'actions',
              header: '操作',
              render: (project) => (
                <div className="flex items-center gap-1">
                  {canManageProjectMembers(project) && (
                    <button
                      onClick={(event) => { event.stopPropagation(); setMemberModalProject(project); }}
                      className="rounded-md p-1.5 transition-colors"
                      style={{ color: LK.muted }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.primaryMuted; e.currentTarget.style.color = LK.primary; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = LK.muted; }}
                      title="成员管理"
                    >
                      <Users size={15} />
                    </button>
                  )}
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
              ),
            },
          ];
          return (
            <DataTable<SecurityProject>
              columns={columns}
              data={tableProjects}
              rowKey={(project) => project.id}
              showRowNumber={true}
              loading={tableLoading}
              sort={{ field: sortField, direction: sortDirection }}
              onSortChange={({ field, direction }) => handleSortChange(field, direction)}
              pagination={
                tableTotal > 0
                  ? {
                      page: safePage,
                      perPage: pageSize,
                      total: tableTotal,
                      perPageOptions: [10, 20, 50, 100],
                      onPageChange: (next) => setCurrentPage(next),
                      onPerPageChange: (next) => handlePageSizeChange(next),
                    }
                  : undefined
              }
              empty={
                <div className="flex flex-col items-center gap-3 py-14 text-center">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-md"
                    style={{ backgroundColor: LK.surfaceRaised, color: LK.muted }}
                  >
                    <Building2 size={20} />
                  </div>
                  <p className="text-sm" style={{ color: LK.muted }}>
                    {debouncedSearch.trim() ? '没有匹配的项目' : '当前没有项目'}
                  </p>
                </div>
              }
            />
          );
        })()}
      </section>

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
                  className="form-input w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                  value={newProject.name}
                  onChange={(event) => setNewProject({ ...newProject, name: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: LK.mutedSoft }}>项目简述</label>
                <textarea
                  rows={3}
                  placeholder="描述该项目的评估目标与范围..."
                  className="form-textarea w-full resize-none rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                  value={newProject.description}
                  onChange={(event) => setNewProject({ ...newProject, description: event.target.value })}
                />
              </div>

              {renderDepartmentSelect(
                newProject.department_id,
                (department_id) => setNewProject({ ...newProject, department_id }),
                '项目仅对该部门及其上级部门可见；归属部门管理员负责维护。'
              )}

              {renderProductComboBox()}

              {renderVersionComboBox()}

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
                  className="form-input w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                  value={editForm.name}
                  onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: LK.mutedSoft }}>项目简述</label>
                <textarea
                  rows={3}
                  placeholder="描述该项目的评估目标与范围..."
                  className="form-textarea w-full resize-none rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                  value={editForm.description}
                  onChange={(event) => setEditForm({ ...editForm, description: event.target.value })}
                />
              </div>

              {renderDepartmentSelect(
                editForm.department_id,
                (department_id) => setEditForm({ ...editForm, department_id }),
                '归属部门决定私有项目的可见范围，同时决定哪些部门管理员可编辑和删除项目。'
              )}

              {renderProductComboBox()}

              {renderVersionComboBox()}

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
      {memberModalProject && (
        <ProjectMemberModal
          projectId={memberModalProject.id}
          projectName={memberModalProject.name}
          onClose={() => setMemberModalProject(null)}
        />
      )}
      {feedbackNodes}
    </div>
  );
};
