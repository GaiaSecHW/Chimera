import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Loader2, Pause, Play, Plus, RefreshCw, Search, Smartphone, Trash2, Upload } from 'lucide-react';

import type { AppScanStatus, AppScanTaskSummary, AppScanTaskType } from '../../clients/appScan';
import { appScanApi } from '../../clients/appScan';
import { showConfirm } from '../../components/DialogService';

// ---------------------------------------------------------------------------
//  Props
// ---------------------------------------------------------------------------
interface Props {
  projectId: string;
  onOpenTask: (toolTaskId: string) => void;
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------
const ACTIVE_STATUSES = new Set<AppScanStatus>(['pending', 'decompiling', 'running']);
const POLL_INTERVAL_MS = 4000;

const statusTone = (status: string) => {
  switch (status) {
    case 'completed':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'failed':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'running':
      return 'bg-sky-50 text-sky-700 border-sky-200';
    case 'decompiling':
      return 'bg-violet-50 text-violet-700 border-violet-200';
    case 'paused':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'pending':
      return 'bg-slate-100 text-slate-500 border-slate-200';
    default:
      return 'bg-blue-50 text-blue-700 border-blue-200';
  }
};

const statusLabel = (status: string) => {
  const map: Record<string, string> = {
    pending: '等待中',
    decompiling: '反编译中',
    running: '扫描中',
    paused: '已暂停',
    completed: '已完成',
    failed: '失败',
  };
  return map[status] || status;
};

const fmtTimestamp = (value?: string | number | null) => {
  if (!value) return '-';
  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
  return date.toLocaleString();
};

const guessTaskType = (filename: string): AppScanTaskType | '' => {
  const lowered = filename.toLowerCase();
  if (lowered.endsWith('.apk')) return 'APK';
  if (lowered.endsWith('.hap')) return 'HAP';
  return '';
};

// ---------------------------------------------------------------------------
//  Component
// ---------------------------------------------------------------------------
export const AppScanOverviewPage: React.FC<Props> = ({ projectId, onOpenTask }) => {
  // ---- State ----
  const [items, setItems] = useState<AppScanTaskSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Create dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [taskName, setTaskName] = useState('');
  const [taskType, setTaskType] = useState<AppScanTaskType | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // Filter
  const [statusFilter, setStatusFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Auto-refresh
  const mountedRef = useRef(true);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Load tasks ----
  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!projectId) return;
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const data = await appScanApi.listTasks(projectId);
      if (!mountedRef.current) return;
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      if (!mountedRef.current) return;
      setError(e?.message || '加载失败');
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [projectId]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load({ silent: true });
  }, [load]);

  // Initial load + polling
  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [load]);

  // Auto-poll when there are active tasks
  useEffect(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    const hasActive = items.some((item) => ACTIVE_STATUSES.has(item.status as AppScanStatus));
    if (hasActive) {
      pollTimerRef.current = setTimeout(() => {
        void load({ silent: true });
      }, POLL_INTERVAL_MS);
    }
  }, [items, load]);

  // ---- File selection handler ----
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setUploadFile(file);
    setCreateError(null);
    if (file) {
      const guessed = guessTaskType(file.name);
      if (guessed) setTaskType(guessed);
      if (!taskName) {
        setTaskName(file.name.replace(/\.(apk|hap)$/i, ''));
      }
    }
  };

  // ---- Create task ----
  const handleCreate = async () => {
    if (!uploadFile || !taskType) {
      setCreateError('请选择 APK/HAP 文件');
      return;
    }
    if (!taskName.trim()) {
      setCreateError('请输入任务名称');
      return;
    }
    setSubmitting(true);
    setCreateError(null);
    setUploadProgress(0);
    try {
      // Step 1: Upload file to turing
      const uploadResp = await appScanApi.uploadFile(
        uploadFile,
        taskName.trim(),
        '1.0.0',
        undefined,
        (evt) => {
          if (evt.total_bytes > 0) {
            const pct = Math.min(Math.round((evt.loaded_bytes / evt.total_bytes) * 100), 99);
            setUploadProgress(pct);
          }
        },
      );
      if (!uploadResp.file_path) {
        throw new Error('上传成功但未返回 file_path');
      }
      setUploadProgress(100);

      // Step 2: Create M2M scan task
      const taskResp = await appScanApi.createTask({
        project_id: projectId,
        task_id: `${taskName.trim()}-${Date.now()}`,
        file_path: uploadResp.file_path,
        task_type: taskType as AppScanTaskType,
      });

      setShowCreateDialog(false);
      resetCreateForm();
      await load();
      if (taskResp.tool_task_id) {
        onOpenTask(taskResp.tool_task_id);
      }
    } catch (e: any) {
      setCreateError(e?.message || '创建失败');
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  };

  const resetCreateForm = () => {
    setUploadFile(null);
    setTaskName('');
    setTaskType('');
    setCreateError(null);
    setUploadProgress(null);
  };

  // ---- Actions ----
  const handlePause = async (toolTaskId: string) => {
    try {
      await appScanApi.pauseTask(toolTaskId);
      await load({ silent: true });
    } catch (e: any) {
      alert(e?.message || '暂停失败');
    }
  };

  const handleResume = async (toolTaskId: string) => {
    try {
      await appScanApi.resumeTask(toolTaskId);
      await load({ silent: true });
    } catch (e: any) {
      alert(e?.message || '恢复失败');
    }
  };

  const handleDelete = async (toolTaskId: string) => {
    const confirmed = await showConfirm({ title: '确认删除', message: `确定要删除任务 ${toolTaskId} 吗？此操作不可恢复。` });
    if (!confirmed) return;
    try {
      await appScanApi.deleteTask(toolTaskId);
      await load({ silent: true });
    } catch (e: any) {
      alert(e?.message || '删除失败');
    }
  };

  // ---- Filtered items ----
  const filteredItems = useMemo(() => {
    let result = items;
    if (statusFilter) {
      result = result.filter((item) => item.status === statusFilter);
    }
    if (searchInput.trim()) {
      const q = searchInput.trim().toLowerCase();
      result = result.filter(
        (item) =>
          item.tool_task_id.toLowerCase().includes(q) ||
          item.external_task_id.toLowerCase().includes(q) ||
          item.task_type.toLowerCase().includes(q),
      );
    }
    return result;
  }, [items, statusFilter, searchInput]);

  // ---- Render ----
  return (
    <div className="px-8 pb-10 pt-8 space-y-6">
      {/* Header */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-600">App Security</p>
            <h1 className="text-2xl font-black text-slate-900">应用端到端扫描</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              上传 APK/HAP 应用包，系统自动完成反编译并启动检测→挖掘→验证三阶段扫描流水线，实现 AI 驱动的端到端安全审计。
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowCreateDialog(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-slate-800"
            >
              <Plus size={16} />
              创建任务
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
            >
              {refreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              {refreshing ? '刷新中...' : '刷新'}
            </button>
          </div>
        </div>
      </section>

      {/* Error banner */}
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      {/* Task list */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-black text-slate-900">任务列表</h2>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <Search size={16} className="text-slate-400" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="搜索任务 ID / 名称"
                className="w-full bg-transparent text-sm outline-none"
              />
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            >
              <option value="">全部状态</option>
              <option value="pending">等待中</option>
              <option value="decompiling">反编译中</option>
              <option value="running">扫描中</option>
              <option value="paused">已暂停</option>
              <option value="completed">已完成</option>
              <option value="failed">失败</option>
            </select>
            <div className="text-sm text-slate-500">共 {filteredItems.length} 条</div>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="mt-8 flex items-center justify-center gap-2 text-sm text-slate-400">
            <Loader2 size={18} className="animate-spin" />
            加载中...
          </div>
        )}

        {/* Empty */}
        {!loading && filteredItems.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
            <Smartphone size={32} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-semibold text-slate-400">
              {items.length === 0 ? '当前项目还没有应用扫描任务，点击「创建任务」开始。' : '没有匹配的任务。'}
            </p>
          </div>
        )}

        {/* Table */}
        {!loading && filteredItems.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-3">任务 ID</th>
                  <th className="px-3 py-3">类型</th>
                  <th className="px-3 py-3">状态</th>
                  <th className="px-3 py-3">创建时间</th>
                  <th className="px-3 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const isRunning = ACTIVE_STATUSES.has(item.status as AppScanStatus);
                  return (
                    <tr
                      key={item.tool_task_id}
                      className="group cursor-pointer border-b border-slate-50 transition hover:bg-slate-50/70"
                      onClick={() => onOpenTask(item.tool_task_id)}
                    >
                      <td className="px-3 py-3 font-mono text-xs text-slate-700">
                        <span className="inline-flex items-center gap-1.5">
                          {isRunning && <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />}
                          {item.tool_task_id}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                          {item.task_type}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${statusTone(item.status)}`}>
                          {statusLabel(item.status)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-500">
                        {fmtTimestamp(item.created_at)}
                      </td>
                      <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1">
                          {(item.status === 'running' || item.status === 'decompiling') && (
                            <button
                              type="button"
                              onClick={() => void handlePause(item.tool_task_id)}
                              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-amber-50 hover:text-amber-600"
                              title="暂停"
                            >
                              <Pause size={14} />
                            </button>
                          )}
                          {item.status === 'paused' && (
                            <button
                              type="button"
                              onClick={() => void handleResume(item.tool_task_id)}
                              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600"
                              title="恢复"
                            >
                              <Play size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleDelete(item.tool_task_id)}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                            title="删除"
                          >
                            <Trash2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenTask(item.tool_task_id)}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                            title="查看详情"
                          >
                            <ChevronRight size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Create dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !submitting && setShowCreateDialog(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-slate-900">创建应用扫描任务</h3>
            <p className="mt-1 text-sm text-slate-500">上传 APK 或 HAP 文件，系统将自动完成反编译并启动三阶段扫描。</p>

            <div className="mt-5 space-y-4">
              {/* File upload */}
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">应用文件</label>
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-6 transition hover:border-slate-300 hover:bg-slate-100">
                  <Upload size={24} className="mb-2 text-slate-400" />
                  <span className="text-sm font-semibold text-slate-600">
                    {uploadFile ? uploadFile.name : '点击选择 APK / HAP 文件'}
                  </span>
                  <span className="mt-1 text-xs text-slate-400">支持 .apk, .hap</span>
                  <input
                    type="file"
                    accept=".apk,.hap"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Task name */}
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">任务名称</label>
                <input
                  type="text"
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  placeholder="输入任务名称"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                />
              </div>

              {/* Task type */}
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">文件类型</label>
                <select
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value as AppScanTaskType)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"
                >
                  <option value="">自动识别</option>
                  <option value="APK">APK (Android)</option>
                  <option value="HAP">HAP (HarmonyOS)</option>
                </select>
              </div>

              {/* Upload progress */}
              {uploadProgress !== null && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                    <span>上传进度</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-sky-500 transition-all"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Error */}
              {createError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                  {createError}
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  if (submitting) return;
                  setShowCreateDialog(false);
                  resetCreateForm();
                }}
                disabled={submitting}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={submitting || !uploadFile}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {submitting ? '创建中...' : '上传并创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
