import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  ClipboardCopy,
  Copy,
  Download,
  FileCode2,
  FileClock,
  FolderOpen,
  Key,
  Layers3,
  Loader2,
  Puzzle,
  RefreshCw,
  ScrollText,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../../clients/api';
import { authApi } from '../../clients/auth';
import { API_BASE } from '../../clients/base';
import { Modal, PageHeader, PageSection, StatisticCard } from '../../design-system';
import { ServiceBuildVersionBadge, useServiceBuildVersion } from '../../components/execution/ServiceBuildVersion';
import { useUiFeedback } from '../../components/UiFeedback';

const vulnApi = api.domains.vuln;
const assetApi = api.domains.assets;



interface VulnPageProps {
  projectId: string;
  onNavigateToView?: (view: string) => void;
  pageTitle?: string;
  suspectOnly?: boolean;
}

type PublicKind = 'cli' | 'plugin' | 'skill' | 'openapi';
type AuthExampleMode = 'simple' | 'normal';
type SortField = 'title' | 'current_stage' | 'severity' | 'reporter' | 'subject' | 'updated_at' | 'created_at' | 'confidence' | 'cvss_score' | 'conclusion';
type SortDirection = 'asc' | 'desc';
type IntakeDetailTab = 'overview' | 'report' | 'evidence' | 'process' | 'context';
type IntakeRootTab = 'cases' | 'download-center';

const METHOD_ICONS: Record<PublicKind, React.ReactNode> = {
  cli: <TerminalSquare size={18} />,
  plugin: <Puzzle size={18} />,
  skill: <Sparkles size={18} />,
  openapi: <FileCode2 size={18} />,
};

const DEFAULT_SUSPICION_FORM = {
  title: '',
  summary: '',
  severity: 'medium',
  cvss_score: 5.0,
  confidence: 60,
  source_service: 'manual-intake',
  asset_type: 'http',
  asset_locator: '',
  raw_report_markdown: '',
};

const SIMPLE_AUTH_PAYLOAD = {
  project_id: '',
  report_id: 'auth-simple-001',
  title: 'Authenticated simple intake example',
  summary: 'Simple mode without file artifacts',
  severity: 'medium',
  cvss_score: 5.3,
  confidence: 60,
  state: 'suspected',
  category: 'generic_issue',
  rule_id: 'DEMO-SIMPLE-001',
  rule_name: 'Frontend Demo Simple Rule',
  fingerprint: 'demo-simple-fingerprint-001',
  reporter: {
    name: 'frontend-demo',
    version: '1.0.0',
    type: 'api',
    endpoint:`${API_BASE}/api/vuln/public/intake/submissions`,
  },
  subject: {
    type: 'http_endpoint',
    locator: 'https://demo.example/api',
    name: 'demo api',
  },
  evidence: {
    summary: 'Simple suspicion generated from frontend dialog',
    reproduction_hint: 'Use curl to replay the request against the demo endpoint',
    references: [],
  },
  metadata: {
    source: {
      source_service: 'frontend-demo',
      source_kind: 'authenticated-docs',
    },
    tool_output: {
      note: 'simple mode payload',
    },
  },
};

const NORMAL_AUTH_PAYLOAD = {
  project_id: '',
  report_id: 'auth-normal-001',
  title: 'Authenticated normal intake example',
  summary: 'Normal mode with file and folder artifacts',
  severity: 'medium',
  cvss_score: 5.3,
  confidence: 60,
  state: 'suspected',
  category: 'generic_issue',
  rule_id: 'DEMO-NORMAL-001',
  rule_name: 'Frontend Demo Normal Rule',
  fingerprint: 'demo-normal-fingerprint-001',
  reporter: {
    name: 'frontend-demo',
    version: '1.0.0',
    type: 'api',
    endpoint:`${API_BASE}/api/vuln/public/intake/submissions`,
  },
  subject: {
    type: 'http_endpoint',
    locator: 'https://demo.example/api',
    name: 'demo api',
  },
  evidence: {
    summary: 'Demo suspicion generated from frontend dialog',
    reproduction_hint: 'Use curl to replay the request against the demo endpoint',
    references: [],
  },
  artifacts: [
    {
      kind: 'json',
      name: 'raw-result.json',
      content: '{"note":"demo payload"}',
      encoding: 'utf-8',
      media_type: 'application/json',
    },
    {
      kind: 'tree',
      name: 'evidence',
      children: [
        {
          kind: 'file',
          name: 'request.txt',
          path: 'evidence/http/request.txt',
          content_ref: 'artifact://evidence/http/request.txt',
        },
      ],
    },
  ],
  metadata: {
    source: {
      source_service: 'frontend-demo',
      source_kind: 'authenticated-docs',
    },
    tool_output: {
      note: 'normal mode payload',
    },
  },
};

const PUBLIC_FIELDS = [
  { name: 'project_id', required: true, description: '目标项目标识，正式上报时用于项目绑定与项目级权限校验。' },
  { name: 'report_id', required: false, description: '上报方自己的唯一编号，用于追踪、复核与后续回调。' },
  { name: 'title', required: true, description: '漏洞标题。' },
  { name: 'summary', required: false, description: '漏洞摘要与简要说明。' },
  { name: 'severity', required: true, description: '风险等级，只支持严重、高危、中危、低危四档。' },
  { name: 'cvss_score', required: true, description: 'CVSS 基础分最终分，用于统一量化风险。' },
  { name: 'confidence', required: true, description: '置信度，0 到 100。' },
  { name: 'state', required: true, description: '上报方当前判断，默认建议为 suspected。' },
  { name: 'category', required: false, description: '通用问题类别，例如 sql_injection。' },
  { name: 'rule_id / rule_name', required: false, description: '插件或工具自身规则标识。' },
  { name: 'fingerprint', required: false, description: '上报方自己的指纹，平台只保留不做去重。' },
  { name: 'reported_at', required: false, description: '来源实际发现时间。' },
  { name: 'reporter', required: true, description: '上报者身份，必须包含 name、version、type，建议同时带 endpoint。' },
  { name: 'subject', required: true, description: '被上报对象，必须包含 type 与 locator。' },
  { name: 'evidence', required: false, description: '轻量证据摘要、复现提示、引用列表。' },
  { name: 'artifacts', required: false, description: '文件、目录、脚本、截图、原始结果等产物清单。' },
  { name: 'metadata', required: false, description: '所有非统一字段统一放入这里。' },
];

const METADATA_GUIDE = [
  { key: 'metadata.source', value: '来源特有字段，例如扫描模式、插件配置、执行入口。' },
  { key: 'metadata.runtime', value: '运行环境、容器、节点、账号、网络上下文等。' },
  { key: 'metadata.tool_output', value: '原始扫描输出、回包摘要、AST/IR 摘要等。' },
  { key: 'metadata.custom', value: '上报方完全自定义的字段，平台原样保存。' },
];

const ARTIFACT_GUIDE = [
  { title: '单文件上报', detail: '使用 kind=file/text/json/binary，支持 content 内联内容或 content_ref 外部引用。' },
  { title: '文件夹结构上报', detail: '使用 kind=directory 或 tree，并通过 children 递归表达目录树结构。' },
  { title: '压缩包或外部文件', detail: '使用 kind=archive，并通过 content_ref 指向外部文件或对象存储引用。' },
  { title: '二进制内容', detail: '使用 kind=binary，encoding=base64，将内容以内联 base64 传递。' },
  { title: '清单与引用混合', detail: '可以在一个 artifacts 数组中同时放目录清单、文本文件和 content_ref 引用。' },
];

const ANALYSIS_DETAIL_TARGET_KEY = 'chimera-vuln-open-case-id';
const AUTO_VERIFY_CASE_TARGET_KEY = 'chimera-vuln-auto-verify-case-id';
const VERIFY_OPEN_TASK_ID_KEY = 'chimera-vuln-verify-open-task-id';
const VERIFY_OPEN_PROJECT_ID_KEY = 'chimera-vuln-verify-open-project-id';

type AutoVerifyTaskRef = {
  taskId: string;
  projectId?: string;
  reportDataUrl?: string | null;
  createdAt?: string;
};

type EditableCaseIntake = {
  title: string;
  summary: string;
  severity: string;
  cvss_score: number;
  confidence: number;
  state: string;
  category: string;
  rule_id: string;
  rule_name: string;
  fingerprint: string;
  reported_at: string;
  reporter: Record<string, any>;
  subject: Record<string, any>;
  evidence_summary: string;
  evidence_reproduction_hint: string;
  evidence_references_text: string;
  raw_report_markdown: string;
  artifacts_text: string;
  metadata_text: string;
};

const toPrettyJson = (value: any) => JSON.stringify(value ?? {}, null, 2);

const makeEditableCaseIntake = (detail: any): EditableCaseIntake => {
  const references = Array.isArray(detail?.evidence?.references) ? detail.evidence.references : [];
  return {
    title: detail?.title || '',
    summary: detail?.summary || '',
    severity: detail?.severity || 'medium',
    cvss_score: Number(detail?.cvss_score || 0),
    confidence: Number(detail?.confidence || 0),
    state: detail?.state || 'suspected',
    category: detail?.category || '',
    rule_id: detail?.rule_id || '',
    rule_name: detail?.rule_name || '',
    fingerprint: detail?.fingerprint || '',
    reported_at: detail?.reported_at ? String(detail.reported_at).slice(0, 19) : '',
    reporter: detail?.reporter || {},
    subject: detail?.subject || {},
    evidence_summary: detail?.evidence?.summary || '',
    evidence_reproduction_hint: detail?.evidence?.reproduction_hint || '',
    evidence_references_text: toPrettyJson(references),
    raw_report_markdown: detail?.raw_report?.markdown || '',
    artifacts_text: toPrettyJson(Array.isArray(detail?.artifacts) ? detail.artifacts : []),
    metadata_text: toPrettyJson(detail?.metadata || {}),
  };
};

const toneOf = (value?: string) => {
  if (!value) return 'bg-theme-elevated text-theme-text-faint';
  if (['critical', 'high', 'confirmed'].includes(value)) return 'bg-state-danger-soft text-state-danger';
  if (['medium', 'triage', 'issue'].includes(value)) return 'bg-state-warning-soft text-state-warning';
  if (['low', 'validation', 'non_issue'].includes(value)) return 'bg-state-success-soft text-state-success';
  if (['receive', 'observe'].includes(value)) return 'bg-state-info-soft text-state-info';
  return 'bg-theme-elevated text-theme-text-faint';
};

const formatTime = (value?: string) => {
  if (!value) return 'n/a';
  try {
    return new Date(value).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return value;
  }
};

const parseTimeMs = (value?: string) => {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
};

const getCaseSortValue = (item: any, field: SortField) => {
  if (field === 'reporter') return item?.reporter?.name || '';
  if (field === 'subject') return item?.subject?.locator || '';
  if (field === 'updated_at') return parseTimeMs(item?.updated_at || item?.created_at);
  if (field === 'created_at') return parseTimeMs(item?.created_at);
  if (field === 'confidence' || field === 'cvss_score') return Number(item?.[field] || 0);
  if (field === 'conclusion') {
    const isTerminal = item?.current_stage === 'finished' || !!item?.finished_reason;
    const effective = isTerminal ? String(item?.finished_reason || item?.validation_result || '').trim() : '';
    if (effective === 'vulnerable') return 4;
    if (effective === 'not_vulnerable' || effective === 'non_vulnerable') return 3;
    if (effective === 'inconclusive' || effective === 'manual_terminated') return 2;
    return 1;
  }
  return String(item?.[field] || '').toLowerCase();
};

const getEffectiveResult = (item: any) => String(item?.finished_reason || item?.validation_result || '').trim();

const matchesFinalResultFilter = (item: any, filters: string[]) => {
  if (!filters || filters.length === 0) return true;
  const effective = getEffectiveResult(item);
  const isVulnerable = effective === 'vulnerable';
  const isRuledOut = effective === 'not_vulnerable' || effective === 'non_vulnerable';
  return filters.some((f) => {
    if (f === 'vulnerable') return isVulnerable;
    if (f === 'not_vulnerable') return isRuledOut;
    if (f === 'pending') return !isVulnerable && !isRuledOut;
    return false;
  });
};

const getCaseListStats = (items: any[]) => {
  const confirmed = items.filter((item) => item.finished_reason === 'vulnerable').length;
  const ruledOut = items.filter((item) => item.finished_reason === 'not_vulnerable' || item.finished_reason === 'non_vulnerable').length;
  return {
    total: items.length,
    confirmed,
    ruledOut,
    inconclusive: Math.max(0, items.length - confirmed - ruledOut),
  };
};

const sortCases = (items: any[], field: SortField, direction: SortDirection) => {
  const sign = direction === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const left = getCaseSortValue(a, field);
    const right = getCaseSortValue(b, field);
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * sign;
    return String(left).localeCompare(String(right), 'zh-CN') * sign;
  });
};

const collectArray = (value: any): any[] => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  return [];
};

const normalizeAutoVerifyTaskEvent = (item: any, fallbackProjectId?: string): AutoVerifyTaskRef | null => {
  const eventType = item?.event_type || item?.type || item?.payload?.event_type || item?.payload?.type;
  if (eventType !== 'auto_verify_task_created') return null;
  const eventPayload = item?.payload?.payload && typeof item.payload.payload === 'object'
    ? item.payload.payload
    : item?.payload && typeof item.payload === 'object'
      ? item.payload
      : item;
  const taskId = String(eventPayload?.vuln_verify_task_id || eventPayload?.task_id || '').trim();
  if (!taskId) return null;
  return {
    taskId,
    projectId: String(eventPayload?.project_id || item?.project_id || fallbackProjectId || '').trim() || undefined,
    reportDataUrl: eventPayload?.report_data_url || null,
    createdAt: item?.created_at || eventPayload?.created_at,
  };
};

const getLatestAutoVerifyTaskRef = (detail: any, timeline: any[], fallbackProjectId?: string): AutoVerifyTaskRef | null => {
  const candidates = [
    ...collectArray(detail?.timeline),
    ...collectArray(detail?.events),
    ...collectArray(detail?.case_events),
    ...collectArray(detail?.display_summary?.timeline),
    ...collectArray(detail?.display_summary?.events),
    ...collectArray(timeline),
  ]
    .map((item) => normalizeAutoVerifyTaskEvent(item, detail?.project_id || fallbackProjectId))
    .filter((item): item is AutoVerifyTaskRef => Boolean(item));

  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => parseTimeMs(b.createdAt) - parseTimeMs(a.createdAt))[0];
};

const STAGE_TEXT: Record<string, string> = {
  receive: '已接收',
  triage: '研判中',
  validation: '研判中',
  finished: '已结束',
};

const STATUS_TEXT: Record<string, string> = {
  pending: '已接收',
  assessing: '研判中',
  finished: '已结束',
  intake_created: '已接收',
  files_collecting: '已接收',
  ready_for_triage: '已接收',
  waiting: '已接收',
  ai_assessing: '研判中',
  manual_assessing: '研判中',
  awaiting_manual_gate: '研判中',
  queued: '研判中',
  poc_generating: '研判中',
  exp_generating: '研判中',
  reproducing: '研判中',
  evidence_collecting: '研判中',
  triage_completed: '研判中',
  validation_completed: '研判中',
};

const DECISION_TEXT: Record<string, string> = {
  pending: '待定',
  issue: '问题',
  non_issue: '非问题',
  observe: '观察',
  unknown: '未知',
};

const CONCLUSION_TEXT: Record<string, string> = {
  vulnerable: '是漏洞',
  not_vulnerable: '不是漏洞',
  inconclusive: '无法判定',
  manual_terminated: '人工终止',
};

const toUserVulnStatusText = (itemOrStage?: any, status?: string) => {
  if (itemOrStage && typeof itemOrStage === 'object') {
    if (itemOrStage.current_stage === 'finished' || itemOrStage.finished_reason) return '已结束';
    if (itemOrStage.confirm_engine_name) return '研判中';
    status = itemOrStage.current_status;
    itemOrStage = itemOrStage.current_stage;
  }
  if (status && STATUS_TEXT[status]) return STATUS_TEXT[status];
  if (itemOrStage && STAGE_TEXT[itemOrStage]) return STAGE_TEXT[itemOrStage];
  return '未知';
};
const toStageText = (value?: string) => (value ? STAGE_TEXT[value] || value : '未知');
const toStatusText = (value?: string) => (value ? STATUS_TEXT[value] || value : '未知');
const toDecisionText = (value?: string) => (value ? DECISION_TEXT[value] || value : '未知');
const toConclusionText = (value?: string | null) => (value ? CONCLUSION_TEXT[value] || value : '');

const DOWNLOAD_STATUS_TEXT: Record<string, string> = {
  pending: '等待处理中',
  processing: '后台处理中',
  succeeded: '可下载',
  failed: '下载失败',
  expired: '已过期',
};

const formatBytes = (value?: number | null) => {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let current = size;
  let unitIndex = 0;
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }
  return`${current >= 10 || unitIndex === 0 ? current.toFixed(0) : current.toFixed(1)} ${units[unitIndex]}`;
};

const toDownloadStatusText = (value?: string) => (value ? DOWNLOAD_STATUS_TEXT[value] || value : '未知');

const TEXT_FILE_EXTENSIONS = [
  '.txt', '.log', '.md', '.markdown', '.json', '.yaml', '.yml', '.xml', '.csv', '.ts', '.tsx', '.js', '.jsx',
  '.py', '.java', '.go', '.rs', '.c', '.cc', '.cpp', '.h', '.hpp', '.sh', '.bash', '.zsh', '.sql', '.ini',
  '.toml', '.conf', '.cfg', '.properties', '.env', '.http', '.proto', '.dockerfile',
];

const isLikelyTextFile = (file: any): boolean => {
  const contentType = String(file?.content_type || '').toLowerCase();
  if (contentType.startsWith('text/')) return true;
  if (
    contentType.includes('json') ||
    contentType.includes('xml') ||
    contentType.includes('yaml') ||
    contentType.includes('javascript') ||
    contentType.includes('typescript')
  ) {
    return true;
  }
  const name = String(file?.filename || '').toLowerCase();
  return TEXT_FILE_EXTENSIONS.some((ext) => name.endsWith(ext));
};

const hasArtifactFiles = (artifacts: any): boolean => {
  if (!Array.isArray(artifacts) || artifacts.length === 0) return false;
  const stack = [...artifacts];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;
    const kind = String(current.kind || '').toLowerCase();
    if (
      [
        'file',
        'directory',
        'tree',
        'json',
        'text',
        'binary',
        'archive',
        'screenshot',
        'pcap',
        'request_response',
        'report',
        'script',
      ].includes(kind)
    ) {
      return true;
    }
    if (Array.isArray(current.children) && current.children.length > 0) {
      stack.push(...current.children);
    }
  }
  return false;
};

const DialogShell: React.FC<{
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, subtitle, onClose, children }) => (
  <Modal open onClose={onClose} size="xl" title={title} description={subtitle}>
    {children}
  </Modal>
);

const DetailMetricCard: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}> = ({ label, value, hint }) => <StatisticCard label={label} value={value} hint={hint} />;

const slugifyHeading = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^\w\u4e00-\u9fa5\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

const extractMarkdownHeadings = (content: string) =>
  content
    .split('\n')
    .map((line) => line.match(/^(#{1,4})\s+(.+?)\s*$/))
    .filter(Boolean)
    .map((match) => ({
      level: match![1].length,
      text: match![2].trim(),
      id: slugifyHeading(match![2].trim()),
    }));

const MarkdownContent: React.FC<{ content: string }> = ({ content }) => (
  <div className="markdown-body break-words leading-7 text-sm text-theme-text-secondary">
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
  </div>
);

const DetailSectionCard: React.FC<{
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  compact?: boolean;
}> = ({ title, subtitle, children, actions, compact = false }) => (
  <PageSection
    title={title}
    description={subtitle}
    actions={actions}
    className={compact ? 'p-4' : undefined}
  >
    {children}
  </PageSection>
);

export const VulnIntakePage: React.FC<VulnPageProps> = ({ projectId, onNavigateToView, pageTitle = '漏洞中心', suspectOnly = false }) => {
  const [rootTab, setRootTab] = useState<IntakeRootTab>('cases');
  const buildVersion = useServiceBuildVersion(vulnApi.vuln.getHealth);
  const { confirm, feedbackNodes } = useUiFeedback();
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [suspicions, setSuspicions] = useState<any[]>([]);
  const [overview, setOverview] = useState<any | null>(null);
  const [listTotal, setListTotal] = useState(0);
  const [listStats, setListStats] = useState({ total: 0, confirmed: 0, ruledOut: 0, inconclusive: 0 });
  const [selectedSuspicionId, setSelectedSuspicionId] = useState('');
  const [selectedDetail, setSelectedDetail] = useState<any | null>(null);
  const [selectedTimeline, setSelectedTimeline] = useState<any[]>([]);
  const [confirmRecords, setConfirmRecords] = useState<any[]>([]);
  const [linkedFiles, setLinkedFiles] = useState<any | null>(null);
  const [linkedFilesLoading, setLinkedFilesLoading] = useState(false);
  const [linkedFileSearch, setLinkedFileSearch] = useState('');
  const [selectedLinkedPaths, setSelectedLinkedPaths] = useState<string[]>([]);
  const [linkedArchiveSubmitting, setLinkedArchiveSubmitting] = useState(false);
  const [selectedLinkedFile, setSelectedLinkedFile] = useState<any | null>(null);
  const [linkedFilePreview, setLinkedFilePreview] = useState<string>('');
  const [linkedFilePreviewLoading, setLinkedFilePreviewLoading] = useState(false);
  const [linkedFilePreviewError, setLinkedFilePreviewError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [cvssBandFilter, setCvssBandFilter] = useState('all');
  const [reporterTypeFilter, setReporterTypeFilter] = useState('all');
  const [taskFilter, setTaskFilter] = useState<string[]>([]);
  const [taskOptions, setTaskOptions] = useState<Array<{ id: string; name?: string }>>([]);
  const [taskFilterOpen, setTaskFilterOpen] = useState(false);
  const [finalResultFilter, setFinalResultFilter] = useState<string[]>([]);
  const [finalResultFilterOpen, setFinalResultFilterOpen] = useState(false);
  const finalResultFilterRef = useRef<HTMLDivElement | null>(null);
  const [sortField, setSortField] = useState<SortField>('updated_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showSdkDialog, setShowSdkDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [catalog, setCatalog] = useState<any | null>(null);
  const [examples, setExamples] = useState<Record<string, any>>({});
  const [selectedExample, setSelectedExample] = useState<PublicKind>('cli');
  const [authExampleMode, setAuthExampleMode] = useState<AuthExampleMode>('simple');
  const [authPayloadText, setAuthPayloadText] = useState(() =>
    JSON.stringify({ ...SIMPLE_AUTH_PAYLOAD, project_id: projectId || '' }, null, 2),
  );
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authResult, setAuthResult] = useState<any | null>(null);
  const [projectToken, setProjectToken] = useState<any | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [suspicionForm, setSuspicionForm] = useState(DEFAULT_SUSPICION_FORM);
  const [creating, setCreating] = useState(false);
  const [processingAction, setProcessingAction] = useState<'verify' | 'sync_verify' | 'ready_for_triage' | 'false_positive' | 'delete' | null>(null);
  const autoVerifySyncGuardRef = useRef<string>('');
  const [selectedSuspicionIds, setSelectedSuspicionIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [rowDeletingId, setRowDeletingId] = useState<string | null>(null);
  const [confirmingCase, setConfirmingCase] = useState<any | null>(null);
  const [manualConfirmResult, setManualConfirmResult] = useState<'vulnerable' | 'not_vulnerable'>('vulnerable');
  const [manualConfirmReason, setManualConfirmReason] = useState('');
  const [manualConfirmError, setManualConfirmError] = useState('');
  const [manualConfirmSubmitting, setManualConfirmSubmitting] = useState(false);
  const [engineTools, setEngineTools] = useState<Set<string>>(new Set());
  const [enginesLoaded, setEnginesLoaded] = useState(!suspectOnly);
  const [downloadJobs, setDownloadJobs] = useState<any[]>([]);
  const [downloadStats, setDownloadStats] = useState<any>({
    total: 0,
    pending: 0,
    processing: 0,
    succeeded: 0,
    failed: 0,
    expired: 0,
    downloadable: 0,
  });
  const [downloadJobsLoading, setDownloadJobsLoading] = useState(false);
  const [creatingDownload, setCreatingDownload] = useState(false);
  const [downloadActionJobId, setDownloadActionJobId] = useState<string | null>(null);
  const [detailEditMode, setDetailEditMode] = useState(false);
  const [detailSaving, setDetailSaving] = useState(false);
  const [editableDetail, setEditableDetail] = useState<EditableCaseIntake | null>(null);
  const [detailActiveTab, setDetailActiveTab] = useState<IntakeDetailTab>('overview');
  const [reportItems, setReportItems] = useState<any[]>([]);
  const [selectedReportId, setSelectedReportId] = useState('');
  const [reportDocument, setReportDocument] = useState<any | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const reportScrollRef = useRef<HTMLDivElement | null>(null);
  const taskFilterRef = useRef<HTMLDivElement | null>(null);
  const suspicionRequestSeq = useRef(0);
  const [activeReportHeadingId, setActiveReportHeadingId] = useState('');

  const selectedExamplePayload = useMemo(() => examples[selectedExample], [examples, selectedExample]);

  const linkedDirectoryItems = useMemo(() => {
    const directories = Array.isArray(linkedFiles?.directories) ? linkedFiles.directories : [];
    const keyword = linkedFileSearch.trim().toLowerCase();
    if (!keyword) return directories;
    return directories.filter((item: any) => {
      const pool = [item?.name, item?.path].filter(Boolean).map((v) => String(v).toLowerCase());
      return pool.some((v) => v.includes(keyword));
    });
  }, [linkedFiles, linkedFileSearch]);

  const linkedFileItems = useMemo(() => {
    const files = Array.isArray(linkedFiles?.files) ? linkedFiles.files : [];
    const keyword = linkedFileSearch.trim().toLowerCase();
    if (!keyword) return files;
    return files.filter((item: any) => {
      const pool = [item?.filename, item?.path, item?.content_type].filter(Boolean).map((v) => String(v).toLowerCase());
      return pool.some((v) => v.includes(keyword));
    });
  }, [linkedFiles, linkedFileSearch]);

  const totalFiltered = listTotal;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / Math.max(1, pageSize)));
  const normalizedPage = Math.min(Math.max(1, currentPage), totalPages);
  const pageStart = (normalizedPage - 1) * pageSize;
  const pagedSuspicions = suspicions;

  const stats = useMemo(() => {
    const openTasks = (selectedDetail?.manual_tasks || []).filter(
      (item: any) => !['completed', 'closed'].includes(item.status),
    ).length;
    return {
      total: listStats.total,
      confirmed: listStats.confirmed,
      ruledOut: listStats.ruledOut,
      inconclusive: listStats.inconclusive,
      openTasks,
    };
  }, [listStats, selectedDetail]);

  const displaySummary = selectedDetail?.display_summary || {};
  const evidenceSummary = selectedDetail?.evidence_summary || {};
  const workspaceSummary = selectedDetail?.workspace_summary || {};
  const resultSummary = selectedDetail?.result_summary || {};
  const latestAutoVerifyTask = useMemo(
    () => getLatestAutoVerifyTaskRef(selectedDetail, selectedTimeline, projectId),
    [selectedDetail, selectedTimeline, projectId],
  );
  const conclusionReason = useMemo(() => {
    if (!selectedDetail) return { source: '', text: '', engineName: '' };
    if (selectedDetail.finished_reason) {
      const finishedEvents = selectedTimeline
        .filter((item: any) => item.item_type === 'case_finished' || item.payload?.event_type === 'case_finished')
        .sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || ''));
      const text = finishedEvents
        .map((item: any) => item.payload?.summary || item.payload?.payload?.transition_reason || item.payload?.payload?.reason || item.payload?.transition_reason || item.payload?.reason || '')
        .find((value: string) => !!value);
      return { source: 'human', text: text || '', engineName: '' };
    }
    if (selectedDetail.validation_result) {
      const completed = (confirmRecords || [])
        .filter((record: any) => record && (record.status === 'completed' || record.result))
        .sort((a: any, b: any) => (b.completed_at || b.created_at || '').localeCompare(a.completed_at || a.created_at || ''));
      const top = completed[0];
      if (top?.engine_name) {
        return { source: 'engine', text: top?.reason || '', engineName: top.engine_name };
      }
      // No engine confirm record: this validation_result came from a human submission
      // via /validation/result (which writes a validation_result_updated event but no
      // confirm record), not from an engine. Don't mislabel it as engine judgment.
      const humanEvents = selectedTimeline
        .filter((item: any) => item.payload?.event_type === 'validation_result_updated')
        .sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || ''));
      if (humanEvents.length > 0) {
        const text = humanEvents
          .map((item: any) => item.payload?.summary || '')
          .find((value: string) => !!value);
        return { source: 'human', text: text || '', engineName: '' };
      }
      return { source: '', text: '', engineName: '' };
    }
    return { source: '', text: '', engineName: '' };
  }, [selectedDetail, selectedTimeline, confirmRecords]);
  const relatedRefs = Array.isArray(workspaceSummary.related_execution_refs) ? workspaceSummary.related_execution_refs : [];
  const processManualTasks = Array.isArray(selectedDetail?.manual_tasks) ? selectedDetail.manual_tasks : [];
  const processActions = Array.isArray(selectedDetail?.actions) ? selectedDetail.actions : [];
  const openProcessTasks = processManualTasks.filter((item: any) => !['completed', 'closed'].includes(item.status));
  const runningProcessActions = processActions.filter((item: any) => ['queued', 'running'].includes(item.execution_status));

  const loadOverview = async () => {
    if (!projectId) {
      setOverview(null);
      return;
    }
    try {
      const response = await vulnApi.vuln.getOverview(projectId);
      setOverview(response);
    } catch (err: any) {
      setError(err?.message || '加载漏洞总览失败');
    }
  };

  const loadSuspicions = async (pageOverride?: number) => {
    if (!projectId) {
      setSuspicions([]);
      setOverview(null);
      setListTotal(0);
      setListStats({ total: 0, confirmed: 0, ruledOut: 0, inconclusive: 0 });
      setSelectedSuspicionIds([]);
      setSelectedSuspicionId('');
      setSelectedDetail(null);
      setSelectedTimeline([]);
      setConfirmRecords([]);
      setLinkedFiles(null);
      setLoading(false);
      return;
    }
    const requestSeq = ++suspicionRequestSeq.current;
    setLoading(true);
    setError(null);
    if (suspectOnly && !enginesLoaded) {
      return;
    }
    try {
      const baseParams = {
        project_id: projectId,
        current_stage: stageFilter === 'all' ? undefined : stageFilter,
        reporter_type: reporterTypeFilter === 'all' ? undefined : reporterTypeFilter,
        cvss_band: cvssBandFilter === 'all' ? undefined : cvssBandFilter,
        search: search.trim() || undefined,
        sort_field: sortField,
        sort_direction: sortDirection,
      };
      const matchesFinalResult = (item: any) => matchesFinalResultFilter(item, finalResultFilter);
      const matchesSuspect = (item: any): boolean => {
        if (!suspectOnly) return true;
        const reporterName: string = item?.reporter?.name || '';
        if (reporterName && engineTools.has(reporterName)) {
          return getEffectiveResult(item) === 'vulnerable';
        }
        return true;
      };
      const fetchAllForTask = async (taskId: string | undefined): Promise<any[]> => {
        const first = await vulnApi.vuln.listCases({
          ...baseParams,
          source_task_id: taskId,
          page: 1,
          page_size: 500,
        });
        const total = Number(first.total || 0);
        const items = [...(first.items || [])];
        const pages = Math.ceil(total / 500);
        for (let page = 2; page <= pages; page += 1) {
          const next = await vulnApi.vuln.listCases({
            ...baseParams,
            source_task_id: taskId,
            page,
            page_size: 500,
          });
          items.push(...(next.items || []));
        }
        return items;
      };
      const taskIds = taskFilter.length > 0 ? taskFilter : [undefined];
      const chunks: any[][] = [];
      for (const taskId of taskIds) {
        if (requestSeq !== suspicionRequestSeq.current) return;
        chunks.push(await fetchAllForTask(taskId));
      }
      if (requestSeq !== suspicionRequestSeq.current) return;
      const merged = sortCases(
        Array.from(new Map(chunks.flat().map((item: any) => [item.id, item])).values()),
        sortField,
        sortDirection,
      );
      const filtered = merged.filter(matchesSuspect).filter(matchesFinalResult);
      const nextPage = pageOverride ?? currentPage;
      setSuspicions(filtered.slice((nextPage - 1) * pageSize, nextPage * pageSize));
      setListTotal(filtered.length);
      setListStats(getCaseListStats(filtered));
    } catch (err: any) {
      setError(err?.message || '加载漏洞列表失败');
    } finally {
      if (requestSeq === suspicionRequestSeq.current) {
        setLoading(false);
      }
    }
  };

  const loadDownloadCenter = async (options?: { silent?: boolean }) => {
    if (!projectId) {
      setDownloadJobs([]);
      setDownloadStats({
        total: 0,
        pending: 0,
        processing: 0,
        succeeded: 0,
        failed: 0,
        expired: 0,
        downloadable: 0,
      });
      return;
    }
    if (!options?.silent) {
      setDownloadJobsLoading(true);
    }
    try {
      const [jobsResp, statsResp] = await Promise.all([
        vulnApi.vuln.listDownloadJobs(projectId),
        vulnApi.vuln.getDownloadJobStats(projectId),
      ]);
      setDownloadJobs(Array.isArray(jobsResp?.items) ? jobsResp.items : []);
      setDownloadStats(statsResp || {});
    } catch (err: any) {
      if (!options?.silent) {
        setError(err?.message || '加载下载中心失败');
      }
    } finally {
      if (!options?.silent) {
        setDownloadJobsLoading(false);
      }
    }
  };

  const loadSuspicionDetail = async (suspicionId: string) => {
    if (!suspicionId) {
      setSelectedDetail(null);
      setSelectedTimeline([]);
      setConfirmRecords([]);
      setLinkedFiles(null);
      setReportItems([]);
      setSelectedReportId('');
      setReportDocument(null);
      setReportError(null);
      return;
    }
    setDetailLoading(true);
    setSelectedDetail(null);
    setError(null);
    try {
      const [detail, timeline, reports, confirm] = await Promise.all([
        vulnApi.vuln.getCaseDetail(suspicionId),
        vulnApi.vuln.getCaseTimeline(suspicionId),
        vulnApi.vuln.listCaseReports(suspicionId),
        vulnApi.vuln.getCaseConfirmRecords(suspicionId).catch(() => ({ confirm_records: [] })),
      ]);
      setSelectedDetail(detail);
      setSelectedTimeline(timeline.items || []);
      setConfirmRecords(confirm?.confirm_records || []);
      const items = reports?.items || [];
      const rawReportId = detail?.raw_report_summary?.report_id || detail?.display_summary?.current_report_id || '';
      const initialReportId = rawReportId || reports?.current_report_id || items[0]?.report_id || '';
      setReportItems(items);
      setSelectedReportId(initialReportId);
      if (detail?.files_root_path) {
        setLinkedFilesLoading(true);
        try {
          const filesPayload = await assetApi.fileserver.getVulnProjectPathChildren(detail.project_id, detail.files_root_path);
          setLinkedFiles(filesPayload);
          setSelectedLinkedPaths([]);
          setSelectedLinkedFile(null);
          setLinkedFilePreview('');
          setLinkedFilePreviewError(null);
        } finally {
          setLinkedFilesLoading(false);
        }
      } else {
        setLinkedFiles(null);
        setSelectedLinkedPaths([]);
        setSelectedLinkedFile(null);
        setLinkedFilePreview('');
        setLinkedFilePreviewError(null);
      }
    } catch (err: any) {
      setError(err?.message || '加载漏洞详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const loadSuspicionReport = async (suspicionId: string, reportId: string) => {
    if (!suspicionId || !reportId) {
      setReportDocument(null);
      setReportError(null);
      return;
    }
    setReportLoading(true);
    setReportError(null);
    try {
      const payload = await vulnApi.vuln.getCaseReport(suspicionId, reportId);
      setReportDocument(payload);
    } catch (err: any) {
      setReportDocument(null);
      setReportError(err?.message || '加载漏洞报告失败');
    } finally {
      setReportLoading(false);
    }
  };

  const openLinkedFilesPath = async (path: string) => {
    const targetProjectId = selectedDetail?.project_id || linkedFiles?.project_id || projectId;
    if (!targetProjectId || !path) return;
    setLinkedFilesLoading(true);
    setError(null);
    try {
      const payload = await assetApi.fileserver.getVulnProjectPathChildren(targetProjectId, path);
      setLinkedFiles(payload);
      setSelectedLinkedFile(null);
      setLinkedFilePreview('');
      setLinkedFilePreviewError(null);
      setSelectedLinkedPaths([]);
    } catch (err: any) {
      setError(err?.message || '加载漏洞文件失败');
    } finally {
      setLinkedFilesLoading(false);
    }
  };

  const toggleLinkedPathSelection = (path: string) => {
    setSelectedLinkedPaths((prev) => (prev.includes(path) ? prev.filter((item) => item !== path) : [...prev, path]));
  };

  const handleCreateLinkedArchiveTask = async () => {
    if (!selectedDetail?.project_id || selectedLinkedPaths.length === 0) return;
    setLinkedArchiveSubmitting(true);
    setError(null);
    try {
      const resp = await assetApi.fileserver.createVulnProjectPathArchiveTask({
        project_id: selectedDetail.project_id,
        items: selectedLinkedPaths,
      });
      sessionStorage.setItem('chimera:archiveTaskFocus', resp.task_id);
      window.dispatchEvent(new CustomEvent('chimera-navigate-view', { detail: { view: 'fileserver-archive-tasks' } }));
    } catch (err: any) {
      setError(err?.message || '创建打包任务失败');
    } finally {
      setLinkedArchiveSubmitting(false);
    }
  };

  const openLinkedTextPreview = async (file: any) => {
    if (!file?.id) return;
    setSelectedLinkedFile(file);
    setLinkedFilePreview('');
    setLinkedFilePreviewError(null);
    if (!isLikelyTextFile(file)) {
      setLinkedFilePreviewError('该文件不是常见文本类型，暂不支持在线预览，请使用下载。');
      return;
    }
    setLinkedFilePreviewLoading(true);
    try {
      const blob = await assetApi.fileserver.fetchPreviewBlob(file.id);
      if (blob.size > 1024 * 1024) {
        setLinkedFilePreviewError(`文件大小 ${Math.round(blob.size / 1024)}KB，超出在线预览上限（1024KB），请下载查看。`);
        return;
      }
      const text = await blob.text();
      setLinkedFilePreview(text);
    } catch (err: any) {
      setLinkedFilePreviewError(err?.message || '文件预览加载失败');
    } finally {
      setLinkedFilePreviewLoading(false);
    }
  };

  const handleLinkedFileDownload = async (fileId: number, filename: string) => {
    try {
      const blob = await assetApi.fileserver.fetchDownloadBlob(fileId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message || '下载漏洞文件失败');
    }
  };

  const loadProjectToken = async () => {
    if (!projectId) {
      setProjectToken(null);
      setTokenError('当前未选择项目，无法获取项目 Token');
      return;
    }
    setTokenLoading(true);
    setTokenError(null);
    try {
      const token = await authApi.getProjectMachineToken(projectId);
      setProjectToken(token);
    } catch (err: any) {
      setProjectToken(null);
      setTokenError(err?.message || '加载项目 SDK Token 失败');
    } finally {
      setTokenLoading(false);
    }
  };

  const refreshProjectToken = async () => {
    if (!projectId) return;
    if (projectToken?.token) {
      const ok = await confirm({
        message: '刷新 Token 将导致当前 Token 立即失效。\n请先完成其他系统/脚本中的 Token 替换准备，再继续刷新。\n是否确认刷新？',
        danger: true,
      });
      if (!ok) return;
    }
    setTokenLoading(true);
    setTokenError(null);
    try {
      const token = await authApi.refreshProjectMachineToken(projectId);
      setProjectToken(token);
    } catch (err: any) {
      setTokenError(err?.message || '刷新项目 SDK Token 失败');
    } finally {
      setTokenLoading(false);
    }
  };

  const copyProjectToken = async () => {
    if (!projectToken?.token) return;
    await navigator.clipboard.writeText(projectToken.token);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2000);
  };

  const loadPublicAssets = async () => {
    try {
      const [catalogPayload, cliExample, pluginExample, skillExample, openApiExample] = await Promise.all([
        vulnApi.vuln.getPublicIntakeCatalog(),
        vulnApi.vuln.getPublicIntakeExample('cli'),
        vulnApi.vuln.getPublicIntakeExample('plugin'),
        vulnApi.vuln.getPublicIntakeExample('skill'),
        vulnApi.vuln.getPublicIntakeExample('openapi'),
      ]);
      setCatalog(catalogPayload);
      setExamples({
        cli: cliExample,
        plugin: pluginExample,
        skill: skillExample,
        openapi: openApiExample,
      });
    } catch (err: any) {
      setError(err?.message || '加载 SDK 目录失败');
    }
  };

  useEffect(() => {
    void loadOverview();
  }, [projectId]);

  useEffect(() => {
    setTaskFilter([]);
    if (!projectId) {
      setTaskOptions([]);
      return;
    }
    let cancelled = false;
    api.domains.platform.scheduleCenter
      .listUserTasks(projectId, { page_size: 200 })
      .then((resp: any) => {
        if (cancelled) return;
        setTaskOptions(resp.items || []);
      })
      .catch(() => {
        if (!cancelled) setTaskOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    void loadSuspicions();
  }, [projectId, currentPage, pageSize, search, stageFilter, reporterTypeFilter, cvssBandFilter, taskFilter, finalResultFilter, sortField, sortDirection, suspectOnly, enginesLoaded, engineTools]);

  useEffect(() => {
    if (!suspectOnly) {
      setEngineTools(new Set());
      setEnginesLoaded(true);
      return;
    }
    let mounted = true;
    setEnginesLoaded(false);
    vulnApi.vuln
      .listConfirmEngines()
      .then((res) => {
        if (!mounted) return;
        const tools = new Set<string>();
        (res?.engines || []).forEach((eng: any) => {
          (eng?.bind_tools || []).forEach((t: string) => tools.add(t));
        });
        setEngineTools(tools);
      })
      .catch((e) => console.error('Failed to load confirm engines for suspect filter', e))
      .finally(() => {
        if (mounted) setEnginesLoaded(true);
      });
    return () => { mounted = false; };
  }, [suspectOnly]);

  useEffect(() => {
    if (rootTab !== 'download-center') return;
    void loadDownloadCenter();
    const timer = window.setInterval(() => {
      void loadDownloadCenter({ silent: true });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [projectId, rootTab]);

  useEffect(() => {
    setSelectedSuspicionId('');
    setSelectedDetail(null);
    setSelectedTimeline([]);
    setConfirmRecords([]);
    setLinkedFiles(null);
    setSelectedLinkedFile(null);
    setLinkedFilePreview('');
    setLinkedFilePreviewError(null);
    setSelectedSuspicionIds([]);
    setCurrentPage(1);
    setRootTab('cases');
  }, [projectId]);

  useEffect(() => {
    if (selectedSuspicionId) {
      loadSuspicionDetail(selectedSuspicionId);
    }
  }, [selectedSuspicionId]);

  useEffect(() => {
    const pendingCaseId = localStorage.getItem(ANALYSIS_DETAIL_TARGET_KEY);
    if (!pendingCaseId) return;
    setSelectedSuspicionId(pendingCaseId);
    localStorage.removeItem(ANALYSIS_DETAIL_TARGET_KEY);
  }, []);

  useEffect(() => {
    if (!selectedDetail) {
      setEditableDetail(null);
      setDetailEditMode(false);
      return;
    }
    setEditableDetail(makeEditableCaseIntake(selectedDetail));
    setDetailEditMode(false);
  }, [selectedDetail?.id]);

  useEffect(() => {
    setDetailActiveTab('overview');
  }, [selectedDetail?.id]);

  useEffect(() => {
    if (!selectedSuspicionId || !selectedReportId) {
      setReportDocument(null);
      setReportError(null);
      setActiveReportHeadingId('');
      return;
    }
    void loadSuspicionReport(selectedSuspicionId, selectedReportId);
  }, [selectedSuspicionId, selectedReportId]);

  useEffect(() => {
    if (detailActiveTab !== 'report') return;
    const container = reportScrollRef.current;
    if (!container) return;
    const headings = Array.from(container.querySelectorAll('h1[id], h2[id], h3[id], h4[id]')) as HTMLElement[];
    if (headings.length === 0) {
      setActiveReportHeadingId('');
      return;
    }

    const updateActiveHeading = () => {
      const containerTop = container.getBoundingClientRect().top;
      let currentId = headings[0].id;
      for (const heading of headings) {
        const offset = heading.getBoundingClientRect().top - containerTop;
        if (offset <= 80) {
          currentId = heading.id;
        } else {
          break;
        }
      }
      setActiveReportHeadingId(currentId);
    };

    updateActiveHeading();
    container.addEventListener('scroll', updateActiveHeading, { passive: true });
    return () => container.removeEventListener('scroll', updateActiveHeading);
  }, [detailActiveTab, reportDocument?.content]);

  useEffect(() => {
    setSelectedSuspicionIds((previous) => previous.filter((id) => suspicions.some((item) => item.id === id)));
  }, [suspicions]);

  useEffect(() => {
    if (!taskFilterOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!taskFilterRef.current?.contains(event.target as Node)) {
        setTaskFilterOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTaskFilterOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [taskFilterOpen]);

  useEffect(() => {
    if (!finalResultFilterOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!finalResultFilterRef.current?.contains(event.target as Node)) {
        setFinalResultFilterOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFinalResultFilterOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [finalResultFilterOpen]);

  const toggleFinalResultFilter = (value: string) => {
    setFinalResultFilter((current) => (current.includes(value) ? current.filter((v) => v !== value) : [...current, value]));
  };
  const clearFinalResultFilter = () => setFinalResultFilter([]);

  useEffect(() => {
    if (showSdkDialog && !catalog) {
      loadPublicAssets();
    }
  }, [showSdkDialog, catalog]);

  useEffect(() => {
    if (showSdkDialog) {
      void loadProjectToken();
    }
  }, [showSdkDialog, projectId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, stageFilter, reporterTypeFilter, cvssBandFilter, taskFilter, finalResultFilter, pageSize, sortField, sortDirection]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!selectedDetail?.id || !latestAutoVerifyTask?.taskId) return;
    const shouldSync =
      selectedDetail.current_stage === 'validation' &&
      !['validation_completed', 'finished'].includes(String(selectedDetail.current_status || ''));
    if (!shouldSync) return;
    void syncLatestAutoVerifyTask({ silent: true });
  }, [selectedDetail?.id, selectedDetail?.updated_at, selectedDetail?.current_stage, selectedDetail?.current_status, latestAutoVerifyTask?.taskId]);

  const applyAuthExampleMode = (mode: AuthExampleMode) => {
    const template = mode === 'simple' ? SIMPLE_AUTH_PAYLOAD : NORMAL_AUTH_PAYLOAD;
    setAuthExampleMode(mode);
    setAuthPayloadText(JSON.stringify({ ...template, project_id: projectId || '' }, null, 2));
  };

  useEffect(() => {
    setAuthPayloadText((prev) => {
      try {
        const parsed = JSON.parse(prev);
        parsed.project_id = projectId || parsed.project_id || '';
        return JSON.stringify(parsed, null, 2);
      } catch {
        const template = authExampleMode === 'simple' ? SIMPLE_AUTH_PAYLOAD : NORMAL_AUTH_PAYLOAD;
        return JSON.stringify({ ...template, project_id: projectId || '' }, null, 2);
      }
    });
  }, [projectId, authExampleMode]);

  const handleCreateSuspicion = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const created = await vulnApi.vuln.createCase({
        project_id: projectId,
        report_id:`manual-${Date.now()}`,
        title: suspicionForm.title,
        summary: suspicionForm.summary,
        severity: suspicionForm.severity,
        cvss_score: Number(suspicionForm.cvss_score),
        confidence: Number(suspicionForm.confidence),
        state: 'suspected',
        category: 'manual_suspicion',
        reporter: {
          name: suspicionForm.source_service || 'manual-intake',
          version: '1.0.0',
          type: 'human',
        },
        subject: {
          type: suspicionForm.asset_type,
          locator: suspicionForm.asset_locator,
        },
        evidence: {
          summary: suspicionForm.summary,
          references: [],
        },
        artifacts: [],
        raw_report: suspicionForm.raw_report_markdown
          ? {
              markdown: suspicionForm.raw_report_markdown,
              title: suspicionForm.title || '原始漏洞报告',
              report_id:`raw-${Date.now()}`,
              source: 'manual-intake',
            }
          : undefined,
        metadata: {
          source: {
            source_service: suspicionForm.source_service,
            source_kind: 'manual',
          },
          custom: {
            entity_label: '漏洞',
          },
        },
      });
      setSuspicionForm(DEFAULT_SUSPICION_FORM);
      setShowCreateDialog(false);
      await Promise.all([loadOverview(), loadSuspicions(1)]);
      setSelectedSuspicionId(created.id);
      setSuccessMessage(`漏洞"${created.title}" 已创建。`);
    } catch (err: any) {
      setError(err?.message || '创建漏洞失败');
    } finally {
      setCreating(false);
    }
  };

  const handleSaveDetailEdit = async () => {
    if (!selectedDetail?.id || !editableDetail) return;
    setDetailSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      let evidenceReferences: any[] = [];
      let artifacts: any[] = [];
      let metadata: Record<string, any> = {};
      try {
        evidenceReferences = JSON.parse(editableDetail.evidence_references_text || '[]');
      } catch {
        throw new Error('evidence.references JSON 格式不正确');
      }
      try {
        artifacts = JSON.parse(editableDetail.artifacts_text || '[]');
      } catch {
        throw new Error('artifacts JSON 格式不正确');
      }
      try {
        metadata = JSON.parse(editableDetail.metadata_text || '{}');
      } catch {
        throw new Error('metadata JSON 格式不正确');
      }
      if (!Array.isArray(evidenceReferences)) {
        throw new Error('evidence.references 必须是数组');
      }
      if (!Array.isArray(artifacts)) {
        throw new Error('artifacts 必须是数组');
      }
      const payload = {
        title: editableDetail.title,
        summary: editableDetail.summary || null,
        severity: editableDetail.severity,
        cvss_score: Number(editableDetail.cvss_score),
        confidence: Number(editableDetail.confidence),
        state: editableDetail.state,
        category: editableDetail.category || null,
        rule_id: editableDetail.rule_id || null,
        rule_name: editableDetail.rule_name || null,
        fingerprint: editableDetail.fingerprint || null,
        reported_at: editableDetail.reported_at ? new Date(editableDetail.reported_at).toISOString() : null,
        reporter: editableDetail.reporter,
        subject: editableDetail.subject,
        evidence: {
          summary: editableDetail.evidence_summary || null,
          reproduction_hint: editableDetail.evidence_reproduction_hint || null,
          references: evidenceReferences,
        },
        raw_report: editableDetail.raw_report_markdown.trim()
          ? {
              markdown: editableDetail.raw_report_markdown,
              title: editableDetail.title || '原始漏洞报告',
              report_id: selectedDetail.raw_report?.report_id ||`raw-${selectedDetail.id}`,
              source: selectedDetail.raw_report?.source || selectedDetail.created_by || 'manual-edit',
            }
          : undefined,
        artifacts,
        metadata,
      };
      await vulnApi.vuln.updateCase(selectedDetail.id, payload);
      await Promise.all([loadOverview(), loadSuspicions()]);
      await loadSuspicionDetail(selectedDetail.id);
      setDetailEditMode(false);
      setSuccessMessage('漏洞上报字段已更新。');
    } catch (err: any) {
      setError(err?.message || '保存漏洞失败');
    } finally {
      setDetailSaving(false);
    }
  };

  const handleCancelDetailEdit = () => {
    if (!selectedDetail) return;
    setEditableDetail(makeEditableCaseIntake(selectedDetail));
    setDetailEditMode(false);
  };

  const handleAuthenticatedSubmit = async () => {
    setAuthSubmitting(true);
    setError(null);
    setAuthResult(null);
    try {
      const payload = JSON.parse(authPayloadText);
      const result = await vulnApi.vuln.submitAuthenticatedIntake(payload);
      setAuthResult(result);
      await Promise.all([loadOverview(), loadSuspicions(1)]);
    } catch (err: any) {
      setError(err?.message || '认证正式上报失败');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleOpenAutoVerifyTask = () => {
    if (!selectedDetail?.id) return;
    setProcessingAction('verify');
    setError(null);
    setSuccessMessage(null);
    try {
      if (latestAutoVerifyTask?.taskId) {
        localStorage.setItem(VERIFY_OPEN_TASK_ID_KEY, latestAutoVerifyTask.taskId);
        localStorage.setItem(VERIFY_OPEN_PROJECT_ID_KEY, latestAutoVerifyTask.projectId || selectedDetail.project_id || projectId);
        onNavigateToView?.('pentest-vuln-verify');
        return;
      }
      localStorage.setItem(AUTO_VERIFY_CASE_TARGET_KEY, selectedDetail.id);
      localStorage.setItem(ANALYSIS_DETAIL_TARGET_KEY, selectedDetail.id);
      onNavigateToView?.('vuln-analysis-verify-create');
    } catch (err: any) {
      setError(err?.message || '打开验证任务页面失败');
    } finally {
      setProcessingAction(null);
    }
  };

  const syncLatestAutoVerifyTask = async (options?: { silent?: boolean; force?: boolean }) => {
    if (!selectedDetail?.id || !latestAutoVerifyTask?.taskId) return null;
    const guardKey =`${selectedDetail.id}:${latestAutoVerifyTask.taskId}:${selectedDetail.updated_at || ''}:${selectedDetail.current_status || ''}`;
    if (!options?.force && autoVerifySyncGuardRef.current === guardKey) return null;
    autoVerifySyncGuardRef.current = guardKey;
    if (!options?.silent) {
      setProcessingAction('sync_verify');
      setError(null);
      setSuccessMessage(null);
    }
    try {
      const response = await vulnApi.vuln.syncAutoVerifyTask(selectedDetail.id, {
        vuln_verify_task_id: latestAutoVerifyTask.taskId,
      });
      await Promise.all([loadOverview(), loadSuspicions()]);
      await loadSuspicionDetail(selectedDetail.id);
      if (!options?.silent) {
        setSuccessMessage(`验证结果已同步：${response.validation_result || 'inconclusive'}`);
      }
      return response;
    } catch (err: any) {
      if (!options?.silent) {
        setError(err?.message || '同步验证结果失败');
      }
      return null;
    } finally {
      if (!options?.silent) {
        setProcessingAction(null);
      }
    }
  };

  const handleSyncAutoVerifyTask = async () => {
    await syncLatestAutoVerifyTask({ force: true });
  };

  const handleMarkReadyForTriage = async () => {
    if (!selectedDetail?.id) return;
    setProcessingAction('ready_for_triage');
    setError(null);
    setSuccessMessage(null);
    try {
      await vulnApi.vuln.updateReceiveStatus(selectedDetail.id, {
        receive_status: 'ready_for_triage',
        summary: '接收阶段信息已补齐，标记为待验证',
      });
      await Promise.all([loadOverview(), loadSuspicions()]);
      await loadSuspicionDetail(selectedDetail.id);
      setSuccessMessage('漏洞已标记为待验证。');
    } catch (err: any) {
      setError(err?.message || '标记待验证失败');
    } finally {
      setProcessingAction(null);
    }
  };

  const handleMarkFalsePositive = async () => {
    if (!selectedDetail?.id) return;
    setProcessingAction('false_positive');
    setError(null);
    setSuccessMessage(null);
    try {
      await vulnApi.vuln.submitDecision(selectedDetail.id, {
        decision_status: 'non_issue',
        summary: '在漏洞上报中心手动判定为非问题',
      });
      await Promise.all([loadOverview(), loadSuspicions()]);
      await loadSuspicionDetail(selectedDetail.id);
      setSuccessMessage('漏洞已手动标记为非问题。');
    } catch (err: any) {
      setError(err?.message || '标记非问题失败');
    } finally {
      setProcessingAction(null);
    }
  };

  const handleDeleteSuspicion = async () => {
    if (!selectedDetail?.id) return;
    const ok = await confirm({ message: `确认删除漏洞"${selectedDetail.title}"吗？此操作不可恢复。`, danger: true });
    if (!ok) return;
    setProcessingAction('delete');
    setError(null);
    setSuccessMessage(null);
    try {
      await vulnApi.vuln.deleteCase(selectedDetail.id);
      const deletedTitle = selectedDetail.title;
      setSelectedSuspicionId('');
      setSelectedDetail(null);
      setSelectedTimeline([]);
      setConfirmRecords([]);
      const nextPage = pagedSuspicions.length <= 1 && currentPage > 1 ? currentPage - 1 : currentPage;
      await Promise.all([loadOverview(), loadSuspicions(nextPage)]);
      setSuccessMessage(`漏洞“${deletedTitle}”已删除。`);
    } catch (err: any) {
      setError(err?.message || '删除漏洞失败');
    } finally {
      setProcessingAction(null);
    }
  };

  const handleDeleteSingleFromList = async (caseId: string, title: string) => {
    const ok = await confirm({ message: `确认删除漏洞"${title}"吗？此操作不可恢复。`, danger: true });
    if (!ok) return;
    setRowDeletingId(caseId);
    setError(null);
    setSuccessMessage(null);
    try {
      await vulnApi.vuln.deleteCase(caseId);
      const nextPage = pagedSuspicions.length <= 1 && currentPage > 1 ? currentPage - 1 : currentPage;
      await Promise.all([loadOverview(), loadSuspicions(nextPage)]);
      setSelectedSuspicionIds((previous) => previous.filter((id) => id !== caseId));
      setSuccessMessage(`漏洞“${title}”已删除。`);
    } catch (err: any) {
      setError(err?.message || '删除漏洞失败');
    } finally {
      setRowDeletingId(null);
    }
  };

  const handleDeleteSelectedFromList = async () => {
    if (selectedSuspicionIds.length === 0) return;
    const ok = await confirm({ message: `确认删除已选择的 ${selectedSuspicionIds.length} 条漏洞吗？此操作不可恢复。`, danger: true });
    if (!ok) return;
    setBulkDeleting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await Promise.all(selectedSuspicionIds.map((id) => vulnApi.vuln.deleteCase(id)));
      const deletedCount = selectedSuspicionIds.length;
      setSelectedSuspicionIds([]);
      const nextPage = pagedSuspicions.length <= deletedCount && currentPage > 1 ? currentPage - 1 : currentPage;
      await Promise.all([loadOverview(), loadSuspicions(nextPage)]);
      setSuccessMessage(`已删除 ${deletedCount} 条漏洞。`);
    } catch (err: any) {
      setError(err?.message || '批量删除漏洞失败');
    } finally {
      setBulkDeleting(false);
    }
  };

  const openManualConfirm = (item: any) => {
    setConfirmingCase(item);
    setManualConfirmResult('vulnerable');
    setManualConfirmReason('');
    setManualConfirmError('');
  };

  const closeManualConfirm = () => {
    if (manualConfirmSubmitting) return;
    setConfirmingCase(null);
    setManualConfirmReason('');
    setManualConfirmError('');
  };

  const submitManualConfirm = async () => {
    if (!confirmingCase?.id) return;
    const reason = manualConfirmReason.trim();
    if (manualConfirmResult === 'not_vulnerable' && !reason) {
      setManualConfirmError('确认不是漏洞时必须填写原因。');
      return;
    }
    setManualConfirmSubmitting(true);
    setManualConfirmError('');
    setError(null);
    setSuccessMessage(null);
    try {
      await vulnApi.vuln.finishCase(confirmingCase.id, {
        finished_reason: manualConfirmResult,
        summary: manualConfirmResult === 'vulnerable' ? '人工确认：是漏洞' : reason,
      });
      const caseId = confirmingCase.id;
      setConfirmingCase(null);
      setManualConfirmReason('');
      setSelectedSuspicionIds((previous) => previous.filter((id) => id !== caseId));
      await Promise.all([loadOverview(), loadSuspicions(currentPage)]);
      if (selectedDetail?.id === caseId) {
        await loadSuspicionDetail(caseId);
      }
      setSuccessMessage('漏洞终审结果已更新。');
    } catch (err: any) {
      setManualConfirmError(err?.message || '确认漏洞失败');
    } finally {
      setManualConfirmSubmitting(false);
    }
  };

  const handleCreateDownloadJob = async (reportIds: string[], mode: 'single' | 'batch') => {
    if (!projectId || reportIds.length === 0) return;
    setCreatingDownload(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await vulnApi.vuln.createDownloadJob({
        project_id: projectId,
        report_ids: reportIds,
      });
      setRootTab('download-center');
      await loadDownloadCenter();
      setSuccessMessage(mode === 'single' ? '下载任务已创建，请到下载中心查看。' : '打包下载任务已创建，请到下载中心查看。');
    } catch (err: any) {
      setError(err?.message || '创建下载任务失败');
    } finally {
      setCreatingDownload(false);
    }
  };

  const handleCreateTaskDownloadJob = async () => {
    if (!projectId) return;
    setCreatingDownload(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const baseParams = {
        project_id: projectId,
        current_stage: stageFilter === 'all' ? undefined : stageFilter,
        reporter_type: reporterTypeFilter === 'all' ? undefined : reporterTypeFilter,
        cvss_band: cvssBandFilter === 'all' ? undefined : cvssBandFilter,
        search: search.trim() || undefined,
        sort_field: sortField,
        sort_direction: sortDirection,
      };
      const matchesFinalResult = (item: any) => matchesFinalResultFilter(item, finalResultFilter);
      const matchesSuspect = (item: any): boolean => {
        if (!suspectOnly) return true;
        const reporterName: string = item?.reporter?.name || '';
        if (reporterName && engineTools.has(reporterName)) {
          return getEffectiveResult(item) === 'vulnerable';
        }
        return true;
      };
      const ids: string[] = [];
      const taskIds = taskFilter.length > 0 ? taskFilter : [undefined];
      for (const taskId of taskIds) {
        const first = await vulnApi.vuln.listCases({ ...baseParams, source_task_id: taskId, page: 1, page_size: 500 });
        ids.push(...(first.items || []).filter(matchesSuspect).filter(matchesFinalResult).map((item: any) => item.id).filter(Boolean));
        const pages = Math.ceil(Number(first.total || 0) / 500);
        for (let page = 2; page <= pages; page += 1) {
          const next = await vulnApi.vuln.listCases({ ...baseParams, source_task_id: taskId, page, page_size: 500 });
          ids.push(...(next.items || []).filter(matchesSuspect).filter(matchesFinalResult).map((item: any) => item.id).filter(Boolean));
        }
      }
      const reportIds = Array.from(new Set(ids));
      if (reportIds.length === 0) {
        setError('当前筛选下没有可导出的漏洞。');
        return;
      }
      await vulnApi.vuln.createDownloadJob({ project_id: projectId, report_ids: reportIds });
      setRootTab('download-center');
      await loadDownloadCenter();
      setSuccessMessage(`已创建 ${reportIds.length} 条漏洞的导出任务，请到下载中心查看。`);
    } catch (err: any) {
      setError(err?.message || '创建任务批量导出失败');
    } finally {
      setCreatingDownload(false);
    }
  };

  const handleDownloadJobFile = async (job: any) => {
    if (!job?.job_id) return;
    setDownloadActionJobId(job.job_id);
    setError(null);
    try {
      const blob = await vulnApi.vuln.downloadDownloadJobBlob(job.job_id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = job.output_filename ||`${job.job_id}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message || '下载压缩包失败');
    } finally {
      setDownloadActionJobId(null);
    }
  };

  const handleRetryDownloadJob = async (jobId: string) => {
    setDownloadActionJobId(jobId);
    setError(null);
    setSuccessMessage(null);
    try {
      await vulnApi.vuln.retryDownloadJob(jobId);
      await loadDownloadCenter();
      setSuccessMessage('下载任务已重新入队。');
    } catch (err: any) {
      setError(err?.message || '重试下载任务失败');
    } finally {
      setDownloadActionJobId(null);
    }
  };

  const handleDeleteDownloadJob = async (jobId: string) => {
    const ok = await confirm({ message: '确认删除这个下载任务吗？产物文件也会一起删除。', danger: true });
    if (!ok) return;
    setDownloadActionJobId(jobId);
    setError(null);
    setSuccessMessage(null);
    try {
      await vulnApi.vuln.deleteDownloadJob(jobId);
      await loadDownloadCenter();
      setSuccessMessage('下载任务已删除。');
    } catch (err: any) {
      setError(err?.message || '删除下载任务失败');
    } finally {
      setDownloadActionJobId(null);
    }
  };

  const handleSortChange = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortField(field);
    setSortDirection(field === 'updated_at' || field === 'confidence' || field === 'conclusion' ? 'desc' : 'asc');
  };

  const selectedTaskFilterLabel = taskFilter.length === 0
    ? '全部任务'
    : taskFilter.length === 1
      ? taskOptions.find((task) => task.id === taskFilter[0])?.name?.trim() || taskFilter[0]
      : `已选 ${taskFilter.length} 个任务`;

  const FINAL_RESULT_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'vulnerable', label: '确认是漏洞' },
    { value: 'not_vulnerable', label: '确认非漏洞' },
    { value: 'pending', label: '判定中' },
  ];
  const selectedFinalResultLabel = finalResultFilter.length === 0
    ? '全部结果'
    : finalResultFilter.length === 1
      ? FINAL_RESULT_OPTIONS.find((o) => o.value === finalResultFilter[0])?.label || finalResultFilter[0]
      : `已选 ${finalResultFilter.length} 项`;

  const taskNameById = useMemo(
    () => new Map(taskOptions.map((task) => [task.id, task.name?.trim() || task.id])),
    [taskOptions],
  );

  const getTaskName = (item: any) => {
    const taskId = String(item.source_task_id || item.display_summary?.source_task?.task_id || item.source_task?.task_id || '').trim();
    return taskId ? taskNameById.get(taskId) || taskId : '未提供';
  };

  const clearTaskFilter = () => {
    setTaskFilter([]);
    setCurrentPage(1);
  };

  const toggleTaskFilter = (taskId: string) => {
    setTaskFilter((previous) => (
      previous.includes(taskId) ? previous.filter((id) => id !== taskId) : [...previous, taskId]
    ));
    setCurrentPage(1);
  };

  const visibleSuspicionIds = pagedSuspicions.map((item) => item.id);
  const allVisibleSelected =
    visibleSuspicionIds.length > 0 && visibleSuspicionIds.every((id) => selectedSuspicionIds.includes(id));

  const toggleSuspicionSelection = (caseId: string) => {
    setSelectedSuspicionIds((previous) =>
      previous.includes(caseId) ? previous.filter((id) => id !== caseId) : [...previous, caseId],
    );
  };

  const toggleSelectAllVisible = () => {
    setSelectedSuspicionIds((previous) => {
      if (allVisibleSelected) {
        return previous.filter((id) => !visibleSuspicionIds.includes(id));
      }
      return Array.from(new Set([...previous, ...visibleSuspicionIds]));
    });
  };

  const renderSortHeader = (label: string, field: SortField) => {
    const active = sortField === field;
    const desc = active && sortDirection === 'desc';
    const asc = active && sortDirection === 'asc';
    return (
      <button
        type="button"
        onClick={() => handleSortChange(field)}
        className="inline-flex items-center gap-2 text-left text-xs font-semibold uppercase tracking-wider text-theme-text-muted hover:text-theme-text-primary"
      >
        {label}
        <span className="inline-flex items-center gap-0.5 leading-none">
          <ArrowUp size={12} className={asc ? 'text-theme-text-secondary' : 'text-theme-text-faint'} />
          <ArrowDown size={12} className={desc ? 'text-theme-text-secondary' : 'text-theme-text-faint'} />
        </span>
      </button>
    );
  };

  const renderDownloadCenter = () => (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="metric-card rounded-xl px-4 py-3.5">
          <div className="metric-label text-[11px] font-semibold uppercase tracking-wider text-theme-text-muted-soft">下载任务总数</div>
          <div className="metric-value mt-2 text-2xl font-bold tabular-nums text-theme-text-primary">{downloadStats.total || 0}</div>
        </div>
        <div className="metric-card rounded-xl px-4 py-3.5">
          <div className="metric-label text-[11px] font-semibold uppercase tracking-wider text-theme-text-muted-soft">处理中</div>
          <div className="metric-value mt-2 text-2xl font-bold tabular-nums text-state-warning">{(downloadStats.pending || 0) + (downloadStats.processing || 0)}</div>
        </div>
        <div className="metric-card rounded-xl px-4 py-3.5">
          <div className="metric-label text-[11px] font-semibold uppercase tracking-wider text-theme-text-muted-soft">可下载</div>
          <div className="metric-value mt-2 text-2xl font-bold tabular-nums text-state-success">{downloadStats.downloadable || 0}</div>
        </div>
        <div className="metric-card rounded-xl px-4 py-3.5">
          <div className="metric-label text-[11px] font-semibold uppercase tracking-wider text-theme-text-muted-soft">失败</div>
          <div className="metric-value mt-2 text-2xl font-bold tabular-nums text-state-danger">{downloadStats.failed || 0}</div>
        </div>
        <div className="metric-card rounded-xl px-4 py-3.5">
          <div className="metric-label text-[11px] font-semibold uppercase tracking-wider text-theme-text-muted-soft">已过期</div>
          <div className="metric-value mt-2 text-2xl font-bold tabular-nums text-theme-text-faint">{downloadStats.expired || 0}</div>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden bg-theme-surface border border-theme-border">
        <div className="px-5 py-4 xl:px-6 border-b border-theme-border-subtle">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-theme-text-muted-soft">下载中心</div>
              <h3 className="mt-1 text-xl font-semibold text-theme-text-primary">漏洞报告异步下载任务</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-wider bg-theme-elevated text-theme-text-muted">
                {downloadJobs.length} 条记录
              </div>
              <button
                type="button"
                onClick={() => loadDownloadCenter()}
                className="btn btn-secondary btn-sm inline-flex items-center gap-2"
              >
                <RefreshCw size={14} />
                刷新
              </button>
            </div>
          </div>
        </div>
        <div className="overflow-hidden">
          <div className="grid grid-cols-[1.2fr_0.8fr_0.7fr_0.8fr_1.2fr_0.8fr_0.8fr_1fr_1fr_1fr_1.2fr_1.2fr] gap-3 px-4 py-2.5 border-b border-theme-border bg-theme-elevated">
            {['任务 ID', '类型', '报告数', '状态', '文件名', '大小', '创建人', '创建时间', '完成时间', '过期时间', '错误摘要', '操作'].map((label) => (
              <div key={label} className="text-[11px] font-semibold uppercase tracking-wider text-theme-text-muted-soft">{label}</div>
            ))}
          </div>
          {downloadJobsLoading ? (
            <div className="px-4 py-8 text-sm bg-theme-surface text-theme-text-faint">正在加载下载任务...</div>
          ) : downloadJobs.length === 0 ? (
            <div className="px-4 py-8 text-sm bg-theme-surface text-theme-text-faint">当前项目还没有下载任务。</div>
          ) : (
            downloadJobs.map((job) => (
              <div key={job.job_id} className="grid grid-cols-[1.2fr_0.8fr_0.7fr_0.8fr_1.2fr_0.8fr_0.8fr_1fr_1fr_1fr_1.2fr_1.2fr] gap-3 px-4 py-3 text-sm last:border-b-0 border-b border-theme-border-subtle bg-theme-surface">
                <div className="min-w-0">
                  <div className="truncate font-semibold font-mono text-theme-text-primary">{job.job_id}</div>
                </div>
                <div className="font-semibold text-theme-text-secondary">{job.scope_type === 'single' ? '单个' : '批量'}</div>
                <div className="font-semibold tabular-nums text-theme-text-primary">{job.report_count}</div>
                <div>
                  <span className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${toneOf(job.status === 'succeeded' ? 'low' : job.status === 'failed' ? 'critical' : job.status === 'expired' ? undefined : 'medium')}`}>
                    {toDownloadStatusText(job.status)}
                  </span>
                </div>
                <div className="truncate text-theme-text-muted">{job.output_filename || '-'}</div>
                <div className="font-semibold tabular-nums text-theme-text-secondary">{formatBytes(job.output_size_bytes)}</div>
                <div className="truncate text-theme-text-muted">{job.created_by || '-'}</div>
                <div className="text-theme-text-faint">{formatTime(job.created_at)}</div>
                <div className="text-theme-text-faint">{formatTime(job.finished_at)}</div>
                <div className="text-theme-text-faint">{formatTime(job.expires_at)}</div>
                <div className="truncate text-xs text-state-danger">{job.last_error || '-'}</div>
                <div className="flex flex-wrap gap-1.5">
                  {job.downloadable ? (
                    <button
                      type="button"
                      onClick={() => handleDownloadJobFile(job)}
                      disabled={downloadActionJobId === job.job_id}
                      title="下载"
                      className="btn btn-sm bg-state-success-soft text-state-success border-state-success-border inline-flex items-center gap-1 rounded-lg border px-2"
                    >
                      <Download size={12} />
                    </button>
                  ) : null}
                  {job.status === 'failed' ? (
                    <button
                      type="button"
                      onClick={() => handleRetryDownloadJob(job.job_id)}
                      disabled={downloadActionJobId === job.job_id}
                      title="重试"
                      className="btn btn-sm bg-state-warning-soft text-state-warning border-state-warning-border inline-flex items-center gap-1 rounded-lg border px-2"
                    >
                      <RefreshCw size={12} />
                    </button>
                  ) : null}
                  {['succeeded', 'failed', 'expired'].includes(job.status) ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteDownloadJob(job.job_id)}
                      disabled={downloadActionJobId === job.job_id}
                      title="删除"
                      className="btn btn-sm bg-state-danger-soft text-state-danger border-state-danger-border inline-flex items-center gap-1 rounded-lg border px-2"
                    >
                      <Trash2 size={12} />
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  const renderDetailView = () => {
    if (detailLoading && !selectedDetail) {
      return (
        <div className="rounded-xl px-8 py-16 text-center text-sm border border-theme-border bg-theme-surface text-theme-text-muted">
          <Loader2 size={20} className="mx-auto mb-3 animate-spin text-theme-text-faint" />
          正在加载漏洞详情...
        </div>
      );
    }
    if (!selectedDetail) {
      return (
        <div className="rounded-xl px-8 py-10 text-center text-sm border border-dashed border-theme-border bg-theme-surface text-theme-text-faint">
          从左侧选择漏洞查看详情。
        </div>
      );
    }
    const overviewCards = [
      { label: '当前状态', value: toUserVulnStatusText(selectedDetail), hint: selectedDetail.current_status || selectedDetail.current_stage || 'n/a' },
      { label: '置信度', value: selectedDetail.confidence ?? 'n/a', hint:`决策：${toDecisionText(selectedDetail.decision_status)}` },
      { label: 'CVSS', value: Number(selectedDetail.cvss_score || 0).toFixed(1), hint: selectedDetail.severity || 'n/a' },
      { label: '上报者', value: selectedDetail.reporter?.name || '未提供', hint: selectedDetail.reporter?.type || '未知类型' },
      { label: '文件根路径', value: selectedDetail.files_root_path || '未分配', hint: workspaceSummary?.files_root_path || '暂无工作区摘要' },
    ];

    const detailTabs: Array<{ key: IntakeDetailTab; label: string; icon: React.ReactNode }> = [
      { key: 'overview', label: '漏洞总览', icon: <Layers3 size={14} /> },
      { key: 'report', label: '漏洞报告', icon: <ScrollText size={14} /> },
      { key: 'evidence', label: '证据与文件', icon: <FolderOpen size={14} /> },
      { key: 'process', label: '处置过程', icon: <Activity size={14} /> },
      { key: 'context', label: '关联上下文', icon: <FileClock size={14} /> },
    ];

    const parsedArtifacts = (() => {
      try {
        return JSON.parse(editableDetail?.artifacts_text || '[]');
      } catch {
        return selectedDetail.artifacts;
      }
    })();

    const parsedMetadata = (() => {
      try {
        return JSON.parse(editableDetail?.metadata_text || '{}');
      } catch {
        return selectedDetail.metadata;
      }
    })();

    const rawContext = {
      reporter: editableDetail?.reporter || selectedDetail.reporter,
      subject: editableDetail?.subject || selectedDetail.subject,
      evidence: {
        summary: editableDetail?.evidence_summary ?? selectedDetail?.evidence?.summary,
        reproduction_hint: editableDetail?.evidence_reproduction_hint ?? selectedDetail?.evidence?.reproduction_hint,
      },
      artifacts: parsedArtifacts,
      metadata: parsedMetadata,
      workspace_summary: workspaceSummary,
      result_summary: resultSummary,
    };
    const reportHeadings = (reportDocument?.content || '')
      .split('\n')
      .map((line) => line.match(/^(#{1,4})\s+(.+?)\s*$/))
      .filter(Boolean)
      .map((match) => ({
        level: match![1].length,
        text: match![2].trim(),
        id: slugifyHeading(match![2].trim()),
      }));

    return (
      <div className="overflow-hidden rounded-xl bg-theme-surface border border-theme-border">
        <div className="px-5 py-4 xl:px-6 border-b border-theme-border-subtle bg-gradient-radial">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setSelectedSuspicionId('')}
              className="btn btn-secondary btn-sm inline-flex items-center gap-2"
            >
              <ArrowLeft size={14} />
              返回漏洞列表
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider bg-state-danger-soft text-state-danger">
                {selectedDetail.severity}
              </span>
              <span className="rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider bg-state-info-soft text-state-info">
                {toUserVulnStatusText(selectedDetail)}
              </span>
              <span className="rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider bg-state-warning-soft text-state-warning">
                {toDecisionText(selectedDetail.decision_status)}
              </span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-xl font-semibold text-theme-text-primary">{selectedDetail.title}</h3>
              <div className="mt-1 text-xs font-semibold font-mono text-theme-text-faint">ID: {selectedDetail.id}</div>
              <p className="mt-1 line-clamp-2 text-sm leading-6 text-theme-text-muted">{selectedDetail.summary || '暂无摘要'}</p>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg px-3 py-2.5 bg-theme-elevated border border-theme-border">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-theme-text-muted-soft">状态</div>
              <div className="mt-1 text-sm font-semibold text-theme-text-primary">{toUserVulnStatusText(selectedDetail)}</div>
            </div>
            <div className="rounded-lg px-3 py-2.5 bg-theme-elevated border border-theme-border">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-theme-text-muted-soft">置信度</div>
              <div className="mt-1 text-sm font-semibold tabular-nums text-theme-text-primary">{selectedDetail.confidence}</div>
            </div>
            <div className="rounded-lg px-3 py-2.5 bg-theme-elevated border border-theme-border">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-theme-text-muted-soft">CVSS</div>
              <div className="mt-1 text-sm font-semibold tabular-nums text-theme-text-primary">{Number(selectedDetail.cvss_score || 0).toFixed(1)}</div>
            </div>
            <div className="rounded-lg px-3 py-2.5 bg-theme-elevated border border-theme-border">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-theme-text-muted-soft">开放任务</div>
              <div className="mt-1 text-sm font-semibold tabular-nums text-theme-text-primary">{stats.openTasks}</div>
            </div>
          </div>
        </div>

        <div className="px-5 pt-4 xl:px-6 border-b border-theme-border-subtle bg-theme-elevated/80">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-theme-text-muted-soft">详情视图</div>
              <div className="mt-1 text-sm text-theme-text-muted">先看结论，再查看报告、证据、过程和关联上下文。</div>
            </div>
            <div className="hidden rounded-lg px-3 py-2 text-xs font-semibold xl:block bg-theme-surface text-theme-text-secondary border border-theme-border">
              当前：{detailTabs.find((tab) => tab.key === detailActiveTab)?.label}
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-3">
            {detailTabs.map((tab) => {
              const active = detailActiveTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setDetailActiveTab(tab.key)}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors border ${
                    active
                      ? 'border-brand-border bg-brand-soft text-brand-primary'
                      : 'border-theme-border bg-theme-surface text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-elevated'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-6 xl:p-8">
          {detailActiveTab === 'overview' && (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {overviewCards.map((card) => (
                  <DetailMetricCard key={card.label} label={card.label} value={card.value} hint={card.hint} />
                ))}
              </div>
              <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-4">
                  <DetailSectionCard title="漏洞摘要" subtitle="先看本条漏洞的结论、摘要和对象定位。">
                    <div className="mt-3 space-y-3 text-sm leading-7 text-theme-text-secondary">
                      <div>{displaySummary?.subtitle || selectedDetail.summary || '暂无摘要说明'}</div>
                      <div className="rounded-xl p-4 bg-theme-elevated">
                        <div className="text-xs font-semibold text-theme-text-muted-soft">当前结论</div>
                        <div className={`mt-1 text-sm font-semibold ${(selectedDetail.finished_reason || selectedDetail.validation_result) === 'vulnerable' ? 'text-state-danger font-bold' : 'text-theme-text-primary'}`}>
                          {(selectedDetail.current_stage === 'finished' || selectedDetail.finished_reason)
                            ? (toConclusionText(selectedDetail.finished_reason || selectedDetail.validation_result) || '—')
                            : '—'}
                        </div>
                        {(selectedDetail.current_stage === 'finished' || selectedDetail.finished_reason) && (conclusionReason.source === 'engine' || conclusionReason.source === 'human') ? (
                          <div className="mt-1 text-[11px] font-medium text-theme-text-muted">
                            来源: {conclusionReason.source === 'engine'
                              ? `${conclusionReason.engineName || '引擎'}判定`
                              : '人工判定'}
                          </div>
                        ) : null}
                        {conclusionReason.text ? (
                          <div className="mt-1 text-[11px] font-medium text-theme-text-muted leading-relaxed break-words">
                            判定理由: {conclusionReason.text}
                          </div>
                        ) : null}
                      </div>
                      <div className="rounded-xl p-4 bg-theme-elevated">
                        <div className="text-xs font-semibold text-theme-text-muted-soft">对象定位</div>
                        <div className="mt-1 break-all text-sm font-semibold text-theme-text-primary">{selectedDetail.subject?.locator || '未提供定位信息'}</div>
                      </div>
                    </div>
                  </DetailSectionCard>
                </div>
                <div className="space-y-4">
                  <DetailSectionCard title="识别信息" subtitle="用于快速识别、排查和交叉检索本条漏洞。">
                    <div className="mt-3 space-y-2 text-sm text-theme-text-secondary">
                      <div><span className="font-semibold text-theme-text-primary">漏洞 ID：</span><span className="font-mono">{selectedDetail.id}</span></div>
                      <div><span className="font-semibold text-theme-text-primary">Finding ID：</span>{selectedDetail.finding_id || '未提供'}</div>
                      <div><span className="font-semibold text-theme-text-primary">全局漏洞 ID：</span>{selectedDetail.global_vuln_id || '未提供'}</div>
                      <div><span className="font-semibold text-theme-text-primary">当前报告：</span>{displaySummary?.current_report_title || displaySummary?.current_report_id || '未关联'}</div>
                      <div><span className="font-semibold text-theme-text-primary">报告更新时间：</span>{formatTime(displaySummary?.current_report_updated_at || selectedDetail.current_report_updated_at)}</div>
                      <div><span className="font-semibold text-theme-text-primary">创建时间：</span>{formatTime(selectedDetail.created_at)}</div>
                      <div><span className="font-semibold text-theme-text-primary">最近更新：</span>{formatTime(selectedDetail.updated_at)}</div>
                    </div>
                  </DetailSectionCard>
                </div>
              </div>
            </div>
          )}

          {detailActiveTab === 'report' && (
            <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
              <div className="space-y-3">
                <DetailSectionCard title="报告列表" subtitle="选择不同阶段或不同来源生成的漏洞报告。" compact>
                  <div className="mt-3 space-y-2.5">
                    {reportItems.length === 0 ? (
                      <div className="rounded-xl px-4 py-4 text-sm bg-theme-elevated text-theme-text-muted">当前漏洞还没有生成正式报告，可先查看证据与文件。</div>
                    ) : (
                      reportItems.map((item: any) => {
                        const active = selectedReportId === item.report_id;
                        const isRawReport = item.report_kind === 'imported_raw';
                        return (
                          <button
                            key={item.report_id}
                            type="button"
                            onClick={() => setSelectedReportId(item.report_id)}
                            className={`w-full rounded-xl border p-4 text-left transition-colors ${
                              active
                                ? 'border-brand-border bg-brand-soft text-brand-primary'
                                : 'border-theme-border bg-theme-surface text-theme-text-secondary hover:bg-theme-elevated hover:text-theme-text-primary'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-semibold">{isRawReport ? '原始漏洞报告' : (item.title || item.report_id)}</div>
                              <span className={`rounded-lg px-2 py-1 text-[10px] font-semibold ${
                                active ? 'bg-brand-soft text-brand-primary' : 'bg-theme-elevated text-theme-text-muted'
                              }`}>
                                {toStageText(item.stage)}
                              </span>
                            </div>
                            <div className="mt-1 text-xs text-theme-text-faint">{(isRawReport ? '原始报告' : toStageText(item.stage))} · {item.generated_at ? formatTime(item.generated_at) : '未记录时间'}</div>
                            <div className="mt-2 line-clamp-3 text-xs leading-5 text-theme-text-faint">{item.excerpt || item.source_service_id || '暂无摘要'}</div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </DetailSectionCard>
                {reportHeadings.length > 0 ? (
                  <DetailSectionCard title="报告目录" subtitle="点击标题快速跳转到对应章节。" compact>
                    <div className="mt-2 space-y-1">
                      {reportHeadings.map((heading) => (
                        <button
                          key={`${heading.id}-${heading.level}`}
                          type="button"
                          onClick={() => {
                            document.getElementById(heading.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }}
                          className={`block w-full rounded-lg py-2 text-left text-sm transition-colors ${
                            activeReportHeadingId === heading.id
                              ? 'bg-brand-primary text-theme-text-inverse'
                              : 'hover:bg-theme-elevated hover:text-theme-text-primary text-theme-text-muted'
                          } ${heading.level === 1 ? 'pl-3' : heading.level === 2 ? 'pl-6' : heading.level === 3 ? 'pl-9' : 'pl-12'}`}
                        >
                          {heading.text}
                        </button>
                      ))}
                    </div>
                  </DetailSectionCard>
                ) : null}
              </div>
              <div className="rounded-xl p-5 bg-theme-surface border border-theme-border">
                <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-theme-border-subtle">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-theme-text-muted-soft">漏洞报告</div>
                    <div className="mt-1 text-lg font-semibold text-theme-text-primary">{reportDocument?.title || reportItems.find((item) => item.report_id === selectedReportId)?.title || '未选择报告'}</div>
                    <div className="mt-1 text-xs text-theme-text-muted">
                      类型：{reportDocument?.report_kind || reportItems.find((item) => item.report_id === selectedReportId)?.report_kind || 'unknown'} · 阶段：{toStageText(reportDocument?.stage || reportItems.find((item) => item.report_id === selectedReportId)?.stage)} · 来源：{reportDocument?.source_service_id || reportItems.find((item) => item.report_id === selectedReportId)?.source_service_id || '未提供'}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {reportDocument?.storage_path ? <div className="rounded-lg px-3 py-2 text-xs bg-theme-elevated text-theme-text-muted">存储路径：{reportDocument.storage_path}</div> : null}
                    {reportDocument?.generated_at ? <div className="rounded-lg px-3 py-2 text-xs bg-theme-elevated text-theme-text-muted">生成时间：{formatTime(reportDocument.generated_at)}</div> : null}
                  </div>
                </div>
                <div ref={reportScrollRef} className="mt-5 min-h-[28rem] max-h-[calc(100vh-22rem)] overflow-auto pr-1">
                  {reportLoading ? (
                    <div className="flex items-center gap-2 text-sm text-theme-text-muted"><Loader2 size={16} className="animate-spin" /> 正在加载报告...</div>
                  ) : reportError ? (
                    <div className="alert--danger rounded-lg px-4 py-3 text-sm bg-state-danger-soft text-state-danger border border-state-danger-border">{reportError}</div>
                  ) : reportItems.length === 0 ? (
                    <div className="rounded-xl px-6 py-12 text-center text-sm border border-dashed border-theme-border text-theme-text-muted">暂无正式报告，请切换到「证据与文件」查看原始材料与文件目录。</div>
                  ) : (
                    <MarkdownContent content={reportDocument?.content || ''} />
                  )}
                </div>
              </div>
            </div>
          )}

          {detailActiveTab === 'evidence' && (
            <div className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-4">
                  <DetailSectionCard title="证据摘要" subtitle="用于快速了解当前漏洞的核心证据、复现提示和引用材料。">
                    <div className="mt-3 space-y-3 text-sm text-theme-text-secondary">
                      <div className="rounded-xl p-4 bg-theme-elevated">{evidenceSummary?.summary || selectedDetail?.evidence?.summary || '暂无证据摘要'}</div>
                      <div className="rounded-xl p-4 bg-theme-elevated">
                        <div className="text-xs font-semibold text-theme-text-muted-soft">复现提示</div>
                        <div className="mt-1 whitespace-pre-wrap leading-6">{evidenceSummary?.reproduction_hint || selectedDetail?.evidence?.reproduction_hint || '暂无复现提示'}</div>
                      </div>
                      <div className="rounded-xl p-4 bg-theme-elevated">
                        <div className="text-xs font-semibold text-theme-text-muted-soft">证据引用</div>
                        {Array.isArray(evidenceSummary?.references) && evidenceSummary.references.length > 0 ? (
                          <div className="mt-2 space-y-2">
                            {evidenceSummary.references.map((reference: any, index: number) => (
                              <div key={index} className="rounded-lg px-3 py-2 text-xs bg-theme-surface text-theme-text-muted">{typeof reference === 'string' ? reference : JSON.stringify(reference)}</div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-1 text-sm text-theme-text-muted">暂无证据引用</div>
                        )}
                      </div>
                    </div>
                  </DetailSectionCard>
                  <DetailSectionCard title="Artifact 清单" subtitle="按材料清单查看原始文件、引用路径和媒介类型。">
                    <div className="mt-3 space-y-2">
                      {(Array.isArray(selectedDetail.artifacts) ? selectedDetail.artifacts : []).length > 0 ? (
                        (selectedDetail.artifacts as any[]).map((artifact, index) => (
                          <div key={`${artifact?.name || artifact?.path || index}`} className="rounded-xl px-4 py-3 border border-theme-border">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="text-sm font-semibold text-theme-text-primary">{artifact?.name || artifact?.path ||`artifact-${index + 1}`}</div>
                              <span className="rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider bg-theme-elevated text-theme-text-muted">{artifact?.kind || 'unknown'}</span>
                            </div>
                            <div className="mt-1 text-xs text-theme-text-faint">{artifact?.media_type ?`媒体类型：${artifact.media_type}` : '未提供媒体类型'}</div>
                            {artifact?.path || artifact?.content_ref ? <div className="mt-2 break-all text-xs text-theme-text-faint">{artifact.path || artifact.content_ref}</div> : null}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl px-4 py-4 text-sm bg-theme-elevated text-theme-text-muted">暂无 artifact 清单</div>
                      )}
                    </div>
                  </DetailSectionCard>
                </div>
                <div className="space-y-4">
                  <DetailSectionCard title="上报者 / 目标对象 / 证据编辑" subtitle="编辑模式下可直接调整上报字段；只读模式下用于集中查看。">
                    <div className="mt-3 grid gap-2.5">
                      <div className="grid grid-cols-2 gap-2.5">
                        <label className="grid gap-1">
                          <span className="text-[11px] font-semibold text-theme-text-muted-soft">上报者名称（reporter.name）</span>
                          <input value={editableDetail?.reporter?.name || ''} onChange={(event) => setEditableDetail((prev) => (prev ? { ...prev, reporter: { ...prev.reporter, name: event.target.value } } : prev))} disabled={!detailEditMode || detailSaving} className="form-input" />
                        </label>
                        <label className="grid gap-1">
                          <span className="text-[11px] font-semibold text-theme-text-muted-soft">上报者版本（reporter.version）</span>
                          <input value={editableDetail?.reporter?.version || ''} onChange={(event) => setEditableDetail((prev) => (prev ? { ...prev, reporter: { ...prev.reporter, version: event.target.value } } : prev))} disabled={!detailEditMode || detailSaving} className="form-input" />
                        </label>
                        <label className="grid gap-1">
                          <span className="text-[11px] font-semibold text-theme-text-muted-soft">上报方式（reporter.type）</span>
                          <input value={editableDetail?.reporter?.type || ''} onChange={(event) => setEditableDetail((prev) => (prev ? { ...prev, reporter: { ...prev.reporter, type: event.target.value } } : prev))} disabled={!detailEditMode || detailSaving} className="form-input" />
                        </label>
                        <label className="grid gap-1">
                          <span className="text-[11px] font-semibold text-theme-text-muted-soft">上报入口（reporter.endpoint）</span>
                          <input value={editableDetail?.reporter?.endpoint || ''} onChange={(event) => setEditableDetail((prev) => (prev ? { ...prev, reporter: { ...prev.reporter, endpoint: event.target.value } } : prev))} disabled={!detailEditMode || detailSaving} className="form-input" />
                        </label>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        <label className="grid gap-1">
                          <span className="text-[11px] font-semibold text-theme-text-muted-soft">对象类型（subject.type）</span>
                          <input value={editableDetail?.subject?.type || ''} onChange={(event) => setEditableDetail((prev) => (prev ? { ...prev, subject: { ...prev.subject, type: event.target.value } } : prev))} disabled={!detailEditMode || detailSaving} className="form-input" />
                        </label>
                        <label className="grid gap-1">
                          <span className="text-[11px] font-semibold text-theme-text-muted-soft">对象名称（subject.name）</span>
                          <input value={editableDetail?.subject?.name || ''} onChange={(event) => setEditableDetail((prev) => (prev ? { ...prev, subject: { ...prev.subject, name: event.target.value } } : prev))} disabled={!detailEditMode || detailSaving} className="form-input" />
                        </label>
                        <label className="grid gap-1 col-span-2">
                          <span className="text-[11px] font-semibold text-theme-text-muted-soft">对象定位（subject.locator）</span>
                          <input value={editableDetail?.subject?.locator || ''} onChange={(event) => setEditableDetail((prev) => (prev ? { ...prev, subject: { ...prev.subject, locator: event.target.value } } : prev))} disabled={!detailEditMode || detailSaving} className="form-input" />
                        </label>
                      </div>
                      <label className="grid gap-1">
                        <span className="text-[11px] font-semibold text-theme-text-muted-soft">证据摘要（evidence.summary）</span>
                        <textarea value={editableDetail?.evidence_summary || ''} onChange={(event) => setEditableDetail((prev) => (prev ? { ...prev, evidence_summary: event.target.value } : prev))} disabled={!detailEditMode || detailSaving} className="form-textarea min-h-[66px] resize-none" />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-[11px] font-semibold text-theme-text-muted-soft">复现提示（evidence.reproduction_hint）</span>
                        <textarea value={editableDetail?.evidence_reproduction_hint || ''} onChange={(event) => setEditableDetail((prev) => (prev ? { ...prev, evidence_reproduction_hint: event.target.value } : prev))} disabled={!detailEditMode || detailSaving} className="form-textarea min-h-[66px] resize-none" />
                      </label>
                    </div>
                  </DetailSectionCard>
                </div>
              </div>
            </div>
          )}

          {detailActiveTab === 'process' && (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <DetailMetricCard label="时间线事件" value={selectedTimeline.length} hint="阶段变化、裁决与系统事件" />
                <DetailMetricCard label="动作记录" value={processActions.length} hint={`运行中 ${runningProcessActions} 项`} />
                <DetailMetricCard label="人工任务" value={processManualTasks.length} hint={`未完成 ${openProcessTasks} 项`} />
              </div>
              <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                <DetailSectionCard title="时间线事件" subtitle="按时间顺序查看阶段变化、裁决、系统事件和执行人。">
                  <div className="mt-3 space-y-2.5">
                    {selectedTimeline.length === 0 ? (
                      <div className="rounded-xl bg-theme-surface px-4 py-4 text-sm text-theme-text-muted">暂无时间线数据</div>
                    ) : (
                      selectedTimeline.map((item: any) => (
                        <div key={item.id} className="rounded-xl border border-theme-border px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold text-theme-text-secondary">{item.payload?.summary || item.payload?.event_type || item.item_type}</div>
                            <div className="text-[11px] font-semibold text-theme-text-muted">{formatTime(item.created_at)}</div>
                          </div>
                          <div className="mt-1.5 text-xs text-theme-text-muted">
                            类型：{item.item_type}
                            {item.payload?.status ?` · 状态：${item.payload.status}` : ''}
                            {item.payload?.actor ?` · 执行者：${item.payload.actor}` : ''}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </DetailSectionCard>
                <div className="space-y-4">
                  <DetailSectionCard title="协同记录 / 动作" subtitle="展示自动动作、执行状态和摘要信息。">
                    <div className="mt-3 space-y-2.5">
                      {processActions.length === 0 ? (
                        <div className="rounded-xl bg-theme-surface px-4 py-4 text-sm text-theme-text-muted">暂无动作记录</div>
                      ) : (
                        processActions.map((action: any, index: number) => (
                          <div key={action.id || index} className="rounded-xl border border-theme-border px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-semibold text-theme-text-secondary">{action.title || action.action_type || action.name ||`动作 ${index + 1}`}</div>
                              <div className="text-[11px] text-theme-text-muted">{action.execution_status || action.status || 'unknown'}</div>
                            </div>
                            <div className="mt-1 text-xs text-theme-text-muted">{action.summary || action.description || action.owner || '暂无摘要'}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </DetailSectionCard>
                  <DetailSectionCard title="协同记录 / 人工任务" subtitle="展示人工介入项、状态和当前说明。">
                    <div className="mt-3 space-y-2.5">
                      {processManualTasks.length === 0 ? (
                        <div className="rounded-xl bg-theme-surface px-4 py-4 text-sm text-theme-text-muted">暂无人工任务</div>
                      ) : (
                        processManualTasks.map((task: any, index: number) => (
                          <div key={task.id || index} className="rounded-xl border border-theme-border px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-semibold text-theme-text-secondary">{task.title || task.name ||`人工任务 ${index + 1}`}</div>
                              <div className="text-[11px] text-theme-text-muted">{task.status || 'unknown'}</div>
                            </div>
                            <div className="mt-1 text-xs text-theme-text-muted">{task.summary || task.description || task.assignee || '暂无说明'}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </DetailSectionCard>
                </div>
              </div>
            </div>
          )}

          {detailActiveTab === 'context' && (
            <div className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-2">
                <DetailSectionCard title="关联上下文" subtitle="集中展示来源任务、对象、执行引用与存储位置。">
                  <div className="mt-3 space-y-2 text-sm text-theme-text-secondary">
                    <div><span className="font-semibold text-theme-text-secondary">上报者：</span>{selectedDetail.reporter?.name || '未提供'} / {selectedDetail.reporter?.type || 'unknown'}</div>
                    <div><span className="font-semibold text-theme-text-secondary">目标对象：</span>{selectedDetail.subject?.type || '未提供'} / {selectedDetail.subject?.name || selectedDetail.subject?.locator || '未提供'}</div>
                    <div><span className="font-semibold text-theme-text-secondary">来源报告 ID：</span>{Array.isArray(displaySummary?.source_report_ids) && displaySummary.source_report_ids.length > 0 ? displaySummary.source_report_ids.join(', ') : '未提供'}</div>
                    <div><span className="font-semibold text-theme-text-secondary">来源任务 ID：</span>{selectedDetail.source_task_id || '未提供'}</div>
                    <div><span className="font-semibold text-theme-text-secondary">来源执行引用：</span>{selectedDetail.source_execution_id || '未提供'}</div>
                    <div><span className="font-semibold text-theme-text-secondary">文件根路径：</span>{selectedDetail.files_root_path || workspaceSummary?.files_root_path || '未提供'}</div>
                    <div><span className="font-semibold text-theme-text-secondary">当前报告存储路径：</span>{reportDocument?.storage_path || '未提供'}</div>
                  </div>
                </DetailSectionCard>
                <DetailSectionCard
                  title="相关执行引用"
                  subtitle="用于排查和交叉定位上下游任务、执行链路和结果。"
                  actions={
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(JSON.stringify(relatedRefs, null, 2));
                        setSuccessMessage('已复制相关执行引用。');
                      }}
                      className="btn btn-secondary btn-sm"
                    >
                      <Copy size={13} />
                      复制
                    </button>
                  }
                >
                  <div className="mt-3 space-y-2">
                    {relatedRefs.length === 0 ? (
                      <div className="rounded-xl bg-theme-surface px-4 py-4 text-sm text-theme-text-muted">暂无关联执行引用</div>
                    ) : (
                      relatedRefs.map((ref: any, index: number) => (
                        <div key={`${ref?.key || 'ref'}-${index}`} className="rounded-xl bg-theme-surface px-4 py-3 text-sm text-theme-text-secondary">
                          <div className="font-semibold text-theme-text-secondary">{ref?.key ||`ref-${index + 1}`}</div>
                          <div className="mt-1 break-all text-xs text-theme-text-muted">{ref?.value || '-'}</div>
                        </div>
                      ))
                    )}
                  </div>
                </DetailSectionCard>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <DetailSectionCard title="JSON 字段" subtitle="用于编辑或查看结构化扩展字段。">
                  <div className="mt-3 space-y-2.5">
                    <label className="grid gap-1">
                      <span className="text-[11px] font-semibold text-theme-text-muted">证据引用（evidence.references，JSON 数组）</span>
                      <textarea value={editableDetail?.evidence_references_text || '[]'} onChange={(event) => setEditableDetail((prev) => (prev ? { ...prev, evidence_references_text: event.target.value } : prev))} disabled={!detailEditMode || detailSaving} className="form-textarea font-mono text-xs min-h-[90px]" />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-[11px] font-semibold text-theme-text-muted">原始漏洞报告（Markdown）</span>
                      <textarea value={editableDetail?.raw_report_markdown || ''} onChange={(event) => setEditableDetail((prev) => (prev ? { ...prev, raw_report_markdown: event.target.value } : prev))} disabled={!detailEditMode || detailSaving} className="form-textarea font-mono text-xs min-h-[180px]" />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-[11px] font-semibold text-theme-text-muted">文件清单（artifacts，JSON 数组）</span>
                      <textarea value={editableDetail?.artifacts_text || '[]'} onChange={(event) => setEditableDetail((prev) => (prev ? { ...prev, artifacts_text: event.target.value } : prev))} disabled={!detailEditMode || detailSaving} className="form-textarea font-mono text-xs min-h-[120px]" />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-[11px] font-semibold text-theme-text-muted">扩展元数据（metadata，JSON 对象）</span>
                      <textarea value={editableDetail?.metadata_text || '{}'} onChange={(event) => setEditableDetail((prev) => (prev ? { ...prev, metadata_text: event.target.value } : prev))} disabled={!detailEditMode || detailSaving} className="form-textarea font-mono text-xs min-h-[120px]" />
                    </label>
                  </div>
                </DetailSectionCard>
                <DetailSectionCard
                  title="完整原始数据"
                  subtitle="调试与审计视图，包含 reporter / subject / evidence / artifact / metadata。"
                  actions={
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(JSON.stringify(rawContext, null, 2));
                        setSuccessMessage('已复制完整原始数据。');
                      }}
                      className="btn btn-secondary btn-sm"
                    >
                      <Copy size={13} />
                      复制
                    </button>
                  }
                >
                  <div className="mt-3 rounded-xl border border-theme-border bg-theme-surface p-3 text-xs leading-5 text-theme-text-primary">
                    <pre className="max-h-[24rem] overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(rawContext, null, 2)}</pre>
                  </div>
                </DetailSectionCard>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 px-5 py-5 md:px-6 2xl:px-8">
      {feedbackNodes}
      {!selectedSuspicionId ? (
        <>
          <PageHeader
            title={(
              <span className="inline-flex flex-wrap items-center gap-3">
                <span>{pageTitle}</span>
                <ServiceBuildVersionBadge version={buildVersion} />
              </span>
            )}
            description="统一管理当前项目的漏洞生命周期，覆盖上报、研判、验证与处置全流程"
            actions={
              rootTab === 'download-center' ? (
                <button
                  type="button"
                  onClick={() => setRootTab('cases')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-theme-border bg-theme-surface px-3 py-1.5 text-sm font-medium text-theme-text-secondary transition-colors hover:text-theme-text-primary"
                >
                  <ArrowLeft size={14} />
                  返回{pageTitle}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setRootTab('download-center')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-theme-border bg-theme-surface px-3 py-1.5 text-sm font-medium text-theme-text-secondary transition-colors hover:text-theme-text-primary"
                >
                  进入下载中心
                  <ArrowRight size={14} />
                </button>
              )
            }
          />
          {rootTab === 'download-center' ? renderDownloadCenter() : (
          <>
          <div className={`grid gap-3 ${suspectOnly ? 'grid-cols-3' : 'grid-cols-4'}`}>
            <StatisticCard label={suspectOnly ? '疑似漏洞' : '告警总数'} value={stats.total} />
            <StatisticCard label="确认是漏洞" value={stats.confirmed} tone="danger" />
            <StatisticCard label="确认非漏洞" value={stats.ruledOut} tone="success" />
            {!suspectOnly ? <StatisticCard label="判定中" value={stats.inconclusive} tone="warning" /> : null}
          </div>

          <div className="table-container">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-theme-border-subtle">
              <div className="relative max-w-[420px] flex-1">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-theme-text-faint" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索标题、摘要、资产定位、来源服务"
                  className="form-input w-full !pl-9"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <div ref={taskFilterRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setTaskFilterOpen((open) => !open)}
                    className="form-select flex items-center justify-between gap-2 text-left"
                    style={{ width: '180px' }}
                  >
                    <span className="truncate">{selectedTaskFilterLabel}</span>
                    <ChevronDown size={14} />
                  </button>
                  {taskFilterOpen && (
                    <div className="absolute left-0 top-full z-50 mt-2 max-h-72 w-72 overflow-auto rounded-xl border border-theme-border bg-theme-surface p-2 shadow-xl">
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-theme-text-secondary hover:bg-theme-elevated">
                        <input
                          type="checkbox"
                          checked={taskFilter.length === 0}
                          onChange={clearTaskFilter}
                          className="h-4 w-4 rounded border-theme-border"
                        />
                        全部任务
                      </label>
                      {taskOptions.map((task) => {
                        const checked = taskFilter.includes(task.id);
                        return (
                          <label key={task.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-theme-text-secondary hover:bg-theme-elevated">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleTaskFilter(task.id)}
                              className="h-4 w-4 rounded border-theme-border"
                            />
                            <span className="min-w-0 truncate" title={task.name?.trim() || task.id}>{task.name?.trim() || task.id}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div ref={finalResultFilterRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setFinalResultFilterOpen((open) => !open)}
                    className="form-select flex items-center justify-between gap-2 text-left"
                    style={{ width: '140px' }}
                  >
                    <span className="truncate">{selectedFinalResultLabel}</span>
                    <ChevronDown size={14} />
                  </button>
                  {finalResultFilterOpen ? (
                    <div className="absolute left-0 top-full z-50 mt-2 max-h-72 w-56 overflow-auto rounded-xl border border-theme-border bg-theme-surface p-2 shadow-xl">
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-theme-text-secondary hover:bg-theme-elevated">
                        <input
                          type="checkbox"
                          checked={finalResultFilter.length === 0}
                          onChange={clearFinalResultFilter}
                          className="h-4 w-4 rounded border-theme-border"
                        />
                        全部结果
                      </label>
                      {FINAL_RESULT_OPTIONS.map((opt) => {
                        const checked = finalResultFilter.includes(opt.value);
                        return (
                          <label key={opt.value} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-theme-text-secondary hover:bg-theme-elevated">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleFinalResultFilter(opt.value)}
                              className="h-4 w-4 rounded border-theme-border"
                            />
                            <span className="min-w-0 truncate">{opt.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={handleCreateTaskDownloadJob}
                disabled={creatingDownload}
                className="btn btn-secondary btn-sm ml-auto"
                title="按当前筛选条件导出全部漏洞"
              >
                <Download size={12} />
                {creatingDownload ? '创建中...' : '导出数据'}
              </button>
            </div>

            <div className="space-y-4 px-5 py-4 xl:px-6">
              <div className="overflow-hidden rounded-xl border border-theme-border">
                  <div className={`grid ${suspectOnly ? 'grid-cols-[1.5fr_2.2fr_1.1fr_1.2fr_1.1fr_1.1fr_0.9fr]' : 'grid-cols-[1.5fr_2.2fr_0.9fr_1.1fr_1.2fr_1.1fr_1.1fr_0.9fr]'} gap-3 border-b border-theme-border bg-theme-elevated px-4 py-2.5`}>
                  <div className="flex items-center justify-center hidden">
                    <input
                      type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAllVisible}
                      aria-label="全选当前页"
                      className="hidden"
                    />
                  </div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-theme-text-muted-soft">任务名称</div>
                  {renderSortHeader('标题 / 摘要', 'title')}
                  {!suspectOnly ? renderSortHeader('阶段 / 状态', 'current_stage') : null}
                  {renderSortHeader('漏洞确认状态', 'conclusion')}
                  {renderSortHeader('工具', 'reporter')}
                  {renderSortHeader('更新时间', 'updated_at')}
                  {renderSortHeader('创建时间', 'created_at')}
                  <div className="text-xs font-semibold uppercase tracking-wider text-theme-text-muted-soft">操作</div>
                </div>
                {loading ? (
                  <div className="bg-theme-surface px-4 py-8 text-sm text-theme-text-faint">正在加载漏洞列表...</div>
                ) : pagedSuspicions.length === 0 ? (
                  <div className="bg-theme-surface px-4 py-8 text-sm text-theme-text-faint">当前筛选条件下没有漏洞。</div>
                ) : (
                  pagedSuspicions.map((item) => (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedSuspicionId(item.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedSuspicionId(item.id);
                        }
                      }}
                      className={`grid cursor-pointer ${suspectOnly ? 'grid-cols-[1.5fr_2.2fr_1.1fr_1.2fr_1.1fr_1.1fr_0.9fr]' : 'grid-cols-[1.5fr_2.2fr_0.9fr_1.1fr_1.2fr_1.1fr_1.1fr_0.9fr]'} gap-3 border-b border-theme-border-subtle bg-theme-surface px-4 py-3.5 text-left transition hover:bg-theme-elevated last:border-b-0`}
                    >
                      <div className="flex items-center justify-center hidden">
                        <input
                          type="checkbox"
                          checked={selectedSuspicionIds.includes(item.id)}
                          onChange={() => toggleSuspicionSelection(item.id)}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={`选择漏洞 ${item.title}`}
                          className="hidden"
                        />
                      </div>
                      <div className="min-w-0 text-sm font-semibold text-theme-text-secondary" title={getTaskName(item)}>
                        <div className="truncate">{getTaskName(item)}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-theme-text-primary">{item.title}</div>
                        <div className="mt-1 font-mono text-[11px] text-theme-text-faint">{item.id}</div>
                        <div className="mt-1.5 line-clamp-2 text-xs leading-5 text-theme-text-muted">{item.summary || '暂无摘要'}</div>
                      </div>
                      {!suspectOnly ? (
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-theme-text-secondary">{toUserVulnStatusText(item)}</div>
                          {item.confirm_engine_name && !(item.current_stage === 'finished' || item.finished_reason) ? (
                            <div className="mt-0.5 text-[10px] font-medium text-theme-text-faint">
                              已派发: {item.confirm_engine_name}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="min-w-0">
                        {(item.current_stage === 'finished' || item.finished_reason) ? (
                          <>
                            <div className={`text-sm font-semibold ${(item.finished_reason || item.validation_result) === 'vulnerable' ? 'text-state-danger font-bold' : 'text-theme-text-secondary'}`}>
                              {toConclusionText(item.finished_reason || item.validation_result)}
                            </div>
                          </>
                        ) : (
                          <span className="text-sm text-theme-text-faint">—</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-theme-text-secondary">{item.reporter?.name || 'unknown'}</div>
                        <div className="mt-0.5 text-xs text-theme-text-faint">{item.reporter?.version || 'n/a'}</div>
                      </div>
                      <div className="text-sm text-theme-text-muted">{formatTime(item.updated_at || item.created_at)}</div>
                      <div className="text-sm text-theme-text-muted">{formatTime(item.created_at)}</div>
                      <div>
                        <div className="flex flex-wrap gap-1.5">
                          {suspectOnly ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openManualConfirm(item);
                              }}
                              disabled={manualConfirmSubmitting}
                              title={item.finished_reason ? '重新判定' : '确认漏洞'}
                              aria-label={`确认漏洞 ${item.title}`}
                              className="btn btn-secondary btn-sm px-2"
                            >
                              <ShieldCheck size={14} />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleCreateDownloadJob([item.id], 'single');
                            }}
                            disabled={creatingDownload}
                            title={creatingDownload ? '创建下载任务中' : '下载'}
                            aria-label={`下载漏洞 ${item.title}`}
                            className="btn btn-secondary btn-sm px-2"
                          >
                            <Download size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteSingleFromList(item.id, item.title);
                            }}
                            disabled={bulkDeleting || rowDeletingId === item.id}
                            title={rowDeletingId === item.id ? '删除中' : '删除'}
                            aria-label={`删除漏洞 ${item.title}`}
                            className="btn btn-ghost-danger btn-sm px-2"
                          >
                            {rowDeletingId === item.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-theme-border bg-theme-surface px-3 py-2.5">
                <div className="text-xs font-semibold text-theme-text-muted">
                  当前显示 {totalFiltered === 0 ? 0 : pageStart + 1} - {Math.min(pageStart + pageSize, totalFiltered)} / {totalFiltered}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs font-semibold text-theme-text-muted">
                    每页
                    <select
                      value={pageSize}
                      onChange={(event) => {
                        const value = Math.min(1000, Math.max(10, Number(event.target.value) || 20));
                        setPageSize(value);
                      }}
                      className="ml-2 form-select text-xs"
                      style={{ width: '68px' }}
                    >
                      {[20, 50, 100, 200, 500, 1000].map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" onClick={() => setCurrentPage(1)} disabled={normalizedPage <= 1} className="btn btn-secondary btn-sm">首页</button>
                  <button type="button" onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))} disabled={normalizedPage <= 1} className="btn btn-secondary btn-sm">上一页</button>
                  <button type="button" onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))} disabled={normalizedPage >= totalPages} className="btn btn-secondary btn-sm">下一页</button>
                  <button type="button" onClick={() => setCurrentPage(totalPages)} disabled={normalizedPage >= totalPages} className="btn btn-secondary btn-sm">末页</button>
                </div>
              </div>
            </div>
          </div>
        </>
        )}
        </>
      ) : (
        renderDetailView()
      )}

      {confirmingCase && (
        <DialogShell
          title="确认漏洞"
          subtitle="人工确认后会作为终审结果写入漏洞生命周期。"
          onClose={closeManualConfirm}
        >
          <div className="grid gap-4">
            <div className="rounded-xl border border-theme-border bg-theme-elevated/60 p-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-theme-text-muted-soft">待确认漏洞</div>
              <div className="mt-1 text-sm font-semibold text-theme-text-primary">{confirmingCase.title || '未命名漏洞'}</div>
              <div className="mt-1 font-mono text-[11px] text-theme-text-faint">{confirmingCase.id}</div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setManualConfirmResult('vulnerable');
                  setManualConfirmError('');
                }}
                aria-pressed={manualConfirmResult === 'vulnerable'}
                className={`rounded-xl border-2 px-4 py-3 text-left shadow-sm transition ${manualConfirmResult === 'vulnerable' ? 'border-state-success-border bg-state-success-soft text-state-success ring-2 ring-state-success-border' : 'border-theme-border bg-theme-surface text-theme-text-primary hover:bg-theme-elevated'}`}
              >
                <div className={`text-sm font-semibold ${manualConfirmResult === 'vulnerable' ? 'text-state-success' : 'text-theme-text-primary'}`}>是漏洞</div>
                <div className={`mt-1 text-xs ${manualConfirmResult === 'vulnerable' ? 'text-state-success' : 'text-theme-text-muted'}`}>将终审结果标记为是漏洞。</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setManualConfirmResult('not_vulnerable');
                  setManualConfirmError('');
                }}
                aria-pressed={manualConfirmResult === 'not_vulnerable'}
                className={`rounded-xl border-2 px-4 py-3 text-left shadow-sm transition ${manualConfirmResult === 'not_vulnerable' ? 'border-state-danger-border bg-state-danger-soft text-state-danger ring-2 ring-state-danger-border' : 'border-theme-border bg-theme-surface text-theme-text-primary hover:bg-theme-elevated'}`}
              >
                <div className={`text-sm font-semibold ${manualConfirmResult === 'not_vulnerable' ? 'text-state-danger' : 'text-theme-text-primary'}`}>不是漏洞</div>
                <div className={`mt-1 text-xs ${manualConfirmResult === 'not_vulnerable' ? 'text-state-danger' : 'text-theme-text-muted'}`}>需要填写确认原因。</div>
              </button>
            </div>
            {manualConfirmResult === 'not_vulnerable' && (
              <textarea
                value={manualConfirmReason}
                onChange={(event) => {
                  setManualConfirmReason(event.target.value);
                  if (manualConfirmError) setManualConfirmError('');
                }}
                aria-label="确认不是漏洞的原因"
                placeholder="请输入确认不是漏洞的原因"
                className="form-textarea min-h-[7rem]"
              />
            )}
            {manualConfirmError && <div className="text-sm font-semibold text-state-danger">{manualConfirmError}</div>}
            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <button type="button" onClick={closeManualConfirm} disabled={manualConfirmSubmitting} className="btn btn-secondary">
                取消
              </button>
              <button type="button" onClick={submitManualConfirm} disabled={manualConfirmSubmitting} className="btn btn-primary">
                {manualConfirmSubmitting ? '提交中...' : '确认提交'}
              </button>
            </div>
          </div>
        </DialogShell>
      )}

      {showCreateDialog && (
        <DialogShell
          title="手动创建漏洞"
          onClose={() => setShowCreateDialog(false)}
        >
          <form onSubmit={handleCreateSuspicion} className="grid gap-4">
            <input
              value={suspicionForm.title}
              onChange={(event) => setSuspicionForm({ ...suspicionForm, title: event.target.value })}
              placeholder="漏洞标题"
              className="form-input"
              required
            />
            <textarea
              value={suspicionForm.summary}
              onChange={(event) => setSuspicionForm({ ...suspicionForm, summary: event.target.value })}
              placeholder="漏洞摘要"
              className="form-textarea min-h-[8rem]"
            />
            <textarea
              value={suspicionForm.raw_report_markdown}
              onChange={(event) => setSuspicionForm({ ...suspicionForm, raw_report_markdown: event.target.value })}
              placeholder="原始漏洞报告 Markdown"
              className="form-textarea min-h-[10rem] font-mono text-xs"
            />
            <div className="grid gap-4 md:grid-cols-2">
                <select
                  value={suspicionForm.severity}
                  onChange={(event) => setSuspicionForm({ ...suspicionForm, severity: event.target.value })}
                  className="form-select"
                >
                  <option value="critical">critical</option>
                  <option value="high">high</option>
                  <option value="medium">medium</option>
                  <option value="low">low</option>
                </select>
                <input
                  type="number"
                  min={0}
                  max={10}
                  step={0.1}
                  value={suspicionForm.cvss_score}
                  onChange={(event) => setSuspicionForm({ ...suspicionForm, cvss_score: Number(event.target.value) })}
                  placeholder="CVSS 基础分"
                  className="form-input"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <input
                  type="number"
                  min={0}
                max={100}
                  value={suspicionForm.confidence}
                  onChange={(event) => setSuspicionForm({ ...suspicionForm, confidence: Number(event.target.value) })}
                  placeholder="置信度"
                  className="form-input"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <input
                value={suspicionForm.source_service}
                onChange={(event) => setSuspicionForm({ ...suspicionForm, source_service: event.target.value })}
                placeholder="来源服务"
                className="form-input"
              />
              <input
                value={suspicionForm.asset_type}
                onChange={(event) => setSuspicionForm({ ...suspicionForm, asset_type: event.target.value })}
                placeholder="资产类型"
                className="form-input"
              />
            </div>
            <input
              value={suspicionForm.asset_locator}
              onChange={(event) => setSuspicionForm({ ...suspicionForm, asset_locator: event.target.value })}
              placeholder="资产定位"
              className="form-input"
            />
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="submit"
                disabled={creating}
                className="btn btn-primary"
              >
                {creating ? '创建中...' : '创建漏洞'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateDialog(false)}
                className="btn btn-secondary"
              >
                取消
              </button>
            </div>
          </form>
        </DialogShell>
      )}
    </div>
  );
};
