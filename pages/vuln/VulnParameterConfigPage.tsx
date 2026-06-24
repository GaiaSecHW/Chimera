import React from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, Save, SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '../../design-system';
import { api } from '../../clients/api';
import { STAGE_LABELS, labelOf } from './vuln-engine/shared';

// LOKI design tokens (DESIGN.md) — page-local palette.
const LK = {
  primary: 'var(--brand-primary)',
  primarySoft: '#7590ff',
  primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: 'var(--bg-app)',
  surface: 'var(--bg-surface)',
  surfaceRaised: 'var(--bg-app)',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: 'var(--border-default)',
  borderSoft: '#1b2438',
  ink: 'var(--text-primary)',
  inkSoft: 'var(--text-primary)',
  body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)',
  mutedSoft: '#8b95a8',
  success: '#45c06f',
  warning: '#d5a13a',
  error: '#f15d5d',
  info: '#4f8cff',
} as const;

interface VulnPageProps {
  projectId: string;
  onNavigateToView?: (view: string) => void;
}

type PhaseKey = 'global' | 'receive' | 'triage' | 'validation' | 'finished';

type FieldType = 'boolean' | 'number' | 'text' | 'select' | 'tags';

interface FieldDefinition {
  key: string;
  label: string;
  type: FieldType;
  helper: string;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: string }>;
}

interface PhaseDefinition {
  key: PhaseKey;
  label: string;
  accent: string;
  summary: string;
  badge: string;
  fields: FieldDefinition[];
}

const DEFAULT_CONFIG = {
  global: {
    workflow_code: 'default_vuln_lifecycle',
    auto_orchestrate_new_case: true,
    max_parallel_actions_per_case: 3,
    default_action_timeout_seconds: 300,
    duplicate_window_hours: 24,
    service_health_grace_seconds: 90,
    escalation_keywords: ['RCE', '权限提升', '供应链', '认证绕过'],
  },
  receive: {
    auto_accept_authenticated_reports: true,
    intake_require_project_token_auth: false,
    intake_require_fingerprint: false,
    intake_dedup_mode: 'fingerprint_first',
    minimum_confidence_for_auto_intake: 40,
    receive_stage_sla_hours: 4,
    allowed_reporter_types: ['service', 'plugin', 'cli', 'api', 'human'],
  },
  triage: {
    auto_dispatch_analysis: true,
    triage_round_limit: 3,
    require_manual_gate_for_high_severity: true,
    auto_promote_confidence_threshold: 75,
    triage_owner_role: 'analysis_lead',
    analysis_action_types: ['analysis', 'tool_feedback'],
  },
  validation: {
    auto_dispatch_validation: true,
    validation_retry_limit: 2,
    validation_timeout_minutes: 45,
    allow_parallel_validation: true,
    require_poc_for_high_severity: true,
    preferred_validation_channels: ['validation', 'poc_generation', 'exp_generation'],
  },
  finished: {
    auto_finish_on_verdict: false,
    auto_sync_external_ticket: false,
    archive_retention_days: 30,
    reopen_on_new_evidence: true,
    notify_source_service: true,
    final_gate_required: true,
  },
};

const PHASES: PhaseDefinition[] = [
  {
    key: 'global',
    label: '全局策略',
    accent: 'from-slate-900 via-slate-800 to-slate-700',
    badge: '全局',
    summary: '控制默认工作流、并发、超时与去重窗口，决定漏洞引擎如何"整体运转"。',
    fields: [
      { key: 'workflow_code', label: '默认工作流', type: 'select', helper: '新案例默认挂载的生命周期工作流代码。', options: [{ label: 'default_vuln_lifecycle', value: 'default_vuln_lifecycle' }] },
      { key: 'auto_orchestrate_new_case', label: '新案例自动编排', type: 'boolean', helper: '接收到漏洞后立即触发默认编排动作。' },
      { key: 'max_parallel_actions_per_case', label: '单案例最大并行动作数', type: 'number', helper: '限制同一案例在队列中并行占用的执行槽位。', min: 1, max: 20, step: 1 },
      { key: 'default_action_timeout_seconds', label: '默认动作超时（秒）', type: 'number', helper: '未显式声明 timeout 的动作统一使用该值。', min: 30, max: 7200, step: 30 },
      { key: 'duplicate_window_hours', label: '重复漏洞窗口（小时）', type: 'number', helper: '在该时间窗内优先做聚合或去重，而不是重复创建案例。', min: 1, max: 168, step: 1 },
      { key: 'service_health_grace_seconds', label: '服务健康宽限期（秒）', type: 'number', helper: '超过该宽限期没有心跳的能力服务会被视为待检查。', min: 30, max: 3600, step: 10 },
      { key: 'escalation_keywords', label: '高优先升级关键词', type: 'tags', helper: '命中这些关键词的案例会更容易进入高优先级处理路径。' },
      { key: 'intake_require_project_token_auth', label: '漏洞上报要求项目 Token 认证', type: 'boolean', helper: '关闭时，漏洞上报接口默认不要求项目 Token；开启后，必须使用当前项目绑定的项目级 Token 才能上报。' },
    ],
  },
  {
    key: 'receive',
    label: labelOf('receive', STAGE_LABELS),
    accent: 'from-sky-600 via-cyan-500 to-teal-500',
    badge: '上报',
    summary: '决定外部漏洞如何被纳管、如何去重，以及何时进入后续研判阶段。',
    fields: [
      { key: 'auto_accept_authenticated_reports', label: '自动接收鉴权上报', type: 'boolean', helper: '带有效身份的漏洞上报自动进入接收池。' },
      { key: 'intake_require_fingerprint', label: '要求指纹才能纳管', type: 'boolean', helper: '开启后，没有 fingerprint 的上报只能作为草稿或人工补充。' },
      { key: 'intake_dedup_mode', label: '接收去重策略', type: 'select', helper: '定义接收阶段优先采用哪种去重口径。', options: [
        { label: '指纹优先', value: 'fingerprint_first' },
        { label: '报告 ID 优先', value: 'report_id_first' },
        { label: '标题 + 目标聚合', value: 'title_subject' },
      ] },
      { key: 'minimum_confidence_for_auto_intake', label: '自动纳管最小置信度', type: 'number', helper: '低于阈值的漏洞更适合先进入人工筛选。', min: 0, max: 100, step: 1 },
      { key: 'receive_stage_sla_hours', label: '接收阶段 SLA（小时）', type: 'number', helper: '用于提醒接收池积压，不直接阻断流程。', min: 1, max: 72, step: 1 },
      { key: 'allowed_reporter_types', label: '允许的上报来源类型', type: 'tags', helper: '控制哪些 reporter.type 能直接进入引擎标准流程。' },
    ],
  },
  {
    key: 'triage',
    label: labelOf('triage', STAGE_LABELS),
    accent: 'from-amber-500 via-orange-500 to-rose-500',
    badge: '研判',
    summary: '控制分析动作是否自动派发、需要多少轮研判，以及何时必须人工闸门确认。',
    fields: [
      { key: 'auto_dispatch_analysis', label: '自动派发研判动作', type: 'boolean', helper: '案例进入研判后自动下发 analysis 或工具反馈动作。' },
      { key: 'triage_round_limit', label: '最大研判轮次', type: 'number', helper: '限制案例在 triage 阶段反复回流的次数。', min: 1, max: 10, step: 1 },
      { key: 'require_manual_gate_for_high_severity', label: '高危案例要求人工闸门', type: 'boolean', helper: '高危或严重案例在进入验证前需要人工放行。' },
      { key: 'auto_promote_confidence_threshold', label: '自动进入验证阈值', type: 'number', helper: '当置信度高于阈值时，允许自动推进到验证阶段。', min: 0, max: 100, step: 1 },
      { key: 'triage_owner_role', label: '研判主责角色', type: 'select', helper: '页面用于提示该阶段的默认主责归属。', options: [
        { label: 'analysis_lead', value: 'analysis_lead' },
        { label: 'ai_triager', value: 'ai_triager' },
        { label: 'manual_reviewer', value: 'manual_reviewer' },
      ] },
      { key: 'analysis_action_types', label: '默认研判动作集', type: 'tags', helper: '进入 triage 阶段时优先考虑的动作类型集合。' },
    ],
  },
  {
    key: 'validation',
    label: labelOf('validation', STAGE_LABELS),
    accent: 'from-emerald-500 via-teal-500 to-cyan-500',
    badge: '验证',
    summary: '决定复现、POC、EXP 和自动化验证模块怎么被调用，以及验证失败后的重试策略。',
    fields: [
      { key: 'auto_dispatch_validation', label: '自动派发验证动作', type: 'boolean', helper: '进入验证阶段后，自动创建验证或复现动作。' },
      { key: 'validation_retry_limit', label: '验证重试次数', type: 'number', helper: '用于控制验证执行失败后的自动重试上限。', min: 0, max: 10, step: 1 },
      { key: 'validation_timeout_minutes', label: '验证超时（分钟）', type: 'number', helper: '验证动作建议超时，超过会进入异常或人工接管。', min: 5, max: 240, step: 5 },
      { key: 'allow_parallel_validation', label: '允许并行验证', type: 'boolean', helper: '可以同时调度多个验证服务或证明生成模块。' },
      { key: 'require_poc_for_high_severity', label: '高危案例要求 POC', type: 'boolean', helper: '高危结果在结束前必须有 POC 或等效验证材料。' },
      { key: 'preferred_validation_channels', label: '优先验证通道', type: 'tags', helper: '控制 validation 阶段优先尝试的动作类型顺序集合。' },
    ],
  },
  {
    key: 'finished',
    label: labelOf('finished', STAGE_LABELS),
    accent: 'from-violet-600 via-indigo-600 to-blue-600',
    badge: '结束',
    summary: '控制终态收敛、结论归档、外部同步与新证据触发 reopen 的策略。',
    fields: [
      { key: 'auto_finish_on_verdict', label: '拿到结论自动结束', type: 'boolean', helper: '验证结论稳定后自动进入 finished，不再等待人工点按钮。' },
      { key: 'auto_sync_external_ticket', label: '自动同步外部工单', type: 'boolean', helper: '结束阶段自动向外部漏洞平台或工单系统回传结论。' },
      { key: 'archive_retention_days', label: '归档保留天数', type: 'number', helper: '结束后的证据与动作轨迹建议至少保留的天数。', min: 1, max: 365, step: 1 },
      { key: 'reopen_on_new_evidence', label: '新证据触发 reopen', type: 'boolean', helper: '若后续又收到新证据或新复现材料，则允许重新打开。' },
      { key: 'notify_source_service', label: '通知原始来源服务', type: 'boolean', helper: '向最初上报该漏洞的来源服务反馈最终结论。' },
      { key: 'final_gate_required', label: '要求最终人工闸门', type: 'boolean', helper: '用于高价值项目，终态收敛前必须有人确认摘要。' },
    ],
  },
];

const deepMerge = (base: any, override: any): any => {
  if (Array.isArray(base) || Array.isArray(override)) {
    return Array.isArray(override) ? override : base;
  }
  if (typeof base !== 'object' || base === null || typeof override !== 'object' || override === null) {
    return override ?? base;
  }
  const merged: Record<string, any> = { ...base };
  Object.entries(override).forEach(([key, value]) => {
    merged[key] = key in merged ? deepMerge(merged[key], value) : value;
  });
  return merged;
};

const cloneDefaultConfig = () => JSON.parse(JSON.stringify(DEFAULT_CONFIG));

const normalizeConfig = (config?: Record<string, any>) => deepMerge(cloneDefaultConfig(), config || {});

const stageMetricValue = (phase: PhaseDefinition, config: Record<string, any>) =>
  phase.fields.reduce((acc, field) => acc + (config?.[phase.key]?.[field.key] !== undefined ? 1 : 0), 0);

export const VulnParameterConfigPage: React.FC<VulnPageProps> = ({ projectId, onNavigateToView }) => {
  void onNavigateToView;
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = React.useState<string | null>(null);
  const [updatedBy, setUpdatedBy] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<PhaseKey>('global');
  const [config, setConfig] = React.useState<Record<string, any>>(cloneDefaultConfig());

  const activePhase = React.useMemo(
    () => PHASES.find((item) => item.key === activeTab) || PHASES[0],
    [activeTab],
  );

  const loadConfig = React.useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.domains.vuln.vuln.getProjectConfig(projectId);
      setConfig(normalizeConfig(response?.config));
      setUpdatedAt(response?.updated_at || null);
      setUpdatedBy(response?.updated_by || null);
    } catch (err: any) {
      setError(err?.message || '加载漏洞引擎参数配置失败');
      setConfig(cloneDefaultConfig());
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  React.useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const updateField = (phaseKey: PhaseKey, fieldKey: string, value: any) => {
    setConfig((current) => ({
      ...current,
      [phaseKey]: {
        ...(current?.[phaseKey] || {}),
        [fieldKey]: value,
      },
    }));
  };

  const handleSave = async () => {
    if (!projectId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await api.domains.vuln.vuln.updateProjectConfig(projectId, config);
      setConfig(normalizeConfig(response?.config));
      setUpdatedAt(response?.updated_at || null);
      setUpdatedBy(response?.updated_by || null);
      setSuccess('漏洞引擎动态参数已保存，后续接收、研判、验证与结束阶段会按新策略运行。');
    } catch (err: any) {
      setError(err?.message || '保存漏洞引擎参数配置失败');
    } finally {
      setSaving(false);
    }
  };

  const resetPhase = (phaseKey: PhaseKey) => {
    setConfig((current) => ({
      ...current,
      [phaseKey]: cloneDefaultConfig()[phaseKey],
    }));
  };

  const renderField = (phaseKey: PhaseKey, field: FieldDefinition) => {
    const value = config?.[phaseKey]?.[field.key];
    if (field.type === 'boolean') {
      return (
        <button
          type="button"
          onClick={() => updateField(phaseKey, field.key, !value)}
          className="w-full rounded-lg px-4 py-4 text-left transition-colors"
          style={{
            backgroundColor: value ?`${LK.success}14` : LK.surfaceRaised,
            border: value ?`1px solid ${LK.success}40` :`1px solid ${LK.border}`,
            color: value ? LK.success : LK.body,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = value ? LK.success : LK.primary; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = value ?`${LK.success}40` : LK.border; }}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold">{field.label}</div>
              <div className="mt-1 text-xs leading-5" style={{ color: value ? LK.success : LK.muted }}>{field.helper}</div>
            </div>
            <div
              className="inline-flex min-w-[5rem] justify-center rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-wider tabular-nums"
              style={{
                backgroundColor: value ? LK.success : LK.surface,
                color: value ? '#ffffff' : LK.muted,
                border: value ? 'none' :`1px solid ${LK.border}`,
              }}
            >
              {value ? 'Enabled' : 'Disabled'}
            </div>
          </div>
        </button>
      );
    }

    if (field.type === 'select') {
      return (
        <label
          className="block rounded-lg px-4 py-4"
          style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
        >
          <div className="text-sm font-semibold" style={{ color: LK.ink }}>{field.label}</div>
          <div className="mt-1 text-xs leading-5" style={{ color: LK.body }}>{field.helper}</div>
          <select
            value={value ?? ''}
            onChange={(event) => updateField(phaseKey, field.key, event.target.value)}
            className="mt-3 w-full rounded-lg px-4 py-3 text-sm outline-none transition-colors"
            style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
            onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
            onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
          >
            {(field.options || []).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      );
    }

    if (field.type === 'tags') {
      return (
        <label
          className="block rounded-lg px-4 py-4"
          style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
        >
          <div className="text-sm font-semibold" style={{ color: LK.ink }}>{field.label}</div>
          <div className="mt-1 text-xs leading-5" style={{ color: LK.body }}>{field.helper}</div>
          <textarea
            value={Array.isArray(value) ? value.join(', ') : ''}
            onChange={(event) =>
              updateField(
                phaseKey,
                field.key,
                event.target.value
                  .split(',')
                  .map((item) => item.trim())
                  .filter(Boolean),
              )
            }
            placeholder="多个值用英文逗号分隔"
            className="mt-3 min-h-[7rem] w-full resize-none rounded-lg px-4 py-3 text-sm outline-none transition-colors"
            style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
            onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
            onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
          />
        </label>
      );
    }

    const isNumber = field.type === 'number';
    return (
      <label
        className="block rounded-lg px-4 py-4"
        style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
      >
        <div className="text-sm font-semibold" style={{ color: LK.ink }}>{field.label}</div>
        <div className="mt-1 text-xs leading-5" style={{ color: LK.body }}>{field.helper}</div>
        <input
          type={isNumber ? 'number' : 'text'}
          value={value ?? ''}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(event) => updateField(phaseKey, field.key, isNumber ? Number(event.target.value) : event.target.value)}
          className="mt-3 w-full rounded-lg px-4 py-3 text-sm outline-none transition-colors"
          style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: `1px solid ${LK.border}` }}
          onFocus={(e) => (e.currentTarget.style.borderColor = LK.primary)}
          onBlur={(e) => (e.currentTarget.style.borderColor = LK.border)}
        />
      </label>
    );
  };

  return (
    <div
      className="space-y-4 px-5 py-5 md:px-6 2xl:px-8"
      style={{ backgroundColor: LK.canvas, minHeight: '100%', color: LK.inkSoft }}
    >
      <PageHeader
        title="漏洞引擎参数配置"
        description="将漏洞引擎的动态参数拆成全局、上报、研判、验证、结束五个维度管理。参数保存后，后续案例在各阶段的调度、去重、验证与收敛策略会按这里的配置执行。"
        actions={<div className="grid grid-cols-2 gap-3 xl:min-w-[22rem]">
          <div
            className="rounded-xl px-4 py-4"
            style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
          >
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: LK.muted }}>
              阶段页签
            </div>
            <div className="mt-2 text-2xl font-bold tabular-nums" style={{ color: LK.ink }}>{PHASES.length}</div>
          </div>
          <div
            className="rounded-xl px-4 py-4"
            style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
          >
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: LK.muted }}>
              当前项目
            </div>
            <div className="mt-2 text-sm font-semibold break-all" style={{ color: LK.ink }}>{projectId}</div>
          </div>
        </div>}
      />

      <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: LK.muted }}>
        <span>最近保存：{updatedAt ? new Date(updatedAt).toLocaleString() : '尚未保存'}</span>
        <span>保存人：{updatedBy || '系统默认'}</span>
      </div>

      {error ? (
        <div className="flex items-start gap-3 rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: `${LK.error}14`, border: `1px solid ${LK.error}40`, color: LK.error }}>
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>{error}</div>
        </div>
      ) : null}
      {success ? (
        <div className="flex items-start gap-3 rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: `${LK.success}14`, border: `1px solid ${LK.success}40`, color: LK.success }}>
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          <div>{success}</div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[19rem_minmax(0,1fr)]">
        <aside
          className="space-y-2 rounded-xl p-4"
          style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
        >
          <div className="px-2 pb-3">
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: LK.muted }}>
              阶段页签
            </div>
            <div className="mt-2 text-sm" style={{ color: LK.body }}>
              左侧按阶段切换，右侧编辑当前阶段的动态参数。
            </div>
          </div>
          <div className="space-y-2">
            {PHASES.map((phase) => {
              const active = activeTab === phase.key;
              const configuredCount = stageMetricValue(phase, config);
              return (
                <button
                  key={phase.key}
                  type="button"
                  onClick={() => setActiveTab(phase.key)}
                  className="w-full rounded-lg px-4 py-4 text-left transition-colors"
                  style={{
                    backgroundColor: active ? LK.primaryMuted : LK.surfaceRaised,
                    border: active ?`1px solid ${LK.primary}` :`1px solid ${LK.border}`,
                    color: active ? LK.primary : LK.body,
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = LK.ink; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = LK.body; }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{phase.label}</div>
                      <div className={`mt-1 text-xs ${active ? 'text-primary-soft' : ''}`} style={{ color: active ? LK.primarySoft : LK.muted }}>
                        {phase.badge}
                      </div>
                    </div>
                    <div
                      className="rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wider tabular-nums"
                      style={{
                        backgroundColor: active ? 'rgba(255, 255, 255, 0.15)' : LK.surface,
                        color: active ? LK.primarySoft : LK.muted,
                        border: active ? 'none' :`1px solid ${LK.border}`,
                      }}
                    >
                      {configuredCount}/{phase.fields.length}
                    </div>
                  </div>
                  <div className={`mt-3 text-xs leading-5 ${active ? 'text-primary-soft' : ''}`} style={{ color: active ? LK.primarySoft : LK.muted }}>
                    {phase.summary}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="space-y-4">
          <div
            className="overflow-hidden rounded-xl"
            style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
          >
            <div
              className="px-6 py-6"
              style={{
                background: `linear-gradient(135deg, ${LK.primary}, ${LK.primarySoft})`,
                color: '#ffffff'
              }}
            >
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-3xl">
                  <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                    {activePhase.badge}
                  </div>
                  <h2 className="mt-2 text-2xl font-bold">{activePhase.label}</h2>
                  <p className="mt-2 text-sm leading-7" style={{ color: 'rgba(255, 255, 255, 0.9)' }}>{activePhase.summary}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => resetPhase(activePhase.key)}
                    className="inline-flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold transition-colors"
                    style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', borderColor: 'rgba(255, 255, 255, 0.2)', color: '#ffffff' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'; }}
                  >
                    <RefreshCw size={16} />
                    恢复本页默认
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || loading}
                    className="inline-flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-50"
                    style={{ backgroundColor: '#ffffff', color: LK.primary }}
                    onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.9)'; }}
                    onMouseLeave={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#ffffff'; }}
                  >
                    <Save size={16} />
                    {saving ? '保存中...' : '保存全部参数'}
                  </button>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 text-xs" style={{ borderTop:`1px solid ${LK.borderSoft}`, color: LK.muted }}>
              当前正在编辑 {activePhase.fields.length} 个动态参数字段。阶段参数会与默认结构深度合并，避免因局部更新导致其它阶段配置丢失。
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
            {loading ? (
              <div className="rounded-lg p-8 text-sm" style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}`, color: LK.muted }}>
                正在加载当前项目的漏洞引擎参数...
              </div>
            ) : (
              activePhase.fields.map((field) => (
                <div key={`${activePhase.key}-${field.key}`}>{renderField(activePhase.key, field)}</div>
              ))
            )}
          </div>

          <div
            className="rounded-lg p-6"
            style={{ backgroundColor: LK.surface, border: `1px solid ${LK.border}` }}
          >
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="text-lg font-semibold" style={{ color: LK.ink }}>阶段联动提示</div>
                <div className="mt-1 text-sm" style={{ color: LK.body }}>"{activePhase.label}"阶段的参数改动最容易影响后续的
                  {activePhase.key === 'global' && ' 全链路调度、超时和去重策略。'}
                  {activePhase.key === 'receive' && ' 接收池质量、去重效果和进入研判的入口压力。'}
                  {activePhase.key === 'triage' && ' 自动研判次数、人工闸门频率和进入验证的速度。'}
                  {activePhase.key === 'validation' && ' 复现资源消耗、验证成功率和材料完整性。'}
                  {activePhase.key === 'finished' && ' 结论收敛、归档保留和对外同步行为。'}
                </div>
              </div>
              <div
                className="rounded-lg px-4 py-3 text-xs font-semibold tabular-nums"
                style={{ backgroundColor: LK.surfaceRaised, color: LK.body, border: `1px solid ${LK.border}` }}
              >
                当前阶段已配置 {stageMetricValue(activePhase, config)} / {activePhase.fields.length}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};