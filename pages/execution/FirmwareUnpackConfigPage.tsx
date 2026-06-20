import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Loader2,
  RefreshCw, Save, Settings,
} from 'lucide-react';
import { api } from '../../clients/api';
import { FirmwareClusterInfo, FirmwareConfigEntry, FirmwareLlmConfigFileSummary } from '../../clients/firmwareUnpacker';
import { StaticPipelineFlow } from './StaticPipelineFlow';
import { PageSection, FormActionBar, PageHeader } from '../../design-system';

const LK = {
  primary: '#4f73ff',
  primarySoft: '#7590ff',
  primaryDeep: '#3f63f1',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: '#070d18',
  surface: '#111a2b',
  surfaceRaised: '#18233a',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: '#26324a',
  borderSoft: '#1b2438',
  ink: '#f5f7ff',
  inkSoft: '#d6def0',
  body: '#a4aec4',
  muted: '#72809a',
  mutedSoft: '#8b95a8',
  success: '#45c06f',
  warning: '#d5a13a',
  error: '#f15d5d',
  info: '#4f8cff',
  critical: '#ff4d4f',
  high: '#ff8b3d',
  medium: '#f0b64c',
  low: '#49c5ff',
} as const;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

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
const PI_RPCCLIENT_DEFAULTS = {
  timeoutSeconds: '1800',
  retryEnabled: 'true',
  maxRetries: '20',
} as const;

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
    <div className="rounded-2xl p-5" style={{ backgroundColor: LK.surface }}>
      <div className="flex-1 min-w-0">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-semibold" style={{ fontFamily: MONO, color: LK.ink }}>{entry.key}</span>
          <span className="text-[10px] rounded-full px-1.5 py-0.5" style={{ backgroundColor: LK.surfaceRaised, color: LK.muted }}>{entry.value_type}</span>
          {dirty && <span className="text-[10px] font-semibold" style={{ color: LK.warning }}>未保存</span>}
        </div>
        {entry.description && (
          <p className="mb-3 text-[11px]" style={{ color: LK.muted }}>{entry.description}</p>
        )}
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          className="w-full rounded-lg border px-3 py-1.5 text-xs outline-none transition"
          style={{
            fontFamily: MONO,
            backgroundColor: LK.surfaceRaised,
            color: LK.ink,
            border: dirty ?`1px solid ${LK.primary}` :`1px solid ${LK.border}`,
          }}
        />
        <p className="mt-2 text-[10px]" style={{ color: LK.muted }}>
          更新于 {fmtTime(entry.updated_at)}
        </p>
      </div>
    </div>
  );
}

const SectionCard: React.FC<{ title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }> = ({
  title,
  subtitle,
  actions,
  children,
}) => (
  <PageSection title={title} description={subtitle} actions={actions}>{children}</PageSection>
);

const PanelActions: React.FC<{ saving: boolean; disabled?: boolean; onSave: () => void; onReset: () => void }> = ({
  saving,
  disabled = false,
  onSave,
  onReset,
}) => (
  <FormActionBar saving={saving} disabled={disabled} onSave={onSave} onReset={onReset} saveText="保存配置" resetText="重置为默认" />
);

// ──────────────────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────────────────
export const FirmwareUnpackConfigPage: React.FC<Props> = ({ projectId: _projectId, embedded = false }) => {
  const [configs,       setConfigs]       = useState<FirmwareConfigEntry[]>([]);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError,   setConfigError]   = useState('');
  const [configMessage, setConfigMessage] = useState('');
  const [configSaving,  setConfigSaving]  = useState(false);
  const [savingPanel,   setSavingPanel]   = useState<string | null>(null);
  const [draftValues,   setDraftValues]   = useState<Record<string, string>>({});
  const [llmConfigFiles,  setLlmConfigFiles]  = useState<FirmwareLlmConfigFileSummary[]>([]);
  const [llmLoading,    setLlmLoading]    = useState(false);
  const [llmError,      setLlmError]      = useState('');
  const [cluster,       setCluster]       = useState<FirmwareClusterInfo | null>(null);
  const [clusterLoading,setClusterLoading]= useState(false);
  const [clusterError,  setClusterError]  = useState('');
  const configItems = Array.isArray(configs) ? configs : [];
  const hiddenConfigKeys = useMemo(
    () => new Set([
      ...Object.values(REUSE_AGENT_FIELDS),
      ...LLM_ROLE_FIELDS.map((item) => item.key),
      ...Object.values(LLM_MODEL_FIELDS),
    ]),
    [],
  );
  const podConcurrencyKeys = useMemo(
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
  const retryPolicyKeys = useMemo(
    () => new Set([
      'max_retries',
      'max_retries_reached_action',
    ]),
    [],
  );
  const piRpcClientKeys = useMemo(
    () => new Set([
      'agent_run_timeout_seconds',
      'agent_timeout_retry_enabled',
      'agent_timeout_max_retries',
    ]),
    [],
  );
  const configMap = useMemo(
    () => new Map(configItems.map((item) => [item.key, item])),
    [configItems],
  );
  const concurrencyMode = configMap.get('concurrency_mode')?.value || cluster?.concurrency.mode || 'auto';
  const isManualMode = concurrencyMode === 'manual';
  const podConcurrencyItems = configItems.filter((item) => podConcurrencyKeys.has(item.key));
  const genericConfigItems = configItems.filter((item) => !hiddenConfigKeys.has(item.key) && !podConcurrencyKeys.has(item.key) && !retryPolicyKeys.has(item.key) && !piRpcClientKeys.has(item.key));
  const maxRetriesEntry = configMap.get('max_retries') || null;
  const maxRetriesActionEntry = configMap.get('max_retries_reached_action') || null;
  const maxRetriesValue = draftValues.max_retries ?? maxRetriesEntry?.value ?? '';
  const maxRetriesActionValue = draftValues.max_retries_reached_action ?? maxRetriesActionEntry?.value ?? 'success';
  const piRpcTimeoutEntry = configMap.get('agent_run_timeout_seconds') || null;
  const piRpcRetryEnabledEntry = configMap.get('agent_timeout_retry_enabled') || null;
  const piRpcMaxRetriesEntry = configMap.get('agent_timeout_max_retries') || null;
  const piRpcTimeoutValue = draftValues.agent_run_timeout_seconds ?? piRpcTimeoutEntry?.value ?? PI_RPCCLIENT_DEFAULTS.timeoutSeconds;
  const piRpcRetryEnabledValue = String(draftValues.agent_timeout_retry_enabled ?? piRpcRetryEnabledEntry?.value ?? PI_RPCCLIENT_DEFAULTS.retryEnabled).toLowerCase();
  const piRpcMaxRetriesValue = draftValues.agent_timeout_max_retries ?? piRpcMaxRetriesEntry?.value ?? PI_RPCCLIENT_DEFAULTS.maxRetries;
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
  const hasPanelChanges = useCallback((keys: string[]) => (
    keys.some((key) => {
      const item = configMap.get(key);
      return item ? (draftValues[key] ?? item.value) !== item.value : false;
    })
  ), [configMap, draftValues]);
  const missingLlmRoles = llmRoleConfigs.filter((item) => !String(item.value || '').trim()).map((item) => item.label);
  const podConcurrencyPanelKeys = useMemo(() => podConcurrencyItems.map((item) => item.key), [podConcurrencyItems]);
  const llmPanelKeys = useMemo(
    () => llmRoleConfigs.flatMap((item) => [item.key, item.modelKey, item.reuseKey]).filter(Boolean),
    [llmRoleConfigs],
  );
  const retryPanelKeys = useMemo(
    () => [maxRetriesEntry?.key, maxRetriesActionEntry?.key].filter((value): value is string => Boolean(value)),
    [maxRetriesActionEntry?.key, maxRetriesEntry?.key],
  );
  const piRpcClientPanelKeys = useMemo(
    () => [piRpcTimeoutEntry?.key, piRpcRetryEnabledEntry?.key, piRpcMaxRetriesEntry?.key].filter((value): value is string => Boolean(value)),
    [piRpcMaxRetriesEntry?.key, piRpcRetryEnabledEntry?.key, piRpcTimeoutEntry?.key],
  );
  const genericPanelKeys = useMemo(() => genericConfigItems.map((item) => item.key), [genericConfigItems]);

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

  const saveConfigPanel = useCallback(async (panelId: string, label: string, keys: string[], requireLlmBinding = false) => {
    if (requireLlmBinding && missingLlmRoles.length > 0) {
      setConfigError(`以下 LLM 角色尚未配置: ${missingLlmRoles.join('、')}`);
      setConfigMessage('');
      return;
    }
    const keySet = new Set(keys);
    const updates = configItems
      .filter((item) => keySet.has(item.key) && draftValues[item.key] !== item.value)
      .map((item) => ({ key: item.key, value: draftValues[item.key] ?? item.value }));

    if (updates.length === 0) {
      setConfigMessage(`${label}当前没有需要保存的改动`);
      setConfigError('');
      return;
    }

    setSavingPanel(panelId);
    setConfigSaving(true);
    setConfigError('');
    setConfigMessage('');
    try {
      const result = await fwApi.batchUpdateConfig(updates);
      const previousDraft = draftValues;
      setConfigs(result.items);
      setDraftValues(
        Object.fromEntries(result.items.map((item) => [
          item.key,
          keySet.has(item.key) ? item.value : (previousDraft[item.key] ?? item.value),
        ])),
      );
      setConfigMessage(`${label}已保存`);
      void loadCluster();
    } catch (e: any) {
      setConfigError(e?.message || '保存失败');
    } finally {
      setConfigSaving(false);
      setSavingPanel(null);
    }
  }, [configItems, draftValues, loadCluster, missingLlmRoles]);

  const resetConfigPanel = useCallback((label: string, keys: string[]) => {
    setDraftValues((prev) => {
      const next = { ...prev };
      keys.forEach((key) => {
        const item = configMap.get(key);
        if (item) {
          next[key] = item.value;
        }
      });
      return next;
    });
    setConfigMessage(`${label}已重置为当前生效值`);
    setConfigError('');
  }, [configMap]);

  const resolveDraftValue = useCallback((entry: FirmwareConfigEntry) => (
    draftValues[entry.key] ?? entry.value
  ), [draftValues]);

  const handleModeChange = (mode: 'auto' | 'manual') => {
    if (mode === concurrencyMode) return;
    updateDraftValue('concurrency_mode', mode);
  };

  return (
    <div className={embedded ? 'space-y-4' : 'p-4 space-y-4'} style={{ backgroundColor: LK.canvas, color: LK.inkSoft }}>
      {!embedded && (
        <PageHeader
          title="固件解包 · 配置"
          description="动态配置参数"
          actions={<button onClick={() => { loadConfig(); loadCluster(); loadLlmConfigFiles(); }} className="inline-flex items-center gap-1.5 rounded-lg border border-theme-border bg-theme-bg-app px-3 py-1.5 text-xs font-semibold text-theme-text-secondary hover:bg-theme-elevated transition-all"><RefreshCw size={12} />刷新</button>}
        />
      )}

 <section className={`${embedded ? 'rounded-xl border p-6 ' : 'rounded-2xl border p-4 '}`} style={{ backgroundColor: embedded ? LK.surfaceGlass : LK.surface, border: `1px solid ${LK.border}` }}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Settings size={18} style={{ color: LK.error }} />
              <h2 className="text-xl font-semibold" style={{ color: LK.ink }}>{embedded ? '固件解包参数配置' : '动态配置参数'}</h2>
              <span className="rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.12em]" style={{ backgroundColor: LK.primaryMuted, border: `1px solid ${LK.primary}`, color: LK.primary }}>
                chimera-app-firmware-unpacker
              </span>
            </div>
            <p className="mt-2 text-sm" style={{ color: LK.body }}>
              当前面板配置项归属于`chimera-app-firmware-unpacker` 微服务，用于控制固件解包服务的全局集群并发和运行时参数，保存后对所有项目生效。
            </p>
          </div>
          <button onClick={() => { loadConfig(); loadCluster(); loadLlmConfigFiles(); }} disabled={configLoading || clusterLoading || llmLoading}
 className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50"
            style={{
              backgroundColor: LK.surface,
              border: `1px solid ${LK.border}`,
              color: LK.body,
            }}
            onMouseEnter={(e) => { if (!(configLoading || clusterLoading || llmLoading)) e.currentTarget.style.backgroundColor = LK.surfaceRaised; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.surface; }}
          >
            {configLoading || clusterLoading || llmLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} 刷新
          </button>
        </div>

        {configError && (
          <div className="mb-4 rounded-xl border px-4 py-3 text-sm font-semibold flex items-center gap-2" style={{ backgroundColor: `${LK.error}10`, border: `1px solid ${LK.error}40`, color: LK.error }}>
            <AlertCircle size={13} /> {configError}
          </div>
        )}
        {clusterError && (
          <div className="mb-4 rounded-xl border px-4 py-3 text-sm font-semibold flex items-center gap-2" style={{ backgroundColor: `${LK.error}10`, border: `1px solid ${LK.error}40`, color: LK.error }}>
            <AlertCircle size={13} /> {clusterError}
          </div>
        )}
        {llmError && (
          <div className="mb-4 rounded-xl border px-4 py-3 text-sm font-semibold flex items-center gap-2" style={{ backgroundColor: `${LK.error}10`, border: `1px solid ${LK.error}40`, color: LK.error }}>
            <AlertCircle size={13} /> {llmError}
          </div>
        )}
        {configMessage && (
          <div className="mb-4 rounded-xl border px-4 py-3 text-sm font-semibold" style={{ backgroundColor: `${LK.success}10`, border: `1px solid ${LK.success}40`, color: LK.success }}>
            {configMessage}
          </div>
        )}

        <div className="mb-5 rounded-xl border px-4 py-3 text-sm" style={{ backgroundColor: `${LK.warning}10`, border: `1px solid ${LK.warning}40`, color: LK.warning }}>
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

        <SectionCard
          title="Pod Concurrency"
          subtitle="按实例资源预算控制固件解包在多 Pod 下的并发上限。"
          actions={<PanelActions saving={savingPanel === 'pod-concurrency'} disabled={!hasPanelChanges(podConcurrencyPanelKeys)} onSave={() => { void saveConfigPanel('pod-concurrency', 'Pod 并发配置', podConcurrencyPanelKeys); }} onReset={() => resetConfigPanel('Pod 并发配置', podConcurrencyPanelKeys)} />}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold" style={{ color: LK.ink }}>
                {concurrencyMode === 'manual' ? '手动模式' : '自动模式'}
                {' · '}
                当前生效上限 {cluster?.concurrency.effective_max_concurrent ?? '-'}
              </p>
            </div>
            {clusterLoading && <Loader2 size={16} className="animate-spin" style={{ color: LK.error }} />}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { void handleModeChange('auto'); }}
              className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition"
              style={
                !isManualMode
                  ? { backgroundColor: LK.primary, border: `1px solid ${LK.primary}`, color: '#ffffff' }
                  : { backgroundColor: LK.surface, border: `1px solid ${LK.border}`, color: LK.body }
              }
              onMouseEnter={(e) => { if (isManualMode) e.currentTarget.style.backgroundColor = LK.surfaceRaised; }}
              onMouseLeave={(e) => { if (isManualMode) e.currentTarget.style.backgroundColor = LK.surface; }}
            >
              自动模式
            </button>
            <button
              type="button"
              onClick={() => { void handleModeChange('manual'); }}
              className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition"
              style={
                isManualMode
                  ? { backgroundColor: LK.primary, border: `1px solid ${LK.primary}`, color: '#ffffff' }
                  : { backgroundColor: LK.surface, border: `1px solid ${LK.border}`, color: LK.body }
              }
              onMouseEnter={(e) => { if (!isManualMode) e.currentTarget.style.backgroundColor = LK.surfaceRaised; }}
              onMouseLeave={(e) => { if (!isManualMode) e.currentTarget.style.backgroundColor = LK.surface; }}
            >
              手动模式
            </button>
            <span className="inline-flex items-center rounded-lg border px-3 py-1.5 text-[11px]" style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}`, color: LK.muted }}>
              自动模式下并发参数只读；切换到手动模式后可编辑
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-xl px-3 py-2" style={{ backgroundColor: LK.surfaceRaised }}>
              <p style={{ color: LK.muted }}>在线实例</p>
              <p className="mt-1 font-semibold" style={{ color: LK.ink }}>{cluster?.alive_workers ?? '-'}</p>
            </div>
            <div className="rounded-xl px-3 py-2" style={{ backgroundColor: LK.surfaceRaised }}>
              <p style={{ color: LK.muted }}>运行中任务</p>
              <p className="mt-1 font-semibold" style={{ color: LK.ink }}>{cluster?.task_counts?.running ?? 0}</p>
            </div>
            <div className="rounded-xl px-3 py-2" style={{ backgroundColor: LK.surfaceRaised }}>
              <p style={{ color: LK.muted }}>CPU 限制</p>
              <p className="mt-1 font-semibold" style={{ color: LK.ink }}>{cluster?.concurrency.pod_cpu_limit_millicores ?? '-'}m</p>
            </div>
            <div className="rounded-xl px-3 py-2" style={{ backgroundColor: LK.surfaceRaised }}>
              <p style={{ color: LK.muted }}>内存限制</p>
              <p className="mt-1 font-semibold" style={{ color: LK.ink }}>{cluster?.concurrency.pod_memory_limit_mib ?? '-'}Mi</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-xl bg-theme-surface px-3 py-2">
              <p className="font-semibold text-theme-text-secondary">自动计算依据</p>
              <p className="mt-1 text-theme-text-muted">
                Pod 总资源上限：CPU {cluster?.concurrency.pod_cpu_limit_millicores ?? '-'}m / 内存 {cluster?.concurrency.pod_memory_limit_mib ?? '-'}Mi
              </p>
              <p className="mt-1 text-theme-text-muted">
                系统按单任务预算估算：CPU {cluster?.concurrency.cpu_millis_per_task ?? '-'}m / 内存 {cluster?.concurrency.memory_mb_per_task ?? '-'}Mi
              </p>
            </div>
            <div className="rounded-xl bg-theme-surface px-3 py-2">
              <p className="font-semibold text-theme-text-secondary">自动计算结果</p>
              <p className="mt-1 text-theme-text-muted">
                CPU 档位 {cluster?.concurrency.cpu_based_limit ?? '-'}，内存档位 {cluster?.concurrency.memory_based_limit ?? '-'}
              </p>
              <p className="mt-1 text-theme-text-muted">
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
        </SectionCard>

        <SectionCard
          title="LLM Role Binding"
          subtitle="按角色绑定配置文件、模型和轮次间复用策略。"
          actions={<PanelActions saving={savingPanel === 'llm-role-binding'} disabled={!hasPanelChanges(llmPanelKeys) || missingLlmRoles.length > 0} onSave={() => { void saveConfigPanel('llm-role-binding', 'LLM 角色绑定', llmPanelKeys, true); }} onReset={() => resetConfigPanel('LLM 角色绑定', llmPanelKeys)} />}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-theme-text-primary">按角色绑定配置文件与模型</p>
            </div>
            {llmLoading && <Loader2 size={16} className="animate-spin text-rose-400" />}
          </div>
          <p className="mt-3 text-xs text-theme-text-muted">
            每个角色都需要显式绑定一个`models.json` 配置文件，并指定要使用的`provider/model`。保存后只影响后续新建任务，任务创建时会冻结这五个角色的绑定快照。
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            {llmRoleConfigs.map((item) => (
              <div key={item.key} className="rounded-2xl p-4" style={{ backgroundColor: LK.surfaceRaised }}>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-sm font-semibold" style={{ color: LK.ink }}>{item.label}</span>
                  {item.entry && resolveDraftValue(item.entry) !== item.entry.value && (
                    <span className="text-[10px] font-semibold" style={{ color: LK.warning }}>未保存</span>
                  )}
                </div>
                <p className="mb-3 text-[11px]" style={{ color: LK.muted }}>{item.description}</p>
                <select
                  value={item.value}
                  disabled={configLoading || configSaving || llmLoading}
                  onChange={(event) => updateDraftValue(item.key, event.target.value)}
                  className="w-full rounded-xl border px-3 py-2 text-sm outline-none transition disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: LK.surface,
                    border: `1px solid ${LK.border}`,
                    color: LK.ink,
                  }}
                >
                  <option value="">请选择配置文件</option>
                  {llmConfigFiles.map((configFile) => (
                    <option key={configFile.config_file_key} value={configFile.config_file_key}>
                      {`${configFile.display_name || configFile.config_file_key} · ${configFile.provider_type} · ${configFile.default_model || '-'}`}
                    </option>
                  ))}
                </select>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px]" style={{ color: LK.muted }}>
                  {item.value ? (
                    <>
                      <span className="rounded-full px-2 py-1" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.borderSoft}`, color: LK.body }}>config_file_key: {item.value}</span>
                      {item.configFile?.is_default && (
                        <span className="rounded-full px-2 py-1" style={{ backgroundColor: `${LK.error}10`, border: `1px solid ${LK.error}40`, color: LK.error }}>配置中心默认</span>
                      )}
                    </>
                  ) : (
                    <span className="rounded-full px-2 py-1" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.error}40`, color: LK.error }}>未配置，保存前必须选择</span>
                  )}
                </div>
                <div className="mt-3">
                  <label className="mb-1 block text-[11px] font-semibold" style={{ color: LK.muted }}>Provider / Model</label>
                  <input
                    value={item.modelValue}
                    disabled={configLoading || configSaving}
                    onChange={(event) => updateDraftValue(item.modelKey, event.target.value)}
                    placeholder="例如 openai/gpt-4o，留空则使用配置文件默认"
                    className="w-full rounded-xl border px-3 py-2 text-sm outline-none transition disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: LK.surface,
                      border: `1px solid ${LK.border}`,
                      color: LK.ink,
                    }}
                  />
                  <p className="mt-1 text-[11px]" style={{ color: LK.muted }}>
                    建议填写`provider/model`。如果该配置文件只包含单一 provider，也可以只填模型名；留空则继承配置文件默认值。
                  </p>
                  {item.configFile && item.configFile.model_options.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.configFile.model_options.slice(0, 6).map((option) => (
                        <button
                          key={`${item.key}-${option.value}`}
                          type="button"
                          onClick={() => updateDraftValue(item.modelKey, option.value)}
                          className="rounded-full border px-2 py-1 text-[11px] transition"
                          style={{
                            backgroundColor: LK.surface,
                            border: `1px solid ${LK.border}`,
                            color: LK.body,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = LK.error;
                            e.currentTarget.style.color = LK.error;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = LK.border;
                            e.currentTarget.style.color = LK.body;
                          }}
                        >
                          {option.value}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {item.reuseEntry && (
                  <div className="mt-4 rounded-2xl border p-4" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: LK.error }}>Session Reuse</p>
                        <p className="mt-1 text-sm font-semibold" style={{ color: LK.ink }}>轮次间智能体复用策略</p>
                      </div>
                      {item.reuseValue === 'true' ? (
                        <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ backgroundColor: `${LK.success}10`, border: `1px solid ${LK.success}40`, color: LK.success }}>复用</span>
                      ) : (
                        <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.borderSoft}`, color: LK.muted }}>每轮新建</span>
                      )}
                    </div>
                    <p className="mt-2 text-[11px]" style={{ color: LK.muted }}>
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
                            className="rounded-xl border px-3 py-2.5 text-left transition"
                            style={
                              active
                                ? { backgroundColor: LK.primary, border: `1px solid ${LK.primary}`, color: '#ffffff' }
                                : { backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}`, color: LK.body }
                            }
                            onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = LK.surface; }}
                            onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = LK.surfaceRaised; }}
                          >
                            <div className="text-sm font-semibold">{option.label}</div>
                            <div className="mt-1 text-[11px]" style={{ color: active ? 'rgba(255,255,255,0.7)' : LK.muted }}>{option.description}</div>
                          </button>
                        );
                      })}
                    </div>
                    {item.reuseValue !== String(item.reuseEntry.value ?? 'true').toLowerCase() && (
                      <p className="mt-2 text-[10px] font-semibold" style={{ color: LK.warning }}>未保存</p>
                    )}
                    <p className="mt-2 text-[10px]" style={{ color: LK.muted }}>更新于 {fmtTime(item.reuseEntry.updated_at)}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </SectionCard>

        {(maxRetriesEntry || maxRetriesActionEntry) && (
          <SectionCard
            title="Retry Policy"
            subtitle="最大重试次数与超限默认动作。"
            actions={<PanelActions saving={savingPanel === 'retry-policy'} disabled={!hasPanelChanges(retryPanelKeys)} onSave={() => { void saveConfigPanel('retry-policy', '重试策略', retryPanelKeys); }} onReset={() => resetConfigPanel('重试策略', retryPanelKeys)} />}
          >
            <p className="mt-3 text-xs" style={{ color: LK.muted }}>
              控制通用 LLM 解包链路的最大轮次，以及当结果落为`max_retries_reached` 时，默认按通过还是失败收敛。
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
                <div className="rounded-2xl p-5" style={{ backgroundColor: LK.surface }}>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-semibold" style={{ fontFamily: MONO, color: LK.ink }}>{maxRetriesActionEntry.key}</span>
                    <span className="text-[10px] rounded-full px-1.5 py-0.5" style={{ backgroundColor: LK.surfaceRaised, color: LK.muted }}>{maxRetriesActionEntry.value_type}</span>
                    {maxRetriesActionValue !== maxRetriesActionEntry.value && <span className="text-[10px] font-semibold" style={{ color: LK.warning }}>未保存</span>}
                  </div>
                  {maxRetriesActionEntry.description && (
                    <p className="mb-3 text-[11px]" style={{ color: LK.muted }}>{maxRetriesActionEntry.description}</p>
                  )}
                  <div className="space-y-2">
                    {MAX_RETRIES_ACTION_OPTIONS.map((option) => {
                      const active = maxRetriesActionValue === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => updateDraftValue(maxRetriesActionEntry.key, option.value)}
                          className="flex w-full items-start justify-between rounded-xl border px-4 py-3 text-left transition"
                          style={
                            active
                              ? { backgroundColor: LK.primary, border: `1px solid ${LK.primary}`, color: '#ffffff' }
                              : { backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}`, color: LK.body }
                          }
                          onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = LK.surface; }}
                          onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = LK.surfaceRaised; }}
                        >
                          <div>
                            <div className="text-sm font-semibold">{option.label}</div>
                            <div className="mt-1 text-[11px]" style={{ color: active ? 'rgba(255,255,255,0.7)' : LK.muted }}>{option.description}</div>
                          </div>
                          <span className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{ backgroundColor: active ? 'rgba(255,255,255,0.15)' : LK.surface, border: active ? 'none' :`1px solid ${LK.borderSoft}`, color: active ? '#ffffff' : LK.muted }}>
                            {option.value}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[10px]" style={{ color: LK.muted }}>
                    更新于 {fmtTime(maxRetriesActionEntry.updated_at)}
                  </p>
                </div>
              )}
            </div>
          </SectionCard>
        )}

        {piRpcClientPanelKeys.length > 0 && (
          <SectionCard
            title="PiRpcClient 运行策略"
            subtitle="控制 PiRpcClient 单次调用的空闲超时，以及空闲超时后的自动重试次数。"
            actions={<PanelActions saving={savingPanel === 'pirpc-runtime'} disabled={!hasPanelChanges(piRpcClientPanelKeys)} onSave={() => { void saveConfigPanel('pirpc-runtime', 'PiRpcClient 运行策略', piRpcClientPanelKeys); }} onReset={() => resetConfigPanel('PiRpcClient 运行策略', piRpcClientPanelKeys)} />}
          >
            <div className="rounded-2xl border px-4 py-3 text-xs" style={{ backgroundColor: `${LK.info}10`, border: `1px solid ${LK.info}40`, color: LK.info }}>
              PiRpcClient 默认空闲超时为 1800 秒，默认空闲超时自动重试 20 次。只要持续有消息、事件或工具调用输出，就不会因为总耗时长而被认定超时。
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
              {piRpcTimeoutEntry && (
                <div className="rounded-2xl p-5" style={{ backgroundColor: LK.surface }}>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-semibold" style={{ fontFamily: MONO, color: LK.ink }}>{piRpcTimeoutEntry.key}</span>
                    <span className="text-[10px] rounded-full px-1.5 py-0.5" style={{ backgroundColor: LK.surfaceRaised, color: LK.muted }}>{piRpcTimeoutEntry.value_type}</span>
                    {piRpcTimeoutValue !== piRpcTimeoutEntry.value && <span className="text-[10px] font-semibold" style={{ color: LK.warning }}>未保存</span>}
                  </div>
                  <p className="mb-3 text-[11px]" style={{ color: LK.muted }}>
                    {piRpcTimeoutEntry.description || 'PiRpcClient 单次调用允许的最大空闲时长。'}
                  </p>
                  <label className="text-xs font-semibold" style={{ color: LK.body }} htmlFor="pirpc-timeout-seconds">
                    PiRpcClient 空闲超时（秒）
                  </label>
                  <input
                    id="pirpc-timeout-seconds"
                    type="number"
                    min={-1}
                    step={1}
                    value={piRpcTimeoutValue}
                    onChange={(e) => updateDraftValue(piRpcTimeoutEntry.key, e.target.value)}
                    className="mt-2 w-full rounded-lg border px-3 py-2 text-sm outline-none transition"
                    style={{
                      fontFamily: MONO,
                      backgroundColor: LK.surfaceRaised,
                      color: LK.ink,
                      border: piRpcTimeoutValue !== piRpcTimeoutEntry.value ?`1px solid ${LK.primary}` :`1px solid ${LK.border}`,
                    }}
                  />
                  <p className="mt-2 text-[10px]" style={{ color: LK.muted }}>
                    默认 1800 秒。只有在完全没有输出、没有事件、没有工具调用结果持续超过该时长时，才会判定超时。设置为`-1` 表示不限制。
                  </p>
                  <p className="mt-2 text-[10px]" style={{ color: LK.muted }}>更新于 {fmtTime(piRpcTimeoutEntry.updated_at)}</p>
                </div>
              )}
              {piRpcRetryEnabledEntry && (
                <div className="rounded-2xl p-5" style={{ backgroundColor: LK.surface }}>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-semibold" style={{ fontFamily: MONO, color: LK.ink }}>{piRpcRetryEnabledEntry.key}</span>
                    <span className="text-[10px] rounded-full px-1.5 py-0.5" style={{ backgroundColor: LK.surfaceRaised, color: LK.muted }}>{piRpcRetryEnabledEntry.value_type}</span>
                    {piRpcRetryEnabledValue !== String(piRpcRetryEnabledEntry.value ?? PI_RPCCLIENT_DEFAULTS.retryEnabled).toLowerCase() && <span className="text-[10px] font-semibold" style={{ color: LK.warning }}>未保存</span>}
                  </div>
                  <p className="mb-3 text-[11px]" style={{ color: LK.muted }}>
                    {piRpcRetryEnabledEntry.description || 'PiRpcClient 单次调用发生空闲超时后是否自动重试。'}
                  </p>
                  <div className="space-y-2">
                    {[
                      { value: 'true', label: '开启空闲超时自动重试', description: '发生空闲超时后继续按最大重试次数重试。' },
                      { value: 'false', label: '关闭空闲超时自动重试', description: '发生空闲超时后直接按失败处理本次调用。' },
                    ].map((option) => {
                      const active = piRpcRetryEnabledValue === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => updateDraftValue(piRpcRetryEnabledEntry.key, option.value)}
                          className="flex w-full items-start justify-between rounded-xl border px-4 py-3 text-left transition"
                          style={
                            active
                              ? { backgroundColor: LK.primary, border: `1px solid ${LK.primary}`, color: '#ffffff' }
                              : { backgroundColor: LK.surfaceRaised, border: `1px solid ${LK.border}`, color: LK.body }
                          }
                          onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = LK.surface; }}
                          onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = LK.surfaceRaised; }}
                        >
                          <div>
                            <div className="text-sm font-semibold">{option.label}</div>
                            <div className="mt-1 text-[11px]" style={{ color: active ? 'rgba(255,255,255,0.7)' : LK.muted }}>{option.description}</div>
                          </div>
                          <span className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{ backgroundColor: active ? 'rgba(255,255,255,0.15)' : LK.surface, border: active ? 'none' :`1px solid ${LK.borderSoft}`, color: active ? '#ffffff' : LK.muted }}>
                            {option.value}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[10px]" style={{ color: LK.muted }}>更新于 {fmtTime(piRpcRetryEnabledEntry.updated_at)}</p>
                </div>
              )}
              {piRpcMaxRetriesEntry && (
                <div className="rounded-2xl p-5 xl:col-span-2" style={{ backgroundColor: LK.surface }}>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-semibold" style={{ fontFamily: MONO, color: LK.ink }}>{piRpcMaxRetriesEntry.key}</span>
                    <span className="text-[10px] rounded-full px-1.5 py-0.5" style={{ backgroundColor: LK.surfaceRaised, color: LK.muted }}>{piRpcMaxRetriesEntry.value_type}</span>
                    {piRpcMaxRetriesValue !== piRpcMaxRetriesEntry.value && <span className="text-[10px] font-semibold" style={{ color: LK.warning }}>未保存</span>}
                  </div>
                  <p className="mb-3 text-[11px]" style={{ color: LK.muted }}>
                    {piRpcMaxRetriesEntry.description || 'PiRpcClient 空闲超时后的最大自动重试次数。'}
                  </p>
                  <label className="text-xs font-semibold" style={{ color: LK.body }} htmlFor="pirpc-timeout-max-retries">
                    PiRpcClient 空闲超时重试次数
                  </label>
                  <input
                    id="pirpc-timeout-max-retries"
                    type="number"
                    min={-1}
                    step={1}
                    value={piRpcMaxRetriesValue}
                    onChange={(e) => updateDraftValue(piRpcMaxRetriesEntry.key, e.target.value)}
                    className={`mt-2 w-full rounded-lg border px-3 py-2 text-sm font-mono outline-none transition ${
                      piRpcMaxRetriesValue !== piRpcMaxRetriesEntry.value ? 'border-blue-300 ring-1 ring-blue-100' : 'border-theme-border'
                    }`}
                  />
                  <p className="mt-2 text-[10px] text-theme-text-muted">
                    默认无限重试。发生 API/超时类可恢复错误时会持续自动重试；进入 30 秒退避档后，每 10 次重试会记录一次任务时间线。
                  </p>
                  <p className="mt-2 text-[10px] text-theme-text-muted">更新于 {fmtTime(piRpcMaxRetriesEntry.updated_at)}</p>
                </div>
              )}
            </div>
          </SectionCard>
        )}

        {configLoading && configItems.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-theme-text-muted">
            <Loader2 size={18} className="animate-spin mr-2" /> 加载配置中...
          </div>
        ) : genericConfigItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-theme-border bg-theme-surface py-6 text-center text-xs text-theme-text-muted">
            暂无配置项
          </div>
        ) : (
          <SectionCard
            title="其它运行参数"
            subtitle="保留未归入并发、角色绑定或重试策略的其它动态参数。"
            actions={<PanelActions saving={savingPanel === 'generic-config'} disabled={!hasPanelChanges(genericPanelKeys)} onSave={() => { void saveConfigPanel('generic-config', '其它运行参数', genericPanelKeys); }} onReset={() => resetConfigPanel('其它运行参数', genericPanelKeys)} />}
          >
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
          </SectionCard>
        )}
      </section>
    </div>
  );
};
