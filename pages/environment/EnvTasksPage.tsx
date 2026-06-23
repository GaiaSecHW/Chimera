
import React, { useState, useEffect, useMemo } from 'react';
import {
  Loader2,
  Terminal,
  RefreshCw,
  Clock,
  CheckCircle2,
  X,
  Trash2,
  Search,
  Workflow,
  History,
  AlertTriangle
} from 'lucide-react';
import { Agent, AsyncTask, TaskLog } from '../../types/types';
import { api } from '../../clients/api';
import { StatusBadge } from '../../components/StatusBadge';
import { useUiFeedback } from '../../components/UiFeedback';
import { PageHeader } from '../../design-system';

export const EnvTasksPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const environmentApi = api.domains.environment;
  const { notify, confirm, feedbackNodes } = useUiFeedback();
  const [loading, setLoading] = useState(true);
  const [clearingAll, setClearingAll] = useState(false);
  const [tasks, setTasks] = useState<AsyncTask[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedTask, setSelectedTask] = useState<AsyncTask | null>(null);
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (projectId) {
      loadTasks();
      void loadAgents();
      const interval = setInterval(loadTasks, 10000); // Polling for progress
      return () => clearInterval(interval);
    }
  }, [projectId]);

  const loadAgents = async () => {
    if (!projectId) return;
    try {
      const data = await environmentApi.environment.getAgents(projectId, { page: 1, per_page: 2000 });
      setAgents(data?.agents || []);
    } catch (err) {
      console.error('Failed to load agents', err);
    }
  };

  const loadTasks = async () => {
    if (!projectId) return;
    try {
      const data = await environmentApi.environment.getTasks(projectId);
      setTasks(data?.task || []);
      setLoading(false);
    } catch (err) {
      console.error("Failed to load tasks", err);
    }
  };

  const openTaskDetail = async (task: AsyncTask) => {
    if (!projectId) return;
    setSelectedTask(task);
    setLogLoading(true);
    setLogs([]);
    try {
      const [detail, data] = await Promise.all([
        environmentApi.environment.getTaskDetail(task.id, projectId),
        environmentApi.environment.getTaskLogs(task.id, projectId),
      ]);
      setSelectedTask(detail || task);
      setLogs(data?.log || []);
    } catch (err) {
      notify("获取任务详情失败", 'error');
    } finally {
      setLogLoading(false);
    }
  };

  const renderTaskTime = (timeStr: string | undefined) => {
    const info = formatTaskTime(timeStr);
    return (
      <>
        <div className="text-theme-text-primary font-mono text-xs">{info.date}</div>
        <div className="text-theme-text-muted font-mono text-[11px]">{info.time}</div>
      </>
    );
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!projectId) return;
    const okToDelete = await confirm({
      title: '删除任务记录',
      message: '确认删除该任务记录？',
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!okToDelete) return;
    try {
      await environmentApi.environment.deleteTask(taskId, projectId);
      loadTasks();
      notify('任务记录已删除', 'success');
    } catch (err) {
      notify("删除失败", 'error');
    }
  };

  const handleClearAllTasks = async () => {
    if (!projectId) return;
    const okToClear = await confirm({
      title: '清空全部任务记录',
      message:`确认清空当前项目下全部任务记录吗？当前共 ${tasks.length} 条记录，此操作不可恢复。`,
      confirmText: '确认清空',
      cancelText: '取消',
      danger: true,
    });
    if (!okToClear) return;
    setClearingAll(true);
    try {
      const result = await environmentApi.environment.clearTasks(projectId);
      await loadTasks();
      if (selectedTask) setSelectedTask(null);
      notify(`任务记录已清空，删除 ${result?.deleted_count ?? 0} 条`, 'success');
    } catch (err) {
      notify("清空任务记录失败", 'error');
    } finally {
      setClearingAll(false);
    }
  };

  const agentsByKey = useMemo(() => {
    const map: Record<string, Agent> = {};
    (agents || []).forEach((agent) => {
      if (agent?.key) map[agent.key] = agent;
    });
    return map;
  }, [agents]);

  const filteredTasks = (tasks || []).filter(t => {
    const serviceMatch = t?.service_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const idMatch = t?.id?.includes(searchTerm);
    const key = String(t?.agent_key || '').toLowerCase();
    const fallbackAgent = agentsByKey[t.agent_key || ''];
    const agentHostname = String(t?.agent_hostname || fallbackAgent?.hostname || '').toLowerCase();
    const agentFullName = String(t?.full_name || fallbackAgent?.full_name || '').toLowerCase();
    const nodeMatch = [key, agentHostname, agentFullName].some((value) => value.includes(searchTerm.toLowerCase()));
    return serviceMatch || idMatch || nodeMatch;
  });

  const resolveTaskNode = (task?: AsyncTask | null) => {
    const fallbackAgent = task?.agent_key ? agentsByKey[task.agent_key] : undefined;
    const key = task?.agent_key || '-';
    const primary = task?.agent_hostname || fallbackAgent?.hostname || task?.full_name || fallbackAgent?.full_name || '-';
    const secondary = task?.full_name || fallbackAgent?.full_name || '';
    return { key, primary, secondary };
  };
  const selectedTaskNode = selectedTask ? resolveTaskNode(selectedTask) : null;

  const formatTaskTime = (timeStr: string | undefined) => {
    if (!timeStr) return { date: '-', time: '-' };
    const parts = timeStr.split('T');
    const datePart = parts[0] || '-';
    const timePart = parts[1] ? parts[1].split('.')[0] : '-';
    return { date: datePart, time: timePart };
  };

  return (
    <>
    <div className="px-5 py-5 md:px-6 2xl:px-8 space-y-4 animate-in fade-in duration-500 pb-24">
      <PageHeader
        title="环境模板部署/卸载任务管理"
        description="分布式节点部署任务队列与实时执行审计"
        actions={<div className="flex gap-4">
            <button onClick={handleClearAllTasks} disabled={!projectId || clearingAll || tasks.length === 0} className="px-5 py-3 bg-rose-500/15 border border-rose-500/20 text-rose-400 rounded-lg hover:bg-rose-600 hover:text-white transition-all disabled:opacity-50 font-semibold text-xs tracking-wider uppercase flex items-center gap-2">{clearingAll ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}清空记录</button>
            <button onClick={loadTasks} disabled={!projectId} className="p-4 bg-theme-elevated border border-theme-border text-theme-text-muted rounded-lg hover:bg-theme-elevated transition-all disabled:opacity-50"><RefreshCw size={20} className={loading ? 'animate-spin' : ''} /></button>
          </div>}
      />

      <div className="space-y-4">
        {!projectId && (
          <div className="p-4 bg-amber-500/15 border border-amber-500/20 text-amber-400 rounded-xl text-xs font-medium flex items-center gap-3">
            <AlertTriangle size={16} /> 请先在顶部菜单选择一个项目
          </div>
        )}
        <div className="relative">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-theme-text-faint" size={20} />
          <input
            type="text"
            placeholder="检索任务 ID、服务名称或目标节点..."
 className="form-input w-full pl-16 pr-8 py-5 font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

 <div className="bg-theme-surface border border-theme-border rounded-xl overflow-hidden min-h-[500px]">
          <table className="w-full text-left">
            <thead className="bg-slate-100/50 border-b border-theme-border font-semibold text-[10px] text-theme-text-muted uppercase tracking-widest">
              <tr>
                <th className="px-8 py-5">任务/服务标识</th>
                <th className="px-6 py-5">类型</th>
                <th className="px-6 py-5">目标节点</th>
                <th className="px-6 py-5">进度状态</th>
                <th className="px-6 py-5">创建时间</th>
                <th className="px-8 py-5 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading && tasks.length === 0 ? (
                <tr><td colSpan={6} className="py-24 text-center"><Loader2 className="animate-spin mx-auto text-blue-400" /></td></tr>
              ) : filteredTasks.map(t => {
                const timeInfo = formatTaskTime(t?.create_time);
                const nodeInfo = resolveTaskNode(t);
                return (
                  <tr key={t.id} className="hover:bg-theme-elevated transition-all group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${t.type === 'deploy' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                          <Workflow size={18} />
                        </div>
                        <div>
                          <button
                            onClick={() => void openTaskDetail(t)}
                            className="text-sm font-semibold text-theme-text-primary hover:text-blue-400 transition-colors text-left"
                            title="查看任务详情"
                          >
                            {t.service_name || 'Unknown'}
                          </button>
                          <p className="text-[10px] font-mono text-theme-text-muted tracking-tighter">ID: {t.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 uppercase text-[10px] font-medium text-theme-text-muted">{t.type}</td>
                    <td className="px-6 py-5">
                      <div className="max-w-[220px]">
                        <div className="text-xs font-medium text-theme-text-secondary truncate" title={nodeInfo.primary}>{nodeInfo.primary}</div>
                        {nodeInfo.secondary && nodeInfo.secondary !== nodeInfo.primary ? (
                          <div className="mt-0.5 text-[10px] text-theme-text-muted truncate" title={nodeInfo.secondary}>{nodeInfo.secondary}</div>
                        ) : null}
                        <div className="mt-0.5 text-[10px] font-mono text-theme-text-muted truncate" title={nodeInfo.key}>{nodeInfo.key}</div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-theme-elevated rounded-full overflow-hidden w-24">
                          <div
                            className={`h-full transition-all duration-1000 ${t.status === 'failed' ? 'bg-red-500' : 'bg-blue-600'}`}
                            style={{ width: `${t.progress || 0}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-medium text-theme-text-muted">{t.progress || 0}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5 text-[10px] font-medium text-theme-text-muted uppercase tracking-widest">
                          <Clock size={10} /> {timeInfo.date}
                        </div>
                        <div className="text-[10px] font-medium text-theme-text-faint ml-4 font-mono">
                          {timeInfo.time}
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                         <StatusBadge status={t.status} />
                         <button
                           onClick={() => void openTaskDetail(t)}
                           className="p-3 text-theme-text-muted hover:text-blue-400 hover:bg-blue-500/15 rounded-xl transition-all"
                           title="查看任务详情与实时执行日志"
                         >
                           <Terminal size={18} />
                         </button>
                         <button
                           onClick={() => handleDeleteTask(t.id)}
                           className="p-3 text-theme-text-muted hover:text-red-500 hover:bg-red-500/15 rounded-xl transition-all"
                           title="删除任务记录"
                         >
                           <Trash2 size={18} />
                         </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredTasks.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="py-40 text-center">
                    <div className="w-20 h-20 bg-theme-elevated rounded-full flex items-center justify-center mx-auto mb-4 text-theme-text-primary">
                      <History size={40} />
                    </div>
                    <p className="text-sm font-semibold text-theme-text-muted uppercase tracking-widest">暂无活跃部署任务</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {selectedTask && (
        <div
          className="fixed inset-0 z-[220] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setSelectedTask(null)}
        >
          <div
 className="w-full max-w-[72rem] h-[72vh] bg-theme-surface border border-theme-border rounded-xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-theme-border flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-medium tracking-widest text-theme-text-muted uppercase">任务执行细节</p>
                <p className="text-xs font-medium text-white truncate mt-1">
                  {selectedTask.service_name || 'Unknown'} · {selectedTask.id}
                </p>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                className="p-1.5 rounded-lg text-theme-text-muted hover:text-white hover:bg-theme-elevated transition-all"
                title="关闭"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-4 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-3">
                  <div className="text-[10px] font-medium tracking-widest text-theme-text-muted uppercase">任务类型</div>
                  <div className="mt-1 text-sm font-semibold text-white">{selectedTask.type || '-'}</div>
                </div>
                <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-3">
                  <div className="text-[10px] font-medium tracking-widest text-theme-text-muted uppercase">任务状态</div>
                  <div className="mt-2"><StatusBadge status={selectedTask.status} /></div>
                </div>
                <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-3">
                  <div className="text-[10px] font-medium tracking-widest text-theme-text-muted uppercase">目标节点</div>
                  <div className="mt-1 text-sm font-semibold text-white break-all">{selectedTaskNode?.primary || '-'}</div>
                  {selectedTaskNode?.secondary && selectedTaskNode.secondary !== selectedTaskNode.primary ? (
                    <div className="mt-0.5 text-xs text-theme-text-faint break-all">{selectedTaskNode.secondary}</div>
                  ) : null}
                  <div className="mt-0.5 text-xs font-mono text-theme-text-faint break-all">{selectedTaskNode?.key || '-'}</div>
                </div>
                <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-3">
                  <div className="text-[10px] font-medium tracking-widest text-theme-text-muted uppercase">执行进度</div>
                  <div className="mt-1 text-sm font-semibold text-white">{selectedTask.progress || 0}%</div>
                </div>
                <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-3">
                  <div className="text-[10px] font-medium tracking-widest text-theme-text-muted uppercase">创建时间</div>
                  <div className="mt-1">{renderTaskTime(selectedTask.created_at || selectedTask.create_time)}</div>
                </div>
                <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-3">
                  <div className="text-[10px] font-medium tracking-widest text-theme-text-muted uppercase">开始时间</div>
                  <div className="mt-1">{renderTaskTime(selectedTask.started_at)}</div>
                </div>
                <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-3">
                  <div className="text-[10px] font-medium tracking-widest text-theme-text-muted uppercase">完成时间</div>
                  <div className="mt-1">{renderTaskTime(selectedTask.completed_at)}</div>
                </div>
                <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-3">
                  <div className="text-[10px] font-medium tracking-widest text-theme-text-muted uppercase">日志条数</div>
                  <div className="mt-1 text-sm font-semibold text-white">{selectedTask.log_count ?? logs.length}</div>
                </div>
              </div>

              <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-3">
                <div className="text-[10px] font-medium tracking-widest text-theme-text-muted uppercase">任务消息</div>
                <div className="mt-1 text-xs leading-relaxed text-theme-text-primary whitespace-pre-wrap break-words">
                  {selectedTask.message || '暂无任务消息'}
                </div>
              </div>

              {logLoading ? (
                <div className="h-full flex items-center justify-center">
                  <Loader2 className="animate-spin text-blue-500" />
                </div>
              ) : logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-theme-text-muted gap-3">
                  <CheckCircle2 size={22} />
                  <p className="text-xs font-medium">暂无执行日志</p>
                </div>
              ) : (
                logs.map((log, index) => (
                  <div key={`${log.timestamp}-${index}`} className="bg-theme-surface border border-theme-border rounded-xl px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span className={`text-[9px] font-semibold uppercase tracking-widest ${log.level === 'ERROR' ? 'text-red-400' : log.level === 'WARNING' || log.level === 'WARN' ? 'text-amber-400' : 'text-blue-400'}`}>
                        {log.level}
                      </span>
                      <span className="text-[9px] font-mono text-theme-text-muted">{log.timestamp || '-'}</span>
                    </div>
                    <pre className="text-[11px] leading-tight text-theme-text-primary whitespace-pre-wrap break-words font-mono">{log.message}</pre>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    {feedbackNodes}
    </>
  );
};