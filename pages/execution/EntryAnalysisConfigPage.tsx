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
  agent_max_retries: -1,
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
  lean_mode: false,
  lean_file_max_rounds: -1,
  lean_module_max_rounds: -1,
  api_filter_entry_judge: true,
  workers: defaultRole(),
  judges: defaultRole(),
  output_dir: '/data/output',
  archive_dir: '/data/output',
  result_dir: '/data/output',
});

// ─── 子组件 ────────────────────────────────────────────────────────────────────

const SectionCard: React.FC<{ title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }> = ({ title, subtitle, actions, children }) => (
  <section style={{ borderRadius: '12px', border: '1px solid #26324a', backgroundColor: '#111a2b', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
      <div>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#f5f7ff', margin: 0 }}>{title}</h2>
        {subtitle && <p style={{ marginTop: '2px', fontSize: '12px', color: '#a4aec4' }}>{subtitle}</p>}
      </div>
      {actions}
    </div>
    {children}
  </section>
);

const FieldRow: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
    <label style={{ fontSize: '14px', fontWeight: 600, color: '#d6def0' }}>
      {label}
      {hint && <span style={{ marginLeft: '8px', fontSize: '12px', fontWeight: 400, color: '#72809a' }}>{hint}</span>}
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
      style={{ width: '100%', borderRadius: '8px', border: '1px solid #26324a', padding: '8px 12px', fontSize: '14px', backgroundColor: '#18233a', color: '#f5f7ff', outline: 'none', boxSizing: 'border-box' }} />
  );
};

const TextInput: React.FC<{ value: string; placeholder?: string; onChange: (v: string) => void }> = ({ value, placeholder, onChange }) => (
  <input type="text" placeholder={placeholder} value={value}
    onChange={(e) => onChange(e.target.value)}
    style={{ width: '100%', borderRadius: '8px', border: '1px solid #26324a', padding: '8px 12px', fontSize: '14px', backgroundColor: '#18233a', color: '#f5f7ff', outline: 'none', boxSizing: 'border-box' }} />
);

const ModelSelect: React.FC<{ value: string; options: string[]; onChange: (v: string) => void }> = ({ value, options, onChange }) => {
  const allOpts = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      style={{ width: '100%', borderRadius: '8px', border: '1px solid #26324a', padding: '8px 12px', fontSize: '14px', backgroundColor: '#18233a', color: '#f5f7ff', outline: 'none', boxSizing: 'border-box' }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {agents.map((agent, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '12px', border: '1px solid #1b2438', backgroundColor: '#18233a', padding: '12px' }}>
          <div style={{ flex: 1 }}>
            <ModelSelect value={agent.model} options={modelOptions} onChange={(v) => update(i, { model: v })} />
          </div>
          <button onClick={() => remove(i)} style={{ flexShrink: 0, borderRadius: '8px', border: '1px solid rgba(241,93,93,0.3)', padding: '8px', color: '#f15d5d', backgroundColor: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={14} /></button>
        </div>
      ))}
      <button onClick={add} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', borderRadius: '12px', border: '1px dashed #26324a', padding: '8px 16px', fontSize: '14px', color: '#a4aec4', backgroundColor: 'transparent', cursor: 'pointer' }}>
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
        lean_mode: source.lean_mode,
        api_filter_entry_judge: source.api_filter_entry_judge,
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
  <div style={{ display: 'flex', flexShrink: 0, alignItems: 'center', gap: '8px' }}>
    <button
      type="button"
      onClick={onReset}
      disabled={saving}
      style={{ borderRadius: '12px', border: '1px solid #26324a', backgroundColor: '#18233a', padding: '8px 12px', fontSize: '12px', fontWeight: 600, color: '#d6def0', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.5 : 1 }}
    >
      重置为默认
    </button>
    <button
      type="button"
      onClick={onSave}
      disabled={saving}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '12px', backgroundColor: '#4f73ff', padding: '8px 12px', fontSize: '12px', fontWeight: 600, color: '#f5f7ff', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.5 : 1, border: 'none' }}
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
          .map((p) =>`${p.provider_key}/${p.model}`);
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
    <div style={embedded ? { display: 'flex', flexDirection: 'column', gap: '24px' } : { padding: '32px', paddingTop: '32px', paddingBottom: '40px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {feedbackNodes}

      {!embedded && (
        <section style={{ borderRadius: '24px', border: '1px solid #26324a', backgroundColor: 'rgba(17,26,43,0.9)', padding: '24px' }}>
          <p style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3em', color: '#4f73ff' }}>Entry Analysis</p>
          <h1 style={{ marginTop: '12px', fontSize: '30px', fontWeight: 600, letterSpacing: '-0.02em', color: '#f5f7ff' }}>分析配置</h1>
          <p style={{ marginTop: '8px', fontSize: '14px', color: '#a4aec4' }}>配置 chimera-app-entry-analyse 分析引擎的运行参数，修改后点击「保存配置」生效。</p>
          {config.updated_at && (
            <p style={{ marginTop: '4px', fontSize: '12px', color: '#72809a' }}>上次保存：{new Date(config.updated_at).toLocaleString()}</p>
          )}
        </section>
      )}

      {loading ? (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '12px', border: '1px solid #26324a', backgroundColor: '#18233a', padding: '12px 16px', fontSize: '14px', color: '#d6def0' }}>
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
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <FieldRow label="单 Pod 任务并发上限" hint="每个 worker Pod 可同时运行的任务数">
                <NumberInput value={config.max_concurrent_tasks} min={1} max={128} onChange={(v) => patch({ max_concurrent_tasks: Math.max(1, Math.min(128, Math.trunc(v || 1))) })} />
              </FieldRow>
              <FieldRow label="单 Pod 智能体进程上限" hint="配置保存后由 worker 心跳热生效">
                <NumberInput value={config.agent_process_limit} min={1} max={128} onChange={(v) => patch({ agent_process_limit: Math.max(1, Math.min(128, Math.trunc(v || 1))) })} />
              </FieldRow>
              <FieldRow label="Pod 智能体占用/可用" hint="只读观测值，由 worker 心跳上报">
                <div style={{ borderRadius: '8px', border: '1px solid #26324a', backgroundColor: '#18233a', padding: '8px 12px', fontSize: '14px', color: '#d6def0' }}>
                  {(slotCluster?.agent_in_use ?? 0)} / {(slotCluster?.agent_available ?? 0)}
                </div>
              </FieldRow>
              <FieldRow label="智能体等待请求" hint="多个任务竞争同一 Pod 槽位时按 FIFO 排队">
                <div style={{ borderRadius: '8px', border: '1px solid #26324a', backgroundColor: '#18233a', padding: '8px 12px', fontSize: '14px', color: '#d6def0' }}>
                  {(slotCluster?.agent_waiting_requests ?? 0)} 请求 / {(slotCluster?.agent_waiting_tasks ?? 0)} 任务
                </div>
              </FieldRow>
            </div>

            {/* 各阶段轮次独立配置 */}
            {/* 精简模式配置（独立区块，橙色边框，与完整模式配置并列） */}
            <div style={{ borderRadius: '12px', border: '2px solid ' + (config.lean_mode ? '#d5a13a' : '#26324a'), padding: '16px', transitionProperty: 'background-color, border-color', transitionDuration: '150ms', backgroundColor: config.lean_mode ? 'rgba(213,161,58,0.1)' : '#18233a' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#f5f7ff' }}>
                    精简模式 <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '12px', fontWeight: 400, color: '#a4aec4' }}>Lean Mode</span>
                  </div>
                  <p style={{ marginTop: '4px', fontSize: '12px', color: '#a4aec4' }}>
                    跳过 R1b 行号校正、调用链建图、per-function R2/R3 精细分析。
                    Worker 编写 Python 分析脚本批量处理整个文件，Judge 先审脚本再审结果。
                    速度提升约 5-10×，允许一定漏报误报，适合快速筛查。
                  </p>
                </div>
                <label style={{ display: 'inline-flex', cursor: 'pointer', alignItems: 'center', gap: '12px', flexShrink: 0, marginLeft: '16px' }}>
                  <div style={{ position: 'relative' }}>
                    <input type="checkbox" style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', borderWidth: 0 }}
                      checked={config.lean_mode}
                      onChange={(e) => patch({ lean_mode: e.target.checked })} />
                    <div style={{ height: '24px', width: '44px', borderRadius: '9999px', backgroundColor: config.lean_mode ? '#d5a13a' : '#26324a', transitionProperty: 'background-color', transitionDuration: '150ms' }} />
                    <div style={{ position: 'absolute', left: '2px', top: '2px', height: '20px', width: '20px', borderRadius: '9999px', backgroundColor: '#fff', transform: config.lean_mode ? 'translateX(20px)' : 'translateX(0)', transitionProperty: 'transform', transitionDuration: '150ms' }} />
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: config.lean_mode ? '#d5a13a' : '#a4aec4' }}>
                    {config.lean_mode ? '精简模式' : '完整模式'}
                  </span>
                </label>
              </div>
              {config.lean_mode && (
                <div style={{ marginTop: '16px', fontSize: '12px', color: '#d5a13a', fontWeight: 500 }}>
                  精简模式已开启：跳过 R2 行号校正、调用链建图及 per-function 精细分析。
                </div>
              )}

              {/* API_Filter 入口判断开关 */}
              <div style={{ marginTop: '16px', borderRadius: '12px', border: '1px solid #4f8cff', backgroundColor: 'rgba(79,140,255,0.1)', padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#f5f7ff' }}>
                      API_Filter 入口判断
                      <span style={{ marginLeft: '8px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '12px', fontWeight: 400, color: '#a4aec4' }}>api_filter_entry_judge</span>
                    </div>
                    <p style={{ marginTop: '4px', fontSize: '12px', color: '#a4aec4' }}>
                      {config.api_filter_entry_judge
                        ? 'Direct LLM API 在 R3 前判断函数是否入口；R3 仅做污点分析。速度更快，适合大多数场景。'
                        : 'R3 Agent 完整判断入口 + 分析污点。精确度最高，适合对漏报征阶最严格的场景。'}
                    </p>
                  </div>
                  <label style={{ display: 'inline-flex', cursor: 'pointer', alignItems: 'center', gap: '12px', flexShrink: 0, marginLeft: '16px' }}>
                    <div style={{ position: 'relative' }}>
                      <input type="checkbox" style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', borderWidth: 0 }}
                        checked={config.api_filter_entry_judge}
                        onChange={(e) => patch({ api_filter_entry_judge: e.target.checked })} />
                      <div style={{ height: '24px', width: '44px', borderRadius: '9999px', backgroundColor: config.api_filter_entry_judge ? '#4f8cff' : '#26324a', transitionProperty: 'background-color', transitionDuration: '150ms' }} />
                      <div style={{ position: 'absolute', left: '2px', top: '2px', height: '20px', width: '20px', borderRadius: '9999px', backgroundColor: '#fff', transform: config.api_filter_entry_judge ? 'translateX(20px)' : 'translateX(0)', transitionProperty: 'transform', transitionDuration: '150ms' }} />
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: config.api_filter_entry_judge ? '#4f8cff' : '#a4aec4' }}>
                      {config.api_filter_entry_judge ? 'API 判断入口' : 'R3 判断入口'}
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <FieldRow label="智能体并发说明" hint="单任务内不再单独限流">
              <p style={{ fontSize: '12px', lineHeight: '20px', color: '#a4aec4' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
              <FieldRow label="agent_max_retries" hint="默认无限重试"><NumberInput value={config.agent_max_retries} min={-1} onChange={(v) => patch({ agent_max_retries: v })} /></FieldRow>
              <FieldRow label="agent_retry_delay（秒）"><NumberInput value={config.agent_retry_delay} min={0} step={0.5} onChange={(v) => patch({ agent_retry_delay: v })} /></FieldRow>
              <FieldRow label="agent_run_timeout_seconds（秒）" hint="单次会话空闲超时"><NumberInput value={config.agent_run_timeout_seconds} min={60} step={1} onChange={(v) => patch({ agent_run_timeout_seconds: Math.max(60, Math.trunc(v || 60)) })} /></FieldRow>
              <FieldRow label="agent_timeout_max_retries" hint="-1=无限"><NumberInput value={config.agent_timeout_max_retries} min={-1} onChange={(v) => patch({ agent_timeout_max_retries: v })} /></FieldRow>
              <FieldRow label="pi_max_retries" hint="-1=无限"><NumberInput value={config.pi_max_retries} min={-1} onChange={(v) => patch({ pi_max_retries: v })} /></FieldRow>
              <FieldRow label="pi_retry_delay（秒）"><NumberInput value={config.pi_retry_delay} min={0} step={0.5} onChange={(v) => patch({ pi_retry_delay: v })} /></FieldRow>
            </div>
            <FieldRow label="agent_timeout_retry_enabled" hint="空闲超时后是否自动重试">
              <label style={{ display: 'inline-flex', cursor: 'pointer', alignItems: 'center', gap: '12px' }}>
                <div style={{ position: 'relative' }}>
                  <input type="checkbox" style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', borderWidth: 0 }} checked={config.agent_timeout_retry_enabled} onChange={(e) => patch({ agent_timeout_retry_enabled: e.target.checked })} />
                  <div style={{ height: '24px', width: '44px', borderRadius: '9999px', backgroundColor: config.agent_timeout_retry_enabled ? '#4f73ff' : '#26324a', transitionProperty: 'background-color', transitionDuration: '150ms' }} />
                  <div style={{ position: 'absolute', left: '2px', top: '2px', height: '20px', width: '20px', borderRadius: '9999px', backgroundColor: '#fff', transform: config.agent_timeout_retry_enabled ? 'translateX(20px)' : 'translateX(0)', transitionProperty: 'transform', transitionDuration: '150ms' }} />
                </div>
                <span style={{ fontSize: '14px', color: '#d6def0' }}>{config.agent_timeout_retry_enabled ? '开启超时自动重试' : '关闭超时自动重试'}</span>
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
