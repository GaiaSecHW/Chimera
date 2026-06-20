/**
 * SecOcto 任务领域元数据 — 与 secocto-ui 业务规则对齐的展示/统计辅助。
 *
 * 收纳:
 *   - SECOCTO_AGENT_TYPES / SECOCTO_STATUS_OPTIONS:UI 过滤器选项集中点
 *   - SECOCTO_SCORE_THRESHOLDS:得分分档,改阈值只改这里
 *   - statusMeta / scoreClass:任务行/卡片的视觉映射
 *   - sumByAgent:与原 secocto-ui overview.js 的"运行中 Agent"口径完全等价
 *
 * 视觉用 Chimera 的 theme tokens(theme-bg-elevated / theme-text-* / brand-*),
 * 不引入新色板。
 */
import type { SecOctoEvidenceItem, SecOctoTaskStats } from '../../../types/secocto';

/* ===================== Filter / Enum 常量 ===================== */

export const SECOCTO_STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: '全部状态' },
  { value: 'completed', label: '已完成' },
  { value: 'running', label: '运行中' },
  { value: 'failed', label: '失败' },
];

export const SECOCTO_AGENT_TYPES: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: '全部 Agent' },
  { value: 'claude', label: 'claude' },
  { value: 'claude-web-agent', label: 'claude-web-agent' },
  { value: 'claude-pentest-agent', label: 'claude-pentest-agent' },
  { value: 'claude-binary-agent', label: 'claude-binary-agent' },
  { value: 'claude-kernel-agent', label: 'claude-kernel-agent' },
];

/* ===================== 得分分档 ===================== */

export const SECOCTO_SCORE_THRESHOLDS = { high: 80, mid: 60 } as const;

export const scoreClass = (score: number | null | undefined): string => {
  if (score == null) return 'bg-theme-bg-elevated text-theme-text-faint';
  if (score >= SECOCTO_SCORE_THRESHOLDS.high) return 'bg-emerald-500/15 text-emerald-700';
  if (score >= SECOCTO_SCORE_THRESHOLDS.mid) return 'bg-amber-500/15 text-amber-700';
  return 'bg-red-500/15 text-red-700';
};

/* ===================== 状态映射 ===================== */
/**
 * 兼容 secocto 后端的 completed/running/failed,以及 Chimera 历史类型用过的
 * succeeded 别名 — 输出统一中文标签 + theme token 着色 class。
 */
export const statusMeta = (status: string): { label: string; cls: string } => {
  switch (status) {
    case 'completed':
    case 'succeeded':
      return { label: '已完成', cls: 'bg-emerald-500/15 text-emerald-700' };
    case 'running':
      return { label: '运行中', cls: 'bg-blue-500/15 text-blue-700' };
    case 'failed':
      return { label: '失败', cls: 'bg-red-500/15 text-red-700' };
    default:
      return { label: status || '-', cls: 'bg-theme-bg-elevated text-theme-text-secondary' };
  }
};

/* ===================== 统计聚合 ===================== */
/**
 * 对应 secocto-ui overview.js 中 sumByAgent 的语义:
 * stats.by_agent 字典里所有数值之和 = "运行中 Agent" 卡片数值。
 * 字典缺失返回 null,调用方据此决定回退口径(stats.running 或当前页 running 计数)。
 */
export const sumByAgent = (stats: SecOctoTaskStats | null): number | null => {
  const map = stats?.by_agent;
  if (!map || typeof map !== 'object') return null;
  let total = 0;
  for (const key of Object.keys(map)) {
    const n = Number((map as Record<string, number>)[key]);
    if (!isNaN(n)) total += n;
  }
  return total;
};

/* ===================== TaskDetail 评分 / 严重度 ===================== */

// 评分维度顺序与 secocto-ui SCORE_DIMS 对齐
export const SCORE_DIMS: readonly string[] = ['evidence', 'result', 'process', 'evolution', 'consistency'];

/**
 * 任务总评(优秀/中等/待改进) — 与 stats bar 上的 "得分" 副标题用同一档位。
 */
export const scoreVerdict = (score: number | null | undefined): string => {
  if (score == null) return '—';
  if (score >= SECOCTO_SCORE_THRESHOLDS.high) return '优秀';
  if (score >= SECOCTO_SCORE_THRESHOLDS.mid) return '中等';
  return '待改进';
};

/**
 * 漏洞严重度 → 中文标签 + 视觉 class。与 secocto-ui sevLblMap/sevClsMap 等价,
 * 但用 Chimera theme token,不引入 ov-td-sev-* 类。
 */
export const severityMeta = (sev: string | undefined): { label: string; cls: string } => {
  switch (sev) {
    case 'high':
      return { label: '高', cls: 'bg-red-500/15 text-red-700' };
    case 'medium':
      return { label: '中', cls: 'bg-amber-500/15 text-amber-700' };
    case 'low':
      return { label: '低', cls: 'bg-blue-500/15 text-blue-700' };
    case 'note':
      return { label: '信息', cls: 'bg-theme-bg-elevated text-theme-text-secondary' };
    default:
      return { label: sev || '—', cls: 'bg-theme-bg-elevated text-theme-text-secondary' };
  }
};

/**
 * Finding 状态 → 中文标签 + 视觉 class。confirmed/pending/false_positive/disputed。
 */
export const findingStatusMeta = (status: string | undefined): { label: string; cls: string } => {
  switch (status) {
    case 'confirmed':
      return { label: '已确认', cls: 'bg-emerald-500/15 text-emerald-700' };
    case 'pending':
      return { label: '待确认', cls: 'bg-blue-500/15 text-blue-700' };
    case 'false_positive':
      return { label: '误报', cls: 'bg-red-500/15 text-red-700' };
    case 'disputed':
      return { label: '争议', cls: 'bg-amber-500/15 text-amber-700' };
    default:
      return { label: status || '—', cls: 'bg-theme-bg-elevated text-theme-text-secondary' };
  }
};

/**
 * Annotation verdict → 中文标签 + class。true_positive / false_positive / others。
 */
export const annotationVerdictMeta = (verdict: string | undefined): { label: string; cls: string } => {
  switch (verdict) {
    case 'true_positive':
      return { label: '确认漏洞', cls: 'bg-emerald-500/15 text-emerald-700' };
    case 'false_positive':
      return { label: '误报', cls: 'bg-red-500/15 text-red-700' };
    case 'disputed':
      return { label: '争议', cls: 'bg-amber-500/15 text-amber-700' };
    case 'needs_info':
      return { label: '需补充', cls: 'bg-blue-500/15 text-blue-700' };
    case 'comment':
      return { label: '评论', cls: 'bg-theme-bg-elevated text-theme-text-secondary' };
    default:
      return { label: verdict || '待复核', cls: 'bg-theme-bg-elevated text-theme-text-secondary' };
  }
};

/**
 * Proposal 状态 → 中文标签 + class。merged/pending/rejected。
 */
export const proposalStatusMeta = (status: string | undefined): { label: string; cls: string } => {
  switch (status) {
    case 'merged':
      return { label: '已合并', cls: 'bg-emerald-500/15 text-emerald-700' };
    case 'pending':
      return { label: '待审核', cls: 'bg-amber-500/15 text-amber-700' };
    case 'rejected':
      return { label: '已拒绝', cls: 'bg-red-500/15 text-red-700' };
    default:
      return { label: status || '—', cls: 'bg-theme-bg-elevated text-theme-text-secondary' };
  }
};

/* ===================== evidence_chain 归一化 ===================== */

/**
 * evidence_chain 历史上有两种形态:
 *   1) [{file_path, start_line, end_line, message}, ...]                    旧 vulns.json
 *   2) [{threadFlows:[{locations:[{location:{physicalLocation:{...},message:{text}}}]}]}, ...]
 *                                                                            SARIF (新)
 *   3) Chimera 自有 [{type, title, detail, timestamp}, ...]                  VulnsPages 形态
 * 归一化输出 SecOctoEvidenceItem[],尽量同时把已知字段填上,不丢信息。
 */
export const flattenEvidenceChain = (chain: unknown): SecOctoEvidenceItem[] => {
  if (!Array.isArray(chain)) return [];
  const out: SecOctoEvidenceItem[] = [];
  for (const node of chain) {
    if (!node || typeof node !== 'object') continue;
    const n = node as Record<string, any>;
    // 形态 2:SARIF threadFlows
    if (Array.isArray(n.threadFlows)) {
      for (const tf of n.threadFlows) {
        for (const loc of tf?.locations ?? []) {
          const physical = loc?.location?.physicalLocation ?? {};
          const region = physical?.region ?? {};
          const uri = physical?.artifactLocation?.uri || '';
          const msg = loc?.location?.message?.text || '';
          out.push({
            file_path: uri,
            start_line: region.startLine,
            end_line: region.endLine,
            message: msg,
          });
        }
      }
      continue;
    }
    // 形态 1:扁平 file_path/start_line/message
    if (n.file_path != null || n.message != null || n.start_line != null) {
      out.push({
        file_path: n.file_path || '',
        start_line: n.start_line,
        end_line: n.end_line,
        message: n.message || '',
      });
      continue;
    }
    // 形态 3:Chimera type/title/detail/timestamp(原样保留)
    out.push({
      type: n.type,
      title: n.title,
      detail: n.detail,
      timestamp: n.timestamp,
    });
  }
  return out;
};

/**
 * "file_path:start_line-end_line" 字符串(用于详情页的代码位置展示)
 */
export const formatLocation = (e: { file_path?: string; start_line?: number; end_line?: number }): string => {
  const path = e.file_path || '';
  const start = e.start_line ?? '?';
  const end = e.end_line && e.end_line !== e.start_line ? `-${e.end_line}` : '';
  return `${path}:${start}${end}`;
};

/* ===================== Skill 风险等级 ===================== */

/**
 * Skill risk_level → 视觉 class。secocto 后端有 5 级 + 兜底。
 * 用于 SkillsPage 卡片右上、SkillDetail 顶部 chip 等多处。
 */
export const riskLevelMeta = (level: string | undefined): { label: string; cls: string } => {
  switch (level) {
    case 'safe':
      return { label: 'safe', cls: 'bg-emerald-500/15 text-emerald-700' };
    case 'low':
      return { label: 'low', cls: 'bg-blue-500/15 text-blue-700' };
    case 'medium':
      return { label: 'medium', cls: 'bg-amber-500/15 text-amber-700' };
    case 'high':
      return { label: 'high', cls: 'bg-orange-500/15 text-orange-700' };
    case 'critical':
      return { label: 'critical', cls: 'bg-red-500/15 text-red-700' };
    default:
      return { label: level || '—', cls: 'bg-theme-bg-elevated text-theme-text-secondary' };
  }
};

/* ===================== Decision 合并模式 / 状态 ===================== */

/**
 * Decision mode → badge class。secocto-ui SkillDetail 决策列表表里:
 *   manual-pick → 紫(gate-mode-pick)
 *   llm-merge   → 蓝(gate-mode-merge)
 *   其他/eval   → 灰(gate-mode-eval)
 */
export const decisionModeMeta = (mode: string | undefined): { label: string; cls: string } => {
  switch (mode) {
    case 'manual-pick':
      return { label: mode, cls: 'bg-purple-500/15 text-purple-700' };
    case 'llm-merge':
      return { label: mode, cls: 'bg-blue-500/15 text-blue-700' };
    case 'auto-best':
      return { label: mode, cls: 'bg-indigo-500/15 text-indigo-700' };
    default:
      return { label: mode || '—', cls: 'bg-theme-bg-elevated text-theme-text-secondary' };
  }
};

/**
 * Decision status → badge class。secocto-ui:
 *   merged → 绿;failed → 红;其他(pending/approved/picked) → 琥珀色
 */
export const decisionStatusMeta = (status: string | undefined): { label: string; cls: string } => {
  switch (status) {
    case 'merged':
    case 'approved':
      return { label: status, cls: 'bg-emerald-500/15 text-emerald-700' };
    case 'failed':
    case 'rejected':
      return { label: status, cls: 'bg-red-500/15 text-red-700' };
    case 'pending':
    case 'picked':
      return { label: status, cls: 'bg-amber-500/15 text-amber-700' };
    default:
      return { label: status || '—', cls: 'bg-theme-bg-elevated text-theme-text-secondary' };
  }
};
