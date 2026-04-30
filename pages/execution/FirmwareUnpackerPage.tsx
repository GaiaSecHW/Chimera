import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Clock,
  FolderOpen, Loader2, Package, Play, RefreshCw, Server,
  Square, Trash2, XCircle, Zap, ListTodo, RotateCcw, Search, X,
} from 'lucide-react';
import { api } from '../../clients/api';
import { FirmwareUnpackTask, TaskListQuery } from '../../clients/firmwareUnpacker';
import { StatusBadge } from '../../components/StatusBadge';

interface Props { projectId: string; }

const fwApi = api.domains.execution.firmwareUnpacker;

const TERMINAL = new Set(['success', 'failed', 'cancelled', 'max_retries_reached']);
const isTerminal = (s: string) => TERMINAL.has(s);

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'pending',   label: '排队中' },
  { value: 'running',   label: '运行中' },
  { value: 'cancelling',label: '取消中' },
  { value: 'cancelled', label: '已取消' },
  { value: 'success',   label: '成功' },
  { value: 'failed',    label: '失败' },
];

function fmtTime(iso: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('zh-CN', { hour12: false });
}
function fmtDuration(s: string | null, e: string | null) {
  if (!s) return '-';
  const ms = (e ? new Date(e).getTime() : Date.now()) - new Date(s).getTime();
  const sec = Math.round(ms / 1000);
  return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m${sec % 60}s`;
}

function TaskStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { icon: React.ReactNode; cls: string; label: string }> = {
    pending:            { icon: <Clock size={12} />,   cls: 'bg-amber-50 text-amber-700 border-amber-200',  label: '排队中' },
    running:            { icon: <Loader2 size={12} className="animate-spin" />, cls: 'bg-blue-50 text-blue-700 border-blue-200',   label: '运行中' },
    cancelling:         { icon: <Loader2 size={12} className="animate-spin" />, cls: 'bg-orange-50 text-orange-700 border-orange-200', label: '取消中' },
    cancelled:          { icon: <XCircle size={12} />,cls: 'bg-slate-50 text-slate-500 border-slate-200',  label: '已取消' },
    success:            { icon: <CheckCircle2 size={12} />, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: '成功' },
    failed:             { icon: <XCircle size={12} />,cls: 'bg-red-50 text-red-700 border-red-200',       label: '失败' },
    max_retries_reached:{ icon: <XCircle size={12} />,cls: 'bg-red-50 text-red-700 border-red-200',       label: '超限' },
  };
  const { icon, cls, label } = cfg[status] ?? { icon: null, cls: 'bg-slate-50 text-slate-500', label: status };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${cls}`}>
      {icon} {label}
    </span>
  );
}

// ──────────────────────────────────────────────────────────
// Task row
// ──────────────────────────────────────────────────────────
function TaskRow({
  task, selected, onSelect, onRefresh, onCancel, onDelete, onRetry,
}: {
  task: FirmwareUnpackTask;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onRefresh: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const running = !isTerminal(task.status);

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors ${selected ? 'border-blue-300 bg-blue-50/30' : 'border-slate-200 bg-white'}`}>
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-slate-50"
        onClick={() => setExpanded(v => !v)}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={e => { e.stopPropagation(); onSelect(task.id, e.target.checked); }}
          onClick={e => e.stopPropagation()}
          className="rounded border-slate-300 text-blue-600"
        />
        <TaskStatusBadge status={task.status} />
        <span className="flex-1 min-w-0 font-mono text-xs text-slate-600 truncate">{task.firmware_path}</span>
        {task.worker_id && (
          <span className="hidden xl:inline text-[10px] text-slate-400 truncate max-w-[120px]">{task.worker_id}</span>
        )}
        {running && <Loader2 size={11} className="text-blue-400 animate-spin shrink-0" />}
        <span className="text-[10px] text-slate-400 shrink-0">{fmtTime(task.created_at)}</span>
        {expanded ? <ChevronUp size={13} className="text-slate-400 shrink-0" /> : <ChevronDown size={13} className="text-slate-400 shrink-0" />}
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-3 py-3 space-y-3 bg-white">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            {[
              ['任务 ID', <span className="font-mono">{task.id}</span>],
              ['Worker', task.worker_id || '-'],
              ['固件路径', <span className="font-mono break-all">{task.firmware_path}</span>],
              ['输出目录', <span className="font-mono break-all">{task.output_path}</span>],
              ['开始时间', fmtTime(task.started_at)],
              ['耗时', fmtDuration(task.started_at, task.completed_at)],
              ['完成时间', fmtTime(task.completed_at)],
              ['ai 轮次', task.rounds ?? '-'],
            ].map(([label, val], i) => (
              <div key={i}>
                <p className="text-slate-400 font-semibold mb-0.5">{label}</p>
                <div className="text-slate-700">{val}</div>
              </div>
            ))}
          </div>

          {task.result_message && (
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-700 leading-6">
              {task.result_message}
            </div>
          )}
          {task.error_message && (
            <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700 font-mono leading-6">
              {task.error_message}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {running && (
              <>
                <button onClick={() => onRefresh(task.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  <RefreshCw size={11} /> 刷新
                </button>
                <button onClick={() => onCancel(task.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-100">
                  <Square size={11} /> 取消
                </button>
              </>
            )}
            {(task.status === 'failed' || task.status === 'cancelled' || task.status === 'max_retries_reached') && (
              <button onClick={() => onRetry(task.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100">
                <RotateCcw size={11} /> 重试
              </button>
            )}
            <button onClick={() => onDelete(task.id)}
              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100">
              <Trash2 size={11} /> 删除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────────────────
export const FirmwareUnpackerPage: React.FC<Props> = ({ projectId }) => {
  // Submit form
  const [firmwarePath, setFirmwarePath] = useState('/data/firmware/sample-firmware.tar.gz');
  const [outputPath, setOutputPath]     = useState('/tmp/firmware-unpacker-output');
  const [submitting, setSubmitting]     = useState(false);
  const [submitResult, setSubmitResult] = useState<string>('');
  const [submitError, setSubmitError]   = useState<string>('');

  // Health
  const [health, setHealth] = useState<'checking' | 'healthy' | 'error'>('checking');
  const [healthMsg, setHealthMsg] = useState('检查中...');

  // Task list
  const [tasks,        setTasks]        = useState<FirmwareUnpackTask[]>([]);
  const [total,        setTotal]        = useState(0);
  const [loading,      setLoading]      = useState(false);
  const [listError,    setListError]    = useState('');
  const [selected,     setSelected]     = useState<Set<string>>(new Set());

  // Filters
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterWorker, setFilterWorker] = useState('');
  const [page,         setPage]         = useState(0);
  const PAGE_SIZE = 20;

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const taskItems = Array.isArray(tasks) ? tasks : [];

  // ── health ──────────────────────────────────────────────
  const checkHealth = async () => {
    setHealth('checking');
    try {
      const r = await fwApi.getHealth();
      setHealth(r.status === 'ok' ? 'healthy' : 'error');
      setHealthMsg(r.status === 'ok' ? `服务可用 (Worker: ${r.worker_id || '?'})` : `状态异常: ${r.status}`);
    } catch (e: any) {
      setHealth('error');
      setHealthMsg(e?.message || '服务不可用');
    }
  };

  // ── task list ────────────────────────────────────────────
  const fetchTasks = useCallback(async (resetPage = false) => {
    setLoading(true);
    setListError('');
    const p = resetPage ? 0 : page;
    if (resetPage) setPage(0);
    try {
      const q: TaskListQuery = {
        limit: PAGE_SIZE,
        offset: p * PAGE_SIZE,
      };
      if (projectId)     q.project_id = projectId;
      if (filterStatus)  q.status     = filterStatus;
      if (filterWorker)  q.worker_id  = filterWorker;
      if (filterSearch)  q.search     = filterSearch;
      const res = await fwApi.listTasks(q);
      setTasks(res.items);
      setTotal(res.total);
    } catch (e: any) {
      setListError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, projectId, filterStatus, filterSearch, filterWorker]);

  const refreshOne = useCallback(async (id: string) => {
    try {
      const t = await fwApi.getTask(id);
      setTasks(prev => prev.map(x => x.id === id ? t : x));
    } catch {}
  }, []);

  // ── auto-poll running tasks ──────────────────────────────
  const hasRunning = useMemo(() => taskItems.some(t => !isTerminal(t.status)), [taskItems]);

  useEffect(() => {
    if (hasRunning) {
      pollingRef.current = setInterval(() => {
        taskItems.filter(t => !isTerminal(t.status)).forEach(t => refreshOne(t.id));
      }, 5000);
    } else {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [hasRunning, taskItems, refreshOne]);

  useEffect(() => { checkHealth(); fetchTasks(true); }, []);
  useEffect(() => { fetchTasks(); }, [page]);

  // ── submit ───────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError('');
    setSubmitResult('');
    try {
      const r = await fwApi.unpack({
        firmware_path: firmwarePath.trim(),
        output_path: outputPath.trim(),
        project_id: projectId || undefined,
      });
      setSubmitResult(`任务已提交！ID: ${r.task_id}`);
      setTimeout(() => fetchTasks(true), 800);
    } catch (e: any) {
      setSubmitError(e?.message || '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  // ── task control ─────────────────────────────────────────
  const handleCancel = async (id: string) => {
    try { await fwApi.cancelTask(id); refreshOne(id); } catch (e: any) { alert(`取消失败: ${e?.message}`); }
  };
  const handleDelete = async (id: string) => {
    if (!confirm('确认删除？')) return;
    try {
      await fwApi.deleteTask(id);
      setTasks(prev => prev.filter(t => t.id !== id));
      setSelected(prev => { const s = new Set(prev); s.delete(id); return s; });
    } catch (e: any) { alert(`删除失败: ${e?.message}`); }
  };
  const handleRetry = async (id: string) => {
    try {
      const r = await fwApi.retryTask(id);
      setSubmitResult(`已重试，新任务 ID: ${r.new_task_id}`);
      setTimeout(() => fetchTasks(true), 800);
    } catch (e: any) { alert(`重试失败: ${e?.message}`); }
  };
  const handleBatchDelete = async () => {
    if (!selected.size || !confirm(`确认删除 ${selected.size} 条记录？`)) return;
    try {
      await fwApi.batchDelete([...selected]);
      setSelected(new Set());
      fetchTasks(true);
    } catch (e: any) { alert(`批量删除失败: ${e?.message}`); }
  };

  // ── select ───────────────────────────────────────────────
  const toggleSelect = (id: string, checked: boolean) =>
    setSelected(prev => { const s = new Set(prev); checked ? s.add(id) : s.delete(id); return s; });
  const toggleAll = (checked: boolean) =>
    setSelected(checked ? new Set(taskItems.map(t => t.id)) : new Set());

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const PRESETS = [
    { label: 'tar.gz', fw: '/data/firmware/sample.tar.gz', out: '/tmp/fw-out/sample' },
    { label: '路由器', fw: '/data/firmware/router.bin',    out: '/tmp/fw-out/router' },
    { label: '摄像头', fw: '/data/firmware/camera.bin',    out: '/tmp/fw-out/camera' },
  ];

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Package size={18} className="text-indigo-600" />
          <div>
            <h2 className="text-sm font-bold text-slate-800">固件解包 · 任务列表</h2>
            {hasRunning && <p className="text-xs text-blue-600 font-semibold animate-pulse">● 有任务运行中，每5秒自动刷新</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => fetchTasks(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <RefreshCw size={12} /> 刷新列表
          </button>
          <button onClick={checkHealth} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
            <Server size={12} /> 刷新状态
          </button>
        </div>
      </div>

      {/* Top row: submit + service status */}
      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        {/* Submit */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-1.5"><Play size={13} className="text-blue-600" />提交解包任务</p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {PRESETS.map(p => (
              <button key={p.label} type="button"
                onClick={() => { setFirmwarePath(p.fw); setOutputPath(p.out); }}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100">
                <Zap size={9} className="text-amber-500" />{p.label}
              </button>
            ))}
          </div>
          <form className="space-y-3" onSubmit={handleSubmit}>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 mb-1 block">固件文件路径</label>
              <div className="relative">
                <FolderOpen size={12} className="absolute left-3 top-3 text-slate-400 pointer-events-none" />
                <input value={firmwarePath} onChange={e => setFirmwarePath(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-8 pr-3 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 mb-1 block">输出目录</label>
              <div className="relative">
                <FolderOpen size={12} className="absolute left-3 top-3 text-slate-400 pointer-events-none" />
                <input value={outputPath} onChange={e => setOutputPath(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-8 pr-3 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
              </div>
            </div>
            {submitResult && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                <CheckCircle2 size={13} /> {submitResult}
              </div>
            )}
            {submitError && (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <AlertCircle size={13} /> {submitError}
              </div>
            )}
            <div className="flex gap-2">
              <button type="submit" disabled={submitting || !firmwarePath || !outputPath}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed">
                {submitting ? <><Loader2 size={12} className="animate-spin" />提交中...</> : <><Play size={12} />提交任务</>}
              </button>
            </div>
          </form>
        </div>

        {/* Health + Stats */}
        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5"><Server size={13} className="text-emerald-600" />服务状态</p>
            <div className="flex items-center gap-2">
              <StatusBadge status={health} />
              <span className="text-xs text-slate-600">{healthMsg}</span>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="grid grid-cols-4 gap-1 text-center">
              {[
                ['总计', total, 'text-slate-700'],
                ['运行', taskItems.filter(t => t.status === 'running').length, 'text-blue-600'],
                ['成功', taskItems.filter(t => t.status === 'success').length, 'text-emerald-600'],
                ['失败', taskItems.filter(t => t.status === 'failed').length, 'text-red-600'],
              ].map(([l, n, c]) => (
                <div key={String(l)} className="rounded-xl bg-slate-50 py-1.5">
                  <p className={`text-base font-black ${c}`}>{n}</p>
                  <p className="text-[10px] text-slate-400">{l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Task list */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <ListTodo size={14} className="text-violet-600 shrink-0" />
          <span className="text-xs font-bold text-slate-700 mr-1">任务列表</span>

          {/* Status filter */}
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); fetchTasks(true); }}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none">
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          {/* Search */}
          <div className="relative">
            <Search size={11} className="absolute left-2.5 top-2 text-slate-400 pointer-events-none" />
            <input value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchTasks(true)}
              placeholder="搜索固件路径..."
              className="rounded-lg border border-slate-200 bg-white pl-7 pr-8 py-1.5 text-xs text-slate-700 outline-none w-44 focus:border-blue-300"
            />
            {filterSearch && (
              <button onClick={() => { setFilterSearch(''); fetchTasks(true); }} className="absolute right-2 top-2 text-slate-400 hover:text-slate-600">
                <X size={11} />
              </button>
            )}
          </div>

          {/* Worker filter */}
          <input value={filterWorker}
            onChange={e => setFilterWorker(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchTasks(true)}
            placeholder="Worker ID 过滤..."
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none w-36 focus:border-blue-300"
          />

          <button onClick={() => fetchTasks(true)}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-white">
            <Search size={11} /> 查询
          </button>

          <span className="ml-auto text-[11px] text-slate-400">共 {total} 条</span>

          {selected.size > 0 && (
            <button onClick={handleBatchDelete}
              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100">
              <Trash2 size={11} /> 批量删除 ({selected.size})
            </button>
          )}
        </div>

        {listError && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertCircle size={13} /> {listError}
          </div>
        )}

        {/* Select all */}
        {taskItems.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 mb-2 bg-slate-50 rounded-xl">
            <input type="checkbox"
              checked={selected.size === taskItems.length && taskItems.length > 0}
              onChange={e => toggleAll(e.target.checked)}
              className="rounded border-slate-300 text-blue-600"
            />
            <span className="text-xs text-slate-500">全选当前页 ({taskItems.length} 条)</span>
          </div>
        )}

        {loading && taskItems.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader2 size={20} className="animate-spin mr-2" /> 加载中...
          </div>
        ) : taskItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-xs text-slate-400">
            暂无任务记录
          </div>
        ) : (
          <div className="space-y-1.5">
            {taskItems.map(t => (
              <TaskRow key={t.id} task={t}
                selected={selected.has(t.id)}
                onSelect={toggleSelect}
                onRefresh={refreshOne}
                onCancel={handleCancel}
                onDelete={handleDelete}
                onRetry={handleRetry}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50">
              上一页
            </button>
            <span className="text-xs text-slate-500">{page + 1} / {totalPages}</span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50">
              下一页
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
