import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Info, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { BinarySecurityModuleSelection, BinarySecurityOverviewNode, BinarySecurityTaskDetail, BinarySecurityTaskType } from '../../clients/binarySecurity';
import { api } from '../../clients/api';
import { B2STaskDetail } from '../../clients/binaryToSource';
import { DataflowScanTaskDetail } from '../../clients/dataflowVulnScanner';
import { FirmwareUnpackTask } from '../../clients/firmwareUnpacker';
import { AppDfaTaskDetail, AppEaTaskDetail, AppSaTaskDetail } from '../../types/types';
import { showConfirm } from '../../components/DialogService';
import { saveBinarySecurityReturnContext } from '../../utils/executionReturnContext';

interface Props {
  projectId: string;
  taskId: string;
  taskType: BinarySecurityTaskType;
  onBack: () => void;
}

const TERMINAL = new Set(['success', 'partial_success', 'failed', 'cancelled']);
const DEFAULT_BINARY_STAGE_SEQUENCE = [
  'firmware_unpack',
  'system_analysis',
  'binary_to_source',
  'entry_analysis',
  'dataflow_analysis',
  'vuln_scan',
];

const STAGE_LABELS: Record<string, string> = {
  firmware_unpack: '固件解包',
  system_analysis: '系统分析',
  binary_to_source: '二进制逆向',
  entry_analysis: '入口分析',
  dataflow_analysis: '数据流分析',
  vuln_scan: '漏洞扫描',
};

const DOWNSTREAM_DETAIL_SUPPORT: Record<string, { supported: boolean; reason?: string }> = {
  firmware_unpack: { supported: true },
  system_analysis: { supported: true },
  binary_to_source: { supported: true },
  entry_analysis: { supported: true },
  dataflow_analysis: { supported: true },
  vuln_scan: { supported: true },
};

function downstreamDetailSupport(stageName: string, downstreamTaskId?: string | null) {
  if (!downstreamTaskId?.trim()) {
    return { supported: false, reason: '该阶段子任务尚未创建下游任务。' };
  }
  return DOWNSTREAM_DETAIL_SUPPORT[stageName] || { supported: false, reason: '该阶段尚未配置可跳转的任务详情页面。' };
}

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
    case 'pending_module_confirmation':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'waiting_confirmation':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'pending_upload':
      return 'bg-violet-50 text-violet-700 border-violet-200';
    case 'uploading':
      return 'bg-sky-50 text-sky-700 border-sky-200';
    case 'ready_to_start':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    case 'running':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'applying':
      return 'bg-violet-50 text-violet-700 border-violet-200';
    case 'dispatching':
      return 'bg-sky-50 text-sky-700 border-sky-200';
    case 'queued':
      return 'bg-cyan-50 text-cyan-700 border-cyan-200';
    case 'skipped':
      return 'bg-slate-100 text-slate-500 border-slate-200';
    default:
      return 'bg-slate-50 text-slate-600 border-slate-200';
  }
};

const stageNodeTone = (status: string, selected: boolean) => {
  const selectedDepth = selected ? '-translate-y-1 shadow-[0_18px_40px_-18px_rgba(15,23,42,0.45)]' : 'shadow-sm';
  switch (status) {
    case 'success':
      return `border-emerald-300 bg-emerald-50 text-emerald-800 ${selectedDepth}`;
    case 'partial_success':
      return `border-amber-300 bg-amber-50 text-amber-800 ${selectedDepth}`;
    case 'failed':
      return `border-rose-300 bg-rose-50 text-rose-800 ${selectedDepth}`;
    case 'running':
      return `border-blue-300 bg-blue-50 text-blue-800 ${selectedDepth}`;
    case 'applying':
      return `border-violet-300 bg-violet-50 text-violet-800 ${selectedDepth}`;
    case 'cancelled':
      return `border-slate-300 bg-slate-100 text-slate-600 ${selectedDepth}`;
    case 'waiting_confirmation':
      return `border-amber-300 bg-amber-50 text-amber-800 ${selectedDepth}`;
    case 'skipped':
      return `border-slate-300 bg-slate-50 text-slate-500 ${selectedDepth}`;
    default:
      return `border-slate-200 bg-white text-slate-600 ${selectedDepth}`;
  }
};

const stageConnectorTone = (status: string) => {
  switch (status) {
    case 'success':
      return 'text-emerald-400';
    case 'partial_success':
      return 'text-amber-400';
    case 'failed':
      return 'text-rose-400';
    case 'running':
      return 'text-blue-400';
    case 'applying':
      return 'text-violet-400';
    default:
      return 'text-slate-400';
  }
};

const stageItemTone = (selected: boolean) => (
  selected
    ? 'border-sky-300 bg-gradient-to-br from-sky-50 via-white to-cyan-50 shadow-md shadow-sky-100/70'
    : 'border-slate-200 bg-slate-50/70 hover:border-slate-300 hover:bg-white'
);

const detailPanelTone = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700';

const fmt = (value?: string | null) => (value ? new Date(value).toLocaleString() : '-');
const fmtTime = (value?: string | null) => (value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-');

type DownstreamTaskDetail =
  | { kind: 'firmware_unpack'; data: FirmwareUnpackTask }
  | { kind: 'system_analysis'; data: AppSaTaskDetail }
  | { kind: 'binary_to_source'; data: B2STaskDetail }
  | { kind: 'entry_analysis'; data: AppEaTaskDetail }
  | { kind: 'dataflow_analysis'; data: AppDfaTaskDetail }
  | { kind: 'vuln_scan'; data: DataflowScanTaskDetail };

type DownstreamTaskState = {
  loading: boolean;
  detail?: DownstreamTaskDetail;
  error?: string;
};

type DetailTab = 'overview' | 'timeline' | 'artifacts';
type StageNodeKind = 'business' | 'archive';
type ArchiveJob = BinarySecurityTaskDetail['archive_jobs'][number];

const ARCHIVE_EVENT_LABELS: Record<string, string> = {
  downstream_archive_job_queued: '归档已排队',
  downstream_archive_job_reused: '复用归档任务',
  downstream_archive_job_completed: '归档完成',
  downstream_output_copy_skipped: '归档跳过',
};

const TIMELINE_EVENT_LABELS: Record<string, string> = {
  task_created: '任务创建',
  task_upload_pending: '等待上传',
  task_upload_started: '上传校验开始',
  source_archives_extracted: '源码解压完成',
  task_upload_completed: '上传完成',
  task_ready_to_start: '任务就绪',
  task_start_requested: '任务入队',
  firmware_items_initialized: '固件输入初始化',
  source_tree_initialized: '源码输入初始化',
  task_continue_requested: '继续执行',
  task_retried: '任务重试',
  stage_retry_requested: '阶段重试',
  stage_retry_started: '阶段重跑',
  stage_started: '阶段开始',
  stage_finished: '阶段完成',
  stage_failed: '阶段失败',
  stage_skipped: '阶段跳过',
  module_selection_confirmed: '模块确认',
  downstream_status_sync_requested: '同步下游状态',
  downstream_status_sync_skipped: '跳过状态同步',
  downstream_status_synced: '下游状态已同步',
  downstream_marked_stale: '下游结果过期',
  task_cancelled: '任务取消',
  task_delete_requested: '删除请求',
  task_completed: '任务完成',
  task_failed: '任务失败',
  task_partial_success: '部分成功',
  ...ARCHIVE_EVENT_LABELS,
};

const DOWNSTREAM_SUMMARY_LABELS: Record<string, string> = {
  result_file: '结果文件',
  result_externalized: '外置结果',
  status: '结果状态',
  error: '错误信息',
  module_name: '模块',
  module_count: '模块数',
  round_count: '轮次数',
  total_duration_ms: '总耗时',
  total_tokens: 'Token',
  profile_id: 'Profile',
  profile_version: 'Profile 版本',
  run_name: 'Run',
  run_path: 'Run 路径',
  runs_root: 'Runs Root',
  workspace_path: '工作目录',
  data_flow_path: '数据流结果',
  source_path: '源码目录',
  model: '模型',
  review_profile: '评审档位',
  max_review_cycles: '最大评审轮次',
  result_review_concurrency: '评审并发',
};

const RESULT_SUMMARY_KEYS = [
  'status',
  'module_name',
  'module_count',
  'round_count',
  'total_duration_ms',
  'total_tokens',
  'result_file',
  'error',
];

const VULN_METADATA_KEYS = [
  'run_name',
  'profile_id',
  'profile_version',
  'model',
  'review_profile',
  'max_review_cycles',
  'result_review_concurrency',
  'workspace_path',
  'data_flow_path',
  'source_path',
  'run_path',
  'runs_root',
];

const timelineLevelTone = (level?: string | null) => {
  switch (String(level || '').toLowerCase()) {
    case 'error':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'warning':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'success':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    default:
      return 'border-sky-200 bg-sky-50 text-sky-700';
  }
};

const formatTimelineLevelLabel = (level?: string | null) => {
  const raw = String(level || '').toLowerCase();
  const labels: Record<string, string> = {
    info: '信息',
    warning: '警告',
    error: '错误',
    success: '成功',
  };
  return labels[raw] || (level || '-');
};

const formatTimelineEventTypeLabel = (eventType?: string | null) => TIMELINE_EVENT_LABELS[String(eventType || '')] || eventType || 'event';

const formatDurationMs = (value: unknown): string => {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0) return '-';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return `${minutes}m ${rest}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
};

const tokenTotalFromValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, any>;
  const direct = Number(record.total ?? record.total_tokens ?? record.token_total);
  if (Number.isFinite(direct)) return direct;
  const pieces = ['input', 'output', 'cache_read', 'cache_write', 'prompt_tokens', 'completion_tokens']
    .map((key) => Number(record[key]))
    .filter((item) => Number.isFinite(item));
  if (!pieces.length) return null;
  return pieces.reduce((sum, item) => sum + item, 0);
};

const formatDownstreamSummaryValue = (key: string, value: unknown): string => {
  if (value == null || value === '') return '-';
  if (key === 'total_duration_ms') return formatDurationMs(value);
  if (key === 'total_tokens') {
    const total = tokenTotalFromValue(value);
    return total == null ? '-' : total.toLocaleString();
  }
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString() : '-';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return `${value.length} 项`;
  if (typeof value === 'object') return `${Object.keys(value as Record<string, any>).length} 个字段`;
  return String(value);
};

function DownstreamSummaryGrid({
  payload,
  preferredKeys,
  emptyText = '当前下游任务尚未生成结构化结果摘要。',
}: {
  payload?: Record<string, any> | null;
  preferredKeys: string[];
  emptyText?: string;
}) {
  if (!payload || Object.keys(payload).length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-4 text-xs text-slate-500">
        {emptyText}
      </div>
    );
  }
  const selectedKeys = preferredKeys.filter((key) => payload[key] != null && payload[key] !== '');
  const fallbackKeys = Object.keys(payload)
    .filter((key) => !selectedKeys.includes(key) && payload[key] != null && payload[key] !== '')
    .slice(0, Math.max(0, 8 - selectedKeys.length));
  const rows = [...selectedKeys, ...fallbackKeys].slice(0, 8);
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-4 text-xs text-slate-500">
        {emptyText}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 text-xs text-slate-600 md:grid-cols-2 xl:grid-cols-4">
      {rows.map((key) => (
        <div key={key} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <div className="text-slate-400">{DOWNSTREAM_SUMMARY_LABELS[key] || key}</div>
          <div className="mt-1 break-all font-semibold text-slate-800">{formatDownstreamSummaryValue(key, payload[key])}</div>
        </div>
      ))}
    </div>
  );
}

const formatTimelineDetailValue = (value: unknown): string => {
  if (value == null) return '-';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '-';
  if (typeof value === 'string') return value || '-';
  try {
    const text = JSON.stringify(value);
    return text.length > 160 ? `${text.slice(0, 160)}...` : text;
  } catch {
    return String(value);
  }
};

const timelineDetailRows = (payload: Record<string, any> | null) => {
  if (!payload || Object.keys(payload).length === 0) return [];
  const labels: Record<string, string> = {
    target_stage: '目标阶段',
    last_success_stage: '最后成功阶段',
    cleared_stages: '清理阶段',
    retry_semantics: '重试语义',
    archive_job_id: '归档任务 ID',
    archive_status: '归档状态',
    downstream_service: '下游服务',
    downstream_task_id: '下游任务 ID',
    downstream_status: '下游状态',
    mapped_status: '映射状态',
    selected_module_keys: '已选模块',
    stage_name: '阶段',
    item_id: '子任务 ID',
    item_key: '子任务 Key',
    force: '强制同步',
    input_files: '输入文件',
    uploaded_files: '上传文件数',
    archive_count: '归档数',
    extracted_file_count: '解压文件数',
    source: '源路径',
    target: '目标路径',
    error: '错误',
    message: '消息',
  };
  const priority = [
    'target_stage', 'last_success_stage', 'cleared_stages', 'retry_semantics',
    'archive_job_id', 'archive_status', 'downstream_service', 'downstream_task_id',
    'downstream_status', 'mapped_status', 'selected_module_keys', 'stage_name',
    'item_id', 'item_key', 'force', 'uploaded_files', 'archive_count', 'extracted_file_count', 'error',
  ];
  const orderedKeys = [
    ...priority.filter((key) => Object.prototype.hasOwnProperty.call(payload, key)),
    ...Object.keys(payload).filter((key) => !priority.includes(key)).sort(),
  ];
  return orderedKeys.map((key) => ({
    key,
    label: labels[key] || key,
    value: formatTimelineDetailValue(payload[key]),
  }));
};

function TimelineDetailBlock({ payload }: { payload: Record<string, any> | null }) {
  const rows = timelineDetailRows(payload);
  if (rows.length === 0) return null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
        <Info size={12} />
        事件细节
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {rows.slice(0, 8).map((row) => (
          <div key={row.key} className="min-w-0 rounded-xl border border-white bg-white px-3 py-2 text-xs">
            <div className="font-bold text-slate-400">{row.label}</div>
            <div className="mt-1 break-all font-mono text-slate-700">{row.value}</div>
          </div>
        ))}
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-bold text-slate-500 hover:text-slate-800">
          查看原始 JSON
        </summary>
        <pre className="mt-2 max-h-48 overflow-auto rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs leading-6 text-slate-700">
          {JSON.stringify(payload, null, 2)}
        </pre>
      </details>
    </div>
  );
}

const ARCHIVE_STATUS_LABELS: Record<string, string> = {
  pending: '等待归档',
  running: '归档中',
  archived: '状态应用中',
  applying: '状态应用中',
  success: '归档完成',
  failed: '归档失败',
};

const archiveStatusLabel = (status: string) => ARCHIVE_STATUS_LABELS[status] || status || 'pending';
const BUSINESS_STAGE_CARD_WIDTH = 240;
const ARCHIVE_STAGE_CARD_WIDTH = 180;
const STAGE_CONNECTOR_WIDTH = 24;
const STAGE_FLOW_VERTICAL_BREAKPOINT = 1120;

const durationLabel = (started?: string | null, ended?: string | null) => {
  if (!started) return '-';
  const startMs = new Date(started).getTime();
  const endMs = ended ? new Date(ended).getTime() : Date.now();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return '-';
  const seconds = Math.round((endMs - startMs) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return `${minutes}m ${rest}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
};

const shouldShowStageRetryReason = (status?: string | null, retryable?: boolean, retryReason?: string | null) => (
  Boolean(!retryable && retryReason && ['failed', 'partial_success', 'cancelled'].includes(String(status || '')))
);

export const BinarySecurityTaskDetailPage: React.FC<Props> = ({ projectId, taskId, taskType, onBack }) => {
  const executionApi = api.domains.execution;
  const navigate = useNavigate();
  const stageFlowRef = useRef<HTMLDivElement | null>(null);
  const [detail, setDetail] = useState<BinarySecurityTaskDetail | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [artifacts, setArtifacts] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineClearing, setTimelineClearing] = useState(false);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [moduleSelectionLoading, setModuleSelectionLoading] = useState(false);
  const [moduleSelection, setModuleSelection] = useState<BinarySecurityModuleSelection | null>(null);
  const [selectedModuleKeys, setSelectedModuleKeys] = useState<string[]>([]);
  const [actionLoading, setActionLoading] = useState<string>('');
  const [expandedEventKey, setExpandedEventKey] = useState<string | null>(null);
  const [timelinePage, setTimelinePage] = useState(1);
  const [timelinePageSize, setTimelinePageSize] = useState(200);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [selectedStage, setSelectedStage] = useState<string>(DEFAULT_BINARY_STAGE_SEQUENCE[0]);
  const [selectedNodeKind, setSelectedNodeKind] = useState<StageNodeKind>('business');
  const [downstreamByItemId, setDownstreamByItemId] = useState<Record<string, DownstreamTaskState>>({});
  const [stageFlowLayout, setStageFlowLayout] = useState<{ mode: 'horizontal' | 'vertical'; cardWidth: number; connectorWidth: number }>({
    mode: 'horizontal',
    cardWidth: 160,
    connectorWidth: 40,
  });

  const stageSequence = useMemo(
    () => (detail?.stage_sequence?.length ? detail.stage_sequence : DEFAULT_BINARY_STAGE_SEQUENCE),
    [detail?.stage_sequence],
  );
  const isSourceTask = taskType === 'source';
  const canActOnTask = Boolean(detail);
  const taskRetrySupported = Boolean(detail?.task_retry_supported);
  const taskRetryReason = detail?.task_retry_reason || '当前任务不可从头重试';
  const taskContinueSupported = Boolean(detail && ['failed', 'partial_success', 'cancelled'].includes(detail.status));
  const taskContinueReason = detail?.status === 'success'
    ? '当前任务已全部成功，没有需要继续的阶段'
    : detail && ['pending', 'dispatching', 'running', 'pending_upload', 'uploading', 'ready_to_start'].includes(detail.status)
      ? '当前任务正在执行、排队或上传中，不能手动继续'
      : '当前任务状态不支持手动继续';
  const staleStages = useMemo(() => new Set<string>((detail?.summary?.stale_stages as string[] | undefined) || []), [detail?.summary]);

  const loadTask = async () => {
    if (!projectId || !taskId) return;
    setLoading(true);
    setError(null);
    try {
      const task = await executionApi.binarySecurity.getTask(projectId, taskId);
      setDetail(task);
      setSelectedStage((current) => {
        const nextStageSequence = task.stage_sequence?.length ? task.stage_sequence : DEFAULT_BINARY_STAGE_SEQUENCE;
        if (current && nextStageSequence.includes(current)) {
          return current;
        }
        setSelectedNodeKind('business');
        return task.current_stage && nextStageSequence.includes(task.current_stage) ? task.current_stage : nextStageSequence[0];
      });
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const loadModuleSelection = async () => {
    if (!projectId || !taskId) return;
    setModuleSelectionLoading(true);
    try {
      const moduleSelectionResp = await executionApi.binarySecurity.getModuleSelection(projectId, taskId);
      setModuleSelection(moduleSelectionResp);
      const defaultKeys = (moduleSelectionResp?.selected_modules?.length
        ? moduleSelectionResp.selected_modules
        : moduleSelectionResp?.candidate_modules || []
      ).map((item) => String(item.module_key || '')).filter(Boolean);
      setSelectedModuleKeys(defaultKeys);
    } catch {
      setModuleSelection(null);
    } finally {
      setModuleSelectionLoading(false);
    }
  };

  const loadTimeline = async () => {
    if (!projectId || !taskId) return;
    setTimelineLoading(true);
    setError(null);
    try {
      const timelineResp = await executionApi.binarySecurity.getTimeline(projectId, taskId);
      setTimeline(timelineResp.events || []);
    } catch (e: any) {
      setError(e?.message || '加载事件时间线失败');
    } finally {
      setTimelineLoading(false);
    }
  };

  const clearTimeline = async () => {
    if (!projectId || !taskId || timelineClearing) return;
    const confirmed = await showConfirm({
      title: '清空事件时间线',
      message: `将删除当前${isSourceTask ? '源码任务' : '二进制任务'}的全部事件时间线记录。该操作不影响任务状态、阶段结果和产物文件，删除后不可恢复，是否继续？`,
      confirmText: '确认清空',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    setTimelineClearing(true);
    setError(null);
    try {
      await executionApi.binarySecurity.clearTimeline(projectId, taskId);
      setTimeline([]);
      setExpandedEventKey(null);
    } catch (e: any) {
      setError(e?.message || '清空事件时间线失败');
    } finally {
      setTimelineClearing(false);
    }
  };

  const deleteTimelineEvent = async (eventId: string, eventKey: string) => {
    if (!projectId || !taskId || !eventId || deletingEventId) return;
    const confirmed = await showConfirm({
      title: '删除事件',
      message: '将删除当前事件记录。该操作不影响任务状态、阶段结果和产物文件，删除后不可恢复，是否继续？',
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    setDeletingEventId(eventId);
    setError(null);
    try {
      await executionApi.binarySecurity.deleteTimelineEvent(projectId, taskId, eventId);
      setTimeline((current) => current.filter((event) => event.id !== eventId));
      setExpandedEventKey((current) => (current === eventKey ? null : current));
    } catch (e: any) {
      setError(e?.message || '删除事件失败');
    } finally {
      setDeletingEventId(null);
    }
  };

  const loadArtifacts = async () => {
    if (!projectId || !taskId) return;
    setArtifactsLoading(true);
    setError(null);
    try {
      setArtifacts(await executionApi.binarySecurity.getArtifacts(projectId, taskId));
    } catch (e: any) {
      setError(e?.message || '加载产物文件失败');
    } finally {
      setArtifactsLoading(false);
    }
  };

  const refreshActiveTab = async () => {
    await loadTask();
    if (activeTab === 'overview' && detail?.status === 'pending_module_confirmation') await loadModuleSelection();
    if (activeTab === 'timeline') await loadTimeline();
    if (activeTab === 'artifacts') await loadArtifacts();
  };

  useEffect(() => {
    void loadTask();
  }, [projectId, taskId]);

  useEffect(() => {
    if (!detail || TERMINAL.has(detail.status)) return;
    if (detail.status === 'pending_module_confirmation') return;
    const timer = window.setInterval(() => void loadTask(), 5000);
    return () => window.clearInterval(timer);
  }, [detail?.status, projectId, taskId]);

  useEffect(() => {
    if (activeTab === 'overview' && detail?.status === 'pending_module_confirmation' && !moduleSelection && !moduleSelectionLoading) {
      void loadModuleSelection();
    }
  }, [activeTab, detail?.status, moduleSelection, moduleSelectionLoading, projectId, taskId]);

  useEffect(() => {
    if (activeTab === 'timeline' && timeline.length === 0 && !timelineLoading) {
      void loadTimeline();
    }
  }, [activeTab, timeline.length, timelineLoading, projectId, taskId]);

  useEffect(() => {
    if (activeTab === 'artifacts' && !artifacts && !artifactsLoading) {
      void loadArtifacts();
    }
  }, [activeTab, artifacts, artifactsLoading, projectId, taskId]);

  useEffect(() => {
    if (activeTab !== 'overview' || selectedNodeKind !== 'business' || !detail || !projectId || !selectedStage) return;
    const stageItems = detail.stage_items.filter((item) => item.stage_name === selectedStage);
    const fetchableItems = stageItems.filter((item) => item.downstream_task_id);
    if (fetchableItems.length === 0) {
      setDownstreamByItemId({});
      return;
    }

    let cancelled = false;
    setDownstreamByItemId((current) => {
      const next: Record<string, DownstreamTaskState> = {};
      for (const item of fetchableItems) {
        next[item.id] = current[item.id] && current[item.id].detail
          ? current[item.id]
          : { loading: true };
      }
      return next;
    });

    const loadDownstream = async () => {
      const results = await Promise.all(fetchableItems.map(async (item) => {
        try {
          const downstreamTaskId = item.downstream_task_id!;
          if (item.stage_name === 'firmware_unpack') {
            const data = await executionApi.firmwareUnpacker.getTask(downstreamTaskId);
            return [item.id, { loading: false, detail: { kind: 'firmware_unpack', data } satisfies DownstreamTaskDetail }] as const;
          }
          if (item.stage_name === 'system_analysis') {
            const data = await executionApi.appSystemAnalyse.getTask(downstreamTaskId);
            return [item.id, { loading: false, detail: { kind: 'system_analysis', data } satisfies DownstreamTaskDetail }] as const;
          }
          if (item.stage_name === 'binary_to_source') {
            const data = await executionApi.binaryToSource.getTask(projectId, downstreamTaskId);
            return [item.id, { loading: false, detail: { kind: 'binary_to_source', data } satisfies DownstreamTaskDetail }] as const;
          }
          if (item.stage_name === 'entry_analysis') {
            const data = await executionApi.appEntryAnalyse.getTask(downstreamTaskId);
            return [item.id, { loading: false, detail: { kind: 'entry_analysis', data } satisfies DownstreamTaskDetail }] as const;
          }
          if (item.stage_name === 'dataflow_analysis') {
            const data = await executionApi.appDataflowAnalyse.getTask(downstreamTaskId);
            return [item.id, { loading: false, detail: { kind: 'dataflow_analysis', data } satisfies DownstreamTaskDetail }] as const;
          }
          if (item.stage_name === 'vuln_scan') {
            const data = await executionApi.dataflowVulnScanner.getTask(downstreamTaskId);
            return [item.id, { loading: false, detail: { kind: 'vuln_scan', data } satisfies DownstreamTaskDetail }] as const;
          }
          return [item.id, { loading: false, error: '当前阶段未配置下游详情加载器' }] as const;
        } catch (fetchError: any) {
          return [item.id, { loading: false, error: fetchError?.message || '加载下游任务详情失败' }] as const;
        }
      }));

      if (cancelled) return;
      setDownstreamByItemId(Object.fromEntries(results));
    };

    void loadDownstream();
    return () => {
      cancelled = true;
    };
  }, [activeTab, detail, projectId, selectedNodeKind, selectedStage]);

  useEffect(() => {
    const node = stageFlowRef.current;
    if (!node) return;

    const updateLayout = () => {
      const width = node.clientWidth;
      if (!width) return;
      if (width < STAGE_FLOW_VERTICAL_BREAKPOINT) {
        setStageFlowLayout({
          mode: 'vertical',
          cardWidth: Math.max(0, width),
          connectorWidth: 32,
        });
        return;
      }
      setStageFlowLayout({
        mode: 'horizontal',
        cardWidth: BUSINESS_STAGE_CARD_WIDTH,
        connectorWidth: STAGE_CONNECTOR_WIDTH,
      });
    };

    updateLayout();
    const observer = new ResizeObserver(() => updateLayout());
    observer.observe(node);
    return () => observer.disconnect();
  }, [activeTab, stageSequence]);

  const runAction = async (action: 'cancel' | 'retry' | 'continue' | 'delete') => {
    if (!projectId || !taskId) return;
    if (action === 'delete') {
      const confirmed = await showConfirm({
        title: '删除任务',
        message: '删除会先取消并删除所有下游阶段任务，然后删除当前任务记录并清空任务目录。删除后不可恢复，是否继续？',
        confirmText: '确认删除',
        cancelText: '取消',
        danger: true,
      });
      if (!confirmed) return;
    }
    if (action === 'continue') {
      const confirmed = await showConfirm({
        title: '继续任务',
        message: '将从当前连续成功阶段的下一个阶段开始继续推进。该阶段及后续阶段的旧编排记录和结果摘要会被清空并重新创建，前序连续成功阶段会保留。是否继续？',
        confirmText: '确认继续',
        cancelText: '取消',
      });
      if (!confirmed) return;
    }
    if (action === 'retry') {
      const confirmed = await showConfirm({
        title: '从头重试总任务',
        message: '总任务重试会清空当前任务所有阶段的编排记录和结果摘要，并从第一阶段重新开始。该操作不同于“继续任务”，是否确认从头重试？',
        confirmText: '确认从头重试',
        cancelText: '取消',
        danger: true,
      });
      if (!confirmed) return;
    }
    setActionLoading(action);
    try {
      if (action === 'cancel') await executionApi.binarySecurity.cancelTask(projectId, taskId);
      if (action === 'delete') {
        await executionApi.binarySecurity.deleteTask(projectId, taskId);
        onBack();
        return;
      }
      if (action === 'retry') await executionApi.binarySecurity.retryTask(projectId, taskId);
      if (action === 'continue') await executionApi.binarySecurity.continueTask(projectId, taskId);
      await refreshActiveTab();
    } catch (e: any) {
      setError(e?.message || `${action} 失败`);
    } finally {
      setActionLoading('');
    }
  };

  const retryStage = async (stageName: string) => {
    if (!projectId || !taskId || !detail) return;
    const summary = detail.stage_summaries.find((item) => item.stage_name === stageName);
    if (!summary || !summary.retry_supported) {
      return;
    }
    const confirmed = await showConfirm({
      title: '重试阶段',
      message: `将重试阶段“${STAGE_LABELS[stageName] || stageName}”的全部子任务。阶段重试只影响当前阶段，不会清空、重跑或标记后续阶段。是否继续？`,
      confirmText: '确认重试',
      cancelText: '取消',
    });
    if (!confirmed) return;
    setActionLoading(`stage:${stageName}`);
    try {
      await executionApi.binarySecurity.retryStage(projectId, taskId, stageName);
      await refreshActiveTab();
    } catch (e: any) {
      setError(e?.message || '阶段重试失败');
    } finally {
      setActionLoading('');
    }
  };

  const syncDownstreamStatus = async (options?: { stageName?: string; itemId?: string; force?: boolean }) => {
    if (!projectId || !taskId) return;
    const confirmed = await showConfirm({
      title: '同步下游状态',
      message: options?.itemId
        ? '将查询该阶段子任务在对应微服务中的真实状态，并刷新当前编排记录。该操作不会启动、取消、删除或重试任何任务，是否继续？'
        : options?.stageName
          ? `将同步阶段“${STAGE_LABELS[options.stageName] || options.stageName}”下所有子任务的真实状态。该操作不会触发执行动作，是否继续？`
          : '将同步当前任务所有已创建下游子任务的真实状态。该操作不会启动、取消、删除或重试任何任务，是否继续？',
      confirmText: '确认同步',
      cancelText: '取消',
    });
    if (!confirmed) return;
    const loadingKey = options?.itemId ? `sync-item:${options.itemId}` : options?.stageName ? `sync-stage:${options.stageName}` : 'sync-downstream';
    setActionLoading(loadingKey);
    setError(null);
    try {
      await executionApi.binarySecurity.syncDownstreamStatus(projectId, taskId, {
        stage_name: options?.stageName,
        item_id: options?.itemId,
        force: options?.force,
      });
      await refreshActiveTab();
    } catch (e: any) {
      setError(e?.message || '同步下游状态失败');
    } finally {
      setActionLoading('');
    }
  };

  const confirmModuleSelection = async () => {
    if (!projectId || !taskId) return;
    if (selectedModuleKeys.length === 0) {
      setError('至少选择 1 个模块');
      return;
    }
    setActionLoading('confirm-modules');
    setError(null);
    try {
      await executionApi.binarySecurity.confirmModuleSelection(projectId, taskId, selectedModuleKeys);
      await refreshActiveTab();
    } catch (e: any) {
      setError(e?.message || '确认模块失败');
    } finally {
      setActionLoading('');
    }
  };

  const stageDisplayNodes = useMemo(() => {
    return ((detail?.overview_nodes || []) as BinarySecurityOverviewNode[]).map((node) => ({
      ...node,
      id: node.node_id,
      kind: node.node_type === 'archive' ? 'archive' as const : 'business' as const,
      label: node.title,
      retryable: node.retry_supported,
      stale: staleStages.has(node.stage_name),
    }));
  }, [detail?.overview_nodes, staleStages]);

  const selectedArchiveNode = useMemo(
    () => stageDisplayNodes.find((node) => node.node_type === 'archive' && node.stage_name === selectedStage) || null,
    [selectedStage, stageDisplayNodes],
  );
  const selectedBusinessStageNode = useMemo(
    () => stageDisplayNodes.find((node) => node.kind === 'business' && node.stage_name === selectedStage) || null,
    [selectedStage, stageDisplayNodes],
  );
  const selectedArchiveJobs = useMemo(() => {
    if (!selectedArchiveNode || selectedArchiveNode.node_type !== 'archive') return [] as ArchiveJob[];
    const detailPayload = selectedArchiveNode.detail as BinarySecurityOverviewNode['detail'] & { jobs?: ArchiveJob[] };
    return detailPayload.jobs || [];
  }, [selectedArchiveNode]);
  const requiresModuleConfirmation = detail?.status === 'pending_module_confirmation' && Boolean(moduleSelection?.requires_confirmation);

  const filteredStageItems = useMemo(() => {
    if (!detail) return [];
    return detail.stage_items.filter((item) => item.stage_name === selectedStage);
  }, [detail, selectedStage]);

  const timelineItems = useMemo(() => {
    return timeline.map((event, index) => ({
      ...event,
      _key: event.id || `${event.event_type || 'event'}-${event.created_at || index}-${index}`,
      _index: index + 1,
      _eventLabel: formatTimelineEventTypeLabel(event.event_type),
      _sourceLabel: event.item_key || event.item_id || '-',
    }));
  }, [timeline]);
  const timelineTotalPages = useMemo(
    () => Math.max(1, Math.ceil(timelineItems.length / Math.max(1, timelinePageSize))),
    [timelineItems.length, timelinePageSize],
  );
  const normalizedTimelinePage = Math.min(Math.max(1, timelinePage), timelineTotalPages);
  const pagedTimelineItems = useMemo(() => {
    const start = (normalizedTimelinePage - 1) * Math.max(1, timelinePageSize);
    return timelineItems.slice(start, start + Math.max(1, timelinePageSize));
  }, [normalizedTimelinePage, timelineItems, timelinePageSize]);
  const timelineRangeStart = timelineItems.length === 0 ? 0 : (normalizedTimelinePage - 1) * Math.max(1, timelinePageSize) + 1;
  const timelineRangeEnd = timelineItems.length === 0 ? 0 : Math.min(normalizedTimelinePage * Math.max(1, timelinePageSize), timelineItems.length);

  useEffect(() => {
    setTimelinePage(1);
    setExpandedEventKey(null);
  }, [timelinePageSize, taskId]);

  useEffect(() => {
    if (timelinePage > timelineTotalPages) {
      setTimelinePage(timelineTotalPages);
    }
  }, [timelinePage, timelineTotalPages]);

  const openDownstreamTaskDetail = (item: BinarySecurityTaskDetail['stage_items'][number]) => {
    const downstreamTaskId = item.downstream_task_id?.trim();
    const detailSupport = downstreamDetailSupport(item.stage_name, downstreamTaskId);
    if (!downstreamTaskId || !detailSupport.supported) return;
    saveBinarySecurityReturnContext({
      view: taskType === 'source' ? 'source-security-detail' : 'binary-security-detail',
      taskId,
      taskType,
    });
    if (item.stage_name === 'firmware_unpack') {
      sessionStorage.setItem('secflow:firmwareUnpackerTaskId', downstreamTaskId);
      window.dispatchEvent(new CustomEvent('secflow-navigate-view', { detail: { view: 'pentest-exec-firmware-unpacker' } }));
      return;
    }
    if (item.stage_name === 'system_analysis') {
      window.dispatchEvent(new CustomEvent('secflow-navigate-view', { detail: { view: 'system-analysis-detail', systemAnalysisTaskId: downstreamTaskId } }));
      return;
    }
    if (item.stage_name === 'binary_to_source') {
      window.dispatchEvent(new CustomEvent('secflow-navigate-view', { detail: { view: 'pentest-exec-b2s-detail', b2sTaskId: downstreamTaskId } }));
      return;
    }
    if (item.stage_name === 'entry_analysis') {
      window.dispatchEvent(new CustomEvent('secflow-navigate-view', { detail: { view: 'entry-analysis-detail', entryAnalysisTaskId: downstreamTaskId } }));
      return;
    }
    if (item.stage_name === 'dataflow_analysis') {
      window.dispatchEvent(new CustomEvent('secflow-navigate-view', { detail: { view: 'dataflow-analysis-detail', dataflowAnalysisTaskId: downstreamTaskId } }));
      return;
    }
    sessionStorage.setItem('secflow:dataflowVulnTaskId', downstreamTaskId);
    navigate(`/pentest-exec-dataflow-vuln-task-detail/${encodeURIComponent(downstreamTaskId)}`);
  };

  const renderDownstreamDetail = (item: BinarySecurityTaskDetail['stage_items'][number]) => {
    const state = downstreamByItemId[item.id];
    if (item.downstream_task_id && state?.loading) {
      return <div className="rounded-xl bg-white px-3 py-3 text-xs text-slate-500">正在加载下游任务详情...</div>;
    }
    if (state?.error) {
      return <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs font-semibold text-rose-700">{state.error}</div>;
    }
    if (!state?.detail) {
      return <div className="rounded-xl bg-white px-3 py-3 text-xs text-slate-500">当前子任务没有可用的下游详情。</div>;
    }

    const detailState = state.detail;
    if (detailState.kind === 'firmware_unpack') {
      const task = detailState.data;
      return (
        <div className="grid grid-cols-1 gap-3 text-xs text-slate-600 xl:grid-cols-2">
          <div className={detailPanelTone}>固件路径：{task.firmware_path || '-'}</div>
          <div className={detailPanelTone}>输出目录：{task.output_path || '-'}</div>
          <div className={detailPanelTone}>结果状态：{task.result_status || '-'}</div>
          <div className={detailPanelTone}>结果信息：{task.result_message || task.error_message || '-'}</div>
        </div>
      );
    }
    if (detailState.kind === 'system_analysis') {
      const task = detailState.data;
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 text-xs text-slate-600 xl:grid-cols-2">
            <div className={detailPanelTone}>输入目录：{task.input_path || '-'}</div>
            <div className={detailPanelTone}>输出目录：{task.output_path || '-'}</div>
          </div>
          <DownstreamSummaryGrid payload={task.result_json} preferredKeys={RESULT_SUMMARY_KEYS} />
        </div>
      );
    }
    if (detailState.kind === 'binary_to_source') {
      const task = detailState.data;
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 text-xs text-slate-600 xl:grid-cols-2">
            <div className={detailPanelTone}>总项目数：{task.total_items}</div>
            <div className={detailPanelTone}>成功/失败：{task.success_items} / {task.failed_items}</div>
          </div>
          <div className="space-y-2">
            {task.items.slice(0, 4).map((taskItem) => (
              <div key={taskItem.id} className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs text-slate-700">
                <div className="font-bold text-slate-900">{taskItem.elf_path}</div>
                <div className="mt-2 grid grid-cols-1 gap-2 xl:grid-cols-3">
                  <div className="rounded-lg bg-slate-50 px-2.5 py-2">阶段：{taskItem.phase_label || taskItem.phase || '-'}</div>
                  <div className="rounded-lg bg-slate-50 px-2.5 py-2">状态：{taskItem.status}</div>
                  <div className="rounded-lg bg-slate-50 px-2.5 py-2">输出：{taskItem.output_dir}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    if (detailState.kind === 'entry_analysis') {
      const task = detailState.data;
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 text-xs text-slate-600 xl:grid-cols-2">
            <div className={detailPanelTone}>输入目录：{task.input_path || '-'}</div>
            <div className={detailPanelTone}>输出目录：{task.output_path || '-'}</div>
          </div>
          <DownstreamSummaryGrid payload={task.result_json} preferredKeys={RESULT_SUMMARY_KEYS} />
        </div>
      );
    }
    if (detailState.kind === 'dataflow_analysis') {
      const task = detailState.data;
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 text-xs text-slate-600 xl:grid-cols-2">
            <div className={detailPanelTone}>输入目录：{task.input_path || '-'}</div>
            <div className={detailPanelTone}>输出目录：{task.output_path || '-'}</div>
          </div>
          <DownstreamSummaryGrid payload={task.result_json} preferredKeys={RESULT_SUMMARY_KEYS} />
        </div>
      );
    }
    const task = detailState.data;
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 text-xs text-slate-600 xl:grid-cols-2">
          <div className={detailPanelTone}>标题：{task.title || '-'}</div>
          <div className={detailPanelTone}>最近执行：{task.latest_execution_id || '-'}</div>
        </div>
        <div className="grid grid-cols-1 gap-3 text-xs text-slate-600 xl:grid-cols-2">
          <div className={detailPanelTone}>重试次数：{task.retry_count} / {task.max_retry_count}</div>
          <div className={detailPanelTone}>执行尝试数：{task.attempts?.length || 0}</div>
        </div>
        <DownstreamSummaryGrid payload={task.task_metadata} preferredKeys={VULN_METADATA_KEYS} emptyText="当前漏洞扫描任务尚未记录元数据摘要。" />
      </div>
    );
  };

  if (!taskId) {
    return <div className="px-8 pb-10 pt-8 text-sm text-slate-500">未指定任务。</div>;
  }

  const tabs: Array<{ key: DetailTab; label: string; hint: string }> = [
    { key: 'overview', label: '总览', hint: '任务基础信息、模块确认与阶段任务' },
    { key: 'timeline', label: '事件时间线', hint: '编排事件记录' },
    { key: 'artifacts', label: '产物文件', hint: '归档输出文件' },
  ];

  return (
    <div className="px-8 pb-10 pt-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
          <ArrowLeft size={16} />
          返回任务列表
        </button>
        <div className="flex gap-3">
          <button type="button" onClick={() => void refreshActiveTab()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
            <RefreshCw size={16} />
            刷新
          </button>
          <button
            type="button"
            onClick={() => void syncDownstreamStatus()}
            disabled={actionLoading !== ''}
            className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-bold text-sky-700 disabled:opacity-60"
          >
            <RefreshCw size={16} />
            同步下游状态
          </button>
          <button type="button" onClick={() => void runAction('cancel')} disabled={actionLoading !== '' || !canActOnTask} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700 disabled:opacity-60">取消</button>
          <button
            type="button"
            title={taskRetrySupported ? undefined : taskRetryReason}
            onClick={() => void runAction('retry')}
            disabled={actionLoading !== '' || !taskRetrySupported}
            className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-60"
          >
            从头重试
          </button>
          <button
            type="button"
            title={taskContinueSupported ? undefined : taskContinueReason}
            onClick={() => void runAction('continue')}
            disabled={actionLoading !== '' || !taskContinueSupported}
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 disabled:opacity-60"
          >
            {actionLoading === 'continue' ? '继续中...' : '继续'}
          </button>
          <button type="button" onClick={() => void runAction('delete')} disabled={actionLoading !== '' || !canActOnTask} className="rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-sm font-bold text-rose-700 disabled:opacity-60">删除</button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}

      {loading && !detail ? (
        <div className="text-sm text-slate-500">加载中...</div>
      ) : detail ? (
        <>
          <section className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.85fr)] xl:items-start">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-600">Binary Security Detail</p>
                <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900">{detail.name}</h1>
                <div className="mt-2 break-all font-mono text-xs text-slate-400">{detail.id}</div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusTone(detail.status)}`}>{detail.status}</span>
                  <span className="text-sm text-slate-500">当前阶段：{STAGE_LABELS[detail.current_stage || ''] || detail.current_stage || '-'}</span>
                </div>
                <div className="mt-4 grid gap-2">
                  <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{isSourceTask ? '源码目录' : '输入目录'}</div>
                    <div className="mt-1 break-all font-mono text-xs text-slate-700">{detail.firmware_path}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">产物目录</div>
                    <div className="mt-1 break-all font-mono text-xs text-slate-700">{detail.output_root}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">模块策略</div>
                    <div className="mt-1 text-xs text-slate-700">
                      {detail.module_selection_mode === 'manual_confirm' ? '系统分析后人工确认' : '按风险自动推进'}
                      {' · '}
                      风险等级：{(detail.selected_risk_levels || []).join(' / ') || '-'}
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                  <div className="text-slate-400">创建时间</div>
                  <div className="mt-1 font-bold text-slate-900">{fmt(detail.created_at)}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                  <div className="text-slate-400">完成时间</div>
                  <div className="mt-1 font-bold text-slate-900">{fmt(detail.finished_at)}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                  <div className="text-slate-400">{isSourceTask ? '源码文件数' : '固件数量'}</div>
                  <div className="mt-1 text-lg font-black text-slate-900">{detail.firmware_item_count}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                  <div className="text-slate-400">{isSourceTask ? '入口数量' : '已解包/失败'}</div>
                  <div className="mt-1 text-lg font-black text-slate-900">{isSourceTask ? detail.entry_count : `${detail.unpacked_firmware_count} / ${detail.failed_firmware_count}`}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                  <div className="text-slate-400">已选模块</div>
                  <div className="mt-1 text-lg font-black text-slate-900">{detail.selected_module_count}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                  <div className="text-slate-400">高危模块</div>
                  <div className="mt-1 text-lg font-black text-slate-900">{detail.high_risk_module_count}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                  <div className="text-slate-400">漏洞结果</div>
                  <div className="mt-1 text-lg font-black text-slate-900">{detail.vuln_result_count}</div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[1.5rem] border border-slate-200 bg-white p-2 shadow-sm">
            <div className="grid gap-2 md:grid-cols-3">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-[1.2rem] px-4 py-3 text-left transition ${
                    activeTab === tab.key
                      ? 'bg-slate-900 text-white shadow-lg shadow-slate-200'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <div className="text-sm font-black">{tab.label}</div>
                  <div className={`mt-1 text-[11px] ${activeTab === tab.key ? 'text-slate-300' : 'text-slate-400'}`}>{tab.hint}</div>
                </button>
              ))}
            </div>
          </section>

          {activeTab === 'overview' ? (
            <>
          {requiresModuleConfirmation ? (
            <section className="rounded-[2rem] border border-amber-200 bg-amber-50/70 p-6 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-900">模块确认</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    系统分析已完成，当前任务处于人工确认模式。请从候选模块中勾选需要继续分析的模块，然后继续推进后续阶段。
                  </p>
                  <div className="mt-2 text-xs text-slate-500">
                    候选模块 {moduleSelection?.candidate_modules?.length || 0} 个 · 风险等级 {(moduleSelection?.risk_levels || []).join(' / ') || '-'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void confirmModuleSelection()}
                  disabled={actionLoading !== '' || selectedModuleKeys.length === 0}
                  className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                >
                  {actionLoading === 'confirm-modules' ? '确认中...' : '确认并继续'}
                </button>
              </div>
              <div className="mt-5 grid gap-3">
                {(moduleSelection?.candidate_modules || []).map((module) => {
                  const moduleKey = String(module.module_key || '');
                  const checked = selectedModuleKeys.includes(moduleKey);
                  return (
                    <label key={moduleKey} className="flex items-start gap-4 rounded-2xl border border-amber-200 bg-white px-4 py-4">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          setSelectedModuleKeys((current) => {
                            if (event.target.checked) return current.includes(moduleKey) ? current : current.concat(moduleKey);
                            return current.filter((item) => item !== moduleKey);
                          });
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-sm font-black text-slate-900">{module.module_name || moduleKey}</div>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                            风险：{module.risk_level || '未知'}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                            分数：{module.risk_score ?? 0}
                          </span>
                        </div>
                        <div className="mt-2 break-all font-mono text-xs text-slate-500">{module.module_report || module.module_dir || '-'}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </section>
          ) : moduleSelectionLoading ? (
            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">正在加载模块确认信息...</section>
          ) : (
            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black text-slate-900">任务总览</h2>
              <p className="mt-2 text-sm text-slate-500">总览包含任务主详情、阶段流转和下游子任务；事件记录和产物文件会在打开对应 Tab 后再请求后端。</p>
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <div className="text-xs font-bold text-slate-400">任务类型</div>
                  <div className="mt-1 font-black text-slate-900">{isSourceTask ? '源码扫描' : '二进制类扫描'}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <div className="text-xs font-bold text-slate-400">阶段数</div>
                  <div className="mt-1 font-black text-slate-900">{stageSequence.length}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <div className="text-xs font-bold text-slate-400">当前状态</div>
                  <div className="mt-1 font-black text-slate-900">{detail.status}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <div className="text-xs font-bold text-slate-400">队列位置</div>
                  <div className="mt-1 font-black text-slate-900">{detail.is_queued ? `第 ${detail.queue_position || '-'} 位` : '未排队'}</div>
                </div>
              </div>
            </section>
          )}
            </>
          ) : null}

          {activeTab === 'overview' ? (
            <>
          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900">阶段概览</h2>
                <p className="mt-1 text-sm text-slate-500">点击阶段筛选下方子任务；阶段重试会重跑当前阶段全部子任务，不影响其他阶段。</p>
              </div>
            </div>
            {!detail.task_retry_supported && detail.task_retry_reason ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                总任务从头重试不可用：{detail.task_retry_reason}
              </div>
            ) : null}

            <div ref={stageFlowRef} className="mt-6 overflow-x-auto">
              <div className={stageFlowLayout.mode === 'horizontal' ? 'inline-flex items-center justify-start pb-2 pr-2' : 'flex flex-col items-stretch'}>
                {stageDisplayNodes.map((stage, index) => (
                  <React.Fragment key={stage.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      title={stage.kind === 'archive' ? `产物归档 · ${STAGE_LABELS[stage.stage_name] || stage.stage_name} · ${archiveStatusLabel(stage.status)}` : undefined}
                      aria-label={stage.kind === 'archive' ? `产物归档 ${STAGE_LABELS[stage.stage_name] || stage.stage_name} ${archiveStatusLabel(stage.status)}` : undefined}
                      onClick={() => {
                        setSelectedStage(stage.stage_name);
                        setSelectedNodeKind(stage.kind);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedStage(stage.stage_name);
                          setSelectedNodeKind(stage.kind);
                        }
                      }}
                      style={stageFlowLayout.mode === 'horizontal'
                        ? { width: `${stage.kind === 'archive' ? ARCHIVE_STAGE_CARD_WIDTH : stageFlowLayout.cardWidth}px` }
                        : undefined}
                      className={`rounded-[1.75rem] border text-left transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none ${
                        stage.kind === 'archive'
                          ? stageFlowLayout.mode === 'horizontal'
                            ? 'flex min-h-[172px] shrink-0 flex-col justify-between p-4'
                            : 'mx-auto flex min-h-[172px] w-full max-w-[260px] flex-col justify-between p-4'
                          : stageFlowLayout.mode === 'horizontal'
                            ? 'shrink-0 p-4'
                            : 'w-full p-4'
                      } ${stageNodeTone(stage.status, selectedStage === stage.stage_name && selectedNodeKind === stage.kind)}`}
                    >
                      {stage.kind === 'archive' ? (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[10px] font-black uppercase tracking-[0.18em] opacity-60">Archive</div>
                            <div className="h-2.5 w-2.5 rounded-full border border-current bg-current/15" />
                          </div>
                          <div className="space-y-1">
                            <div className="text-sm font-black leading-none">产物归档</div>
                            <div className="text-[11px] font-semibold leading-tight opacity-75">{STAGE_LABELS[stage.stage_name] || stage.stage_name}</div>
                          </div>
                          <div className="mt-3 space-y-1 rounded-2xl border border-current/15 bg-white/55 px-3 py-2 text-[10px] font-semibold leading-4">
                            <div className="flex justify-between gap-2">
                              <span className="opacity-60">开始</span>
                              <span className="text-right font-mono">{fmt(stage.started_at)}</span>
                            </div>
                            <div className="flex justify-between gap-2">
                              <span className="opacity-60">结束</span>
                              <span className="text-right font-mono">{fmt(stage.finished_at)}</span>
                            </div>
                            <div className="flex justify-between gap-2">
                              <span className="opacity-60">耗时</span>
                              <span className="text-right font-black">{durationLabel(stage.started_at, stage.finished_at)}</span>
                            </div>
                          </div>
                          <div className="rounded-full border border-current/20 bg-white/60 px-2 py-1 text-center text-[10px] font-black leading-none">
                            {stage.status_label || archiveStatusLabel(stage.status)}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-[11px] font-black uppercase tracking-[0.24em] opacity-60">
                                {`Stage ${stage.sequence_no}`}
                              </div>
                              <div className="mt-2 text-base font-black">{stage.label}</div>
                            </div>
                            <div className="h-3 w-3 rounded-full border border-current bg-current/15" />
                          </div>
                          <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-semibold">
                            <div>总数 {(stage.detail as any)?.total_items ?? 0}</div>
                            <div>成功 {(stage.detail as any)?.success_items ?? 0}</div>
                            <div>失败 {(stage.detail as any)?.failed_items ?? 0}</div>
                            <div>运行 {(stage.detail as any)?.running_items ?? 0}</div>
                          </div>
                          <div className="mt-3 grid gap-1 rounded-2xl border border-current/15 bg-white/55 px-3 py-2 text-[10px] font-semibold leading-4">
                            <div className="flex justify-between gap-2">
                              <span className="opacity-60">开始</span>
                              <span className="text-right font-mono">{fmt(stage.started_at)}</span>
                            </div>
                            <div className="flex justify-between gap-2">
                              <span className="opacity-60">结束</span>
                              <span className="text-right font-mono">{fmt(stage.finished_at)}</span>
                            </div>
                            <div className="flex justify-between gap-2">
                              <span className="opacity-60">耗时</span>
                              <span className="text-right font-black">{durationLabel(stage.started_at, stage.finished_at)}</span>
                            </div>
                          </div>
                          <div className="mt-3 rounded-full border border-current/20 bg-white/60 px-3 py-1 text-center text-[11px] font-black">
                            {stage.status_label || stage.status}
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-2">
                            {staleStages.has(stage.stage_name) ? (
                              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-700">
                                结果已过期
                              </span>
                            ) : (
                              <span className="text-[11px] font-semibold opacity-70">点击查看子任务</span>
                            )}
                            <button
                              type="button"
                              title={shouldShowStageRetryReason(stage.status, stage.retryable, stage.retry_reason) ? stage.retry_reason || '当前阶段不可安全重试' : undefined}
                              className={`rounded-full px-2.5 py-1 text-[11px] font-black ${
                                stage.retryable
                                  ? 'bg-slate-900 text-white'
                                  : 'bg-slate-200 text-slate-500'
                              }`}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (!stage.retryable || actionLoading !== '') return;
                                void retryStage(stage.stage_name);
                              }}
                              disabled={!stage.retryable || actionLoading !== ''}
                            >
                              {actionLoading === `stage:${stage.stage_name}` ? '重试中' : '重试'}
                            </button>
                          </div>
                          {shouldShowStageRetryReason(stage.status, stage.retryable, stage.retry_reason) ? (
                            <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
                              {stage.retry_reason}
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                    {index < stageDisplayNodes.length - 1 ? (
                      stageFlowLayout.mode === 'horizontal' ? (
                        <div className={`shrink-0 ${stageConnectorTone(stage.status)}`} style={{ width: `${stageFlowLayout.connectorWidth}px` }}>
                          <svg viewBox="0 0 100 24" className="block h-6 w-full overflow-visible" fill="none" aria-hidden="true">
                            <path d="M4 12H86" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                            <path d="M72 5L88 12L72 19" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                      ) : (
                        <div className={`flex h-12 items-center justify-center ${stageConnectorTone(stage.status)}`}>
                          <svg viewBox="0 0 24 64" className="block h-12 w-6 overflow-visible" fill="none" aria-hidden="true">
                            <path d="M12 4V48" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                            <path d="M5 36L12 52L19 36" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                      )
                    ) : null}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900">{selectedNodeKind === 'archive' ? '产物归档任务' : '阶段子任务'}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  当前筛选：
                  <span className="ml-2 font-bold text-slate-900">{STAGE_LABELS[selectedStage] || selectedStage}</span>
                  {selectedNodeKind === 'archive' ? <span className="ml-2 text-slate-400">/ 产物归档</span> : null}
                </p>
              </div>
            </div>

            {selectedNodeKind === 'business' && selectedBusinessStageNode ? (
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-bold text-slate-400">阶段状态</div>
                  <div className="mt-1">
                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${statusTone(selectedBusinessStageNode.status)}`}>
                      {selectedBusinessStageNode.status_label || selectedBusinessStageNode.status}
                    </span>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-bold text-slate-400">开始时间</div>
                  <div className="mt-1 text-sm font-black text-slate-900">{fmt(selectedBusinessStageNode.started_at)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-bold text-slate-400">结束时间</div>
                  <div className="mt-1 text-sm font-black text-slate-900">{fmt(selectedBusinessStageNode.finished_at)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-bold text-slate-400">阶段耗时</div>
                  <div className="mt-1 text-sm font-black text-slate-900">{durationLabel(selectedBusinessStageNode.started_at, selectedBusinessStageNode.finished_at)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-bold text-slate-400">子任务</div>
                  <div className="mt-1 text-sm font-black text-slate-900">
                    {(selectedBusinessStageNode.detail as any)?.success_items ?? 0} / {(selectedBusinessStageNode.detail as any)?.total_items ?? 0} 成功
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-5 space-y-3">
              {selectedNodeKind === 'archive' ? (
                <>
                  {selectedArchiveNode ? (
                    <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="text-xs font-bold text-slate-400">归档任务</div>
                        <div className="mt-1 text-lg font-black text-slate-900">{(selectedArchiveNode.detail as any)?.job_count ?? 0}</div>
                      </div>
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                        <div className="text-xs font-bold text-emerald-500">完成</div>
                        <div className="mt-1 text-lg font-black text-emerald-800">{(selectedArchiveNode.detail as any)?.success_count ?? 0}</div>
                      </div>
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                        <div className="text-xs font-bold text-rose-500">失败</div>
                        <div className="mt-1 text-lg font-black text-rose-800">{(selectedArchiveNode.detail as any)?.failed_count ?? 0}</div>
                      </div>
                      <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
                        <div className="text-xs font-bold text-blue-500">总耗时</div>
                        <div className="mt-1 text-lg font-black text-blue-800">{durationLabel((selectedArchiveNode.detail as any)?.first_created_at, (selectedArchiveNode.detail as any)?.last_updated_at)}</div>
                      </div>
                    </div>
                  ) : null}
                  {selectedArchiveJobs.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-400">
                      当前阶段暂无归档记录，等待下游阶段产物归档。
                    </div>
                  ) : selectedArchiveJobs.map((job) => (
                    <div key={job.id} className={`rounded-[1.5rem] border p-5 ${stageNodeTone(job.archive_status === 'archived' || job.archive_status === 'applying' ? 'running' : job.archive_status, false)}`}>
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusTone(job.archive_status === 'archived' || job.archive_status === 'applying' ? 'running' : job.archive_status)}`}>
                              {archiveStatusLabel(job.archive_status)}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500">
                              尝试 {job.attempts || 0}
                            </span>
                          </div>
                          <div className="mt-3 break-all text-base font-black text-slate-900">{job.item_key || job.item_id}</div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs text-slate-600">
                          {fmt(job.created_at)} {'->'} {fmt(job.completed_at || job.updated_at)}
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-1 gap-3 text-xs text-slate-600 xl:grid-cols-2">
                        <div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
                          <span className="text-slate-400">下游服务</span>
                          <div className="mt-1 font-mono text-slate-800">{job.downstream_service || '-'}</div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
                          <span className="text-slate-400">下游任务 ID</span>
                          <div className="mt-1 break-all font-mono text-slate-800">{job.downstream_task_id || '-'}</div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 xl:col-span-2">
                          <span className="text-slate-400">归档路径</span>
                          <div className="mt-1 break-all font-mono text-slate-800">{job.archive_root || '-'}</div>
                        </div>
                      </div>
                      {job.copy_stats ? (
                        <div className="mt-3 rounded-xl border border-slate-200 bg-white/85 p-3">
                          <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 xl:grid-cols-4">
                            <div>
                              <div className="text-slate-400">文件</div>
                              <div className="mt-1 font-black text-slate-900">{job.copy_stats.copied_files || 0}</div>
                            </div>
                            <div>
                              <div className="text-slate-400">目录</div>
                              <div className="mt-1 font-black text-slate-900">{job.copy_stats.copied_dirs || 0}</div>
                            </div>
                            <div>
                              <div className="text-slate-400">符号链接</div>
                              <div className="mt-1 font-black text-slate-900">{job.copy_stats.copied_symlinks || 0}</div>
                            </div>
                            <div>
                              <div className="text-slate-400">跳过错误</div>
                              <div className={`mt-1 font-black ${(job.copy_stats.skipped_errors || 0) > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
                                {job.copy_stats.skipped_errors || 0}
                              </div>
                            </div>
                          </div>
                          {(job.copy_stats.errors || []).length > 0 ? (
                            <div className="mt-3 space-y-2">
                              {(job.copy_stats.errors || []).slice(0, 5).map((error, index) => (
                                <div key={`${job.id}-copy-error-${index}`} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                  <div className="break-all font-mono">{error.source || '-'}</div>
                                  <div className="mt-1 break-all text-amber-700">{error.error || '-'}</div>
                                </div>
                              ))}
                              {job.copy_stats.error_truncated || (job.copy_stats.errors || []).length > 5 ? (
                                <div className="text-xs font-semibold text-amber-700">仅显示部分归档错误，完整明细请查看事件 payload。</div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {job.error_message ? (
                        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                          {job.error_message}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </>
              ) : (
                <>
              {staleStages.has(selectedStage) ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                  由于上游阶段 {STAGE_LABELS[detail.summary?.stale_from_stage || ''] || detail.summary?.stale_from_stage || '-'} 已重试，当前阶段结果基于旧上游产物。
                </div>
              ) : null}
              {filteredStageItems.length === 0 ? (
                <div className="text-sm text-slate-400">当前筛选下暂无子任务</div>
              ) : filteredStageItems.map((item) => {
                const detailSupport = downstreamDetailSupport(item.stage_name, item.downstream_task_id);
                return (
                <div
                  key={item.id}
                  role={detailSupport.supported ? 'button' : undefined}
                  tabIndex={detailSupport.supported ? 0 : undefined}
                  title={detailSupport.supported ? '打开子任务详情' : detailSupport.reason}
                  onClick={detailSupport.supported ? () => openDownstreamTaskDetail(item) : undefined}
                  onKeyDown={detailSupport.supported ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openDownstreamTaskDetail(item);
                    }
                  } : undefined}
                  className={`rounded-[1.5rem] border p-5 transition ${detailSupport.supported ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md focus:outline-none' : ''} ${stageItemTone(item.stage_name === selectedStage)}`}
                >
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                          {STAGE_LABELS[item.stage_name] || item.stage_name}
                        </span>
                        <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusTone(item.status)}`}>{item.status}</span>
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500">
                          重试 {item.retry_count || 0}
                        </span>
                      </div>
                      <div className="mt-3 break-all text-lg font-black text-slate-900">
                        {item.item_name || item.item_key}
                      </div>
                      <div className="mt-2 break-all font-mono text-xs text-slate-500">{item.item_key}</div>

                      <div className="mt-4 grid gap-3 text-xs text-slate-600 md:grid-cols-3">
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <span className="text-slate-400">开始时间</span>
                          <div className="mt-1 font-bold text-slate-800">{fmt(item.started_at)}</div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <span className="text-slate-400">结束时间</span>
                          <div className="mt-1 font-bold text-slate-800">{fmt(item.finished_at)}</div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <span className="text-slate-400">耗时</span>
                          <div className="mt-1 font-black text-slate-900">{durationLabel(item.started_at, item.finished_at)}</div>
                        </div>
                      </div>
                    </div>

                    <aside className="rounded-2xl border border-slate-200 bg-white/85 p-4">
                      <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">下游任务</div>
                      <div className="mt-3 space-y-3 text-xs text-slate-600">
                        <div>
                          <div className="text-slate-400">服务</div>
                          <div className="mt-1 break-all font-mono text-slate-800">{item.downstream_service || '-'}</div>
                        </div>
                        <div>
                          <div className="text-slate-400">任务 ID</div>
                          <div className="mt-1 break-all font-mono text-slate-800">{item.downstream_task_id || '-'}</div>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {item.downstream_task_id ? (
                          <button
                            type="button"
                            className="rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] font-black text-sky-700 disabled:opacity-60"
                            disabled={actionLoading !== ''}
                            onClick={(event) => {
                              event.stopPropagation();
                              void syncDownstreamStatus({ stageName: item.stage_name, itemId: item.id });
                            }}
                          >
                            同步状态
                          </button>
                        ) : null}
                        {detailSupport.supported ? (
                          <button
                            type="button"
                            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700"
                            onClick={(event) => {
                              event.stopPropagation();
                              openDownstreamTaskDetail(item);
                            }}
                          >
                            查看任务详情
                          </button>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-500"
                            title={detailSupport.reason}
                          >
                            <Info className="h-3.5 w-3.5" />
                            不支持查看任务详情
                          </span>
                        )}
                      </div>
                      {!detailSupport.supported ? (
                        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                          {detailSupport.reason}
                        </div>
                      ) : null}
                    </aside>

                    <div className="xl:col-span-2">
                      {item.error_message ? (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                          {item.error_message}
                        </div>
                      ) : null}
                      <div className={item.error_message ? 'mt-4' : ''}>
                        {renderDownstreamDetail(item)}
                      </div>
                    </div>
                  </div>
                </div>
                );
              })}
                </>
              )}
            </div>
          </section>
            </>
          ) : null}

          {activeTab === 'timeline' ? (
          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900">事件时间线</h2>
                <p className="mt-1 text-sm text-slate-500">按时间顺序展示最近 80 条编排事件</p>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">总事件数</div>
                  <div className="mt-1 text-lg font-black text-slate-900">{timeline.length}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">展示区间</div>
                  <div className="mt-1 text-sm font-bold text-slate-700">{pagedTimelineItems.length > 0 ? `${fmtTime(pagedTimelineItems[0].created_at)} -> ${fmtTime(pagedTimelineItems[pagedTimelineItems.length - 1].created_at)}` : '-'}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">分页</div>
                  <div className="mt-1 text-sm font-bold text-slate-700">
                    {timelineRangeStart}-{timelineRangeEnd} / {timelineItems.length}
                  </div>
                </div>
                <label className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500">
                  <span className="mr-2 uppercase tracking-[0.16em] text-slate-400">每页</span>
                  <select
                    value={timelinePageSize}
                    onChange={(event) => {
                      const next = Math.min(2000, Math.max(200, Number(event.target.value) || 200));
                      setTimelinePageSize(next);
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-bold text-slate-700 outline-none"
                  >
                    {[200, 500, 1000, 2000].map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => void clearTimeline()}
                  disabled={timelineClearing || timelineLoading || timeline.length === 0}
                  className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-black text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {timelineClearing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  清空时间线
                </button>
              </div>
            </div>

            <div className="mt-4">
              {timelineLoading ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
                  正在加载事件时间线...
                </div>
              ) : timelineItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-400">
                  暂无事件
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="min-w-[1080px] w-full divide-y divide-slate-100 text-left text-xs">
                      <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">
                        <tr>
                          <th className="w-14 px-3 py-2">#</th>
                          <th className="w-44 px-3 py-2">时间</th>
                          <th className="w-44 px-3 py-2">事件</th>
                          <th className="w-28 px-3 py-2">阶段</th>
                          <th className="w-24 px-3 py-2">级别</th>
                          <th className="px-3 py-2">摘要</th>
                          <th className="w-44 px-3 py-2">来源</th>
                          <th className="w-36 px-3 py-2 text-right">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {pagedTimelineItems.map((event) => {
                          const expanded = expandedEventKey === event._key;
                          return (
                            <React.Fragment key={event._key}>
                              <tr className="align-middle hover:bg-slate-50/80">
                                <td className="px-3 py-2 font-mono text-[11px] font-bold text-slate-400">#{event._index}</td>
                                <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] font-semibold text-slate-600">
                                  {fmt(event.created_at)}
                                </td>
                                <td className="px-3 py-2">
                                  <span className="inline-flex max-w-[160px] items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-black text-sky-700">
                                    <span className="truncate">{event._eventLabel}</span>
                                  </span>
                                </td>
                                <td className="px-3 py-2">
                                  {event.stage_name ? (
                                    <span className="inline-flex max-w-[110px] rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                                      <span className="truncate">{STAGE_LABELS[event.stage_name] || event.stage_name}</span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">-</span>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  <span className={`inline-flex max-w-[90px] rounded-full border px-2 py-0.5 text-[11px] font-bold ${timelineLevelTone(event.level)}`}>
                                    <span className="truncate">{formatTimelineLevelLabel(event.level)}</span>
                                  </span>
                                </td>
                                <td className="max-w-[360px] px-3 py-2">
                                  <div className="truncate font-bold text-slate-800" title={event.message || '系统事件'}>
                                    {event.message || '系统事件'}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-[11px] text-slate-500">
                                  <div className="truncate font-mono" title={event._sourceLabel}>
                                    {event._sourceLabel}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <div className="flex items-center justify-end gap-3">
                                    <button
                                      type="button"
                                      onClick={() => setExpandedEventKey(expanded ? null : event._key)}
                                      className="text-[11px] font-black text-slate-500 transition hover:text-slate-900"
                                    >
                                      {expanded ? '收起' : '查看'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void deleteTimelineEvent(event.id, event._key)}
                                      disabled={deletingEventId === event.id || timelineClearing}
                                      className="text-[11px] font-black text-rose-600 transition hover:text-rose-800 disabled:opacity-40"
                                    >
                                      {deletingEventId === event.id ? '删除中' : '删除'}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {expanded ? (
                                <tr className="bg-slate-50/60">
                                  <td colSpan={8} className="px-3 py-3">
                                    <TimelineDetailBlock payload={event.payload} />
                                  </td>
                                </tr>
                              ) : null}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {timelineItems.length > 0 ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-slate-500">
                    第 {normalizedTimelinePage} / {timelineTotalPages} 页
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setTimelinePage((current) => Math.max(1, current - 1))}
                      disabled={normalizedTimelinePage <= 1}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-40"
                    >
                      上一页
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimelinePage((current) => Math.min(timelineTotalPages, current + 1))}
                      disabled={normalizedTimelinePage >= timelineTotalPages}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-40"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
          ) : null}

          {activeTab === 'artifacts' ? (
          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-slate-900">产物文件</h2>
            <div className="mt-3 text-xs text-slate-500">工作目录：{artifacts?.workspace_root || '-'}</div>
            <div className="mt-5 max-h-[420px] space-y-2 overflow-auto">
              {artifactsLoading ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
                  正在加载产物文件...
                </div>
              ) : (artifacts?.files || []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-400">
                  暂无产物文件
                </div>
              ) : (artifacts?.files || []).map((file: any) => (
                <div key={file.path} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
                  {file.path}
                </div>
              ))}
            </div>
          </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
};
