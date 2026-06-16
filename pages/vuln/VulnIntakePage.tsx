import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Activity,
  ArrowLeft,
  ArrowUpDown,
  BookOpen,
  Check,
  ClipboardCopy,
  Copy,
  Download,
  FileCode2,
  FileClock,
  Filter,
  FolderOpen,
  Key,
  Layers3,
  Loader2,
  Plus,
  Puzzle,
  RefreshCw,
  ScrollText,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  TerminalSquare,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../../clients/api';
import { authApi } from '../../clients/auth';
import { API_BASE } from '../../clients/base';

const vulnApi = api.domains.vuln;
const assetApi = api.domains.assets;

const LK = {
  primary: '#4f73ff',
  primarySoft: '#7590ff',
  primaryDeep: '#3f63f1',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: '#070d18',
  surface: '#111a2b',
  surfaceRaised: '#18233a',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: '#26324a',
  borderSoft: '#1b2438',
  ink: '#f5f7ff',
  inkSoft: '#d6def0',
  body: '#a4aec4',
  muted: '#72809a',
  mutedSoft: '#8b95a8',
  success: '#45c06f',
  warning: '#d5a13a',
  error: '#f15d5d',
  info: '#4f8cff',
  critical: '#ff4d4f',
  high: '#ff8b3d',
  medium: '#f0b64c',
  low: '#49c5ff',
} as const;

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

interface VulnPageProps {
  projectId: string;
  onNavigateToView?: (view: string) => void;
}

type PublicKind = 'cli' | 'plugin' | 'skill' | 'openapi';
type AuthExampleMode = 'simple' | 'normal';
type SortField = 'title' | 'current_stage' | 'severity' | 'reporter' | 'subject' | 'updated_at' | 'confidence' | 'cvss_score';
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
    endpoint: `${API_BASE}/api/vuln/public/intake/submissions`,
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
    endpoint: `${API_BASE}/api/vuln/public/intake/submissions`,
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

const STAGE_LABELS: Record<string, string> = {
  all: '全部阶段',
  receive: '接收阶段',
  triage: '研判阶段',
  validation: '验证阶段',
  finished: '已结束',
};

const PUBLIC_FIELDS = [
  { name: 'project_id', required: true, description: '目标项目标识，正式上报时用于项目绑定与项目级权限校验。' },
  { name: 'report_id', required: false, description: '上报方自己的唯一编号，用于追踪、复核与后续回调。' },
  { name: 'title', required: true, description: '疑点标题。' },
  { name: 'summary', required: false, description: '疑点摘要与简要说明。' },
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
  if (!value) return `backgroundColor: ${LK.surfaceRaised}, color: ${LK.muted}`;
  if (['critical', 'high', 'confirmed'].includes(value)) return `backgroundColor: ${LK.error}22, color: ${LK.error}`;
  if (['medium', 'triage', 'issue'].includes(value)) return `backgroundColor: ${LK.warning}22, color: ${LK.warning}`;
  if (['low', 'validation', 'non_issue'].includes(value)) return `backgroundColor: ${LK.success}22, color: ${LK.success}`;
  if (['receive', 'observe'].includes(value)) return `backgroundColor: ${LK.info}22, color: ${LK.info}`;
  return `backgroundColor: ${LK.surfaceRaised}, color: ${LK.muted}`;
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
  receive: '接收阶段',
  triage: '研判阶段',
  validation: '验证阶段',
  finished: '已结束',
};

const STATUS_TEXT: Record<string, string> = {
  intake_created: '已接收',
  files_collecting: '文件收集中',
  ready_for_triage: '待验证',
  waiting: '等待中',
  ai_assessing: 'AI 研判中',
  manual_assessing: '人工研判中',
  awaiting_manual_gate: '待人工确认',
  triage_completed: '研判完成',
  queued: '待验证',
  poc_generating: 'POC 生成中',
  exp_generating: 'EXP 生成中',
  reproducing: '漏洞复现中',
  evidence_collecting: '证据收集中',
  validation_completed: '验证完成',
  finished: '已结束',
};

const DECISION_TEXT: Record<string, string> = {
  pending: '待定',
  issue: '问题',
  non_issue: '非问题',
  observe: '观察',
  unknown: '未知',
};

const toStageText = (value?: string) => (value ? STAGE_TEXT[value] || value : '未知');
const toStatusText = (value?: string) => (value ? STATUS_TEXT[value] || value : '未知');
const toDecisionText = (value?: string) => (value ? DECISION_TEXT[value] || value : '未知');

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
  return `${current >= 10 || unitIndex === 0 ? current.toFixed(0) : current.toFixed(1)} ${units[unitIndex]}`;
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
  <div className="fixed inset-0 z-[220] flex items-center justify-center p-6 backdrop-blur-sm" style={{ backgroundColor: 'rgba(7, 13, 24, 0.75)' }}>
    <div className="w-full max-w-6xl overflow-hidden" style={{ backgroundColor: LK.surface, border: '1px solid ' + LK.border, borderRadius: '16px' }}>
      <div className="flex items-start justify-between gap-6 px-8 py-6" style={{ borderBottom: '1px solid ' + LK.borderSoft }}>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>漏洞上报中心</div>
          <h3 className="mt-2 text-2xl font-semibold" style={{ color: LK.ink }}>{title}</h3>
          {subtitle ? <p className="mt-2 max-w-3xl text-sm leading-6" style={{ color: LK.body }}>{subtitle}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-3 transition-colors"
          style={{ backgroundColor: LK.surfaceRaised, color: LK.muted, border: '1px solid ' + LK.border }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = LK.surface; e.currentTarget.style.color = LK.ink; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.surfaceRaised; e.currentTarget.style.color = LK.muted; }}
        >
          <X size={18} />
        </button>
      </div>
      <div className="max-h-[80vh] overflow-y-auto px-8 py-8">{children}</div>
    </div>
  </div>
);

const DetailMetricCard: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}> = ({ label, value, hint }) => (
  <div className="rounded-xl px-4 py-4" style={{ backgroundColor: LK.surfaceRaised, border: '1px solid ' + LK.border }}>
    <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>{label}</div>
    <div className="mt-2 text-xl font-semibold tabular-nums" style={{ color: LK.ink }}>{value}</div>
    {hint ? <div className="mt-1 text-xs" style={{ color: LK.body }}>{hint}</div> : null}
  </div>
);

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
  <div className="markdown-body break-words leading-7 text-sm" style={{ color: LK.inkSoft }}>
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
  <div className={`rounded-xl ${compact ? 'p-4' : 'p-5'}`} style={{ backgroundColor: LK.surface, border: '1px solid ' + LK.border }}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>{title}</div>
        {subtitle ? <div className="mt-1 text-xs leading-5" style={{ color: LK.body }}>{subtitle}</div> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
    <div className="mt-4">{children}</div>
  </div>
);

export const VulnIntakePage: React.FC<VulnPageProps> = ({ projectId, onNavigateToView }) => {
  const [rootTab, setRootTab] = useState<IntakeRootTab>('cases');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [suspicions, setSuspicions] = useState<any[]>([]);
  const [overview, setOverview] = useState<any | null>(null);
  const [listTotal, setListTotal] = useState(0);
  const [selectedSuspicionId, setSelectedSuspicionId] = useState('');
  const [selectedDetail, setSelectedDetail] = useState<any | null>(null);
  const [selectedTimeline, setSelectedTimeline] = useState<any[]>([]);
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
  const [severityFilter, setSeverityFilter] = useState('all');
  const [cvssBandFilter, setCvssBandFilter] = useState('all');
  const [reporterTypeFilter, setReporterTypeFilter] = useState('all');
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
      total: Number(overview?.metrics?.total_cases || 0),
      highRisk: Number(overview?.severity_counts?.critical || 0) + Number(overview?.severity_counts?.high || 0),
      pendingAnalyze: Number(overview?.stage_counts?.triage || 0),
      authenticated: Number(overview?.created_by_type_counts?.human || 0),
      openTasks,
    };
  }, [overview, selectedDetail]);

  const displaySummary = selectedDetail?.display_summary || {};
  const evidenceSummary = selectedDetail?.evidence_summary || {};
  const workspaceSummary = selectedDetail?.workspace_summary || {};
  const resultSummary = selectedDetail?.result_summary || {};
  const latestAutoVerifyTask = useMemo(
    () => getLatestAutoVerifyTaskRef(selectedDetail, selectedTimeline, projectId),
    [selectedDetail, selectedTimeline, projectId],
  );
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
      setError(err?.message || '加载疑点总览失败');
    }
  };

  const loadSuspicions = async (pageOverride?: number) => {
    if (!projectId) {
      setSuspicions([]);
      setOverview(null);
      setListTotal(0);
      setSelectedSuspicionIds([]);
      setSelectedSuspicionId('');
      setSelectedDetail(null);
      setSelectedTimeline([]);
      setLinkedFiles(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await vulnApi.vuln.listCases({
        project_id: projectId,
        current_stage: stageFilter === 'all' ? undefined : stageFilter,
        severity: severityFilter === 'all' ? undefined : severityFilter,
        reporter_type: reporterTypeFilter === 'all' ? undefined : reporterTypeFilter,
        cvss_band: cvssBandFilter === 'all' ? undefined : cvssBandFilter,
        search: search.trim() || undefined,
        sort_field: sortField,
        sort_direction: sortDirection,
        page: pageOverride ?? currentPage,
        page_size: pageSize,
      });
      setSuspicions(response.items || []);
      setListTotal(Number(response.total || 0));
      if (response.page && response.page !== currentPage) {
        setCurrentPage(response.page);
      }
    } catch (err: any) {
      setError(err?.message || '加载疑点列表失败');
    } finally {
      setLoading(false);
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
      setLinkedFiles(null);
      setReportItems([]);
      setSelectedReportId('');
      setReportDocument(null);
      setReportError(null);
      return;
    }
    setDetailLoading(true);
    setError(null);
    try {
      const [detail, timeline, reports] = await Promise.all([
        vulnApi.vuln.getCaseDetail(suspicionId),
        vulnApi.vuln.getCaseTimeline(suspicionId),
        vulnApi.vuln.listCaseReports(suspicionId),
      ]);
      setSelectedDetail(detail);
      setSelectedTimeline(timeline.items || []);
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
      setError(err?.message || '加载疑点详情失败');
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
      setReportError(err?.message || '加载疑点报告失败');
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
      setError(err?.message || '加载疑点文件失败');
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
      setError(err?.message || '下载疑点文件失败');
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
      const confirmed = window.confirm(
        '刷新 Token 将导致当前 Token 立即失效。\n请先完成其他系统/脚本中的 Token 替换准备，再继续刷新。\n是否确认刷新？',
      );
      if (!confirmed) return;
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
    void loadSuspicions();
  }, [projectId, currentPage, pageSize, search, stageFilter, severityFilter, reporterTypeFilter, cvssBandFilter, sortField, sortDirection]);

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
  }, [search, stageFilter, severityFilter, reporterTypeFilter, cvssBandFilter, pageSize, sortField, sortDirection]);

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
        report_id: `manual-${Date.now()}`,
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
              report_id: `raw-${Date.now()}`,
              source: 'manual-intake',
            }
          : undefined,
        metadata: {
          source: {
            source_service: suspicionForm.source_service,
            source_kind: 'manual',
          },
          custom: {
            entity_label: '疑点',
          },
        },
      });
      setSuspicionForm(DEFAULT_SUSPICION_FORM);
      setShowCreateDialog(false);
      await Promise.all([loadOverview(), loadSuspicions(1)]);
      setSelectedSuspicionId(created.id);
      setSuccessMessage(`疑点 "${created.title}" 已创建。`);
    } catch (err: any) {
      setError(err?.message || '创建疑点失败');
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
              report_id: selectedDetail.raw_report?.report_id || `raw-${selectedDetail.id}`,
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
      setSuccessMessage('疑点上报字段已更新。');
    } catch (err: any) {
      setError(err?.message || '保存疑点失败');
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
    const guardKey = `${selectedDetail.id}:${latestAutoVerifyTask.taskId}:${selectedDetail.updated_at || ''}:${selectedDetail.current_status || ''}`;
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
      setSuccessMessage('疑点已标记为待验证。');
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
        summary: '在疑点上报中心手动判定为非问题',
      });
      await Promise.all([loadOverview(), loadSuspicions()]);
      await loadSuspicionDetail(selectedDetail.id);
      setSuccessMessage('疑点已手动标记为非问题。');
    } catch (err: any) {
      setError(err?.message || '标记非问题失败');
    } finally {
      setProcessingAction(null);
    }
  };

  const handleDeleteSuspicion = async () => {
    if (!selectedDetail?.id) return;
    const confirmed = window.confirm(`确认删除疑点“${selectedDetail.title}”吗？此操作不可恢复。`);
    if (!confirmed) return;
    setProcessingAction('delete');
    setError(null);
    setSuccessMessage(null);
    try {
      await vulnApi.vuln.deleteCase(selectedDetail.id);
      const deletedTitle = selectedDetail.title;
      setSelectedSuspicionId('');
      setSelectedDetail(null);
      setSelectedTimeline([]);
      const nextPage = pagedSuspicions.length <= 1 && currentPage > 1 ? currentPage - 1 : currentPage;
      await Promise.all([loadOverview(), loadSuspicions(nextPage)]);
      setSuccessMessage(`疑点“${deletedTitle}”已删除。`);
    } catch (err: any) {
      setError(err?.message || '删除疑点失败');
    } finally {
      setProcessingAction(null);
    }
  };

  const handleDeleteSingleFromList = async (caseId: string, title: string) => {
    const confirmed = window.confirm(`确认删除疑点“${title}”吗？此操作不可恢复。`);
    if (!confirmed) return;
    setRowDeletingId(caseId);
    setError(null);
    setSuccessMessage(null);
    try {
      await vulnApi.vuln.deleteCase(caseId);
      const nextPage = pagedSuspicions.length <= 1 && currentPage > 1 ? currentPage - 1 : currentPage;
      await Promise.all([loadOverview(), loadSuspicions(nextPage)]);
      setSelectedSuspicionIds((previous) => previous.filter((id) => id !== caseId));
      setSuccessMessage(`疑点“${title}”已删除。`);
    } catch (err: any) {
      setError(err?.message || '删除疑点失败');
    } finally {
      setRowDeletingId(null);
    }
  };

  const handleDeleteSelectedFromList = async () => {
    if (selectedSuspicionIds.length === 0) return;
    const confirmed = window.confirm(`确认删除已选择的 ${selectedSuspicionIds.length} 条疑点吗？此操作不可恢复。`);
    if (!confirmed) return;
    setBulkDeleting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await Promise.all(selectedSuspicionIds.map((id) => vulnApi.vuln.deleteCase(id)));
      const deletedCount = selectedSuspicionIds.length;
      setSelectedSuspicionIds([]);
      const nextPage = pagedSuspicions.length <= deletedCount && currentPage > 1 ? currentPage - 1 : currentPage;
      await Promise.all([loadOverview(), loadSuspicions(nextPage)]);
      setSuccessMessage(`已删除 ${deletedCount} 条疑点。`);
    } catch (err: any) {
      setError(err?.message || '批量删除疑点失败');
    } finally {
      setBulkDeleting(false);
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

  const handleDownloadJobFile = async (job: any) => {
    if (!job?.job_id) return;
    setDownloadActionJobId(job.job_id);
    setError(null);
    try {
      const blob = await vulnApi.vuln.downloadDownloadJobBlob(job.job_id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = job.output_filename || `${job.job_id}.zip`;
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
    const confirmed = window.confirm('确认删除这个下载任务吗？产物文件也会一起删除。');
    if (!confirmed) return;
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
    setSortDirection(field === 'updated_at' || field === 'confidence' ? 'desc' : 'asc');
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

  const renderSortHeader = (label: string, field: SortField) => (
    <button
      type="button"
      onClick={() => handleSortChange(field)}
      className="inline-flex items-center gap-2 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500 hover:text-slate-800"
    >
      {label}
      <ArrowUpDown size={12} className={sortField === field ? 'text-slate-800' : 'text-slate-300'} />
    </button>
  );

  const renderDownloadCenter = () => (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl px-4 py-3.5" style={{ backgroundColor: LK.surface, border: '1px solid ' + LK.border }}>
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>下载任务总数</div>
          <div className="mt-2 text-3xl font-semibold tabular-nums" style={{ color: LK.ink }}>{downloadStats.total || 0}</div>
        </div>
        <div className="rounded-xl px-4 py-3.5" style={{ backgroundColor: LK.surface, border: '1px solid ' + LK.border }}>
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>处理中</div>
          <div className="mt-2 text-3xl font-semibold tabular-nums" style={{ color: LK.warning }}>{(downloadStats.pending || 0) + (downloadStats.processing || 0)}</div>
        </div>
        <div className="rounded-xl px-4 py-3.5" style={{ backgroundColor: LK.surface, border: '1px solid ' + LK.border }}>
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>可下载</div>
          <div className="mt-2 text-3xl font-semibold tabular-nums" style={{ color: LK.success }}>{downloadStats.downloadable || 0}</div>
        </div>
        <div className="rounded-xl px-4 py-3.5" style={{ backgroundColor: LK.surface, border: '1px solid ' + LK.border }}>
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>失败</div>
          <div className="mt-2 text-3xl font-semibold tabular-nums" style={{ color: LK.error }}>{downloadStats.failed || 0}</div>
        </div>
        <div className="rounded-xl px-4 py-3.5" style={{ backgroundColor: LK.surface, border: '1px solid ' + LK.border }}>
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>已过期</div>
          <div className="mt-2 text-3xl font-semibold tabular-nums" style={{ color: LK.muted }}>{downloadStats.expired || 0}</div>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: LK.surface, border: '1px solid ' + LK.border }}>
        <div className="px-5 py-4 xl:px-6" style={{ borderBottom: '1px solid ' + LK.borderSoft }}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>下载中心</div>
              <h3 className="mt-1 text-xl font-semibold" style={{ color: LK.ink }}>疑点报告异步下载任务</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ backgroundColor: LK.surfaceRaised, color: LK.body }}>
                {downloadJobs.length} 条记录
              </div>
              <button
                type="button"
                onClick={() => loadDownloadCenter()}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
                style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft, border: '1px solid ' + LK.border }}
                onMouseEnter={(e) => { e.currentTarget.style.color = LK.ink; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = LK.inkSoft; }}
              >
                <RefreshCw size={14} />
                刷新
              </button>
            </div>
          </div>
        </div>
        <div className="overflow-hidden">
          <div className="grid grid-cols-[1.2fr_0.8fr_0.7fr_0.8fr_1.2fr_0.8fr_0.8fr_1fr_1fr_1fr_1.2fr_1.2fr] gap-3 px-4 py-2.5" style={{ borderBottom: `1px solid ${LK.border}`, backgroundColor: LK.surfaceRaised }}>
            {['任务 ID', '类型', '报告数', '状态', '文件名', '大小', '创建人', '创建时间', '完成时间', '过期时间', '错误摘要', '操作'].map((label) => (
              <div key={label} className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>{label}</div>
            ))}
          </div>
          {downloadJobsLoading ? (
            <div className="px-4 py-8 text-sm" style={{ backgroundColor: LK.surface, color: LK.muted }}>正在加载下载任务...</div>
          ) : downloadJobs.length === 0 ? (
            <div className="px-4 py-8 text-sm" style={{ backgroundColor: LK.surface, color: LK.muted }}>当前项目还没有下载任务。</div>
          ) : (
            downloadJobs.map((job) => (
              <div key={job.job_id} className="grid grid-cols-[1.2fr_0.8fr_0.7fr_0.8fr_1.2fr_0.8fr_0.8fr_1fr_1fr_1fr_1.2fr_1.2fr] gap-3 px-4 py-3 text-sm last:border-b-0" style={{ borderBottom: `1px solid ${LK.borderSoft}`, backgroundColor: LK.surface }}>
                <div className="min-w-0">
                  <div className="truncate font-semibold" style={{ fontFamily: MONO, color: LK.ink }}>{job.job_id}</div>
                </div>
                <div className="font-semibold" style={{ color: LK.inkSoft }}>{job.scope_type === 'single' ? '单个' : '批量'}</div>
                <div className="font-semibold tabular-nums" style={{ color: LK.ink }}>{job.report_count}</div>
                <div>
                  <span className="rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider" style={{
                    backgroundColor: job.status === 'succeeded' ? `${LK.success}22` : job.status === 'failed' ? `${LK.error}22` : job.status === 'expired' ? `${LK.muted}22` : `${LK.warning}22`,
                    color: job.status === 'succeeded' ? LK.success : job.status === 'failed' ? LK.error : job.status === 'expired' ? LK.muted : LK.warning
                  }}>
                    {toDownloadStatusText(job.status)}
                  </span>
                </div>
                <div className="truncate" style={{ color: LK.body }}>{job.output_filename || '-'}</div>
                <div className="font-semibold tabular-nums" style={{ color: LK.inkSoft }}>{formatBytes(job.output_size_bytes)}</div>
                <div className="truncate" style={{ color: LK.body }}>{job.created_by || '-'}</div>
                <div style={{ color: LK.muted }}>{formatTime(job.created_at)}</div>
                <div style={{ color: LK.muted }}>{formatTime(job.finished_at)}</div>
                <div style={{ color: LK.muted }}>{formatTime(job.expires_at)}</div>
                <div className="truncate text-xs" style={{ color: LK.error }}>{job.last_error || '-'}</div>
                <div className="flex flex-wrap gap-1.5">
                  {job.downloadable ? (
                    <button
                      type="button"
                      onClick={() => handleDownloadJobFile(job)}
                      disabled={downloadActionJobId === job.job_id}
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-50"
                      style={{ backgroundColor: `${LK.success}22`, color: LK.success, border: `1px solid ${LK.success}40` }}
                      onMouseEnter={(e) => { if (downloadActionJobId !== job.job_id) e.currentTarget.style.backgroundColor = `${LK.success}3a`; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = `${LK.success}22`; }}
                    >
                      <Download size={12} />
                      下载
                    </button>
                  ) : null}
                  {job.status === 'failed' ? (
                    <button
                      type="button"
                      onClick={() => handleRetryDownloadJob(job.job_id)}
                      disabled={downloadActionJobId === job.job_id}
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-50"
                      style={{ backgroundColor: `${LK.warning}22`, color: LK.warning, border: `1px solid ${LK.warning}40` }}
                      onMouseEnter={(e) => { if (downloadActionJobId !== job.job_id) e.currentTarget.style.backgroundColor = `${LK.warning}3a`; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = `${LK.warning}22`; }}
                    >
                      <RefreshCw size={12} />
                      重试
                    </button>
                  ) : null}
                  {['succeeded', 'failed', 'expired'].includes(job.status) ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteDownloadJob(job.job_id)}
                      disabled={downloadActionJobId === job.job_id}
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-50"
                      style={{ backgroundColor: `${LK.error}22`, color: LK.error, border: `1px solid ${LK.error}40` }}
                      onMouseEnter={(e) => { if (downloadActionJobId !== job.job_id) e.currentTarget.style.backgroundColor = `${LK.error}3a`; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = `${LK.error}22`; }}
                    >
                      <Trash2 size={12} />
                      删除
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
    if (!selectedDetail) {
      return (
        <div className="rounded-xl px-8 py-10 text-center text-sm" style={{ border: '1px dashed ' + LK.border, backgroundColor: LK.surface, color: LK.muted }}>
          从左侧选择疑点查看详情。
        </div>
      );
    }
    const overviewCards = [
      { label: '当前阶段', value: toStageText(selectedDetail.current_stage), hint: selectedDetail.current_stage || 'n/a' },
      { label: '当前状态', value: toStatusText(selectedDetail.current_status), hint: selectedDetail.current_status || 'n/a' },
      { label: '置信度', value: selectedDetail.confidence ?? 'n/a', hint: `决策：${toDecisionText(selectedDetail.decision_status)}` },
      { label: 'CVSS', value: Number(selectedDetail.cvss_score || 0).toFixed(1), hint: selectedDetail.severity || 'n/a' },
      { label: '上报者', value: selectedDetail.reporter?.name || '未提供', hint: selectedDetail.reporter?.type || '未知类型' },
      { label: '文件根路径', value: selectedDetail.files_root_path || '未分配', hint: workspaceSummary?.files_root_path || '暂无工作区摘要' },
    ];

    const detailTabs: Array<{ key: IntakeDetailTab; label: string; icon: React.ReactNode }> = [
      { key: 'overview', label: '疑点总览', icon: <Layers3 size={14} /> },
      { key: 'report', label: '疑点报告', icon: <ScrollText size={14} /> },
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
      <div className="overflow-hidden rounded-xl" style={{ backgroundColor: LK.surface, border: '1px solid ' + LK.border }}>
        <div className="px-5 py-4 xl:px-6" style={{ borderBottom: '1px solid ' + LK.borderSoft, background: `radial-gradient(circle at top left, ${LK.primaryMuted}, transparent 35%), linear-gradient(180deg, ${LK.surface} 0%, ${LK.surfaceRaised} 100%)` }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setSelectedSuspicionId('')}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
              style={{ backgroundColor: LK.surface, color: LK.inkSoft, border: '1px solid ' + LK.border }}
              onMouseEnter={(e) => { e.currentTarget.style.color = LK.ink; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = LK.inkSoft; }}
            >
              <ArrowLeft size={14} />
              返回疑点列表
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider" style={{ backgroundColor: `${LK.error}22`, color: LK.error }}>
                {selectedDetail.severity}
              </span>
              <span className="rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider" style={{ backgroundColor: `${LK.info}22`, color: LK.info }}>
                {toStageText(selectedDetail.current_stage)}
              </span>
              <span className="rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider" style={{ backgroundColor: `${LK.warning}22`, color: LK.warning }}>
                {toDecisionText(selectedDetail.decision_status)}
              </span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-xl font-semibold tracking-tight xl:text-2xl" style={{ color: LK.ink }}>{selectedDetail.title}</h3>
              <div className="mt-1 text-xs font-semibold" style={{ fontFamily: MONO, color: LK.muted }}>ID: {selectedDetail.id}</div>
              <p className="mt-1 line-clamp-2 text-sm leading-6" style={{ color: LK.body }}>{selectedDetail.summary || '暂无摘要'}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!detailEditMode ? (
                <button
                  type="button"
                  onClick={() => setDetailEditMode(true)}
                  className="rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
                  style={{ backgroundColor: LK.surface, color: LK.inkSoft, border: '1px solid ' + LK.border }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = LK.ink; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = LK.inkSoft; }}
                >
                  编辑上报字段
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleSaveDetailEdit}
                    disabled={detailSaving}
                    className="rounded-lg px-3 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-50"
                    style={{ backgroundColor: LK.primary }}
                    onMouseEnter={(e) => { if (!detailSaving) e.currentTarget.style.backgroundColor = LK.primaryDeep; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.primary; }}
                  >
                    {detailSaving ? '保存中...' : '保存'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelDetailEdit}
                    disabled={detailSaving}
                    className="rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50"
                    style={{ backgroundColor: LK.surface, color: LK.inkSoft, border: '1px solid ' + LK.border }}
                    onMouseEnter={(e) => { if (!detailSaving) e.currentTarget.style.color = LK.ink; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = LK.inkSoft; }}
                  >
                    取消
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-lg px-3 py-2.5" style={{ backgroundColor: LK.surfaceRaised, border: '1px solid ' + LK.border }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>阶段</div>
              <div className="mt-1 text-sm font-semibold" style={{ color: LK.ink }}>{toStageText(selectedDetail.current_stage)}</div>
            </div>
            <div className="rounded-lg px-3 py-2.5" style={{ backgroundColor: LK.surfaceRaised, border: '1px solid ' + LK.border }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>状态</div>
              <div className="mt-1 text-sm font-semibold" style={{ color: LK.ink }}>{toStatusText(selectedDetail.current_status)}</div>
            </div>
            <div className="rounded-lg px-3 py-2.5" style={{ backgroundColor: LK.surfaceRaised, border: '1px solid ' + LK.border }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>置信度</div>
              <div className="mt-1 text-sm font-semibold tabular-nums" style={{ color: LK.ink }}>{selectedDetail.confidence}</div>
            </div>
            <div className="rounded-lg px-3 py-2.5" style={{ backgroundColor: LK.surfaceRaised, border: '1px solid ' + LK.border }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>CVSS</div>
              <div className="mt-1 text-sm font-semibold tabular-nums" style={{ color: LK.ink }}>{Number(selectedDetail.cvss_score || 0).toFixed(1)}</div>
            </div>
            <div className="rounded-lg px-3 py-2.5" style={{ backgroundColor: LK.surfaceRaised, border: '1px solid ' + LK.border }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>开放任务</div>
              <div className="mt-1 text-sm font-semibold tabular-nums" style={{ color: LK.ink }}>{stats.openTasks}</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={handleMarkReadyForTriage}
              disabled={processingAction !== null || selectedDetail.current_stage !== 'receive'}
              className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: LK.info }}
              onMouseEnter={(e) => { if (processingAction === null && selectedDetail.current_stage === 'receive') e.currentTarget.style.opacity = '0.9'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
            >
              <Check size={15} />
              {processingAction === 'ready_for_triage' ? '处理中...' : '标记待验证'}
            </button>
            <button
              type="button"
              onClick={handleOpenAutoVerifyTask}
              disabled={processingAction !== null || !selectedDetail?.id || (!latestAutoVerifyTask && selectedDetail.current_stage === 'finished')}
              className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: LK.primary }}
              onMouseEnter={(e) => { if (processingAction === null && selectedDetail?.id && (latestAutoVerifyTask || selectedDetail.current_stage !== 'finished')) e.currentTarget.style.backgroundColor = LK.primaryDeep; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = LK.primary; }}
            >
              <FolderOpen size={15} />
              {processingAction === 'verify' ? '处理中...' : latestAutoVerifyTask ? '跳转验证任务' : '生成验证任务'}
            </button>
            {latestAutoVerifyTask ? (
              <button
                type="button"
                onClick={handleSyncAutoVerifyTask}
                disabled={processingAction !== null || !selectedDetail?.id}
                className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
                style={{ backgroundColor: `${LK.success}22`, color: LK.success, border: `1px solid ${LK.success}40` }}
                onMouseEnter={(e) => { if (processingAction === null && selectedDetail?.id) e.currentTarget.style.backgroundColor = `${LK.success}3a`; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = `${LK.success}22`; }}
              >
                <RefreshCw size={15} className={processingAction === 'sync_verify' ? 'animate-spin' : ''} />
                {processingAction === 'sync_verify' ? '同步中...' : '同步验证结果'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleMarkFalsePositive}
              disabled={processingAction !== null || selectedDetail.current_stage !== 'triage'}
              className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
              style={{ backgroundColor: `${LK.warning}22`, color: LK.warning, border: `1px solid ${LK.warning}40` }}
              onMouseEnter={(e) => { if (processingAction === null && selectedDetail.current_stage === 'triage') e.currentTarget.style.backgroundColor = `${LK.warning}3a`; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = `${LK.warning}22`; }}
            >
              <ShieldAlert size={15} />
              {processingAction === 'false_positive' ? '处理中...' : '标记非问题'}
            </button>
            <button
              type="button"
              onClick={handleDeleteSuspicion}
              disabled={processingAction !== null}
              className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
              style={{ backgroundColor: `${LK.error}22`, color: LK.error, border: `1px solid ${LK.error}40` }}
              onMouseEnter={(e) => { if (processingAction === null) e.currentTarget.style.backgroundColor = `${LK.error}3a`; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = `${LK.error}22`; }}
            >
              <X size={15} />
              {processingAction === 'delete' ? '删除中...' : '删除疑点'}
            </button>
          </div>
        </div>

        <div className="px-5 pt-4 xl:px-6" style={{ borderBottom: '1px solid ' + LK.borderSoft, backgroundColor: `${LK.surfaceRaised}cc` }}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>详情视图</div>
              <div className="mt-1 text-sm" style={{ color: LK.body }}>先看结论，再查看报告、证据、过程和关联上下文。</div>
            </div>
            <div className="hidden rounded-lg px-3 py-2 text-xs font-semibold xl:block" style={{ backgroundColor: LK.surface, color: LK.inkSoft, border: '1px solid ' + LK.border }}>
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
                  className="inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors"
                  style={{
                    border: active ? `1px solid ${LK.primary}` : `1px solid ${LK.border}`,
                    backgroundColor: active ? LK.primaryMuted : LK.surface,
                    color: active ? LK.primary : LK.body
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = LK.ink; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = LK.body; }}
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
                  <DetailSectionCard title="疑点摘要" subtitle="先看本条疑点的结论、摘要和对象定位。">
                    <div className="mt-3 space-y-3 text-sm leading-7" style={{ color: LK.inkSoft }}>
                      <div>{displaySummary?.subtitle || selectedDetail.summary || '暂无摘要说明'}</div>
                      <div className="rounded-xl p-4" style={{ backgroundColor: LK.surfaceRaised }}>
                        <div className="text-xs font-semibold" style={{ color: LK.mutedSoft }}>当前结论</div>
                        <div className="mt-1 text-sm font-semibold" style={{ color: LK.ink }}>
                          {displaySummary?.validation_result || resultSummary?.summary || toDecisionText(selectedDetail.decision_status)}
                        </div>
                      </div>
                      <div className="rounded-xl p-4" style={{ backgroundColor: LK.surfaceRaised }}>
                        <div className="text-xs font-semibold" style={{ color: LK.mutedSoft }}>对象定位</div>
                        <div className="mt-1 break-all text-sm font-semibold" style={{ color: LK.ink }}>{selectedDetail.subject?.locator || '未提供定位信息'}</div>
                      </div>
                    </div>
                  </DetailSectionCard>
                  <DetailSectionCard title="阶段流转与来源" subtitle="展示当前阶段、处置状态和来源任务上下文。">
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <DetailMetricCard label="当前阶段" value={toStageText(selectedDetail.current_stage)} hint={selectedDetail.current_status || 'n/a'} />
                      <DetailMetricCard label="处置状态" value={toDecisionText(selectedDetail.decision_status)} hint={selectedDetail.validation_result || '未验证'} />
                      <DetailMetricCard label="来源服务" value={selectedDetail.source_service || displaySummary?.source_task?.service_name || '未提供'} hint={selectedDetail.created_by_type || 'n/a'} />
                      <DetailMetricCard label="来源任务" value={selectedDetail.source_task_id || displaySummary?.source_task?.task_id || '未提供'} hint={selectedDetail.source_execution_id || '无执行引用'} />
                    </div>
                  </DetailSectionCard>
                </div>
                <div className="space-y-4">
                  <DetailSectionCard title="识别信息" subtitle="用于快速识别、排查和交叉检索本条疑点。">
                    <div className="mt-3 space-y-2 text-sm" style={{ color: LK.inkSoft }}>
                      <div><span className="font-semibold" style={{ color: LK.ink }}>疑点 ID：</span><span className="font-mono">{selectedDetail.id}</span></div>
                      <div><span className="font-semibold" style={{ color: LK.ink }}>Finding ID：</span>{selectedDetail.finding_id || '未提供'}</div>
                      <div><span className="font-semibold" style={{ color: LK.ink }}>全局漏洞 ID：</span>{selectedDetail.global_vuln_id || '未提供'}</div>
                      <div><span className="font-semibold" style={{ color: LK.ink }}>当前报告：</span>{displaySummary?.current_report_title || displaySummary?.current_report_id || '未关联'}</div>
                      <div><span className="font-semibold" style={{ color: LK.ink }}>报告更新时间：</span>{formatTime(displaySummary?.current_report_updated_at || selectedDetail.current_report_updated_at)}</div>
                      <div><span className="font-semibold" style={{ color: LK.ink }}>创建时间：</span>{formatTime(selectedDetail.created_at)}</div>
                      <div><span className="font-semibold" style={{ color: LK.ink }}>最近更新：</span>{formatTime(selectedDetail.updated_at)}</div>
                    </div>
                  </DetailSectionCard>
                  <DetailSectionCard title="关键提示" subtitle="从报告和结果中提炼出的要点，方便快速浏览。">
                    <div className="mt-3 space-y-2">
                      {(Array.isArray(displaySummary?.key_points) ? displaySummary.key_points : []).length > 0 ? (
                        (displaySummary.key_points as string[]).map((point, index) => (
                          <div key={`${point}-${index}`} className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: LK.surfaceRaised, color: LK.inkSoft }}>
                            {point}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl px-4 py-4 text-sm" style={{ backgroundColor: LK.surfaceRaised, color: LK.body }}>当前没有提炼出的关键提示。</div>
                      )}
                    </div>
                  </DetailSectionCard>
                </div>
              </div>
            </div>
          )}

          {detailActiveTab === 'report' && (
            <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
              <div className="space-y-3">
                <DetailSectionCard title="报告列表" subtitle="选择不同阶段或不同来源生成的疑点报告。" compact>
                  <div className="mt-3 space-y-2.5">
                    {reportItems.length === 0 ? (
                      <div className="rounded-xl px-4 py-4 text-sm" style={{ backgroundColor: LK.surfaceRaised, color: LK.body }}>当前疑点还没有生成正式报告，可先查看证据与文件。</div>
                    ) : (
                      reportItems.map((item: any) => {
                        const active = selectedReportId === item.report_id;
                        const isRawReport = item.report_kind === 'imported_raw';
                        return (
                          <button
                            key={item.report_id}
                            type="button"
                            onClick={() => setSelectedReportId(item.report_id)}
                            className="w-full rounded-xl border p-4 text-left transition-colors"
                            style={{
                              borderColor: active ? LK.primary : LK.border,
                              backgroundColor: active ? LK.primaryMuted : LK.surface,
                              color: active ? LK.primary : LK.inkSoft
                            }}
                            onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = LK.surfaceRaised; }}
                            onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = LK.surface; }}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-semibold">{isRawReport ? '原始漏洞报告' : (item.title || item.report_id)}</div>
                              <span className="rounded-lg px-2 py-1 text-[10px] font-semibold" style={{
                                backgroundColor: active ? `${LK.primary}22` : LK.surfaceRaised,
                                color: active ? LK.primary : LK.body
                              }}>
                                {toStageText(item.stage)}
                              </span>
                            </div>
                            <div className="mt-1 text-xs" style={{ color: active ? LK.inkSoft : LK.muted }}>{(isRawReport ? '原始报告' : toStageText(item.stage))} · {item.generated_at ? formatTime(item.generated_at) : '未记录时间'}</div>
                            <div className="mt-2 line-clamp-3 text-xs leading-5" style={{ color: active ? LK.inkSoft : LK.muted }}>{item.excerpt || item.source_service_id || '暂无摘要'}</div>
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
                          className="block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors"
                          style={{
                            paddingLeft: `${heading.level * 12}px`,
                            backgroundColor: activeReportHeadingId === heading.id ? LK.primary : 'transparent',
                            color: activeReportHeadingId === heading.id ? '#ffffff' : LK.body
                          }}
                          onMouseEnter={(e) => { if (activeReportHeadingId !== heading.id) e.currentTarget.style.backgroundColor = LK.surfaceRaised; e.currentTarget.style.color = LK.ink; }}
                          onMouseLeave={(e) => { if (activeReportHeadingId !== heading.id) e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = LK.body; }}
                        >
                          {heading.text}
                        </button>
                      ))}
                    </div>
                  </DetailSectionCard>
                ) : null}
              </div>
              <div className="rounded-xl p-5" style={{ backgroundColor: LK.surface, border: '1px solid ' + LK.border }}>
                <div className="flex flex-wrap items-start justify-between gap-3 pb-4" style={{ borderBottom: '1px solid ' + LK.borderSoft }}>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: LK.mutedSoft }}>疑点报告</div>
                    <div className="mt-1 text-lg font-semibold" style={{ color: LK.ink }}>{reportDocument?.title || reportItems.find((item) => item.report_id === selectedReportId)?.title || '未选择报告'}</div>
                    <div className="mt-1 text-xs" style={{ color: LK.body }}>
                      类型：{reportDocument?.report_kind || reportItems.find((item) => item.report_id === selectedReportId)?.report_kind || 'unknown'} · 阶段：{toStageText(reportDocument?.stage || reportItems.find((item) => item.report_id === selectedReportId)?.stage)} · 来源：{reportDocument?.source_service_id || reportItems.find((item) => item.report_id === selectedReportId)?.source_service_id || '未提供'}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {reportDocument?.storage_path ? <div className="rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: LK.surfaceRaised, color: LK.body }}>存储路径：{reportDocument.storage_path}</div> : null}
                    {reportDocument?.generated_at ? <div className="rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: LK.surfaceRaised, color: LK.body }}>生成时间：{formatTime(reportDocument.generated_at)}</div> : null}
                  </div>
                </div>
                <div ref={reportScrollRef} className="mt-5 min-h-[28rem] max-h-[calc(100vh-22rem)] overflow-auto pr-1">
                  {reportLoading ? (
                    <div className="flex items-center gap-2 text-sm" style={{ color: LK.body }}><Loader2 size={16} className="animate-spin" /> 正在加载报告...</div>
                  ) : reportError ? (
                    <div className="rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: `${LK.error}22`, color: LK.error, border: `1px solid ${LK.error}40` }}>{reportError}</div>
                  ) : reportItems.length === 0 ? (
                    <div className="rounded-xl px-6 py-12 text-center text-sm" style={{ border: '1px dashed ' + LK.border, color: LK.body }}>暂无正式报告，请切换到「证据与文件」查看原始材料与文件目录。</div>
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
                  <DetailSectionCard title="证据摘要" subtitle="用于快速了解当前疑点的核心证据、复现提示和引用材料。">
                    <div className="mt-3 space-y-3 text-sm" style={{ color: LK.inkSoft }}>
                      <div className="rounded-xl p-4" style={{ backgroundColor: LK.surfaceRaised }}>{evidenceSummary?.summary || selectedDetail?.evidence?.summary || '暂无证据摘要'}</div>
                      <div className="rounded-xl p-4" style={{ backgroundColor: LK.surfaceRaised }}>
                        <div className="text-xs font-semibold" style={{ color: LK.mutedSoft }}>复现提示</div>
                        <div className="mt-1 whitespace-pre-wrap leading-6">{evidenceSummary?.reproduction_hint || selectedDetail?.evidence?.reproduction_hint || '暂无复现提示'}</div>
                      </div>
                      <div className="rounded-xl p-4" style={{ backgroundColor: LK.surfaceRaised }}>
                        <div className="text-xs font-semibold" style={{ color: LK.mutedSoft }}>证据引用</div>
                        {Array.isArray(evidenceSummary?.references) && evidenceSummary.references.length > 0 ? (
                          <div className="mt-2 space-y-2">
                            {evidenceSummary.references.map((reference: any, index: number) => (
                              <div key={index} className="rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: LK.surface, color: LK.body }}>{typeof reference === 'string' ? reference : JSON.stringify(reference)}</div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-1 text-sm" style={{ color: LK.body }}>暂无证据引用</div>
                        )}
                      </div>
                    </div>
                  </DetailSectionCard>
                  <DetailSectionCard title="Artifact 清单" subtitle="按材料清单查看原始文件、引用路径和媒介类型。">
                    <div className="mt-3 space-y-2">
                      {(Array.isArray(selectedDetail.artifacts) ? selectedDetail.artifacts : []).length > 0 ? (
                        (selectedDetail.artifacts as any[]).map((artifact, index) => (
                          <div key={`${artifact?.name || artifact?.path || index}`} className="rounded-xl px-4 py-3" style={{ border: '1px solid ' + LK.border }}>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="text-sm font-semibold" style={{ color: LK.ink }}>{artifact?.name || artifact?.path || `artifact-${index + 1}`}</div>
                              <span className="rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider" style={{ backgroundColor: LK.surfaceRaised, color: LK.body }}>{artifact?.kind || 'unknown'}</span>
                            </div>
                            <div className="mt-1 text-xs" style={{ color: LK.muted }}>{artifact?.media_type ? `媒体类型：${artifact.media_type}` : '未提供媒体类型'}</div>
                            {artifact?.path || artifact?.content_ref ? <div className="mt-2 break-all text-xs" style={{ color: LK.muted }}>{artifact.path || artifact.content_ref}</div> : null}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl px-4 py-4 text-sm" style={{ backgroundColor: LK.surfaceRaised, color: LK.body }}>暂无 artifact 清单</div>
                      )}
                    </div>
                  </DetailSectionCard>
                </div>
                <div className="space-y-4">
                  <DetailSectionCard title="上报者 / 目标对象 / 证据编辑" subtitle="编辑模式下可直接调整上报字段；只读模式下用于集中查看。">
                    <div className="mt-3 grid gap-2.5">
                      <div className="grid grid-cols-2 gap-2.5">
                        <label className="grid gap-1">
                          <span className="text-[11px] font-semibold" style={{ color: LK.mutedSoft }}>上报者名称（reporter.name）</span>
                          <input value={editableDetail?.reporter?.name || ''} onChange={(event) => setEditableDetail((prev) => (prev ? { ...prev, reporter: { ...prev.reporter, name: event.target.value } } : prev))} disabled={!detailEditMode || detailSaving} className="rounded-lg px-3 py-2 text-sm outline-none transition-colors" style={{ backgroundColor: detailEditMode ? LK.surfaceRaised : LK.surface, color: detailEditMode ? LK.inkSoft : LK.muted, border: '1px solid ' + LK.border }} onFocus={(e) => { if (detailEditMode) e.currentTarget.style.borderColor = LK.primary; }} onBlur={(e) => { if (detailEditMode) e.currentTarget.style.borderColor = LK.border; }} />
                        </label>
                        <label className="grid gap-1">
                          <span className="text-[11px] font-semibold" style={{ color: LK.mutedSoft }}>上报者版本（reporter.version）</span>
                          <input value={editableDetail?.reporter?.version || ''} onChange={(event) => setEditableDetail((prev) => (prev ? { ...prev, reporter: { ...prev.reporter, version: event.target.value } } : prev))} disabled={!detailEditMode || detailSaving} className="rounded-lg px-3 py-2 text-sm outline-none transition-colors" style={{ backgroundColor: detailEditMode ? LK.surfaceRaised : LK.surface, color: detailEditMode ? LK.inkSoft : LK.muted, border: '1px solid ' + LK.border }} onFocus={(e) => { if (detailEditMode) e.currentTarget.style.borderColor = LK.primary; }} onBlur={(e) => { if (detailEditMode) e.currentTarget.style.borderColor = LK.border; }} />
                        </label>
                        <label className="grid gap-1">
                          <span className="text-[11px] font-semibold" style={{ color: LK.mutedSoft }}>上报方式（reporter.type）</span>
                          <input value={editableDetail?.reporter?.type || ''} onChange={(event) => setEditableDetail((prev) => (prev ? { ...prev, reporter: { ...prev.reporter, type: event.target.value } } : prev))} disabled={!detailEditMode || detailSaving} className="rounded-lg px-3 py-2 text-sm outline-none transition-colors" style={{ backgroundColor: detailEditMode ? LK.surfaceRaised : LK.surface, color: detailEditMode ? LK.inkSoft : LK.muted, border: '1px solid ' + LK.border }} onFocus={(e) => { if (detailEditMode) e.currentTarget.style.borderColor = LK.primary; }} onBlur={(e) => { if (detailEditMode) e.currentTarget.style.borderColor = LK.border; }} />
                        </label>
                        <label className="grid gap-1">
                          <span className="text-[11px] font-semibold" style={{ color: LK.mutedSoft }}>上报入口（reporter.endpoint）</span>
                          <input value={editableDetail?.reporter?.endpoint || ''} onChange={(event) => setEditableDetail((prev) => (prev ? { ...prev, reporter: { ...prev.reporter, endpoint: event.target.value } } : prev))} disabled={!detailEditMode || detailSaving} className="rounded-lg px-3 py-2 text-sm outline-none transition-colors" style={{ backgroundColor: detailEditMode ? LK.surfaceRaised : LK.surface, color: detailEditMode ? LK.inkSoft : LK.muted, border: '1px solid ' + LK.border }} onFocus={(e) => { if (detailEditMode) e.currentTarget.style.borderColor = LK.primary; }} onBlur={(e) => { if (detailEditMode) e.currentTarget.style.borderColor = LK.border; }} />
                        </label>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        <label className="grid gap-1">
                          <span className="text-[11px] font-semibold" style={{ color: LK.mutedSoft }}>对象类型（subject.type）</span>
                          <input value={editableDetail?.subject?.type || ''} onChange={(event) => setEditableDetail((prev) => (prev ? { ...prev, subject: { ...prev.subject, type: event.target.value } } : prev))} disabled={!detailEditMode || detailSaving} className="rounded-lg px-3 py-2 text-sm outline-none transition-colors" style={{ backgroundColor: detailEditMode ? LK.surfaceRaised : LK.surface, color: detailEditMode ? LK.inkSoft : LK.muted, border: '1px solid ' + LK.border }} onFocus={(e) => { if (detailEditMode) e.currentTarget.style.borderColor = LK.primary; }} onBlur={(e) => { if (detailEditMode) e.currentTarget.style.borderColor = LK.border; }} />
                        </label>
                        <label className="grid gap-1">
                          <span className="text-[11px] font-semibold" style={{ color: LK.mutedSoft }}>对象名称（subject.name）</span>
                          <input value={editableDetail?.subject?.name || ''} onChange={(event) => setEditableDetail((prev) => (prev ? { ...prev, subject: { ...prev.subject, name: event.target.value } } : prev))} disabled={!detailEditMode || detailSaving} className="rounded-lg px-3 py-2 text-sm outline-none transition-colors" style={{ backgroundColor: detailEditMode ? LK.surfaceRaised : LK.surface, color: detailEditMode ? LK.inkSoft : LK.muted, border: '1px solid ' + LK.border }} onFocus={(e) => { if (detailEditMode) e.currentTarget.style.borderColor = LK.primary; }} onBlur={(e) => { if (detailEditMode) e.currentTarget.style.borderColor = LK.border; }} />
                        </label>
                        <label className="grid gap-1 col-span-2">
                          <span className="text-[11px] font-semibold" style={{ color: LK.mutedSoft }}>对象定位（subject.locator）</span>
                          <input value={editableDetail?.subject?.locator || ''} onChange={(event) => setEditableDetail((prev) => (prev ? { ...prev, subject: { ...prev.subject, locator: event.target.value } } : prev))} disabled={!detailEditMode || detailSaving} className="rounded-lg px-3 py-2 text-sm outline-none transition-colors" style={{ backgroundColor: detailEditMode ? LK.surfaceRaised : LK.surface, color: detailEditMode ? LK.inkSoft : LK.muted, border: '1px solid ' + LK.border }} onFocus={(e) => { if (detailEditMode) e.currentTarget.style.borderColor = LK.primary; }} onBlur={(e) => { if (detailEditMode) e.currentTarget.style.borderColor = LK.border; }} />
                        </label>
                      </div>
                      <label className="grid gap-1">
                        <span className="text-[11px] font-semibold" style={{ color: LK.mutedSoft }}>证据摘要（evidence.summary）</span>
                        <textarea value={editableDetail?.evidence_summary || ''} onChange={(event) => setEditableDetail((prev) => (prev ? { ...prev, evidence_summary: event.target.value } : prev))} disabled={!detailEditMode || detailSaving} className="min-h-[66px] rounded-lg px-3 py-2 text-sm outline-none resize-none transition-colors" style={{ backgroundColor: detailEditMode ? LK.surfaceRaised : LK.surface, color: detailEditMode ? LK.inkSoft : LK.muted, border: '1px solid ' + LK.border }} onFocus={(e) => { if (detailEditMode) e.currentTarget.style.borderColor = LK.primary; }} onBlur={(e) => { if (detailEditMode) e.currentTarget.style.borderColor = LK.border; }} />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-[11px] font-semibold" style={{ color: LK.mutedSoft }}>复现提示（evidence.reproduction_hint）</span>
                        <textarea value={editableDetail?.evidence_reproduction_hint || ''} onChange={(event) => setEditableDetail((prev) => (prev ? { ...prev, evidence_reproduction_hint: event.target.value } : prev))} disabled={!detailEditMode || detailSaving} className="min-h-[66px] rounded-lg px-3 py-2 text-sm outline-none resize-none transition-colors" style={{ backgroundColor: detailEditMode ? LK.surfaceRaised : LK.surface, color: detailEditMode ? LK.inkSoft : LK.muted, border: '1px solid ' + LK.border }} onFocus={(e) => { if (detailEditMode) e.currentTarget.style.borderColor = LK.primary; }} onBlur={(e) => { if (detailEditMode) e.currentTarget.style.borderColor = LK.border; }} />
                      </label>
                    </div>
                  </DetailSectionCard>
                  <DetailSectionCard
                    title="疑点文件"
                    subtitle={selectedDetail.files_root_path || '未分配文件根路径'}
                    compact
                    actions={
                      linkedFiles?.root_path ? (
                        <button
                          type="button"
                          onClick={() => openLinkedFilesPath(linkedFiles.root_path)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700"
                        >
                          根目录
                        </button>
                      ) : null
                    }
                  >
                    <div className="mt-3 overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white shadow-sm">
                      {linkedFilesLoading ? (
                        <div className="px-4 py-8 text-sm text-slate-600">正在加载关联文件...</div>
                      ) : !linkedFiles ? (
                        <div className="px-4 py-8 text-sm text-slate-600">当前疑点还没有可展示的文件目录。</div>
                      ) : (
                        <div className="flex h-full min-h-[360px] flex-col">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
                            <div className="truncate text-xs font-bold text-slate-700">当前路径：{linkedFiles.current_path}</div>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void handleCreateLinkedArchiveTask()}
                                disabled={selectedLinkedPaths.length === 0 || linkedArchiveSubmitting}
                                className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-40"
                              >
                                {linkedArchiveSubmitting ? '提交中...' : `打包下载(${selectedLinkedPaths.length})`}
                              </button>
                              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                                <Search size={12} className="text-slate-400" />
                                <input
                                  value={linkedFileSearch}
                                  onChange={(event) => setLinkedFileSearch(event.target.value)}
                                  placeholder="搜索文件名/路径"
                                  className="w-36 bg-transparent text-xs font-semibold text-slate-700 outline-none placeholder:text-slate-400"
                                />
                              </div>
                              {linkedFiles.current_path !== linkedFiles.root_path && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const current = String(linkedFiles.current_path || '');
                                    const parts = current.split('/').filter(Boolean);
                                    const parent = parts.length <= 2 ? linkedFiles.root_path : `/${parts.slice(0, -1).join('/')}`;
                                    openLinkedFilesPath(parent);
                                  }}
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700"
                                >
                                  上级目录
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => openLinkedFilesPath(linkedFiles.current_path)}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700"
                              >
                                刷新
                              </button>
                            </div>
                          </div>
                          <div className="grid min-h-0 flex-1 xl:grid-cols-[360px_minmax(0,1fr)]">
                            <div className="min-h-0 overflow-auto border-r border-slate-100 p-3">
                              <div className="grid grid-cols-[24px_minmax(0,1fr)_70px] gap-3 rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-600">
                                <div>选</div>
                                <div>名称</div>
                                <div>大小</div>
                              </div>
                              <div className="mt-2 space-y-1">
                                {linkedDirectoryItems.map((directory: any) => (
                                  <div
                                    key={directory.id}
                                    className="grid w-full grid-cols-[24px_minmax(0,1fr)_70px] items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-slate-50"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedLinkedPaths.includes(directory.path)}
                                      onChange={() => toggleLinkedPathSelection(directory.path)}
                                      className="h-4 w-4"
                                      aria-label={`选择目录 ${directory.name}`}
                                    />
                                    <span className="inline-flex min-w-0 items-center gap-2 truncate text-sm font-semibold text-slate-800">
                                      <FolderOpen size={14} className="shrink-0 text-amber-500" />
                                      <button
                                        type="button"
                                        onClick={() => openLinkedFilesPath(directory.path)}
                                        className="truncate text-left"
                                      >
                                        {directory.name}
                                      </button>
                                    </span>
                                    <span className="text-xs text-slate-500">--</span>
                                  </div>
                                ))}
                                {linkedFileItems.map((file: any) => {
                                  const active = selectedLinkedFile?.id === file.id;
                                  return (
                                    <div
                                      key={file.id}
                                      className={`grid grid-cols-[24px_minmax(0,1fr)_70px] items-center gap-3 rounded-xl px-3 py-2 ${active ? 'bg-sky-50' : 'hover:bg-slate-50'}`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={selectedLinkedPaths.includes(file.path)}
                                        onChange={() => toggleLinkedPathSelection(file.path)}
                                        className="h-4 w-4"
                                        aria-label={`选择文件 ${file.filename}`}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => openLinkedTextPreview(file)}
                                        className="min-w-0 text-left"
                                      >
                                        <div className="inline-flex min-w-0 items-center gap-2">
                                          <FileCode2 size={13} className="shrink-0 text-slate-500" />
                                          <span className="truncate text-sm font-semibold text-slate-800">{file.filename}</span>
                                        </div>
                                        <div className="mt-0.5 truncate text-[10px] text-slate-500">{file.path}</div>
                                      </button>
                                      <span className="text-xs text-slate-500">{Math.max(0, Math.round(Number(file.size || 0) / 1024))}KB</span>
                                    </div>
                                  );
                                })}
                                {linkedDirectoryItems.length === 0 && linkedFileItems.length === 0 && (
                                  <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-600">
                                    当前目录没有匹配的文件或文件夹
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="min-h-0">
                              {selectedLinkedFile ? (
                                <div className="grid h-full min-h-0 xl:grid-cols-[minmax(0,1fr)_240px]">
                                  <div className="min-h-0 border-r border-slate-100 p-4">
                                    <div className="mb-3 inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                                      <FileCode2 size={13} />
                                      {selectedLinkedFile.filename}
                                    </div>
                                    <div className="h-[calc(100%-1.5rem)] min-h-[260px] overflow-auto">
                                      {linkedFilePreviewLoading ? (
                                        <div className="text-sm text-slate-600">正在加载文件内容...</div>
                                      ) : linkedFilePreviewError ? (
                                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{linkedFilePreviewError}</div>
                                      ) : (
                                        <pre className="h-full overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-5 font-mono text-[12px] whitespace-pre-wrap text-slate-900">{linkedFilePreview || ''}</pre>
                                      )}
                                    </div>
                                  </div>
                                  <div className="p-4 text-sm text-slate-700">
                                    <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">文件信息</div>
                                    <div className="mt-4 space-y-3">
                                      <div><div className="text-xs text-slate-500">文件名</div><div className="break-all font-bold text-slate-900">{selectedLinkedFile.filename}</div></div>
                                      <div><div className="text-xs text-slate-500">内容类型</div><div className="font-semibold text-slate-800">{selectedLinkedFile.content_type || '未知类型'}</div></div>
                                      <div><div className="text-xs text-slate-500">大小</div><div className="font-semibold text-slate-800">{Number(selectedLinkedFile.size || 0)} bytes</div></div>
                                      <div><div className="text-xs text-slate-500">路径</div><div className="break-all font-semibold text-slate-800">{selectedLinkedFile.path || '-'}</div></div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleLinkedFileDownload(selectedLinkedFile.id, selectedLinkedFile.filename)}
                                      className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white"
                                    >
                                      <Download size={14} />
                                      下载文件
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex h-full min-h-[320px] items-center justify-center text-sm text-slate-600">
                                  从左侧列表选择文件进行预览
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
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
                      <div className="rounded-xl bg-slate-50 px-4 py-4 text-sm text-slate-600">暂无时间线数据</div>
                    ) : (
                      selectedTimeline.map((item: any) => (
                        <div key={item.id} className="rounded-xl border border-slate-200 px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-black text-slate-800">{item.payload?.summary || item.payload?.event_type || item.item_type}</div>
                            <div className="text-[11px] font-semibold text-slate-500">{formatTime(item.created_at)}</div>
                          </div>
                          <div className="mt-1.5 text-xs text-slate-500">
                            类型：{item.item_type}
                            {item.payload?.status ? ` · 状态：${item.payload.status}` : ''}
                            {item.payload?.actor ? ` · 执行者：${item.payload.actor}` : ''}
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
                        <div className="rounded-xl bg-slate-50 px-4 py-4 text-sm text-slate-600">暂无动作记录</div>
                      ) : (
                        processActions.map((action: any, index: number) => (
                          <div key={action.id || index} className="rounded-xl border border-slate-200 px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-black text-slate-800">{action.title || action.action_type || action.name || `动作 ${index + 1}`}</div>
                              <div className="text-[11px] text-slate-500">{action.execution_status || action.status || 'unknown'}</div>
                            </div>
                            <div className="mt-1 text-xs text-slate-500">{action.summary || action.description || action.owner || '暂无摘要'}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </DetailSectionCard>
                  <DetailSectionCard title="协同记录 / 人工任务" subtitle="展示人工介入项、状态和当前说明。">
                    <div className="mt-3 space-y-2.5">
                      {processManualTasks.length === 0 ? (
                        <div className="rounded-xl bg-slate-50 px-4 py-4 text-sm text-slate-600">暂无人工任务</div>
                      ) : (
                        processManualTasks.map((task: any, index: number) => (
                          <div key={task.id || index} className="rounded-xl border border-slate-200 px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-black text-slate-800">{task.title || task.name || `人工任务 ${index + 1}`}</div>
                              <div className="text-[11px] text-slate-500">{task.status || 'unknown'}</div>
                            </div>
                            <div className="mt-1 text-xs text-slate-500">{task.summary || task.description || task.assignee || '暂无说明'}</div>
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
                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                    <div><span className="font-black text-slate-700">上报者：</span>{selectedDetail.reporter?.name || '未提供'} / {selectedDetail.reporter?.type || 'unknown'}</div>
                    <div><span className="font-black text-slate-700">目标对象：</span>{selectedDetail.subject?.type || '未提供'} / {selectedDetail.subject?.name || selectedDetail.subject?.locator || '未提供'}</div>
                    <div><span className="font-black text-slate-700">来源报告 ID：</span>{Array.isArray(displaySummary?.source_report_ids) && displaySummary.source_report_ids.length > 0 ? displaySummary.source_report_ids.join(', ') : '未提供'}</div>
                    <div><span className="font-black text-slate-700">来源任务 ID：</span>{selectedDetail.source_task_id || '未提供'}</div>
                    <div><span className="font-black text-slate-700">来源执行引用：</span>{selectedDetail.source_execution_id || '未提供'}</div>
                    <div><span className="font-black text-slate-700">文件根路径：</span>{selectedDetail.files_root_path || workspaceSummary?.files_root_path || '未提供'}</div>
                    <div><span className="font-black text-slate-700">当前报告存储路径：</span>{reportDocument?.storage_path || '未提供'}</div>
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
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700"
                    >
                      <Copy size={13} />
                      复制
                    </button>
                  }
                >
                  <div className="mt-3 space-y-2">
                    {relatedRefs.length === 0 ? (
                      <div className="rounded-xl bg-slate-50 px-4 py-4 text-sm text-slate-600">暂无关联执行引用</div>
                    ) : (
                      relatedRefs.map((ref: any, index: number) => (
                        <div key={`${ref?.key || 'ref'}-${index}`} className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                          <div className="font-black text-slate-800">{ref?.key || `ref-${index + 1}`}</div>
                          <div className="mt-1 break-all text-xs text-slate-600">{ref?.value || '-'}</div>
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
                      <span className="text-[11px] font-black text-slate-500">证据引用（evidence.references，JSON 数组）</span>
                      <textarea value={editableDetail?.evidence_references_text || '[]'} onChange={(event) => setEditableDetail((prev) => (prev ? { ...prev, evidence_references_text: event.target.value } : prev))} disabled={!detailEditMode || detailSaving} className="min-h-[90px] rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-200 outline-none disabled:opacity-80" />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-[11px] font-black text-slate-500">原始漏洞报告（Markdown）</span>
                      <textarea value={editableDetail?.raw_report_markdown || ''} onChange={(event) => setEditableDetail((prev) => (prev ? { ...prev, raw_report_markdown: event.target.value } : prev))} disabled={!detailEditMode || detailSaving} className="min-h-[180px] rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-200 outline-none disabled:opacity-80" />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-[11px] font-black text-slate-500">文件清单（artifacts，JSON 数组）</span>
                      <textarea value={editableDetail?.artifacts_text || '[]'} onChange={(event) => setEditableDetail((prev) => (prev ? { ...prev, artifacts_text: event.target.value } : prev))} disabled={!detailEditMode || detailSaving} className="min-h-[120px] rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-200 outline-none disabled:opacity-80" />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-[11px] font-black text-slate-500">扩展元数据（metadata，JSON 对象）</span>
                      <textarea value={editableDetail?.metadata_text || '{}'} onChange={(event) => setEditableDetail((prev) => (prev ? { ...prev, metadata_text: event.target.value } : prev))} disabled={!detailEditMode || detailSaving} className="min-h-[120px] rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-200 outline-none disabled:opacity-80" />
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
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700"
                    >
                      <Copy size={13} />
                      复制
                    </button>
                  }
                >
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-900">
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
    <div className="animate-in fade-in space-y-5 p-6 pb-16 duration-500 xl:p-8 xl:pb-20">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-900 xl:text-3xl">疑点上报中心</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setShowSdkDialog(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm"
          >
            <BookOpen size={16} />
            SDK / 上报方式
          </button>
          <button
            type="button"
            onClick={() => setShowCreateDialog(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-slate-900/10"
          >
            <Plus size={16} />
            手动创建疑点
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50 px-6 py-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 px-6 py-4 text-sm text-emerald-700">
          {successMessage}
        </div>
      )}

      {!selectedSuspicionId && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setRootTab('cases')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black ${
              rootTab === 'cases' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'
            }`}
          >
            <ShieldAlert size={14} />
            疑点列表
          </button>
          <button
            type="button"
            onClick={() => setRootTab('download-center')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black ${
              rootTab === 'download-center' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'
            }`}
          >
            <Download size={14} />
            下载中心
          </button>
        </div>
      )}

      {!selectedSuspicionId ? (
        rootTab === 'download-center' ? renderDownloadCenter() : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">疑点总数</div>
              <div className="mt-2 text-3xl font-black text-slate-900">{stats.total}</div>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">高风险疑点</div>
              <div className="mt-2 text-3xl font-black text-rose-600">{stats.highRisk}</div>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">待验证</div>
              <div className="mt-2 text-3xl font-black text-amber-600">{stats.pendingAnalyze}</div>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">认证接入上报</div>
              <div className="mt-2 text-3xl font-black text-blue-600">{stats.authenticated}</div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4 xl:px-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">疑点列表</div>
                  <h3 className="mt-1 text-xl font-black text-slate-900">待纳管疑点池</h3>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-xl bg-slate-100 px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                    {suspicions.length} / {totalFiltered}
                  </div>
                  <div className="rounded-xl bg-emerald-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
                    第 {normalizedPage}/{totalPages} 页
                  </div>
                  <div className="rounded-xl bg-blue-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-blue-700">
                    已选 {selectedSuspicionIds.length}
                  </div>
                  <button
                    type="button"
                    onClick={handleDeleteSelectedFromList}
                    disabled={selectedSuspicionIds.length === 0 || bulkDeleting}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                    {bulkDeleting ? '删除中...' : `删除选中 (${selectedSuspicionIds.length})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCreateDownloadJob(selectedSuspicionIds, 'batch')}
                    disabled={selectedSuspicionIds.length === 0 || creatingDownload}
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 disabled:opacity-50"
                  >
                    <Download size={14} />
                    {creatingDownload ? '创建中...' : `打包下载 (${selectedSuspicionIds.length})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadSuspicions()}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700"
                  >
                    <Send size={14} />
                    刷新
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-4 px-5 py-4 xl:px-6">
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_auto_auto_auto_auto]">
                <div className="relative min-w-0">
                  <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="搜索标题、摘要、资产定位、来源服务"
                    className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm outline-none"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(STAGE_LABELS).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setStageFilter(key)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] ${
                        stageFilter === key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <Filter size={12} />
                      {label}
                    </button>
                  ))}
                </div>
                <select
                  value={severityFilter}
                  onChange={(event) => setSeverityFilter(event.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none"
                >
                  <option value="all">全部等级</option>
                  <option value="critical">critical</option>
                  <option value="high">high</option>
                  <option value="medium">medium</option>
                  <option value="low">low</option>
                </select>
                <select
                  value={reporterTypeFilter}
                  onChange={(event) => setReporterTypeFilter(event.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none"
                >
                  <option value="all">全部来源方式</option>
                  <option value="plugin">plugin</option>
                  <option value="service">service</option>
                  <option value="cli">cli</option>
                  <option value="skill">skill</option>
                  <option value="api">api</option>
                  <option value="human">human</option>
                  <option value="other">other</option>
                </select>
                <select
                  value={cvssBandFilter}
                  onChange={(event) => setCvssBandFilter(event.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none"
                >
                  <option value="all">全部 CVSS 档位</option>
                  <option value="critical">critical (9.0-10.0)</option>
                  <option value="high">high (7.0-8.9)</option>
                  <option value="medium">medium (4.0-6.9)</option>
                  <option value="low">low (0.1-3.9)</option>
                </select>
              </div>

              <div className="overflow-hidden rounded-[1.25rem] border border-slate-200">
                  <div className="grid grid-cols-[0.45fr_2.1fr_0.6fr_1.2fr_0.8fr_0.8fr_1fr_1.5fr_0.9fr_1.1fr_0.7fr_0.9fr] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                  <div className="flex items-center justify-center">
                    <input
                      type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAllVisible}
                      aria-label="全选当前页"
                      className="h-4 w-4 cursor-pointer rounded border-slate-300"
                    />
                  </div>
                  {renderSortHeader('标题 / 摘要', 'title')}
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">文件</div>
                  {renderSortHeader('阶段 / 状态', 'current_stage')}
                  {renderSortHeader('等级', 'severity')}
                  {renderSortHeader('CVSS', 'cvss_score')}
                  {renderSortHeader('上报者', 'reporter')}
                  {renderSortHeader('对象', 'subject')}
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">来源方式</div>
                  {renderSortHeader('更新时间', 'updated_at')}
                  {renderSortHeader('置信度', 'confidence')}
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">操作</div>
                </div>
                {loading ? (
                  <div className="bg-slate-50 px-4 py-8 text-sm text-slate-400">正在加载疑点列表...</div>
                ) : pagedSuspicions.length === 0 ? (
                  <div className="bg-slate-50 px-4 py-8 text-sm text-slate-400">当前筛选条件下没有疑点。</div>
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
                      className="grid cursor-pointer grid-cols-[0.45fr_2.1fr_0.6fr_1.2fr_0.8fr_0.8fr_1fr_1.5fr_0.9fr_1.1fr_0.7fr_0.9fr] gap-3 border-b border-slate-100 bg-white px-4 py-3.5 text-left transition hover:bg-slate-50 last:border-b-0"
                    >
                      <div className="flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={selectedSuspicionIds.includes(item.id)}
                          onChange={() => toggleSuspicionSelection(item.id)}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={`选择疑点 ${item.title}`}
                          className="h-4 w-4 cursor-pointer rounded border-slate-300"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-black text-slate-900">{item.title}</div>
                        <div className="mt-1 font-mono text-[11px] text-slate-400">{item.id}</div>
                        <div className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-500">{item.summary || '暂无摘要'}</div>
                      </div>
                      <div className="flex items-start justify-center">
                        {item.has_artifact_files || hasArtifactFiles(item.artifacts) ? (
                          <span title="含文件/文件夹" className="inline-flex items-center justify-center rounded-md bg-emerald-100 p-1 text-emerald-700">
                            <FolderOpen size={14} />
                          </span>
                        ) : (
                          <span title="无文件" className="inline-flex items-center justify-center rounded-md bg-slate-100 p-1 text-slate-400">
                            <FolderOpen size={14} />
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-black text-slate-700">{toStageText(item.current_stage)}</div>
                        <div className="mt-1 inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-600">
                          {toStatusText(item.current_status)}
                        </div>
                        {item.finished_reason ? (
                          <div className="mt-1 text-[10px] font-semibold text-slate-500">
                            结论: {item.finished_reason}
                          </div>
                        ) : item.decision_status ? (
                          <div className="mt-1 text-[10px] font-semibold text-slate-500">
                            结论: {item.decision_status}
                          </div>
                        ) : null}
                      </div>
                      <div>
                        <span className={`rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${toneOf(item.severity)}`}>
                          {item.severity}
                        </span>
                      </div>
                      <div className="text-sm font-black text-slate-800">{Number(item.cvss_score || 0).toFixed(1)}</div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-800">{item.reporter?.name || 'unknown'}</div>
                        <div className="mt-0.5 text-xs text-slate-400">{item.reporter?.version || 'n/a'}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-800">{item.subject?.locator || 'unscoped asset'}</div>
                        <div className="mt-0.5 text-xs text-slate-400">{item.subject?.type || 'generic'}</div>
                      </div>
                      <div className="text-sm font-semibold text-slate-700">{item.reporter?.type || 'other'}</div>
                      <div className="text-sm text-slate-500">{formatTime(item.updated_at || item.created_at)}</div>
                      <div className="text-right text-xl font-black text-slate-900">{item.confidence}</div>
                      <div>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleCreateDownloadJob([item.id], 'single');
                            }}
                            disabled={creatingDownload}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-black text-emerald-700 disabled:opacity-50"
                          >
                            <Download size={12} />
                            下载
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteSingleFromList(item.id, item.title);
                            }}
                            disabled={bulkDeleting || rowDeletingId === item.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-black text-rose-700 disabled:opacity-50"
                          >
                            <Trash2 size={12} />
                            {rowDeletingId === item.id ? '删除中' : '删除'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="text-xs font-semibold text-slate-600">
                  当前显示 {totalFiltered === 0 ? 0 : pageStart + 1} - {Math.min(pageStart + pageSize, totalFiltered)} / {totalFiltered}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs font-semibold text-slate-600">
                    每页
                    <select
                      value={pageSize}
                      onChange={(event) => {
                        const value = Math.min(1000, Math.max(10, Number(event.target.value) || 20));
                        setPageSize(value);
                      }}
                      className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold outline-none"
                    >
                      {[20, 50, 100, 200, 500, 1000].map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(1)}
                    disabled={normalizedPage <= 1}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 disabled:opacity-50"
                  >
                    首页
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={normalizedPage <= 1}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 disabled:opacity-50"
                  >
                    上一页
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={normalizedPage >= totalPages}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 disabled:opacity-50"
                  >
                    下一页
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={normalizedPage >= totalPages}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 disabled:opacity-50"
                  >
                    末页
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
        )
      ) : (
        renderDetailView()
      )}

      {showSdkDialog && (
        <DialogShell
          title="SDK 下载与认证上报方式"
          onClose={() => setShowSdkDialog(false)}
        >
          <div className="space-y-8">
            <div className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-4">
              {(catalog?.items || []).map((item: any) => (
                <div key={item.kind} className="rounded-[1.75rem] border border-slate-200 bg-[rgba(255,255,255,0.04)] p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                        {METHOD_ICONS[item.kind as PublicKind]}
                      </div>
                      <div>
                        <div className="text-sm font-black text-slate-900">{item.title}</div>
                        <div className="mt-1 text-[11px] font-bold uppercase tracking-widest text-emerald-600">需要认证</div>
                      </div>
                    </div>
                    <a
                      href={item.download_url}
                      className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-xs font-black text-white"
                    >
                      <Download size={14} />
                      下载
                    </a>
                  </div>
                  <p className="mt-4 min-h-[66px] text-sm leading-6 text-slate-600">{item.description}</p>
                  <div className="mt-4 space-y-2 text-xs text-slate-500">
                    <div><span className="font-black text-slate-700">版本</span> {catalog?.version || '1.0.0'}</div>
                    <div><span className="font-black text-slate-700">文件</span> {item.filename}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedExample(item.kind)}
                    className="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700"
                  >
                    查看示例
                  </button>
                </div>
              ))}
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">公共字段</div>
                <div className="mt-4 overflow-hidden rounded-[1.5rem] border border-slate-200">
                  <div className="grid grid-cols-[1.3fr_0.7fr_2.5fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                    <div>字段</div>
                    <div>是否必填</div>
                    <div>说明</div>
                  </div>
                  {PUBLIC_FIELDS.map((item) => (
                    <div key={item.name} className="grid grid-cols-[1.3fr_0.7fr_2.5fr] gap-4 border-b border-slate-100 px-5 py-4 text-sm last:border-b-0">
                      <div className="font-mono font-bold text-slate-800">{item.name}</div>
                      <div>
                        <span className={`rounded-xl px-2 py-1 text-[10px] font-black uppercase tracking-widest ${item.required ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                          {item.required ? '必填' : '可选'}
                        </span>
                      </div>
                      <div className="leading-6 text-slate-600">{item.description}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">自定义元数据</div>
                  <div className="mt-4 space-y-3">
                    {METADATA_GUIDE.map((item) => (
                      <div key={item.key} className="rounded-[1.25rem] border border-slate-200 bg-[rgba(255,255,255,0.04)] px-4 py-4">
                        <div className="font-mono text-xs font-black text-slate-800">{item.key}</div>
                        <div className="mt-2 text-sm leading-6 text-slate-600">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">文件与文件夹上报</div>
                  <div className="mt-4 space-y-3">
                    {ARTIFACT_GUIDE.map((item) => (
                      <div key={item.title} className="rounded-[1.25rem] border border-slate-200 bg-[rgba(255,255,255,0.04)] px-4 py-4">
                        <div className="text-sm font-black text-slate-800">{item.title}</div>
                        <div className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 rounded-[1.25rem] border border-dashed border-slate-300 bg-white px-4 py-4 text-sm leading-6 text-slate-600">
                    目录结构请使用 <span className="font-mono font-bold text-slate-800">artifacts[].children</span> 递归表达；
                    外部文件、压缩包、大文件或已有上传对象请放在 <span className="font-mono font-bold text-slate-800">content_ref</span>；
                    文本、JSON、二进制小文件可直接通过 <span className="font-mono font-bold text-slate-800">content</span> 内联传递。
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
              <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                  {(['cli', 'plugin', 'skill', 'openapi'] as PublicKind[]).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setSelectedExample(kind)}
                      className={`rounded-2xl px-4 py-2 text-xs font-black uppercase tracking-widest ${
                        selectedExample === kind ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {kind}
                    </button>
                  ))}
                </div>
                <div className="mt-5 rounded-[1.5rem] bg-slate-950 p-5 text-xs leading-6 text-slate-200">
                  <pre className="overflow-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(selectedExamplePayload || {}, null, 2)}
                  </pre>
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6 shadow-sm">
                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">认证正式上报</div>
                <div className="mt-3 text-lg font-black text-slate-900">公开 API 说明</div>
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Key size={14} className="text-blue-600" />
                      <span className="font-black text-slate-900">当前项目 Token</span>
                    </div>
                    <button
                      type="button"
                      onClick={refreshProjectToken}
                      disabled={tokenLoading || !projectId}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-black text-slate-700 disabled:opacity-50"
                    >
                      {tokenLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      刷新
                    </button>
                  </div>
                  <div className="mt-3 rounded-xl bg-slate-900 p-3 pr-12 font-mono text-[11px] leading-5 text-blue-200 break-all min-h-[68px] relative">
                    {tokenLoading && !projectToken ? '正在加载项目 Token...' : (projectToken?.token || '当前 Token 不可用')}
                    {!!projectToken?.token && (
                      <button
                        type="button"
                        onClick={copyProjectToken}
                        className="absolute right-2 top-2 rounded-lg bg-white/10 p-2 text-white hover:bg-white/20"
                      >
                        {tokenCopied ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                    <span>标识: <span className="font-black text-slate-700">{projectToken?.machine_code || `project-sdk:${projectId || 'n/a'}`}</span></span>
                    <span>作用域: <span className="font-black text-slate-700">{projectToken?.token_scope || 'project'}</span></span>
                    <span>过期: <span className="font-black text-slate-700">{projectToken?.expires_at ? String(projectToken.expires_at).replace('T', ' ') : '永不过期'}</span></span>
                  </div>
                  {tokenError ? <div className="mt-2 text-[11px] font-black text-rose-600">{tokenError}</div> : null}
                </div>
                <div className="mt-4 rounded-2xl bg-white p-4 text-xs text-slate-600">
                  <div className="font-black text-slate-900">POST {API_BASE}/api/vuln/public/intake/submissions</div>
                  <ul className="mt-3 space-y-2">
                    <li><span className="font-black text-slate-800">必填</span> `project_id`、`title`、`severity`、`cvss_score`、`confidence`、`reporter`、`subject`</li>
                    <li><span className="font-black text-slate-800">定位</span> `project_id` 标识目标项目，并执行项目级权限校验</li>
                    <li><span className="font-black text-slate-800">认证</span> 请求必须携带 Bearer Token（复用 auth 微服务登录态）</li>
                    <li><span className="font-black text-slate-800">限制</span> 不支持匿名上报</li>
                    <li><span className="font-black text-slate-800">行为</span> 后端会自动记为 `created_by_type=human`，`created_by` 取认证身份</li>
                    <li><span className="font-black text-slate-800">关联</span> 请在 `reporter.name`、`reporter.version` 中明确上报者身份，便于后续验证复现回调</li>
                    <li><span className="font-black text-slate-800">文件</span> 简易上报可不传 `artifacts`；正常上报建议通过 `artifacts` 传递文件和目录结构</li>
                  </ul>
                </div>
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
                  <div className="text-xs font-black uppercase tracking-widest text-slate-500">推荐上报流程</div>
                  <ol className="mt-3 list-decimal space-y-2 pl-5">
                    <li>先获取项目级认证 Token（auth 微服务登录态）。</li>
                    <li>选择模式：简易上报（不带文件）或正常上报（带文件/目录）。</li>
                    <li>组装 payload 并调用认证接口，后续可按返回疑点 ID 继续补充资料。</li>
                  </ol>
                </div>
                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-xs font-black uppercase tracking-widest text-slate-500">示例模式</div>
                    <button
                      type="button"
                      onClick={() => applyAuthExampleMode('simple')}
                      className={`rounded-xl px-3 py-1.5 text-[11px] font-black ${authExampleMode === 'simple' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
                    >
                      简易上报（不带文件）
                    </button>
                    <button
                      type="button"
                      onClick={() => applyAuthExampleMode('normal')}
                      className={`rounded-xl px-3 py-1.5 text-[11px] font-black ${authExampleMode === 'normal' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
                    >
                      正常上报（带文件）
                    </button>
                  </div>
                  <pre className="mt-3 overflow-auto whitespace-pre-wrap text-[11px] leading-6 text-slate-700">{`curl -X POST "${API_BASE}/api/vuln/public/intake/submissions" \\
  -H 'Authorization: Bearer <token>' \\
  -H 'Content-Type: application/json' \\
  --data @${authExampleMode === 'simple' ? 'payload-simple.json' : 'payload-with-files.json'}`}</pre>
                </div>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">认证联调</div>
                  <div className="mt-2 text-xl font-black text-slate-900">测试认证正式上报</div>
                </div>
                {authResult && (
                  <div className="rounded-2xl bg-emerald-50 px-4 py-2 text-xs font-black text-emerald-700">
                    已创建疑点 {authResult.id}
                  </div>
                )}
              </div>
              <textarea
                value={authPayloadText}
                onChange={(event) => setAuthPayloadText(event.target.value)}
                className="mt-5 h-72 w-full rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 font-mono text-xs leading-6 text-slate-900 outline-none"
              />
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleAuthenticatedSubmit}
                  disabled={authSubmitting}
                  className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
                >
                  {authSubmitting ? '提交中...' : '测试认证正式上报'}
                </button>
                <a
                  href={vulnApi.vuln.getPublicOpenApiSpecUrl()}
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700"
                >
                  获取 OpenAPI 模板
                </a>
              </div>
            </div>
          </div>
        </DialogShell>
      )}

      {showCreateDialog && (
        <DialogShell
          title="手动创建疑点"
          onClose={() => setShowCreateDialog(false)}
        >
          <form onSubmit={handleCreateSuspicion} className="grid gap-4">
            <input
              value={suspicionForm.title}
              onChange={(event) => setSuspicionForm({ ...suspicionForm, title: event.target.value })}
              placeholder="疑点标题"
              className="rounded-2xl border border-slate-200 px-4 py-3 outline-none"
              required
            />
            <textarea
              value={suspicionForm.summary}
              onChange={(event) => setSuspicionForm({ ...suspicionForm, summary: event.target.value })}
              placeholder="疑点摘要"
              className="min-h-[8rem] rounded-2xl border border-slate-200 px-4 py-3 outline-none"
            />
            <textarea
              value={suspicionForm.raw_report_markdown}
              onChange={(event) => setSuspicionForm({ ...suspicionForm, raw_report_markdown: event.target.value })}
              placeholder="原始漏洞报告 Markdown"
              className="min-h-[10rem] rounded-2xl border border-slate-200 px-4 py-3 font-mono text-xs outline-none"
            />
            <div className="grid gap-4 md:grid-cols-2">
                <select
                  value={suspicionForm.severity}
                  onChange={(event) => setSuspicionForm({ ...suspicionForm, severity: event.target.value })}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none"
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
                  className="rounded-2xl border border-slate-200 px-4 py-3 outline-none"
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
                className="rounded-2xl border border-slate-200 px-4 py-3 outline-none"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <input
                value={suspicionForm.source_service}
                onChange={(event) => setSuspicionForm({ ...suspicionForm, source_service: event.target.value })}
                placeholder="来源服务"
                className="rounded-2xl border border-slate-200 px-4 py-3 outline-none"
              />
              <input
                value={suspicionForm.asset_type}
                onChange={(event) => setSuspicionForm({ ...suspicionForm, asset_type: event.target.value })}
                placeholder="资产类型"
                className="rounded-2xl border border-slate-200 px-4 py-3 outline-none"
              />
            </div>
            <input
              value={suspicionForm.asset_locator}
              onChange={(event) => setSuspicionForm({ ...suspicionForm, asset_locator: event.target.value })}
              placeholder="资产定位"
              className="rounded-2xl border border-slate-200 px-4 py-3 outline-none"
            />
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="submit"
                disabled={creating}
                className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
              >
                {creating ? '创建中...' : '创建疑点'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateDialog(false)}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700"
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
