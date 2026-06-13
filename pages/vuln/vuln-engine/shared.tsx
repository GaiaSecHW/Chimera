import React from 'react';
import { ListTodo, ServerCog, ShieldAlert, Waypoints } from 'lucide-react';

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
export const FINISHED_REASON_OPTIONS = ['vulnerable', 'non_vulnerable', 'inconclusive', 'non_issue', 'observe', 'manual_terminated'];
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
    label: '疑点中心',
    description: '聚焦接收阶段，处理新上报疑点与纳管准备。',
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
    description: '统一注册疑点分析、验证、证明、反馈等插件式能力服务。',
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
  critical: 'bg-rose-100 text-rose-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-emerald-100 text-emerald-700',
};

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
};

export const FINISHED_REASON_LABELS: Record<string, string> = {
  vulnerable: '确认漏洞',
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
  not_vulnerable: '漏洞不成立',
  inconclusive: '结论不确定',
};

export const CASE_STATUS_LABELS: Record<string, string> = {
  intake_created: '已接收',
  files_collecting: '材料收集中',
  ready_for_triage: '待研判',
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
  receive: 'bg-blue-100 text-blue-700',
  triage: 'bg-amber-100 text-amber-700',
  validation: 'bg-emerald-100 text-emerald-700',
  finished: 'bg-slate-200 text-slate-700',
};

export const decisionTone: Record<string, string> = {
  issue: 'bg-rose-100 text-rose-700',
  non_issue: 'bg-emerald-100 text-emerald-700',
  observe: 'bg-blue-100 text-blue-700',
};

export const cardClass = 'bg-[var(--bg-surface)] border border-[rgba(255,255,255,0.08)] rounded-[2rem] shadow-sm overflow-hidden';

export const toneOf = (value: string, mapper: Record<string, string>) => mapper[value] || 'bg-slate-100 text-slate-600';

export const formatTime = (value?: string | null) => {
  if (!value) return '暂无';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
};

export const labelOf = (value: string | undefined | null, mapper: Record<string, string>, fallback = '暂无') => {
  if (!value) return fallback;
  return mapper[value] || value;
};

interface StatCardsProps {
  overview: any;
}

export const StatCards: React.FC<StatCardsProps> = ({ overview }) => (
  <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-4 gap-6">
    <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">案例总数</span>
        <ShieldAlert className="text-rose-200" size={20} />
      </div>
      <div className="mt-4 text-4xl font-black text-slate-800">{overview?.metrics?.total_cases || 0}</div>
      <p className="mt-2 text-sm text-slate-500">当前项目内纳入引擎管理的全部案例</p>
    </div>
    <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">等待外部结果</span>
        <Waypoints className="text-indigo-200" size={20} />
      </div>
      <div className="mt-4 text-4xl font-black text-slate-800">{overview?.metrics?.waiting_external || 0}</div>
      <p className="mt-2 text-sm text-slate-500">已派发动作，等待分析、验证或证明服务回调</p>
    </div>
    <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">人工待办</span>
        <ListTodo className="text-amber-200" size={20} />
      </div>
      <div className="mt-4 text-4xl font-black text-slate-800">{overview?.metrics?.manual_tasks_open || 0}</div>
      <p className="mt-2 text-sm text-slate-500">需要人工分析、复核或裁决的手动工作项</p>
    </div>
    <div className="bg-slate-900 p-6 rounded-[2rem] shadow-xl shadow-slate-900/10 text-white">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">活跃能力服务</span>
        <ServerCog className="text-emerald-300" size={20} />
      </div>
      <div className="mt-4 text-4xl font-black">{overview?.metrics?.active_services || 0}</div>
      <p className="mt-2 text-sm text-slate-300">注册服务 {overview?.metrics?.registered_services || 0} 个，排队动作 {overview?.metrics?.queued_actions || 0} 个</p>
    </div>
  </div>
);
