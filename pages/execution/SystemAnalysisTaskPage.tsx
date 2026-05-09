import React, { useCallback, useEffect, useState } from 'react';
import { FolderOpen, Loader2, Plus, RefreshCw, Trash2, X } from 'lucide-react';

import { api } from '../../clients/api';
import { AppSaTaskItem } from '../../types/types';
import { showConfirm } from '../../components/DialogService';
import { useUiFeedback } from '../../components/UiFeedback';
import { FileServerPickerModal } from '../../components/assets/FileServerPickerModal';
import { TaskOriginInline } from './taskOrigin';

const STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  running: '分析中',
  passed: '通过',
  failed: '失败',
  error: '错误',
  cancelled: '已取消',
};

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  running: 'bg-blue-100 text-blue-700',
  passed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  error: 'bg-orange-100 text-orange-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

function formatDuration(startedAt: string | null | undefined, finishedAt: string | null | undefined): string {
  if (!startedAt || !finishedAt) return '-';
  const secs = Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m${s}s`;
}

const emptyForm = {
  task_name: '',
  input_path: '',
  output_path: '',
  task_description: '',
  analysis_mode: 'binary' as 'binary' | 'source',
  analyse_targets: ['all'] as string[],
  binary_arch: ['all'] as string[],
};

const SOURCE_MODE_DEFAULT_TARGETS = ['source', 'script', 'config'];

const SORT_OPTIONS = [
  { value: 'created_at', label: '创建时间' },
  { value: 'updated_at', label: '更新时间' },
  { value: 'started_at', label: '开始时间' },
  { value: 'finished_at', label: '结束时间' },
  { value: 'status', label: '任务状态' },
  { value: 'task_name', label: '任务名称' },
];

export const SystemAnalysisTaskPage: React.FC<{ projectId: string; onOpenTask: (taskId: string) => void }> = ({ projectId, onOpenTask }) => {
  const appApi = api.domains.execution.appSystemAnalyse;
  const { notify, feedbackNodes } = useUiFeedback();
  const autoRefreshStorageKey = `secflow:systemAnalysis:autoRefresh:${projectId || 'default'}`;
  const refreshIntervalStorageKey = `secflow:systemAnalysis:refreshInterval:${projectId || 'default'}`;

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [tasks, setTasks] = useState<AppSaTaskItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [statusFilter, setStatusFilter] = useState('');
  const [analysisModeFilter, setAnalysisModeFilter] = useState<'' | 'binary' | 'source'>('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  const [createModalOpen, setCreateModalOpen] = useState(false);

  const [form, setForm] = useState(emptyForm);
  const [analysisScopeTouched, setAnalysisScopeTouched] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'input' | 'output'>('input');
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [refreshIntervalSec, setRefreshIntervalSec] = useState(10);

  // Pre-fill input_path from FileExplorer right-click
  useEffect(() => {
    const stored = sessionStorage.getItem('secflow:systemAnalysisInputPath');
    if (stored) {
      sessionStorage.removeItem('secflow:systemAnalysisInputPath');
      setCreateModalOpen(true);
      setForm({ ...emptyForm, input_path: stored, output_path: `/data/files/${projectId}/app/secflow-app-system-analyse` });
      setAnalysisScopeTouched(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const storedTaskId = sessionStorage.getItem('secflow:systemAnalysisTaskId');
    if (!storedTaskId) return;
    sessionStorage.removeItem('secflow:systemAnalysisTaskId');
    onOpenTask(storedTaskId);
  }, [onOpenTask]);

  // ── Load task list ────────────────────────────────────────────────────────

  const loadTasks = useCallback(async (p = page) => {
    if (!projectId) return;
    setLoading(true);
    try {
      const resp = await appApi.listTasks({
        project_id: projectId,
        page: p,
        per_page: perPage,
        status: statusFilter,
        analysis_mode: analysisModeFilter,
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      setTasks(resp.items || []);
      setTotal(resp.total || 0);
    } catch (err: any) {
      notify(`加载任务列表失败: ${err?.message || err}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [projectId, page, perPage, statusFilter, analysisModeFilter, sortBy, sortOrder]);

  useEffect(() => { void loadTasks(page); }, [projectId, page, perPage, statusFilter, analysisModeFilter, sortBy, sortOrder]);

  useEffect(() => {
    const storedEnabled = localStorage.getItem(autoRefreshStorageKey);
    const storedInterval = localStorage.getItem(refreshIntervalStorageKey);
    setAutoRefreshEnabled(storedEnabled === 'true');
    if (storedInterval) {
      const parsed = Number(storedInterval);
      if (Number.isFinite(parsed)) {
        setRefreshIntervalSec(Math.max(5, Math.floor(parsed)));
      }
    } else {
      setRefreshIntervalSec(10);
    }
  }, [autoRefreshStorageKey, refreshIntervalStorageKey]);

  useEffect(() => {
    localStorage.setItem(autoRefreshStorageKey, String(autoRefreshEnabled));
  }, [autoRefreshEnabled, autoRefreshStorageKey]);

  useEffect(() => {
    localStorage.setItem(refreshIntervalStorageKey, String(refreshIntervalSec));
  }, [refreshIntervalSec, refreshIntervalStorageKey]);

  useEffect(() => {
    setSelectedTaskIds((current) => {
      const next = new Set<string>();
      const validIds = new Set(tasks.map((task) => task.task_id));
      current.forEach((taskId) => {
        if (validIds.has(taskId)) next.add(taskId);
      });
      return next;
    });
  }, [tasks]);

  // ── Auto-poll when tasks are running or pending ───────────────────────────
  const hasActiveTasks = tasks.some((t) => t.status === 'running' || t.status === 'pending');
  useEffect(() => {
    if (!autoRefreshEnabled) return;
    if (!hasActiveTasks) return;
    const timer = setInterval(() => {
      void loadTasks(page);
    }, Math.max(5, refreshIntervalSec) * 1000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefreshEnabled, refreshIntervalSec, hasActiveTasks, projectId, page]);

  const handleInputPathChange = (value: string) => {
    setForm((prev) => ({ ...prev, input_path: value }));
  };

  // ── Create task ───────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!form.task_name.trim()) { notify('任务名称不能为空', 'error'); return; }
    if (!form.input_path.trim()) { notify('输入路径不能为空', 'error'); return; }
    setCreating(true);
    try {
      const resp = await appApi.createTask({
        project_id: projectId,
        task_name: form.task_name.trim(),
        input_path: form.input_path.trim(),
        output_path: form.output_path.trim() || undefined,
        task_description: form.task_description.trim() || undefined,
        analysis_mode: form.analysis_mode,
        analyse_targets: form.analyse_targets.length > 0 && !form.analyse_targets.includes('all') ? form.analyse_targets : undefined,
        binary_arch: form.binary_arch.length > 0 && !form.binary_arch.includes('all') ? form.binary_arch : undefined,
      });
      notify(`任务创建成功: ${resp.task_id}`, 'success');
      setForm({ ...emptyForm });
      setAnalysisScopeTouched(false);
      setCreateModalOpen(false);
      setPage(1);
      await loadTasks(1);
    } catch (err: any) {
      notify(`任务创建失败: ${err?.message || err}`, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (taskId: string, taskName: string) => {
    const confirmed = await showConfirm({
      title: '删除任务',
      message: `确定要删除任务「${taskName}」及其所有输出文件吗？此操作不可撤销。`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await appApi.deleteTask(taskId, true);
      notify('任务已删除', 'success');
      setSelectedTaskIds((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
      await loadTasks(page);
    } catch (err: any) {
      notify(`删除失败: ${err?.message || err}`, 'error');
    }
  };

  const toggleTaskSelection = (taskId: string, checked: boolean) => {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (checked) next.add(taskId);
      else next.delete(taskId);
      return next;
    });
  };

  const toggleAllPageSelection = (checked: boolean) => {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (checked) tasks.forEach((task) => next.add(task.task_id));
      else tasks.forEach((task) => next.delete(task.task_id));
      return next;
    });
  };

  const handleBatchDelete = async () => {
    const taskIds = Array.from(selectedTaskIds);
    if (taskIds.length === 0) {
      notify('请先选择要删除的任务', 'error');
      return;
    }
    const confirmed = await showConfirm({
      title: '批量删除任务',
      message: `确定要批量删除 ${taskIds.length} 个任务及其输出文件吗？此操作不可撤销。`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;

    setBatchDeleting(true);
    let success = 0;
    let failed = 0;
    let firstError = '';

    for (const taskId of taskIds) {
      try {
        await appApi.deleteTask(taskId, true);
        success += 1;
      } catch (err: any) {
        failed += 1;
        if (!firstError) firstError = err?.message || String(err);
      }
    }

    setBatchDeleting(false);
    setSelectedTaskIds(new Set());
    await loadTasks(page);

    if (failed === 0) {
      notify(`批量删除成功，共 ${success} 个任务`, 'success');
    } else if (success > 0) {
      notify(`批量删除完成，成功 ${success} / ${taskIds.length}，首个错误：${firstError}`, 'warning');
    } else {
      notify(`批量删除失败：${firstError || '未知错误'}`, 'error');
    }
  };

  const totalPages = Math.ceil(total / perPage);
  const allPageSelected = tasks.length > 0 && tasks.every((task) => selectedTaskIds.has(task.task_id));
  const hasSelection = selectedTaskIds.size > 0;

  return (
    <div className="px-8 pt-8 pb-10 space-y-6">
      {feedbackNodes}
      <FileServerPickerModal
        projectId={projectId}
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(containerPath) => {
          setPickerOpen(false);
          if (pickerTarget === 'output') {
            setForm((p) => ({ ...p, output_path: containerPath }));
          } else {
            handleInputPathChange(containerPath);
          }
        }}
      />

      <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-600">System Analysis</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">分析任务</h1>
        <p className="mt-2 text-sm text-slate-500">指定分析路径，启动安全分析任务。</p>
      </section>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: '总任务', value: total, bg: 'bg-slate-50', text: 'text-slate-800', border: 'border-slate-200' },
          { label: '运行中', value: tasks.filter((t) => t.status === 'running' || t.status === 'pending').length, bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
          { label: '已通过', value: tasks.filter((t) => t.status === 'passed').length, bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
          { label: '失败/取消', value: tasks.filter((t) => t.status === 'failed' || t.status === 'error' || t.status === 'cancelled').length, bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl border ${s.border} ${s.bg} p-5 flex flex-col gap-1 shadow-sm`}>
            <p className={`text-3xl font-black ${s.text}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Task list */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-4">
          <h2 className="text-lg font-black text-slate-900">任务列表 <span className="text-sm font-normal text-slate-400">({total})</span></h2>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={autoRefreshEnabled}
                onChange={(e) => setAutoRefreshEnabled(e.target.checked)}
              />
              自动刷新
            </label>
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
              间隔
              <input
                type="number"
                min={5}
                step={1}
                value={refreshIntervalSec}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setRefreshIntervalSec(Number.isFinite(value) ? Math.max(5, Math.floor(value)) : 5);
                }}
                className="w-16 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
              />
              秒
            </label>
            <select
              value={analysisModeFilter}
              onChange={(e) => { setAnalysisModeFilter(e.target.value as '' | 'binary' | 'source'); setPage(1); }}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 bg-white"
              title="分析模式筛选"
            >
              <option value="">全部模式</option>
              <option value="binary">二进制模式</option>
              <option value="source">源码模式</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 bg-white"
              title="任务状态筛选"
            >
              <option value="">全部状态</option>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 bg-white"
              title="排序字段"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>按{option.label}排序</option>
              ))}
            </select>
            <select
              value={sortOrder}
              onChange={(e) => { setSortOrder(e.target.value === 'asc' ? 'asc' : 'desc'); setPage(1); }}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 bg-white"
              title="排序方向"
            >
              <option value="desc">降序</option>
              <option value="asc">升序</option>
            </select>
            <select
              value={perPage}
              onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 bg-white"
              title="每页显示条数"
            >
              {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}条/页</option>)}
            </select>
            <button onClick={() => void loadTasks(page)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
              <RefreshCw size={14} />
            </button>
            <button onClick={() => { setCreateModalOpen(true); setForm({ ...emptyForm, output_path: `/data/files/${projectId}/app/secflow-app-system-analyse` }); setAnalysisScopeTouched(false); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">
              <Plus size={13} />新建任务
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>
            自动刷新：{autoRefreshEnabled ? `开启（${Math.max(5, refreshIntervalSec)}s）` : '关闭'}
          </span>
          {autoRefreshEnabled && !hasActiveTasks ? (
            <span className="text-amber-600">当前无运行中任务，自动刷新暂不触发</span>
          ) : null}
          {autoRefreshEnabled && hasActiveTasks ? (
            <span className="text-cyan-600">检测到活跃任务，按设定间隔自动刷新</span>
          ) : null}
        </div>

        {hasSelection ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={(e) => toggleAllPageSelection(e.target.checked)}
                />
                全选当前页（{tasks.length} 条）
              </label>
              <span className="text-sm font-semibold text-red-700">已选择 {selectedTaskIds.size} 个任务</span>
            </div>
            <button
              onClick={() => void handleBatchDelete()}
              disabled={batchDeleting}
              className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              {batchDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              批量删除（{selectedTaskIds.size}）
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-6"><Loader2 size={14} className="animate-spin" />加载中...</div>
        ) : tasks.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">暂无任务，点击右上角「新建任务」创建</div>
        ) : (
          <div className="space-y-2 max-h-[640px] overflow-auto pr-1">
            <label className="mb-2 flex items-center gap-2 px-1 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={allPageSelected}
                onChange={(e) => toggleAllPageSelection(e.target.checked)}
              />
              全选当前页（{tasks.length} 条）
            </label>
            {tasks.map((t) => (
              <div
                key={t.task_id}
                className={`group relative rounded-xl border bg-white transition-colors hover:bg-slate-50 hover:border-slate-300 ${
                  selectedTaskIds.has(t.task_id) ? 'border-cyan-300 bg-cyan-50/40' : 'border-slate-200'
                }`}
              >
                <div className="absolute left-3 top-3 z-10">
                  <input
                    type="checkbox"
                    checked={selectedTaskIds.has(t.task_id)}
                    onChange={(e) => toggleTaskSelection(t.task_id, e.target.checked)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`选择任务 ${t.task_name}`}
                  />
                </div>
                <button
                  onClick={() => onOpenTask(t.task_id)}
                  className="w-full p-4 pl-10 text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 truncate">{t.task_name}</div>
                      <div className="mt-0.5 text-xs text-slate-500 truncate font-mono">{t.input_path}</div>
                      <div className="mt-2">
                        <TaskOriginInline origin={t} compact />
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[t.status] ?? 'bg-slate-100 text-slate-600'}`}>
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-4 text-xs text-slate-400">
                    <span>创建: {t.created_at ? new Date(t.created_at).toLocaleString('zh-CN') : '-'}</span>
                    <span>耗时: {formatDuration(t.started_at, t.finished_at)}</span>
                  </div>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); void handleDelete(t.task_id, t.task_name); }}
                  title="删除任务及输出文件"
                  className="absolute right-3 top-3 hidden group-hover:flex items-center justify-center rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">上一页</button>
            <span className="text-slate-500">{page} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">下一页</button>
          </div>
        ) : null}
      </section>

      {/* Create Task Modal */}
      {createModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setCreateModalOpen(false)} />
          <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black text-slate-900">新建任务</h2>
                <button onClick={() => setCreateModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:text-slate-700"><X size={16} /></button>
              </div>

              <label className="block text-sm text-slate-600">
                任务名称 <span className="text-red-500">*</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.task_name}
                  onChange={(e) => setForm((p) => ({ ...p, task_name: e.target.value }))}
                  placeholder="例：固件安全分析-2025"
                />
              </label>

              <label className="block text-sm text-slate-600">
                输入路径 <span className="text-red-500">*</span>
                <div className="mt-1 flex gap-1">
                  <input
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                    value={form.input_path}
                    onChange={(e) => handleInputPathChange(e.target.value)}
                    placeholder="/data/files/<project>/<subproject>"
                  />
                  <button
                    type="button"
                    title="从文件资源中选择目录"
                    onClick={() => { setPickerTarget('input'); setPickerOpen(true); }}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 shrink-0"
                  >
                    <FolderOpen size={13} />浏览
                  </button>
                </div>
              </label>

              <label className="block text-sm text-slate-600">
                输出路径 <span className="text-red-500">*</span>
                <div className="mt-1 flex gap-1">
                  <input
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                    value={form.output_path}
                    onChange={(e) => setForm((p) => ({ ...p, output_path: e.target.value }))}
                    placeholder="/data/files/<project>/<subproject>"
                  />
                  <button
                    type="button"
                    title="从文件资源中选择目录"
                    onClick={() => { setPickerTarget('output'); setPickerOpen(true); }}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 shrink-0"
                  >
                    <FolderOpen size={13} />浏览
                  </button>
                </div>
              </label>

              <label className="block text-sm text-slate-600">
                任务描述 <span className="text-slate-400 text-xs">(可选)</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form.task_description}
                  onChange={(e) => setForm((p) => ({ ...p, task_description: e.target.value }))}
                  placeholder="简要说明分析目标或背景"
                />
              </label>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold text-slate-600">分析模式</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {[
                    { value: 'binary' as const, label: '二进制模式', desc: '面向固件、解包目录、二进制与系统组件分析' },
                    { value: 'source' as const, label: '源码模式', desc: '面向源码项目、代码模块、脚本与配置分析' },
                  ].map((option) => (
                    <label
                      key={option.value}
                      className={`cursor-pointer rounded-xl border px-3 py-2 text-sm ${
                        form.analysis_mode === option.value ? 'border-cyan-300 bg-cyan-50 text-cyan-800' : 'border-slate-200 bg-slate-50 text-slate-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="analysis_mode"
                        className="mr-2"
                        checked={form.analysis_mode === option.value}
                        onChange={() => {
                          setForm((prev) => ({
                            ...prev,
                            analysis_mode: option.value,
                            analyse_targets: !analysisScopeTouched
                              ? (option.value === 'source' ? SOURCE_MODE_DEFAULT_TARGETS : ['all'])
                              : prev.analyse_targets,
                          }));
                        }}
                      />
                      <span className="font-semibold">{option.label}</span>
                      <span className="mt-1 block text-xs opacity-75">{option.desc}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Per-task analysis scope */}
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-600">分析范围 <span className="font-normal text-slate-400">(覆盖服务默认配置，默认 all)</span></p>
                <div>
                  <p className="text-xs text-slate-500 mb-1.5">文件类型</p>
                  <div className="flex flex-wrap gap-2">
                    {['all','binary','script','source','config','firmware','crypto','database','web','network_model','document','archive'].map((t) => (
                      <label key={t} className="flex items-center gap-1 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={form.analyse_targets.includes(t)}
                          onChange={(e) => {
                            setAnalysisScopeTouched(true);
                            setForm((p) => {
                              let next = e.target.checked
                                ? (t === 'all' ? ['all'] : p.analyse_targets.filter(x => x !== 'all').concat(t))
                                : p.analyse_targets.filter(x => x !== t);
                              if (next.length === 0) next = ['all'];
                              return { ...p, analyse_targets: next };
                            });
                          }}
                        />
                        {t}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1.5">二进制架构</p>
                  <div className="flex flex-wrap gap-2">
                    {['all','x86','x86_64','arm','aarch64','mips','mips64','ppc','ppc64','riscv','s390'].map((a) => (
                      <label key={a} className="flex items-center gap-1 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={form.binary_arch.includes(a)}
                          onChange={(e) => {
                            setForm((p) => {
                              let next = e.target.checked
                                ? (a === 'all' ? ['all'] : p.binary_arch.filter(x => x !== 'all').concat(a))
                                : p.binary_arch.filter(x => x !== a);
                              if (next.length === 0) next = ['all'];
                              return { ...p, binary_arch: next };
                            });
                          }}
                        />
                        {a}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={() => void handleCreate()}
                disabled={creating || !form.task_name.trim() || !form.input_path.trim() || !form.output_path.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {creating ? <Loader2 size={15} className="animate-spin" /> : null}
                创建分析任务
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
