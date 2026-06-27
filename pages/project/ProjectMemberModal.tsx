import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  CheckSquare,
  Loader2,
  Search,
  Square,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { api } from '../../clients/api';
import type { ProjectAddableUser, ProjectMember } from '../../clients/projects';

interface ProjectMemberModalProps {
  projectId: string;
  projectName: string;
  onClose: () => void;
  /** 成员变更（添加/移除）后回调，用于让父组件刷新项目列表中的成员信息 */
  onMembersChanged?: () => void;
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

export const ProjectMemberModal: React.FC<ProjectMemberModalProps> = ({ projectId, projectName, onClose, onMembersChanged }) => {
  const projectsApi = api.domains.project.projects;
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [addResults, setAddResults] = useState<ProjectAddableUser[]>([]);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadMembers = useCallback(
    async (search?: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await projectsApi.listMembers(projectId, { search, page: 1, page_size: 200 });
        setMembers(res.items || []);
        setTotal(Number(res.total || 0));
      } catch (err: any) {
        setError(err?.message || '加载成员列表失败');
      } finally {
        setLoading(false);
      }
    },
    [projectId, projectsApi],
  );

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadMembers(memberSearch.trim() || undefined);
    }, 300);
    return () => window.clearTimeout(t);
  }, [memberSearch, loadMembers]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  useEffect(() => {
    if (!addOpen) return;
    const q = addQuery.trim();
    if (!q) {
      setAddResults([]);
      setAddError(null);
      return;
    }
    setAddLoading(true);
    setAddError(null);
    const t = window.setTimeout(async () => {
      try {
        const res = await projectsApi.searchAddableUsers(projectId, q);
        setAddResults(res.items || []);
      } catch (err: any) {
        setAddError(err?.message || '搜索用户失败');
      } finally {
        setAddLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [addOpen, addQuery, projectId, projectsApi]);

  const toggleSelect = (user: ProjectAddableUser) => {
    if (user.is_already_member) return;
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(user.id)) next.delete(user.id);
      else next.add(user.id);
      return next;
    });
  };

  const handleBatchAdd = async () => {
    if (selectedIds.size === 0) return;
    setSubmitting(true);
    setNotice(null);
    try {
      const ids = Array.from(selectedIds).map(String);
      const res = await projectsApi.batchAddMembers(projectId, ids);
      setNotice(`成功添加 ${res.succeeded} 人${res.failed ? `，失败/跳过 ${res.failed} 人` : ''}`);
      setSelectedIds(new Set());
      setAddQuery('');
      setAddResults([]);
      await loadMembers(memberSearch.trim() || undefined);
      onMembersChanged?.();
    } catch (err: any) {
      setAddError(err?.message || '添加成员失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (userId: string) => {
    setRemovingId(userId);
    setNotice(null);
    try {
      await projectsApi.unbindRole(projectId, userId);
      await loadMembers(memberSearch.trim() || undefined);
      onMembersChanged?.();
    } catch (err: any) {
      setError(err?.message || '移除成员失败');
    } finally {
      setRemovingId(null);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[125] flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-theme-border bg-theme-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-theme-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-theme-elevated text-theme-text-primary">
              <Users size={18} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-theme-text-primary">项目成员管理</h3>
              <p className="text-xs text-theme-text-muted">{projectName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-theme-text-muted hover:bg-theme-elevated hover:text-theme-text-primary"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="flex flex-col gap-3">
            <div className="flex justify-start">
              <button
                onClick={() => setAddOpen((v) => !v)}
                className="inline-flex items-center gap-2 rounded-lg border border-theme-border bg-theme-elevated px-3 py-2 text-sm font-semibold text-theme-text-secondary transition hover:text-theme-text-primary"
              >
                <UserPlus size={15} />
                添加成员
              </button>
            </div>
            {addOpen && (
              <div className="rounded-xl border border-theme-border bg-theme-elevated p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-theme-text-faint" size={15} />
                  <input
                    value={addQuery}
                    onChange={(e) => setAddQuery(e.target.value)}
                    placeholder="搜索系统用户（用户名）"
                    className="form-input w-full pl-9 pr-3"
                    autoFocus
                  />
                </div>
                {addError && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-rose-400">
                    <AlertCircle size={13} /> {addError}
                  </div>
                )}
                <div className="mt-2 max-h-56 overflow-y-auto">
                  {addLoading ? (
                    <div className="flex items-center justify-center py-4 text-theme-text-muted">
                      <Loader2 className="animate-spin" size={18} />
                    </div>
                  ) : addResults.length === 0 ? (
                    <div className="py-4 text-center text-xs text-theme-text-muted">
                      {addQuery.trim() ? '未找到匹配用户' : '输入关键词搜索可添加的用户'}
                    </div>
                  ) : (
                    <ul className="divide-y divide-theme-border">
                      {addResults.map((u) => {
                        const checked = selectedIds.has(u.id);
                        return (
                          <li key={u.id}>
                            <button
                              type="button"
                              disabled={u.is_already_member}
                              onClick={() => toggleSelect(u)}
                              className={`flex w-full items-center gap-2 px-2 py-2 text-left text-sm ${u.is_already_member ? 'cursor-not-allowed opacity-60' : 'hover:bg-theme-surface'}`}
                            >
                              {checked ? (
                                <CheckSquare size={16} className="text-theme-text-primary" />
                              ) : (
                                <Square size={16} className="text-theme-text-muted" />
                              )}
                              <span className="font-medium text-theme-text-primary">{u.username}</span>
                              <span className="text-xs text-theme-text-muted">{u.department_name || '-'}</span>
                              {u.is_already_member && (
                                <span className="ml-auto rounded-full bg-theme-surface px-2 py-0.5 text-[11px] text-theme-text-muted">已加入</span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                {selectedIds.size > 0 && (
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={handleBatchAdd}
                      disabled={submitting}
                      className="btn btn-primary inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60"
                    >
                      {submitting ? <Loader2 className="animate-spin" size={14} /> : <UserPlus size={14} />}
                      添加选中（{selectedIds.size}）
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-theme-text-faint" size={15} />
              <input
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="搜索成员用户名"
                className="form-input w-full pl-9 pr-3"
              />
            </div>
          </div>

          {notice && (
            <div className="mt-3 rounded-lg border border-theme-border bg-theme-elevated px-3 py-2 text-xs text-theme-text-secondary">
              {notice}
            </div>
          )}
          {error && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/15 px-3 py-2 text-xs text-rose-400">
              <AlertCircle size={14} /> {error}
            </div>
          )}


          <div className="mt-4 overflow-hidden rounded-xl border border-theme-border">
            <table className="min-w-full divide-y divide-theme-border">
              <thead className="bg-theme-elevated text-left text-[11px] font-medium uppercase tracking-[0.18em] text-theme-text-muted">
                <tr>
                  <th className="px-4 py-3">用户名</th>
                  <th className="px-4 py-3">部门</th>
                  <th className="px-4 py-3">身份</th>
                  <th className="px-4 py-3">加入时间</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme-border text-sm">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center">
                      <Loader2 className="mx-auto animate-spin text-theme-text-muted" size={22} />
                    </td>
                  </tr>
                ) : members.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-theme-text-muted">暂无成员</td>
                  </tr>
                ) : (
                  members.map((m) => (
                    <tr key={m.user_id} className="hover:bg-theme-elevated">
                      <td className="px-4 py-3 font-medium text-theme-text-primary">
                        {m.username}
                        {!m.is_active && <span className="ml-2 text-xs text-theme-text-faint">（未启用）</span>}
                      </td>
                      <td className="px-4 py-3 text-theme-text-secondary">{m.department_name || '-'}</td>
                      <td className="px-4 py-3">
                        {m.is_creator ? (
                          <span className="inline-flex items-center rounded-full bg-theme-elevated px-2 py-0.5 text-[11px] font-semibold text-theme-text-primary">创建人</span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-theme-elevated px-2 py-0.5 text-[11px] font-medium text-theme-text-muted">成员</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-theme-text-muted">{formatDateTime(m.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        {m.is_creator ? (
                          <span className="text-xs text-theme-text-faint">—</span>
                        ) : (
                          <button
                            onClick={() => handleRemove(m.user_id)}
                            disabled={removingId === m.user_id}
                            title="移除成员"
                            className="inline-flex items-center justify-center rounded-lg border border-rose-500/20 px-2 py-1.5 text-rose-400 transition hover:bg-rose-500/15 disabled:opacity-60"
                          >
                            {removingId === m.user_id ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-xs text-theme-text-muted">共 {total} 名成员</div>
        </div>

        <div className="flex justify-end border-t border-theme-border px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-theme-border bg-theme-elevated px-4 py-2 text-sm font-semibold text-theme-text-secondary transition hover:text-theme-text-primary"
          >
            关闭
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
