import React, { useEffect, useMemo, useState } from 'react';
import { Clock, Globe, Loader2, MapPin, Monitor, RefreshCw, Search, ShieldCheck, UserX, Zap } from 'lucide-react';
import { api } from '../../clients/api';
import { showConfirm } from '../../components/DialogService';
import { UserSession } from '../../types/types';
import { DataTable, DataTableColumn } from '../../design-system';

export const OnlineSessionPage: React.FC = () => {
  const platformApi = api.domains.platform;
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    void fetchSessions();
    const interval = setInterval(() => {
      void fetchSessions();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const data = await platformApi.auth.listOnlineSessions();
      setSessions(data || []);
      setLastRefreshed(new Date());
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleKick = async (userId: number, username: string) => {
    const confirmed = await showConfirm({
      title: '强制下线用户',
      message:`确认强制下线用户"${username}"？此操作将立即吊销该用户所有活跃 JWT Token。`,
      confirmText: '立即下线',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;

    setIsActionLoading(true);
    try {
      await platformApi.auth.revokeUserSessions(userId);
      await fetchSessions();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const filteredSessions = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return sessions;
    return sessions.filter((session) =>
      [session.username, session.ip_address, session.user_agent || '', ...(session.role || [])]
        .some((value) => (value || '').toLowerCase().includes(keyword))
    );
  }, [searchTerm, sessions]);

  const roleCount = useMemo(
    () => sessions.reduce((count, session) => count + (session.role?.length || 0), 0),
    [sessions]
  );

  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / pageSize));
  const paginatedSessions = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredSessions.slice(start, start + pageSize);
  }, [filteredSessions, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, pageSize]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  return (
    <div className="h-full overflow-y-auto bg-theme-app px-6 py-8 md:px-8 xl:px-10">
      <div className="flex w-full flex-col gap-6 pb-24">
        <section className="relative overflow-hidden rounded-xl border border-emerald-950/10 bg-[linear-gradient(135deg,_#052e2b,_#065f46_55%,_#0f766e)] px-8 py-8 text-white md:px-10">
          <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,_rgba(110,231,183,0.18),_transparent_58%)]" />
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-4 xl:max-w-[48rem] 2xl:max-w-[60rem]">
              <div className="flex items-start gap-4">
 <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-theme-elevated text-emerald-100 shadow-inner shadow-white/5">
                  <Globe size={30} />
                </div>
                <div className="space-y-2">
                  <h2 className="text-3xl font-bold tracking-tight md:text-4xl">在线会话监控</h2>
                  <p className="max-w-2xl text-sm font-medium leading-7 text-emerald-50/85">
                    聚合当前在线用户会话、终端指纹和网络地址，便于快速研判异常登录并执行强制下线。
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 self-start xl:self-auto">
 <div className="rounded-xl border border-theme-border bg-theme-elevated px-4 py-3 backdrop-blur">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-100/70">最近同步</p>
                <p className="mt-1 text-sm font-medium text-white">{lastRefreshed.toLocaleTimeString()}</p>
              </div>
              <button
                onClick={() => void fetchSessions()}
 className="inline-flex items-center gap-2 rounded-2xl border border-theme-border bg-theme-elevated px-4 py-3 text-sm font-medium text-white transition hover:bg-theme-surface"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                刷新
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
 <div className="rounded-xl bg-theme-surface px-6 py-6 text-white">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-theme-text-muted">在线会话</p>
            <p className="mt-4 text-5xl font-bold">{sessions.length}</p>
            <p className="mt-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
              <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Live Stream
            </p>
          </div>
 <div className="rounded-xl border border-theme-border bg-theme-surface px-6 py-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-theme-text-muted">唯一用户</p>
            <p className="mt-4 text-4xl font-bold text-theme-text-primary">{new Set(sessions.map((session) => session.user_id)).size}</p>
            <p className="mt-4 text-sm font-medium text-theme-text-muted">按用户维度统计当前活跃登录主体。</p>
          </div>
 <div className="rounded-xl border border-theme-border bg-theme-surface px-6 py-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-theme-text-muted">角色标签</p>
            <p className="mt-4 text-4xl font-bold text-theme-text-primary">{roleCount}</p>
            <p className="mt-4 text-sm font-medium text-theme-text-muted">已附加到在线会话上的角色数量总和。</p>
          </div>
 <div className="rounded-xl border border-emerald-500/20 bg-emerald-50/80 px-6 py-6">
            <div className="flex items-center gap-3">
 <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-theme-surface text-emerald-400">
                <Zap size={22} />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-500">治理能力</p>
                <p className="mt-1 text-lg font-semibold text-emerald-300">支持秒级强制下线</p>
              </div>
            </div>
            <p className="mt-4 text-sm font-medium leading-6 text-emerald-800/80">对疑似异常会话可直接吊销活跃 JWT，快速阻断风险扩散。</p>
          </div>
        </section>

 <section className="rounded-xl border border-slate-200/80 bg-theme-surface p-5 backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                <Search size={20} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-theme-text-primary">检索会话</h3>
                <p className="text-sm font-medium text-theme-text-muted">支持按用户名、IP、角色和终端信息快速搜索。</p>
              </div>
            </div>
            <div className="rounded-full bg-theme-elevated px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-theme-text-muted">
              匹配结果 {filteredSessions.length}
            </div>
          </div>

          <label className="mt-5 flex items-center gap-3 rounded-xl border border-theme-border bg-theme-surface px-5 py-4">
            <Search size={18} className="text-theme-text-muted" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="搜索用户名、IP 地址、角色或终端标识..."
              className="form-input w-full"
            />
          </label>
        </section>

 <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-theme-surface">
          <div className="border-b border-theme-border px-6 py-5 md:px-8">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
                  <Monitor size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-theme-text-primary">会话列表</h3>
                  <p className="text-sm font-medium text-theme-text-muted">展示当前在线的人机会话，包括网络信息与登录时间。</p>
                </div>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-theme-elevated px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-theme-text-muted">
                <ShieldCheck size={14} />
                Realtime Audit
              </div>
            </div>
          </div>

          {(() => {
            const columns: DataTableColumn<UserSession>[] = [
              {
                key: 'identity',
                header: '在线身份',
                render: (session) => (
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-500/15 font-semibold text-emerald-400 shadow-inner">
                      {session.username.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-theme-text-primary">{session.username}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {session.role?.length ? session.role.map((role) => (
                          <span key={role} className="rounded-full border border-theme-border bg-theme-elevated px-2.5 py-1 text-[10px] font-medium uppercase text-theme-text-muted">
                            {role}
                          </span>
                        )) : (
                          <span className="rounded-full border border-theme-border bg-theme-elevated px-2.5 py-1 text-[10px] font-medium uppercase text-theme-text-muted">
                            Guest
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                key: 'ip_address',
                header: '网络地址',
                render: (session) => (
                  <div className="inline-flex items-center gap-2 rounded-xl bg-sky-500/15 px-3 py-2 text-xs font-medium text-sky-400">
                    <MapPin size={12} className="text-sky-400" />
                    {session.ip_address}
                  </div>
                ),
              },
              {
                key: 'user_agent',
                header: '设备指纹',
                render: (session) => (
                  <div className="max-w-[280px] rounded-lg border border-theme-border bg-theme-surface px-4 py-3 text-xs font-medium leading-6 text-theme-text-muted">
                    {session.user_agent || '未知设备'}
                  </div>
                ),
              },
              {
                key: 'login_at',
                header: '建立时间',
                render: (session) => (
                  <div className="flex flex-col gap-1">
                    <div className="inline-flex items-center gap-2 text-xs font-medium text-theme-text-secondary">
                      <Clock size={12} className="text-theme-text-faint" />
                      {session.login_at?.split('T')[1]?.split('.')[0] || '12:00:00'}
                    </div>
                    <span className="text-[11px] font-medium text-theme-text-muted">{session.login_at?.split('T')[0] || '2024-01-01'}</span>
                  </div>
                ),
              },
              {
                key: 'action',
                header: '风险处置',
                align: 'right',
                render: (session) => (
                  <button
                    onClick={() => void handleKick(session.user_id, session.username)}
                    disabled={isActionLoading}
                    className="inline-flex items-center gap-2 rounded-2xl bg-rose-500/15 px-5 py-3 text-sm font-semibold text-rose-400 transition hover:bg-rose-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <UserX size={15} />
                    吊销会话
                  </button>
                ),
              },
            ];

            return (
              <DataTable<UserSession>
                columns={columns}
                data={paginatedSessions}
                rowKey={(session) => `${session.user_id}-${session.ip_address}`}
                loading={loading && sessions.length === 0}
                minWidth={900}
              />
            );
          })()}

          {!loading && filteredSessions.length > 0 && (
            <div className="flex flex-col gap-4 border-t border-theme-border px-6 py-5 md:flex-row md:items-center md:justify-between md:px-8">
              <div className="flex items-center gap-3 text-sm font-medium text-theme-text-muted">
                <span>每页显示</span>
                <select
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  className="rounded-xl border border-theme-border bg-theme-elevated px-3 py-2 text-sm font-bold text-theme-text-secondary outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-500/10"
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
                <span className="text-sm font-medium text-theme-text-muted">
                  当前展示 {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filteredSessions.length)} / {filteredSessions.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page <= 1}
                    className="rounded-xl border border-theme-border bg-theme-surface px-4 py-2 text-sm font-medium text-theme-text-secondary transition hover:border-emerald-500/20 hover:text-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    上一页
                  </button>
                  <button
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    disabled={page >= totalPages}
                    className="rounded-xl border border-theme-border bg-theme-surface px-4 py-2 text-sm font-medium text-theme-text-secondary transition hover:border-emerald-500/20 hover:text-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
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
