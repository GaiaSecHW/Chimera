import React, { useEffect, useState } from 'react';
import { Loader2, Power, RefreshCw, ShieldAlert } from 'lucide-react';

import { api } from '../../clients/api';
import { AiwfSchedulerWorker } from '../../clients/aiAgentFramework';
import { useUiFeedback } from '../../components/UiFeedback';
import { AiwfCard, AiwfEmpty, AiwfPageShell, formatDateTime, prettyJson } from './AiwfShared';

type SchedulerTab = 'workers' | 'control';

export const AiwfSchedulerPage: React.FC<{
  initialTab?: SchedulerTab;
}> = ({ initialTab = 'workers' }) => {
  const orchestrationApi = api.domains.orchestration;
  const { notify, feedbackNodes } = useUiFeedback();
  const [tab, setTab] = useState<SchedulerTab>(initialTab);
  const [loading, setLoading] = useState(false);
  const [workers, setWorkers] = useState<AiwfSchedulerWorker[]>([]);

  useEffect(() => setTab(initialTab), [initialTab]);

  const loadWorkers = async () => {
    try {
      setLoading(true);
      setWorkers(await orchestrationApi.aiAgentFramework.listWorkers());
    } catch (error: any) {
      notify(error.message || '加载调度 Worker 失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkers();
  }, []);

  const setWorkerState = async (podId: string, action: 'drain' | 'activate') => {
    try {
      if (action === 'drain') {
        await orchestrationApi.aiAgentFramework.drainWorker(podId);
      } else {
        await orchestrationApi.aiAgentFramework.activateWorker(podId);
      }
      notify(action === 'drain' ? 'Worker 已切换为 draining' : 'Worker 已恢复 active', 'success');
      await loadWorkers();
    } catch (error: any) {
      notify(error.message || '更新 Worker 状态失败', 'error');
    }
  };

  return (
    <AiwfPageShell
      title="AI工作流调度器"
      description="查看执行 Worker 的心跳、负载与当前状态，并执行启停控制。"
      actions={
        <button onClick={() => void loadWorkers()} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      }
    >
      <AiwfCard className="overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
            {(['workers', 'control'] as SchedulerTab[]).map((item) => (
              <button
                key={item}
                onClick={() => setTab(item)}
                className={`rounded-lg px-3 py-1.5 text-sm font-bold ${tab === item ? 'border border-slate-200 bg-slate-50 text-slate-900' : 'text-slate-600'}`}
              >
                {item === 'workers' ? 'Worker 列表' : '控制台'}
              </button>
            ))}
          </div>
        </div>
        <div className="p-5">
          {workers.length === 0 ? (
            <AiwfEmpty title="暂无 Worker" description="当前还没有可用的调度 Worker 心跳数据。" />
          ) : tab === 'workers' ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {workers.map((worker) => (
                <div key={worker.pod_id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-900">{worker.pod_id}</div>
                      <div className="mt-1 text-xs text-slate-500">{worker.host_name}</div>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${worker.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {worker.status}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div><div className="text-[11px] text-slate-500">容量</div><div className="mt-1 font-black text-slate-900">{worker.capacity}</div></div>
                    <div><div className="text-[11px] text-slate-500">运行中</div><div className="mt-1 font-black text-slate-900">{worker.running_count}</div></div>
                    <div className="col-span-2"><div className="text-[11px] text-slate-500">最后心跳</div><div className="mt-1 font-black text-slate-900">{formatDateTime(worker.last_heartbeat_at)}</div></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {workers.map((worker) => (
                <div key={worker.pod_id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-sm font-black text-slate-900">{worker.pod_id}</div>
                      <div className="mt-1 text-xs text-slate-500">{worker.host_name}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => void setWorkerState(worker.pod_id, 'drain')} className="inline-flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-700 hover:bg-amber-100">
                        <ShieldAlert size={14} />
                        Drain
                      </button>
                      <button onClick={() => void setWorkerState(worker.pod_id, 'activate')} className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100">
                        <Power size={14} />
                        Activate
                      </button>
                    </div>
                  </div>
                  {worker.metadata_json ? <pre className="mt-4 overflow-auto rounded-xl bg-slate-950 p-3 text-xs leading-6 text-slate-100">{prettyJson(worker.metadata_json)}</pre> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </AiwfCard>
      {loading ? <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-500"><Loader2 size={16} className="animate-spin" /> 加载中...</div> : null}
      {feedbackNodes}
    </AiwfPageShell>
  );
};
