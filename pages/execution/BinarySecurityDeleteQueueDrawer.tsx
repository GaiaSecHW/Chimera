import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Shield, Trash2, X } from 'lucide-react';

import { api } from '../../clients/api';
import type {
  BinarySecurityDeleteQueueItem,
  BinarySecurityDeleteQueueResponse,
  BinarySecurityDeleteQueueTaskType,
} from '../../clients/binarySecurity';
import { showConfirm } from '../../components/DialogService';

const LK = {
  warning: '#d5a13a',
  info: '#5aa3ff',
  error: '#f15d5d',
};

const DELETE_QUEUE_PAGE_SIZE = 20;
const DELETE_QUEUE_POLL_MS = 15000;

const getDeleteQueueTypeLabel = (taskType?: string | null) => {
  switch (String(taskType || '').trim()) {
    case 'source_scan_e2e': return '盖亚-源码';
    case 'kg_source_vuln_scan_e2e': return '知识图谱-漏洞挖掘';
    case 'binary_module_e2e': return '盖亚-二进制模块';
    default: return '盖亚-二进制固件';
  }
};

const formatDeleteQueueStatus = (status?: string | null) => {
  switch (String(status || '').trim()) {
    case 'queued': return '排队中';
    case 'running': return '删除中';
    case 'blocked': return '阻塞';
    case 'failed': return '失败';
    case 'deleted': return '已删除';
    default: return status || '—';
  }
};

const deleteQueueStatusColor = (status?: string | null) => {
  switch (String(status || '').trim()) {
    case 'queued': return LK.warning;
    case 'running': return LK.info;
    case 'blocked': return LK.warning;
    case 'failed': return LK.error;
    default: return 'var(--text-secondary)';
  }
};

const truncateText = (value?: string | null, max = 120) => {
  const text = String(value || '').trim();
  if (!text) return '—';
  return text.length > max ? `${text.slice(0, max)}...` : text;
};

const fmt = (value?: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('zh-CN', { hour12: false });
};

interface Props {
  open: boolean;
  projectId: string;
  taskType: BinarySecurityDeleteQueueTaskType;
  onClose: () => void;
  onForceDeleteAccepted?: (item: BinarySecurityDeleteQueueItem) => void | Promise<void>;
}

export const BinarySecurityDeleteQueueDrawer: React.FC<Props> = ({
  open,
  projectId,
  taskType,
  onClose,
  onForceDeleteAccepted,
}) => {
  const executionApi = api.domains.execution;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<BinarySecurityDeleteQueueItem[]>([]);
  const [stats, setStats] = useState<BinarySecurityDeleteQueueResponse['stats']>({
    queued_total: 0,
    running_total: 0,
    blocked_total: 0,
    failed_total: 0,
  });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [rowActionId, setRowActionId] = useState<string | null>(null);

  const typeLabel = useMemo(() => getDeleteQueueTypeLabel(taskType), [taskType]);

  const loadDeleteQueue = async (nextPage = page) => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    setPage(nextPage);
    try {
      const payload = await executionApi.binarySecurity.listDeleteQueue(projectId, {
        page: nextPage,
        pageSize: DELETE_QUEUE_PAGE_SIZE,
        taskType,
        deleteStatus: statusFilter || undefined,
        search: search.trim() || undefined,
        sortBy: 'delete_requested_at',
        sortDirection: 'desc',
      });
      setItems(payload.items || []);
      setStats(payload.stats || {
        queued_total: 0,
        running_total: 0,
        blocked_total: 0,
        failed_total: 0,
      });
      setTotal(Number(payload.total || 0));
      setPage(Number(payload.page || nextPage || 1));
    } catch (e: any) {
      setError(e?.message || '加载删除队列失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setError(null);
    setItems([]);
    setStats({
      queued_total: 0,
      running_total: 0,
      blocked_total: 0,
      failed_total: 0,
    });
    setPage(1);
    setTotal(0);
    setSearch('');
    setStatusFilter('');
    setRowActionId(null);
  }, [open, projectId, taskType]);

  useEffect(() => {
    if (!open) return;
    void loadDeleteQueue(1);
  }, [open, taskType]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => {
      void loadDeleteQueue(page);
    }, DELETE_QUEUE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [open, page, projectId, search, statusFilter, taskType]);

  const forceDeleteQueueItem = async (item: BinarySecurityDeleteQueueItem) => {
    if (!projectId || !item?.id || rowActionId) return;
    const confirmed = await showConfirm({
      title: '强制删除队列任务',
      message: `将对任务“${item.name || item.id}”发起强制删除，忽略当前删除阻塞或下游删除失败并继续清理主任务。该操作不可恢复，是否继续？`,
      confirmText: '确认强制删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    setRowActionId(item.id);
    setError(null);
    try {
      await executionApi.binarySecurity.deleteTask(projectId, item.id, { force: true });
      await loadDeleteQueue(page);
      await onForceDeleteAccepted?.(item);
    } catch (e: any) {
      setError(e?.message || '强制删除失败');
    } finally {
      setRowActionId(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[121] bg-slate-950/55 backdrop-blur-sm" onClick={onClose}>
      <div className="flex h-full w-full justify-end">
        <div
          className="flex h-full w-full max-w-[min(96vw,1100px)] flex-col border-l border-theme-border bg-theme-surface shadow-[0_0_60px_rgba(15,23,42,0.4)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="border-b border-theme-border bg-theme-elevated px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-theme-text-muted">Delete Queue</div>
                <h3 className="mt-2 text-2xl font-bold tracking-tight text-theme-text-primary">{typeLabel} 删除队列</h3>
                <p className="mt-2 text-sm text-theme-text-secondary">按当前任务类型查看后台异步删除队列，并对阻塞项直接发起强制删除。</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full px-3 py-1 font-semibold" style={{ backgroundColor: `${LK.warning}22`, color: LK.warning }}>排队中 {stats.queued_total}</span>
                  <span className="rounded-full px-3 py-1 font-semibold" style={{ backgroundColor: `${LK.info}22`, color: LK.info }}>删除中 {stats.running_total}</span>
                  <span className="rounded-full px-3 py-1 font-semibold" style={{ backgroundColor: `${LK.warning}22`, color: LK.warning }}>阻塞 {stats.blocked_total}</span>
                  <span className="rounded-full px-3 py-1 font-semibold" style={{ backgroundColor: `${LK.error}22`, color: LK.error }}>失败 {stats.failed_total}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadDeleteQueue(page)}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-4 py-2.5 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated disabled:opacity-60"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  刷新
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center gap-2 rounded-xl bg-theme-surface px-4 py-2.5 text-sm font-bold text-white hover:bg-theme-elevated"
                >
                  <X size={16} />
                  关闭
                </button>
              </div>
            </div>
          </div>

          <div className="border-b border-theme-border px-6 py-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
              <label className="block text-sm font-semibold text-theme-text-secondary">
                搜索
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="任务名 / 任务ID / 删除错误"
                  className="mt-1 w-full rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text-primary outline-none transition focus:border-sky-500"
                />
              </label>
              <label className="block text-sm font-semibold text-theme-text-secondary">
                删除状态
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text-primary outline-none transition focus:border-sky-500"
                >
                  <option value="">全部</option>
                  <option value="queued">queued</option>
                  <option value="running">running</option>
                  <option value="blocked">blocked</option>
                  <option value="failed">failed</option>
                </select>
              </label>
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => void loadDeleteQueue(1)}
                  className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-4 py-2.5 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated"
                >
                  查询
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('');
                    void loadDeleteQueue(1);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-4 py-2.5 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated"
                >
                  重置
                </button>
              </div>
            </div>
            {error ? (
              <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-400">{error}</div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
            <div className="mb-3 text-sm text-theme-text-muted">共 {total} 条</div>
            <div className="overflow-hidden rounded-2xl border border-theme-border">
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-theme-elevated text-left text-xs uppercase tracking-[0.2em] text-theme-text-muted">
                      <th className="px-4 py-3 font-semibold">任务名</th>
                      <th className="px-4 py-3 font-semibold">任务 ID</th>
                      <th className="px-4 py-3 font-semibold">任务类型</th>
                      <th className="px-4 py-3 font-semibold">当前状态</th>
                      <th className="px-4 py-3 font-semibold">删除状态</th>
                      <th className="px-4 py-3 font-semibold">删除错误</th>
                      <th className="px-4 py-3 font-semibold">下游任务 ID</th>
                      <th className="px-4 py-3 font-semibold">请求时间</th>
                      <th className="px-4 py-3 font-semibold">开始时间</th>
                      <th className="px-4 py-3 font-semibold">完成时间</th>
                      <th className="px-4 py-3 font-semibold">更新时间</th>
                      <th className="px-4 py-3 font-semibold">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={12} className="px-4 py-10 text-center text-theme-text-secondary">
                          <span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" />加载删除队列中...</span>
                        </td>
                      </tr>
                    ) : null}
                    {!loading && items.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="px-4 py-10 text-center text-theme-text-secondary">当前类型暂无删除队列任务</td>
                      </tr>
                    ) : null}
                    {!loading && items.map((item) => {
                      const statusColor = deleteQueueStatusColor(item.delete_status);
                      const forceDeleteDisabled = item.delete_status === 'deleted';
                      return (
                        <tr
                          key={item.id}
                          className="border-t border-theme-border align-top"
                          style={{
                            backgroundColor: item.delete_status === 'failed'
                              ? `${LK.error}10`
                              : item.delete_status === 'blocked'
                                ? `${LK.warning}10`
                                : item.delete_status === 'running'
                                  ? `${LK.info}10`
                                  : 'transparent',
                          }}
                        >
                          <td className="px-4 py-3 font-semibold text-theme-text-primary">{item.name}</td>
                          <td className="px-4 py-3 font-mono text-xs text-theme-text-secondary">{item.id}</td>
                          <td className="px-4 py-3 text-theme-text-secondary">{getDeleteQueueTypeLabel(item.task_type)}</td>
                          <td className="px-4 py-3 text-theme-text-secondary">{item.display_status || '—'}</td>
                          <td className="px-4 py-3"><span style={{ color: statusColor }}>{formatDeleteQueueStatus(item.delete_status)}</span></td>
                          <td className="px-4 py-3 text-xs text-theme-text-secondary" title={item.delete_error || item.last_error || ''}>{truncateText(item.delete_error || item.last_error)}</td>
                          <td className="px-4 py-3 font-mono text-xs text-theme-text-secondary">{item.downstream_task_id || '—'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-theme-text-muted">{fmt(item.delete_requested_at)}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-theme-text-muted">{fmt(item.delete_started_at)}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-theme-text-muted">{fmt(item.delete_finished_at)}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-theme-text-muted">{fmt(item.updated_at)}</td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              disabled={forceDeleteDisabled || rowActionId === item.id}
                              title={forceDeleteDisabled ? '该队列项已删除完成，无需再次强制删除' : '忽略当前删除阻塞并重新发起强制删除'}
                              onClick={() => void forceDeleteQueueItem(item)}
                              className="inline-flex items-center gap-2 rounded-xl border border-rose-500 bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {rowActionId === item.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                              强制删除
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
