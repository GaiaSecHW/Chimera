import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Info, Loader2, RefreshCw, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import {
  BinarySecurityAbnormalReason,
  BinarySecurityAbnormalReasonEventSummary,
  BinarySecurityEntryContract,
  BinarySecurityModuleContract,
  BinarySecurityModuleSelection,
  BinarySecurityOverviewNode,
  BinarySecurityStageItemPage,
  BinarySecurityTaskDetail,
  BinarySecurityTaskPolicy,
  BinarySecurityTaskType,
} from '../../clients/binarySecurity';
import { api } from '../../clients/api';
import { B2STaskDetail } from '../../clients/binaryToSource';
import { DataflowScanTaskDetail } from '../../clients/dataflowVulnScanner';
import { FirmwareUnpackTask } from '../../clients/firmwareUnpacker';
import { AppDfaTaskDetail, AppEaTaskDetail, AppSaTaskDetail } from '../../types/types';
import { showConfirm } from '../../components/DialogService';
import {
  asBinarySecurityContract,
  contractText,
  dfaInputContractRows,
  dfaOutputContractRows,
  moduleArtifactKindSummary,
  moduleContractInputRows,
  moduleContractKey,
  moduleContractList,
  moduleContractNumber,
  moduleContractText,
  renderContractValue,
} from '../../utils/binarySecurityContracts';
import { clearExecutionReturnContext, saveBinarySecurityReturnContext } from '../../utils/executionReturnContext';

interface Props {
  projectId: string;
  taskId: string;
  taskType: BinarySecurityTaskType;
  onBack: () => void;
}

const TERMINAL = new Set(['success', 'partial_success', 'failed', 'cancelled', 'delete_failed', 'downstream_missing']);
const PREPARING_STATUSES = new Set(['continue_preparing', 'retry_preparing']);
const DEFAULT_BINARY_STAGE_SEQUENCE = [
  'firmware_unpack',
  'system_analysis',
  'binary_to_source',
  'entry_analysis',
  'dataflow_analysis',
  'vuln_scan',
];
const DEFAULT_SOURCE_STAGE_SEQUENCE = [
  'system_analysis',
  'entry_analysis',
  'dataflow_analysis',
  'vuln_scan',
];
const DEFAULT_MODULE_STAGE_SEQUENCE = [
  'binary_to_source',
  'entry_analysis',
  'dataflow_analysis',
  'vuln_scan',
];
const MODULE_RISK_OPTIONS = ['高', '中', '低'];
const MODULE_SELECTION_OPTIONS = [
  { value: 'auto', label: '按风险自动推进' },
  { value: 'manual_confirm', label: '系统分析后人工确认' },
];
const PARTIAL_SUCCESS_ADVANCEMENT_FIELDS = [
  { key: 'binary_to_source', label: '二进制逆向部分成功后继续推进' },
  { key: 'entry_analysis', label: '入口分析部分成功后继续推进' },
  { key: 'dataflow_analysis', label: '数据流分析部分成功后继续推进' },
] as const;
const DEFAULT_PARTIAL_SUCCESS_STAGE_ADVANCEMENT = Object.fromEntries(
  PARTIAL_SUCCESS_ADVANCEMENT_FIELDS.map((field) => [field.key, false]),
) as Record<string, boolean>;
const STAGE_ITEMS_PER_PAGE = 100;

const STAGE_LABELS: Record<string, string> = {
  firmware_unpack: '固件解包',
  system_analysis: '系统分析',
  binary_to_source: '二进制逆向',
  entry_analysis: '入口分析',
  dataflow_analysis: '数据流分析',
  vuln_scan: '漏洞扫描',
};

const RESULT_KIND_LABELS: Record<string, string> = {
  recovered_source: '恢复源码',
  recovered_header: '恢复头文件',
  entry_descriptor: '入口描述',
  analysis_metadata: '分析元数据',
  agent_session: '智能体会话',
  review_record: '评审记录',
  batch_intermediate: '批处理过程',
  final_report: '最终报告',
  other: '其他',
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
    case 'delete_failed':
      return 'bg-rose-100 text-rose-800 border-rose-300';
    case 'downstream_missing':
      return 'bg-orange-50 text-orange-700 border-orange-200';
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
    case 'continue_preparing':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'retry_preparing':
      return 'bg-orange-50 text-orange-700 border-orange-200';
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
    case 'delete_failed':
      return `border-rose-400 bg-rose-100 text-rose-900 ${selectedDepth}`;
    case 'downstream_missing':
      return `border-orange-300 bg-orange-50 text-orange-800 ${selectedDepth}`;
    case 'running':
      return `border-blue-300 bg-blue-50 text-blue-800 ${selectedDepth}`;
    case 'continue_preparing':
      return `border-emerald-300 bg-emerald-50 text-emerald-800 ${selectedDepth}`;
    case 'retry_preparing':
      return `border-orange-300 bg-orange-50 text-orange-800 ${selectedDepth}`;
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
    case 'delete_failed':
      return 'text-rose-500';
    case 'downstream_missing':
      return 'text-orange-400';
    case 'running':
      return 'text-blue-400';
    case 'continue_preparing':
      return 'text-emerald-400';
    case 'retry_preparing':
      return 'text-orange-400';
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
const formatBinarySecurityStatus = (status?: string | null) => {
  const normalized = String(status || '').trim().toLowerCase();
  const labels: Record<string, string> = {
    downstream_missing: '子任务不存在',
    delete_failed: '删除失败',
  };
  return labels[normalized] || status || '-';
};

const formatStageItemSyncStatus = (status?: string | null) => {
  switch (status) {
    case 'synced':
      return '已同步';
    case 'skipped':
      return '已跳过';
    case 'transport_error':
      return '同步失败';
    case 'pending':
      return '待同步';
    case 'not_applicable':
      return '不适用';
    default:
      return status ? status : '-';
  }
};

const formatSyncAppliedLabel = (value?: boolean | null) => {
  if (value == null) return '-';
  return value ? '已应用' : '未应用';
};

function firstMeaningfulValue(...values: Array<unknown>): string | null {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return null;
}

type StageItemContract = BinarySecurityModuleContract | BinarySecurityEntryContract;

function asStageItemContract(value: unknown): StageItemContract | null {
  return asBinarySecurityContract(value) as StageItemContract | null;
}

function stageItemContractValue(
  contract: StageItemContract | null | undefined,
  ...fields: Array<keyof StageItemContract>
): string | null {
  return contractText(contract, ...fields);
}

function stageItemContractRows(item: BinarySecurityTaskDetail['stage_items'][number]) {
  const outputRef = asStageItemContract(item.output_ref);
  const resultRef = asStageItemContract(item.result);
  const isDataflowStage = item.stage_name === 'dataflow_analysis';
  const isVulnScanStage = item.stage_name === 'vuln_scan';
  const dfaOutputRows = isDataflowStage || isVulnScanStage
    ? dfaOutputContractRows(resultRef || outputRef)
    : [];
  return {
    output: [
      { label: 'artifact_root', value: stageItemContractValue(outputRef, 'artifact_root') || stageItemContractValue(resultRef, 'artifact_root') },
      { label: 'archive_root', value: stageItemContractValue(outputRef, 'archive_root') || stageItemContractValue(resultRef, 'archive_root') },
      { label: 'module_dir', value: stageItemContractValue(resultRef, 'module_dir') || stageItemContractValue(outputRef, 'module_dir') },
      { label: 'descriptor_root', value: stageItemContractValue(resultRef, 'descriptor_root', 'entry_descriptor_root') || stageItemContractValue(outputRef, 'descriptor_root', 'entry_descriptor_root') },
      { label: 'files_list', value: stageItemContractValue(resultRef, 'files_list_path', 'entry_files_list', 'files_list') || stageItemContractValue(outputRef, 'files_list_path', 'entry_files_list', 'files_list') },
      { label: 'source_root', value: stageItemContractValue(resultRef, 'source_root', 'source_root_path', 'source_dir') || stageItemContractValue(outputRef, 'source_root', 'source_root_path', 'source_dir') },
      ...(isDataflowStage ? [
        { label: 'module_input_path', value: stageItemContractValue(resultRef, 'module_input_path') || stageItemContractValue(outputRef, 'module_input_path') },
        { label: 'source_root_path', value: stageItemContractValue(resultRef, 'source_root_path', 'source_root', 'source_dir') || stageItemContractValue(outputRef, 'source_root_path', 'source_root', 'source_dir') },
        { label: 'source_file', value: stageItemContractValue(resultRef, 'source_file', 'definition_file', 'file_name') || stageItemContractValue(outputRef, 'source_file', 'definition_file', 'file_name') },
        {
          label: 'data_flow_files',
          value: Array.isArray(resultRef?.data_flow_files) && resultRef.data_flow_files.length > 0
            ? resultRef.data_flow_files.join('\n')
            : (Array.isArray(outputRef?.data_flow_files) && outputRef.data_flow_files.length > 0
              ? outputRef.data_flow_files.join('\n')
              : null),
        },
      ] : []),
      ...(isVulnScanStage ? [
        {
          label: 'data_flow_files',
          value: Array.isArray(resultRef?.data_flow_files) && resultRef.data_flow_files.length > 0
            ? resultRef.data_flow_files.join('\n')
            : (Array.isArray(outputRef?.data_flow_files) && outputRef.data_flow_files.length > 0
              ? outputRef.data_flow_files.join('\n')
              : null),
        },
      ] : []),
      ...dfaOutputRows.map((row) => ({ label: row.label, value: row.value })),
    ].filter((row) => row.value),
  };
}

function stageItemInputContractRows(item: BinarySecurityTaskDetail['stage_items'][number]) {
  const contract = asStageItemContract(item.input_ref);
  if (item.stage_name === 'dataflow_analysis') {
    const rows = dfaInputContractRows(contract, null);
    if (rows.length > 0) {
      return rows.map((row) => ({
        label: row.semantic ? `${row.label} (${row.semantic})` : row.label,
        value: row.value,
      }));
    }
  }
  if (!item.input_ref || typeof item.input_ref !== 'object' || Array.isArray(item.input_ref)) {
    return [];
  }
  return Object.entries(item.input_ref as Record<string, unknown>)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right, 'zh-Hans-CN'))
    .map(([label, value]) => ({
      label,
      value: formatStageItemRawContractValue(value),
    }));
}

function formatStageItemRawContractValue(value: unknown): string {
  if (value == null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

const normalizeDownstreamDetailError = (error: any) => {
  const message = String(error?.message || error || '').toLowerCase();
  if (message.includes('not found') || message.includes('不存在') || message.includes('404')) {
    return '下游子任务不存在';
  }
  return error?.message || '加载下游任务详情失败';
};

const fmt = (value?: string | null) => (value ? new Date(value).toLocaleString() : '-');
const fmtTime = (value?: string | null) => (value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-');
const safeInt = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};
const safeCountLabel = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(Math.trunc(parsed)) : '-';
};
const stageItemEntryCountLabel = (
  item: BinarySecurityTaskDetail['stage_items'][number],
  entryCountByItemKey?: Map<string, number>,
) => {
  if (item.stage_name !== 'entry_analysis' || item.status !== 'success') return '-';
  const mapped = entryCountByItemKey?.get(String(item.item_key || '').trim());
  if (mapped != null) return String(mapped);
  const candidates = [
    item.result?.entry_count,
    item.result?.summary?.entry_count,
    item.output_ref?.entry_count,
    item.output_ref?.summary?.entry_count,
  ];
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) return String(Math.trunc(parsed));
  }
  return '-';
};
const boolLabel = (value: unknown) => {
  if (value === undefined || value === null) return '-';
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) return '是';
    if (['false', '0', 'no'].includes(normalized)) return '否';
  }
  return value ? '是' : '否';
};

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

type DetailTab = 'overview' | 'strategy' | 'modules' | 'timeline' | 'artifacts' | 'orchestration';
type StageNodeKind = 'business' | 'archive';
type ArchiveJob = BinarySecurityTaskDetail['archive_jobs'][number];
type BlockingActionKind = '' | 'retry' | 'retry_failed_items';
type TaskStrategyDraft = {
  stage_options: Record<string, { enabled: boolean }>;
  stage_parallelism: Record<string, number>;
  max_retries_per_item: number;
  continue_on_item_failure: boolean;
  partial_success_stage_advancement: Record<string, boolean>;
  module_selection_mode: 'auto' | 'manual_confirm';
  module_risk_levels: string[];
};
type StrategySectionKey = 'stage_options' | 'module_strategy' | 'execution_policy';
type ManualOperationState = NonNullable<BinarySecurityTaskDetail['manual_operation_state']>;

const systemAnalysisRiskCountLabels = (state?: DownstreamTaskState) => {
  if (state?.detail?.kind !== 'system_analysis') {
    return { high: '-', medium: '-', low: '-' };
  }
  const summary = state.detail.data.result_json?.summary || {};
  const resultJson = state.detail.data.result_json || {};
  return {
    high: safeCountLabel(summary.high_risk_module_count ?? resultJson.high_risk_module_count),
    medium: safeCountLabel(summary.medium_risk_module_count ?? resultJson.medium_risk_module_count),
    low: safeCountLabel(summary.low_risk_module_count ?? resultJson.low_risk_module_count),
  };
};

const taskTypeLabel = (taskType: BinarySecurityTaskType) => {
  if (taskType === 'source') return '源码扫描';
  if (taskType === 'binary_module') return '二进制模块扫描';
  return '二进制类扫描';
};

const taskDetailViewLabel = (taskType: BinarySecurityTaskType) => {
  if (taskType === 'source') return '源码任务总览详情';
  if (taskType === 'binary_module') return '二进制模块任务总览详情';
  return '二进制任务总览详情';
};

const BLOCKING_ACTION_COPY: Record<
  Exclude<BlockingActionKind, ''>,
  {
    confirmTitle: string;
    confirmMessage: string;
    confirmText: string;
    progressTitle: string;
    progressMessage: string;
  }
> = {
  retry: {
    confirmTitle: '严格清理后从头开始',
    confirmMessage: '该操作会清空并删除当前任务所有阶段的阶段任务、下游任务、编排记录和结果摘要，然后从第一阶段重新开始。该操作不会复用旧下游任务，是否确认继续？',
    confirmText: '确认严格清理后从头开始',
    progressTitle: '后台正在严格清理并从头开始',
    progressMessage: '请求会立即受理，后台完成清理后自动切回待调度状态。',
  },
  retry_failed_items: {
    confirmTitle: '重试失败项',
    confirmMessage: '该操作只会重试当前首个可恢复阶段中的失败子任务，并联动清理这些失败项对应的归档与后续阶段结果；已经成功的子任务会保留，失败子任务不会进入归档。是否继续？',
    confirmText: '确认重试失败项',
    progressTitle: '后台正在准备重试失败项',
    progressMessage: '请求会立即受理，后台完成准备后自动切回待调度状态。',
  },
};

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
  task_continue_accepted: '继续已受理',
  task_retry_accepted: '清空重试已受理',
  task_continue_prepare_started: '继续准备开始',
  task_retry_prepare_started: '重试准备开始',
  task_continue_prepare_finished: '继续准备完成',
  task_retry_prepare_finished: '重试准备完成',
  task_continue_prepare_failed: '继续准备失败',
  task_retry_prepare_failed: '重试准备失败',
  task_policy_updated: '任务策略已更新',
  task_continue_requested: '继续执行',
  task_retried: '清空并从头开始',
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
  downstream_transport_deferred: '下游异常已延后处理',
  downstream_retry_accepted: '下游重试已受理',
  downstream_retry_attached: '接管运行中下游任务',
  downstream_retry_terminal_reused: '复用终态下游结果',
  downstream_retry_target_missing: '下游重试目标不存在',
  downstream_retry_rejected: '下游重试被拒绝',
  downstream_retry_failed: '下游重试失败',
  downstream_cancel_succeeded: '下游子任务已取消',
  downstream_delete_succeeded: '下游子任务已删除',
  stage_waiting_downstream_progress: '等待下游继续推进',
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

const buildStrategyDraft = (policy: BinarySecurityTaskPolicy | undefined, stages: string[]): TaskStrategyDraft => {
  const nextPolicy = policy || {};
  const maxStageParallelism = safeInt(nextPolicy.max_stage_parallelism, 1);
  const stageParallelism = nextPolicy.stage_parallelism && typeof nextPolicy.stage_parallelism === 'object'
    ? nextPolicy.stage_parallelism as Record<string, unknown>
    : {};
  const stageOptions = nextPolicy.stage_options && typeof nextPolicy.stage_options === 'object'
    ? nextPolicy.stage_options as Record<string, { enabled?: boolean }>
    : {};
  const normalizedMode = String(nextPolicy.module_selection_mode || 'auto') === 'manual_confirm' ? 'manual_confirm' : 'auto';
  const normalizedRiskLevels = Array.isArray(nextPolicy.module_risk_levels) && nextPolicy.module_risk_levels.length > 0
    ? nextPolicy.module_risk_levels.filter((item) => MODULE_RISK_OPTIONS.includes(String(item)))
    : ['高'];
  return {
    stage_options: Object.fromEntries(stages.map((stageName) => [
      stageName,
      { enabled: stageOptions[stageName]?.enabled !== false },
    ])),
    stage_parallelism: Object.fromEntries(stages.map((stageName) => [
      stageName,
      Math.max(1, Math.min(32, safeInt(stageParallelism[stageName], maxStageParallelism))),
    ])),
    max_retries_per_item: Math.max(0, Math.min(20, safeInt(nextPolicy.max_retries_per_item, 0))),
    continue_on_item_failure: Boolean(nextPolicy.continue_on_item_failure),
    partial_success_stage_advancement: Object.fromEntries(
      PARTIAL_SUCCESS_ADVANCEMENT_FIELDS
        .filter((field) => stages.includes(field.key))
        .map((field) => [
          field.key,
          (nextPolicy.partial_success_stage_advancement as Record<string, boolean> | undefined)?.[field.key]
            ?? DEFAULT_PARTIAL_SUCCESS_STAGE_ADVANCEMENT[field.key],
        ]),
    ),
    module_selection_mode: normalizedMode,
    module_risk_levels: normalizedRiskLevels.length > 0 ? normalizedRiskLevels : ['高'],
  };
};

const strategyDraftEquals = (left: TaskStrategyDraft | null, right: TaskStrategyDraft | null) => (
  JSON.stringify(left || null) === JSON.stringify(right || null)
);

const strategySectionEquals = (
  section: StrategySectionKey,
  left: TaskStrategyDraft | null,
  right: TaskStrategyDraft | null,
) => {
  if (!left || !right) return false;
  if (section === 'stage_options') {
    return JSON.stringify(left.stage_options) === JSON.stringify(right.stage_options);
  }
  if (section === 'module_strategy') {
    return JSON.stringify({
      module_selection_mode: left.module_selection_mode,
      module_risk_levels: left.module_risk_levels,
    }) === JSON.stringify({
      module_selection_mode: right.module_selection_mode,
      module_risk_levels: right.module_risk_levels,
    });
  }
  return JSON.stringify({
    stage_parallelism: left.stage_parallelism,
    max_retries_per_item: left.max_retries_per_item,
    continue_on_item_failure: left.continue_on_item_failure,
    partial_success_stage_advancement: left.partial_success_stage_advancement,
  }) === JSON.stringify({
    stage_parallelism: right.stage_parallelism,
    max_retries_per_item: right.max_retries_per_item,
    continue_on_item_failure: right.continue_on_item_failure,
    partial_success_stage_advancement: right.partial_success_stage_advancement,
  });
};

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
    status_raw: '原始状态',
    http_status: 'HTTP 状态码',
    error_type: '错误类型',
    state_applied: '是否写回状态',
    deferred_mode: '延后模式',
    operation: '操作类型',
    outcome: '处置结果',
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
    'downstream_status', 'status_raw', 'mapped_status', 'http_status', 'error_type', 'state_applied', 'deferred_mode', 'operation', 'outcome', 'selected_module_keys', 'stage_name',
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
  Boolean(!retryable && retryReason && ['failed', 'delete_failed', 'partial_success', 'cancelled', 'downstream_missing'].includes(String(status || '')))
);

type TaskStatusReason = {
  tone: 'ok' | 'info' | 'warn' | 'error' | 'muted';
  title: string;
  description: string;
  evidence: Array<{ label: string; value: string }>;
};

const abnormalReasonTone = (reason?: BinarySecurityAbnormalReason | null) => {
  switch (reason?.category) {
    case 'cancel':
      return 'muted' as const;
    case 'archive':
      return 'warn' as const;
    case 'downstream':
      return 'error' as const;
    case 'runtime':
    case 'orchestration':
      return reason?.status === 'partial_success' ? 'warn' as const : 'error' as const;
    default:
      return reason?.status === 'partial_success' ? 'warn' as const : 'info' as const;
  }
};

const reasonToneClass = (tone: TaskStatusReason['tone']) => {
  switch (tone) {
    case 'ok':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'warn':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    case 'error':
      return 'border-rose-200 bg-rose-50 text-rose-800';
    case 'muted':
      return 'border-slate-200 bg-slate-50 text-slate-700';
    default:
      return 'border-sky-200 bg-sky-50 text-sky-800';
  }
};

const firstText = (...values: Array<unknown>): string | null => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

const summarizeCount = (count: number, unit = '项') => `${count.toLocaleString()} ${unit}`;

function deriveTaskStatusReason(detail: BinarySecurityTaskDetail): TaskStatusReason {
  if (detail.abnormal_reason) {
    return {
      tone: abnormalReasonTone(detail.abnormal_reason),
      title: detail.abnormal_reason.title,
      description: detail.abnormal_reason.message,
      evidence: (detail.abnormal_reason.evidence || []).slice(0, 4).map((item) => ({
        label: item.label,
        value: item.value,
      })),
    };
  }
  const stageSummaries = detail.stage_summaries || [];
  const stageItems = detail.stage_items || [];
  const archiveJobs = detail.archive_jobs || [];
  const currentStageLabel = STAGE_LABELS[detail.current_stage || ''] || detail.current_stage || '-';
  const failedStages = stageSummaries.filter((stage) => ['failed', 'delete_failed', 'partial_success', 'downstream_missing'].includes(stage.status));
  const cancelledStages = stageSummaries.filter((stage) => stage.status === 'cancelled');
  const runningStages = stageSummaries.filter((stage) => ['running', 'dispatching', 'applying'].includes(stage.status));
  const pendingStages = stageSummaries.filter((stage) => stage.status === 'pending');
  const failedItems = stageItems.filter((item) => item.status === 'failed' || item.status === 'delete_failed');
  const missingItems = stageItems.filter((item) => item.status === 'downstream_missing');
  const runningItems = stageItems.filter((item) => ['running', 'dispatching'].includes(item.status));
  const cancelledItems = stageItems.filter((item) => item.status === 'cancelled');
  const failedArchiveJobs = archiveJobs.filter((job) => job.archive_status === 'failed');
  const runningArchiveJobs = archiveJobs.filter((job) => ['pending', 'running', 'archived', 'applying'].includes(job.archive_status));
  const latestFailedStage = failedStages[failedStages.length - 1];
  const latestFailedItem = failedItems[failedItems.length - 1];
  const latestMissingItem = missingItems[missingItems.length - 1];
  const latestFailedArchive = failedArchiveJobs[failedArchiveJobs.length - 1];
  const latestRunningItem = runningItems[runningItems.length - 1];
  const staleStages = (detail.summary?.stale_stages as string[] | undefined) || [];
  const staleFromStage = String(detail.summary?.stale_from_stage || '');

  if (detail.status === 'success') {
    return {
      tone: 'ok',
      title: '任务已完成',
      description: '所有已启用阶段完成，且没有失败的阶段子任务或归档任务阻断总任务收敛。',
      evidence: [
        { label: '成功阶段', value: summarizeCount(stageSummaries.filter((stage) => stage.status === 'success').length, '个') },
        { label: '归档完成', value: `${archiveJobs.filter((job) => job.archive_status === 'success').length} / ${archiveJobs.length || 0}` },
      ],
    };
  }

  if (detail.status === 'failed' || detail.status === 'delete_failed') {
    const reason = firstText(
      detail.last_error,
      latestFailedStage?.last_error,
      latestFailedItem?.error_message,
      latestMissingItem?.error_message,
      latestFailedArchive?.error_message,
    );
    const failedStageName = latestFailedStage?.stage_name || latestFailedItem?.stage_name || latestFailedArchive?.stage_name || detail.current_stage;
    return {
      tone: 'error',
      title: detail.status === 'delete_failed'
        ? '任务删除失败'
        : `任务失败于 ${STAGE_LABELS[failedStageName || ''] || failedStageName || '当前阶段'}`,
      description: reason || (
        detail.status === 'delete_failed'
          ? '任务记录保留，原因是工作目录或下游清理未完成，需要修复残留后重新删除。'
          : '当前任务存在失败阶段、失败子任务或归档失败记录，编排器因此将总任务置为失败。'
      ),
      evidence: [
        { label: '失败阶段', value: failedStages.map((stage) => STAGE_LABELS[stage.stage_name] || stage.stage_name).join(' / ') || '-' },
        { label: '失败子任务', value: summarizeCount(failedItems.length) },
        { label: '丢失子任务', value: summarizeCount(missingItems.length) },
        { label: '归档失败', value: summarizeCount(failedArchiveJobs.length) },
      ],
    };
  }

  if (detail.status === 'downstream_missing') {
    const reason = firstText(
      detail.last_error,
      latestFailedStage?.last_error,
      latestMissingItem?.error_message,
      latestFailedItem?.error_message,
    );
    const blockedStageName = latestFailedStage?.stage_name || latestMissingItem?.stage_name || latestFailedItem?.stage_name || detail.current_stage;
    return {
      tone: 'warn',
      title: `${STAGE_LABELS[blockedStageName || ''] || blockedStageName || '当前阶段'}存在悬空子任务`,
      description: reason || '当前阶段的下游微服务任务已经不存在，和普通失败不同，需要重新创建该阶段子任务后再继续推进。',
      evidence: [
        { label: '异常阶段', value: failedStages.map((stage) => STAGE_LABELS[stage.stage_name] || stage.stage_name).join(' / ') || '-' },
        { label: '丢失子任务', value: summarizeCount(missingItems.length) },
        { label: '失败子任务', value: summarizeCount(failedItems.length) },
      ],
    };
  }

  if (detail.status === 'partial_success') {
    const reason = firstText(
      detail.last_error,
      latestFailedStage?.last_error,
      latestFailedItem?.error_message,
      latestFailedArchive?.error_message,
    );
    return {
      tone: 'warn',
      title: '任务部分成功',
      description: reason || '任务已完成可推进的部分，但仍存在失败或取消的阶段子任务，需要按需查看失败项或手动重试对应阶段。',
      evidence: [
        { label: '失败阶段', value: failedStages.map((stage) => STAGE_LABELS[stage.stage_name] || stage.stage_name).join(' / ') || '-' },
        { label: '失败子任务', value: summarizeCount(failedItems.length) },
        { label: '丢失子任务', value: summarizeCount(missingItems.length) },
        { label: '取消子任务', value: summarizeCount(cancelledItems.length) },
      ],
    };
  }

  if (detail.status === 'cancelled') {
    return {
      tone: 'muted',
      title: '任务已取消',
      description: firstText(detail.last_error) || '用户或编排器已取消任务，未完成阶段和仍在运行的子任务会被标记为取消。',
      evidence: [
        { label: '取消阶段', value: cancelledStages.map((stage) => STAGE_LABELS[stage.stage_name] || stage.stage_name).join(' / ') || '-' },
        { label: '取消子任务', value: summarizeCount(cancelledItems.length) },
      ],
    };
  }

  if (detail.status === 'pending_module_confirmation' || detail.status === 'waiting_confirmation') {
    return {
      tone: 'warn',
      title: '等待人工确认模块',
      description: '系统分析已经产生候选模块，当前模块策略要求人工确认后才会继续进入后续阶段。',
      evidence: [
        { label: '候选模块', value: summarizeCount(detail.candidate_module_count) },
        { label: '已选模块', value: summarizeCount(detail.selected_module_count) },
        { label: '风险等级', value: (detail.selected_risk_levels || []).join(' / ') || '-' },
      ],
    };
  }

  if (detail.status === 'continue_preparing' || detail.status === 'retry_preparing') {
    const isRetryPreparing = detail.status === 'retry_preparing';
    const cleanupSnapshot = detail.cleanup_snapshot || {};
    const cleanupCounts = cleanupSnapshot.cleanup_counts || {};
    const downstreamRefCount = Array.isArray(cleanupSnapshot.downstream_refs) ? cleanupSnapshot.downstream_refs.length : 0;
    return {
      tone: 'info',
      title: isRetryPreparing ? '正在严格清理并从头开始' : '正在继续任务准备',
      description: isRetryPreparing
        ? '后台正在先删除旧阶段子任务、下游任务、归档与历史状态残留；只有清理完成后才会重新进入第一阶段队列。'
        : '后台正在定位下一个可执行阶段，并清理当前阶段及后续阶段需要重建的结果。',
      evidence: [
        { label: '目标阶段', value: currentStageLabel },
        { label: '待处理动作', value: detail.pending_action || (isRetryPreparing ? 'retry' : 'continue') },
        ...(isRetryPreparing
          ? [
              { label: '执行代次', value: `第 ${detail.execution_epoch} 轮` },
              { label: '下游清理目标', value: String(downstreamRefCount) },
              { label: '阶段子任务清理数', value: String(cleanupCounts.stage_items_deleted ?? '-') },
              { label: '归档记录清理数', value: String(cleanupCounts.archive_jobs_deleted ?? '-') },
            ]
          : []),
      ],
    };
  }

  if (detail.status === 'running' || detail.status === 'dispatching') {
    const runningArchive = runningArchiveJobs[runningArchiveJobs.length - 1];
    return {
      tone: 'info',
      title: detail.status === 'dispatching' ? `正在调度 ${currentStageLabel}` : `正在执行 ${currentStageLabel}`,
      description: runningArchive
        ? `当前正在处理 ${STAGE_LABELS[runningArchive.stage_name] || runningArchive.stage_name} 的产物归档，归档完成后才会应用阶段结果或继续推进。`
        : latestRunningItem
          ? `当前阶段已有下游子任务在执行：${latestRunningItem.downstream_task_id || latestRunningItem.item_key}。`
          : '编排器正在推进当前阶段，等待下游微服务返回结果或创建阶段子任务。',
      evidence: [
        { label: '当前阶段', value: currentStageLabel },
        { label: '运行子任务', value: summarizeCount(runningItems.length) },
        { label: '进行中归档', value: summarizeCount(runningArchiveJobs.length) },
      ],
    };
  }

  if (detail.status === 'queued') {
    return {
      tone: 'info',
      title: '任务正在队列中等待调度',
      description: '当前任务已经入队，但尚未获得 binary-security 编排器执行名额。',
      evidence: [
        { label: '队列位置', value: detail.queue_position ? `第 ${detail.queue_position} 位` : '-' },
        { label: '调度实例', value: detail.dispatcher_instance_id || '-' },
      ],
    };
  }

  if (detail.status === 'pending_upload' || detail.status === 'uploading') {
    return {
      tone: 'info',
      title: detail.status === 'uploading' ? '正在处理输入文件' : '等待上传输入文件',
      description: detail.status === 'uploading'
        ? '后端正在校验或整理上传文件，完成后任务会进入就绪或自动启动。'
        : '任务记录已经创建，但输入文件尚未完成上传。',
      evidence: [
        { label: '输入目录', value: detail.firmware_path || '-' },
        { label: '输入数量', value: summarizeCount(detail.firmware_item_count) },
      ],
    };
  }

  if (detail.status === 'ready_to_start' || detail.status === 'pending') {
    return {
      tone: 'info',
      title: detail.status === 'ready_to_start' ? '任务已就绪' : '任务等待启动',
      description: detail.status === 'ready_to_start'
        ? '输入文件已准备完成，等待启动请求或调度器领取。'
        : '任务尚未进入实际执行阶段，后续阶段保持等待状态。',
      evidence: [
        { label: '待执行阶段', value: summarizeCount(pendingStages.length, '个') },
        { label: '阶段序列', value: detail.stage_sequence.map((stage) => STAGE_LABELS[stage] || stage).join(' -> ') || '-' },
      ],
    };
  }

  if (staleStages.length > 0) {
    return {
      tone: 'warn',
      title: '存在过期下游结果',
      description: `上游阶段 ${STAGE_LABELS[staleFromStage] || staleFromStage || '-'} 重试后，后续阶段结果保留但需要重新评估。`,
      evidence: [
        { label: '过期阶段', value: staleStages.map((stage) => STAGE_LABELS[stage] || stage).join(' / ') },
        { label: '当前状态', value: detail.status },
      ],
    };
  }

  return {
    tone: 'muted',
    title: '当前状态由编排器记录决定',
    description: firstText(detail.last_error) || '当前详情中没有更具体的失败、运行或等待原因；请结合阶段概览和事件时间线进一步定位。',
    evidence: [
      { label: '当前状态', value: detail.status || '-' },
      { label: '当前阶段', value: currentStageLabel },
    ],
  };
}

function AbnormalReasonCard({
  reason,
  history,
}: {
  reason: BinarySecurityAbnormalReason;
  history?: BinarySecurityAbnormalReasonEventSummary[];
}) {
  const tone = abnormalReasonTone(reason);
  return (
    <div className={`rounded-2xl border px-3 py-3 ${reasonToneClass(tone)}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] opacity-60">异常原因</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <div className="text-sm font-black">{reason.title}</div>
            <span className="rounded-full border border-current/15 bg-white/60 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em]">
              {reason.code}
            </span>
          </div>
          <div className="mt-1 text-xs leading-5 opacity-85">{reason.message}</div>
          {reason.recommended_action ? (
            <div className="mt-2 rounded-xl border border-current/10 bg-white/60 px-2.5 py-2 text-xs">
              建议动作：{reason.recommended_action}
            </div>
          ) : null}
        </div>
        <div className="grid min-w-[220px] grid-cols-1 gap-2 sm:grid-cols-2">
          {(reason.evidence || []).slice(0, 4).map((item) => (
            <div key={`${item.key}-${item.value}`} className="min-w-0 rounded-xl border border-current/10 bg-white/55 px-2.5 py-2 text-xs">
              <div className="font-bold opacity-55">{item.label}</div>
              <div className="mt-1 break-words font-black">{item.value || '-'}</div>
            </div>
          ))}
        </div>
      </div>
      {history && history.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          {history.slice(0, 3).map((item) => (
            <span key={item.event_id} className="rounded-full border border-current/10 bg-white/60 px-2.5 py-1 font-semibold">
              {item.reason.code} · {fmt(item.created_at)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TaskStatusReasonCard({ reason }: { reason: TaskStatusReason }) {
  return (
    <div className={`rounded-2xl border px-3 py-3 ${reasonToneClass(reason.tone)}`}>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(240px,0.95fr)] xl:items-start">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] opacity-60">状态原因</div>
          <div className="mt-1 text-sm font-black">{reason.title}</div>
          <div className="mt-1 text-xs leading-5 opacity-85">{reason.description}</div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {reason.evidence.slice(0, 3).map((item) => (
            <div key={item.label} className="min-w-0 rounded-xl border border-current/10 bg-white/55 px-2.5 py-2 text-xs">
              <div className="font-bold opacity-55">{item.label}</div>
              <div className="mt-1 break-words font-black">{item.value || '-'}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function manualOperationTone(overall: string) {
  switch (overall) {
    case 'ready':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'in_progress':
      return 'border-sky-200 bg-sky-50 text-sky-800';
    default:
      return 'border-amber-200 bg-amber-50 text-amber-800';
  }
}

function manualOperationLabel(overall: string) {
  switch (overall) {
    case 'ready':
      return '可手工操作';
    case 'in_progress':
      return '操作处理中';
    default:
      return '当前受限';
  }
}

function ManualOperationStateCard({ state }: { state: ManualOperationState }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${manualOperationTone(state.overall)}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-current/20 bg-white/60 px-3 py-1 text-[11px] font-black">
          {manualOperationLabel(state.overall)}
        </span>
        <span className="text-sm font-black">{state.summary || '-'}</span>
      </div>
      <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-current/10 bg-white/55 px-3 py-2">
          <div className="font-bold opacity-60">当前操作</div>
          <div className="mt-1 font-black">{state.operation_type || '-'}</div>
        </div>
        <div className="rounded-xl border border-current/10 bg-white/55 px-3 py-2">
          <div className="font-bold opacity-60">锁持有实例</div>
          <div className="mt-1 break-all font-black">{state.operation_owner || '-'}</div>
        </div>
        <div className="rounded-xl border border-current/10 bg-white/55 px-3 py-2">
          <div className="font-bold opacity-60">最近心跳</div>
          <div className="mt-1 font-black">{fmt(state.operation_heartbeat_at)}</div>
        </div>
        <div className="rounded-xl border border-current/10 bg-white/55 px-3 py-2">
          <div className="font-bold opacity-60">预计释放</div>
          <div className="mt-1 font-black">{fmt(state.operation_expires_at)}</div>
        </div>
      </div>
      {state.blocking_reason ? (
        <div className="mt-2 text-xs font-semibold opacity-80">{state.blocking_reason}</div>
      ) : null}
    </div>
  );
}

function OrchestrationObservabilityPanel({ detail }: { detail: BinarySecurityTaskDetail }) {
  const obs = detail.orchestration_observability || {};
  const stateEvents = obs.state_events || {};
  const lock = obs.task_state_lock || {};
  const archiveByStage = obs.archive?.by_stage || {};
  const statusCounts = stateEvents.status_counts || {};
  const activeEventCount = Number(statusCounts.pending || 0) + Number(statusCounts.retryable || 0) + Number(statusCounts.processing || 0);
  const deadLetterCount = Number(statusCounts.dead_letter || 0);
  const processing = stateEvents.processing || [];
  const deadLetters = stateEvents.dead_letters || [];
  const recent = stateEvents.recent || [];

  return (
    <section className="space-y-4">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">事件积压</div>
          <div className="mt-2 text-2xl font-black text-slate-900">{activeEventCount}</div>
          <div className="mt-1 text-xs text-slate-500">最老 {Math.round(Number(stateEvents.oldest_active_age_seconds || 0))} 秒</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">死信事件</div>
          <div className={`mt-2 text-2xl font-black ${deadLetterCount > 0 ? 'text-rose-700' : 'text-slate-900'}`}>{deadLetterCount}</div>
          <div className="mt-1 text-xs text-slate-500">超过重试上限后进入死信</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">状态锁</div>
          <div className={`mt-2 text-sm font-black ${lock.active ? 'text-blue-700' : 'text-emerald-700'}`}>{lock.active ? '持锁中' : '空闲'}</div>
          <div className="mt-1 break-all text-xs text-slate-500">{lock.owner_id || '-'}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">最近 Reconcile</div>
          <div className="mt-2 text-sm font-black text-slate-900">{obs.reconcile?.latest_event_type || '-'}</div>
          <div className="mt-1 text-xs text-slate-500">{fmt(obs.reconcile?.latest_event_at)}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">文件写入目标</div>
          <div className="mt-2 break-all font-mono text-[11px] text-slate-600">{obs.files?.metadata_path || '-'}</div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">归档状态分布</h3>
          <div className="mt-4 space-y-2">
            {Object.entries(archiveByStage).map(([stage, counts]) => (
              <div key={stage} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="font-black text-slate-800">{STAGE_LABELS[stage] || stage}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {Object.entries(counts || {}).map(([status, count]) => (
                    <span key={status} className={`rounded-full border px-2 py-1 font-bold ${statusTone(status)}`}>{formatBinarySecurityStatus(status)} {count}</span>
                  ))}
                </div>
              </div>
            ))}
            {Object.keys(archiveByStage).length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">暂无归档任务</div> : null}
          </div>
        </div>
        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">状态事件</h3>
          <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
            {Object.entries(statusCounts).map(([status, count]) => (
              <div key={status} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="font-bold text-slate-500">{status}</div>
                <div className="mt-1 text-lg font-black text-slate-900">{count}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {[...processing, ...deadLetters, ...recent].slice(0, 8).map((event: any) => (
              <div key={event.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono font-black text-slate-800">{event.event_type}</span>
                  <span className={`rounded-full border px-2 py-0.5 font-bold ${statusTone(event.status)}`}>{event.status}</span>
                </div>
                <div className="mt-1 break-all text-slate-500">owner={event.leased_by || '-'} · attempts={event.attempts ?? 0} · {fmt(event.created_at)}</div>
                {event.error_message ? <div className="mt-1 break-all text-rose-600">{event.error_message}</div> : null}
              </div>
            ))}
          </div>
        </div>
      </section>
    </section>
  );
}

export const BinarySecurityTaskDetailPage: React.FC<Props> = ({ projectId, taskId, taskType, onBack }) => {
  const executionApi = api.domains.execution;
  const navigate = useNavigate();
  const stageFlowRef = useRef<HTMLDivElement | null>(null);
  const [detail, setDetail] = useState<BinarySecurityTaskDetail | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [artifacts, setArtifacts] = useState<any | null>(null);
  const [artifactsLoaded, setArtifactsLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detailRefreshing, setDetailRefreshing] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineClearing, setTimelineClearing] = useState(false);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [stageItemsPage, setStageItemsPage] = useState<BinarySecurityStageItemPage | null>(null);
  const [stageItemsPageLoading, setStageItemsPageLoading] = useState(false);
  const [stageItemsPageError, setStageItemsPageError] = useState<string | null>(null);
  const [stageItemsCurrentPage, setStageItemsCurrentPage] = useState(1);
  const [moduleSelectionLoading, setModuleSelectionLoading] = useState(false);
  const [moduleSelection, setModuleSelection] = useState<BinarySecurityModuleSelection | null>(null);
  const [selectedModuleKeys, setSelectedModuleKeys] = useState<string[]>([]);
  const [selectedStageItemIds, setSelectedStageItemIds] = useState<string[]>([]);
  const [stageStatusFilter, setStageStatusFilter] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<string>('');
  const [expandedEventKey, setExpandedEventKey] = useState<string | null>(null);
  const [timelinePage, setTimelinePage] = useState(1);
  const [timelinePageSize, setTimelinePageSize] = useState(200);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [expandedStageItemId, setExpandedStageItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingBlockingAction, setPendingBlockingAction] = useState<BlockingActionKind>('');
  const [blockingAction, setBlockingAction] = useState<BlockingActionKind>('');
  const [strategyDraft, setStrategyDraft] = useState<TaskStrategyDraft | null>(null);
  const [strategySavedSnapshot, setStrategySavedSnapshot] = useState<TaskStrategyDraft | null>(null);
  const [strategySavingSection, setStrategySavingSection] = useState<StrategySectionKey | ''>('');
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [selectedStage, setSelectedStage] = useState<string>(DEFAULT_BINARY_STAGE_SEQUENCE[0]);
  const [selectedNodeKind, setSelectedNodeKind] = useState<StageNodeKind>('business');
  const [downstreamByItemId, setDownstreamByItemId] = useState<Record<string, DownstreamTaskState>>({});
  const [stageFlowLayout, setStageFlowLayout] = useState<{ mode: 'horizontal' | 'vertical'; cardWidth: number; connectorWidth: number }>({
    mode: 'horizontal',
    cardWidth: 160,
    connectorWidth: 40,
  });

  const isSourceTask = taskType === 'source';
  const isBinaryModuleTask = taskType === 'binary_module';
  const stageSequence = useMemo(
    () => (detail?.stage_sequence?.length
      ? detail.stage_sequence
      : (isSourceTask ? DEFAULT_SOURCE_STAGE_SEQUENCE : isBinaryModuleTask ? DEFAULT_MODULE_STAGE_SEQUENCE : DEFAULT_BINARY_STAGE_SEQUENCE)),
    [detail?.stage_sequence, isBinaryModuleTask, isSourceTask],
  );
  const canActOnTask = Boolean(detail);
  const isPreparing = PREPARING_STATUSES.has(detail?.status || '');
  const manualOperationState = detail?.manual_operation_state;
  const taskRetrySupported = Boolean(manualOperationState?.can_retry ?? detail?.task_retry_supported);
  const taskRetryReason = manualOperationState?.blocking_reason || detail?.task_retry_reason || '当前任务不可严格清理后从头开始';
  const taskRetryFailedItemsSupported = Boolean(manualOperationState?.can_retry_failed_items ?? detail?.task_retry_failed_items_supported);
  const taskRetryFailedItemsReason = manualOperationState?.blocking_reason || detail?.task_retry_failed_items_reason || '当前任务不可重试失败项';
  const taskCancelSupported = Boolean(manualOperationState?.can_cancel ?? canActOnTask);
  const taskDeleteSupported = Boolean(manualOperationState?.can_delete ?? canActOnTask);
  const moduleConfirmSupported = Boolean(manualOperationState?.can_confirm_modules ?? false);
  const staleStages = useMemo(() => new Set<string>((detail?.summary?.stale_stages as string[] | undefined) || []), [detail?.summary]);
  const cleanupSnapshot = detail?.cleanup_snapshot || null;
  const cleanupCounts = cleanupSnapshot?.cleanup_counts || {};
  const cleanupDownstreamRefs = Array.isArray(cleanupSnapshot?.downstream_refs) ? cleanupSnapshot.downstream_refs : [];
  const taskStatusReason = useMemo(() => (detail ? deriveTaskStatusReason(detail) : null), [detail]);
  const strategyEditable = Boolean(manualOperationState?.can_edit_policy ?? (detail && !['dispatching', 'running', 'continue_preparing', 'retry_preparing'].includes(detail?.status || '')));
  const strategyBlockedReason = !detail
    ? '任务详情尚未加载'
    : strategyEditable
      ? null
      : manualOperationState?.blocking_reason || `任务运行中，任务策略暂不可修改。当前状态：${detail.status}`;
  const strategyDirty = useMemo(
    () => !strategyDraftEquals(strategyDraft, strategySavedSnapshot),
    [strategyDraft, strategySavedSnapshot],
  );
  const stageOptionsDirty = useMemo(
    () => !strategySectionEquals('stage_options', strategyDraft, strategySavedSnapshot),
    [strategyDraft, strategySavedSnapshot],
  );
  const moduleStrategyDirty = useMemo(
    () => !strategySectionEquals('module_strategy', strategyDraft, strategySavedSnapshot),
    [strategyDraft, strategySavedSnapshot],
  );
  const executionPolicyDirty = useMemo(
    () => !strategySectionEquals('execution_policy', strategyDraft, strategySavedSnapshot),
    [strategyDraft, strategySavedSnapshot],
  );

  const loadTask = async (options?: { showLoading?: boolean; preserveStrategyDraft?: boolean }) => {
    if (!projectId || !taskId) return null;
    const showLoading = options?.showLoading ?? true;
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const task = await executionApi.binarySecurity.getTask(projectId, taskId);
      setDetail(task);
      const nextStages = task.stage_sequence?.length
        ? task.stage_sequence
        : (isSourceTask ? DEFAULT_SOURCE_STAGE_SEQUENCE : isBinaryModuleTask ? DEFAULT_MODULE_STAGE_SEQUENCE : DEFAULT_BINARY_STAGE_SEQUENCE);
      const nextDraft = buildStrategyDraft(task.policy, nextStages);
      if (!options?.preserveStrategyDraft) {
        setStrategyDraft(nextDraft);
        setStrategySavedSnapshot(nextDraft);
      }
      setSelectedStage((current) => {
        const nextStageSequence = nextStages;
        if (current && nextStageSequence.includes(current)) {
          return current;
        }
        setSelectedNodeKind('business');
        return task.current_stage && nextStageSequence.includes(task.current_stage) ? task.current_stage : nextStageSequence[0];
      });
      return task;
    } catch (e: any) {
      setError(e?.message || '加载失败');
      return null;
    } finally {
      if (showLoading) setLoading(false);
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
      ).map((item, index) => moduleContractKey(item, index)).filter(Boolean);
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
      message: `将删除当前${isBinaryModuleTask ? '二进制模块任务' : isSourceTask ? '源码任务' : '二进制任务'}的全部事件时间线记录。该操作不影响任务状态、阶段结果和产物文件，删除后不可恢复，是否继续？`,
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
      const payload = await executionApi.binarySecurity.getArtifacts(projectId, taskId);
      setArtifacts(payload || { workspace_root: '', files: [] });
    } catch (e: any) {
      setError(e?.message || '加载产物文件失败');
    } finally {
      setArtifactsLoaded(true);
      setArtifactsLoading(false);
    }
  };

  const updateStrategyStageEnabled = (stageName: string, enabled: boolean) => {
    setStrategyDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        stage_options: {
          ...current.stage_options,
          [stageName]: { enabled },
        },
      };
    });
  };

  const updateStrategyStageParallelism = (stageName: string, value: number) => {
    setStrategyDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        stage_parallelism: {
          ...current.stage_parallelism,
          [stageName]: Math.max(1, Math.min(32, Number(value) || 1)),
        },
      };
    });
  };

  const resetStrategySection = (section: StrategySectionKey) => {
    setStrategyDraft((current) => {
      if (!current || !strategySavedSnapshot) return current;
      if (section === 'stage_options') {
        return { ...current, stage_options: strategySavedSnapshot.stage_options };
      }
      if (section === 'module_strategy') {
        return {
          ...current,
          module_selection_mode: strategySavedSnapshot.module_selection_mode,
          module_risk_levels: strategySavedSnapshot.module_risk_levels,
        };
      }
      return {
        ...current,
        stage_parallelism: strategySavedSnapshot.stage_parallelism,
        max_retries_per_item: strategySavedSnapshot.max_retries_per_item,
        continue_on_item_failure: strategySavedSnapshot.continue_on_item_failure,
        partial_success_stage_advancement: strategySavedSnapshot.partial_success_stage_advancement,
      };
    });
    setError(null);
  };

  const saveTaskPolicySection = async (section: StrategySectionKey) => {
    if (!projectId || !taskId || !detail || !strategyDraft || strategySavingSection) return;
    if (section === 'module_strategy' && strategyDraft.module_risk_levels.length === 0) {
      setError('至少选择一个模块风险等级');
      return;
    }
    setStrategySavingSection(section);
    setError(null);
    try {
      const payload = section === 'stage_options'
        ? {
            stage_options: Object.fromEntries(stageSequence.map((stageName) => [
              stageName,
              { enabled: strategyDraft.stage_options[stageName]?.enabled !== false },
            ])),
          }
        : section === 'module_strategy'
          ? {
              module_selection_mode: strategyDraft.module_selection_mode,
              module_risk_levels: strategyDraft.module_risk_levels,
            }
          : {
              stage_parallelism: Object.fromEntries(stageSequence.map((stageName) => [
                stageName,
                Math.max(1, Math.min(32, Number(strategyDraft.stage_parallelism[stageName]) || 1)),
              ])),
              max_retries_per_item: Math.max(0, Math.min(20, Number(strategyDraft.max_retries_per_item) || 0)),
              continue_on_item_failure: Boolean(strategyDraft.continue_on_item_failure),
              partial_success_stage_advancement: Object.fromEntries(
                PARTIAL_SUCCESS_ADVANCEMENT_FIELDS
                  .filter((field) => stageSequence.includes(field.key))
                  .map((field) => [field.key, strategyDraft.partial_success_stage_advancement[field.key] !== false]),
              ),
            };
      const updated = await executionApi.binarySecurity.updateTaskPolicy(projectId, taskId, payload);
      setDetail(updated);
      const nextStages = updated.stage_sequence?.length
        ? updated.stage_sequence
        : (isSourceTask ? DEFAULT_SOURCE_STAGE_SEQUENCE : isBinaryModuleTask ? DEFAULT_MODULE_STAGE_SEQUENCE : DEFAULT_BINARY_STAGE_SEQUENCE);
      const nextDraft = buildStrategyDraft(updated.policy, nextStages);
      setStrategyDraft(nextDraft);
      setStrategySavedSnapshot(nextDraft);
      const sectionLabel = section === 'stage_options'
        ? '阶段启停'
        : section === 'module_strategy'
          ? '模块推进策略'
          : '并发与失败处理';
      setNotice(`${sectionLabel}已保存，将在后续阶段生效`);
      if (activeTab === 'timeline') {
        await loadTimeline();
      }
    } catch (e: any) {
      setError(e?.message || '更新任务策略失败');
    } finally {
      setStrategySavingSection('');
    }
  };

  const refreshActiveTab = async () => {
    if (detailRefreshing) return;
    setDetailRefreshing(true);
    setError(null);
    try {
      if (activeTab === 'overview') {
        setDownstreamByItemId({});
      }
      if (activeTab === 'modules') {
        setModuleSelection(null);
      }
      if (activeTab === 'timeline') {
        setTimeline([]);
        setExpandedEventKey(null);
      }
      if (activeTab === 'artifacts') {
        setArtifacts(null);
        setArtifactsLoaded(false);
      }
      const refreshedTask = await loadTask({
        showLoading: false,
        preserveStrategyDraft: activeTab === 'strategy' && strategyDirty,
      });
      if (activeTab === 'modules' && refreshedTask) await loadModuleSelection();
      if (activeTab === 'timeline') await loadTimeline();
      if (activeTab === 'artifacts') await loadArtifacts();
    } finally {
      setDetailRefreshing(false);
    }
  };

  useEffect(() => {
    void loadTask();
  }, [projectId, taskId]);

  useEffect(() => {
    setNotice(null);
  }, [projectId, taskId]);

  useEffect(() => {
    setArtifacts(null);
    setArtifactsLoaded(false);
  }, [projectId, taskId]);

  useEffect(() => {
    if (!detail || TERMINAL.has(detail.status)) return;
    if (detail.status === 'pending_module_confirmation') return;
    const intervalMs = detail.manual_operation_state?.operation_in_progress ? 2000 : 30000;
    const timer = window.setInterval(
      () => void loadTask({ preserveStrategyDraft: activeTab === 'strategy' && strategyDirty }),
      intervalMs,
    );
    return () => window.clearInterval(timer);
  }, [activeTab, detail?.manual_operation_state?.operation_in_progress, detail?.status, projectId, strategyDirty, taskId]);

  useEffect(() => {
    if (activeTab !== 'modules' || moduleSelection || moduleSelectionLoading) return;
    if (!detail) return;
    const hasModuleData = isBinaryModuleTask
      || detail.selected_module_count > 0
      || detail.candidate_module_count > 0
      || detail.high_risk_module_count > 0
      || detail.current_stage === 'system_analysis'
      || detail.status === 'pending_module_confirmation';
    if (hasModuleData) {
      void loadModuleSelection();
    }
  }, [
    activeTab,
    detail,
    moduleSelection,
    moduleSelectionLoading,
    projectId,
    isBinaryModuleTask,
    taskId,
  ]);

  useEffect(() => {
    if (activeTab === 'timeline' && timeline.length === 0 && !timelineLoading) {
      void loadTimeline();
    }
  }, [activeTab, timeline.length, timelineLoading, projectId, taskId]);

  useEffect(() => {
    if (activeTab === 'artifacts' && !artifactsLoaded && !artifactsLoading) {
      void loadArtifacts();
    }
  }, [activeTab, artifactsLoaded, artifactsLoading, projectId, taskId]);

  useEffect(() => {
    if (activeTab !== 'overview' || selectedNodeKind !== 'business' || !detail || !projectId || !selectedStage) return;
    let cancelled = false;
    setStageItemsPageLoading(true);
    setStageItemsPageError(null);
    void api.binarySecurity.getTaskStageItems(projectId, taskId, {
      stage_name: selectedStage,
      page: stageItemsCurrentPage,
      per_page: STAGE_ITEMS_PER_PAGE,
    }).then((payload) => {
      if (cancelled) return;
      setStageItemsPage(payload);
    }).catch((fetchError: any) => {
      if (cancelled) return;
      setStageItemsPageError(fetchError?.message || '加载阶段子任务失败');
    }).finally(() => {
      if (cancelled) return;
      setStageItemsPageLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activeTab, detail, projectId, selectedNodeKind, selectedStage, stageItemsCurrentPage, taskId]);

  useEffect(() => {
    if (activeTab !== 'overview' || selectedNodeKind !== 'business' || !detail || !projectId || !selectedStage) return;
    const stageItems = selectedNodeKind === 'business' && stageItemsPage?.stage_name === selectedStage
      ? (stageItemsPage.items || [])
      : detail.stage_items.filter((item) => item.stage_name === selectedStage);
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
          return [item.id, { loading: false, error: normalizeDownstreamDetailError(fetchError) }] as const;
        }
      }));

      if (cancelled) return;
      setDownstreamByItemId(Object.fromEntries(results));
    };

    void loadDownstream();
    return () => {
      cancelled = true;
    };
  }, [activeTab, detail, projectId, selectedNodeKind, selectedStage, stageItemsPage]);

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
    setActionLoading(action);
    try {
      if (action === 'cancel') await executionApi.binarySecurity.cancelTask(projectId, taskId);
      if (action === 'delete') {
        await executionApi.binarySecurity.deleteTask(projectId, taskId);
        onBack();
        return;
      }
      await refreshActiveTab();
    } catch (e: any) {
      setError(e?.message || `${action} 失败`);
    } finally {
      setActionLoading('');
    }
  };

  const retryStageFailedItems = async (stageName: string) => {
    if (!projectId || !taskId || !detail) return;
    const summary = detail.stage_summaries.find((item) => item.stage_name === stageName);
    if (!summary || !summary.retry_failed_supported) {
      return;
    }
    const confirmed = await showConfirm({
      title: '重试失败项',
      message: `将只重试阶段“${STAGE_LABELS[stageName] || stageName}”中的失败子任务，并只联动这些失败项对应的归档；当前阶段已成功子任务会保留，后续阶段会等待当前阶段重试完成后重新推进。是否继续？`,
      confirmText: '确认重试失败项',
      cancelText: '取消',
    });
    if (!confirmed) return;
    setActionLoading(`stage-failed:${stageName}`);
    try {
      await executionApi.binarySecurity.retryStageFailedItems(projectId, taskId, stageName);
      await refreshActiveTab();
    } catch (e: any) {
      setError(e?.message || '阶段失败项重试失败');
    } finally {
      setActionLoading('');
    }
  };

  const retryStageFull = async (stageName: string) => {
    if (!projectId || !taskId || !detail) return;
    const summary = detail.stage_summaries.find((item) => item.stage_name === stageName);
    if (!summary || !summary.retry_full_supported) {
      return;
    }
    const confirmed = await showConfirm({
      title: '阶段完全重试',
      message: `将清空阶段“${STAGE_LABELS[stageName] || stageName}”的全部业务子任务及其对应归档子任务，然后重新读取上游输出并重建该阶段输入。旧子任务会先取消/删除，再重新创建，是否继续？`,
      confirmText: '确认阶段完全重试',
      cancelText: '取消',
    });
    if (!confirmed) return;
    setActionLoading(`stage-full:${stageName}`);
    try {
      await executionApi.binarySecurity.retryStageFull(projectId, taskId, stageName);
      await refreshActiveTab();
    } catch (e: any) {
      setError(e?.message || '阶段完全重试失败');
    } finally {
      setActionLoading('');
    }
  };

  const retryArchiveStageFailedItems = async (stageName: string) => {
    if (!projectId || !taskId) return;
    const archiveNode = stageDisplayNodes.find((node) => node.kind === 'archive' && node.stage_name === stageName);
    if (!archiveNode?.retry_failed_supported) return;
    const confirmed = await showConfirm({
      title: '重试归档失败项',
      message: `将只重试阶段“${STAGE_LABELS[stageName] || stageName}”的失败归档任务。该操作不会重跑业务子任务，只会重做归档与状态回写，是否继续？`,
      confirmText: '确认重试失败项',
      cancelText: '取消',
    });
    if (!confirmed) return;
    setActionLoading(`archive-stage-failed:${stageName}`);
    setError(null);
    try {
      await executionApi.binarySecurity.retryArchiveStageFailedItems(projectId, taskId, stageName);
      await refreshActiveTab();
    } catch (e: any) {
      setError(e?.message || '归档失败项重试失败');
    } finally {
      setActionLoading('');
    }
  };

  const retryArchiveStageFull = async (stageName: string) => {
    if (!projectId || !taskId) return;
    const archiveNode = stageDisplayNodes.find((node) => node.kind === 'archive' && node.stage_name === stageName);
    if (!archiveNode?.retry_full_supported) return;
    const confirmed = await showConfirm({
      title: '归档阶段完全重试',
      message: `将清空阶段“${STAGE_LABELS[stageName] || stageName}”当前全部归档子任务，并基于当前业务阶段已成功的子任务重建归档。该操作不会重跑业务子任务，是否继续？`,
      confirmText: '确认归档阶段完全重试',
      cancelText: '取消',
    });
    if (!confirmed) return;
    setActionLoading(`archive-stage-full:${stageName}`);
    setError(null);
    try {
      await executionApi.binarySecurity.retryArchiveStageFull(projectId, taskId, stageName);
      await refreshActiveTab();
    } catch (e: any) {
      setError(e?.message || '归档阶段完全重试失败');
    } finally {
      setActionLoading('');
    }
  };

  const retryArchiveJob = async (job: ArchiveJob) => {
    if (!projectId || !taskId || !job.retry_supported) return;
    const confirmed = await showConfirm({
      title: '重试归档任务',
      message: `将重试归档任务“${job.item_key || job.item_id}”。该操作只会重新执行产物归档与状态回写，不会重跑下游微服务任务，是否继续？`,
      confirmText: '确认重试',
      cancelText: '取消',
    });
    if (!confirmed) return;
    setActionLoading(`archive-job:${job.id}`);
    setError(null);
    try {
      await executionApi.binarySecurity.retryArchiveJob(projectId, taskId, job.id);
      await refreshActiveTab();
    } catch (e: any) {
      setError(e?.message || '归档任务重试失败');
    } finally {
      setActionLoading('');
    }
  };

  const syncDownstreamStatus = async (
    options?: { stageName?: string; itemId?: string; force?: boolean },
    behavior?: { skipConfirm?: boolean; skipRefresh?: boolean },
  ) => {
    if (!projectId || !taskId) return;
    if (!behavior?.skipConfirm) {
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
    }
    const loadingKey = options?.itemId ? `sync-item:${options.itemId}` : options?.stageName ? `sync-stage:${options.stageName}` : 'sync-downstream';
    setActionLoading(loadingKey);
    setError(null);
    try {
      await executionApi.binarySecurity.syncDownstreamStatus(projectId, taskId, {
        stage_name: options?.stageName,
        item_id: options?.itemId,
        force: options?.force,
      });
      if (!behavior?.skipRefresh) {
        await refreshActiveTab();
      }
    } catch (e: any) {
      setError(e?.message || '同步下游状态失败');
    } finally {
      setActionLoading('');
    }
  };

  const batchSyncSelectedStageItems = async () => {
    if (!projectId || !taskId || selectedSyncableStageItems.length === 0) return;
    const confirmed = await showConfirm({
      title: '批量同步下游状态',
      message: `将同步已选择的 ${selectedSyncableStageItems.length} 个子任务的下游真实状态，并刷新当前阶段表格。该操作不会触发执行动作，是否继续？`,
      confirmText: '确认同步',
      cancelText: '取消',
    });
    if (!confirmed) return;
    setActionLoading('sync-selected-items');
    setError(null);
    try {
      for (const item of selectedSyncableStageItems) {
        await executionApi.binarySecurity.syncDownstreamStatus(projectId, taskId, {
          stage_name: item.stage_name,
          item_id: item.id,
        });
      }
      await refreshActiveTab();
    } catch (e: any) {
      setError(e?.message || '批量同步下游状态失败');
    } finally {
      setActionLoading('');
    }
  };

  const confirmModuleSelection = async () => {
    if (!projectId || !taskId) return;
    if (!moduleConfirmSupported) {
      setError(manualOperationState?.blocking_reason || '当前任务暂不可确认模块');
      return;
    }
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
  const stageSummaryByName = useMemo(
    () => new Map((detail?.stage_summaries || []).map((summary) => [summary.stage_name, summary])),
    [detail?.stage_summaries],
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
  const archiveRetryFailedSupported = Boolean(selectedArchiveNode?.retry_failed_supported && manualOperationState?.can_retry_archive_failed_items !== false);
  const archiveRetryFailedReason = !manualOperationState?.can_retry_archive_failed_items
    ? (manualOperationState?.blocking_reason || '当前任务暂不可进行归档失败项重试')
    : (selectedArchiveNode?.retry_failed_reason || undefined);
  const archiveRetryFullSupported = Boolean(selectedArchiveNode?.retry_full_supported && manualOperationState?.can_retry_archive_full !== false);
  const archiveRetryFullReason = !manualOperationState?.can_retry_archive_full
    ? (manualOperationState?.blocking_reason || '当前任务暂不可进行归档阶段完全重试')
    : (selectedArchiveNode?.retry_full_reason || undefined);
  const requiresModuleConfirmation = detail?.status === 'pending_module_confirmation' && Boolean(moduleSelection?.requires_confirmation);
  const systemAnalysisModules = moduleSelection?.system_analysis_modules || [];
  const candidateModules = moduleSelection?.candidate_modules || [];
  const selectedModules = moduleSelection?.selected_modules || [];
  const moduleRiskLevels = (moduleSelection?.risk_levels?.length ? moduleSelection.risk_levels : detail?.selected_risk_levels) || [];
  const systemAnalysisModuleCount = systemAnalysisModules.length || Number(detail?.summary?.system_analysis_module_count || 0);
  const entryAnalysisEntryCountByItemKey = useMemo(() => {
    const mapping = new Map<string, number>();
    const entryResults = Array.isArray(detail?.summary?.entry_results) ? detail.summary.entry_results : [];
    for (const row of entryResults) {
      if (!row || typeof row !== 'object') continue;
      const itemKey = String((row as any).module_key || '').trim();
      if (!itemKey) continue;
      const explicit = Number((row as any).entry_count);
      const entries = Array.isArray((row as any).entries) ? (row as any).entries.length : NaN;
      const value = Number.isFinite(explicit) ? Math.trunc(explicit) : Number.isFinite(entries) ? Math.trunc(entries) : null;
      if (value != null) mapping.set(itemKey, value);
    }
    return mapping;
  }, [detail?.summary]);

  const filteredStageItems = useMemo(() => {
    if (!detail) return [];
    if (selectedNodeKind === 'business' && stageItemsPage?.stage_name === selectedStage) {
      return stageItemsPage.items || [];
    }
    return detail.stage_items.filter((item) => item.stage_name === selectedStage);
  }, [detail, selectedNodeKind, selectedStage, stageItemsPage]);
  const stageStatusOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of filteredStageItems) {
      counts.set(item.status, (counts.get(item.status) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))
      .map(([status, count]) => ({ status, count }));
  }, [filteredStageItems]);
  const visibleStageItems = useMemo(() => {
    if (stageStatusFilter === 'all') return filteredStageItems;
    return filteredStageItems.filter((item) => item.status === stageStatusFilter);
  }, [filteredStageItems, stageStatusFilter]);
  const stageItemsTotal = selectedNodeKind === 'business' && stageItemsPage?.stage_name === selectedStage
    ? Number(stageItemsPage.total || 0)
    : filteredStageItems.length;
  const stageItemsTotalPages = Math.max(1, Math.ceil(stageItemsTotal / STAGE_ITEMS_PER_PAGE));
  const isSystemAnalysisStageTable = selectedStage === 'system_analysis';
  const isEntryAnalysisStageTable = selectedStage === 'entry_analysis';
  const selectedVisibleStageItems = useMemo(
    () => visibleStageItems.filter((item) => selectedStageItemIds.includes(item.id)),
    [selectedStageItemIds, visibleStageItems],
  );
  const selectedSyncableStageItems = useMemo(
    () => selectedVisibleStageItems.filter((item) => Boolean(item.downstream_task_id)),
    [selectedVisibleStageItems],
  );

  const timelineItems = useMemo(() => {
    return timeline.map((event, index) => ({
      ...event,
      _key: event.id || `${event.event_type || 'event'}-${event.created_at || index}-${index}`,
      _index: index + 1,
      _eventLabel: formatTimelineEventTypeLabel(event.event_type),
      _sourceLabel: event.item_key || event.item_id || event.payload?.item_key || event.payload?.downstream_task_id || '-',
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
    setExpandedStageItemId(null);
    setSelectedStageItemIds([]);
    setStageStatusFilter('all');
    setStageItemsCurrentPage(1);
  }, [selectedStage, selectedNodeKind, taskId]);

  useEffect(() => {
    const validIds = new Set(filteredStageItems.map((item) => item.id));
    setSelectedStageItemIds((current) => current.filter((id) => validIds.has(id)));
  }, [filteredStageItems]);

  useEffect(() => {
    if (timelinePage > timelineTotalPages) {
      setTimelinePage(timelineTotalPages);
    }
  }, [timelinePage, timelineTotalPages]);

  const executeBlockingTaskAction = async (action: Exclude<BlockingActionKind, ''>) => {
    if (!projectId || !taskId) return;
    setActionLoading(action);
    setBlockingAction(action);
    setPendingBlockingAction('');
    setError(null);
    try {
      const result = action === 'retry'
        ? await executionApi.binarySecurity.retryTask(projectId, taskId)
        : await executionApi.binarySecurity.retryFailedItems(projectId, taskId);
      setNotice(result?.message || '任务操作已受理，后台正在处理中');
      await refreshActiveTab();
    } catch (e: any) {
      setError(e?.message || `${action} 失败`);
    } finally {
      setBlockingAction('');
      setActionLoading('');
    }
  };

  const openDownstreamTaskDetail = (item: BinarySecurityTaskDetail['stage_items'][number]) => {
    const downstreamTaskId = item.downstream_task_id?.trim();
    const detailSupport = downstreamDetailSupport(item.stage_name, downstreamTaskId);
    if (!downstreamTaskId || !detailSupport.supported) return;
    saveBinarySecurityReturnContext({
      view: taskType === 'source' ? 'source-security-detail' : taskType === 'binary_module' ? 'binary-module-security-detail' : 'binary-security-detail',
      taskId,
      taskType,
    });
    clearExecutionReturnContext();
    if (item.stage_name === 'firmware_unpack') {
      sessionStorage.setItem('secflow:firmwareUnpackerTaskId', downstreamTaskId);
      window.dispatchEvent(new CustomEvent('secflow-navigate-view', {
        detail: {
          view: 'pentest-exec-firmware-unpacker',
          firmwareUnpackerTaskId: downstreamTaskId,
        },
      }));
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

  const renderModuleTable = (
    title: string,
    rows: BinarySecurityModuleContract[],
    emptyText: string,
    options?: { selectable?: boolean },
  ) => (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <div className="text-sm font-black text-slate-900">{title}</div>
          <div className="mt-1 text-xs text-slate-500">{rows.length} 个模块</div>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-slate-400">{emptyText}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">
              <tr>
                {options?.selectable ? <th className="w-14 px-4 py-3">选择</th> : null}
                <th className="min-w-[220px] px-4 py-3">模块</th>
                <th className="w-32 px-4 py-3">主结果类型</th>
                <th className="min-w-[220px] px-4 py-3">结果类型</th>
                <th className="min-w-[220px] px-4 py-3">类型计数</th>
                <th className="w-24 px-4 py-3">风险</th>
                <th className="w-24 px-4 py-3">分数</th>
                <th className="min-w-[280px] px-4 py-3">输入 Contract</th>
                <th className="min-w-[220px] px-4 py-3">模块键</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((module, index) => {
                const moduleKey = moduleContractKey(module, index);
                const checked = selectedModuleKeys.includes(moduleKey);
                const primaryResultKind = moduleContractText(module, 'primary_result_kind') || '';
                const resultKinds = moduleContractList(module, 'result_kinds');
                const artifactKindSummary = moduleArtifactKindSummary(module);
                const contractRows = moduleContractInputRows(module);
                return (
                  <tr key={moduleKey} className={checked ? 'bg-amber-50/50' : 'bg-white'}>
                    {options?.selectable ? (
                      <td className="px-4 py-3 align-top">
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
                      </td>
                    ) : null}
                    <td className="px-4 py-3 align-top">
                      <div className="font-bold text-slate-900">{moduleContractText(module, 'module_name') || moduleKey}</div>
                      <div className="mt-1 text-[11px] text-slate-500">{moduleContractText(module, 'module_type', 'language') || '-'}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-1 font-bold text-sky-700">
                        {RESULT_KIND_LABELS[primaryResultKind] || primaryResultKind || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap gap-1.5">
                        {resultKinds.length ? resultKinds.map((kind) => (
                          <span key={kind} className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
                            {RESULT_KIND_LABELS[kind] || kind}
                          </span>
                        )) : <span className="text-slate-400">-</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-[11px] text-slate-600">
                      <div className="space-y-1">
                        {artifactKindSummary.length ? artifactKindSummary.map(([kind, value]) => (
                          <div key={kind} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-2.5 py-1.5">
                            <span className="font-medium text-slate-500">{kind}</span>
                            <span className="font-black text-slate-800">{String(value ?? 0)}</span>
                          </div>
                        )) : <span className="text-slate-400">-</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={`inline-flex rounded-full border px-2 py-1 font-bold ${statusTone(moduleContractText(module, 'risk_level') || 'pending')}`}>
                        {moduleContractText(module, 'risk_level') || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top font-bold text-slate-700">{moduleContractNumber(module, 'risk_score') ?? '-'}</td>
                    <td className="px-4 py-3 align-top text-[11px] text-slate-500">
                      <div className="space-y-1 font-mono">
                        {contractRows.map((row) => (
                          <div key={`${moduleKey}-${row.label}`} className="break-all">
                            <span className="font-semibold text-slate-400">{row.label}:</span>{' '}
                            {row.value}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top font-mono text-[11px] text-slate-500">{moduleKey}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  if (!taskId) {
    return <div className="px-8 pb-10 pt-8 text-sm text-slate-500">未指定任务。</div>;
  }

  const tabs: Array<{ key: DetailTab; label: string; hint: string }> = [
    { key: 'overview', label: '总览', hint: '任务基础信息与阶段任务' },
    { key: 'strategy', label: '任务策略', hint: '仅影响后续阶段与下次运行' },
    { key: 'modules', label: '高危模块', hint: '系统分析候选、已选与确认操作' },
    { key: 'orchestration', label: '编排观测', hint: 'Reducer、事件队列、锁与归档健康' },
    { key: 'timeline', label: '事件时间线', hint: '编排事件记录' },
    { key: 'artifacts', label: '产物文件', hint: '归档输出文件' },
  ];
  const modalAction = blockingAction || pendingBlockingAction;
  const modalCopy = modalAction ? BLOCKING_ACTION_COPY[modalAction] : null;
  const modalRunning = Boolean(blockingAction);

  return (
    <div className="px-8 pb-10 pt-8 space-y-6">
      {modalAction && modalCopy ? (
        <div className="fixed inset-0 z-[120] bg-slate-950/50 backdrop-blur-sm">
          <div className="flex h-full w-full items-center justify-center p-4 sm:p-6">
            <div className="flex w-full max-w-5xl max-h-[calc(100vh-3rem)] flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_32px_120px_-32px_rgba(15,23,42,0.6)] sm:max-h-[calc(100vh-4rem)]">
              <div className="border-b border-slate-200 bg-slate-50/80 px-6 py-5 sm:px-8">
                <div className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">Task Action</div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="rounded-2xl bg-sky-50 p-3 text-sky-600">
                    <Loader2 size={24} className={modalRunning ? 'animate-spin' : ''} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black tracking-tight text-slate-900">
                      {modalRunning ? modalCopy.progressTitle : modalCopy.confirmTitle}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {taskDetailViewLabel(taskType)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-auto px-6 py-6 sm:px-8 sm:py-8">
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_320px]">
                  <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 sm:p-6">
                    <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">
                      {modalRunning ? '执行中' : '确认操作'}
                    </div>
                    <p className="mt-4 text-base leading-7 text-slate-700">
                      {modalRunning ? modalCopy.progressMessage : modalCopy.confirmMessage}
                    </p>
                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">任务</div>
                        <div className="mt-2 break-all font-mono text-xs text-slate-700">{taskId}</div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">当前阶段</div>
                        <div className="mt-2 font-bold text-slate-900">
                          {STAGE_LABELS[detail?.current_stage || ''] || detail?.current_stage || '-'}
                        </div>
                      </div>
                    </div>
                    <div className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                      {modalRunning
                        ? '请求正在提交，接口返回后页面会立即恢复，由后台继续完成准备。'
                        : '确认后接口会立即受理，后台准备完成后任务会自动重新排队。'}
                    </div>
                  </div>
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5 sm:p-6">
                    <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">状态</div>
                    <div className="mt-4 space-y-3">
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <div className="text-xs font-bold text-slate-400">任务名称</div>
                        <div className="mt-1 text-sm font-black text-slate-900">{detail?.name || '-'}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <div className="text-xs font-bold text-slate-400">当前状态</div>
                        <div className="mt-2">
                          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${statusTone(detail?.status || '')}`}>
                            {detail?.status || '-'}
                          </span>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <div className="text-xs font-bold text-slate-400">操作类型</div>
                        <div className="mt-1 text-sm font-black text-slate-900">
                          {modalAction === 'retry' ? '清空并从头开始' : '重试失败项'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-8 flex flex-wrap justify-end gap-3">
                  {!modalRunning ? (
                    <button
                      type="button"
                      onClick={() => setPendingBlockingAction('')}
                      className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                    >
                      取消
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={modalRunning}
                    onClick={() => {
                      if (!pendingBlockingAction) return;
                      void executeBlockingTaskAction(pendingBlockingAction);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {modalRunning ? <Loader2 size={16} className="animate-spin" /> : null}
                    {modalRunning ? '处理中...' : modalCopy.confirmText}
                  </button>
                </div>
              </div>
            </div>
	          </div>
	        </div>
	      ) : null}
	      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
          <ArrowLeft size={16} />
          返回任务列表
        </button>
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => void refreshActiveTab()}
            disabled={detailRefreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {detailRefreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {detailRefreshing ? '刷新中...' : '刷新'}
          </button>
          <button
            type="button"
            onClick={() => void syncDownstreamStatus()}
            title={manualOperationState?.blocking_reason || undefined}
            disabled={actionLoading !== '' || isPreparing}
            className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-bold text-sky-700 disabled:opacity-60"
          >
            <RefreshCw size={16} />
            同步下游状态
          </button>
          <button type="button" title={taskCancelSupported ? undefined : (manualOperationState?.blocking_reason || '当前任务不可取消')} onClick={() => void runAction('cancel')} disabled={actionLoading !== '' || !taskCancelSupported || isPreparing} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700 disabled:opacity-60">取消</button>
          <button
            type="button"
            title={taskRetrySupported ? undefined : taskRetryReason}
            onClick={() => setPendingBlockingAction('retry')}
            disabled={actionLoading !== '' || !taskRetrySupported || isPreparing}
            className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-60"
          >
            清空并从头开始
          </button>
          <button
            type="button"
            title={taskRetryFailedItemsSupported ? undefined : taskRetryFailedItemsReason}
            onClick={() => setPendingBlockingAction('retry_failed_items')}
            disabled={actionLoading !== '' || !taskRetryFailedItemsSupported || isPreparing}
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 disabled:opacity-60"
          >
            {actionLoading === 'retry_failed_items' ? '重试中...' : '重试失败项'}
          </button>
          <button type="button" title={taskDeleteSupported ? undefined : (manualOperationState?.blocking_reason || '当前任务不可删除')} onClick={() => void runAction('delete')} disabled={actionLoading !== '' || !taskDeleteSupported || isPreparing} className="rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-sm font-bold text-rose-700 disabled:opacity-60">删除</button>
        </div>
      </div>

      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</div>}
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}

      {loading && !detail ? (
        <div className="text-sm text-slate-500">加载中...</div>
      ) : detail ? (
        <>
          <section className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)] xl:items-start">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-600">Binary Security Detail</p>
                <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900">{detail.name}</h1>
                <div className="mt-2 break-all font-mono text-xs text-slate-400">{detail.id}</div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusTone(detail.status)}`}>{formatBinarySecurityStatus(detail.status)}</span>
                  <span className="text-sm text-slate-500">当前阶段：{STAGE_LABELS[detail.current_stage || ''] || detail.current_stage || '-'}</span>
                </div>
                {detail.status === 'continue_preparing' ? (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    正在继续任务准备。后台正在定位下一个可执行阶段并清理必要结果。
                  </div>
                ) : null}
                {detail.status === 'retry_preparing' ? (
                  <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
                    正在准备重试。后台正在按当前选择的重试类型清理阶段、归档和下游任务，完成后会自动重新排队。
                  </div>
                ) : null}
                {detail.abnormal_reason ? (
                  <div className="mt-4">
                    <AbnormalReasonCard reason={detail.abnormal_reason} history={detail.abnormal_reason_history} />
                  </div>
                ) : taskStatusReason ? (
                  <div className="mt-4">
                    <TaskStatusReasonCard reason={taskStatusReason} />
                  </div>
                ) : null}
                {manualOperationState ? (
                  <div className="mt-4">
                    <ManualOperationStateCard state={manualOperationState} />
                  </div>
                ) : null}
                <div className="mt-4 grid gap-2">
                  <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{isSourceTask ? '源码目录' : isBinaryModuleTask ? '模块输入目录' : '输入目录'}</div>
                    <div className="mt-1 break-all font-mono text-xs text-slate-700">{detail.firmware_path}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">产物目录</div>
                    <div className="mt-1 break-all font-mono text-xs text-slate-700">{detail.output_root}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{isBinaryModuleTask ? '模块输入' : '模块策略'}</div>
                    <div className="mt-1 text-xs text-slate-700">
                      {isBinaryModuleTask
                        ? `模块级直接输入 · 模块名：${String((detail.summary as any)?.module_input?.module_name || detail.name || '-').trim() || '-'}`
                        : `${detail.module_selection_mode === 'manual_confirm' ? '系统分析后人工确认' : '按风险自动推进'} · 风险等级：${(detail.selected_risk_levels || []).join(' / ') || '-'}`}
                    </div>
                  </div>
                </div>
              </div>
              <div className="min-w-0 grid grid-cols-2 gap-2">
                <div className="min-w-0 rounded-2xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                  <div className="text-slate-400">创建时间</div>
                  <div className="mt-1 break-words font-bold text-slate-900">{fmt(detail.created_at)}</div>
                </div>
                <div className="min-w-0 rounded-2xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                  <div className="text-slate-400">完成时间</div>
                  <div className="mt-1 break-words font-bold text-slate-900">{fmt(detail.finished_at)}</div>
                </div>
                <div className="min-w-0 rounded-2xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                  <div className="text-slate-400">{isSourceTask ? '源码文件数' : isBinaryModuleTask ? 'ELF 数量' : '固件数量'}</div>
                  <div className="mt-1 break-words text-lg font-black text-slate-900">{detail.firmware_item_count}</div>
                </div>
                <div className="min-w-0 rounded-2xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                  <div className="text-slate-400">{isSourceTask ? '入口数量' : isBinaryModuleTask ? '当前模式' : '已解包/失败'}</div>
                  <div className="mt-1 break-words text-lg font-black text-slate-900">{isSourceTask ? detail.entry_count : isBinaryModuleTask ? '模块级' : `${detail.unpacked_firmware_count} / ${detail.failed_firmware_count}`}</div>
                </div>
                <div className="min-w-0 rounded-2xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                  <div className="text-slate-400">{isBinaryModuleTask ? '模块数量' : '已选模块'}</div>
                  <div className="mt-1 break-words text-lg font-black text-slate-900">{isBinaryModuleTask ? Math.max(1, detail.selected_module_count || 1) : detail.selected_module_count}</div>
                </div>
                <div className="min-w-0 rounded-2xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                  <div className="text-slate-400">{isBinaryModuleTask ? '候选模块' : '高危模块'}</div>
                  <div className="mt-1 break-words text-lg font-black text-slate-900">{isBinaryModuleTask ? Math.max(1, detail.candidate_module_count || 1) : detail.high_risk_module_count}</div>
                </div>
                <div className="min-w-0 rounded-2xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                  <div className="text-slate-400">漏洞结果</div>
                  <div className="mt-1 break-words text-lg font-black text-slate-900">{detail.vuln_result_count}</div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[1.5rem] border border-slate-200 bg-white p-2 shadow-sm">
            <div
              className="grid grid-flow-col auto-cols-[minmax(220px,1fr)] gap-2 overflow-x-auto"
              style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(220px, 1fr))` }}
            >
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

          {activeTab === 'strategy' && strategyDraft ? (
            <section className="space-y-6">
              <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                <div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900">任务策略</h2>
                    <p className="mt-2 text-sm text-slate-500">
                      任务策略只会影响尚未开始的阶段、继续任务、阶段重试和清空重跑后的重新调度，不会改写已完成阶段或正在运行中的阶段项。
                    </p>
                  </div>
                </div>
                <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
                  strategyEditable
                    ? 'border-sky-200 bg-sky-50 text-sky-800'
                    : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}>
                  {strategyEditable
                    ? `任务级并发配置、阶段启停${isBinaryModuleTask ? '' : '和模块推进策略'}按分块保存；保存后不会修改已完成阶段，也不会实时改写正在运行中的子任务池。`
                    : strategyBlockedReason}
                </div>
                {strategyDirty ? (
                  <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    当前存在未保存的策略修改。请在对应模块内分别保存。
                  </div>
                ) : null}
              </section>

              <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-slate-100 p-3 text-slate-600">
                      <SlidersHorizontal size={18} />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900">阶段启停</h3>
                      <p className="mt-1 text-sm text-slate-500">控制当前任务后续阶段是否继续参与流程；已完成阶段仅做展示，修改只对后续执行生效。</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => resetStrategySection('stage_options')}
                      disabled={!stageOptionsDirty || Boolean(strategySavingSection)}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                    >
                      重置阶段启停
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveTaskPolicySection('stage_options')}
                      disabled={!strategyEditable || !stageOptionsDirty || Boolean(strategySavingSection)}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
                    >
                      {strategySavingSection === 'stage_options' ? <Loader2 size={16} className="animate-spin" /> : null}
                      {strategySavingSection === 'stage_options' ? '保存中...' : '保存阶段启停'}
                    </button>
                  </div>
                </div>
                <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                  {stageSequence.map((stageName) => {
                    const summary = stageSummaryByName.get(stageName);
                    const summaryStatus = String(summary?.status || '');
                    const stageFinished = ['success', 'partial_success', 'failed', 'delete_failed', 'cancelled', 'skipped', 'downstream_missing'].includes(summaryStatus);
                    const stageActive = ['running', 'dispatching', 'queued', 'pending', 'waiting_confirmation'].includes(summaryStatus);
                    const stageMessage = stageActive
                      ? '运行中，本次修改仅影响后续/下次'
                      : stageFinished
                        ? '已完成，不受本次修改影响'
                        : '尚未开始，修改会在后续执行时生效';
                    return (
                      <label key={stageName} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-black text-slate-900">{STAGE_LABELS[stageName] || stageName}</div>
                            <div className="mt-1 text-xs text-slate-500">当前状态：{formatBinarySecurityStatus(summaryStatus || 'pending')}</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={strategyDraft.stage_options[stageName]?.enabled !== false}
                            disabled={!strategyEditable || Boolean(strategySavingSection)}
                            onChange={(event) => updateStrategyStageEnabled(stageName, event.target.checked)}
                          />
                        </div>
                        <div className="mt-4 grid gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-slate-400">开始时间</span>
                            <span className="font-mono text-right text-slate-700">{fmt(summary?.started_at)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-slate-400">结束时间</span>
                            <span className="font-mono text-right text-slate-700">{fmt(summary?.finished_at)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-slate-400">耗时</span>
                            <span className="text-right font-black text-slate-900">{durationLabel(summary?.started_at, summary?.finished_at)}</span>
                          </div>
                        </div>
                        <div className="mt-4 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                          {stageMessage}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </section>

              {!isBinaryModuleTask ? (
              <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">模块推进策略</h3>
                    <p className="mt-1 text-sm text-slate-500">与创建任务页保持一致，只影响后续模块筛选、人工确认与自动推进行为。</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => resetStrategySection('module_strategy')}
                      disabled={!moduleStrategyDirty || Boolean(strategySavingSection)}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                    >
                      重置模块策略
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveTaskPolicySection('module_strategy')}
                      disabled={!strategyEditable || !moduleStrategyDirty || Boolean(strategySavingSection)}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
                    >
                      {strategySavingSection === 'module_strategy' ? <Loader2 size={16} className="animate-spin" /> : null}
                      {strategySavingSection === 'module_strategy' ? '保存中...' : '保存模块策略'}
                    </button>
                  </div>
                </div>
                <div className="mt-5 grid gap-5 xl:grid-cols-2">
                  <div>
                    <div className="text-sm font-bold text-slate-800">推进方式</div>
                    <div className="mt-3 grid gap-2">
                      {MODULE_SELECTION_OPTIONS.map((option) => (
                        <label key={option.value} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                          <input
                            type="radio"
                            name="taskStrategyModuleSelection"
                            checked={strategyDraft.module_selection_mode === option.value}
                            disabled={!strategyEditable || Boolean(strategySavingSection)}
                            onChange={() => setStrategyDraft((current) => (current ? { ...current, module_selection_mode: option.value as 'auto' | 'manual_confirm' } : current))}
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-800">风险等级</div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {MODULE_RISK_OPTIONS.map((risk) => (
                        <label key={risk} className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                          <input
                            type="checkbox"
                            checked={strategyDraft.module_risk_levels.includes(risk)}
                            disabled={!strategyEditable || Boolean(strategySavingSection)}
                            onChange={(event) => {
                              setStrategyDraft((current) => {
                                if (!current) return current;
                                const nextLevels = event.target.checked
                                  ? (current.module_risk_levels.includes(risk) ? current.module_risk_levels : current.module_risk_levels.concat(risk))
                                  : current.module_risk_levels.filter((item) => item !== risk);
                                return { ...current, module_risk_levels: nextLevels };
                              });
                            }}
                          />
                          {risk}
                        </label>
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      至少选择一个风险等级；若选择人工确认，系统分析完成后再确认最终推进模块。
                    </div>
                  </div>
                </div>
              </section>
              ) : null}

              <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">任务并发与失败处理</h3>
                    <p className="mt-1 text-sm text-slate-500">这里配置的是任务级阶段并发，不是服务全局并发；仅影响尚未开始的阶段、继续、阶段重试与清空重跑。</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => resetStrategySection('execution_policy')}
                      disabled={!executionPolicyDirty || Boolean(strategySavingSection)}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                    >
                      重置并发策略
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveTaskPolicySection('execution_policy')}
                      disabled={!strategyEditable || !executionPolicyDirty || Boolean(strategySavingSection)}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
                    >
                      {strategySavingSection === 'execution_policy' ? <Loader2 size={16} className="animate-spin" /> : null}
                      {strategySavingSection === 'execution_policy' ? '保存中...' : '保存并发策略'}
                    </button>
                  </div>
                </div>
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  阶段并发按当前任务流程分别生效；源码任务只展示源码流程阶段，二进制任务展示完整流程阶段，模块任务展示模块级四阶段流程。
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {stageSequence.map((stageName) => (
                    <label key={stageName} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <span className="block text-sm font-black text-slate-800">{STAGE_LABELS[stageName] || stageName}</span>
                      <span className="mt-1 block text-xs text-slate-500">任务级阶段并发，范围 1-32</span>
                      <input
                        type="number"
                        min={1}
                        max={32}
                        value={strategyDraft.stage_parallelism[stageName] ?? 1}
                        disabled={!strategyEditable || Boolean(strategySavingSection)}
                        onChange={(event) => updateStrategyStageParallelism(stageName, Number(event.target.value || 1))}
                        className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-slate-400"
                      />
                    </label>
                  ))}
                  <label className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <span className="block text-sm font-black text-slate-800">子任务重试次数</span>
                    <span className="mt-1 block text-xs text-slate-500">单轮执行内的自动重试上限，范围 0-20</span>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={strategyDraft.max_retries_per_item}
                      disabled={!strategyEditable || Boolean(strategySavingSection)}
                      onChange={(event) => {
                        const value = Math.max(0, Math.min(20, Number(event.target.value) || 0));
                        setStrategyDraft((current) => (current ? { ...current, max_retries_per_item: value } : current));
                      }}
                      className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-slate-400"
                    />
                  </label>
                </div>
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                  阶段子任务表中的“累计重跑”是该条目历史上被重新执行的累计次数；它不同于这里配置的“单轮自动重试上限”。
                </div>
                <label className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={strategyDraft.continue_on_item_failure}
                    disabled={!strategyEditable || Boolean(strategySavingSection)}
                    onChange={(event) => setStrategyDraft((current) => (current ? { ...current, continue_on_item_failure: event.target.checked } : current))}
                  />
                  子任务失败时继续推进其他子任务
                </label>
                <div className="mt-4 grid gap-3 xl:grid-cols-2">
                  {PARTIAL_SUCCESS_ADVANCEMENT_FIELDS.filter((field) => stageSequence.includes(field.key)).map((field) => (
                    <label key={field.key} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={strategyDraft.partial_success_stage_advancement[field.key] !== false}
                        disabled={!strategyEditable || Boolean(strategySavingSection)}
                        onChange={(event) => setStrategyDraft((current) => (
                          current
                            ? {
                                ...current,
                                partial_success_stage_advancement: {
                                  ...current.partial_success_stage_advancement,
                                  [field.key]: event.target.checked,
                                },
                              }
                            : current
                        ))}
                      />
                      {field.label}
                    </label>
                  ))}
                </div>
              </section>
            </section>
          ) : null}

          {activeTab === 'overview' ? (
            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black text-slate-900">任务总览</h2>
              <p className="mt-2 text-sm text-slate-500">总览包含任务主详情、阶段流转和下游子任务；事件记录和产物文件会在打开对应 Tab 后再请求后端。</p>
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <div className="text-xs font-bold text-slate-400">任务类型</div>
                  <div className="mt-1 font-black text-slate-900">{taskTypeLabel(taskType)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <div className="text-xs font-bold text-slate-400">执行代次</div>
                  <div className="mt-1 font-black text-slate-900">第 {detail.execution_epoch} 轮</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <div className="text-xs font-bold text-slate-400">阶段数</div>
                  <div className="mt-1 font-black text-slate-900">{stageSequence.length}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <div className="text-xs font-bold text-slate-400">当前状态</div>
                  <div className="mt-1 font-black text-slate-900">{formatBinarySecurityStatus(detail.status)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <div className="text-xs font-bold text-slate-400">队列位置</div>
                  <div className="mt-1 font-black text-slate-900">{detail.is_queued ? `第 ${detail.queue_position || '-'} 位` : '未排队'}</div>
                </div>
              </div>
            </section>
          ) : null}

          {activeTab === 'overview' && cleanupSnapshot && (cleanupDownstreamRefs.length > 0 || Object.keys(cleanupCounts).length > 0) ? (
            <section className="rounded-[2rem] border border-orange-200 bg-orange-50/60 p-6 shadow-sm">
              <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h3 className="text-lg font-black text-slate-900">严格清理快照</h3>
                  <p className="mt-1 text-sm text-slate-600">本次“清空并从头开始”会先删除旧执行世界，再进入新的执行代次。</p>
                </div>
                <div className="text-xs font-semibold text-slate-500">{cleanupSnapshot.requested_at ? `记录时间：${fmt(cleanupSnapshot.requested_at)}` : '记录时间：-'}</div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-orange-200 bg-white px-4 py-3 text-sm">
                  <div className="text-xs font-bold text-slate-400">上一执行代次</div>
                  <div className="mt-1 font-black text-slate-900">第 {cleanupSnapshot.previous_epoch ?? '-'} 轮</div>
                </div>
                <div className="rounded-2xl border border-orange-200 bg-white px-4 py-3 text-sm">
                  <div className="text-xs font-bold text-slate-400">下游清理目标</div>
                  <div className="mt-1 font-black text-slate-900">{cleanupDownstreamRefs.length}</div>
                </div>
                <div className="rounded-2xl border border-orange-200 bg-white px-4 py-3 text-sm">
                  <div className="text-xs font-bold text-slate-400">阶段子任务删除</div>
                  <div className="mt-1 font-black text-slate-900">{cleanupCounts.stage_items_deleted ?? '-'}</div>
                </div>
                <div className="rounded-2xl border border-orange-200 bg-white px-4 py-3 text-sm">
                  <div className="text-xs font-bold text-slate-400">归档记录删除</div>
                  <div className="mt-1 font-black text-slate-900">{cleanupCounts.archive_jobs_deleted ?? '-'}</div>
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-orange-200 bg-white px-4 py-3 text-sm">
                  <div className="text-xs font-bold text-slate-400">阶段运行记录删除</div>
                  <div className="mt-1 font-black text-slate-900">{cleanupCounts.stage_runs_deleted ?? '-'}</div>
                </div>
                <div className="rounded-2xl border border-orange-200 bg-white px-4 py-3 text-sm">
                  <div className="text-xs font-bold text-slate-400">时间线事件删除</div>
                  <div className="mt-1 font-black text-slate-900">{cleanupCounts.timeline_events_deleted ?? '-'}</div>
                </div>
                <div className="rounded-2xl border border-orange-200 bg-white px-4 py-3 text-sm">
                  <div className="text-xs font-bold text-slate-400">状态事件删除</div>
                  <div className="mt-1 font-black text-slate-900">{cleanupCounts.state_events_deleted ?? '-'}</div>
                </div>
              </div>
            </section>
          ) : null}

          {activeTab === 'overview' ? (
            <>
          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900">阶段概览</h2>
                <p className="mt-1 text-sm text-slate-500">点击阶段筛选下方子任务；阶段重试会重跑当前阶段全部子任务，并尽量复用当前阶段旧下游任务，后续阶段会等待当前阶段完成后重新推进。</p>
              </div>
            </div>
            {!detail.task_retry_supported && detail.task_retry_reason ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                总任务“清空并从头开始”不可用：{detail.task_retry_reason}
              </div>
            ) : null}

            <div ref={stageFlowRef} className="mt-6 overflow-x-auto">
              <div className={stageFlowLayout.mode === 'horizontal' ? 'inline-flex items-center justify-start pb-2 pr-2' : 'flex flex-col items-stretch'}>
                {stageDisplayNodes.map((stage, index) => (
                  <React.Fragment key={stage.id}>
                    <div
                      style={stageFlowLayout.mode === 'horizontal'
                        ? { width: `${stage.kind === 'archive' ? ARCHIVE_STAGE_CARD_WIDTH : stageFlowLayout.cardWidth}px` }
                        : undefined}
                      className={stageFlowLayout.mode === 'horizontal' ? 'shrink-0' : 'w-full'}
                    >
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
                        className={`rounded-[1.75rem] border text-left transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none ${
                          stage.kind === 'archive'
                            ? stageFlowLayout.mode === 'horizontal'
                              ? 'flex min-h-[172px] flex-col justify-between p-4'
                              : 'mx-auto flex min-h-[172px] w-full max-w-[260px] flex-col justify-between p-4'
                            : stageFlowLayout.mode === 'horizontal'
                              ? 'p-4'
                              : 'w-full p-4'
                        } ${stageNodeTone(stage.status, selectedStage === stage.stage_name && selectedNodeKind === stage.kind)}`}
                      >
                        {stage.abnormal_reason ? (
                          <div className="mb-2">
                            <span className="inline-flex max-w-full rounded-full border border-current/15 bg-white/60 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em]">
                              <span className="truncate">{stage.abnormal_reason.code}</span>
                            </span>
                          </div>
                        ) : null}
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
                              <div className="flex items-center justify-between gap-2">
                                <span className="shrink-0 whitespace-nowrap opacity-60">开始</span>
                                <span className="shrink-0 whitespace-nowrap text-right font-mono">{fmt(stage.started_at)}</span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="shrink-0 whitespace-nowrap opacity-60">结束</span>
                                <span className="shrink-0 whitespace-nowrap text-right font-mono">{fmt(stage.finished_at)}</span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="shrink-0 whitespace-nowrap opacity-60">耗时</span>
                                <span className="shrink-0 whitespace-nowrap text-right font-black">{durationLabel(stage.started_at, stage.finished_at)}</span>
                              </div>
                            </div>
                            <div className="rounded-full border border-current/20 bg-white/60 px-2 py-1 text-center text-[10px] font-black leading-none">
                              {formatBinarySecurityStatus(stage.status_label || archiveStatusLabel(stage.status))}
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
                              <div className="flex items-center justify-between gap-2">
                                <span className="shrink-0 whitespace-nowrap opacity-60">开始</span>
                                <span className="shrink-0 whitespace-nowrap text-right font-mono">{fmt(stage.started_at)}</span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="shrink-0 whitespace-nowrap opacity-60">结束</span>
                                <span className="shrink-0 whitespace-nowrap text-right font-mono">{fmt(stage.finished_at)}</span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="shrink-0 whitespace-nowrap opacity-60">耗时</span>
                                <span className="shrink-0 whitespace-nowrap text-right font-black">{durationLabel(stage.started_at, stage.finished_at)}</span>
                              </div>
                            </div>
                            <div className="mt-3 rounded-full border border-current/20 bg-white/60 px-3 py-1 text-center text-[11px] font-black">
                              {formatBinarySecurityStatus(stage.status_label || stage.status)}
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-2">
                              {staleStages.has(stage.stage_name) ? (
                                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-700">
                                  结果已过期
                                </span>
                              ) : (
                                <span className="text-[11px] font-semibold opacity-70">点击查看子任务</span>
                              )}
                            </div>
                            {shouldShowStageRetryReason(stage.status, stage.retryable, stage.retry_reason) ? (
                              <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
                                {stage.retry_failed_reason || stage.retry_full_reason || stage.retry_reason}
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>
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
                <>
	              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-bold text-slate-400">阶段状态</div>
                  <div className="mt-1">
                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${statusTone(selectedBusinessStageNode.status)}`}>
                      {formatBinarySecurityStatus(selectedBusinessStageNode.status_label || selectedBusinessStageNode.status)}
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
                  {selectedBusinessStageNode.abnormal_reason ? (
                    <div className="mt-4">
                      <AbnormalReasonCard reason={selectedBusinessStageNode.abnormal_reason} />
                    </div>
                  ) : null}
                </>
	            ) : null}

	            <div className="mt-5 space-y-3">
              {selectedNodeKind === 'archive' ? (
                <>
                  {selectedArchiveNode ? (
                    <div className="space-y-3">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div className="text-sm font-semibold text-slate-500">
                          归档阶段支持“重试失败项”和“阶段完全重试”，都不会重跑业务子任务。
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            title={archiveRetryFailedReason}
                            className={`rounded-full px-4 py-2 text-sm font-black ${
                              archiveRetryFailedSupported && actionLoading === ''
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-200 text-slate-500'
                            }`}
                            onClick={() => {
                              if (!archiveRetryFailedSupported || actionLoading !== '') return;
                              void retryArchiveStageFailedItems(selectedStage);
                            }}
                            disabled={!archiveRetryFailedSupported || actionLoading !== ''}
                          >
                            {actionLoading === `archive-stage-failed:${selectedStage}` ? '归档重试中' : '重试失败项'}
                          </button>
                          <button
                            type="button"
                            title={archiveRetryFullReason}
                            className={`rounded-full px-4 py-2 text-sm font-black ${
                              archiveRetryFullSupported && actionLoading === ''
                                ? 'bg-slate-900 text-white'
                                : 'bg-slate-200 text-slate-500'
                            }`}
                            onClick={() => {
                              if (!archiveRetryFullSupported || actionLoading !== '') return;
                              void retryArchiveStageFull(selectedStage);
                            }}
                            disabled={!archiveRetryFullSupported || actionLoading !== ''}
                          >
                            {actionLoading === `archive-stage-full:${selectedStage}` ? '归档清理中' : '阶段完全重试'}
                          </button>
                        </div>
                      </div>
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
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <button
                            type="button"
                            title={
                              !manualOperationState?.can_retry_archive
                                ? (manualOperationState?.blocking_reason || '当前任务暂不可进行归档重试')
                                : (job.retry_reason || undefined)
                            }
                            className={`rounded-full px-3 py-1 text-xs font-black ${
                              job.retry_supported && manualOperationState?.can_retry_archive !== false && actionLoading === ''
                                ? 'bg-slate-900 text-white'
                                : 'bg-slate-200 text-slate-500'
                            }`}
                            onClick={() => {
                              if (!job.retry_supported || manualOperationState?.can_retry_archive === false || actionLoading !== '') return;
                              void retryArchiveJob(job);
                            }}
                            disabled={!job.retry_supported || manualOperationState?.can_retry_archive === false || actionLoading !== ''}
                          >
                            {actionLoading === `archive-job:${job.id}` ? '重试中' : '重试归档'}
                          </button>
                          <div className="whitespace-nowrap rounded-xl border border-slate-200 bg-white/80 px-3 py-2 font-mono text-xs text-slate-600">
                            {fmt(job.created_at)} {'->'} {fmt(job.completed_at || job.updated_at)}
                          </div>
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
                      {job.abnormal_reason ? (
                        <div className="mt-3">
                          <AbnormalReasonCard reason={job.abnormal_reason} />
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
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="text-sm font-semibold text-slate-500">
                    业务阶段支持“重试失败项”和“阶段完全重试”；会重跑当前阶段子任务，并在完成后重新评估后续阶段推进。
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      title={
                        manualOperationState?.can_retry_stage_failed_items === false
                          ? (manualOperationState?.blocking_reason || '当前任务暂不可重试失败项')
                          : (selectedBusinessStageNode?.retry_failed_reason || undefined)
                      }
                      className={`rounded-full px-4 py-2 text-sm font-black ${
                        selectedBusinessStageNode?.retry_failed_supported && manualOperationState?.can_retry_stage_failed_items !== false && actionLoading === ''
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 text-slate-500'
                      }`}
                      onClick={() => {
                        if (!selectedBusinessStageNode?.retry_failed_supported || manualOperationState?.can_retry_stage_failed_items === false || actionLoading !== '') return;
                        void retryStageFailedItems(selectedStage);
                      }}
                      disabled={!selectedBusinessStageNode?.retry_failed_supported || manualOperationState?.can_retry_stage_failed_items === false || actionLoading !== ''}
                    >
                      {actionLoading === `stage-failed:${selectedStage}` ? '重试中' : '重试失败项'}
                    </button>
                    <button
                      type="button"
                      title={
                        manualOperationState?.can_retry_stage_full === false
                          ? (manualOperationState?.blocking_reason || '当前任务暂不可完全重试')
                          : (selectedBusinessStageNode?.retry_full_reason || undefined)
                      }
                      className={`rounded-full px-4 py-2 text-sm font-black ${
                        selectedBusinessStageNode?.retry_full_supported && manualOperationState?.can_retry_stage_full !== false && actionLoading === ''
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-200 text-slate-500'
                      }`}
                      onClick={() => {
                        if (!selectedBusinessStageNode?.retry_full_supported || manualOperationState?.can_retry_stage_full === false || actionLoading !== '') return;
                        void retryStageFull(selectedStage);
                      }}
                      disabled={!selectedBusinessStageNode?.retry_full_supported || manualOperationState?.can_retry_stage_full === false || actionLoading !== ''}
                    >
                      {actionLoading === `stage-full:${selectedStage}` ? '重试中' : '阶段完全重试'}
                    </button>
                  </div>
                </div>
	              <div className="flex flex-col gap-3 rounded-[1.5rem] border border-slate-200 bg-slate-50/80 px-4 py-4 xl:flex-row xl:items-center xl:justify-between">
	                <div className="flex flex-wrap items-center gap-2">
	                  <button
	                    type="button"
	                    onClick={() => setStageStatusFilter('all')}
	                    className={`rounded-full border px-3 py-2 text-xs font-black transition ${
	                      stageStatusFilter === 'all'
	                        ? 'border-slate-900 bg-slate-900 text-white'
	                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
	                    }`}
	                  >
	                    全部 {filteredStageItems.length}
	                  </button>
	                  {stageStatusOptions.map((option) => (
	                    <button
	                      key={option.status}
	                      type="button"
	                      onClick={() => setStageStatusFilter(option.status)}
	                      className={`rounded-full border px-3 py-2 text-xs font-black transition ${
	                        stageStatusFilter === option.status
	                          ? 'border-slate-900 bg-slate-900 text-white'
	                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
	                      }`}
	                    >
	                      {formatBinarySecurityStatus(option.status)} {option.count}
	                    </button>
	                  ))}
	                </div>
	                <div className="flex flex-wrap items-center gap-2 text-xs">
	                  <span className="rounded-full border border-slate-200 bg-white px-3 py-2 font-bold text-slate-600">
	                    已选 {selectedVisibleStageItems.length} / 当前筛选 {visibleStageItems.length}
	                  </span>
	                  <button
	                    type="button"
	                    disabled={visibleStageItems.length === 0}
	                    onClick={() => setSelectedStageItemIds(visibleStageItems.map((item) => item.id))}
	                    className="rounded-full border border-slate-200 bg-white px-3 py-2 font-black text-slate-700 disabled:opacity-50"
	                  >
	                    全选当前筛选
	                  </button>
	                  <button
	                    type="button"
	                    disabled={selectedStageItemIds.length === 0}
	                    onClick={() => setSelectedStageItemIds([])}
	                    className="rounded-full border border-slate-200 bg-white px-3 py-2 font-black text-slate-700 disabled:opacity-50"
	                  >
	                    清空选择
	                  </button>
	                  <button
	                    type="button"
	                    disabled={actionLoading !== '' || selectedSyncableStageItems.length === 0}
	                    onClick={() => void batchSyncSelectedStageItems()}
	                    className="rounded-full border border-sky-200 bg-sky-50 px-3 py-2 font-black text-sky-700 disabled:opacity-50"
	                  >
	                    {actionLoading === 'sync-selected-items' ? '同步中...' : `批量同步状态 ${selectedSyncableStageItems.length > 0 ? `(${selectedSyncableStageItems.length})` : ''}`}
	                  </button>
	                </div>
	              </div>
                <div className="flex flex-col gap-3 rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="text-sm text-slate-500">
                    阶段子任务分页：
                    <span className="ml-2 font-bold text-slate-900">第 {stageItemsCurrentPage} / {stageItemsTotalPages} 页</span>
                    <span className="ml-2 text-slate-400">共 {stageItemsTotal} 条，每页 {STAGE_ITEMS_PER_PAGE} 条</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={stageItemsPageLoading || stageItemsCurrentPage <= 1}
                      onClick={() => setStageItemsCurrentPage((current) => Math.max(1, current - 1))}
                      className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-50"
                    >
                      上一页
                    </button>
                    <button
                      type="button"
                      disabled={stageItemsPageLoading || stageItemsCurrentPage >= stageItemsTotalPages}
                      onClick={() => setStageItemsCurrentPage((current) => Math.min(stageItemsTotalPages, current + 1))}
                      className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-50"
                    >
                      下一页
                    </button>
                  </div>
                </div>
                {stageItemsPageError ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                    {stageItemsPageError}
                  </div>
                ) : null}
	              {staleStages.has(selectedStage) ? (
	                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
	                  由于上游阶段 {STAGE_LABELS[detail.summary?.stale_from_stage || ''] || detail.summary?.stale_from_stage || '-'} 已重试，当前阶段结果基于旧上游产物。
	                </div>
	              ) : null}
	              {visibleStageItems.length === 0 ? (
	                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-400">
	                  {filteredStageItems.length === 0 ? '当前阶段暂无子任务' : '当前状态筛选下暂无子任务'}
	                </div>
	              ) : (
	                <div className="overflow-hidden rounded-[1.5rem] border border-slate-200">
	                  <div className="overflow-x-auto">
	                    <table className="min-w-[1200px] w-full divide-y divide-slate-100 text-left text-xs">
	                      <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">
	                        <tr>
	                          <th className="w-14 px-3 py-3">
	                            <input
	                              type="checkbox"
	                              checked={visibleStageItems.length > 0 && selectedVisibleStageItems.length === visibleStageItems.length}
	                              onChange={(event) => {
	                                if (event.target.checked) {
	                                  setSelectedStageItemIds(visibleStageItems.map((item) => item.id));
	                                  return;
	                                }
	                                setSelectedStageItemIds([]);
	                              }}
	                            />
	                          </th>
	                          <th className="w-24 px-3 py-3">状态</th>
	                          <th className="min-w-[260px] px-3 py-3">子任务</th>
	                          <th className="w-28 px-3 py-3">自动重试</th>
	                          <th className="w-32 px-3 py-3">累计重跑</th>
                          {isSystemAnalysisStageTable ? (
                            <>
                              <th className="w-28 px-3 py-3">高风险模块</th>
                              <th className="w-28 px-3 py-3">中风险模块</th>
                              <th className="w-28 px-3 py-3">低风险模块</th>
                            </>
                          ) : null}
                          {isEntryAnalysisStageTable ? <th className="w-24 px-3 py-3">入口数量</th> : null}
                          <th className="w-44 px-3 py-3">开始时间</th>
                          <th className="w-44 px-3 py-3">结束时间</th>
                          <th className="w-28 px-3 py-3">耗时</th>
                          <th className="w-44 px-3 py-3">上次同步时间</th>
                          <th className="w-28 px-3 py-3">同步状态</th>
                          <th className="w-52 px-3 py-3 text-right">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
	                        {visibleStageItems.map((item) => {
	                          const detailSupport = downstreamDetailSupport(item.stage_name, item.downstream_task_id);
	                          const expanded = expandedStageItemId === item.id;
	                          const checked = selectedStageItemIds.includes(item.id);
                            const riskCounts = systemAnalysisRiskCountLabels(downstreamByItemId[item.id]);
                            const contractRows = stageItemContractRows(item);
                            const inputContractRows = stageItemInputContractRows(item);
	                          return (
	                            <React.Fragment key={item.id}>
	                              <tr className="align-top transition hover:bg-slate-50/80">
	                                <td className="px-3 py-3">
	                                  <input
	                                    type="checkbox"
	                                    checked={checked}
	                                    onChange={(event) => {
	                                      setSelectedStageItemIds((current) => {
	                                        if (event.target.checked) {
	                                          return current.includes(item.id) ? current : current.concat(item.id);
	                                        }
	                                        return current.filter((id) => id !== item.id);
	                                      });
	                                    }}
	                                  />
	                                </td>
	                                <td className="px-3 py-3">
	                                  <div className="flex flex-col gap-2">
	                                    <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-black ${statusTone(item.status)}`}>
                                      {formatBinarySecurityStatus(item.status)}
                                    </span>
                                    <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-500">
                                      {STAGE_LABELS[item.stage_name] || item.stage_name}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-3 py-3">
                                  <div className="min-w-0">
                                    <div className="break-all text-sm font-black text-slate-900">
                                      {item.item_name || item.item_key}
                                    </div>
                                    <div className="mt-1 break-all font-mono text-[11px] text-slate-500">
                                      {item.item_key}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-3 font-bold text-slate-700">{item.auto_retry_count ?? item.retry_count ?? 0}</td>
                                <td className="px-3 py-3 font-bold text-slate-700">{item.rerun_count ?? 0}</td>
                                {isSystemAnalysisStageTable ? (
                                  <>
                                    <td className="px-3 py-3 font-black text-slate-900">{riskCounts.high}</td>
                                    <td className="px-3 py-3 font-black text-slate-900">{riskCounts.medium}</td>
                                    <td className="px-3 py-3 font-black text-slate-900">{riskCounts.low}</td>
                                  </>
                                ) : null}
                                {isEntryAnalysisStageTable ? (
                                  <td className="px-3 py-3 font-black text-slate-900">{stageItemEntryCountLabel(item, entryAnalysisEntryCountByItemKey)}</td>
                                ) : null}
                                <td className="whitespace-nowrap px-3 py-3 font-mono text-[11px] text-slate-600">{fmt(item.started_at)}</td>
                                <td className="whitespace-nowrap px-3 py-3 font-mono text-[11px] text-slate-600">{fmt(item.finished_at)}</td>
                                <td className="px-3 py-3 font-black text-slate-900">{durationLabel(item.started_at, item.finished_at)}</td>
                                <td className="whitespace-nowrap px-3 py-3 font-mono text-[11px] text-slate-600">{fmt(item.last_synced_at)}</td>
                                <td className="px-3 py-3">
                                  <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-black ${statusTone(
                                    item.sync_status === 'transport_error'
                                      ? 'failed'
                                      : item.sync_status === 'synced'
                                        ? 'success'
                                        : item.sync_status === 'skipped'
                                          ? 'cancelled'
                                          : item.sync_status === 'pending'
                                            ? 'pending'
                                            : 'queued'
                                  )}`}>
                                    {formatStageItemSyncStatus(item.sync_status)}
                                  </span>
                                </td>
                                <td className="px-3 py-3">
                                  <div className="flex flex-wrap items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setExpandedStageItemId(expanded ? null : item.id)}
                                      className="rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700 transition hover:bg-slate-50"
                                    >
                                      {expanded ? '收起详情' : '查看详情'}
                                    </button>
                                    {item.downstream_task_id ? (
                                      <button
                                        type="button"
                                        className="rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] font-black text-sky-700 disabled:opacity-60"
                                        disabled={actionLoading !== ''}
                                        onClick={() => void syncDownstreamStatus({ stageName: item.stage_name, itemId: item.id })}
                                      >
                                        同步状态
                                      </button>
                                    ) : null}
                                    {detailSupport.supported ? (
                                      <button
                                        type="button"
                                        className="rounded-full border border-slate-200 bg-slate-900 px-3 py-2 text-[11px] font-black text-white"
                                        onClick={() => openDownstreamTaskDetail(item)}
                                      >
                                        查看任务详情
                                      </button>
                                    ) : (
                                      <span
                                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-500"
                                        title={detailSupport.reason}
                                      >
                                        <Info className="h-3.5 w-3.5" />
                                        不支持跳转
                                      </span>
                                    )}
                                  </div>
                                </td>
                              </tr>
	                              {expanded ? (
	                                <tr className="bg-slate-50/70">
	                                  <td colSpan={isSystemAnalysisStageTable ? 13 : isEntryAnalysisStageTable ? 11 : 10} className="px-4 py-4">
	                                    <div className={`rounded-[1.25rem] border p-4 ${stageItemTone(item.stage_name === selectedStage)}`}>
	                                      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                                        <aside className="rounded-2xl border border-slate-200 bg-white/90 p-4">
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
                                            <div>
                                              <div className="text-slate-400">当前聚合状态</div>
                                              <div className="mt-1">
                                                <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-black ${statusTone(item.status)}`}>
                                                  {formatBinarySecurityStatus(item.status)}
                                                </span>
                                              </div>
                                            </div>
                                            <div>
                                              <div className="text-slate-400">下游原始状态</div>
                                              <div className="mt-1 break-all font-mono text-slate-800">{item.downstream_raw_status || '-'}</div>
                                            </div>
                                            <div>
                                              <div className="text-slate-400">映射后的状态</div>
                                              <div className="mt-1 break-all font-mono text-slate-800">{item.downstream_mapped_status || '-'}</div>
                                            </div>
                                            <div>
                                              <div className="text-slate-400">状态是否已应用</div>
                                              <div className="mt-1 break-all font-mono text-slate-800">{formatSyncAppliedLabel(item.downstream_state_applied)}</div>
                                            </div>
                                            <div>
                                              <div className="text-slate-400">同步错误类型</div>
                                              <div className="mt-1 break-all font-mono text-slate-800">{item.sync_observation_error_type || '-'}</div>
                                            </div>
                                            <div>
                                              <div className="text-slate-400">同步 HTTP 状态</div>
                                              <div className="mt-1 break-all font-mono text-slate-800">{item.sync_observation_http_status ?? '-'}</div>
                                            </div>
                                          </div>
                                          {item.sync_observation_error_message ? (
                                            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                                              {item.sync_observation_error_message}
                                            </div>
                                          ) : null}
                                          {!detailSupport.supported ? (
                                            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                                              {detailSupport.reason}
                                            </div>
                                          ) : null}
                                        </aside>
                                        <div>
                                          {item.abnormal_reason ? (
                                            <div className="mb-4">
                                              <AbnormalReasonCard reason={item.abnormal_reason} />
                                            </div>
                                          ) : null}
                                          {item.error_message ? (
                                            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                                              {item.error_message}
                                            </div>
                                          ) : null}
                                          {(inputContractRows.length > 0 || contractRows.output.length > 0) ? (
                                            <div className={`grid gap-4 ${item.error_message ? 'mt-4' : 'mt-4'} xl:grid-cols-2`}>
                                              <div className="rounded-2xl border border-slate-200 bg-white/90 p-4">
                                                <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">输入 Contract</div>
                                                <div className="mt-1 text-[11px] text-slate-500">直接展示当前阶段子任务记录的原始输入合约，不做字段推断。</div>
                                                <div className="mt-3 space-y-2">
                                                  {inputContractRows.length > 0 ? inputContractRows.map((row) => (
                                                    <div key={`${item.id}-input-${row.label}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                                      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{row.label}</div>
                                                      {renderContractValue(row.value)}
                                                    </div>
                                                  )) : (
                                                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-400">
                                                      当前子任务未记录结构化输入 Contract。
                                                    </div>
                                                  )}
                                                </div>
                                                {inputContractRows.length > 0 ? (
                                                  <details className="mt-3">
                                                    <summary className="cursor-pointer text-xs font-bold text-slate-500 hover:text-slate-800">
                                                      查看原始 JSON
                                                    </summary>
                                                    <pre className="mt-2 max-h-72 overflow-auto rounded-xl border border-slate-200 bg-slate-950 px-3 py-3 text-xs leading-6 text-slate-100">
                                                      {JSON.stringify(item.input_ref, null, 2)}
                                                    </pre>
                                                  </details>
                                                ) : null}
                                              </div>
                                              <div className="rounded-2xl border border-slate-200 bg-white/90 p-4">
                                                <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">输出 Contract</div>
                                                <div className="mt-1 text-[11px] text-slate-500">展示当前阶段子任务记录的结构化输出合约；原始 JSON 见下方。</div>
                                                <div className="mt-3 space-y-2">
                                                  {contractRows.output.length > 0 ? contractRows.output.map((row) => (
                                                    <div key={`${item.id}-output-${row.label}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                                      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{row.label}</div>
                                                      {renderContractValue(row.value)}
                                                    </div>
                                                  )) : (
                                                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-400">
                                                      当前子任务未记录结构化输出 Contract。
                                                    </div>
                                                  )}
                                                </div>
                                                {(item.output_ref || item.result) ? (
                                                  <details className="mt-3">
                                                    <summary className="cursor-pointer text-xs font-bold text-slate-500 hover:text-slate-800">
                                                      查看原始 JSON
                                                    </summary>
                                                    <div className="mt-2 space-y-2">
                                                      {item.output_ref ? (
                                                        <div>
                                                          <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">output_ref</div>
                                                          <pre className="max-h-56 overflow-auto rounded-xl border border-slate-200 bg-slate-950 px-3 py-3 text-xs leading-6 text-slate-100">
                                                            {JSON.stringify(item.output_ref, null, 2)}
                                                          </pre>
                                                        </div>
                                                      ) : null}
                                                      {item.result ? (
                                                        <div>
                                                          <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">result</div>
                                                          <pre className="max-h-56 overflow-auto rounded-xl border border-slate-200 bg-slate-950 px-3 py-3 text-xs leading-6 text-slate-100">
                                                            {JSON.stringify(item.result, null, 2)}
                                                          </pre>
                                                        </div>
                                                      ) : null}
                                                    </div>
                                                  </details>
                                                ) : null}
                                              </div>
                                            </div>
                                          ) : null}
                                          <div className={item.error_message ? 'mt-4' : ''}>
                                            {renderDownstreamDetail(item)}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
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
                </>
              )}
            </div>
          </section>
            </>
          ) : null}

          {activeTab === 'orchestration' ? (
            <OrchestrationObservabilityPanel detail={detail} />
          ) : null}

          {activeTab === 'modules' ? (
            <div className="space-y-6">
              <section className={`rounded-[2rem] border p-6 shadow-sm ${requiresModuleConfirmation ? 'border-amber-200 bg-amber-50/70' : 'border-slate-200 bg-white'}`}>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <h2 className="text-xl font-black text-slate-900">{isBinaryModuleTask ? '模块输入' : '高危模块确认'}</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {isBinaryModuleTask
                        ? '当前任务绕过系统分析，直接以手工输入的单模块多 ELF 作为后续阶段的统一输入。'
                        : requiresModuleConfirmation
                        ? '系统分析已经产出候选高危模块。请确认需要继续推进的数据范围，确认后任务会继续进入后续阶段。'
                        : '展示系统分析产出的全部模块、候选高危模块和当前已确认模块。'}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-2xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                      <div className="text-slate-400">全部模块</div>
                      <div className="mt-1 text-lg font-black text-slate-900">{systemAnalysisModuleCount}</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                      <div className="text-slate-400">候选模块</div>
                      <div className="mt-1 text-lg font-black text-slate-900">{candidateModules.length || detail.candidate_module_count || 0}</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                      <div className="text-slate-400">已选模块</div>
                      <div className="mt-1 text-lg font-black text-slate-900">{selectedModules.length || detail.selected_module_count || 0}</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                      <div className="text-slate-400">风险等级</div>
                      <div className="mt-1 text-sm font-black text-slate-900">{moduleRiskLevels.join(' / ') || '-'}</div>
                    </div>
                  </div>
                </div>
                {requiresModuleConfirmation ? (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <span className="rounded-full border border-amber-200 bg-white px-3 py-2 text-xs font-bold text-amber-800">
                      当前已勾选 {selectedModuleKeys.length} 个模块
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedModuleKeys(candidateModules.map((module, index) => moduleContractKey(module, index)).filter(Boolean))}
                      className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700"
                    >
                      全选候选模块
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedModuleKeys([])}
                      className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700"
                    >
                      清空勾选
                    </button>
                    <button
                      type="button"
                      onClick={() => void confirmModuleSelection()}
                      title={moduleConfirmSupported ? undefined : (manualOperationState?.blocking_reason || '当前任务暂不可确认模块')}
                      disabled={actionLoading !== '' || selectedModuleKeys.length === 0 || !moduleConfirmSupported}
                      className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                    >
                      {actionLoading === 'confirm-modules' ? '确认中...' : '确认并继续'}
                    </button>
                  </div>
                ) : null}
              </section>

              {moduleSelectionLoading ? (
                <section className="rounded-[2rem] border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">正在加载模块确认信息...</section>
              ) : !moduleSelection ? (
                <section className="rounded-[2rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-400 shadow-sm">
                  {isBinaryModuleTask ? '当前任务未生成额外模块表数据，可继续通过总览与阶段详情查看该模块的 ELF 输入和执行进度。' : '当前任务尚未生成可展示的模块确认数据。'}
                </section>
              ) : (
                <div className="grid gap-6 xl:grid-cols-3">
                  {renderModuleTable('全部系统分析模块', systemAnalysisModules, '当前任务尚未记录系统分析模块。')}
                  {renderModuleTable('候选高危模块', candidateModules, '当前没有候选高危模块。', { selectable: requiresModuleConfirmation })}
                  {renderModuleTable('已选高危模块', selectedModules, '当前还没有已确认的模块。')}
                </div>
              )}
            </div>
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
                          const isAbnormalReasonEvent = event.event_type === 'abnormal_reason_recorded';
                          return (
                            <React.Fragment key={event._key}>
                              <tr className={`align-middle hover:bg-slate-50/80 ${isAbnormalReasonEvent ? 'bg-amber-50/40' : ''}`}>
                                <td className="px-3 py-2 font-mono text-[11px] font-bold text-slate-400">#{event._index}</td>
                                <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] font-semibold text-slate-600">
                                  {fmt(event.created_at)}
                                </td>
                                <td className="px-3 py-2">
                                  <span className={`inline-flex max-w-[160px] items-center rounded-full border px-2 py-0.5 text-[11px] font-black ${
                                    isAbnormalReasonEvent
                                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                                      : 'border-sky-200 bg-sky-50 text-sky-700'
                                  }`}>
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
            <div
              className="mt-5 h-[420px] space-y-2 overflow-y-auto overflow-x-hidden pr-1"
              style={{ scrollbarGutter: 'stable' }}
            >
              {artifactsLoading ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
                  正在加载产物文件...
                </div>
              ) : (artifacts?.artifact_groups || []).length > 0 ? (
                <div className="space-y-4">
                  {(artifacts?.artifact_groups || []).map((group: any) => (
                    <div key={group.module_key || group.artifact_index_path} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-black text-slate-900">{group.module_name || group.module_key || '-'}</div>
                          <div className="mt-1 font-mono text-[11px] text-slate-500">{group.module_key || '-'}</div>
                          <div className="mt-1 text-[11px] text-slate-500">{group.source_root || '-'}</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-700">
                            {RESULT_KIND_LABELS[String(group.primary_result_kind || '')] || group.primary_result_kind || '-'}
                          </span>
                          {(group.result_kinds || []).map((kind: string) => (
                            <span key={kind} className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600">
                              {RESULT_KIND_LABELS[kind] || kind}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 xl:grid-cols-[280px_minmax(0,1fr)]">
                        <div className="space-y-2">
                          {Object.entries(group.artifact_kind_summary || {}).map(([kind, count]) => (
                            <div key={kind} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">
                              <span className="font-medium text-slate-500">{kind}</span>
                              <span className="font-black text-slate-900">{String(count ?? 0)}</span>
                            </div>
                          ))}
                        </div>
                        <div className="space-y-2">
                          {(group.artifacts || []).map((file: any) => (
                            <div key={`${group.module_key}-${file.relative_path}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                              <div className="break-all font-mono text-xs text-slate-700">{file.relative_path}</div>
                              <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
                                <span>kind={file.kind || '-'}</span>
                                <span>size={Number(file.size || 0)}</span>
                                <span>stage={file.stage || '-'}</span>
                                {file.batch_no != null ? <span>batch={file.batch_no}</span> : null}
                                {file.attempt_no != null ? <span>attempt={file.attempt_no}</span> : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
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
