import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';

import { api } from '../../clients/api';
import {
  EntryAnalysisAgentInstance,
  EntryAnalysisRoleConfig,
  EntryAnalysisServiceConfig,
  LlmProviderSummary,
} from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';
import { StaticPipelineFlow } from './StaticPipelineFlow';

const ENTRY_ANALYSIS_FLOW = {
  title: '入口分析阶段推进关系',
  subtitle: '展示入口分析服务从模块装载到结果收敛的固定推进链路，帮助理解轮次、并发与评审配置的作用位置。',
  lanes: [
    {
      label: '任务推进链路',
      steps: [
        { id: 'ea-load', title: '模块加载', desc: '扫描目标路径，装载模块上下文与待分析文件。', badge: '1', tone: 'analysis' as const },
        { id: 'ea-worker', title: '入口分析', desc: 'Worker 分析入口点、初始化路径与候选函数。', badge: '2', tone: 'analysis' as const },
        { id: 'ea-judge', title: '裁判综合', desc: 'Judge 汇总 Worker 输出并评审是否继续下一轮。', badge: '3', tone: 'review' as const },
        { id: 'ea-report', title: '生成结果', desc: '输出 Markdown、functions.list 与运行报告。', badge: '4', tone: 'artifact' as const },
      ],
    },
  ],
  notes: [
    {
      title: '轮次收敛',
      detail: '入口分析按 Worker -> Judge 的方式循环推进，直到达到最少轮次且满足通过条件，或命中最大轮次策略。',
      tone: 'review' as const,
    },
    {
      title: '并行 Worker 模式',
      detail: '开启并行后，多个 Worker 会并发消费文件分片，但最终仍会汇总到同一条 Judge 收敛链路。',
      tone: 'guard' as const,
    },
  ],
};



const defaultRole = (): EntryAnalysisRoleConfig => ({
  default_model: '',
  default_tools: ['read', 'bash', 'edit', 'write'],
  system_prompt_dir: '',
  default_thinking_level: 'off',
  agents: [],
  stage_models: {},
});

const defaultConfig = (projectId: string): EntryAnalysisServiceConfig => ({
  project_id: projectId,
  max_rounds: -1,
  max_rounds_exceeded_action: 'treat_as_passed',
  min_rounds: 2,
  pass_threshold: 0,
  max_concurrent_tasks: 8,
  agent_process_limit: 8,
  agent_max_retries: 100,
  agent_retry_delay: 30,
  agent_run_timeout_seconds: 1800,
  agent_timeout_retry_enabled: true,
  agent_timeout_max_retries: 20,
  pi_max_retries: -1,
  pi_retry_delay: 5,
  r1a_max_rounds: -1,
  r1b_max_rounds: -1,
  r2_max_rounds: -1,
  r3_max_rounds: -1,
  r4_func_max_rounds: -1,
  r4_final_max_rounds: -1,
  report_func_max_rounds: -1,
  report_final_max_rounds: -1,
  lean_mode: false,  // 已废弃，保留兼容
  lean_file_max_rounds: -1,  // 已废弃
  lean_module_max_rounds: -1,  // 已废弃
  api_filter_entry_judge: false,  // 已废弃
  fast_mode: false,
  fast_mode_batch_size: 20,
  workers: defaultRole(),
  judges: defaultRole(),
  output_dir: '/data/output',
  archive_dir: '/data/output',
  result_dir: '/data/output',
});

// ─── 子组件 ────────────────────────────────────────────────────────────────────

const SectionCard: React.FC<{ title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }> = ({ title, subtitle, actions, children }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-base font-black text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {actions}
    </div>
    {children}
  </section>
);

const FieldRow: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div className="flex flex-col gap-1">
    <label className="text-sm font-semibold text-slate-700">
      {label}
      {hint && <span className="ml-2 text-xs font-normal text-slate-400">{hint}</span>}
    </label>
    {children}
  </div>
);

const NumberInput: React.FC<{ value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void }> = ({ value, min, max, step = 1, onChange }) => {
  const [str, setStr] = React.useState(String(value));
  React.useEffect(() => { setStr(String(value)); }, [value]);
  return (
    <input type="number" min={min} max={max} step={step} value={str}
      onChange={(e) => {
        setStr(e.target.value);
        const n = e.target.valueAsNumber;
        if (!isNaN(n)) onChange(n);
      }}
      onBlur={() => setStr(String(value))}
      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
  );
};

const TextInput: React.FC<{ value: string; placeholder?: string; onChange: (v: string) => void }> = ({ value, placeholder, onChange }) => (
  <input type="text" placeholder={placeholder} value={value}
    onChange={(e) => onChange(e.target.value)}
    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
);

const ModelSelect: React.FC<{ value: string; options: string[]; onChange: (v: string) => void }> = ({ value, options, onChange }) => {
  const allOpts = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
      <option value="">— 选择模型 —</option>
      {allOpts.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  );
};

const AgentInstanceList: React.FC<{ agents: EntryAnalysisAgentInstance[]; modelOptions: string[]; onChange: (agents: EntryAnalysisAgentInstance[]) => void }> = ({ agents, modelOptions, onChange }) => {
  const add = () => onChange([...agents, { model: '', tools: null, thinking_level: null }]);
  const remove = (i: number) => onChange(agents.filter((_, idx) => idx !== i));
  const update = (i: number, p: Partial<EntryAnalysisAgentInstance>) => onChange(agents.map((a, idx) => idx === i ? { ...a, ...p } : a));
  return (
    <div className="space-y-2">
      {agents.map((agent, i) => (
        <div key={i} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
          <div className="flex-1">
            <ModelSelect value={agent.model} options={modelOptions} onChange={(v) => update(i, { model: v })} />
          </div>
          <button onClick={() => remove(i)} className="flex-shrink-0 rounded-lg border border-red-100 p-2 text-red-400 hover:bg-red-50"><Trash2 size={14} /></button>
        </div>
      ))}
      <button onClick={add} className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-4 py-2 text-sm text-slate-500 hover:bg-slate-50">
        <Plus size={14} /> 添加 Agent 实例
      </button>
    </div>
  );
};

const RoleConfigBlock: React.FC<{
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  modelOptions: string[];
  value: EntryAnalysisRoleConfig;
  onChange: (v: EntryAnalysisRoleConfig) => void;
  parallelMode?: boolean;
}> = ({ title, subtitle, actions, modelOptions, value, onChange, parallelMode }) => (
  <SectionCard title={title} subtitle={subtitle} actions={actions}>
    {parallelMode ? (
      <FieldRow label="Worker 模型" hint="所有并行实例共用同一模型">
        <ModelSelect
          value={value.agents?.[0]?.model ?? ''}
          options={modelOptions}
          onChange={(model) => onChange({
            ...value,
            agents: (value.agents ?? []).map((a) => ({ ...a, model })),
          })}
        />
      </FieldRow>
    ) : (
      <FieldRow label="Agent 实例列表">
        <AgentInstanceList agents={value.agents ?? []} modelOptions={modelOptions} onChange={(agents) => onChange({ ...value, agents })} />
      </FieldRow>
    )}
  </SectionCard>
);

type EntryPanelKey = 'basic' | 'retry' | 'workers' | 'judges';

const ENTRY_PANEL_KEYS: EntryPanelKey[] = ['basic', 'retry', 'workers', 'judges'];

const applyEntryPanel = (
  base: EntryAnalysisServiceConfig,
  source: EntryAnalysisServiceConfig,
  panel: EntryPanelKey,
): EntryAnalysisServiceConfig => {
  switch (panel) {
    case 'basic':
      return {
        ...base,
        pass_threshold: source.pass_threshold,
        max_concurrent_tasks: source.max_concurrent_tasks,
        agent_process_limit: source.agent_process_limit,
        fast_mode: source.fast_mode,
        fast_mode_batch_size: source.fast_mode_batch_size,
      };
    case 'retry':
      return {
        ...base,
        agent_max_retries: source.agent_max_retries,
        agent_retry_delay: source.agent_retry_delay,
        agent_run_timeout_seconds: source.agent_run_timeout_seconds,
        agent_timeout_retry_enabled: source.agent_timeout_retry_enabled,
        agent_timeout_max_retries: source.agent_timeout_max_retries,
        pi_max_retries: source.pi_max_retries,
        pi_retry_delay: source.pi_retry_delay,
      };
    case 'workers':
      return { ...base, workers: source.workers };
    case 'judges':
      return { ...base, judges: source.judges };
    default:
      return base;
  }
};

const restoreOtherEntryPanels = (
  saved: EntryAnalysisServiceConfig,
  draft: EntryAnalysisServiceConfig,
  preservedPanel: EntryPanelKey,
): EntryAnalysisServiceConfig => {
  return ENTRY_PANEL_KEYS.reduce((acc, panel) => {
    if (panel === preservedPanel) {
      return acc;
    }
    return applyEntryPanel(acc, draft, panel);
  }, saved);
};

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
      className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
    >
      {saving && <Loader2 size={12} className="animate-spin" />}
      保存配置
    </button>
  </div>
);

// ─── 主页面 ────────────────────────────────────────────────────────────────────

export const EntryAnalysisConfigPage: React.FC<{ projectId: string; embedded?: boolean }> = ({ projectId, embedded = false }) => {
  const { notify, feedbackNodes } = useUiFeedback();
  const entryAnalysis = api.domains.execution.appEntryAnalyse;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPanel, setSavingPanel] = useState<EntryPanelKey | null>(null);
  const [config, setConfig] = useState<EntryAnalysisServiceConfig>(() => defaultConfig(projectId));
  const [savedConfig, setSavedConfig] = useState<EntryAnalysisServiceConfig>(() => defaultConfig(projectId));
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [slotCluster, setSlotCluster] = useState<any | null>(null);

  const patch = (p: Partial<EntryAnalysisServiceConfig>) => setConfig((prev) => ({ ...prev, ...p }));

  useEffect(() => {
    api.configCenter.listLlmProviders()
      .then((res: { items?: LlmProviderSummary[] }) => {
        const items = Array.isArray(res?.items) ? res.items : [];
        const opts = items
          .filter((p) => p.enabled && p.provider_key && p.model)
          .map((p) => `${p.provider_key}/${p.model}`);
        setModelOptions(opts);
      })
      .catch(() => { /* 静默忽略 */ });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    entryAnalysis.getConfig(projectId)
      .then((cfg) => {
        if (!cancelled) {
          const base = defaultConfig(projectId);
          const safe: EntryAnalysisServiceConfig = {
            ...base,
            ...cfg,
            project_id: projectId,
            workers: { ...base.workers, ...(cfg.workers && typeof cfg.workers === 'object' ? cfg.workers : {}) },
            judges: { ...base.judges, ...(cfg.judges && typeof cfg.judges === 'object' ? cfg.judges : {}) },
          };
          setConfig(safe);
          setSavedConfig(safe);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          notify(`加载配置失败: ${err?.message ?? err}`, 'error');
          const fallback = defaultConfig(projectId);
          setConfig(fallback);
          setSavedConfig(fallback);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    entryAnalysis.getSlotCluster()
      .then((data) => {
        if (!cancelled) {
          setSlotCluster(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSlotCluster(null);
        }
      });
    return () => { cancelled = true; };
  }, [projectId]);

  const persistConfig = async (nextConfig: EntryAnalysisServiceConfig) => {
    setSaving(true);
    try {
      const saved = await entryAnalysis.saveConfig({ ...nextConfig, project_id: projectId });
      const base = defaultConfig(projectId);
      return {
        ...base,
        ...saved,
        project_id: projectId,
        workers: { ...base.workers, ...(saved.workers && typeof saved.workers === 'object' ? saved.workers : {}) },
        judges: { ...base.judges, ...(saved.judges && typeof saved.judges === 'object' ? saved.judges : {}) },
      };
    } catch (err: any) {
      notify(`保存失败: ${err?.message ?? err}`, 'error');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handlePanelSave = async (panel: EntryPanelKey, label: string) => {
    setSavingPanel(panel);
    try {
      const payload = applyEntryPanel(savedConfig, config, panel);
      const saved = await persistConfig(payload);
      if (saved) {
        setSavedConfig(saved);
        setConfig((prev) => restoreOtherEntryPanels(saved, prev, panel));
        notify(`${label}已保存`, 'success');
      }
    } catch (err: any) {
      notify(`保存出错: ${err?.message ?? err}`, 'error');
    } finally {
      setSavingPanel(null);
    }
  };

  const handlePanelReset = (panel: EntryPanelKey, label: string) => {
    const defaults = defaultConfig(projectId);
    setConfig((prev) => applyEntryPanel(prev, defaults, panel));
    notify(`${label}已重置为默认值（尚未保存）`, 'info');
  };

  return (
    <div className={embedded ? 'space-y-6' : 'px-8 pt-8 pb-10 space-y-6'}>
      {feedbackNodes}

      {!embedded && (
        <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">Entry Analysis</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">分析配置</h1>
          <p className="mt-2 text-sm text-slate-500">配置 chimera-app-entry-analyse 分析引擎的运行参数，修改后点击「保存配置」生效。</p>
          {config.updated_at && (
            <p className="mt-1 text-xs text-slate-400">上次保存：{new Date(config.updated_at).toLocaleString()}</p>
          )}
        </section>
      )}

      {loading ? (
        <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          <Loader2 size={15} className="animate-spin" />加载中...
        </div>
      ) : (
        <div className="space-y-6">
          <StaticPipelineFlow
            title={ENTRY_ANALYSIS_FLOW.title}
            subtitle={ENTRY_ANALYSIS_FLOW.subtitle}
            lanes={ENTRY_ANALYSIS_FLOW.lanes}
            notes={ENTRY_ANALYSIS_FLOW.notes}
          />
          {/* 基本配置 */}
          <SectionCard
            title="基本配置"
            subtitle="并发控制与运行参数"
            actions={(
              <PanelActions
                saving={savingPanel === 'basic'}
                onSave={() => { void handlePanelSave('basic', '基本配置'); }}
                onReset={() => handlePanelReset('basic', '基本配置')}
              />
            )}
          >
            <div className="grid grid-cols-2 gap-4 md:grid-cols-2">
              <FieldRow label="Pod 智能体占用/可用" hint="只读观测值，由 worker 心跳上报">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {(slotCluster?.agent_in_use ?? 0)} / {(slotCluster?.agent_available ?? 0)}
                </div>
              </FieldRow>
              <FieldRow label="智能体等待请求" hint="多个任务竞争同一 Pod 槽位时按 FIFO 排队">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {(slotCluster?.agent_waiting_requests ?? 0)} 请求 / {(slotCluster?.agent_waiting_tasks ?? 0)} 任务
                </div>
              </FieldRow>
            </div>

            {/* 各阶段轮次独立配置 */}
            {/* 快速模式配置（独立区块，蓝色边框） */}
            <div className={`rounded-xl border-2 px-4 py-4 transition-colors ${
              config.fast_mode ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-slate-50'
            }`}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-black text-slate-900">
                    快速模式 <span className="font-mono text-xs font-normal text-slate-500">Fast Mode</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    开启后，在 R2 阶段完成后由脚本收集函数名+调用关系，
                    分批交给 LLM 快速筛选潜在入口，仅被选中的函数进入 R3 完整分析。
                    速度显著提升，但不保证全面性（可能漏报部分入口）。
                  </p>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-3 shrink-0 ml-4">
                  <div className="relative">
                    <input type="checkbox" className="peer sr-only"
                      checked={config.fast_mode}
                      onChange={(e) => patch({ fast_mode: e.target.checked })} />
                    <div className="h-6 w-11 rounded-full bg-slate-200 peer-checked:bg-blue-600 transition-colors" />
                    <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
                  </div>
                  <span className={`text-sm font-semibold ${
                    config.fast_mode ? 'text-blue-700' : 'text-slate-500'
                  }`}>
                    {config.fast_mode ? '快速模式(不保证全面性)' : '标准模式'}
                  </span>
                </label>
              </div>
              {config.fast_mode && (
                <>
                  <div className="mt-4 text-xs text-blue-700 font-medium">
                    快速模式已开启：R2 完成后由脚本收集函数名及调用关系，分批交给 LLM 筛选入口后再进入 R3。
                  </div>
                  <div className="mt-3">
                    <FieldRow label="批量大小" hint="每批次发送给 LLM 的函数数量（10-50）">
                      <NumberInput
                        value={config.fast_mode_batch_size}
                        min={10} max={50}
                        onChange={(v) => patch({ fast_mode_batch_size: Math.max(10, Math.min(50, Math.trunc(v || 20))) })}
                      />
                    </FieldRow>
                  </div>
                </>
              )}
            </div>

            <FieldRow label="智能体并发说明" hint="单任务内不再单独限流">
              <p className="text-xs leading-5 text-slate-500">
                入口分析的任务并发和智能体并发都由配置页动态控制，并通过 worker 心跳热生效，无需重启 Pod。
                单任务可以吃满所在 Pod 的智能体进程；多个任务同时运行时，所有智能体请求按 FIFO 排队获取槽位。
              </p>
            </FieldRow>
          </SectionCard>

          {/* 重试配置 */}
          <SectionCard
            title="重试配置"
            subtitle="LLM API 重试与进程重启策略"
            actions={(
              <PanelActions
                saving={savingPanel === 'retry'}
                onSave={() => { void handlePanelSave('retry', '重试配置'); }}
                onReset={() => handlePanelReset('retry', '重试配置')}
              />
            )}
          >
            <div className="grid grid-cols-2 gap-4">
              <FieldRow label="agent_max_retries" hint="-1=无限"><NumberInput value={config.agent_max_retries} min={-1} onChange={(v) => patch({ agent_max_retries: v })} /></FieldRow>
              <FieldRow label="agent_retry_delay（秒）"><NumberInput value={config.agent_retry_delay} min={0} step={0.5} onChange={(v) => patch({ agent_retry_delay: v })} /></FieldRow>
              <FieldRow label="agent_run_timeout_seconds（秒）" hint="单次会话空闲超时"><NumberInput value={config.agent_run_timeout_seconds} min={60} step={1} onChange={(v) => patch({ agent_run_timeout_seconds: Math.max(60, Math.trunc(v || 60)) })} /></FieldRow>
              <FieldRow label="agent_timeout_max_retries" hint="-1=无限"><NumberInput value={config.agent_timeout_max_retries} min={-1} onChange={(v) => patch({ agent_timeout_max_retries: v })} /></FieldRow>
              <FieldRow label="pi_max_retries" hint="-1=无限"><NumberInput value={config.pi_max_retries} min={-1} onChange={(v) => patch({ pi_max_retries: v })} /></FieldRow>
              <FieldRow label="pi_retry_delay（秒）"><NumberInput value={config.pi_retry_delay} min={0} step={0.5} onChange={(v) => patch({ pi_retry_delay: v })} /></FieldRow>
            </div>
            <FieldRow label="agent_timeout_retry_enabled" hint="空闲超时后是否自动重试">
              <label className="inline-flex cursor-pointer items-center gap-3">
                <div className="relative">
                  <input type="checkbox" className="peer sr-only" checked={config.agent_timeout_retry_enabled} onChange={(e) => patch({ agent_timeout_retry_enabled: e.target.checked })} />
                  <div className="h-6 w-11 rounded-full bg-slate-200 peer-checked:bg-violet-600 transition-colors" />
                  <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
                </div>
                <span className="text-sm text-slate-600">{config.agent_timeout_retry_enabled ? '开启超时自动重试' : '关闭超时自动重试'}</span>
              </label>
            </FieldRow>
          </SectionCard>

          {/* Workers */}
          <RoleConfigBlock
            title="Workers 配置"
            subtitle="Worker Agent 配置列表用于选择执行模型与工具，不再决定单任务并发上限"
            modelOptions={modelOptions}
            value={config.workers}
            onChange={(v) => patch({ workers: v })}
            actions={(
              <PanelActions
                saving={savingPanel === 'workers'}
                onSave={() => { void handlePanelSave('workers', 'Workers 配置'); }}
                onReset={() => handlePanelReset('workers', 'Workers 配置')}
              />
            )}
          />

          {/* Judges */}
          <RoleConfigBlock
            title="Judges 配置"
            subtitle="并行评审 — 实例列表中每一项对应一个并行 Judge 进程，数量即并行度"
            modelOptions={modelOptions}
            value={config.judges}
            onChange={(v) => patch({ judges: v })}
            actions={(
              <PanelActions
                saving={savingPanel === 'judges'}
                onSave={() => { void handlePanelSave('judges', 'Judges 配置'); }}
                onReset={() => handlePanelReset('judges', 'Judges 配置')}
              />
            )}
          />
        </div>
      )}
    </div>
  );
};
