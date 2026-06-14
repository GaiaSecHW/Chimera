import React, { useEffect, useState } from 'react';
import { Loader2, Plus, RefreshCw, Settings, Trash2 } from 'lucide-react';

import { api } from '../../clients/api';
import {
  LlmProviderSummary,
  SystemAnalysisAgentInstance,
  SystemAnalysisPromptOverrideGroup,
  SystemAnalysisPromptOverrideItem,
  SystemAnalysisPromptTemplate,
  SystemAnalysisRoleConfig,
  SystemAnalysisServiceConfig,
  SystemAnalysisStageLoopConfig,
  SystemAnalysisStagesConfig,
  SystemAnalysisSelfReflectionConfig,
} from '../../types/types';
import { useUiFeedback } from '../../components/UiFeedback';
import { StaticPipelineFlow } from './StaticPipelineFlow';

// ─── 常量 ──────────────────────────────────────────────────────────────────────

const WORKER_STAGES = ['explore', 'classify', 'refine', 'sub_read', 'analyse', 'report'];
const JUDGE_STAGES = ['classify', 'refine', 'analyse', 'completeness', 'report'];
const WORKER_PROMPT_KEYS = [
  'default',
  'step1_explore',
  'step1_classify',
  'reflect_classify',
  'step2_sub_read',
  'step2_refine',
  'reflect_refine',
  'step2_reclassify',
  'step3_analyse',
  'reflect_analyse',
  'step4_final_report',
  'reflect_report',
] as const;
const JUDGE_PROMPT_KEYS = [
  'default',
  'step1_check_classify',
  'step2_check_refine',
  'step3_check_analyse',
  'step4_check_completeness',
  'step4_check_report',
] as const;

const WORKER_PROMPT_DESCS: Record<string, string> = {
  default: 'Worker 默认 system prompt，供未命中特定阶段或个别兜底逻辑使用。',
  step1_explore: 'Stage 0 目录探索提示词，用于快速理解目标目录、结构和关键线索。',
  step1_classify: 'Stage 1 全局分类提示词，用于按功能对文件进行模块划分。',
  reflect_classify: 'Stage 1 分类反思提示词，用于根据 Judge 反馈修正分类。',
  step2_sub_read: 'Stage 2 大文件预读提示词，用于对子文件批次做摘要压缩。',
  step2_refine: 'Stage 2 模块细分提示词，用于精细化模块边界与文件归属。',
  reflect_refine: 'Stage 2 细分反思提示词，用于根据评审结果修正模块粒度。',
  step2_reclassify: 'Stage 2 重新分类提示词，用于对需要重分组的模块重新划分。',
  step3_analyse: 'Stage 3 安全分析提示词，是系统分析的核心执行 prompt。',
  reflect_analyse: 'Stage 3 分析反思提示词，用于根据评审反馈补充威胁发现。',
  step4_final_report: 'Stage 4 最终报告提示词，用于汇总模块分析并生成总报告。',
  reflect_report: 'Stage 4 报告反思提示词，用于根据报告评审意见修正最终报告。',
};

const JUDGE_PROMPT_DESCS: Record<string, string> = {
  default: 'Judge 默认 system prompt，供未命中特定阶段或个别兜底逻辑使用。',
  step1_check_classify: 'Stage 1 分类评审提示词，用于判断模块划分是否完整合理。',
  step2_check_refine: 'Stage 2 细分评审提示词，用于判断模块粒度是否合理。',
  step3_check_analyse: 'Stage 3 安全分析评审提示词，用于复核威胁发现质量。',
  step4_check_completeness: 'Stage 4 完整性检查提示词，用于确认模块分析覆盖完整。',
  step4_check_report: 'Stage 4 报告评审提示词，用于判断最终报告结构与一致性。',
};

const emptyPromptItem = (): SystemAnalysisPromptOverrideItem => ({ content: '', source: 'default', default_content: '' });
const defaultPromptOverrides = (): SystemAnalysisPromptOverrideGroup => ({
  workers: Object.fromEntries(WORKER_PROMPT_KEYS.map((key) => [key, emptyPromptItem()])) as Record<string, SystemAnalysisPromptOverrideItem>,
  judges: Object.fromEntries(JUDGE_PROMPT_KEYS.map((key) => [key, emptyPromptItem()])) as Record<string, SystemAnalysisPromptOverrideItem>,
});

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

const SHOW_SYSTEM_ANALYSIS_PROMPT_CONFIG = false;

const SYSTEM_ANALYSIS_FLOW = {
  title: '系统分析阶段推进关系',
  subtitle: '展示系统分析微服务的默认推进链路与关键收敛点，便于在调整参数前快速理解不同阶段的职责边界。',
  lanes: [
    {
      label: '主执行链路',
      steps: [
        { id: 'sa-stage-0', title: 'Stage 0 预处理', desc: '过滤目标文件、探索目录结构并预扫描关键线索。', badge: 'S0', tone: 'analysis' as const },
        { id: 'sa-stage-1', title: 'Stage 1 全局分类', desc: '按功能与职责划分模块边界，产出初始模块清单。', badge: 'S1', tone: 'analysis' as const },
        { id: 'sa-stage-2', title: 'Stage 2 细分类', desc: '细化模块粒度，并执行全局补分类以减少遗漏。', badge: 'S2', tone: 'analysis' as const },
        { id: 'sa-stage-3', title: 'Stage 3 安全分析', desc: '逐模块开展 STRIDE 与威胁分析，沉淀核心发现。', badge: 'S3', tone: 'review' as const },
        { id: 'sa-stage-4a', title: 'Stage 4a 完整性检查', desc: '对模块覆盖完整性做最终复核，可按配置关闭。', badge: 'S4a', tone: 'guard' as const },
        { id: 'sa-stage-4b', title: 'Stage 4b 报告生成', desc: '汇总模块分析与评审结果，输出最终总报告。', badge: 'S4b', tone: 'artifact' as const },
      ],
    },
  ],
  notes: [
    {
      title: '反思与回退',
      detail: 'Stage 1/2/3 若未通过评审会进入反思重试；Stage 4a 若发现覆盖缺口，可回退补做缺失模块。',
      tone: 'review' as const,
    },
    {
      title: '遗漏文件收敛',
      detail: 'Stage 2 末尾会做全局补分类检查，尽量在最终报告前收敛未归类文件。',
      tone: 'guard' as const,
    },
  ],
  footer: 'Stage 4a 为可选阶段；关闭完整性检查后，任务会直接从 Stage 3 推进到 Stage 4b。',
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
  max_rounds_exceeded_action: 'treat_as_passed',
  continue_on_module_failure: true,
  analyse_targets: ['all'],
  binary_arch: ['all'],
  security_focus_categories: ['all'],
  module_granularity: 'fine',
  filter_engine: 'script',
  enable_final_check: false,
  worker_task_concurrency: 4,
  parallel_modules: 1,
  parallel_sub_workers: 1,
  agent_max_retries: -1,
  agent_retry_delay: 30,
  agent_timeout_seconds: 1800,
  pi_max_retries: -1,
  pi_retry_delay: 10,
  model_stuck_timeout: 1800,
  model_stuck_max_activations: 5,
  stages: {
    classify: { min_rounds: 1, pass_mode: 'majority' },
    refine: { min_rounds: 1, pass_mode: 'majority' },
    analyse: { min_rounds: 1, pass_mode: 'majority' },
    final_check: { min_rounds: 1, pass_mode: 'all' },
  },
  workers: defaultRole(),
  judges: defaultRole(),
  prompt_overrides: defaultPromptOverrides(),
  output_dir: '/data/output',
  archive_dir: '/data/output',
  result_dir: '/data/output',
  start_stage: 1,
  resume_workspace: '',
  self_reflection: {
    enabled: false,
    model: '',
    output_dir: `/data/files/${projectId}/app/chimera-app-system-analyse/self-reflection`,
    max_session_lines: 1000,
  },
});

const normalizePromptOverrides = (value: unknown): SystemAnalysisPromptOverrideGroup => {
  const base = defaultPromptOverrides();
  const raw = value && typeof value === 'object' ? value as Partial<SystemAnalysisPromptOverrideGroup> : {};
  const normalizeGroup = (
    keys: readonly string[],
    incoming: unknown,
  ): Record<string, SystemAnalysisPromptOverrideItem> => {
    const next = incoming && typeof incoming === 'object' ? incoming as Record<string, any> : {};
    return Object.fromEntries(keys.map((key) => {
      const item = next[key];
      if (item && typeof item === 'object') {
        return [key, {
          content: String(item.content ?? ''),
          source: item.source === 'project' ? 'project' : 'default',
          default_content: String(item.default_content ?? ''),
        } satisfies SystemAnalysisPromptOverrideItem];
      }
      if (typeof item === 'string') {
        return [key, { content: item, source: 'project' } satisfies SystemAnalysisPromptOverrideItem];
      }
      return [key, base.workers[key] ?? base.judges[key] ?? emptyPromptItem()];
    }));
  };
  return {
    workers: normalizeGroup(WORKER_PROMPT_KEYS, raw.workers),
    judges: normalizeGroup(JUDGE_PROMPT_KEYS, raw.judges),
  };
};

const buildSafeConfig = (projectId: string, cfg?: Partial<SystemAnalysisServiceConfig> | null): SystemAnalysisServiceConfig => {
  const base = defaultConfig(projectId);
  return {
    ...base,
    ...(cfg || {}),
    project_id: projectId,
    stages: {
      ...base.stages,
      ...(cfg?.stages && typeof cfg.stages === 'object' ? cfg.stages : {}),
    },
    workers: {
      ...base.workers,
      ...(cfg?.workers && typeof cfg.workers === 'object' ? cfg.workers : {}),
    },
    judges: {
      ...base.judges,
      ...(cfg?.judges && typeof cfg.judges === 'object' ? cfg.judges : {}),
    },
    prompt_overrides: normalizePromptOverrides(cfg?.prompt_overrides),
  };
};

type SystemAnalysisPanelKey =
  | 'scope'
  | 'concurrency'
  | 'retry'
  | 'stages'
  | 'self_reflection'
  | 'workers'
  | 'judges';

const SYSTEM_ANALYSIS_PANEL_KEYS: SystemAnalysisPanelKey[] = [
  'scope',
  'concurrency',
  'retry',
  'stages',
  'self_reflection',
  'workers',
  'judges',
];

const applySystemAnalysisPanel = (
  base: SystemAnalysisServiceConfig,
  source: SystemAnalysisServiceConfig,
  panel: SystemAnalysisPanelKey,
): SystemAnalysisServiceConfig => {
  switch (panel) {
    case 'scope':
      return {
        ...base,
        analyse_targets: source.analyse_targets,
        binary_arch: source.binary_arch,
        security_focus_categories: source.security_focus_categories,
        module_granularity: source.module_granularity,
        filter_engine: source.filter_engine,
        enable_final_check: source.enable_final_check,
        continue_on_module_failure: source.continue_on_module_failure,
      };
    case 'concurrency':
      return {
        ...base,
        worker_task_concurrency: source.worker_task_concurrency,
        parallel_modules: source.parallel_modules,
        parallel_sub_workers: source.parallel_sub_workers,
      };
    case 'retry':
      return {
        ...base,
        agent_max_retries: source.agent_max_retries,
        agent_retry_delay: source.agent_retry_delay,
        agent_timeout_seconds: source.agent_timeout_seconds,
        pi_max_retries: source.pi_max_retries,
        pi_retry_delay: source.pi_retry_delay,
        model_stuck_timeout: source.model_stuck_timeout,
        model_stuck_max_activations: source.model_stuck_max_activations,
        max_rounds_exceeded_action: source.max_rounds_exceeded_action,
      };
    case 'stages':
      return { ...base, stages: source.stages };
    case 'self_reflection':
      return { ...base, self_reflection: source.self_reflection };
    case 'workers':
      return { ...base, workers: source.workers };
    case 'judges':
      return { ...base, judges: source.judges };
    default:
      return base;
  }
};

const restoreOtherSystemAnalysisPanels = (
  saved: SystemAnalysisServiceConfig,
  draft: SystemAnalysisServiceConfig,
  preservedPanel: SystemAnalysisPanelKey,
): SystemAnalysisServiceConfig => {
  return SYSTEM_ANALYSIS_PANEL_KEYS.reduce((acc, panel) => {
    if (panel === preservedPanel) {
      return acc;
    }
    return applySystemAnalysisPanel(acc, draft, panel);
  }, saved);
};

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
    <div className="grid grid-cols-2 gap-3">
      <FieldRow label="最少轮数" desc="至少执行的 Worker-Judge 对话轮数，即使提前满足通过条件也不会停止"><NumberInput value={value.min_rounds} min={0} onChange={(v) => onChange({ ...value, min_rounds: v })} /></FieldRow>
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
  actions?: React.ReactNode;
  stageNames: string[];
  stageDescs?: Record<string, string>;
  modelOptions: string[];
  value: SystemAnalysisRoleConfig;
  agentDesc?: string;
  onChange: (v: SystemAnalysisRoleConfig) => void;
}> = ({ title, subtitle, actions, stageNames, stageDescs, modelOptions, value, agentDesc, onChange }) => (
  <SectionCard title={title} subtitle={subtitle} actions={actions}>
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

const PanelActions: React.FC<{
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
}> = ({ saving, onSave, onReset }) => (
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

const PromptEditorCard: React.FC<{
  role: 'workers' | 'judges';
  promptKey: string;
  desc: string;
  item: SystemAnalysisPromptOverrideItem;
  templates: SystemAnalysisPromptTemplate[];
  selectedTemplateId: string;
  onChangeTemplateId: (value: string) => void;
  onChange: (value: SystemAnalysisPromptOverrideItem) => void;
  onImportTemplate: () => void;
  onRestoreDefault: () => void;
}> = ({
  role,
  promptKey,
  desc,
  item,
  templates,
  selectedTemplateId,
  onChangeTemplateId,
  onChange,
  onImportTemplate,
  onRestoreDefault,
}) => (
  <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-bold text-slate-900">{promptKey}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">{desc}</p>
      </div>
      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black tracking-[0.12em] ${
        item.source === 'project'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-slate-200 bg-white text-slate-500'
      }`}>
        {item.source === 'project' ? 'PROJECT' : 'DEFAULT'}
      </span>
    </div>

    <textarea
      value={item.content}
      onChange={(event) => onChange({ ...item, content: event.target.value, source: 'project' })}
      className="min-h-[180px] w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs leading-6 text-slate-800"
      spellCheck={false}
    />

    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex items-center gap-2">
        <select
          value={selectedTemplateId}
          onChange={(event) => onChangeTemplateId(event.target.value)}
          className="min-w-[220px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="">从模板库选择</option>
          {templates.map((template) => (
            <option key={`${role}-${template.prompt_id}`} value={template.prompt_id}>
              {template.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onImportTemplate}
          disabled={!selectedTemplateId}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
        >
          导入模板
        </button>
      </div>
      <button
        type="button"
        onClick={onRestoreDefault}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
      >
        恢复默认
      </button>
    </div>
  </div>
);

// ─── 主页面 ────────────────────────────────────────────────────────────────────

export const SystemAnalysisConfigPage: React.FC<{ projectId: string; embedded?: boolean }> = ({ projectId, embedded = false }) => {
  const { notify, feedbackNodes } = useUiFeedback();
  const systemAnalysis = api.domains.execution.appSystemAnalyse;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPanel, setSavingPanel] = useState<SystemAnalysisPanelKey | null>(null);
  const [config, setConfig] = useState<SystemAnalysisServiceConfig>(() => defaultConfig(projectId));
  const [savedConfig, setSavedConfig] = useState<SystemAnalysisServiceConfig>(() => defaultConfig(projectId));
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [promptTemplates, setPromptTemplates] = useState<SystemAnalysisPromptTemplate[]>([]);
  const [selectedPromptTemplates, setSelectedPromptTemplates] = useState<Record<string, string>>({});

  const patch = (p: Partial<SystemAnalysisServiceConfig>) => setConfig((prev) => ({ ...prev, ...p }));

  const patchStage = (key: keyof SystemAnalysisStagesConfig, p: Partial<SystemAnalysisStageLoopConfig>) =>
    setConfig((prev) => ({ ...prev, stages: { ...prev.stages, [key]: { ...prev.stages[key], ...p } } }));

  const patchPrompt = (role: 'workers' | 'judges', promptKey: string, item: SystemAnalysisPromptOverrideItem) =>
    setConfig((prev) => ({
      ...prev,
      prompt_overrides: {
        ...prev.prompt_overrides,
        [role]: {
          ...prev.prompt_overrides[role],
          [promptKey]: item,
        },
      },
    }));

  const setTemplateSelection = (role: 'workers' | 'judges', promptKey: string, value: string) =>
    setSelectedPromptTemplates((prev) => ({ ...prev, [`${role}:${promptKey}`]: value }));

  const importPromptTemplate = (role: 'workers' | 'judges', promptKey: string) => {
    const selectedId = selectedPromptTemplates[`${role}:${promptKey}`];
    const template = promptTemplates.find((item) => item.prompt_id === selectedId);
    if (!template) {
      notify('请先从模板库选择一个 Prompt 模板', 'info');
      return;
    }
    const current = config.prompt_overrides[role][promptKey];
    patchPrompt(role, promptKey, {
      ...current,
      content: template.content || '',
      source: 'project',
    });
  };

  const restorePromptDefault = (role: 'workers' | 'judges', promptKey: string) => {
    const current = config.prompt_overrides[role][promptKey];
    patchPrompt(role, promptKey, {
      content: current?.default_content || '',
      source: 'default',
      default_content: current?.default_content || '',
    });
  };

  const reload = () => {
    setLoading(true);
    systemAnalysis.getConfig(projectId)
      .then((cfg) => {
        const normalized = buildSafeConfig(projectId, cfg);
        setConfig(normalized);
        setSavedConfig(normalized);
      })
      .catch((err) => {
        notify(`加载配置失败: ${err?.message ?? err}`, 'error');
        const fallback = defaultConfig(projectId);
        setConfig(fallback);
        setSavedConfig(fallback);
      })
      .finally(() => setLoading(false));
  };

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
    systemAnalysis.listPrompts({ page: 1, per_page: 200, is_enabled: true })
      .then((resp) => setPromptTemplates(Array.isArray(resp?.items) ? resp.items : []))
      .catch(() => setPromptTemplates([]));
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    systemAnalysis.getConfig(projectId)
      .then((cfg) => {
        if (!cancelled) {
          const normalized = buildSafeConfig(projectId, cfg);
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
  }, [projectId]);

  const persistConfig = async (nextConfig: SystemAnalysisServiceConfig) => {
    setSaving(true);
    try {
      const saved = await systemAnalysis.saveConfig({ ...nextConfig, project_id: projectId });
      return buildSafeConfig(projectId, saved);
    } catch (err: any) {
      notify(`保存失败: ${err?.message ?? err}`, 'error');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handlePanelSave = async (panel: SystemAnalysisPanelKey, label: string) => {
    setSavingPanel(panel);
    const payload = applySystemAnalysisPanel(savedConfig, config, panel);
    const saved = await persistConfig(payload);
    if (saved) {
      setSavedConfig(saved);
      setConfig((prev) => restoreOtherSystemAnalysisPanels(saved, prev, panel));
      notify(`${label}已保存`, 'success');
    }
    setSavingPanel(null);
  };

  const handlePanelReset = (panel: SystemAnalysisPanelKey, label: string) => {
    const defaults = defaultConfig(projectId);
    setConfig((prev) => applySystemAnalysisPanel(prev, defaults, panel));
    notify(`${label}已重置为默认值（尚未保存）`, 'info');
  };

  return (
    <div className={embedded ? 'space-y-4' : 'px-8 pt-8 pb-10 space-y-6'}>
      {feedbackNodes}

      {!embedded ? (
        <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-600">System Analysis</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">分析配置</h1>
          <p className="mt-2 text-sm text-slate-500">配置分析引擎全局运行参数，包括并发度、重试策略、Pipeline 阶段循环控制及 Agent 模型配置。各项配置作为全局默认值对所有任务生效。</p>
          <p className="mt-1 text-xs text-slate-400">提示：分析范围（文件类型 / 架构 / 安全维度 / 模块粒度）均可在此作为服务级默认值，也可在「新建任务」弹窗中覆盖。</p>
          {config.updated_at && (
            <p className="mt-1 text-xs text-slate-400">上次保存：{new Date(config.updated_at).toLocaleString()}</p>
          )}
        </section>
      ) : (
        <section className="rounded-[2rem] border border-slate-200 bg-slate-50/70 p-6 shadow-sm">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Settings size={18} className="text-rose-600" />
                <h2 className="text-xl font-black text-slate-900">系统分析参数配置</h2>
                <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-black tracking-[0.12em] text-rose-700">
                  chimera-app-system-analyse
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                当前 Tab 中的全部配置项都归属于 `chimera-app-system-analyse` 微服务，用于控制系统分析服务的并发、重试、阶段循环和 Agent 模型行为。
              </p>
              <p className="mt-1 text-xs text-slate-400">提示：分析范围（文件类型 / 架构 / 安全维度 / 模块粒度）可在此设置服务级默认值，也可在「新建任务」弹窗中单独覆盖。</p>
              {config.updated_at && (
                <p className="mt-1 text-xs text-slate-400">上次保存：{new Date(config.updated_at).toLocaleString()}</p>
              )}
            </div>
            <button
              type="button"
              onClick={reload}
              disabled={loading || saving}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              刷新
            </button>
          </div>

          <div className="mb-5 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            配置立即生效于后端服务，所有该项目下的系统分析任务默认共享这些参数。修改后无需重启。
          </div>
        </section>
      )}

      {loading ? (
        <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          <Loader2 size={15} className="animate-spin" />加载中...
        </div>
      ) : (
        <div className="space-y-6">
          <StaticPipelineFlow
            title={SYSTEM_ANALYSIS_FLOW.title}
            subtitle={SYSTEM_ANALYSIS_FLOW.subtitle}
            lanes={SYSTEM_ANALYSIS_FLOW.lanes}
            notes={SYSTEM_ANALYSIS_FLOW.notes}
            footer={SYSTEM_ANALYSIS_FLOW.footer}
          />
          <SectionCard
            title="分析范围配置"
            subtitle="控制文件过滤、S1 分类阶段的分析范围与模块粒度。以下配置为服务级默认值，可在任务创建时单独覆盖。"
            actions={(
              <PanelActions
                saving={savingPanel === 'scope'}
                onSave={() => { void handlePanelSave('scope', '分析范围配置'); }}
                onReset={() => handlePanelReset('scope', '分析范围配置')}
              />
            )}
          >
            {/* 文件类型多选 */}
            <FieldRow
              label="文件类型"
              hint="analyse_targets"
              desc="S0 文件过滤阶段只处理勾选类型。选择「all」不过滤。">
              <div className="flex flex-wrap gap-2 pt-0.5">
                {['all', 'binary', 'script', 'source', 'config', 'firmware', 'crypto', 'database', 'web', 'network_model', 'document', 'archive'].map((t) => {
                  const selected = config.analyse_targets?.includes(t) ?? false;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        const cur = config.analyse_targets ?? ['all'];
                        let next: string[];
                        if (t === 'all') { next = ['all']; }
                        else if (selected) { next = cur.filter(c => c !== t); if (next.length === 0) next = ['all']; }
                        else { next = cur.filter(c => c !== 'all').concat(t); }
                        patch({ analyse_targets: next });
                      }}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                        selected
                          ? 'border-rose-400 bg-rose-50 text-rose-700'
                          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
                      }`}
                    >{t}</button>
                  );
                })}
              </div>
            </FieldRow>

            {/* 二进制架构多选 */}
            <FieldRow
              label="二进制架构"
              hint="binary_arch"
              desc="binary 类型文件的架构过滤，只在 analyse_targets 含 binary 时生效。选择「all」不过滤。">
              <div className="flex flex-wrap gap-2 pt-0.5">
                {['all', 'x86', 'x86_64', 'arm', 'aarch64', 'mips', 'mips64', 'ppc', 'ppc64', 'riscv', 's390'].map((t) => {
                  const selected = config.binary_arch?.includes(t) ?? false;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        const cur = config.binary_arch ?? ['all'];
                        let next: string[];
                        if (t === 'all') { next = ['all']; }
                        else if (selected) { next = cur.filter(c => c !== t); if (next.length === 0) next = ['all']; }
                        else { next = cur.filter(c => c !== 'all').concat(t); }
                        patch({ binary_arch: next });
                      }}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                        selected
                          ? 'border-rose-400 bg-rose-50 text-rose-700'
                          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
                      }`}
                    >{t}</button>
                  );
                })}
              </div>
            </FieldRow>

            {/* 安全维度多选 */}
            <FieldRow
              label="安全维度过滤"
              hint="security_focus_categories"
              desc="S1 分类时只将与指定安全维度相关的文件归入模块，无关文件（构建脚本、i18n、文档等）直接丢弃。选择「全部」不做过滤。">
              <div className="flex flex-wrap gap-2 pt-0.5">
                {[
                  { key: 'all', label: '全部（不过滤）' },
                  { key: 'network_protocol', label: '网络协议解析' },
                  { key: 'file_parsing', label: '文件格式处理' },
                  { key: 'auth_access', label: '认证与访问控制' },
                  { key: 'crypto', label: '密码学操作' },
                  { key: 'ipc', label: '进程间通信' },
                  { key: 'config_parsing', label: '配置与脚本解析' },
                  { key: 'input_handling', label: '输入处理与验证' },
                  { key: 'privilege_process', label: '权限与进程管理' },
                  { key: 'web_api', label: 'Web 与 API 接口' },
                  { key: 'memory_manage', label: '内存管理' },
                ].map(({ key, label }) => {
                  const selected = config.security_focus_categories?.includes(key) ?? false;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        const cats = config.security_focus_categories ?? ['all'];
                        let next: string[];
                        if (key === 'all') {
                          next = ['all'];
                        } else if (selected) {
                          next = cats.filter((c) => c !== key);
                          if (next.length === 0) next = ['all'];
                        } else {
                          next = cats.filter((c) => c !== 'all').concat(key);
                        }
                        patch({ security_focus_categories: next });
                      }}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                        selected
                          ? 'border-rose-400 bg-rose-50 text-rose-700'
                          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </FieldRow>

            {/* 模块粒度切换 */}
            <FieldRow
              label="模块划分粒度"
              hint="module_granularity"
              desc="粗粒度：以完整协议/服务/安全功能为边界（HTTP 全部代码 = 1 模块），适合协议多、文件多的固件。细粒度：当前默认行为，按子组件/功能模块拆分。">
              <div className="flex gap-2">
                {[
                  { value: 'fine', label: '细粒度（子组件级，默认）' },
                  { value: 'coarse', label: '粗粒度（协议/服务/功能级）' },
                ].map(({ value: v, label }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => patch({ module_granularity: v })}
                    className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
                      config.module_granularity === v
                        ? 'border-rose-400 bg-rose-50 text-rose-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </FieldRow>

            <FieldRow
              label="过滤引擎"
              hint="filter_engine"
              desc="智能体驱动会直接替代脚本过滤与 S1 粗分类，默认复用 classify 模型；若执行失败会自动回退到脚本驱动。">
              <div className="flex gap-2">
                {[
                  { value: 'script', label: '脚本驱动（兼容现有）' },
                  { value: 'agent', label: '智能体驱动' },
                ].map(({ value: v, label }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => patch({ filter_engine: v as SystemAnalysisServiceConfig['filter_engine'] })}
                    className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
                      config.filter_engine === v
                        ? 'border-rose-400 bg-rose-50 text-rose-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </FieldRow>

            <FieldRow
              label="完整性检查阶段开关"
              hint="enable_final_check"
              desc="控制是否执行 `final_check — 完整性检查` 阶段。默认关闭；关闭时仅跳过 Stage 4a，不影响最终报告生成与评审。任务创建时如果未单独指定，将继承这里的服务级默认值。">
              <div className="flex gap-2">
                {([
                  { value: true, label: '开启 Stage 4a' },
                  { value: false, label: '关闭 Stage 4a（默认）' },
                ] as const).map(({ value, label }) => (
                  <button
                    key={String(value)}
                    type="button"
                    onClick={() => patch({ enable_final_check: value })}
                    className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
                      config.enable_final_check === value
                        ? 'border-rose-400 bg-rose-50 text-rose-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </FieldRow>

            <FieldRow
              label="单模块失败后继续"
              hint="continue_on_module_failure"
              desc="控制当单个模块在 refine/analyse/补做阶段失败时，是否继续推进其他模块和后续阶段。默认开启。开启后失败模块会保留在评估结果中，但不阻断整任务；关闭后任一模块失败都会使任务失败。">
              <div className="flex gap-2">
                {([
                  { value: true, label: '允许继续（默认）' },
                  { value: false, label: '失败即终止任务' },
                ] as const).map(({ value, label }) => (
                  <button
                    key={String(value)}
                    type="button"
                    onClick={() => patch({ continue_on_module_failure: value })}
                    className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
                      config.continue_on_module_failure === value
                        ? 'border-rose-400 bg-rose-50 text-rose-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </FieldRow>
          </SectionCard>

          {/* 1. 并发配置 */}
          <SectionCard
            title="并发配置"
            subtitle="控制模块级并行度，影响分析速度与 LLM API 调用量"
            actions={(
              <PanelActions
                saving={savingPanel === 'concurrency'}
                onSave={() => { void handlePanelSave('concurrency', '并发配置'); }}
                onReset={() => handlePanelReset('concurrency', '并发配置')}
              />
            )}
          >
            <div className="grid grid-cols-2 gap-4">
              <FieldRow label="worker_task_concurrency" hint="≥1，默认 4"
                desc="系统分析 runner 单实例最多同时执行的任务数。该项为服务级在线配置，保存后会对整个系统分析 runner 池生效，无需重启。建议结合 runner 副本数、节点 CPU/内存和下游 LLM 配额一起评估。">
                <NumberInput value={config.worker_task_concurrency} min={1} max={32} onChange={(v) => patch({ worker_task_concurrency: v })} />
              </FieldRow>
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
          <SectionCard
            title="重试配置"
            subtitle="控制 LLM API 调用失败时的重试策略，以及 pi Agent 进程崩溃时的自动重启策略"
            actions={(
              <PanelActions
                saving={savingPanel === 'retry'}
                onSave={() => { void handlePanelSave('retry', '重试配置'); }}
                onReset={() => handlePanelReset('retry', '重试配置')}
              />
            )}
          >
            <div className="grid grid-cols-2 gap-4">
              <FieldRow label="agent_max_retries" hint="默认无限重试"
                desc="LLM API 调用失败（限流 429、请求超时、4xx/5xx、连接错误）默认会自动无限重试。该字段保留用于兼容展示，推荐保持 -1；进入 30 秒退避档后，每 10 次重试会记录一次任务时间线。">
                <NumberInput value={config.agent_max_retries} min={-1} onChange={(v) => patch({ agent_max_retries: v })} />
              </FieldRow>
              <FieldRow label="agent_retry_delay（秒）" hint="首次等待，之后指数递增"
                desc="API 重试的首次等待时间（秒），后续以指数退避递增（delay × 2ⁿ），最大上限 300 秒。对于频繁限流的服务，适当加大此值可减少无效重试。">
                <NumberInput value={config.agent_retry_delay} min={0} step={0.5} onChange={(v) => patch({ agent_retry_delay: v })} />
              </FieldRow>
              <FieldRow label="agent_timeout_seconds（秒）" hint="兼容字段，已废弃"
                desc="单个 Worker / Judge 智能体会话的最大等待时间。超过该阈值后，系统会主动中断当前会话并将当前阶段按超时失败处理，防止某个会话卡住拖死整个系统分析流程。该项为服务级在线配置，保存后对后续任务统一生效。">
                <NumberInput value={config.agent_timeout_seconds} min={60} step={1} onChange={(v) => patch({ agent_timeout_seconds: v })} />
              </FieldRow>
              <FieldRow label="pi_max_retries" hint="-1=无限重启"
                desc="pi Agent 进程因非 API 原因崩溃（如内存不足、信号中断）后的最大重启次数。通常设为 -1，系统会自动恢复并从上次 checkpoint 继续执行。">
                <NumberInput value={config.pi_max_retries} min={-1} onChange={(v) => patch({ pi_max_retries: v })} />
              </FieldRow>
              <FieldRow label="pi_retry_delay（秒）" hint="进程崩溃后等待时间"
                desc="pi 进程崩溃后重启前的等待时间（秒），给系统留出资源回收时间，避免崩溃-重启循环过于密集导致资源耗尽。">
                <NumberInput value={config.pi_retry_delay} min={0} step={0.5} onChange={(v) => patch({ pi_retry_delay: v })} />
              </FieldRow>
              <FieldRow label="model_stuck_timeout（秒）" hint="单 pi 进程空闲超时"
                desc="单个 pi 进程在这么多秒内没有任何 token 输出、没有会话事件推进时，才被认定为后端模型卡死。只要持续有输出，就不会因为总耗时长而触发。系统会 kill 当前 pi 并重新拆起，继承 session 发送「继续」将模型唤醒。默认 1800（30 分钟），设为 0 禁用该机制。">
                <NumberInput value={config.model_stuck_timeout ?? 1800} min={0} step={60} onChange={(v) => patch({ model_stuck_timeout: v })} />
              </FieldRow>
              <FieldRow label="model_stuck_max_activations" hint="激活次数上限"
                desc="单个 pi 进程连续卡死时，最多发送这么多次「继续」激活指令；超过此次数后进行重启（依然继承 session 发送「继续」）并重置计数。默认 5 次。">
                <NumberInput value={config.model_stuck_max_activations ?? 5} min={1} step={1} onChange={(v) => patch({ model_stuck_max_activations: v })} />
              </FieldRow>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4">
              <p className="text-xs leading-5 text-slate-500 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                ⚠️ <strong>max_rounds 已禁止配置</strong>：所有阶段的最大迭代轮数固定为 <code>-1（无限）</code>，由模型自己收敛而不是被硬性截断。
              </p>
            </div>
          </SectionCard>

          {/* 3. 阶段配置 */}
          <SectionCard
            title="阶段配置"
            subtitle="控制 Pipeline 各阶段的 Worker-Judge 对话轮数及通过策略。每轮由 Worker 完成分析，Judge 评审后决定是否推进到下一阶段。"
            actions={(
              <PanelActions
                saving={savingPanel === 'stages'}
                onSave={() => { void handlePanelSave('stages', '阶段配置'); }}
                onReset={() => handlePanelReset('stages', '阶段配置')}
              />
            )}
          >
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

          {/* 自省分析配置 */}
          <SectionCard
            title="自省分析（Self-Reflection）"
            subtitle="任务结束后自动在后台分析执行过程，识别 Token 消耗热点、卡顿阶段和质量问题，存储改进建议报告。不影响任务本身的执行结果。"
            actions={(
              <PanelActions
                saving={savingPanel === 'self_reflection'}
                onSave={() => { void handlePanelSave('self_reflection', '自省分析配置'); }}
                onReset={() => handlePanelReset('self_reflection', '自省分析配置')}
              />
            )}
          >
            {/* 启用开关 */}
            <FieldRow
              label="启用自省分析"
              hint="self_reflection.enabled"
              desc="任务完成后（passed/failed/error）在后台异步运行，不阻塞任务本身的执行和结果。分析报告存储在配置的输出目录中。">
              <div className="flex gap-2">
                {([true, false] as const).map((val) => (
                  <button
                    key={String(val)}
                    type="button"
                    onClick={() => patch({
                      self_reflection: {
                        ...(config.self_reflection ?? {}),
                        enabled: val,
                      } as SystemAnalysisSelfReflectionConfig,
                    })}
                    className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
                      (config.self_reflection?.enabled ?? false) === val
                        ? 'border-rose-400 bg-rose-50 text-rose-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {val ? '启用' : '关闭'}
                  </button>
                ))}
              </div>
            </FieldRow>

            {/* 模型选择 */}
            <FieldRow
              label="自省分析模型"
              hint="self_reflection.model"
              desc="用于执行自省分析的 LLM 模型。留空时自动使用 workers.agents[0] 的模型。建议使用具备推理能力的中等模型，无需最强模型（分析任务相对直接）。">
              <select
                value={config.self_reflection?.model ?? ''}
                onChange={(e) => patch({
                  self_reflection: {
                    ...(config.self_reflection ?? {}),
                    model: e.target.value,
                  } as SystemAnalysisSelfReflectionConfig,
                })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">(与 workers.agents[0] 相同)</option>
                {modelOptions.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </FieldRow>

            {/* 输出目录 */}
            <FieldRow
              label="报告存储目录"
              hint="self_reflection.output_dir"
              desc="自省报告存储路径（容器内绝对路径）。默认为项目级目录，所有任务的报告统一存入此目录，每份报告标名为 {task_id}_{timestamp}.md。">
              <div className="relative flex items-center gap-2">
                <input
                  type="text"
                  value={config.self_reflection?.output_dir ?? `/data/files/${projectId}/app/chimera-app-system-analyse/self-reflection`}
                  onChange={(e) => patch({
                    self_reflection: {
                      ...(config.self_reflection ?? {}),
                      output_dir: e.target.value,
                    } as SystemAnalysisSelfReflectionConfig,
                  })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                />
                <button
                  type="button"
                  onClick={() => patch({
                    self_reflection: {
                      ...(config.self_reflection ?? {}),
                      output_dir: `/data/files/${projectId}/app/chimera-app-system-analyse/self-reflection`,
                    } as SystemAnalysisSelfReflectionConfig,
                  })}
                  className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                >重置</button>
              </div>
            </FieldRow>

            {/* session 读取限制 */}
            <FieldRow
              label="Session 最大读取行数"
              hint="self_reflection.max_session_lines"
              desc="每个 .jsonl 会话文件最多读取的行数，防止 context 窗口溢出。推荐 500–2000 行。">
              <NumberInput
                value={config.self_reflection?.max_session_lines ?? 1000}
                min={100}
                max={10000}
                step={100}
                onChange={(v) => patch({
                  self_reflection: {
                    ...(config.self_reflection ?? {}),
                    max_session_lines: v,
                  } as SystemAnalysisSelfReflectionConfig,
                })}
              />
            </FieldRow>
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
            actions={(
              <PanelActions
                saving={savingPanel === 'workers'}
                onSave={() => { void handlePanelSave('workers', 'Workers 配置'); }}
                onReset={() => handlePanelReset('workers', 'Workers 配置')}
              />
            )}
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
            actions={(
              <PanelActions
                saving={savingPanel === 'judges'}
                onSave={() => { void handlePanelSave('judges', 'Judges 配置'); }}
                onReset={() => handlePanelReset('judges', 'Judges 配置')}
              />
            )}
          />

          {SHOW_SYSTEM_ANALYSIS_PROMPT_CONFIG ? (
            <SectionCard
              title="执行 Prompt 配置"
              subtitle="这里管理系统分析执行链路实际使用的 Worker / Judge system prompt。只要任务还没进入 running，后续启动时都会使用这里的最新配置。"
            >
              <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-700">
                Prompt 管理页面继续作为模板库使用。这里编辑的是当前项目实际生效的执行 Prompt；从模板库导入只会复制文本，不建立动态绑定。
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-black text-slate-900">Workers Prompt</h3>
                  <p className="mt-1 text-xs text-slate-500">覆盖目录探索、分类、细分、分析、报告生成以及反思相关的 Worker system prompt。</p>
                </div>
                <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                  {WORKER_PROMPT_KEYS.map((promptKey) => (
                    <PromptEditorCard
                      key={`worker-${promptKey}`}
                      role="workers"
                      promptKey={promptKey}
                      desc={WORKER_PROMPT_DESCS[promptKey] || ''}
                      item={config.prompt_overrides.workers[promptKey] ?? emptyPromptItem()}
                      templates={promptTemplates}
                      selectedTemplateId={selectedPromptTemplates[`workers:${promptKey}`] || ''}
                      onChangeTemplateId={(value) => setTemplateSelection('workers', promptKey, value)}
                      onChange={(value) => patchPrompt('workers', promptKey, value)}
                      onImportTemplate={() => importPromptTemplate('workers', promptKey)}
                      onRestoreDefault={() => restorePromptDefault('workers', promptKey)}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-black text-slate-900">Judges Prompt</h3>
                  <p className="mt-1 text-xs text-slate-500">覆盖分类评审、细分评审、安全分析评审、完整性检查和最终报告评审的 Judge system prompt。</p>
                </div>
                <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                  {JUDGE_PROMPT_KEYS.map((promptKey) => (
                    <PromptEditorCard
                      key={`judge-${promptKey}`}
                      role="judges"
                      promptKey={promptKey}
                      desc={JUDGE_PROMPT_DESCS[promptKey] || ''}
                      item={config.prompt_overrides.judges[promptKey] ?? emptyPromptItem()}
                      templates={promptTemplates}
                      selectedTemplateId={selectedPromptTemplates[`judges:${promptKey}`] || ''}
                      onChangeTemplateId={(value) => setTemplateSelection('judges', promptKey, value)}
                      onChange={(value) => patchPrompt('judges', promptKey, value)}
                      onImportTemplate={() => importPromptTemplate('judges', promptKey)}
                      onRestoreDefault={() => restorePromptDefault('judges', promptKey)}
                    />
                  ))}
                </div>
              </div>
            </SectionCard>
          ) : null}

        </div>
      )}
    </div>
  );
};
