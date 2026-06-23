import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Clock,
  FileBox,
  History,
  Loader2,
  RefreshCw,
  Search,
  Terminal,
  Trash2,
  Workflow,
} from 'lucide-react';
import { ProjectTask } from '../../types/types';
import { api } from '../../clients/api';
import { StatusBadge } from '../../components/StatusBadge';
import { DataTable, DataTableColumn, Modal } from '../../design-system';

export const TaskMgmtPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const assetApi = api.domains.assets;
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [detailLogs, setDetailLogs] = useState<string[]>([]);
  const [detailLogLoading, setDetailLogLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [deleteConfirm, setDeleteConfirm] = useState<{
    show: boolean;
    mode: 'single' | 'batch' | 'all';
    taskId: string | null;
    taskIds: string[];
  }>({ show: false, mode: 'single', taskId: null, taskIds: [] });
  const [isDeleting, setIsDeleting] = useState(false);

  const hasActiveTasks = useMemo(
    () => tasks.some((task) => task.status === 'pending' || task.status === 'running'),
    [tasks]
  );

  useEffect(() => {
    if (projectId) {
      void loadTasks(true);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !hasActiveTasks) return;
    const interval = setInterval(() => {
      void loadTasks(false);
    }, 5000);
    return () => clearInterval(interval);
  }, [projectId, hasActiveTasks]);

  const loadTasks = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const data = await assetApi.resources.getTasks(projectId);
      const next = Array.isArray(data) ? data : [];
      setTasks(next);
      setSelectedTaskIds((prev) => {
        const valid = new Set(next.map((task) => task.task_id));
        const normalized = new Set<string>();
        prev.forEach((id) => {
          if (valid.has(id)) normalized.add(id);
        });
        return normalized;
      });
      setSelectedTaskId((prev) => {
        if (prev && next.some((task) => task.task_id === prev)) return prev;
        return next[0]?.task_id || null;
      });
    } catch (err) {
      console.error('Failed to load tasks', err);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const selectedTask = useMemo(
    () => tasks.find((task) => task.task_id === selectedTaskId) || null,
    [tasks, selectedTaskId]
  );

  const loadTaskLogs = async (taskId: string) => {
    setDetailLogLoading(true);
    try {
      const res = await assetApi.resources.getTaskLogs(taskId);
      setDetailLogs(res.logs || []);
    } catch (err) {
      setDetailLogs(['获取日志失败，请稍后重试']);
    } finally {
      setDetailLogLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedTaskId) {
      setDetailLogs([]);
      return;
    }
    void loadTaskLogs(selectedTaskId);
  }, [selectedTaskId]);

  const handleDeleteClick = (taskId: string) => {
    setDeleteConfirm({ show: true, mode: 'single', taskId, taskIds: [taskId] });
  };

  const handleDeleteBatchClick = () => {
    const ids = Array.from(selectedTaskIds);
    if (ids.length === 0) return;
    setDeleteConfirm({ show: true, mode: 'batch', taskId: null, taskIds: ids });
  };

  const handleDeleteAllClick = () => {
    const ids = filteredTasks.map((task) => task.task_id);
    if (ids.length === 0) return;
    setDeleteConfirm({ show: true, mode: 'all', taskId: null, taskIds: ids });
  };

  const executeDeleteTask = async () => {
    if (!deleteConfirm.taskIds.length) return;
    setIsDeleting(true);
    try {
      let deletedCurrent = false;
      for (const taskId of deleteConfirm.taskIds) {
        await assetApi.resources.deleteTask(taskId);
        if (selectedTaskId === taskId) deletedCurrent = true;
      }
      setDeleteConfirm({ show: false, mode: 'single', taskId: null, taskIds: [] });
      setSelectedTaskIds((prev) => {
        const next = new Set(prev);
        deleteConfirm.taskIds.forEach((id) => next.delete(id));
        return next;
      });
      if (deletedCurrent) {
        setSelectedTaskId(null);
      }
      await loadTasks(true);
    } catch (err: any) {
      alert(`删除任务失败: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredTasks = useMemo(
    () =>
      tasks.filter((task) => {
        const keyword = searchTerm.trim().toLowerCase();
        const passKeyword =
          keyword.length === 0 ||
          task.task_id.toLowerCase().includes(keyword) ||
          task.task_type.toLowerCase().includes(keyword);
        const passStatus = statusFilter === 'all' || task.status === statusFilter;
        return passKeyword && passStatus;
      }),
    [tasks, searchTerm, statusFilter]
  );

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredTasks.length / pageSize)), [filteredTasks.length, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter, pageSize]);

  const pagedTasks = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredTasks.slice(start, start + pageSize);
  }, [filteredTasks, page, pageSize]);

  const allPageSelected = useMemo(
    () => pagedTasks.length > 0 && pagedTasks.every((task) => selectedTaskIds.has(task.task_id)),
    [pagedTasks, selectedTaskIds]
  );

  const toggleTaskSelection = (taskId: string, checked: boolean) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(taskId);
      else next.delete(taskId);
      return next;
    });
  };

  const togglePageSelection = (checked: boolean) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      pagedTasks.forEach((task) => {
        if (checked) next.add(task.task_id);
        else next.delete(task.task_id);
      });
      return next;
    });
  };

  const stats = useMemo(() => {
    const running = tasks.filter((task) => task.status === 'running' || task.status === 'pending').length;
    const succeeded = tasks.filter((task) => task.status === 'succeeded').length;
    const failed = tasks.filter((task) => task.status === 'failed').length;
    const cancelled = tasks.filter((task) => task.status === 'cancelled').length;
    return { total: tasks.length, running, succeeded, failed, cancelled };
  }, [tasks]);

  return (
    <div className="space-y-4 px-5 py-5 md:px-6 2xl:px-8 h-full overflow-y-auto">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
 <div className="rounded-xl border border-theme-border bg-theme-surface p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">总任务</div>
          <div className="mt-2 text-3xl font-bold leading-none text-theme-text-primary">{stats.total}</div>
        </div>
 <div className="rounded-xl border border-theme-border bg-theme-surface p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">运行中</div>
          <div className="mt-2 text-3xl font-bold leading-none text-blue-400">{stats.running}</div>
        </div>
 <div className="rounded-xl border border-theme-border bg-theme-surface p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">成功</div>
          <div className="mt-2 text-3xl font-bold leading-none text-emerald-400">{stats.succeeded}</div>
        </div>
 <div className="rounded-xl border border-theme-border bg-theme-surface p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">失败</div>
          <div className="mt-2 text-3xl font-bold leading-none text-rose-400">{stats.failed}</div>
        </div>
 <div className="rounded-xl border border-theme-border bg-theme-surface p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">已取消</div>
          <div className="mt-2 text-3xl font-bold leading-none text-theme-text-secondary">{stats.cancelled}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
 <div className="rounded-xl border border-theme-border bg-theme-surface p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-theme-text-primary">任务列表</div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={handleDeleteBatchClick}
                disabled={selectedTaskIds.size === 0}
 className="rounded-lg border border-rose-500/20 bg-rose-500/15 px-2.5 py-2 text-xs font-medium text-rose-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                批量删除（{selectedTaskIds.size}）
              </button>
              <button
                onClick={handleDeleteAllClick}
                disabled={filteredTasks.length === 0}
 className="rounded-lg border border-rose-500/20 bg-theme-elevated px-2.5 py-2 text-xs font-medium text-rose-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                一键删除全部
              </button>
              <button
                onClick={() => void loadTasks()}
 className="rounded-lg border border-theme-border bg-theme-surface px-2.5 py-2 text-xs font-medium text-theme-text-secondary"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-text-faint" size={16} />
              <input
                type="text"
                placeholder="搜索任务 ID、任务类型..."
                className="w-full rounded-lg border border-theme-border bg-theme-surface py-2 pl-9 pr-3 text-xs font-semibold outline-none transition-all focus:border-blue-300"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="form-select w-full text-xs"
            >
              <option value="all">全部状态</option>
              <option value="pending">Pending</option>
              <option value="running">Running</option>
              <option value="succeeded">Succeeded</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="mt-3">
            {(() => {
              const columns: DataTableColumn<ProjectTask>[] = [
                {
                  key: 'checkbox',
                  header: (
                    <input type="checkbox" checked={allPageSelected} onChange={(e) => togglePageSelection(e.target.checked)} />
                  ),
                  render: (task) => (
                    <span onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedTaskIds.has(task.task_id)}
                        onChange={(e) => toggleTaskSelection(task.task_id, e.target.checked)}
                      />
                    </span>
                  ),
                },
                {
                  key: 'task_id',
                  header: '任务标识 / ID',
                  render: (task) => (
                    <div className="flex items-center gap-3">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                        task.status === 'succeeded' ? 'bg-green-500/15 text-green-400' :
                        task.status === 'failed' ? 'bg-red-500/15 text-red-400' : 'bg-blue-500/15 text-blue-400'
                      }`}>
                        <Workflow size={14} />
                      </div>
                      <div>
                        <div className="text-xs font-medium text-theme-text-secondary capitalize">{(task.task_type || 'Task').replace('_', ' ')}</div>
                        <div className="text-[10px] font-mono text-theme-text-muted">{task.task_id}</div>
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'resource_id',
                  header: '关联资源 ID',
                  render: (task) => (
                    <div className="flex items-center gap-2 font-semibold text-theme-text-secondary">
                      <FileBox size={14} className="text-theme-text-faint" />
                      <span>{task.resource_id}</span>
                    </div>
                  ),
                },
                {
                  key: 'progress',
                  header: '进度',
                  render: (task) => (
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-theme-elevated">
                        <div
                          className={`h-full ${task.status === 'failed' ? 'bg-red-500' : 'bg-blue-600'}`}
                          style={{ width: `${task.progress || 0}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-medium text-theme-text-muted">{task.progress || 0}%</span>
                    </div>
                  ),
                },
                {
                  key: 'created_at',
                  header: '创建日期',
                  render: (task) => (
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-theme-text-muted">
                      <Clock size={12} /> {task.created_at?.split('T')[0]}
                    </div>
                  ),
                },
                {
                  key: 'status',
                  header: '状态',
                  render: (task) => <StatusBadge status={task.status} />,
                },
              ];
              return (
                <DataTable
                  columns={columns}
                  data={!projectId || loading || filteredTasks.length === 0 ? [] : pagedTasks}
                  rowKey={(r) => String(r.task_id)}
                  loading={loading}
                  empty={
                    !projectId ? (
                      <span className="font-semibold text-theme-text-muted">请先选择一个项目</span>
                    ) : (
                      <div className="text-center">
                        <div className="mx-auto mb-3 w-fit rounded-full bg-theme-elevated p-3 text-theme-text-faint"><History size={20} /></div>
                        <div className="font-semibold text-theme-text-muted">当前筛选条件下没有任务</div>
                      </div>
                    )
                  }
                  onRowClick={(task) => setSelectedTaskId(task.task_id)}
                />
              );
            })()}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-theme-text-secondary">
            <div>
              共 {filteredTasks.length} 条，当前第 {page} / {totalPages} 页
            </div>
            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="form-select text-xs"
              >
                <option value={10}>10 / 页</option>
                <option value={20}>20 / 页</option>
                <option value={50}>50 / 页</option>
              </select>
              <button
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page <= 1}
                className="rounded-md border border-theme-border bg-theme-surface px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                上一页
              </button>
              <button
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages}
                className="rounded-md border border-theme-border bg-theme-surface px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                下一页
              </button>
            </div>
          </div>
        </div>

 <div className="rounded-xl border border-theme-border bg-theme-surface p-3">
          {!selectedTask ? (
            <div className="flex min-h-[360px] items-center justify-center text-center text-xs font-semibold text-theme-text-muted">选择一个任务后查看详情与日志。</div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg bg-theme-elevated p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-theme-text-muted">任务详情</div>
                <div className="mt-1.5 text-sm font-semibold text-theme-text-primary">{selectedTask.task_type}</div>
                <div className="mt-1 font-mono text-[11px] text-theme-text-muted">{selectedTask.task_id}</div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <div><div className="text-theme-text-muted">项目ID</div><div className="mt-1 font-medium text-theme-text-primary">{selectedTask.project_id}</div></div>
                  <div><div className="text-theme-text-muted">资源ID</div><div className="mt-1 font-medium text-theme-text-primary">{selectedTask.resource_id}</div></div>
                  <div><div className="text-theme-text-muted">进度</div><div className="mt-1 font-medium text-theme-text-primary">{selectedTask.progress || 0}%</div></div>
                  <div><div className="text-theme-text-muted">状态</div><div className="mt-1"><StatusBadge status={selectedTask.status} /></div></div>
                  <div className="col-span-2"><div className="text-theme-text-muted">消息</div><div className="mt-1 font-semibold text-theme-text-secondary">{selectedTask.message || selectedTask.error_message || '-'}</div></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <button
                    onClick={() => void loadTaskLogs(selectedTask.task_id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-theme-border bg-theme-surface px-2.5 py-1.5 text-[11px] font-medium text-theme-text-secondary"
                  >
                    <Terminal size={13} /> 刷新日志
                  </button>
                  <button
                    onClick={() => handleDeleteClick(selectedTask.task_id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/15 px-2.5 py-1.5 text-[11px] font-medium text-rose-400"
                  >
                    <Trash2 size={13} /> 删除任务
                  </button>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-theme-border bg-theme-surface">
                <div className="border-b border-theme-border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-theme-text-muted">任务日志</div>
                <div className="max-h-[46vh] overflow-y-auto p-3 font-mono text-[11px] text-theme-text-primary custom-scrollbar">
                  {detailLogLoading ? (
                    <div className="flex min-h-[150px] items-center justify-center gap-2 text-blue-300"><Loader2 size={16} className="animate-spin" />加载日志中...</div>
                  ) : detailLogs.length > 0 ? (
                    detailLogs.map((line, index) => (
                      <div key={`${selectedTask.task_id}:${index}`} className="flex gap-3 py-0.5">
                        <span className="w-6 shrink-0 text-right text-theme-text-muted">{index + 1}</span>
                        <span className="whitespace-pre-wrap break-words leading-relaxed">{line}</span>
                      </div>
                    ))
                  ) : (
                    <div className="flex min-h-[150px] flex-col items-center justify-center gap-2 text-theme-text-muted">
                      <Terminal size={22} />
                      <span>暂无日志输出</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={deleteConfirm.show}
        onClose={() => setDeleteConfirm({ show: false, mode: 'single', taskId: null, taskIds: [] })}
        className="max-w-md"
      >
        <div className="p-8 text-center">
          <div className="w-16 h-16 bg-red-500/15 text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <AlertTriangle size={36} />
          </div>
          <h3 className="text-xl font-semibold text-theme-text-primary">终止异步任务？</h3>
          <p className="text-theme-text-muted mt-3 font-medium leading-relaxed text-sm">
            {deleteConfirm.mode === 'single' ? (
              <>
                您正准备移除或终止任务 <span className="text-red-400 font-medium font-mono">{deleteConfirm.taskId}</span>。
              </>
            ) : deleteConfirm.mode === 'batch' ? (
              <>您正准备批量删除 <span className="text-red-400 font-medium">{deleteConfirm.taskIds.length}</span> 个任务。</>
            ) : (
              <>您正准备一键删除当前筛选结果中的 <span className="text-red-400 font-medium">{deleteConfirm.taskIds.length}</span> 个任务。</>
            )}
            <br />
            如果任务正在运行中，系统会尝试中断关联 K8S Job，该操作不可逆。
          </p>
        </div>
        <div className="px-8 pb-8 flex gap-3">
          <button
            onClick={() => setDeleteConfirm({ show: false, mode: 'single', taskId: null, taskIds: [] })}
            disabled={isDeleting}
            className="flex-1 py-3 bg-theme-elevated text-theme-text-secondary rounded-xl font-medium hover:bg-theme-elevated transition-all disabled:opacity-50"
          >
            保留
          </button>
          <button
            onClick={executeDeleteTask}
            disabled={isDeleting}
            className="flex-1 py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isDeleting ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
            确认销毁
          </button>
        </div>
      </Modal>
    </div>
  );
};
