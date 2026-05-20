import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Plus, RefreshCw, Trash2, UploadCloud, X } from 'lucide-react';

import { B2SElfTaskInput, B2SLlmProviderSummary, B2SPiClusterCapacity, B2SPiWorkerActiveJob, B2SRunMode, B2STask, B2STaskDetail } from '../../clients/binaryToSource';
import { api } from '../../clients/api';
import { B2SStatsHeader, summarizeB2STasks } from './B2SStatsHeader';
import { ProjectFilesystemPickerModal, ProjectFilesystemSelection } from '../../components/assets/ProjectFilesystemPickerModal';
import { ExecutionTable, ExecutionTableHead, ExecutionTableTh, ExecutionTableTd, executionTableRowClassName } from '../../components/execution/ExecutionTable';
import { B2SStatusBadge, B2S_TERMINAL_STATUSES, formatB2SOverallProgressBasis, formatB2SStatus, formatDateTime, pct } from './b2sPresentation';
import { showConfirm } from '../../components/DialogService';

interface Props {
  projectId: string;
  onOpenTask: (taskId: string) => void;
}

const B2S_APP_ROOT = 'app/secflow-app-binary-to-source';
const FILESERVER_STORAGE_ROOT = '/data';
const standardInputPath = (taskId: string, sequenceNo: number): string => `/${B2S_APP_ROOT}/${taskId}/${sequenceNo}/input`;
const safeCount = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
};

const formatBytes = (value: number): string => {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
};

const buildProgressLabel = (task: B2STask, detail?: B2STaskDetail | null) => {
  const total = task.total_items || 0;
  if (detail?.overall_progress?.percent !== undefined && detail.overall_progress.percent !== null) {
    return `${pct(detail.overall_progress.percent).toFixed(1)}% · ${formatB2SOverallProgressBasis(detail.overall_progress.percent_basis)}`;
  }
  if (total <= 0) return '-';
  return `${task.success_items || 0}/${total}`;
};

const B2S_TASK_STATUS_ORDER = ['pending', 'running', 'success', 'partial', 'failed', 'cancelled', 'completed'];

const normalizeB2STaskStatus = (status?: string | null) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'partial_success') return 'partial';
  if (normalized === 'queued') return 'pending';
  return normalized;
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

const formatPiJobStage = (job: B2SPiWorkerActiveJob) => {
  const parts = [
    job.phase ? `阶段 ${job.phase}` : '',
    job.current_batch != null ? `批次 ${job.current_batch}` : '',
    job.current_attempt != null ? `尝试 ${job.current_attempt}` : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : '阶段信息暂缺';
};

export const B2SOverviewPage: React.FC<Props> = ({ projectId, onOpenTask }) => {
  const executionApi = api.domains.execution;
  const assetApi = api.domains.assets;
  const autoRefreshStorageKey = `secflow:b2s:autoRefresh:${projectId || 'default'}`;
  const refreshIntervalStorageKey = `secflow:b2s:refreshInterval:${projectId || 'default'}`;
  const [items, setItems] = useState<B2STask[]>([]);
  const [piClusterCapacity, setPiClusterCapacity] = useState<B2SPiClusterCapacity | null>(null);
  const [activeTaskDetails, setActiveTaskDetails] = useState<Record<string, B2STaskDetail>>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [statusFilter, setStatusFilter] = useState('');
  const [parentTaskFilter, setParentTaskFilter] = useState('');
  const [inputFileFilter, setInputFileFilter] = useState('');
  const [expandedInputTaskIds, setExpandedInputTaskIds] = useState<string[]>([]);
  const [originFilter, setOriginFilter] = useState<'' | 'manual' | 'binary_security'>('');
  const [searchText, setSearchText] = useState('');
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [showSlotDetailModal, setShowSlotDetailModal] = useState(false);
  const [expandedSlotWorkerIds, setExpandedSlotWorkerIds] = useState<string[]>([]);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [refreshIntervalSec, setRefreshIntervalSec] = useState(10);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [name, setName] = useState('');
  const [concurrency, setConcurrency] = useState(4);
  const [runMode, setRunMode] = useState<B2SRunMode>('fast');
  const [llmProviderKey, setLlmProviderKey] = useState('');
  const [reuseCache, setReuseCache] = useState(true);
  const [llmProviders, setLlmProviders] = useState<B2SLlmProviderSummary[]>([]);
  const [llmProvidersLoading, setLlmProvidersLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedServerFiles, setSelectedServerFiles] = useState<ProjectFilesystemSelection[]>([]);
  const [showFilesystemPicker, setShowFilesystemPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string>('');
  const [createResult, setCreateResult] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState('');
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

  const loadPiClusterCapacity = useCallback(async () => {
    if (!projectId) return;
    try {
      const snapshot = await executionApi.binaryToSource.getPiClusterCapacity(projectId);
      setPiClusterCapacity(snapshot);
    } catch {
      setPiClusterCapacity(null);
    }
  }, [executionApi.binaryToSource, projectId]);

  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    void loadPiClusterCapacity();
  }, [loadPiClusterCapacity]);

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
    if (!projectId) return;
    const timer = window.setInterval(() => {
      if (!autoRefreshEnabled) return;
      void load(false);
      void loadPiClusterCapacity();
    }, Math.max(5, refreshIntervalSec) * 1000);
    return () => window.clearInterval(timer);
  }, [autoRefreshEnabled, load, loadPiClusterCapacity, projectId, refreshIntervalSec]);

  const stats = useMemo(() => summarizeB2STasks(items), [items]);
  const statusOptions = useMemo(() => {
    const present = new Set(items.map((task) => normalizeB2STaskStatus(task.status)).filter(Boolean));
    return B2S_TASK_STATUS_ORDER.filter((status) => present.has(status));
  }, [items]);
  const filteredItems = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    const inputKeyword = inputFileFilter.trim().toLowerCase();
    return items.filter((task) => {
      if (statusFilter && normalizeB2STaskStatus(task.status) !== statusFilter) return false;
      if (parentTaskFilter && String(task.parent_task_id || '').trim() !== parentTaskFilter) return false;
      if (inputKeyword) {
        const filenames = (task.input_filenames || []).map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
        if (!filenames.some((value) => value.includes(inputKeyword))) return false;
      }
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
  }, [inputFileFilter, items, originFilter, parentTaskFilter, searchText, statusFilter]);
  const total = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pagedItems = useMemo(() => filteredItems.slice((page - 1) * perPage, page * perPage), [filteredItems, page, perPage]);
  const pageStart = total === 0 ? 0 : (page - 1) * perPage + 1;
  const pageEnd = total === 0 ? 0 : Math.min(total, (page - 1) * perPage + pagedItems.length);
  const pagedTaskIds = useMemo(() => pagedItems.map((task) => task.id), [pagedItems]);
  const selectedTaskIdSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds]);
  const allPagedSelected = pagedTaskIds.length > 0 && pagedTaskIds.every((taskId) => selectedTaskIdSet.has(taskId));

  useEffect(() => {
    setPage(1);
  }, [statusFilter, parentTaskFilter, inputFileFilter, originFilter, searchText, perPage]);

  useEffect(() => {
    const visible = new Set(pagedTaskIds);
    setSelectedTaskIds((current) => current.filter((taskId) => visible.has(taskId)));
  }, [pagedTaskIds]);

  const toggleStatusFilter = (value?: string | null) => {
    const normalized = normalizeB2STaskStatus(value);
    if (!normalized) return;
    setStatusFilter((current) => current === normalized ? '' : normalized);
  };

  const toggleParentTaskFilter = (value?: string | null) => {
    const normalized = String(value || '').trim();
    if (!normalized) return;
    setParentTaskFilter((current) => current === normalized ? '' : normalized);
  };

  const toggleInputFileFilter = (value?: string | null) => {
    const normalized = String(value || '').trim();
    if (!normalized) return;
    setInputFileFilter((current) => current === normalized ? '' : normalized);
  };

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds((current) => (
      current.includes(taskId)
        ? current.filter((value) => value !== taskId)
        : current.concat(taskId)
    ));
  };

  const toggleSelectCurrentPage = () => {
    setSelectedTaskIds(allPagedSelected ? [] : pagedTaskIds);
  };

  const toggleSlotWorkerExpanded = (workerId: string) => {
    setExpandedSlotWorkerIds((current) => (
      current.includes(workerId)
        ? current.filter((value) => value !== workerId)
        : current.concat(workerId)
    ));
  };

  const handleBatchDelete = async () => {
    if (selectedTaskIds.length === 0 || batchDeleting) return;
    const confirmed = await showConfirm({
      title: '批量删除二进制逆向任务',
      message: `将删除 ${selectedTaskIds.length} 个任务；运行中/排队中任务会先尝试取消上游 job，再删除记录和文件。此操作不可恢复。`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    setBatchDeleting(true);
    setError(null);
    setCreateResult('');
    try {
      const result = await executionApi.binaryToSource.batchDeleteTasks(projectId, selectedTaskIds);
      const deletedIds = new Set((result.results || []).filter((item) => item.status === 'ok').map((item) => item.task_id));
      setSelectedTaskIds((current) => current.filter((taskId) => !deletedIds.has(taskId)));
      await load(false);
      await loadPiClusterCapacity();
      if ((result.failed_count || 0) > 0) {
        const firstFailure = (result.results || []).find((item) => item.status !== 'ok');
        setError(`批量删除完成，成功 ${result.deleted_count || 0} 个，失败 ${result.failed_count || 0} 个。${firstFailure?.message || ''}`);
      } else {
        setCreateResult(`已删除 ${result.deleted_count || 0} 个二进制逆向任务`);
      }
    } catch (e: any) {
      setError(e?.message || '批量删除失败');
    } finally {
      setBatchDeleting(false);
    }
  };

  const toggleExpandedInputFiles = (taskId: string) => {
    setExpandedInputTaskIds((current) => (
      current.includes(taskId)
        ? current.filter((value) => value !== taskId)
        : current.concat(taskId)
    ));
  };

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    const tasksNeedingDetails = pagedItems.filter((task) => (
      !B2S_TERMINAL_STATUSES.has(task.status)
      || task.total_functions == null
      || task.completed_functions == null
      || task.uncompleted_functions == null
    ));
    let cancelled = false;
    if (tasksNeedingDetails.length === 0) {
      setActiveTaskDetails({});
      return;
    }
    void (async () => {
      const details = await Promise.allSettled(tasksNeedingDetails.map((task) => executionApi.binaryToSource.getTask(projectId, task.id)));
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
    setReuseCache(true);
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
        reuse_cache: reuseCache,
        elf_tasks: elfTasks,
      });
      setShowCreateDialog(false);
      resetCreateForm();
      setCreateResult(`创建成功: ${resp.task_id}`);
      await load(false);
      await loadPiClusterCapacity();
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
              onClick={() => {
                void load(false);
                void loadPiClusterCapacity();
              }}
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
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900">执行槽位</h2>
            <p className="mt-1 text-sm text-slate-500">展示当前 PI RE Agent 集群的实时执行槽位、运行中的 job 数量和各 worker 健康度。</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xs text-slate-400">
              最近同步 {formatDateTime(piClusterCapacity?.updated_at)}
            </div>
            <button
              type="button"
              onClick={() => setShowSlotDetailModal(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              查看详情
            </button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-3">
            <div className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-700">总槽位</div>
            <div className="mt-2 text-2xl font-black text-slate-900">{piClusterCapacity?.total_capacity ?? '-'}</div>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
            <div className="text-[11px] font-black uppercase tracking-[0.24em] text-amber-700">运行中</div>
            <div className="mt-2 text-2xl font-black text-slate-900">{piClusterCapacity?.running_jobs ?? '-'}</div>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
            <div className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-700">空闲槽位</div>
            <div className="mt-2 text-2xl font-black text-slate-900">{piClusterCapacity?.available_slots ?? '-'}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-600">排队 Job</div>
            <div className="mt-2 text-2xl font-black text-slate-900">{piClusterCapacity?.queued_jobs ?? '-'}</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          {(piClusterCapacity?.workers || []).map((worker) => (
            <div
              key={worker.worker_id}
              className={`min-w-[220px] rounded-2xl border px-4 py-3 ${
                worker.healthy
                  ? 'border-slate-200 bg-slate-50'
                  : 'border-rose-200 bg-rose-50'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-black text-slate-900">{worker.worker_id}</div>
                <div className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  worker.healthy ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                }`}>
                  {worker.healthy ? 'healthy' : 'unhealthy'}
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-600">
                槽位 {worker.running_jobs}/{worker.max_concurrent_jobs}
                {worker.available_slots >= 0 ? ` · 空闲 ${worker.available_slots}` : ''}
              </div>
              <div className="mt-1 text-xs text-slate-400">
                来源 {worker.source || 'capacity'}
              </div>
              {worker.error ? (
                <div className="mt-2 break-all text-[11px] text-rose-600">{worker.error}</div>
              ) : null}
            </div>
          ))}
          {piClusterCapacity && (piClusterCapacity.workers || []).length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-400">
              当前未发现可用的 PI RE Agent worker。
            </div>
          ) : null}
        </div>
      </section>

      {showSlotDetailModal ? (
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm" onClick={() => setShowSlotDetailModal(false)}>
          <div className="w-full max-w-5xl rounded-[2rem] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] shadow-[0_30px_100px_rgba(15,23,42,0.35)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-700">Slot Detail</div>
                <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-900">执行槽位详情</h3>
                <p className="mt-2 text-sm text-slate-500">按 worker 展示当前正在执行的逆向任务；点击每个 worker 头部展开或收起详细信息。</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right text-xs text-slate-400">
                  <div>最近同步</div>
                  <div className="mt-1 font-semibold text-slate-500">{formatDateTime(piClusterCapacity?.updated_at)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSlotDetailModal(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  aria-label="关闭执行槽位详情"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="max-h-[75vh] overflow-auto px-6 py-5">
              {(piClusterCapacity?.workers || []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-400">
                  当前未发现可用的 PI RE Agent worker。
                </div>
              ) : (
                <div className="space-y-4">
                  {(piClusterCapacity?.workers || []).map((worker) => {
                    const expanded = expandedSlotWorkerIds.includes(worker.worker_id);
                    const activeJobs = worker.active_jobs || [];
                    const hasDetailError = !!worker.error && worker.healthy;
                    return (
                      <section
                        key={worker.worker_id}
                        className={`overflow-hidden rounded-[1.5rem] border ${
                          worker.healthy ? 'border-slate-200 bg-white' : 'border-rose-200 bg-rose-50/70'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSlotWorkerExpanded(worker.worker_id)}
                          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50/70"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-black text-slate-900">{worker.worker_id}</div>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                worker.healthy ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                              }`}>
                                {worker.healthy ? 'healthy' : 'unhealthy'}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                活动任务 {activeJobs.length}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                              <span>槽位 {worker.running_jobs}/{worker.max_concurrent_jobs}</span>
                              <span>空闲 {worker.available_slots}</span>
                              <span>来源 {worker.source || 'capacity'}</span>
                            </div>
                          </div>
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500">
                            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </div>
                        </button>
                        {expanded ? (
                          <div className="border-t border-slate-100 px-5 py-4">
                            {!worker.healthy ? (
                              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                                Worker 当前不可用。{worker.error ? `原因：${worker.error}` : ''}
                              </div>
                            ) : hasDetailError ? (
                              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                明细拉取失败。{worker.error}
                              </div>
                            ) : activeJobs.length === 0 ? (
                              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
                                当前无运行中逆向任务。
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {activeJobs.map((job) => (
                                  <div
                                    key={`${worker.worker_id}:${job.pi_job_id}`}
                                    className={`rounded-2xl border px-4 py-4 ${
                                      job.mapped
                                        ? 'border-slate-200 bg-slate-50/70'
                                        : 'border-amber-200 bg-amber-50/80'
                                    }`}
                                  >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <div className="truncate text-sm font-black text-slate-900" title={job.elf_name || job.elf_path || job.pi_job_id}>
                                            {job.elf_name || job.elf_path || job.pi_job_id}
                                          </div>
                                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                            job.mapped ? 'bg-cyan-100 text-cyan-700' : 'bg-amber-100 text-amber-700'
                                          }`}>
                                            {job.mapped ? '已关联任务' : '未关联任务'}
                                          </span>
                                        </div>
                                        <div className="mt-1 break-all font-mono text-[11px] text-slate-500">{job.elf_path || '-'}</div>
                                      </div>
                                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
                                        <div className="font-semibold text-slate-700">pi job</div>
                                        <div className="mt-1 font-mono">{job.pi_job_id}</div>
                                      </div>
                                    </div>
                                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                      <div className="rounded-xl border border-white/80 bg-white px-3 py-3">
                                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">归属任务</div>
                                        {job.mapped && job.task_id ? (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setShowSlotDetailModal(false);
                                                onOpenTask(job.task_id as string);
                                              }}
                                              className="mt-2 text-left text-sm font-bold text-cyan-700 hover:text-cyan-800"
                                            >
                                              {job.task_name || job.task_id}
                                            </button>
                                            <div className="mt-1 break-all font-mono text-[11px] text-slate-500">{job.task_id}</div>
                                          </>
                                        ) : (
                                          <div className="mt-2 text-sm font-semibold text-amber-800">未关联 B2S 任务</div>
                                        )}
                                      </div>
                                      <div className="rounded-xl border border-white/80 bg-white px-3 py-3">
                                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">总任务 ID</div>
                                        <div className="mt-2 break-all font-mono text-sm text-slate-700">{job.parent_task_id || '-'}</div>
                                      </div>
                                      <div className="rounded-xl border border-white/80 bg-white px-3 py-3">
                                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">执行位置</div>
                                        <div className="mt-2 text-sm font-semibold text-slate-700">{formatPiJobStage(job)}</div>
                                        <div className="mt-1 text-[11px] text-slate-500">{job.current_function || '当前函数信息暂缺'}</div>
                                      </div>
                                      <div className="rounded-xl border border-white/80 bg-white px-3 py-3">
                                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">开始时间</div>
                                        <div className="mt-2 text-sm font-semibold text-slate-700">{formatDateTime(job.started_at)}</div>
                                      </div>
                                      <div className="rounded-xl border border-white/80 bg-white px-3 py-3">
                                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">最近更新时间</div>
                                        <div className="mt-2 text-sm font-semibold text-slate-700">{formatDateTime(job.updated_at)}</div>
                                      </div>
                                      <div className="rounded-xl border border-white/80 bg-white px-3 py-3">
                                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">任务项</div>
                                        <div className="mt-2 text-sm font-semibold text-slate-700">
                                          {job.sequence_no != null ? `#${job.sequence_no}` : '-'}
                                        </div>
                                        <div className="mt-1 break-all font-mono text-[11px] text-slate-500">{job.item_id || '-'}</div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

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
                <p className="mt-1 text-sm text-slate-500">点击“任务”列进入详情；点击“状态”或“总任务 ID”单元格可快速切换筛选。</p>
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
              </div>
            </div>
            <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span>自动刷新：{autoRefreshEnabled ? `开启（${Math.max(5, refreshIntervalSec)}s）` : '关闭'}</span>
              {autoRefreshEnabled ? (
                <span className="text-cyan-600">任务列表与执行槽位按设定间隔自动刷新</span>
              ) : null}
              <span>当前筛选结果：{total} 条</span>
              {statusFilter ? (
                <button
                  type="button"
                  onClick={() => setStatusFilter('')}
                  className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700"
                >
                  状态：{formatB2SStatus(statusFilter)} x
                </button>
              ) : null}
              {parentTaskFilter ? (
                <button
                  type="button"
                  onClick={() => setParentTaskFilter('')}
                  className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700"
                >
                  总任务 ID：{parentTaskFilter} x
                </button>
              ) : null}
              {inputFileFilter ? (
                <button
                  type="button"
                  onClick={() => setInputFileFilter('')}
                  className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-700"
                >
                  输入文件：{inputFileFilter} x
                </button>
              ) : null}
              {originFilter ? (
                <button
                  type="button"
                  onClick={() => setOriginFilter('')}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700"
                >
                  来源：{originFilter === 'manual' ? '手动任务' : '关联总任务'} x
                </button>
              ) : null}
            </div>
            {selectedTaskIds.length > 0 ? (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3">
                <div className="text-xs font-bold text-rose-700">
                  已选择 {selectedTaskIds.length} 个当前页任务
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedTaskIds([])}
                    disabled={batchDeleting}
                    className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  >
                    取消选择
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleBatchDelete()}
                    disabled={batchDeleting}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
                  >
                    {batchDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    {batchDeleting ? '删除中...' : '批量删除'}
                  </button>
                </div>
              </div>
            ) : null}
            {pagedItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-xs text-slate-400">
                当前筛选条件下没有匹配的任务。
              </div>
            ) : (
              <ExecutionTable minWidth={1540}>
                <ExecutionTableHead>
                  <tr>
                    <ExecutionTableTh>
                      <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-500">
                        <input
                          type="checkbox"
                          checked={allPagedSelected}
                          onChange={toggleSelectCurrentPage}
                          className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                        />
                        选择
                      </label>
                    </ExecutionTableTh>
                    <ExecutionTableTh>
                      <div className="space-y-2">
                        <div>任务</div>
                        <input
                          value={searchText}
                          onChange={(e) => setSearchText(e.target.value)}
                          placeholder="搜索任务名/任务ID"
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs normal-case tracking-normal text-slate-700"
                          onClick={(event) => event.stopPropagation()}
                        />
                      </div>
                    </ExecutionTableTh>
                    <ExecutionTableTh>
                      <div className="space-y-2">
                        <div>输入文件</div>
                        <input
                          value={inputFileFilter}
                          onChange={(e) => setInputFileFilter(e.target.value)}
                          placeholder="搜索输入文件"
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs normal-case tracking-normal text-slate-700"
                          onClick={(event) => event.stopPropagation()}
                        />
                      </div>
                    </ExecutionTableTh>
                    <ExecutionTableTh>
                      <div className="space-y-2">
                        <div>状态</div>
                        <div className="text-[10px] font-semibold normal-case tracking-normal text-slate-400">
                          {statusFilter ? `当前: ${formatB2SStatus(statusFilter)}` : '点击单元格快速筛选'}
                        </div>
                      </div>
                    </ExecutionTableTh>
                    <ExecutionTableTh>
                      <div className="space-y-2">
                        <div>总任务 ID</div>
                        <div className="text-[10px] font-semibold normal-case tracking-normal text-slate-400">
                          {parentTaskFilter ? `当前: ${parentTaskFilter}` : '点击单元格快速筛选'}
                        </div>
                      </div>
                    </ExecutionTableTh>
                    <ExecutionTableTh>总体进度</ExecutionTableTh>
                    <ExecutionTableTh>函数处理</ExecutionTableTh>
                    <ExecutionTableTh>异常项</ExecutionTableTh>
                    <ExecutionTableTh>
                      <div className="space-y-2">
                        <div>来源</div>
                        <select
                          value={originFilter}
                          onChange={(e) => setOriginFilter((e.target.value || '') as '' | 'manual' | 'binary_security')}
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs normal-case tracking-normal text-slate-700"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <option value="">全部来源</option>
                          <option value="manual">手动任务</option>
                          <option value="binary_security">关联总任务</option>
                        </select>
                      </div>
                    </ExecutionTableTh>
                    <ExecutionTableTh>运行耗时</ExecutionTableTh>
                    <ExecutionTableTh>创建时间</ExecutionTableTh>
                    <ExecutionTableTh>最近更新</ExecutionTableTh>
                  </tr>
                </ExecutionTableHead>
                <tbody>
                  {pagedItems.map((task) => {
                    const detail = activeTaskDetails[task.id];
                    const inputFilenames = task.input_filenames || [];
                    const inputsExpanded = expandedInputTaskIds.includes(task.id);
                    const visibleInputFilenames = inputsExpanded ? inputFilenames : inputFilenames.slice(0, 3);
                    const progressValue = detail?.overall_progress?.percent ?? (task.total_items ? ((task.success_items + task.partial_items) / task.total_items) * 100 : 0);
                    const progressBasisLabel = formatB2SOverallProgressBasis(detail?.overall_progress?.percent_basis);
                    const parentTaskId = String(task.parent_task_id || '').trim();
                    const sourceLabel = String(task.task_origin_type || 'manual').trim() === 'binary_security'
                      ? (String(task.origin_label || '').trim() || '二进制安全任务')
                      : '手动创建';
                    const normalizedTaskStatus = normalizeB2STaskStatus(task.status);
                    const totalFunctions = safeCount(task.total_functions ?? detail?.overall_progress?.total_functions);
                    const completedFunctions = safeCount(task.completed_functions ?? detail?.overall_progress?.completed_functions);
                    const uncompletedFunctions = safeCount(task.uncompleted_functions) ?? (
                      totalFunctions !== null && completedFunctions !== null ? Math.max(0, totalFunctions - completedFunctions) : null
                    );
                    const failedFunctions = safeCount(task.failed_functions);
                    const taskSelected = selectedTaskIdSet.has(task.id);
                    return (
                      <tr key={task.id} className={executionTableRowClassName}>
                      <ExecutionTableTd>
                        <input
                          type="checkbox"
                          checked={taskSelected}
                          onChange={() => toggleTaskSelection(task.id)}
                          onClick={(event) => event.stopPropagation()}
                          className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                          aria-label={`选择任务 ${task.name || task.id}`}
                        />
                      </ExecutionTableTd>
                      <ExecutionTableTd className="min-w-[300px]">
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => onOpenTask(task.id)}
                            className="truncate text-left text-sm font-black text-slate-900 hover:text-cyan-700"
                            title={task.name || task.id}
                          >
                            {task.name || task.id}
                          </button>
                          <div className="mt-1 break-all font-mono text-[11px] text-slate-400">{task.id}</div>
                        </div>
                      </ExecutionTableTd>
                      <ExecutionTableTd className="min-w-[220px]">
                        <div className="space-y-1">
                          {visibleInputFilenames.map((filename) => (
                            <button
                              key={filename}
                              type="button"
                              onClick={() => toggleInputFileFilter(filename)}
                              className="block max-w-full truncate text-left text-xs font-medium text-slate-700 hover:text-cyan-700"
                              title={inputFileFilter === filename ? '再次点击取消该输入文件筛选' : '点击按该输入文件快速筛选'}
                            >
                              {filename}
                            </button>
                          ))}
                          {inputFilenames.length > 3 ? (
                            <button
                              type="button"
                              onClick={() => toggleExpandedInputFiles(task.id)}
                              className="text-[11px] text-slate-400 hover:text-cyan-700"
                            >
                              {inputsExpanded ? '收起剩余文件' : `其余 ${inputFilenames.length - 3} 个文件`}
                            </button>
                          ) : null}
                          {inputFilenames.length === 0 ? (
                            <span className="text-xs text-slate-400">-</span>
                          ) : null}
                        </div>
                      </ExecutionTableTd>
                      <ExecutionTableTd>
                        <button
                          type="button"
                          onClick={() => toggleStatusFilter(normalizedTaskStatus)}
                          className="rounded-xl"
                          title={statusFilter === normalizedTaskStatus ? '再次点击取消该状态筛选' : '点击按该状态快速筛选'}
                        >
                          <B2SStatusBadge status={task.status} />
                        </button>
                      </ExecutionTableTd>
                        <ExecutionTableTd className="min-w-[170px]">
                          {parentTaskId ? (
                            <button
                              type="button"
                              onClick={() => toggleParentTaskFilter(parentTaskId)}
                              className="font-mono text-left text-xs font-semibold text-slate-700 hover:text-violet-700"
                              title={parentTaskFilter === parentTaskId ? '再次点击取消该总任务ID筛选' : '点击按该总任务ID快速筛选'}
                            >
                              {parentTaskId}
                            </button>
                          ) : (
                            <span className="font-mono text-xs font-semibold text-slate-400">-</span>
                          )}
                        </ExecutionTableTd>
                        <ExecutionTableTd className="min-w-[220px]">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-semibold text-slate-700">{buildProgressLabel(task, detail)}</span>
                            <span className="text-slate-400">{progressBasisLabel}</span>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                            <span>ELF {detail?.overall_progress?.completed_items ?? task.success_items ?? 0}/{task.total_items || 0}</span>
                            <span>已取消 {task.cancelled_items}</span>
                          </div>
                        </ExecutionTableTd>
                        <ExecutionTableTd>
                          {totalFunctions !== null && totalFunctions > 0 && completedFunctions !== null ? (
                            <>
                              <div className="text-sm font-semibold text-slate-800">成功 {completedFunctions} / 总数 {totalFunctions}</div>
                              <div className="mt-1 text-xs text-slate-400">
                                未完成 {uncompletedFunctions ?? '-'}
                                {failedFunctions !== null ? ` · 失败 ${failedFunctions}` : ''}
                              </div>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </ExecutionTableTd>
                        <ExecutionTableTd>
                          <div className="text-sm font-semibold text-slate-800">失败 {task.failed_items}</div>
                          <div className="mt-1 text-xs text-slate-400">部分成功 {task.partial_items}</div>
                        </ExecutionTableTd>
                        <ExecutionTableTd className="min-w-[170px]">
                          <div className="text-sm font-semibold text-slate-800">{sourceLabel}</div>
                          <div className="mt-1 text-xs text-slate-400">
                            {String(task.task_origin_type || 'manual').trim() === 'binary_security'
                              ? `来源阶段 ${String(task.parent_stage_name || '').trim() || '-'}`
                              : '-'}
                          </div>
                        </ExecutionTableTd>
                        <ExecutionTableTd className="whitespace-nowrap font-semibold text-slate-700">{formatDurationMs(task.run_duration_ms)}</ExecutionTableTd>
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
                <div className="rounded-3xl border border-emerald-200 bg-emerald-50/70 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-black text-slate-900">复用已有缓存</div>
                      <div className="mt-1 text-xs font-semibold leading-5 text-slate-600">
                        默认开启。关闭后，本次会忽略历史缓存；如果任务成功，会覆盖当前 ELF 在 {runMode === 'deep' ? '深度模式' : '快速模式'} 下的缓存结果。
                      </div>
                    </div>
                    <label className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-black text-emerald-700">
                      <input
                        type="checkbox"
                        checked={reuseCache}
                        onChange={(e) => setReuseCache(e.target.checked)}
                        disabled={submitting}
                      />
                      {reuseCache ? '已开启' : '已关闭'}
                    </label>
                  </div>
                </div>
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
