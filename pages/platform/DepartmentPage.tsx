import React, { useEffect, useMemo, useState } from 'react';
import { Building2, ChevronDown, Edit3, GitBranch, Loader2, Lock, Plus, RefreshCw, Search, Trash2, Users } from 'lucide-react';
import { api } from '../../clients/api';
import { UserPermissionInfo } from '../../clients/org';
import { showConfirm } from '../../components/DialogService';
import { Department } from '../../types/types';

type DepartmentTreeNode = Department & {
  children: DepartmentTreeNode[];
  hasCircularReference?: boolean;
};

export const DepartmentPage: React.FC = () => {
  const platformApi = api.domains.platform;
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '', parent_id: '' });
  const [userPermissions, setUserPermissions] = useState<UserPermissionInfo | null>(null);
  const [expandedDepts, setExpandedDepts] = useState<Set<number>>(() => {
    const saved = localStorage.getItem('expandedDepartments');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  useEffect(() => {
    void refreshPageData();
  }, []);

  useEffect(() => {
    localStorage.setItem('expandedDepartments', JSON.stringify([...expandedDepts]));
  }, [expandedDepts]);

  const refreshPageData = async () => {
    setLoading(true);
    try {
      const [departmentData, permissionData] = await Promise.all([
        platformApi.org.listDepartments(),
        platformApi.org.getUserPermissions(),
      ]);
      setDepartments(departmentData || []);
      setUserPermissions(permissionData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = () => userPermissions?.is_admin || false;

  const canManageDepartment = (deptId: number): boolean => {
    if (!userPermissions) return false;
    return userPermissions.is_admin || (userPermissions.department_structure_manageable_ids || []).includes(deptId);
  };

  const toggleExpand = (deptId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(deptId)) {
        next.delete(deptId);
      } else {
        next.add(deptId);
      }
      return next;
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      const payload: { name: string; description: string; parent_id?: number } = {
        name: formData.name,
        description: formData.description,
      };
      if (formData.parent_id) {
        payload.parent_id = parseInt(formData.parent_id, 10);
      }
      await platformApi.org.createDepartment(payload);
      setIsCreateModalOpen(false);
      setFormData({ name: '', description: '', parent_id: '' });
      await refreshPageData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDepartment) return;
    setFormLoading(true);
    try {
      const payload: { name: string; description: string; parent_id?: number } = {
        name: formData.name,
        description: formData.description,
      };
      if (formData.parent_id) {
        payload.parent_id = parseInt(formData.parent_id, 10);
      }
      await platformApi.org.updateDepartment(selectedDepartment.id, payload);
      setIsEditModalOpen(false);
      setSelectedDepartment(null);
      setFormData({ name: '', description: '', parent_id: '' });
      await refreshPageData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (departmentId: number) => {
    const confirmed = await showConfirm({
      title: '删除部门',
      message: '确认删除该部门？删除部门将同时删除部门下的所有成员和项目关联。',
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await platformApi.org.deleteDepartment(departmentId);
      await refreshPageData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const openEditModal = (department: Department) => {
    setSelectedDepartment(department);
    setFormData({
      name: department.name,
      description: department.description || '',
      parent_id: department.parent_id ? department.parent_id.toString() : '',
    });
    setIsEditModalOpen(true);
  };

  const childrenByParent = useMemo(() => {
    const map = new Map<number | null, Department[]>();
    const deptIds = new Set(departments.map((dept) => dept.id));

    departments.forEach((dept) => {
      const normalizedParentId = dept.parent_id && deptIds.has(dept.parent_id) ? dept.parent_id : null;
      const current = map.get(normalizedParentId) || [];
      current.push(dept);
      map.set(normalizedParentId, current);
    });

    map.forEach((group) => {
      group.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    });
    return map;
  }, [departments]);

  const buildDepartmentTree = (parentId: number | null = null, visited: Set<number> = new Set()): DepartmentTreeNode[] => {
    return (childrenByParent.get(parentId) || []).map((dept) => {
      if (visited.has(dept.id)) {
        return { ...dept, children: [], hasCircularReference: true };
      }
      const nextVisited = new Set(visited);
      nextVisited.add(dept.id);
      return {
        ...dept,
        children: buildDepartmentTree(dept.id, nextVisited),
      };
    });
  };

  const getAllDescendantIds = (departmentId: number): number[] => {
    const descendants: number[] = [];
    const walk = (parentId: number) => {
      (childrenByParent.get(parentId) || []).forEach((child) => {
        descendants.push(child.id);
        walk(child.id);
      });
    };
    walk(departmentId);
    return descendants;
  };

  const getAvailableParentDepartments = (excludeId?: number): Department[] => {
    if (!excludeId) return departments;
    const excludeIds = new Set([excludeId, ...getAllDescendantIds(excludeId)]);
    return departments.filter((dept) => !excludeIds.has(dept.id));
  };

  const filteredDepartmentIds = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return null;
    return new Set(
      departments
        .filter((dept) => {
          const haystacks = [dept.name, dept.description || ''];
          return haystacks.some((value) => value.toLowerCase().includes(keyword));
        })
        .map((dept) => dept.id),
    );
  }, [departments, searchTerm]);

  const treeMatchesFilter = (node: DepartmentTreeNode): boolean => {
    if (!filteredDepartmentIds) return true;
    if (filteredDepartmentIds.has(node.id)) return true;
    return node.children.some(treeMatchesFilter);
  };

  const departmentTree = useMemo(() => buildDepartmentTree(), [childrenByParent]);
  const visibleDepartmentTree = useMemo(
    () => departmentTree.filter(treeMatchesFilter),
    [departmentTree, filteredDepartmentIds],
  );

  const departmentStats = useMemo(() => {
    const total = departments.length;
    const rootCount = departments.filter((dept) => !dept.parent_id).length;
    const nestedCount = Math.max(total - rootCount, 0);
    const maxDepth = (() => {
      const walk = (nodes: DepartmentTreeNode[], depth: number): number => {
        if (nodes.length === 0) return depth;
        return Math.max(...nodes.map((node) => walk(node.children, depth + 1)));
      };
      return total > 0 ? walk(departmentTree, 0) : 0;
    })();
    return { total, rootCount, nestedCount, maxDepth };
  }, [departments, departmentTree]);

  const renderDepartmentTree = (nodes: DepartmentTreeNode[], depth = 0) => {
    return nodes.filter(treeMatchesFilter).map((dept) => {
      const hasChildren = dept.children.length > 0;
      const isExpanded = expandedDepts.has(dept.id);
      return (
        <div key={dept.id}>
          <div
            className="flex items-center justify-between gap-4 px-6 py-4 transition-all hover:bg-slate-100/90 group"
            style={{ paddingLeft:`${depth * 26 + 24}px` }}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <button
                onClick={(e) => hasChildren && toggleExpand(dept.id, e)}
                className={`flex items-center justify-center w-5 h-5 transition-transform duration-200 ${hasChildren ? 'cursor-pointer' : 'cursor-default'}`}
                disabled={!hasChildren}
              >
                {hasChildren ? (
                  <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`} />
                ) : (
                  <div className="w-4" />
                )}
              </button>
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black shadow-inner ${dept.hasCircularReference ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                <Building2 size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-black text-slate-800 truncate">{dept.name}</p>
                  {dept.hasCircularReference && (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-600 text-[10px] font-black rounded-full border border-amber-200">
                      循环引用
                    </span>
                  )}
                  {depth === 0 && (
                    <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-[10px] font-black uppercase">
                      ROOT
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 font-mono mt-1 truncate">{dept.description || '未配置部门描述'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {canManageDepartment(dept.id) ? (
                <>
                  <button
                    onClick={() => openEditModal(dept)}
 className="p-2.5 bg-slate-50 border border-slate-200 text-slate-400 hover:text-blue-600 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                    title="编辑部门"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    onClick={() => void handleDelete(dept.id)}
 className="p-2.5 bg-red-50 text-red-400 border border-transparent hover:border-red-100 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                    title="删除部门"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              ) : (
                <span className="text-[10px] text-slate-400 font-medium px-2 py-1 bg-slate-100 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                  <Lock size={10} className="inline mr-1" />只读
                </span>
              )}
            </div>
          </div>
          {hasChildren && isExpanded && (
            <div className="overflow-hidden animate-in slide-in-from-top-2 duration-200">
              {renderDepartmentTree(dept.children, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="p-10 space-y-8 animate-in fade-in duration-500 pb-24 h-full overflow-y-auto bg-theme-app">
      <div className="flex justify-between items-end">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
 <div className="p-3 bg-gradient-to-br from-blue-600 via-sky-500 to-cyan-500 text-white rounded-2xl">
              <Building2 size={28} />
            </div>
            <div>
              <h2 className="text-3xl font-black text-slate-800 tracking-tight">组织架构管理</h2>
            </div>
          </div>
        </div>
        <div className="flex gap-4">
 <button onClick={() => void refreshPageData()} className="p-4 bg-slate-50 backdrop-blur border border-slate-200 text-slate-500 rounded-2xl hover:bg-slate-50 transition-all active:scale-95">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
          {isAdmin() && (
 <button onClick={() => setIsCreateModalOpen(true)} className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 hover:bg-blue-700 transition-all active:scale-95">
              <Plus size={20} /> 创建新部门
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
 <div className="bg-[linear-gradient(135deg,_#0f172a,_#1d4ed8_65%,_#38bdf8)] p-8 rounded-[3rem] text-white flex flex-col justify-between group overflow-hidden relative">
          <Building2 className="absolute right-[-20px] top-[-20px] w-32 h-32 opacity-5 rotate-12 group-hover:rotate-0 transition-transform duration-700" />
          <p className="text-slate-200 text-[10px] font-black uppercase tracking-widest relative z-10">总部门数</p>
          <h3 className="text-5xl font-black mt-4 relative z-10">{departmentStats.total}</h3>
          <p className="text-sky-100 text-[10px] font-black uppercase mt-4 relative z-10 flex items-center gap-2">
            <Users size={12} /> Organizational Topology
          </p>
        </div>
 <div className="bg-slate-50 backdrop-blur p-8 rounded-[3rem] border border-emerald-100 flex flex-col justify-between">
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">顶级部门</p>
          <h3 className="text-4xl font-black mt-4 text-green-600">{departmentStats.rootCount}</h3>
          <div className="h-1 bg-slate-100 rounded-full mt-4 overflow-hidden">
            <div className="h-full bg-green-500" style={{ width: `${departmentStats.total > 0 ? (departmentStats.rootCount / departmentStats.total) * 100 : 0}%` }} />
          </div>
        </div>
 <div className="bg-slate-50 backdrop-blur p-8 rounded-[3rem] border border-amber-100 flex flex-col justify-between">
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">层级部门</p>
          <h3 className="text-4xl font-black mt-4 text-amber-600">{departmentStats.nestedCount}</h3>
          <p className="mt-4 text-xs font-semibold text-slate-400">最大深度 {departmentStats.maxDepth} 级</p>
        </div>
 <div className="bg-slate-50 backdrop-blur p-8 rounded-[3rem] border border-slate-200 flex items-center gap-8">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center shrink-0">
            <GitBranch size={32} />
          </div>
          <div>
            <h4 className="text-lg font-black text-slate-800">层级化管理</h4>
            <p className="text-sm text-slate-400 mt-1 font-medium">支持多级部门结构、父子链路展示与只读/可编辑权限分层。</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
          <input
            type="text"
            placeholder="搜索部门名称或描述..."
 className="w-full pl-16 pr-8 py-5 bg-slate-50 backdrop-blur border border-slate-200 rounded-[2.5rem] text-sm outline-none focus:ring-4 ring-blue-500/5 transition-all font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

 <div className="bg-slate-50 backdrop-blur border border-slate-200 rounded-[3rem] overflow-hidden">
          {loading ? (
            <div className="py-32 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" size={40} /></div>
          ) : visibleDepartmentTree.length === 0 ? (
            <div className="py-32 text-center text-slate-400 font-bold">暂无部门数据</div>
          ) : (
            renderDepartmentTree(visibleDepartmentTree)
          )}
        </div>
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
 <div className="bg-slate-50 w-full max-w-md rounded-[3rem] overflow-hidden animate-in zoom-in-95">
            <div className="p-10 pb-4 border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-4">
 <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white">
                  <Plus size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800">创建新部门</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Create Department</p>
                </div>
              </div>
              <button onClick={() => setIsCreateModalOpen(false)} className="p-3 text-slate-300 hover:text-slate-600">
                <X size={28} />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-10 space-y-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">部门名称 *</label>
                <input
                  required
                  placeholder="Department Name"
                  className="w-full px-6 py-4 bg-slate-50 rounded-2xl border-none outline-none focus:ring-4 ring-blue-500/10 font-bold text-slate-800"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">部门描述</label>
                <textarea
                  placeholder="Description"
                  rows={3}
                  className="w-full px-6 py-4 bg-slate-50 rounded-2xl border-none outline-none focus:ring-4 ring-blue-500/10 font-bold text-slate-800 resize-none"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">上级部门</label>
                <select
                  className="w-full px-6 py-4 bg-slate-50 rounded-2xl border-none outline-none focus:ring-4 ring-blue-500/10 font-bold text-slate-800"
                  value={formData.parent_id}
                  onChange={(e) => setFormData({ ...formData, parent_id: e.target.value })}
                >
                  <option value="">无（顶级部门）</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
              </div>
 <button disabled={formLoading} className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black hover:bg-blue-700 transition-all flex items-center justify-center gap-3">
                {formLoading ? <Loader2 className="animate-spin" size={20} /> : <Building2 size={20} />}
                确认创建部门
              </button>
            </form>
          </div>
        </div>
      )}

      {isEditModalOpen && selectedDepartment && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
 <div className="bg-slate-50 w-full max-w-md rounded-[3rem] overflow-hidden animate-in zoom-in-95">
            <div className="p-10 pb-4 border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-600 rounded-2xl flex items-center justify-center text-white">
                  <Edit3 size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">编辑部门: {selectedDepartment.name}</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Edit Department</p>
                </div>
              </div>
              <button onClick={() => setIsEditModalOpen(false)} className="p-3 text-slate-300 hover:text-slate-600">
                <X size={28} />
              </button>
            </div>
            <form onSubmit={handleEdit} className="p-10 space-y-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">部门名称 *</label>
                <input
                  required
                  placeholder="Department Name"
                  className="w-full px-6 py-4 bg-slate-50 rounded-2xl border-none outline-none focus:ring-4 ring-amber-500/10 font-bold text-slate-800"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">部门描述</label>
                <textarea
                  placeholder="Description"
                  rows={3}
                  className="w-full px-6 py-4 bg-slate-50 rounded-2xl border-none outline-none focus:ring-4 ring-amber-500/10 font-bold text-slate-800 resize-none"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">上级部门</label>
                <select
                  className="w-full px-6 py-4 bg-slate-50 rounded-2xl border-none outline-none focus:ring-4 ring-amber-500/10 font-bold text-slate-800"
                  value={formData.parent_id}
                  onChange={(e) => setFormData({ ...formData, parent_id: e.target.value })}
                >
                  <option value="">无（顶级部门）</option>
                  {getAvailableParentDepartments(selectedDepartment.id).map((dept) => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
              </div>
 <button disabled={formLoading} className="w-full py-5 bg-amber-600 text-white rounded-2xl font-black shadow-amber-500/20 hover:bg-amber-700 transition-all flex items-center justify-center gap-3">
                {formLoading ? <Loader2 className="animate-spin" size={20} /> : <RefreshCw size={20} />}
                立即更新部门
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
