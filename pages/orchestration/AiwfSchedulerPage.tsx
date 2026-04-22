import React, { useEffect, useState } from 'react';
import { Activity, PauseCircle, PlayCircle, RefreshCw, ServerCog } from 'lucide-react';
import { api } from '../../clients/api';
import { AiwfSchedulerWorker } from '../../clients/aiAgentFramework';
import { useUiFeedback } from '../../components/UiFeedback';
import { AiwfCard, AiwfEmpty, AiwfPageShell, AiwfTabs, formatDateTime, prettyJson } from './AiwfShared';

export const AiwfSchedulerPage: React.FC<{
  initialTab?: 'workers' | 'control';
}> = ({ initialTab = 'workers' }) => {
  const orchestrationApi = api.domains.orchestration;
  const { notify, feedbackNodes } = useUiFeedback();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [workers, setWorkers] = useState<AiwfSchedulerWorker[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    void loadWorkers();
  }, []);

  const loadWorkers = async () => {
    try {
      setLoading(true);
      setWorkers(await orchestrationApi.aiAgentFramework.listWorkers());
    } catch (error: any) {
      notify(error.message || '加载调度节点失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDrain = async (podId: string) => {
    try {
      await orchestrationApi.aiAgentFramework.drainWorker(podId);
      notify(`已将 ${podId} 设置为 draining`, 'success');
      await loadWorkers();
    } catch (error: any) {
      notify(error.message || '切换 draining 失败', 'error');
    }
  };

  const handleActivate = async (podId: string) => {
    try {
      await orchestrationApi.aiAgentFramework.activateWorker(podId);
      notify(`已激活 ${podId}`, 'success');
      await loadWorkers();
    } catch (error: any) {
      notify(error.message || '激活 worker 失败', 'error');
    }
  };

  return (
    <AiwfPageShell
      title="AI工作流调度节点"
      description="查看多 POD worker 的心跳、容量、running_count 和当前调度状态，并执行 drain / activate。"
      actions={
        <button onClick={() => void loadWorkers()} className="p-3 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      }
    >
      <AiwfTabs
        tabs={[
          { id: 'workers', label: 'Worker 状态' },
          { id: 'control', label: '运行控制' },
        ]}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId as 'workers' | 'control')}
      />

      {workers.length === 0 ? (
        <AiwfCard>
          <AiwfEmpty title="暂无调度节点数据" description="等待服务启动调度器心跳后，这里会展示各个 worker pod 的状态。" />
        </AiwfCard>
      ) : activeTab === 'workers' ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {workers.map((worker) => (
            <AiwfCard key={worker.pod_id} className="p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-black text-slate-800 break-all">{worker.pod_id}</div>
                  <div className="text-sm text-slate-500 mt-1">{worker.host_name}</div>
                </div>
                <span className={`inline-flex px-2 py-1 rounded-full text-[11px] font-bold ${worker.status === 'active' ? 'bg-emerald-100 text-emerald-700' : worker.status === 'draining' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                  {worker.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm text-slate-600">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">capacity</div>
                  <div className="text-2xl font-black text-slate-800 mt-1">{worker.capacity}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">running_count</div>
                  <div className="text-2xl font-black text-slate-800 mt-1">{worker.running_count}</div>
                </div>
              </div>
              <div className="text-xs text-slate-500">最近心跳：{formatDateTime(worker.last_heartbeat_at)}</div>
            </AiwfCard>
          ))}
        </div>
      ) : (
        <AiwfCard className="overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50">
              <tr className="text-xs uppercase tracking-wider text-slate-500">
                <th className="px-6 py-4">Pod</th>
                <th className="px-6 py-4">状态</th>
                <th className="px-6 py-4">容量</th>
                <th className="px-6 py-4">运行数</th>
                <th className="px-6 py-4">元数据</th>
                <th className="px-6 py-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((worker) => (
                <tr key={worker.pod_id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="font-black text-slate-800">{worker.pod_id}</div>
                    <div className="text-xs text-slate-500 mt-1">{worker.host_name}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{worker.status}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{worker.capacity}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{worker.running_count}</td>
                  <td className="px-6 py-4">
                    <pre className="max-w-[300px] whitespace-pre-wrap break-words text-xs text-slate-500">{prettyJson(worker.metadata_json || {})}</pre>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => void handleActivate(worker.pod_id)} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100">
                        <PlayCircle size={16} />
                        Activate
                      </button>
                      <button onClick={() => void handleDrain(worker.pod_id)} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 text-amber-700 text-xs font-bold hover:bg-amber-100">
                        <PauseCircle size={16} />
                        Drain
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AiwfCard>
      )}
      {feedbackNodes}
    </AiwfPageShell>
  );
};
