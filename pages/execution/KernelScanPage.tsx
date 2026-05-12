import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, FolderOpen, Loader2, Plus, RefreshCw, RotateCcw, Search, Shield, Trash2, XCircle } from 'lucide-react';

import { api } from '../../clients/api';
import { KernelScanCategory, KernelScanReadyState, KernelScanTaskDetail, KernelScanTaskSummary } from '../../clients/kernelScan';
import { useUiFeedback } from '../../components/UiFeedback';
import { ProjectFilesystemPickerModal, ProjectFilesystemSelection } from '../../components/assets/ProjectFilesystemPickerModal';

const ACTIVE_TASK_STATUSES = new Set(['queued', 'running', 'cancel_requested']);

const TASK_STATUS_LABELS: Record<string, string> = {
  queued: '排队中',
  running: '执行中',
  cancel_requested: '取消中',
  cancelled: '已取消',
  succeeded: '已完成',
  failed: '失败',
};

const CATEGORY_LABELS: Record<KernelScanCategory, string> = {
  attack_entry: '扫描攻击入口',
  vuln_scan: '漏洞扫描',
  vuln_verify: '漏洞验证',
};

const statusTone = (status?: string | null) => {
  switch (String(status || '').toLowerCase()) {
    case 'succeeded':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'failed':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'cancelled':
      return 'border-slate-200 bg-slate-100 text-slate-500';
    case 'cancel_requested':
    case 'running':
      return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'queued':
      return 'border-violet-200 bg-violet-50 text-violet-700';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600';
  }
};

const formatTaskStatus = (status?: string | null) => TASK_STATUS_LABELS[String(status || '').toLowerCase()] || (status || '-');

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const panelClassName = 'rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm';

export const KernelScanPage: React.FC<{ projectId: string }> = ({ projectId }) => {
  const executionApi = api.domains.execution.kernelScan;
  const { notify, confirm, feedbackNodes } = useUiFeedback();

  const [bootstrapping, setBootstrapping] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [readyState, setReadyState] = useState<KernelScanReadyState | null>(null);

  const [activeTab, setActiveTab] = useState<KernelScanCategory>('attack_entry');
  const [tasks, setTasks] = useState<KernelScanTaskSummary[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskKeyword, setTaskKeyword] = useState('');

  const [showTaskDetail, setShowTaskDetail] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [selectedTask, setSelectedTask] = useState<KernelScanTaskDetail | null>(null);
  const [taskDetailLoading, setTaskDetailLoading] = useState(false);
  const [actingTask, setActingTask] = useState(false);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createTargetPath, setCreateTargetPath] = useState('');
  const [createParallelCount, setCreateParallelCount] = useState('1');
  const [showPathPicker, setShowPathPicker] = useState(false);

  const filteredTasks = tasks.filter((item) => {
    const keyword = taskKeyword.trim().toLowerCase();
    if (!keyword) return true;
    return `${item.title} ${item.target_path} ${item.task_id}`.toLowerCase().includes(keyword);
  });

  const activeTaskCount = tasks.filter((item) => ACTIVE_TASK_STATUSES.has(String(item.status || '').toLowerCase())).length;
  const succeededTaskCount = tasks.filter((item) => String(item.status || '').toLowerCase() === 'succeeded').length;
  const failedTaskCount = tasks.filter((item) => String(item.status || '').toLowerCase() === 'failed').length;

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      setBootstrapping(true);
      setOverviewError(null);
      try {
        const ready = await executionApi.getReady();
        if (cancelled) return;
        setReadyState(ready);
        if (!ready.ready) {
          setOverviewError('内核扫描服务未就绪');
          return;
        }
      } catch (error: any) {
        if (cancelled) return;
        setReadyState({ status: 'error', ready: false, checks: {} });
        setOverviewError(`内核扫描服务连接失败：${error?.message || '未知错误'}`);
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    };
    bootstrap();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!readyState?.ready) return;
    handleRefreshTasks();
  }, [activeTab, readyState?.ready]);

  const handleRefreshTasks = async () => {
    setTasksLoading(true);
    try {
      const data = await executionApi.listTasks(projectId, activeTab);
      setTasks(data || []);
    } catch (error: any) {
      setOverviewError(error?.message || '刷新任务列表失败');
    } finally {
      setTasksLoading(false);
    }
  };

  const handleOpenTaskDetail = async (taskId: string) => {
    setSelectedTaskId(taskId);
    setShowTaskDetail(true);
    setTaskDetailLoading(true);
    try {
      const detail = await executionApi.getTask(taskId);
      setSelectedTask(detail);
    } catch (error: any) {
      notify(error?.message || '获取任务详情失败', 'error');
    } finally {
      setTaskDetailLoading(false);
    }
  };

  const handleBackToList = () => {
    setShowTaskDetail(false);
    setSelectedTask(null);
    setSelectedTaskId('');
  };

  const handleCreateTask = async () => {
    if (!createTitle.trim()) {
      notify('请输入任务标题', 'error');
      return;
    }
    if (!createTargetPath.trim()) {
      notify('请输入目标路径', 'error');
      return;
    }
    setCreating(true);
    try {
      const parallelValue = Number(createParallelCount) || 1;
      await executionApi.createTask({
        project_id: projectId,
        category: activeTab,
        title: createTitle.trim(),
        target_path: createTargetPath.trim(),
        ...(activeTab !== 'vuln_verify' ? { parallel_count: parallelValue } : {}),
      });
      notify('任务创建成功', 'success');
      setCreateTitle('');
      setCreateTargetPath('');
      setCreateParallelCount('1');
      setCreateModalOpen(false);
      await handleRefreshTasks();
    } catch (error: any) {
      notify(error?.message || '创建任务失败', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleCancelTask = async () => {
    if (!selectedTask) return;
    const confirmed = await confirm({
      title: '取消任务',
      message: `确认取消任务「${selectedTask.title}」吗？`,
      confirmText: '取消任务',
      cancelText: '保留任务',
      danger: true,
    });
    if (!confirmed) return;
    setActingTask(true);
    try {
      await executionApi.cancelTask(selectedTask.task_id);
      notify('已提交取消请求', 'success');
      await handleRefreshTasks();
      await handleOpenTaskDetail(selectedTask.task_id);
    } catch (error: any) {
      notify(error?.message || '取消任务失败', 'error');
    } finally {
      setActingTask(false);
    }
  };

  const handleRetryTask = async () => {
    if (!selectedTask) return;
    const confirmed = await confirm({
      title: '重试任务',
      message: `确认重新执行任务「${selectedTask.title}」吗？`,
      confirmText: '确认重试',
      cancelText: '取消',
    });
    if (!confirmed) return;
    setActingTask(true);
    try {
      await executionApi.retryTask(selectedTask.task_id);
      notify('任务已重新排队', 'success');
      await handleRefreshTasks();
      await handleOpenTaskDetail(selectedTask.task_id);
    } catch (error: any) {
      notify(error?.message || '重试任务失败', 'error');
    } finally {
      setActingTask(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!selectedTask) return;
    const confirmed = await confirm({
      title: '删除任务',
      message: `确认删除任务「${selectedTask.title}」吗？此操作不可撤销。`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    setActingTask(true);
    try {
      await executionApi.deleteTask(selectedTask.task_id);
      notify('任务已删除', 'success');
      handleBackToList();
      await handleRefreshTasks();
    } catch (error: any) {
      notify(error?.message || '删除任务失败', 'error');
    } finally {
      setActingTask(false);
    }
  };

  // --- RENDER ---

  if (bootstrapping) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={32} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-10 animate-in fade-in duration-300">
      {feedbackNodes}

      <section className={panelClassName}>
        <div className="flex items-center gap-3">
          <Shield size={24} className="text-slate-700" />
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Kernel Security</div>
            <h1 className="mt-1 text-2xl font-black text-slate-950">内核扫描</h1>
          </div>
        </div>
        {readyState ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(readyState.checks || {}).map(([key, passed]) => (
              <span
                key={key}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${passed ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}
              >
                {passed ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                {key}
              </span>
            ))}
          </div>
        ) : null}
        {overviewError ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{overviewError}</div>
        ) : null}
      </section>

      <div className="flex gap-2">
        {(['attack_entry', 'vuln_scan', 'vuln_verify'] as KernelScanCategory[]).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => { setActiveTab(cat); setShowTaskDetail(false); setTaskKeyword(''); }}
            className={`rounded-lg px-4 py-2.5 text-sm font-bold transition ${activeTab === cat ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {!showTaskDetail ? (
        <section className={panelClassName}>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Task Queue</div>
              <h2 className="mt-2 text-xl font-black text-slate-950">{CATEGORY_LABELS[activeTab]} · 任务列表</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCreateModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-bold text-white transition hover:bg-slate-800"
              >
                <Plus size={16} />
                新建任务
              </button>
              <button
                type="button"
                onClick={handleRefreshTasks}
                disabled={tasksLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {tasksLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                刷新
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">任务总数</div>
              <div className="mt-1 text-lg font-black text-slate-900">{tasks.length}</div>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-600">进行中</div>
              <div className="mt-1 text-lg font-black text-blue-700">{activeTaskCount}</div>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600">已完成</div>
              <div className="mt-1 text-lg font-black text-emerald-700">{succeededTaskCount}</div>
            </div>
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-rose-600">失败</div>
              <div className="mt-1 text-lg font-black text-rose-700">{failedTaskCount}</div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <Search size={16} className="text-slate-400" />
            <input
              value={taskKeyword}
              onChange={(event) => setTaskKeyword(event.target.value)}
              placeholder="筛选标题、路径或任务 ID"
              className="w-full bg-transparent text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>

          <div className="mt-4 max-h-[840px] space-y-3 overflow-auto pr-1">
            {tasksLoading ? (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
                <Loader2 size={16} className="animate-spin" />
                正在加载任务列表...
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm font-semibold text-slate-500">
                当前没有{CATEGORY_LABELS[activeTab]}任务。
              </div>
            ) : (
              filteredTasks.map((item) => {
                const active = item.task_id === selectedTaskId;
                return (
                  <button
                    key={item.task_id}
                    type="button"
                    onClick={() => handleOpenTaskDetail(item.task_id)}
                    className={`block w-full rounded-lg border px-4 py-4 text-left transition ${active ? 'border-sky-300 bg-sky-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-slate-900">{item.title}</div>
                        <div className="mt-2 break-all font-mono text-[11px] text-slate-500">{item.target_path}</div>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${statusTone(item.status)}`}>
                        {formatTaskStatus(item.status)}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500">
                      <span>{formatDateTime(item.created_at)}</span>
                    </div>
                    <div className="mt-2 font-mono text-[11px] text-slate-400">{item.task_id}</div>
                  </button>
                );
              })
            )}
          </div>
        </section>
      ) : (
        <section className={panelClassName}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <button
                type="button"
                onClick={handleBackToList}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
              >
                <ArrowLeft size={16} />
                返回任务列表
              </button>
              <div className="mt-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Task Detail</div>
              <h2 className="mt-2 truncate text-2xl font-black text-slate-950">{selectedTask?.title || '任务详情'}</h2>
              {selectedTask ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusTone(selectedTask.status)}`}>
                    {formatTaskStatus(selectedTask.status)}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
                    {CATEGORY_LABELS[selectedTask.category]}
                  </span>
                </div>
              ) : null}
            </div>

            {selectedTask ? (
              <div className="flex flex-wrap gap-2">
                {ACTIVE_TASK_STATUSES.has(String(selectedTask.status || '').toLowerCase()) ? (
                  <button
                    type="button"
                    onClick={handleCancelTask}
                    disabled={actingTask}
                    className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {actingTask ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                    取消任务
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleRetryTask}
                      disabled={actingTask}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {actingTask ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                      重试任务
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteTask}
                      disabled={actingTask}
                      className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {actingTask ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      删除任务
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </div>

          {taskDetailLoading ? (
            <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-slate-600">
              <Loader2 size={16} className="animate-spin" />
              正在加载任务详情...
            </div>
          ) : selectedTask ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">目标路径</div>
                <div className="mt-2 break-all font-mono text-sm text-slate-800">{selectedTask.target_path}</div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">创建时间</div>
                  <div className="mt-2 text-sm font-semibold text-slate-800">{formatDateTime(selectedTask.created_at)}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">完成时间</div>
                  <div className="mt-2 text-sm font-semibold text-slate-800">{formatDateTime(selectedTask.finished_at)}</div>
                </div>
              </div>
              {selectedTask.result_summary ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">结果摘要</div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{selectedTask.result_summary}</div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-6 text-sm font-semibold text-slate-500">
              任务详情不可用，请返回任务列表重新选择。
            </div>
          )}
        </section>
      )}

      {createModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
          <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="shrink-0 border-b border-slate-200 bg-slate-50/90 px-5 py-4">
              <h3 className="text-lg font-black text-slate-950">新建{CATEGORY_LABELS[activeTab]}任务</h3>
            </div>
            <div className="flex-1 space-y-5 overflow-auto p-5">
              <label className="block">
                <div className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">任务标题</div>
                <input
                  value={createTitle}
                  onChange={(event) => setCreateTitle(event.target.value)}
                  placeholder={`输入${CATEGORY_LABELS[activeTab]}任务标题`}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                />
              </label>
              <label className="block">
                <div className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">目标路径</div>
                <div className="flex items-center gap-2">
                  <input
                    value={createTargetPath}
                    readOnly
                    placeholder="从项目资产中选择路径"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPathPicker(true)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                  >
                    <FolderOpen size={16} />
                    选择
                  </button>
                </div>
              </label>
              {activeTab !== 'vuln_verify' ? (
                <label className="block">
                  <div className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">并行数</div>
                  <input
                    type="number"
                    min={1}
                    max={32}
                    value={createParallelCount}
                    onChange={(event) => setCreateParallelCount(event.target.value)}
                    placeholder="1"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                  />
                </label>
              ) : null}
            </div>
            <div className="shrink-0 border-t border-slate-200 bg-slate-50/90 px-5 py-4">
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  disabled={creating}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleCreateTask}
                  disabled={creating || !createTitle.trim() || !createTargetPath.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  创建任务
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ProjectFilesystemPickerModal
        isOpen={showPathPicker}
        projectId={projectId}
        selectionMode="directory"
        title="选择目标路径"
        description="从项目资产中选择内核源码所在的目录路径。"
        onClose={() => setShowPathPicker(false)}
        onSelect={(selection: ProjectFilesystemSelection) => {
          setCreateTargetPath(selection.path);
          setShowPathPicker(false);
        }}
      />
    </div>
  );
};
