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
  severity?: 'high' | 'medium' | 'low' | 'note' | string;
  status?: 'confirmed' | 'pending' | 'false_positive' | 'disputed' | string;
  rule_id?: string;
  rule_name?: string;
  location?: string;
  file_path?: string;
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
}

export interface SecOctoEvidenceItem {
  type?: string;
  title?: string;
  detail?: string;
  timestamp?: string;
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

export interface SecOctoTask {
  task_id: string;
  status: string;
  agent_type?: string;
  score?: number | null;
  skills_used?: string[];
  wiki_used?: string[];
  vulns_discovered?: number;
  title?: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
  finished_at?: string | null;
  feedbacks?: SecOctoTaskFeedback[];
}

export interface SecOctoTaskFeedback {
  id?: number;
  verdict?: string;
  notes?: string;
  created_at?: string;
}

export interface SecOctoTaskStats {
  total?: number;
  running?: number;
  completed?: number;
  failed?: number;
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
}

export interface SecOctoSkillHealth {
  indexed_skills?: number;
}

export interface SecOctoProposal {
  id: number;
  full_name?: string;
  skill_full_name?: string;
  status?: string;
  score?: number | null;
  diff_summary?: string;
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
  status?: 'pending' | 'approved' | 'rejected' | 'picked' | string;
  mode?: 'auto-best' | 'manual-pick' | string;
  created_at?: string;
  updated_at?: string;
}

export interface SecOctoDecisionTimeline {
  id?: number;
  phase?: string;
  status?: string;
  started_at?: string;
  finished_at?: string;
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

export type SecOctoNavKey = 'overview' | 'browse' | 'cards' | 'vulns' | 'compile';
