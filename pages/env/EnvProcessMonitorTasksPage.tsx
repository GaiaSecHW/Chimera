import React, { useEffect, useMemo, useState } from 'react';
import { CheckSquare, Loader2, RefreshCw, Square, Trash2 } from 'lucide-react';
import { api } from '../../clients/api';
import { ProcessMonitorNode, ProcessSyncTaskHistoryItem } from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';

type QueryMode = 'platform' | 'live';

export const EnvProcessMonitorTasksPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { notify, confirm, feedbackNodes } = useUiFeedback();
  const [mode, setMode] = useState<QueryMode>('platform');
  const [nodes, setNodes] = useState<ProcessMonitorNode[]>([]);
  const [selectedAgentKeys, setSelectedAgentKeys] = useState<Set<string>>(new Set());
  const [historyItems, setHistoryItems] = useState<ProcessSyncTaskHistoryItem[]>([]);
  const [liveItems, setLiveItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);

  const selectedKeysArray = useMemo(() => Array.from(selectedAgentKeys), [selectedAgentKeys]);

  const loadNodes = async () => {
    if (!projectId) {
      setNodes([]);
      return;
    }
    try {
      const data = await api.environment.listProcessMonitorNodes(projectId);
      setNodes(Array.isArray(data?.items) ? data.items : []);
    } catch (error) {
      console.error(error);
      setNodes([]);
    }
  };

  const loadData = async () => {
    if (!projectId) {
      setHistoryItems([]);
      setLiveItems([]);
      return;
    }
    setLoading(true);
    try {
      if (mode === 'platform') {
        const data = await api.environment.getProcessMonitorSyncHistory(projectId, {
          page: 1,
          per_page: 200,
        });
        setHistoryItems(Array.isArray(data?.items) ? data.items : []);
      } else {
        const data = await api.environment.getProcessMonitorSyncLiveTasks(projectId, {
          agent_keys: selectedKeysArray.length ? selectedKeysArray : undefined,
        });
        setLiveItems(Array.isArray(data?.items) ? data.items : []);
      }
    } catch (error) {
      console.error(error);
      notify('加载任务失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadNodes();
  }, [projectId]);

  useEffect(() => {
    void loadData();
  }, [projectId, mode, selectedKeysArray.join(',')]);

  const toggleAgent = (agentKey: string) => {
    setSelectedAgentKeys((prev) => {
      const next = new Set(prev);
      if (next.has(agentKey)) next.delete(agentKey);
      else next.add(agentKey);
      return next;
    });
  };

  const clearCurrent = async () => {
    if (!projectId) return;
    const ok = await confirm({
      title: mode === 'platform' ? '清空平台记录' : '清空节点记录',
      message: mode === 'platform' ? '仅清理已结束任务记录，确认继续？' : '将对选中节点清理已结束任务，确认继续？',
      confirmText: '确认清理',
      cancelText: '取消',
      danger: true,
    });
    if (!ok) return;
    setClearing(true);
    try {
      if (mode === 'platform') {
        await api.environment.clearProcessMonitorSyncHistory({
          project_id: projectId,
          include_running: false,
        });
      } else {
        await api.environment.clearProcessMonitorSyncLiveTasks({
          project_id: projectId,
          agent_keys: selectedKeysArray.length ? selectedKeysArray : undefined,
          include_running: false,
        });
      }
      notify('清理完成', 'success');
      await loadData();
    } catch (error) {
      console.error(error);
      notify('清理失败', 'error');
    } finally {
      setClearing(false);
    }
  };

  return (
    <>
      <div className="p-10 space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-3xl font-black text-slate-800 tracking-tight">节点进程监控 - 任务管理</h2>
            <p className="text-slate-500 mt-1 font-medium">支持平台记录查询与指定节点实时任务查询</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void loadData()}
              disabled={loading || !projectId}
              className="px-4 py-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold uppercase tracking-wider flex items-center gap-2"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              刷新
            </button>
            <button
              onClick={() => void clearCurrent()}
              disabled={!projectId || clearing}
              className="px-4 py-3 rounded-2xl border border-rose-200 bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-600 text-xs font-bold uppercase tracking-wider flex items-center gap-2 disabled:opacity-50"
            >
              {clearing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              清理
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setMode('platform')}
            className={`px-4 py-2 rounded-xl text-sm font-black ${mode === 'platform' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            平台记录模式
          </button>
          <button
            onClick={() => setMode('live')}
            className={`px-4 py-2 rounded-xl text-sm font-black ${mode === 'live' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            节点实时模式
          </button>
        </div>

        {mode === 'live' && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">节点筛选（可多选）</div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {nodes.map((node) => {
                const checked = selectedAgentKeys.has(node.agent_key);
                return (
                  <button
                    key={`${node.agent_key}:${node.service_name}`}
                    type="button"
                    onClick={() => toggleAgent(node.agent_key)}
                    className={`text-left p-3 rounded-xl border ${checked ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                  >
                    <div className="flex items-center gap-2">
                      {checked ? <CheckSquare size={14} className="text-blue-600" /> : <Square size={14} className="text-slate-400" />}
                      <div className="text-sm font-bold text-slate-700">{node.agent_key}</div>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">{node.service_name}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-widest text-slate-500">
              <tr>
                {mode === 'platform' ? (
                  <>
                    <th className="px-5 py-4">sync_id</th>
                    <th className="px-4 py-4">节点</th>
                    <th className="px-4 py-4">服务</th>
                    <th className="px-4 py-4">模式</th>
                    <th className="px-4 py-4">状态</th>
                    <th className="px-4 py-4">创建时间</th>
                  </>
                ) : (
                  <>
                    <th className="px-5 py-4">节点</th>
                    <th className="px-4 py-4">服务</th>
                    <th className="px-4 py-4">task_id</th>
                    <th className="px-4 py-4">模式</th>
                    <th className="px-4 py-4">状态</th>
                    <th className="px-4 py-4">创建时间</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-16 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" /></td></tr>
              ) : mode === 'platform' ? (
                historyItems.length === 0 ? (
                  <tr><td colSpan={6} className="py-16 text-center text-slate-400">暂无记录</td></tr>
                ) : historyItems.map((item) => (
                  <tr key={item.sync_id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-5 py-4 text-xs font-mono text-slate-700">{item.sync_id}</td>
                    <td className="px-4 py-4 text-sm text-slate-700">{item.agent_key}</td>
                    <td className="px-4 py-4 text-sm text-slate-700">{item.service_name}</td>
                    <td className="px-4 py-4 text-xs uppercase text-slate-600">{item.mode}</td>
                    <td className="px-4 py-4 text-xs uppercase text-slate-600">{item.status}</td>
                    <td className="px-4 py-4 text-xs text-slate-500">{item.created_at || '-'}</td>
                  </tr>
                ))
              ) : (
                liveItems.length === 0 ? (
                  <tr><td colSpan={6} className="py-16 text-center text-slate-400">暂无实时任务</td></tr>
                ) : liveItems.map((item) => (
                  <tr key={`${item.agent_key}:${item.service_name}:${item.node_task_id || ''}`} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-5 py-4 text-sm text-slate-700">{item.agent_key}</td>
                    <td className="px-4 py-4 text-sm text-slate-700">{item.service_name}</td>
                    <td className="px-4 py-4 text-xs font-mono text-slate-700">{item.node_task_id || '-'}</td>
                    <td className="px-4 py-4 text-xs uppercase text-slate-600">{item.task?.mode || '-'}</td>
                    <td className="px-4 py-4 text-xs uppercase text-slate-600">{item.task?.status || '-'}</td>
                    <td className="px-4 py-4 text-xs text-slate-500">{item.task?.created_at || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {feedbackNodes}
    </>
  );
};
