import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';

import { api } from '../../clients/api';
import {
  LlmProviderSummary,
  SystemAnalysisAgentInstance,
  SystemAnalysisRoleConfig,
  SystemAnalysisServiceConfig,
  SystemAnalysisStageLoopConfig,
  SystemAnalysisStagesConfig,
} from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';

// ─── 常量 ──────────────────────────────────────────────────────────────────────

const WORKER_STAGES = ['explore', 'classify', 'refine', 'sub_read', 'analyse', 'report'];
const JUDGE_STAGES = ['classify', 'refine', 'analyse', 'completeness', 'report'];

/** 各 Worker 阶段的功能说明与模型选型建议 */
const WORKER_STAGE_DESCS: Record<string, string> = {
  explore:
    '目录探索 — 快速扫描目标目录结构，提炼关键词与架构线索，为分类阶段提供上下文。逻辑简单，可使用轻量模型以降低成本；留空则与 classify 共用同一模型。',
  classify:
    '全局分类 — 遍历全量文件，按功能划定模块边界并输出带注释的文件清单。需要较强的上下文理解能力，建议配置主力模型。',
  refine:
    '模块细分 — 对每个模块进行精细化文件归属与子模块拆分，判断粒度是否合理。推理要求较高，建议与 classify 使用相同或更强的模型。',
  sub_read:
    '大文件预读 — 当模块文件数量超出阈值时，对各文件逐一生成摘要，压缩上下文供 analyse 阶段使用。以提取信息为主，可用轻量模型控制成本；留空则与 analyse 共用模型。',
  analyse:
    '【核心】STRIDE 安全分析 — 对每个模块执行深度安全威胁分析，识别漏洞、危险函数、可疑行为和攻击面。此阶段质量直接决定最终报告深度，强烈建议配置最强可用模型。',
  report:
    '最终报告生成 — 汇总所有模块的分析结果，生成结构化安全报告。建议与 analyse 使用相同强度的模型，确保报告综合质量。',
};

/** 各 Judge 阶段的功能说明与模型选型建议 */
const JUDGE_STAGE_DESCS: Record<string, string> = {
  classify:
    '分类评审 — 独立评估 Worker 的模块划分是否完整、合理，判断是否需要重新分类。',
  refine:
    '细分评审 — 检查模块粒度是否合理，判断是否需要进一步拆分或合并子模块。',
  analyse:
    '【核心】安全分析评审 — 对 Worker 的威胁发现进行独立复核，评估发现深度与覆盖面。建议配置能理解安全概念的较强模型。',
  completeness:
    '完整性验证 — 最终检查全部模块是否均已完成分析、是否有模块遗漏未分析。通常与 final_check 阶段配合，轮数设为 1。',
  report:
    '报告评审 — 评估最终报告的结构、一致性与可读性，决定报告是否达到交付标准。',
};

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

const ModelSelect: React.FC<{ value: string; options: string[]; allowEmpty?: boolean; emptyLabel?: string; onChange: (v: string) => void }> = ({ value, options, allowEmpty, emptyLabel = '留空则使用 agents[0].model', onChange }) => {
  // Ensure current value is always visible even if not in options list
  const allOpts = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {allOpts.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  );
};

const AgentInstanceList: React.FC<{ agents: SystemAnalysisAgentInstance[]; modelOptions: string[]; onChange: (agents: SystemAnalysisAgentInstance[]) => void }> = ({ agents, modelOptions, onChange }) => {
  const add = () => onChange([...agents, { model: '', tools: null, thinking_level: null }]);
  const remove = (i: number) => onChange(agents.filter((_, idx) => idx !== i));
  const update = (i: number, patch: Partial<SystemAnalysisAgentInstance>) => onChange(agents.map((a, idx) => idx === i ? { ...a, ...patch } : a));
  return (
    <div className="space-y-2">
      {agents.map((agent, i) => (
        <div key={i} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
          <div className="flex-1">
            <ModelSelect value={agent.model} options={modelOptions} allowEmpty onChange={(v) => update(i, { model: v })} emptyLabel="— 选择模型 —" />
          </div>
          <button onClick={() => remove(i)} className="flex-shrink-0 rounded-lg border border-red-100 p-2 text-red-400 hover:bg-red-50"><Trash2 size={14} /></button>
        </div>
      ))}
      <button onClick={add} className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-4 py-2 text-sm text-slate-500 hover:bg-slate-50">
        <Plus size={14} /> 添加实例
      </button>
    </div>
  );
};

const StageModelsEditor: React.FC<{ stageNames: string[]; modelOptions: string[]; stageDescs?: Record<string, string>; value: Record<string, string>; onChange: (v: Record<string, string>) => void }> = ({ stageNames, modelOptions, stageDescs, value, onChange }) => (
  <div className="space-y-2">
    {stageNames.map((stage) => (
      <div key={stage} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 space-y-1.5">
        <div>
          <p className="text-sm font-semibold text-slate-800">{stage}</p>
          {stageDescs?.[stage] && <p className="text-xs text-slate-500 leading-relaxed">{stageDescs[stage]}</p>}
        </div>
        <ModelSelect value={value[stage] ?? ''} options={modelOptions} allowEmpty
          onChange={(v) => { const next = { ...value }; if (v) next[stage] = v; else delete next[stage]; onChange(next); }} />
      </div>
    ))}
  </div>
);

const RoleConfigBlock: React.FC<{
  title: string;
  subtitle?: string;
  stageNames: string[];
  stageDescs?: Record<string, string>;
  modelOptions: string[];
  value: SystemAnalysisRoleConfig;
  agentDesc?: string;
  onChange: (v: SystemAnalysisRoleConfig) => void;
}> = ({ title, subtitle, stageNames, stageDescs, modelOptions, value, agentDesc, onChange }) => (
  <SectionCard title={title} subtitle={subtitle}>
    <FieldRow
      label="各阶段模型配置"
      hint="留空则使用实例列表中 agents[0] 的模型"
      desc="为每个阶段单独指定使用的模型，实现轻量阶段低成本、核心阶段高质量的差异化配置。未指定的阶段回退到下方实例列表的第一个模型。">
      <StageModelsEditor
        stageNames={stageNames}
        modelOptions={modelOptions}
        stageDescs={stageDescs}
        value={value.stage_models ?? {}}
        onChange={(v) => onChange({ ...value, stage_models: v })}
      />
    </FieldRow>
    <FieldRow
      label="Agent 实例列表"
      desc={agentDesc}>
      <AgentInstanceList agents={value.agents ?? []} modelOptions={modelOptions} onChange={(agents) => onChange({ ...value, agents })} />
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
  const [modelOptions, setModelOptions] = useState<string[]>([]);

  const patch = (p: Partial<SystemAnalysisServiceConfig>) => setConfig((prev) => ({ ...prev, ...p }));

  const patchStage = (key: keyof SystemAnalysisStagesConfig, p: Partial<SystemAnalysisStageLoopConfig>) =>
    setConfig((prev) => ({ ...prev, stages: { ...prev.stages, [key]: { ...prev.stages[key], ...p } } }));

  useEffect(() => {
    api.configCenter.listLlmProviders()
      .then((res: { items?: LlmProviderSummary[] }) => {
        const items = Array.isArray(res?.items) ? res.items : [];
        const opts = items
          .filter((p) => p.enabled && p.provider_key && p.model)
          .map((p) => `${p.provider_key}/${p.model}`);
        setModelOptions(opts);
      })
      .catch(() => { /* 静默忽略，手动输入仍可用 */ });
  }, []);

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
            subtitle="负责执行分析任务的 Agent 角色。Worker 在每轮中调用工具（读文件、执行命令等）完成实际分析工作，结果提交给 Judge 评审。"
            stageNames={WORKER_STAGES}
            stageDescs={WORKER_STAGE_DESCS}
            modelOptions={modelOptions}
            value={config.workers}
            agentDesc="Worker 默认模型实例。agents[0] 的模型将作为所有未在「各阶段模型配置」中指定阶段的回退模型。通常只需配置一个实例。"
            onChange={(v) => patch({ workers: v })}
          />

          {/* 5. Judges */}
          <RoleConfigBlock
            title="Judges 配置"
            subtitle="负责评审 Worker 输出质量的 Agent 角色。多个 Judge 实例会并行独立评审同一内容，按「阶段配置」中的 pass_mode 决定是否通过。"
            stageNames={JUDGE_STAGES}
            stageDescs={JUDGE_STAGE_DESCS}
            modelOptions={modelOptions}
            value={config.judges}
            agentDesc="配置参与评审的 Judge 实例。多个实例会并行独立评审同一内容并投票；建议配置 2–3 个实例以获得稳定的多数投票效果。单实例时 majority / all 效果相同。"
            onChange={(v) => patch({ judges: v })}
          />

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
