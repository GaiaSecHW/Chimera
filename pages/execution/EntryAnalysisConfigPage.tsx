import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';

import { api } from '../../clients/api';
import {
  EntryAnalysisAgentInstance,
  EntryAnalysisRoleConfig,
  EntryAnalysisServiceConfig,
} from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';

const TOOL_OPTIONS = ['read', 'bash', 'edit', 'write', 'grep', 'find'];
const THINKING_LEVELS = ['off', 'low', 'medium', 'high'] as const;

const defaultRole = (): EntryAnalysisRoleConfig => ({
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

const AgentInstanceList: React.FC<{ agents: EntryAnalysisAgentInstance[]; onChange: (agents: EntryAnalysisAgentInstance[]) => void }> = ({ agents, onChange }) => {
  const add = () => onChange([...agents, { model: '', tools: null, thinking_level: null }]);
  const remove = (i: number) => onChange(agents.filter((_, idx) => idx !== i));
  const update = (i: number, patch: Partial<EntryAnalysisAgentInstance>) => onChange(agents.map((a, idx) => idx === i ? { ...a, ...patch } : a));
  return (
    <div className="space-y-2">
      {agents.map((agent, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 items-start">
          <FieldRow label="模型"><TextInput value={agent.model} placeholder="vllm/org/Model" onChange={(v) => update(i, { model: v })} /></FieldRow>
          <FieldRow label="thinking_level">
            <select value={agent.thinking_level ?? 'off'} onChange={(e) => update(i, { thinking_level: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
              {THINKING_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="工具（逗号分隔）">
            <TextInput value={agent.tools?.join(',') ?? ''} placeholder="read,bash,edit"
              onChange={(v) => update(i, { tools: v ? v.split(',').map((s) => s.trim()).filter(Boolean) : null })} />
          </FieldRow>
          <button onClick={() => remove(i)} className="mt-6 rounded-lg border border-red-100 p-2 text-red-400 hover:bg-red-50"><Trash2 size={14} /></button>
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
  value: EntryAnalysisRoleConfig;
  onChange: (v: EntryAnalysisRoleConfig) => void;
}> = ({ title, subtitle, value, onChange }) => (
  <SectionCard title={title} subtitle={subtitle}>
    <FieldRow label="default_thinking_level">
      <select value={value.default_thinking_level ?? 'off'} onChange={(e) => onChange({ ...value, default_thinking_level: e.target.value })}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
        {THINKING_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
      </select>
    </FieldRow>
    <FieldRow label="default_tools">
      <div className="flex flex-wrap gap-3 mt-1">
        {TOOL_OPTIONS.map((tool) => (
          <label key={tool} className="inline-flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={(value.default_tools ?? []).includes(tool)}
              onChange={(e) => {
                const tools = value.default_tools ?? [];
                onChange({ ...value, default_tools: e.target.checked ? [...tools, tool] : tools.filter((t) => t !== tool) });
              }} />
            {tool}
          </label>
        ))}
      </div>
    </FieldRow>
    <FieldRow label="Agent 实例列表">
      <AgentInstanceList agents={value.agents ?? []} onChange={(agents) => onChange({ ...value, agents })} />
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

  const patch = (p: Partial<EntryAnalysisServiceConfig>) => setConfig((prev) => ({ ...prev, ...p }));

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
            subtitle="执行入口分析工作的 Agent"
            value={config.workers}
            onChange={(v) => patch({ workers: v })}
          />

          {/* Judges */}
          <RoleConfigBlock
            title="Judges 配置"
            subtitle="评判 Worker 结果的 Agent"
            value={config.judges}
            onChange={(v) => patch({ judges: v })}
          />

          {/* 路径配置 */}
          <SectionCard title="路径配置" subtitle="输出目录设置">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <FieldRow label="output_dir"><TextInput value={config.output_dir} onChange={(v) => patch({ output_dir: v })} /></FieldRow>
              <FieldRow label="archive_dir"><TextInput value={config.archive_dir} onChange={(v) => patch({ archive_dir: v })} /></FieldRow>
              <FieldRow label="result_dir"><TextInput value={config.result_dir} onChange={(v) => patch({ result_dir: v })} /></FieldRow>
            </div>
          </SectionCard>

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
