import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Loader2, Plus, RefreshCw, Search, Shield, Upload } from 'lucide-react';

import { BinarySecurityDeleteQueueTaskType, BinarySecurityInputFile, BinarySecurityPipelineMode, BinarySecurityPipelineProfile, BinarySecurityTask, BinarySecurityTaskListScope, BinarySecurityTaskType } from '../../clients/binarySecurity';
import { fileserverApi } from '../../clients/fileserver';
import { api } from '../../clients/api';
import { showConfirm } from '../../components/DialogService';
import { ServicePageTitle, useServiceBuildVersion } from '../../components/execution/ServiceBuildVersion';
import { PageHeader } from '../../design-system';
import { BinarySecurityDeleteQueueDrawer } from './BinarySecurityDeleteQueueDrawer';

interface Props {
  projectId: string;
  taskType: BinarySecurityTaskType;
  onOpenTask: (task: { taskId: string; projectId: string }) => void;
  sourcePipelineProfileMode?: BinarySecurityPipelineProfile | 'select';
}

type CreateDialogTab = 'basic' | 'files' | 'strategy' | 'parallelism';
type CreateDefaults = {
  stageParallelism: Record<string, number>;
  maxRetries: number;
  continueOnFailure: boolean;
  pipelineMode: BinarySecurityPipelineMode;
  entrySelectionMode: 'auto' | 'manual_confirm';
  entryAutoSelectionStrategy: 'all' | 'top_n_per_module_by_confidence';
  entryAutoSelectionTopN: number;
  partialSuccessStageAdvancement: Record<string, boolean>;
};

const TERMINAL = new Set(['success', 'partial_success', 'failed', 'cancelled', 'delete_failed']);
const BINARY_STAGES = ['firmware_unpack', 'system_analysis', 'binary_to_source', 'entry_analysis', 'dataflow_vuln_scan'];
const SOURCE_STAGES = ['system_analysis', 'entry_analysis', 'dataflow_vuln_scan'];
const SOURCE_KG_STAGES = ['knowledge_graph_entry_fetch', 'dataflow_vuln_scan'];
const MODULE_STAGES = ['binary_to_source', 'entry_analysis', 'dataflow_vuln_scan'];
// BinarySecurityPipelineProfile 末尾带 `| string`,会把 union 坍缩成 string,
// 令 Extract<...> 退化为 never。这里直接写两个字面量,保留真实的可选集合。
type SourcePipelineProfile = 'default' | 'kg_source_vuln_scan';

type ManualOperationDisplayState = {
  operation_in_progress?: boolean;
  operation_type?: string | null;
};

const activeOperationKind = (operationState?: ManualOperationDisplayState | null): 'continue' | 'retry' | null => {
  if (!operationState?.operation_in_progress) return null;
  if (operationState.operation_type === 'continue') return 'continue';
  if ((operationState.operation_type || '').startsWith('retry')) return 'retry';
  return null;
};

const taskDisplayStatus = (status?: string | null, operationState?: ManualOperationDisplayState | null) => {
  const operationKind = activeOperationKind(operationState);
  if (operationKind === 'continue') return 'continue_in_progress';
  if (operationKind === 'retry') return 'retry_in_progress';
  return status || '';
};

const statusTone = (status: string) => {
  switch (status) {
    case 'success':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';
    case 'partial_success':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/20';
    case 'failed':
    case 'cancel_failed':
    case 'delete_failed':
      return 'bg-rose-500/15 text-rose-400 border-rose-500/20';
    case 'cancelling':
      return 'bg-orange-500/15 text-orange-400 border-orange-500/20';
    case 'cancelled':
      return 'bg-theme-elevated text-theme-text-muted border-theme-border';
    case 'pending_upload':
      return 'bg-violet-500/15 text-violet-400 border-violet-500/20';
    case 'uploading':
      return 'bg-sky-500/15 text-sky-400 border-sky-500/20';
    case 'dispatching':
      return 'bg-sky-500/15 text-sky-400 border-sky-500/20';
    case 'continue_in_progress':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';
    case 'retry_in_progress':
      return 'bg-orange-500/15 text-orange-400 border-orange-500/20';
    case 'pending_module_confirmation':
    case 'waiting_confirmation':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/20';
    default:
      return 'bg-blue-500/15 text-blue-400 border-blue-500/20';
  }
};

const formatTaskStatusLabel = (status?: string | null) => {
  switch (String(status || '').trim().toLowerCase()) {
    case 'success':
      return '成功';
    case 'partial_success':
      return '部分成功';
    case 'failed':
      return '失败';
    case 'cancel_failed':
      return '取消失败';
    case 'delete_failed':
      return '删除失败';
    case 'cancelling':
      return '取消中';
    case 'cancelled':
      return '已取消';
    case 'pending_upload':
      return '待上传';
    case 'uploading':
      return '上传中';
    case 'pending':
      return '待调度';
    case 'dispatching':
      return '调度中';
    case 'running':
      return '运行中';
    case 'continue_in_progress':
      return '继续中';
    case 'retry_in_progress':
      return '重试中';
    case 'pending_module_confirmation':
      return '待模块确认';
    case 'waiting_confirmation':
      return '待确认';
    default:
      return status || '-';
  }
};

const formatStageLabel = (value?: string | null) => {
  const map: Record<string, string> = {
    firmware_unpack: '固件解包',
    system_analysis: '系统分析',
    binary_to_source: '二进制反编译',
    entry_analysis: '入口分析',
    knowledge_graph_entry_fetch: '知识图谱入口获取',
    dataflow_vuln_scan: '数据流漏洞挖掘',
  };
  return map[value || ''] || (value || '-');
};

const fmt = (value?: string | null) => (value ? new Date(value).toLocaleString() : '-');
const fmtSize = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return`${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};
const fmtSpeed = (value: number) =>`${fmtSize(value)}/s`;
const num = (value?: number | null) => Number.isFinite(value || 0) ? Number(value || 0) : 0;
const percent = (part: number, total: number) => total > 0 ? Math.round((part / total) * 100) : 0;
const STAGE_ITEMS_PER_PAGE = 100;
const DELETE_STAGE_ITEM_PREVIEW_LIMIT = 8;

const STAGE_PARALLELISM_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'firmware_unpack', label: '固件解包最大并行数' },
  { key: 'system_analysis', label: '系统分析最大并行数' },
  { key: 'binary_to_source', label: '二进制逆向最大并行数' },
  { key: 'entry_analysis', label: '入口分析最大并行数' },
  { key: 'knowledge_graph_entry_fetch', label: '知识图谱入口获取最大并行数' },
  { key: 'dataflow_vuln_scan', label: '数据流漏洞挖掘最大并行数' },
];
const SOURCE_ARCHIVE_ACCEPT = '.zip,.tar,.tar.gz,.tgz,.tar.bz2,.tbz2,.tar.xz,.txz';
const MODULE_RISK_OPTIONS = ['高', '中', '低'] as const;
const MODULE_SELECTION_OPTIONS = [
  { value: 'auto', label: '按风险自动推进' },
  { value: 'manual_confirm', label: '系统分析后人工确认' },
] as const;
const PIPELINE_MODE_OPTIONS: Array<{
  value: BinarySecurityPipelineMode;
  label: string;
  description: string;
}> = [
  { value: 'barrier', label: '广度优先（Barrier）', description: '按阶段聚合推进，上一阶段完成后再开始下一阶段。' },
  { value: 'mixed_streaming', label: '深度优化（Mixed Streaming）', description: '入口分析完成后，立即推进对应的数据流漏洞挖掘和漏洞挖掘。' },
];
const PARTIAL_SUCCESS_ADVANCEMENT_FIELDS = [
  { key: 'binary_to_source', label: '二进制逆向部分成功后继续推进' },
  { key: 'entry_analysis', label: '入口分析部分成功后继续推进' },
  { key: 'knowledge_graph_entry_fetch', label: '知识图谱入口获取成功后继续推进' },
  { key: 'dataflow_vuln_scan', label: '数据流漏洞挖掘部分成功后继续推进' },
] as const;
const DEFAULT_PARTIAL_SUCCESS_STAGE_ADVANCEMENT = Object.fromEntries(
  PARTIAL_SUCCESS_ADVANCEMENT_FIELDS.map((field) => [field.key, false]),
) as Record<string, boolean>;
const DEFAULT_STAGE_PARALLELISM = {
  firmware_unpack: 4,
  system_analysis: 4,
  binary_to_source: 4,
  entry_analysis: 4,
  knowledge_graph_entry_fetch: 1,
  dataflow_vuln_scan: 4,
};
const normalizePartialSuccessStageAdvancement = (value: unknown) => {
  const config = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};
  const normalized = { ...DEFAULT_PARTIAL_SUCCESS_STAGE_ADVANCEMENT };
  if (config.dataflow_vuln_scan !== undefined) {
    normalized.dataflow_vuln_scan = config.dataflow_vuln_scan !== false;
  } else if (config.dataflow_analysis !== undefined) {
    normalized.dataflow_vuln_scan = config.dataflow_analysis !== false;
  } else if (config.vuln_scan !== undefined) {
    normalized.dataflow_vuln_scan = config.vuln_scan !== false;
  }
  for (const field of PARTIAL_SUCCESS_ADVANCEMENT_FIELDS) {
    if (config[field.key] !== undefined) {
      normalized[field.key] = config[field.key] !== false;
    }
  }
  return normalized;
};
const CREATE_DIALOG_TABS: Array<{ key: CreateDialogTab; label: string; hint: string }> = [
  { key: 'basic', label: '基础信息', hint: '名称、描述、模块名' },
  { key: 'files', label: '输入文件', hint: '上传输入与进度' },
  { key: 'strategy', label: '执行策略', hint: '推进与模块策略' },
  { key: 'parallelism', label: '并发控制', hint: '阶段并发与重试' },
];

const isDirectoryAlreadyExistsError = (error: any) => {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  return (
    error?.status === 409 ||
    code.includes('conflict') ||
    code.includes('already') ||
    message.includes('已存在') ||
    message.includes('already exists') ||
    message.includes('conflict')
  );
};

const manualOperationBadgeTone = (overall?: string) => {
  switch (overall) {
    case 'ready':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';
    case 'in_progress':
      return 'bg-sky-500/15 text-sky-400 border-sky-500/20';
    default:
      return 'bg-amber-500/15 text-amber-400 border-amber-500/20';
  }
};

const manualOperationBadgeLabel = (overall?: string) => {
  switch (overall) {
    case 'ready':
      return '可操作';
    case 'in_progress':
      return '处理中';
    default:
      return '受限';
  }
};

export const BinarySecurityOverviewPage: React.FC<Props> = ({ projectId, taskType, onOpenTask, sourcePipelineProfileMode = 'select' }) => {
  const executionApi = api.domains.execution;
  const buildVersion = useServiceBuildVersion(executionApi.binarySecurity.getHealth);
  const fallbackCreateDefaults = useMemo<CreateDefaults>(() => ({
    stageParallelism: { ...DEFAULT_STAGE_PARALLELISM },
    maxRetries: 2,
    continueOnFailure: true,
    pipelineMode: 'barrier' as BinarySecurityPipelineMode,
    entrySelectionMode: 'auto' as const,
    entryAutoSelectionStrategy: 'top_n_per_module_by_confidence' as const,
    entryAutoSelectionTopN: 20,
    partialSuccessStageAdvancement: { ...DEFAULT_PARTIAL_SUCCESS_STAGE_ADVANCEMENT },
  }), []);
  const [items, setItems] = useState<BinarySecurityTask[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [scopeFilter, setScopeFilter] = useState<BinarySecurityTaskListScope>('current');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sortBy, setSortBy] = useState<'created_at' | 'updated_at' | 'started_at' | 'finished_at' | 'status' | 'name'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createDefaultsLoading, setCreateDefaultsLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createResult, setCreateResult] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createDialogTab, setCreateDialogTab] = useState<CreateDialogTab>('basic');
  const [deleteQueueOpen, setDeleteQueueOpen] = useState(false);
  const [name, setName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [moduleName, setModuleName] = useState('');
  const [knowledgeGraphUploadId, setKnowledgeGraphUploadId] = useState('');
  const [knowledgeGraphDbName, setKnowledgeGraphDbName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadSpeed, setUploadSpeed] = useState<Record<string, number>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const loadRequestIdRef = useRef(0);
  const activeLoadRequestRef = useRef(0);
  const loadInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const [defaultStageParallelism, setDefaultStageParallelism] = useState<Record<string, number>>(DEFAULT_STAGE_PARALLELISM);
  const [defaultMaxRetries, setDefaultMaxRetries] = useState(2);
  const [defaultContinueOnFailure, setDefaultContinueOnFailure] = useState(true);
  const [defaultPipelineMode, setDefaultPipelineMode] = useState<BinarySecurityPipelineMode>('barrier');
  const [defaultPartialSuccessStageAdvancement, setDefaultPartialSuccessStageAdvancement] = useState<Record<string, boolean>>(
    DEFAULT_PARTIAL_SUCCESS_STAGE_ADVANCEMENT,
  );
  const [maxRetries, setMaxRetries] = useState(2);
  const [continueOnFailure, setContinueOnFailure] = useState(true);
  const [pipelineMode, setPipelineMode] = useState<BinarySecurityPipelineMode>('barrier');
  const [partialSuccessStageAdvancement, setPartialSuccessStageAdvancement] = useState<Record<string, boolean>>(
    DEFAULT_PARTIAL_SUCCESS_STAGE_ADVANCEMENT,
  );
  const [moduleSelectionMode, setModuleSelectionMode] = useState<'auto' | 'manual_confirm'>('auto');
  const [moduleRiskLevels, setModuleRiskLevels] = useState<string[]>(['高']);
  const [entrySelectionMode, setEntrySelectionMode] = useState<'auto' | 'manual_confirm'>('auto');
  const [entryAutoSelectionStrategy, setEntryAutoSelectionStrategy] = useState<'all' | 'top_n_per_module_by_confidence'>('top_n_per_module_by_confidence');
  const [entryAutoSelectionTopN, setEntryAutoSelectionTopN] = useState(20);
  const [stageParallelism, setStageParallelism] = useState<Record<string, number>>(DEFAULT_STAGE_PARALLELISM);
  const [sourcePipelineProfile, setSourcePipelineProfile] = useState<SourcePipelineProfile>(sourcePipelineProfileMode === 'kg_source_vuln_scan' ? 'kg_source_vuln_scan' : 'default');
  const isAllProjectsScope = scopeFilter === 'all';

  const toggleStatusQuickFilter = (status: string) => {
    setStatusFilter((current) => (current === status ? '' : status));
    setPage(1);
  };

  const isSourceTask = taskType === 'source';
  const isBinaryModuleTask = taskType === 'binary_module';
  const isKgSourcePage = isSourceTask && sourcePipelineProfileMode === 'kg_source_vuln_scan';
  const deleteQueueTaskType = useMemo<BinarySecurityDeleteQueueTaskType>(
    () => (isSourceTask
      ? (isKgSourcePage ? 'kg_source_vuln_scan_e2e' : 'source_scan_e2e')
      : (isBinaryModuleTask ? 'binary_module_e2e' : 'binary_firmware_e2e')),
    [isBinaryModuleTask, isKgSourcePage, isSourceTask],
  );
  const showSourcePipelinePicker = isSourceTask && sourcePipelineProfileMode === 'select';
  const pageTitle = isKgSourcePage ? '知识图谱-源码漏洞挖掘' : isSourceTask ? '源码扫描' : isBinaryModuleTask ? '二进制模块扫描' : '二进制安全';
  const createTitle = isKgSourcePage ? '创建知识图谱源码漏洞挖掘任务' : isSourceTask ? '创建源码扫描任务' : isBinaryModuleTask ? '创建二进制模块任务' : '创建二进制安全任务';
  const emptyLabel = isKgSourcePage ? '当前项目还没有知识图谱源码漏洞挖掘任务。' : isSourceTask ? '当前项目还没有源码扫描任务。' : isBinaryModuleTask ? '当前项目还没有二进制模块任务。' : '当前项目还没有二进制安全任务。';
  const namePrefix = isKgSourcePage ? 'kg-source-security' : isSourceTask ? 'source-security' : isBinaryModuleTask ? 'binary-module-security' : 'binary-security';
  const stages = isSourceTask ? (isKgSourcePage ? SOURCE_KG_STAGES : SOURCE_STAGES) : isBinaryModuleTask ? MODULE_STAGES : BINARY_STAGES;

  const fileKey = (file: File) => {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    return isSourceTask ? (rel || file.name) : file.name;
  };

  const isSupportedSourceArchive = (file: File) => {
    const lowered = file.name.toLowerCase();
    return ['.zip', '.tar', '.tar.gz', '.tgz', '.tar.bz2', '.tbz2', '.tar.xz', '.txz'].some((ext) => lowered.endsWith(ext));
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = async (options?: { silent?: boolean; skipIfInFlight?: boolean }) => {
    if (!projectId && scopeFilter !== 'all') return;
    if (options?.skipIfInFlight && loadInFlightRef.current) return;
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    activeLoadRequestRef.current = requestId;
    loadInFlightRef.current = true;
    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const data = await executionApi.binarySecurity.listTasks(projectId, {
        scope: scopeFilter,
        status: statusFilter || undefined,
        taskType,
        pipelineProfile: isSourceTask
          ? (isKgSourcePage ? 'kg_source_vuln_scan' : showSourcePipelinePicker ? sourcePipelineProfile : 'default')
          : undefined,
        search: search || undefined,
        sortBy,
        sortOrder,
        page,
        pageSize,
      });
      if (!mountedRef.current || activeLoadRequestRef.current !== requestId) return;
      const nextItems = data.items || [];
      setItems(nextItems);
      setTotal(data.total || 0);
      setTotalPages(data.total_pages || 1);
    } catch (e: any) {
      if (!mountedRef.current || activeLoadRequestRef.current !== requestId) return;
      setError(e?.message || '加载失败');
    } finally {
      if (!mountedRef.current || activeLoadRequestRef.current !== requestId) return;
      loadInFlightRef.current = false;
      if (!options?.silent) {
        setLoading(false);
      }
    }
  };

  const refresh = async () => {
    if (!projectId || refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      await load({ silent: true });
    } catch (e: any) {
      setError(e?.message || '刷新失败');
    } finally {
      setRefreshing(false);
    }
  };

  const deleteTasks = async (taskIds: string[]) => {
    if (taskIds.length === 0) return;
    if (!projectId && !isAllProjectsScope) return;
    const targetTasks = taskIds
      .map((taskId) => items.find((item) => item.id === taskId) || null)
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (targetTasks.length !== taskIds.length) {
      setError('部分待删除任务不在当前列表中，请刷新后重试');
      return;
    }
    const taskRefs = targetTasks.map((item) => ({
      taskId: item.id,
      projectId: item.project_id || projectId || '',
    }));
    const missingProjectRef = taskRefs.find((ref) => !ref.projectId);
    if (missingProjectRef) {
      setError(`任务 ${missingProjectRef.taskId} 缺少项目上下文，无法删除`);
      return;
    }
    const deleteMessage =
      taskIds.length === 1
        ? '删除会先取消并删除所有下游阶段任务，然后删除当前任务记录并清空任务目录。删除后不可恢复，是否继续？'
        :`将删除选中的 ${taskIds.length} 个任务。删除会先取消并删除所有下游阶段任务，然后删除当前任务记录并清空任务目录。删除后不可恢复，是否继续？`;

    const confirmed = await showConfirm({
      title: taskIds.length === 1 ? '删除任务' : '批量删除任务',
      message: deleteMessage,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    setError(null);
    setDeleting(true);
    try {
      const results = await Promise.allSettled(
        taskRefs.map((ref) => executionApi.binarySecurity.deleteTask(ref.projectId, ref.taskId)),
      );
      const failed = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (failed.length > 0) {
        const first = failed[0]?.reason;
        throw new Error(first?.message ||`删除失败：${failed.length} 个任务未删除成功`);
      }
      setSelectedTaskIds((current) => current.filter((id) => !taskIds.includes(id)));
      await load();
    } catch (e: any) {
      setError(e?.message || '删除失败');
    } finally {
      setDeleting(false);
    }
  };

  const deleteTask = async (taskId: string) => {
    await deleteTasks([taskId]);
  };

  useEffect(() => {
    setSourcePipelineProfile(sourcePipelineProfileMode === 'kg_source_vuln_scan' ? 'kg_source_vuln_scan' : 'default');
    setEntryAutoSelectionStrategy('top_n_per_module_by_confidence');
    setEntryAutoSelectionTopN(20);
  }, [sourcePipelineProfileMode]);

  useEffect(() => {
    void load();
  }, [projectId, taskType, isKgSourcePage, showSourcePipelinePicker, sourcePipelineProfile, scopeFilter, statusFilter, search, sortBy, sortOrder, page, pageSize]);

  const hasActive = useMemo(() => items.some((item) => !TERMINAL.has(item.status)), [items]);
  useEffect(() => {
    if (isAllProjectsScope) return;
    if (!hasActive) return;
    const timer = window.setInterval(() => void load({ silent: true, skipIfInFlight: true }), 5000);
    return () => window.clearInterval(timer);
  }, [hasActive, isAllProjectsScope, projectId, taskType, isKgSourcePage, showSourcePipelinePicker, sourcePipelineProfile, scopeFilter, statusFilter, search, sortBy, sortOrder, page, pageSize]);

  useEffect(() => {
    if (!showCreateDialog) return;
    if (nameEdited) return;
    if (name.trim()) return;
    const now = new Date();
    const ts =`${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    setName(`${namePrefix}-${ts}`);
  }, [showCreateDialog, name, nameEdited, namePrefix]);

  useEffect(() => {
    setSelectedTaskIds((current) => current.filter((id) => items.some((item) => item.id === id)));
  }, [items]);

  const totalUploadBytes = useMemo(() => files.reduce((sum, file) => sum + (file.size || 0), 0), [files]);
  const activeUploadSpeed = useMemo(
    () => Object.values(uploadSpeed).reduce((max, current) => Math.max(max, current || 0), 0),
    [uploadSpeed],
  );
  const createTabState = useMemo<Record<CreateDialogTab, 'ready' | 'pending'>>(() => ({
    basic: name.trim() && (!isBinaryModuleTask || moduleName.trim()) ? 'ready' : 'pending',
    files: files.length > 0 ? 'ready' : 'pending',
    strategy: pipelineMode && (isBinaryModuleTask || moduleRiskLevels.length > 0) ? 'ready' : 'pending',
    parallelism: maxRetries >= 0 && stages.every((stage) => Number(stageParallelism[stage] ?? 0) > 0) ? 'ready' : 'pending',
  }), [files.length, isBinaryModuleTask, maxRetries, moduleName, moduleRiskLevels.length, name, pipelineMode, stageParallelism, stages]);
  const currentCreateTabIndex = CREATE_DIALOG_TABS.findIndex((tab) => tab.key === createDialogTab);
  const hasPrevCreateTab = currentCreateTabIndex > 0;
  const hasNextCreateTab = currentCreateTabIndex >= 0 && currentCreateTabIndex < CREATE_DIALOG_TABS.length - 1;
  const selectedCount = selectedTaskIds.length;
  const allSelected = items.length > 0 && selectedCount === items.length;
  const pageStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = total === 0 ? 0 : Math.min(total, (page - 1) * pageSize + items.length);

  const applyCreateDefaults = (defaults: CreateDefaults) => {
    setDefaultStageParallelism({ ...defaults.stageParallelism });
    setDefaultMaxRetries(defaults.maxRetries);
    setDefaultContinueOnFailure(defaults.continueOnFailure);
    setDefaultPipelineMode(defaults.pipelineMode);
    setDefaultPartialSuccessStageAdvancement({ ...defaults.partialSuccessStageAdvancement });
  };

  const resetCreateForm = (defaults: CreateDefaults = {
    stageParallelism: defaultStageParallelism,
    maxRetries: defaultMaxRetries,
    continueOnFailure: defaultContinueOnFailure,
    pipelineMode: defaultPipelineMode,
    entrySelectionMode: 'auto' as const,
    entryAutoSelectionStrategy: 'top_n_per_module_by_confidence' as const,
    entryAutoSelectionTopN: 20,
    partialSuccessStageAdvancement: defaultPartialSuccessStageAdvancement,
  }) => {
    setCreateDialogTab('basic');
    setName('');
    setNameEdited(false);
    setDescription('');
    setModuleName('');
    setKnowledgeGraphUploadId('');
    setKnowledgeGraphDbName('');
    setFiles([]);
    setUploadProgress({});
    setUploadSpeed({});
    setMaxRetries(defaults.maxRetries);
    setContinueOnFailure(defaults.continueOnFailure);
    setPipelineMode(defaults.pipelineMode);
    setPartialSuccessStageAdvancement({
      ...DEFAULT_PARTIAL_SUCCESS_STAGE_ADVANCEMENT,
      ...defaults.partialSuccessStageAdvancement,
    });
    setModuleSelectionMode('auto');
    setModuleRiskLevels(['高']);
    setEntrySelectionMode(defaults.entrySelectionMode);
    setEntryAutoSelectionStrategy(defaults.entrySelectionMode === 'auto' ? defaults.entryAutoSelectionStrategy : 'all');
    setEntryAutoSelectionTopN(defaults.entryAutoSelectionTopN);
    setSourcePipelineProfile(sourcePipelineProfileMode === 'kg_source_vuln_scan' ? 'kg_source_vuln_scan' : 'default');
    setStageParallelism({
      ...defaults.stageParallelism,
    });
    setCreateError(null);
  };

  const loadCreateDefaults = async (): Promise<CreateDefaults> => {
    if (!projectId) {
      return fallbackCreateDefaults;
    }
    const projectConfig = await executionApi.binarySecurity.getConfig();
    return {
      stageParallelism: {
        ...DEFAULT_STAGE_PARALLELISM,
        ...(projectConfig.config.stage_parallelism || {}),
      },
      maxRetries: projectConfig.config.max_retries_per_item ?? 2,
      continueOnFailure: projectConfig.config.continue_on_item_failure ?? true,
      pipelineMode: (projectConfig.config.pipeline_mode === 'mixed_streaming' ? 'mixed_streaming' : 'barrier') as BinarySecurityPipelineMode,
      entrySelectionMode: String(projectConfig.config.entry_selection_mode || 'auto') === 'manual_confirm' ? 'manual_confirm' : 'auto',
      entryAutoSelectionStrategy: String(projectConfig.config.entry_auto_selection_strategy || 'top_n_per_module_by_confidence') === 'all'
        ? 'all'
        : 'top_n_per_module_by_confidence',
      entryAutoSelectionTopN: Math.max(1, Math.min(999, Number(projectConfig.config.entry_auto_selection_top_n) || 20)),
      partialSuccessStageAdvancement: normalizePartialSuccessStageAdvancement(projectConfig.config.partial_success_stage_advancement),
    };
  };

  const openCreateDialog = async () => {
    if (isAllProjectsScope) return;
    setCreateResult(null);
    setCreateDefaultsLoading(true);
    let defaults = fallbackCreateDefaults;
    let defaultsError: string | null = null;
    try {
      defaults = await loadCreateDefaults();
    } catch (e: any) {
      defaultsError = e?.message ?`项目默认配置已自动兼容旧阶段配置，并使用系统默认值补全：${e.message}` : '项目默认配置已自动兼容旧阶段配置，并使用系统默认值补全';
    }
    applyCreateDefaults(defaults);
    resetCreateForm(defaults);
    if (defaultsError) {
      setCreateError(defaultsError);
    }
    setShowCreateDialog(true);
    setCreateDefaultsLoading(false);
  };

  const closeCreateDialog = () => {
    if (submitting) return;
    setShowCreateDialog(false);
    resetCreateForm();
  };

  const mergeFiles = (incoming: File[]) => {
    const next = [...files];
    const names = new Set(next.map((file) => fileKey(file)));
    for (const file of incoming) {
      if (isSourceTask && !isSupportedSourceArchive(file)) {
        setCreateError(`源码扫描仅支持常见压缩文件: ${file.name}`);
        continue;
      }
      const nextKey = fileKey(file);
      if (names.has(nextKey)) {
        setCreateError(`存在重复${isSourceTask ? '路径' : '文件名'}: ${nextKey}`);
        continue;
      }
      names.add(nextKey);
      next.push(file);
    }
    setFiles(next);
  };

  const removeFile = (nameToRemove: string) => {
    setFiles((current) => current.filter((file) => fileKey(file) !== nameToRemove));
    setUploadProgress((current) => {
      const next = { ...current };
      delete next[nameToRemove];
      return next;
    });
    setUploadSpeed((current) => {
      const next = { ...current };
      delete next[nameToRemove];
      return next;
    });
  };

  const submitTask = async () => {
    if (!projectId || isAllProjectsScope) return;
    setCreateError(null);
    setCreateResult(null);
    if (!name.trim()) {
      setCreateError('请输入任务名称');
      return;
    }
    if (isBinaryModuleTask && !moduleName.trim()) {
      setCreateError('请输入模块名');
      return;
    }
    if (files.length === 0) {
      setCreateError('请选择至少一个输入文件');
      return;
    }
    if (isSourceTask) {
      const invalidArchive = files.find((file) => !isSupportedSourceArchive(file));
      if (invalidArchive) {
        setCreateError(`源码扫描仅支持常见压缩文件: ${invalidArchive.name}`);
        return;
      }
    }
    const duplicateNames = files.map((file) => fileKey(file)).filter((name, index, arr) => arr.indexOf(name) !== index);
    if (duplicateNames.length > 0) {
      setCreateError(`存在重复${isSourceTask ? '路径' : '文件名'}: ${duplicateNames[0]}`);
      return;
    }
    if (!isBinaryModuleTask && moduleRiskLevels.length === 0) {
      setCreateError('至少选择一个模块风险等级');
      return;
    }
    if (isKgSourcePage && !knowledgeGraphUploadId.trim() && !knowledgeGraphDbName.trim()) {
      setCreateError('请填写知识图谱 upload_id 或 db_name');
      return;
    }
    setSubmitting(true);
    try {
      const inputFiles: BinarySecurityInputFile[] = files.map((file) => ({
        filename: file.name,
        size: file.size,
        content_type: file.type || undefined,
      }));
      const prepared = await executionApi.binarySecurity.prepareTask(projectId);
      const created = await executionApi.binarySecurity.createTask(projectId, {
        task_id: prepared.task_id,
        task_type: taskType,
        name: name.trim(),
        description: description.trim() || undefined,
        module_name: isBinaryModuleTask ? moduleName.trim() : undefined,
        input_files: inputFiles,
        policy_overrides: {
          pipeline_profile: isKgSourcePage ? 'kg_source_vuln_scan' : isSourceTask ? sourcePipelineProfile : 'default',
          max_retries_per_item: maxRetries,
          continue_on_item_failure: continueOnFailure,
          pipeline_mode: pipelineMode,
          partial_success_stage_advancement: Object.fromEntries(
            PARTIAL_SUCCESS_ADVANCEMENT_FIELDS
              .filter((field) => stages.includes(field.key))
              .map((field) => [field.key, partialSuccessStageAdvancement[field.key] !== false]),
          ),
          stage_parallelism: Object.fromEntries(stages.map((stage) => [stage, stageParallelism[stage] ?? 1])),
          module_selection_mode: isBinaryModuleTask || isKgSourcePage ? undefined : moduleSelectionMode,
          entry_selection_mode: isBinaryModuleTask || isKgSourcePage || !isSourceTask ? undefined : entrySelectionMode,
          entry_auto_selection_strategy: isBinaryModuleTask || isKgSourcePage || !isSourceTask || entrySelectionMode !== 'auto' ? undefined : entryAutoSelectionStrategy,
          entry_auto_selection_top_n: isBinaryModuleTask || isKgSourcePage || !isSourceTask || entrySelectionMode !== 'auto' || entryAutoSelectionStrategy !== 'top_n_per_module_by_confidence'
            ? undefined
            : Math.max(1, Math.min(999, entryAutoSelectionTopN)),
          module_risk_levels: isBinaryModuleTask || isKgSourcePage ? undefined : moduleRiskLevels,
          knowledge_graph_upload_id: isKgSourcePage ? (knowledgeGraphUploadId.trim() || undefined) : undefined,
          knowledge_graph_db_name: isKgSourcePage ? (knowledgeGraphDbName.trim() || undefined) : undefined,
        },
      });
      const workspaceRoot = created.workspace_root ||`/data/files/${projectId}/app/secflow-app-binary-security/${prepared.task_id}`;
      const inputDir = created.summary?.input_dir ||`${workspaceRoot}/input`;
      const tempUploadDir = created.summary?.temp_upload_dir ||`${workspaceRoot}/run/upload-tmp`;
      const ensuredDirs = new Set<string>();
      const ensureUploadSubdirectories = async (basePath: string, relativeDir: string) => {
        if (!basePath || !relativeDir) return;
        const normalizedBase = basePath.replace(/\/+$/g, '');
        const parts = relativeDir.split('/').filter(Boolean);
        let current = normalizedBase;
        for (const part of parts) {
          current = current ?`${current}/${part}` : part;
          if (ensuredDirs.has(current)) continue;
          try {
            await fileserverApi.createProjectFilesystemDirectory({ project_id: projectId, path: current });
          } catch (error: any) {
            if (!isDirectoryAlreadyExistsError(error)) {
              throw error;
            }
          }
          ensuredDirs.add(current);
        }
      };
      for (const file of files) {
        const rel = file.name;
        const normalizedRel = rel.replace(/\\/g, '/');
        const relDir = normalizedRel.includes('/') ? normalizedRel.split('/').slice(0, -1).join('/') : '';
        const uploadBase = isSourceTask ? tempUploadDir : inputDir;
        const uploadPath = relDir ?`${uploadBase}/${relDir}` : uploadBase;
        if (relDir) {
          await ensureUploadSubdirectories(uploadBase, relDir);
        }
        await fileserverApi.uploadProjectFilesystemFile(
          {
            project_id: projectId,
            path: uploadPath,
            file,
            overwrite: false,
          },
          {
            onProgress: (progress) => {
              const percent = progress.total_bytes > 0 ? Math.min(100, Math.round((progress.loaded_bytes / progress.total_bytes) * 100)) : 0;
              setUploadProgress((current) => ({ ...current, [fileKey(file)]: percent }));
              setUploadSpeed((current) => ({ ...current, [fileKey(file)]: progress.speed_bytes_per_sec || 0 }));
            },
            trackGlobal: false,
            sourceLabel: isSourceTask ? '源码扫描输入上传' : isBinaryModuleTask ? '二进制模块输入上传' : '二进制安全输入上传',
          },
        );
        setUploadProgress((current) => ({ ...current, [fileKey(file)]: 100 }));
        setUploadSpeed((current) => ({ ...current, [fileKey(file)]: 0 }));
      }
      await executionApi.binarySecurity.completeUploads(projectId, prepared.task_id, inputFiles);
      setShowCreateDialog(false);
      resetCreateForm();
      setCreateResult(`创建成功: ${prepared.task_id}`);
      await load();
      onOpenTask({ taskId: prepared.task_id, projectId });
    } catch (e: any) {
      setCreateError(e?.message || '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="px-8 pb-10 pt-8 space-y-6">
      <PageHeader
        title={<ServicePageTitle title={pageTitle} version={buildVersion} className="" />}
        description={
          isAllProjectsScope
            ? '跨项目汇总查看该任务类型的编排任务，支持统一搜索、筛选、排序并安全进入详情。'
            : isKgSourcePage
              ? '为当前项目统一编排知识图谱入口获取与数据流漏洞挖掘，直接以外部入口结果驱动源码漏洞挖掘。'
              : isSourceTask
                ? '为当前项目统一编排系统分析、入口分析、数据流漏洞挖掘和数据流漏洞挖掘，聚合查看源码工程任务的阶段状态与结果。'
                : isBinaryModuleTask
                  ? '为当前项目统一编排模块级二进制逆向、入口分析、数据流漏洞挖掘和数据流漏洞挖掘，直接以单模块下的多个 ELF 作为输入自动推进。'
                  : '为当前项目统一编排固件解包、系统分析、反编译、入口分析、数据流漏洞挖掘和数据流漏洞挖掘，聚合查看多固件任务的阶段状态与结果。'
        }
        actions={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDeleteQueueOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-4 py-2.5 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated"
            >
              <Shield size={16} />
              删除队列
            </button>
            <button
              type="button"
              onClick={() => void openCreateDialog()}
              disabled={createDefaultsLoading || isAllProjectsScope}
              className="inline-flex items-center gap-2 rounded-xl bg-theme-surface px-4 py-2.5 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-60"
              title={isAllProjectsScope ? '全部项目模式下请切回当前项目后创建任务' : undefined}
            >
              {createDefaultsLoading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {createDefaultsLoading ? '加载默认配置...' : '创建任务'}
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-4 py-2.5 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              {refreshing ? '刷新中...' : '刷新'}
            </button>
          </div>
        }
      />

      {createResult && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/15 px-4 py-3 text-sm font-semibold text-emerald-400">
          {createResult}
        </div>
      )}

      <BinarySecurityDeleteQueueDrawer
        open={deleteQueueOpen}
        projectId={projectId}
        taskType={deleteQueueTaskType}
        onClose={() => setDeleteQueueOpen(false)}
        onForceDeleteAccepted={async () => {
          await load();
        }}
      />

      <div className="rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-sm text-theme-text-muted">
        范围：<span className="font-semibold text-theme-text-primary">{isAllProjectsScope ? '全部项目任务' : '当前项目任务'}</span>
      </div>

 <section className="rounded-xl border border-theme-border bg-theme-surface p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-theme-text-primary">任务列表</h2>
            {items.length > 0 && (
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-theme-text-secondary">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => setSelectedTaskIds(e.target.checked ? items.map((item) => item.id) : [])}
                  className="h-4 w-4 rounded border-theme-border text-theme-text-primary focus:ring-slate-400"
                />
                全选
              </label>
            )}
          </div>
          <div className="flex items-center gap-3">
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={() => void deleteTasks(selectedTaskIds)}
                disabled={deleting}
                className="rounded-xl border border-rose-500/20 bg-rose-500/15 px-4 py-2.5 text-sm font-bold text-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting ? '删除中...' :`删除选中 (${selectedCount})`}
              </button>
            )}
            <div className="text-sm text-theme-text-muted">共 {total} 条</div>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2">
              <Search size={16} className="text-theme-text-muted" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setPage(1);
                    setSearch(searchInput.trim());
                  }
                }}
                placeholder="搜索任务名 / 路径 / ID"
                className="w-full bg-transparent text-sm outline-none"
              />
            </label>
            <select
              value={scopeFilter}
              onChange={(e) => {
                setScopeFilter((e.target.value as BinarySecurityTaskListScope) || 'current');
                setPage(1);
                setSelectedTaskIds([]);
              }}
              className="form-select"
            >
              <option value="current">当前项目</option>
              <option value="all">全部项目</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="form-select"
            >
              <option value="">全部状态</option>
              <option value="pending">pending</option>
              <option value="dispatching">dispatching</option>
              <option value="success">success</option>
              <option value="partial_success">partial_success</option>
              <option value="failed">failed</option>
              <option value="cancelled">cancelled</option>
            </select>
            <select
              value={`${sortBy}:${sortOrder}`}
              onChange={(e) => {
                const [nextSortBy, nextSortOrder] = e.target.value.split(':');
                setSortBy((nextSortBy as typeof sortBy) || 'created_at');
                setSortOrder((nextSortOrder as 'asc' | 'desc') || 'desc');
                setPage(1);
              }}
              className="form-select"
            >
              <option value="created_at:desc">创建时间 最新</option>
              <option value="created_at:asc">创建时间 最早</option>
              <option value="updated_at:desc">更新时间 最新</option>
              <option value="started_at:desc">开始时间 最新</option>
              <option value="status:asc">状态 A-Z</option>
              <option value="name:asc">任务名 A-Z</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setPage(1);
                setSearch(searchInput.trim());
              }}
              className="rounded-xl border border-theme-border bg-theme-surface px-4 py-2 text-sm font-bold text-theme-text-secondary"
            >
              查询
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setSearch('');
                setScopeFilter('current');
                setStatusFilter('');
                setSortBy('created_at');
                setSortOrder('desc');
                setPage(1);
              }}
              className="rounded-xl border border-theme-border bg-theme-surface px-4 py-2 text-sm font-bold text-theme-text-secondary"
            >
              重置
            </button>
          </div>
        </div>
        {error && <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-400">{error}</div>}
        {loading && items.length === 0 ? (
          <div className="mt-6 text-sm text-theme-text-muted">加载中...</div>
        ) : items.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-theme-border px-6 py-10 text-center text-sm text-theme-text-muted">
            {isAllProjectsScope ? '当前没有符合筛选条件的跨项目任务。' : emptyLabel}
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="w-full rounded-xl border border-theme-border bg-theme-surface p-5 text-left transition hover:border-theme-border hover:bg-theme-surface"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedTaskIds.includes(item.id)}
                        onChange={(e) => {
                          setSelectedTaskIds((current) => (
                            e.target.checked ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id)
                          ));
                        }}
                        className="h-4 w-4 rounded border-theme-border text-theme-text-primary focus:ring-slate-400"
                      />
                      <h3 className="text-lg font-semibold text-theme-text-primary">{item.name}</h3>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleStatusQuickFilter(item.status)}
                          title={statusFilter === item.status ? '再次点击取消状态筛选' : '点击按状态快速筛选'}
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(taskDisplayStatus(item.status, item.manual_operation_state))}`}
                        >
                          {formatTaskStatusLabel(taskDisplayStatus(item.status, item.manual_operation_state))}
                        </button>
                        {item.manual_operation_state ? (
                          <span
                            title={item.manual_operation_state.blocking_reason || item.manual_operation_state.summary}
                            className={`rounded-full border px-3 py-1 text-xs font-semibold ${manualOperationBadgeTone(item.manual_operation_state.overall)}`}
                          >
                            {manualOperationBadgeLabel(item.manual_operation_state.overall)}
                          </span>
                        ) : null}
                      </div>
                      {item.status === 'pending' ? (
                        <span className="rounded-full border border-amber-500/20 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-400">
                          排队中
                        </span>
                      ) : null}
                      {item.status === 'dispatching' ? (
                        <span className="rounded-full border border-sky-500/20 bg-sky-500/15 px-3 py-1 text-xs font-semibold text-sky-400">
                          调度中
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 break-all rounded-xl bg-theme-surface px-3 py-2 font-mono text-xs text-theme-text-muted">{item.firmware_path}</div>
                    {item.abnormal_reason_title ? (
                      <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/15 px-3 py-2 text-sm text-amber-400">
                        <span className="font-semibold">{item.abnormal_reason_title}</span>
                        {item.abnormal_reason_code ? <span className="ml-2 text-xs uppercase tracking-[0.12em] text-amber-400">{item.abnormal_reason_code}</span> : null}
                      </div>
                    ) : null}
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-theme-text-secondary xl:grid-cols-2">
                      {isAllProjectsScope ? (
                        <div>所属项目：<span className="font-bold text-theme-text-primary">{item.project_name || item.project_id}</span></div>
                      ) : null}
                      <div>当前阶段：<span className="font-bold text-theme-text-primary">{formatStageLabel(item.current_stage)}</span></div>
                      <div>开始时间：<span className="font-bold text-theme-text-primary">{fmt(item.started_at)}</span></div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {(item.stage_sequence?.length ? item.stage_sequence : stages).map((stage) => {
                        const summary = item.stage_summaries.find((current) => current.stage_name === stage);
                        return (
                          <span key={stage} className={`rounded-xl px-3 py-1 text-xs font-bold ${summary ? statusTone(summary.status) : 'bg-theme-elevated text-theme-text-muted'}`}>
                            {formatStageLabel(stage)}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenTask({ taskId: item.id, projectId: item.project_id })}
                      className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-4 py-2.5 text-sm font-bold text-theme-text-secondary"
                    >
                      查看详情
                      <ChevronRight size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteTask(item.id)}
                      disabled={deleting}
                      className="rounded-xl border border-rose-500/20 bg-theme-surface px-4 py-2.5 text-sm font-bold text-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-5 flex flex-col gap-3 border-t border-theme-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-theme-text-muted">
            当前第 {page} / {Math.max(1, totalPages)} 页，显示 {pageStart}-{pageEnd} / {total}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value) || 50);
                setPage(1);
              }}
              className="form-select"
            >
              {[10, 50, 100, 200, 500, 1000].map((size) => (
                <option key={size} value={size}>{size} / 页</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              className="rounded-xl border border-theme-border bg-theme-surface px-4 py-2 text-sm font-bold text-theme-text-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              上一页
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages}
              className="rounded-xl border border-theme-border bg-theme-surface px-4 py-2 text-sm font-bold text-theme-text-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        </div>
      </section>

      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
 <div className="w-full max-w-5xl rounded-2xl border border-theme-border bg-theme-surface text-theme-text-primary">
            <div className="flex items-center justify-between border-b border-theme-border px-6 py-5">
              <div>
                <h3 className="text-xl font-semibold text-theme-text-primary">{createTitle}</h3>
                <p className="mt-1 text-sm text-theme-text-muted">
                  {isSourceTask
                    ? isKgSourcePage
                      ? '知识图谱源码页面固定使用外部入口结果源，任务会跳过系统分析和本地入口分析，直接先拉取知识图谱入口再推进漏洞挖掘。'
                      : '仅支持上传常见源码压缩包；文件会先上传到临时目录，再由后端解压到任务 input 目录。'
                    : isBinaryModuleTask
                      ? '请输入模块名并上传属于该模块的多个 ELF，任务会直接从二进制逆向阶段开始自动推进。'
                      : '每个上传文件都会作为独立固件进入完整的安全分析编排流程。'}
                </p>
              </div>
              <button type="button" onClick={closeCreateDialog} disabled={submitting} className="text-sm font-semibold text-theme-text-muted hover:text-theme-text-secondary disabled:opacity-50">
                关闭
              </button>
            </div>
            <div className="space-y-6 p-6">
              <div className="rounded-xl border border-theme-border bg-theme-surface p-2">
                <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
                  {CREATE_DIALOG_TABS.map((tab) => {
                    const active = createDialogTab === tab.key;
                    const ready = createTabState[tab.key] === 'ready';
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setCreateDialogTab(tab.key)}
 className={`rounded-[1.25rem] px-4 py-3 text-left transition ${active ? 'bg-theme-elevated ring-1 ring-theme-border' : 'bg-transparent hover:bg-theme-elevated'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className={`text-sm font-semibold ${active ? 'text-theme-text-primary' : 'text-theme-text-secondary'}`}>{tab.label}</div>
                          <span className={`inline-flex h-2.5 w-2.5 rounded-full ${ready ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                        </div>
                        <div className="mt-1 text-xs text-theme-text-muted">{tab.hint}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {createDialogTab === 'basic' ? (
                <>
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <input
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        setNameEdited(true);
                      }}
                      placeholder="任务名称"
                      className="rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-sm text-theme-text-primary placeholder:text-theme-text-muted"
                    />
                    <input
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="任务描述（可选）"
                      className="rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-sm text-theme-text-primary placeholder:text-theme-text-muted"
                    />
                  </div>
                  {isBinaryModuleTask ? (
                    <input
                      value={moduleName}
                      onChange={(e) => setModuleName(e.target.value)}
                      placeholder="模块名"
                      className="rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-sm text-theme-text-primary placeholder:text-theme-text-muted"
                    />
                  ) : null}
                  {showSourcePipelinePicker ? (
                    <div className="rounded-xl border border-theme-border bg-theme-surface p-4">
                      <div className="text-sm font-semibold text-theme-text-primary">源码流程模式</div>
                      <div className="mt-3 grid grid-cols-1 gap-2 xl:grid-cols-2">
                        <label className="flex items-start gap-3 rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-sm text-theme-text-secondary">
                          <input
                            type="radio"
                            name="sourcePipelineProfile"
                            checked={sourcePipelineProfile === 'default'}
                            onChange={() => setSourcePipelineProfile('default')}
                            className="mt-1 h-4 w-4 border-theme-border text-theme-text-primary focus:ring-theme-border"
                          />
                          <span>
                            <span className="block font-semibold">普通源码分析</span>
                            <span className="mt-1 block text-xs text-theme-text-muted">系统分析 -&gt; 入口分析 -&gt; 数据流漏洞挖掘</span>
                          </span>
                        </label>
                        <label className="flex items-start gap-3 rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-sm text-theme-text-secondary">
                          <input
                            type="radio"
                            name="sourcePipelineProfile"
                            checked={sourcePipelineProfile === 'kg_source_vuln_scan'}
                            onChange={() => setSourcePipelineProfile('kg_source_vuln_scan')}
                            className="mt-1 h-4 w-4 border-theme-border text-theme-text-primary focus:ring-theme-border"
                          />
                          <span>
                            <span className="block font-semibold">知识图谱-源码漏洞挖掘</span>
                            <span className="mt-1 block text-xs text-theme-text-muted">知识图谱入口获取 -&gt; 数据流漏洞挖掘</span>
                          </span>
                        </label>
                      </div>
                    </div>
                  ) : null}
                  {isKgSourcePage ? (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      <input
                        value={knowledgeGraphUploadId}
                        onChange={(e) => setKnowledgeGraphUploadId(e.target.value)}
                        placeholder="知识图谱 upload_id（优先）"
                        className="rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-sm text-theme-text-primary placeholder:text-theme-text-muted"
                      />
                      <input
                        value={knowledgeGraphDbName}
                        onChange={(e) => setKnowledgeGraphDbName(e.target.value)}
                        placeholder="知识图谱 db_name（可选回退）"
                        className="rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-sm text-theme-text-primary placeholder:text-theme-text-muted"
                      />
                    </div>
                  ) : null}
                </>
              ) : null}

              {createDialogTab === 'files' ? (
                <div className="rounded-xl border border-theme-border bg-theme-surface p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-theme-text-primary">输入文件</div>
                    <div className="mt-1 text-sm text-theme-text-muted">{isSourceTask ? '仅支持 zip、tar、tgz、tar.gz、tbz2、tar.bz2、txz、tar.xz 等常见压缩文件。' : isBinaryModuleTask ? '支持一次选择多个 ELF 文件；文件名不能重复。' : '支持一次选择多个文件；文件名不能重复。'}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
 className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-4 py-2.5 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated"
                    >
                      <Upload size={16} />
                      {isBinaryModuleTask ? '选择 ELF' : '选择文件'}
                    </button>
                    <div className="text-sm text-theme-text-muted">{files.length} 个文件 · {fmtSize(totalUploadBytes)}</div>
                    {submitting && activeUploadSpeed > 0 && (
                      <div className="text-sm font-semibold text-sky-400">上传速度 {fmtSpeed(activeUploadSpeed)}</div>
                    )}
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={isSourceTask ? SOURCE_ARCHIVE_ACCEPT : undefined}
                  className="hidden"
                  onChange={(e) => {
                    const incoming = Array.from(e.target.files || []);
                    if (incoming.length > 0) {
                      setCreateError(null);
                      mergeFiles(incoming);
                    }
                    e.currentTarget.value = '';
                  }}
                />
                <div className="mt-4 space-y-3">
                  {files.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-theme-border bg-theme-surface px-5 py-8 text-center text-sm text-theme-text-muted">尚未选择输入文件。</div>
                  ) : files.map((file) => {
                    const key = fileKey(file);
                    const displayPath = file.name;
                    return (
                      <div key={key} className="rounded-2xl bg-theme-surface px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-theme-text-primary">{displayPath}</div>
                            <div className="mt-1 text-xs text-theme-text-muted">{fmtSize(file.size || 0)}</div>
                          </div>
                          <div className="flex items-center gap-3">
                            {submitting && (
                              <div className="min-w-[160px] text-right text-xs font-semibold text-theme-text-muted">
                                {uploadProgress[key] ?`${uploadProgress[key]}%` : '等待上传'}
                                {uploadSpeed[key] > 0 ?` · ${fmtSpeed(uploadSpeed[key])}` : ''}
                              </div>
                            )}
                            <button type="button" onClick={() => removeFile(key)} disabled={submitting} className="text-sm font-semibold text-rose-400 disabled:opacity-40">
                              移除
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                </div>
              ) : null}

              {createDialogTab === 'strategy' && !isBinaryModuleTask && !(isKgSourcePage) ? (
                <div className="rounded-xl border border-theme-border bg-theme-surface p-5">
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div>
                      <div className="text-sm font-semibold text-theme-text-primary">模块推进方式</div>
                      <div className="mt-3 grid gap-2">
                        {MODULE_SELECTION_OPTIONS.map((option) => (
                        <label key={option.value} className="flex items-center gap-3 rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-sm font-semibold text-theme-text-secondary">
                          <input
                            type="radio"
                            name="moduleSelectionMode"
                            checked={moduleSelectionMode === option.value}
                            onChange={() => setModuleSelectionMode(option.value)}
                            className="h-4 w-4 border-theme-border text-theme-text-primary focus:ring-theme-border"
                          />
                          {option.label}
                        </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-theme-text-primary">后续分析模块风险等级</div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {MODULE_RISK_OPTIONS.map((risk) => (
                        <label key={risk} className="flex items-center justify-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-sm font-semibold text-theme-text-secondary">
                          <input
                            type="checkbox"
                            checked={moduleRiskLevels.includes(risk)}
                            onChange={(event) => {
                              setModuleRiskLevels((current) => {
                                if (event.target.checked) return current.includes(risk) ? current : current.concat(risk);
                                return current.filter((item) => item !== risk);
                              });
                            }}
                            className="h-4 w-4 rounded border-theme-border text-theme-text-primary focus:ring-theme-border"
                          />
                          {risk}
                        </label>
                        ))}
                      </div>
                      <div className="mt-2 text-xs text-theme-text-muted">
                        先按风险等级筛选候选模块；若选择人工确认，系统分析完成后再由人工从候选模块中确认最终推进集合。
                      </div>
                    </div>
                  </div>
                  {isSourceTask ? (
                    <div className="mt-5 rounded-2xl border border-theme-border bg-theme-elevated p-4">
                      <div className="text-sm font-semibold text-theme-text-primary">入口选择策略</div>
                      <div className="mt-1 text-xs text-theme-text-muted">源码默认流程下，可配置自动推进或在入口分析后人工确认，再决定进入数据流漏洞挖掘的入口集合。</div>
                      <div className="mt-3 grid gap-2">
                        {[
                          { value: 'auto', label: '自动选择入口' },
                          { value: 'manual_confirm', label: '入口分析后人工确认' },
                        ].map((option) => (
                          <label key={option.value} className="flex items-center gap-3 rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-sm font-semibold text-theme-text-secondary">
                            <input
                              type="radio"
                              name="entrySelectionMode"
                              checked={entrySelectionMode === option.value}
                              onChange={() => setEntrySelectionMode(option.value as 'auto' | 'manual_confirm')}
                              className="h-4 w-4 border-theme-border text-theme-text-primary focus:ring-theme-border"
                            />
                            {option.label}
                          </label>
                        ))}
                      </div>
                      {entrySelectionMode === 'auto' ? (
                        <>
                          <div className="mt-4 text-sm font-semibold text-theme-text-primary">入口自动筛选</div>
                          <div className="mt-1 text-xs text-theme-text-muted">可按每个模块子任务产出的入口置信度排序，只选择前 N 个入口进入数据流漏洞挖掘。</div>
                      <div className="mt-3 grid gap-2">
                        {[
                          { value: 'all', label: '全部入口' },
                          { value: 'top_n_per_module_by_confidence', label: '每模块按置信度 Top N' },
                        ].map((option) => (
                          <label key={option.value} className="flex items-center gap-3 rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-sm font-semibold text-theme-text-secondary">
                            <input
                              type="radio"
                              name="entryAutoSelectionStrategy"
                              checked={entryAutoSelectionStrategy === option.value}
                              onChange={() => setEntryAutoSelectionStrategy(option.value as 'all' | 'top_n_per_module_by_confidence')}
                              className="h-4 w-4 border-theme-border text-theme-text-primary focus:ring-theme-border"
                            />
                            {option.label}
                          </label>
                        ))}
                      </div>
                      {entryAutoSelectionStrategy === 'top_n_per_module_by_confidence' ? (
                        <label className="mt-4 block">
                          <span className="block text-xs font-semibold text-theme-text-secondary">每个模块最多分析 N 个入口</span>
                          <input
                            type="number"
                            min={1}
                            max={999}
                            value={entryAutoSelectionTopN}
                            onChange={(event) => setEntryAutoSelectionTopN(Math.max(1, Math.min(999, Number(event.target.value) || 1)))}
                            className="mt-2 w-full rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text-primary outline-none"
                          />
                        </label>
                      ) : null}
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {createDialogTab === 'strategy' ? (
                <div className="rounded-xl border border-theme-border bg-theme-surface p-5">
                <div>
                  <div className="text-sm font-semibold text-theme-text-primary">推进模式</div>
                  <div className="mt-1 text-sm text-theme-text-muted">支持为当前任务单独选择广度优先或深度优化模式；默认值来自参数配置页。</div>
                  <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {PIPELINE_MODE_OPTIONS.map((option) => (
                      <label key={option.value} className="flex items-start gap-3 rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-sm text-theme-text-secondary">
                        <input
                          type="radio"
                          name="taskPipelineMode"
                          checked={pipelineMode === option.value}
                          onChange={() => setPipelineMode(option.value)}
                          className="mt-1 h-4 w-4 border-theme-border text-theme-text-primary focus:ring-theme-border"
                        />
                        <span>
                          <span className="block font-semibold">{option.label}</span>
                          <span className="mt-1 block text-xs text-theme-text-muted">{option.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                </div>
              ) : null}

              {createDialogTab === 'parallelism' ? (
                <div className="rounded-xl border border-theme-border bg-theme-surface p-5">
                <div className="text-sm font-semibold text-theme-text-primary">阶段并发配置</div>
                <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
                  {STAGE_PARALLELISM_FIELDS.filter((field) => stages.includes(field.key)).map((field) => (
                    <div key={field.key}>
                      <div className="mb-2 text-sm font-bold text-theme-text-secondary">{field.label}</div>
                      <input
                        type="number"
                        min={1}
                        max={16}
                        value={stageParallelism[field.key] ?? 1}
                        onChange={(e) => setStageParallelism((current) => ({ ...current, [field.key]: Number(e.target.value || 1) }))}
                        className="w-full rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-sm text-theme-text-primary"
                      />
                    </div>
                  ))}
                  <div>
                    <div className="mb-2 text-sm font-bold text-theme-text-secondary">子任务重试次数</div>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={maxRetries}
                      onChange={(e) => setMaxRetries(Number(e.target.value || 0))}
                      className="w-full rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-sm text-theme-text-primary"
                    />
                  </div>
                </div>
                <label className="mt-4 flex items-center gap-3 text-sm font-semibold text-theme-text-secondary">
                  <input type="checkbox" checked={continueOnFailure} onChange={(e) => setContinueOnFailure(e.target.checked)} />
                  子任务失败时继续推进其他子任务
                </label>
                  <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {PARTIAL_SUCCESS_ADVANCEMENT_FIELDS.filter((field) => stages.includes(field.key)).map((field) => (
                      <label key={field.key} className="flex items-center gap-3 rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-sm font-semibold text-theme-text-secondary">
                        <input
                          type="checkbox"
                          checked={partialSuccessStageAdvancement[field.key] !== false}
                          onChange={(e) => setPartialSuccessStageAdvancement((current) => ({ ...current, [field.key]: e.target.checked }))}
                          className="h-4 w-4 rounded border-theme-border text-theme-text-primary focus:ring-theme-border"
                        />
                        {field.label}
                      </label>
                  ))}
                </div>
                </div>
              ) : null}

              {createError && <div className="rounded-xl border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-400">{createError}</div>}

              <div className="flex items-center justify-end gap-3">
                {hasPrevCreateTab ? (
                  <button
                    type="button"
                    onClick={() => setCreateDialogTab(CREATE_DIALOG_TABS[currentCreateTabIndex - 1].key)}
                    disabled={submitting}
                    className="rounded-xl border border-theme-border px-4 py-2.5 text-sm font-bold text-theme-text-secondary"
                  >
                    上一步
                  </button>
                ) : null}
                {hasNextCreateTab ? (
                  <button
                    type="button"
                    onClick={() => setCreateDialogTab(CREATE_DIALOG_TABS[currentCreateTabIndex + 1].key)}
                    disabled={submitting}
                    className="rounded-xl border border-theme-border px-4 py-2.5 text-sm font-bold text-theme-text-secondary"
                  >
                    下一步
                  </button>
                ) : null}
                <button type="button" onClick={closeCreateDialog} disabled={submitting} className="rounded-xl border border-theme-border px-4 py-2.5 text-sm font-bold text-theme-text-secondary">
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void submitTask()}
                  disabled={submitting}
 className="inline-flex items-center gap-2 rounded-xl bg-theme-surface px-4 py-2.5 text-sm font-bold text-white hover:bg-theme-elevated disabled:opacity-60"
                >
                  {submitting && <Loader2 size={16} className="animate-spin" />}
                  {submitting ? '创建并上传中...' : '创建并启动'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
