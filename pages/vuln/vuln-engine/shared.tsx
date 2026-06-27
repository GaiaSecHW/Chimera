import React from 'react';
import { ListTodo, ServerCog, ShieldAlert, Waypoints } from 'lucide-react';
import { StatisticCard } from '../../../design-system';

export const DEFAULT_CASE_FORM = {
  title: '',
  summary: '',
  severity: 'medium',
  cvss_score: 5.0,
  confidence: 60,
  source_service: 'manual-console',
  asset_type: 'generic_asset',
  asset_locator: '',
};

export const DEFAULT_SERVICE_FORM = {
  service_id: '',
  service_name: '',
  service_type: 'analyzer',
  endpoint: '',
  healthcheck_url: '',
  callback_mode: 'push',
  auth_mode: 'machine_token',
  version: '0.1.0',
  capability_code: '',
  action_type: 'analysis',
  priority: 100,
  timeout_seconds: 300,
  concurrency_limit: 2,
  module_role: 'reproducer',
  bind_stage: 'validation',
  report_channel: 'callback',
  association_note: '',
};

export const DEFAULT_DISPATCH_FORM = {
  action_type: '',
  service_id: '',
};

export const DEFAULT_TASK_FORM = {
  task_type: 'manual_review',
  title: '',
  summary: '',
  assignee: '',
};

export const DEFAULT_DECISION_FORM = {
  decision_status: 'observe',
  summary: '',
};

export const DEFAULT_VALIDATION_FORM = {
  validation_result: 'inconclusive',
  summary: '',
};

export const STAGE_OPTIONS = ['all', 'receive', 'triage', 'validation', 'finished'];
export const DECISION_OPTIONS = ['issue', 'non_issue', 'observe'];
export const VALIDATION_RESULT_OPTIONS = ['vulnerable', 'not_vulnerable', 'inconclusive'];
export const FINISHED_REASON_OPTIONS = ['vulnerable', 'not_vulnerable', 'inconclusive', 'manual_terminated'];
export const ACTION_TYPES = ['analysis', 'validation', 'poc_generation', 'exp_generation', 'proof_verification', 'tool_feedback'];
export const ACTION_QUEUE_FILTERS = ['all', 'queued', 'running', 'failed', 'cancelled', 'succeeded'];
export const REPRO_ACTION_TYPES = ['validation', 'proof_verification', 'poc_generation', 'exp_generation'];
export const WORKSPACE_VIEWS = [
  { key: 'overview', label: '总览' },
  { key: 'cases', label: '案例运行' },
  { key: 'services', label: '能力服务' },
  { key: 'tasks', label: '人工任务' },
  { key: 'queue', label: '动作队列' },
  { key: 'repro', label: '复现配置' },
] as const;

export type WorkspaceViewKey = (typeof WORKSPACE_VIEWS)[number]['key'];

export const LIFECYCLE_NAV_ITEMS = [
  {
    view: 'vuln-overview',
    label: '生命周期总览',
    description: '统一查看案例总量、阶段分布、项目级动作和人工待办。',
  },
  {
    view: 'vuln-intake',
    label: '漏洞中心',
    description: '聚焦接收阶段，处理新上报漏洞与纳管准备。',
  },
  {
    view: 'vuln-verification',
    label: '验证阶段',
    description: '聚焦验证阶段，执行 POC/EXP 生成、复现与环境验证。',
  },
  {
    view: 'vuln-decision',
    label: '漏洞中心',
    description: '统一查看已经过研判或验证收敛的案例，只有形成明确结论后才在这里作为漏洞结果管理。',
  },
  {
    view: 'vuln-queue',
    label: '运行队列',
    description: '从项目维度观察引擎队列、失败动作与重试处置。',
  },
  {
    view: 'vuln-services',
    label: '能力注册',
    description: '统一注册漏洞分析、验证、证明、反馈等插件式能力服务。',
  },
  {
    view: 'vuln-repro-config',
    label: '复现模块配置',
    description: '配置漏洞上报复现模块的注册元数据、阶段绑定和能力关联。',
  },
  {
    view: 'vuln-parameter-config',
    label: '参数配置',
    description: '按阶段维护漏洞引擎动态参数，统一控制接收、研判、验证和终态策略。',
  },
] as const;

export const LIFECYCLE_VIEW_STAGE_MAP: Record<string, string[]> = {
  'vuln-overview': ['receive', 'triage', 'validation', 'finished'],
  'vuln-intake': ['receive'],
  'vuln-analysis': ['triage'],
  'vuln-verification': ['validation'],
  'vuln-decision': ['finished'],
  'vuln-queue': [],
  'vuln-services': [],
  'vuln-repro-config': ['validation'],
  'vuln-parameter-config': ['receive', 'triage', 'validation', 'finished'],
};

export const LIFECYCLE_STAGE_FLOW = [
  { view: 'vuln-intake', label: '上报' },
  { view: 'vuln-verification', label: '验证' },
  { view: 'vuln-decision', label: '漏洞/归档' },
] as const;

export const severityTone: Record<string, string> = {
  critical: 'bg-rose-500/15 text-rose-400',
  high: 'bg-orange-500/15 text-orange-400',
  medium: 'bg-amber-500/15 text-amber-400',
  low: 'bg-emerald-500/15 text-emerald-400',
};

const LK = {
  primary: '#2563EB',
  primarySoft: '#7590ff',
  primaryDeep: 'var(--brand-primary-hover)',
  primaryMuted: 'var(--brand-primary-mask)',
  canvas: 'var(--bg-app)',
  surface: 'var(--bg-surface)',
  surfaceRaised: 'var(--bg-app)',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: 'var(--border-default)',
  borderSoft: 'var(--border-default)',
  ink: 'var(--text-primary)',
  inkSoft: 'var(--text-secondary)',
  body: 'var(--text-secondary)',
  muted: 'var(--text-secondary)',
  mutedSoft: '#8b95a8',
  success: '#30A46C',
  warning: '#D97706',
  error: '#DC2626',
  info: '#4f8cff',
  critical: '#ff4d4f',
  high: '#ff8b3d',
  medium: '#f0b64c',
  low: '#49c5ff',
} as const;

export const STAGE_LABELS: Record<string, string> = {
  all: '全部阶段',
  receive: '接收阶段',
  triage: '研判阶段',
  validation: '验证阶段',
  finished: '已结束',
};

export const SEVERITY_LABELS: Record<string, string> = {
  critical: '严重',
  high: '高危',
  medium: '中危',
  low: '低危',
};

export const DECISION_LABELS: Record<string, string> = {
  issue: '问题',
  non_issue: '非问题',
  observe: '待观察',
  vulnerable: '确认漏洞',
  not_vulnerable: '不是漏洞',
};

export const FINISHED_REASON_LABELS: Record<string, string> = {
  vulnerable: '确认漏洞',
  not_vulnerable: '不是漏洞',
  non_vulnerable: '验证非漏洞',
  inconclusive: '结果不确定',
  non_issue: '研判非问题',
  observe: '继续观察',
  manual_terminated: '人工终止',
};

export const TRIAGE_GATE_LABELS: Record<string, string> = {
  pending: '待确认',
  approved_to_validation: '准入验证',
  rejected_to_validation: '拒绝进入验证',
};

export const VALIDATION_RESULT_LABELS: Record<string, string> = {
  vulnerable: '漏洞成立',
  not_vulnerable: '不是漏洞',
  inconclusive: '结论不确定',
};

export const CASE_STATUS_LABELS: Record<string, string> = {
  intake_created: '已接收',
  files_collecting: '材料收集中',
  ready_for_triage: '待验证',
  waiting: '等待研判',
  ai_assessing: 'AI 研判中',
  manual_assessing: '人工研判中',
  awaiting_manual_gate: '等待人工准入',
  triage_completed: '研判完成',
  queued: '排队中',
  poc_generating: 'PoC 生成中',
  exp_generating: 'EXP 生成中',
  reproducing: '复现中',
  evidence_collecting: '证据收集中',
  validation_completed: '验证完成',
  finished: '已结束',
};

export const ACTION_TYPE_LABELS: Record<string, string> = {
  analysis: '分析',
  validation: '验证',
  poc_generation: '验证脚本生成',
  exp_generation: '利用证明生成',
  proof_verification: '证明校验',
  tool_feedback: '工具反馈',
};

export const ACTION_STATUS_LABELS: Record<string, string> = {
  all: '全部',
  queued: '排队中',
  running: '运行中',
  failed: '失败',
  cancelled: '已取消',
  succeeded: '成功',
};

export const TASK_TYPE_LABELS: Record<string, string> = {
  manual_review: '人工复核',
  manual_analysis: '人工分析',
  manual_validation: '人工验证',
  manual_decision: '人工裁决',
};

export const SERVICE_TYPE_LABELS: Record<string, string> = {
  analyzer: '分析服务',
  validator: '验证服务',
  poc_generator: '验证脚本生成服务',
  exp_generator: '利用证明生成服务',
  reporter: '回传服务',
};

export const REPORT_CHANNEL_LABELS: Record<string, string> = {
  callback: '回调',
  polling: '轮询',
  manual: '人工',
};

export const MODULE_ROLE_LABELS: Record<string, string> = {
  reproducer: '复现模块',
  reporter: '上报模块',
  validator: '验证模块',
  'proof-provider': '证明模块',
};

export const stageTone: Record<string, string> = {
  receive: 'bg-blue-500/15 text-blue-400',
  triage: 'bg-amber-500/15 text-amber-400',
  validation: 'bg-emerald-500/15 text-emerald-400',
  finished: 'bg-theme-elevated text-theme-text-secondary',
};

export const decisionTone: Record<string, string> = {
  issue: 'bg-rose-500/15 text-rose-400',
  non_issue: 'bg-emerald-500/15 text-emerald-400',
  observe: 'bg-blue-500/15 text-blue-400',
};

export const cardClass = 'rounded-xl overflow-hidden';

export const toneOf = (value: string, mapper: Record<string, string>) => mapper[value] || 'bg-theme-elevated text-theme-text-secondary';

export const formatTime = (value?: string | null) => {
  if (!value) return '暂无';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return`${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
};

export const labelOf = (value: string | undefined | null, mapper: Record<string, string>, fallback = '暂无') => {
  if (!value) return fallback;
  return mapper[value] || value;
};

interface StatCardsProps {
  overview: any;
}

export const StatCards: React.FC<StatCardsProps> = ({ overview }) => (
  <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-4 gap-3">
    <StatisticCard
      label="案例总数"
      value={overview?.metrics?.total_cases || 0}
      hint="当前项目内纳入引擎管理的全部案例"
      icon={<ShieldAlert size={18} />}
      tone="danger"
    />
    <StatisticCard
      label="等待外部结果"
      value={overview?.metrics?.waiting_external || 0}
      hint="已派发动作，等待分析、验证或证明服务回调"
      icon={<Waypoints size={18} />}
      tone="info"
    />
    <StatisticCard
      label="人工待办"
      value={overview?.metrics?.manual_tasks_open || 0}
      hint="需要人工分析、复核或裁决的手动工作项"
      icon={<ListTodo size={18} />}
      tone="warning"
    />
    <StatisticCard
      label="活跃能力服务"
      value={overview?.metrics?.active_services || 0}
      hint={`注册服务 ${overview?.metrics?.registered_services || 0} 个，排队动作 ${overview?.metrics?.queued_actions || 0} 个`}
      icon={<ServerCog size={18} />}
      tone="success"
    />
  </div>
);
