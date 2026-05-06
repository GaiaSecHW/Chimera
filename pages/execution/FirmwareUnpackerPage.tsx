import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Clock,
  FolderOpen, Loader2, Package, Play, RefreshCw, Server,
  Square, Trash2, XCircle, ListTodo, RotateCcw, Search, X, Briefcase, Plus,
} from 'lucide-react';
import { api } from '../../clients/api';
import { FirmwareUnpackTask, TaskListQuery } from '../../clients/firmwareUnpacker';
import { SecurityProject } from '../../types/types';
import { FileServerPickerModal } from '../../components/assets/FileServerPickerModal';
import { StatusBadge } from '../../components/StatusBadge';
import { useUiFeedback } from '../../components/UiFeedback';

interface Props {
  projectId: string;
  projects?: SecurityProject[];
}

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

const DEFAULT_OUTPUT_PATH = '/tmp/firmware-unpacker-output';
const FILESERVER_CONTAINER_ROOT = '/data/files';

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
  const canDelete = isTerminal(task.status);

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
                  <Square size={11} /> 停止
                </button>
              </>
            )}
            {(task.status === 'failed' || task.status === 'cancelled' || task.status === 'max_retries_reached') && (
              <button onClick={() => onRetry(task.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100">
                <RotateCcw size={11} /> 重试
              </button>
            )}
            {canDelete && (
              <button onClick={() => onDelete(task.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100">
                <Trash2 size={11} /> 删除
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────────────────
export const FirmwareUnpackerPage: React.FC<Props> = ({ projectId, projects = [] }) => {
  const { notify, feedbackNodes } = useUiFeedback();

  // Submit form
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createProjectId, setCreateProjectId] = useState(projectId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'firmware' | 'output'>('firmware');
  const [firmwarePath, setFirmwarePath] = useState('');
  const [outputPath, setOutputPath]     = useState(DEFAULT_OUTPUT_PATH);
  const [submitting, setSubmitting]     = useState(false);

  // Projects
  const [projectItems, setProjectItems] = useState<SecurityProject[]>(projects);
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectError, setProjectError] = useState('');
  const [activeProjectId, setActiveProjectId] = useState(projectId);

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
  const hasPropProjects = Array.isArray(projects) && projects.length > 0;
  const activeProject = useMemo(
    () => projectItems.find((item) => item.id === activeProjectId) || null,
    [projectItems, activeProjectId],
  );
  const createProject = useMemo(
    () => projectItems.find((item) => item.id === createProjectId) || null,
    [projectItems, createProjectId],
  );

  const resetCreateForm = useCallback((nextProjectId?: string) => {
    const resolvedProjectId = nextProjectId || activeProjectId || projectId || projectItems[0]?.id || '';
    setCreateProjectId(resolvedProjectId);
    setFirmwarePath('');
    setOutputPath(DEFAULT_OUTPUT_PATH);
  }, [activeProjectId, projectId, projectItems]);

  const openCreateModal = useCallback(() => {
    resetCreateForm();
    setCreateModalOpen(true);
  }, [resetCreateForm]);

  const loadProjects = useCallback(async () => {
    if (hasPropProjects) {
      setProjectItems(projects);
      setProjectError('');
      return;
    }
    setProjectLoading(true);
    setProjectError('');
    try {
      const res = await api.domains.project.projects.list();
      setProjectItems(Array.isArray(res.projects) ? res.projects : []);
    } catch (e: any) {
      setProjectError(e?.message || '加载项目列表失败');
    } finally {
      setProjectLoading(false);
    }
  }, [hasPropProjects, projects]);

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
    if (!activeProjectId) {
      if (resetPage) setPage(0);
      setTasks([]);
      setTotal(0);
      setSelected(new Set());
      setListError('');
      setLoading(false);
      return;
    }

    setLoading(true);
    setListError('');
    const p = resetPage ? 0 : page;
    if (resetPage) setPage(0);
    try {
      const q: TaskListQuery = {
        project_id: activeProjectId,
        limit: PAGE_SIZE,
        offset: p * PAGE_SIZE,
      };
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
  }, [page, activeProjectId, filterStatus, filterSearch, filterWorker]);

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

  useEffect(() => {
    setProjectItems(projects);
  }, [projects]);

  useEffect(() => {
    setActiveProjectId(projectId);
  }, [projectId]);

  useEffect(() => {
    if (projectItems.length === 0) {
      if (activeProjectId) {
        setActiveProjectId('');
      }
      return;
    }

    const matchedActiveProject = projectItems.some((item) => item.id === activeProjectId);
    if (matchedActiveProject) {
      return;
    }

    const matchedPropProject = projectItems.find((item) => item.id === projectId);
    setActiveProjectId(matchedPropProject?.id || projectItems[0].id);
  }, [activeProjectId, projectId, projectItems]);

  useEffect(() => {
    if (!createModalOpen) return;
    if (projectItems.length === 0) {
      if (createProjectId) setCreateProjectId('');
      return;
    }
    if (projectItems.some((item) => item.id === createProjectId)) {
      return;
    }
    setCreateProjectId(activeProjectId || projectItems[0].id);
  }, [createModalOpen, createProjectId, projectItems, activeProjectId]);

  useEffect(() => {
    checkHealth();
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    fetchTasks(true);
    setSelected(new Set());
  }, [activeProjectId]);

  useEffect(() => { fetchTasks(); }, [page]);

  // ── submit ───────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createProjectId) {
      notify('请先选择项目', 'error');
      return;
    }
    if (!firmwarePath.trim()) {
      notify('请先选择要解包的固件文件', 'error');
      return;
    }
    if (!outputPath.trim()) {
      notify('输出目录不能为空', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const targetProjectId = createProjectId;
      const r = await fwApi.unpack({
        firmware_path: firmwarePath.trim(),
        output_path: outputPath.trim(),
        project_id: targetProjectId || undefined,
      });
      notify(`任务已提交！ID: ${r.task_id}`, 'success');
      setCreateModalOpen(false);
      resetCreateForm(targetProjectId);
      if (targetProjectId !== activeProjectId) {
        setActiveProjectId(targetProjectId);
      } else {
        setTimeout(() => fetchTasks(true), 800);
      }
    } catch (e: any) {
      notify(e?.message || '提交失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── task control ─────────────────────────────────────────
  const handleCancel = async (id: string) => {
    try {
      await fwApi.cancelTask(id);
      notify('任务停止请求已提交', 'success');
      refreshOne(id);
    } catch (e: any) {
      notify(`停止失败: ${e?.message}`, 'error');
    }
  };
  const handleDelete = async (id: string) => {
    const target = taskItems.find((task) => task.id === id);
    if (target && !isTerminal(target.status)) {
      notify('运行中的任务不能删除，请先停止', 'error');
      return;
    }
    if (!confirm('确认删除？')) return;
    try {
      await fwApi.deleteTask(id);
      setTasks(prev => prev.filter(t => t.id !== id));
      setSelected(prev => { const s = new Set(prev); s.delete(id); return s; });
      notify('任务已删除', 'success');
    } catch (e: any) {
      notify(`删除失败: ${e?.message}`, 'error');
    }
  };
  const handleRetry = async (id: string) => {
    try {
      const r = await fwApi.retryTask(id);
      notify(`已重试，新任务 ID: ${r.new_task_id}`, 'success');
      setTimeout(() => fetchTasks(true), 800);
    } catch (e: any) {
      notify(`重试失败: ${e?.message}`, 'error');
    }
  };
  const handleBatchDelete = async () => {
    const selectedTasks = taskItems.filter((task) => selected.has(task.id));
    const deletableIds = selectedTasks.filter((task) => isTerminal(task.status)).map((task) => task.id);
    const runningCount = selectedTasks.length - deletableIds.length;

    if (!selectedTasks.length) return;
    if (!deletableIds.length) {
      notify('所选任务中包含运行中任务，请先停止后再删除', 'error');
      return;
    }
    if (!confirm(`确认删除 ${deletableIds.length} 条记录${runningCount > 0 ? `，并跳过 ${runningCount} 条运行中任务` : ''}？`)) return;
    try {
      await fwApi.batchDelete(deletableIds);
      setSelected(prev => {
        const next = new Set(prev);
        deletableIds.forEach((id) => next.delete(id));
        return next;
      });
      fetchTasks(true);
      notify(`已删除 ${deletableIds.length} 条任务记录`, 'success');
    } catch (e: any) {
      notify(`批量删除失败: ${e?.message}`, 'error');
    }
  };

  // ── select ───────────────────────────────────────────────
  const toggleSelect = (id: string, checked: boolean) =>
    setSelected(prev => { const s = new Set(prev); checked ? s.add(id) : s.delete(id); return s; });
  const toggleAll = (checked: boolean) =>
    setSelected(checked ? new Set(taskItems.map(t => t.id)) : new Set());

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-4 space-y-4">
      {feedbackNodes}
      <FileServerPickerModal
        projectId={createProjectId}
        isOpen={pickerOpen}
        mode={pickerTarget === 'firmware' ? 'file' : 'directory'}
        containerRoot={FILESERVER_CONTAINER_ROOT}
        title={pickerTarget === 'firmware' ? '选择固件文件' : '选择输出目录'}
        description={pickerTarget === 'firmware' ? '从项目文件系统中选择要解包的固件文件' : '从项目文件系统中选择解包结果输出目录'}
        confirmText={pickerTarget === 'firmware' ? '选择文件' : '选择目录'}
        onClose={() => setPickerOpen(false)}
        onSelect={(containerPath) => {
          setPickerOpen(false);
          if (pickerTarget === 'firmware') {
            setFirmwarePath(containerPath);
            return;
          }
          setOutputPath(containerPath);
        }}
      />
      {createModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/65 p-6 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[2rem] border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-600">Firmware Unpacker</p>
                <h3 className="mt-2 text-2xl font-black text-slate-900">新建解包任务</h3>
                <p className="mt-2 text-sm text-slate-500">先选择项目，再从该项目的文件系统中选择待解包固件文件。</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCreateModalOpen(false);
                  setPickerOpen(false);
                }}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <form className="space-y-5 px-6 py-6" onSubmit={handleSubmit}>
              <label className="block text-sm font-semibold text-slate-700">
                所属项目
                <select
                  value={createProjectId}
                  onChange={(e) => {
                    const nextProjectId = e.target.value;
                    setCreateProjectId(nextProjectId);
                    setFirmwarePath('');
                  }}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">请选择项目</option>
                  {projectItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                {createProject && (
                  <span className="mt-2 block text-xs font-normal text-slate-500">
                    当前项目 ID: <span className="font-mono text-slate-600">{createProject.id}</span>
                  </span>
                )}
              </label>

              <label className="block text-sm font-semibold text-slate-700">
                固件文件
                <div className="mt-2 flex gap-2">
                  <div className="relative flex-1">
                    <FolderOpen size={14} className="pointer-events-none absolute left-3 top-3.5 text-slate-400" />
                    <input
                      value={firmwarePath}
                      onChange={(e) => setFirmwarePath(e.target.value)}
                      placeholder={`${FILESERVER_CONTAINER_ROOT}/<project>/<subproject>/firmware.bin`}
                      className="w-full rounded-2xl border border-slate-200 py-3 pl-9 pr-4 text-sm font-mono text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!createProjectId}
                    onClick={() => {
                      if (!createProjectId) {
                        notify('请先选择项目', 'error');
                        return;
                      }
                      setPickerTarget('firmware');
                      setPickerOpen(true);
                    }}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <FolderOpen size={14} /> 选择文件
                  </button>
                </div>
                <span className="mt-2 block text-xs font-normal text-slate-500">支持手工输入路径，也支持从项目文件系统直接选择固件文件。</span>
              </label>

              <label className="block text-sm font-semibold text-slate-700">
                输出目录
                <div className="mt-2 flex gap-2">
                  <div className="relative flex-1">
                    <FolderOpen size={14} className="pointer-events-none absolute left-3 top-3.5 text-slate-400" />
                    <input
                      value={outputPath}
                      onChange={(e) => setOutputPath(e.target.value)}
                      placeholder={DEFAULT_OUTPUT_PATH}
                      className="w-full rounded-2xl border border-slate-200 py-3 pl-9 pr-4 text-sm font-mono text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!createProjectId}
                    onClick={() => {
                      if (!createProjectId) {
                        notify('请先选择项目', 'error');
                        return;
                      }
                      setPickerTarget('output');
                      setPickerOpen(true);
                    }}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <FolderOpen size={14} /> 选择目录
                  </button>
                </div>
                <span className="mt-2 block text-xs font-normal text-slate-500">可直接使用默认目录，也可以选择项目文件系统中的目录作为输出位置。</span>
              </label>

              <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setCreateModalOpen(false);
                    setPickerOpen(false);
                  }}
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting || !createProjectId || !firmwarePath.trim() || !outputPath.trim()}
                  className="inline-flex items-center gap-1.5 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {submitting ? <><Loader2 size={14} className="animate-spin" />提交中...</> : <><Play size={14} />提交任务</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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
          <button onClick={checkHealth} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
            <Server size={12} /> 刷新状态
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Briefcase size={14} className="text-indigo-600" />
              <span className="text-xs font-bold text-slate-700">项目列表</span>
            </div>
            {!hasPropProjects && (
              <button
                type="button"
                onClick={loadProjects}
                disabled={projectLoading}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {projectLoading ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                刷新
              </button>
            )}
          </div>

          {projectError && (
            <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {projectError}
            </div>
          )}

          {projectItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-xs text-slate-400">
              {projectLoading ? '项目加载中...' : '暂无项目'}
            </div>
          ) : (
            <div className="space-y-2">
              {projectItems.map((item) => {
                const selectedProject = item.id === activeProjectId;
                const isCurrentProject = item.id === projectId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveProjectId(item.id)}
                    className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                      selectedProject
                        ? 'border-blue-300 bg-blue-50 shadow-sm'
                        : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span className={`truncate text-sm font-bold ${selectedProject ? 'text-blue-700' : 'text-slate-800'}`}>
                        {item.name}
                      </span>
                      {selectedProject && (
                        <span className="shrink-0 rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          已选中
                        </span>
                      )}
                      {isCurrentProject && !selectedProject && (
                        <span className="shrink-0 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                          当前项目
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="truncate text-[11px] text-slate-500">
                        {item.description || '无项目描述'}
                      </p>
                      <p className="font-mono text-[10px] text-slate-400">{item.id}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <Server size={13} className="text-emerald-600" />服务状态
              </p>
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

          {/* Task list */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <ListTodo size={14} className="shrink-0 text-violet-600" />
                  <h3 className="text-lg font-black text-slate-900">任务列表</h3>
                  <span className="text-sm font-normal text-slate-400">({total})</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {activeProject?.name ? `当前项目：${activeProject.name}` : '当前未选择项目，右侧任务列表为空'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchTasks(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw size={12} /> 刷新列表
                </button>
                <button
                  onClick={openCreateModal}
                  disabled={projectItems.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <Plus size={13} /> 新建任务
                </button>
              </div>
            </div>

            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); fetchTasks(true); }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none">
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>

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

              {selected.size > 0 && (
                <button onClick={handleBatchDelete}
                  className="ml-auto inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100">
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

            {!activeProjectId ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-xs text-slate-400">
                请先在左侧选择项目，再查看该项目下的固件解包任务
              </div>
            ) : loading && taskItems.length === 0 ? (
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
      </div>
    </div>
  );
};
