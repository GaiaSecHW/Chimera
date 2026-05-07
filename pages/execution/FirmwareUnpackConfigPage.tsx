import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, CheckCircle2, Loader2,
  RefreshCw, Save, Settings,
} from 'lucide-react';
import { api } from '../../clients/api';
import { FirmwareClusterInfo, FirmwareConfigEntry, FirmwareToolEntry } from '../../clients/firmwareUnpacker';
import { showAlert } from '../../components/DialogService';

interface Props { projectId: string; }

const fwApi = api.domains.execution.firmwareUnpacker;

function fmtTime(iso: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('zh-CN', { hour12: false });
}

// ──────────────────────────────────────────────────────────
// Config editor row
// ──────────────────────────────────────────────────────────
function ConfigRow({
  entry, onSave, disabled = false,
}: { entry: FirmwareConfigEntry; onSave: (key: string, value: string) => Promise<void>; disabled?: boolean }) {
  const [val, setVal]       = useState(entry.value);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const dirty = val !== entry.value;

  useEffect(() => {
    setVal(entry.value);
  }, [entry.value]);

  const handleSave = async () => {
    if (disabled) return;
    setSaving(true);
    try {
      await onSave(entry.key, val);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      await showAlert({
        title: '保存失败',
        message: e?.message ? `保存失败: ${e.message}` : '保存失败',
        tone: 'error',
      });
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
            disabled={disabled}
            className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-mono outline-none transition ${
              dirty ? 'border-blue-300 ring-1 ring-blue-100' : 'border-slate-200'
            } bg-white disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400`}
          />
          <button
            onClick={handleSave}
            disabled={disabled || !dirty || saving}
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
// Main page
// ──────────────────────────────────────────────────────────
export const FirmwareUnpackConfigPage: React.FC<Props> = ({ projectId }) => {
  const [configs,       setConfigs]       = useState<FirmwareConfigEntry[]>([]);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError,   setConfigError]   = useState('');
  const [tools,         setTools]         = useState<FirmwareToolEntry[]>([]);
  const [toolsLoading,  setToolsLoading]  = useState(false);
  const [toolsError,    setToolsError]    = useState('');
  const [cluster,       setCluster]       = useState<FirmwareClusterInfo | null>(null);
  const [clusterLoading,setClusterLoading]= useState(false);
  const [clusterError,  setClusterError]  = useState('');
  const configItems = Array.isArray(configs) ? configs : [];
  const concurrencyConfigKeys = useMemo(
    () => new Set([
      'concurrency_mode',
      'manual_max_concurrent',
      'cpu_millis_per_task',
      'memory_mb_per_task',
      'reserved_cpu_millis',
      'reserved_memory_mb',
      'max_concurrent',
    ]),
    [],
  );
  const configMap = useMemo(
    () => new Map(configItems.map((item) => [item.key, item])),
    [configItems],
  );
  const concurrencyMode = configMap.get('concurrency_mode')?.value || cluster?.concurrency.mode || 'auto';
  const isManualMode = concurrencyMode === 'manual';
  const podConcurrencyItems = [
    configMap.get('manual_max_concurrent'),
  ].filter((item): item is FirmwareConfigEntry => Boolean(item));
  const genericConfigItems = configItems.filter((item) => !concurrencyConfigKeys.has(item.key));

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
      const snapshot = await fwApi.getCluster();
      setCluster(snapshot);
    } catch (e: any) {
      setClusterError(e?.message || '加载集群状态失败');
    } finally {
      setClusterLoading(false);
    }
  }, []);

  const loadTools = useCallback(async () => {
    setToolsLoading(true);
    setToolsError('');
    try {
      const result = await fwApi.getTools();
      setTools(result.items);
    } catch (e: any) {
      setToolsError(e?.message || '加载工具列表失败');
    } finally {
      setToolsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
    loadCluster();
    loadTools();
  }, []);

  // ── save config ───────────────────────────────────────────
  const handleSaveConfig = async (key: string, value: string) => {
    await fwApi.updateConfig(key, value);
    // Update local cache
    setConfigs(prev => prev.map(e => e.key === key ? { ...e, value, updated_at: new Date().toISOString() } : e));
    loadCluster();
  };

  const handleModeChange = async (mode: 'auto' | 'manual') => {
    if (mode === concurrencyMode) return;
    await handleSaveConfig('concurrency_mode', mode);
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings size={18} className="text-violet-600" />
          <div>
            <h2 className="text-sm font-bold text-slate-800">固件解包 · 配置</h2>
            <p className="text-xs text-slate-400">动态配置参数</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { loadConfig(); loadCluster(); loadTools(); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <RefreshCw size={12} /> 刷新
          </button>
        </div>
      </div>

      {/* Config editor */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <Settings size={13} className="text-amber-600" />
            动态配置参数
          </div>
          <button onClick={() => { loadConfig(); loadCluster(); }} disabled={configLoading || clusterLoading}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            {configLoading || clusterLoading ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />} 刷新
          </button>
        </div>

        {configError && (
          <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle size={13} /> {configError}
          </div>
        )}
        {clusterError && (
          <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle size={13} /> {clusterError}
          </div>
        )}

        <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700 mb-3">
          💡 配置立即生效于后端服务，所有集群实例共享。修改后无需重启。
        </div>

        <div className="mb-4 rounded-xl border border-cyan-100 bg-cyan-50/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-cyan-700">单 Pod 并发控制</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {concurrencyMode === 'manual' ? '手动模式' : '自动模式'}
                {' · '}
                当前生效上限 {cluster?.concurrency.effective_max_concurrent ?? '-'}
              </p>
            </div>
            {clusterLoading && <Loader2 size={14} className="animate-spin text-cyan-600" />}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { void handleModeChange('auto'); }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                !isManualMode
                  ? 'border-cyan-600 bg-cyan-600 text-white'
                  : 'border-cyan-200 bg-white text-cyan-700 hover:bg-cyan-50'
              }`}
            >
              自动模式
            </button>
            <button
              type="button"
              onClick={() => { void handleModeChange('manual'); }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                isManualMode
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              手动模式
            </button>
            <span className="inline-flex items-center rounded-lg bg-white px-3 py-1.5 text-[11px] text-slate-500">
              自动模式下并发参数只读；切换到手动模式后可编辑
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-lg border border-cyan-100 bg-white px-3 py-2">
              <p className="text-slate-400">在线实例</p>
              <p className="mt-1 font-bold text-slate-800">{cluster?.alive_workers ?? '-'}</p>
            </div>
            <div className="rounded-lg border border-cyan-100 bg-white px-3 py-2">
              <p className="text-slate-400">运行中任务</p>
              <p className="mt-1 font-bold text-slate-800">{cluster?.task_counts?.running ?? 0}</p>
            </div>
            <div className="rounded-lg border border-cyan-100 bg-white px-3 py-2">
              <p className="text-slate-400">CPU 限制</p>
              <p className="mt-1 font-bold text-slate-800">{cluster?.concurrency.pod_cpu_limit_millicores ?? '-'}m</p>
            </div>
            <div className="rounded-lg border border-cyan-100 bg-white px-3 py-2">
              <p className="text-slate-400">内存限制</p>
              <p className="mt-1 font-bold text-slate-800">{cluster?.concurrency.pod_memory_limit_mib ?? '-'}Mi</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-lg border border-cyan-100 bg-white px-3 py-2">
              <p className="font-semibold text-slate-700">自动计算依据</p>
              <p className="mt-1 text-slate-500">
                Pod 总资源上限：CPU {cluster?.concurrency.pod_cpu_limit_millicores ?? '-'}m / 内存 {cluster?.concurrency.pod_memory_limit_mib ?? '-'}Mi
              </p>
              <p className="mt-1 text-slate-500">
                系统按单任务预算估算：CPU {cluster?.concurrency.cpu_millis_per_task ?? '-'}m / 内存 {cluster?.concurrency.memory_mb_per_task ?? '-'}Mi
              </p>
            </div>
            <div className="rounded-lg border border-cyan-100 bg-white px-3 py-2">
              <p className="font-semibold text-slate-700">自动计算结果</p>
              <p className="mt-1 text-slate-500">
                CPU 档位 {cluster?.concurrency.cpu_based_limit ?? '-'}，内存档位 {cluster?.concurrency.memory_based_limit ?? '-'}
              </p>
              <p className="mt-1 text-slate-500">
                自动上限 {cluster?.concurrency.auto_max_concurrent ?? '-'}，线程池硬上限 {cluster?.concurrency.executor_capacity ?? '-'}
              </p>
            </div>
          </div>
          {podConcurrencyItems.length > 0 && (
            <div className="mt-3 space-y-2">
              {podConcurrencyItems.map((entry) => (
                <ConfigRow
                  key={`${entry.key}-${concurrencyMode}`}
                  entry={entry}
                  onSave={handleSaveConfig}
                  disabled={!isManualMode}
                />
              ))}
            </div>
          )}
        </div>

        {configLoading && configItems.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-slate-400">
            <Loader2 size={18} className="animate-spin mr-2" /> 加载配置中...
          </div>
        ) : genericConfigItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-6 text-center text-xs text-slate-400">
            暂无配置项
          </div>
        ) : (
          <div className="space-y-2">
            {genericConfigItems.map(e => (
              <ConfigRow key={e.key} entry={e} onSave={handleSaveConfig} />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <Settings size={13} className="text-emerald-600" />
              自进化解包工具
            </div>
            <p className="mt-1 text-xs text-slate-400">当前读取目录：`/data/secflow-app-firmware-unpacker/tools`</p>
          </div>
          <button
            onClick={() => { loadTools(); }}
            disabled={toolsLoading}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {toolsLoading ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
            刷新
          </button>
        </div>

        {toolsError && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertCircle size={13} /> {toolsError}
          </div>
        )}

        {toolsLoading && tools.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-slate-400">
            <Loader2 size={18} className="mr-2 animate-spin" /> 加载工具列表中...
          </div>
        ) : tools.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-6 text-center text-xs text-slate-400">
            `/data/secflow-app-firmware-unpacker/tools` 当前没有工具
          </div>
        ) : (
          <div className="space-y-3">
            {tools.map((tool) => (
              <div key={tool.path} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-black font-mono text-slate-800">{tool.format_id || tool.filename}</span>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-600">{tool.filename}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                    tool.skill_status === 'active'
                      ? 'bg-emerald-100 text-emerald-700'
                      : tool.skill_status === 'archived'
                        ? 'bg-slate-200 text-slate-600'
                        : 'bg-amber-100 text-amber-700'
                  }`}>
                    {tool.skill_status}
                  </span>
                </div>
                <p className="mt-2 break-all text-[11px] text-slate-500">{tool.path}</p>
                <p className="mt-2 text-xs text-slate-700">{tool.description || '未填写描述'}</p>
                <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] text-slate-500 sm:grid-cols-2">
                  <div>
                    <span className="font-semibold text-slate-700">格式族：</span>
                    {tool.family_id || '-'}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700">版本 / 晋升：</span>
                    v{tool.skill_version} · {tool.promotion_success_count}/{tool.promotion_threshold}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700">扩展名：</span>
                    {tool.extensions.length > 0 ? tool.extensions.join(', ') : '-'}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700">Magic：</span>
                    {tool.magic_hex || '-'}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700">关键词：</span>
                    {tool.keywords.length > 0 ? tool.keywords.join(', ') : '-'}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700">Binwalk 特征：</span>
                    {tool.binwalk_sigs.length > 0 ? tool.binwalk_sigs.join(', ') : '-'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
