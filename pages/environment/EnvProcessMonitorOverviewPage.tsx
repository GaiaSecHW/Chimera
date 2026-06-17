import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, Search, Server } from 'lucide-react';
import { api } from '../../clients/api';
import { ProcessMonitorNode } from '../../types/types';
import { navigateToAppView } from './ai-agent/shared';

export const EnvProcessMonitorOverviewPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const environmentApi = api.domains.environment;
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ProcessMonitorNode[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(100);

  const load = async () => {
    if (!projectId) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const data = await environmentApi.environment.listProcessMonitorNodes(projectId);
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (error) {
      console.error(error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [projectId]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) => {
      return [
        item.agent_key,
        item.agent_hostname,
        item.agent_ip,
        item.service_name,
        item.template_name,
      ].some((value) => String(value || '').toLowerCase().includes(keyword));
    });
  }, [items, search]);
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pageStart = (page - 1) * perPage;
  const pagedItems = useMemo(() => filtered.slice(pageStart, pageStart + perPage), [filtered, pageStart, perPage]);

  useEffect(() => {
    setPage(1);
  }, [projectId, search, perPage]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="p-10 space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-3xl font-black text-theme-text-primary tracking-tight">节点进程监控 - 节点总览</h2>
          <p className="text-theme-text-muted mt-1 font-medium">展示当前项目下支持 PROCESS_MONITOR 的节点服务</p>
        </div>
        <button
          onClick={() => void load()}
          disabled={!projectId || loading}
          className="px-4 py-3 rounded-2xl border border-theme-border bg-theme-bg-app hover:bg-theme-elevated text-theme-text-secondary font-bold text-xs uppercase tracking-wider disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          刷新
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-theme-text-faint" size={18} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-full pl-12 pr-4 py-3 rounded-2xl border border-theme-border bg-theme-bg-app"
          placeholder="按节点、IP、服务名筛选"
        />
      </div>

      {!projectId ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/15 p-4 text-amber-400 text-sm font-semibold">请先选择项目</div>
      ) : (
        <div className="rounded-3xl border border-theme-border bg-theme-bg-app overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-theme-border px-4 py-3 bg-slate-50/70">
            <div className="text-xs font-semibold text-theme-text-muted">
              共 <span className="font-black text-theme-text-secondary">{total}</span> 条，当前第 <span className="font-black text-theme-text-secondary">{page}</span> / {totalPages} 页
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-theme-text-muted">每页</span>
              <select
                value={perPage}
                onChange={(event) => {
                  const value = Math.max(1, Math.min(1000, Number(event.target.value) || 100));
                  setPerPage(value);
                }}
                className="rounded-lg border border-theme-border bg-theme-bg-app px-2 py-1 text-xs"
              >
                {[50, 100, 200, 500, 1000].map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 rounded-lg border border-theme-border bg-theme-bg-app px-2 py-1 text-xs disabled:opacity-40"
              >
                <ChevronLeft size={14} />
                上一页
              </button>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 rounded-lg border border-theme-border bg-theme-bg-app px-2 py-1 text-xs disabled:opacity-40"
              >
                下一页
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
          <table className="w-full text-left">
            <thead className="bg-theme-bg-app text-[11px] text-theme-text-muted uppercase tracking-widest">
              <tr>
                <th className="px-6 py-4">节点</th>
                <th className="px-4 py-4">IP</th>
                <th className="px-4 py-4">服务</th>
                <th className="px-4 py-4">模板</th>
                <th className="px-4 py-4">状态</th>
                <th className="px-4 py-4">最后上报</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <Loader2 className="animate-spin mx-auto text-blue-400" />
                  </td>
                </tr>
              ) : total === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-theme-text-muted">暂无支持进程监控的节点</td>
                </tr>
              ) : (
                pagedItems.map((item) => (
                  <tr
                    key={`${item.agent_key}:${item.service_name}:${item.service_uid || ''}`}
                    className="border-t border-theme-border hover:bg-theme-elevated cursor-pointer"
                    onClick={() => navigateToAppView('env-process-monitor-detail', { processMonitorServiceKey:`${item.agent_key}:${item.service_name}` })}
                    title="点击查看该节点的进程详情"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Server size={14} className="text-theme-text-muted" />
                        <div>
                          <div className="text-sm font-black text-theme-text-primary">{item.agent_hostname || item.agent_key}</div>
                          <div className="text-[11px] text-theme-text-muted">{item.agent_key}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-theme-text-secondary">{item.agent_ip || '-'}</td>
                    <td className="px-4 py-4 text-sm text-theme-text-secondary">{item.service_name}</td>
                    <td className="px-4 py-4">
                      <div className="text-sm font-semibold text-theme-text-secondary">{item.template_name || '-'}</div>
                      <div className="text-[11px] text-theme-text-muted">{(item.template_tags || []).join(', ') || '-'}</div>
                    </td>
                    <td className="px-4 py-4 text-xs font-bold uppercase text-theme-text-secondary">{item.status || 'unknown'}</td>
                    <td className="px-4 py-4 text-xs text-theme-text-muted">{item.last_seen_at || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
