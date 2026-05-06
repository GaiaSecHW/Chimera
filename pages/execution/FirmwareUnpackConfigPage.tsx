import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity, AlertCircle, CheckCircle2, Cpu, Loader2,
  RefreshCw, Save, Server, Settings, Wifi, WifiOff,
} from 'lucide-react';
import { api } from '../../clients/api';
import { FirmwareConfigEntry, FirmwareWorkerInstance } from '../../clients/firmwareUnpacker';

interface Props { projectId: string; }

const fwApi = api.domains.execution.firmwareUnpacker;

function fmtTime(iso: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('zh-CN', { hour12: false });
}

function fmtSecsAgo(iso: string | null) {
  if (!iso) return '-';
  const sec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return `${sec}s 前`;
  return `${Math.floor(sec / 60)}m${sec % 60}s 前`;
}

// ──────────────────────────────────────────────────────────
// Config editor row
// ──────────────────────────────────────────────────────────
function ConfigRow({
  entry, onSave,
}: { entry: FirmwareConfigEntry; onSave: (key: string, value: string) => Promise<void> }) {
  const [val, setVal]       = useState(entry.value);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const dirty = val !== entry.value;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(entry.key, val);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      alert(`保存失败: ${e?.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-black font-mono text-slate-700">{entry.key}</span>
          <span className="text-[10px] rounded-full bg-slate-100 px-1.5 py-0.5 text-slate-500">{entry.value_type}</span>
          {saved && <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5"><CheckCircle2 size={10} /> 已保存</span>}
        </div>
        {entry.description && (
          <p className="text-[11px] text-slate-400 mb-2">{entry.description}</p>
        )}
        <div className="flex items-center gap-2">
          <input
            value={val}
            onChange={e => setVal(e.target.value)}
            className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-mono outline-none transition ${
              dirty ? 'border-blue-300 ring-1 ring-blue-100' : 'border-slate-200'
            } bg-white`}
          />
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:bg-slate-300 disabled:cursor-not-allowed hover:bg-blue-700"
          >
            {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
            保存
          </button>
        </div>
        <p className="mt-1 text-[10px] text-slate-400">
          更新于 {fmtTime(entry.updated_at)}
        </p>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Worker card
// ──────────────────────────────────────────────────────────
function WorkerCard({ w, isSelf }: { w: FirmwareWorkerInstance; isSelf: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${w.is_alive ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50 opacity-60'}`}>
      <div className="flex items-center gap-2 mb-2">
        {w.is_alive
          ? <Wifi size={14} className="text-emerald-600 shrink-0" />
          : <WifiOff size={14} className="text-slate-400 shrink-0" />}
        <span className="font-mono text-xs font-bold text-slate-800 truncate">{w.worker_id}</span>
        {isSelf && <span className="text-[10px] rounded-full bg-blue-100 text-blue-700 px-1.5 font-bold shrink-0">本实例</span>}
        <span className={`ml-auto text-[10px] font-semibold ${w.is_alive ? 'text-emerald-600' : 'text-slate-400'}`}>
          {w.is_alive ? '在线' : '离线'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <div><span className="font-semibold text-slate-400">主机名</span>: {w.hostname || '-'}</div>
        <div><span className="font-semibold text-slate-400">Pod IP</span>: {w.pod_ip || '-'}</div>
        <div><span className="font-semibold text-slate-400">活跃任务</span>: <span className={w.active_tasks > 0 ? 'text-blue-600 font-bold' : ''}>{w.active_tasks}</span></div>
        <div><span className="font-semibold text-slate-400">心跳</span>: {fmtSecsAgo(w.last_heartbeat)}</div>
        <div className="col-span-2"><span className="font-semibold text-slate-400">启动时间</span>: {fmtTime(w.started_at)}</div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────────────────
export const FirmwareUnpackConfigPage: React.FC<Props> = ({ projectId }) => {
  const [configs,       setConfigs]       = useState<FirmwareConfigEntry[]>([]);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError,   setConfigError]   = useState('');

  const [cluster,        setCluster]        = useState<any>(null);
  const [clusterLoading, setClusterLoading] = useState(false);
  const [clusterError,   setClusterError]   = useState('');
  const [clusterRefreshAt, setClusterRefreshAt] = useState<string | null>(null);

  const [health,    setHealth]    = useState<'checking' | 'healthy' | 'error'>('checking');
  const [healthMsg, setHealthMsg] = useState('检查中...');
  const configItems = Array.isArray(configs) ? configs : [];
  const clusterInfo = cluster && typeof cluster === 'object' && !Array.isArray(cluster) ? cluster : null;
  const clusterWorkers = Array.isArray(clusterInfo?.workers) ? clusterInfo.workers : [];

  // ── load ──────────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    setConfigLoading(true);
    setConfigError('');
    try {
      const r = await fwApi.getConfig();
      setConfigs(r.items);
    } catch (e: any) {
      setConfigError(e?.message || '加载配置失败');
    } finally {
      setConfigLoading(false);
    }
  }, []);

  const loadCluster = useCallback(async () => {
    setClusterLoading(true);
    setClusterError('');
    try {
      const r = await fwApi.getCluster();
      setCluster(r);
      setClusterRefreshAt(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
    } catch (e: any) {
      setClusterError(e?.message || '加载集群信息失败');
    } finally {
      setClusterLoading(false);
    }
  }, []);

  const checkHealth = async () => {
    setHealth('checking');
    try {
      const r = await fwApi.getHealth();
      setHealth(r.status === 'ok' ? 'healthy' : 'error');
      setHealthMsg(r.status === 'ok' ? `可用 (Worker: ${r.worker_id || '?'})` : r.status);
    } catch (e: any) {
      setHealth('error');
      setHealthMsg(e?.message || '不可用');
    }
  };

  useEffect(() => {
    checkHealth();
    loadConfig();
    loadCluster();
  }, []);

  // ── save config ───────────────────────────────────────────
  const handleSaveConfig = async (key: string, value: string) => {
    await fwApi.updateConfig(key, value);
    // Update local cache
    setConfigs(prev => prev.map(e => e.key === key ? { ...e, value, updated_at: new Date().toISOString() } : e));
  };

  // ── task counts ───────────────────────────────────────────
  const taskCounts: Record<string, number> = clusterInfo?.task_counts ?? {};
  const statusColors: Record<string, string> = {
    pending:    'text-amber-600',
    running:    'text-blue-600',
    cancelling: 'text-orange-600',
    cancelled:  'text-slate-500',
    success:    'text-emerald-600',
    failed:     'text-red-600',
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings size={18} className="text-violet-600" />
          <div>
            <h2 className="text-sm font-bold text-slate-800">固件解包 · 配置与集群</h2>
            <p className="text-xs text-slate-400">动态配置 · K8S 多实例状态</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { loadConfig(); loadCluster(); checkHealth(); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <RefreshCw size={12} /> 全部刷新
          </button>
        </div>
      </div>

      {/* Service health */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-1">
          <Server size={13} className="text-emerald-600" /> 服务健康
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold border ${
            health === 'healthy' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : health === 'error' ? 'bg-red-50 text-red-700 border-red-200'
            : 'bg-slate-50 text-slate-500 border-slate-200'
          }`}>
            {health === 'checking' && <Loader2 size={10} className="animate-spin" />}
            {health === 'healthy' && <CheckCircle2 size={10} />}
            {health === 'error' && <AlertCircle size={10} />}
            {health === 'checking' ? '检查中' : health === 'healthy' ? '正常' : '异常'}
          </span>
          <span className="text-xs text-slate-500">{healthMsg}</span>
        </div>
      </div>

      {/* Cluster info */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <Cpu size={13} className="text-indigo-600" />
            K8S 集群实例
            {clusterRefreshAt && <span className="text-[10px] text-slate-400 font-normal ml-1">· 刷新于 {clusterRefreshAt}</span>}
          </div>
          <button onClick={loadCluster} disabled={clusterLoading}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            {clusterLoading ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />} 刷新
          </button>
        </div>

        {clusterError && (
          <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle size={13} /> {clusterError}
          </div>
        )}

        {clusterInfo && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              {[
                ['总 Worker', clusterInfo.total_workers, 'text-slate-700'],
                ['在线 Worker', clusterInfo.alive_workers, 'text-emerald-600'],
                ['总任务数', clusterInfo.total_tasks, 'text-slate-700'],
                ['运行中', taskCounts.running ?? 0, 'text-blue-600'],
              ].map(([l, n, c]) => (
                <div key={String(l)} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-center">
                  <p className={`text-xl font-black ${c}`}>{n}</p>
                  <p className="text-[10px] text-slate-400">{l}</p>
                </div>
              ))}
            </div>

            {/* Task status breakdown */}
            {Object.keys(taskCounts).length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] font-black uppercase text-slate-400 mb-2">任务状态分布</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(taskCounts).map(([status, count]) => (
                    <span key={status} className={`inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold ${statusColors[status] || 'text-slate-600'}`}>
                      <Activity size={10} /> {status}: {count}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Worker list */}
            <p className="text-[10px] font-black uppercase text-slate-400 mb-2">Worker 实例列表</p>
            {clusterWorkers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-6 text-center text-xs text-slate-400">
                暂无 Worker 注册
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {clusterWorkers.map((w: FirmwareWorkerInstance) => (
                  <WorkerCard key={w.worker_id} w={w} isSelf={w.worker_id === clusterInfo.this_worker} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Config editor */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <Settings size={13} className="text-amber-600" />
            动态配置参数
          </div>
          <button onClick={loadConfig} disabled={configLoading}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            {configLoading ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />} 刷新
          </button>
        </div>

        {configError && (
          <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle size={13} /> {configError}
          </div>
        )}

        <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700 mb-3">
          💡 配置立即生效于后端服务，所有集群实例共享。修改后无需重启。
        </div>

        {configLoading && configItems.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-slate-400">
            <Loader2 size={18} className="animate-spin mr-2" /> 加载配置中...
          </div>
        ) : configItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-6 text-center text-xs text-slate-400">
            暂无配置项
          </div>
        ) : (
          <div className="space-y-2">
            {configItems.map(e => (
              <ConfigRow key={e.key} entry={e} onSave={handleSaveConfig} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
