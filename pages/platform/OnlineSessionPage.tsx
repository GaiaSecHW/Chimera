import React, { useEffect, useMemo, useState } from 'react';
import { Clock, Globe, Loader2, MapPin, Monitor, RefreshCw, Search, ShieldCheck, UserX, Zap } from 'lucide-react';
import { api } from '../../clients/api';
import { showConfirm } from '../../components/DialogService';
import { UserSession } from '../../types/types';

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
        <section className="relative overflow-hidden rounded-[2rem] border border-emerald-950/10 bg-[linear-gradient(135deg,_#052e2b,_#065f46_55%,_#0f766e)] px-8 py-8 text-white md:px-10">
          <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,_rgba(110,231,183,0.18),_transparent_58%)]" />
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-4 xl:max-w-[48rem] 2xl:max-w-[60rem]">
              <div className="flex items-start gap-4">
 <div className="flex h-16 w-16 items-center justify-center rounded-[1.75rem] bg-slate-100 text-emerald-100 shadow-inner shadow-white/5">
                  <Globe size={30} />
                </div>
                <div className="space-y-2">
                  <h2 className="text-3xl font-black tracking-tight md:text-4xl">在线会话监控</h2>
                  <p className="max-w-2xl text-sm font-medium leading-7 text-emerald-50/85">
                    聚合当前在线用户会话、终端指纹和网络地址，便于快速研判异常登录并执行强制下线。
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 self-start xl:self-auto">
 <div className="rounded-[1.5rem] border border-slate-200 bg-slate-100 px-4 py-3 backdrop-blur">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-100/70">最近同步</p>
                <p className="mt-1 text-sm font-black text-white">{lastRefreshed.toLocaleTimeString()}</p>
              </div>
              <button
                onClick={() => void fetchSessions()}
 className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-50/15"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                刷新
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
 <div className="rounded-[1.8rem] bg-slate-950 px-6 py-6 text-white">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">在线会话</p>
            <p className="mt-4 text-5xl font-black">{sessions.length}</p>
            <p className="mt-4 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-300">
              <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Live Stream
            </p>
          </div>
 <div className="rounded-[1.8rem] border border-slate-200 bg-slate-50 px-6 py-6">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">唯一用户</p>
            <p className="mt-4 text-4xl font-black text-slate-900">{new Set(sessions.map((session) => session.user_id)).size}</p>
            <p className="mt-4 text-sm font-medium text-slate-500">按用户维度统计当前活跃登录主体。</p>
          </div>
 <div className="rounded-[1.8rem] border border-slate-200 bg-slate-50 px-6 py-6">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">角色标签</p>
            <p className="mt-4 text-4xl font-black text-slate-900">{roleCount}</p>
            <p className="mt-4 text-sm font-medium text-slate-500">已附加到在线会话上的角色数量总和。</p>
          </div>
 <div className="rounded-[1.8rem] border border-emerald-100 bg-emerald-50/80 px-6 py-6">
            <div className="flex items-center gap-3">
 <div className="flex h-12 w-12 items-center justify-center rounded-[1.2rem] bg-slate-50 text-emerald-700">
                <Zap size={22} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-500">治理能力</p>
                <p className="mt-1 text-lg font-black text-emerald-900">支持秒级强制下线</p>
              </div>
            </div>
            <p className="mt-4 text-sm font-medium leading-6 text-emerald-800/80">对疑似异常会话可直接吊销活跃 JWT，快速阻断风险扩散。</p>
          </div>
        </section>

 <section className="rounded-[2rem] border border-slate-200/80 bg-slate-50 p-5 backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[1.25rem] bg-emerald-100 text-emerald-700">
                <Search size={20} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">检索会话</h3>
                <p className="text-sm font-medium text-slate-500">支持按用户名、IP、角色和终端信息快速搜索。</p>
              </div>
            </div>
            <div className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-slate-500">
              匹配结果 {filteredSessions.length}
            </div>
          </div>

          <label className="mt-5 flex items-center gap-3 rounded-[1.6rem] border border-slate-200 bg-slate-50 px-5 py-4">
            <Search size={18} className="text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="搜索用户名、IP 地址、角色或终端标识..."
              className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400"
            />
          </label>
        </section>

 <section className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-slate-50">
          <div className="border-b border-slate-100 px-6 py-5 md:px-8">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-[1.25rem] bg-sky-50 text-sky-700">
                  <Monitor size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">会话列表</h3>
                  <p className="text-sm font-medium text-slate-500">展示当前在线的人机会话，包括网络信息与登录时间。</p>
                </div>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-slate-500">
                <ShieldCheck size={14} />
                Realtime Audit
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">
                <tr>
                  <th className="px-8 py-4">在线身份</th>
                  <th className="px-6 py-4">网络地址</th>
                  <th className="px-6 py-4">设备指纹</th>
                  <th className="px-6 py-4">建立时间</th>
                  <th className="px-8 py-4 text-right">风险处置</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && sessions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-8 py-32 text-center">
                      <Loader2 className="mx-auto animate-spin text-emerald-600" size={38} />
                    </td>
                  </tr>
                ) : filteredSessions.length > 0 ? (
                  paginatedSessions.map((session, index) => (
                    <tr key={`${session.user_id}-${index}`} className="transition hover:bg-emerald-50/30">
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-[1.2rem] bg-emerald-100 font-black text-emerald-700 shadow-inner">
                            {session.username.slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900">{session.username}</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {session.role?.length ? session.role.map((role) => (
                                <span key={role} className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase text-slate-500">
                                  {role}
                                </span>
                              )) : (
                                <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase text-slate-400">
                                  Guest
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="inline-flex items-center gap-2 rounded-xl bg-sky-50 px-3 py-2 text-xs font-black text-sky-700">
                          <MapPin size={12} className="text-sky-400" />
                          {session.ip_address}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="max-w-[280px] rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium leading-6 text-slate-500">
                          {session.user_agent || '未知设备'}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col gap-1">
                          <div className="inline-flex items-center gap-2 text-xs font-black text-slate-700">
                            <Clock size={12} className="text-slate-300" />
                            {session.login_at?.split('T')[1]?.split('.')[0] || '12:00:00'}
                          </div>
                          <span className="text-[11px] font-medium text-slate-400">{session.login_at?.split('T')[0] || '2024-01-01'}</span>
                        </div>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <button
                          onClick={() => void handleKick(session.user_id, session.username)}
                          disabled={isActionLoading}
                          className="inline-flex items-center gap-2 rounded-2xl bg-rose-50 px-5 py-3 text-sm font-black text-rose-600 transition hover:bg-rose-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <UserX size={15} />
                          吊销会话
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-8 py-32 text-center">
                      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-slate-300">
                        <ShieldCheck size={36} />
                      </div>
                      <p className="mt-5 text-base font-black text-slate-500">暂无匹配的在线会话</p>
                      <p className="mt-2 text-sm font-medium text-slate-400">可以尝试调整搜索条件，或等待下一轮自动同步。</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {!loading && filteredSessions.length > 0 && (
            <div className="flex flex-col gap-4 border-t border-slate-100 px-6 py-5 md:flex-row md:items-center md:justify-between md:px-8">
              <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
                <span>每页显示</span>
                <select
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-500/10"
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
                  当前展示 {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filteredSessions.length)} / {filteredSessions.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page <= 1}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-black text-slate-600 transition hover:border-emerald-200 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    上一页
                  </button>
                  <button
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    disabled={page >= totalPages}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-black text-slate-600 transition hover:border-emerald-200 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
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
