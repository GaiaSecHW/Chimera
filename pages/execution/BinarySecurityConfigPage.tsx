import React, { useEffect, useState } from 'react';
import { Loader2, RefreshCw, Save, Settings } from 'lucide-react';

import { api } from '../../clients/api';
import { FirmwareUnpackConfigPage } from './FirmwareUnpackConfigPage';
import { SystemAnalysisConfigPage } from './SystemAnalysisConfigPage';
import { EntryAnalysisConfigPage } from './EntryAnalysisConfigPage';
import { DataflowVulnScanConfigPage } from './DataflowVulnScanConfigPage';
import { B2SConfigPage } from './B2SConfigPage';
import { VulnVerifyConfigPage } from './VulnVerifyConfigPage';
import { PageSection, FormActionBar, PageHeader } from '../../design-system';

const LK = {
  primary: 'var(--brand-primary)', primarySoft: '#7590ff', primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'var(--brand-primary-mask)',
  canvas: 'var(--bg-app)', surface: 'var(--bg-surface)', surfaceRaised: 'var(--bg-app)',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: 'var(--border-default)', borderSoft: 'var(--border-default)',
  ink: 'var(--text-primary)', inkSoft: 'var(--text-secondary)', body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)', mutedSoft: '#8b95a8',
  success: '#45c06f', warning: '#d5a13a', error: '#f15d5d', info: '#4f8cff',
  critical: '#ff4d4f', high: '#ff8b3d', medium: '#f0b64c', low: '#49c5ff',
} as const;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

type ConfigTab = 'binary-security' | 'binary-evolution' | 'firmware-unpacker' | 'system-analysis' | 'binary-to-source' | 'entry-analysis' | 'dataflow-vuln' | 'vuln-verify';
const ORCHESTRATOR_STAGE_FIELDS = [
  { key: 'firmware_unpack', label: '固件解包' },
  { key: 'system_analysis', label: '系统分析' },
  { key: 'binary_to_source', label: '二进制逆向' },
  { key: 'entry_analysis', label: '入口分析' },
  { key: 'dataflow_vuln_scan', label: '数据流漏洞挖掘' },
] as const;
const PARTIAL_SUCCESS_ADVANCEMENT_FIELDS = [
  { key: 'binary_to_source', label: '二进制逆向部分成功后继续推进' },
  { key: 'entry_analysis', label: '入口分析部分成功后继续推进' },
  { key: 'dataflow_vuln_scan', label: '数据流漏洞挖掘部分成功后继续推进' },
] as const;
const DEFAULT_PARTIAL_SUCCESS_STAGE_ADVANCEMENT = Object.fromEntries(
  PARTIAL_SUCCESS_ADVANCEMENT_FIELDS.map((field) => [field.key, false]),
) as Record<string, boolean>;

const DEFAULT_BINARY_SECURITY_GLOBAL_CONFIG = {
  worker_task_concurrency: 40,
  max_concurrent_tasks: 40,
  dispatch_timeout_seconds: 60,
  max_stage_parallelism: 4,
  max_retries_per_item: 2,
  continue_on_item_failure: true,
  pipeline_mode: 'barrier' as const,
  partial_success_stage_advancement: DEFAULT_PARTIAL_SUCCESS_STAGE_ADVANCEMENT,
  stage_parallelism: {} as Record<string, number>,
  stage_options: {} as Record<string, { enabled: boolean }>,
};
const PIPELINE_MODE_OPTIONS = [
  { value: 'barrier', label: '广度优先（Barrier）', description: '阶段栅栏模式，上一阶段聚合完成后再推进下一阶段。' },
  { value: 'mixed_streaming', label: '深度优化（Mixed Streaming）', description: '入口完成后可直接推进数据流分析和漏洞挖掘。' },
] as const;

const DEFAULT_BINARY_EVOLUTION_CONFIG = {
  max_concurrent_tasks: 2,
  max_concurrent_source_tasks: 4,
  default_min_rounds: 1,
  default_max_rounds: 3,
  evolution_agent_model: 'pi-agent',
  evolution_agent_timeout_seconds: 1800,
  evolution_agent_context_window: 131072,
};

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};

const normalizePartialSuccessStageAdvancement = (value: unknown) => {
  const config = asRecord(value);
  const normalized = { ...DEFAULT_PARTIAL_SUCCESS_STAGE_ADVANCEMENT };
  if (config.dataflow_vuln_scan !== undefined) {
    normalized.dataflow_vuln_scan = config.dataflow_vuln_scan !== false;
  } else if (config.dataflow_analysis !== undefined) {
    normalized.dataflow_vuln_scan = config.dataflow_analysis !== false;
  } else if (config.vuln_scan !== undefined) {
    normalized.dataflow_vuln_scan = config.vuln_scan !== false;
  }
  for (const field of PARTIAL_SUCCESS_ADVANCEMENT_FIELDS) {
    if (config[field.key] !== undefined) {
      normalized[field.key] = config[field.key] !== false;
    }
  }
  return normalized;
};

const pickConfigRecord = (value: unknown): Record<string, any> => {
  const root = asRecord(value);
  const nestedConfig = asRecord(root.config);
  return Object.keys(nestedConfig).length > 0 ? nestedConfig : root;
};

const normalizeBinarySecurityServiceConfig = (value: unknown) => {
  const config = pickConfigRecord(value);
  return {
    ...DEFAULT_BINARY_SECURITY_GLOBAL_CONFIG,
    ...config,
  };
};

const normalizeBinarySecurityProjectConfig = (value: unknown) => {
  const config = pickConfigRecord(value);
  return {
    ...DEFAULT_BINARY_SECURITY_GLOBAL_CONFIG,
    ...config,
    partial_success_stage_advancement: normalizePartialSuccessStageAdvancement(config.partial_success_stage_advancement),
    stage_parallelism: asRecord(config.stage_parallelism),
    stage_options: asRecord(config.stage_options),
  };
};

const normalizeBinaryEvolutionConfig = (value: unknown) => {
  const config = pickConfigRecord(value);
  return {
    ...DEFAULT_BINARY_EVOLUTION_CONFIG,
    ...config,
  };
};

const SectionCard: React.FC<{ title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }> = ({ title, subtitle, actions, children }) => (
  <PageSection title={title} description={subtitle} actions={actions}>{children}</PageSection>
);

const PanelActions: React.FC<{ saving: boolean; onSave: () => void; onReset: () => void }> = ({ saving, onSave, onReset }) => (
  <FormActionBar saving={saving} onSave={onSave} onReset={onReset} saveText="保存配置" resetText="重置为默认" />
);

export const BinarySecurityConfigPage: React.FC<{ projectId: string; initialTab?: ConfigTab }> = ({ projectId, initialTab = 'binary-security' }) => {
  const executionApi = api.domains.execution;
  const [activeTab, setActiveTab] = useState<ConfigTab>(initialTab);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPanel, setSavingPanel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [workerTaskConcurrency, setWorkerTaskConcurrency] = useState(40);
  const [maxConcurrentTasks, setMaxConcurrentTasks] = useState(40);
  const [dispatchTimeoutSeconds, setDispatchTimeoutSeconds] = useState(60);
  const [maxRetriesPerItem, setMaxRetriesPerItem] = useState(2);
  const [continueOnItemFailure, setContinueOnItemFailure] = useState(true);
  const [pipelineMode, setPipelineMode] = useState<'barrier' | 'mixed_streaming'>('barrier');
  const [partialSuccessStageAdvancement, setPartialSuccessStageAdvancement] = useState<Record<string, boolean>>(
    DEFAULT_PARTIAL_SUCCESS_STAGE_ADVANCEMENT,
  );
  const [stageParallelism, setStageParallelism] = useState<Record<string, number>>(
    Object.fromEntries(ORCHESTRATOR_STAGE_FIELDS.map((field) => [field.key, 4])),
  );
  const [evolutionMaxConcurrentTasks, setEvolutionMaxConcurrentTasks] = useState(2);
  const [evolutionMaxConcurrentSourceTasks, setEvolutionMaxConcurrentSourceTasks] = useState(4);
  const [evolutionMinRounds, setEvolutionMinRounds] = useState(1);
  const [evolutionMaxRounds, setEvolutionMaxRounds] = useState(3);
  const [evolutionAgentModel, setEvolutionAgentModel] = useState('pi-agent');
  const [evolutionAgentTimeoutSeconds, setEvolutionAgentTimeoutSeconds] = useState(1800);
  const [evolutionContextWindow, setEvolutionContextWindow] = useState(131072);
  const [savedEvolutionConfig, setSavedEvolutionConfig] = useState(DEFAULT_BINARY_EVOLUTION_CONFIG);

  const load = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const [configDataRaw] = await Promise.all([
        executionApi.binarySecurity.getConfig(),
      ]);
      const mergedConfig = normalizeBinarySecurityProjectConfig(configDataRaw);
      let evolutionConfig = DEFAULT_BINARY_EVOLUTION_CONFIG;
      try {
        const evolutionConfigRaw = await executionApi.binaryEvolution.getConfig();
        evolutionConfig = normalizeBinaryEvolutionConfig(evolutionConfigRaw);
      } catch (e: any) {
        console.warn('binary evolution config is unavailable, using defaults', e);
        if (activeTab === 'binary-evolution') {
          setError(e?.message || '加载进化中心配置失败');
        }
      }
      setSavedEvolutionConfig(evolutionConfig);
      setWorkerTaskConcurrency(mergedConfig.worker_task_concurrency);
      setMaxConcurrentTasks(mergedConfig.max_concurrent_tasks);
      setDispatchTimeoutSeconds(mergedConfig.dispatch_timeout_seconds);
      setMaxRetriesPerItem(mergedConfig.max_retries_per_item);
      setContinueOnItemFailure(mergedConfig.continue_on_item_failure);
      setPipelineMode((String(mergedConfig.pipeline_mode) === 'mixed_streaming' ? 'mixed_streaming' : 'barrier') as 'barrier' | 'mixed_streaming');
      setPartialSuccessStageAdvancement({
        ...DEFAULT_PARTIAL_SUCCESS_STAGE_ADVANCEMENT,
        ...(mergedConfig.partial_success_stage_advancement || {}),
      });
      setStageParallelism({
        ...Object.fromEntries(ORCHESTRATOR_STAGE_FIELDS.map((field) => [field.key, 4])),
        ...(mergedConfig.stage_parallelism || {}),
      });
      setEvolutionMaxConcurrentTasks(evolutionConfig.max_concurrent_tasks);
      setEvolutionMaxConcurrentSourceTasks(evolutionConfig.max_concurrent_source_tasks);
      setEvolutionMinRounds(evolutionConfig.default_min_rounds);
      setEvolutionMaxRounds(evolutionConfig.default_max_rounds);
      setEvolutionAgentModel(evolutionConfig.evolution_agent_model);
      setEvolutionAgentTimeoutSeconds(evolutionConfig.evolution_agent_timeout_seconds);
      setEvolutionContextWindow(evolutionConfig.evolution_agent_context_window);
    } catch (e: any) {
      setError(e?.message || '加载配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [projectId]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const syncServiceDraft = (serviceConfig: Record<string, any>) => {
    setWorkerTaskConcurrency(serviceConfig.worker_task_concurrency);
    setMaxConcurrentTasks(serviceConfig.max_concurrent_tasks);
    setDispatchTimeoutSeconds(serviceConfig.dispatch_timeout_seconds);
  };

  const syncProjectDraft = (projectConfig: Record<string, any>) => {
    setMaxRetriesPerItem(projectConfig.max_retries_per_item);
    setContinueOnItemFailure(projectConfig.continue_on_item_failure);
    setPipelineMode(projectConfig.pipeline_mode === 'mixed_streaming' ? 'mixed_streaming' : 'barrier');
    setPartialSuccessStageAdvancement({
      ...DEFAULT_PARTIAL_SUCCESS_STAGE_ADVANCEMENT,
      ...(projectConfig.partial_success_stage_advancement || {}),
    });
    setStageParallelism({
      ...Object.fromEntries(ORCHESTRATOR_STAGE_FIELDS.map((field) => [field.key, 4])),
      ...(projectConfig.stage_parallelism || {}),
    });
  };

  const saveBinarySecurityQueue = async () => {
    setSavingPanel('binary-security-queue');
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const serviceData = await executionApi.binarySecurity.updateConfig({
        worker_task_concurrency: Math.max(1, Math.min(200, Number(workerTaskConcurrency) || 40)),
        max_concurrent_tasks: Math.max(1, Math.min(200, Number(maxConcurrentTasks) || 40)),
        dispatch_timeout_seconds: Math.max(10, Math.min(600, Number(dispatchTimeoutSeconds) || 60)),
        max_stage_parallelism: Math.max(...Object.values(stageParallelism)),
        max_retries_per_item: Math.max(0, Math.min(20, Number(maxRetriesPerItem) || 0)),
        continue_on_item_failure: continueOnItemFailure,
        pipeline_mode: pipelineMode,
        partial_success_stage_advancement: Object.fromEntries(
          PARTIAL_SUCCESS_ADVANCEMENT_FIELDS.map((field) => [
            field.key,
            partialSuccessStageAdvancement[field.key] !== false,
          ]),
        ),
        stage_parallelism: Object.fromEntries(
          ORCHESTRATOR_STAGE_FIELDS.map((field) => [
            field.key,
            Math.max(1, Math.min(32, Number(stageParallelism[field.key]) || 4)),
          ]),
        ),
        stage_options: Object.fromEntries(ORCHESTRATOR_STAGE_FIELDS.map((field) => [field.key, { enabled: true }])),
      });
      const normalizedServiceData = normalizeBinarySecurityServiceConfig(serviceData);
      syncServiceDraft(normalizedServiceData);
      syncProjectDraft(normalizedServiceData);
      setMessage('队列控制配置已保存，实时生效；调小不会主动缩容，只影响后续新任务领取。');
    } catch (e: any) {
      setError(e?.message || '保存失败');
    } finally {
      setSaving(false);
      setSavingPanel(null);
    }
  };

  const saveBinarySecurityPolicy = async () => {
    setSavingPanel('binary-security-policy');
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const normalizedStageParallelism = Object.fromEntries(
        ORCHESTRATOR_STAGE_FIELDS.map((field) => [
          field.key,
          Math.max(1, Math.min(32, Number(stageParallelism[field.key]) || 4)),
        ]),
      );
      const projectData = await executionApi.binarySecurity.updateConfig({
        worker_task_concurrency: Math.max(1, Math.min(200, Number(workerTaskConcurrency) || 40)),
        max_concurrent_tasks: Math.max(1, Math.min(200, Number(maxConcurrentTasks) || 40)),
        dispatch_timeout_seconds: Math.max(10, Math.min(600, Number(dispatchTimeoutSeconds) || 60)),
        max_stage_parallelism: Math.max(...Object.values(normalizedStageParallelism)),
        max_retries_per_item: Math.max(0, Math.min(20, Number(maxRetriesPerItem) || 0)),
        continue_on_item_failure: continueOnItemFailure,
        pipeline_mode: pipelineMode,
        partial_success_stage_advancement: Object.fromEntries(
          PARTIAL_SUCCESS_ADVANCEMENT_FIELDS.map((field) => [
            field.key,
            partialSuccessStageAdvancement[field.key] !== false,
          ]),
        ),
        stage_parallelism: normalizedStageParallelism,
        stage_options: Object.fromEntries(ORCHESTRATOR_STAGE_FIELDS.map((field) => [field.key, { enabled: true }])),
      });
      const normalizedProjectData = normalizeBinarySecurityProjectConfig(projectData);
      syncProjectDraft({
        ...DEFAULT_BINARY_SECURITY_GLOBAL_CONFIG,
        ...normalizedProjectData,
        stage_parallelism: {
          ...Object.fromEntries(ORCHESTRATOR_STAGE_FIELDS.map((field) => [field.key, 4])),
          ...(normalizedProjectData.stage_parallelism || {}),
        },
      });
      syncServiceDraft(normalizedProjectData);
      setMessage('全局任务策略已保存');
    } catch (e: any) {
      setError(e?.message || '保存失败');
    } finally {
      setSaving(false);
      setSavingPanel(null);
    }
  };

  const resetBinarySecurityQueue = () => {
    syncServiceDraft(DEFAULT_BINARY_SECURITY_GLOBAL_CONFIG);
    setError(null);
    setMessage('队列控制已重置为默认值（尚未保存）');
  };

  const resetBinarySecurityPolicy = () => {
    syncProjectDraft({
      ...DEFAULT_BINARY_SECURITY_GLOBAL_CONFIG,
      stage_parallelism: Object.fromEntries(ORCHESTRATOR_STAGE_FIELDS.map((field) => [field.key, 4])),
    });
    setError(null);
    setMessage('任务创建默认策略已重置为默认值（尚未保存）');
  };

  const saveEvolutionConcurrency = async () => {
    setSavingPanel('evolution-concurrency');
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payloadRaw = await executionApi.binaryEvolution.updateConfig({
        ...savedEvolutionConfig,
        max_concurrent_tasks: Math.max(1, Math.min(64, Number(evolutionMaxConcurrentTasks) || 1)),
        max_concurrent_source_tasks: Math.max(1, Math.min(64, Number(evolutionMaxConcurrentSourceTasks) || 1)),
        evolution_agent_timeout_seconds: Math.max(1, Math.min(86400, Number(evolutionAgentTimeoutSeconds) || 1)),
      });
      const payload = normalizeBinaryEvolutionConfig(payloadRaw);
      setSavedEvolutionConfig(payload);
      setEvolutionMaxConcurrentTasks(payload.max_concurrent_tasks);
      setEvolutionMaxConcurrentSourceTasks(payload.max_concurrent_source_tasks);
      setEvolutionAgentTimeoutSeconds(payload.evolution_agent_timeout_seconds);
      setEvolutionMinRounds(payload.default_min_rounds);
      setEvolutionMaxRounds(payload.default_max_rounds);
      setEvolutionAgentModel(payload.evolution_agent_model);
      setEvolutionContextWindow(payload.evolution_agent_context_window);
      setMessage('进化中心并发配置已保存');
    } catch (e: any) {
      setError(e?.message || '保存失败');
    } finally {
      setSaving(false);
      setSavingPanel(null);
    }
  };

  const saveEvolutionRounds = async () => {
    setSavingPanel('evolution-rounds');
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payloadRaw = await executionApi.binaryEvolution.updateConfig({
        ...savedEvolutionConfig,
        default_min_rounds: Math.max(1, Math.min(100, Number(evolutionMinRounds) || 1)),
        default_max_rounds: Math.max(1, Math.min(100, Number(evolutionMaxRounds) || 1)),
        evolution_agent_context_window: Math.max(1024, Math.min(10485760, Number(evolutionContextWindow) || 1024)),
      });
      const payload = normalizeBinaryEvolutionConfig(payloadRaw);
      setSavedEvolutionConfig(payload);
      setEvolutionMaxConcurrentTasks(payload.max_concurrent_tasks);
      setEvolutionMaxConcurrentSourceTasks(payload.max_concurrent_source_tasks);
      setEvolutionAgentTimeoutSeconds(payload.evolution_agent_timeout_seconds);
      setEvolutionMinRounds(payload.default_min_rounds);
      setEvolutionMaxRounds(payload.default_max_rounds);
      setEvolutionAgentModel(payload.evolution_agent_model);
      setEvolutionContextWindow(payload.evolution_agent_context_window);
      setMessage('进化中心轮次配置已保存');
    } catch (e: any) {
      setError(e?.message || '保存失败');
    } finally {
      setSaving(false);
      setSavingPanel(null);
    }
  };

  const saveEvolutionModel = async () => {
    setSavingPanel('evolution-model');
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payloadRaw = await executionApi.binaryEvolution.updateConfig({
        ...savedEvolutionConfig,
        evolution_agent_model: evolutionAgentModel.trim() || 'pi-agent',
      });
      const payload = normalizeBinaryEvolutionConfig(payloadRaw);
      setSavedEvolutionConfig(payload);
      setEvolutionMaxConcurrentTasks(payload.max_concurrent_tasks);
      setEvolutionMaxConcurrentSourceTasks(payload.max_concurrent_source_tasks);
      setEvolutionAgentTimeoutSeconds(payload.evolution_agent_timeout_seconds);
      setEvolutionMinRounds(payload.default_min_rounds);
      setEvolutionMaxRounds(payload.default_max_rounds);
      setEvolutionAgentModel(payload.evolution_agent_model);
      setEvolutionContextWindow(payload.evolution_agent_context_window);
      setMessage('进化智能体模型配置已保存');
    } catch (e: any) {
      setError(e?.message || '保存失败');
    } finally {
      setSaving(false);
      setSavingPanel(null);
    }
  };

  const resetEvolutionConcurrency = () => {
    setEvolutionMaxConcurrentTasks(DEFAULT_BINARY_EVOLUTION_CONFIG.max_concurrent_tasks);
    setEvolutionMaxConcurrentSourceTasks(DEFAULT_BINARY_EVOLUTION_CONFIG.max_concurrent_source_tasks);
    setEvolutionAgentTimeoutSeconds(DEFAULT_BINARY_EVOLUTION_CONFIG.evolution_agent_timeout_seconds);
    setError(null);
    setMessage('进化中心并发配置已重置为默认值（尚未保存）');
  };

  const resetEvolutionRounds = () => {
    setEvolutionMinRounds(DEFAULT_BINARY_EVOLUTION_CONFIG.default_min_rounds);
    setEvolutionMaxRounds(DEFAULT_BINARY_EVOLUTION_CONFIG.default_max_rounds);
    setEvolutionContextWindow(DEFAULT_BINARY_EVOLUTION_CONFIG.evolution_agent_context_window);
    setError(null);
    setMessage('进化中心轮次配置已重置为默认值（尚未保存）');
  };

  const resetEvolutionModel = () => {
    setEvolutionAgentModel(DEFAULT_BINARY_EVOLUTION_CONFIG.evolution_agent_model);
    setError(null);
    setMessage('进化智能体模型配置已重置为默认值（尚未保存）');
  };

  return (
    <div style={{ padding: '32px 32px 40px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title="参数配置"
        description="按微服务分组查看和编辑配置。同一个微服务的参数归入同一个 Tab，不同微服务互相隔离；当前页面中的配置均按全局默认值管理，对所有项目生效。"
        actions={<button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-4 py-2.5 text-sm font-semibold text-theme-text-secondary hover:bg-theme-elevated transition-all active:scale-95"><RefreshCw size={16} />刷新</button>}
      />

      <section style={{ borderRadius: '24px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '8px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
          {[
            {
              id: 'binary-security' as ConfigTab,
              label: '二进制安全编排器',
              service: 'chimera-app-binary-security',
            },
            {
              id: 'binary-evolution' as ConfigTab,
              label: '进化中心',
              service: 'chimera-app-binary-evolution-center',
            },
            {
              id: 'firmware-unpacker' as ConfigTab,
              label: '固件解包',
              service: 'chimera-app-firmware-unpacker',
            },
            {
              id: 'system-analysis' as ConfigTab,
              label: '系统分析',
              service: 'chimera-app-system-analyse',
            },
            {
              id: 'binary-to-source' as ConfigTab,
              label: '二进制逆向',
              service: 'chimera-app-binary-to-source',
            },
            {
              id: 'entry-analysis' as ConfigTab,
              label: '入口分析',
              service: 'chimera-app-entry-analyse',
            },
            {
              id: 'dataflow-vuln' as ConfigTab,
              label: '数据流漏洞挖掘',
              service: 'secflow-app-dataflow-vuln-scan',
            },
            {
              id: 'vuln-verify' as ConfigTab,
              label: '漏洞验证',
              service: 'secflow-app-vuln-verify',
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                borderRadius: '12px',
                padding: '12px 20px',
                fontSize: '14px',
                fontWeight: 600,
                transition: 'all 0.2s',
                backgroundColor: activeTab === tab.id ? LK.primary : 'transparent',
                color: activeTab === tab.id ? '#ffffff' : LK.body,
                cursor: 'pointer'
              }}
            >
              <div>{tab.label}</div>
              <div style={{ marginTop: '4px', fontSize: '11px', fontWeight: 600, color: activeTab === tab.id ? LK.mutedSoft : LK.muted }}>
                {tab.service}
              </div>
            </button>
          ))}
        </div>
      </section>

      {activeTab === 'binary-security' ? (
        <section style={{ borderRadius: '24px', border: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised, padding: '24px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
            <Settings size={18} style={{ color: LK.error }} />
            <h2 style={{ fontSize: '20px', fontWeight: 600, color: LK.ink }}>队列控制</h2>
            <span style={{ borderRadius: '999px', border: `1px solid ${LK.error}`, backgroundColor: LK.primaryMuted.replace('0.14', '0.08').replace('79, 115, 255', '241, 93, 93'), padding: '4px 12px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.12em', color: LK.error }}>
              chimera-app-binary-security
            </span>
          </div>
          <p style={{ marginTop: '8px', fontSize: '14px', color: LK.body }}>
            当前 Tab 中的全部配置项都归属于`chimera-app-binary-security` 微服务，用于控制该服务在多实例部署下的全局任务调度行为。
          </p>

          {error && <div style={{ marginTop: '16px', borderRadius: '8px', border: `1px solid ${LK.error}`, backgroundColor: LK.primaryMuted.replace('0.14', '0.08').replace('79, 115, 255', '241, 93, 93'), padding: '12px 16px', fontSize: '14px', fontWeight: 600, color: LK.error }}>{error}</div>}
          {message && <div style={{ marginTop: '16px', borderRadius: '8px', border: `1px solid ${LK.success}`, backgroundColor: LK.primaryMuted.replace('0.14', '0.08').replace('79, 115, 255', '69, 192, 111'), padding: '12px 16px', fontSize: '14px', fontWeight: 600, color: LK.success }}>{message}</div>}

          <div className="mt-5 grid grid-cols-1 gap-4">
            <SectionCard
              title="队列控制"
              subtitle="两项并发值都实时生效。调小允许低于当前实际运行数，但不会主动缩容，只影响后续新任务领取。"
              actions={<PanelActions saving={savingPanel === 'binary-security-queue'} onSave={() => { void saveBinarySecurityQueue(); }} onReset={resetBinarySecurityQueue} />}
            >
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <div>
                  <div className="text-sm font-bold text-theme-text-secondary">单 Worker 最大父任务并发</div>
                  <div className="mt-2 text-xs text-theme-text-muted">范围 1-200，默认 40。限制单个 worker 实例本地最多同时持有多少个父任务 runtime。</div>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    disabled={loading || saving}
                    value={workerTaskConcurrency}
                    onChange={(e) => setWorkerTaskConcurrency(Number(e.target.value || 40))}
                    className="form-input mt-4 w-full"
                  />
                </div>
                <div>
                  <div className="text-sm font-bold text-theme-text-secondary">服务级最大运行任务数</div>
                  <div className="mt-2 text-xs text-theme-text-muted">范围 1-200，默认 40。全局限制`running + dispatching` 的总父任务数。</div>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    disabled={loading || saving}
                    value={maxConcurrentTasks}
                    onChange={(e) => setMaxConcurrentTasks(Number(e.target.value || 40))}
                    className="form-input mt-4 w-full"
                  />
                </div>
                <div>
                  <div className="text-sm font-bold text-theme-text-secondary">调度占用超时秒数</div>
                  <div className="mt-2 text-xs text-theme-text-muted">范围 10-600，默认 60。任务长时间停在`dispatching` 时会被回收到`pending`。</div>
                  <input
                    type="number"
                    min={10}
                    max={600}
                    disabled={loading || saving}
                    value={dispatchTimeoutSeconds}
                    onChange={(e) => setDispatchTimeoutSeconds(Number(e.target.value || 60))}
                    className="form-input mt-4 w-full"
                  />
                </div>
              </div>
            </SectionCard>
            <SectionCard
              title="任务创建默认策略"
              subtitle="创建二进制任务和源码任务时，阶段并发配置、子任务重试次数和失败处理策略默认取自这里。下游 API / 通信错误默认无限重试，进入 30 秒退避档后每 10 次会写一次任务时间线。"
              actions={<PanelActions saving={savingPanel === 'binary-security-policy'} onSave={() => { void saveBinarySecurityPolicy(); }} onReset={resetBinarySecurityPolicy} />}
            >
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                {ORCHESTRATOR_STAGE_FIELDS.map((field) => (
                  <div key={field.key}>
                    <div className="mb-2 text-sm font-bold text-theme-text-secondary">{field.label}</div>
                    <input
                      type="number"
                      min={1}
                      max={32}
                      disabled={loading || saving}
                      value={stageParallelism[field.key] ?? 4}
                      onChange={(e) => setStageParallelism((current) => ({ ...current, [field.key]: Number(e.target.value || 4) }))}
                      className="form-input w-full"
                    />
                  </div>
                ))}
                  <div>
                    <div className="mb-2 text-sm font-bold text-theme-text-secondary">子任务默认重试次数</div>
                    <input
                    type="number"
                    min={0}
                    max={20}
                    disabled={loading || saving}
                    value={maxRetriesPerItem}
                    onChange={(e) => setMaxRetriesPerItem(Number(e.target.value || 0))}
                    className="form-input w-full"
                  />
                  <p className="mt-2 text-xs text-theme-text-muted">这里只控制阶段项级别的业务重试。下游 API / 429 / transport 类可恢复错误默认无限重试，不受这里限制。</p>
                </div>
              </div>
              <div className="mt-4">
                <div className="mb-2 text-sm font-bold text-theme-text-secondary">新任务默认推进模式</div>
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {PIPELINE_MODE_OPTIONS.map((option) => (
                    <label key={option.value} className="flex items-start gap-3 rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-sm text-theme-text-secondary">
                      <input
                        type="radio"
                        name="pipelineMode"
                        checked={pipelineMode === option.value}
                        onChange={() => setPipelineMode(option.value)}
                        disabled={loading || saving}
                      />
                      <span>
                        <span className="block font-semibold">{option.label}</span>
                        <span className="mt-1 block text-xs text-theme-text-muted">{option.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <label className="mt-4 flex items-center gap-3 text-sm font-semibold text-theme-text-secondary">
                <input
                  type="checkbox"
                  checked={continueOnItemFailure}
                  onChange={(e) => setContinueOnItemFailure(e.target.checked)}
                  disabled={loading || saving}
                />
                子任务失败时继续推进其他子任务
              </label>
              <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-3">
                {PARTIAL_SUCCESS_ADVANCEMENT_FIELDS.map((field) => (
                  <label key={field.key} className="flex items-center gap-3 rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-sm font-semibold text-theme-text-secondary">
                    <input
                      type="checkbox"
                      checked={partialSuccessStageAdvancement[field.key] !== false}
                      onChange={(e) => setPartialSuccessStageAdvancement((current) => ({ ...current, [field.key]: e.target.checked }))}
                      disabled={loading || saving}
                    />
                    {field.label}
                  </label>
                ))}
              </div>
            </SectionCard>
          </div>
        </section>
      ) : activeTab === 'binary-evolution' ? (
 <section className="rounded-xl border border-theme-border bg-theme-elevated p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Settings size={18} className="text-amber-400" />
            <h2 className="text-xl font-semibold text-theme-text-primary">进化中心调度配置</h2>
            <span className="rounded-full border border-amber-500/20 bg-amber-500/15 px-3 py-1 text-[11px] font-medium tracking-[0.12em] text-amber-400">
              chimera-app-binary-evolution-center
            </span>
          </div>
          <p style={{ marginTop: '8px', fontSize: '14px', color: LK.body }}>
            这里控制进化中心的服务级任务并发、单个进化任务的轮内并发，以及进化智能体的默认模型和轮次策略。
          </p>
          <p style={{ marginTop: '4px', fontSize: '12px', color: LK.muted }}>
            当前页面中的进化中心配置为全局默认配置，保存后对所有项目生效。
          </p>

          {error && <div style={{ marginTop: '16px', borderRadius: '8px', border: `1px solid ${LK.error}`, backgroundColor: LK.primaryMuted.replace('0.14', '0.08').replace('79, 115, 255', '241, 93, 93'), padding: '12px 16px', fontSize: '14px', fontWeight: 600, color: LK.error }}>{error}</div>}
          {message && <div style={{ marginTop: '16px', borderRadius: '8px', border: `1px solid ${LK.success}`, backgroundColor: LK.primaryMuted.replace('0.14', '0.08').replace('79, 115, 255', '69, 192, 111'), padding: '12px 16px', fontSize: '14px', fontWeight: 600, color: LK.success }}>{message}</div>}

          <div className="mt-5 grid grid-cols-1 gap-4">
            <SectionCard
              title="并发与超时"
              subtitle="控制进化中心的服务级任务并发、单个任务轮内并发，以及进化智能体默认超时。"
              actions={<PanelActions saving={savingPanel === 'evolution-concurrency'} onSave={() => { void saveEvolutionConcurrency(); }} onReset={resetEvolutionConcurrency} />}
            >
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <div>
                  <div className="text-sm font-bold text-theme-text-secondary">服务级最大并发任务数</div>
                  <div className="mt-2 text-xs text-theme-text-muted">同时最多运行多少个进化任务。</div>
                  <input type="number" min={1} max={64} disabled={loading || saving} value={evolutionMaxConcurrentTasks} onChange={(e) => setEvolutionMaxConcurrentTasks(Number(e.target.value || 1))} className="form-input mt-4 w-full" />
                </div>
                <div>
                  <div className="text-sm font-bold text-theme-text-secondary">任务内最大并发源任务数</div>
                  <div className="mt-2 text-xs text-theme-text-muted">单轮 replay 内，同时并发多少个原始 normal 任务。</div>
                  <input type="number" min={1} max={64} disabled={loading || saving} value={evolutionMaxConcurrentSourceTasks} onChange={(e) => setEvolutionMaxConcurrentSourceTasks(Number(e.target.value || 1))} className="form-input mt-4 w-full" />
                </div>
                <div>
                  <div className="text-sm font-bold text-theme-text-secondary">进化智能体超时秒数</div>
                  <div className="mt-2 text-xs text-theme-text-muted">控制单轮进化智能体处理的默认超时。</div>
                  <input type="number" min={1} max={86400} disabled={loading || saving} value={evolutionAgentTimeoutSeconds} onChange={(e) => setEvolutionAgentTimeoutSeconds(Number(e.target.value || 1))} className="form-input mt-4 w-full" />
                </div>
              </div>
            </SectionCard>
            <SectionCard
              title="轮次与上下文"
              subtitle="控制任务默认最小轮次、最大轮次，以及默认上下文窗口。"
              actions={<PanelActions saving={savingPanel === 'evolution-rounds'} onSave={() => { void saveEvolutionRounds(); }} onReset={resetEvolutionRounds} />}
            >
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <div>
                  <div className="text-sm font-bold text-theme-text-secondary">默认最小轮次</div>
                  <input type="number" min={1} max={100} disabled={loading || saving} value={evolutionMinRounds} onChange={(e) => setEvolutionMinRounds(Number(e.target.value || 1))} className="form-input mt-4 w-full" />
                </div>
                <div>
                  <div className="text-sm font-bold text-theme-text-secondary">默认最大轮次</div>
                  <input type="number" min={1} max={100} disabled={loading || saving} value={evolutionMaxRounds} onChange={(e) => setEvolutionMaxRounds(Number(e.target.value || 1))} className="form-input mt-4 w-full" />
                </div>
                <div>
                  <div className="text-sm font-bold text-theme-text-secondary">默认上下文窗口</div>
                  <input type="number" min={1024} max={10485760} disabled={loading || saving} value={evolutionContextWindow} onChange={(e) => setEvolutionContextWindow(Number(e.target.value || 1024))} className="form-input mt-4 w-full" />
                </div>
              </div>
            </SectionCard>
            <SectionCard
              title="默认进化智能体模型"
              subtitle="创建进化任务时默认带入，可在任务创建时覆盖。"
              actions={<PanelActions saving={savingPanel === 'evolution-model'} onSave={() => { void saveEvolutionModel(); }} onReset={resetEvolutionModel} />}
            >
              <input type="text" disabled={loading || saving} value={evolutionAgentModel} onChange={(e) => setEvolutionAgentModel(e.target.value)} className="form-input w-full" />
            </SectionCard>
          </div>
        </section>
      ) : activeTab === 'firmware-unpacker' ? (
        <FirmwareUnpackConfigPage projectId="" embedded />
      ) : activeTab === 'system-analysis' ? (
        <SystemAnalysisConfigPage projectId={projectId} embedded />
      ) : activeTab === 'binary-to-source' ? (
        <B2SConfigPage projectId={projectId} embedded />
      ) : activeTab === 'entry-analysis' ? (
        <EntryAnalysisConfigPage projectId={projectId} embedded />
      ) : activeTab === 'dataflow-vuln' ? (
        <DataflowVulnScanConfigPage projectId={projectId} embedded />
      ) : (
        <VulnVerifyConfigPage projectId={projectId} embedded />
      )}
    </div>
  );
};
