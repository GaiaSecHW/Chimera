import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Building2, Loader2, RefreshCw, Search, Shield, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { api } from '../../clients/api';
import { Department, UserInfo } from '../../types/types';
import { getPlatformRoleLabel } from '../../utils/rbac';

interface UserDraft {
  platformRole: 'ordinary_admin' | 'developer' | 'ordinary_user';
  departmentId: string;
}

type RoleFilter = 'all' | 'super_admin' | 'ordinary_admin' | 'developer' | 'ordinary_user' | 'changed';

const isEditableUser = (user: UserInfo) => user.platform_role !== 'super_admin' && Number(user.id) !== 1;

const buildDrafts = (items: UserInfo[]): Record<number, UserDraft> => (
  Object.fromEntries(
    items.map((user) => [
      user.id,
      {
        platformRole: user.platform_role === 'super_admin'
          ? 'ordinary_user'
          : user.platform_role === 'ordinary_admin'
            ? 'ordinary_admin'
            : user.platform_role === 'developer'
              ? 'developer'
            : 'ordinary_user',
        departmentId: user.department_id ? String(user.department_id) : '',
      },
    ]),
  )
);

const getUserInitial = (username: string) => username.slice(0, 1).toUpperCase();

export const UserPermissionPage: React.FC = () => {
  const platformApi = api.domains.platform;
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [drafts, setDrafts] = useState<Record<number, UserDraft>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [savingUserIds, setSavingUserIds] = useState<Record<number, boolean>>({});
  const [savingAll, setSavingAll] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const loadData = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const [userData, departmentData] = await Promise.all([
        platformApi.auth.listUsers(),
        platformApi.org.listDepartments(),
      ]);
      const nextUsers = userData || [];
      setUsers(nextUsers);
      setDepartments(departmentData || []);
      setDrafts(buildDrafts(nextUsers));
    } catch (error) {
      console.error(error);
      alert('加载用户权限数据失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData(true);
  }, []);

  const departmentOptions = useMemo(() => {
    const departmentMap = new Map<number, Department>();
    departments.forEach((department) => {
      departmentMap.set(department.id, department);
    });

    const pathCache = new Map<number, string>();
    const buildDepartmentPath = (departmentId: number): string => {
      const cached = pathCache.get(departmentId);
      if (cached) return cached;

      const visited = new Set<number>();
      const segments: string[] = [];
      let current = departmentMap.get(departmentId);
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        segments.unshift(current.name);
        current = current.parent_id ? departmentMap.get(current.parent_id) : undefined;
      }

      const path = segments.join(' / ');
      pathCache.set(departmentId, path);
      return path;
    };

    return [...departments]
      .sort((left, right) => buildDepartmentPath(left.id).localeCompare(buildDepartmentPath(right.id), 'zh-CN'))
      .map((department) => ({
        id: department.id,
        name: department.name,
        path: buildDepartmentPath(department.id) || department.name,
      }));
  }, [departments]);

  const getDraftChanged = (user: UserInfo, draft?: UserDraft) => {
    if (!isEditableUser(user)) return false;
    if (!draft) return false;
    return (
      draft.platformRole !== (user.platform_role || 'ordinary_user') ||
      draft.departmentId !== (user.department_id ? String(user.department_id) : '')
    );
  };

  const filteredUsers = useMemo(() => {
    const keyword = deferredSearchTerm.trim().toLowerCase();
    return users.filter((user) => {
      const draft = drafts[user.id];
      const matchesSearch = !keyword || [
        user.username,
        user.department_name || '',
        getPlatformRoleLabel((user.platform_role || 'ordinary_user') as any),
      ].some((value) => value.toLowerCase().includes(keyword));

      if (!matchesSearch) return false;
      if (roleFilter === 'all') return true;
      if (roleFilter === 'changed') return getDraftChanged(user, draft);
      return (user.platform_role || 'ordinary_user') === roleFilter;
    });
  }, [deferredSearchTerm, drafts, roleFilter, users]);

  const roleStats = useMemo(() => ({
    superAdmin: users.filter((user) => user.platform_role === 'super_admin').length,
    ordinaryAdmin: users.filter((user) => user.platform_role === 'ordinary_admin').length,
    developer: users.filter((user) => user.platform_role === 'developer').length,
    ordinaryUser: users.filter((user) => (user.platform_role || 'ordinary_user') === 'ordinary_user').length,
    changed: users.filter((user) => getDraftChanged(user, drafts[user.id])).length,
  }), [drafts, users]);

  const filterOptions: Array<{ key: RoleFilter; label: string; count: number }> = [
    { key: 'all', label: '全部账号', count: users.length },
    { key: 'super_admin', label: '超级管理员', count: roleStats.superAdmin },
    { key: 'ordinary_admin', label: '普通管理员', count: roleStats.ordinaryAdmin },
    { key: 'developer', label: '开发者', count: roleStats.developer },
    { key: 'ordinary_user', label: '普通用户', count: roleStats.ordinaryUser },
    { key: 'changed', label: '待保存变更', count: roleStats.changed },
  ];

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const paginatedUsers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [deferredSearchTerm, roleFilter, pageSize]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const updateDraft = (userId: number, patch: Partial<UserDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        ...patch,
      },
    }));
  };

  const syncUserLocally = (userId: number, nextUser: UserInfo) => {
    setUsers((prev) => prev.map((item) => (item.id === userId ? nextUser : item)));
    setDrafts((prev) => ({
      ...prev,
      [userId]: {
        platformRole: nextUser.platform_role === 'ordinary_admin'
          ? 'ordinary_admin'
          : nextUser.platform_role === 'developer'
            ? 'developer'
            : 'ordinary_user',
        departmentId: nextUser.department_id ? String(nextUser.department_id) : '',
      },
    }));
  };

  const persistUserPermission = async (user: UserInfo) => {
    const draft = drafts[user.id];
    if (!draft || !isEditableUser(user)) return;

    let nextUser: UserInfo = { ...user };
    const currentDepartmentId = user.department_id ? Number(user.department_id) : null;
    const nextDepartmentId = draft.departmentId ? Number(draft.departmentId) : null;

    if (draft.platformRole !== (user.platform_role || 'ordinary_user')) {
      const platformRoleResponse = await platformApi.auth.updateUserPlatformRole(user.id, draft.platformRole);
      nextUser = {
        ...nextUser,
        platform_role: platformRoleResponse.platform_role,
        role: Array.isArray(platformRoleResponse.role_names) ? platformRoleResponse.role_names : nextUser.role,
      };
    }

    if (nextDepartmentId !== currentDepartmentId) {
      if (nextDepartmentId === null && user.department_member_id) {
        await platformApi.org.removeDepartmentMember(user.department_member_id);
        nextUser = {
          ...nextUser,
          department_member_id: null,
          department_id: null,
          department_name: null,
        };
      } else if (nextDepartmentId !== null) {
        const membership = user.department_member_id
          ? await platformApi.org.updateDepartmentMember(user.department_member_id, { department_id: nextDepartmentId })
          : await platformApi.org.addDepartmentMember({
              user_id: user.id,
              department_id: nextDepartmentId,
              role: 'member',
            });

        nextUser = {
          ...nextUser,
          department_member_id: membership.id,
          department_id: membership.department_id,
          department_name: membership.department_name,
        };
      }
    }

    syncUserLocally(user.id, nextUser);
  };

  const saveUserPermission = async (user: UserInfo) => {
    setSavingUserIds((prev) => ({ ...prev, [user.id]: true }));
    try {
      await persistUserPermission(user);
    } catch (error: any) {
      alert(error.message || '保存失败');
    } finally {
      setSavingUserIds((prev) => {
        const next = { ...prev };
        delete next[user.id];
        return next;
      });
    }
  };

  const saveAllChangedUsers = async () => {
    const changedUsers = users.filter((user) => isEditableUser(user) && getDraftChanged(user, drafts[user.id]));
    if (changedUsers.length === 0) return;

    setSavingAll(true);
    try {
      for (const user of changedUsers) {
        setSavingUserIds((prev) => ({ ...prev, [user.id]: true }));
        try {
          await persistUserPermission(user);
        } finally {
          setSavingUserIds((prev) => {
            const next = { ...prev };
            delete next[user.id];
            return next;
          });
        }
      }
    } catch (error: any) {
      alert(error.message || '批量保存失败');
    } finally {
      setSavingAll(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-theme-app px-6 py-8 md:px-8 xl:px-10">
      <div className="flex w-full flex-col gap-6 pb-24">
        <section className="relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-slate-950 px-8 py-8 text-white md:px-10">
          <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,_rgba(56,189,248,0.22),_transparent_56%)]" />
          <div className="absolute -left-16 top-0 h-40 w-40 rounded-full bg-sky-400/10 blur-3xl" />
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-4 xl:max-w-[48rem] 2xl:max-w-[60rem]">
 <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.28em] text-sky-200">
                <Sparkles size={14} />
                User Permission Center
              </div>
              <div className="flex items-start gap-4">
 <div className="flex h-16 w-16 items-center justify-center rounded-[1.75rem] bg-slate-100 text-sky-200 shadow-inner shadow-white/5 backdrop-blur">
                  <ArrowRightLeft size={30} />
                </div>
                <div className="space-y-2">
                  <h2 className="text-3xl font-black tracking-tight md:text-4xl">用户权限管理</h2>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
 <div className="rounded-[1.6rem] border border-slate-200 bg-slate-100/10 px-5 py-4 backdrop-blur">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">超级管理员</p>
                <p className="mt-3 text-3xl font-black text-white">{roleStats.superAdmin}</p>
              </div>
              <div className="rounded-[1.6rem] border border-amber-400/15 bg-amber-400/10 px-5 py-4">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-100/80">普通管理员</p>
                <p className="mt-3 text-3xl font-black text-amber-200">{roleStats.ordinaryAdmin}</p>
              </div>
              <div className="rounded-[1.6rem] border border-fuchsia-400/15 bg-fuchsia-400/10 px-5 py-4">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-fuchsia-100/80">开发者</p>
                <p className="mt-3 text-3xl font-black text-fuchsia-200">{roleStats.developer}</p>
              </div>
              <div className="rounded-[1.6rem] border border-sky-400/15 bg-sky-400/10 px-5 py-4">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-sky-100/80">普通用户</p>
                <p className="mt-3 text-3xl font-black text-sky-200">{roleStats.ordinaryUser}</p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 md:max-w-[14rem]">
              <div className="rounded-[1.6rem] border border-emerald-400/15 bg-emerald-400/10 px-5 py-4">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-100/80">待保存</p>
                <p className="mt-3 text-3xl font-black text-emerald-200">{roleStats.changed}</p>
              </div>
            </div>
          </div>
        </section>

 <section className="rounded-[2rem] border border-slate-200/80 bg-slate-50 p-5 backdrop-blur">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-[1.25rem] bg-sky-100 text-sky-700">
                  <Search size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">筛选与检索</h3>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => void loadData(false)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-600 transition hover:border-sky-200 hover:text-sky-700"
                >
                  <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                  刷新数据
                </button>
                <button
                  onClick={() => void saveAllChangedUsers()}
                  disabled={roleStats.changed === 0 || savingAll}
 className="inline-flex items-center gap-2 rounded-2xl bg-sky-600 px-5 py-3 text-sm font-black text-white shadow-sky-500/20 transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingAll ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                  保存全部变更
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
              <label className="flex items-center gap-3 rounded-[1.6rem] border border-slate-200 bg-slate-50 px-5 py-4">
                <Search size={18} className="text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="搜索用户名、当前角色或所属部门..."
                  className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                {filterOptions.map((option) => {
                  const active = option.key === roleFilter;
                  return (
                    <button
                      key={option.key}
                      onClick={() => setRoleFilter(option.key)}
                      className={`rounded-2xl px-4 py-3 text-sm font-black transition ${
                        active
 ? 'bg-slate-900 text-white '
                          : 'border border-slate-200 bg-slate-50 text-slate-500 hover:border-sky-200 hover:text-sky-700'
                      }`}
                    >
                      {option.label} ({option.count})
                    </button>
                  );
                })}
              </div>
            </div>
        </section>

 <section className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-slate-50">
          <div className="border-b border-slate-100 px-6 py-5 md:px-8">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-[1.25rem] bg-indigo-50 text-indigo-600">
                  <Users size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">权限分配列表</h3>
                  <p className="text-sm font-medium text-slate-500">当前共 {filteredUsers.length} 个账号，其中 {roleStats.changed} 个存在未保存变更。</p>
                </div>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-xs font-black uppercase tracking-[0.24em] text-slate-500">
                <Building2 size={14} />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">
                <tr>
                  <th className="px-8 py-4">用户</th>
                  <th className="px-6 py-4">当前角色</th>
                  <th className="px-6 py-4">目标角色</th>
                  <th className="px-6 py-4">当前部门</th>
                  <th className="px-6 py-4">目标部门</th>
                  <th className="px-6 py-4">状态</th>
                  <th className="px-8 py-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-8 py-24 text-center">
                      <Loader2 className="mx-auto animate-spin text-sky-600" size={34} />
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-8 py-20 text-center">
                      <p className="text-base font-black text-slate-500">暂无匹配用户</p>
                      <p className="mt-2 text-sm font-medium text-slate-400">可以试试切换筛选条件或清空搜索关键字。</p>
                    </td>
                  </tr>
                ) : (
                  paginatedUsers.map((user) => {
                    const draft = drafts[user.id];
                    const editable = isEditableUser(user);
                    const hasChanged = getDraftChanged(user, draft);
                    const isSaving = !!savingUserIds[user.id];

                    return (
                      <tr key={user.id} className="transition hover:bg-[rgba(79,115,255,0.10)]">
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-[1.2rem] bg-slate-100 font-black text-slate-700 shadow-inner">
                              {getUserInitial(user.username)}
                            </div>
                            <div>
                              <p className="text-sm font-black text-slate-900">{user.username}</p>
                              <p className="mt-1 text-[11px] font-mono text-slate-400">UID: {String(user.id).padStart(5, '0')}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-black ${
                              user.platform_role === 'super_admin'
                                ? 'border-slate-900 bg-slate-900 text-white'
                                : user.platform_role === 'ordinary_admin'
                                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                                  : user.platform_role === 'developer'
                                    ? 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700'
                                  : 'border-sky-200 bg-sky-50 text-sky-700'
                            }`}
                          >
                            <Shield size={12} />
                            {getPlatformRoleLabel((user.platform_role || 'ordinary_user') as any)}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <select
                            disabled={!editable}
                            value={draft?.platformRole || 'ordinary_user'}
                            onChange={(event) => updateDraft(user.id, { platformRole: event.target.value as UserDraft['platformRole'] })}
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 outline-none transition focus:border-sky-300 focus:bg-slate-50 focus:ring-4 focus:ring-sky-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <option value="ordinary_user">普通用户</option>
                            <option value="developer">开发者</option>
                            <option value="ordinary_admin">普通管理员</option>
                          </select>
                        </td>
                        <td className="px-6 py-5">
                          <div className="text-sm font-bold text-slate-700">{user.department_name || '未分配'}</div>
                        </td>
                        <td className="px-6 py-5">
                          <select
                            disabled={!editable}
                            value={draft?.departmentId || ''}
                            onChange={(event) => updateDraft(user.id, { departmentId: event.target.value })}
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 outline-none transition focus:border-sky-300 focus:bg-slate-50 focus:ring-4 focus:ring-sky-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <option value="">未分配</option>
                            {departmentOptions.map((department) => (
                              <option key={department.id} value={department.id}>
                                {department.path}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-6 py-5">
                          {!editable ? (
                            <span className="inline-flex rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-black text-slate-500">保留账户</span>
                          ) : hasChanged ? (
                            <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-black text-emerald-700">待保存</span>
                          ) : (
                            <span className="inline-flex rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-black text-slate-500">已同步</span>
                          )}
                        </td>
                        <td className="px-8 py-5 text-right">
                          {editable ? (
                            <button
                              onClick={() => void saveUserPermission(user)}
                              disabled={!hasChanged || isSaving}
                              className="inline-flex min-w-[112px] items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isSaving ? <Loader2 size={16} className="animate-spin" /> : '保存变更'}
                            </button>
                          ) : (
                            <span className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">只读</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {!loading && filteredUsers.length > 0 && (
            <div className="flex flex-col gap-4 border-t border-slate-100 px-6 py-5 md:flex-row md:items-center md:justify-between md:px-8">
              <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
                <span>每页显示</span>
                <select
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-500/10"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span>
                  第 {page} / {totalPages} 页
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 md:justify-end">
                <span className="text-sm font-medium text-slate-500">
                  当前展示 {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filteredUsers.length)} / {filteredUsers.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page <= 1}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-black text-slate-600 transition hover:border-sky-200 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    上一页
                  </button>
                  <button
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    disabled={page >= totalPages}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-black text-slate-600 transition hover:border-sky-200 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    下一页
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
