import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRightLeft, Building2, ChevronDown, ChevronUp, Download, Edit3, FileSpreadsheet, Loader2, Lock, Plus, RefreshCw, Search, Shield, Trash2, Upload, UserCheck, UserCircle, Users } from 'lucide-react';
import { orgApi, UserPermissionInfo } from '../../clients/org';
import { authApi } from '../../clients/auth';
import { showAlert, showConfirm } from '../../components/DialogService';
import { Department, DepartmentMember, DepartmentMemberImportCommitResponse, DepartmentMemberImportPreviewResponse, UserInfo } from '../../types/types';

type ImportStage = 'upload' | 'preview' | 'result';
type ImportMode = 'skip_existing' | 'update_role';

const IMPORT_STATUS_STYLES: Record<string, string> = {
  valid: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  skipped: 'bg-amber-50 text-amber-700 border-amber-100',
  error: 'bg-rose-50 text-rose-700 border-rose-100',
};

export const DepartmentMemberPage: React.FC = () => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [members, setMembers] = useState<DepartmentMember[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDepartmentFilterOpen, setIsDepartmentFilterOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<DepartmentMember | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [formData, setFormData] = useState({ user_id: '', department_id: '', role: 'member' });
  const [departmentPickerSearchOpen, setDepartmentPickerSearchOpen] = useState(false);
  const [userPickerSearchOpen, setUserPickerSearchOpen] = useState(false);
  const [departmentPickerSearchTerm, setDepartmentPickerSearchTerm] = useState('');
  const [userPickerSearchTerm, setUserPickerSearchTerm] = useState('');
  const [moveDepartmentId, setMoveDepartmentId] = useState('');
  const [userPermissions, setUserPermissions] = useState<UserPermissionInfo | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [importFileContentBase64, setImportFileContentBase64] = useState('');
  const [importStage, setImportStage] = useState<ImportStage>('upload');
  const [importMode, setImportMode] = useState<ImportMode>('skip_existing');
  const [importPreview, setImportPreview] = useState<DepartmentMemberImportPreviewResponse | null>(null);
  const [importResult, setImportResult] = useState<DepartmentMemberImportCommitResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const departmentFilterRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void fetchDepartments();
    void fetchUserPermissions();
  }, []);

  useEffect(() => {
    if (userPermissions?.can_manage_department_members) {
      void fetchUsers();
    }
  }, [userPermissions]);

  useEffect(() => {
    if (selectedDepartmentId) {
      void fetchMembers(selectedDepartmentId);
    }
  }, [selectedDepartmentId]);

  useEffect(() => {
    if (!isDepartmentFilterOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!departmentFilterRef.current?.contains(event.target as Node)) {
        setIsDepartmentFilterOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [isDepartmentFilterOpen]);

  const fetchUserPermissions = async () => {
    try {
      const data = await orgApi.getUserPermissions();
      setUserPermissions(data);
    } catch (e) {
      console.error('获取用户权限失败:', e);
    }
  };

  const canManageDepartment = (deptId: number): boolean => {
    if (!userPermissions) return false;
    return userPermissions.is_admin || (userPermissions.manageable_department_ids?.includes(deptId) || false);
  };

  const canManageCurrentDepartment = (): boolean => {
    if (!selectedDepartmentId) return false;
    return canManageDepartment(selectedDepartmentId);
  };

  const canImportMembers = (): boolean => {
    return !!userPermissions?.can_manage_department_members && canManageCurrentDepartment();
  };

  const isAdmin = () => userPermissions?.is_admin || false;

  const getRoleDisplayName = (role: string): string => {
    const roleNames: Record<string, string> = {
      leader: '组长',
      vice_leader: '副组长',
      member: '成员',
    };
    return roleNames[role] || role;
  };

  const getRoleBadgeStyle = (role: string): string => {
    const styles: Record<string, string> = {
      leader: 'bg-amber-50 text-amber-600 border-amber-100',
      vice_leader: 'bg-purple-50 text-purple-600 border-purple-100',
      member: 'bg-blue-50 text-blue-600 border-blue-100',
    };
    return styles[role] || 'bg-slate-50 text-slate-600 border-slate-100';
  };

  const canEditRole = (): boolean => {
    return !!userPermissions?.can_manage_department_members && canManageCurrentDepartment();
  };

  const getAvailableRoles = (): { value: string; label: string }[] => {
    if (!userPermissions?.can_manage_department_members || !canManageCurrentDepartment()) {
      return [];
    }

    return [
      { value: 'member', label: '成员' },
      { value: 'vice_leader', label: '副组长' },
      { value: 'leader', label: '组长' },
    ];
  };

  const canRemoveMember = (_member: DepartmentMember): boolean => {
    return !!userPermissions?.can_manage_department_members && canManageCurrentDepartment();
  };

  const canMoveMember = (member: DepartmentMember): boolean => {
    if (!userPermissions?.can_manage_department_members) return false;
    if (!canManageDepartment(member.department_id)) return false;
    return true;
  };

  const fetchDepartments = async () => {
    try {
      const data = await orgApi.listDepartments();
      setDepartments(data || []);
      if (data && data.length > 0 && !selectedDepartmentId) {
        setSelectedDepartmentId(data[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchUsers = async () => {
    try {
      const data = await authApi.listUsers();
      setUsers(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMembers = async (departmentId: number) => {
    setLoading(true);
    try {
      const data = await orgApi.getDepartmentMembers(departmentId);
      setMembers(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      await orgApi.addDepartmentMember({
        user_id: parseInt(formData.user_id, 10),
        department_id: parseInt(formData.department_id, 10),
        role: formData.role,
      });
      setIsAddModalOpen(false);
      setFormData({ user_id: '', department_id: '', role: 'member' });
      if (selectedDepartmentId) {
        await fetchMembers(selectedDepartmentId);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleEditMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember) return;
    setFormLoading(true);
    try {
      await orgApi.updateDepartmentMember(selectedMember.id, { role: formData.role });
      setIsEditModalOpen(false);
      setSelectedMember(null);
      setFormData({ user_id: '', department_id: '', role: 'member' });
      if (selectedDepartmentId) {
        await fetchMembers(selectedDepartmentId);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleRemoveMember = async (memberId: number) => {
    const confirmed = await showConfirm({
      title: '移除部门成员',
      message: '确认移除该成员？',
      confirmText: '确认移除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await orgApi.removeDepartmentMember(memberId);
      if (selectedDepartmentId) {
        await fetchMembers(selectedDepartmentId);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleMoveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember || !moveDepartmentId) return;
    setFormLoading(true);
    try {
      await orgApi.updateDepartmentMember(selectedMember.id, { department_id: parseInt(moveDepartmentId, 10) });
      setIsMoveModalOpen(false);
      setSelectedMember(null);
      setMoveDepartmentId('');
      if (selectedDepartmentId) {
        await fetchMembers(selectedDepartmentId);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const openEditModal = (member: DepartmentMember) => {
    setSelectedMember(member);
    setFormData({
      user_id: member.user_id.toString(),
      department_id: member.department_id.toString(),
      role: member.role,
    });
    setIsEditModalOpen(true);
  };

  const openAddModal = () => {
    setFormData({
      user_id: '',
      department_id: selectedDepartmentId ? selectedDepartmentId.toString() : '',
      role: 'member',
    });
    setDepartmentPickerSearchOpen(false);
    setUserPickerSearchOpen(false);
    setDepartmentPickerSearchTerm('');
    setUserPickerSearchTerm('');
    setIsAddModalOpen(true);
  };

  const openMoveModal = (member: DepartmentMember) => {
    setSelectedMember(member);
    setMoveDepartmentId(member.department_id.toString());
    setIsMoveModalOpen(true);
  };

  const resetImportState = () => {
    setImportFileName('');
    setImportFileContentBase64('');
    setImportStage('upload');
    setImportMode(isAdmin() ? 'skip_existing' : 'skip_existing');
    setImportPreview(null);
    setImportResult(null);
    setImportLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openImportModal = () => {
    if (!selectedDepartmentId) return;
    resetImportState();
    setIsImportModalOpen(true);
  };

  const closeImportModal = () => {
    setIsImportModalOpen(false);
    resetImportState();
  };

  const handleDownloadImportTemplate = async () => {
    try {
      const blob = await orgApi.downloadDepartmentMemberImportTemplate();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'secflow-department-member-import-template.xlsx';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.subarray(offset, offset + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  };

  const handleImportFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const contentBase64 = arrayBufferToBase64(await file.arrayBuffer());
      setImportFileName(file.name);
      setImportFileContentBase64(contentBase64);
      setImportPreview(null);
      setImportResult(null);
      setImportStage('upload');
    } catch (err: any) {
      alert(err.message || '读取文件失败');
    }
  };

  const handlePreviewImport = async () => {
    if (!selectedDepartmentId) return;
    if (!importFileContentBase64.trim()) {
      await showAlert({ title: '缺少文件', message: '请先选择一个 Excel 或 CSV 文件', tone: 'warning' });
      return;
    }
    setImportLoading(true);
    try {
      const preview = await orgApi.previewDepartmentMemberImport({
        department_id: selectedDepartmentId,
        file_content_base64: importFileContentBase64,
        filename: importFileName,
        mode: importMode,
      });
      setImportPreview(preview);
      setImportStage('preview');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setImportLoading(false);
    }
  };

  const handleCommitImport = async () => {
    if (!selectedDepartmentId || !importPreview) return;
    if (importPreview.error_rows > 0) {
      await showAlert({
        title: '预校验未通过',
        message: '当前文件中仍有错误行，请修正后重新预校验。',
        tone: 'warning',
      });
      return;
    }
    const confirmed = await showConfirm({
      title: '执行导入',
      message: `确认向当前部门导入 ${importPreview.valid_rows} 条成员记录？`,
      confirmText: '开始导入',
      cancelText: '取消',
    });
    if (!confirmed) return;
    setImportLoading(true);
    try {
      const result = await orgApi.commitDepartmentMemberImport({
        department_id: selectedDepartmentId,
        file_content_base64: importFileContentBase64,
        filename: importFileName,
        mode: importMode,
      });
      setImportResult(result);
      setImportStage('result');
      await fetchMembers(selectedDepartmentId);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setImportLoading(false);
    }
  };

  const filteredMembers = members.filter((m) =>
    m.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedDepartment = useMemo(
    () => departments.find((d) => d.id === selectedDepartmentId),
    [departments, selectedDepartmentId]
  );

  const filteredDepartmentOptions = useMemo(() => {
    const keyword = departmentPickerSearchTerm.trim().toLowerCase();
    if (!keyword) return departments;
    return departments.filter((department) => department.name.toLowerCase().includes(keyword));
  }, [departments, departmentPickerSearchTerm]);

  const filteredUserOptions = useMemo(() => {
    const keyword = userPickerSearchTerm.trim().toLowerCase();
    if (!keyword) return users;
    return users.filter((user) => user.username.toLowerCase().includes(keyword));
  }, [users, userPickerSearchTerm]);

  return (
    <div className="p-10 space-y-8 animate-in fade-in duration-500 pb-24 h-full overflow-y-auto">
      <div className="flex justify-between items-end">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-xl shadow-blue-500/20">
              <Users size={28} />
            </div>
            <div>
              <h2 className="text-3xl font-black text-slate-800 tracking-tight">部门成员管理</h2>
              <p className="text-slate-500 font-medium mt-1 uppercase tracking-widest text-[10px]">Department Member Management</p>
            </div>
          </div>
        </div>
        <div className="flex gap-4">
          <button onClick={() => selectedDepartmentId && void fetchMembers(selectedDepartmentId)} className="p-4 bg-white border border-slate-200 text-slate-500 rounded-2xl hover:bg-slate-50 transition-all shadow-sm active:scale-95">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
          {canImportMembers() && (
            <button onClick={openImportModal} className="bg-white text-slate-700 px-6 py-4 rounded-2xl font-black flex items-center gap-3 border border-slate-200 shadow-sm hover:bg-slate-50 transition-all active:scale-95">
              <Upload size={18} /> 导入成员
            </button>
          )}
          {userPermissions?.can_manage_department_members && canManageCurrentDepartment() && (
            <button onClick={openAddModal} className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all active:scale-95">
              <Plus size={20} /> 添加成员
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-slate-900 p-8 rounded-[3rem] text-white flex flex-col justify-between group overflow-hidden relative shadow-2xl">
          <Users className="absolute right-[-20px] top-[-20px] w-32 h-32 opacity-5 rotate-12 group-hover:rotate-0 transition-transform duration-700" />
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest relative z-10">当前部门成员</p>
          <h3 className="text-5xl font-black mt-4 relative z-10">{members.length}</h3>
          <p className="text-blue-400 text-[10px] font-black uppercase mt-4 relative z-10 flex items-center gap-2">
            <UserCheck size={12} /> Team Members
          </p>
        </div>
        <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">组长数量</p>
          <h3 className="text-4xl font-black mt-4 text-amber-600">{members.filter((m) => m.role === 'leader').length}</h3>
          <div className="h-1 bg-slate-100 rounded-full mt-4 overflow-hidden">
            <div className="h-full bg-amber-500" style={{ width: `${members.length ? (members.filter((m) => m.role === 'leader').length / members.length) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm col-span-2 flex items-center gap-8">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center shrink-0">
            <Shield size={32} />
          </div>
          <div>
            <h4 className="text-lg font-black text-slate-800">批量导入说明</h4>
            <p className="text-sm text-slate-400 mt-1 font-medium">普通管理员仅能向可管理部门导入普通成员；超级管理员可按模板批量导入并按需更新已有成员角色。</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
            <input
              type="text"
              placeholder="搜索成员名称..."
              className="w-full pl-16 pr-8 py-5 bg-white border border-slate-200 rounded-[2.5rem] text-sm outline-none focus:ring-4 ring-blue-500/5 transition-all font-medium shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div ref={departmentFilterRef} className="relative min-w-[200px]">
            <button
              type="button"
              className="w-full px-8 pr-14 py-5 bg-white border border-slate-200 rounded-[2.5rem] text-sm text-left outline-none focus:ring-4 ring-blue-500/5 transition-all font-medium shadow-sm text-slate-700"
              onClick={() => setIsDepartmentFilterOpen((open) => !open)}
            >
              {selectedDepartment?.name || '请选择部门'}
            </button>
            <span className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 text-slate-400">
              {isDepartmentFilterOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </span>
            {isDepartmentFilterOpen && (
              <div className="absolute right-0 top-[calc(100%+10px)] z-20 w-full overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-200/60">
                <div className="max-h-72 overflow-y-auto py-1">
                  {departments.map((dept) => {
                    const isSelected = dept.id === selectedDepartmentId;
                    return (
                      <button
                        key={dept.id}
                        type="button"
                        className={`flex w-full items-center rounded-2xl px-5 py-3 text-left text-sm font-semibold transition-all ${
                          isSelected
                            ? 'bg-blue-50 text-blue-700'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                        onClick={() => {
                          setSelectedDepartmentId(dept.id);
                          setIsDepartmentFilterOpen(false);
                        }}
                      >
                        {dept.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-[3rem] shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 border-b border-slate-100 font-black text-[10px] text-slate-400 uppercase tracking-widest">
              <tr>
                <th className="px-8 py-6">成员信息</th>
                <th className="px-6 py-6">所属部门</th>
                <th className="px-6 py-6 text-center">角色</th>
                <th className="px-6 py-6">加入时间</th>
                <th className="px-8 py-6 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={5} className="py-32 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" size={40} /></td></tr>
              ) : filteredMembers.length === 0 ? (
                <tr><td colSpan={5} className="py-32 text-center text-slate-400 font-bold">暂无成员数据</td></tr>
              ) : filteredMembers.map((member) => (
                <tr key={member.id} className="hover:bg-slate-50 transition-all group">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-black shadow-inner">
                        {member.username[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-800">{member.username}</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">UID: {member.user_id.toString().padStart(5, '0')}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-6">
                    <span className="text-sm font-bold text-slate-600">{member.department_name}</span>
                  </td>
                  <td className="px-6 py-6 text-center">
                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase border transition-all ${getRoleBadgeStyle(member.role)}`}>
                      {getRoleDisplayName(member.role)}
                    </span>
                  </td>
                  <td className="px-6 py-6 text-xs font-bold text-slate-500">
                    {member.created_at?.split('T')[0] || '2024-01-01'}
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      {canManageCurrentDepartment() ? (
                        <>
                          {canMoveMember(member) && (
                            <button onClick={() => openMoveModal(member)} className="p-3 bg-indigo-50 text-indigo-500 border border-transparent hover:border-indigo-100 rounded-xl transition-all shadow-sm" title="调整所属部门">
                              <ArrowRightLeft size={16} />
                            </button>
                          )}
                          {canEditRole() && (
                            <button onClick={() => openEditModal(member)} className="p-3 bg-white border border-slate-200 text-slate-400 hover:text-blue-600 rounded-xl transition-all shadow-sm" title="编辑角色">
                              <Edit3 size={16} />
                            </button>
                          )}
                          {canRemoveMember(member) && (
                            <button onClick={() => void handleRemoveMember(member.id)} className="p-3 bg-red-50 text-red-400 border border-transparent hover:border-red-100 rounded-xl transition-all shadow-sm" title="移除成员">
                              <Trash2 size={16} />
                            </button>
                          )}
                          {!canMoveMember(member) && !canEditRole() && !canRemoveMember(member) && (
                            <span className="text-[10px] text-slate-400 font-medium px-2 py-1 bg-slate-100 rounded-lg">
                              <Lock size={10} className="inline mr-1" />无权操作
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-medium px-2 py-1 bg-slate-100 rounded-lg">
                          <Lock size={10} className="inline mr-1" />只读
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isAddModalOpen && userPermissions?.can_manage_department_members && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white w-full max-w-3xl rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-10 pb-4 border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                  <Plus size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800">添加部门成员</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Add Department Member</p>
                </div>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="p-3 text-slate-300 hover:text-slate-600"><X size={28} /></button>
            </div>
            <form onSubmit={handleAddMember} className="p-10 space-y-8">
              <div className="space-y-6">
                <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto_1fr] gap-4 items-end">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">选择部门 *</label>
                      <button
                        type="button"
                        onClick={() => setDepartmentPickerSearchOpen((open) => !open)}
                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-black transition-all ${departmentPickerSearchOpen ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                      >
                        <Search size={14} />
                        查询
                      </button>
                    </div>
                    {departmentPickerSearchOpen && (
                      <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                        <input
                          type="text"
                          placeholder="输入部门名称筛选"
                          className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-4 ring-blue-500/10 text-sm font-semibold text-slate-700"
                          value={departmentPickerSearchTerm}
                          onChange={(e) => setDepartmentPickerSearchTerm(e.target.value)}
                        />
                      </div>
                    )}
                    <select
                      required
                      className="w-full px-6 py-4 bg-slate-50 rounded-2xl border-none outline-none focus:ring-4 ring-blue-500/10 font-bold text-slate-800"
                      value={formData.department_id}
                      onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
                    >
                      <option value="">请选择部门</option>
                      {filteredDepartmentOptions.map((dept) => (
                        <option key={dept.id} value={dept.id}>{dept.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-400 font-medium">
                      共 {filteredDepartmentOptions.length} 个部门{departmentPickerSearchTerm ? `，匹配关键字“${departmentPickerSearchTerm}”` : ''}
                    </p>
                  </div>

                  <div className="hidden xl:flex items-center justify-center pb-9">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center">
                      <ArrowRightLeft size={18} />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">选择用户 *</label>
                      <button
                        type="button"
                        onClick={() => setUserPickerSearchOpen((open) => !open)}
                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-black transition-all ${userPickerSearchOpen ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                      >
                        <Search size={14} />
                        查询
                      </button>
                    </div>
                    {userPickerSearchOpen && (
                      <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                        <input
                          type="text"
                          placeholder="输入用户名筛选"
                          className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-4 ring-blue-500/10 text-sm font-semibold text-slate-700"
                          value={userPickerSearchTerm}
                          onChange={(e) => setUserPickerSearchTerm(e.target.value)}
                        />
                      </div>
                    )}
                    <select
                      required
                      className="w-full px-6 py-4 bg-slate-50 rounded-2xl border-none outline-none focus:ring-4 ring-blue-500/10 font-bold text-slate-800"
                      value={formData.user_id}
                      onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                    >
                      <option value="">请选择用户</option>
                      {filteredUserOptions.map((user) => (
                        <option key={user.id} value={user.id}>{user.username}</option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-400 font-medium">
                      共 {filteredUserOptions.length} 个用户{userPickerSearchTerm ? `，匹配关键字“${userPickerSearchTerm}”` : ''}
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">角色 *</label>
                <select required className="w-full px-6 py-4 bg-slate-50 rounded-2xl border-none outline-none focus:ring-4 ring-blue-500/10 font-bold text-slate-800" value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}>
                  {getAvailableRoles().map((role) => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
              </div>
              <button disabled={formLoading} className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all flex items-center justify-center gap-3">
                {formLoading ? <Loader2 className="animate-spin" size={20} /> : <UserCircle size={20} />}
                确认添加成员
              </button>
            </form>
          </div>
        </div>
      )}

      {isMoveModalOpen && selectedMember && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-10 pb-4 border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white">
                  <Building2 size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">调整所属部门: {selectedMember.username}</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Move Department</p>
                </div>
              </div>
              <button onClick={() => setIsMoveModalOpen(false)} className="p-3 text-slate-300 hover:text-slate-600"><X size={28} /></button>
            </div>
            <form onSubmit={handleMoveMember} className="p-10 space-y-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">目标部门 *</label>
                <select required className="w-full px-6 py-4 bg-slate-50 rounded-2xl border-none outline-none focus:ring-4 ring-indigo-500/10 font-bold text-slate-800" value={moveDepartmentId} onChange={(e) => setMoveDepartmentId(e.target.value)}>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
              </div>
              <button disabled={formLoading} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black shadow-xl shadow-indigo-500/20 hover:bg-indigo-700 transition-all flex items-center justify-center gap-3">
                {formLoading ? <Loader2 className="animate-spin" size={20} /> : <ArrowRightLeft size={20} />}
                确认调整部门
              </button>
            </form>
          </div>
        </div>
      )}

      {isEditModalOpen && selectedMember && userPermissions?.can_manage_department_members && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-10 pb-4 border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-600 rounded-2xl flex items-center justify-center text-white">
                  <Edit3 size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">编辑成员角色: {selectedMember.username}</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Edit Member Role</p>
                </div>
              </div>
              <button onClick={() => setIsEditModalOpen(false)} className="p-3 text-slate-300 hover:text-slate-600"><X size={28} /></button>
            </div>
            <form onSubmit={handleEditMember} className="p-10 space-y-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">角色 *</label>
                <select required className="w-full px-6 py-4 bg-slate-50 rounded-2xl border-none outline-none focus:ring-4 ring-amber-500/10 font-bold text-slate-800" value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}>
                  {getAvailableRoles().map((role) => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
              </div>
              <button disabled={formLoading} className="w-full py-5 bg-amber-600 text-white rounded-2xl font-black shadow-xl shadow-amber-500/20 hover:bg-amber-700 transition-all flex items-center justify-center gap-3">
                {formLoading ? <Loader2 className="animate-spin" size={20} /> : <RefreshCw size={20} />}
                立即更新角色
              </button>
            </form>
          </div>
        </div>
      )}

      {isImportModalOpen && selectedDepartment && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-6 bg-slate-950/65 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-6xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 max-h-[92vh] flex flex-col">
            <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-3xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
                  <FileSpreadsheet size={26} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900">导入部门成员</h3>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400 mt-1">{selectedDepartment.name}</p>
                </div>
              </div>
              <button onClick={closeImportModal} className="p-3 text-slate-300 hover:text-slate-600"><X size={28} /></button>
            </div>

            <div className="px-10 pt-6 flex gap-3 flex-wrap">
              {['upload', 'preview', 'result'].map((stage) => (
                <div key={stage} className={`px-4 py-2 rounded-full border text-[11px] font-black uppercase tracking-[0.2em] ${importStage === stage ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                  {stage}
                </div>
              ))}
            </div>

            <div className="p-10 pt-8 overflow-y-auto space-y-8">
              {importStage === 'upload' && (
                <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-8">
                  <div className="rounded-[2rem] border border-slate-200 bg-slate-50/70 p-8 space-y-6">
                    <div className="space-y-2">
                      <h4 className="text-xl font-black text-slate-900">1. 准备成员导入文件</h4>
                      <p className="text-sm text-slate-500 font-medium">模板只要求填写已有账号的用户名。普通管理员仅允许导入 `member`。</p>
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">导入策略</label>
                      <select value={importMode} onChange={(e) => setImportMode(e.target.value as ImportMode)} disabled={!isAdmin()} className="w-full px-6 py-4 bg-white rounded-2xl border border-slate-200 outline-none focus:ring-4 ring-blue-500/10 font-bold text-slate-800 disabled:bg-slate-100 disabled:text-slate-400">
                        <option value="skip_existing">已存在则跳过</option>
                        {isAdmin() && <option value="update_role">已存在则更新角色</option>}
                      </select>
                      {!isAdmin() && <p className="text-xs text-slate-400 font-medium">普通管理员仅支持“已存在则跳过”。</p>}
                    </div>

                    <div className="flex flex-wrap gap-4">
                      <button onClick={() => void handleDownloadImportTemplate()} className="px-6 py-4 rounded-2xl bg-white border border-slate-200 font-black text-slate-700 flex items-center gap-3 shadow-sm hover:bg-slate-50">
                        <Download size={18} />
                        下载模板
                      </button>
                      <button onClick={() => fileInputRef.current?.click()} className="px-6 py-4 rounded-2xl bg-blue-600 text-white font-black flex items-center gap-3 shadow-xl shadow-blue-500/20 hover:bg-blue-700">
                        <Upload size={18} />
                        选择 Excel / CSV
                      </button>
                      <input ref={fileInputRef} type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="hidden" onChange={handleImportFileSelected} />
                    </div>

                    <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-6">
                      <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">当前文件</p>
                      <p className="mt-3 text-lg font-black text-slate-800">{importFileName || '尚未选择文件'}</p>
                      <p className="mt-2 text-sm text-slate-500">推荐直接下载 Excel 模板后填写。文件里只需要两列：`username` 必填，`role` 选填。</p>
                    </div>

                    <button disabled={importLoading || !importFileContentBase64.trim()} onClick={() => void handlePreviewImport()} className="w-full py-5 rounded-2xl bg-slate-900 text-white font-black flex items-center justify-center gap-3 disabled:opacity-50">
                      {importLoading ? <Loader2 size={20} className="animate-spin" /> : <Shield size={20} />}
                      开始预校验
                    </button>
                  </div>

                  <div className="rounded-[2rem] border border-slate-200 bg-white p-8 space-y-5 shadow-sm">
                    <h4 className="text-xl font-black text-slate-900">填写说明</h4>
                    <div className="space-y-3 text-sm font-medium text-slate-600">
                      <p>1. 下载模板后，第一列填用户名 `username`，第二列填角色 `role`。</p>
                      <p>2. `username` 必填，且必须是系统里已经存在的账号。</p>
                      <p>3. `role` 可以留空，留空时默认按 `member` 导入。</p>
                      <p>4. 目标部门固定为当前选中的部门：{selectedDepartment.name}，文件里不用再写部门名。</p>
                      <p>5. 普通管理员只能导入 `member`；超级管理员可以导入或更新 `leader / vice_leader / member`。</p>
                      <p>6. 每个部门同一时间只允许一个 `leader`，预校验时会直接提示冲突。</p>
                    </div>
                  </div>
                </div>
              )}

              {importStage === 'preview' && importPreview && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <SummaryCard label="总行数" value={String(importPreview.total_rows)} tone="slate" />
                    <SummaryCard label="可导入" value={String(importPreview.valid_rows)} tone="emerald" />
                    <SummaryCard label="错误行" value={String(importPreview.error_rows)} tone="rose" />
                  </div>
                  <div className="flex justify-between items-center gap-4">
                    <div>
                      <h4 className="text-xl font-black text-slate-900">2. 预校验结果</h4>
                      <p className="text-sm text-slate-500 font-medium">修正错误后重新预校验，再执行导入。</p>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => setImportStage('upload')} className="px-5 py-3 rounded-2xl bg-white border border-slate-200 font-black text-slate-700">返回修改</button>
                      <button disabled={importLoading || importPreview.error_rows > 0} onClick={() => void handleCommitImport()} className="px-6 py-3 rounded-2xl bg-blue-600 text-white font-black disabled:opacity-50 flex items-center gap-3">
                        {importLoading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                        确认导入
                      </button>
                    </div>
                  </div>
                  <DepartmentMemberImportTable rows={importPreview.rows} getRoleDisplayName={getRoleDisplayName} />
                </div>
              )}

              {importStage === 'result' && importResult && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                    <SummaryCard label="总行数" value={String(importResult.total_rows)} tone="slate" />
                    <SummaryCard label="成功导入" value={String(importResult.success_rows)} tone="emerald" />
                    <SummaryCard label="跳过行" value={String(importResult.skipped_rows)} tone="amber" />
                    <SummaryCard label="失败行" value={String(importResult.failed_rows)} tone="rose" />
                  </div>
                  <div className="flex justify-between items-center gap-4">
                    <div>
                      <h4 className="text-xl font-black text-slate-900">3. 导入结果</h4>
                      <p className="text-sm text-slate-500 font-medium">成功、跳过和失败都会逐行展示，失败数据可修正后再次导入。</p>
                    </div>
                    <button onClick={closeImportModal} className="px-6 py-3 rounded-2xl bg-slate-900 text-white font-black">完成</button>
                  </div>
                  <DepartmentMemberImportTable rows={importResult.rows} getRoleDisplayName={getRoleDisplayName} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const SummaryCard = ({ label, value, tone }: { label: string; value: string; tone: 'slate' | 'emerald' | 'rose' | 'amber' }) => {
  const styles = {
    slate: 'bg-slate-900 text-white',
    emerald: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
    rose: 'bg-rose-50 text-rose-700 border border-rose-100',
    amber: 'bg-amber-50 text-amber-700 border border-amber-100',
  };
  return (
    <div className={`rounded-[2rem] p-6 ${styles[tone]}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.24em] opacity-70">{label}</p>
      <p className="mt-3 text-4xl font-black">{value}</p>
    </div>
  );
};

const DepartmentMemberImportTable = ({
  rows,
  getRoleDisplayName,
}: {
  rows: DepartmentMemberImportPreviewResponse['rows'] | DepartmentMemberImportCommitResponse['rows'];
  getRoleDisplayName: (role: string) => string;
}) => (
  <div className="rounded-[2rem] border border-slate-200 overflow-hidden bg-white">
    <table className="w-full text-left">
      <thead className="bg-slate-50 border-b border-slate-100">
        <tr className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
          <th className="px-6 py-4">行号</th>
          <th className="px-6 py-4">用户名</th>
          <th className="px-6 py-4">目标角色 / 动作</th>
          <th className="px-6 py-4">状态</th>
          <th className="px-6 py-4">说明</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((row) => (
          <tr key={row.row_no} className="align-top">
            <td className="px-6 py-5 text-sm font-black text-slate-500">#{row.row_no}</td>
            <td className="px-6 py-5">
              <p className="text-sm font-black text-slate-900">{row.username || '-'}</p>
              {row.normalized?.existing_department_name && (
                <p className="mt-1 text-xs text-slate-400">现有部门：{row.normalized.existing_department_name}</p>
              )}
            </td>
            <td className="px-6 py-5 text-sm text-slate-600 font-medium">
              <p>{row.normalized?.role ? getRoleDisplayName(row.normalized.role) : '-'}</p>
              <p className="mt-1 text-xs text-slate-400">{row.normalized?.action || '-'}</p>
            </td>
            <td className="px-6 py-5">
              <span className={`inline-flex px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-[0.18em] ${IMPORT_STATUS_STYLES[row.status] || IMPORT_STATUS_STYLES.error}`}>
                {row.status}
              </span>
            </td>
            <td className="px-6 py-5 text-sm text-slate-600 font-medium">
              {row.messages.length > 0 ? row.messages.join('；') : '无'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const X = ({ size, className }: any) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
);
