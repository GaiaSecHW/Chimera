import React, { useEffect, useState } from 'react';
import { Loader2, RefreshCw, Save, Settings } from 'lucide-react';

import { api } from '../../clients/api';
import { FirmwareUnpackConfigPage } from './FirmwareUnpackConfigPage';
import { SystemAnalysisConfigPage } from './SystemAnalysisConfigPage';
import { EntryAnalysisConfigPage } from './EntryAnalysisConfigPage';
import { DataflowVulnScanConfigPage } from './DataflowVulnScanConfigPage';
import { B2SConfigPage } from './B2SConfigPage';

type ConfigTab = 'binary-security' | 'binary-evolution' | 'firmware-unpacker' | 'system-analysis' | 'binary-to-source' | 'entry-analysis' | 'dataflow-vuln';
const ORCHESTRATOR_STAGE_FIELDS = [
  { key: 'firmware_unpack', label: '固件解包' },
  { key: 'system_analysis', label: '系统分析' },
  { key: 'binary_to_source', label: '二进制逆向' },
  { key: 'entry_analysis', label: '入口分析' },
  { key: 'dataflow_analysis', label: '数据流分析' },
  { key: 'vuln_scan', label: '数据流漏洞挖掘' },
] as const;
const PARTIAL_SUCCESS_ADVANCEMENT_FIELDS = [
  { key: 'binary_to_source', label: '二进制逆向部分成功后继续推进' },
  { key: 'entry_analysis', label: '入口分析部分成功后继续推进' },
  { key: 'dataflow_analysis', label: '数据流分析部分成功后继续推进' },
] as const;
const DEFAULT_PARTIAL_SUCCESS_STAGE_ADVANCEMENT = Object.fromEntries(
  PARTIAL_SUCCESS_ADVANCEMENT_FIELDS.map((field) => [field.key, false]),
) as Record<string, boolean>;

const DEFAULT_BINARY_SECURITY_SERVICE_CONFIG = {
  max_concurrent_tasks: 50,
  dispatch_timeout_seconds: 60,
};

const DEFAULT_BINARY_SECURITY_PROJECT_CONFIG = {
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

const pickConfigRecord = (value: unknown): Record<string, any> => {
  const root = asRecord(value);
  const nestedConfig = asRecord(root.config);
  return Object.keys(nestedConfig).length > 0 ? nestedConfig : root;
};

const normalizeBinarySecurityServiceConfig = (value: unknown) => {
  const config = pickConfigRecord(value);
  return {
    ...DEFAULT_BINARY_SECURITY_SERVICE_CONFIG,
    ...config,
  };
};

const normalizeBinarySecurityProjectConfig = (value: unknown) => {
  const config = pickConfigRecord(value);
  return {
    ...DEFAULT_BINARY_SECURITY_PROJECT_CONFIG,
    ...config,
    partial_success_stage_advancement: {
      ...DEFAULT_PARTIAL_SUCCESS_STAGE_ADVANCEMENT,
      ...asRecord(config.partial_success_stage_advancement),
    },
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
  <section className="rounded-2xl bg-white p-5">
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm font-bold text-slate-700">{title}</div>
        {subtitle ? <div className="mt-2 text-xs text-slate-500">{subtitle}</div> : null}
      </div>
      {actions}
    </div>
    <div className="mt-4">{children}</div>
  </section>
);

const PanelActions: React.FC<{ saving: boolean; onSave: () => void; onReset: () => void }> = ({ saving, onSave, onReset }) => (
  <div className="flex shrink-0 items-center gap-2">
    <button
      type="button"
      onClick={onReset}
      disabled={saving}
      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
    >
      重置为默认
    </button>
    <button
      type="button"
      onClick={onSave}
      disabled={saving}
      className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
    >
      {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
      保存配置
    </button>
  </div>
);

export const BinarySecurityConfigPage: React.FC<{ projectId: string; initialTab?: ConfigTab }> = ({ projectId, initialTab = 'binary-security' }) => {
  const executionApi = api.domains.execution;
  const [activeTab, setActiveTab] = useState<ConfigTab>(initialTab);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPanel, setSavingPanel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [maxConcurrentTasks, setMaxConcurrentTasks] = useState(50);
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
      const [serviceDataRaw, projectDataRaw] = await Promise.all([
        executionApi.binarySecurity.getServiceConfig(),
        executionApi.binarySecurity.getProjectConfig(projectId),
      ]);
      const serviceConfig = normalizeBinarySecurityServiceConfig(serviceDataRaw);
      const projectConfig = normalizeBinarySecurityProjectConfig(projectDataRaw);
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
      setMaxConcurrentTasks(serviceConfig.max_concurrent_tasks);
      setDispatchTimeoutSeconds(serviceConfig.dispatch_timeout_seconds);
      setMaxRetriesPerItem(projectConfig.max_retries_per_item);
      setContinueOnItemFailure(projectConfig.continue_on_item_failure);
      setPipelineMode((String(projectConfig.pipeline_mode) === 'mixed_streaming' ? 'mixed_streaming' : 'barrier') as 'barrier' | 'mixed_streaming');
      setPartialSuccessStageAdvancement({
        ...DEFAULT_PARTIAL_SUCCESS_STAGE_ADVANCEMENT,
        ...(projectConfig.partial_success_stage_advancement || {}),
      });
      setStageParallelism({
        ...Object.fromEntries(ORCHESTRATOR_STAGE_FIELDS.map((field) => [field.key, 4])),
        ...(projectConfig.stage_parallelism || {}),
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
      const serviceData = await executionApi.binarySecurity.updateServiceConfig({
        max_concurrent_tasks: Math.max(1, Math.min(200, Number(maxConcurrentTasks) || 50)),
        dispatch_timeout_seconds: Math.max(10, Math.min(600, Number(dispatchTimeoutSeconds) || 60)),
      });
      const normalizedServiceData = normalizeBinarySecurityServiceConfig(serviceData);
      syncServiceDraft(normalizedServiceData);
      setMessage('队列控制配置已保存');
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
      const projectData = await executionApi.binarySecurity.updateProjectConfig(projectId, {
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
        ...DEFAULT_BINARY_SECURITY_PROJECT_CONFIG,
        ...normalizedProjectData,
        stage_parallelism: {
          ...Object.fromEntries(ORCHESTRATOR_STAGE_FIELDS.map((field) => [field.key, 4])),
          ...(normalizedProjectData.stage_parallelism || {}),
        },
      });
      setMessage('任务创建默认策略已保存');
    } catch (e: any) {
      setError(e?.message || '保存失败');
    } finally {
      setSaving(false);
      setSavingPanel(null);
    }
  };

  const resetBinarySecurityQueue = () => {
    syncServiceDraft(DEFAULT_BINARY_SECURITY_SERVICE_CONFIG);
    setError(null);
    setMessage('队列控制已重置为默认值（尚未保存）');
  };

  const resetBinarySecurityPolicy = () => {
    syncProjectDraft({
      ...DEFAULT_BINARY_SECURITY_PROJECT_CONFIG,
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
    <div className="px-8 pb-10 pt-8 space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-600">Binary Security</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">参数配置</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              按微服务分组查看和编辑配置。同一个微服务的参数归入同一个 Tab，不同微服务互相隔离，便于统一管理。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            刷新
          </button>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {[
            {
              id: 'binary-security' as ConfigTab,
              label: '二进制安全编排器',
              service: 'secflow-app-binary-security',
            },
            {
              id: 'binary-evolution' as ConfigTab,
              label: '进化中心',
              service: 'secflow-app-binary-evolution-center',
            },
            {
              id: 'firmware-unpacker' as ConfigTab,
              label: '固件解包',
              service: 'secflow-app-firmware-unpacker',
            },
            {
              id: 'system-analysis' as ConfigTab,
              label: '系统分析',
              service: 'secflow-app-system-analyse',
            },
            {
              id: 'binary-to-source' as ConfigTab,
              label: '二进制逆向',
              service: 'secflow-app-binary-to-source',
            },
            {
              id: 'entry-analysis' as ConfigTab,
              label: '入口分析',
              service: 'secflow-app-entry-analyse',
            },
            {
              id: 'dataflow-vuln' as ConfigTab,
              label: '数据流漏洞挖掘',
              service: 'secflow-app-dataflow-vuln-scan',
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-2xl px-5 py-3 text-sm font-black transition ${
                activeTab === tab.id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              <div>{tab.label}</div>
              <div className={`mt-1 text-[11px] font-semibold ${activeTab === tab.id ? 'text-slate-300' : 'text-slate-400'}`}>
                {tab.service}
              </div>
            </button>
          ))}
        </div>
      </section>

      {activeTab === 'binary-security' ? (
        <section className="rounded-[2rem] border border-slate-200 bg-slate-50/70 p-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Settings size={18} className="text-rose-600" />
            <h2 className="text-xl font-black text-slate-900">队列控制</h2>
            <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-black tracking-[0.12em] text-rose-700">
              secflow-app-binary-security
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            当前 Tab 中的全部配置项都归属于 `secflow-app-binary-security` 微服务，用于控制该服务在多实例部署下的全局任务调度行为。
          </p>

          {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
          {message && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</div>}

          <div className="mt-5 grid grid-cols-1 gap-4">
            <SectionCard
              title="队列控制"
              subtitle="范围 1-200，默认 50。全局限制 `running + dispatching` 的总任务数，并控制 dispatching 回收超时。"
              actions={<PanelActions saving={savingPanel === 'binary-security-queue'} onSave={() => { void saveBinarySecurityQueue(); }} onReset={resetBinarySecurityQueue} />}
            >
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div>
                  <div className="text-sm font-bold text-slate-700">最大并发总任务数</div>
                  <div className="mt-2 text-xs text-slate-500">范围 1-200，默认 50。全局限制 `running + dispatching` 的总任务数。</div>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    disabled={loading || saving}
                    value={maxConcurrentTasks}
                    onChange={(e) => setMaxConcurrentTasks(Number(e.target.value || 50))}
                    className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
                  />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-700">调度占用超时秒数</div>
                  <div className="mt-2 text-xs text-slate-500">范围 10-600，默认 60。任务长时间停在 `dispatching` 时会被回收到 `pending`。</div>
                  <input
                    type="number"
                    min={10}
                    max={600}
                    disabled={loading || saving}
                    value={dispatchTimeoutSeconds}
                    onChange={(e) => setDispatchTimeoutSeconds(Number(e.target.value || 60))}
                    className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
                  />
                </div>
              </div>
            </SectionCard>
            <SectionCard
              title="任务创建默认策略"
              subtitle="创建二进制任务和源码任务时，阶段并发配置、子任务重试次数和失败处理策略默认取自这里。"
              actions={<PanelActions saving={savingPanel === 'binary-security-policy'} onSave={() => { void saveBinarySecurityPolicy(); }} onReset={resetBinarySecurityPolicy} />}
            >
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                {ORCHESTRATOR_STAGE_FIELDS.map((field) => (
                  <div key={field.key}>
                    <div className="mb-2 text-sm font-bold text-slate-700">{field.label}</div>
                    <input
                      type="number"
                      min={1}
                      max={32}
                      disabled={loading || saving}
                      value={stageParallelism[field.key] ?? 4}
                      onChange={(e) => setStageParallelism((current) => ({ ...current, [field.key]: Number(e.target.value || 4) }))}
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
                    />
                  </div>
                ))}
                  <div>
                    <div className="mb-2 text-sm font-bold text-slate-700">子任务默认重试次数</div>
                    <input
                    type="number"
                    min={0}
                    max={20}
                    disabled={loading || saving}
                    value={maxRetriesPerItem}
                    onChange={(e) => setMaxRetriesPerItem(Number(e.target.value || 0))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
                  />
                </div>
              </div>
              <div className="mt-4">
                <div className="mb-2 text-sm font-bold text-slate-700">新任务默认推进模式</div>
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {PIPELINE_MODE_OPTIONS.map((option) => (
                    <label key={option.value} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                      <input
                        type="radio"
                        name="pipelineMode"
                        checked={pipelineMode === option.value}
                        onChange={() => setPipelineMode(option.value)}
                        disabled={loading || saving}
                      />
                      <span>
                        <span className="block font-semibold">{option.label}</span>
                        <span className="mt-1 block text-xs text-slate-500">{option.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <label className="mt-4 flex items-center gap-3 text-sm font-semibold text-slate-700">
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
                  <label key={field.key} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
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
        <section className="rounded-[2rem] border border-slate-200 bg-slate-50/70 p-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Settings size={18} className="text-amber-600" />
            <h2 className="text-xl font-black text-slate-900">进化中心调度配置</h2>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-black tracking-[0.12em] text-amber-700">
              secflow-app-binary-evolution-center
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            这里控制进化中心的服务级任务并发、单个进化任务的轮内并发，以及进化智能体的默认模型和轮次策略。
          </p>

          {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
          {message && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</div>}

          <div className="mt-5 grid grid-cols-1 gap-4">
            <SectionCard
              title="并发与超时"
              subtitle="控制进化中心的服务级任务并发、单个任务轮内并发，以及进化智能体默认超时。"
              actions={<PanelActions saving={savingPanel === 'evolution-concurrency'} onSave={() => { void saveEvolutionConcurrency(); }} onReset={resetEvolutionConcurrency} />}
            >
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <div>
                  <div className="text-sm font-bold text-slate-700">服务级最大并发任务数</div>
                  <div className="mt-2 text-xs text-slate-500">同时最多运行多少个进化任务。</div>
                  <input type="number" min={1} max={64} disabled={loading || saving} value={evolutionMaxConcurrentTasks} onChange={(e) => setEvolutionMaxConcurrentTasks(Number(e.target.value || 1))} className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-700">任务内最大并发源任务数</div>
                  <div className="mt-2 text-xs text-slate-500">单轮 replay 内，同时并发多少个原始 normal 任务。</div>
                  <input type="number" min={1} max={64} disabled={loading || saving} value={evolutionMaxConcurrentSourceTasks} onChange={(e) => setEvolutionMaxConcurrentSourceTasks(Number(e.target.value || 1))} className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-700">进化智能体超时秒数</div>
                  <div className="mt-2 text-xs text-slate-500">控制单轮进化智能体处理的默认超时。</div>
                  <input type="number" min={1} max={86400} disabled={loading || saving} value={evolutionAgentTimeoutSeconds} onChange={(e) => setEvolutionAgentTimeoutSeconds(Number(e.target.value || 1))} className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" />
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
                  <div className="text-sm font-bold text-slate-700">默认最小轮次</div>
                  <input type="number" min={1} max={100} disabled={loading || saving} value={evolutionMinRounds} onChange={(e) => setEvolutionMinRounds(Number(e.target.value || 1))} className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-700">默认最大轮次</div>
                  <input type="number" min={1} max={100} disabled={loading || saving} value={evolutionMaxRounds} onChange={(e) => setEvolutionMaxRounds(Number(e.target.value || 1))} className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-700">默认上下文窗口</div>
                  <input type="number" min={1024} max={10485760} disabled={loading || saving} value={evolutionContextWindow} onChange={(e) => setEvolutionContextWindow(Number(e.target.value || 1024))} className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" />
                </div>
              </div>
            </SectionCard>
            <SectionCard
              title="默认进化智能体模型"
              subtitle="创建进化任务时默认带入，可在任务创建时覆盖。"
              actions={<PanelActions saving={savingPanel === 'evolution-model'} onSave={() => { void saveEvolutionModel(); }} onReset={resetEvolutionModel} />}
            >
              <input type="text" disabled={loading || saving} value={evolutionAgentModel} onChange={(e) => setEvolutionAgentModel(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" />
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
      ) : (
        <DataflowVulnScanConfigPage projectId={projectId} embedded />
      )}
    </div>
  );
};
