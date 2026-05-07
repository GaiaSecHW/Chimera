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
  max_rounds: 3,
  min_rounds: 2,
  pass_threshold: 1,
  agent_max_retries: 100,
  agent_retry_delay: 30,
  pi_max_retries: -1,
  pi_retry_delay: 5,
  workers: defaultRole(),
  judges: defaultRole(),
  output_dir: '/data/output',
  archive_dir: '/data/output',
  result_dir: '/data/output',
});

// ─── 子组件 ────────────────────────────────────────────────────────────────────

const SectionCard: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
    <div>
      <h2 className="text-base font-black text-slate-900">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
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

const NumberInput: React.FC<{ value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void }> = ({ value, min, max, step = 1, onChange }) => (
  <input type="number" min={min} max={max} step={step} value={value}
    onChange={(e) => onChange(Number(e.target.value))}
    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
);

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
  const add = () => onChange([...agents, { model: '', tools: null, thinking_level: null, system_prompt: null }]);
  const remove = (i: number) => onChange(agents.filter((_, idx) => idx !== i));
  const update = (i: number, p: Partial<EntryAnalysisAgentInstance>) => onChange(agents.map((a, idx) => idx === i ? { ...a, ...p } : a));
  return (
    <div className="space-y-3">
      {agents.map((agent, i) => (
        <div key={i} className="rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <ModelSelect value={agent.model} options={modelOptions} onChange={(v) => update(i, { model: v })} />
            </div>
            <button onClick={() => remove(i)} className="flex-shrink-0 rounded-lg border border-red-100 p-2 text-red-400 hover:bg-red-50"><Trash2 size={14} /></button>
          </div>
          <textarea
            rows={2}
            placeholder="System Prompt 覆盖（留空则使用 system_prompt_dir 文件）"
            value={agent.system_prompt ?? ''}
            onChange={(e) => update(i, { system_prompt: e.target.value || null })}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 placeholder-slate-300 resize-y font-mono"
          />
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
  modelOptions: string[];
  value: EntryAnalysisRoleConfig;
  onChange: (v: EntryAnalysisRoleConfig) => void;
}> = ({ title, subtitle, modelOptions, value, onChange }) => (
  <SectionCard title={title} subtitle={subtitle}>
    <div className="grid grid-cols-2 gap-4">
      <FieldRow label="default_model" hint="兜底模型（实例未指定时使用）">
        <ModelSelect value={value.default_model ?? ''} options={modelOptions} onChange={(v) => onChange({ ...value, default_model: v })} />
      </FieldRow>
      <FieldRow label="system_prompt_dir" hint="Prompt 文件目录（可留空）">
        <TextInput value={value.system_prompt_dir ?? ''} placeholder="./prompts/workers" onChange={(v) => onChange({ ...value, system_prompt_dir: v })} />
      </FieldRow>
    </div>
    <FieldRow label="Agent 实例列表">
      <AgentInstanceList agents={value.agents ?? []} modelOptions={modelOptions} onChange={(agents) => onChange({ ...value, agents })} />
    </FieldRow>
  </SectionCard>
);

// ─── 主页面 ────────────────────────────────────────────────────────────────────

export const EntryAnalysisConfigPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { notify, feedbackNodes } = useUiFeedback();
  const entryAnalysis = api.domains.execution.appEntryAnalyse;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<EntryAnalysisServiceConfig>(() => defaultConfig(projectId));
  const [modelOptions, setModelOptions] = useState<string[]>([]);

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
        }
      })
      .catch((err) => {
        if (!cancelled) {
          notify(`加载配置失败: ${err?.message ?? err}`, 'error');
          setConfig(defaultConfig(projectId));
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await entryAnalysis.saveConfig({ ...config, project_id: projectId });
      const base = defaultConfig(projectId);
      setConfig({
        ...base,
        ...saved,
        project_id: projectId,
        workers: { ...base.workers, ...(saved.workers && typeof saved.workers === 'object' ? saved.workers : {}) },
        judges: { ...base.judges, ...(saved.judges && typeof saved.judges === 'object' ? saved.judges : {}) },
      });
      notify('配置已保存', 'success');
    } catch (err: any) {
      notify(`保存失败: ${err?.message ?? err}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setConfig(defaultConfig(projectId));
    notify('已重置为默认值（尚未保存）', 'info');
  };

  return (
    <div className="px-8 pt-8 pb-10 space-y-6">
      {feedbackNodes}

      <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">Entry Analysis</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">分析配置</h1>
        <p className="mt-2 text-sm text-slate-500">配置 secflow-app-entry-analyse 分析引擎的运行参数，修改后点击「保存配置」生效。</p>
        {config.updated_at && (
          <p className="mt-1 text-xs text-slate-400">上次保存：{new Date(config.updated_at).toLocaleString()}</p>
        )}
      </section>

      {loading ? (
        <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          <Loader2 size={15} className="animate-spin" />加载中...
        </div>
      ) : (
        <div className="space-y-6">
          {/* 基本配置 */}
          <SectionCard title="基本配置" subtitle="分析轮次控制与重试策略">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <FieldRow label="max_rounds" hint="最大分析轮数"><NumberInput value={config.max_rounds} min={1} max={20} onChange={(v) => patch({ max_rounds: v })} /></FieldRow>
              <FieldRow label="min_rounds" hint="最少通过轮数"><NumberInput value={config.min_rounds} min={1} max={20} onChange={(v) => patch({ min_rounds: v })} /></FieldRow>
              <FieldRow label="pass_threshold" hint="通过所需裁判数"><NumberInput value={config.pass_threshold} min={1} max={10} onChange={(v) => patch({ pass_threshold: v })} /></FieldRow>
            </div>
          </SectionCard>

          {/* 重试配置 */}
          <SectionCard title="重试配置" subtitle="LLM API 重试与进程重启策略">
            <div className="grid grid-cols-2 gap-4">
              <FieldRow label="agent_max_retries" hint="-1=无限"><NumberInput value={config.agent_max_retries} min={-1} onChange={(v) => patch({ agent_max_retries: v })} /></FieldRow>
              <FieldRow label="agent_retry_delay（秒）"><NumberInput value={config.agent_retry_delay} min={0} step={0.5} onChange={(v) => patch({ agent_retry_delay: v })} /></FieldRow>
              <FieldRow label="pi_max_retries" hint="-1=无限"><NumberInput value={config.pi_max_retries} min={-1} onChange={(v) => patch({ pi_max_retries: v })} /></FieldRow>
              <FieldRow label="pi_retry_delay（秒）"><NumberInput value={config.pi_retry_delay} min={0} step={0.5} onChange={(v) => patch({ pi_retry_delay: v })} /></FieldRow>
            </div>
          </SectionCard>

          {/* Workers */}
          <RoleConfigBlock
            title="Workers 配置"
            subtitle="串行逐文件分析 — 仅使用第一个实例（agents[0]），多余实例无效"
            modelOptions={modelOptions}
            value={config.workers}
            onChange={(v) => patch({ workers: v })}
          />

          {/* Judges */}
          <RoleConfigBlock
            title="Judges 配置"
            subtitle="并行评审 — 实例列表中每一项对应一个并行 Judge 进程，数量即并行度"
            modelOptions={modelOptions}
            value={config.judges}
            onChange={(v) => patch({ judges: v })}
          />

          <div className="flex items-center gap-3">
            <button onClick={() => void handleSave()} disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {saving && <Loader2 size={14} className="animate-spin" />}
              保存配置
            </button>
            <button onClick={handleReset} disabled={saving}
              className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              重置为默认
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
