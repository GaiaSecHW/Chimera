import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Loader2,
  RefreshCw, Save, Settings,
} from 'lucide-react';
import { api } from '../../clients/api';
import { FirmwareClusterInfo, FirmwareConfigEntry, FirmwareLlmConfigFileSummary } from '../../clients/firmwareUnpacker';
import { StaticPipelineFlow } from './StaticPipelineFlow';

interface Props { projectId: string; embedded?: boolean; }

const fwApi = api.domains.execution.firmwareUnpacker;
const LLM_ROLE_FIELDS = [
  { key: 'llm_config_file_key_executor', label: '通用解包执行器', description: '绑定执行器使用的 models.json 配置文件。' },
  { key: 'llm_config_file_key_reviewer', label: '评审器', description: '绑定评审器使用的 models.json 配置文件。' },
  { key: 'llm_config_file_key_cleaner', label: '清理器', description: '绑定清理器使用的 models.json 配置文件。' },
  { key: 'llm_config_file_key_skill_author', label: '技能生成器', description: '绑定技能生成器使用的 models.json 配置文件。' },
  { key: 'llm_config_file_key_skill_executor', label: '命中技能执行器', description: '绑定命中技能执行器使用的 models.json 配置文件。' },
  { key: 'llm_config_file_key_evolution_improver', label: '工具进化器', description: '绑定工具进化器使用的 models.json 配置文件。' },
] as const;
const LLM_MODEL_FIELDS: Record<string, string> = {
  llm_config_file_key_executor: 'llm_model_executor',
  llm_config_file_key_reviewer: 'llm_model_reviewer',
  llm_config_file_key_cleaner: 'llm_model_cleaner',
  llm_config_file_key_skill_author: 'llm_model_skill_author',
  llm_config_file_key_skill_executor: 'llm_model_skill_executor',
  llm_config_file_key_evolution_improver: 'llm_model_evolution_improver',
};
const REUSE_AGENT_FIELDS: Record<string, string> = {
  llm_config_file_key_executor: 'reuse_agent_between_rounds_executor',
  llm_config_file_key_reviewer: 'reuse_agent_between_rounds_reviewer',
  llm_config_file_key_cleaner: 'reuse_agent_between_rounds_cleaner',
  llm_config_file_key_skill_author: 'reuse_agent_between_rounds_skill_author',
  llm_config_file_key_skill_executor: 'reuse_agent_between_rounds_skill_executor',
  llm_config_file_key_evolution_improver: 'reuse_agent_between_rounds_evolution_improver',
};
const MAX_RETRIES_ACTION_OPTIONS = [
  { value: 'success', label: '通过', description: '达到最大重试次数后，任务按成功收敛。' },
  { value: 'failed', label: '失败', description: '达到最大重试次数后，任务按失败收敛。' },
] as const;

const FIRMWARE_UNPACK_FLOW = {
  title: '固件解包阶段推进关系',
  subtitle: '展示固件解包微服务从预处理到清理收敛的静态推进链路，帮助理解并发、角色绑定和重试策略分别作用在哪些阶段。',
  lanes: [
    {
      label: '主解包链路',
      steps: [
        { id: 'fw-preprocess', title: '预处理', desc: '识别输入固件、准备工作目录，并做基础格式判断。', badge: '1', tone: 'analysis' as const },
        { id: 'fw-tool-match', title: '工具匹配执行', desc: '优先命中已有解包工具或技能，执行首轮自动解包。', badge: '2', tone: 'analysis' as const },
        { id: 'fw-llm-unpack', title: 'LLM 解包', desc: '当工具链不足时，由执行器生成或补充解包动作。', badge: '3', tone: 'analysis' as const },
        { id: 'fw-llm-review', title: 'LLM 评审', desc: '评审器复核产物完整性、可用性与下一轮是否继续。', badge: '4', tone: 'review' as const },
        { id: 'fw-llm-cleanup', title: 'LLM 清理', desc: '整理输出目录、产物命名和最终结果清单。', badge: '5', tone: 'artifact' as const },
      ],
    },
  ],
  notes: [
    {
      title: '轮次收敛',
      detail: '工具执行器与评审器会按轮次反复推进；达到最大重试次数后，按 max_retries_reached_action 决定最终按通过还是失败收敛。',
      tone: 'review' as const,
    },
    {
      title: '角色绑定',
      detail: '通用执行器、评审器、清理器、技能生成器和进化器都可独立绑定配置文件与模型，影响的是后续新建任务的冻结快照。',
      tone: 'guard' as const,
    },
  ],
};

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
  const [llmConfigFiles,  setLlmConfigFiles]  = useState<FirmwareLlmConfigFileSummary[]>([]);
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
      'max_retries',
      'max_retries_reached_action',
      'reuse_agent_between_rounds',
      ...Object.values(REUSE_AGENT_FIELDS),
      ...LLM_ROLE_FIELDS.map((item) => item.key),
      ...Object.values(LLM_MODEL_FIELDS),
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
  const maxRetriesEntry = configMap.get('max_retries') || null;
  const maxRetriesActionEntry = configMap.get('max_retries_reached_action') || null;
  const maxRetriesValue = draftValues.max_retries ?? maxRetriesEntry?.value ?? '';
  const maxRetriesActionValue = draftValues.max_retries_reached_action ?? maxRetriesActionEntry?.value ?? 'success';
  const llmRoleConfigs = LLM_ROLE_FIELDS.map((field) => ({
    ...field,
    entry: configMap.get(field.key) || null,
    value: draftValues[field.key] ?? configMap.get(field.key)?.value ?? '',
    modelKey: LLM_MODEL_FIELDS[field.key],
    modelEntry: configMap.get(LLM_MODEL_FIELDS[field.key]) || null,
    modelValue: draftValues[LLM_MODEL_FIELDS[field.key]] ?? configMap.get(LLM_MODEL_FIELDS[field.key])?.value ?? '',
    configFile: llmConfigFiles.find((item) => item.config_file_key === (draftValues[field.key] ?? configMap.get(field.key)?.value ?? '')) || null,
    reuseKey: REUSE_AGENT_FIELDS[field.key],
    reuseEntry: configMap.get(REUSE_AGENT_FIELDS[field.key]) || null,
    reuseValue: String(draftValues[REUSE_AGENT_FIELDS[field.key]] ?? configMap.get(REUSE_AGENT_FIELDS[field.key])?.value ?? 'true').toLowerCase(),
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

  const loadLlmConfigFiles = useCallback(async () => {
    setLlmLoading(true);
    setLlmError('');
    try {
      const result = await fwApi.getLlmConfigFiles();
      setLlmConfigFiles(result.items);
    } catch (e: any) {
      setLlmError(e?.message || '加载可选 models.json 配置失败');
    } finally {
      setLlmLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
    loadCluster();
    loadLlmConfigFiles();
  }, [loadCluster, loadConfig, loadLlmConfigFiles]);

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
            <button onClick={() => { loadConfig(); loadCluster(); loadLlmConfigFiles(); }}
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
          <button onClick={() => { loadConfig(); loadCluster(); loadLlmConfigFiles(); }} disabled={configLoading || clusterLoading || llmLoading}
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

        <div className="mb-5">
          <StaticPipelineFlow
            title={FIRMWARE_UNPACK_FLOW.title}
            subtitle={FIRMWARE_UNPACK_FLOW.subtitle}
            lanes={FIRMWARE_UNPACK_FLOW.lanes}
            notes={FIRMWARE_UNPACK_FLOW.notes}
          />
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
              <p className="mt-2 text-sm font-semibold text-slate-800">按角色绑定配置文件与模型</p>
            </div>
            {llmLoading && <Loader2 size={16} className="animate-spin text-rose-600" />}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            每个角色都需要显式绑定一个 `models.json` 配置文件，并指定要使用的 `provider/model`。保存后只影响后续新建任务，任务创建时会冻结这五个角色的绑定快照。
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
                  <option value="">请选择配置文件</option>
                  {llmConfigFiles.map((configFile) => (
                    <option key={configFile.config_file_key} value={configFile.config_file_key}>
                      {`${configFile.display_name || configFile.config_file_key} · ${configFile.provider_type} · ${configFile.default_model || '-'}`}
                    </option>
                  ))}
                </select>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                  {item.value ? (
                    <>
                      <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-200">config_file_key: {item.value}</span>
                      {item.configFile?.is_default && (
                        <span className="rounded-full bg-rose-50 px-2 py-1 text-rose-700 ring-1 ring-rose-200">配置中心默认</span>
                      )}
                    </>
                  ) : (
                    <span className="rounded-full bg-white px-2 py-1 text-rose-700 ring-1 ring-rose-200">未配置，保存前必须选择</span>
                  )}
                </div>
                <div className="mt-3">
                  <label className="mb-1 block text-[11px] font-semibold text-slate-500">Provider / Model</label>
                  <input
                    value={item.modelValue}
                    disabled={configLoading || configSaving}
                    onChange={(event) => updateDraftValue(item.modelKey, event.target.value)}
                    placeholder="例如 openai/gpt-4o，留空则使用配置文件默认"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    建议填写 `provider/model`。如果该配置文件只包含单一 provider，也可以只填模型名；留空则继承配置文件默认值。
                  </p>
                  {item.configFile && item.configFile.model_options.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.configFile.model_options.slice(0, 6).map((option) => (
                        <button
                          key={`${item.key}-${option.value}`}
                          type="button"
                          onClick={() => updateDraftValue(item.modelKey, option.value)}
                          className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:border-rose-200 hover:text-rose-700"
                        >
                          {option.value}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {item.reuseEntry && (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-widest text-rose-600">Session Reuse</p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">轮次间智能体复用策略</p>
                      </div>
                      {item.reuseValue === 'true' ? (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">复用</span>
                      ) : (
                        <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">每轮新建</span>
                      )}
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">
                      当前策略独立归属于 {item.label}。开启后，该角色在后续轮次中尽量复用已有会话；关闭后按轮次创建新会话。
                    </p>
                    <div className="mt-3 grid grid-cols-1 gap-2">
                      {[
                        { value: 'true', label: '复用同一个智能体', description: '保留该角色的上下文与历史会话。' },
                        { value: 'false', label: '每轮新建智能体', description: '隔离不同轮次，避免上下文污染。' },
                      ].map((option) => {
                        const active = item.reuseValue === option.value;
                        return (
                          <button
                            key={`${item.reuseKey}-${option.value}`}
                            type="button"
                            onClick={() => updateDraftValue(item.reuseKey, option.value)}
                            className={`rounded-xl border px-3 py-2.5 text-left transition ${
                              active
                                ? 'border-slate-900 bg-slate-900 text-white'
                                : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                            }`}
                          >
                            <div className="text-sm font-bold">{option.label}</div>
                            <div className={`mt-1 text-[11px] ${active ? 'text-slate-300' : 'text-slate-500'}`}>{option.description}</div>
                          </button>
                        );
                      })}
                    </div>
                    {item.reuseValue !== String(item.reuseEntry.value ?? 'true').toLowerCase() && (
                      <p className="mt-2 text-[10px] font-semibold text-amber-600">未保存</p>
                    )}
                    <p className="mt-2 text-[10px] text-slate-400">更新于 {fmtTime(item.reuseEntry.updated_at)}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {(maxRetriesEntry || maxRetriesActionEntry) && (
          <div className="mb-5 rounded-2xl bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-rose-600">Retry Policy</p>
                <p className="mt-2 text-sm font-semibold text-slate-800">最大重试次数与超限默认动作</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              控制通用 LLM 解包链路的最大轮次，以及当结果落为 `max_retries_reached` 时，默认按通过还是失败收敛。
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
              {maxRetriesEntry && (
                <ConfigRow
                  entry={maxRetriesEntry}
                  value={maxRetriesValue}
                  onChange={(value) => updateDraftValue(maxRetriesEntry.key, value)}
                  dirty={maxRetriesValue !== maxRetriesEntry.value}
                />
              )}
              {maxRetriesActionEntry && (
                <div className="rounded-2xl bg-white p-5">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-black font-mono text-slate-700">{maxRetriesActionEntry.key}</span>
                    <span className="text-[10px] rounded-full bg-slate-100 px-1.5 py-0.5 text-slate-500">{maxRetriesActionEntry.value_type}</span>
                    {maxRetriesActionValue !== maxRetriesActionEntry.value && <span className="text-[10px] font-semibold text-amber-600">未保存</span>}
                  </div>
                  {maxRetriesActionEntry.description && (
                    <p className="mb-3 text-[11px] text-slate-400">{maxRetriesActionEntry.description}</p>
                  )}
                  <div className="space-y-2">
                    {MAX_RETRIES_ACTION_OPTIONS.map((option) => {
                      const active = maxRetriesActionValue === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => updateDraftValue(maxRetriesActionEntry.key, option.value)}
                          className={`flex w-full items-start justify-between rounded-xl border px-4 py-3 text-left transition ${
                            active
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                          }`}
                        >
                          <div>
                            <div className="text-sm font-bold">{option.label}</div>
                            <div className={`mt-1 text-[11px] ${active ? 'text-slate-300' : 'text-slate-500'}`}>{option.description}</div>
                          </div>
                          <span className={`rounded-full px-2 py-1 text-[10px] font-black ${active ? 'bg-white/10 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'}`}>
                            {option.value}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[10px] text-slate-400">
                    更新于 {fmtTime(maxRetriesActionEntry.updated_at)}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

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
