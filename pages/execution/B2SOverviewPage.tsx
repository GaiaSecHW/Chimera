import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, RefreshCw, UploadCloud } from 'lucide-react';

import { B2SElfTaskInput, B2SRunMode, B2SLlmProviderSummary, B2STask, B2STaskDetail } from '../../clients/binaryToSource';
import { api } from '../../clients/api';
import { B2SStatsHeader, summarizeB2STasks } from './B2SStatsHeader';
import { ProjectFilesystemPickerModal, ProjectFilesystemSelection } from '../../components/assets/ProjectFilesystemPickerModal';
import { ExecutionTable, ExecutionTableHead, ExecutionTableTh, ExecutionTableTd, executionTableInteractiveRowClassName } from '../../components/execution/ExecutionTable';
import { B2SPhaseBadge, B2SProgressBar, B2SStatusBadge, B2S_TERMINAL_STATUSES, formatB2SStatus, formatDateTime, pct } from './b2sPresentation';
import { TaskOriginInline } from './taskOrigin';

interface Props {
  projectId: string;
  onOpenTask: (taskId: string) => void;
}

const B2S_APP_ROOT = 'app/secflow-app-binary-to-source';
const FILESERVER_STORAGE_ROOT = '/data';
const standardInputPath = (taskId: string, sequenceNo: number): string => `/${B2S_APP_ROOT}/${taskId}/${sequenceNo}/input`;
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

const taskModeLabel = (task: B2STask, detail?: B2STaskDetail | null) => detail?.mode_label || task.mode_label || '';

const taskModeTone = (task: B2STask, detail?: B2STaskDetail | null) => {
  const mode = detail?.mode || task.mode;
  if (mode === 'deep') return 'bg-violet-50 text-violet-700 ring-violet-200';
  if (mode === 'fast') return 'bg-cyan-50 text-cyan-700 ring-cyan-200';
  if (mode === 'mixed') return 'bg-amber-50 text-amber-700 ring-amber-200';
  return 'bg-slate-100 text-slate-600 ring-slate-200';
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

const parseBackendTimeMs = (value?: string | null) => {
  if (!value) return NaN;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`;
  return new Date(normalized).getTime();
};

const formatDurationMs = (durationMs?: number | null) => {
  if (durationMs === undefined || durationMs === null || Number.isNaN(durationMs) || durationMs < 0) return '-';
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const minuteRest = minutes % 60;
  return minuteRest ? `${hours}h ${minuteRest}m` : `${hours}h`;
};

const taskRunDuration = (detail?: B2STaskDetail | null, nowMs: number = Date.now()) => {
  if (!detail || detail.items.length === 0) return '-';
  const startTimes = detail.items
    .map((item) => item.started_at ? parseBackendTimeMs(item.started_at) : NaN)
    .filter((value) => !Number.isNaN(value));
  if (startTimes.length === 0) return '-';
  const endTimes = detail.items
    .map((item) => {
      if (item.finished_at) return parseBackendTimeMs(item.finished_at);
      if (!B2S_TERMINAL_STATUSES.has(item.status)) return nowMs;
      return NaN;
    })
    .filter((value) => !Number.isNaN(value));
  if (endTimes.length === 0) return '-';
  return formatDurationMs(Math.max(...endTimes) - Math.min(...startTimes));
};

export const B2SOverviewPage: React.FC<Props> = ({ projectId, onOpenTask }) => {
  const executionApi = api.domains.execution;
  const assetApi = api.domains.assets;
  const autoRefreshStorageKey = `secflow:b2s:autoRefresh:${projectId || 'default'}`;
  const refreshIntervalStorageKey = `secflow:b2s:refreshInterval:${projectId || 'default'}`;
  const [items, setItems] = useState<B2STask[]>([]);
  const [activeTaskDetails, setActiveTaskDetails] = useState<Record<string, B2STaskDetail>>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [statusFilter, setStatusFilter] = useState('');
  const [modeFilter, setModeFilter] = useState<'' | B2SRunMode>(''); 
  const [originFilter, setOriginFilter] = useState<'' | 'manual' | 'binary_security'>('');
  const [searchText, setSearchText] = useState('');
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [refreshIntervalSec, setRefreshIntervalSec] = useState(10);
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
  const [clockNow, setClockNow] = useState(() => Date.now());
  const hasSelectedProviderInList = !llmProviderKey || llmProviders.some((item) => item.provider_key === llmProviderKey);

  const load = useCallback(async (showLoading = true) => {
    if (!projectId) return;
    if (showLoading) setLoading(true);
    else setRefreshing(true);
    try {
      const data = await executionApi.binaryToSource.listTasks(projectId);
      setItems(data.items || []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      if (showLoading) setLoading(false);
      else setRefreshing(false);
    }
  }, [executionApi.binaryToSource, projectId]);

  useEffect(() => {
    void load(true);
  }, [load]);

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
    if (!projectId || !hasActiveTasks) return;
    const timer = window.setInterval(() => {
      if (!autoRefreshEnabled) return;
      void load(false);
    }, Math.max(5, refreshIntervalSec) * 1000);
    return () => window.clearInterval(timer);
  }, [autoRefreshEnabled, hasActiveTasks, load, projectId, refreshIntervalSec]);

  useEffect(() => {
    if (!hasActiveTasks) return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasActiveTasks]);

  const stats = useMemo(() => summarizeB2STasks(items), [items]);
  const filteredItems = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return items.filter((task) => {
      if (statusFilter && task.status !== statusFilter) return false;
      if (modeFilter && task.mode !== modeFilter) return false;
      if (originFilter && String(task.task_origin_type || 'manual').trim() !== originFilter) return false;
      if (!keyword) return true;
      const haystack = [
        task.name,
        task.id,
        task.parent_task_display,
        task.parent_task_id,
        task.origin_label,
      ].join(' ').toLowerCase();
      return haystack.includes(keyword);
    });
  }, [items, modeFilter, originFilter, searchText, statusFilter]);
  const total = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pagedItems = useMemo(() => filteredItems.slice((page - 1) * perPage, page * perPage), [filteredItems, page, perPage]);
  const pageStart = total === 0 ? 0 : (page - 1) * perPage + 1;
  const pageEnd = total === 0 ? 0 : Math.min(total, (page - 1) * perPage + pagedItems.length);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, modeFilter, originFilter, searchText, perPage]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    const activeTasks = pagedItems.filter((task) => !B2S_TERMINAL_STATUSES.has(task.status));
    let cancelled = false;
    if (activeTasks.length === 0) {
      setActiveTaskDetails({});
      return;
    }
    void (async () => {
      const details = await Promise.allSettled(activeTasks.map((task) => executionApi.binaryToSource.getTask(projectId, task.id)));
      if (cancelled) return;
      const nextDetails: Record<string, B2STaskDetail> = {};
      details.forEach((result) => {
        if (result.status === 'fulfilled') {
          nextDetails[result.value.id] = result.value;
        }
      });
      setActiveTaskDetails(nextDetails);
    })();
    return () => {
      cancelled = true;
    };
  }, [executionApi.binaryToSource, pagedItems, projectId, refreshing]);

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
      const [data, projectConfig] = await Promise.all([
        executionApi.binaryToSource.listLlmProviders(projectId),
        executionApi.binaryToSource.getConfig(projectId),
      ]);
      const providers = (data.items || []).filter((item) => item.enabled);
      const projectProviderKey = String(projectConfig?.llm_provider_key || '').trim();
      setLlmProviders(providers);
      setLlmProviderKey((current) => current || projectProviderKey || data.default_provider_key || providers.find((item) => item.is_default)?.provider_key || providers[0]?.provider_key || '');
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
        mode: runMode,
        elf_tasks: elfTasks,
      });
      setShowCreateDialog(false);
      resetCreateForm();
      setCreateResult(`创建成功: ${resp.task_id}`);
      await load(false);
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
              onClick={() => void load(false)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              {refreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              {refreshing ? '刷新中...' : '刷新'}
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
            <p className="mt-1 text-sm text-slate-500">展示任务状态、进度、阶段摘要与最近更新时间，并支持筛选、分页和自动刷新。</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" />
            加载中...
          </div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">当前项目暂无二进制逆向任务。</div>
        ) : (
          <div className="mt-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900">任务列表</h2>
                <p className="mt-1 text-sm text-slate-500">支持按任务、模式、状态和来源筛选，并按设定间隔自动刷新活跃任务。</p>
              </div>
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
                <input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="筛选任务名、任务 ID、来源任务 ID"
                  className="w-64 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
                />
                <select
                  value={modeFilter}
                  onChange={(e) => setModeFilter((e.target.value || '') as '' | B2SRunMode)}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 bg-white"
                  title="任务模式筛选"
                >
                  <option value="">全部模式</option>
                  <option value="fast">快速模式</option>
                  <option value="deep">深度模式</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 bg-white"
                  title="任务状态筛选"
                >
                  <option value="">全部状态</option>
                  {['pending', 'queued', 'running', 'success', 'failed', 'cancelled', 'partial_success'].map((value) => (
                    <option key={value} value={value}>{formatB2SStatus(value)}</option>
                  ))}
                </select>
                <select
                  value={originFilter}
                  onChange={(e) => setOriginFilter((e.target.value || '') as '' | 'manual' | 'binary_security')}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 bg-white"
                  title="任务来源筛选"
                >
                  <option value="">全部来源</option>
                  <option value="manual">手动任务</option>
                  <option value="binary_security">总任务关联</option>
                </select>
              </div>
            </div>
            <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span>自动刷新：{autoRefreshEnabled ? `开启（${Math.max(5, refreshIntervalSec)}s）` : '关闭'}</span>
              {autoRefreshEnabled && !hasActiveTasks ? (
                <span className="text-amber-600">当前无运行中任务，自动刷新暂不触发</span>
              ) : null}
              {autoRefreshEnabled && hasActiveTasks ? (
                <span className="text-cyan-600">检测到活跃任务，按设定间隔自动刷新</span>
              ) : null}
              <span>当前筛选结果：{total} 条</span>
            </div>
            {pagedItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-xs text-slate-400">
                当前筛选条件下没有匹配的任务。
              </div>
            ) : (
              <ExecutionTable minWidth={1480}>
                <ExecutionTableHead>
                  <tr>
                    <ExecutionTableTh>任务</ExecutionTableTh>
                    <ExecutionTableTh>输入文件</ExecutionTableTh>
                    <ExecutionTableTh>状态</ExecutionTableTh>
                    <ExecutionTableTh>模式</ExecutionTableTh>
                    <ExecutionTableTh>阶段</ExecutionTableTh>
                    <ExecutionTableTh>总体进度</ExecutionTableTh>
                    <ExecutionTableTh>结果分布</ExecutionTableTh>
                    <ExecutionTableTh>异常项</ExecutionTableTh>
                    <ExecutionTableTh>来源</ExecutionTableTh>
                    <ExecutionTableTh>运行耗时</ExecutionTableTh>
                    <ExecutionTableTh>创建时间</ExecutionTableTh>
                    <ExecutionTableTh>最近更新</ExecutionTableTh>
                  </tr>
                </ExecutionTableHead>
                <tbody>
                  {pagedItems.map((task) => {
                    const detail = activeTaskDetails[task.id];
                    const phaseSummary = buildPhaseSummary(task, detail);
                    const modeLabel = taskModeLabel(task, detail);
                    const progressValue = detail?.overall_progress?.percent ?? (task.total_items ? ((task.success_items + task.partial_items) / task.total_items) * 100 : 0);
                    return (
                      <tr key={task.id} className={executionTableInteractiveRowClassName} onClick={() => onOpenTask(task.id)}>
                      <ExecutionTableTd className="min-w-[300px]">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-black text-slate-900">{task.name || task.id}</div>
                          <div className="mt-1 break-all font-mono text-[11px] text-slate-400">{task.id}</div>
                        </div>
                      </ExecutionTableTd>
                      <ExecutionTableTd className="min-w-[220px]">
                        <div className="space-y-1">
                          {(task.input_filenames || []).slice(0, 3).map((filename) => (
                            <div key={filename} className="truncate text-xs font-medium text-slate-700" title={filename}>
                              {filename}
                            </div>
                          ))}
                          {(task.input_filenames || []).length > 3 ? (
                            <div className="text-[11px] text-slate-400">
                              其余 {(task.input_filenames || []).length - 3} 个文件
                            </div>
                          ) : null}
                          {(!task.input_filenames || task.input_filenames.length === 0) ? (
                            <span className="text-xs text-slate-400">-</span>
                          ) : null}
                        </div>
                      </ExecutionTableTd>
                      <ExecutionTableTd><B2SStatusBadge status={task.status} /></ExecutionTableTd>
                        <ExecutionTableTd>
                          {modeLabel ? (
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ring-1 ${taskModeTone(task, detail)}`}>
                              {modeLabel}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </ExecutionTableTd>
                        <ExecutionTableTd><B2SPhaseBadge phase={phaseSummary.phase} label={phaseSummary.label} /></ExecutionTableTd>
                        <ExecutionTableTd className="min-w-[220px]">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-semibold text-slate-700">{buildProgressLabel(task, detail)}</span>
                            <span className="text-slate-400">{pct(progressValue).toFixed(1)}%</span>
                          </div>
                          <div className="mt-2">
                            <B2SProgressBar value={progressValue} />
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                            <span>待处理 {task.pending_items}</span>
                            <span>已取消 {task.cancelled_items}</span>
                          </div>
                        </ExecutionTableTd>
                        <ExecutionTableTd>
                          <div className="text-sm font-semibold text-slate-800">成功 {task.success_items} / 总数 {task.total_items}</div>
                          <div className="mt-1 text-xs text-slate-400">排队 {task.queued_items} · 运行 {task.running_items}</div>
                        </ExecutionTableTd>
                        <ExecutionTableTd>
                          <div className="text-sm font-semibold text-slate-800">失败 {task.failed_items}</div>
                          <div className="mt-1 text-xs text-slate-400">部分成功 {task.partial_items}</div>
                        </ExecutionTableTd>
                        <ExecutionTableTd className="min-w-[170px]">
                          <TaskOriginInline origin={task} compact />
                        </ExecutionTableTd>
                        <ExecutionTableTd className="whitespace-nowrap font-semibold text-slate-700">{taskRunDuration(detail, clockNow)}</ExecutionTableTd>
                        <ExecutionTableTd className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(task.created_at)}</ExecutionTableTd>
                        <ExecutionTableTd className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(task.updated_at)}</ExecutionTableTd>
                      </tr>
                    );
                  })}
                </tbody>
              </ExecutionTable>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <div className="text-xs text-slate-500">
                共 {total} 条，当前显示 {pageStart}-{pageEnd}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  每页
                  <select
                    value={perPage}
                    onChange={(e) => setPerPage(Number(e.target.value) || 20)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none"
                  >
                    {[20, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  条
                </label>
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(1)}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50"
                >
                  首页
                </button>
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50"
                >
                  上一页
                </button>
                <span className="min-w-16 text-center text-xs text-slate-500">{page} / {totalPages}</span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50"
                >
                  下一页
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(totalPages)}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50"
                >
                  末页
                </button>
              </div>
            </div>
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
                        <div className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black tracking-[0.08em] text-cyan-700 ring-1 ring-cyan-100">推荐</div>
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
                        <div className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black tracking-[0.08em] text-violet-700 ring-1 ring-violet-100">高质量</div>
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
                    {!hasSelectedProviderInList && llmProviderKey ? (
                      <option value={llmProviderKey}>
                        {llmProviderKey} · 项目默认已失效或已禁用
                      </option>
                    ) : null}
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
