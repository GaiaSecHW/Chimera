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

export const TaskMgmtPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [detailLogs, setDetailLogs] = useState<string[]>([]);
  const [detailLogLoading, setDetailLogLoading] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; taskId: string | null }>({ show: false, taskId: null });
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
      const data = await api.resources.getTasks(projectId);
      const next = Array.isArray(data) ? data : [];
      setTasks(next);
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
      const res = await api.resources.getTaskLogs(taskId);
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
    setDeleteConfirm({ show: true, taskId });
  };

  const executeDeleteTask = async () => {
    if (!deleteConfirm.taskId) return;
    setIsDeleting(true);
    try {
      await api.resources.deleteTask(deleteConfirm.taskId);
      const deletedId = deleteConfirm.taskId;
      setDeleteConfirm({ show: false, taskId: null });
      if (selectedTaskId === deletedId) {
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

  const stats = useMemo(() => {
    const running = tasks.filter((task) => task.status === 'running' || task.status === 'pending').length;
    const succeeded = tasks.filter((task) => task.status === 'succeeded').length;
    const failed = tasks.filter((task) => task.status === 'failed').length;
    const cancelled = tasks.filter((task) => task.status === 'cancelled').length;
    return { total: tasks.length, running, succeeded, failed, cancelled };
  }, [tasks]);

  return (
    <div className="p-2.5 space-y-3 animate-in fade-in duration-500 h-full overflow-y-auto lg:p-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <div className="rounded-xl bg-slate-900 p-4 text-white shadow-lg">
          <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">总任务</div>
          <div className="mt-2 text-3xl font-black leading-none">{stats.total}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">运行中</div>
          <div className="mt-2 text-3xl font-black leading-none text-blue-600">{stats.running}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">成功</div>
          <div className="mt-2 text-3xl font-black leading-none text-emerald-600">{stats.succeeded}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">失败</div>
          <div className="mt-2 text-3xl font-black leading-none text-rose-600">{stats.failed}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">已取消</div>
          <div className="mt-2 text-3xl font-black leading-none text-slate-600">{stats.cancelled}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-black text-slate-800">任务列表</div>
            <button
              onClick={() => void loadTasks()}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-black text-slate-700 shadow-sm"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
              <input
                type="text"
                placeholder="搜索任务 ID、任务类型..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs font-semibold outline-none transition-all focus:border-blue-300"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none"
            >
              <option value="all">全部状态</option>
              <option value="pending">Pending</option>
              <option value="running">Running</option>
              <option value="succeeded">Succeeded</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-left">
              <thead className="border-b border-slate-100 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-4 py-3">任务标识 / ID</th>
                  <th className="px-4 py-3">关联资源 ID</th>
                  <th className="px-4 py-3">进度</th>
                  <th className="px-4 py-3">创建日期</th>
                  <th className="px-4 py-3">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-xs">
                {!projectId ? (
                  <tr>
                    <td colSpan={5} className="py-16 text-center font-semibold text-slate-400">请先选择一个项目</td>
                  </tr>
                ) : loading ? (
                  <tr>
                    <td colSpan={5} className="py-16 text-center"><Loader2 className="mx-auto animate-spin text-blue-600" size={28} /></td>
                  </tr>
                ) : filteredTasks.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-16 text-center">
                      <div className="mx-auto mb-3 w-fit rounded-full bg-slate-50 p-3 text-slate-300"><History size={20} /></div>
                      <div className="font-semibold text-slate-400">当前筛选条件下没有任务</div>
                    </td>
                  </tr>
                ) : (
                  filteredTasks.map((task) => (
                    <tr
                      key={task.task_id}
                      onClick={() => setSelectedTaskId(task.task_id)}
                      className={`cursor-pointer transition-all hover:bg-slate-50 ${selectedTaskId === task.task_id ? 'bg-blue-50/60' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                            task.status === 'succeeded' ? 'bg-green-50 text-green-600' :
                            task.status === 'failed' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                          }`}>
                            <Workflow size={14} />
                          </div>
                          <div>
                            <div className="text-xs font-black text-slate-700 capitalize">{(task.task_type || 'Task').replace('_', ' ')}</div>
                            <div className="text-[10px] font-mono text-slate-400">{task.task_id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 font-semibold text-slate-600">
                          <FileBox size={14} className="text-slate-300" />
                          <span>{task.resource_id}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full ${task.status === 'failed' ? 'bg-red-500' : 'bg-blue-600'}`}
                              style={{ width: `${task.progress || 0}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-black text-slate-500">{task.progress || 0}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                          <Clock size={12} /> {task.created_at?.split('T')[0]}
                        </div>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={task.status} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          {!selectedTask ? (
            <div className="flex min-h-[360px] items-center justify-center text-center text-xs font-semibold text-slate-400">选择一个任务后查看详情与日志。</div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">任务详情</div>
                <div className="mt-1.5 text-sm font-black text-slate-900">{selectedTask.task_type}</div>
                <div className="mt-1 font-mono text-[11px] text-slate-500">{selectedTask.task_id}</div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <div><div className="text-slate-400">项目ID</div><div className="mt-1 font-black text-slate-900">{selectedTask.project_id}</div></div>
                  <div><div className="text-slate-400">资源ID</div><div className="mt-1 font-black text-slate-900">{selectedTask.resource_id}</div></div>
                  <div><div className="text-slate-400">进度</div><div className="mt-1 font-black text-slate-900">{selectedTask.progress || 0}%</div></div>
                  <div><div className="text-slate-400">状态</div><div className="mt-1"><StatusBadge status={selectedTask.status} /></div></div>
                  <div className="col-span-2"><div className="text-slate-400">消息</div><div className="mt-1 font-semibold text-slate-700">{selectedTask.message || selectedTask.error_message || '-'}</div></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <button
                    onClick={() => void loadTaskLogs(selectedTask.task_id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-700"
                  >
                    <Terminal size={13} /> 刷新日志
                  </button>
                  <button
                    onClick={() => handleDeleteClick(selectedTask.task_id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-100 bg-rose-50 px-2.5 py-1.5 text-[11px] font-black text-rose-600"
                  >
                    <Trash2 size={13} /> 删除任务
                  </button>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
                <div className="border-b border-slate-800 px-3 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">任务日志</div>
                <div className="max-h-[46vh] overflow-y-auto p-3 font-mono text-[11px] text-slate-200 custom-scrollbar">
                  {detailLogLoading ? (
                    <div className="flex min-h-[150px] items-center justify-center gap-2 text-blue-300"><Loader2 size={16} className="animate-spin" />加载日志中...</div>
                  ) : detailLogs.length > 0 ? (
                    detailLogs.map((line, index) => (
                      <div key={`${selectedTask.task_id}:${index}`} className="flex gap-3 py-0.5">
                        <span className="w-6 shrink-0 text-right text-slate-500">{index + 1}</span>
                        <span className="whitespace-pre-wrap break-words leading-relaxed">{line}</span>
                      </div>
                    ))
                  ) : (
                    <div className="flex min-h-[150px] flex-col items-center justify-center gap-2 text-slate-500">
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

      {deleteConfirm.show && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <AlertTriangle size={36} />
              </div>
              <h3 className="text-xl font-black text-slate-800">终止异步任务？</h3>
              <p className="text-slate-500 mt-3 font-medium leading-relaxed text-sm">
                您正准备移除或终止任务 <span className="text-red-600 font-black font-mono">{deleteConfirm.taskId}</span>。
                如果任务正在运行中，系统会尝试中断关联 K8S Job，该操作不可逆。
              </p>
            </div>
            <div className="px-8 pb-8 flex gap-3">
              <button
                onClick={() => setDeleteConfirm({ show: false, taskId: null })}
                disabled={isDeleting}
                className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-black hover:bg-slate-200 transition-all disabled:opacity-50"
              >
                保留
              </button>
              <button
                onClick={executeDeleteTask}
                disabled={isDeleting}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-black hover:bg-red-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                确认销毁
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
