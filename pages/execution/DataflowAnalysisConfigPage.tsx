/* @refresh reset */
import React, { useEffect, useState } from 'react';
import { Loader2, Plus, RefreshCw, Settings, Trash2 } from 'lucide-react';

import { api } from '../../clients/api';
import { AppDfaAgentInstance, AppDfaRoleConfig, AppDfaServiceConfig, LlmProviderSummary } from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';
import { StaticPipelineFlow } from './StaticPipelineFlow';

const DATAFLOW_ANALYSIS_FLOW = {
  title: '数据流分析阶段推进关系',
  subtitle: '展示数据流分析服务的静态推进路径，用于辅助理解追踪深度、并发、轮次和评审相关配置。',
  lanes: [
    {
      label: '任务推进链路',
      steps: [
        { id: 'dfa-prepare', title: '任务准备', desc: '解析配置、初始化工作区并装载上游结果。', badge: '1', tone: 'analysis' as const },
        { id: 'dfa-worker', title: 'Worker 分析', desc: '并行跟踪函数数据流、调用边与污点传播。', badge: '2', tone: 'analysis' as const },
        { id: 'dfa-judge', title: 'Judge 评估', desc: '评估可信度、覆盖率，并决定是否继续迭代。', badge: '3', tone: 'review' as const },
        { id: 'dfa-report', title: '报告输出', desc: '生成 Markdown 与结构化结果，沉淀最终分析产物。', badge: '4', tone: 'artifact' as const },
      ],
    },
  ],
  notes: [
    {
      title: '递归追踪',
      detail: 'max_trace_depth 与 callee_concurrency 共同决定函数调用追踪的深度与展开宽度。',
      tone: 'analysis' as const,
    },
    {
      title: '评审收敛',
      detail: '达到最大轮次后，会按 max_rounds_exceeded_review_strategy 决定任务最终按通过还是失败收敛。',
      tone: 'review' as const,
    },
  ],
};

const defaultRole = (): AppDfaRoleConfig => ({
  system_prompt_dir: '',
  agents: [],
  stage_models: {},
});

const defaultConfig = (projectId: string): AppDfaServiceConfig => ({
  project_id: projectId,
  max_rounds: 3,
  max_rounds_exceeded_review_strategy: 'treat_as_passed',
  min_rounds: 2,
  pass_threshold: 1,
  agent_max_retries: 100,
  agent_retry_delay: 30,
  agent_run_timeout_seconds: 1800,
  agent_timeout_retry_enabled: true,
  agent_timeout_max_retries: 20,
  pi_max_retries: -1,
  pi_retry_delay: 10,
  max_trace_depth: 5,
  deep_trace_enabled: false,
  callee_concurrency: 4,
  workers: defaultRole(),
  judges: defaultRole(),
  output_dir: '/data/output',
  archive_dir: '/data/output',
  result_dir: '/data/output',
});

// ─── 子组件 ────────────────────────────────────────────────────────────────────

const SectionCard: React.FC<{ title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }> = ({ title, subtitle, actions, children }) => (
 <section className="rounded-2xl border border-theme-border bg-theme-bg-app p-6 space-y-4">
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-base font-black text-theme-text-primary">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-theme-text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
    {children}
  </section>
);

const FieldRow: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div className="flex flex-col gap-1">
    <label className="text-sm font-semibold text-theme-text-secondary">
      {label}
      {hint && <span className="ml-2 text-xs font-normal text-theme-text-muted">{hint}</span>}
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
      className="w-full rounded-lg border border-theme-border px-3 py-2 text-sm" />
  );
};

const ModelSelect: React.FC<{ value: string; options: string[]; onChange: (v: string) => void }> = ({ value, options, onChange }) => {
  const allOpts = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-theme-border px-3 py-2 text-sm bg-theme-bg-app">
      <option value="">— 选择模型 —</option>
      {allOpts.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  );
};

const AgentInstanceList: React.FC<{
  agents: AppDfaAgentInstance[];
  modelOptions: string[];
  onChange: (agents: AppDfaAgentInstance[]) => void;
}> = ({ agents, modelOptions, onChange }) => {
  const add = () => onChange([...agents, { model: '', tools: null, thinking_level: null }]);
  const remove = (i: number) => onChange(agents.filter((_, idx) => idx !== i));
  const update = (i: number, patch: Partial<AppDfaAgentInstance>) =>
    onChange(agents.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));

  return (
    <div className="space-y-2">
      {agents.map((agent, i) => (
        <div key={i} className="flex items-center gap-2 rounded-xl border border-theme-border bg-theme-bg-app p-3">
          <div className="flex-1">
            <ModelSelect value={agent.model} options={modelOptions} onChange={(v) => update(i, { model: v })} />
          </div>
          <button onClick={() => remove(i)} disabled={agents.length <= 1}
            className="flex-shrink-0 rounded-lg border border-red-500/20 p-2 text-red-400 hover:bg-red-500/15 disabled:opacity-30 disabled:cursor-not-allowed">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button onClick={add}
        className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-theme-border px-4 py-2 text-sm text-theme-text-muted hover:bg-theme-elevated">
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
  value: AppDfaRoleConfig;
  onChange: (v: AppDfaRoleConfig) => void;
}> = ({ title, subtitle, actions, modelOptions, value, onChange }) => (
  <SectionCard title={title} subtitle={subtitle} actions={actions}>
    <FieldRow label="Agent 实例列表">
      <AgentInstanceList
        agents={value.agents ?? []}
        modelOptions={modelOptions}
        onChange={(agents) => onChange({ ...value, agents })}
      />
    </FieldRow>
  </SectionCard>
);

type DfaPanelKey = 'basic' | 'analysis' | 'retry' | 'workers' | 'judges';

const DFA_PANEL_KEYS: DfaPanelKey[] = ['basic', 'analysis', 'retry', 'workers', 'judges'];

const applyDfaPanel = (
  base: AppDfaServiceConfig,
  source: AppDfaServiceConfig,
  panel: DfaPanelKey,
): AppDfaServiceConfig => {
  switch (panel) {
    case 'basic':
      return {
        ...base,
        max_rounds: source.max_rounds,
        max_rounds_exceeded_review_strategy: source.max_rounds_exceeded_review_strategy,
        min_rounds: source.min_rounds,
        pass_threshold: source.pass_threshold,
      };
    case 'analysis':
      return {
        ...base,
        max_trace_depth: source.max_trace_depth,
        callee_concurrency: source.callee_concurrency,
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

const restoreOtherDfaPanels = (
  saved: AppDfaServiceConfig,
  draft: AppDfaServiceConfig,
  preservedPanel: DfaPanelKey,
): AppDfaServiceConfig => {
  return DFA_PANEL_KEYS.reduce((acc, panel) => {
    if (panel === preservedPanel) {
      return acc;
    }
    return applyDfaPanel(acc, draft, panel);
  }, saved);
};

const PanelActions: React.FC<{ saving: boolean; onSave: () => void; onReset: () => void }> = ({ saving, onSave, onReset }) => (
  <div className="flex shrink-0 items-center gap-2">
    <button
      type="button"
      onClick={onReset}
      disabled={saving}
      className="rounded-xl border border-theme-border bg-theme-bg-app px-3 py-2 text-xs font-semibold text-theme-text-secondary hover:bg-theme-elevated disabled:opacity-50"
    >
      重置为默认
    </button>
    <button
      type="button"
      onClick={onSave}
      disabled={saving}
      className="inline-flex items-center gap-2 rounded-xl bg-theme-surface px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
    >
      {saving && <Loader2 size={12} className="animate-spin" />}
      保存配置
    </button>
  </div>
);

// ─── 主页面 ────────────────────────────────────────────────────────────────────

export const DataflowAnalysisConfigPage: React.FC<{ projectId: string; embedded?: boolean }> = ({ projectId, embedded = false }) => {
  const { notify, feedbackNodes } = useUiFeedback();
  const dfaApi = api.domains.execution.appDataflowAnalyse;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPanel, setSavingPanel] = useState<DfaPanelKey | null>(null);
  const [config, setConfig] = useState<AppDfaServiceConfig>(() => defaultConfig(projectId));
  const [savedConfig, setSavedConfig] = useState<AppDfaServiceConfig>(() => defaultConfig(projectId));
  const [modelOptions, setModelOptions] = useState<string[]>([]);

  const patch = (p: Partial<AppDfaServiceConfig>) => setConfig((prev) => ({ ...prev, ...p }));

  useEffect(() => {
    api.configCenter.listLlmProviders()
      .then((res: { items?: LlmProviderSummary[] }) => {
        const items = Array.isArray(res?.items) ? res.items : [];
        const opts = items
          .filter((p) => p.enabled && p.provider_key && p.model)
          .map((p) =>`${p.provider_key}/${p.model}`);
        setModelOptions(opts);
      })
      .catch(() => { /* 静默忽略 */ });
  }, []);

  const mergeConfig = (raw: Partial<AppDfaServiceConfig>): AppDfaServiceConfig => {
    const base = defaultConfig(projectId);
    const normalizedPassThreshold = typeof raw.pass_threshold === 'number'
      ? raw.pass_threshold
      : Number(raw.pass_threshold);
    return {
      ...base,
      ...raw,
      pass_threshold: Number.isFinite(normalizedPassThreshold) && normalizedPassThreshold > 0
        ? normalizedPassThreshold
        : base.pass_threshold,
      project_id: projectId,
      workers: { ...base.workers, ...(raw.workers && typeof raw.workers === 'object' ? raw.workers : {}) },
      judges: { ...base.judges, ...(raw.judges && typeof raw.judges === 'object' ? raw.judges : {}) },
    };
  };

  const reload = () => {
    let cancelled = false;
    setLoading(true);
    dfaApi.getConfig(projectId)
      .then((cfg) => {
        if (!cancelled) {
          const normalized = mergeConfig(cfg);
          setConfig(normalized);
          setSavedConfig(normalized);
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
  };

  useEffect(() => {
    return reload();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const persistConfig = async (nextConfig: AppDfaServiceConfig) => {
    setSaving(true);
    try {
      const saved = await dfaApi.saveConfig({ ...nextConfig, project_id: projectId });
      return mergeConfig(saved);
    } catch (err: any) {
      notify(`保存失败: ${err?.message ?? err}`, 'error');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handlePanelSave = async (panel: DfaPanelKey, label: string) => {
    if (panel === 'workers') {
      const agents = config.workers?.agents ?? [];
      if (agents.length === 0 || agents.every((a) => !a.model)) {
        notify('保存失败：请在「Workers 配置」中至少添加一个 Agent 实例并选择模型', 'error');
        return;
      }
    }
    setSavingPanel(panel);
    const payload = applyDfaPanel(savedConfig, config, panel);
    const saved = await persistConfig(payload);
    if (saved) {
      setSavedConfig(saved);
      setConfig((prev) => restoreOtherDfaPanels(saved, prev, panel));
      notify(`${label}已保存`, 'success');
    }
    setSavingPanel(null);
  };

  const handlePanelReset = (panel: DfaPanelKey, label: string) => {
    const defaults = defaultConfig(projectId);
    setConfig((prev) => applyDfaPanel(prev, defaults, panel));
    notify(`${label}已重置为默认值（尚未保存）`, 'info');
  };

  return (
    <div className={embedded ? 'space-y-6' : 'px-8 pt-8 pb-10 space-y-6'}>
      {feedbackNodes}

      {!embedded ? (
 <section className="rounded-[2rem] border border-theme-border bg-theme-bg-app p-6">
          <h1 className="mt-3 text-3xl font-black tracking-tight text-theme-text-primary">分析配置</h1>
          <p className="mt-2 text-sm text-theme-text-muted">
            配置 chimera-app-dataflow-analyse 数据流分析引擎的运行参数，修改后点击「保存配置」生效。
          </p>
          {config.updated_at && (
            <p className="mt-1 text-xs text-theme-text-muted">上次保存：{new Date(config.updated_at).toLocaleString()}</p>
          )}
        </section>
      ) : (
 <section className="rounded-[2rem] border border-theme-border bg-slate-50/70 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Settings size={18} className="text-rose-400" />
                <h2 className="text-xl font-black text-theme-text-primary">数据流分析参数配置</h2>
                <span className="rounded-full border border-rose-500/20 bg-rose-500/15 px-3 py-1 text-[11px] font-black tracking-[0.12em] text-rose-400">
                  chimera-app-dataflow-analyse
                </span>
              </div>
              <p className="mt-2 text-sm text-theme-text-muted">
                当前 Tab 中的全部配置项都归属于`chimera-app-dataflow-analyse` 微服务，用于控制数据流分析服务的追踪深度、轮次、重试和 Agent 模型行为。
              </p>
              {config.updated_at && (
                <p className="mt-1 text-xs text-theme-text-muted">上次保存：{new Date(config.updated_at).toLocaleString()}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => { void reload(); }}
              disabled={loading || saving}
 className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-bg-app px-4 py-2.5 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              刷新
            </button>
          </div>
        </section>
      )}

      {loading ? (
        <div className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-bg-app px-4 py-3 text-sm text-theme-text-secondary">
          <Loader2 size={15} className="animate-spin" />加载中...
        </div>
      ) : (
        <div className="space-y-6">
          <StaticPipelineFlow
            title={DATAFLOW_ANALYSIS_FLOW.title}
            subtitle={DATAFLOW_ANALYSIS_FLOW.subtitle}
            lanes={DATAFLOW_ANALYSIS_FLOW.lanes}
            notes={DATAFLOW_ANALYSIS_FLOW.notes}
          />
          {/* 基本配置 */}
          <SectionCard
            title="基本配置"
            subtitle="分析轮次控制"
            actions={(
              <PanelActions
                saving={savingPanel === 'basic'}
                onSave={() => { void handlePanelSave('basic', '基本配置'); }}
                onReset={() => handlePanelReset('basic', '基本配置')}
              />
            )}
          >
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <FieldRow label="max_rounds" hint="-1=无限">
                <NumberInput value={config.max_rounds} min={-1} onChange={(v) => patch({ max_rounds: v })} />
              </FieldRow>
              <FieldRow label="min_rounds" hint="最少通过轮数">
                <NumberInput value={config.min_rounds} min={1} max={20} onChange={(v) => patch({ min_rounds: v })} />
              </FieldRow>
              <FieldRow label="pass_threshold" hint="通过所需裁判数">
                <NumberInput value={config.pass_threshold} min={1} max={10} onChange={(v) => patch({ pass_threshold: v })} />
              </FieldRow>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4">
              <FieldRow
                label="max_rounds_exceeded_review_strategy"
                hint="单个数据流分析子任务达到最大轮次且评审仍未通过时的全局处理策略"
              >
                <select
                  value={config.max_rounds_exceeded_review_strategy}
                  onChange={(e) => patch({
                    max_rounds_exceeded_review_strategy: e.target.value as AppDfaServiceConfig['max_rounds_exceeded_review_strategy'],
                  })}
                  className="w-full rounded-lg border border-theme-border px-3 py-2 text-sm bg-theme-bg-app"
                >
                  <option value="treat_as_passed">默认通过，子任务按通过收敛</option>
                  <option value="treat_as_failed">判定失败，子任务按失败收敛</option>
                </select>
              </FieldRow>
              <p className="text-xs leading-5 text-theme-text-muted">
                该配置作用于单个`chimera-app-dataflow-analyse` 子任务；默认值为`treat_as_passed`，
                即当子任务达到`max_rounds_exceeded` 时，不再按失败处理，而是按通过收敛并继续后续流程。
              </p>
            </div>
          </SectionCard>

          {/* 数据流专用配置 */}
          <SectionCard
            title="数据流配置"
            subtitle="控制污点追踪深度与并发"
            actions={(
              <PanelActions
                saving={savingPanel === 'analysis'}
                onSave={() => { void handlePanelSave('analysis', '数据流配置'); }}
                onReset={() => handlePanelReset('analysis', '数据流配置')}
              />
            )}
          >
            <div className="grid grid-cols-2 gap-4">
              <FieldRow label="max_trace_depth" hint="最大追踪深度">
                <NumberInput value={config.max_trace_depth} min={1} max={20} onChange={(v) => patch({ max_trace_depth: v })} />
              </FieldRow>
              <FieldRow label="callee_concurrency" hint="BFS 并行度 1-64">
                <NumberInput value={config.callee_concurrency} min={1} max={64} onChange={(v) => patch({ callee_concurrency: v })} />
              </FieldRow>
            </div>
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
              <FieldRow label="agent_max_retries" hint="-1=无限">
                <NumberInput value={config.agent_max_retries} min={-1} onChange={(v) => patch({ agent_max_retries: v })} />
              </FieldRow>
              <FieldRow label="agent_retry_delay（秒）">
                <NumberInput value={config.agent_retry_delay} min={0} step={0.5} onChange={(v) => patch({ agent_retry_delay: v })} />
              </FieldRow>
              <FieldRow label="agent_run_timeout_seconds（秒）" hint="单次会话空闲超时">
                <NumberInput value={config.agent_run_timeout_seconds} min={60} step={1} onChange={(v) => patch({ agent_run_timeout_seconds: Math.max(60, Math.trunc(v || 60)) })} />
              </FieldRow>
              <FieldRow label="agent_timeout_max_retries" hint="-1=无限">
                <NumberInput value={config.agent_timeout_max_retries} min={-1} onChange={(v) => patch({ agent_timeout_max_retries: v })} />
              </FieldRow>
              <FieldRow label="pi_max_retries" hint="-1=无限">
                <NumberInput value={config.pi_max_retries} min={-1} onChange={(v) => patch({ pi_max_retries: v })} />
              </FieldRow>
              <FieldRow label="pi_retry_delay（秒）">
                <NumberInput value={config.pi_retry_delay} min={0} step={0.5} onChange={(v) => patch({ pi_retry_delay: v })} />
              </FieldRow>
            </div>
            <FieldRow label="agent_timeout_retry_enabled" hint="空闲超时后是否自动重试">
              <label className="inline-flex cursor-pointer items-center gap-3">
                <div className="relative">
                  <input type="checkbox" className="peer sr-only" checked={config.agent_timeout_retry_enabled} onChange={(e) => patch({ agent_timeout_retry_enabled: e.target.checked })} />
                  <div className="h-6 w-11 rounded-full bg-theme-elevated peer-checked:bg-violet-600 transition-colors" />
                  <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-theme-bg-app shadow transition-transform peer-checked:translate-x-5" />
                </div>
                <span className="text-sm text-theme-text-secondary">{config.agent_timeout_retry_enabled ? '开启空闲超时自动重试' : '关闭空闲超时自动重试'}</span>
              </label>
            </FieldRow>
          </SectionCard>

          {/* Workers */}
          <RoleConfigBlock
            title="Workers 配置"
            subtitle="执行数据流分析工作的 Agent（必填：至少添加一个 Agent 并选择模型才能保存）"
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
            subtitle="评判 Worker 结果的 Agent"
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
