import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, RefreshCw, Search } from 'lucide-react';
import { api } from '../../clients/api';
import { ScheduleCenterUserTask, ScheduleUserTaskEvent, ScheduleUserTaskEventListResponse } from '../../types/types';

interface Props {
  projectId: string;
  taskId: string;
  onBack: () => void;
}

const formatDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString('zh-CN') : '—');

type FiltersState = {
  search: string;
  event_category: string;
  event_type: string;
  result_status: string;
  event_source: string;
  actor: string;
  downstream_task_id: string;
  from_time: string;
  to_time: string;
  only_failed: boolean;
};

const DEFAULT_FILTERS: FiltersState = {
  search: '',
  event_category: '',
  event_type: '',
  result_status: '',
  event_source: '',
  actor: '',
  downstream_task_id: '',
  from_time: '',
  to_time: '',
  only_failed: false,
};

export const TaskCenterTimelinePage: React.FC<Props> = ({ projectId, taskId, onBack }) => {
  const scheduleApi = api.domains.platform.scheduleCenter;
  const [task, setTask] = useState<ScheduleCenterUserTask | null>(null);
  const [items, setItems] = useState<ScheduleUserTaskEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS);
  const [expandedEventId, setExpandedEventId] = useState('');

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total]);

  const loadTask = async () => {
    if (!projectId || !taskId) return;
    const resp = await scheduleApi.getUserTask(projectId, taskId) as ScheduleCenterUserTask;
    setTask(resp);
  };

  const loadEvents = async (nextPage = page, nextPageSize = pageSize, nextFilters = filters) => {
    if (!projectId || !taskId) return;
    setLoading(true);
    setError('');
    try {
      const resp = await scheduleApi.listUserTaskEvents(projectId, taskId, {
        page: nextPage,
        page_size: nextPageSize,
        ...nextFilters,
      }) as ScheduleUserTaskEventListResponse;
      setItems(resp.items || []);
      setTotal(resp.total || 0);
      setExpandedEventId('');
    } catch (err: any) {
      setError(err?.message || '加载事件失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTask();
  }, [projectId, taskId]);

  useEffect(() => {
    void loadEvents(page, pageSize, filters);
  }, [projectId, taskId, page, pageSize]);

  const submitFilters = async (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    await loadEvents(1, pageSize, filters);
  };

  const resetFilters = async () => {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
    await loadEvents(1, pageSize, DEFAULT_FILTERS);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-3 inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-semibold text-theme-text-secondary"
          >
            <ArrowLeft size={16} />
            返回任务中心
          </button>
          <h1 className="text-2xl font-black text-theme-text-primary">任务调度事件</h1>
          <div className="mt-2 text-sm text-theme-text-faint">
            {task?.name || '—'} / {taskId || '—'}
          </div>
          <div className="mt-1 text-xs text-theme-text-faint">
            下游任务：{task?.downstream_task_id || '—'}，同步状态：{task?.sync_status || 'none'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadEvents(page, pageSize, filters)}
          className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-4 py-2 text-sm font-semibold text-theme-text-primary"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      <form onSubmit={submitFilters} className="rounded-2xl border border-theme-border bg-theme-surface p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="block text-sm font-semibold text-theme-text-secondary xl:col-span-2">
            搜索
            <div className="mt-1 flex items-center gap-2 rounded-xl border border-theme-border bg-theme-elevated px-3 py-2">
              <Search size={15} className="text-theme-text-faint" />
              <input
                value={filters.search}
                onChange={(e) => setFilters((current) => ({ ...current, search: e.target.value }))}
                placeholder="任务名、消息、Actor、下游任务 ID"
                className="w-full bg-transparent text-sm text-theme-text-primary outline-none"
              />
            </div>
          </label>
          <label className="block text-sm font-semibold text-theme-text-secondary">
            事件分类
            <input value={filters.event_category} onChange={(e) => setFilters((current) => ({ ...current, event_category: e.target.value }))} className="mt-1 w-full rounded-xl border border-theme-border bg-theme-elevated px-3 py-2 text-sm text-theme-text-primary" />
          </label>
          <label className="block text-sm font-semibold text-theme-text-secondary">
            事件类型
            <input value={filters.event_type} onChange={(e) => setFilters((current) => ({ ...current, event_type: e.target.value }))} className="mt-1 w-full rounded-xl border border-theme-border bg-theme-elevated px-3 py-2 text-sm text-theme-text-primary" />
          </label>
          <label className="block text-sm font-semibold text-theme-text-secondary">
            结果状态
            <select value={filters.result_status} onChange={(e) => setFilters((current) => ({ ...current, result_status: e.target.value }))} className="mt-1 w-full rounded-xl border border-theme-border bg-theme-elevated px-3 py-2 text-sm text-theme-text-primary">
              <option value="">全部</option>
              <option value="success">success</option>
              <option value="failed">failed</option>
              <option value="running">running</option>
            </select>
          </label>
          <label className="block text-sm font-semibold text-theme-text-secondary">
            事件来源
            <input value={filters.event_source} onChange={(e) => setFilters((current) => ({ ...current, event_source: e.target.value }))} className="mt-1 w-full rounded-xl border border-theme-border bg-theme-elevated px-3 py-2 text-sm text-theme-text-primary" />
          </label>
          <label className="block text-sm font-semibold text-theme-text-secondary">
            Actor
            <input value={filters.actor} onChange={(e) => setFilters((current) => ({ ...current, actor: e.target.value }))} className="mt-1 w-full rounded-xl border border-theme-border bg-theme-elevated px-3 py-2 text-sm text-theme-text-primary" />
          </label>
          <label className="block text-sm font-semibold text-theme-text-secondary">
            下游任务 ID
            <input value={filters.downstream_task_id} onChange={(e) => setFilters((current) => ({ ...current, downstream_task_id: e.target.value }))} className="mt-1 w-full rounded-xl border border-theme-border bg-theme-elevated px-3 py-2 text-sm text-theme-text-primary" />
          </label>
          <label className="block text-sm font-semibold text-theme-text-secondary">
            起始时间
            <input type="datetime-local" value={filters.from_time} onChange={(e) => setFilters((current) => ({ ...current, from_time: e.target.value }))} className="mt-1 w-full rounded-xl border border-theme-border bg-theme-elevated px-3 py-2 text-sm text-theme-text-primary" />
          </label>
          <label className="block text-sm font-semibold text-theme-text-secondary">
            结束时间
            <input type="datetime-local" value={filters.to_time} onChange={(e) => setFilters((current) => ({ ...current, to_time: e.target.value }))} className="mt-1 w-full rounded-xl border border-theme-border bg-theme-elevated px-3 py-2 text-sm text-theme-text-primary" />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-theme-text-secondary">
            <input
              type="checkbox"
              checked={filters.only_failed}
              onChange={(e) => setFilters((current) => ({ ...current, only_failed: e.target.checked }))}
            />
            仅看失败事件
          </label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void resetFilters()} className="rounded-xl border border-theme-border px-4 py-2 text-sm font-semibold text-theme-text-secondary">
              重置
            </button>
            <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
              服务端筛选
            </button>
          </div>
        </div>
      </form>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <div className="overflow-hidden rounded-2xl border border-theme-border bg-theme-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-theme-border px-4 py-3">
          <div className="text-sm text-theme-text-faint">共 {total} 条事件</div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-theme-text-faint">每页</span>
            <select
              value={pageSize}
              onChange={(e) => {
                const next = Number(e.target.value) || 50;
                setPageSize(next);
                setPage(1);
              }}
              className="rounded-lg border border-theme-border bg-theme-elevated px-2 py-1 text-theme-text-primary"
            >
              {[20, 50, 100, 200].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-theme-elevated text-left text-theme-text-faint">
              <tr>
                <th className="px-4 py-3">时间</th>
                <th className="px-4 py-3">分类</th>
                <th className="px-4 py-3">类型</th>
                <th className="px-4 py-3">结果</th>
                <th className="px-4 py-3">来源</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">消息</th>
                <th className="px-4 py-3">下游任务</th>
                <th className="px-4 py-3">调度载荷</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="px-4 py-10 text-center text-theme-text-faint" colSpan={9}><span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" />加载中...</span></td></tr>
              ) : null}
              {!loading && items.length === 0 ? (
                <tr><td className="px-4 py-10 text-center text-theme-text-faint" colSpan={9}>暂无事件</td></tr>
              ) : null}
              {!loading && items.map((item) => {
                const expanded = expandedEventId === item.id;
                const hasPayload = !!item.payload && Object.keys(item.payload).length > 0;
                return (
                  <React.Fragment key={item.id}>
                    <tr className="border-t border-theme-border align-top">
                      <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(item.created_at)}</td>
                      <td className="px-4 py-3 font-mono text-xs">{item.event_category}</td>
                      <td className="px-4 py-3 font-mono text-xs">{item.event_type}</td>
                      <td className="px-4 py-3">
                        <span className={item.result_status === 'failed' ? 'text-rose-600' : 'text-emerald-600'}>
                          {item.result_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{item.event_source || '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs">{item.actor || '—'}</td>
                      <td className="px-4 py-3 min-w-[24rem] text-theme-text-primary">{item.message || '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs">{item.downstream_task_id || '—'}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled={!hasPayload}
                          onClick={() => setExpandedEventId(expanded ? '' : item.id)}
                          className="rounded-lg border border-theme-border px-3 py-1 text-xs font-semibold text-theme-text-secondary disabled:opacity-40"
                        >
                          {expanded ? '收起' : '查看'}
                        </button>
                      </td>
                    </tr>
                    {expanded && hasPayload ? (
                      <tr className="border-t border-theme-border bg-theme-elevated/50">
                        <td className="px-4 py-3" colSpan={9}>
                          <pre className="overflow-auto rounded-xl bg-theme-surface p-3 text-xs text-theme-text-primary">
                            {JSON.stringify(item.payload, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-theme-border px-4 py-3 text-sm">
          <div className="text-theme-text-faint">第 {page} / {totalPages} 页</div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading} className="rounded-lg border border-theme-border px-3 py-1.5 text-theme-text-secondary disabled:opacity-40">
              上一页
            </button>
            <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || loading} className="rounded-lg border border-theme-border px-3 py-1.5 text-theme-text-secondary disabled:opacity-40">
              下一页
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
