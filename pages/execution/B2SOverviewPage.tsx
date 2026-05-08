import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Clock3, Loader2, Plus, RefreshCw, UploadCloud } from 'lucide-react';

import { B2SElfTaskInput, B2SEngine, B2SLlmProviderSummary, B2STask, B2STaskDetail } from '../../clients/binaryToSource';
import { api } from '../../clients/api';
import { B2SStatsHeader, summarizeB2STasks } from './B2SStatsHeader';
import { ProjectFilesystemPickerModal, ProjectFilesystemSelection } from '../../components/assets/ProjectFilesystemPickerModal';
import { B2SPhaseBadge, B2SProgressBar, B2SStatusBadge, B2S_TERMINAL_STATUSES, formatB2SStatus, formatDateTime, pct } from './b2sPresentation';
import { TaskOriginInline } from './taskOrigin';

interface Props {
  projectId: string;
  onOpenTask: (taskId: string) => void;
}

const B2S_APP_ROOT = 'app/secflow-app-binary-to-source';
const FILESERVER_STORAGE_ROOT = '/data';
const standardInputPath = (taskId: string, sequenceNo: number): string => `/${B2S_APP_ROOT}/${taskId}/${sequenceNo}/input`;
type B2SRunMode = 'fast' | 'deep';
const RUN_MODE_ENGINE: Record<B2SRunMode, B2SEngine> = {
  fast: 'hybrid',
  deep: 'agent',
};

const formatBytes = (value: number): string => {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
};

const buildProgressLabel = (task: B2STask, detail?: B2STaskDetail | null) => {
  const total = task.total_items || 0;
  if (detail?.overall_progress?.percent !== undefined && detail.overall_progress.percent !== null) {
    return `${pct(detail.overall_progress.percent).toFixed(1)}%`;
  }
  if (total <= 0) return '-';
  return `${task.success_items || 0}/${total}`;
};

const buildPhaseSummary = (task: B2STask, detail?: B2STaskDetail | null) => {
  const phaseSummary = detail?.overall_progress?.phase_summary;
  if (phaseSummary && Object.keys(phaseSummary).length > 0) {
    const [phase, count] = Object.entries(phaseSummary).sort((a, b) => b[1] - a[1])[0];
    return { phase, label: `${phase} · ${count}` };
  }
  if ((task.running_items || 0) > 0) return { phase: 'body', label: `运行中 ${task.running_items}` };
  if ((task.queued_items || 0) > 0) return { phase: 'queued', label: `排队中 ${task.queued_items}` };
  if ((task.pending_items || 0) > 0) return { phase: 'queued', label: `待处理 ${task.pending_items}` };
  if ((task.failed_items || 0) > 0) return { phase: 'failed', label: `失败 ${task.failed_items}` };
  if ((task.partial_items || 0) > 0) return { phase: 'completed', label: `部分成功 ${task.partial_items}` };
  if ((task.success_items || 0) > 0) return { phase: 'completed', label: `成功 ${task.success_items}` };
  return { phase: task.status, label: formatB2SStatus(task.status) };
};

export const B2SOverviewPage: React.FC<Props> = ({ projectId, onOpenTask }) => {
  const executionApi = api.domains.execution;
  const assetApi = api.domains.assets;
  const [items, setItems] = useState<B2STask[]>([]);
  const [activeTaskDetails, setActiveTaskDetails] = useState<Record<string, B2STaskDetail>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [name, setName] = useState('');
  const [concurrency, setConcurrency] = useState(4);
  const [runMode, setRunMode] = useState<B2SRunMode>('fast');
  const [llmProviderKey, setLlmProviderKey] = useState('');
  const [llmProviders, setLlmProviders] = useState<B2SLlmProviderSummary[]>([]);
  const [llmProvidersLoading, setLlmProvidersLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedServerFiles, setSelectedServerFiles] = useState<ProjectFilesystemSelection[]>([]);
  const [showFilesystemPicker, setShowFilesystemPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string>('');
  const [createResult, setCreateResult] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState('');

  const load = async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await executionApi.binaryToSource.listTasks(projectId);
      const nextItems = data.items || [];
      setItems(nextItems);
      const activeTasks = nextItems.filter((task) => !B2S_TERMINAL_STATUSES.has(task.status));
      if (activeTasks.length === 0) {
        setActiveTaskDetails({});
      } else {
        const details = await Promise.allSettled(activeTasks.map((task) => executionApi.binaryToSource.getTask(projectId, task.id)));
        const nextDetails: Record<string, B2STaskDetail> = {};
        details.forEach((result) => {
          if (result.status === 'fulfilled') {
            nextDetails[result.value.id] = result.value;
          }
        });
        setActiveTaskDetails(nextDetails);
      }
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [projectId]);

  useEffect(() => {
    const storedTaskId = sessionStorage.getItem('secflow:b2sTaskId');
    if (!storedTaskId) return;
    sessionStorage.removeItem('secflow:b2sTaskId');
    onOpenTask(storedTaskId);
  }, [onOpenTask]);

  useEffect(() => {
    if (!showCreateDialog) return;
    if (name.trim()) return;
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    setName(`b2s-${ts}`);
  }, [showCreateDialog, name]);

  const hasActiveTasks = useMemo(
    () => items.some((task) => !B2S_TERMINAL_STATUSES.has(task.status)),
    [items]
  );

  useEffect(() => {
    if (!projectId || !hasActiveTasks) return;
    const timer = window.setInterval(() => {
      void load();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [projectId, hasActiveTasks]);

  const stats = useMemo(() => summarizeB2STasks(items), [items]);

  const resetCreateForm = () => {
    setName('');
    setConcurrency(4);
    setRunMode('fast');
    setLlmProviderKey('');
    setSelectedFiles([]);
    setSelectedServerFiles([]);
    setShowFilesystemPicker(false);
    setCreateError('');
    setUploadProgress('');
  };

  const loadLlmProviders = async () => {
    if (!projectId) return;
    setLlmProvidersLoading(true);
    try {
      const data = await executionApi.binaryToSource.listLlmProviders(projectId);
      const providers = (data.items || []).filter((item) => item.enabled);
      setLlmProviders(providers);
      setLlmProviderKey((current) => current || data.default_provider_key || providers.find((item) => item.is_default)?.provider_key || providers[0]?.provider_key || '');
    } catch (e: any) {
      setCreateError(e?.message || '加载LLM Provider失败');
    } finally {
      setLlmProvidersLoading(false);
    }
  };

  const openCreateDialog = () => {
    setCreateResult('');
    resetCreateForm();
    setShowCreateDialog(true);
    void loadLlmProviders();
  };

  const closeCreateDialog = () => {
    if (submitting) return;
    setShowCreateDialog(false);
    resetCreateForm();
  };

  const ensureDirectoryPath = async (path: string) => {
    const parts = path.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current = `${current}/${part}`;
      try {
        await assetApi.fileserver.createProjectFilesystemDirectory({
          project_id: projectId,
          path: current,
        });
      } catch (e: any) {
        const message = String(e?.message || '');
        if (!message.includes('已存在')) {
          throw e;
        }
      }
    }
  };

  const toAbsoluteProjectPath = (projectPath: string): string => {
    const safeProjectPath = projectPath.replace(/^\/+/, '');
    return `${FILESERVER_STORAGE_ROOT}/files/${projectId}/${safeProjectPath}`.replace(/\/{2,}/g, '/');
  };

  const submitCreateTask = async () => {
    setCreateError('');
    setCreateResult('');
    setUploadProgress('');

    if (!projectId) {
      setCreateError('请先选择项目');
      return;
    }
    if (!name.trim()) {
      setCreateError('请输入任务名称');
      return;
    }
    if (selectedFiles.length === 0 && selectedServerFiles.length === 0) {
      setCreateError('请至少上传或从文件服务选择一个ELF文件');
      return;
    }

    setSubmitting(true);
    try {
      const safeConcurrency = Math.max(1, Math.min(16, Number.isFinite(concurrency) ? concurrency : 4));

      setUploadProgress('准备任务目录...');
      const { task_id: taskId } = await executionApi.binaryToSource.prepareTask(projectId);
      const elfTasks: B2SElfTaskInput[] = [];
      let nextSequenceNo = 1;
      for (let i = 0; i < selectedFiles.length; i += 1) {
        const sequenceNo = nextSequenceNo;
        nextSequenceNo += 1;
        const file = selectedFiles[i];
        const inputPath = standardInputPath(taskId, sequenceNo);
        await ensureDirectoryPath(inputPath);
        setUploadProgress(`上传中 ${sequenceNo}/${selectedFiles.length}: ${file.name}`);
        const uploaded = await assetApi.fileserver.uploadProjectFilesystemFile({
          project_id: projectId,
          path: inputPath,
          file,
          overwrite: true,
        });
        elfTasks.push({
          elf_path: toAbsoluteProjectPath(uploaded.path),
          file_list: [],
          metadata: {
            uploaded_filename: uploaded.name,
            uploaded_project_path: uploaded.path,
            standard_input_dir: inputPath,
            original_size: file.size,
            sequence_no: sequenceNo,
          },
        });
      }

      selectedServerFiles.forEach((selection) => {
        const sequenceNo = nextSequenceNo;
        nextSequenceNo += 1;
        elfTasks.push({
          elf_path: toAbsoluteProjectPath(selection.path),
          file_list: [],
          metadata: {
            selected_from_fileserver: true,
            source_project_path: selection.path,
            source_filename: selection.name,
            sequence_no: sequenceNo,
          },
        });
      });

      const resp = await executionApi.binaryToSource.createTask(projectId, {
        task_id: taskId,
        name: name.trim(),
        priority: 5,
        tags: ['reverse', 'binary-to-source'],
        llm_provider_key: llmProviderKey || undefined,
        concurrency: safeConcurrency,
        engine: RUN_MODE_ENGINE[runMode],
        elf_tasks: elfTasks,
      });
      setShowCreateDialog(false);
      resetCreateForm();
      setCreateResult(`创建成功: ${resp.task_id}`);
      await load();
    } catch (e: any) {
      setCreateError(e?.message || '创建失败');
    } finally {
      setSubmitting(false);
      setUploadProgress('');
    }
  };

  return (
    <div className="px-8 pb-10 pt-8 space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-600">Binary Reverse</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">二进制逆向</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              集中查看当前项目关联的代码逆向还原任务，统一管理状态、进度、阶段与结果，并从同一入口创建新的逆向任务。
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={openCreateDialog}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-slate-800"
            >
              <Plus size={16} />
              创建任务
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <RefreshCw size={16} />
              刷新
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}
      {createResult && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {createResult}
        </div>
      )}

      <section className="rounded-[2rem] border border-slate-200 bg-slate-50/70 p-5 shadow-sm">
        <B2SStatsHeader stats={stats} title="当前项目逆向统计" />
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-xl font-black text-slate-900">任务列表</h2>
            <p className="mt-1 text-sm text-slate-500">展示任务状态、进度、阶段摘要与最近更新时间。</p>
          </div>
          {hasActiveTasks && (
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">
              <Clock3 size={14} />
              活跃任务自动刷新中
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" />
            加载中...
          </div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">当前项目暂无二进制逆向任务。</div>
        ) : (
          <div className="mt-5 space-y-4">
            {items.map((task) => {
              const detail = activeTaskDetails[task.id];
              const phaseSummary = buildPhaseSummary(task, detail);
              const progressValue = detail?.overall_progress?.percent ?? (task.total_items ? ((task.success_items + task.partial_items) / task.total_items) * 100 : 0);
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onOpenTask(task.id)}
                  className="w-full rounded-[1.5rem] border border-slate-200 bg-white p-5 text-left transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-black text-slate-900">{task.name || task.id}</div>
                        <B2SStatusBadge status={task.status} />
                        <B2SPhaseBadge phase={phaseSummary.phase} label={phaseSummary.label} />
                      </div>
                      <div className="mt-2 break-all font-mono text-xs text-slate-400">{task.id}</div>
                      <div className="mt-3">
                        <TaskOriginInline origin={task} compact />
                      </div>
                      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl bg-slate-50 px-4 py-3">
                          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">任务结果</div>
                          <div className="mt-1 text-sm font-bold text-slate-800">
                            成功 {task.success_items} / 总数 {task.total_items}
                          </div>
                        </div>
                        <div className="rounded-2xl bg-slate-50 px-4 py-3">
                          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">执行分布</div>
                          <div className="mt-1 text-sm font-bold text-slate-800">
                            排队 {task.queued_items} · 运行 {task.running_items}
                          </div>
                        </div>
                        <div className="rounded-2xl bg-slate-50 px-4 py-3">
                          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">异常项</div>
                          <div className="mt-1 text-sm font-bold text-slate-800">
                            失败 {task.failed_items} · 部分成功 {task.partial_items}
                          </div>
                        </div>
                        <div className="rounded-2xl bg-slate-50 px-4 py-3">
                          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">最近更新</div>
                          <div className="mt-1 text-sm font-bold text-slate-800">{formatDateTime(task.updated_at)}</div>
                        </div>
                      </div>
                    </div>

                    <div className="w-full xl:max-w-[260px]">
                      <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-bold text-slate-700">总体进度</div>
                          <div className="text-sm font-black text-slate-900">{buildProgressLabel(task, detail)}</div>
                        </div>
                        <div className="mt-3">
                          <B2SProgressBar value={progressValue} />
                        </div>
                        <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                          <span>待处理 {task.pending_items}</span>
                          <span>已取消 {task.cancelled_items}</span>
                        </div>
                        <div className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-slate-700">
                          查看详情
                          <ChevronRight size={16} />
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-5xl rounded-[2rem] border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h3 className="text-xl font-black text-slate-900">创建二进制逆向任务</h3>
                <p className="mt-1 text-sm text-slate-500">上传 ELF 文件并发起代码逆向还原任务。</p>
              </div>
              <button type="button" onClick={closeCreateDialog} disabled={submitting} className="text-sm font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50">
                关闭
              </button>
            </div>
            <div className="space-y-5 p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="block text-sm font-bold text-slate-700">
                  任务名称
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例如：libcrypto 逆向还原"
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                  />
                </label>
                <label className="block text-sm font-bold text-slate-700">
                  并行度
                  <input
                    type="number"
                    min={1}
                    max={16}
                    value={concurrency}
                    onChange={(e) => setConcurrency(Number(e.target.value) || 4)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                  />
                  <span className="mt-2 block text-xs font-normal text-slate-500">控制 pi-re-agent 同时处理的 batch 数，建议 1-8。</span>
                </label>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-sm font-bold text-slate-700">还原模式</div>
                  <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setRunMode('fast')}
                      disabled={submitting}
                      className={`rounded-3xl border px-4 py-4 text-left transition-all ${runMode === 'fast' ? 'border-cyan-300 bg-cyan-50 ring-2 ring-cyan-100' : 'border-slate-200 bg-white hover:bg-slate-50'} disabled:opacity-60`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-black text-slate-900">快速模式</div>
                        <div className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-700 ring-1 ring-cyan-100">hybrid</div>
                      </div>
                      <div className="mt-2 text-xs font-semibold leading-5 text-slate-500">优先速度，使用混合流水线，适合初步分析和批量还原。</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRunMode('deep')}
                      disabled={submitting}
                      className={`rounded-3xl border px-4 py-4 text-left transition-all ${runMode === 'deep' ? 'border-violet-300 bg-violet-50 ring-2 ring-violet-100' : 'border-slate-200 bg-white hover:bg-slate-50'} disabled:opacity-60`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-black text-slate-900">深度模式</div>
                        <div className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-violet-700 ring-1 ring-violet-100">agent</div>
                      </div>
                      <div className="mt-2 text-xs font-semibold leading-5 text-slate-500">使用 Agent 深度推理，速度较慢，适合关键二进制和高质量还原。</div>
                    </button>
                  </div>
                </div>

                <label className="block text-sm font-bold text-slate-700">
                  Provider
                  <select
                    value={llmProviderKey}
                    onChange={(e) => setLlmProviderKey(e.target.value)}
                    disabled={llmProvidersLoading || llmProviders.length === 0}
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    {llmProviders.length === 0 && <option value="">{llmProvidersLoading ? '加载中...' : '使用后端默认 Provider'}</option>}
                    {llmProviders.map((provider) => (
                      <option key={provider.provider_key} value={provider.provider_key}>
                        {(provider.display_name || provider.provider_key)} · {provider.model || '-'}{provider.is_default ? ' · 默认' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm font-bold text-slate-700">ELF 文件</label>
                  <span className="text-xs font-semibold text-slate-500">本地 {selectedFiles.length} · 文件服务 {selectedServerFiles.length}</span>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center hover:border-slate-400 hover:bg-slate-100">
                    <UploadCloud size={28} className="text-slate-500" />
                    <span className="mt-3 text-sm font-black text-slate-800">上传本地文件</span>
                    <span className="mt-1 text-xs text-slate-500">默认显示所有文件，支持批量上传。</span>
                    <input
                      type="file"
                      multiple
                      onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowFilesystemPicker(true)}
                    className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-cyan-300 bg-cyan-50 px-6 py-8 text-center hover:border-cyan-500 hover:bg-cyan-100"
                  >
                    <UploadCloud size={28} className="text-cyan-700" />
                    <span className="mt-3 text-sm font-black text-cyan-900">从文件服务选择</span>
                    <span className="mt-1 text-xs text-cyan-700">选择项目文件系统中已有的 ELF，不重复上传。</span>
                  </button>
                </div>
                <div className="max-h-64 overflow-auto rounded-2xl border border-slate-200 bg-white">
                  {selectedFiles.length === 0 && selectedServerFiles.length === 0 && <div className="px-4 py-5 text-center text-sm text-slate-400">未选择文件</div>}
                  {selectedFiles.map((file, idx) => (
                    <div key={`local-${file.name}-${idx}`} className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm first:border-t-0">
                      <div className="min-w-0">
                        <div className="truncate font-bold text-slate-800">{file.name}</div>
                        <div className="mt-1 text-xs text-slate-500">本地上传 · sequence #{idx + 1} · {formatBytes(file.size)}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedFiles((current) => current.filter((_, fileIdx) => fileIdx !== idx))}
                        disabled={submitting}
                        className="ml-3 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        移除
                      </button>
                    </div>
                  ))}
                  {selectedServerFiles.map((file, idx) => (
                    <div key={`server-${file.path}`} className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm first:border-t-0">
                      <div className="min-w-0">
                        <div className="truncate font-bold text-slate-800">{file.name}</div>
                        <div className="mt-1 break-all text-xs text-slate-500">文件服务 · sequence #{selectedFiles.length + idx + 1} · {file.path}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedServerFiles((current) => current.filter((item) => item.path !== file.path))}
                        disabled={submitting}
                        className="ml-3 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        移除
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <ProjectFilesystemPickerModal
                isOpen={showFilesystemPicker}
                projectId={projectId}
                selectionMode="file"
                title="从文件服务选择 ELF"
                description="选择当前项目文件系统中已存在的一个或多个二进制文件，创建任务时会直接引用文件路径。"
                allowMultiple
                onClose={() => setShowFilesystemPicker(false)}
                onSelect={(selection) => {
                  setSelectedServerFiles((current) => current.some((item) => item.path === selection.path) ? current : [...current, selection]);
                  setShowFilesystemPicker(false);
                }}
                onSelectMany={(selections) => {
                  setSelectedServerFiles((current) => {
                    const next = [...current];
                    selections.forEach((selection) => {
                      if (!next.some((item) => item.path === selection.path)) next.push(selection);
                    });
                    return next;
                  });
                  setShowFilesystemPicker(false);
                }}
              />

              {(createError || uploadProgress) && (
                <div className="space-y-2">
                  {createError && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{createError}</div>}
                  {uploadProgress && <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">{uploadProgress}</div>}
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                <button type="button" onClick={closeCreateDialog} disabled={submitting} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void submitCreateTask()}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-60"
                >
                  {submitting && <Loader2 size={16} className="animate-spin" />}
                  创建任务
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
