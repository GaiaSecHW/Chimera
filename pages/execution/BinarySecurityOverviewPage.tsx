import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, BarChart3, ChevronRight, Layers3, Loader2, Plus, RefreshCw, ShieldAlert, Upload } from 'lucide-react';

import { BinarySecurityInputFile, BinarySecurityProjectStageAggregate, BinarySecurityProjectStats, BinarySecurityTask, BinarySecurityTaskType } from '../../clients/binarySecurity';
import { fileserverApi } from '../../clients/fileserver';
import { api } from '../../clients/api';
import { showConfirm } from '../../components/DialogService';

interface Props {
  projectId: string;
  taskType: BinarySecurityTaskType;
  onOpenTask: (taskId: string) => void;
}

const TERMINAL = new Set(['success', 'partial_success', 'failed', 'cancelled']);
const BINARY_STAGES = ['firmware_unpack', 'system_analysis', 'binary_to_source', 'entry_analysis', 'dataflow_analysis', 'vuln_scan'];
const SOURCE_STAGES = ['system_analysis', 'entry_analysis', 'dataflow_analysis', 'vuln_scan'];

const statusTone = (status: string) => {
  switch (status) {
    case 'success':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'partial_success':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'failed':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'cancelled':
      return 'bg-slate-100 text-slate-500 border-slate-200';
    case 'pending_upload':
      return 'bg-violet-50 text-violet-700 border-violet-200';
    case 'uploading':
      return 'bg-sky-50 text-sky-700 border-sky-200';
    case 'ready_to_start':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    case 'dispatching':
      return 'bg-sky-50 text-sky-700 border-sky-200';
    case 'continue_preparing':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'retry_preparing':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'pending_module_confirmation':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'waiting_confirmation':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    default:
      return 'bg-blue-50 text-blue-700 border-blue-200';
  }
};

const formatStageLabel = (value?: string | null) => {
  const map: Record<string, string> = {
    firmware_unpack: '固件解包',
    system_analysis: '系统分析',
    binary_to_source: '二进制反编译',
    entry_analysis: '入口分析',
    dataflow_analysis: '数据流分析',
    vuln_scan: '漏洞扫描',
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
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};
const fmtSpeed = (value: number) => `${fmtSize(value)}/s`;
const num = (value?: number | null) => Number.isFinite(value || 0) ? Number(value || 0) : 0;
const percent = (part: number, total: number) => total > 0 ? Math.round((part / total) * 100) : 0;

const STAGE_PARALLELISM_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'firmware_unpack', label: '固件解包最大并行数' },
  { key: 'system_analysis', label: '系统分析最大并行数' },
  { key: 'binary_to_source', label: '二进制逆向最大并行数' },
  { key: 'entry_analysis', label: '入口分析最大并行数' },
  { key: 'dataflow_analysis', label: '数据流分析最大并行数' },
  { key: 'vuln_scan', label: '数据流漏洞挖掘最大并行数' },
];
const SOURCE_ARCHIVE_ACCEPT = '.zip,.tar,.tar.gz,.tgz,.tar.bz2,.tbz2,.tar.xz,.txz';
const MODULE_RISK_OPTIONS = ['高', '中', '低'] as const;
const MODULE_SELECTION_OPTIONS = [
  { value: 'auto', label: '按风险自动推进' },
  { value: 'manual_confirm', label: '系统分析后人工确认' },
] as const;
const DEFAULT_STAGE_PARALLELISM = {
  firmware_unpack: 4,
  system_analysis: 4,
  binary_to_source: 4,
  entry_analysis: 4,
  dataflow_analysis: 4,
  vuln_scan: 4,
};

const emptyProjectStats = (): BinarySecurityProjectStats => ({
  total: 0,
  running: 0,
  success: 0,
  partial_success: 0,
  failed: 0,
  cancelled: 0,
  selected_module_count: 0,
  candidate_module_count: 0,
  high_risk_module_count: 0,
  entry_count: 0,
  vuln_result_count: 0,
  input_count: 0,
  unpacked_firmware_count: 0,
  failed_firmware_count: 0,
});

const emptyStageAggregates = (): BinarySecurityProjectStageAggregate[] => [];

const deriveProjectStats = (items: BinarySecurityTask[]): BinarySecurityProjectStats => {
  const stats = emptyProjectStats();
  stats.total = items.length;
  items.forEach((item) => {
    if (TERMINAL.has(item.status)) {
      if (item.status === 'success') stats.success += 1;
      if (item.status === 'partial_success') stats.partial_success += 1;
      if (item.status === 'failed') stats.failed += 1;
      if (item.status === 'cancelled') stats.cancelled += 1;
    } else {
      stats.running += 1;
    }
    stats.selected_module_count += item.selected_module_count || 0;
    stats.candidate_module_count += item.candidate_module_count || 0;
    stats.high_risk_module_count += item.high_risk_module_count || 0;
    stats.entry_count += item.entry_count || 0;
    stats.vuln_result_count += item.vuln_result_count || 0;
    stats.input_count += item.firmware_item_count || 0;
    stats.unpacked_firmware_count += item.unpacked_firmware_count || 0;
    stats.failed_firmware_count += item.failed_firmware_count || 0;
  });
  return stats;
};

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

const stageAccent = (stageName: string) => {
  const map: Record<string, string> = {
    firmware_unpack: 'border-l-emerald-400',
    system_analysis: 'border-l-sky-400',
    binary_to_source: 'border-l-cyan-400',
    entry_analysis: 'border-l-amber-400',
    dataflow_analysis: 'border-l-indigo-400',
    vuln_scan: 'border-l-rose-400',
  };
  return map[stageName] || 'border-l-slate-300';
};

const dominantStatusLabel = (counts?: Record<string, number>) => {
  const entries = Object.entries(counts || {}).filter(([, count]) => count > 0);
  if (entries.length === 0) return '暂无执行';
  const [status, count] = entries.sort((a, b) => b[1] - a[1])[0];
  return `${status} ${count}`;
};

const archiveResultLabel = (archive?: BinarySecurityProjectStageAggregate['archive']) => {
  const successCount = num(archive?.success_count);
  const failedCount = num(archive?.failed_count);
  if (successCount === 0 && failedCount === 0) return '暂无结果';
  return `成功 ${successCount} · 失败 ${failedCount}`;
};

const ProjectStatCard: React.FC<{ label: string; value: number; hint: string }> = ({ label, value, hint }) => (
  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
    <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">{label}</div>
    <div className="mt-2 text-2xl font-black text-slate-900">{value}</div>
    <div className="mt-1 text-sm text-slate-500">{hint}</div>
  </div>
);

const StageMetricPill: React.FC<{ label: string; value: number; tone?: string }> = ({ label, value, tone = 'text-slate-800' }) => (
  <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
    <span className="text-xs font-semibold text-slate-500">{label}</span>
    <span className={`text-sm font-black ${tone}`}>{value}</span>
  </div>
);

const StageAggregateCard: React.FC<{ aggregate: BinarySecurityProjectStageAggregate }> = ({ aggregate }) => {
  const business = aggregate.business || {
    task_count: 0,
    total_items: 0,
    success_items: 0,
    failed_items: 0,
    skipped_items: 0,
    running_items: 0,
    cancelled_items: 0,
    status_counts: {},
  };
  const archive = aggregate.archive || {
    job_count: 0,
    success_count: 0,
    failed_count: 0,
    running_count: 0,
    applying_count: 0,
    pending_count: 0,
    status_counts: {},
  };
  const businessTotal = num(business.total_items);
  const archiveTotal = num(archive.job_count);
  const businessRate = percent(num(business.success_items), businessTotal);
  const hasData = businessTotal > 0 || archiveTotal > 0;

  return (
    <div className={`rounded-2xl border border-l-4 border-slate-200 bg-white p-4 shadow-sm ${stageAccent(aggregate.stage_name)}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black text-slate-900">{formatStageLabel(aggregate.stage_name)}</div>
          <div className="mt-1 text-xs text-slate-500">业务 {dominantStatusLabel(business.status_counts)} · 归档 {archiveResultLabel(archive)}</div>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-500">#{aggregate.sequence_no}</span>
      </div>

      <div className="mt-4 space-y-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-black text-slate-700">
            <Layers3 size={14} className="text-slate-400" />
            业务执行
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StageMetricPill label="任务" value={num(business.task_count)} />
            <StageMetricPill label="总项" value={businessTotal} />
            <StageMetricPill label="成功" value={num(business.success_items)} tone="text-emerald-700" />
            <StageMetricPill label="失败" value={num(business.failed_items)} tone="text-rose-700" />
            <StageMetricPill label="运行" value={num(business.running_items)} tone="text-blue-700" />
            <StageMetricPill label="跳过/取消" value={num(business.skipped_items) + num(business.cancelled_items)} tone="text-slate-600" />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-black text-slate-700">
            <Archive size={14} className="text-slate-400" />
            归档结果
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StageMetricPill label="成功" value={num(archive.success_count)} tone="text-emerald-700" />
            <StageMetricPill label="失败" value={num(archive.failed_count)} tone="text-rose-700" />
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white">
        {hasData ? `业务成功率 ${businessRate}%` : '暂无执行'}
      </div>
    </div>
  );
};

export const BinarySecurityOverviewPage: React.FC<Props> = ({ projectId, taskType, onOpenTask }) => {
  const executionApi = api.domains.execution;
  const [items, setItems] = useState<BinarySecurityTask[]>([]);
  const [projectStats, setProjectStats] = useState<BinarySecurityProjectStats>(() => emptyProjectStats());
  const [projectStageAggregates, setProjectStageAggregates] = useState<BinarySecurityProjectStageAggregate[]>(() => emptyStageAggregates());
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [runningCount, setRunningCount] = useState(0);
  const [queuedCount, setQueuedCount] = useState(0);
  const [maxConcurrentTasks, setMaxConcurrentTasks] = useState(50);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createResult, setCreateResult] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadSpeed, setUploadSpeed] = useState<Record<string, number>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [defaultStageParallelism, setDefaultStageParallelism] = useState<Record<string, number>>(DEFAULT_STAGE_PARALLELISM);
  const [defaultMaxRetries, setDefaultMaxRetries] = useState(2);
  const [defaultContinueOnFailure, setDefaultContinueOnFailure] = useState(true);
  const [maxRetries, setMaxRetries] = useState(2);
  const [continueOnFailure, setContinueOnFailure] = useState(true);
  const [stageStatsExpanded, setStageStatsExpanded] = useState(false);
  const [moduleSelectionMode, setModuleSelectionMode] = useState<'auto' | 'manual_confirm'>('auto');
  const [moduleRiskLevels, setModuleRiskLevels] = useState<string[]>(['高']);
  const [stageParallelism, setStageParallelism] = useState<Record<string, number>>(DEFAULT_STAGE_PARALLELISM);

  const isSourceTask = taskType === 'source';
  const pageTitle = isSourceTask ? '源码扫描' : '二进制安全';
  const createTitle = isSourceTask ? '创建源码扫描任务' : '创建二进制安全任务';
  const emptyLabel = isSourceTask ? '当前项目还没有源码扫描任务。' : '当前项目还没有二进制安全任务。';
  const namePrefix = isSourceTask ? 'source-security' : 'binary-security';
  const stages = isSourceTask ? SOURCE_STAGES : BINARY_STAGES;

  const fileKey = (file: File) => {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    return isSourceTask ? (rel || file.name) : file.name;
  };

  const isSupportedSourceArchive = (file: File) => {
    const lowered = file.name.toLowerCase();
    return ['.zip', '.tar', '.tar.gz', '.tgz', '.tar.bz2', '.tbz2', '.tar.xz', '.txz'].some((ext) => lowered.endsWith(ext));
  };

  const load = async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const [data, projectConfig] = await Promise.all([
        executionApi.binarySecurity.listTasks(projectId, undefined, taskType),
        executionApi.binarySecurity.getProjectConfig(projectId),
      ]);
      const nextItems = data.items || [];
      setItems(nextItems);
      setProjectStats(data.project_stats || deriveProjectStats(nextItems));
      setProjectStageAggregates(Array.isArray(data.project_stage_aggregates) ? data.project_stage_aggregates : emptyStageAggregates());
      setRunningCount(data.running_count || 0);
      setQueuedCount(data.queued_count || 0);
      setMaxConcurrentTasks(data.max_concurrent_tasks || 50);
      setDefaultStageParallelism({
        ...DEFAULT_STAGE_PARALLELISM,
        ...(projectConfig.config.stage_parallelism || {}),
      });
      setDefaultMaxRetries(projectConfig.config.max_retries_per_item ?? 2);
      setDefaultContinueOnFailure(projectConfig.config.continue_on_item_failure ?? true);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    if (!projectId || refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      const activeTaskIds = items
        .filter((item) => !TERMINAL.has(item.status))
        .map((item) => item.id);
      if (activeTaskIds.length > 0) {
        await Promise.allSettled(
          activeTaskIds.map((taskId) => executionApi.binarySecurity.syncDownstreamStatus(projectId, taskId, { force: true })),
        );
      }
      await load();
    } catch (e: any) {
      setError(e?.message || '刷新失败');
    } finally {
      setRefreshing(false);
    }
  };

  const deleteTasks = async (taskIds: string[]) => {
    if (!projectId) return;
    if (taskIds.length === 0) return;
    let deleteMessage =
      taskIds.length === 1
        ? '删除会先取消并删除所有下游阶段任务，然后删除当前任务记录并清空任务目录。删除后不可恢复，是否继续？'
        : `将删除选中的 ${taskIds.length} 个任务。删除会先取消并删除所有下游阶段任务，然后删除当前任务记录并清空任务目录。删除后不可恢复，是否继续？`;

    if (taskIds.length === 1) {
      try {
        const detail = await executionApi.binarySecurity.getTask(projectId, taskIds[0]);
        const taskIdsByStage = new Map<string, string[]>();
        (detail.stage_items || []).forEach((item) => {
          const downstreamTaskId = item.downstream_task_id?.trim();
          if (!downstreamTaskId) return;
          const current = taskIdsByStage.get(item.stage_name) || [];
          if (!current.includes(downstreamTaskId)) current.push(downstreamTaskId);
          taskIdsByStage.set(item.stage_name, current);
        });
        const stageLines = (detail.stage_sequence || stages).map((stageName) => {
          const ids = taskIdsByStage.get(stageName) || [];
          return `${formatStageLabel(stageName)}：${ids.length > 0 ? ids.join(', ') : '无子任务'}`;
        });
        deleteMessage = [
          '删除会先取消并删除所有下游阶段任务，然后删除当前任务记录并清空任务目录。删除后不可恢复，是否继续？',
          '',
          '将删除的阶段子任务 ID：',
          ...stageLines,
        ].join('\n');
      } catch {
        // Ignore detail fetch failure and fall back to the generic prompt.
      }
    }

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
      const results = await Promise.allSettled(taskIds.map((taskId) => executionApi.binarySecurity.deleteTask(projectId, taskId)));
      const failed = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (failed.length > 0) {
        const first = failed[0]?.reason;
        throw new Error(first?.message || `删除失败：${failed.length} 个任务未删除成功`);
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
    void load();
  }, [projectId, taskType]);

  const hasActive = useMemo(() => items.some((item) => !TERMINAL.has(item.status)), [items]);
  useEffect(() => {
    if (!hasActive) return;
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [hasActive, projectId, taskType]);

  useEffect(() => {
    if (!showCreateDialog) return;
    if (name.trim()) return;
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    setName(`${namePrefix}-${ts}`);
  }, [showCreateDialog, name, namePrefix]);

  useEffect(() => {
    setSelectedTaskIds((current) => current.filter((id) => items.some((item) => item.id === id)));
  }, [items]);

  const stats = projectStats;
  const orderedStageAggregates = useMemo(() => {
    const byStage = new Map(projectStageAggregates.map((item) => [item.stage_name, item]));
    return stages.map((stage) => byStage.get(stage)).filter((item): item is BinarySecurityProjectStageAggregate => Boolean(item));
  }, [projectStageAggregates, stages]);

  const totalUploadBytes = useMemo(() => files.reduce((sum, file) => sum + (file.size || 0), 0), [files]);
  const activeUploadSpeed = useMemo(
    () => Object.values(uploadSpeed).reduce((max, current) => Math.max(max, current || 0), 0),
    [uploadSpeed],
  );
  const selectedCount = selectedTaskIds.length;
  const allSelected = items.length > 0 && selectedCount === items.length;

  const resetCreateForm = () => {
    setName('');
    setDescription('');
    setFiles([]);
    setUploadProgress({});
    setUploadSpeed({});
    setMaxRetries(defaultMaxRetries);
    setContinueOnFailure(defaultContinueOnFailure);
    setModuleSelectionMode('auto');
    setModuleRiskLevels(['高']);
    setStageParallelism({
      ...defaultStageParallelism,
    });
    setCreateError(null);
  };

  const openCreateDialog = () => {
    setCreateResult(null);
    resetCreateForm();
    setShowCreateDialog(true);
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
    if (!projectId) return;
    setCreateError(null);
    setCreateResult(null);
    if (!name.trim()) {
      setCreateError('请输入任务名称');
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
    if (moduleRiskLevels.length === 0) {
      setCreateError('至少选择一个模块风险等级');
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
        input_files: inputFiles,
        policy_overrides: {
          max_retries_per_item: maxRetries,
          continue_on_item_failure: continueOnFailure,
          stage_parallelism: stageParallelism,
          module_selection_mode: moduleSelectionMode,
          module_risk_levels: moduleRiskLevels,
        },
      });
      const inputDir = created.summary?.input_dir || `/app/secflow-app-binary-security/${prepared.task_id}/input`;
      const tempUploadDir = created.summary?.temp_upload_dir || `/app/secflow-app-binary-security/${prepared.task_id}/run/upload-tmp`;
      const ensuredDirs = new Set<string>();
      const ensureUploadSubdirectories = async (basePath: string, relativeDir: string) => {
        if (!basePath || !relativeDir) return;
        const normalizedBase = basePath.replace(/^\/+|\/+$/g, '');
        const parts = relativeDir.split('/').filter(Boolean);
        let current = normalizedBase;
        for (const part of parts) {
          current = current ? `${current}/${part}` : part;
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
        const rel = isSourceTask ? file.name : file.name;
        const normalizedRel = rel.replace(/\\/g, '/');
        const relDir = normalizedRel.includes('/') ? normalizedRel.split('/').slice(0, -1).join('/') : '';
        const uploadBase = isSourceTask ? tempUploadDir : inputDir;
        const uploadPath = relDir ? `${uploadBase}/${relDir}` : uploadBase;
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
            sourceLabel: isSourceTask ? '源码扫描输入上传' : '二进制安全输入上传',
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
      onOpenTask(prepared.task_id);
    } catch (e: any) {
      setCreateError(e?.message || '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="px-8 pb-10 pt-8 space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-600">Binary Security</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">{pageTitle}</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              {isSourceTask
                ? '为当前项目统一编排系统分析、入口分析、数据流分析和漏洞扫描，聚合查看源码工程任务的阶段状态与结果。'
                : '为当前项目统一编排固件解包、系统分析、反编译、入口分析、数据流分析和漏洞扫描，聚合查看多固件任务的阶段状态与结果。'}
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
              onClick={() => void refresh()}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              {refreshing ? '刷新中...' : '刷新'}
            </button>
          </div>
        </div>
      </section>

      {createResult && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {createResult}
        </div>
      )}

      <section className="rounded-[2rem] border border-slate-200 bg-slate-50/70 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-rose-600" />
            <h2 className="text-xl font-black text-slate-900">当前项目统计</h2>
          </div>
          <button
            type="button"
            onClick={() => setStageStatsExpanded((value) => !value)}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            aria-expanded={stageStatsExpanded}
          >
            <BarChart3 size={14} />
            {stageStatsExpanded ? '收起阶段汇总' : `展开阶段汇总${orderedStageAggregates.length ? ` (${orderedStageAggregates.length})` : ''}`}
            <ChevronRight size={14} className={`transition-transform ${stageStatsExpanded ? 'rotate-90' : ''}`} />
          </button>
        </div>
        <div className="mt-2 text-sm text-slate-500">任务、固件和结果统计基于当前项目；运行中、排队中和最大并发为服务全局队列指标。</div>
        <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-6">
          <ProjectStatCard label="任务总数" value={stats.total} hint={`成功 ${stats.success} · 部分成功 ${stats.partial_success} · 失败 ${stats.failed}`} />
          <ProjectStatCard label="运行中任务" value={stats.running} hint={`全局运行 ${runningCount} · 排队 ${queuedCount}`} />
          <ProjectStatCard label={isSourceTask ? '源码输入' : '固件输入'} value={stats.input_count} hint={isSourceTask ? '当前项目源码输入总量' : `已解包 ${stats.unpacked_firmware_count} · 失败 ${stats.failed_firmware_count}`} />
          <ProjectStatCard label="已选模块" value={stats.selected_module_count} hint={`候选 ${stats.candidate_module_count} · 高危 ${stats.high_risk_module_count}`} />
          <ProjectStatCard label="入口结果" value={stats.entry_count} hint="入口分析产出总量" />
          <ProjectStatCard label="漏洞结果" value={stats.vuln_result_count} hint={`队列最大并发 ${maxConcurrentTasks}`} />
        </div>

        {stageStatsExpanded ? (
          orderedStageAggregates.length > 0 ? (
            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {orderedStageAggregates.map((aggregate) => (
                <StageAggregateCard key={aggregate.stage_name} aggregate={aggregate} />
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-8 text-center text-sm font-semibold text-slate-400">
              暂无阶段汇总统计
            </div>
          )
        ) : null}
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-black text-slate-900">任务列表</h2>
            {items.length > 0 && (
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => setSelectedTaskIds(e.target.checked ? items.map((item) => item.id) : [])}
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
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
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting ? '删除中...' : `删除选中 (${selectedCount})`}
              </button>
            )}
            <div className="text-sm text-slate-500">共 {items.length} 条</div>
          </div>
        </div>
        {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
        {loading && items.length === 0 ? (
          <div className="mt-6 text-sm text-slate-500">加载中...</div>
        ) : items.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 px-6 py-10 text-center text-sm text-slate-400">{emptyLabel}</div>
        ) : (
          <div className="mt-5 space-y-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="w-full rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 text-left transition hover:border-slate-300 hover:bg-white"
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
                        className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                      />
                      <h3 className="text-lg font-black text-slate-900">{item.name}</h3>
                      <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusTone(item.status)}`}>{item.status}</span>
                      {item.status === 'pending' && item.queue_position ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                          排队中，第 {item.queue_position} 位
                        </span>
                      ) : null}
                      {item.status === 'dispatching' ? (
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-black text-sky-700">
                          调度中
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 break-all rounded-xl bg-white px-3 py-2 font-mono text-xs text-slate-500">{item.firmware_path}</div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600 xl:grid-cols-6">
                      <div>当前阶段：<span className="font-bold text-slate-900">{formatStageLabel(item.current_stage)}</span></div>
                      <div>{isSourceTask ? '源码文件' : '固件数'}：<span className="font-bold text-slate-900">{item.firmware_item_count}</span></div>
                      <div>{isSourceTask ? '已选模块' : '已解包'}：<span className="font-bold text-slate-900">{isSourceTask ? item.selected_module_count : item.unpacked_firmware_count}</span></div>
                      <div>{isSourceTask ? '入口数量' : '解包失败'}：<span className="font-bold text-slate-900">{isSourceTask ? item.entry_count : item.failed_firmware_count}</span></div>
                      <div>漏洞结果：<span className="font-bold text-slate-900">{item.vuln_result_count}</span></div>
                      <div>开始时间：<span className="font-bold text-slate-900">{fmt(item.started_at)}</span></div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {(item.stage_sequence?.length ? item.stage_sequence : stages).map((stage) => {
                        const summary = item.stage_summaries.find((current) => current.stage_name === stage);
                        return (
                          <span key={stage} className={`rounded-xl px-3 py-1 text-xs font-bold ${summary ? statusTone(summary.status) : 'bg-slate-100 text-slate-400'}`}>
                            {formatStageLabel(stage)}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenTask(item.id)}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700"
                    >
                      查看详情
                      <ChevronRight size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteTask(item.id)}
                      disabled={deleting}
                      className="rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-bold text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-5xl rounded-[2rem] border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h3 className="text-xl font-black text-slate-900">{createTitle}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {isSourceTask ? '仅支持上传常见源码压缩包；文件会先上传到临时目录，再由后端解压到任务 input 目录。' : '每个上传文件都会作为独立固件进入完整的安全分析编排流程。'}
                </p>
              </div>
              <button type="button" onClick={closeCreateDialog} disabled={submitting} className="text-sm font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50">
                关闭
              </button>
            </div>
            <div className="space-y-6 p-6">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="任务名称" className="rounded-xl border border-slate-200 px-4 py-3 text-sm" />
                <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="任务描述（可选）" className="rounded-xl border border-slate-200 px-4 py-3 text-sm" />
              </div>

              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-slate-900">输入文件</div>
                    <div className="mt-1 text-sm text-slate-500">{isSourceTask ? '仅支持 zip、tar、tgz、tar.gz、tbz2、tar.bz2、txz、tar.xz 等常见压缩文件。' : '支持一次选择多个文件；文件名不能重复。'}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      <Upload size={16} />
                      选择文件
                    </button>
                    <div className="text-sm text-slate-500">{files.length} 个文件 · {fmtSize(totalUploadBytes)}</div>
                    {submitting && activeUploadSpeed > 0 && (
                      <div className="text-sm font-semibold text-sky-600">上传速度 {fmtSpeed(activeUploadSpeed)}</div>
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
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-400">尚未选择输入文件。</div>
                  ) : files.map((file) => {
                    const key = fileKey(file);
                    const displayPath = file.name;
                    return (
                      <div key={key} className="rounded-2xl bg-white px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-slate-900">{displayPath}</div>
                            <div className="mt-1 text-xs text-slate-500">{fmtSize(file.size || 0)}</div>
                          </div>
                          <div className="flex items-center gap-3">
                            {submitting && (
                              <div className="min-w-[160px] text-right text-xs font-semibold text-slate-500">
                                {uploadProgress[key] ? `${uploadProgress[key]}%` : '等待上传'}
                                {uploadSpeed[key] > 0 ? ` · ${fmtSpeed(uploadSpeed[key])}` : ''}
                              </div>
                            )}
                            <button type="button" onClick={() => removeFile(key)} disabled={submitting} className="text-sm font-semibold text-rose-600 disabled:opacity-40">
                              移除
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <div>
                    <div className="text-sm font-black text-slate-900">模块推进方式</div>
                    <div className="mt-3 grid gap-2">
                      {MODULE_SELECTION_OPTIONS.map((option) => (
                        <label key={option.value} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                          <input
                            type="radio"
                            name="moduleSelectionMode"
                            checked={moduleSelectionMode === option.value}
                            onChange={() => setModuleSelectionMode(option.value)}
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-black text-slate-900">后续分析模块风险等级</div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {MODULE_RISK_OPTIONS.map((risk) => (
                        <label key={risk} className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                          <input
                            type="checkbox"
                            checked={moduleRiskLevels.includes(risk)}
                            onChange={(event) => {
                              setModuleRiskLevels((current) => {
                                if (event.target.checked) return current.includes(risk) ? current : current.concat(risk);
                                return current.filter((item) => item !== risk);
                              });
                            }}
                          />
                          {risk}
                        </label>
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      先按风险等级筛选候选模块；若选择人工确认，系统分析完成后再由人工从候选模块中确认最终推进集合。
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                <div className="text-sm font-black text-slate-900">阶段并发配置</div>
                <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
                  {STAGE_PARALLELISM_FIELDS.filter((field) => !isSourceTask || !['firmware_unpack', 'binary_to_source'].includes(field.key)).map((field) => (
                    <div key={field.key}>
                      <div className="mb-2 text-sm font-bold text-slate-700">{field.label}</div>
                      <input
                        type="number"
                        min={1}
                        max={16}
                        value={stageParallelism[field.key] ?? 1}
                        onChange={(e) => setStageParallelism((current) => ({ ...current, [field.key]: Number(e.target.value || 1) }))}
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
                      />
                    </div>
                  ))}
                  <div>
                    <div className="mb-2 text-sm font-bold text-slate-700">子任务重试次数</div>
                    <input type="number" min={0} max={10} value={maxRetries} onChange={(e) => setMaxRetries(Number(e.target.value || 0))} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" />
                  </div>
                </div>
                <label className="mt-4 flex items-center gap-3 text-sm font-semibold text-slate-700">
                  <input type="checkbox" checked={continueOnFailure} onChange={(e) => setContinueOnFailure(e.target.checked)} />
                  子任务失败时继续推进其他子任务
                </label>
              </div>

              {createError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{createError}</div>}

              <div className="flex items-center justify-end gap-3">
                <button type="button" onClick={closeCreateDialog} disabled={submitting} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void submitTask()}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
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
