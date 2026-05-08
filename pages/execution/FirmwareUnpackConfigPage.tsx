import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Loader2,
  RefreshCw, Save, Settings,
} from 'lucide-react';
import { api } from '../../clients/api';
import { FirmwareClusterInfo, FirmwareConfigEntry, FirmwareLlmProviderSummary } from '../../clients/firmwareUnpacker';

interface Props { projectId: string; embedded?: boolean; }

const fwApi = api.domains.execution.firmwareUnpacker;
const LLM_ROLE_FIELDS = [
  { key: 'llm_provider_key_executor', label: '通用解包执行器', description: '控制通用 LLM 解包执行轮次使用的 Provider。' },
  { key: 'llm_provider_key_reviewer', label: '评审器', description: '控制解包结果评审阶段使用的 Provider。' },
  { key: 'llm_provider_key_cleaner', label: '清理器', description: '控制输出清理阶段使用的 Provider。' },
  { key: 'llm_provider_key_skill_author', label: '技能生成器', description: '控制成功解包后生成可复用技能的 Provider。' },
  { key: 'llm_provider_key_skill_executor', label: '命中技能执行器', description: '控制命中解包技能后实际执行该技能的 Provider。' },
] as const;

function fmtTime(iso: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('zh-CN', { hour12: false });
}

// ──────────────────────────────────────────────────────────
// Config editor row
// ──────────────────────────────────────────────────────────
function ConfigRow({
  entry, value, onChange, disabled = false, dirty = false,
}: { entry: FirmwareConfigEntry; value: string; onChange: (value: string) => void; disabled?: boolean; dirty?: boolean }) {
  return (
    <div className="rounded-2xl bg-white p-5">
      <div className="flex-1 min-w-0">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-black font-mono text-slate-700">{entry.key}</span>
          <span className="text-[10px] rounded-full bg-slate-100 px-1.5 py-0.5 text-slate-500">{entry.value_type}</span>
          {dirty && <span className="text-[10px] font-semibold text-amber-600">未保存</span>}
        </div>
        {entry.description && (
          <p className="mb-3 text-[11px] text-slate-400">{entry.description}</p>
        )}
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          className={`w-full rounded-lg border px-3 py-1.5 text-xs font-mono outline-none transition ${
            dirty ? 'border-blue-300 ring-1 ring-blue-100' : 'border-slate-200'
          } bg-white disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400`}
        />
        <p className="mt-2 text-[10px] text-slate-400">
          更新于 {fmtTime(entry.updated_at)}
        </p>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────────────────
export const FirmwareUnpackConfigPage: React.FC<Props> = ({ projectId: _projectId, embedded = false }) => {
  const [configs,       setConfigs]       = useState<FirmwareConfigEntry[]>([]);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError,   setConfigError]   = useState('');
  const [configMessage, setConfigMessage] = useState('');
  const [configSaving,  setConfigSaving]  = useState(false);
  const [draftValues,   setDraftValues]   = useState<Record<string, string>>({});
  const [llmProviders,  setLlmProviders]  = useState<FirmwareLlmProviderSummary[]>([]);
  const [llmLoading,    setLlmLoading]    = useState(false);
  const [llmError,      setLlmError]      = useState('');
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
      ...LLM_ROLE_FIELDS.map((item) => item.key),
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
  const llmRoleConfigs = LLM_ROLE_FIELDS.map((field) => ({
    ...field,
    entry: configMap.get(field.key) || null,
    value: draftValues[field.key] ?? configMap.get(field.key)?.value ?? '',
  }));
  const hasConfigChanges = configItems.some((item) => draftValues[item.key] !== item.value);
  const missingLlmRoles = llmRoleConfigs.filter((item) => !String(item.value || '').trim()).map((item) => item.label);

  // ── load ──────────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    setConfigLoading(true);
    setConfigError('');
    setConfigMessage('');
    try {
      const r = await fwApi.getConfig();
      setConfigs(r.items);
      setDraftValues(
        Object.fromEntries(r.items.map((item) => [item.key, item.value])),
      );
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

  const loadLlmProviders = useCallback(async () => {
    setLlmLoading(true);
    setLlmError('');
    try {
      const result = await fwApi.getLlmProviders();
      setLlmProviders(result.items);
    } catch (e: any) {
      setLlmError(e?.message || '加载可选 LLM Provider 失败');
    } finally {
      setLlmLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
    loadCluster();
    loadLlmProviders();
  }, [loadCluster, loadConfig, loadLlmProviders]);

  // ── save config ───────────────────────────────────────────
  const updateDraftValue = useCallback((key: string, value: string) => {
    setDraftValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSaveConfig = useCallback(async () => {
    if (missingLlmRoles.length > 0) {
      setConfigError(`以下 LLM 角色尚未配置: ${missingLlmRoles.join('、')}`);
      setConfigMessage('');
      return;
    }
    const updates = configItems
      .filter((item) => draftValues[item.key] !== item.value)
      .map((item) => ({ key: item.key, value: draftValues[item.key] ?? item.value }));

    if (updates.length === 0) {
      setConfigMessage('当前没有需要保存的改动');
      return;
    }

    setConfigSaving(true);
    setConfigError('');
    setConfigMessage('');
    try {
      const result = await fwApi.batchUpdateConfig(updates);
      setConfigs(result.items);
      setDraftValues(
        Object.fromEntries(result.items.map((item) => [item.key, item.value])),
      );
      setConfigMessage('固件解包配置已保存');
      void loadCluster();
    } catch (e: any) {
      setConfigError(e?.message || '保存失败');
    } finally {
      setConfigSaving(false);
    }
  }, [configItems, draftValues, loadCluster, missingLlmRoles]);

  const handleResetConfig = useCallback(() => {
    setDraftValues(Object.fromEntries(configItems.map((item) => [item.key, item.value])));
    setConfigMessage('');
    setConfigError('');
  }, [configItems]);

  const resolveDraftValue = useCallback((entry: FirmwareConfigEntry) => (
    draftValues[entry.key] ?? entry.value
  ), [draftValues]);

  const handleModeChange = (mode: 'auto' | 'manual') => {
    if (mode === concurrencyMode) return;
    updateDraftValue('concurrency_mode', mode);
  };

  return (
    <div className={embedded ? 'space-y-4' : 'p-4 space-y-4'}>
      {!embedded && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-violet-600" />
            <div>
              <h2 className="text-sm font-bold text-slate-800">固件解包 · 配置</h2>
              <p className="text-xs text-slate-400">动态配置参数</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { loadConfig(); loadCluster(); loadLlmProviders(); }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <RefreshCw size={12} /> 刷新
            </button>
          </div>
        </div>
      )}

      <section className={`${embedded ? 'rounded-[2rem] border border-slate-200 bg-slate-50/70 p-6 shadow-sm' : 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm'}`}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Settings size={18} className="text-rose-600" />
              <h2 className="text-xl font-black text-slate-900">{embedded ? '固件解包参数配置' : '动态配置参数'}</h2>
              <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-black tracking-[0.12em] text-rose-700">
                secflow-app-firmware-unpacker
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              当前面板配置项归属于 `secflow-app-firmware-unpacker` 微服务，用于控制固件解包服务的集群并发和运行时参数。
            </p>
          </div>
          <button onClick={() => { loadConfig(); loadCluster(); loadLlmProviders(); }} disabled={configLoading || clusterLoading || llmLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50">
            {configLoading || clusterLoading || llmLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} 刷新
          </button>
        </div>

        {configError && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 flex items-center gap-2">
            <AlertCircle size={13} /> {configError}
          </div>
        )}
        {clusterError && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 flex items-center gap-2">
            <AlertCircle size={13} /> {clusterError}
          </div>
        )}
        {llmError && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 flex items-center gap-2">
            <AlertCircle size={13} /> {llmError}
          </div>
        )}
        {configMessage && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            {configMessage}
          </div>
        )}

        <div className="mb-5 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          配置立即生效于后端服务，所有集群实例共享。修改后无需重启。
        </div>

        <div className="mb-5 rounded-2xl bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-rose-600">Pod Concurrency</p>
              <p className="mt-2 text-sm font-semibold text-slate-800">
                {concurrencyMode === 'manual' ? '手动模式' : '自动模式'}
                {' · '}
                当前生效上限 {cluster?.concurrency.effective_max_concurrent ?? '-'}
              </p>
            </div>
            {clusterLoading && <Loader2 size={16} className="animate-spin text-rose-600" />}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { void handleModeChange('auto'); }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                !isManualMode
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
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
            <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500">
              自动模式下并发参数只读；切换到手动模式后可编辑
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-slate-400">在线实例</p>
              <p className="mt-1 font-bold text-slate-800">{cluster?.alive_workers ?? '-'}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-slate-400">运行中任务</p>
              <p className="mt-1 font-bold text-slate-800">{cluster?.task_counts?.running ?? 0}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-slate-400">CPU 限制</p>
              <p className="mt-1 font-bold text-slate-800">{cluster?.concurrency.pod_cpu_limit_millicores ?? '-'}m</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-slate-400">内存限制</p>
              <p className="mt-1 font-bold text-slate-800">{cluster?.concurrency.pod_memory_limit_mib ?? '-'}Mi</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="font-semibold text-slate-700">自动计算依据</p>
              <p className="mt-1 text-slate-500">
                Pod 总资源上限：CPU {cluster?.concurrency.pod_cpu_limit_millicores ?? '-'}m / 内存 {cluster?.concurrency.pod_memory_limit_mib ?? '-'}Mi
              </p>
              <p className="mt-1 text-slate-500">
                系统按单任务预算估算：CPU {cluster?.concurrency.cpu_millis_per_task ?? '-'}m / 内存 {cluster?.concurrency.memory_mb_per_task ?? '-'}Mi
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2">
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
                  value={resolveDraftValue(entry)}
                  onChange={(value) => updateDraftValue(entry.key, value)}
                  disabled={!isManualMode}
                  dirty={resolveDraftValue(entry) !== entry.value}
                />
              ))}
            </div>
          )}
        </div>

        <div className="mb-5 rounded-2xl bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-rose-600">LLM Role Binding</p>
              <p className="mt-2 text-sm font-semibold text-slate-800">按角色绑定配置中心 Provider</p>
            </div>
            {llmLoading && <Loader2 size={16} className="animate-spin text-rose-600" />}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            每个角色必须显式选择一个配置中心 Provider。保存后，后端会在拉起对应 `pi` 智能体子进程时动态注入环境变量并生成临时 provider 路由配置。
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            {llmRoleConfigs.map((item) => (
              <div key={item.key} className="rounded-2xl bg-slate-50 p-4">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-sm font-black text-slate-800">{item.label}</span>
                  {item.entry && resolveDraftValue(item.entry) !== item.entry.value && (
                    <span className="text-[10px] font-semibold text-amber-600">未保存</span>
                  )}
                </div>
                <p className="mb-3 text-[11px] text-slate-500">{item.description}</p>
                <select
                  value={item.value}
                  disabled={configLoading || configSaving || llmLoading}
                  onChange={(event) => updateDraftValue(item.key, event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                >
                  <option value="">请选择 Provider</option>
                  {llmProviders.map((provider) => (
                    <option key={provider.provider_key} value={provider.provider_key}>
                      {`${provider.display_name || provider.provider_key} · ${provider.provider_type} · ${provider.model || '-'}`}
                    </option>
                  ))}
                </select>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                  {item.value ? (
                    <>
                      <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">provider_key: {item.value}</span>
                      {llmProviders.find((provider) => provider.provider_key === item.value)?.is_default && (
                        <span className="rounded-full bg-rose-50 px-2 py-1 text-rose-700 ring-1 ring-rose-200">配置中心默认</span>
                      )}
                    </>
                  ) : (
                    <span className="rounded-full bg-white px-2 py-1 text-rose-700 ring-1 ring-rose-200">未配置，保存前必须选择</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {configLoading && configItems.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-slate-400">
            <Loader2 size={18} className="animate-spin mr-2" /> 加载配置中...
          </div>
        ) : genericConfigItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
            暂无配置项
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {genericConfigItems.map(e => (
              <ConfigRow
                key={e.key}
                entry={e}
                value={resolveDraftValue(e)}
                onChange={(value) => updateDraftValue(e.key, value)}
                dirty={resolveDraftValue(e) !== e.value}
              />
            ))}
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleResetConfig}
            disabled={configLoading || configSaving || !hasConfigChanges}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={16} />
            撤销改动
          </button>
          <button
            type="button"
            onClick={() => void handleSaveConfig()}
            disabled={configLoading || configSaving || !hasConfigChanges || missingLlmRoles.length > 0}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
          >
            {configSaving && <Loader2 size={16} className="animate-spin" />}
            <Save size={16} />
            保存固件解包配置
          </button>
        </div>
      </section>
    </div>
  );
};
