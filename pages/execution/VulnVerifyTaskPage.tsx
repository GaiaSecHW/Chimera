import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, Eye, FileText, Loader2, Plus, RefreshCw, RotateCcw, Search, ShieldCheck, Square, X, XCircle } from 'lucide-react';
import { vulnVerifyApi, VulnVerifyArtifact, VulnVerifyReportData, VulnVerifyResult, VulnVerifyTask, VulnVerifyTaskDetail } from '../../clients/vulnVerify';
import { ExecutionTable, ExecutionTableHead, ExecutionTableTh, ExecutionTableTd, executionTableInteractiveRowClassName } from '../../components/execution/ExecutionTable';
import { ServicePageTitle, useServiceBuildVersion } from '../../components/execution/ServiceBuildVersion';
import { VulnVerifyReportView } from './VulnVerifyReportView';

const DEFAULT_MODEL = 'local_minimax/MiniMax/MiniMax-M2.5';
const ACTIVE_STATUSES = new Set(['pending', 'running', 'cancelling']);
const TERMINAL_STATUSES = new Set(['success', 'failed', 'cancelled']);
const VERIFY_OPEN_TASK_ID_KEY = 'chimera-vuln-verify-open-task-id';
const VERIFY_OPEN_PROJECT_ID_KEY = 'chimera-vuln-verify-open-project-id';

const STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  running: '执行中',
  success: '成功',
  failed: '失败',
  cancelled: '已取消',
  cancelling: '取消中',
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600 border-slate-200',
  running: 'bg-blue-50 text-blue-700 border-blue-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed: 'bg-rose-50 text-rose-700 border-rose-200',
  cancelled: 'bg-amber-50 text-amber-700 border-amber-200',
  cancelling: 'bg-amber-50 text-amber-700 border-amber-200',
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

function makeDefaultForm(projectId: string): CreateFormState {
  return {
    name: `漏洞验证任务-${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    description: '',
    reports_dir: `/data/files/${projectId}/vuln-verify/reports`,
    source_root: `/data/files/${projectId}/source`,
    binary_root: `/data/files/${projectId}/binary`,
    threat_path: `/data/files/${projectId}/vuln-verify/threat_model.md`,
    model: DEFAULT_MODEL,
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
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(startedAt?: string | null, finishedAt?: string | null): string {
  if (!startedAt) return '-';
  const started = new Date(startedAt).getTime();
  const finished = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) return '-';
  const secs = Math.floor((finished - started) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rest = secs % 60;
  if (mins < 60) return `${mins}m${rest}s`;
  const hours = Math.floor(mins / 60);
  return `${hours}h${mins % 60}m`;
}

function getStatusLabel(status?: string): string {
  return STATUS_LABEL[status || ''] || status || '-';
}

function getStatusClass(status?: string): string {
  return STATUS_BADGE_CLASS[status || ''] || 'bg-slate-100 text-slate-600 border-slate-200';
}

function getProgressText(task: VulnVerifyTask): string {
  const progress = task.progress || {};
  const message = String(progress.message || progress.stage || '').trim();
  if (message) return message;
  if (task.error_reason) return task.error_reason;
  const groupCount = task.result_summary?.group_count;
  const doneGroupCount = task.result_summary?.done_group_count;
  if (groupCount != null || doneGroupCount != null) return `分组 ${doneGroupCount ?? 0}/${groupCount ?? 0}`;
  return task.output_dir || '-';
}

const SummaryCard: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; accent?: 'violet' | 'blue' | 'emerald' | 'rose' | 'slate' }> = ({ label, value, hint, accent = 'slate' }) => {
  const accentClass = accent === 'violet' ? 'text-violet-600' : accent === 'blue' ? 'text-blue-600' : accent === 'emerald' ? 'text-emerald-600' : accent === 'rose' ? 'text-rose-600' : 'text-slate-900';
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className={`mt-2 text-2xl font-black ${accentClass}`}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-400">{hint}</div> : null}
    </div>
  );
};

const StatusBadge: React.FC<{ status?: string }> = ({ status }) => (
  <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-black ${getStatusClass(status)}`}>
    {status === 'running' || status === 'cancelling' ? <Loader2 size={12} className="mr-1 animate-spin" /> : null}
    {getStatusLabel(status)}
  </span>
);

const InfoRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-2xl bg-slate-50 p-3">
    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</div>
    <div className="mt-1 break-all text-xs font-bold text-slate-700">{value || '-'}</div>
  </div>
);

export const VulnVerifyTaskPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const buildVersion = useServiceBuildVersion(vulnVerifyApi.getHealth);
  const [tasks, setTasks] = useState<VulnVerifyTask[]>([]);
  const [total, setTotal] = useState(0);
  const [health, setHealth] = useState('unknown');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [refreshIntervalSec, setRefreshIntervalSec] = useState(10);

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

  const offset = (page - 1) * perPage;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const hasActiveTasks = tasks.some((task) => ACTIVE_STATUSES.has(task.status));

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

  const loadTasks = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [healthPayload, list] = await Promise.all([
        vulnVerifyApi.getHealth().catch(() => ({ status: 'unhealthy' })),
        vulnVerifyApi.listTasks(projectId, {
          status: statusFilter || undefined,
          search: search.trim() || undefined,
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
  }, [projectId, statusFilter, search, perPage, offset]);

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

  useEffect(() => {
    if (!autoRefreshEnabled) return undefined;
    const intervalMs = Math.max(5, refreshIntervalSec) * 1000;
    const timer = window.setInterval(() => {
      if (hasActiveTasks) void loadTasks();
      if (detailModalOpen && selectedTaskId) void loadDetail(selectedTaskId);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [autoRefreshEnabled, refreshIntervalSec, hasActiveTasks, detailModalOpen, selectedTaskId, loadTasks, loadDetail]);

  useEffect(() => {
    setForm(makeDefaultForm(projectId));
    setPage(1);
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
        binary_root: form.binary_root.trim(),
        threat_path: form.threat_path.trim(),
        model: form.model.trim() || DEFAULT_MODEL,
        concurrency: Number(form.concurrency || 1),
        resume: false,
      });
      setCreateModalOpen(false);
      setPage(1);
      await loadTasks();
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
    if (!window.confirm('确认取消该漏洞验证任务？')) return;
    try {
      await vulnVerifyApi.terminateTask(projectId, taskId);
      await loadTasks();
      if (selectedTaskId === taskId) await loadDetail(taskId);
    } catch (error: any) {
      setMessage(error?.message || String(error));
    }
  };

  const rerunTask = async (taskId: string) => {
    if (!projectId || !taskId) return;
    if (!window.confirm('确认清空输出并重跑该任务？')) return;
    try {
      await vulnVerifyApi.rerunTask(projectId, taskId);
      await loadTasks();
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
    <div className="min-h-full bg-slate-50 p-6">
      <div className="w-full space-y-6">
        <header className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">漏洞验证原子能力</p>
              <ServicePageTitle title="漏洞验证任务" version={buildVersion} />
              <p className="mt-2 max-w-3xl text-sm text-slate-500">
                参考数据流漏洞挖掘的任务列表模式：集中查看任务状态，点击任务进入详情，使用右上角「新建任务」提交报告目录、源码、二进制与威胁模型。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void loadTasks()}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> 刷新
              </button>
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-violet-800"
              >
                <Plus size={16} /> 新建任务
              </button>
            </div>
          </div>
        </header>

        {message ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
            {message}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-5">
          <SummaryCard label="服务健康" value={health} accent={health === 'ok' ? 'emerald' : 'rose'} hint="/api/app/vuln-verify/health" />
          <SummaryCard label="任务总数" value={total} accent="violet" hint="当前筛选结果" />
          <SummaryCard label="运行中" value={summary.running} accent="blue" hint={`等待中 ${summary.pending}`} />
          <SummaryCard label="成功" value={summary.success} accent="emerald" hint="当前页统计" />
          <SummaryCard label="失败" value={summary.failed} accent="rose" hint="当前页统计" />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-slate-900">任务列表 <span className="text-sm font-normal text-slate-400">({total})</span></h2>
              <p className="mt-1 text-xs text-slate-400">点击任务名称或查看按钮打开任务详情、结果和产物。</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                <input type="checkbox" checked={autoRefreshEnabled} onChange={(e) => setAutoRefreshEnabled(e.target.checked)} />
                自动刷新
              </label>
              <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                间隔
                <input
                  type="number"
                  min={5}
                  value={refreshIntervalSec}
                  onChange={(e) => setRefreshIntervalSec(Math.max(5, Number(e.target.value || 5)))}
                  className="w-16 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                />
                秒
              </label>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600"
              >
                <option value="">全部状态</option>
                {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <div className="relative">
                <Search size={13} className="pointer-events-none absolute left-2.5 top-2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="搜索任务"
                  className="w-48 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-600 placeholder:text-slate-400"
                />
              </div>
              <select
                value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600"
              >
                {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}条/页</option>)}
              </select>
              <button onClick={() => void loadTasks()} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
              <button onClick={openCreateModal} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-800">
                <Plus size={13} />新建任务
              </button>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span>自动刷新：{autoRefreshEnabled ? `开启（${Math.max(5, refreshIntervalSec)}s）` : '关闭'}</span>
            {autoRefreshEnabled && !hasActiveTasks ? <span className="text-amber-600">当前页无活跃任务，自动刷新暂不触发列表刷新</span> : null}
            {autoRefreshEnabled && hasActiveTasks ? <span className="text-violet-600">检测到活跃任务，按设定间隔刷新</span> : null}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" />加载中...</div>
          ) : tasks.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">暂无任务，点击右上角「新建任务」创建。</div>
          ) : (
            <ExecutionTable minWidth={1180}>
              <ExecutionTableHead>
                <tr>
                  <ExecutionTableTh>任务</ExecutionTableTh>
                  <ExecutionTableTh>状态</ExecutionTableTh>
                  <ExecutionTableTh>进度/原因</ExecutionTableTh>
                  <ExecutionTableTh>模型</ExecutionTableTh>
                  <ExecutionTableTh>并发</ExecutionTableTh>
                  <ExecutionTableTh>结果</ExecutionTableTh>
                  <ExecutionTableTh>创建时间</ExecutionTableTh>
                  <ExecutionTableTh>耗时</ExecutionTableTh>
                  <ExecutionTableTh className="text-right">操作</ExecutionTableTh>
                </tr>
              </ExecutionTableHead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id} className={executionTableInteractiveRowClassName} onClick={() => void openDetailModal(task.id)}>
                    <ExecutionTableTd className="min-w-[220px]">
                      <button type="button" className="text-left text-sm font-black text-slate-900 hover:text-violet-700" onClick={(e) => { e.stopPropagation(); void openDetailModal(task.id); }}>
                        {task.name}
                      </button>
                      <div className="mt-1 font-mono text-[11px] text-slate-400">{task.id}</div>
                      <div className="mt-1 max-w-[360px] truncate text-[11px] text-slate-400" title={task.output_dir}>输出：{task.output_dir || '-'}</div>
                    </ExecutionTableTd>
                    <ExecutionTableTd><StatusBadge status={task.status} /></ExecutionTableTd>
                    <ExecutionTableTd className="max-w-[260px]"><div className="truncate text-xs text-slate-600" title={getProgressText(task)}>{getProgressText(task)}</div></ExecutionTableTd>
                    <ExecutionTableTd className="max-w-[220px]"><div className="truncate font-mono text-xs text-slate-600" title={task.model || DEFAULT_MODEL}>{task.model || '-'}</div></ExecutionTableTd>
                    <ExecutionTableTd className="text-xs text-slate-600">{task.concurrency}</ExecutionTableTd>
                    <ExecutionTableTd className="text-xs text-slate-600">
                      <div>结果 {task.result_summary?.result_count ?? '-'}</div>
                      <div className="text-slate-400">分组 {task.result_summary?.done_group_count ?? 0}/{task.result_summary?.group_count ?? 0}</div>
                    </ExecutionTableTd>
                    <ExecutionTableTd className="whitespace-nowrap text-xs text-slate-500">{formatDate(task.created_at)}</ExecutionTableTd>
                    <ExecutionTableTd className="whitespace-nowrap text-xs text-slate-500">{formatDuration(task.started_at, task.finished_at)}</ExecutionTableTd>
                    <ExecutionTableTd className="text-right">
                      <div className="inline-flex items-center justify-end gap-1">
                        <button type="button" onClick={(e) => { e.stopPropagation(); void openDetailModal(task.id); }} title="查看详情" className="rounded-lg p-1.5 text-slate-400 hover:bg-violet-50 hover:text-violet-600"><Eye size={14} /></button>
                        {ACTIVE_STATUSES.has(task.status) ? (
                          <button type="button" onClick={(e) => { e.stopPropagation(); void terminateTask(task.id); }} title="取消任务" className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Square size={14} /></button>
                        ) : null}
                        {TERMINAL_STATUSES.has(task.status) ? (
                          <button type="button" onClick={(e) => { e.stopPropagation(); void rerunTask(task.id); }} title="重跑任务" className="rounded-lg p-1.5 text-slate-400 hover:bg-violet-50 hover:text-violet-600"><RotateCcw size={14} /></button>
                        ) : null}
                      </div>
                    </ExecutionTableTd>
                  </tr>
                ))}
              </tbody>
            </ExecutionTable>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-xs text-slate-400">当前显示 {tasks.length ? offset + 1 : 0} - {offset + tasks.length} / {total}</span>
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 disabled:opacity-40">上一页</button>
              <span className="text-slate-500">{page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 disabled:opacity-40">下一页</button>
            </div>
          </div>
        </section>
      </div>

      {createModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setCreateModalOpen(false)} />
          <div className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <form onSubmit={createTask} className="space-y-4 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black text-slate-900">新建漏洞验证任务</h2>
                  <p className="mt-1 text-xs text-slate-400">所有输入路径必须位于当前项目数据目录下。</p>
                </div>
                <button type="button" onClick={() => setCreateModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:text-slate-700"><X size={16} /></button>
              </div>

              <label className="block text-sm font-semibold text-slate-600">
                任务名称 <span className="text-rose-500">*</span>
                <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                描述
                <textarea className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="可选：说明本次验证范围或报告来源" />
              </label>
              {[
                ['reports_dir', '报告目录', '扫描报告所在目录'],
                ['source_root', '源码根目录', '源码文件根目录'],
                ['binary_root', '二进制根目录', '二进制文件根目录'],
                ['threat_path', '威胁模型文件', 'threat_model.md 路径'],
                ['model', '模型', DEFAULT_MODEL],
              ].map(([key, label, help]) => (
                <label key={key} className="block text-sm font-semibold text-slate-600">
                  {label} {key !== 'model' ? <span className="text-rose-500">*</span> : null}
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs"
                    value={(form as any)[key]}
                    onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                    placeholder={help}
                    required={key !== 'model'}
                  />
                </label>
              ))}
              <label className="block text-sm font-semibold text-slate-600">
                并发
                <input type="number" min={1} max={16} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.concurrency} onChange={(e) => setForm((p) => ({ ...p, concurrency: Number(e.target.value || 1) }))} />
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setCreateModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">取消</button>
                <button type="submit" disabled={creating} className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2 text-sm font-black text-white hover:bg-violet-800 disabled:opacity-50">
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
          <div className="relative z-10 flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 p-5">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  {detail?.status === 'success' ? <CheckCircle2 className="text-emerald-500" /> : detail?.status === 'failed' ? <XCircle className="text-rose-500" /> : detail?.status === 'running' ? <Loader2 className="animate-spin text-blue-500" /> : <ShieldCheck className="text-violet-500" />}
                  <h2 className="text-xl font-black text-slate-900">{detail?.name || selectedTaskId}</h2>
                  <StatusBadge status={detail?.status} />
                </div>
                <div className="mt-2 font-mono text-xs text-slate-400">{selectedTaskId}</div>
              </div>
              <div className="flex items-center gap-2">
                {detail && ACTIVE_STATUSES.has(detail.status) ? <button onClick={() => void terminateTask(detail.id)} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-black text-rose-700"><Square size={14} />取消</button> : null}
                {detail && TERMINAL_STATUSES.has(detail.status) ? <button onClick={() => void rerunTask(detail.id)} className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-black text-violet-700"><RotateCcw size={14} />重跑</button> : null}
                <button onClick={() => detail && void loadDetail(detail.id)} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><RefreshCw size={15} className={detailLoading ? 'animate-spin' : ''} /></button>
                <button onClick={() => setDetailModalOpen(false)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={16} /></button>
              </div>
            </div>

            <div className="overflow-y-auto p-5">
              {detailLoading && !detail ? (
                <div className="flex items-center gap-2 py-12 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" />加载任务详情...</div>
              ) : detail ? (
                <div className="space-y-5">
                  {detail.error_reason ? <div className="flex gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700"><AlertCircle size={16} />{detail.error_reason}</div> : null}

                  <div className="grid gap-3 md:grid-cols-3">
                    <InfoRow label="模型" value={detail.model || '-'} />
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
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <h3 className="text-sm font-black text-slate-900">产物文件</h3>
                      <div className="mt-3 max-h-[420px] space-y-2 overflow-auto pr-1">
                        {artifacts.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">暂无产物</div> : artifacts.map((file) => (
                          <button key={file.path} onClick={() => void openArtifact(file.path)} className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-left hover:bg-slate-50">
                            <div className="flex items-center gap-2 text-xs font-black text-slate-700"><FileText size={14} /> <span className="break-all">{file.path}</span></div>
                            <div className="mt-1 text-[10px] text-slate-400">{formatBytes(file.size)}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <h3 className="text-sm font-black text-slate-900">{artifactContent?.path || '结果预览'}</h3>
                      {artifactContent ? (
                        <pre className="mt-3 max-h-[420px] overflow-auto rounded-2xl border border-theme-border bg-theme-elevated p-4 font-mono text-xs leading-6 text-theme-text-primary">{artifactContent.content}{artifactContent.truncated ? '\n\n... truncated ...' : ''}</pre>
                      ) : result?.results?.length ? (
                        <pre className="mt-3 max-h-[420px] overflow-auto rounded-2xl border border-theme-border bg-theme-elevated p-4 font-mono text-xs leading-6 text-theme-text-primary">{JSON.stringify(result.results, null, 2)}</pre>
                      ) : (
                        <div className="mt-3 rounded-2xl border border-dashed border-slate-200 p-12 text-center text-sm text-slate-400">选择左侧产物或等待任务生成结果。</div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <h3 className="text-sm font-black text-slate-900">事件</h3>
                    <div className="mt-3 max-h-56 space-y-2 overflow-auto pr-1">
                      {detail.events?.length ? detail.events.map((event) => (
                        <div key={event.id} className="rounded-xl bg-slate-50 p-3 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-black text-slate-700">{event.event_type}</span>
                            <span className="text-slate-400">{formatDate(event.created_at)}</span>
                          </div>
                          <div className="mt-1 text-slate-600">{event.message}</div>
                        </div>
                      )) : <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">暂无事件</div>}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-sm text-slate-400">暂无详情</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
