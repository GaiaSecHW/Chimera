import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';

import { api } from '../../clients/api';
import {
  SystemAnalysisAgentInstance,
  SystemAnalysisRoleConfig,
  SystemAnalysisServiceConfig,
  SystemAnalysisStageLoopConfig,
  SystemAnalysisStagesConfig,
} from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';

// ─── 常量 ──────────────────────────────────────────────────────────────────────

const ANALYSE_TARGET_OPTIONS = [
  { value: 'all', label: '全部（all）' },
  { value: 'binary', label: 'binary — ELF/共享库/内核模块' },
  { value: 'script', label: 'script — Shell/Python/Lua 等' },
  { value: 'source', label: 'source — C/C++ 源代码' },
  { value: 'config', label: 'config — 配置文件' },
  { value: 'firmware', label: 'firmware — 固件/Boot' },
  { value: 'crypto', label: 'crypto — 证书/密钥' },
  { value: 'database', label: 'database — 数据库' },
  { value: 'web', label: 'web — Web 前后端' },
  { value: 'network_model', label: 'network_model — 网络模型' },
  { value: 'document', label: 'document — 文档/日志' },
  { value: 'archive', label: 'archive — 压缩包' },
];

const BINARY_ARCH_OPTIONS = [
  'all', 'x86', 'x86_64', 'arm', 'aarch64', 'mips', 'mips64', 'ppc', 'ppc64', 'riscv', 's390',
];

const TOOL_OPTIONS = ['read', 'bash', 'edit', 'write', 'grep', 'find'];
const THINKING_LEVELS = ['off', 'low', 'medium', 'high'] as const;
const WORKER_STAGES = ['explore', 'classify', 'refine', 'sub_read', 'analyse', 'report'];
const JUDGE_STAGES = ['classify', 'refine', 'analyse', 'completeness', 'report'];

// ─── 默认值 ────────────────────────────────────────────────────────────────────

const defaultRole = (): SystemAnalysisRoleConfig => ({
  default_tools: ['read', 'bash', 'edit', 'write'],
  system_prompt_dir: '',
  default_thinking_level: 'off',
  agents: [],
  stage_models: {},
});

const defaultConfig = (projectId: string): SystemAnalysisServiceConfig => ({
  project_id: projectId,
  analyse_targets: ['all'],
  binary_arch: ['all'],
  parallel_modules: 1,
  parallel_sub_workers: 1,
  agent_max_retries: 100,
  agent_retry_delay: 30,
  pi_max_retries: -1,
  pi_retry_delay: 10,
  stages: {
    classify: { min_rounds: 2, max_rounds: 5, pass_mode: 'majority' },
    refine: { min_rounds: 2, max_rounds: 3, pass_mode: 'majority' },
    analyse: { min_rounds: 2, max_rounds: 5, pass_mode: 'majority' },
    final_check: { min_rounds: 1, max_rounds: 1, pass_mode: 'all' },
  },
  workers: defaultRole(),
  judges: defaultRole(),
  output_dir: '/data/output',
  archive_dir: '/data/output',
  result_dir: '/data/output',
  start_stage: 1,
  resume_workspace: '',
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

const SelectInput: React.FC<{ value: string; options: string[]; onChange: (v: string) => void }> = ({ value, options, onChange }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)}
    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
    {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
  </select>
);

const StageCard: React.FC<{ label: string; value: SystemAnalysisStageLoopConfig; onChange: (v: SystemAnalysisStageLoopConfig) => void }> = ({ label, value, onChange }) => (
  <div className="rounded-xl border border-slate-200 p-4 space-y-3">
    <p className="text-sm font-bold text-slate-800">{label}</p>
    <div className="grid grid-cols-3 gap-3">
      <FieldRow label="最少轮数"><NumberInput value={value.min_rounds} min={0} onChange={(v) => onChange({ ...value, min_rounds: v })} /></FieldRow>
      <FieldRow label="最多轮数" hint="-1=无限"><NumberInput value={value.max_rounds} min={-1} onChange={(v) => onChange({ ...value, max_rounds: v })} /></FieldRow>
      <FieldRow label="通过模式"><SelectInput value={value.pass_mode} options={['majority', 'all']} onChange={(v) => onChange({ ...value, pass_mode: v as 'majority' | 'all' })} /></FieldRow>
    </div>
  </div>
);

const AgentInstanceList: React.FC<{ agents: SystemAnalysisAgentInstance[]; onChange: (agents: SystemAnalysisAgentInstance[]) => void }> = ({ agents, onChange }) => {
  const add = () => onChange([...agents, { model: '', tools: null, thinking_level: null }]);
  const remove = (i: number) => onChange(agents.filter((_, idx) => idx !== i));
  const update = (i: number, patch: Partial<SystemAnalysisAgentInstance>) => onChange(agents.map((a, idx) => idx === i ? { ...a, ...patch } : a));
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

const StageModelsEditor: React.FC<{ stageNames: string[]; value: Record<string, string>; onChange: (v: Record<string, string>) => void }> = ({ stageNames, value, onChange }) => (
  <div className="grid grid-cols-2 gap-3">
    {stageNames.map((stage) => (
      <FieldRow key={stage} label={stage}>
        <TextInput value={value[stage] ?? ''} placeholder="留空则使用 agents[0].model"
          onChange={(v) => { const next = { ...value }; if (v) next[stage] = v; else delete next[stage]; onChange(next); }} />
      </FieldRow>
    ))}
  </div>
);

const RoleConfigBlock: React.FC<{ title: string; subtitle?: string; stageNames: string[]; value: SystemAnalysisRoleConfig; onChange: (v: SystemAnalysisRoleConfig) => void }> = ({ title, subtitle, stageNames, value, onChange }) => (
  <SectionCard title={title} subtitle={subtitle}>
    <FieldRow label="default_thinking_level">
      <SelectInput value={value.default_thinking_level} options={[...THINKING_LEVELS]} onChange={(v) => onChange({ ...value, default_thinking_level: v })} />
    </FieldRow>
    <FieldRow label="default_tools">
      <div className="flex flex-wrap gap-3 mt-1">
        {TOOL_OPTIONS.map((tool) => (
          <label key={tool} className="inline-flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={(value.default_tools ?? []).includes(tool)}
              onChange={(e) => { const tools = value.default_tools ?? []; onChange({ ...value, default_tools: e.target.checked ? [...tools, tool] : tools.filter((t) => t !== tool) }); }} />
            {tool}
          </label>
        ))}
      </div>
    </FieldRow>
    <FieldRow label="各阶段模型覆盖（stage_models）" hint="留空则使用 agents[0]">
      <StageModelsEditor stageNames={stageNames} value={value.stage_models ?? {}} onChange={(v) => onChange({ ...value, stage_models: v })} />
    </FieldRow>
    <FieldRow label="Agent 实例列表">
      <AgentInstanceList agents={value.agents ?? []} onChange={(agents) => onChange({ ...value, agents })} />
    </FieldRow>
  </SectionCard>
);

// ─── 主页面 ────────────────────────────────────────────────────────────────────

export const SystemAnalysisConfigPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { notify, feedbackNodes } = useUiFeedback();
  const systemAnalysis = api.domains.execution.appSystemAnalyse;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<SystemAnalysisServiceConfig>(() => defaultConfig(projectId));

  const patch = (p: Partial<SystemAnalysisServiceConfig>) => setConfig((prev) => ({ ...prev, ...p }));

  const patchStage = (key: keyof SystemAnalysisStagesConfig, p: Partial<SystemAnalysisStageLoopConfig>) =>
    setConfig((prev) => ({ ...prev, stages: { ...prev.stages, [key]: { ...prev.stages[key], ...p } } }));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    systemAnalysis.getConfig(projectId)
      .then((cfg) => {
        if (!cancelled) {
          // Always deep-merge with local defaults so missing/null nested fields
          // (stages, workers, judges) never cause a runtime crash.
          const base = defaultConfig(projectId);
          const safe: SystemAnalysisServiceConfig = {
            ...base,
            ...cfg,
            project_id: projectId,
            stages: {
              ...base.stages,
              ...(cfg.stages && typeof cfg.stages === 'object' ? cfg.stages : {}),
            },
            workers: {
              ...base.workers,
              ...(cfg.workers && typeof cfg.workers === 'object' ? cfg.workers : {}),
            },
            judges: {
              ...base.judges,
              ...(cfg.judges && typeof cfg.judges === 'object' ? cfg.judges : {}),
            },
          };
          setConfig(safe);
        }
      })
      .catch((err) => { if (!cancelled) { notify(`加载配置失败: ${err?.message ?? err}`, 'error'); setConfig(defaultConfig(projectId)); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await systemAnalysis.saveConfig({ ...config, project_id: projectId });
      const base = defaultConfig(projectId);
      setConfig({
        ...base,
        ...saved,
        project_id: projectId,
        stages: { ...base.stages, ...(saved.stages && typeof saved.stages === 'object' ? saved.stages : {}) },
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

      {/* 页头 */}
      <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-600">System Analysis</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">分析配置</h1>
        <p className="mt-2 text-sm text-slate-500">配置 secflow-app-system-analyse 分析引擎的运行参数，修改后点击「保存配置」生效。</p>
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
          {/* 1. 基本配置 */}
          <SectionCard title="基本配置" subtitle="分析目标类型、架构过滤、并发控制">
            <FieldRow label="analyse_targets" hint="选择需要分析的文件类型">
              <div className="grid grid-cols-2 gap-2 mt-1 md:grid-cols-3">
                {ANALYSE_TARGET_OPTIONS.map(({ value, label }) => (
                  <label key={value} className="inline-flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" className="mt-0.5"
                      checked={(config.analyse_targets ?? []).includes(value)}
                      onChange={(e) => {
                        const cur = config.analyse_targets ?? [];
                        patch({ analyse_targets: e.target.checked ? [...cur, value] : cur.filter((v) => v !== value) });
                      }} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </FieldRow>

            <FieldRow label="binary_arch" hint="仅 analyse_targets 包含 binary 时生效">
              <div className="flex flex-wrap gap-3 mt-1">
                {BINARY_ARCH_OPTIONS.map((arch) => (
                  <label key={arch} className="inline-flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox"
                      checked={(config.binary_arch ?? []).includes(arch)}
                      onChange={(e) => {
                        const cur = config.binary_arch ?? [];
                        patch({ binary_arch: e.target.checked ? [...cur, arch] : cur.filter((v) => v !== arch) });
                      }} />
                    {arch}
                  </label>
                ))}
              </div>
            </FieldRow>

            <div className="grid grid-cols-2 gap-4">
              <FieldRow label="parallel_modules" hint="≥1"><NumberInput value={config.parallel_modules} min={1} max={32} onChange={(v) => patch({ parallel_modules: v })} /></FieldRow>
              <FieldRow label="parallel_sub_workers" hint="≥1"><NumberInput value={config.parallel_sub_workers} min={1} max={32} onChange={(v) => patch({ parallel_sub_workers: v })} /></FieldRow>
            </div>
          </SectionCard>

          {/* 2. 重试配置 */}
          <SectionCard title="重试配置" subtitle="LLM API 重试与进程重启策略">
            <div className="grid grid-cols-2 gap-4">
              <FieldRow label="agent_max_retries" hint="-1=无限"><NumberInput value={config.agent_max_retries} min={-1} onChange={(v) => patch({ agent_max_retries: v })} /></FieldRow>
              <FieldRow label="agent_retry_delay（秒）"><NumberInput value={config.agent_retry_delay} min={0} step={0.5} onChange={(v) => patch({ agent_retry_delay: v })} /></FieldRow>
              <FieldRow label="pi_max_retries" hint="-1=无限"><NumberInput value={config.pi_max_retries} min={-1} onChange={(v) => patch({ pi_max_retries: v })} /></FieldRow>
              <FieldRow label="pi_retry_delay（秒）"><NumberInput value={config.pi_retry_delay} min={0} step={0.5} onChange={(v) => patch({ pi_retry_delay: v })} /></FieldRow>
            </div>
          </SectionCard>

          {/* 3. 阶段配置 */}
          <SectionCard title="阶段配置" subtitle="各 Pipeline 阶段的循环控制参数">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <StageCard label="classify — 分类阶段" value={config.stages.classify} onChange={(v) => patchStage('classify', v)} />
              <StageCard label="refine — 精炼阶段" value={config.stages.refine} onChange={(v) => patchStage('refine', v)} />
              <StageCard label="analyse — 分析阶段" value={config.stages.analyse} onChange={(v) => patchStage('analyse', v)} />
              <StageCard label="final_check — 最终检查" value={config.stages.final_check} onChange={(v) => patchStage('final_check', v)} />
            </div>
          </SectionCard>

          {/* 4. Workers */}
          <RoleConfigBlock
            title="Workers 配置"
            subtitle="执行分析工作的 Agent，支持多实例并行。阶段：explore / classify / refine / sub_read / analyse / report"
            stageNames={WORKER_STAGES}
            value={config.workers}
            onChange={(v) => patch({ workers: v })}
          />

          {/* 5. Judges */}
          <RoleConfigBlock
            title="Judges 配置"
            subtitle="评判 Worker 结果的 Agent。阶段：classify / refine / analyse / completeness / report"
            stageNames={JUDGE_STAGES}
            value={config.judges}
            onChange={(v) => patch({ judges: v })}
          />

          {/* 6. 路径与高级配置 */}
          <SectionCard title="路径与高级配置" subtitle="输出目录、断点续跑参数">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <FieldRow label="output_dir"><TextInput value={config.output_dir} onChange={(v) => patch({ output_dir: v })} /></FieldRow>
              <FieldRow label="archive_dir"><TextInput value={config.archive_dir} onChange={(v) => patch({ archive_dir: v })} /></FieldRow>
              <FieldRow label="result_dir"><TextInput value={config.result_dir} onChange={(v) => patch({ result_dir: v })} /></FieldRow>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FieldRow label="start_stage" hint="从第 N 阶段开始（1=完整流程）"><NumberInput value={config.start_stage} min={1} max={10} onChange={(v) => patch({ start_stage: v })} /></FieldRow>
              <FieldRow label="resume_workspace" hint="断点续跑时指定已有工作目录"><TextInput value={config.resume_workspace} placeholder="/data/workspace/task-xxx" onChange={(v) => patch({ resume_workspace: v })} /></FieldRow>
            </div>
          </SectionCard>

          {/* 操作按钮 */}
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
