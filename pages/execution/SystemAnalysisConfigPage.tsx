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

const FieldRow: React.FC<{ label: string; hint?: string; desc?: string; children: React.ReactNode }> = ({ label, hint, desc, children }) => (
  <div className="flex flex-col gap-1">
    <label className="text-sm font-semibold text-slate-700">
      {label}
      {hint && <span className="ml-2 text-xs font-normal text-slate-400">{hint}</span>}
    </label>
    {desc && <p className="text-xs text-slate-500 leading-relaxed -mt-0.5 mb-0.5">{desc}</p>}
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

const StageCard: React.FC<{ label: string; desc?: string; value: SystemAnalysisStageLoopConfig; onChange: (v: SystemAnalysisStageLoopConfig) => void }> = ({ label, desc, value, onChange }) => (
  <div className="rounded-xl border border-slate-200 p-4 space-y-3">
    <div>
      <p className="text-sm font-bold text-slate-800">{label}</p>
      {desc && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</p>}
    </div>
    <div className="grid grid-cols-3 gap-3">
      <FieldRow label="最少轮数" desc="至少执行的 Worker-Judge 对话轮数，即使提前满足通过条件也不会停止"><NumberInput value={value.min_rounds} min={0} onChange={(v) => onChange({ ...value, min_rounds: v })} /></FieldRow>
      <FieldRow label="最多轮数" hint="-1=无限" desc="最大允许轮数，超过后强制进入下一阶段（无论是否通过）"><NumberInput value={value.max_rounds} min={-1} onChange={(v) => onChange({ ...value, max_rounds: v })} /></FieldRow>
      <FieldRow label="通过模式" desc="majority=多数 judge 同意即继续，all=所有 judge 必须全部同意"><SelectInput value={value.pass_mode} options={['majority', 'all']} onChange={(v) => onChange({ ...value, pass_mode: v as 'majority' | 'all' })} /></FieldRow>
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
          <FieldRow label="模型" desc="模型标识符，如 claude-3-5-sonnet / gpt-4o，或 vllm 代理地址/模型名"><TextInput value={agent.model} placeholder="vllm/org/Model" onChange={(v) => update(i, { model: v })} /></FieldRow>
          <FieldRow label="thinking_level" hint="覆盖角色默认值" desc="null/off=沿用角色默认；low/medium/high=为此实例单独启用链式推理">
            <select value={agent.thinking_level ?? 'off'} onChange={(e) => update(i, { thinking_level: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
              {THINKING_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="工具（逗号分隔）" hint="留空=沿用角色默认" desc="为此实例单独设置可用工具，覆盖 default_tools">
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
    <FieldRow label="default_thinking_level"
      desc="该角色所有实例的默认推理深度。off=直接生成回答（速度最快，适合 explore/classify 等简单阶段）；low/medium/high=启用链式推理（更准确，速度更慢、费用更高），推荐 analyse 阶段使用 medium 或 high。">
      <SelectInput value={value.default_thinking_level} options={[...THINKING_LEVELS]} onChange={(v) => onChange({ ...value, default_thinking_level: v })} />
    </FieldRow>
    <FieldRow label="default_tools"
      desc="该角色 Agent 默认可调用的工具集。read=读文件内容；bash=执行 Shell 命令（ls / cat / strings / file 等）；edit=按行修改文件；write=写入新文件；grep=关键词文本搜索；find=文件路径查找。建议至少保留 read 和 bash。">
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
    <FieldRow label="各阶段模型覆盖（stage_models）" hint="留空则使用 agents[0]"
      desc="为特定阶段单独指定模型，实现按阶段差异化配置。例如：用轻量模型处理 explore 阶段（快速探索），用高性能模型处理 analyse 和 report 阶段（深度分析），在效果与成本间取得平衡。">
      <StageModelsEditor stageNames={stageNames} value={value.stage_models ?? {}} onChange={(v) => onChange({ ...value, stage_models: v })} />
    </FieldRow>
    <FieldRow label="Agent 实例列表"
      desc="定义此角色的模型实例列表。可添加多个实例以实现并行运行或多模型对比；第一个实例（agents[0]）为默认模型，stage_models 中未指定的阶段均使用此模型。">
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
        <p className="mt-2 text-sm text-slate-500">配置分析引擎全局运行参数，包括并发度、重试策略、Pipeline 阶段循环控制及 Agent 模型配置。各项配置作为全局默认值对所有任务生效。</p>
        <p className="mt-1 text-xs text-slate-400">提示：分析范围（文件类型 / 二进制架构过滤）属于任务级配置，请在「新建任务」弹窗中单独设置。</p>
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
          {/* 1. 并发配置 */}
          <SectionCard title="并发配置" subtitle="控制模块级并行度，影响分析速度与 LLM API 调用量">
            <div className="grid grid-cols-2 gap-4">
              <FieldRow label="parallel_modules" hint="≥1，默认 1"
                desc="同时分析的模块（子目录 / 功能模块）数量。增大此值可显著加速分析，但会成倍增加并发 API 调用量，需确保 LLM API 配额充足。建议先以 1 运行单任务评估效果后再逐步提高。">
                <NumberInput value={config.parallel_modules} min={1} max={32} onChange={(v) => patch({ parallel_modules: v })} />
              </FieldRow>
              <FieldRow label="parallel_sub_workers" hint="≥1，默认 1"
                desc="每个模块内并行运行的子 Worker 数量。与 parallel_modules 共同决定最大并发度（最大并发 = parallel_modules × parallel_sub_workers），应根据可用 API 并发配额上限合理设置。">
                <NumberInput value={config.parallel_sub_workers} min={1} max={32} onChange={(v) => patch({ parallel_sub_workers: v })} />
              </FieldRow>
            </div>
          </SectionCard>

          {/* 2. 重试配置 */}
          <SectionCard title="重试配置" subtitle="控制 LLM API 调用失败时的重试策略，以及 pi Agent 进程崩溃时的自动重启策略">
            <div className="grid grid-cols-2 gap-4">
              <FieldRow label="agent_max_retries" hint="-1=无限重试"
                desc="LLM API 调用失败（限流 429、请求超时、5xx 服务器错误）时的最大重试次数。设为 -1 可在网络抖动时自动无限重试，适合长时间无人值守的分析任务。">
                <NumberInput value={config.agent_max_retries} min={-1} onChange={(v) => patch({ agent_max_retries: v })} />
              </FieldRow>
              <FieldRow label="agent_retry_delay（秒）" hint="首次等待，之后指数递增"
                desc="API 重试的首次等待时间（秒），后续以指数退避递增（delay × 2ⁿ），最大上限 300 秒。对于频繁限流的服务，适当加大此值可减少无效重试。">
                <NumberInput value={config.agent_retry_delay} min={0} step={0.5} onChange={(v) => patch({ agent_retry_delay: v })} />
              </FieldRow>
              <FieldRow label="pi_max_retries" hint="-1=无限重启"
                desc="pi Agent 进程因非 API 原因崩溃（如内存不足、信号中断）后的最大重启次数。通常设为 -1，系统会自动恢复并从上次 checkpoint 继续执行。">
                <NumberInput value={config.pi_max_retries} min={-1} onChange={(v) => patch({ pi_max_retries: v })} />
              </FieldRow>
              <FieldRow label="pi_retry_delay（秒）" hint="进程崩溃后等待时间"
                desc="pi 进程崩溃后重启前的等待时间（秒），给系统留出资源回收时间，避免崩溃-重启循环过于密集导致资源耗尽。">
                <NumberInput value={config.pi_retry_delay} min={0} step={0.5} onChange={(v) => patch({ pi_retry_delay: v })} />
              </FieldRow>
            </div>
          </SectionCard>

          {/* 3. 阶段配置 */}
          <SectionCard title="阶段配置" subtitle="控制 Pipeline 各阶段的 Worker-Judge 对话轮数及通过策略。每轮由 Worker 完成分析，Judge 评审后决定是否推进到下一阶段。">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <StageCard label="classify — 全局分类"
                desc="Worker 遍历目标目录，对所有文件进行类型识别和分类，输出带注释的文件清单；Judge 评审分类结果的完整性和准确性。"
                value={config.stages.classify} onChange={(v) => patchStage('classify', v)} />
              <StageCard label="refine — 模块细分"
                desc="Worker 基于分类结果将目标拆分为功能模块（子目录 / 组件 / 子系统）；Judge 判断模块粒度是否合理、有无明显遗漏或过度细分。"
                value={config.stages.refine} onChange={(v) => patchStage('refine', v)} />
              <StageCard label="analyse — 安全分析"
                desc="Worker 对每个模块进行深度安全威胁分析，识别漏洞、危险函数、可疑行为和攻击面；Judge 评审发现质量并决定是否需要补充分析。"
                value={config.stages.analyse} onChange={(v) => patchStage('analyse', v)} />
              <StageCard label="final_check — 完整性检查"
                desc="最终验证分析报告的覆盖完整性与结论一致性。通常固定为 min_rounds=1、max_rounds=1，并设 pass_mode=all 要求所有 judge 一致确认。"
                value={config.stages.final_check} onChange={(v) => patchStage('final_check', v)} />
            </div>
          </SectionCard>

          {/* 4. Workers */}
          <RoleConfigBlock
            title="Workers 配置"
            subtitle="负责执行分析任务的 Agent 角色。Worker 在每轮中调用工具（读文件、执行命令等）完成实际分析工作，结果提交给 Judge 评审。支持多实例以并行处理不同模块。可用阶段：explore / classify / refine / sub_read / analyse / report"
            stageNames={WORKER_STAGES}
            value={config.workers}
            onChange={(v) => patch({ workers: v })}
          />

          {/* 5. Judges */}
          <RoleConfigBlock
            title="Judges 配置"
            subtitle="负责评审 Worker 输出质量的 Agent 角色。Judge 对 Worker 的分析结果进行独立评估，判断是否足够准确完整，并决定当前阶段是否可以推进。多 Judge 可提高评审可靠性。可用阶段：classify / refine / analyse / completeness / report"
            stageNames={JUDGE_STAGES}
            value={config.judges}
            onChange={(v) => patch({ judges: v })}
          />

          {/* 6. 路径与高级配置 */}
          <SectionCard title="路径与高级配置" subtitle="任务输出路径及断点续跑参数，一般保持默认值即可">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <FieldRow label="output_dir"
                desc="任务输出根目录。每个任务会在此目录下自动创建 {task_id}/ 子目录，内含 workspace/（Agent 工作区）、sessions/（会话记录）等。">
                <TextInput value={config.output_dir} onChange={(v) => patch({ output_dir: v })} />
              </FieldRow>
              <FieldRow label="archive_dir"
                desc="分析结果归档目录，通常与 output_dir 相同。如需将最终报告单独归档到 NFS / 对象存储等位置，可设置为不同路径。">
                <TextInput value={config.archive_dir} onChange={(v) => patch({ archive_dir: v })} />
              </FieldRow>
              <FieldRow label="result_dir"
                desc="任务结果标志文件（flag）的存放目录。flag 文件内容为 1（成功）或 0（失败），可供外部系统轮询监控任务完成状态。">
                <TextInput value={config.result_dir} onChange={(v) => patch({ result_dir: v })} />
              </FieldRow>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FieldRow label="start_stage" hint="1=完整流程（默认）"
                desc="跳过前 N-1 个阶段直接从第 N 阶段开始。1=完整流程；2=跳过文件过滤；3=跳过探索+过滤；4=直接进入安全分析。配合 resume_workspace 使用可实现断点续跑。">
                <NumberInput value={config.start_stage} min={1} max={10} onChange={(v) => patch({ start_stage: v })} />
              </FieldRow>
              <FieldRow label="resume_workspace" hint="断点续跑时填写，正常留空"
                desc="指定已有 workspace 目录路径以断点续跑（如 /data/output/sat_xxxx/workspace）。需同时将 start_stage 设为 ≥3 才能跳过已完成阶段、从中断处继续。">
                <TextInput value={config.resume_workspace} placeholder="/data/output/sat_xxxx/workspace" onChange={(v) => patch({ resume_workspace: v })} />
              </FieldRow>
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
