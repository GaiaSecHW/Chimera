import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ShieldCheck, AlertTriangle, Clock, ListChecks, RefreshCw, Play, Square, Trash2, RotateCcw, Plus, X, Search } from 'lucide-react';
import { framaCApi } from '../../clients/framaCVerify';
import type { FramaCTask, FramaCTaskDetail, FramaCResult, FramaCProjectStats, FramaCVerdict, FramaCStatus, FramaCTaskCreateRequest } from '../../clients/framaCVerify';
import { useServiceBuildVersion, ServiceBuildVersionBadge } from '../../components/execution/ServiceBuildVersion';
import { api } from '../../clients/api';
import { resolveBatchCreateCodeRoot, resolveCaseSourceFile, resolveCaseFunctionName, resolveCaseCweType } from './framaCVerifyBatchCreate';
import type { PendingVerifyCase, CodeRootMode } from './framaCVerifyBatchCreate';

const STATUS_LABELS: Record<string, string> = {
  pending: '等待中',
  running: '运行中',
  success: '成功',
  failed: '失败',
  cancelled: '已取消',
};

const VERDICT_LABELS: Record<string, string> = {
  confirmed: '已确认',
  ruled_out: '已排除',
  unresolved: '不可证',
  unverified: '未验证',
};

const STATUS_CSS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  running: 'bg-blue-100 text-blue-700 animate-pulse',
  success: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-rose-100 text-rose-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

const VERDICT_CSS: Record<string, string> = {
  confirmed: 'bg-rose-100 text-rose-700',
  ruled_out: 'bg-emerald-100 text-emerald-700',
  unresolved: 'bg-amber-100 text-amber-700',
  unverified: 'bg-slate-100 text-slate-500',
};

function fmtDate(s?: string | null): string {
  if (!s) return '—';
  try { return new Date(s).toLocaleString('zh-CN'); } catch { return s; }
}

function fmtDuration(s?: number | null): string {
  if (!s) return '—';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m${sec > 0 ? `${sec}s` : ''}`;
}

function VerdictBadge({ verdict }: { verdict?: string | null }) {
  const label = VERDICT_LABELS[verdict || ''] || verdict || '—';
  const cls = VERDICT_CSS[verdict || ''] || 'bg-slate-100 text-slate-500';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{label}</span>;
}

function StatusBadge({ status }: { status?: string | null }) {
  const label = STATUS_LABELS[status || ''] || status || '—';
  const cls = STATUS_CSS[status || ''] || 'bg-slate-100 text-slate-500';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{label}</span>;
}

function SummaryCard({ label, value, accent, icon }: { label: string; value: number; accent: string; icon: React.ReactNode }) {
  return (
    <div className={`rounded-lg border p-4 ${accent}`}>
      <div className="flex items-center gap-2 text-sm opacity-80">{icon}{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

interface FramaCVerifyPageProps {
  projectId: string;
}

function FramaCArtifactSection({ projectId, taskId }: { projectId: string; taskId: string }) {
  const [artifacts, setArtifacts] = useState<{ task_id: string; items: Array<{ path: string; size: number }> } | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  const [contentTruncated, setContentTruncated] = useState(false);
  const [contentOffset, setContentOffset] = useState(0);
  const [contentTotal, setContentTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadArtifacts = useCallback(async () => {
    try {
      const resp = await framaCApi.getArtifacts(projectId, taskId);
      setArtifacts(resp);
    } catch (e) { console.error(e); }
  }, [projectId, taskId]);

  const loadContent = useCallback(async (path: string) => {
    setLoading(true);
    try {
      const resp = await framaCApi.getArtifactContent(projectId, taskId, path, 0, 4096);
      setContent(resp.content || '');
      setContentTruncated(resp.truncated);
      setContentOffset(resp.offset);
      setContentTotal(resp.size);
      setSelectedPath(path);
    } catch (e) { setContent('加载失败'); setSelectedPath(path); }
    finally { setLoading(false); }
  }, [projectId, taskId]);

  const loadMore = useCallback(async () => {
    if (!selectedPath) return;
    try {
      const resp = await framaCApi.getArtifactContent(projectId, taskId, selectedPath, contentOffset + content.length, 4096);
      setContent((prev) => prev + (resp.content || ''));
      setContentTruncated(resp.truncated);
      setContentOffset(resp.offset);
    } catch (e) { console.error(e); }
  }, [projectId, taskId, selectedPath, contentOffset, content.length]);

  useEffect(() => { loadArtifacts(); }, [loadArtifacts]);

  if (!artifacts || !artifacts.items || artifacts.items.length === 0) return null;

  return (
    <div>
      <h3 className="font-medium mb-2">产物</h3>
      <div className="flex flex-wrap gap-2 mb-3">
        {artifacts.items.map((item) => (
          <button key={item.path} onClick={() => loadContent(item.path)} className={`px-2 py-1 rounded border text-xs ${selectedPath === item.path ? 'bg-blue-100 text-blue-700 border-blue-300' : 'hover:bg-slate-50'}`}>
            {item.path} ({(item.size / 1024).toFixed(1)}KB)
          </button>
        ))}
      </div>
      {selectedPath && (
        <div className="border rounded p-3 bg-slate-50 max-h-[200px] overflow-y-auto">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-slate-600">{selectedPath}</span>
            {contentTruncated && (
              <button onClick={loadMore} disabled={loading} className="text-xs text-blue-600 hover:underline">加载更多</button>
            )}
          </div>
          <pre className="text-xs whitespace-pre-wrap font-mono">{content}</pre>
        </div>
      )}
    </div>
  );
}

export const FramaCVerifyPage: React.FC<FramaCVerifyPageProps> = ({ projectId }) => {
  const [tasks, setTasks] = useState<FramaCTask[]>([]);
  const [stats, setStats] = useState<FramaCProjectStats | null>(null);
  const [resultsMap, setResultsMap] = useState<Record<string, FramaCResult>>({});
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [verdictFilter, setVerdictFilter] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [limit, setLimit] = useState<number>(50);
  const [offset, setOffset] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [detail, setDetail] = useState<FramaCTaskDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const buildVersion = useServiceBuildVersion(() => framaCApi.getHealth());

  const activeSSEs = useMemo(() => new Map<string, EventSource>(), []);

  const loadOverview = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [taskResp, statsResp, projectResults] = await Promise.all([
        framaCApi.listTasks(projectId, { status: statusFilter || undefined, verdict: verdictFilter || undefined, search: search || undefined, limit, offset }),
        framaCApi.getProjectStats(projectId),
        framaCApi.getProjectResults(projectId),
      ]);
      setTasks(taskResp.items || []);
      setTotal(taskResp.total || 0);
      setStats(statsResp);
      const rm: Record<string, FramaCResult> = {};
      for (const r of projectResults || []) {
        rm[r.task_id] = r;
      }
      setResultsMap(rm);
    } catch (e) {
      console.error('loadOverview error:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId, statusFilter, verdictFilter, search, limit, offset]);

  const subscribeSSE = useCallback((taskId: string) => {
    if (activeSSEs.has(taskId)) return;
    if (!projectId) return;
    const es = framaCApi.streamTask(projectId, taskId);
    activeSSEs.set(taskId, es);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.done || (data.status && isTerminal(data.status))) {
          es.close();
          activeSSEs.delete(taskId);
          loadOverview();
        } else if (data.status) {
          setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: data.status } : t));
        }
      } catch {}
    };
    es.onerror = () => {
      es.close();
      activeSSEs.delete(taskId);
    };
  }, [projectId, activeSSEs, loadOverview]);

  useEffect(() => {
    for (const task of tasks) {
      if (task.status === 'running' && !activeSSEs.has(task.id)) {
        subscribeSSE(task.id);
      }
    }
    return () => {
      for (const es of activeSSEs.values()) es.close();
      activeSSEs.clear();
    };
  }, [tasks, subscribeSSE, activeSSEs]);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  const openDetail = useCallback(async (taskId: string) => {
    if (!projectId) return;
    setDetailLoading(true);
    try {
      const taskDetail = await framaCApi.getTask(projectId, taskId);
      setDetail(taskDetail);
    } catch (e) {
      console.error('openDetail error:', e);
    } finally {
      setDetailLoading(false);
    }
  }, [projectId]);

  const terminateTask = useCallback(async (taskId: string) => {
    if (!projectId) return;
    try { await framaCApi.terminateTask(projectId, taskId); } catch (e) { console.error(e); }
    loadOverview();
  }, [projectId, loadOverview]);

  const rerunTask = useCallback(async (taskId: string) => {
    if (!projectId) return;
    try { await framaCApi.rerunTask(projectId, taskId); } catch (e) { console.error(e); }
    loadOverview();
  }, [projectId, loadOverview]);

  const deleteTask = useCallback(async (taskId: string) => {
    if (!projectId) return;
    try { await framaCApi.deleteTask(projectId, taskId); } catch (e) { console.error(e); }
    loadOverview();
  }, [projectId, loadOverview]);

  const isTerminal = (s: string) => s === 'success' || s === 'failed' || s === 'cancelled';

  const verdictForResult = (task: FramaCTask): FramaCVerdict | null => {
    const r = resultsMap[task.id];
    return r ? r.verdict : null;
  };

  const pageCount = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  const [showBatchCreate, setShowBatchCreate] = useState(false);
  const [showSingleCreate, setShowSingleCreate] = useState(false);
  const [pendingCases, setPendingCases] = useState<PendingVerifyCase[]>([]);
  const [selectedCases, setSelectedCases] = useState<Set<string>>(new Set());
  const [codeRootMode, setCodeRootMode] = useState<CodeRootMode>('auto');
  const [manualCodeRoot, setManualCodeRoot] = useState('');
  const [batchModel, setBatchModel] = useState('');
  const [batchProgress, setBatchProgress] = useState<Record<string, { status: string; taskId?: string; error?: string }>>({});
  const [batchCreating, setBatchCreating] = useState(false);
  const [singleSourceRoot, setSingleSourceRoot] = useState('');
  const [singleSourceFile, setSingleSourceFile] = useState('');
  const [singleFunctionName, setSingleFunctionName] = useState('');
  const [singleCweType, setSingleCweType] = useState('');
  const [singleTaskKey, setSingleTaskKey] = useState('');
  const [singleProblemDesc, setSingleProblemDesc] = useState('');
  const [singleModel, setSingleModel] = useState('');
  const [existingCaseIds, setExistingCaseIds] = useState<Set<string>>(new Set());
  const [caseSearch, setCaseSearch] = useState('');

  const loadPendingCases = useCallback(async () => {
    try {
      const cases = await api.domains.vuln.vuln.listCases({ current_stage: 'receive,triage', final_result: 'analyzing', limit: 500 });
      setPendingCases(cases?.items || []);
      if (projectId) {
        const taskCaseIds = await framaCApi.listTaskCaseIds(projectId);
        setExistingCaseIds(new Set(taskCaseIds.items || []));
      }
    } catch (e) { console.error('loadPendingCases error:', e); }
  }, [projectId]);

  const createTaskFromCase = useCallback(async (item: PendingVerifyCase): Promise<{ taskId?: string; error?: string }> => {
    if (!projectId) return { error: 'no project' };
    const codeRoot = resolveBatchCreateCodeRoot(item, codeRootMode, manualCodeRoot);
    if (!codeRoot) return { error: '无法解析source_root' };
    const payload: FramaCTaskCreateRequest = {
      source_root: codeRoot,
      source_file: resolveCaseSourceFile(item) || undefined,
      function_name: resolveCaseFunctionName(item) || undefined,
      cwe_type: resolveCaseCweType(item) || undefined,
      task_key: item.global_vuln_id || item.id,
      name: item.title || `verify-${item.id}`,
      model: batchModel || undefined,
      problem_description: item.subject?.name || undefined,
    };
    try {
      const task = await framaCApi.createTask(projectId, payload);
      return { taskId: task.id };
    } catch (e: any) {
      return { error: e.message || '创建失败' };
    }
  }, [projectId, codeRootMode, manualCodeRoot, batchModel]);

  const runBatchCreate = useCallback(async () => {
    setBatchCreating(true);
    setBatchProgress({});
    const concurrency = 3;
    const ids = Array.from(selectedCases);
    const progress: Record<string, { status: string; taskId?: string; error?: string }> = {};
    ids.forEach((id) => { progress[id] = { status: 'pending' }; });
    setBatchProgress(progress);
    const queue = [...ids];
    const workers = Array.from({ length: concurrency }, async () => {
      while (queue.length > 0) {
        const caseId = queue.shift()!;
        const item = pendingCases.find((c) => c.id === caseId || c.global_vuln_id === caseId);
        if (!item) { setBatchProgress((p) => ({ ...p, [caseId]: { status: 'failed', error: 'case not found' } })); continue; }
        setBatchProgress((p) => ({ ...p, [caseId]: { status: 'running' } }));
        const result = await createTaskFromCase(item);
        setBatchProgress((p) => ({ ...p, [caseId]: { status: result.error ? 'failed' : 'success', taskId: result.taskId, error: result.error } }));
      }
    });
    await Promise.all(workers);
    setBatchCreating(false);
    loadOverview();
  }, [selectedCases, pendingCases, createTaskFromCase, loadOverview]);

  const filteredCases = useMemo(() => {
    if (!caseSearch) return pendingCases;
    const q = caseSearch.toLowerCase();
    return pendingCases.filter((c) =>
      (c.id || '').toLowerCase().includes(q) ||
      (c.global_vuln_id || '').toLowerCase().includes(q) ||
      (c.title || '').toLowerCase().includes(q) ||
      (c.subject?.name || '').toLowerCase().includes(q)
    );
  }, [pendingCases, caseSearch]);

  const handleSingleCreate = useCallback(async () => {
    if (!projectId || !singleSourceRoot.trim() || !singleTaskKey.trim()) return;
    try {
      await framaCApi.createTask(projectId, {
        source_root: singleSourceRoot.trim(),
        source_file: singleSourceFile.trim() || undefined,
        function_name: singleFunctionName.trim() || undefined,
        cwe_type: singleCweType.trim() || undefined,
        task_key: singleTaskKey.trim(),
        name: `verify-${singleTaskKey.trim()}`,
        model: singleModel.trim() || undefined,
        problem_description: singleProblemDesc.trim() || undefined,
      });
      setShowSingleCreate(false);
      loadOverview();
    } catch (e) { console.error('single create error:', e); }
  }, [projectId, singleSourceRoot, singleSourceFile, singleFunctionName, singleCweType, singleTaskKey, singleModel, singleProblemDesc, loadOverview]);

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            形式化验证 (Frama-C)
            <ServiceBuildVersionBadge version={buildVersion} />
          </h1>
          <p className="text-sm text-slate-500 mt-1">C代码安全漏洞形式化验证 — Eva值分析 + WP演绎证明</p>
        </div>
        <button onClick={loadOverview} disabled={loading} className="flex items-center gap-1 px-3 py-1.5 rounded border text-sm hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />刷新
        </button>
        <button onClick={() => setShowBatchCreate(true)} className="flex items-center gap-1 px-3 py-1.5 rounded border bg-blue-600 text-white text-sm hover:bg-blue-700">
          <Plus className="w-4 h-4" />批量创建
        </button>
        <button onClick={() => setShowSingleCreate(true)} className="flex items-center gap-1 px-3 py-1.5 rounded border bg-emerald-600 text-white text-sm hover:bg-emerald-700">
          <Play className="w-4 h-4" />单条创建
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <SummaryCard label="总任务" value={stats.total_tasks} accent="border-slate-200 bg-white" icon={<ListChecks className="w-4 h-4" />} />
          <SummaryCard label="已确认" value={stats.confirmed} accent="border-rose-200 bg-rose-50" icon={<AlertTriangle className="w-4 h-4 text-rose-600" />} />
          <SummaryCard label="已排除" value={stats.ruled_out} accent="border-emerald-200 bg-emerald-50" icon={<ShieldCheck className="w-4 h-4 text-emerald-600" />} />
          <SummaryCard label="待处理" value={stats.pending + stats.running} accent="border-amber-200 bg-amber-50" icon={<Clock className="w-4 h-4 text-amber-600" />} />
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setOffset(0); }} className="border rounded px-2 py-1 text-sm">
          <option value="">全部状态</option>
          <option value="pending">等待中</option>
          <option value="running">运行中</option>
          <option value="success">成功</option>
          <option value="failed">失败</option>
          <option value="cancelled">已取消</option>
        </select>
        <select value={verdictFilter} onChange={(e) => { setVerdictFilter(e.target.value); setOffset(0); }} className="border rounded px-2 py-1 text-sm">
          <option value="">全部Verdict</option>
          <option value="confirmed">已确认</option>
          <option value="ruled_out">已排除</option>
          <option value="unresolved">不可证</option>
          <option value="unverified">未验证</option>
        </select>
        <input value={search} onChange={(e) => { setSearch(e.target.value); setOffset(0); }} placeholder="搜索 task_key / source_file" className="border rounded px-2 py-1 text-sm w-48" />
        <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setOffset(0); }} className="border rounded px-2 py-1 text-sm">
          <option value={25}>25条/页</option>
          <option value={50}>50条/页</option>
          <option value={100}>100条/页</option>
        </select>
        <span className="text-sm text-slate-500">共 {total} 条</span>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="px-3 py-2 text-left font-medium">名称</th>
              <th className="px-3 py-2 text-left font-medium">状态</th>
              <th className="px-3 py-2 text-left font-medium">Verdict</th>
              <th className="px-3 py-2 text-left font-medium">CWE</th>
              <th className="px-3 py-2 text-left font-medium">源码文件</th>
              <th className="px-3 py-2 text-left font-medium">函数</th>
              <th className="px-3 py-2 text-left font-medium">模型</th>
              <th className="px-3 py-2 text-left font-medium">耗时</th>
              <th className="px-3 py-2 text-left font-medium">创建时间</th>
              <th className="px-3 py-2 text-left font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-400">暂无数据</td></tr>
            )}
            {tasks.map((task) => {
              const result = resultsMap[task.id];
              const fcDetails = result?.frama_c_details;
              return (
                <tr key={task.id} className="border-b hover:bg-slate-50 cursor-pointer" onClick={() => openDetail(task.id)}>
                  <td className="px-3 py-2 truncate max-w-[180px]">{task.name || task.task_key}</td>
                  <td className="px-3 py-2"><StatusBadge status={task.status} /></td>
                  <td className="px-3 py-2"><VerdictBadge verdict={verdictForResult(task)} /></td>
                  <td className="px-3 py-2">{task.cwe_type || '—'}</td>
                  <td className="px-3 py-2 truncate max-w-[120px]">{task.source_file || '—'}</td>
                  <td className="px-3 py-2 truncate max-w-[100px]">{task.function_name || '—'}</td>
                  <td className="px-3 py-2">{task.model || '默认'}</td>
                  <td className="px-3 py-2">{fmtDuration(fcDetails?.duration_seconds)}</td>
                  <td className="px-3 py-2">{fmtDate(task.created_at)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      {task.status === 'running' && (
                        <button onClick={(e) => { e.stopPropagation(); terminateTask(task.id); }} className="p-1 rounded hover:bg-rose-50" title="终止">
                          <Square className="w-3.5 h-3.5 text-rose-600" />
                        </button>
                      )}
                      {isTerminal(task.status) && (
                        <>
                          <button onClick={(e) => { e.stopPropagation(); rerunTask(task.id); }} className="p-1 rounded hover:bg-blue-50" title="重跑">
                            <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }} className="p-1 rounded hover:bg-rose-50" title="删除">
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={currentPage <= 1} onClick={() => setOffset(Math.max(0, offset - limit))} className="px-3 py-1 rounded border text-sm disabled:opacity-50">上一页</button>
          <span className="text-sm text-slate-600">{currentPage} / {pageCount}</span>
          <button disabled={currentPage >= pageCount} onClick={() => setOffset(offset + limit)} className="px-3 py-1 rounded border text-sm disabled:opacity-50">下一页</button>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-y-auto p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">任务详情</h2>
              <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-slate-500">ID:</span> {detail.id}</div>
              <div><span className="text-slate-500">状态:</span> <StatusBadge status={detail.status} /></div>
              <div><span className="text-slate-500">Verdict:</span> <VerdictBadge verdict={detail.results?.[0]?.verdict} /></div>
              <div><span className="text-slate-500">CWE:</span> {detail.cwe_type || '—'}</div>
              <div><span className="text-slate-500">源码:</span> <span className="truncate">{detail.source_root}/{detail.source_file || ''}</span></div>
              <div><span className="text-slate-500">函数:</span> {detail.function_name || '—'}</div>
              <div><span className="text-slate-500">模型:</span> {detail.model || '默认'}</div>
              <div><span className="text-slate-500">Task Key:</span> {detail.task_key}</div>
            </div>

            {detail.results?.[0]?.dimensions && (
              <div>
                <h3 className="font-medium mb-2">四维验证矩阵</h3>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(detail.results[0].dimensions).map(([key, dim]) => {
                    const labels: Record<string, string> = { code_accurate: '代码准确性', path_reachable: '路径可达性', unmitigated: '未缓解性', security_impact: '安全影响' };
                    const statusIcon = dim.status === true ? '✓' : dim.status === false ? '✗' : '—';
                    const statusColor = dim.status === true ? 'text-rose-600' : dim.status === false ? 'text-emerald-600' : 'text-slate-400';
                    const bg = dim.status === true ? 'bg-rose-50 border-rose-200' : dim.status === false ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200';
                    return (
                      <div key={key} className={`rounded border p-3 ${bg}`}>
                        <div className="flex items-center gap-1 font-medium">
                          <span className={statusColor}>{statusIcon}</span>
                          {labels[key] || key}
                        </div>
                        <div className="text-xs text-slate-600 mt-1">{dim.detail || '—'}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {detail.results?.[0]?.raw_result?.root_cause_summary && (
              <div>
                <h3 className="font-medium mb-1">根因总结</h3>
                <p className="text-sm text-slate-700 bg-slate-50 rounded p-3">{detail.results[0].raw_result.root_cause_summary}</p>
              </div>
            )}

            {detail.results?.[0]?.ruled_out_by && (
              <div className="text-sm">
                <span className="text-slate-500">排除维度:</span>
                <span className="ml-1 text-emerald-600">{(detail.results[0].ruled_out_by as string[]).join(', ')}</span>
              </div>
            )}

            {detail.results?.[0]?.frama_c_details && (() => {
              const fc = detail.results[0].frama_c_details!;
              return (
                <div>
                  <h3 className="font-medium mb-2">Frama-C 详情</h3>
                  <div className="grid grid-cols-4 gap-3 text-sm">
                    <div className="border rounded p-2 text-center">
                      <div className="text-slate-500">Eva报警</div>
                      <div className="font-bold">{fc.eva_alarm_count ?? '—'}</div>
                    </div>
                    <div className="border rounded p-2 text-center">
                      <div className="text-slate-500">WP证明率</div>
                      <div className="font-bold">{fc.wp_proof_ratio != null ? `${(fc.wp_proof_ratio * 100).toFixed(0)}%` : '—'}</div>
                    </div>
                    <div className="border rounded p-2 text-center">
                      <div className="text-slate-500">步骤</div>
                      <div className="font-bold">{fc.steps_completed ?? '—'}/11</div>
                    </div>
                    <div className="border rounded p-2 text-center">
                      <div className="text-slate-500">耗时</div>
                      <div className="font-bold">{fmtDuration(fc.duration_seconds)}</div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {detail.results?.[0]?.evidence && detail.results[0].evidence!.length > 0 && (
              <div>
                <h3 className="font-medium mb-2">Evidence</h3>
                <div className="space-y-2">
                  {detail.results[0].evidence!.map((ev, i) => (
                    <div key={i} className="text-sm border rounded p-2 bg-slate-50">
                      <span className="font-medium text-slate-700">[{ev.type}]</span>
                      <span className="ml-1">{ev.claim} → {ev.finding}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detail.results?.[0]?.exploitability && (
              <div>
                <h3 className="font-medium mb-2">可利用性评估</h3>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div><span className="text-slate-500">前置条件:</span> {detail.results[0].exploitability!.preconditions || '—'}</div>
                  <div><span className="text-slate-500">触发复杂度:</span> {detail.results[0].exploitability!.trigger_complexity || '—'}</div>
                  <div><span className="text-slate-500">最坏影响:</span> {detail.results[0].exploitability!.worst_case_impact || '—'}</div>
                </div>
              </div>
            )}

            {detail.attempts && detail.attempts.length > 0 && (
              <div>
                <h3 className="font-medium mb-2">Attempt 历史</h3>
                <div className="space-y-1">
                  {detail.attempts.map((att) => (
                    <div key={att.id} className="flex items-center gap-3 text-sm border rounded p-2">
                      <span className="font-mono text-slate-500"># {att.attempt_number}</span>
                      <StatusBadge status={att.status} />
                      <span className="text-slate-500">{att.worker_id || '—'}</span>
                      <span>{fmtDate(att.started_at)} → {fmtDate(att.completed_at)}</span>
                      {att.failure_reason && <span className="text-rose-600 text-xs">{att.failure_reason.name}: {att.failure_reason.message}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detail && projectId && (
              <FramaCArtifactSection projectId={projectId} taskId={detail.id} />
            )}

            <div className="flex items-center gap-2 pt-2">
              {detail.status === 'running' && (
                <button onClick={() => { terminateTask(detail.id); setDetail(null); }} className="flex items-center gap-1 px-3 py-1.5 rounded border text-sm text-rose-600 hover:bg-rose-50">
                  <Square className="w-4 h-4" />终止
                </button>
              )}
              {isTerminal(detail.status) && (
                <>
                  <button onClick={() => { rerunTask(detail.id); setDetail(null); }} className="flex items-center gap-1 px-3 py-1.5 rounded border text-sm text-blue-600 hover:bg-blue-50">
                    <RotateCcw className="w-4 h-4" />重跑
                  </button>
                  <button onClick={() => { deleteTask(detail.id); setDetail(null); }} className="flex items-center gap-1 px-3 py-1.5 rounded border text-sm text-rose-600 hover:bg-rose-50">
                    <Trash2 className="w-4 h-4" />删除
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showBatchCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => { if (!batchCreating) setShowBatchCreate(false); }}>
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-y-auto p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">批量创建形式化验证任务</h2>
              {!batchCreating && <button onClick={() => setShowBatchCreate(false)} className="text-slate-400 hover:text-slate-600 text-xl">×</button>}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-500">source_root:</span>
                <select value={codeRootMode} onChange={(e) => setCodeRootMode(e.target.value as CodeRootMode)} className="border rounded px-2 py-1 text-sm" disabled={batchCreating}>
                  <option value="auto">自动 (从案例元数据)</option>
                  <option value="manual">手动指定</option>
                </select>
                {codeRootMode === 'manual' && (
                  <input value={manualCodeRoot} onChange={(e) => setManualCodeRoot(e.target.value)} placeholder="手动输入source_root" className="border rounded px-2 py-1 text-sm w-48" disabled={batchCreating} />
                )}
              </div>
              <input value={batchModel} onChange={(e) => setBatchModel(e.target.value)} placeholder="模型 (可选)" className="border rounded px-2 py-1 text-sm w-36" disabled={batchCreating} />
              <input value={caseSearch} onChange={(e) => setCaseSearch(e.target.value)} placeholder="搜索案例" className="border rounded px-2 py-1 text-sm w-36" />
              <button onClick={loadPendingCases} className="px-2 py-1 rounded border text-sm hover:bg-slate-50" disabled={batchCreating}>加载案例</button>
            </div>

            <div className="border rounded-lg overflow-hidden max-h-[40vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium w-8">
                      <input type="checkbox" checked={selectedCases.size === filteredCases.length && filteredCases.length > 0} onChange={(e) => {
                        if (e.target.checked) setSelectedCases(new Set(filteredCases.map((c) => c.global_vuln_id || c.id)));
                        else setSelectedCases(new Set());
                      }} disabled={batchCreating} />
                    </th>
                    <th className="px-2 py-1.5 text-left font-medium">案例ID</th>
                    <th className="px-2 py-1.5 text-left font-medium">CWE</th>
                    <th className="px-2 py-1.5 text-left font-medium">文件</th>
                    <th className="px-2 py-1.5 text-left font-medium">函数</th>
                    <th className="px-2 py-1.5 text-left font-medium">已有任务</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCases.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-slate-400">暂无案例 (点击"加载案例")</td></tr>}
                  {filteredCases.map((c) => {
                    const caseId = c.global_vuln_id || c.id;
                    const hasTask = existingCaseIds.has(caseId);
                    const progress = batchProgress[caseId];
                    return (
                      <tr key={c.id} className={`border-b ${hasTask ? 'bg-slate-50 opacity-60' : 'hover:bg-slate-50'}`}>
                        <td className="px-2 py-1">
                          <input type="checkbox" checked={selectedCases.has(caseId)} disabled={hasTask || batchCreating} onChange={(e) => {
                            const next = new Set(selectedCases);
                            if (e.target.checked) next.add(caseId); else next.delete(caseId);
                            setSelectedCases(next);
                          }} />
                        </td>
                        <td className="px-2 py-1 truncate max-w-[120px]">{caseId}</td>
                        <td className="px-2 py-1">{resolveCaseCweType(c) || '—'}</td>
                        <td className="px-2 py-1 truncate max-w-[100px]">{resolveCaseSourceFile(c) || '—'}</td>
                        <td className="px-2 py-1 truncate max-w-[80px]">{resolveCaseFunctionName(c) || '—'}</td>
                        <td className="px-2 py-1">{hasTask ? '✓' : progress?.status === 'success' ? '✓ 已创建' : progress?.status === 'failed' ? `✗ ${progress.error}` : progress?.status === 'running' ? '…' : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">已选择 {selectedCases.size} 条 (排除已有任务)</span>
              <div className="flex items-center gap-2">
                {!batchCreating && (
                  <button onClick={runBatchCreate} disabled={selectedCases.size === 0} className="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50">
                    开始创建 (并发3)
                  </button>
                )}
                {batchCreating && <span className="text-sm text-blue-600 animate-pulse">创建中...</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {showSingleCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowSingleCreate(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">单条创建验证任务</h2>
              <button onClick={() => setShowSingleCreate(false)} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">source_root <span className="text-rose-500">*</span></label>
                <input value={singleSourceRoot} onChange={(e) => setSingleSourceRoot(e.target.value)} placeholder="/data/files/{project_id}/..." className="border rounded px-3 py-1.5 text-sm w-full" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">source_file</label>
                  <input value={singleSourceFile} onChange={(e) => setSingleSourceFile(e.target.value)} placeholder="src/main.c" className="border rounded px-3 py-1.5 text-sm w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">function_name</label>
                  <input value={singleFunctionName} onChange={(e) => setSingleFunctionName(e.target.value)} placeholder="parse_config" className="border rounded px-3 py-1.5 text-sm w-full" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">cwe_type</label>
                  <input value={singleCweType} onChange={(e) => setSingleCweType(e.target.value)} placeholder="CWE-125" className="border rounded px-3 py-1.5 text-sm w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">task_key <span className="text-rose-500">*</span></label>
                  <input value={singleTaskKey} onChange={(e) => setSingleTaskKey(e.target.value)} placeholder="vuln_id" className="border rounded px-3 py-1.5 text-sm w-full" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">problem_description</label>
                <textarea value={singleProblemDesc} onChange={(e) => setSingleProblemDesc(e.target.value)} placeholder="漏洞问题描述" className="border rounded px-3 py-1.5 text-sm w-full h-20" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">model (可选)</label>
                <input value={singleModel} onChange={(e) => setSingleModel(e.target.value)} placeholder="默认" className="border rounded px-3 py-1.5 text-sm w-full" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowSingleCreate(false)} className="px-3 py-1.5 rounded border text-sm">取消</button>
              <button onClick={handleSingleCreate} disabled={!singleSourceRoot.trim() || !singleTaskKey.trim()} className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50">创建</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
