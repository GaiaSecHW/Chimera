import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Plus, RefreshCw, Trash2, UploadCloud, X } from 'lucide-react';

import { B2SElfTaskInput, B2SLlmProviderSummary, B2SPiClusterCapacity, B2SPiWorkerActiveJob, B2SRunMode, B2STask, B2STaskListStats } from '../../clients/binaryToSource';
import { api } from '../../clients/api';
import { B2SStatsHeader, emptyB2SStats, summarizeB2STasks } from './B2SStatsHeader';
import { ProjectFilesystemPickerModal, ProjectFilesystemSelection } from '../../components/assets/ProjectFilesystemPickerModal';
import { ExecutionTable, ExecutionTableHead, ExecutionTableTh, ExecutionTableTd, executionTableRowClassName } from '../../components/execution/ExecutionTable';
import { ServicePageTitle, useServiceBuildVersion } from '../../components/execution/ServiceBuildVersion';
import { B2SStatusBadge, B2S_TERMINAL_STATUSES, formatB2SOverallProgressBasis, formatB2SStatus, formatDateTime, pct } from './b2sPresentation';
import { SlotResourceBlock } from './slotResourceBlock';
import { showConfirm } from '../../components/DialogService';
import { PageHeader } from '../../design-system';

interface Props {
  projectId: string;
  onOpenTask: (taskId: string) => void;
}

const B2S_APP_ROOT = 'app/chimera-app-binary-to-source';
const FILESERVER_STORAGE_ROOT = '/data';
const standardInputPath = (taskId: string, sequenceNo: number): string =>`/${B2S_APP_ROOT}/${taskId}/${sequenceNo}/input`;
const safeCount = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
};

const formatBytes = (value: number): string => {
  if (value >= 1024 * 1024) return`${(value / 1024 / 1024).toFixed(2)} MB`;
  if (value >= 1024) return`${(value / 1024).toFixed(1)} KB`;
  return`${value} B`;
};

const buildProgressLabel = (task: B2STask) => {
  const total = task.total_items || 0;
  if (total <= 0) return '-';
  return`${task.success_items || 0}/${total}`;
};

const B2S_TASK_STATUS_ORDER = ['pending', 'running', 'success', 'partial', 'failed', 'cancelled', 'completed'];

const normalizeB2STaskStatus = (status?: string | null) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'partial_success') return 'partial';
  if (normalized === 'queued') return 'pending';
  return normalized;
};

const B2S_MODE_LABELS: Record<B2SRunMode, string> = {
  turbo: '极速模式',
  fast: '快速模式',
  deep: '深度模式',
};

const formatDurationMs = (durationMs?: number | null) => {
  if (durationMs === undefined || durationMs === null || Number.isNaN(durationMs) || durationMs < 0) return '-';
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) return`${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest ?`${minutes}m ${rest}s` :`${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const minuteRest = minutes % 60;
  return minuteRest ?`${hours}h ${minuteRest}m` :`${hours}h`;
};

const formatPiJobStage = (job: B2SPiWorkerActiveJob) => {
  const parts = [
    job.phase ?`阶段 ${job.phase}` : '',
    job.current_batch != null ?`批次 ${job.current_batch}` : '',
    job.current_attempt != null ?`尝试 ${job.current_attempt}` : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : '阶段信息暂缺';
};

export const B2SOverviewPage: React.FC<Props> = ({ projectId, onOpenTask }) => {
  const executionApi = api.domains.execution;
  const assetApi = api.domains.assets;
  const buildVersion = useServiceBuildVersion(executionApi.binaryToSource.getHealth);
  const autoRefreshStorageKey =`chimera:b2s:autoRefresh:${projectId || 'default'}`;
  const refreshIntervalStorageKey =`chimera:b2s:refreshInterval:${projectId || 'default'}`;
  const [items, setItems] = useState<B2STask[]>([]);
  const [taskStats, setTaskStats] = useState<B2STaskListStats>({ total: 0, pending: 0, running: 0, success: 0, partial: 0, failed: 0, cancelled: 0 });
  const [piClusterCapacity, setPiClusterCapacity] = useState<B2SPiClusterCapacity | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [statusFilter, setStatusFilter] = useState('');
  const [parentTaskFilter, setParentTaskFilter] = useState('');
  const [inputFileFilter, setInputFileFilter] = useState('');
  const [expandedInputTaskIds, setExpandedInputTaskIds] = useState<string[]>([]);
  const [originFilter, setOriginFilter] = useState<'' | 'manual' | 'binary_security'>('');
  const [searchText, setSearchText] = useState('');
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [showSlotDetailModal, setShowSlotDetailModal] = useState(false);
  const [slotPanelExpanded, setSlotPanelExpanded] = useState(false);
  const [expandedSlotWorkerIds, setExpandedSlotWorkerIds] = useState<string[]>([]);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [refreshIntervalSec, setRefreshIntervalSec] = useState(10);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [name, setName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [concurrency, setConcurrency] = useState(8);
  const [projectDefaultConcurrency, setProjectDefaultConcurrency] = useState(8);
  const [projectDefaultMode, setProjectDefaultMode] = useState<B2SRunMode>('turbo');
  const [runMode, setRunMode] = useState<B2SRunMode>('turbo');
  const [modeOverridden, setModeOverridden] = useState(false);
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
  const piClusterSnapshotTime = piClusterCapacity?.snapshot_refreshed_at || piClusterCapacity?.updated_at || null;
  const piClusterSnapshotExpired = Boolean(piClusterCapacity?.snapshot_stale);
  const piClusterSnapshotError = piClusterCapacity?.snapshot_last_error || '';

  const listQuery = useMemo(() => ({
    status: statusFilter || undefined,
    search: searchText.trim() || undefined,
    parent_task_id: parentTaskFilter.trim() || undefined,
    task_origin_type: originFilter || undefined,
    input_filename: inputFileFilter.trim() || undefined,
    sort_by: 'created_at',
    sort_order: 'desc' as const,
    limit: perPage,
    offset: Math.max(0, (page - 1) * perPage),
  }), [inputFileFilter, originFilter, page, perPage, parentTaskFilter, searchText, statusFilter]);

  const load = useCallback(async (showLoading = true) => {
    if (!projectId) return;
    if (showLoading) setLoading(true);
    else setRefreshing(true);
    try {
      const [data, stats] = await Promise.all([
        executionApi.binaryToSource.listTasks(projectId, listQuery),
        executionApi.binaryToSource.getTaskStats(projectId, listQuery),
      ]);
      setItems(data.items || []);
      setTaskStats(stats);
      setError(null);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      if (showLoading) setLoading(false);
      else setRefreshing(false);
    }
  }, [executionApi.binaryToSource, listQuery, projectId]);

  const loadPiClusterCapacity = useCallback(async () => {
    if (!projectId) return;
    try {
      const snapshot = await executionApi.binaryToSource.getPiClusterCapacity();
      setPiClusterCapacity(snapshot);
    } catch {
      return;
    }
  }, [executionApi.binaryToSource, projectId]);

  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    void loadPiClusterCapacity();
  }, [loadPiClusterCapacity]);

  useEffect(() => {
    const storedTaskId = sessionStorage.getItem('chimera:b2sTaskId');
    if (!storedTaskId) return;
    sessionStorage.removeItem('chimera:b2sTaskId');
    onOpenTask(storedTaskId);
  }, [onOpenTask]);

  useEffect(() => {
    if (!showCreateDialog) return;
    if (nameEdited) return;
    if (name.trim()) return;
    const now = new Date();
    const ts =`${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    setName(`b2s-${ts}`);
  }, [showCreateDialog, name, nameEdited]);

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

  const stats = useMemo(() => {
    const hasProjectItemStats = typeof taskStats.total_items === 'number';
    if (hasProjectItemStats) {
      return {
        taskCount: taskStats.task_count ?? taskStats.total ?? 0,
        totalItems: taskStats.total_items ?? 0,
        pendingItems: taskStats.pending_items ?? 0,
        queuedItems: taskStats.queued_items ?? 0,
        runningItems: taskStats.running_items ?? 0,
        cancellingItems: taskStats.cancelling_items ?? 0,
        successItems: taskStats.success_items ?? 0,
        partialItems: taskStats.partial_items ?? 0,
        failedItems: taskStats.failed_items ?? 0,
        cancelledItems: taskStats.cancelled_items ?? 0,
      };
    }
    return items.length > 0 ? summarizeB2STasks(items) : emptyB2SStats();
  }, [items, taskStats]);
  const statusOptions = B2S_TASK_STATUS_ORDER.filter((status) => {
    if (status === 'pending') return stats.pendingItems > 0;
    if (status === 'running') return stats.runningItems > 0;
    if (status === 'success' || status === 'completed') return stats.successItems > 0;
    if (status === 'partial') return stats.partialItems > 0;
    if (status === 'failed') return stats.failedItems > 0;
    if (status === 'cancelled') return stats.cancelledItems > 0;
    return false;
  });
  const total = stats.taskCount;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pagedItems = items;
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
      message:`将删除 ${selectedTaskIds.length} 个任务；运行中/排队中任务会先尝试取消上游 job，再删除记录和文件。此操作不可恢复。`,
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

  const resetCreateForm = () => {
    setName('');
    setNameEdited(false);
    setConcurrency(projectDefaultConcurrency);
    setRunMode(projectDefaultMode);
    setModeOverridden(false);
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
        executionApi.binaryToSource.getConfig(),
      ]);
      const providers = (data.items || []).filter((item) => item.enabled);
      const projectProviderKey = String(projectConfig?.llm_provider_key || '').trim();
      const nextProjectDefaultConcurrency = Math.max(1, Math.min(16, Number(projectConfig?.concurrency) || 8));
      const nextProjectDefaultMode = (['turbo', 'fast', 'deep'].includes(String(projectConfig?.default_mode || '').trim())
        ? String(projectConfig?.default_mode || '').trim()
        : 'turbo') as B2SRunMode;
      setProjectDefaultConcurrency(nextProjectDefaultConcurrency);
      setConcurrency(nextProjectDefaultConcurrency);
      setProjectDefaultMode(nextProjectDefaultMode);
      setRunMode(nextProjectDefaultMode);
      setModeOverridden(false);
      setLlmProviders(providers);
      setLlmProviderKey((current) => current || projectProviderKey || data.default_provider_key || providers.find((item) => item.is_default)?.provider_key || providers[0]?.provider_key || '');
    } catch (e: any) {
      setProjectDefaultMode('turbo');
      setRunMode('turbo');
      setModeOverridden(false);
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
      current =`${current}/${part}`;
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
    return`${FILESERVER_STORAGE_ROOT}/files/${projectId}/${safeProjectPath}`.replace(/\/{2,}/g, '/');
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
      const safeConcurrency = Math.max(1, Math.min(16, Number.isFinite(concurrency) ? concurrency : projectDefaultConcurrency));

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
        mode: modeOverridden ? runMode : undefined,
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
      <PageHeader
        title={<ServicePageTitle title="二进制逆向" version={buildVersion} className="" />}
        description="集中查看当前项目关联的代码逆向还原任务，统一管理状态、进度、阶段与结果，并从同一入口创建新的逆向任务。"
        actions={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={openCreateDialog}
              className="inline-flex items-center gap-2 rounded-xl bg-theme-surface px-4 py-2.5 text-sm font-bold text-white hover:bg-theme-elevated"
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
              className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-4 py-2.5 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated"
            >
              {refreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              {refreshing ? '刷新中...' : '刷新'}
            </button>
          </div>
        }
      />

      {error && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-400">
          {error}
        </div>
      )}
      {createResult && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/15 px-4 py-3 text-sm font-semibold text-emerald-400">
          {createResult}
        </div>
      )}

 <section className="rounded-xl border border-theme-border bg-theme-elevated p-5">
        <B2SStatsHeader stats={stats} title="当前项目逆向统计" />
      </section>

 <section className="rounded-xl border border-theme-border bg-theme-surface p-5">
        <button
          type="button"
          onClick={() => setSlotPanelExpanded((current) => !current)}
          className="flex w-full flex-col gap-4 text-left lg:flex-row lg:items-start lg:justify-between"
        >
          <div>
            <h2 className="text-xl font-semibold text-theme-text-primary">执行槽位</h2>
            <p className="mt-1 text-sm text-theme-text-muted">展示当前 PI RE Agent 集群的缓存快照、运行中的 job 数量和各 worker 健康度。</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xs text-theme-text-muted">
              快照时间 {formatDateTime(piClusterSnapshotTime)}
              {piClusterSnapshotExpired ? <span className="ml-2 rounded-full border border-amber-500/20 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">缓存已过期</span> : null}
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setShowSlotDetailModal(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-xs font-bold text-theme-text-secondary hover:bg-theme-elevated"
            >
              查看详情
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void loadPiClusterCapacity();
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-xs font-bold text-theme-text-secondary hover:bg-theme-elevated"
              title="手动刷新执行槽位"
              aria-label="手动刷新执行槽位"
            >
              <RefreshCw size={14} />
              手动刷新
            </button>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-theme-border bg-theme-surface text-theme-text-muted">
              {slotPanelExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </div>
          </div>
        </button>
        {slotPanelExpanded ? (
          <>
            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/15 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-400">总槽位</div>
                <div className="mt-2 text-2xl font-bold text-theme-text-primary">{piClusterCapacity?.total_capacity ?? '-'}</div>
              </div>
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/15 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-400">运行中</div>
                <div className="mt-2 text-2xl font-bold text-theme-text-primary">{piClusterCapacity?.running_jobs ?? '-'}</div>
              </div>
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/15 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-400">空闲槽位</div>
                <div className="mt-2 text-2xl font-bold text-theme-text-primary">{piClusterCapacity?.available_slots ?? '-'}</div>
              </div>
              <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-theme-text-secondary">排队 Job</div>
                <div className="mt-2 text-2xl font-bold text-theme-text-primary">{piClusterCapacity?.queued_jobs ?? '-'}</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              {(piClusterCapacity?.workers || []).map((worker) => (
                <div
                  key={worker.worker_id}
                  className={`min-w-[220px] rounded-2xl border px-4 py-3 ${
                    worker.healthy
                      ? 'border-theme-border bg-theme-surface'
                      : 'border-rose-500/20 bg-rose-500/15'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-theme-text-primary">{worker.worker_id}</div>
                    <div className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      worker.healthy ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                    }`}>
                      {worker.healthy ? 'healthy' : 'unhealthy'}
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-theme-text-secondary">
                    槽位 {worker.running_jobs}/{worker.max_concurrent_jobs}
                    {worker.available_slots >= 0 ?` · 空闲 ${worker.available_slots}` : ''}
                  </div>
                  <div className="mt-1 text-xs text-theme-text-muted">
                    来源 {worker.source || 'capacity'}
                  </div>
                  <div className="mt-2">
                    <SlotResourceBlock
                      cpuUsage={worker.pod_cpu_usage_millicores}
                      cpuLimit={worker.pod_cpu_limit_millicores}
                      cpuRequest={worker.pod_cpu_request_millicores}
                      memoryUsage={worker.pod_memory_usage_bytes}
                      memoryLimit={worker.pod_memory_limit_bytes}
                      memoryRequest={worker.pod_memory_request_bytes}
                      metricsAt={worker.pod_metrics_at}
                      formatDateTime={formatDateTime}
                    />
                  </div>
                  {worker.error ? (
                    <div className="mt-2 break-all text-[11px] text-rose-400">{worker.error}</div>
                  ) : null}
                </div>
              ))}
              {piClusterCapacity && (piClusterCapacity.workers || []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-theme-border bg-theme-surface px-4 py-6 text-sm text-theme-text-muted">
                  当前未发现可用的 PI RE Agent worker。
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </section>

      {showSlotDetailModal ? (
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm" onClick={() => setShowSlotDetailModal(false)}>
          <div className="w-full max-w-5xl rounded-2xl border border-theme-border bg-theme-elevated shadow-panel" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-theme-border px-6 py-5">
              <div>
                <h3 className="text-2xl font-bold tracking-tight text-theme-text-primary">执行槽位详情</h3>
                <p className="mt-2 text-sm text-theme-text-muted">按 worker 展示当前正在执行的逆向任务；点击每个 worker 头部展开或收起详细信息。</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right text-xs text-theme-text-muted">
                  <div>快照时间</div>
                  <div className="mt-1 font-semibold text-theme-text-muted">{formatDateTime(piClusterSnapshotTime)}</div>
                  {piClusterSnapshotExpired ? <div className="mt-1 text-amber-400">缓存已过期，等待后台刷新</div> : null}
                  {piClusterSnapshotError ? <div className="mt-1 max-w-[18rem] break-all text-rose-300">最近错误：{piClusterSnapshotError}</div> : null}
                </div>
                <button
                  type="button"
                  onClick={() => setShowSlotDetailModal(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-theme-border bg-theme-surface text-theme-text-secondary hover:bg-theme-elevated"
                  aria-label="关闭执行槽位详情"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="max-h-[75vh] overflow-auto px-6 py-5">
              {(piClusterCapacity?.workers || []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-theme-border bg-theme-surface px-4 py-10 text-center text-sm text-theme-text-muted">
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
                        className={`overflow-hidden rounded-xl border ${
                          worker.healthy ? 'border-theme-border bg-theme-surface' : 'border-rose-500/20 bg-rose-500/10'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSlotWorkerExpanded(worker.worker_id)}
                          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-theme-elevated"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-semibold text-theme-text-primary">{worker.worker_id}</div>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                worker.healthy ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                              }`}>
                                {worker.healthy ? 'healthy' : 'unhealthy'}
                              </span>
                              <span className="rounded-full bg-theme-elevated px-2 py-0.5 text-[10px] font-bold text-theme-text-secondary">
                                活动任务 {activeJobs.length}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-3 text-xs text-theme-text-muted">
                              <span>槽位 {worker.running_jobs}/{worker.max_concurrent_jobs}</span>
                              <span>空闲 {worker.available_slots}</span>
                              <span>来源 {worker.source || 'capacity'}</span>
                            </div>
                            <div className="mt-2 max-w-md">
                              <SlotResourceBlock
                                cpuUsage={worker.pod_cpu_usage_millicores}
                                cpuLimit={worker.pod_cpu_limit_millicores}
                                cpuRequest={worker.pod_cpu_request_millicores}
                                memoryUsage={worker.pod_memory_usage_bytes}
                                memoryLimit={worker.pod_memory_limit_bytes}
                                memoryRequest={worker.pod_memory_request_bytes}
                                metricsAt={worker.pod_metrics_at}
                                formatDateTime={formatDateTime}
                              />
                            </div>
                          </div>
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-theme-border bg-theme-surface text-theme-text-muted">
                            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </div>
                        </button>
                        {expanded ? (
                          <div className="border-t border-theme-border px-5 py-4">
                            {!worker.healthy ? (
                              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm text-rose-400">
                                Worker 当前不可用。{worker.error ?`原因：${worker.error}` : ''}
                              </div>
                            ) : hasDetailError ? (
                              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/15 px-4 py-3 text-sm text-amber-400">
                                明细拉取失败。{worker.error}
                              </div>
                            ) : activeJobs.length === 0 ? (
                              <div className="rounded-2xl border border-dashed border-theme-border bg-theme-surface px-4 py-8 text-center text-sm text-theme-text-muted">
                                当前无运行中逆向任务。
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {activeJobs.map((job) => (
                                  <div
                                    key={`${worker.worker_id}:${job.pi_job_id}`}
                                    className={`rounded-2xl border px-4 py-4 ${
                                      job.mapped
                                        ? 'border-theme-border bg-theme-elevated'
                                        : 'border-amber-500/20 bg-amber-500/10'
                                    }`}
                                  >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <div className="truncate text-sm font-semibold text-theme-text-primary" title={job.elf_name || job.elf_path || job.pi_job_id}>
                                            {job.elf_name || job.elf_path || job.pi_job_id}
                                          </div>
                                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                            job.mapped ? 'bg-cyan-500/15 text-cyan-400' : 'bg-amber-500/15 text-amber-400'
                                          }`}>
                                            {job.mapped ? '已关联任务' : '未关联任务'}
                                          </span>
                                        </div>
                                        <div className="mt-1 break-all font-mono text-[11px] text-theme-text-muted">{job.elf_path || '-'}</div>
                                      </div>
                                      <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-[11px] text-theme-text-muted">
                                        <div className="font-semibold text-theme-text-secondary">pi job</div>
                                        <div className="mt-1 font-mono">{job.pi_job_id}</div>
                                      </div>
                                    </div>
                                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                      <div className="rounded-xl border border-theme-border bg-theme-elevated px-3 py-3">
                                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">归属任务</div>
                                        {job.mapped && job.task_id ? (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setShowSlotDetailModal(false);
                                                onOpenTask(job.task_id as string);
                                              }}
                                              className="mt-2 text-left text-sm font-bold text-cyan-400 hover:text-cyan-300"
                                            >
                                              {job.task_name || job.task_id}
                                            </button>
                                            <div className="mt-1 break-all font-mono text-[11px] text-theme-text-muted">{job.task_id}</div>
                                          </>
                                        ) : (
                                          <div className="mt-2 text-sm font-semibold text-amber-400">未关联 B2S 任务</div>
                                        )}
                                      </div>
                                      <div className="rounded-xl border border-theme-border bg-theme-elevated px-3 py-3">
                                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">总任务 ID</div>
                                        <div className="mt-2 break-all font-mono text-sm text-theme-text-faint">{job.parent_task_id || '-'}</div>
                                      </div>
                                      <div className="rounded-xl border border-theme-border bg-theme-elevated px-3 py-3">
                                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">执行位置</div>
                                        <div className="mt-2 text-sm font-semibold text-theme-text-faint">{formatPiJobStage(job)}</div>
                                        <div className="mt-1 text-[11px] text-theme-text-muted">{job.current_function || '当前函数信息暂缺'}</div>
                                      </div>
                                      <div className="rounded-xl border border-theme-border bg-theme-elevated px-3 py-3">
                                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">开始时间</div>
                                        <div className="mt-2 text-sm font-semibold text-theme-text-faint">{formatDateTime(job.started_at)}</div>
                                      </div>
                                      <div className="rounded-xl border border-theme-border bg-theme-elevated px-3 py-3">
                                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">最近更新时间</div>
                                        <div className="mt-2 text-sm font-semibold text-theme-text-faint">{formatDateTime(job.updated_at)}</div>
                                      </div>
                                      <div className="rounded-xl border border-theme-border bg-theme-elevated px-3 py-3">
                                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-theme-text-muted">任务项</div>
                                        <div className="mt-2 text-sm font-semibold text-theme-text-faint">
                                          {job.sequence_no != null ?`#${job.sequence_no}` : '-'}
                                        </div>
                                        <div className="mt-1 break-all font-mono text-[11px] text-theme-text-muted">{job.item_id || '-'}</div>
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

 <section className="rounded-xl border border-theme-border bg-theme-surface p-5">
        <div className="flex items-center justify-between gap-3 border-b border-theme-border pb-4">
          <div>
            <h2 className="text-xl font-semibold text-theme-text-primary">任务列表</h2>
            <p className="mt-1 text-sm text-theme-text-muted">
              展示任务状态、进度、阶段摘要与最近更新时间，并支持筛选、分页和自动刷新。点击“任务”列进入详情；点击“状态”或“总任务 ID”单元格可快速切换筛选。
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-theme-text-muted">
            <Loader2 size={16} className="animate-spin" />
            加载中...
          </div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-sm text-theme-text-muted">当前项目暂无二进制逆向任务。</div>
        ) : (
          <div className="mt-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <label className="inline-flex items-center gap-2 rounded-lg border border-theme-border bg-theme-elevated px-3 py-1.5 text-xs text-theme-text-secondary">
                  <input
                    type="checkbox"
                    checked={autoRefreshEnabled}
                    onChange={(e) => setAutoRefreshEnabled(e.target.checked)}
                  />
                  自动刷新
                </label>
                <label className="inline-flex items-center gap-2 rounded-lg border border-theme-border bg-theme-elevated px-3 py-1.5 text-xs text-theme-text-secondary">
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
                    className="w-16 rounded border border-theme-border bg-theme-elevated px-2 py-1 text-xs text-theme-text-secondary"
                  />
                  秒
                </label>
              </div>
            </div>
            <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-theme-text-muted">
              <span>自动刷新：{autoRefreshEnabled ?`开启（${Math.max(5, refreshIntervalSec)}s）` : '关闭'}</span>
              {autoRefreshEnabled ? (
                <span className="text-cyan-400">任务列表与执行槽位按设定间隔自动刷新</span>
              ) : null}
              <span>当前筛选结果：{total} 条</span>
              {statusFilter ? (
                <button
                  type="button"
                  onClick={() => setStatusFilter('')}
                  className="rounded-full border border-sky-500/20 bg-sky-500/15 px-3 py-1 text-xs font-bold text-sky-400"
                >
                  状态：{formatB2SStatus(statusFilter)} x
                </button>
              ) : null}
              {parentTaskFilter ? (
                <button
                  type="button"
                  onClick={() => setParentTaskFilter('')}
                  className="rounded-full border border-violet-500/20 bg-violet-500/15 px-3 py-1 text-xs font-bold text-violet-400"
                >
                  总任务 ID：{parentTaskFilter} x
                </button>
              ) : null}
              {inputFileFilter ? (
                <button
                  type="button"
                  onClick={() => setInputFileFilter('')}
                  className="rounded-full border border-cyan-500/20 bg-cyan-500/15 px-3 py-1 text-xs font-bold text-cyan-400"
                >
                  输入文件：{inputFileFilter} x
                </button>
              ) : null}
              {originFilter ? (
                <button
                  type="button"
                  onClick={() => setOriginFilter('')}
                  className="rounded-full border border-theme-border bg-theme-elevated px-3 py-1 text-xs font-bold text-theme-text-secondary"
                >
                  来源：{originFilter === 'manual' ? '手动任务' : '关联总任务'} x
                </button>
              ) : null}
            </div>
            {selectedTaskIds.length > 0 ? (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/15 px-4 py-3">
                <div className="text-xs font-bold text-rose-400">
                  已选择 {selectedTaskIds.length} 个当前页任务
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedTaskIds([])}
                    disabled={batchDeleting}
                    className="rounded-lg border border-rose-500/20 bg-rose-500/15 px-3 py-1.5 text-xs font-bold text-rose-400 hover:bg-rose-500/25 disabled:opacity-50"
                  >
                    取消选择
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleBatchDelete()}
                    disabled={batchDeleting}
 className="btn-danger-soft"
                  >
                    {batchDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    {batchDeleting ? '删除中...' : '批量删除'}
                  </button>
                </div>
              </div>
            ) : null}
            {pagedItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-theme-border bg-theme-surface py-10 text-center text-xs text-theme-text-muted">
                当前筛选条件下没有匹配的任务。
              </div>
            ) : (
              <ExecutionTable minWidth={1540}>
                <ExecutionTableHead>
                  <tr>
                    <ExecutionTableTh>
                      <label className="inline-flex items-center gap-2 text-xs font-bold text-theme-text-muted">
                        <input
                          type="checkbox"
                          checked={allPagedSelected}
                          onChange={toggleSelectCurrentPage}
                          className="h-4 w-4 rounded border-theme-border text-cyan-400 focus:ring-cyan-500"
                        />
                        选择
                      </label>
                    </ExecutionTableTh>
                    <ExecutionTableTh>
                      <div className="space-y-2">
                        <div>任务</div>
                        <input
                          value={searchText}
                          onChange={(e) => { setSearchText(e.target.value); setPage(1); }}
                          placeholder="搜索任务名/任务ID"
                          className="w-full rounded-lg border border-theme-border bg-theme-elevated px-2.5 py-1.5 text-xs normal-case tracking-normal text-theme-text-secondary"
                          onClick={(event) => event.stopPropagation()}
                        />
                      </div>
                    </ExecutionTableTh>
                    <ExecutionTableTh>
                      <div className="space-y-2">
                        <div>输入文件</div>
                        <input
                          value={inputFileFilter}
                          onChange={(e) => { setInputFileFilter(e.target.value); setPage(1); }}
                          placeholder="搜索输入文件"
                          className="w-full rounded-lg border border-theme-border bg-theme-elevated px-2.5 py-1.5 text-xs normal-case tracking-normal text-theme-text-secondary"
                          onClick={(event) => event.stopPropagation()}
                        />
                      </div>
                    </ExecutionTableTh>
                    <ExecutionTableTh>
                      <div className="space-y-2">
                        <div>状态</div>
                        <div className="text-[10px] font-semibold normal-case tracking-normal text-theme-text-muted">
                          {statusFilter ?`当前: ${formatB2SStatus(statusFilter)}` : '点击单元格快速筛选'}
                        </div>
                      </div>
                    </ExecutionTableTh>
                    <ExecutionTableTh>
                      <div className="space-y-2">
                        <div>总任务 ID</div>
                        <div className="text-[10px] font-semibold normal-case tracking-normal text-theme-text-muted">
                          {parentTaskFilter ?`当前: ${parentTaskFilter}` : '点击单元格快速筛选'}
                        </div>
                      </div>
                    </ExecutionTableTh>
                    <ExecutionTableTh>模式</ExecutionTableTh>
                    <ExecutionTableTh>总体进度</ExecutionTableTh>
                    <ExecutionTableTh>函数处理</ExecutionTableTh>
                    <ExecutionTableTh>异常项</ExecutionTableTh>
                    <ExecutionTableTh>
                      <div className="space-y-2">
                        <div>来源</div>
                        <select
                          value={originFilter}
                          onChange={(e) => { setOriginFilter((e.target.value || '') as '' | 'manual' | 'binary_security'); setPage(1); }}
                          className="form-select w-full text-xs normal-case tracking-normal"
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
                    const inputFilenames = task.input_filenames || [];
                    const inputsExpanded = expandedInputTaskIds.includes(task.id);
                    const visibleInputFilenames = inputsExpanded ? inputFilenames : inputFilenames.slice(0, 3);
                    const progressValue = task.total_items ? ((task.success_items + task.partial_items) / task.total_items) * 100 : 0;
                    const progressBasisLabel = formatB2SOverallProgressBasis(undefined);
                    const parentTaskId = String(task.parent_task_id || '').trim();
                    const sourceLabel = String(task.task_origin_type || 'manual').trim() === 'binary_security'
                      ? (String(task.origin_label || '').trim() || '二进制安全任务')
                      : '手动创建';
                    const modeLabel = String(task.mode_label || '').trim() || String(task.mode || '').trim() || '-';
                    const normalizedTaskStatus = normalizeB2STaskStatus(task.status);
                    const totalFunctions = safeCount(task.total_functions);
                    const completedFunctions = safeCount(task.completed_functions);
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
                          className="h-4 w-4 rounded border-theme-border text-cyan-400 focus:ring-cyan-500"
                          aria-label={`选择任务 ${task.name || task.id}`}
                        />
                      </ExecutionTableTd>
                      <ExecutionTableTd className="min-w-[300px]">
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => onOpenTask(task.id)}
                            className="truncate text-left text-sm font-semibold text-theme-text-primary hover:text-cyan-400"
                            title={task.name || task.id}
                          >
                            {task.name || task.id}
                          </button>
                          <div className="mt-1 break-all font-mono text-[11px] text-theme-text-muted">{task.id}</div>
                        </div>
                      </ExecutionTableTd>
                      <ExecutionTableTd className="min-w-[220px]">
                        <div className="space-y-1">
                          {visibleInputFilenames.map((filename) => (
                            <button
                              key={filename}
                              type="button"
                              onClick={() => toggleInputFileFilter(filename)}
                              className="block max-w-full truncate text-left text-xs font-medium text-theme-text-secondary hover:text-cyan-400"
                              title={inputFileFilter === filename ? '再次点击取消该输入文件筛选' : '点击按该输入文件快速筛选'}
                            >
                              {filename}
                            </button>
                          ))}
                          {inputFilenames.length > 3 ? (
                            <button
                              type="button"
                              onClick={() => toggleExpandedInputFiles(task.id)}
                              className="text-[11px] text-theme-text-muted hover:text-cyan-400"
                            >
                              {inputsExpanded ? '收起剩余文件' :`其余 ${inputFilenames.length - 3} 个文件`}
                            </button>
                          ) : null}
                          {inputFilenames.length === 0 ? (
                            <span className="text-xs text-theme-text-muted">-</span>
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
                              className="font-mono text-left text-xs font-semibold text-theme-text-secondary hover:text-violet-400"
                              title={parentTaskFilter === parentTaskId ? '再次点击取消该总任务ID筛选' : '点击按该总任务ID快速筛选'}
                            >
                              {parentTaskId}
                            </button>
                          ) : (
                            <span className="font-mono text-xs font-semibold text-theme-text-muted">-</span>
                          )}
                        </ExecutionTableTd>
                        <ExecutionTableTd>
                          <span className="inline-flex rounded-full border border-theme-border bg-theme-elevated px-2.5 py-1 text-xs font-semibold text-theme-text-secondary">
                            {modeLabel}
                          </span>
                        </ExecutionTableTd>
                        <ExecutionTableTd className="min-w-[220px]">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-semibold text-theme-text-secondary">{buildProgressLabel(task)}</span>
                            <span className="text-theme-text-muted">{progressBasisLabel}</span>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[11px] text-theme-text-muted">
                            <span>ELF {task.success_items ?? 0}/{task.total_items || 0}</span>
                            <span>取消中 {task.cancelling_items || 0} · 已取消 {task.cancelled_items}</span>
                          </div>
                        </ExecutionTableTd>
                        <ExecutionTableTd>
                          {totalFunctions !== null && totalFunctions > 0 && completedFunctions !== null ? (
                            <>
                              <div className="text-sm font-semibold text-theme-text-primary">成功 {completedFunctions} / 总数 {totalFunctions}</div>
                              <div className="mt-1 text-xs text-theme-text-muted">
                                未完成 {uncompletedFunctions ?? '-'}
                                {failedFunctions !== null ?` · 失败 ${failedFunctions}` : ''}
                              </div>
                            </>
                          ) : (
                            <span className="text-xs text-theme-text-muted">-</span>
                          )}
                        </ExecutionTableTd>
                        <ExecutionTableTd>
                          <div className="text-sm font-semibold text-theme-text-primary">失败 {task.failed_items}</div>
                          <div className="mt-1 text-xs text-theme-text-muted">部分成功 {task.partial_items}</div>
                        </ExecutionTableTd>
                        <ExecutionTableTd className="min-w-[170px]">
                          <div className="text-sm font-semibold text-theme-text-primary">{sourceLabel}</div>
                          <div className="mt-1 text-xs text-theme-text-muted">
                            {String(task.task_origin_type || 'manual').trim() === 'binary_security'
                              ?`来源阶段 ${String(task.parent_stage_name || '').trim() || '-'}`
                              : '-'}
                          </div>
                        </ExecutionTableTd>
                        <ExecutionTableTd className="whitespace-nowrap font-semibold text-theme-text-secondary">{formatDurationMs(task.run_duration_ms)}</ExecutionTableTd>
                        <ExecutionTableTd className="whitespace-nowrap text-xs text-theme-text-muted">{formatDateTime(task.created_at)}</ExecutionTableTd>
                        <ExecutionTableTd className="whitespace-nowrap text-xs text-theme-text-muted">{formatDateTime(task.updated_at)}</ExecutionTableTd>
                      </tr>
                    );
                  })}
                </tbody>
              </ExecutionTable>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-theme-border pt-3">
              <div className="text-xs text-theme-text-muted">
                共 {total} 条，当前显示 {pageStart}-{pageEnd}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-xs text-theme-text-muted">
                  每页
                  <select
                    value={perPage}
                    onChange={(e) => setPerPage(Number(e.target.value) || 50)}
                    className="form-select text-xs"
                  >
                    {[10, 50, 100, 200, 500, 1000].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  条
                </label>
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(1)}
                  className="rounded-lg border border-theme-border px-2.5 py-1.5 text-xs font-semibold text-theme-text-secondary disabled:opacity-40 hover:bg-theme-elevated"
                >
                  首页
                </button>
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-theme-border px-3 py-1.5 text-xs font-semibold text-theme-text-secondary disabled:opacity-40 hover:bg-theme-elevated"
                >
                  上一页
                </button>
                <span className="min-w-16 text-center text-xs text-theme-text-muted">{page} / {totalPages}</span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg border border-theme-border px-3 py-1.5 text-xs font-semibold text-theme-text-secondary disabled:opacity-40 hover:bg-theme-elevated"
                >
                  下一页
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(totalPages)}
                  className="rounded-lg border border-theme-border px-2.5 py-1.5 text-xs font-semibold text-theme-text-secondary disabled:opacity-40 hover:bg-theme-elevated"
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
 <div className="w-full max-w-5xl rounded-2xl border border-theme-border bg-theme-surface">
            <div className="flex items-center justify-between border-b border-theme-border px-6 py-5">
              <div>
                <h3 className="text-xl font-semibold text-theme-text-primary">创建二进制逆向任务</h3>
                <p className="mt-1 text-sm text-theme-text-muted">上传 ELF 文件并发起代码逆向还原任务。</p>
              </div>
              <button type="button" onClick={closeCreateDialog} disabled={submitting} className="text-sm font-semibold text-theme-text-muted hover:text-theme-text-secondary disabled:opacity-50">
                关闭
              </button>
            </div>
            <div className="space-y-5 p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="form-label">
                  任务名称
                  <input
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setNameEdited(true);
                    }}
                    placeholder="例如：libcrypto 逆向还原"
                    className="mt-2 w-full rounded-2xl border border-theme-border px-4 py-3 text-sm"
                  />
                </label>
                <label className="form-label">
                  并行度
                  <input
                    type="number"
                    min={1}
                    max={16}
                    value={concurrency}
                    onChange={(e) => setConcurrency(Math.max(1, Math.min(16, Number(e.target.value) || projectDefaultConcurrency)))}
                    className="mt-2 w-full rounded-2xl border border-theme-border px-4 py-3 text-sm"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-normal text-theme-text-muted">
                    <span>默认取自 执行 → 参数配置，当前项目默认：{projectDefaultConcurrency}</span>
                    {concurrency !== projectDefaultConcurrency ? (
                      <span className="rounded-full border border-amber-500/20 bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-400">已覆盖项目默认</span>
                    ) : null}
                  </div>
                  <span className="mt-2 block text-xs font-normal text-theme-text-muted">这里的修改只影响本次创建任务；并发越高，batch 并行越强，也会更快消耗下游执行槽位。</span>
                </label>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-sm font-bold text-theme-text-secondary">还原模式</div>
                  <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => {
                        setRunMode('turbo');
                        setModeOverridden(true);
                      }}
                      disabled={submitting}
                      className={`rounded-xl border px-4 py-4 text-left transition-all ${runMode === 'turbo' ? 'border-amber-300 bg-amber-500/15 ring-2 ring-amber-100' : 'border-theme-border bg-theme-surface hover:bg-theme-elevated'} disabled:opacity-60`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-theme-text-primary">极速模式</div>
                        <div className="rounded-full bg-theme-elevated px-2.5 py-1 text-[10px] font-medium tracking-[0.08em] text-amber-400 ring-1 ring-amber-100">极速</div>
                      </div>
                      <div className="mt-2 text-xs font-semibold leading-5 text-theme-text-muted">优先命中缓存和极速收敛，适合大批量快速扫一遍。</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRunMode('fast');
                        setModeOverridden(true);
                      }}
                      disabled={submitting}
                      className={`rounded-xl border px-4 py-4 text-left transition-all ${runMode === 'fast' ? 'border-cyan-300 bg-cyan-500/15 ring-2 ring-cyan-100' : 'border-theme-border bg-theme-surface hover:bg-theme-elevated'} disabled:opacity-60`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-theme-text-primary">快速模式</div>
                        <div className="rounded-full bg-theme-elevated px-2.5 py-1 text-[10px] font-medium tracking-[0.08em] text-cyan-400 ring-1 ring-cyan-100">推荐</div>
                      </div>
                      <div className="mt-2 text-xs font-semibold leading-5 text-theme-text-muted">优先速度，使用混合流水线，适合初步分析和批量还原。</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRunMode('deep');
                        setModeOverridden(true);
                      }}
                      disabled={submitting}
                      className={`rounded-xl border px-4 py-4 text-left transition-all ${runMode === 'deep' ? 'border-violet-300 bg-violet-500/15 ring-2 ring-violet-100' : 'border-theme-border bg-theme-surface hover:bg-theme-elevated'} disabled:opacity-60`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-theme-text-primary">深度模式</div>
                        <div className="rounded-full bg-theme-elevated px-2.5 py-1 text-[10px] font-medium tracking-[0.08em] text-violet-400 ring-1 ring-violet-100">高质量</div>
                      </div>
                      <div className="mt-2 text-xs font-semibold leading-5 text-theme-text-muted">使用 Agent 深度推理，速度较慢，适合关键二进制和高质量还原。</div>
                    </button>
                  </div>
                  <div className="mt-2 text-xs font-semibold text-theme-text-muted">
                    当前项目默认模式：{B2S_MODE_LABELS[projectDefaultMode]}。若未手动切换模式，创建请求不会显式传`mode`，由后端按项目默认模式自动决策。
                  </div>
                </div>

                <label className="form-label">
                  Provider
                  <select
                    value={llmProviderKey}
                    onChange={(e) => setLlmProviderKey(e.target.value)}
                    disabled={llmProvidersLoading || llmProviders.length === 0}
                    className="form-select mt-2 w-full disabled:bg-theme-surface disabled:text-theme-text-muted"
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
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-theme-text-primary">复用已有缓存</div>
                      <div className="mt-1 text-xs font-semibold leading-5 text-theme-text-secondary">
                        默认开启。关闭后，本次会忽略历史缓存；如果任务成功，会覆盖当前 ELF 在 {B2S_MODE_LABELS[runMode]} 下的缓存结果。
                      </div>
                    </div>
                    <label className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-theme-elevated px-3 py-1.5 text-xs font-semibold text-emerald-400">
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
                  <label className="text-sm font-bold text-theme-text-secondary">ELF 文件</label>
                  <span className="text-xs font-semibold text-theme-text-muted">本地 {selectedFiles.length} · 文件服务 {selectedServerFiles.length}</span>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-theme-border bg-theme-surface px-6 py-8 text-center hover:border-slate-400 hover:bg-theme-elevated">
                    <UploadCloud size={28} className="text-theme-text-muted" />
                    <span className="mt-3 text-sm font-semibold text-theme-text-primary">上传本地文件</span>
                    <span className="mt-1 text-xs text-theme-text-muted">默认显示所有文件，支持批量上传。</span>
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
                    className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-cyan-300 bg-cyan-500/15 px-6 py-8 text-center hover:border-cyan-500 hover:bg-cyan-500/15"
                  >
                    <UploadCloud size={28} className="text-cyan-400" />
                    <span className="mt-3 text-sm font-semibold text-cyan-300">从文件服务选择</span>
                    <span className="mt-1 text-xs text-cyan-400">选择项目文件系统中已有的 ELF，不重复上传。</span>
                  </button>
                </div>
                <div className="max-h-64 overflow-auto rounded-2xl border border-theme-border bg-theme-surface">
                  {selectedFiles.length === 0 && selectedServerFiles.length === 0 && <div className="px-4 py-5 text-center text-sm text-theme-text-muted">未选择文件</div>}
                  {selectedFiles.map((file, idx) => (
                    <div key={`local-${file.name}-${idx}`} className="flex items-center justify-between border-t border-theme-border px-4 py-3 text-sm first:border-t-0">
                      <div className="min-w-0">
                        <div className="truncate font-bold text-theme-text-primary">{file.name}</div>
                        <div className="mt-1 text-xs text-theme-text-muted">本地上传 · sequence #{idx + 1} · {formatBytes(file.size)}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedFiles((current) => current.filter((_, fileIdx) => fileIdx !== idx))}
                        disabled={submitting}
                        className="ml-3 rounded-xl border border-theme-border px-3 py-1.5 text-xs font-bold text-theme-text-secondary hover:bg-theme-elevated disabled:opacity-50"
                      >
                        移除
                      </button>
                    </div>
                  ))}
                  {selectedServerFiles.map((file, idx) => (
                    <div key={`server-${file.path}`} className="flex items-center justify-between border-t border-theme-border px-4 py-3 text-sm first:border-t-0">
                      <div className="min-w-0">
                        <div className="truncate font-bold text-theme-text-primary">{file.name}</div>
                        <div className="mt-1 break-all text-xs text-theme-text-muted">文件服务 · sequence #{selectedFiles.length + idx + 1} · {file.path}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedServerFiles((current) => current.filter((item) => item.path !== file.path))}
                        disabled={submitting}
                        className="ml-3 rounded-xl border border-theme-border px-3 py-1.5 text-xs font-bold text-theme-text-secondary hover:bg-theme-elevated disabled:opacity-50"
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
                  {createError && <div className="rounded-2xl border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-400">{createError}</div>}
                  {uploadProgress && <div className="rounded-2xl border border-blue-500/20 bg-blue-500/15 px-4 py-3 text-sm font-semibold text-blue-400">{uploadProgress}</div>}
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                <button type="button" onClick={closeCreateDialog} disabled={submitting} className="rounded-xl border border-theme-border px-4 py-2.5 text-sm font-bold text-theme-text-secondary">
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void submitCreateTask()}
                  disabled={submitting}
 className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
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
