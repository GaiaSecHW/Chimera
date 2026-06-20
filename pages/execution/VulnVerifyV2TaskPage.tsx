import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Eye, Loader2, RefreshCw, RotateCcw, Search, X, XCircle, Zap } from 'lucide-react';
import { vulnApi } from '../../clients/vuln';
import { vulnVerifyV2Api, VulnVerifyV2ProjectStats, VulnVerifyV2Result, VulnVerifyV2Task, VulnVerifyV2TaskDetail } from '../../clients/vulnVerifyV2';
import { ExecutionTable, ExecutionTableHead, ExecutionTableTd, ExecutionTableTh, executionTableInteractiveRowClassName } from '../../components/execution/ExecutionTable';
import { ServicePageTitle, useServiceBuildVersion } from '../../components/execution/ServiceBuildVersion';
import { PageHeader } from '../../design-system';
import { useUiFeedback } from '../../components/UiFeedback';

const BATCH_CREATE_CONCURRENCY = 3;
const PENDING_CASE_LOAD_LIMIT = 500;
const MAX_BATCH_CREATE = 500;

const STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  running: '执行中',
  success: '成功',
  failed: '失败',
  cancelled: '已取消',
};

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-theme-elevated text-theme-text-secondary border-theme-border',
  running: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  failed: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
  cancelled: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
};

const VERDICT_LABEL: Record<string, string> = {
  confirmed: '确认漏洞',
  ruled_out: '排除漏洞',
  unresolved: '不可证',
};

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
  codeRoot?: string;
  synced?: boolean;
  reused?: boolean;
  error?: string;
}

interface BatchCreateResult {
  total: number;
  success: number;
  failed: number;
  items: BatchCreateResultItem[];
}

function fmtDate(value?: string | null): string {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleString('zh-CN') : value;
}

function fmtStatus(status?: string): string {
  return STATUS_LABEL[status || ''] || status || '-';
}

function statusClass(status?: string): string {
  return STATUS_CLASS[status || ''] || 'bg-theme-elevated text-theme-text-secondary border-theme-border';
}

function firstNonEmpty(...values: any[]): string | null {
  for (const v of values) {
    const text = String(v || '').trim();
    if (text) return text;
  }
  return null;
}

function resolveCaseCodeRoot(item: PendingVerifyCase): string | null {
  const m = item.metadata || {};
  return firstNonEmpty(
    m.verification_context?.code_root,
    m.verification_context?.binary_root,
    m.verification_context?.source_root,
    m.source?.code_root,
    m.source?.binary_root,
    m.source?.source_root,
    m.dataflow_vuln_scan?.code_root,
    m.dataflow_vuln_scan?.binary_root,
    m.dataflow_vuln_scan?.source_root,
  );
}

function parseSubjectLocator(locator?: string | null): { file?: string; function?: string } {
  const raw = String(locator || '').trim();
  if (!raw) return {};
  // common format: src/foo.c:func:42
  const parts = raw.split(':');
  if (parts.length >= 2) return { file: parts[0], function: parts[1] };
  return { file: raw };
}

function caseDisplayName(item: PendingVerifyCase): string {
  return item.title || item.global_vuln_id || item.id;
}

function caseLocator(item: PendingVerifyCase): string {
  const subject = item.subject || {};
  return String(subject.locator || subject.path || subject.id || subject.name || '').trim() || '未指定对象定位';
}

function caseSubjectType(item: PendingVerifyCase): string {
  const subject = item.subject || {};
  return String(subject.type || subject.kind || '').trim() || '未知类型';
}

function caseSubjectName(item: PendingVerifyCase): string {
  const subject = item.subject || {};
  return String(subject.name || subject.function || subject.symbol || '').trim();
}

function caseSearchText(item: PendingVerifyCase): string {
  const subject = item.subject || {};
  return [item.id, item.global_vuln_id, item.title, item.severity, item.current_stage, item.current_status, subject.locator, subject.path, subject.name, subject.type]
    .filter(Boolean).join(' ').toLowerCase();
}

function verdictFromResults(results: VulnVerifyV2Result[]): string {
  return results?.[0]?.verdict || '-';
}

function resultSummary(result?: VulnVerifyV2Result | null): string {
  const raw = result?.raw_result || {};
  return String(raw.root_cause_summary || raw.summary || '').trim();
}

function ruledOutBy(result?: VulnVerifyV2Result | null): string {
  const raw = result?.raw_result || {};
  const value = raw.ruled_out_by;
  return Array.isArray(value) ? value.join(', ') : value ? String(value) : '-';
}

const VerdictBadge: React.FC<{ verdict?: string | null }> = ({ verdict }) => {
  if (!verdict) return <span className="text-xs text-theme-text-muted">未产出</span>;
  const cls = verdict === 'confirmed'
    ? 'bg-rose-500/15 text-rose-400 border-rose-500/20'
    : verdict === 'ruled_out'
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
      : 'bg-amber-500/15 text-amber-400 border-amber-500/20';
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}>{VERDICT_LABEL[verdict] || verdict}</span>;
};

const StatusBadge: React.FC<{ status?: string }> = ({ status }) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(status)}`}>
    {status === 'running' ? <Loader2 size={12} className="mr-1 animate-spin" /> : null}
    {fmtStatus(status)}
  </span>
);

const SummaryCard: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; accent?: 'blue' | 'emerald' | 'rose' | 'amber' | 'slate' }> = ({ label, value, hint, accent = 'slate' }) => {
  const color = accent === 'blue' ? 'text-blue-400' : accent === 'emerald' ? 'text-emerald-400' : accent === 'rose' ? 'text-rose-400' : accent === 'amber' ? 'text-amber-400' : 'text-theme-text-primary';
  return (
    <div className="rounded-2xl border border-theme-border bg-theme-surface p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${color}`}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-theme-text-muted">{hint}</div> : null}
    </div>
  );
};

export const VulnVerifyV2TaskPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const buildVersion = useServiceBuildVersion(vulnVerifyV2Api.getHealth);
  const { confirm, feedbackNodes } = useUiFeedback();

  const [tasks, setTasks] = useState<VulnVerifyV2Task[]>([]);
  const [taskResults, setTaskResults] = useState<Record<string, VulnVerifyV2Result>>({});
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<VulnVerifyV2ProjectStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<VulnVerifyV2TaskDetail | null>(null);
  const [detailResults, setDetailResults] = useState<VulnVerifyV2Result[]>([]);

  const [batchOpen, setBatchOpen] = useState(false);
  const [pendingCases, setPendingCases] = useState<PendingVerifyCase[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<string>>(() => new Set());
  const [batchFilter, setBatchFilter] = useState('');
  const [batchCreating, setBatchCreating] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchCreateResult | null>(null);

  const offset = (page - 1) * perPage;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const loadOverview = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [list, stat, results] = await Promise.all([
        vulnVerifyV2Api.listTasks(projectId, { status: statusFilter || undefined, search: search.trim() || undefined, limit: perPage, offset }),
        vulnVerifyV2Api.getProjectStats(projectId).catch(() => null),
        vulnVerifyV2Api.getProjectResults(projectId).catch(() => []),
      ]);
      const resultMap: Record<string, VulnVerifyV2Result> = {};
      (results || []).forEach((result) => { resultMap[result.task_id] = result; });
      setTasks(list.items || []);
      setTaskResults(resultMap);
      setTotal(Number(list.total || 0));
      setStats(stat);
      setMessage(null);
    } catch (e: any) {
      setMessage(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId, statusFilter, search, perPage, offset]);

  useEffect(() => { void loadOverview(); }, [loadOverview]);

  const openDetail = useCallback(async (taskId: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    setDetailResults([]);
    try {
      const [task, results] = await Promise.all([
        vulnVerifyV2Api.getTask(projectId, taskId),
        vulnVerifyV2Api.getResults(projectId, taskId).catch(() => []),
      ]);
      setDetail(task);
      setDetailResults(results);
    } catch (e: any) {
      setMessage(e?.message || String(e));
    } finally {
      setDetailLoading(false);
    }
  }, [projectId]);

  const fetchPendingCases = useCallback(async () => {
    if (!projectId) return;
    setPendingLoading(true);
    try {
      const [receive, triage] = await Promise.all([
        vulnApi.listCases({ project_id: projectId, current_stage: 'receive', page: 1, page_size: PENDING_CASE_LOAD_LIMIT }),
        vulnApi.listCases({ project_id: projectId, current_stage: 'triage', page: 1, page_size: PENDING_CASE_LOAD_LIMIT }),
      ]);
      const items = [...(receive.items || []), ...(triage.items || [])].slice(0, PENDING_CASE_LOAD_LIMIT) as PendingVerifyCase[];
      setPendingCases(items);
      setPendingTotal(Number(receive.total || 0) + Number(triage.total || 0));
      setSelectedCaseIds((prev) => {
        const available = new Set(items.map((x) => x.id));
        const next = new Set<string>();
        prev.forEach((id) => { if (available.has(id)) next.add(id); });
        return next;
      });
      setMessage(null);
    } catch (e: any) {
      setPendingCases([]);
      setPendingTotal(0);
      setMessage(e?.message || String(e));
    } finally {
      setPendingLoading(false);
    }
  }, [projectId]);

  const filteredCases = useMemo(() => {
    const q = batchFilter.trim().toLowerCase();
    if (!q) return pendingCases;
    return pendingCases.filter((item) => caseSearchText(item).includes(q));
  }, [pendingCases, batchFilter]);

  const selectedCases = useMemo(() => pendingCases.filter((item) => selectedCaseIds.has(item.id)), [pendingCases, selectedCaseIds]);

  const findExistingTaskByCaseId = useCallback(async (caseId: string): Promise<VulnVerifyV2Task | null> => {
    const list = await vulnVerifyV2Api.listTasks(projectId, { search: caseId, limit: 20, offset: 0 });
    return (list.items || []).find((task) => task.case_id === caseId) || null;
  }, [projectId]);

  const syncCaseStage = useCallback(async (caseId: string, task: VulnVerifyV2Task) => {
    await vulnApi.syncAutoVerifyTask(caseId, { vuln_verify_task_id: task.id } as any);
  }, []);

  const createTaskFromCase = useCallback(async (item: PendingVerifyCase) => {
    const existing = await findExistingTaskByCaseId(item.id);
    if (existing) {
      await syncCaseStage(item.id, existing);
      return { task: existing, codeRoot: existing.code_root, reused: true };
    }

    const codeRoot = resolveCaseCodeRoot(item);
    if (!codeRoot) throw new Error('缺少 code_root（case metadata 中未找到 verification_context/source/dataflow_vuln_scan 路径）');
    const report = await vulnApi.getCaseReport(item.id);
    const rawReport = String(report?.content || '').trim();
    if (!rawReport) throw new Error('漏洞报告为空');
    const locator = caseLocator(item);
    const parsed = parseSubjectLocator(locator);

    const task = await vulnVerifyV2Api.createTask(projectId, {
      case_id: item.id,
      task_key: item.id,
      name: `批量验证v2 - ${caseDisplayName(item)}`,
      code_root: codeRoot,
      raw_report: rawReport,
      model: null,
      threat_path: null,
      max_attempts: 2,
      file: parsed.file,
      function: parsed.function,
    });

    await syncCaseStage(item.id, task);
    return { task, codeRoot, reused: false };
  }, [findExistingTaskByCaseId, projectId, syncCaseStage]);

  const openBatch = () => {
    setBatchOpen(true);
    setBatchResult(null);
    void fetchPendingCases();
  };

  const toggleCase = (id: string) => {
    setSelectedCaseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    const ids = filteredCases.map((x) => x.id);
    setSelectedCaseIds((prev) => {
      const all = ids.length > 0 && ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (all) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const runBatchCreate = async () => {
    if (!selectedCases.length) {
      setMessage('请选择待验证漏洞。');
      return;
    }
    if (selectedCases.length > MAX_BATCH_CREATE) {
      setMessage(`单次最多创建 ${MAX_BATCH_CREATE} 个验证任务。`);
      return;
    }
    const ok = await confirm({
      title: '确认批量创建验证任务',
      message: `将为 ${selectedCases.length} 个待验证漏洞创建 v2 验证任务，并在创建成功后推进到 validation 阶段。`,
      confirmText: '开始创建',
    });
    if (!ok) return;

    setBatchCreating(true);
    setBatchResult(null);
    const results: BatchCreateResultItem[] = [];
    let cursor = 0;
    async function worker() {
      while (cursor < selectedCases.length) {
        const item = selectedCases[cursor++];
        try {
          const data = await createTaskFromCase(item);
          results.push({
            ok: true,
            caseId: item.id,
            title: item.title,
            taskId: data.task.id,
            codeRoot: data.codeRoot,
            synced: true,
            reused: data.reused,
          });
        } catch (e: any) {
          results.push({ ok: false, caseId: item.id, title: item.title, error: e?.message || String(e) });
        }
      }
    }

    try {
      await Promise.all(Array.from({ length: Math.min(BATCH_CREATE_CONCURRENCY, selectedCases.length) }, worker));
      const success = results.filter((x) => x.ok).length;
      const failed = results.length - success;
      setBatchResult({ total: results.length, success, failed, items: results });
      setSelectedCaseIds(new Set());
      await Promise.all([fetchPendingCases(), loadOverview()]);
      setMessage(`批量创建完成：成功 ${success} 个，失败 ${failed} 个。`);
    } finally {
      setBatchCreating(false);
    }
  };

  const selectedResult = detailResults[0];
  const raw = selectedResult?.raw_result || {};
  const dimensions = (raw.dimensions || selectedResult?.dimensions || {}) as Record<string, { status?: boolean | null; detail?: string }>;

  return (
    <div className="min-h-full bg-theme-bg-app text-theme-text-primary">
      <div className="w-full space-y-6">
        {feedbackNodes}
        <PageHeader
          title={<ServicePageTitle title="漏洞验证 v2" version={buildVersion} />}
          description="原子能力 / 漏洞验证v2：从漏洞中心待验证漏洞批量创建 v2 验证任务，创建成功后自动推进到 validation 阶段。"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void loadOverview()} className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-4 py-2 text-sm font-semibold text-theme-text-secondary hover:bg-theme-elevated">
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />刷新
              </button>
              <button type="button" onClick={openBatch} className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 hover:bg-violet-400">
                <Zap size={16} />从待验证漏洞批量创建
              </button>
            </div>
          }
        />

        {message ? <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">{message}</div> : null}

        <div className="grid gap-4 md:grid-cols-5">
          <SummaryCard label="总任务" value={stats?.total_tasks ?? total} />
          <SummaryCard label="等待中" value={stats?.pending ?? 0} accent="amber" />
          <SummaryCard label="执行中" value={stats?.running ?? 0} accent="blue" />
          <SummaryCard label="成功" value={stats?.success ?? 0} accent="emerald" />
          <SummaryCard label="失败/取消" value={(stats?.failed ?? 0) + (stats?.cancelled ?? 0)} accent="rose" />
        </div>

        <section className="rounded-2xl border border-theme-border bg-theme-surface p-4">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="rounded-xl border border-theme-border bg-theme-bg-app px-3 py-2 text-sm text-theme-text-primary">
              <option value="">全部状态</option>
              <option value="pending">等待中</option>
              <option value="running">执行中</option>
              <option value="success">成功</option>
              <option value="failed">失败</option>
              <option value="cancelled">已取消</option>
            </select>
            <div className="relative min-w-[260px] flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-text-muted" />
              <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="搜索 case_id / 任务名" className="w-full rounded-xl border border-theme-border bg-theme-bg-app py-2 pl-9 pr-3 text-sm text-theme-text-primary" />
            </div>
            <span className="text-xs text-theme-text-muted">共 {total} 条</span>
          </div>

          <ExecutionTable>
            <ExecutionTableHead>
              <tr>
                <ExecutionTableTh>任务</ExecutionTableTh>
                <ExecutionTableTh>状态</ExecutionTableTh>
                <ExecutionTableTh>验证结果</ExecutionTableTh>
                <ExecutionTableTh>case_id</ExecutionTableTh>
                <ExecutionTableTh>code_root</ExecutionTableTh>
                <ExecutionTableTh>模型</ExecutionTableTh>
                <ExecutionTableTh>创建时间</ExecutionTableTh>
                <ExecutionTableTh>操作</ExecutionTableTh>
              </tr>
            </ExecutionTableHead>
            <tbody>
              {tasks.map((task) => {
                const result = taskResults[task.id];
                const summary = resultSummary(result);
                return (
                <tr key={task.id} className={executionTableInteractiveRowClassName} onClick={() => void openDetail(task.id)}>
                  <ExecutionTableTd>
                    <div className="font-semibold text-theme-text-primary">{task.name}</div>
                    <div className="mt-1 text-[11px] text-theme-text-muted">{task.id}</div>
                  </ExecutionTableTd>
                  <ExecutionTableTd><StatusBadge status={task.status} /></ExecutionTableTd>
                  <ExecutionTableTd>
                    <VerdictBadge verdict={result?.verdict} />
                    {summary ? <div className="mt-1 line-clamp-2 max-w-[260px] text-xs text-theme-text-muted" title={summary}>{summary}</div> : null}
                    {result?.verdict === 'ruled_out' ? <div className="mt-1 max-w-[260px] truncate font-mono text-[11px] text-theme-text-muted" title={ruledOutBy(result)}>ruled_out_by: {ruledOutBy(result)}</div> : null}
                  </ExecutionTableTd>
                  <ExecutionTableTd><span className="font-mono text-xs">{task.case_id}</span></ExecutionTableTd>
                  <ExecutionTableTd><span className="line-clamp-2 max-w-[280px] text-xs text-theme-text-muted">{task.code_root}</span></ExecutionTableTd>
                  <ExecutionTableTd>{task.model || <span className="text-theme-text-muted">默认</span>}</ExecutionTableTd>
                  <ExecutionTableTd>{fmtDate(task.created_at)}</ExecutionTableTd>
                  <ExecutionTableTd>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => void openDetail(task.id)} className="rounded-lg border border-theme-border px-2 py-1 text-xs text-theme-text-secondary hover:bg-theme-elevated"><Eye size={14} /></button>
                      <button onClick={() => void vulnVerifyV2Api.rerunTask(projectId, task.id).then(loadOverview)} className="rounded-lg border border-theme-border px-2 py-1 text-xs text-theme-text-secondary hover:bg-theme-elevated"><RotateCcw size={14} /></button>
                    </div>
                  </ExecutionTableTd>
                </tr>
                );
              })}
              {!tasks.length && !loading ? (
                <tr><ExecutionTableTd colSpan={8}><div className="py-10 text-center text-sm text-theme-text-muted">暂无任务</div></ExecutionTableTd></tr>
              ) : null}
            </tbody>
          </ExecutionTable>

          <div className="mt-4 flex items-center justify-between text-sm text-theme-text-muted">
            <span>第 {page}/{totalPages} 页</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-theme-border px-3 py-1 disabled:opacity-40">上一页</button>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded-lg border border-theme-border px-3 py-1 disabled:opacity-40">下一页</button>
            </div>
          </div>
        </section>
      </div>

      {batchOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
          <div className="h-full w-full max-w-5xl overflow-y-auto border-l border-theme-border bg-theme-bg-app p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-theme-text-primary">从待验证漏洞批量创建 v2 任务</h2>
                <p className="mt-1 text-sm text-theme-text-muted">加载 receive / triage 阶段漏洞，创建成功后调用漏洞中心 auto-verify/sync 推进到 validation。</p>
              </div>
              <button onClick={() => setBatchOpen(false)} className="rounded-xl border border-theme-border p-2 text-theme-text-muted hover:bg-theme-elevated"><X size={18} /></button>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-3">
              <button onClick={() => void fetchPendingCases()} className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-4 py-2 text-sm font-semibold text-theme-text-secondary hover:bg-theme-elevated">
                <RefreshCw size={16} className={pendingLoading ? 'animate-spin' : ''} />加载待验证漏洞
              </button>
              <div className="relative min-w-[260px] flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-text-muted" />
                <input value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)} placeholder="搜索 case_id / 标题 / 对象定位" className="w-full rounded-xl border border-theme-border bg-theme-surface py-2 pl-9 pr-3 text-sm text-theme-text-primary" />
              </div>
              <span className="text-xs text-theme-text-muted">已选 {selectedCaseIds.size} / 可见 {filteredCases.length} / 总计 {pendingTotal}</span>
              <button onClick={() => void runBatchCreate()} disabled={batchCreating || !selectedCaseIds.size} className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {batchCreating ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}开始创建
              </button>
            </div>

            <div className="rounded-2xl border border-theme-border bg-theme-surface">
              {pendingLoading ? (
                <div className="flex items-center gap-2 p-8 text-sm text-theme-text-muted"><Loader2 size={14} className="animate-spin" />加载待验证漏洞...</div>
              ) : pendingCases.length === 0 ? (
                <div className="p-10 text-center text-sm text-theme-text-muted">当前项目暂无待验证漏洞。</div>
              ) : filteredCases.length === 0 ? (
                <div className="p-10 text-center text-sm text-theme-text-muted">当前筛选条件下暂无待验证漏洞。</div>
              ) : (
                <div className="max-h-[46vh] overflow-auto">
                  <table className="w-full min-w-[980px] text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-theme-surface text-theme-text-muted">
                      <tr className="border-b border-theme-border">
                        <th className="w-12 px-4 py-3">
                          <input
                            type="checkbox"
                            checked={filteredCases.length > 0 && filteredCases.every((item) => selectedCaseIds.has(item.id))}
                            onChange={toggleAllVisible}
                            disabled={batchCreating}
                          />
                        </th>
                        <th className="px-4 py-3 font-black">漏洞</th>
                        <th className="px-4 py-3 font-black">对象定位</th>
                        <th className="px-4 py-3 font-black">风险</th>
                        <th className="px-4 py-3 font-black">阶段</th>
                        <th className="px-4 py-3 font-black">code_root</th>
                        <th className="px-4 py-3 font-black">更新时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCases.map((item) => {
                        const codeRoot = resolveCaseCodeRoot(item);
                        return (
                          <tr key={item.id} className="border-b border-theme-border/60 hover:bg-theme-elevated/60">
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={selectedCaseIds.has(item.id)}
                                onChange={() => toggleCase(item.id)}
                                disabled={batchCreating}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="max-w-[320px] truncate font-bold text-theme-text-primary" title={caseDisplayName(item)}>{caseDisplayName(item)}</div>
                              <div className="mt-1 font-mono text-[11px] text-theme-text-muted">{item.id}</div>
                              {item.global_vuln_id ? <div className="mt-1 font-mono text-[11px] text-theme-text-muted">{item.global_vuln_id}</div> : null}
                            </td>
                            <td className="px-4 py-3">
                              <div className="break-all font-mono text-[11px] font-semibold leading-5 text-theme-text-secondary" title={caseLocator(item)}>{caseLocator(item)}</div>
                              <div className="mt-1 text-[11px] text-theme-text-muted">{caseSubjectType(item)}{caseSubjectName(item) ? ` · ${caseSubjectName(item)}` : ''}</div>
                            </td>
                            <td className="px-4 py-3 text-theme-text-secondary">{item.severity || '-'}</td>
                            <td className="px-4 py-3 text-theme-text-secondary">{item.current_stage || '-'}{item.current_status ? ` / ${item.current_status}` : ''}</td>
                            <td className={`px-4 py-3 break-all font-mono text-[11px] ${codeRoot ? 'text-theme-text-muted' : 'text-rose-300'}`}>{codeRoot || '缺失'}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-theme-text-muted">{fmtDate(item.updated_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {batchResult ? (
              <div className="mt-5 rounded-2xl border border-theme-border bg-theme-surface p-4">
                <div className="mb-3 flex items-center gap-3 text-sm">
                  <span>总数 {batchResult.total}</span>
                  <span className="text-emerald-400">成功 {batchResult.success}</span>
                  <span className="text-rose-400">失败 {batchResult.failed}</span>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-2 text-xs">
                  {batchResult.items.map((item) => (
                    <div key={item.caseId} className="rounded-xl border border-theme-border bg-theme-bg-app p-3">
                      <div className="flex items-center gap-2">
                        {item.ok ? <CheckCircle2 size={14} className="text-emerald-400" /> : <XCircle size={14} className="text-rose-400" />}
                        <span className="font-mono">{item.caseId}</span>
                        {item.reused ? <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-blue-300">已存在复用</span> : null}
                      </div>
                      <div className="mt-1 text-theme-text-muted">{item.title}</div>
                      {item.ok ? <div className="mt-1 text-emerald-300">task: {item.taskId}，阶段已推进</div> : <div className="mt-1 text-rose-300">{item.error}</div>}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {detailOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="max-h-[88vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-theme-border bg-theme-bg-app p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-theme-text-primary">任务详情</h2>
                <p className="mt-1 text-sm text-theme-text-muted">{detail?.id || '加载中...'}</p>
              </div>
              <button onClick={() => setDetailOpen(false)} className="rounded-xl border border-theme-border p-2 text-theme-text-muted hover:bg-theme-elevated"><X size={18} /></button>
            </div>
            {detailLoading ? <div className="py-12 text-center text-theme-text-muted"><Loader2 className="mx-auto animate-spin" />加载中...</div> : detail ? (
              <div className="space-y-5">
                <div className="grid gap-3 md:grid-cols-3">
                  <SummaryCard label="状态" value={<StatusBadge status={detail.status} />} />
                  <SummaryCard label="结论" value={VERDICT_LABEL[verdictFromResults(detailResults)] || verdictFromResults(detailResults)} />
                  <SummaryCard label="case_id" value={<span className="text-sm">{detail.case_id}</span>} />
                </div>
                <div className="rounded-2xl border border-theme-border bg-theme-surface p-4">
                  <div className="mb-2 text-sm font-semibold text-theme-text-primary">四维判定</div>
                  <div className="grid gap-3 md:grid-cols-4">
                    {['code_accurate', 'path_reachable', 'unmitigated', 'security_impact'].map((key) => {
                      const dim = dimensions[key];
                      const status = dim?.status;
                      return (
                        <div key={key} className="rounded-xl border border-theme-border bg-theme-bg-app p-3">
                          <div className="font-mono text-xs text-theme-text-muted">{key}</div>
                          <div className={status === true ? 'mt-1 font-bold text-emerald-400' : status === false ? 'mt-1 font-bold text-rose-400' : 'mt-1 font-bold text-theme-text-muted'}>{status === true ? 'true' : status === false ? 'false' : 'null'}</div>
                          <div className="mt-1 line-clamp-4 text-xs text-theme-text-muted">{dim?.detail || '-'}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="rounded-2xl border border-theme-border bg-theme-surface p-4">
                  <div className="text-sm font-semibold text-theme-text-primary">root_cause_summary</div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-theme-text-secondary">{String(raw.root_cause_summary || '-')}</p>
                  <div className="mt-3 text-xs text-theme-text-muted">ruled_out_by: {JSON.stringify(raw.ruled_out_by ?? null)}</div>
                </div>
                <div className="rounded-2xl border border-theme-border bg-theme-surface p-4">
                  <div className="text-sm font-semibold text-theme-text-primary">运行信息</div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2 text-xs text-theme-text-muted">
                    <div>code_root: {detail.code_root}</div>
                    <div>reports_dir: {detail.reports_dir}</div>
                    <div>task_key: {detail.task_key}</div>
                    <div>model: {detail.model || '默认'}</div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};
