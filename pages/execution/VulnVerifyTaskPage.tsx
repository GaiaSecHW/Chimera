import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, Eye, FileText, Loader2, Plus, RefreshCw, RotateCcw, Search, ShieldCheck, Square, X, XCircle } from 'lucide-react';
import { API_BASE, getHeaders, handleResponse } from '../../clients/base';
import { vulnVerifyApi, VulnVerifyArtifact, VulnVerifyProjectStats, VulnVerifyReportData, VulnVerifyResult, VulnVerifyTask, VulnVerifyTaskDetail } from '../../clients/vulnVerify';
import { vulnApi } from '../../clients/vuln';
import { ExecutionTable, ExecutionTableHead, ExecutionTableTh, ExecutionTableTd, executionTableInteractiveRowClassName } from '../../components/execution/ExecutionTable';
import { ServicePageTitle, useServiceBuildVersion } from '../../components/execution/ServiceBuildVersion';
import { VulnVerifyReportView } from './VulnVerifyReportView';
import { PageHeader } from '../../design-system';
import { useUiFeedback } from '../../components/UiFeedback';

const LK = {
  primary: '#4f73ff', primarySoft: '#7590ff', primaryDeep: '#3f63f1',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: '#070d18', surface: '#111a2b', surfaceRaised: '#18233a',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: '#26324a', borderSoft: '#1b2438',
  ink: '#f5f7ff', inkSoft: '#d6def0', body: '#a4aec4',
  muted: '#72809a', mutedSoft: '#8b95a8',
  success: '#45c06f', warning: '#d5a13a', error: '#f15d5d', info: '#4f8cff',
  critical: '#ff4d4f', high: '#ff8b3d', medium: '#f0b64c', low: '#49c5ff',
} as const;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

const DEFAULT_MODEL_HINT = '留空则继承参数配置中的默认模型';
const ACTIVE_STATUSES = new Set(['pending', 'running', 'cancelling']);
const TERMINAL_STATUSES = new Set(['success', 'failed', 'cancelled']);
const VERIFY_OPEN_TASK_ID_KEY = 'chimera-vuln-verify-open-task-id';
const VERIFY_OPEN_PROJECT_ID_KEY = 'chimera-vuln-verify-open-project-id';
const BATCH_CREATE_CONCURRENCY = 3;
const PENDING_CASE_LOAD_LIMIT = 500;
const MAX_BATCH_CREATE = 500;

const STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  running: '执行中',
  success: '成功',
  failed: '失败',
  cancelled: '已取消',
  cancelling: '取消中',
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  pending: 'bg-theme-elevated text-theme-text-secondary border-theme-border',
  running: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  failed: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
  cancelled: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  cancelling: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
};

const QUICK_STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: '全部' },
  { value: 'pending', label: '等待中' },
  { value: 'running', label: '执行中' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' },
  { value: 'cancelled', label: '已取消' },
];

const RESULT_VERDICT_LABEL: Record<string, string> = {
  confirmed: '已确认漏洞',
  ruled_out: '已排除漏洞',
  unresolved: '待进一步确认',
};

interface CreateFormState {
  name: string;
  description: string;
  reports_dir: string;
  source_root: string;
  binary_root: string;
  threat_path: string;
  model: string;
  concurrency: number;
}

interface PendingVerifyCase {
  id: string;
  global_vuln_id?: string | null;
  title?: string | null;
  severity?: string | null;
  subject?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  current_stage: string;
  current_status?: string | null;
  updated_at?: string | null;
}

interface BatchCreateResultItem {
  ok: boolean;
  caseId: string;
  title?: string | null;
  taskId?: string;
  sourceRoot?: string;
  error?: string;
}

interface BatchCreateResult {
  total: number;
  success: number;
  failed: number;
  items: BatchCreateResultItem[];
}

function makeDefaultForm(projectId: string): CreateFormState {
  return {
    name:`漏洞验证任务-${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    description: '',
    reports_dir:`/data/files/${projectId}/vuln-verify/reports`,
    source_root:`/data/files/${projectId}/source`,
    binary_root:`/data/files/${projectId}/binary`,
    threat_path:`/data/files/${projectId}/vuln-verify/threat_model.md`,
    model: '',
    concurrency: 1,
  };
}

function formatDate(value?: string | null): string {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleString('zh-CN') : value;
}

function formatBytes(value?: number): string {
  const n = Number(value || 0);
  if (n < 1024) return`${n} B`;
  if (n < 1024 * 1024) return`${(n / 1024).toFixed(1)} KB`;
  return`${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(startedAt?: string | null, finishedAt?: string | null): string {
  if (!startedAt) return '-';
  const started = new Date(startedAt).getTime();
  const finished = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) return '-';
  const secs = Math.floor((finished - started) / 1000);
  if (secs < 60) return`${secs}s`;
  const mins = Math.floor(secs / 60);
  const rest = secs % 60;
  if (mins < 60) return`${mins}m${rest}s`;
  const hours = Math.floor(mins / 60);
  return`${hours}h${mins % 60}m`;
}

function getStatusLabel(status?: string): string {
  return STATUS_LABEL[status || ''] || status || '-';
}

function getStatusClass(status?: string): string {
  return STATUS_BADGE_CLASS[status || ''] || 'bg-theme-elevated text-theme-text-secondary border-theme-border';
}

function getProgressText(task: VulnVerifyTask): string {
  const progress = task.progress || {};
  const message = String(progress.message || progress.stage || '').trim();
  if (message) return message;
  if (task.error_reason) return task.error_reason;
  const groupCount = task.result_summary?.group_count;
  const doneGroupCount = task.result_summary?.done_group_count;
  if (groupCount != null || doneGroupCount != null) return`分组 ${doneGroupCount ?? 0}/${groupCount ?? 0}`;
  return task.output_dir || '-';
}

function getCaseDisplayName(item: PendingVerifyCase): string {
  return item.title || item.global_vuln_id || item.id;
}

function getCaseSubjectLocator(item: PendingVerifyCase): string {
  const subject = item.subject || {};
  return String(subject.locator || subject.path || subject.id || subject.name || '').trim() || '未指定对象定位';
}

function getCaseSubjectName(item: PendingVerifyCase): string {
  return String(item.subject?.name || '').trim();
}

function getCaseSubjectType(item: PendingVerifyCase): string {
  return String(item.subject?.type || 'generic');
}

function getCaseSearchText(item: PendingVerifyCase): string {
  const subject = item.subject || {};
  return [
    item.id,
    item.global_vuln_id,
    item.title,
    item.severity,
    item.current_stage,
    item.current_status,
    subject.locator,
    subject.path,
    subject.id,
    subject.name,
    subject.type,
    getCaseSubjectLocator(item),
    getCaseSubjectName(item),
    getCaseSubjectType(item),
  ].filter(Boolean).join(' ').toLowerCase();
}

function getBatchTaskName(item: PendingVerifyCase): string {
  const suffix = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  return `批量验证-${item.global_vuln_id || item.id}-${suffix}`;
}

function firstNonEmptyString(...values: any[]): string | null {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return null;
}

function resolveCaseSourceRoot(item: PendingVerifyCase): string | null {
  const metadata = item.metadata || {};
  return firstNonEmptyString(
    metadata.verification_context?.source_root,
    metadata.source?.source_root,
    metadata.dataflow_vuln_scan?.source_root,
  );
}

function getFilterChipClassName(active: boolean): string {
  return active
 ? 'border-violet-300 bg-violet-500/15 text-violet-400 '
    : 'border-theme-border bg-theme-elevated text-theme-text-secondary hover:border-theme-border hover:bg-theme-elevated';
}

function getTaskVerdictCounts(task: VulnVerifyTask): { confirmed: number; ruledOut: number; unresolved: number } {
  const summary = task.result_summary || {};
  const verdicts = (summary.verdicts as Record<string, number> | undefined) || {};
  return {
    confirmed: Number(summary.confirmed_count ?? verdicts.confirmed ?? 0),
    ruledOut: Number(summary.ruled_out_count ?? verdicts.ruled_out ?? 0),
    unresolved: Number(summary.unresolved_count ?? verdicts.unresolved ?? 0),
  };
}

const SummaryCard: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; accent?: 'violet' | 'blue' | 'emerald' | 'rose' | 'amber' | 'slate' }> = ({ label, value, hint, accent = 'slate' }) => {
  const accentClass = accent === 'violet'
    ? 'text-violet-400'
    : accent === 'blue'
      ? 'text-blue-400'
      : accent === 'emerald'
        ? 'text-emerald-400'
        : accent === 'rose'
          ? 'text-rose-400'
          : accent === 'amber'
            ? 'text-amber-400'
            : 'text-theme-text-primary';
  return (
 <div className="rounded-2xl border border-theme-border bg-theme-surface p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${accentClass}`}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-theme-text-muted">{hint}</div> : null}
    </div>
  );
};

const StatusBadge: React.FC<{ status?: string }> = ({ status }) => (
  <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusClass(status)}`}>
    {status === 'running' || status === 'cancelling' ? <Loader2 size={12} className="mr-1 animate-spin" /> : null}
    {getStatusLabel(status)}
  </span>
);

const InfoRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-2xl bg-theme-surface p-3">
    <div className="text-[10px] font-semibold uppercase tracking-widest text-theme-text-muted">{label}</div>
    <div className="mt-1 break-all text-xs font-bold text-theme-text-secondary">{value || '-'}</div>
  </div>
);

export const VulnVerifyTaskPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const buildVersion = useServiceBuildVersion(vulnVerifyApi.getHealth);
  const [tasks, setTasks] = useState<VulnVerifyTask[]>([]);
  const [total, setTotal] = useState(0);
  const [projectStats, setProjectStats] = useState<VulnVerifyProjectStats | null>(null);
  const [health, setHealth] = useState('unknown');
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { confirm, feedbackNodes } = useUiFeedback();

  const [statusFilter, setStatusFilter] = useState('');
  const [resultVerdictFilter, setResultVerdictFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [refreshIntervalSec, setRefreshIntervalSec] = useState(15);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CreateFormState>(() => makeDefaultForm(projectId));

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [detail, setDetail] = useState<VulnVerifyTaskDetail | null>(null);
  const [result, setResult] = useState<VulnVerifyResult | null>(null);
  const [artifacts, setArtifacts] = useState<VulnVerifyArtifact[]>([]);
  const [reportData, setReportData] = useState<VulnVerifyReportData | null>(null);
  const [reportDataError, setReportDataError] = useState<string | null>(null);
  const [artifactContent, setArtifactContent] = useState<{ path: string; content: string; truncated: boolean } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pendingOpenTaskId, setPendingOpenTaskId] = useState<string | null>(null);
  const [pendingOpenAttempted, setPendingOpenAttempted] = useState(false);

  const [batchPanelOpen, setBatchPanelOpen] = useState(false);
  const [pendingCases, setPendingCases] = useState<PendingVerifyCase[]>([]);
  const [pendingCasesTotal, setPendingCasesTotal] = useState(0);
  const [pendingCasesLoading, setPendingCasesLoading] = useState(false);
  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<string>>(() => new Set());
  const [batchObjectFilter, setBatchObjectFilter] = useState('');
  const [batchCreating, setBatchCreating] = useState(false);
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchCreateResult | null>(null);

  const offset = (page - 1) * perPage;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const hasActiveTasks = tasks.some((task) => ACTIVE_STATUSES.has(task.status));
  const hasFilters = Boolean(statusFilter || resultVerdictFilter || search.trim());

  const summary = useMemo(() => {
    const counts = tasks.reduce<Record<string, number>>((acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    }, {});
    return {
      running: counts.running || 0,
      pending: counts.pending || 0,
      success: counts.success || 0,
      failed: counts.failed || 0,
    };
  }, [tasks]);

  const filteredPendingCases = useMemo(() => {
    const keyword = batchObjectFilter.trim().toLowerCase();
    if (!keyword) return pendingCases;
    return pendingCases.filter((item) => getCaseSearchText(item).includes(keyword));
  }, [pendingCases, batchObjectFilter]);

  const selectedPendingCases = useMemo(() => (
    pendingCases.filter((item) => selectedCaseIds.has(item.id) && ['receive', 'triage'].includes(item.current_stage))
  ), [pendingCases, selectedCaseIds]);

  const loadProjectStats = useCallback(async () => {
    if (!projectId) return;
    setStatsLoading(true);
    try {
      const stats = await vulnVerifyApi.getProjectStats(projectId);
      setProjectStats(stats);
      setMessage(null);
    } catch (error: any) {
      setProjectStats(null);
      setMessage(error?.message || String(error));
    } finally {
      setStatsLoading(false);
    }
  }, [projectId]);

  const loadTasks = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [healthPayload, list] = await Promise.all([
        vulnVerifyApi.getHealth().catch(() => ({ status: 'unhealthy' })),
        vulnVerifyApi.listTasks(projectId, {
          status: statusFilter || undefined,
          search: search.trim() || undefined,
          resultVerdict: resultVerdictFilter || undefined,
          limit: perPage,
          offset,
        }),
      ]);
      setHealth(healthPayload.status || 'unknown');
      setTasks(list.items || []);
      setTotal(list.total || 0);
      setMessage(null);
    } catch (error: any) {
      setMessage(error?.message || String(error));
    } finally {
      setLoading(false);
    }
  }, [projectId, statusFilter, resultVerdictFilter, search, perPage, offset]);

  const loadOverview = useCallback(async () => {
    await Promise.all([loadTasks(), loadProjectStats()]);
  }, [loadProjectStats, loadTasks]);

  const loadDetail = useCallback(async (taskId: string) => {
    if (!projectId || !taskId) return;
    setDetailLoading(true);
    try {
      const [nextDetail, nextResult, nextArtifacts, nextReportData] = await Promise.all([
        vulnVerifyApi.getTask(projectId, taskId),
        vulnVerifyApi.getResult(projectId, taskId).catch(() => null),
        vulnVerifyApi.listArtifacts(projectId, taskId).catch(() => ({ items: [] })),
        vulnVerifyApi.getReportData(projectId, taskId).then((payload) => ({ payload, error: null as string | null })).catch((error: any) => ({ payload: null, error: error?.message || String(error) })),
      ]);
      setDetail(nextDetail);
      setResult(nextResult);
      setArtifacts(nextArtifacts.items || []);
      setReportData(nextReportData.payload);
      setReportDataError(nextReportData.error);
      setArtifactContent(null);
    } catch (error: any) {
      setMessage(error?.message || String(error));
    } finally {
      setDetailLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void loadTasks(); }, [loadTasks]);
  useEffect(() => { void loadProjectStats(); }, [loadProjectStats]);

  useEffect(() => {
    if (!autoRefreshEnabled) return undefined;
    const intervalMs = Math.max(5, refreshIntervalSec) * 1000;
    const timer = window.setInterval(() => {
      void loadOverview();
      if (detailModalOpen && selectedTaskId) void loadDetail(selectedTaskId);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [autoRefreshEnabled, refreshIntervalSec, detailModalOpen, selectedTaskId, loadOverview, loadDetail]);

  useEffect(() => {
    setForm(makeDefaultForm(projectId));
    setPage(1);
    setProjectStats(null);
    setPendingCases([]);
    setPendingCasesTotal(0);
    setSelectedCaseIds(new Set());
    setBatchObjectFilter('');
    setBatchConfirmOpen(false);
    setBatchResult(null);
    setBatchPanelOpen(false);
  }, [projectId]);

  const openCreateModal = () => {
    setForm(makeDefaultForm(projectId));
    setCreateModalOpen(true);
  };

  const openDetailModal = useCallback(async (taskId: string) => {
    setSelectedTaskId(taskId);
    setReportData(null);
    setReportDataError(null);
    setDetailModalOpen(true);
    await loadDetail(taskId);
  }, [loadDetail]);

  const fetchPendingVerifyCases = useCallback(async () => {
    if (!projectId) return;
    setPendingCasesLoading(true);
    try {
      const buildUrl = (stage: string) => {
        const query = new URLSearchParams({
          project_id: projectId,
          current_stage: stage,
          page: '1',
          page_size: String(PENDING_CASE_LOAD_LIMIT),
        });
        return `${API_BASE}/api/vuln/cases?${query.toString()}`;
      };
      const [receiveResponse, triageResponse] = await Promise.all([
        fetch(buildUrl('receive'), { headers: getHeaders() }),
        fetch(buildUrl('triage'), { headers: getHeaders() }),
      ]);
      const [receivePayload, triagePayload] = await Promise.all([
        handleResponse(receiveResponse),
        handleResponse(triageResponse),
      ]);
      const receiveItems = (receivePayload?.items || []) as PendingVerifyCase[];
      const triageItems = (triagePayload?.items || []) as PendingVerifyCase[];
      const items = [...receiveItems, ...triageItems].slice(0, PENDING_CASE_LOAD_LIMIT);
      const totalCount = Number(receivePayload?.total || 0) + Number(triagePayload?.total || 0);
      setPendingCases(items);
      setPendingCasesTotal(totalCount);
      setSelectedCaseIds((prev) => {
        const next = new Set<string>();
        const availableIds = new Set(items.map((item) => item.id));
        prev.forEach((id) => { if (availableIds.has(id)) next.add(id); });
        return next;
      });
      setMessage(null);
    } catch (error: any) {
      setPendingCases([]);
      setPendingCasesTotal(0);
      setMessage(error?.message || String(error));
    } finally {
      setPendingCasesLoading(false);
    }
  }, [projectId]);

  const createCaseVerifyTask = useCallback(async (caseItem: PendingVerifyCase) => {
    const sourceRoot = resolveCaseSourceRoot(caseItem);
    if (!sourceRoot) throw new Error('缺少 source_root');
    const report = await vulnApi.getCaseReport(caseItem.id);
    const rawReport = String(report?.content || '').trim();
    if (!rawReport) throw new Error('缺少 raw_report');
    const task = await vulnVerifyApi.createTask(projectId, {
      name: getBatchTaskName(caseItem),
      source_root: sourceRoot,
      raw_report: rawReport,
    });
    // KISS 去重：创建任务后推进漏洞案例到 validation 阶段，
    // 下次筛选 receive/triage 时即不再出现该案例。
    const syncResp = await fetch(`${API_BASE}/api/vuln/cases/${encodeURIComponent(caseItem.id)}/auto-verify/sync`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ vuln_verify_task_id: task.id }),
    });
    try {
      await handleResponse(syncResp);
    } catch (e: any) {
      throw new Error(`验证任务已创建(${task.id})但阶段推进失败：${e?.message || String(e)}`);
    }
    return { task, sourceRoot };
  }, [projectId]);

  const openBatchPanel = () => {
    setBatchPanelOpen(true);
    setBatchResult(null);
    void fetchPendingVerifyCases();
  };

  const toggleSelectCase = (caseId: string) => {
    setSelectedCaseIds((prev) => {
      const next = new Set(prev);
      if (next.has(caseId)) next.delete(caseId);
      else next.add(caseId);
      return next;
    });
  };

  const toggleSelectAllPendingCases = () => {
    const visibleIds = filteredPendingCases.map((item) => item.id);
    setSelectedCaseIds((prev) => {
      const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const requestBatchCreateVerifyTasks = () => {
    if (!selectedPendingCases.length) {
      setMessage('请选择待验证漏洞。');
      return;
    }
    if (selectedPendingCases.length > MAX_BATCH_CREATE) {
      setMessage(`单次最多创建 ${MAX_BATCH_CREATE} 个验证任务，请减少选择数量。`);
      return;
    }
    setBatchConfirmOpen(true);
  };

  const handleBatchCreateVerifyTasks = async () => {
    if (!projectId || batchCreating) return;
    const validItems = selectedPendingCases;
    if (!validItems.length) {
      setBatchConfirmOpen(false);
      setMessage('请选择待验证漏洞。');
      return;
    }
    if (validItems.length > MAX_BATCH_CREATE) {
      setBatchConfirmOpen(false);
      setMessage(`单次最多创建 ${MAX_BATCH_CREATE} 个验证任务，请减少选择数量。`);
      return;
    }

    setBatchConfirmOpen(false);
    setBatchCreating(true);
    setBatchResult(null);
    setMessage(null);
    const results: BatchCreateResultItem[] = [];
    let cursor = 0;

    async function worker() {
      while (cursor < validItems.length) {
        const item = validItems[cursor++];
        try {
          const data = await createCaseVerifyTask(item);
          results.push({
            ok: true,
            caseId: item.id,
            title: item.title,
            taskId: String(data?.task?.id || ''),
            sourceRoot: data?.sourceRoot,
          });
        } catch (error: any) {
          results.push({
            ok: false,
            caseId: item.id,
            title: item.title,
            error: error?.message || String(error),
          });
        }
      }
    }

    try {
      await Promise.all(Array.from({ length: Math.min(BATCH_CREATE_CONCURRENCY, validItems.length) }, worker));
      const success = results.filter((item) => item.ok).length;
      const failed = results.length - success;
      setBatchResult({ total: results.length, success, failed, items: results });
      setSelectedCaseIds(new Set());
      await Promise.all([fetchPendingVerifyCases(), loadOverview()]);
      setPage(1);
      setMessage(`批量创建完成：成功 ${success} 个，失败 ${failed} 个。`);
    } finally {
      setBatchCreating(false);
    }
  };

  useEffect(() => {
    if (!projectId) return;
    const taskId = localStorage.getItem(VERIFY_OPEN_TASK_ID_KEY)?.trim();
    if (!taskId) return;
    const targetProjectId = localStorage.getItem(VERIFY_OPEN_PROJECT_ID_KEY)?.trim();
    if (targetProjectId && targetProjectId !== projectId) return;
    localStorage.removeItem(VERIFY_OPEN_TASK_ID_KEY);
    localStorage.removeItem(VERIFY_OPEN_PROJECT_ID_KEY);
    setPendingOpenTaskId(taskId);
    setPendingOpenAttempted(false);
  }, [projectId]);

  useEffect(() => {
    if (!pendingOpenTaskId || pendingOpenAttempted || !projectId) return;
    if (loading) return;
    const existsInCurrentList = tasks.some((task) => task.id === pendingOpenTaskId);
    if (!existsInCurrentList && tasks.length > 0) {
      setMessage('正在直接打开指定验证任务详情...');
    }
    setPendingOpenAttempted(true);
    void openDetailModal(pendingOpenTaskId).finally(() => setPendingOpenTaskId(null));
  }, [pendingOpenTaskId, pendingOpenAttempted, projectId, loading, tasks, openDetailModal]);

  const createTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectId) return;
    setCreating(true);
    setMessage(null);
    try {
      const created = await vulnVerifyApi.createTask(projectId, {
        name: form.name.trim() || '漏洞验证任务',
        description: form.description.trim() || undefined,
        reports_dir: form.reports_dir.trim(),
        source_root: form.source_root.trim(),
        binary_root: form.binary_root.trim() || undefined,
        threat_path: form.threat_path.trim() || undefined,
        model: form.model.trim() || undefined,
        concurrency: Number(form.concurrency || 1),
        resume: false,
      });
      setCreateModalOpen(false);
      setPage(1);
      await loadOverview();
      await openDetailModal(created.id);
      setMessage(`任务已创建: ${created.id}`);
    } catch (error: any) {
      setMessage(error?.message || String(error));
    } finally {
      setCreating(false);
    }
  };

  const terminateTask = async (taskId: string) => {
    if (!projectId || !taskId) return;
    const ok = await confirm({ message: '确认取消该漏洞验证任务？', danger: true });
    if (!ok) return;
    try {
      await vulnVerifyApi.terminateTask(projectId, taskId);
      await loadOverview();
      if (selectedTaskId === taskId) await loadDetail(taskId);
    } catch (error: any) {
      setMessage(error?.message || String(error));
    }
  };

  const rerunTask = async (taskId: string) => {
    if (!projectId || !taskId) return;
    const ok = await confirm({ message: '确认清空输出并重跑该任务？', danger: true });
    if (!ok) return;
    try {
      await vulnVerifyApi.rerunTask(projectId, taskId);
      await loadOverview();
      if (selectedTaskId === taskId) await loadDetail(taskId);
    } catch (error: any) {
      setMessage(error?.message || String(error));
    }
  };

  const openArtifact = async (path: string) => {
    if (!selectedTaskId || !projectId) return;
    const payload = await vulnVerifyApi.getArtifactContent(projectId, selectedTaskId, path);
    setArtifactContent({ path, content: payload.content, truncated: payload.truncated });
  };

  return (
    <div className="min-h-full bg-theme-bg-app p-6">
      <div className="w-full space-y-6">
        {feedbackNodes}
        <PageHeader
          title={<ServicePageTitle title="漏洞验证任务" version={buildVersion} className="" />}
          description="参考数据流漏洞挖掘的任务列表模式：集中查看任务状态，点击任务进入详情，使用右上角「新建任务」提交报告目录、源码、二进制与威胁模型。"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void loadOverview()}
                className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-4 py-2 text-sm font-semibold text-theme-text-secondary hover:bg-theme-elevated"
              >
                <RefreshCw size={16} className={loading || statsLoading ? 'animate-spin' : ''} /> 刷新
              </button>
              <button
                type="button"
                onClick={openBatchPanel}
 className="inline-flex items-center gap-2 rounded-xl border border-violet-500/25 bg-violet-500/15 px-4 py-2 text-sm font-semibold text-violet-400 hover:bg-violet-500/20"
              >
                <ShieldCheck size={16} /> 从待验证漏洞批量创建
              </button>
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800"
              >
                <Plus size={16} /> 新建任务
              </button>
            </div>
          }
        />

        {message ? (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/15 px-4 py-3 text-sm font-bold text-amber-400">
            {message}
          </div>
        ) : null}

        {batchPanelOpen ? (
          <section className="rounded-2xl border border-violet-500/20 bg-violet-500/10 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-theme-text-primary">从待验证漏洞批量创建验证任务</h2>
                <p className="mt-1 text-xs text-theme-text-muted">仅加载当前项目 receive / triage 阶段漏洞；每个漏洞创建一个 vuln-verify 任务，使用默认模型和默认威胁模型。</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void fetchPendingVerifyCases()}
                  disabled={pendingCasesLoading || batchCreating}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-theme-border bg-theme-elevated px-3 py-1.5 text-xs font-semibold text-theme-text-secondary disabled:opacity-50"
                >
                  <RefreshCw size={13} className={pendingCasesLoading ? 'animate-spin' : ''} />刷新待验证漏洞
                </button>
                <button
                  type="button"
                  onClick={requestBatchCreateVerifyTasks}
                  disabled={!selectedPendingCases.length || batchCreating || pendingCasesLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {batchCreating ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                  {batchCreating ? '创建中...' : '批量生成验证任务'}
                </button>
                <button type="button" onClick={() => setBatchPanelOpen(false)} className="rounded-lg p-1.5 text-theme-text-muted hover:bg-theme-elevated hover:text-theme-text-secondary"><X size={15} /></button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-theme-text-muted">
              <span>待验证漏洞：已加载 {pendingCases.length} / 总计 {pendingCasesTotal}</span>
              <span>当前筛选：{filteredPendingCases.length}</span>
              <span>已选择：{selectedCaseIds.size}</span>
              <span>单次最多：{MAX_BATCH_CREATE}</span>
              <span>创建并发：{BATCH_CREATE_CONCURRENCY}</span>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <div className="relative w-full max-w-md">
                <Search size={13} className="pointer-events-none absolute left-3 top-2.5 text-theme-text-muted" />
                <input
                  value={batchObjectFilter}
                  onChange={(event) => setBatchObjectFilter(event.target.value)}
                  placeholder="筛选对象定位，例如 openGauss"
                  className="w-full rounded-lg border border-theme-border bg-theme-elevated py-2 pl-9 pr-9 text-xs text-theme-text-secondary placeholder:text-theme-text-muted"
                />
                {batchObjectFilter ? (
                  <button type="button" onClick={() => setBatchObjectFilter('')} className="absolute right-2 top-1.5 rounded p-1 text-theme-text-muted hover:text-theme-text-secondary"><X size={13} /></button>
                ) : null}
              </div>
            </div>

            {batchResult ? (
              <div className="mt-4 rounded-2xl border border-theme-border bg-theme-surface p-4 text-sm">
                <div className="font-semibold text-theme-text-primary">批量创建结果：成功 {batchResult.success} 个，失败 {batchResult.failed} 个</div>
                {batchResult.failed ? (
                  <div className="mt-3 space-y-2 text-xs text-rose-400">
                    {batchResult.items.filter((item) => !item.ok).slice(0, 8).map((item) => (
                      <div key={item.caseId} className="rounded-xl bg-rose-500/10 p-2">
                        <span className="font-mono">{item.caseId}</span>：{item.error || '创建失败'}
                      </div>
                    ))}
                    {batchResult.failed > 8 ? <div className="text-theme-text-muted">还有 {batchResult.failed - 8} 条失败未展示。</div> : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-4 overflow-hidden rounded-2xl border border-theme-border bg-theme-surface">
              {pendingCasesLoading ? (
                <div className="flex items-center gap-2 p-8 text-sm text-theme-text-muted"><Loader2 size={14} className="animate-spin" />加载待验证漏洞...</div>
              ) : pendingCases.length === 0 ? (
                <div className="p-6 text-center text-sm text-theme-text-muted">当前项目暂无待验证漏洞。</div>
              ) : filteredPendingCases.length === 0 ? (
                <div className="p-6 text-center text-sm text-theme-text-muted">当前筛选条件下暂无待验证漏洞。</div>
              ) : (
                <div className="max-h-[360px] overflow-auto">
                  <table className="w-full min-w-[920px] text-left text-xs">
                    <thead className="sticky top-0 bg-theme-elevated text-theme-text-muted">
                      <tr className="border-b border-theme-border">
                        <th className="w-12 px-4 py-3">
                          <input
                            type="checkbox"
                            checked={filteredPendingCases.length > 0 && filteredPendingCases.every((item) => selectedCaseIds.has(item.id))}
                            onChange={toggleSelectAllPendingCases}
                            disabled={batchCreating}
                          />
                        </th>
                        <th className="px-4 py-3 font-semibold">漏洞</th>
                        <th className="px-4 py-3 font-semibold">对象定位</th>
                        <th className="px-4 py-3 font-semibold">风险</th>
                        <th className="px-4 py-3 font-semibold">更新时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPendingCases.map((item) => (
                        <tr key={item.id} className="border-b border-theme-border/60 hover:bg-theme-elevated/60">
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedCaseIds.has(item.id)}
                              onChange={() => toggleSelectCase(item.id)}
                              disabled={batchCreating}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="max-w-[360px] truncate font-bold text-theme-text-primary" title={getCaseDisplayName(item)}>{getCaseDisplayName(item)}</div>
                            <div className="mt-1 font-mono text-[11px] text-theme-text-muted">{item.id}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="break-all font-mono text-[11px] font-semibold leading-5 text-theme-text-secondary" title={getCaseSubjectLocator(item)}>{getCaseSubjectLocator(item)}</div>
                            <div className="mt-1 text-[11px] text-theme-text-muted">{getCaseSubjectType(item)}{getCaseSubjectName(item) ? ` · ${getCaseSubjectName(item)}` : ''}</div>
                          </td>
                          <td className="px-4 py-3 text-theme-text-secondary">{item.severity || '-'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-theme-text-muted">{formatDate(item.updated_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          <SummaryCard label="服务健康" value={health} accent={health === 'ok' ? 'emerald' : 'rose'} hint="/api/app/vuln-verify/health" />
          <SummaryCard label="任务总数" value={total} accent="violet" hint="当前筛选结果" />
          <SummaryCard label="运行中" value={summary.running} accent="blue" hint={`等待中 ${summary.pending}`} />
          <SummaryCard label="成功" value={summary.success} accent="emerald" hint="当前页统计" />
          <SummaryCard label="失败" value={summary.failed} accent="rose" hint="当前页统计" />
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="确认" value={projectStats?.confirmed_count ?? '-'} accent="rose" hint="项目级漏洞验证统计" />
          <SummaryCard label="排除" value={projectStats?.ruled_out_count ?? '-'} accent="emerald" hint="项目级漏洞验证统计" />
          <SummaryCard label="待确认" value={projectStats?.unresolved_count ?? '-'} accent="amber" hint="项目级漏洞验证统计" />
          <SummaryCard label="总结果" value={projectStats?.total_results ?? '-'} accent="violet" hint={`项目全部任务${projectStats ?` · 已验证任务 ${projectStats.verified_tasks}` : ''}`} />
        </section>

 <section className="rounded-2xl border border-theme-border bg-theme-surface p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-theme-text-primary">任务列表 <span className="text-sm font-normal text-theme-text-muted">({total})</span></h2>
              <p className="mt-1 text-xs text-theme-text-muted">点击任务名称或查看按钮打开任务详情、结果和产物。</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <label className="inline-flex items-center gap-2 rounded-lg border border-theme-border bg-theme-elevated px-3 py-1.5 text-xs text-theme-text-secondary">
                <input type="checkbox" checked={autoRefreshEnabled} onChange={(e) => setAutoRefreshEnabled(e.target.checked)} />
                自动刷新
              </label>
              <label className="inline-flex items-center gap-2 rounded-lg border border-theme-border bg-theme-elevated px-3 py-1.5 text-xs text-theme-text-secondary">
                间隔
                <input
                  type="number"
                  min={5}
                  value={refreshIntervalSec}
                  onChange={(e) => setRefreshIntervalSec(Math.max(5, Number(e.target.value || 5)))}
                  className="w-16 rounded border border-theme-border bg-theme-elevated px-2 py-1 text-xs text-theme-text-secondary"
                />
                秒
              </label>
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('');
                  setResultVerdictFilter('');
                  setSearch('');
                  setPage(1);
                }}
                disabled={!hasFilters}
                className="inline-flex items-center gap-1.5 rounded-lg border border-theme-border bg-theme-elevated px-3 py-1.5 text-xs font-semibold text-theme-text-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X size={13} />
                清空筛选
              </button>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="form-select text-xs"
              >
                <option value="">全部状态</option>
                {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <select
                value={resultVerdictFilter}
                onChange={(e) => { setResultVerdictFilter(e.target.value); setPage(1); }}
                className="form-select text-xs"
              >
                <option value="">全部结果</option>
                {Object.entries(RESULT_VERDICT_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <div className="relative">
                <Search size={13} className="pointer-events-none absolute left-2.5 top-2 text-theme-text-muted" />
                <input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="搜索任务"
                  className="w-48 rounded-lg border border-theme-border bg-theme-elevated py-1.5 pl-8 pr-3 text-xs text-theme-text-secondary placeholder:text-theme-text-muted"
                />
              </div>
              <select
                value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
                className="form-select text-xs"
              >
                {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}条/页</option>)}
              </select>
              <button onClick={() => void loadOverview()} className="rounded-lg border border-theme-border p-2 text-theme-text-muted hover:bg-theme-elevated">
                <RefreshCw size={14} className={loading || statsLoading ? 'animate-spin' : ''} />
              </button>
              <button onClick={openBatchPanel} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/25 bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-400 hover:bg-violet-500/20">
                <ShieldCheck size={13} />批量验证待验证漏洞
              </button>
              <button onClick={openCreateModal} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-800">
                <Plus size={13} />新建任务
              </button>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            {QUICK_STATUS_FILTERS.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setStatusFilter(item.value);
                  setPage(1);
                }}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${getFilterChipClassName(statusFilter === item.value)}`}
              >
                {item.label}
              </button>
            ))}
            {resultVerdictFilter ? (
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/15 px-3 py-1.5 text-xs text-emerald-400">
                结果：{RESULT_VERDICT_LABEL[resultVerdictFilter] || resultVerdictFilter}
              </span>
            ) : null}
            {search.trim() ? (
              <span className="rounded-full border border-theme-border bg-theme-elevated px-3 py-1.5 text-xs text-theme-text-muted">
                关键词：{search.trim()}
              </span>
            ) : null}
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-theme-text-muted">
            <span>自动刷新：{autoRefreshEnabled ?`开启（${Math.max(5, refreshIntervalSec)}s）` : '关闭'}</span>
            {autoRefreshEnabled ? <span className="text-violet-400">按设定间隔刷新任务列表与项目级漏洞验证统计</span> : null}
            {hasFilters ? <span className="text-theme-text-secondary">已按筛选条件查询表格</span> : null}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-theme-text-muted"><Loader2 size={14} className="animate-spin" />加载中...</div>
          ) : tasks.length === 0 ? (
            <div className="py-16 text-center text-sm text-theme-text-muted">
              {hasFilters ? '当前筛选条件下暂无任务，建议调整状态或关键词。' : '暂无任务，点击右上角「新建任务」创建。'}
            </div>
          ) : (
            <ExecutionTable minWidth={1180}>
              <ExecutionTableHead>
                <tr>
                  <ExecutionTableTh>任务</ExecutionTableTh>
                  <ExecutionTableTh>状态</ExecutionTableTh>
                  <ExecutionTableTh>进度/原因</ExecutionTableTh>
                  <ExecutionTableTh>模型</ExecutionTableTh>
                  <ExecutionTableTh>并发</ExecutionTableTh>
                  <ExecutionTableTh>验证结果</ExecutionTableTh>
                  <ExecutionTableTh>创建时间</ExecutionTableTh>
                  <ExecutionTableTh>耗时</ExecutionTableTh>
                  <ExecutionTableTh className="text-right">操作</ExecutionTableTh>
                </tr>
              </ExecutionTableHead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id} className={executionTableInteractiveRowClassName} onClick={() => void openDetailModal(task.id)}>
                    <ExecutionTableTd className="min-w-[220px]">
                      <button type="button" className="text-left text-sm font-semibold text-theme-text-primary hover:text-violet-400" onClick={(e) => { e.stopPropagation(); void openDetailModal(task.id); }}>
                        {task.name}
                      </button>
                      <div className="mt-1 font-mono text-[11px] text-theme-text-muted">{task.id}</div>
                      <div className="mt-1 max-w-[360px] truncate text-[11px] text-theme-text-muted" title={task.output_dir}>输出：{task.output_dir || '-'}</div>
                    </ExecutionTableTd>
                    <ExecutionTableTd><StatusBadge status={task.status} /></ExecutionTableTd>
                    <ExecutionTableTd className="max-w-[260px]"><div className="truncate text-xs text-theme-text-secondary" title={getProgressText(task)}>{getProgressText(task)}</div></ExecutionTableTd>
                    <ExecutionTableTd className="max-w-[220px]"><div className="truncate font-mono text-xs text-theme-text-secondary" title={task.model || DEFAULT_MODEL_HINT}>{task.model || '继承默认'}</div></ExecutionTableTd>
                    <ExecutionTableTd className="text-xs text-theme-text-secondary">{task.concurrency}</ExecutionTableTd>
                    <ExecutionTableTd className="min-w-[180px] text-xs text-theme-text-secondary">
                      {(() => {
                        const verdictCounts = getTaskVerdictCounts(task);
                        return (
                          <>
                            <div className="font-semibold text-rose-400">确认 {verdictCounts.confirmed}</div>
                            <div className="mt-1 text-emerald-400">排除 {verdictCounts.ruledOut}</div>
                            <div className="mt-1 text-theme-text-muted">待确认 {verdictCounts.unresolved}</div>
                          </>
                        );
                      })()}
                    </ExecutionTableTd>
                    <ExecutionTableTd className="whitespace-nowrap text-xs text-theme-text-muted">{formatDate(task.created_at)}</ExecutionTableTd>
                    <ExecutionTableTd className="whitespace-nowrap text-xs text-theme-text-muted">{formatDuration(task.started_at, task.finished_at)}</ExecutionTableTd>
                    <ExecutionTableTd className="text-right">
                      <div className="inline-flex items-center justify-end gap-1">
                        <button type="button" onClick={(e) => { e.stopPropagation(); void openDetailModal(task.id); }} title="查看详情" className="rounded-lg p-1.5 text-theme-text-muted hover:bg-violet-500/15 hover:text-violet-400"><Eye size={14} /></button>
                        {ACTIVE_STATUSES.has(task.status) ? (
                          <button type="button" onClick={(e) => { e.stopPropagation(); void terminateTask(task.id); }} title="取消任务" className="rounded-lg p-1.5 text-theme-text-muted hover:bg-rose-500/15 hover:text-rose-400"><Square size={14} /></button>
                        ) : null}
                        {TERMINAL_STATUSES.has(task.status) ? (
                          <button type="button" onClick={(e) => { e.stopPropagation(); void rerunTask(task.id); }} title="重跑任务" className="rounded-lg p-1.5 text-theme-text-muted hover:bg-violet-500/15 hover:text-violet-400"><RotateCcw size={14} /></button>
                        ) : null}
                      </div>
                    </ExecutionTableTd>
                  </tr>
                ))}
              </tbody>
            </ExecutionTable>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-xs text-theme-text-muted">当前显示 {tasks.length ? offset + 1 : 0} - {offset + tasks.length} / {total}</span>
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-lg border border-theme-border px-3 py-1.5 text-theme-text-secondary disabled:opacity-40">上一页</button>
              <span className="text-theme-text-muted">{page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="rounded-lg border border-theme-border px-3 py-1.5 text-theme-text-secondary disabled:opacity-40">下一页</button>
            </div>
          </div>
        </section>
      </div>

      {batchConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !batchCreating && setBatchConfirmOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-theme-border bg-theme-surface p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-violet-500/15 p-3 text-violet-400">
                <ShieldCheck size={22} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-theme-text-primary">确认批量生成验证任务</h2>
                <p className="mt-2 text-sm leading-6 text-theme-text-secondary">
                  将为已选的 <span className="font-semibold text-violet-400">{selectedPendingCases.length}</span> 个待验证漏洞生成验证任务。
                </p>
                <p className="mt-1 text-xs leading-5 text-theme-text-muted">
                  任务创建后，对应漏洞将推进到「验证中」阶段，下次筛选不再重复出现；系统从漏洞案例提取 source_root，并将 case raw_report 作为验证输入，其余参数使用默认值。
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBatchConfirmOpen(false)}
                disabled={batchCreating}
                className="rounded-xl border border-theme-border px-4 py-2 text-sm font-semibold text-theme-text-secondary hover:bg-theme-elevated disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleBatchCreateVerifyTasks()}
                disabled={batchCreating}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
              >
                {batchCreating ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                确认生成
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {createModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setCreateModalOpen(false)} />
 <div className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-theme-border bg-theme-surface">
            <form onSubmit={createTask} className="space-y-4 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-theme-text-primary">新建漏洞验证任务</h2>
                  <p className="mt-1 text-xs text-theme-text-muted">所有输入路径必须位于当前项目数据目录下。</p>
                </div>
                <button type="button" onClick={() => setCreateModalOpen(false)} className="rounded-lg p-1 text-theme-text-muted hover:text-theme-text-secondary"><X size={16} /></button>
              </div>

              <label className="block text-sm font-semibold text-theme-text-secondary">
                任务名称 <span className="text-rose-500">*</span>
                <input className="form-input mt-1 w-full" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
              </label>
              <label className="block text-sm font-semibold text-theme-text-secondary">
                描述
                <textarea className="form-textarea mt-1 min-h-20 w-full" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="可选：说明本次验证范围或报告来源" />
              </label>
              {[
                ['reports_dir', '报告目录', '扫描报告所在目录'],
                ['source_root', '源码根目录', '源码文件根目录'],
                ['binary_root', '二进制根目录', '二进制文件根目录（可选）'],
                ['threat_path', '威胁模型文件', 'threat_model.md 路径（可选，留空使用内置威胁模型）'],
                ['model', '模型', DEFAULT_MODEL_HINT],
              ].map(([key, label, help]) => (
                <label key={key} className="block text-sm font-semibold text-theme-text-secondary">
                  {label} {key !== 'model' && key !== 'binary_root' && key !== 'threat_path' ? <span className="text-rose-500">*</span> : null}
                  <input
                    className="form-input mt-1 w-full font-mono text-xs"
                    value={(form as any)[key]}
                    onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                    placeholder={help}
                    required={key !== 'model' && key !== 'binary_root' && key !== 'threat_path'}
                  />
                </label>
              ))}
              <label className="block text-sm font-semibold text-theme-text-secondary">
                并发
                <input type="number" min={1} max={16} className="form-input mt-1 w-full" value={form.concurrency} onChange={(e) => setForm((p) => ({ ...p, concurrency: Number(e.target.value || 1) }))} />
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setCreateModalOpen(false)} className="rounded-xl border border-theme-border px-4 py-2 text-sm font-semibold text-theme-text-secondary hover:bg-theme-elevated">取消</button>
                <button type="submit" disabled={creating} className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-50">
                  {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}创建任务
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {detailModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDetailModalOpen(false)} />
 <div className="relative z-10 flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-theme-border bg-theme-surface">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-theme-border p-5">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  {detail?.status === 'success' ? <CheckCircle2 className="text-emerald-500" /> : detail?.status === 'failed' ? <XCircle className="text-rose-500" /> : detail?.status === 'running' ? <Loader2 className="animate-spin text-blue-500" /> : <ShieldCheck className="text-violet-500" />}
                  <h2 className="text-xl font-semibold text-theme-text-primary">{detail?.name || selectedTaskId}</h2>
                  <StatusBadge status={detail?.status} />
                </div>
                <div className="mt-2 font-mono text-xs text-theme-text-muted">{selectedTaskId}</div>
              </div>
              <div className="flex items-center gap-2">
                {detail && ACTIVE_STATUSES.has(detail.status) ? <button onClick={() => void terminateTask(detail.id)} className="inline-flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/15 px-3 py-2 text-sm font-medium text-rose-400"><Square size={14} />取消</button> : null}
                {detail && TERMINAL_STATUSES.has(detail.status) ? <button onClick={() => void rerunTask(detail.id)} className="inline-flex items-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/15 px-3 py-2 text-sm font-medium text-violet-400"><RotateCcw size={14} />重跑</button> : null}
                <button onClick={() => detail && void loadDetail(detail.id)} className="rounded-xl border border-theme-border p-2 text-theme-text-muted hover:bg-theme-elevated"><RefreshCw size={15} className={detailLoading ? 'animate-spin' : ''} /></button>
                <button onClick={() => setDetailModalOpen(false)} className="rounded-xl p-2 text-theme-text-muted hover:bg-theme-elevated hover:text-theme-text-secondary"><X size={16} /></button>
              </div>
            </div>

            <div className="overflow-y-auto p-5">
              {detailLoading && !detail ? (
                <div className="flex items-center gap-2 py-12 text-sm text-theme-text-muted"><Loader2 size={14} className="animate-spin" />加载任务详情...</div>
              ) : detail ? (
                <div className="space-y-5">
                  {detail.error_reason ? <div className="flex gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/15 p-3 text-sm font-bold text-rose-400"><AlertCircle size={16} />{detail.error_reason}</div> : null}

                  <div className="grid gap-3 md:grid-cols-3">
                    <InfoRow label="模型" value={detail.model || '继承默认'} />
                    <InfoRow label="Worker" value={detail.worker_id || '-'} />
                    <InfoRow label="输出目录" value={detail.output_dir} />
                    <InfoRow label="报告目录" value={detail.reports_dir} />
                    <InfoRow label="源码根目录" value={detail.source_root} />
                    <InfoRow label="二进制根目录" value={detail.binary_root} />
                    <InfoRow label="创建时间" value={formatDate(detail.created_at)} />
                    <InfoRow label="开始/结束" value={`${formatDate(detail.started_at)} / ${formatDate(detail.finished_at)}`} />
                    <InfoRow label="耗时" value={<span className="inline-flex items-center gap-1"><Clock3 size={12} />{formatDuration(detail.started_at, detail.finished_at)}</span>} />
                  </div>

                  <div className="grid gap-4 md:grid-cols-4">
                    <SummaryCard label="报告结果" value={result?.result_count ?? detail.result_summary?.result_count ?? 0} />
                    <SummaryCard label="分组" value={result?.summary?.group_count ?? detail.result_summary?.group_count ?? 0} />
                    <SummaryCard label="完成分组" value={result?.summary?.done_group_count ?? detail.result_summary?.done_group_count ?? 0} />
                    <SummaryCard label="产物数" value={artifacts.length} />
                  </div>

                  <VulnVerifyReportView data={reportData} loading={detailLoading && !reportData} error={reportDataError} />

                  <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
                    <div className="rounded-2xl border border-theme-border bg-theme-surface p-4">
                      <h3 className="text-sm font-semibold text-theme-text-primary">产物文件</h3>
                      <div className="mt-3 max-h-[420px] space-y-2 overflow-auto pr-1">
                        {artifacts.length === 0 ? <div className="rounded-2xl border border-dashed border-theme-border p-6 text-center text-xs text-theme-text-muted">暂无产物</div> : artifacts.map((file) => (
                          <button key={file.path} onClick={() => void openArtifact(file.path)} className="w-full rounded-2xl border border-theme-border bg-theme-surface p-3 text-left hover:bg-theme-elevated">
                            <div className="flex items-center gap-2 text-xs font-semibold text-theme-text-secondary"><FileText size={14} /> <span className="break-all">{file.path}</span></div>
                            <div className="mt-1 text-[10px] text-theme-text-muted">{formatBytes(file.size)}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-theme-border bg-theme-surface p-4">
                      <h3 className="text-sm font-semibold text-theme-text-primary">{artifactContent?.path || '结果预览'}</h3>
                      {artifactContent ? (
                        <pre className="mt-3 max-h-[420px] overflow-auto rounded-2xl border border-theme-border bg-theme-elevated p-4 font-mono text-xs leading-6 text-theme-text-primary">{artifactContent.content}{artifactContent.truncated ? '\n\n... truncated ...' : ''}</pre>
                      ) : result?.results?.length ? (
                        <pre className="mt-3 max-h-[420px] overflow-auto rounded-2xl border border-theme-border bg-theme-elevated p-4 font-mono text-xs leading-6 text-theme-text-primary">{JSON.stringify(result.results, null, 2)}</pre>
                      ) : (
                        <div className="mt-3 rounded-2xl border border-dashed border-theme-border p-12 text-center text-sm text-theme-text-muted">选择左侧产物或等待任务生成结果。</div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-theme-border bg-theme-surface p-4">
                    <h3 className="text-sm font-semibold text-theme-text-primary">事件</h3>
                    <div className="mt-3 max-h-56 space-y-2 overflow-auto pr-1">
                      {detail.events?.length ? detail.events.map((event) => (
                        <div key={event.id} className="rounded-xl bg-theme-surface p-3 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold text-theme-text-secondary">{event.event_type}</span>
                            <span className="text-theme-text-muted">{formatDate(event.created_at)}</span>
                          </div>
                          <div className="mt-1 text-theme-text-secondary">{event.message}</div>
                        </div>
                      )) : <div className="rounded-2xl border border-dashed border-theme-border p-6 text-center text-xs text-theme-text-muted">暂无事件</div>}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-sm text-theme-text-muted">暂无详情</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
