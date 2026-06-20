export interface SecOctoMemory {
  id: string;
  title: string;
  abstract?: string;
  scope?: string;
  confidence?: string;
  keywords?: string;
  sources?: string;
  updated?: string;
  fastpath?: string;
}

export interface SecOctoMemoriesResponse {
  items: SecOctoMemory[];
  total: number;
  limit: number;
  offset: number;
}

export interface SecOctoMemoryStatus {
  raw_pending: number;
}

export interface SecOctoCompileTask {
  id: string;
  mode: 'run' | 'dry-run';
  before_raw_pending?: number;
  after_raw_pending?: number;
  exit_code?: number | null;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'timeout';
  last_compile?: string | null;
  created_at: string;
}

export interface SecOctoCompileTasksResponse {
  items: SecOctoCompileTask[];
  total: number;
  limit: number;
  offset: number;
}

export interface SecOctoVulnFinding {
  id: number;
  title?: string;
  description?: string;
  // secocto-ui TaskDetail 用 message,Chimera VulnsPages 用 title — 后端实际字段是 message,
  // 但 title 字段被本地代码沿用,两者并存,渲染端按需 fallback。
  message?: string;
  severity?: 'high' | 'medium' | 'low' | 'note' | string;
  status?: 'confirmed' | 'pending' | 'false_positive' | 'disputed' | string;
  rule_id?: string;
  rule_name?: string;
  location?: string;
  file_path?: string;
  // 后端字段是 start_line/end_line(snake_case),Chimera 历史类型有 line_start/line_end,
  // 两组同时保留兼容,新代码用 start_line/end_line。
  start_line?: number;
  end_line?: number;
  line_start?: number;
  line_end?: number;
  cvss_score?: number | null;
  impact?: string;
  annotations?: SecOctoAnnotation[];
  report_id?: number;
  created_at?: string;
  updated_at?: string;
  sarif_result?: Record<string, any>;
  evidence_chain?: SecOctoEvidenceItem[];
}

export interface SecOctoAnnotation {
  id?: number;
  verdict?: 'true_positive' | 'false_positive' | 'disputed' | 'comment' | 'needs_info' | string;
  analysis?: string;
  cvss_override?: number | null;
  impact_override?: string | null;
  notes?: string;
  context_supplement?: Record<string, any>;
  created_at?: string;
  created_by?: string;
  // secocto-ui 后端在 task detail 上下文里用 annotator + finding_id 把 annotation
  // 反挂到具体 finding 上;在 vuln detail 上下文里(/api/secocto/v1/vulns/findings/{id})annotation
  // 已经嵌在 finding.annotations 里,这两个字段才用不到。两类用法不冲突,都保留可选。
  annotator?: string;
  finding_id?: number;
}

export interface SecOctoEvidenceItem {
  // Chimera 历史使用形态(VulnsPages.tsx)
  type?: string;
  title?: string;
  detail?: string;
  timestamp?: string;
  // secocto-ui TaskDetail 使用形态(经 flattenEvidenceChain 归一化后)
  file_path?: string;
  start_line?: number;
  end_line?: number;
  message?: string;
}

export interface SecOctoVulnStats {
  total_findings?: number;
  by_severity?: Record<string, number>;
  by_status?: Record<string, number>;
}

export interface SecOctoReport {
  id: number;
  task_id?: string;
  repo_url?: string;
  repo_version?: string;
  agent_type?: string;
  finding_count?: number;
  created_at?: string;
  updated_at?: string;
  findings?: SecOctoVulnFinding[];
  sarif_document?: Record<string, any>;
  highest_severity?: string;
}

export interface SecOctoSkillUsage {
  name: string;
  version?: string;
}

export interface SecOctoTask {
  task_id: string;
  status: string;
  agent_type?: string;
  score?: number | null;
  score_vector?: number[];
  score_reasoning?: string;
  skills_used?: SecOctoSkillUsage[];
  wiki_used?: string[];
  vulns_discovered?: number;
  title?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  platform?: string;
  platform_name?: string;
  card_count?: number;
  proposal_count?: number;
  feedback_count?: number;
  vulns_found?: number;
  vulns_confirmed?: number;
  task_ref?: string;
  trace_url?: string;
  bundle_url?: string;
  created_at?: string;
  updated_at?: string;
  finished_at?: string | null;
  feedbacks?: SecOctoTaskFeedback[];
  // secocto-ui 任务详情页直接从 task.proposals 取数(后端在 /api/secocto/v1/tasks/tasks/{id}
  // 已经把关联的 proposal 平铺进来),与 /api/secocto/v1/skills 那侧的 proposal 列表是同一份。
  proposals?: SecOctoProposal[];
}

/**
 * task.wiki_used 是字符串名字数组,经 memoriesApi.findCardsByNames 匹配后的卡片视图。
 * Chimera 这边只渲染,不写;字段与 secocto-ui overview.js 中 _memoryToCard 输出对齐。
 */
export interface SecOctoTaskWikiCard {
  id: string;
  title: string;
  summary?: string;
  tags?: string[];
  created_at?: string;
  card_url?: string;
}

export interface SecOctoTaskFeedback {
  id?: number;
  verdict?: string;
  notes?: string;
  created_at?: string;
  // secocto-ui task detail 渲染用字段:'human' | 'system' 用于来源 badge
  source?: 'human' | 'system' | string;
  // 反馈正文(单独于 notes;后端两种命名都见过,渲染端 content || notes)
  content?: string;
  // 关联的 annotation kv 字典,用于在反馈条目下方显示 key=value 摘要
  annotations?: Record<string, any> | null;
}

export interface SecOctoTaskStats {
  total?: number;
  running?: number;
  completed?: number;
  failed?: number;
  avg_score?: number;
  by_agent?: Record<string, number>;
  by_status?: Record<string, number>;
  sumByAgent?: Record<string, number>;
}

export interface SecOctoSkill {
  full_name: string;
  name?: string;
  namespace?: string;
  slug?: string;
  description?: string;
  short_desc?: string;
  author?: string;
  risk_level?: string;
  stars?: number;
  category?: string;
  tags?: string[];
  supported_tools?: string[];
  // 任务详情页"本次使用"补拉版本号用:后端字段 latest_version 优先,version 兼容
  latest_version?: string;
  version?: string;
  // 进化技能库卡片用:由 client normalizeSkill 解析 `dim:key:value` 形式的 tag
  // 拆出来的 taxonomy 字典(如 { role: 'auditor', workflow_stage: ['intake','triage'] })。
  // 同时把剩余的非 dim: tag 留在 tags 字段。
  taxonomy?: Record<string, string | string[]>;
  // 该 skill 名下的提案列表(后端 /skills 接口在 list 时已嵌入);
  // SkillsPage 卡片读取这个字段计算 pending 数,不再单独发请求。
  proposals?: SecOctoProposal[];
  // 同上,decisions 嵌入到 list 响应里。
  decisions?: SecOctoDecision[];
  // SkillsPage 卡片右下角的 "X pending" 计数 — 由 normalizeSkill 在 client 算好,
  // UI 直接读,避免重复 .filter
  pending_proposal_count?: number;
  // SkillDetail Banner 显示 "Fork from <skill> @ <version>" 信息
  forked_from_skill?: string;
  forked_from_version?: string;
}

export interface SecOctoSkillHealth {
  indexed_skills?: number;
}

export interface SecOctoProposal {
  id: number;
  full_name?: string;
  skill_full_name?: string;
  // secocto-ui task detail 用 skill_name 显示提案对应的 skill 简名,branch 显示分支名
  skill_name?: string;
  branch?: string;
  // skill detail 待处理提案表里"版本"列:base_version → proposed_version
  base_version?: string;
  proposed_version?: string;
  // 提交者
  created_by?: string;
  // 摘要
  summary?: string;
  status?: string;
  score?: number | null;
  diff_summary?: string;
  /** EvolvePage 展开 PR 时缓存的 unified diff 文本(由 gitea.fetchDiff 拉到),避免重复请求 */
  diff?: string;
  pr_number?: number;
  created_at?: string;
}

export interface SecOctoProposalTimeline {
  id?: number;
  phase?: string;
  status?: string;
  started_at?: string;
  finished_at?: string;
}

export interface SecOctoDecision {
  id: number;
  skill_full_name?: string;
  proposal_ids?: number[];
  status?: 'pending' | 'approved' | 'rejected' | 'picked' | 'merged' | 'failed' | 'awaiting_approval' | string;
  mode?: 'auto-best' | 'manual-pick' | 'llm-merge' | 'llm-merge-eval' | 'eval' | string;
  // SkillDetail 决策列表表展示用:gate.js renderDecisionTableBlock 字段
  full_name?: string;
  triggered_by?: string;
  triggered_at?: string;
  finished_at?: string | null;
  created_at?: string;
  updated_at?: string;
  // ResultPage:Meta 行 score / eval_runs 评测结果表 / associated_vulns chip 列表
  // 来源是 secocto-ui demo data/decision-result.json,真实接口可能为空,渲染时按可选处理
  eval_score?: number | null;
  eval_runs?: SecOctoEvalRun[];
  associated_vulns?: string[];
}

export interface SecOctoEvalRun {
  task_name?: string;
  score?: number;
  status?: string;
  weight?: number;
}

export interface SecOctoDecisionTimeline {
  id?: number;
  phase?: string;
  status?: string;
  started_at?: string;
  finished_at?: string;
  // gate.js renderGateResultPage timeline 渲染读取的字段
  event_type?: string;
  event?: string;
  actor?: string;
  created_at?: string;
  /** 兼容旧字段:有些后端用 at 而非 created_at */
  at?: string | number;
}

export interface SecOctoOverviewSummary {
  running_agents?: number;
  completed_tasks?: number;
  avg_score?: number;
  vulns_discovered?: number;
}

export interface SecOctoPlatform {
  name?: string;
  icon?: string;
  accent?: string;
  agents?: number;
  tasks?: number;
  score?: number;
}

export interface SecOctoPagerState {
  page: number;
  size: number;
}

export type SecOctoNavKey = 'overview' | 'skills' | 'memories' | 'vulns' | 'compile';
