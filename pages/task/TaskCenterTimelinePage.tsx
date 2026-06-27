import React, { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../design-system';
import { ArrowLeft, Loader2, RefreshCw, Search } from 'lucide-react';
import { api } from '../../clients/api';
import { ScheduleCenterUserTask, ScheduleUserTaskEvent, ScheduleUserTaskEventListResponse } from '../../types/types';

interface Props {
  projectId: string;
  taskId: string;
  onBack: () => void;
}

const formatDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString('zh-CN') : '—');

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

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

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
    <div
      className="space-y-4 px-5 py-5 md:px-6 2xl:px-8"
      style={{ backgroundColor: LK.canvas, minHeight: '100%', color: LK.inkSoft }}
    >
      <PageHeader
        title="任务调度事件"
        description={<div><div className="text-sm" style={{ color: LK.body }}>{task?.name || '—'} <span style={{ color: LK.muted }}>/</span> {taskId || '—'}</div><div className="mt-1 text-xs" style={{ color: LK.muted }}>下游任务：{task?.downstream_task_id || '—'}，同步状态：{task?.sync_status || 'none'}</div></div>}
        back={{ label: '返回任务中心', onClick: onBack }}
        actions={
          <button type="button" onClick={() => void loadEvents(page, pageSize, filters)} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}`, color: LK.inkSoft }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = LK.primary; e.currentTarget.style.color = LK.primarySoft; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = LK.border; e.currentTarget.style.color = LK.inkSoft; }}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />刷新</button>
        }
      />

      <form
        onSubmit={submitFilters}
        className="overflow-hidden rounded-xl"
        style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
      >
        <div className="p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="block text-sm font-semibold xl:col-span-2" style={{ color: LK.inkSoft }}>
              搜索
              <div
                className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2"
                style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}` }}
              >
                <Search size={15} style={{ color: LK.muted }} />
                <input
                  value={filters.search}
                  onChange={(e) => setFilters((current) => ({ ...current, search: e.target.value }))}
                  placeholder="任务名、消息、Actor、下游任务 ID"
                  className="w-full bg-transparent text-sm outline-none"
                  style={{ color: LK.inkSoft }}
                />
              </div>
            </label>
            <label className="block text-sm font-semibold" style={{ color: LK.inkSoft }}>
              事件分类
              <input
                value={filters.event_category}
                onChange={(e) => setFilters((current) => ({ ...current, event_category: e.target.value }))}
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
                style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
              />
            </label>
            <label className="block text-sm font-semibold" style={{ color: LK.inkSoft }}>
              事件类型
              <input
                value={filters.event_type}
                onChange={(e) => setFilters((current) => ({ ...current, event_type: e.target.value }))}
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
                style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
              />
            </label>
            <label className="block text-sm font-semibold" style={{ color: LK.inkSoft }}>
              结果状态
              <select
                value={filters.result_status}
                onChange={(e) => setFilters((current) => ({ ...current, result_status: e.target.value }))}
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
                style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
              >
                <option value="">全部</option>
                <option value="success">success</option>
                <option value="failed">failed</option>
                <option value="running">running</option>
              </select>
            </label>
            <label className="block text-sm font-semibold" style={{ color: LK.inkSoft }}>
              事件来源
              <input
                value={filters.event_source}
                onChange={(e) => setFilters((current) => ({ ...current, event_source: e.target.value }))}
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
                style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
              />
            </label>
            <label className="block text-sm font-semibold" style={{ color: LK.inkSoft }}>
              Actor
              <input
                value={filters.actor}
                onChange={(e) => setFilters((current) => ({ ...current, actor: e.target.value }))}
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
                style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
              />
            </label>
            <label className="block text-sm font-semibold" style={{ color: LK.inkSoft }}>
              下游任务 ID
              <input
                value={filters.downstream_task_id}
                onChange={(e) => setFilters((current) => ({ ...current, downstream_task_id: e.target.value }))}
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
                style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
              />
            </label>
            <label className="block text-sm font-semibold" style={{ color: LK.inkSoft }}>
              起始时间
              <input
                type="datetime-local"
                value={filters.from_time}
                onChange={(e) => setFilters((current) => ({ ...current, from_time: e.target.value }))}
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
                style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
              />
            </label>
            <label className="block text-sm font-semibold" style={{ color: LK.inkSoft }}>
              结束时间
              <input
                type="datetime-local"
                value={filters.to_time}
                onChange={(e) => setFilters((current) => ({ ...current, to_time: e.target.value }))}
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
                style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
                onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
                onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-sm" style={{ color: LK.body }}>
              <input
                type="checkbox"
                checked={filters.only_failed}
                onChange={(e) => setFilters((current) => ({ ...current, only_failed: e.target.checked }))}
              />
              仅看失败事件
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void resetFilters()}
                className="rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                style={{ backgroundColor: LK.surfaceRaised, color: LK.body, border: `1px solid ${LK.border}` }}
                onMouseEnter={(e) => (e.currentTarget.style.color = LK.ink)}
                onMouseLeave={(e) => (e.currentTarget.style.color = LK.body)}
              >
                重置
              </button>
              <button
                type="submit"
                className="rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                style={{ backgroundColor: LK.primary, color: '#ffffff' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = LK.primaryDeep)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = LK.primary)}
              >
                服务端筛选
              </button>
            </div>
          </div>
        </div>
      </form>

      {error ? (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{ backgroundColor: `${LK.error}14`, border: `1px solid ${LK.error}40`, color: LK.error }}
        >
          {error}
        </div>
      ) : null}

      <div
        className="overflow-hidden rounded-xl"
        style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom:`1px solid ${LK.border}` }}
        >
          <div className="text-sm" style={{ color: LK.muted }}>
            共 {total} 条事件
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span style={{ color: LK.muted }}>每页</span>
            <select
              value={pageSize}
              onChange={(e) => {
                const next = Number(e.target.value) || 50;
                setPageSize(next);
                setPage(1);
              }}
              className="rounded-lg px-2 py-1 outline-none transition-colors"
              style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
              onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
              onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
            >
              {[20, 50, 100, 200].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider" style={{ color: LK.mutedSoft }}>
                <th className="px-4 py-2.5  text-theme-text-primary font-semibold" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>时间</th>
                <th className="px-4 py-2.5  text-theme-text-primary font-semibold" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>分类</th>
                <th className="px-4 py-2.5  text-theme-text-primary font-semibold" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>类型</th>
                <th className="px-4 py-2.5  text-theme-text-primary font-semibold" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>结果</th>
                <th className="px-4 py-2.5  text-theme-text-primary font-semibold" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>来源</th>
                <th className="px-4 py-2.5  text-theme-text-primary font-semibold" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>Actor</th>
                <th className="px-4 py-2.5  text-theme-text-primary font-semibold" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>消息</th>
                <th className="px-4 py-2.5  text-theme-text-primary font-semibold" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>下游任务</th>
                <th className="px-4 py-2.5  text-theme-text-primary font-semibold" style={{ borderBottom:`1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>调度载荷</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    className="px-4 py-10 text-center"
                    colSpan={9}
                    style={{ color: LK.muted }}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin" /> 加载中...
                    </span>
                  </td>
                </tr>
              ) : null}
              {!loading && items.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center" colSpan={9} style={{ color: LK.muted }}>
                    暂无事件
                  </td>
                </tr>
              ) : null}
              {!loading && items.map((item) => {
                const expanded = expandedEventId === item.id;
                const hasPayload = !!item.payload && Object.keys(item.payload).length > 0;
                const resultColor = item.result_status === 'failed' ? LK.error : LK.success;
                return (
                  <React.Fragment key={item.id}>
                    <tr className="align-top">
                      <td className="px-4 py-3 whitespace-nowrap" style={{ borderBottom:`1px solid ${LK.borderSoft}`, color: LK.body }}>
                        {formatDateTime(item.created_at)}
                      </td>
                      <td className="px-4 py-3" style={{ borderBottom:`1px solid ${LK.borderSoft}`, fontFamily: MONO, fontSize: '12px', color: LK.body }}>
                        {item.event_category}
                      </td>
                      <td className="px-4 py-3" style={{ borderBottom:`1px solid ${LK.borderSoft}`, fontFamily: MONO, fontSize: '12px', color: LK.body }}>
                        {item.event_type}
                      </td>
                      <td className="px-4 py-3" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
                        <span style={{ color: resultColor }}>
                          {item.result_status}
                        </span>
                      </td>
                      <td className="px-4 py-3" style={{ borderBottom:`1px solid ${LK.borderSoft}`, fontFamily: MONO, fontSize: '12px', color: LK.body }}>
                        {item.event_source || '—'}
                      </td>
                      <td className="px-4 py-3" style={{ borderBottom:`1px solid ${LK.borderSoft}`, fontFamily: MONO, fontSize: '12px', color: LK.body }}>
                        {item.actor || '—'}
                      </td>
                      <td className="px-4 py-3 min-w-[24rem]" style={{ borderBottom:`1px solid ${LK.borderSoft}`, color: LK.inkSoft }}>
                        {item.message || '—'}
                      </td>
                      <td className="px-4 py-3" style={{ borderBottom:`1px solid ${LK.borderSoft}`, fontFamily: MONO, fontSize: '12px', color: LK.body }}>
                        {item.downstream_task_id || '—'}
                      </td>
                      <td className="px-4 py-3" style={{ borderBottom:`1px solid ${LK.borderSoft}` }}>
                        <button
                          type="button"
                          disabled={!hasPayload}
                          onClick={() => setExpandedEventId(expanded ? '' : item.id)}
                          className="rounded-lg px-3 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                          style={{ backgroundColor: LK.surfaceRaised, color: LK.body, border: `1px solid ${LK.border}` }}
                          onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.color = LK.ink; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = LK.body; }}
                        >
                          {expanded ? '收起' : '查看'}
                        </button>
                      </td>
                    </tr>
                    {expanded && hasPayload ? (
                      <tr style={{ backgroundColor: `${LK.surfaceRaised}80` }}>
                        <td className="px-4 py-3" colSpan={9}>
                          <pre
                            className="overflow-auto rounded-lg p-3"
                            style={{ backgroundColor: LK.surface, fontFamily: MONO, fontSize: '12px', color: LK.inkSoft }}
                          >
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
        <div
          className="flex items-center justify-between px-4 py-3 text-sm"
          style={{ borderTop:`1px solid ${LK.border}` }}
        >
          <div style={{ color: LK.muted }}>
            第 {page} / {totalPages} 页
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1 || loading}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: LK.surfaceRaised, color: LK.body, border: `1px solid ${LK.border}` }}
              onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.color = LK.ink; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = LK.body; }}
            >
              上一页
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages || loading}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: LK.surfaceRaised, color: LK.body, border: `1px solid ${LK.border}` }}
              onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.color = LK.ink; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = LK.body; }}
            >
              下一页
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};