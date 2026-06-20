/* @refresh reset */
import React, { useEffect, useState } from 'react';
import { Loader2, Plus, RefreshCw, Settings, Trash2 } from 'lucide-react';

import { api } from '../../clients/api';
import { AppDfaAgentInstance, AppDfaRoleConfig, AppDfaServiceConfig, LlmProviderSummary } from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';
import { StaticPipelineFlow } from './StaticPipelineFlow';

const DATAFLOW_ANALYSIS_FLOW = {
  title: 'CFG Guided Explore阶段推进关系',
  subtitle: '展示CFG Guided Explore服务的静态推进路径，用于辅助理解追踪深度、并发、Worker 与脚本校验配置。',
  lanes: [
    {
      label: '任务推进链路',
      steps: [
        { id: 'dfa-prepare', title: '任务准备', desc: '解析配置、初始化工作区并装载上游结果。', badge: '1', tone: 'analysis' as const },
        { id: 'dfa-worker', title: 'Worker 分析', desc: '单个 Worker 同时跟踪当前函数所有污点并输出结构化图谱。', badge: '2', tone: 'analysis' as const },
        { id: 'dfa-validator', title: '脚本校验', desc: '校验 taint-graph/dataflow/tainted.list 等产物是否符合合同。', badge: '3', tone: 'review' as const },
        { id: 'dfa-report', title: '报告输出', desc: '生成 Markdown、SQLite 图数据库与漏洞产物。', badge: '4', tone: 'artifact' as const },
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
      title: '脚本校验',
      detail: '本微服务不使用 Judge；Worker 输出由后端脚本校验结构合同，确保产物格式可被图数据库消费。',
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
  pass_threshold: 0,
  agent_max_retries: -1,
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
  judges: { ...defaultRole(), agents: [] },
  output_dir: '/data/output',
  archive_dir: '/data/output',
  result_dir: '/data/output',
});

// ─── 子组件 ────────────────────────────────────────────────────────────────────

const SectionCard: React.FC<{ title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }> = ({ title, subtitle, actions, children }) => (
 <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6 space-y-4">
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
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

const ModelSelect: React.FC<{ value: string; options: string[]; onChange: (v: string) => void }> = ({ value, options, onChange }) => {
  const allOpts = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-slate-50">
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
        <div key={i} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
          <div className="flex-1">
            <ModelSelect value={agent.model} options={modelOptions} onChange={(v) => update(i, { model: v })} />
          </div>
          <button onClick={() => remove(i)} disabled={agents.length <= 1}
            className="flex-shrink-0 rounded-lg border border-red-100 p-2 text-red-400 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button onClick={add}
        className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-4 py-2 text-sm text-slate-500 hover:bg-slate-100">
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

type DfaPanelKey = 'basic' | 'analysis' | 'retry' | 'workers';

const DFA_PANEL_KEYS: DfaPanelKey[] = ['basic', 'analysis', 'retry', 'workers'];

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
        pass_threshold: 0,
      };
    case 'analysis':
      return {
        ...base,
        max_trace_depth: source.max_trace_depth,
        deep_trace_enabled: source.deep_trace_enabled,
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
      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
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

export const CfgGuidedExploreConfigPage: React.FC<{ projectId: string; embedded?: boolean }> = ({ projectId, embedded = false }) => {
  const { notify, feedbackNodes } = useUiFeedback();
  const dfaApi = api.domains.execution.cfgGuidedExplore;

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
    return {
      ...base,
      ...raw,
      pass_threshold: 0,
      project_id: projectId,
      workers: { ...base.workers, ...(raw.workers && typeof raw.workers === 'object' ? raw.workers : {}) },
      judges: { ...base.judges, agents: [] },
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
 <section className="rounded-[2rem] border border-slate-200 bg-slate-50 p-6">
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">分析配置</h1>
          <p className="mt-2 text-sm text-slate-500">
            配置 secflow-app-cfg-guided-explore CFG Guided Explore引擎的运行参数，修改后点击「保存配置」生效。
          </p>
          {config.updated_at && (
            <p className="mt-1 text-xs text-slate-400">上次保存：{new Date(config.updated_at).toLocaleString()}</p>
          )}
        </section>
      ) : (
 <section className="rounded-[2rem] border border-slate-200 bg-slate-50/70 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Settings size={18} className="text-rose-600" />
                <h2 className="text-xl font-semibold text-slate-900">CFG Guided Explore参数配置</h2>
                <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-medium tracking-[0.12em] text-rose-700">
                  secflow-app-cfg-guided-explore
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                当前 Tab 中的全部配置项都归属于`secflow-app-cfg-guided-explore` 微服务，用于控制CFG Guided Explore服务的追踪深度、轮次、重试和 Agent 模型行为。
              </p>
              {config.updated_at && (
                <p className="mt-1 text-xs text-slate-400">上次保存：{new Date(config.updated_at).toLocaleString()}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => { void reload(); }}
              disabled={loading || saving}
 className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              刷新
            </button>
          </div>
        </section>
      )}

      {loading ? (
        <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
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
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FieldRow label="max_rounds" hint="保留兼容；当前脚本校验模式通常只运行 1 轮 Worker">
                <NumberInput value={config.max_rounds} min={1} onChange={(v) => patch({ max_rounds: v })} />
              </FieldRow>
              <FieldRow label="min_rounds" hint="保留兼容；无 Judge 时不用于评审收敛">
                <NumberInput value={config.min_rounds} min={1} max={20} onChange={(v) => patch({ min_rounds: v })} />
              </FieldRow>
            </div>
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
              本微服务当前采用 <b>Worker + 脚本校验</b> 架构：不配置 Judge，`pass_threshold=0` 固定由后端保存，结果通过 taint-graph/dataflow/tainted.list 结构校验决定。
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4">
              <FieldRow
                label="max_rounds_exceeded_review_strategy"
                hint="Worker 输出不符合结构合同时的兼容处理策略；当前主要由脚本校验直接判定"
              >
                <select
                  value={config.max_rounds_exceeded_review_strategy}
                  onChange={(e) => patch({
                    max_rounds_exceeded_review_strategy: e.target.value as AppDfaServiceConfig['max_rounds_exceeded_review_strategy'],
                  })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-slate-50"
                >
                  <option value="treat_as_passed">默认通过，子任务按通过收敛</option>
                  <option value="treat_as_failed">判定失败，子任务按失败收敛</option>
                </select>
              </FieldRow>
              <p className="text-xs leading-5 text-slate-500">
                该配置为兼容字段；当前服务不使用 Judge，Worker 产物会由脚本校验结构合同并写入 SQLite 图数据库。
              </p>
            </div>
          </SectionCard>

          {/* 数据流专用配置 */}
          <SectionCard
            title="CFG Guided Explore 配置"
            subtitle="控制污点追踪深度与并发"
            actions={(
              <PanelActions
                saving={savingPanel === 'analysis'}
                onSave={() => { void handlePanelSave('analysis', 'CFG Guided Explore 配置'); }}
                onReset={() => handlePanelReset('analysis', 'CFG Guided Explore 配置')}
              />
            )}
          >
            <div className="grid grid-cols-2 gap-4">
              <FieldRow label="max_trace_depth" hint={config.deep_trace_enabled ? '深度探索模式已开启，此值仅作显示/回退' : '最大追踪深度'}>
                <NumberInput value={config.max_trace_depth} min={1} max={1000} onChange={(v) => patch({ max_trace_depth: v })} />
              </FieldRow>
              <FieldRow label="deep_trace_enabled" hint="开启后不按 max_trace_depth 截断，依赖污点收敛去重">
                <label className="inline-flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                  <div className="relative">
                    <input type="checkbox" className="peer sr-only" checked={!!config.deep_trace_enabled} onChange={(e) => patch({ deep_trace_enabled: e.target.checked })} />
                    <div className="h-6 w-11 rounded-full bg-slate-200 peer-checked:bg-violet-600 transition-colors" />
                    <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-slate-50 shadow transition-transform peer-checked:translate-x-5" />
                  </div>
                  <span className="text-sm text-slate-600">{config.deep_trace_enabled ? '深度探索开启' : '深度探索关闭'}</span>
                </label>
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
              <FieldRow label="agent_max_retries" hint="默认无限重试">
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
                  <div className="h-6 w-11 rounded-full bg-slate-200 peer-checked:bg-violet-600 transition-colors" />
                  <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-slate-50 shadow transition-transform peer-checked:translate-x-5" />
                </div>
                <span className="text-sm text-slate-600">{config.agent_timeout_retry_enabled ? '开启空闲超时自动重试' : '关闭空闲超时自动重试'}</span>
              </label>
            </FieldRow>
          </SectionCard>

          {/* Workers */}
          <RoleConfigBlock
            title="Workers 配置"
            subtitle="单 Worker 负责当前函数所有污点；不再按污点拆分 Worker，不配置 Judge。"
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
        </div>
      )}
    </div>
  );
};
