import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Download, FileSpreadsheet, Key, Loader2, Plus, RefreshCw, Search, Shield, ShieldCheck, Trash2, Upload, UserCircle, Users } from 'lucide-react';
import { authApi } from '../../clients/auth';
import { showAlert, showConfirm } from '../../components/DialogService';
import { UserImportCommitResponse, UserImportPreviewResponse, UserInfo } from '../../types/types';
import { getPlatformRoleLabel } from '../../utils/rbac';

type ImportStage = 'upload' | 'preview' | 'result';

const IMPORT_STATUS_STYLES: Record<string, string> = {
  valid: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  error: 'bg-rose-50 text-rose-700 border-rose-100',
};

export const UserMgmtPage: React.FC = () => {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserInfo | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importStage, setImportStage] = useState<ImportStage>('upload');
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [resetData, setResetData] = useState({ old_password: '', new_password: '' });
  const [importFileName, setImportFileName] = useState('');
  const [importCsvContent, setImportCsvContent] = useState('');
  const [importFileContentBase64, setImportFileContentBase64] = useState('');
  const [importDefaultPassword, setImportDefaultPassword] = useState('');
  const [importForcePasswordChange, setImportForcePasswordChange] = useState(true);
  const [importPreview, setImportPreview] = useState<UserImportPreviewResponse | null>(null);
  const [importResult, setImportResult] = useState<UserImportCommitResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await authApi.listUsers();
      setUsers(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const resetImportState = () => {
    setImportStage('upload');
    setImportFileName('');
    setImportCsvContent('');
    setImportFileContentBase64('');
    setImportDefaultPassword('');
    setImportForcePasswordChange(true);
    setImportPreview(null);
    setImportResult(null);
    setImportLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openImportModal = () => {
    resetImportState();
    setIsImportModalOpen(true);
  };

  const closeImportModal = () => {
    setIsImportModalOpen(false);
    resetImportState();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      await authApi.createUser({ ...formData, role_ids: [] });
      setIsCreateModalOpen(false);
      setFormData({ username: '', password: '' });
      await fetchUsers();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setFormLoading(true);
    try {
      await authApi.changePasswordAdmin(selectedUser.id, resetData);
      setIsResetModalOpen(false);
      setResetData({ old_password: '', new_password: '' });
      await showAlert({ title: '密码已更新', message: '密码修改成功', tone: 'success' });
    } catch (err: any) {
      alert(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const toggleStatus = async (user: UserInfo) => {
    try {
      await authApi.updateUser(user.id, { is_active: !user.is_active });
      await fetchUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const filteredUsers = users.filter((u) =>
    [
      u.username,
      ...(u.role || []),
      u.department_name || '',
      getPlatformRoleLabel((u.platform_role || 'ordinary_user') as any),
      u.is_active ? 'active' : 'disabled',
    ].some((value) => value.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleDeleteUser = async (user: UserInfo) => {
    const confirmed = await showConfirm({
      title: '删除用户',
      message: `确认删除用户 "${user.username}"？`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    await authApi.deleteUser(user.id);
    await fetchUsers();
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await authApi.downloadUserImportTemplate();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'secflow-user-import-template.xlsx';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const readFileAsBase64 = (file: File): Promise<string> => (
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        const [, base64 = ''] = result.split(',', 2);
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.readAsDataURL(file);
    })
  );

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setImportFileName(file.name);
      const suffix = file.name.split('.').pop()?.toLowerCase();
      if (suffix === 'csv') {
        const text = await file.text();
        setImportCsvContent(text);
      } else {
        setImportCsvContent('');
      }
      setImportFileContentBase64(await readFileAsBase64(file));
      setImportPreview(null);
      setImportResult(null);
      setImportStage('upload');
    } catch (err: any) {
      alert(err.message || '读取文件失败');
    }
  };

  const handlePreviewImport = async () => {
    if (!importFileName || (!importCsvContent.trim() && !importFileContentBase64)) {
      await showAlert({ title: '缺少文件', message: '请先选择一个 Excel 或 CSV 文件', tone: 'warning' });
      return;
    }
    setImportLoading(true);
    try {
      const preview = await authApi.previewUserImport({
        csv_content: importCsvContent || undefined,
        file_content_base64: importFileContentBase64 || undefined,
        filename: importFileName,
        default_password: importDefaultPassword || undefined,
        force_password_change: importForcePasswordChange,
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
    if (!importPreview) return;
    const hasErrors = importPreview.error_rows > 0;
    if (hasErrors) {
      await showAlert({
        title: '预校验未通过',
        message: '当前文件仍存在错误行，请修正后重新预校验。',
        tone: 'warning',
      });
      return;
    }

    const confirmed = await showConfirm({
      title: '执行导入',
      message: `确认导入 ${importPreview.valid_rows} 条用户数据？已存在用户不会被自动更新。`,
      confirmText: '开始导入',
      cancelText: '取消',
    });
    if (!confirmed) return;

    setImportLoading(true);
    try {
      const result = await authApi.commitUserImport({
        csv_content: importCsvContent || undefined,
        file_content_base64: importFileContentBase64 || undefined,
        filename: importFileName,
        default_password: importDefaultPassword || undefined,
        force_password_change: importForcePasswordChange,
      });
      setImportResult(result);
      setImportStage('result');
      await fetchUsers();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setImportLoading(false);
    }
  };

  const generatedPasswords = useMemo(
    () => (importResult?.rows || []).filter((row) => row.generated_password),
    [importResult]
  );

  const userStats = useMemo(() => {
    const total = users.length;
    const active = users.filter((user) => user.is_active).length;
    const ordinaryAdmin = users.filter((user) => user.platform_role === 'ordinary_admin').length;
    const departmentBound = users.filter((user) => !!user.department_name).length;
    return { total, active, ordinaryAdmin, departmentBound };
  }, [users]);

  return (
    <div className="p-10 space-y-8 animate-in fade-in duration-500 pb-24 h-full overflow-y-auto bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.08),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(14,165,233,0.07),_transparent_24%),linear-gradient(180deg,_rgba(248,250,252,0.96),_rgba(255,255,255,1))]">
      <div className="flex justify-between items-end">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-blue-600 via-cyan-500 to-sky-500 text-white rounded-2xl shadow-xl shadow-blue-500/20">
              <Users size={28} />
            </div>
            <div>
              <h2 className="text-3xl font-black text-slate-800 tracking-tight">用户账号管理</h2>
              <p className="text-slate-500 font-medium mt-1 uppercase tracking-widest text-[10px]">Access Control & Identity Directory</p>
            </div>
          </div>
        </div>
        <div className="flex gap-4">
          <button onClick={() => void fetchUsers()} className="p-4 bg-white/80 backdrop-blur border border-slate-200 text-slate-500 rounded-2xl hover:bg-white transition-all shadow-sm active:scale-95">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={openImportModal} className="bg-white/85 backdrop-blur text-slate-700 px-6 py-4 rounded-2xl font-black flex items-center gap-3 border border-slate-200 shadow-sm hover:bg-white transition-all active:scale-95">
            <Upload size={18} /> 批量导入
          </button>
          <button onClick={() => setIsCreateModalOpen(true)} className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all active:scale-95">
            <Plus size={20} /> 创建新用户
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-[linear-gradient(135deg,_#0f172a,_#1d4ed8_65%,_#38bdf8)] p-8 rounded-[3rem] text-white flex flex-col justify-between group overflow-hidden relative shadow-2xl">
          <Shield className="absolute right-[-20px] top-[-20px] w-32 h-32 opacity-5 rotate-12 group-hover:rotate-0 transition-transform duration-700" />
          <p className="text-slate-200 text-[10px] font-black uppercase tracking-widest relative z-10">总用户数</p>
          <h3 className="text-5xl font-black mt-4 relative z-10">{userStats.total}</h3>
          <p className="text-sky-100 text-[10px] font-black uppercase mt-4 relative z-10 flex items-center gap-2">
            <ShieldCheck size={12} /> Data Protected
          </p>
        </div>
        <div className="bg-white/90 backdrop-blur p-8 rounded-[3rem] border border-emerald-100 shadow-sm flex flex-col justify-between">
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">活跃账号</p>
          <h3 className="text-4xl font-black mt-4 text-green-600">{userStats.active}</h3>
          <div className="h-1 bg-slate-100 rounded-full mt-4 overflow-hidden">
            <div className="h-full bg-green-500" style={{ width: `${userStats.total ? (userStats.active / userStats.total) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="bg-white/90 backdrop-blur p-8 rounded-[3rem] border border-indigo-100 shadow-sm flex flex-col justify-between">
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">账号分布</p>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="rounded-[1.75rem] bg-indigo-50 px-5 py-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">普通管理员</p>
              <p className="mt-2 text-3xl font-black text-indigo-700">{userStats.ordinaryAdmin}</p>
            </div>
            <div className="rounded-[1.75rem] bg-blue-50 px-5 py-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-400">已绑定部门</p>
              <p className="mt-2 text-3xl font-black text-blue-700">{userStats.departmentBound}</p>
            </div>
          </div>
        </div>
        <div className="bg-white/90 backdrop-blur p-8 rounded-[3rem] border border-slate-200 shadow-sm flex items-center gap-8">
          <div className="w-16 h-16 bg-cyan-50 text-cyan-600 rounded-3xl flex items-center justify-center shrink-0">
            <Clock size={32} />
          </div>
          <div>
            <h4 className="text-lg font-black text-slate-800">导入与身份治理</h4>
            <p className="text-sm text-slate-400 mt-1 font-medium">支持单个创建和 Excel/CSV 批量导入。批量导入会先预校验用户名、角色和部门归属，再执行落库。</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
          <input
            type="text"
            placeholder="搜索用户名、部门、角色或状态..."
            className="w-full pl-16 pr-8 py-5 bg-white/90 backdrop-blur border border-slate-200 rounded-[2.5rem] text-sm outline-none focus:ring-4 ring-blue-500/5 transition-all font-medium shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="bg-white/90 backdrop-blur border border-slate-200 rounded-[3rem] shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 border-b border-slate-100 font-black text-[10px] text-slate-400 uppercase tracking-widest">
              <tr>
                <th className="px-8 py-6">用户信息</th>
                <th className="px-6 py-6">身份与归属</th>
                <th className="px-6 py-6">注册日期</th>
                <th className="px-6 py-6 text-center">状态</th>
                <th className="px-8 py-6 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={5} className="py-32 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" size={40} /></td></tr>
              ) : filteredUsers.length === 0 ? (
                <tr><td colSpan={5} className="py-32 text-center text-slate-400 font-bold">暂无匹配的用户数据</td></tr>
              ) : filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 transition-all group">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-black shadow-inner">
                        {user.username[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-800">{user.username}</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">UID: {user.id.toString().padStart(5, '0')}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-6">
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-1">
                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg border uppercase ${
                          user.platform_role === 'super_admin'
                            ? 'bg-rose-50 text-rose-700 border-rose-100'
                            : user.platform_role === 'ordinary_admin'
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-100'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          {getPlatformRoleLabel((user.platform_role || 'ordinary_user') as any)}
                        </span>
                        {user.department_name && (
                          <span className="text-[10px] font-black bg-cyan-50 text-cyan-700 px-2.5 py-1 rounded-lg border border-cyan-100">
                            {user.department_name}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                      {user.role?.length > 0 ? user.role.map((r) => (
                        <span key={r} className="text-[10px] font-black bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg border border-blue-100 uppercase">{r}</span>
                      )) : <span className="text-[10px] font-bold text-slate-300 italic">None Assigned</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-6 text-xs font-bold text-slate-500">
                    {user.created_at?.split('T')[0] || '2024-01-01'}
                  </td>
                  <td className="px-6 py-6 text-center">
                    <button onClick={() => void toggleStatus(user)} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase border transition-all ${user.is_active ? 'bg-green-50 text-green-600 border-green-100 hover:bg-red-50 hover:text-red-600 hover:border-red-100' : 'bg-red-50 text-red-600 border-red-100 hover:bg-green-50 hover:text-green-600 hover:border-green-100'}`}>
                      {user.is_active ? 'Active' : 'Disabled'}
                    </button>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={() => { setSelectedUser(user); setIsResetModalOpen(true); }}
                        className="p-3 bg-white border border-slate-200 text-slate-400 hover:text-blue-600 rounded-xl transition-all shadow-sm"
                        title="重置密码"
                      >
                        <Key size={16} />
                      </button>
                      <button
                        onClick={() => void handleDeleteUser(user)}
                        className="p-3 bg-red-50 text-red-400 border border-transparent hover:border-red-100 rounded-xl transition-all shadow-sm"
                        title="彻底删除"
                      >
                        <Trash2 size={16} />
                      </button>
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
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-10 pb-4 border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                  <Plus size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800">创建新用户</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">New users default to ordinary user</p>
                </div>
              </div>
              <button onClick={() => setIsCreateModalOpen(false)} className="p-3 text-slate-300 hover:text-slate-600"><X size={28} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-10 space-y-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">用户名 *</label>
                <input
                  required
                  placeholder="Username"
                  className="w-full px-6 py-4 bg-slate-50 rounded-2xl border-none outline-none focus:ring-4 ring-blue-500/10 font-bold text-slate-800"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">初始密码 *</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  className="w-full px-6 py-4 bg-slate-50 rounded-2xl border-none outline-none focus:ring-4 ring-blue-500/10 font-bold text-slate-800"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
              <button disabled={formLoading} className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all flex items-center justify-center gap-3">
                {formLoading ? <Loader2 className="animate-spin" size={20} /> : <UserCircle size={20} />}
                确认创建身份
              </button>
            </form>
          </div>
        </div>
      )}

      {isResetModalOpen && selectedUser && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-10 pb-4 border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-600 rounded-2xl flex items-center justify-center text-white">
                  <Key size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">重置密码: {selectedUser.username}</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Credential Reset</p>
                </div>
              </div>
              <button onClick={() => setIsResetModalOpen(false)} className="p-3 text-slate-300 hover:text-slate-600"><X size={28} /></button>
            </div>
            <form onSubmit={handleResetPassword} className="p-10 space-y-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">管理员密码验证 *</label>
                <input
                  type="password"
                  required
                  placeholder="Current Password"
                  className="w-full px-6 py-4 bg-slate-50 rounded-2xl border-none outline-none focus:ring-4 ring-amber-500/10 font-bold text-slate-800"
                  value={resetData.old_password}
                  onChange={(e) => setResetData({ ...resetData, old_password: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">新密码 *</label>
                <input
                  type="password"
                  required
                  placeholder="New Password"
                  className="w-full px-6 py-4 bg-slate-50 rounded-2xl border-none outline-none focus:ring-4 ring-amber-500/10 font-bold text-slate-800"
                  value={resetData.new_password}
                  onChange={(e) => setResetData({ ...resetData, new_password: e.target.value })}
                />
              </div>
              <button disabled={formLoading} className="w-full py-5 bg-amber-600 text-white rounded-2xl font-black shadow-xl shadow-amber-500/20 hover:bg-amber-700 transition-all flex items-center justify-center gap-3">
                {formLoading ? <Loader2 className="animate-spin" size={20} /> : <RefreshCw size={20} />}
                立即应用新凭据
              </button>
            </form>
          </div>
        </div>
      )}

      {isImportModalOpen && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-6 bg-slate-950/65 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-6xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 max-h-[92vh] flex flex-col">
            <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-3xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
                  <FileSpreadsheet size={26} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900">批量导入用户</h3>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400 mt-1">Upload Excel Or CSV / Preview / Commit</p>
                </div>
              </div>
              <button onClick={closeImportModal} className="p-3 text-slate-300 hover:text-slate-600"><X size={28} /></button>
            </div>

            <div className="px-10 pt-6 flex gap-3 flex-wrap">
              {['upload', 'preview', 'result'].map((stage, index) => {
                const active = importStage === stage;
                const passed = ['upload', 'preview', 'result'].indexOf(importStage) > index;
                return (
                  <div key={stage} className={`px-4 py-2 rounded-full border text-[11px] font-black uppercase tracking-[0.2em] ${active ? 'bg-blue-600 text-white border-blue-600' : passed ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                    {stage}
                  </div>
                );
              })}
            </div>

            <div className="p-10 pt-8 overflow-y-auto space-y-8">
              {importStage === 'upload' && (
                <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-8">
                  <div className="rounded-[2rem] border border-slate-200 bg-slate-50/70 p-8 space-y-6">
                    <div className="space-y-2">
                      <h4 className="text-xl font-black text-slate-900">1. 准备导入文件</h4>
                      <p className="text-sm text-slate-500 font-medium">下载模板后直接按示例填写即可，支持上传 `.xlsx` 或 `.csv` 文件，系统会先预校验再导入。</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">统一初始密码</label>
                        <input
                          type="password"
                          placeholder="可选，不填则按行密码或随机密码"
                          className="w-full px-5 py-4 rounded-2xl bg-white border border-slate-200 outline-none focus:ring-4 ring-blue-500/10 font-semibold text-slate-800"
                          value={importDefaultPassword}
                          onChange={(e) => setImportDefaultPassword(e.target.value)}
                        />
                        <p className="text-xs text-slate-400 font-medium">当某一行没有填写 `password` 时，会优先使用这里的统一初始密码。</p>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">首次登录策略</label>
                        <button
                          type="button"
                          onClick={() => setImportForcePasswordChange((value) => !value)}
                          className={`w-full rounded-2xl border px-5 py-4 text-left transition-all ${importForcePasswordChange ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-700'}`}
                        >
                          <span className="block text-sm font-black">{importForcePasswordChange ? '已启用首次登录强制改密' : '不强制首次登录改密'}</span>
                          <span className="mt-1 block text-xs font-medium opacity-80">启用后，用户登录后必须先修改密码，才能继续访问其他页面。</span>
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-4">
                      <button onClick={() => void handleDownloadTemplate()} className="px-6 py-4 rounded-2xl bg-white border border-slate-200 font-black text-slate-700 flex items-center gap-3 shadow-sm hover:bg-slate-50">
                        <Download size={18} />
                        下载模板
                      </button>
                      <button onClick={() => fileInputRef.current?.click()} className="px-6 py-4 rounded-2xl bg-blue-600 text-white font-black flex items-center gap-3 shadow-xl shadow-blue-500/20 hover:bg-blue-700">
                        <Upload size={18} />
                        选择文件
                      </button>
                      <input ref={fileInputRef} type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="hidden" onChange={handleFileSelected} />
                    </div>
                    <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-6">
                      <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">当前文件</p>
                      <p className="mt-3 text-lg font-black text-slate-800">{importFileName || '尚未选择文件'}</p>
                      <p className="mt-2 text-sm text-slate-500">模板已内置示例和填写说明，支持字段：`username,password,platform_role,role_names,department_name,department_role,is_active`。如果行内不填密码，可用上面的“统一初始密码”或随机密码。</p>
                    </div>
                    <button disabled={importLoading || !importFileName} onClick={() => void handlePreviewImport()} className="w-full py-5 rounded-2xl bg-slate-900 text-white font-black flex items-center justify-center gap-3 disabled:opacity-50">
                      {importLoading ? <Loader2 size={20} className="animate-spin" /> : <ShieldCheck size={20} />}
                      开始预校验
                    </button>
                  </div>

                  <div className="rounded-[2rem] border border-slate-200 bg-white p-8 space-y-5 shadow-sm">
                    <h4 className="text-xl font-black text-slate-900">导入规则</h4>
                    <div className="space-y-3 text-sm font-medium text-slate-600">
                      <p>1. 只允许超级管理员执行导入。</p>
                      <p>2. 推荐直接下载 Excel 模板，按示例替换数据即可；也兼容 CSV 文件。</p>
                      <p>3. 平台角色只支持 `ordinary_admin` 和 `ordinary_user`，留空默认普通用户。</p>
                      <p>4. `role_names` 仅填写已存在的普通角色，多个角色用逗号分隔；部门名称也必须已存在。</p>
                      <p>5. 行内密码为空时，系统会优先使用“统一初始密码”；如果统一密码也为空，则自动生成随机密码并在导入结果中仅展示一次。</p>
                      <p>6. 勾选“首次登录强制改密”后，测试账号首次登录会被要求先完成改密。</p>
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
                      <p className="text-sm text-slate-500 font-medium">错误行不会进入导入阶段。请修正文件后重新预校验。</p>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => setImportStage('upload')} className="px-5 py-3 rounded-2xl bg-white border border-slate-200 font-black text-slate-700">返回修改</button>
                      <button disabled={importLoading || importPreview.error_rows > 0} onClick={() => void handleCommitImport()} className="px-6 py-3 rounded-2xl bg-blue-600 text-white font-black disabled:opacity-50 flex items-center gap-3">
                        {importLoading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                        确认导入
                      </button>
                    </div>
                  </div>

                  <ImportResultTable rows={importPreview.rows} />
                </div>
              )}

              {importStage === 'result' && importResult && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <SummaryCard label="总行数" value={String(importResult.total_rows)} tone="slate" />
                    <SummaryCard label="成功导入" value={String(importResult.success_rows)} tone="emerald" />
                    <SummaryCard label="失败行" value={String(importResult.failed_rows)} tone="rose" />
                  </div>

                  {generatedPasswords.length > 0 && (
                    <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6">
                      <h4 className="text-lg font-black text-amber-900">自动生成的初始密码</h4>
                      <p className="mt-2 text-sm font-medium text-amber-800">这些密码只会在本次导入结果中展示一次，请尽快通知相关用户首次登录后修改。</p>
                      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                        {generatedPasswords.map((row) => (
                          <div key={row.row_no} className="rounded-2xl bg-white border border-amber-200 px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.2em] font-black text-amber-500">Row {row.row_no}</p>
                            <p className="mt-1 text-sm font-black text-slate-800">{row.username}</p>
                            <p className="mt-1 font-mono text-sm text-slate-600">{row.generated_password}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between items-center gap-4">
                    <div>
                      <h4 className="text-xl font-black text-slate-900">3. 导入结果</h4>
                      <p className="text-sm text-slate-500 font-medium">成功与失败都会逐行记录，失败行可修复后再次导入。</p>
                    </div>
                    <button onClick={closeImportModal} className="px-6 py-3 rounded-2xl bg-slate-900 text-white font-black">完成</button>
                  </div>

                  <ImportResultTable rows={importResult.rows} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const SummaryCard = ({ label, value, tone }: { label: string; value: string; tone: 'slate' | 'emerald' | 'rose' }) => {
  const styles = {
    slate: 'bg-slate-900 text-white',
    emerald: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
    rose: 'bg-rose-50 text-rose-700 border border-rose-100',
  };
  return (
    <div className={`rounded-[2rem] p-6 ${styles[tone]}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.24em] opacity-70">{label}</p>
      <p className="mt-3 text-4xl font-black">{value}</p>
    </div>
  );
};

const ImportResultTable = ({ rows }: { rows: UserImportPreviewResponse['rows'] | UserImportCommitResponse['rows'] }) => (
  <div className="rounded-[2rem] border border-slate-200 overflow-hidden bg-white">
    <table className="w-full text-left">
      <thead className="bg-slate-50 border-b border-slate-100">
        <tr className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
          <th className="px-6 py-4">行号</th>
          <th className="px-6 py-4">用户名</th>
          <th className="px-6 py-4">平台角色 / 部门</th>
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
              {row.generated_password && <p className="mt-2 text-xs font-mono text-amber-700">自动密码: {row.generated_password}</p>}
            </td>
            <td className="px-6 py-5 text-sm text-slate-600 font-medium">
              <p>{row.normalized?.platform_role || '-'}</p>
              <p className="mt-1">{row.normalized?.department_name ? `${row.normalized.department_name} / ${row.normalized.department_role}` : '-'}</p>
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
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
);
