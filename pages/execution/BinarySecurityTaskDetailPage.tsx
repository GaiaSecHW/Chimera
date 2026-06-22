import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, ExternalLink, FileText, Info, Loader2, RefreshCw, SlidersHorizontal, Trash2, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNavigate } from 'react-router-dom';

import { PageHeader } from '../../design-system';
import { BinarySecurityRuntimeHealthTab } from './BinarySecurityRuntimeHealthTab';

import {
  BinarySecurityAbnormalReason,
  BinarySecurityAbnormalReasonEventSummary,
  BinarySecurityEntryContract,
  BinarySecurityModuleContract,
  BinarySecurityModuleReportDetail,
  BinarySecurityModuleSelection,
  BinarySecurityOrchestrationObservability,
  BinarySecurityOverviewNode,
  BinarySecurityOverviewResponse,
  BinarySecurityRuntimeHealthGroup,
  BinarySecurityRuntimeHealthLoopSnapshot,
  BinarySecurityRuntimeHealthUnit,
  BinarySecurityStageItemPage,
  BinarySecurityTaskDetail,
  BinarySecurityTaskKeySnapshot,
  BinarySecurityTaskPolicy,
  BinarySecurityTaskType,
  BinarySecurityWorkKeySnapshot,
} from '../../clients/binarySecurity';
import { api } from '../../clients/api';
import { B2STaskDetail } from '../../clients/binaryToSource';
import { FirmwareUnpackTask } from '../../clients/firmwareUnpacker';
import { AppDfaTaskDetail, AppEaTaskDetail, AppSaTaskDetail } from '../../types/types';
import { showConfirm } from '../../components/DialogService';
import {
  asBinarySecurityContract,
  contractText,
  dfaInputContractRows,
  dfaOutputContractRows,
  moduleContractKey,
  moduleContractNumber,
  moduleContractText,
  renderContractValue,
} from '../../utils/binarySecurityContracts';
import { deriveRuntimeDiagnoses, deriveRuntimeOwnerTopology, type RuntimeDiagnosis } from '../../utils/binarySecurityRuntimeHealth';
import { clearExecutionReturnContext, saveBinarySecurityReturnContext } from '../../utils/executionReturnContext';

const LK = {
  primary: '#4f73ff', primarySoft: '#7590ff', primaryDeep: '#3f63f1',
  primaryMuted: 'rgba(79, 115, 255, 0.14)',
  canvas: '#070d18', surface: '#111a2b', surfaceRaised: '#18233a',
  surfaceGlass: 'rgba(17, 26, 43, 0.84)',
  border: '#26324a', borderSoft: '#1b2438',
  ink: '#f5f7ff', inkSoft: '#d6def0', body: '#a4aec4',
  muted: '#72809a', mutedSoft: '#8b95a8',
  success: '#45c06f', warning: '#d5a13a', error: '#f15d5d', info: '#4f8cff',
  critical: '#ff4d4f', high: '#ff8b3d', medium: '#f0b64c', low: '#49c5ff',
} as const;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

interface Props {
  projectId: string;
  taskId: string;
  taskType: BinarySecurityTaskType;
  onBack: () => void;
}

const TERMINAL = new Set(['success', 'partial_success', 'failed', 'cancelled', 'downstream_missing', 'delete_failed']);
const DEFAULT_BINARY_STAGE_SEQUENCE = [
  'firmware_unpack',
  'system_analysis',
  'binary_to_source',
  'entry_analysis',
  'dataflow_vuln_scan',
];
const DEFAULT_SOURCE_STAGE_SEQUENCE = [
  'system_analysis',
  'entry_analysis',
  'dataflow_vuln_scan',
];
const DEFAULT_SOURCE_KG_STAGE_SEQUENCE = [
  'knowledge_graph_entry_fetch',
  'dataflow_vuln_scan',
];
const DEFAULT_MODULE_STAGE_SEQUENCE = [
  'binary_to_source',
  'entry_analysis',
  'dataflow_vuln_scan',
];
const MODULE_RISK_OPTIONS = ['高', '中', '低'];
const MODULE_SELECTION_OPTIONS = [
  { value: 'auto', label: '按风险自动推进' },
  { value: 'manual_confirm', label: '系统分析后人工确认' },
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
const DEFAULT_STAGE_ITEMS_PER_PAGE = 10;
const STAGE_ITEMS_PER_PAGE_OPTIONS = [10, 20, 50, 100, 200, 500, 1000, 2000];
type StageItemTimeSortKey = 'started_at' | 'finished_at' | 'duration' | 'last_sync_attempt_at' | 'last_sync_success_at' | 'last_sync_error_at';
type SortDirection = 'asc' | 'desc';
type StageItemTimeSort = { key: StageItemTimeSortKey; direction: SortDirection } | null;
type ModuleReportDialogTarget = {
  moduleKey: string;
  moduleName: string;
};

const STAGE_LABELS: Record<string, string> = {
  firmware_unpack: '固件解包',
  system_analysis: '系统分析',
  binary_to_source: '二进制逆向',
  entry_analysis: '入口分析',
  knowledge_graph_entry_fetch: '知识图谱入口获取',
  dataflow_vuln_scan: '数据流漏洞挖掘',
};

const DOWNSTREAM_DETAIL_SUPPORT: Record<string, { supported: boolean; reason?: string }> = {
  firmware_unpack: { supported: true },
  system_analysis: { supported: true },
  binary_to_source: { supported: true },
  entry_analysis: { supported: true },
  dataflow_vuln_scan: { supported: true },
};

function downstreamDetailSupport(stageName: string, downstreamTaskId?: string | null, missingReason?: string | null) {
  if (!downstreamTaskId?.trim()) {
    return { supported: false, reason: missingReason || '该阶段子任务尚未创建下游任务。' };
  }
  return DOWNSTREAM_DETAIL_SUPPORT[stageName] || { supported: false, reason: '该阶段尚未配置可跳转的任务详情页面。' };
}

const stageItemBindingStateLabel = (item: BinarySecurityTaskDetail['stage_items'][number]) => {
  const state = String(item.downstream_binding_state || '').trim().toLowerCase();
  if (item.downstream_task_id && !item.downstream_status) return '下游已创建，状态待同步';
  switch (state) {
    case 'creating':
      return '下游任务创建中';
    case 'create_retrying':
      return '下游任务创建重试中';
    case 'create_failed':
      return '下游任务创建失败';
    case 'created_pending_sync':
      return '下游已创建，状态待同步';
    default:
      return null;
  }
};

const stageItemDisplayDownstreamStatus = (item: BinarySecurityTaskDetail['stage_items'][number]) => {
  return stageItemBindingStateLabel(item) || formatDownstreamStatus(item.downstream_status);
};

const stageItemMissingDownstreamReason = (item: BinarySecurityTaskDetail['stage_items'][number]) => {
  if (item.downstream_binding_message) return item.downstream_binding_message;
  const state = String(item.downstream_binding_state || '').trim().toLowerCase();
  switch (state) {
    case 'creating':
      return '创建中，尚未拿到下游任务ID';
    case 'create_retrying':
      return '正在自动重试创建，成功后可跳转';
    case 'create_failed':
      return '创建失败，当前无下游任务可查看';
    default:
      return '该阶段子任务尚未创建下游任务。';
  }
};

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

const taskRuntimeOwnerSummary = (detail: BinarySecurityTaskDetail) => {
  const dispatcherOwner = String(detail.dispatcher_instance_id || detail.task_lease_owner_instance_id || '').trim();
  return {
    label: '当前持有者',
    value: dispatcherOwner ?`worker · ${dispatcherOwner}` : 'worker · -',
    hint: detail.task_lease_expires_at ?`lease 到期 ${fmt(detail.task_lease_expires_at)}` : detail.runtime_phase || '-',
  };
};

const statusTone = (status: string): { backgroundColor: string; color: string; borderColor: string } => {
  switch (status) {
    case 'success':
      return { backgroundColor: 'rgba(69, 192, 111, 0.1)', color: LK.success, borderColor: LK.success };
    case 'partial_success':
      return { backgroundColor: 'rgba(213, 161, 58, 0.1)', color: LK.warning, borderColor: LK.warning };
    case 'failed':
    case 'delete_failed':
      return { backgroundColor: 'rgba(241, 93, 93, 0.1)', color: LK.error, borderColor: LK.error };
    case 'downstream_missing':
      return { backgroundColor: 'rgba(249, 115, 22, 0.1)', color: '#f97316', borderColor: '#f97316' };
    case 'cancelled':
      return { backgroundColor: LK.surfaceRaised, color: LK.muted, borderColor: LK.border };
    case 'pending_module_confirmation':
    case 'waiting_confirmation':
      return { backgroundColor: 'rgba(213, 161, 58, 0.1)', color: LK.warning, borderColor: LK.warning };
    case 'pending_upload':
    case 'applying':
      return { backgroundColor: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6', borderColor: '#8b5cf6' };
    case 'uploading':
    case 'dispatching':
      return { backgroundColor: 'rgba(14, 165, 233, 0.1)', color: LK.info, borderColor: LK.info };
    case 'ready_to_start':
      return { backgroundColor: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', borderColor: '#6366f1' };
    case 'running':
      return { backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', borderColor: '#3b82f6' };
    case 'continue_in_progress':
      return { backgroundColor: 'rgba(69, 192, 111, 0.1)', color: LK.success, borderColor: LK.success };
    case 'retry_in_progress':
      return { backgroundColor: 'rgba(249, 115, 22, 0.1)', color: '#f97316', borderColor: '#f97316' };
    case 'queued':
      return { backgroundColor: 'rgba(6, 182, 212, 0.1)', color: '#06b6d4', borderColor: '#06b6d4' };
    case 'skipped':
      return { backgroundColor: LK.surfaceRaised, color: LK.muted, borderColor: LK.border };
    default:
      return { backgroundColor: LK.surfaceRaised, color: LK.body, borderColor: LK.border };
  }
};

const STAGE_NODE_BASE_TONES = [
  { backgroundColor: 'rgba(34, 211, 238, 0.12)', color: '#0f766e', borderColor: '#67e8f9' },
  { backgroundColor: 'rgba(99, 102, 241, 0.12)', color: '#4338ca', borderColor: '#a5b4fc' },
  { backgroundColor: 'rgba(168, 85, 247, 0.12)', color: '#7e22ce', borderColor: '#d8b4fe' },
  { backgroundColor: 'rgba(236, 72, 153, 0.12)', color: '#be185d', borderColor: '#f9a8d4' },
  { backgroundColor: 'rgba(245, 158, 11, 0.12)', color: '#b45309', borderColor: '#fcd34d' },
  { backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#047857', borderColor: '#86efac' },
] as const;

const stageNodeBaseTone = (stageName: string, kind: 'business' | 'archive', sequenceNo?: number) => {
  if (kind === 'archive') {
    return { backgroundColor: 'rgba(148, 163, 184, 0.12)', color: '#475569', borderColor: '#cbd5e1' };
  }
  const normalized = String(stageName || '').trim();
  const seed = Number.isFinite(Number(sequenceNo))
    ? Math.max(0, Number(sequenceNo) - 1)
    : normalized.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return STAGE_NODE_BASE_TONES[seed % STAGE_NODE_BASE_TONES.length];
};

const stageNodeTone = (
  stageName: string,
  kind: 'business' | 'archive',
  status: string,
  selected: boolean,
  sequenceNo?: number,
): { backgroundColor: string; color: string; borderColor: string; transform?: string } => {
  const transform = selected ? 'translateY(-4px)' : undefined;
  const baseTone = stageNodeBaseTone(stageName, kind, sequenceNo);
  switch (status) {
    case 'success':
      return { ...baseTone, transform };
    case 'partial_success':
      return { backgroundColor: 'rgba(213, 161, 58, 0.1)', color: LK.warning, borderColor: LK.warning, transform };
    case 'failed':
      return { backgroundColor: 'rgba(241, 93, 93, 0.1)', color: LK.error, borderColor: LK.error, transform };
    case 'downstream_missing':
      return { backgroundColor: 'rgba(249, 115, 22, 0.1)', color: '#f97316', borderColor: '#f97316', transform };
    case 'running':
      return { backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', borderColor: '#3b82f6', transform };
    case 'continue_in_progress':
      return { backgroundColor: 'rgba(69, 192, 111, 0.1)', color: LK.success, borderColor: LK.success, transform };
    case 'retry_in_progress':
      return { backgroundColor: 'rgba(249, 115, 22, 0.1)', color: '#f97316', borderColor: '#f97316', transform };
    case 'applying':
      return { backgroundColor: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6', borderColor: '#8b5cf6', transform };
    case 'cancelled':
      return { backgroundColor: LK.surfaceRaised, color: LK.body, borderColor: LK.border, transform };
    case 'waiting_confirmation':
      return { backgroundColor: 'rgba(213, 161, 58, 0.1)', color: LK.warning, borderColor: LK.warning, transform };
    case 'skipped':
      return { backgroundColor: LK.surfaceRaised, color: LK.muted, borderColor: LK.border, transform };
    default:
      return { ...baseTone, transform };
  }
};

const stageConnectorTone = (status: string): string => {
  switch (status) {
    case 'success':
      return LK.success;
    case 'partial_success':
      return LK.warning;
    case 'failed':
      return LK.error;
    case 'downstream_missing':
      return '#f97316';
    case 'running':
      return '#3b82f6';
    case 'continue_in_progress':
      return LK.success;
    case 'retry_in_progress':
      return '#f97316';
    case 'applying':
      return '#8b5cf6';
    default:
      return LK.muted;
  }
};

function normalizeProjectFileExplorerPath(path: string, projectId?: string | null): string {
  const normalizedPath = String(path || '').trim();
  if (!normalizedPath) return '';
  const normalizedProjectId = String(projectId || '').trim();
  const projectRoot = normalizedProjectId ?`/data/files/${normalizedProjectId}` : '';
  if (projectRoot && normalizedPath.startsWith(projectRoot)) {
    const relativePath = normalizedPath.slice(projectRoot.length).replace(/\/+$/, '');
    if (!relativePath) return '/';
    return relativePath.startsWith('/') ? relativePath :`/${relativePath}`;
  }
  return normalizedPath.startsWith('/') ? normalizedPath :`/${normalizedPath}`;
}

function buildProjectFileExplorerUrl(fsPath: string, projectId?: string | null): string {
  return`#/project-file-explorer?path=${encodeURIComponent(normalizeProjectFileExplorerPath(fsPath, projectId))}`;
}

const ProjectDirectoryValue: React.FC<{ path?: string | null; projectId?: string | null }> = ({ path, projectId }) => {
  const normalizedPath = String(path || '').trim();
  if (!normalizedPath) return <>-</>;
  const explorerPath = normalizeProjectFileExplorerPath(normalizedPath, projectId);
  const showRawPath = explorerPath !== normalizedPath;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-0">
        <div className="break-all font-mono text-xs text-theme-text-primary">{explorerPath}</div>
        {showRawPath ? <div className="mt-1 break-all font-mono text-[11px] text-theme-text-muted">{normalizedPath}</div> : null}
      </div>
      <button
        type="button"
        onClick={() => window.open(buildProjectFileExplorerUrl(normalizedPath, projectId), '_blank', 'noopener,noreferrer')}
        className="inline-flex items-center gap-1 rounded-lg border border-violet-500/20 px-2 py-1 text-[11px] font-semibold text-violet-400 hover:bg-violet-500/15"
      >
        <ExternalLink size={11} />
        项目文件
      </button>
    </div>
  );
};

const STAGE_ITEM_PATH_LABEL_KEYWORDS = [
  'path',
  'root',
  'dir',
  'directory',
  'files_list',
  'files-list',
  'archive',
  'artifact',
  'source_file',
];

function isProjectFilePathLike(value: string): boolean {
  const normalized = String(value || '').trim();
  if (!normalized) return false;
  if (normalized.startsWith('/data/files/')) return true;
  if (normalized.startsWith('/')) return true;
  if (normalized.startsWith('./') || normalized.startsWith('../')) return true;
  return normalized.includes('/');
}

function shouldRenderStageItemValueAsProjectPath(label: string, value: string): boolean {
  const normalizedLabel = String(label || '').trim().toLowerCase();
  if (!normalizedLabel) return false;
  if (!STAGE_ITEM_PATH_LABEL_KEYWORDS.some((keyword) => normalizedLabel.includes(keyword))) {
    return false;
  }
  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 && lines.every((line) => isProjectFilePathLike(line));
}

function renderStageItemDetailValue(label: string, value: string, projectId?: string | null) {
  if (!shouldRenderStageItemValueAsProjectPath(label, value)) {
    return renderContractValue(value);
  }
  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) {
    return <div className="mt-1"><ProjectDirectoryValue path={lines[0] || value} projectId={projectId} /></div>;
  }
  return (
    <div className="mt-2 space-y-2">
      {lines.map((line, index) => (
        <div key={`${label}-${line}-${index}`} className="rounded-lg border border-theme-border bg-theme-bg-app px-2 py-2">
          <ProjectDirectoryValue path={line} projectId={projectId} />
        </div>
      ))}
    </div>
  );
}

function archiveJobSourcePath(job: {
  archive_source_primary_path?: string | null;
  archive_source_paths?: string[];
  source_root_path?: string | null;
  source_root?: string | null;
  source_dir?: string | null;
}): string | null {
  return job.archive_source_primary_path || job.archive_source_paths?.[0] || null;
}

const stageItemTone = (selected: boolean) => (
  selected
 ? 'border-sky-300 bg-gradient-to-br from-sky-50 via-slate-50 to-cyan-50 '
    : 'border-theme-border bg-slate-50/70 hover:border-theme-border hover:bg-theme-bg-app'
);

const detailPanelTone = { borderRadius: '8px', border: `1px solid ${LK.border}`, backgroundColor: LK.surface, padding: '8px 12px', fontSize: '12px', color: LK.inkSoft };
const formatBinarySecurityStatus = (status?: string | null) => {
  const normalized = String(status || '').trim().toLowerCase();
  const labels: Record<string, string> = {
    downstream_missing: '子任务不存在',
    delete_failed: '删除失败',
    passed: '通过',
  };
  return labels[normalized] || status || '-';
};

const formatDownstreamStatus = (status?: string | null) => {
  if (!status) return '待同步';
  return formatBinarySecurityStatus(status);
};

const isTailControlPlaneSyncTransition = (item: BinarySecurityTaskDetail['stage_items'][number]) => {
  const errorType = String(item.last_sync_error_type || item.sync_observation_error_type || '').trim().toLowerCase();
  const errorMessage = String(item.last_sync_error_message || item.sync_observation_error_message || '').trim().toLowerCase();
  if (errorType === 'staletaskexecution') return true;
  return (
    errorMessage.includes('tail 收敛 owner 已变更'.toLowerCase()) ||
    errorMessage.includes('tail 收敛 lease 已失效'.toLowerCase()) ||
    errorMessage.includes('当前 tail 收敛 owner 已变更'.toLowerCase()) ||
    errorMessage.includes('当前 tail 收敛 lease 已失效'.toLowerCase())
  );
};

const formatStageItemSyncStatus = (status?: string | null) => {
  switch (status) {
    case 'observed':
      return '已观测';
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

const STAGE_ITEM_STATUS_FILTER_VALUES = [
  'pending',
  'queued',
  'dispatching',
  'running',
  'success',
  'partial_success',
  'failed',
  'cancelled',
  'downstream_missing',
] as const;

const STAGE_ITEM_DOWNSTREAM_STATUS_FILTER_VALUES = [
  '待处理',
  '排队中',
  '运行中',
  '已通过',
  '已成功',
  '已失败',
  '已取消',
  '下游不存在',
  '下游已创建，状态待同步',
  '下游任务创建中',
  '下游任务创建重试中',
  '下游任务创建失败',
  '未知',
] as const;

const STAGE_ITEM_SYNC_STATUS_FILTER_VALUES = [
  'observed',
  'synced',
  'skipped',
  'transport_error',
  'pending',
  'not_applicable',
  'unknown',
] as const;

const formatStageItemSyncFreshness = (
  state?: string | null,
  item?: BinarySecurityTaskDetail['stage_items'][number],
) => {
  switch (String(state || '').trim().toLowerCase()) {
    case 'healthy':
      return '同步正常';
    case 'failing_after_success':
      return item && isTailControlPlaneSyncTransition(item) ? '收敛切换中' : '同步失败中';
    case 'stale_success':
      return '仅历史成功';
    case 'never_succeeded':
      return '从未同步成功';
    case 'not_applicable':
      return '未绑定下游';
    default:
      return '状态未知';
  }
};

const stageItemSyncFreshnessTone = (item: BinarySecurityTaskDetail['stage_items'][number]) => {
  const state = String(item.sync_freshness_state || '').trim().toLowerCase();
  switch (state) {
    case 'healthy':
      return 'success';
    case 'failing_after_success':
      return isTailControlPlaneSyncTransition(item) ? 'pending' : 'failed';
    case 'stale_success':
      return 'pending';
    case 'never_succeeded':
      return 'failed';
    case 'not_applicable':
      return 'queued';
    default:
      return item.sync_status === 'synced' ? 'success' : item.sync_status === 'transport_error' ? 'failed' : 'queued';
  }
};

const displayStageItemSyncTime = (
  value: string | null | undefined,
  fallback: string,
) => {
  if (!value) return fallback;
  return fmt(value);
};

const isRetryableCreateFailure = (item: BinarySecurityTaskDetail['stage_items'][number]) => (
  item.stage_name === 'dataflow_vuln_scan'
  && !item.downstream_task_id
  && ['create_retrying', 'create_failed', 'creating'].includes(String(item.downstream_binding_state || '').trim().toLowerCase())
);

const stageItemDownstreamToneStatus = (item: BinarySecurityTaskDetail['stage_items'][number]) => {
  if (item.downstream_task_id) return item.downstream_status || 'queued';
  const bindingState = String(item.downstream_binding_state || '').trim().toLowerCase();
  if (bindingState === 'create_failed') return 'failed';
  if (bindingState === 'create_retrying' || bindingState === 'creating') return 'running';
  return 'queued';
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
  const isDataflowStage = item.stage_name === 'dataflow_vuln_scan';
  const dfaOutputRows = isDataflowStage
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
      ...dfaOutputRows.map((row) => ({ label: row.label, value: row.value })),
    ].filter((row) => row.value),
  };
}

function stageItemInputContractRows(item: BinarySecurityTaskDetail['stage_items'][number]) {
  const contract = asStageItemContract(item.input_ref);
  if (item.stage_name === 'dataflow_vuln_scan') {
    const rows = dfaInputContractRows(contract, null);
    if (rows.length > 0) {
      return rows.map((row) => ({
        label: row.semantic ?`${row.label} (${row.semantic})` : row.label,
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
  | { kind: 'dataflow_vuln_scan'; data: AppDfaTaskDetail };

type DownstreamTaskState = {
  loading: boolean;
  detail?: DownstreamTaskDetail;
  error?: string;
  downstreamTaskId?: string;
};

type DetailTab = 'overview' | 'strategy' | 'modules' | 'timeline' | 'api_keys' | 'orchestration' | 'runtime_health';
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
  entry_selection_mode: 'auto' | 'manual_confirm';
  module_risk_levels: string[];
};
type StrategySectionKey = 'stage_options' | 'module_strategy' | 'entry_strategy' | 'execution_policy';
type ManualOperationState = NonNullable<BinarySecurityTaskDetail['manual_operation_state']>;

const systemAnalysisRiskCountLabels = (item: BinarySecurityTaskDetail['stage_items'][number], state?: DownstreamTaskState) => {
  const summary = item.downstream_summary || {};
  const hasSummary = summary.high_risk_module_count != null || summary.medium_risk_module_count != null || summary.low_risk_module_count != null;
  if (hasSummary) {
    return {
      high: safeCountLabel(summary.high_risk_module_count),
      medium: safeCountLabel(summary.medium_risk_module_count),
      low: safeCountLabel(summary.low_risk_module_count),
    };
  }
  if (state?.detail?.kind !== 'system_analysis') {
    return { high: '-', medium: '-', low: '-' };
  }
  const downstreamSummary = state.detail.data.result_json?.summary || {};
  const resultJson = state.detail.data.result_json || {};
  return {
    high: safeCountLabel(downstreamSummary.high_risk_module_count ?? resultJson.high_risk_module_count),
    medium: safeCountLabel(downstreamSummary.medium_risk_module_count ?? resultJson.medium_risk_module_count),
    low: safeCountLabel(downstreamSummary.low_risk_module_count ?? resultJson.low_risk_module_count),
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

const pipelineModeLabel = (value?: string | null) => (
  value === 'mixed_streaming' ? '深度优先（Mixed Streaming）' : '广度优先（Barrier）'
);

const pipelineModeHint = (value?: string | null) => (
  value === 'mixed_streaming'
    ? '前序阶段产出后会尽快向后续阶段流式推进。'
    : '按阶段聚合推进，上一阶段完成后再开始下一阶段。'
);

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
  downstream_retry_fallback_delete_requested: '准备删除旧下游任务',
  downstream_retry_fallback_delete_succeeded: '旧下游任务删除完成',
  downstream_retry_fallback_delete_failed: '旧下游任务删除失败',
  downstream_retry_fallback_recreated: '已重建新的下游任务',
  downstream_retry_rejected: '下游重试被拒绝',
  downstream_retry_failed: '下游重试失败',
  downstream_cancel_succeeded: '下游子任务已取消',
  downstream_delete_succeeded: '下游子任务已删除',
  child_task_cancel_requested: '请求取消下游子任务',
  child_task_cancel_succeeded: '下游子任务取消完成',
  child_task_cancel_failed: '下游子任务取消失败',
  child_task_inactive_check_requested: '检查下游是否已静止',
  child_task_inactive_check_succeeded: '下游已静止，可继续清理',
  child_task_inactive_check_blocked: '下游仍在运行，清理被阻断',
  child_task_delete_requested: '请求删除下游子任务',
  child_task_delete_succeeded: '下游子任务删除完成',
  child_task_delete_verified_absent: '下游已不存在，删除视为完成',
  child_task_delete_failed_but_ignored: '下游删除失败但已忽略',
  child_task_delete_failed_blocking: '下游删除失败并阻断操作',
  stage_retry_full_cleanup_started: '严格清理开始',
  stage_retry_full_cleanup_finished: '严格清理完成',
  stage_waiting_downstream_progress: '等待下游继续推进',
  downstream_marked_stale: '下游结果过期',
  task_cancelled: '任务取消',
  task_delete_requested: '删除请求',
  task_completed: '任务完成',
  task_failed: '任务失败',
  task_partial_success: '部分成功',
  ...ARCHIVE_EVENT_LABELS,
};

const CLEANUP_TIMELINE_EVENT_CATEGORIES: Record<string, { label: string; tone: string }> = {
  child_task_cancel_requested: { label: '下游清理 / 取消', tone: 'border-cyan-500/20 bg-cyan-500/15 text-cyan-400' },
  child_task_cancel_succeeded: { label: '下游清理 / 取消', tone: 'border-cyan-500/20 bg-cyan-500/15 text-cyan-400' },
  child_task_cancel_failed: { label: '下游清理 / 取消失败', tone: 'border-amber-500/20 bg-amber-500/15 text-amber-400' },
  child_task_inactive_check_requested: { label: '下游清理 / 静止检查', tone: 'border-indigo-500/20 bg-indigo-500/15 text-indigo-400' },
  child_task_inactive_check_succeeded: { label: '下游清理 / 静止检查', tone: 'border-indigo-500/20 bg-indigo-500/15 text-indigo-400' },
  child_task_inactive_check_blocked: { label: '下游清理 / 阻断', tone: 'border-rose-500/20 bg-rose-500/15 text-rose-400' },
  child_task_delete_requested: { label: '下游清理 / 删除', tone: 'border-fuchsia-500/20 bg-fuchsia-500/15 text-fuchsia-400' },
  child_task_delete_succeeded: { label: '下游清理 / 删除', tone: 'border-fuchsia-500/20 bg-fuchsia-500/15 text-fuchsia-400' },
  child_task_delete_verified_absent: { label: '下游清理 / 删除', tone: 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400' },
  child_task_delete_failed_but_ignored: { label: '下游清理 / 已忽略', tone: 'border-amber-500/20 bg-amber-500/15 text-amber-400' },
  child_task_delete_failed_blocking: { label: '下游清理 / 删除阻断', tone: 'border-rose-500/20 bg-rose-500/15 text-rose-400' },
  stage_retry_full_cleanup_started: { label: '严格清理', tone: 'border-violet-500/20 bg-violet-500/15 text-violet-400' },
  stage_retry_full_cleanup_finished: { label: '严格清理', tone: 'border-violet-500/20 bg-violet-500/15 text-violet-400' },
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
  const effectiveRiskLevels = normalizedMode === 'manual_confirm'
    ? [...MODULE_RISK_OPTIONS]
    : (normalizedRiskLevels.length > 0 ? normalizedRiskLevels : ['高']);
  const normalizedEntryMode = String(nextPolicy.entry_selection_mode || 'auto') === 'manual_confirm' ? 'manual_confirm' : 'auto';
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
    entry_selection_mode: normalizedEntryMode,
    module_risk_levels: effectiveRiskLevels,
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
  if (section === 'entry_strategy') {
    return left.entry_selection_mode === right.entry_selection_mode;
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
      return 'border-rose-500/20 bg-rose-500/15 text-rose-400';
    case 'warning':
      return 'border-amber-500/20 bg-amber-500/15 text-amber-400';
    case 'success':
      return 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400';
    default:
      return 'border-sky-500/20 bg-sky-500/15 text-sky-400';
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

const timelineEventCategoryMeta = (eventType?: string | null) => CLEANUP_TIMELINE_EVENT_CATEGORIES[String(eventType || '')] || null;

const formatDurationMs = (value: unknown): string => {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0) return '-';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return`${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return`${minutes}m ${rest}s`;
  const hours = Math.floor(minutes / 60);
  return`${hours}h ${minutes % 60}m`;
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
  if (Array.isArray(value)) return`${value.length} 项`;
  if (typeof value === 'object') return`${Object.keys(value as Record<string, any>).length} 个字段`;
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
      <div className="rounded-xl border border-dashed border-theme-border bg-theme-surface px-3 py-4 text-xs text-theme-text-muted">
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
      <div className="rounded-xl border border-dashed border-theme-border bg-theme-surface px-3 py-4 text-xs text-theme-text-muted">
        {emptyText}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 text-xs text-theme-text-secondary md:grid-cols-2 xl:grid-cols-4">
      {rows.map((key) => (
        <div key={key} className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2">
          <div className="text-theme-text-muted">{DOWNSTREAM_SUMMARY_LABELS[key] || key}</div>
          <div className="mt-1 break-all font-semibold text-theme-text-primary">{formatDownstreamSummaryValue(key, payload[key])}</div>
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
    return text.length > 160 ?`${text.slice(0, 160)}...` : text;
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
    <div className="rounded-2xl border border-theme-border bg-slate-50/80 px-3 py-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-theme-text-muted">
        <Info size={12} />
        事件细节
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {rows.slice(0, 8).map((row) => (
 <div key={row.key} className="min-w-0 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-xs">
            <div className="font-bold text-theme-text-muted">{row.label}</div>
            <div className="mt-1 break-all font-mono text-theme-text-secondary">{row.value}</div>
          </div>
        ))}
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-bold text-theme-text-muted hover:text-theme-text-primary">
          查看原始 JSON
        </summary>
        <pre className="mt-2 max-h-48 overflow-auto rounded-xl border border-theme-border bg-theme-surface px-3 py-3 text-xs leading-6 text-theme-text-secondary">
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
  if (seconds < 60) return`${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return`${minutes}m ${rest}s`;
  const hours = Math.floor(minutes / 60);
  return`${hours}h ${minutes % 60}m`;
};

const timestampValue = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

const nextStageItemSort = (current: StageItemTimeSort, key: StageItemTimeSortKey): StageItemTimeSort => {
  if (!current || current.key !== key) return { key, direction: 'desc' };
  return { key, direction: current.direction === 'desc' ? 'asc' : 'desc' };
};

const shouldShowStageRetryReason = (status?: string | null, retryable?: boolean, retryReason?: string | null) => (
  Boolean(!retryable && retryReason && ['failed', 'partial_success', 'cancelled', 'downstream_missing'].includes(String(status || '')))
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
      return 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400';
    case 'warn':
      return 'border-amber-500/20 bg-amber-500/15 text-amber-400';
    case 'error':
      return 'border-rose-500/20 bg-rose-500/15 text-rose-400';
    case 'muted':
      return 'border-theme-border bg-theme-bg-app text-theme-text-secondary';
    default:
      return 'border-sky-500/20 bg-sky-500/15 text-sky-400';
  }
};

const firstText = (...values: Array<unknown>): string | null => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

const summarizeCount = (count: number, unit = '项') =>`${count.toLocaleString()} ${unit}`;

const TERMINAL_BINARY_SECURITY_STATUSES = new Set([
  'success',
  'failed',
  'downstream_missing',
  'partial_success',
  'cancelled',
]);

function deriveTaskStatusReason(detail: BinarySecurityTaskDetail): TaskStatusReason {
  const normalizedTaskStatus = String(detail.status || '').trim().toLowerCase();
  const shouldTrustAbnormalReasonSnapshot = TERMINAL_BINARY_SECURITY_STATUSES.has(normalizedTaskStatus);
  if (detail.abnormal_reason && shouldTrustAbnormalReasonSnapshot) {
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
  const failedStages = stageSummaries.filter((stage) => ['failed', 'partial_success', 'downstream_missing'].includes(stage.status));
  const cancelledStages = stageSummaries.filter((stage) => stage.status === 'cancelled');
  const runningStages = stageSummaries.filter((stage) => ['running', 'dispatching', 'applying'].includes(stage.status));
  const pendingStages = stageSummaries.filter((stage) => stage.status === 'pending');
  const failedItems = stageItems.filter((item) => item.status === 'failed');
  const missingItems = stageItems.filter((item) => item.status === 'downstream_missing');
  const downstreamFailedItems = stageItems.filter((item) => (
    String(item.downstream_binding_state || '').trim().toLowerCase() === 'create_failed'
    || ['failed', 'error'].includes(String(item.downstream_status || '').toLowerCase())
  ));
  const downstreamCancelledItems = stageItems.filter((item) => String(item.downstream_status || '').toLowerCase() === 'cancelled');
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
        { label: '归档完成', value:`${archiveJobs.filter((job) => job.archive_status === 'success').length} / ${archiveJobs.length || 0}` },
      ],
    };
  }

  if (detail.terminal_failure) {
    const failedStageName = latestFailedStage?.stage_name || latestFailedItem?.stage_name || latestFailedArchive?.stage_name || detail.current_stage;
    const reason = firstText(
      detail.failure_message,
      detail.last_error,
      latestFailedStage?.last_error,
      latestFailedItem?.error_message,
      latestMissingItem?.error_message,
      latestFailedArchive?.error_message,
    );
    return {
      tone: 'error',
      title:`业务终态失败：${STAGE_LABELS[failedStageName || ''] || failedStageName || '当前阶段'}`,
      description: reason || '当前阶段已得出不可自动恢复的业务失败结论，任务不会再自动重排或继续调度。',
      evidence: [
        { label: '失败阶段', value: STAGE_LABELS[failedStageName || ''] || failedStageName || '-' },
        { label: '失败类型', value: detail.failure_category || 'business' },
        { label: '失败代码', value: detail.failure_code || '-' },
        { label: '自动重排', value: detail.requeue_suppressed ? '已禁止' : '未禁止' },
      ],
    };
  }

  if (detail.status === 'failed') {
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
      title:`任务失败于 ${STAGE_LABELS[failedStageName || ''] || failedStageName || '当前阶段'}`,
      description: reason || '当前任务存在编排失败阶段、编排失败项或归档失败记录，编排器因此将总任务置为失败。',
      evidence: [
        { label: '失败阶段', value: failedStages.map((stage) => STAGE_LABELS[stage.stage_name] || stage.stage_name).join(' / ') || '-' },
        { label: '编排失败项', value: summarizeCount(failedItems.length) },
        { label: '丢失子任务', value: summarizeCount(missingItems.length) },
        { label: '下游真实失败', value: summarizeCount(downstreamFailedItems.length) },
        { label: '下游真实取消', value: summarizeCount(downstreamCancelledItems.length) },
        { label: '归档失败', value: summarizeCount(failedArchiveJobs.length) },
      ],
    };
  }

  if (detail.status === 'delete_failed') {
    const reason = firstText(
      detail.last_error,
      detail.cleanup_state?.last_error,
    );
    return {
      tone: 'error',
      title: '任务删除失败',
      description: reason || '任务主流程已结束，但删除收尾或任务目录清理失败，需要人工介入重试删除或补偿清理。',
      evidence: [
        { label: '当前阶段', value: currentStageLabel },
        { label: '清理状态', value: String(detail.cleanup_state?.status || '-') },
        { label: '待补偿下游', value: summarizeCount(Number(detail.cleanup_state?.deferred_ref_count || 0)) },
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
      title:`${STAGE_LABELS[blockedStageName || ''] || blockedStageName || '当前阶段'}存在悬空子任务`,
      description: reason || '当前阶段的下游微服务任务已经不存在，和普通失败不同，需要重新创建该阶段子任务后再继续推进。',
      evidence: [
        { label: '异常阶段', value: failedStages.map((stage) => STAGE_LABELS[stage.stage_name] || stage.stage_name).join(' / ') || '-' },
        { label: '丢失子任务', value: summarizeCount(missingItems.length) },
        { label: '编排失败项', value: summarizeCount(failedItems.length) },
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
      description: reason || '任务已完成可推进的部分，但仍存在编排失败项、丢失项或取消项，需要按需查看失败项或手动重试对应阶段。',
      evidence: [
        { label: '失败阶段', value: failedStages.map((stage) => STAGE_LABELS[stage.stage_name] || stage.stage_name).join(' / ') || '-' },
        { label: '编排失败项', value: summarizeCount(failedItems.length) },
        { label: '丢失子任务', value: summarizeCount(missingItems.length) },
        { label: '下游真实失败', value: summarizeCount(downstreamFailedItems.length) },
        { label: '下游真实取消', value: summarizeCount(downstreamCancelledItems.length) },
      ],
    };
  }

  if (detail.status === 'cancelled') {
    const cleanupPartialFailed = Boolean(detail.cleanup_state?.partial_failed);
    return {
      tone: 'muted',
      title: '任务已取消',
      description: cleanupPartialFailed
        ? '任务已取消，部分历史下游资源仍在后台清理，不影响当前分析结果。'
        : firstText(detail.last_error) || '用户或编排器已取消任务，未完成阶段和仍在运行的子任务会被标记为取消。',
      evidence: [
        { label: '取消阶段', value: cancelledStages.map((stage) => STAGE_LABELS[stage.stage_name] || stage.stage_name).join(' / ') || '-' },
        { label: '取消子任务', value: summarizeCount(cancelledItems.length) },
        ...(cleanupPartialFailed
          ? [{ label: '待补偿下游', value: summarizeCount(Number(detail.cleanup_state?.deferred_ref_count || 0)) }]
          : []),
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

  const operationState = detail.manual_operation_state;
  const operationKind = activeOperationKind(operationState);
  if (operationKind === 'continue' || operationKind === 'retry') {
    const isRetryPreparing = operationKind === 'retry';
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
        { label: '待处理动作', value: operationState?.operation_type || (isRetryPreparing ? 'retry' : 'continue') },
        ...(isRetryPreparing
          ? [
              { label: '执行代次', value:`第 ${detail.execution_epoch} 轮` },
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
      title: detail.status === 'dispatching' ?`正在调度 ${currentStageLabel}` :`正在执行 ${currentStageLabel}`,
      description: runningArchive
        ?`当前正在处理 ${STAGE_LABELS[runningArchive.stage_name] || runningArchive.stage_name} 的产物归档，归档完成后才会应用阶段结果或继续推进。`
        : latestRunningItem
          ?`当前阶段已有下游子任务在执行：${latestRunningItem.downstream_task_id || latestRunningItem.item_key}。`
          : '编排器正在推进当前阶段，等待下游微服务返回结果或创建阶段子任务。',
      evidence: [
        { label: '当前阶段', value: currentStageLabel },
        { label: '运行子任务', value: summarizeCount(runningItems.length) },
        { label: '进行中归档', value: summarizeCount(runningArchiveJobs.length) },
      ],
    };
  }

  if (detail.status === 'queued') {
    const owner = taskRuntimeOwnerSummary(detail);
    return {
      tone: 'info',
      title: '任务正在队列中等待调度',
      description: '当前任务已经入队，但尚未获得 binary-security 编排器执行名额。',
      evidence: [
        { label: '队列位置', value: detail.queue_position ?`第 ${detail.queue_position} 位` : '-' },
        { label: owner.label, value: owner.value },
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

  if (detail.queue_state === 'db_pending_not_enqueued') {
    return {
      tone: 'warn',
      title: '任务待补偿回填',
      description: '数据库中任务仍处于待执行状态，但当前未出现在 Redis 调度队列中，编排器正在执行补偿或等待下一轮回填。',
      evidence: [
        { label: '恢复原因', value: detail.recoverable_reason || '-' },
        { label: '最近回填检查', value: detail.last_reconcile_at || '-' },
      ],
    };
  }

  if (detail.queue_state === 'tail_reconciling' || detail.tail_reconcile_state === 'handoff_waiting') {
    const owner = taskRuntimeOwnerSummary(detail);
    return {
      tone: 'info',
      title: '任务正在收口切换',
      description: '当前任务处于 tail reconcile handoff 阶段，编排器正在等待新的 owner 接管或完成下游状态同步。',
      evidence: [
        { label: owner.label, value: owner.value },
        { label: '收口状态', value: detail.tail_reconcile_state || '-' },
        { label: '恢复原因', value: detail.recoverable_reason || '-' },
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
      description:`上游阶段 ${STAGE_LABELS[staleFromStage] || staleFromStage || '-'} 重试后，后续阶段结果保留但需要重新评估。`,
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
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-60">异常原因</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold">{reason.title}</div>
 <span className="rounded-full border border-current/15 bg-theme-bg-app px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]">
              {reason.code}
            </span>
          </div>
          <div className="mt-1 text-xs leading-5 opacity-85">{reason.message}</div>
          {reason.recommended_action ? (
 <div className="mt-2 rounded-xl border border-current/10 bg-theme-surface px-2.5 py-2 text-xs">
              建议动作：{reason.recommended_action}
            </div>
          ) : null}
        </div>
        <div className="grid min-w-[220px] grid-cols-1 gap-2 sm:grid-cols-2">
          {(reason.evidence || []).slice(0, 4).map((item) => (
            <div key={`${item.key}-${item.value}`} className="min-w-0 rounded-xl border border-current/10 bg-slate-100/105 px-2.5 py-2 text-xs">
              <div className="font-bold opacity-55">{item.label}</div>
              <div className="mt-1 break-words font-semibold">{item.value || '-'}</div>
            </div>
          ))}
        </div>
      </div>
      {history && history.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          {history.slice(0, 3).map((item) => (
 <span key={item.event_id} className="rounded-full border border-current/10 bg-theme-bg-app px-2.5 py-1 font-semibold">
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
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-60">状态原因</div>
          <div className="mt-1 text-sm font-semibold">{reason.title}</div>
          <div className="mt-1 text-xs leading-5 opacity-85">{reason.description}</div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {reason.evidence.slice(0, 3).map((item) => (
            <div key={item.label} className="min-w-0 rounded-xl border border-current/10 bg-slate-100/105 px-2.5 py-2 text-xs">
              <div className="font-bold opacity-55">{item.label}</div>
              <div className="mt-1 break-words font-semibold">{item.value || '-'}</div>
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
      return 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400';
    case 'in_progress':
      return 'border-sky-500/20 bg-sky-500/15 text-sky-400';
    default:
      return 'border-amber-500/20 bg-amber-500/15 text-amber-400';
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
  const blockingRefs = Array.isArray(state.downstream_cleanup_blocking_refs) ? state.downstream_cleanup_blocking_refs : [];
  const deferredRefs = Array.isArray(state.downstream_cleanup_deferred_refs) ? state.downstream_cleanup_deferred_refs : [];
  const firstBlockingRef = blockingRefs[0];
  const firstDeferredRef = deferredRefs[0];
  return (
    <div className={`rounded-2xl border px-4 py-3 ${manualOperationTone(state.overall)}`}>
      <div className="flex flex-wrap items-center gap-3">
 <span className="rounded-full border border-current/20 bg-theme-bg-app px-3 py-1 text-[11px] font-medium">
          {manualOperationLabel(state.overall)}
        </span>
        <span className="text-sm font-semibold">{state.summary || '-'}</span>
      </div>
      <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-current/10 bg-slate-100/105 px-3 py-2">
          <div className="font-bold opacity-60">当前操作</div>
          <div className="mt-1 font-semibold">{state.operation_type || '-'}</div>
        </div>
        <div className="rounded-xl border border-current/10 bg-slate-100/105 px-3 py-2">
          <div className="font-bold opacity-60">操作状态 / 步骤</div>
          <div className="mt-1 break-all font-semibold">{state.operation_status || '-'} / {state.current_step || '-'}</div>
        </div>
        <div className="rounded-xl border border-current/10 bg-slate-100/105 px-3 py-2">
          <div className="font-bold opacity-60">锁持有实例</div>
          <div className="mt-1 break-all font-semibold">{state.operation_owner || '-'}</div>
        </div>
        <div className="rounded-xl border border-current/10 bg-slate-100/105 px-3 py-2">
          <div className="font-bold opacity-60">最近心跳</div>
          <div className="mt-1 font-semibold">{fmt(state.operation_heartbeat_at)}</div>
        </div>
        <div className="rounded-xl border border-current/10 bg-slate-100/105 px-3 py-2">
          <div className="font-bold opacity-60">预计释放</div>
          <div className="mt-1 font-semibold">{fmt(state.operation_expires_at)}</div>
        </div>
      </div>
      {state.error_message ? (
        <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-400">
          后台操作失败：{state.error_message}
        </div>
      ) : null}
      {Number(state.downstream_cleanup_result_count || 0) > 0 ? (
        <div className="mt-3 rounded-xl border border-current/10 bg-slate-100/105 px-3 py-2 text-xs">
          <div className="font-bold opacity-60">下游清理</div>
          <div className="mt-1 font-semibold">
            已记录 {state.downstream_cleanup_result_count} 个清理目标
            {Number(state.downstream_cleanup_blocking_count || 0) > 0 ?`，阻塞 ${state.downstream_cleanup_blocking_count} 个` : ''}
            {Number(state.downstream_cleanup_deferred_count || 0) > 0 ?`，待补偿 ${state.downstream_cleanup_deferred_count} 个` : ''}
          </div>
          {firstBlockingRef ? (
            <div className="mt-1 break-all font-mono text-[11px] opacity-80">
              阻塞目标：{String(firstBlockingRef.service || firstBlockingRef.downstream_service || '-')}/{String(firstBlockingRef.task_id || firstBlockingRef.downstream_task_id || '-')}，状态：{String(firstBlockingRef.observed_status || firstBlockingRef.delete_status || '-')}
            </div>
          ) : null}
          {!firstBlockingRef && firstDeferredRef ? (
            <div className="mt-1 break-all font-mono text-[11px] opacity-80">
              待补偿目标：{String(firstDeferredRef.service || firstDeferredRef.downstream_service || '-')}/{String(firstDeferredRef.task_id || firstDeferredRef.downstream_task_id || '-')}，原因：{String(firstDeferredRef.deferred_reason || firstDeferredRef.error || '-')}
            </div>
          ) : null}
        </div>
      ) : null}
      {state.cleanup_partial_failed ? (
        <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-400">
          {state.downstream_cleanup_warning_summary || '下游清理部分失败，系统会后台重试，不影响当前分析结果。'}
        </div>
      ) : null}
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
 <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">事件积压</div>
          <div className="mt-2 text-2xl font-bold text-theme-text-primary">{activeEventCount}</div>
          <div className="mt-1 text-xs text-theme-text-muted">最老 {Math.round(Number(stateEvents.oldest_active_age_seconds || 0))} 秒</div>
        </div>
 <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">死信事件</div>
          <div className={`mt-2 text-2xl font-bold ${deadLetterCount > 0 ? 'text-rose-400' : 'text-theme-text-primary'}`}>{deadLetterCount}</div>
          <div className="mt-1 text-xs text-theme-text-muted">超过重试上限后进入死信</div>
        </div>
 <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">状态锁</div>
          <div className={`mt-2 text-sm font-semibold ${lock.active ? 'text-blue-400' : 'text-emerald-400'}`}>{lock.active ? '持锁中' : '空闲'}</div>
          <div className="mt-1 break-all text-xs text-theme-text-muted">{lock.owner_id || '-'}</div>
        </div>
 <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">最近 Reconcile</div>
          <div className="mt-2 text-sm font-semibold text-theme-text-primary">{obs.reconcile?.latest_event_type || '-'}</div>
          <div className="mt-1 text-xs text-theme-text-muted">{fmt(obs.reconcile?.latest_event_at)}</div>
        </div>
 <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">文件写入目标</div>
          <div className="mt-2 break-all font-mono text-[11px] text-theme-text-secondary">{obs.files?.metadata_path || '-'}</div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
 <div className="rounded-xl border border-theme-border bg-theme-surface p-5">
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-theme-text-muted">归档状态分布</h3>
          <div className="mt-4 space-y-2">
            {Object.entries(archiveByStage).map(([stage, counts]) => (
              <div key={stage} className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
                <div className="font-semibold text-theme-text-primary">{STAGE_LABELS[stage] || stage}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {Object.entries(counts || {}).map(([status, count]) => (
                    <span key={status} style={{ borderRadius: '9999px', border: '1px solid', padding: '4px 8px', fontWeight: 600, ...statusTone(status), borderColor: statusTone(status).borderColor }}>{formatBinarySecurityStatus(status)} {count}</span>
                  ))}
                </div>
              </div>
            ))}
            {Object.keys(archiveByStage).length === 0 ? <div className="rounded-2xl border border-dashed border-theme-border px-4 py-8 text-center text-sm text-theme-text-muted">暂无归档任务</div> : null}
          </div>
        </div>
 <div className="rounded-xl border border-theme-border bg-theme-surface p-5">
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-theme-text-muted">状态事件</h3>
          <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
            {Object.entries(statusCounts).map(([status, count]) => (
              <div key={status} className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2">
                <div className="font-bold text-theme-text-muted">{status}</div>
                <div className="mt-1 text-lg font-semibold text-theme-text-primary">{count}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {[...processing, ...deadLetters, ...recent].slice(0, 8).map((event: any) => (
              <div key={event.id} className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-theme-text-primary">{event.event_type}</span>
                  <span style={{ borderRadius: '9999px', border: '1px solid', padding: '2px 8px', fontWeight: 600, ...statusTone(event.status), borderColor: statusTone(event.status).borderColor }}>{event.status}</span>
                </div>
                <div className="mt-1 break-all text-theme-text-muted">owner={event.leased_by || '-'} · attempts={event.attempts ?? 0} · {fmt(event.created_at)}</div>
                {event.error_message ? <div className="mt-1 break-all text-rose-400">{event.error_message}</div> : null}
              </div>
            ))}
          </div>
        </div>
      </section>
    </section>
  );
}

function ApiKeysPanel({
  detail,
  stageSequence,
  onCopy,
}: {
  detail: BinarySecurityTaskDetail;
  stageSequence: string[];
  onCopy: (value: string, successMessage: string) => Promise<void>;
}) {
  const snapshot: BinarySecurityTaskKeySnapshot = detail.task_key_snapshot || {
    root_task_key: {
      id: detail.root_task_key_id || null,
      name: detail.root_task_key_name || null,
      prefix: detail.root_task_key_prefix || null,
      source: detail.task_key_source || null,
      has_secret: Boolean(detail.has_root_task_key),
      used: Boolean(
        detail.has_root_task_key
        || detail.root_task_key_id
        || detail.root_task_key_name
        || detail.root_task_key_prefix
        || detail.task_key_source,
      ),
    },
    work_keys: [],
  };
  const rootTaskKey = snapshot.root_task_key || {
    id: null,
    name: null,
    prefix: null,
    source: null,
    has_secret: false,
    used: false,
  };
  const workKeys = Array.isArray(snapshot.work_keys) ? snapshot.work_keys : [];
  const stageGroups = stageSequence
    .filter((stageName) => workKeys.some((workKey) => workKey.stage_name === stageName))
    .concat(
      Array.from(new Set(
        workKeys
          .map((workKey) => String(workKey.stage_name || '').trim())
          .filter((stageName) => stageName && !stageSequence.includes(stageName)),
      )),
    );
  const hasAnyKeys = Boolean(rootTaskKey.used) || workKeys.length > 0;

  return (
    <section className="space-y-6">
      <section className="rounded-xl border border-theme-border bg-theme-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-theme-text-primary">API 密钥</h2>
            <p className="mt-1 text-sm text-theme-text-muted">展示当前任务使用的任务级密钥与各阶段派生的 work key。</p>
          </div>
          {!hasAnyKeys ? (
            <span className="inline-flex rounded-full border border-amber-500/20 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-400">
              未使用任务级密钥
            </span>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">Task Key ID</div>
            <button type="button" onClick={() => void onCopy(String(rootTaskKey.id || ''), 'Task Key ID 已复制')} className="mt-2 break-all text-left font-mono text-xs font-bold text-theme-text-primary hover:text-sky-400">
              {String(rootTaskKey.id || '-')}
            </button>
          </div>
          <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">名称</div>
            <button type="button" onClick={() => void onCopy(String(rootTaskKey.name || ''), '任务级密钥名称已复制')} className="mt-2 break-all text-left text-xs font-bold text-theme-text-primary hover:text-sky-400">
              {String(rootTaskKey.name || '-')}
            </button>
          </div>
          <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">前缀</div>
            <div className="mt-2 break-all font-mono text-xs font-bold text-theme-text-primary">{String(rootTaskKey.prefix || '-')}</div>
          </div>
          <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">来源</div>
            <div className="mt-2 text-xs font-bold text-theme-text-primary">{String(rootTaskKey.source || '-')}</div>
          </div>
          <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">Secret</div>
            <div className={`mt-2 text-xs font-semibold ${rootTaskKey.has_secret ? 'text-emerald-400' : 'text-theme-text-muted'}`}>
              {rootTaskKey.has_secret ? '已配置' : '未配置'}
            </div>
          </div>
        </div>

        {!hasAnyKeys ? (
          <div className="mt-6 rounded-2xl border border-dashed border-theme-border bg-theme-surface px-6 py-10 text-center text-sm text-theme-text-muted">
            当前任务未使用任务级密钥。系统未为该任务或其阶段派生 task key / work key。
          </div>
        ) : null}
      </section>

      {hasAnyKeys ? (
        stageGroups.length > 0 ? (
          <section className="space-y-4">
            {stageGroups.map((stageName) => {
              const rows = workKeys
                .filter((workKey) => workKey.stage_name === stageName)
                .slice()
                .sort((left, right) => String(left.created_at || '').localeCompare(String(right.created_at || '')));
              return (
                <div key={stageName} className="rounded-xl border border-theme-border bg-theme-surface p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-theme-text-primary">{STAGE_LABELS[stageName] || stageName}</h3>
                      <p className="mt-1 text-xs text-theme-text-muted">当前阶段派生的 work key 与关联子任务。</p>
                    </div>
                    <span className="rounded-full border border-theme-border bg-theme-bg-app px-3 py-1 text-xs font-semibold text-theme-text-secondary">
                      {rows.length} 条
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded-2xl border border-theme-border">
                    <table className="min-w-[1040px] w-full divide-y divide-theme-border text-left text-xs">
                      <thead className="bg-theme-bg-app text-[11px] font-semibold uppercase tracking-[0.12em] text-theme-text-muted">
                        <tr>
                          <th className="px-3 py-2">阶段</th>
                          <th className="px-3 py-2">服务</th>
                          <th className="px-3 py-2">Stage Item</th>
                          <th className="px-3 py-2">下游任务</th>
                          <th className="px-3 py-2">Work Key ID</th>
                          <th className="px-3 py-2">名称</th>
                          <th className="px-3 py-2">前缀</th>
                          <th className="px-3 py-2">来源</th>
                          <th className="px-3 py-2">创建时间</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-theme-border bg-theme-bg-app">
                        {rows.map((workKey: BinarySecurityWorkKeySnapshot, index) => (
                          <tr key={`${stageName}:${workKey.stage_item_id || index}:${workKey.agent_task_key_id || ''}`} className="hover:bg-slate-100/80">
                            <td className="px-3 py-2 font-bold text-theme-text-primary">{STAGE_LABELS[stageName] || stageName}</td>
                            <td className="px-3 py-2 font-mono text-theme-text-secondary">{String(workKey.service || '-')}</td>
                            <td className="px-3 py-2">
                              <div className="font-mono text-theme-text-secondary">{String(workKey.stage_item_id || '-')}</div>
                              <div className="mt-1 text-[11px] text-theme-text-muted">{String(workKey.stage_item_key || '-')}</div>
                            </td>
                            <td className="px-3 py-2">
                              <button type="button" onClick={() => void onCopy(String(workKey.downstream_task_id || ''), '下游任务 ID 已复制')} className="break-all text-left font-mono text-theme-text-secondary hover:text-sky-400">
                                {String(workKey.downstream_task_id || '-')}
                              </button>
                            </td>
                            <td className="px-3 py-2">
                              <button type="button" onClick={() => void onCopy(String(workKey.agent_task_key_id || ''), 'Work Key ID 已复制')} className="break-all text-left font-mono text-theme-text-secondary hover:text-sky-400">
                                {String(workKey.agent_task_key_id || '-')}
                              </button>
                            </td>
                            <td className="px-3 py-2">
                              <button type="button" onClick={() => void onCopy(String(workKey.agent_task_key_name || ''), 'Work Key 名称已复制')} className="break-all text-left text-theme-text-secondary hover:text-sky-400">
                                {String(workKey.agent_task_key_name || '-')}
                              </button>
                            </td>
                            <td className="px-3 py-2 font-mono text-theme-text-secondary">{String(workKey.agent_task_key_prefix || '-')}</td>
                            <td className="px-3 py-2 text-theme-text-secondary">{String(workKey.agent_task_key_source || '-')}</td>
                            <td className="px-3 py-2 text-theme-text-secondary">{fmt(workKey.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </section>
        ) : (
          <section className="rounded-xl border border-dashed border-theme-border bg-theme-surface px-6 py-10 text-center text-sm text-theme-text-muted">
            当前任务未派生任何阶段 work key。
          </section>
        )
      ) : null}
    </section>
  );
}

function deriveArchiveJobsFromStageSummaries(detail: BinarySecurityTaskDetail): ArchiveJob[] {
  const summaries = detail.stage_summaries || [];
  return summaries.flatMap((summary) => {
    const archive = (summary as any).archive as { status_counts?: Record<string, number> } | undefined;
    const statusCounts = archive?.status_counts || {};
    const knownStatuses = ['success', 'failed', 'running', 'pending', 'archived', 'applying'] as const;
    return knownStatuses.flatMap((status) => {
      const count = Number(statusCounts[status] || 0);
      if (count <= 0) return [];
      return Array.from({ length: count }, (_, index) => ({
        id:`summary:${summary.stage_name}:${status}:${index}`,
        stage_name: summary.stage_name,
        item_id: '',
        item_key: null,
        downstream_service: null,
        downstream_task_id: null,
        archive_status: status,
        archive_root: null,
        error_message: null,
        abnormal_reason: null,
        attempts: 0,
        created_at: null,
        started_at: null,
        completed_at: null,
        updated_at: null,
        retry_supported: false,
        retry_reason: null,
        retry_failed_supported: false,
        retry_failed_reason: null,
        copy_stats: undefined,
      }));
    });
  });
}

export const BinarySecurityTaskDetailPage: React.FC<Props> = ({ projectId, taskId, taskType, onBack }) => {
  const executionApi = api.domains.execution;
  const navigate = useNavigate();
  const stageFlowRef = useRef<HTMLDivElement | null>(null);
  const [detail, setDetail] = useState<BinarySecurityTaskDetail | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [timelineTotal, setTimelineTotal] = useState(0);
  const [timelineHasMore, setTimelineHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detailRefreshing, setDetailRefreshing] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineClearing, setTimelineClearing] = useState(false);
  const [overviewNodes, setOverviewNodes] = useState<BinarySecurityOverviewNode[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewLoaded, setOverviewLoaded] = useState(false);
  const [archiveJobs, setArchiveJobs] = useState<ArchiveJob[]>([]);
  const [archiveJobsLoading, setArchiveJobsLoading] = useState(false);
  const [archiveJobsLoaded, setArchiveJobsLoaded] = useState(false);
  const [orchestrationObservability, setOrchestrationObservability] = useState<BinarySecurityOrchestrationObservability | null>(null);
  const [orchestrationLoading, setOrchestrationLoading] = useState(false);
  const [orchestrationLoaded, setOrchestrationLoaded] = useState(false);
  const [stageItemsPage, setStageItemsPage] = useState<BinarySecurityStageItemPage | null>(null);
  const [stageItemsPageLoading, setStageItemsPageLoading] = useState(false);
  const [stageItemsPageError, setStageItemsPageError] = useState<string | null>(null);
  const [stageItemsCurrentPage, setStageItemsCurrentPage] = useState(1);
  const [stageItemsPerPage, setStageItemsPerPage] = useState(DEFAULT_STAGE_ITEMS_PER_PAGE);
  const [moduleSelectionLoading, setModuleSelectionLoading] = useState(false);
  const [moduleTableNameFilter, setModuleTableNameFilter] = useState('');
  const [moduleTableRiskFilter, setModuleTableRiskFilter] = useState<'all' | '高' | '中' | '低'>('all');
  const [moduleTableSourceFilter, setModuleTableSourceFilter] = useState<'all' | '系统分析' | '候选' | '已选'>('all');
  const [moduleTableSortKey, setModuleTableSortKey] = useState<'module_name' | 'risk_level' | 'risk_score' | 'file_count' | 'module_key'>('risk_score');
  const [moduleTableSortDirection, setModuleTableSortDirection] = useState<'asc' | 'desc'>('desc');
  const [moduleSelection, setModuleSelection] = useState<BinarySecurityModuleSelection | null>(null);
  const [selectedModuleKeys, setSelectedModuleKeys] = useState<string[]>([]);
  const [entrySelectionLoading, setEntrySelectionLoading] = useState(false);
  const [entrySelection, setEntrySelection] = useState<import('../../clients/binarySecurity').BinarySecurityEntrySelection | null>(null);
  const [selectedEntryKeys, setSelectedEntryKeys] = useState<string[]>([]);
  const [selectedStageItemIds, setSelectedStageItemIds] = useState<string[]>([]);
  const [stageStatusFilter, setStageStatusFilter] = useState<string>('all');
  const [stageDownstreamStatusFilter, setStageDownstreamStatusFilter] = useState<string>('all');
  const [stageSyncStatusFilter, setStageSyncStatusFilter] = useState<string>('all');
  const [stageItemTimeSort, setStageItemTimeSort] = useState<StageItemTimeSort>(null);
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
  const [selectedModuleReportTarget, setSelectedModuleReportTarget] = useState<ModuleReportDialogTarget | null>(null);
  const [moduleReportDialogOpen, setModuleReportDialogOpen] = useState(false);
  const [moduleReportLoading, setModuleReportLoading] = useState(false);
  const [moduleReportError, setModuleReportError] = useState<string | null>(null);
  const [moduleReportCache, setModuleReportCache] = useState<Record<string, BinarySecurityModuleReportDetail>>({});
  const [selectedStage, setSelectedStage] = useState<string>(DEFAULT_BINARY_STAGE_SEQUENCE[0]);
  const [selectedNodeKind, setSelectedNodeKind] = useState<StageNodeKind>('business');
  const [downstreamByItemId, setDownstreamByItemId] = useState<Record<string, DownstreamTaskState>>({});
  const downstreamByItemIdRef = useRef<Record<string, DownstreamTaskState>>({});
  const entrySelectionRequestKeyRef = useRef<string | null>(null);
  const stageItemsRequestKeyRef = useRef<string | null>(null);
  const [runtimeHealthExpanded, setRuntimeHealthExpanded] = useState(false);
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
      : (isSourceTask
        ? (detail?.pipeline_profile === 'kg_source_vuln_scan' ? DEFAULT_SOURCE_KG_STAGE_SEQUENCE : DEFAULT_SOURCE_STAGE_SEQUENCE)
        : isBinaryModuleTask
          ? DEFAULT_MODULE_STAGE_SEQUENCE
          : DEFAULT_BINARY_STAGE_SEQUENCE)),
    [detail?.pipeline_profile, detail?.stage_sequence, isBinaryModuleTask, isSourceTask],
  );
  const canActOnTask = Boolean(detail);
  const manualOperationState = detail?.manual_operation_state;
  const displayTaskStatus = taskDisplayStatus(detail?.status, manualOperationState);
  const runtimeOwner = detail ? taskRuntimeOwnerSummary(detail) : null;
  const isManualOperationInProgress = Boolean(manualOperationState?.operation_in_progress);
  const taskRetrySupported = Boolean(manualOperationState?.can_retry ?? detail?.task_retry_supported);
  const taskRetryReason = manualOperationState?.blocking_reason || detail?.task_retry_reason || '当前任务不可严格清理后从头开始';
  const taskRetryFailedItemsSupported = Boolean(manualOperationState?.can_retry_failed_items ?? detail?.task_retry_failed_items_supported);
  const taskRetryFailedItemsReason = manualOperationState?.blocking_reason || detail?.task_retry_failed_items_reason || '当前任务不可重试失败项';
  const taskCancelSupported = Boolean(manualOperationState?.can_cancel ?? canActOnTask);
  const taskDeleteSupported = Boolean(manualOperationState?.can_delete ?? canActOnTask);
  const moduleConfirmSupported = Boolean(manualOperationState?.can_confirm_modules ?? false);
  const entryConfirmSupported = Boolean(detail?.status === 'pending_entry_confirmation');
  const staleStages = useMemo(() => new Set<string>((detail?.summary?.stale_stages as string[] | undefined) || []), [detail?.summary]);
  const cleanupSnapshot = detail?.cleanup_snapshot || null;
  const cleanupCounts = cleanupSnapshot?.cleanup_counts || {};
  const cleanupDownstreamRefs = Array.isArray(cleanupSnapshot?.downstream_refs) ? cleanupSnapshot.downstream_refs : [];
  const cleanupState = detail?.cleanup_state || null;
  const cleanupDeferredCount = Number(cleanupState?.deferred_ref_count || 0);
  const cleanupPartialFailed = Boolean(cleanupState?.partial_failed);
  const runtimeHealth = detail?.runtime_health || null;
  const runtimeHealthSummary = runtimeHealth?.summary || null;
  const runtimeHealthUnits = runtimeHealth?.units || [];
  const runtimeHealthSpotlight = runtimeHealth?.spotlight || [];
  const runtimeHealthSnapshotCards = runtimeHealth?.snapshot_cards || [];
  const runtimeHealthRelatedLoops = runtimeHealth?.related_loops || [];
  const runtimeHealthGroups = useMemo<BinarySecurityRuntimeHealthGroup[]>(() => {
    if (runtimeHealth?.groups?.length) return runtimeHealth.groups;
    if (!runtimeHealthUnits.length) return [];
    const groupOrder = ['execution', 'lease', 'tail', 'stage_workers', 'operation', 'archive', 'other'];
    const groupMeta = (unit: BinarySecurityRuntimeHealthUnit) => {
      switch (unit.unit_key) {
        case 'task_worker':
          return { group_key: 'execution', group_label: '任务执行', description: '主任务执行协程与 owner/lease 一致性' };
        case 'task_heartbeat':
          return { group_key: 'lease', group_label: '保活与心跳', description: '任务级保活单元、lease 与心跳新鲜度' };
        case 'downstream_sync':
          return { group_key: 'tail', group_label: 'Tail 收口', description: '下游同步、tail reconcile 与最终收口推进' };
        case 'stage_workers':
          return { group_key: 'stage_workers', group_label: '阶段子协程', description: '活跃 stage item 对应的父任务侧协程观察' };
        case 'task_operation':
          return { group_key: 'operation', group_label: '任务操作', description: 'retry/continue/cancel 操作协程与锁' };
        case 'archive_workers':
          return { group_key: 'archive', group_label: '归档执行', description: '归档 worker 与归档任务活动状态' };
        default:
          return { group_key: 'other', group_label: '其他单元', description: '未归类的任务 scoped 运行单元' };
      }
    };
    const statusRank = (status?: string | null) => {
      switch (String(status || '').trim().toLowerCase()) {
        case 'unhealthy':
          return 5;
        case 'degraded':
          return 4;
        case 'healthy':
          return 3;
        case 'unknown':
          return 2;
        case 'idle':
          return 1;
        default:
          return 0;
      }
    };
    const grouped = new Map<string, BinarySecurityRuntimeHealthGroup>();
    runtimeHealthUnits.forEach((unit) => {
      const meta = groupMeta(unit);
      const current = grouped.get(meta.group_key);
      if (current) {
        current.units.push(unit);
        current.active_unit_count += ['healthy', 'degraded', 'unhealthy'].includes(String(unit.status || '').trim().toLowerCase()) ? 1 : 0;
        if (statusRank(unit.status) > statusRank(current.status)) current.status = unit.status;
        return;
      }
      grouped.set(meta.group_key, {
        group_key: meta.group_key,
        group_label: meta.group_label,
        description: meta.description,
        status: unit.status,
        active_unit_count: ['healthy', 'degraded', 'unhealthy'].includes(String(unit.status || '').trim().toLowerCase()) ? 1 : 0,
        units: [unit],
      });
    });
    return Array.from(grouped.values()).sort(
      (left, right) => groupOrder.indexOf(left.group_key) - groupOrder.indexOf(right.group_key),
    );
  }, [runtimeHealth?.groups, runtimeHealthUnits]);
  const runtimeHealthAlerts = useMemo(
    () => runtimeHealthUnits.filter((unit) => ['unhealthy', 'degraded'].includes(String(unit.status || '').trim().toLowerCase())),
    [runtimeHealthUnits],
  );
  const runtimeHealthHotLoops = useMemo<BinarySecurityRuntimeHealthLoopSnapshot[]>(
    () => runtimeHealthRelatedLoops.filter((loop) => ['healthy', 'degraded', 'unhealthy'].includes(String(loop.status || '').trim().toLowerCase())),
    [runtimeHealthRelatedLoops],
  );
  const runtimeOwnerTopology = useMemo(
    () => deriveRuntimeOwnerTopology(detail, runtimeHealthUnits, runtimeHealthSnapshotCards),
    [detail, runtimeHealthSnapshotCards, runtimeHealthUnits],
  );
  const runtimeDiagnoses = useMemo<RuntimeDiagnosis[]>(
    () => deriveRuntimeDiagnoses({
      detail,
      runtimeHealthUnits,
      runtimeHealthRelatedLoops,
      runtimeHealthSnapshotCards,
      runtimeOwnerTopology,
    }),
    [detail, runtimeHealthRelatedLoops, runtimeHealthSnapshotCards, runtimeHealthUnits, runtimeOwnerTopology],
  );
  const visibleRuntimeHealthUnits = runtimeHealthExpanded ? runtimeHealthUnits : runtimeHealthUnits.slice(0, 5);
  const effectiveDetail = useMemo(() => {
    if (!detail) return null;
    return {
      ...detail,
      archive_jobs: archiveJobsLoaded ? archiveJobs : deriveArchiveJobsFromStageSummaries(detail),
      overview_nodes: overviewNodes.length > 0 ? overviewNodes : (detail.overview_nodes || []),
      orchestration_observability: orchestrationLoaded ? (orchestrationObservability || {}) : (detail.orchestration_observability || {}),
    } as BinarySecurityTaskDetail;
  }, [archiveJobs, archiveJobsLoaded, detail, orchestrationLoaded, orchestrationObservability, overviewNodes]);
  const taskStatusReason = useMemo(() => (effectiveDetail ? deriveTaskStatusReason(effectiveDetail) : null), [effectiveDetail]);
  const strategyEditable = Boolean(
    manualOperationState?.can_edit_policy ??
    (detail && !['dispatching', 'running'].includes(detail?.status || '') && !isManualOperationInProgress),
  );
  const strategyBlockedReason = !detail
    ? '任务详情尚未加载'
    : strategyEditable
      ? null
      : manualOperationState?.blocking_reason ||`任务运行中，任务策略暂不可修改。当前状态：${formatBinarySecurityStatus(displayTaskStatus)}`;
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
  const entryStrategySectionDirty = useMemo(
    () => !strategySectionEquals('entry_strategy', strategyDraft, strategySavedSnapshot),
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
      if (!(task.status === 'pending_entry_confirmation' || task.summary?.entry_selection)) {
        setEntrySelection(null);
        setSelectedEntryKeys([]);
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
      setDetail(null);
      setStageItemsPage(null);
      setDownstreamByItemId({});
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

  const loadEntrySelection = async () => {
    if (!projectId || !taskId) return;
    const requestKey =`${projectId}:${taskId}`;
    if (entrySelectionRequestKeyRef.current === requestKey) return;
    entrySelectionRequestKeyRef.current = requestKey;
    setEntrySelectionLoading(true);
    try {
      const entrySelectionResp = await executionApi.binarySecurity.getEntrySelection(projectId, taskId);
      setEntrySelection(entrySelectionResp);
      const defaultKeys = (
        entrySelectionResp?.selected_entry_keys?.length
          ? entrySelectionResp.selected_entry_keys
          : (entrySelectionResp?.candidate_entries || []).map((item) => String(item.entry_key || '').trim()).filter(Boolean)
      );
      setSelectedEntryKeys(defaultKeys);
    } catch {
      setEntrySelection(null);
    } finally {
      if (entrySelectionRequestKeyRef.current === requestKey) {
        entrySelectionRequestKeyRef.current = null;
      }
      setEntrySelectionLoading(false);
    }
  };

  const loadTimeline = async (page = timelinePage, pageSize = timelinePageSize) => {
    if (!projectId || !taskId) return;
    setTimelineLoading(true);
    setError(null);
    try {
      const timelineResp = await executionApi.binarySecurity.getTimeline(projectId, taskId, page, pageSize);
      setTimeline(timelineResp.events || []);
      setTimelineTotal(Number(timelineResp.total || 0));
      setTimelineHasMore(Boolean(timelineResp.has_more));
    } catch (e: any) {
      setError(e?.message || '加载事件时间线失败');
    } finally {
      setTimelineLoading(false);
    }
  };

  const loadStageItemsPage = async () => {
    if (activeTab !== 'overview' || selectedNodeKind !== 'business' || !detail || !projectId || !taskId || !selectedStage) return;
    const requestKey =`${projectId}:${taskId}:${selectedStage}:${stageItemsCurrentPage}:${stageItemsPerPage}:${stageStatusFilter}:${stageDownstreamStatusFilter}:${stageSyncStatusFilter}:${stageItemTimeSort?.key || ''}:${stageItemTimeSort?.direction || ''}`;
    if (stageItemsRequestKeyRef.current === requestKey) return;
    stageItemsRequestKeyRef.current = requestKey;
    setStageItemsPageLoading(true);
    setStageItemsPageError(null);
    try {
      const payload = await api.binarySecurity.getTaskStageItems(projectId, taskId, {
        stage_name: selectedStage,
        page: stageItemsCurrentPage,
        per_page: stageItemsPerPage,
        status: stageStatusFilter !== 'all' ? stageStatusFilter : undefined,
        downstream_status: stageDownstreamStatusFilter !== 'all' ? stageDownstreamStatusFilter : undefined,
        sync_status: stageSyncStatusFilter !== 'all' ? stageSyncStatusFilter : undefined,
        sort_by: stageItemTimeSort?.key,
        sort_direction: stageItemTimeSort?.direction,
      });
      setStageItemsPage(payload);
    } catch (fetchError: any) {
      setStageItemsPage(null);
      setStageItemsPageError(fetchError?.message || '加载阶段子任务失败');
    } finally {
      if (stageItemsRequestKeyRef.current === requestKey) {
        stageItemsRequestKeyRef.current = null;
      }
      setStageItemsPageLoading(false);
    }
  };

  const clearTimeline = async () => {
    if (!projectId || !taskId || timelineClearing) return;
    const confirmed = await showConfirm({
      title: '清空事件时间线',
      message:`将删除当前${isBinaryModuleTask ? '二进制模块任务' : isSourceTask ? '源码任务' : '二进制任务'}的全部事件时间线记录。该操作不影响任务状态、阶段结果和产物文件，删除后不可恢复，是否继续？`,
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
      setTimelineTotal(0);
      setTimelineHasMore(false);
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

  const loadOverview = async () => {
    if (!projectId || !taskId) return;
    setOverviewLoading(true);
    try {
      const payload: BinarySecurityOverviewResponse = await executionApi.binarySecurity.getTaskOverview(projectId, taskId);
      setOverviewNodes(payload.nodes || []);
    } catch (e: any) {
      setError(e?.message || '加载任务总览失败');
    } finally {
      setOverviewLoaded(true);
      setOverviewLoading(false);
    }
  };

  const loadArchiveJobs = async () => {
    if (!projectId || !taskId) return;
    setArchiveJobsLoading(true);
    try {
      const payload = await executionApi.binarySecurity.getTaskArchiveJobs(projectId, taskId, { per_page: 500 });
      setArchiveJobs(payload.items || []);
    } catch (e: any) {
      setError(e?.message || '加载归档任务失败');
    } finally {
      setArchiveJobsLoaded(true);
      setArchiveJobsLoading(false);
    }
  };

  const loadOrchestrationObservability = async () => {
    if (!projectId || !taskId) return;
    setOrchestrationLoading(true);
    try {
      const payload = await executionApi.binarySecurity.getOrchestrationObservability(projectId, taskId);
      setOrchestrationObservability(payload || {});
    } catch (e: any) {
      setError(e?.message || '加载编排观测失败');
    } finally {
      setOrchestrationLoaded(true);
      setOrchestrationLoading(false);
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
      if (section === 'entry_strategy') {
        return {
          ...current,
          entry_selection_mode: strategySavedSnapshot.entry_selection_mode,
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
          : section === 'entry_strategy'
            ? {
                entry_selection_mode: strategyDraft.entry_selection_mode,
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
          : section === 'entry_strategy'
            ? '入口推进策略'
          : '并发与失败处理';
      setNotice(`${sectionLabel}已保存，将在后续阶段生效`);
      if (activeTab === 'timeline') {
        await loadTimeline(1, timelinePageSize);
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
        setOverviewNodes([]);
        setOverviewLoaded(false);
        setArchiveJobs([]);
        setArchiveJobsLoaded(false);
      }
      if (activeTab === 'modules') {
        setModuleSelection(null);
      }
      if (activeTab === 'timeline') {
        setTimeline([]);
        setTimelineTotal(0);
        setTimelineHasMore(false);
        setExpandedEventKey(null);
      }
      if (activeTab === 'orchestration') {
        setOrchestrationObservability(null);
        setOrchestrationLoaded(false);
      }
      const refreshedTask = await loadTask({
        showLoading: false,
        preserveStrategyDraft: activeTab === 'strategy' && strategyDirty,
      });
      if (activeTab === 'overview' && refreshedTask) {
        await Promise.all([loadOverview(), loadArchiveJobs()]);
      }
      if (activeTab === 'modules' && refreshedTask) await loadModuleSelection();
      if (activeTab === 'timeline') await loadTimeline(timelinePage, timelinePageSize);
      if (activeTab === 'orchestration') await loadOrchestrationObservability();
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
    setOverviewNodes([]);
    setOverviewLoaded(false);
    setArchiveJobs([]);
    setArchiveJobsLoaded(false);
    setOrchestrationObservability(null);
    setOrchestrationLoaded(false);
  }, [projectId, taskId]);

  useEffect(() => {
    if (!detail || TERMINAL.has(detail.status)) return;
    if (detail.status === 'pending_module_confirmation') return;
    const timer = window.setInterval(
      () => void loadTask({ preserveStrategyDraft: activeTab === 'strategy' && strategyDirty }),
      30000,
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
    if (!isSourceTask || activeTab !== 'modules' || !projectId || !taskId) return;
    if (!detail) return;
    const needsEntrySelection = detail.status === 'pending_entry_confirmation' || Boolean(detail.summary?.entry_selection);
    if (!needsEntrySelection) {
      if (entrySelection || selectedEntryKeys.length > 0) {
        setEntrySelection(null);
        setSelectedEntryKeys([]);
      }
      return;
    }
    if (entrySelection || entrySelectionLoading) return;
    void loadEntrySelection();
  }, [
    activeTab,
    detail,
    entrySelection,
    entrySelectionLoading,
    isSourceTask,
    projectId,
    selectedEntryKeys.length,
    taskId,
  ]);

  useEffect(() => {
    if (activeTab === 'overview' && !overviewLoaded && !overviewLoading) {
      void loadOverview();
    }
  }, [activeTab, overviewLoaded, overviewLoading, projectId, taskId]);

  useEffect(() => {
    if (activeTab === 'overview' && !archiveJobsLoaded && !archiveJobsLoading) {
      void loadArchiveJobs();
    }
  }, [activeTab, archiveJobsLoaded, archiveJobsLoading, projectId, taskId]);

  useEffect(() => {
    if (activeTab === 'orchestration' && !orchestrationLoaded && !orchestrationLoading) {
      void loadOrchestrationObservability();
    }
  }, [activeTab, orchestrationLoaded, orchestrationLoading, projectId, taskId]);

  useEffect(() => {
    downstreamByItemIdRef.current = downstreamByItemId;
  }, [downstreamByItemId]);

  const fetchDownstreamTaskDetail = async (
    item: BinarySecurityTaskDetail['stage_items'][number],
  ): Promise<DownstreamTaskDetail> => {
    const downstreamTaskId = item.downstream_task_id!;
    if (item.stage_name === 'firmware_unpack') {
      const data = await executionApi.firmwareUnpacker.getTask(downstreamTaskId);
      return { kind: 'firmware_unpack', data };
    }
    if (item.stage_name === 'system_analysis') {
      const data = await executionApi.appSystemAnalyse.getTask(downstreamTaskId);
      return { kind: 'system_analysis', data };
    }
    if (item.stage_name === 'binary_to_source') {
      const data = await executionApi.binaryToSource.getTask(projectId, downstreamTaskId);
      return { kind: 'binary_to_source', data };
    }
    if (item.stage_name === 'entry_analysis') {
      const data = await executionApi.appEntryAnalyse.getTask(downstreamTaskId);
      return { kind: 'entry_analysis', data };
    }
    if (item.stage_name === 'dataflow_vuln_scan') {
      const data = await executionApi.appDataflowVulnScan.getTask(downstreamTaskId);
      return { kind: 'dataflow_vuln_scan', data };
    }
    throw new Error('当前阶段未配置下游详情加载器');
  };

  const ensureDownstreamDetail = async (item: BinarySecurityTaskDetail['stage_items'][number]) => {
    if (!item.downstream_task_id) return;
    const current = downstreamByItemIdRef.current[item.id];
    if (current?.downstreamTaskId === item.downstream_task_id && (current?.loading || current?.detail || current?.error)) return;
    setDownstreamByItemId((existing) => ({ ...existing, [item.id]: { loading: true } }));
    try {
      const detailState = await fetchDownstreamTaskDetail(item);
      setDownstreamByItemId((existing) => ({
        ...existing,
        [item.id]: { loading: false, detail: detailState, downstreamTaskId: item.downstream_task_id || undefined },
      }));
    } catch (fetchError: any) {
      setDownstreamByItemId((existing) => ({
        ...existing,
        [item.id]: { loading: false, error: normalizeDownstreamDetailError(fetchError), downstreamTaskId: item.downstream_task_id || undefined },
      }));
    }
  };

  useEffect(() => {
    void loadStageItemsPage();
  }, [activeTab, detail?.id, projectId, selectedNodeKind, selectedStage, stageItemsCurrentPage, stageItemsPerPage, stageStatusFilter, stageDownstreamStatusFilter, stageSyncStatusFilter, stageItemTimeSort, taskId]);

  useEffect(() => {
    if (activeTab !== 'overview' || selectedNodeKind !== 'business' || !detail || !projectId || !taskId || !selectedStage) return;
    const timer = window.setInterval(() => {
      void loadStageItemsPage();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [activeTab, detail?.id, projectId, selectedNodeKind, selectedStage, stageItemsCurrentPage, stageItemsPerPage, stageStatusFilter, stageDownstreamStatusFilter, stageSyncStatusFilter, stageItemTimeSort, taskId]);

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

  const runAction = async (action: 'cancel' | 'retry' | 'continue' | 'delete' | 'force-reset', options?: { force?: boolean }) => {
    if (!projectId || !taskId) return;
    if (action === 'delete') {
      const confirmed = await showConfirm(
        options?.force
          ? {
              title: '强制删除任务',
              message:
                '强制删除会忽略下游任务删除失败，继续清理当前主任务和本地工作区。该操作可能留下孤儿下游任务，且不可恢复，是否继续？',
              confirmText: '确认强制删除',
              cancelText: '取消',
              danger: true,
            }
          : {
              title: '删除任务',
              message: '删除会先取消并删除所有下游阶段任务，然后删除当前任务记录并清空任务目录。删除后不可恢复，是否继续？',
              confirmText: '确认删除',
              cancelText: '取消',
              danger: true,
            },
      );
      if (!confirmed) return;
    }
    if (action === 'force-reset') {
      const confirmed = await showConfirm({
        title: '强制重置任务状态',
        message: '将清理当前任务悬挂的操作、owner、lease 和运行时信号，并把任务重置为待调度。该操作不会删除现有下游子任务，是否继续？',
        confirmText: '确认重置',
        cancelText: '取消',
        danger: true,
      });
      if (!confirmed) return;
    }
    setActionLoading(action);
    try {
      if (action === 'cancel') await executionApi.binarySecurity.cancelTask(projectId, taskId);
      if (action === 'force-reset') {
        const result = await executionApi.binarySecurity.forceResetTaskToPending(projectId, taskId);
        setNotice(result?.message || '任务已强制重置为待调度');
        await refreshActiveTab();
        return;
      }
      if (action === 'delete') {
        const result = await executionApi.binarySecurity.deleteTask(projectId, taskId, options);
        setNotice(result?.message || (options?.force ? '强制删除已受理，后台正在处理中' : '删除已受理，后台正在处理中'));
        onBack();
        return;
      }
      await refreshActiveTab();
    } catch (e: any) {
      setError(e?.message ||`${action} 失败`);
    } finally {
      setActionLoading('');
    }
  };

  const retryStageFailedItems = async (stageName: string) => {
    if (!projectId || !taskId || !detail) return;
    const summary = detail.stage_summaries.find((item) => item.stage_name === stageName);
    if (!summary || !summary.retry_failed_supported || manualOperationState?.can_retry_stage_failed_items === false) {
      setError(manualOperationState?.blocking_reason || summary?.retry_failed_reason || '当前阶段暂不可重试失败项');
      return;
    }
    const confirmed = await showConfirm({
      title: '重试失败项',
      message:`将只重试阶段“${STAGE_LABELS[stageName] || stageName}”中的失败子任务，并只联动这些失败项对应的归档；当前阶段已成功子任务会保留，后续阶段会等待当前阶段重试完成后重新推进。是否继续？`,
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
      message:`将清空阶段“${STAGE_LABELS[stageName] || stageName}”的全部业务子任务及其对应归档子任务，然后重新读取上游输出并重建该阶段输入。旧子任务会先取消/删除，再重新创建，是否继续？`,
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
      message:`将只重试阶段“${STAGE_LABELS[stageName] || stageName}”的失败归档任务。该操作不会重跑业务子任务，只会重做归档与状态回写，是否继续？`,
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
      message:`将清空阶段“${STAGE_LABELS[stageName] || stageName}”当前全部归档子任务，并基于当前业务阶段已成功的子任务重建归档。该操作不会重跑业务子任务，是否继续？`,
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
      message:`将重试归档任务“${job.item_key || job.item_id}”。该操作只会重新执行产物归档与状态回写，不会重跑下游微服务任务，是否继续？`,
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
          ? '将查询该阶段子任务在对应微服务中的真实状态；若该数据流漏洞挖掘子任务尚未成功创建下游任务，也会触发恢复绑定或重新创建尝试。是否继续？'
          : options?.stageName
            ?`将同步阶段“${STAGE_LABELS[options.stageName] || options.stageName}”下所有子任务的真实状态；其中数据流漏洞挖掘缺失绑定的子任务会尝试自动恢复。是否继续？`
            : '将同步当前任务所有下游子任务的真实状态，并尝试恢复数据流漏洞挖掘阶段缺失的下游绑定。是否继续？',
        confirmText: '确认同步',
        cancelText: '取消',
      });
      if (!confirmed) return;
    }
    const loadingKey = options?.itemId ?`sync-item:${options.itemId}` : options?.stageName ?`sync-stage:${options.stageName}` : 'sync-downstream';
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
      message:`将同步已选择的 ${selectedSyncableStageItems.length} 个子任务的下游真实状态，并刷新当前阶段表格。该操作不会触发执行动作，是否继续？`,
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

  const confirmEntrySelection = async () => {
    if (!projectId || !taskId) return;
    if (!entryConfirmSupported) {
      setError('当前任务暂不可确认入口');
      return;
    }
    if (selectedEntryKeys.length === 0) {
      setError('至少选择 1 个入口');
      return;
    }
    setActionLoading('confirm-entries');
    setError(null);
    try {
      await executionApi.binarySecurity.confirmEntrySelection(projectId, taskId, selectedEntryKeys);
      await refreshActiveTab();
    } catch (e: any) {
      setError(e?.message || '确认入口失败');
    } finally {
      setActionLoading('');
    }
  };

  const stageDisplayNodes = useMemo(() => {
    return overviewNodes.map((node) => ({
      ...node,
      id: node.node_id,
      kind: node.node_type === 'archive' ? 'archive' as const : 'business' as const,
      label: node.title,
      retryable: node.retry_supported,
      stale: staleStages.has(node.stage_name),
    }));
  }, [overviewNodes, staleStages]);

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
  const selectedModuleReportDetail = selectedModuleReportTarget ? moduleReportCache[selectedModuleReportTarget.moduleKey] || null : null;
  const mergedModuleRows = useMemo(() => {
    const merged = new Map<string, {
      module: BinarySecurityModuleContract;
      moduleKey: string;
      sourceTags: string[];
      candidate: boolean;
      selected: boolean;
    }>();
    const upsert = (modules: BinarySecurityModuleContract[], sourceTag: string, flags: { candidate?: boolean; selected?: boolean }) => {
      modules.forEach((module, index) => {
        const moduleKey = moduleContractKey(module, index);
        if (!moduleKey) return;
        const existing = merged.get(moduleKey);
        if (existing) {
          if (!existing.sourceTags.includes(sourceTag)) existing.sourceTags.push(sourceTag);
          existing.candidate = existing.candidate || Boolean(flags.candidate);
          existing.selected = existing.selected || Boolean(flags.selected);
          return;
        }
        merged.set(moduleKey, {
          module,
          moduleKey,
          sourceTags: [sourceTag],
          candidate: Boolean(flags.candidate),
          selected: Boolean(flags.selected),
        });
      });
    };
    upsert(systemAnalysisModules, '系统分析', {});
    upsert(candidateModules, '候选', { candidate: true });
    upsert(selectedModules, '已选', { selected: true });
    return Array.from(merged.values()).sort((left, right) => {
      const leftScore = moduleContractNumber(left.module, 'risk_score') ?? -1;
      const rightScore = moduleContractNumber(right.module, 'risk_score') ?? -1;
      if (left.candidate !== right.candidate) return left.candidate ? -1 : 1;
      if (left.selected !== right.selected) return left.selected ? -1 : 1;
      if (leftScore !== rightScore) return rightScore - leftScore;
      return (moduleContractText(left.module, 'module_name') || left.moduleKey).localeCompare(
        moduleContractText(right.module, 'module_name') || right.moduleKey,
        'zh-Hans-CN',
      );
    });
  }, [candidateModules, selectedModules, systemAnalysisModules]);
  const overviewModuleRows = useMemo(() => {
    const rows = systemAnalysisModules.length > 0 ? systemAnalysisModules : mergedModuleRows.map((row) => row.module);
    return rows.map((module, index) => {
      const moduleKey = moduleContractKey(module, index);
      return {
        module,
        moduleKey,
        sourceTags: ['系统分析'],
        candidate: candidateModules.some((candidate, candidateIndex) => moduleContractKey(candidate, candidateIndex) === moduleKey),
        selected: selectedModules.some((selected, selectedIndex) => moduleContractKey(selected, selectedIndex) === moduleKey),
      };
    });
  }, [candidateModules, mergedModuleRows, selectedModules, systemAnalysisModules]);
  const filteredAndSortedModuleRows = useMemo(() => {
    const normalizedNameFilter = moduleTableNameFilter.trim().toLowerCase();
    const filtered = overviewModuleRows.filter((row) => {
      const moduleName = moduleContractText(row.module, 'module_name') || row.moduleKey;
      const moduleKey = row.moduleKey || '';
      const riskLevel = moduleContractText(row.module, 'risk_level') || '';
      if (moduleTableRiskFilter !== 'all' && riskLevel !== moduleTableRiskFilter) return false;
      if (moduleTableSourceFilter !== 'all' && !row.sourceTags.includes(moduleTableSourceFilter)) return false;
      if (normalizedNameFilter) {
        const haystack =`${moduleName} ${moduleKey} ${row.sourceTags.join(' ')}`.toLowerCase();
        if (!haystack.includes(normalizedNameFilter)) return false;
      }
      return true;
    });
    const sorted = [...filtered].sort((left, right) => {
      const direction = moduleTableSortDirection === 'asc' ? 1 : -1;
      const leftModuleName = moduleContractText(left.module, 'module_name') || left.moduleKey || '';
      const rightModuleName = moduleContractText(right.module, 'module_name') || right.moduleKey || '';
      const leftRiskLevel = moduleContractText(left.module, 'risk_level') || '';
      const rightRiskLevel = moduleContractText(right.module, 'risk_level') || '';
      const leftRiskScore = moduleContractNumber(left.module, 'risk_score') ?? -1;
      const rightRiskScore = moduleContractNumber(right.module, 'risk_score') ?? -1;
      const leftFileCount = moduleContractNumber(left.module, 'file_count') ?? -1;
      const rightFileCount = moduleContractNumber(right.module, 'file_count') ?? -1;
      const leftModuleKey = left.moduleKey || '';
      const rightModuleKey = right.moduleKey || '';
      if (moduleTableSortKey === 'module_name') return leftModuleName.localeCompare(rightModuleName, 'zh-Hans-CN') * direction;
      if (moduleTableSortKey === 'risk_level') return leftRiskLevel.localeCompare(rightRiskLevel, 'zh-Hans-CN') * direction;
      if (moduleTableSortKey === 'risk_score') return (leftRiskScore - rightRiskScore) * direction;
      if (moduleTableSortKey === 'file_count') return (leftFileCount - rightFileCount) * direction;
      return leftModuleKey.localeCompare(rightModuleKey, 'zh-Hans-CN') * direction;
    });
    return sorted;
  }, [moduleTableNameFilter, moduleTableRiskFilter, moduleTableSourceFilter, moduleTableSortDirection, moduleTableSortKey, overviewModuleRows]);
  const selectableModuleKeys = useMemo(
    () => overviewModuleRows.filter((row) => !requiresModuleConfirmation || row.candidate).map((row) => row.moduleKey).filter(Boolean),
    [overviewModuleRows, requiresModuleConfirmation],
  );
  const selectableFilteredModuleKeys = useMemo(
    () => filteredAndSortedModuleRows.filter((row) => !requiresModuleConfirmation || row.candidate).map((row) => row.moduleKey).filter(Boolean),
    [filteredAndSortedModuleRows, requiresModuleConfirmation],
  );

  const selectAllVisibleModules = () => {
    setSelectedModuleKeys(selectableFilteredModuleKeys);
  };

  const clearAllSelectedModules = () => {
    setSelectedModuleKeys([]);
  };

  const copyTextValue = async (value: string, successMessage: string) => {
    if (!value.trim()) {
      setNotice('没有可复制的内容');
      return;
    }
    try {
      await navigator.clipboard?.writeText(value);
      setNotice(successMessage);
    } catch {
      setNotice('复制失败，请手动复制');
    }
  };

  const openModuleReportDialog = async (moduleKey: string, moduleName: string) => {
    const normalizedKey = moduleKey.trim();
    if (!normalizedKey) return;
    setSelectedModuleReportTarget({ moduleKey: normalizedKey, moduleName });
    setModuleReportDialogOpen(true);
    setModuleReportError(null);
    if (moduleReportCache[normalizedKey]) {
      return;
    }
    setModuleReportLoading(true);
    try {
      const payload = await api.binarySecurity.getModuleReport(projectId, taskId, normalizedKey);
      setModuleReportCache((current) => ({ ...current, [normalizedKey]: payload }));
    } catch (error: any) {
      setModuleReportError(error?.message || '模块报告读取失败');
    } finally {
      setModuleReportLoading(false);
    }
  };
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
  const stageStatusOptions = useMemo(
    () => STAGE_ITEM_STATUS_FILTER_VALUES.map((status) => ({ status, count: null })),
    [],
  );
  const stageDownstreamStatusOptions = useMemo(
    () => STAGE_ITEM_DOWNSTREAM_STATUS_FILTER_VALUES.map((status) => ({ status, count: null })),
    [],
  );
  const stageSyncStatusOptions = useMemo(
    () => STAGE_ITEM_SYNC_STATUS_FILTER_VALUES.map((status) => ({ status, count: null })),
    [],
  );
  const visibleStageItems = filteredStageItems;
  const stageItemsTotal = selectedNodeKind === 'business' && stageItemsPage?.stage_name === selectedStage
    ? Number(stageItemsPage.total || 0)
    : filteredStageItems.length;
  const stageItemsTotalPages = Math.max(1, Math.ceil(stageItemsTotal / Math.max(1, stageItemsPerPage)));
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
  const stageFilterSelectClassName = 'mt-2 w-full rounded-lg border border-theme-border bg-theme-bg-app px-2 py-1 text-[11px] font-bold normal-case tracking-normal text-theme-text-secondary outline-none focus:border-slate-400';
  const renderStageItemFilterSelect = (
    value: string,
    onChange: (value: string) => void,
    options: Array<{ status: string; count: number | null }>,
    formatter: (value: string) => string,
  ) => (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={stageFilterSelectClassName}
    >
      <option value="all">全部</option>
      {options.map((option) => (
        <option key={option.status} value={option.status}>
          {option.count == null ? formatter(option.status) :`${formatter(option.status)} (${option.count})`}
        </option>
      ))}
    </select>
  );
  const renderSortableStageItemHeader = (label: string, key: StageItemTimeSortKey) => {
    const active = stageItemTimeSort?.key === key;
    const marker = active ? (stageItemTimeSort.direction === 'asc' ? '↑' : '↓') : '↕';
    return (
      <button
        type="button"
        onClick={() => setStageItemTimeSort((current) => nextStageItemSort(current, key))}
        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-left font-semibold transition ${
          active ? 'bg-theme-surface text-white' : 'text-theme-text-muted hover:bg-theme-elevated hover:text-theme-text-primary'
        }`}
        title={`按${label}${active && stageItemTimeSort.direction === 'desc' ? '正序' : '倒序'}排序`}
      >
        <span>{label}</span>
        <span className="text-[10px]">{marker}</span>
      </button>
    );
  };

  const timelineItems = useMemo(() => {
    return timeline.map((event, index) => ({
      ...event,
      _key: event.id ||`${event.event_type || 'event'}-${event.created_at || index}-${index}`,
      _index: (Math.max(1, timelinePage) - 1) * Math.max(1, timelinePageSize) + index + 1,
      _eventLabel: formatTimelineEventTypeLabel(event.event_type),
      _eventCategory: timelineEventCategoryMeta(event.event_type),
      _recorderName: event.recorder_pod_name || event.recorder_hostname || '-',
      _recorderRole: event.recorder_role || null,
      _recorderNode: event.recorder_node_name || null,
      _originName: event.origin_pod_name || event.origin_hostname || null,
      _originRole: event.origin_role || null,
      _originNode: event.origin_node_name || null,
      _showOrigin: Boolean(
        (event.origin_pod_name || event.origin_hostname || event.origin_role)
        && (
          (event.origin_pod_name || event.origin_hostname || '') !== (event.recorder_pod_name || event.recorder_hostname || '')
          || (event.origin_role || '') !== (event.recorder_role || '')
        )
      ),
      _sourceLabel: event.recorder_pod_name || event.recorder_hostname || event.item_key || event.item_id || event.payload?.item_key || event.payload?.downstream_task_id || '-',
      _repeatCount: Math.max(1, Number(event.repeat_count || 1)),
      _isCompressed: Boolean(event.compressed),
    }));
  }, [timeline, timelinePage, timelinePageSize]);
  const timelineTotalPages = useMemo(
    () => Math.max(1, Math.ceil(Math.max(0, timelineTotal) / Math.max(1, timelinePageSize))),
    [timelineTotal, timelinePageSize],
  );
  const normalizedTimelinePage = Math.min(Math.max(1, timelinePage), timelineTotalPages);
  const pagedTimelineItems = timelineItems;
  const timelineRangeStart = timelineTotal === 0 ? 0 : (normalizedTimelinePage - 1) * Math.max(1, timelinePageSize) + 1;
  const timelineRangeEnd = timelineTotal === 0 ? 0 : timelineRangeStart + Math.max(0, pagedTimelineItems.length) - 1;

  useEffect(() => {
    setTimelinePage(1);
    setExpandedEventKey(null);
    setTimeline([]);
    setTimelineTotal(0);
    setTimelineHasMore(false);
  }, [timelinePageSize, taskId]);

  useEffect(() => {
    setExpandedStageItemId(null);
    setSelectedStageItemIds([]);
    setStageStatusFilter('all');
    setStageDownstreamStatusFilter('all');
    setStageSyncStatusFilter('all');
    setStageItemTimeSort(null);
    setStageItemsCurrentPage(1);
  }, [selectedStage, selectedNodeKind, taskId]);

  useEffect(() => {
    setStageItemsCurrentPage(1);
  }, [stageDownstreamStatusFilter, stageItemsPerPage, stageStatusFilter, stageSyncStatusFilter, stageItemTimeSort]);

  useEffect(() => {
    setDownstreamByItemId({});
  }, [taskId]);

  useEffect(() => {
    const validIds = new Set(visibleStageItems.map((item) => item.id));
    setSelectedStageItemIds((current) => current.filter((id) => validIds.has(id)));
  }, [visibleStageItems]);

  useEffect(() => {
    if (!expandedStageItemId) return;
    const expandedItem = visibleStageItems.find((item) => item.id === expandedStageItemId);
    if (!expandedItem) return;
    void ensureDownstreamDetail(expandedItem);
  }, [expandedStageItemId, visibleStageItems]);

  useEffect(() => {
    if (timelinePage > timelineTotalPages) {
      setTimelinePage(timelineTotalPages);
      return;
    }
    if (activeTab === 'timeline' && projectId && taskId) {
      void loadTimeline(timelinePage, timelinePageSize);
    }
  }, [activeTab, projectId, taskId, timelinePage, timelinePageSize, timelineTotalPages]);

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
      setError(e?.message ||`${action} 失败`);
    } finally {
      setBlockingAction('');
      setActionLoading('');
    }
  };

  const openDownstreamTaskDetail = (item: BinarySecurityTaskDetail['stage_items'][number]) => {
    const downstreamTaskId = item.downstream_task_id?.trim();
    const detailSupport = downstreamDetailSupport(item.stage_name, downstreamTaskId, stageItemMissingDownstreamReason(item));
    if (!downstreamTaskId || !detailSupport.supported) return;
    saveBinarySecurityReturnContext({
      view:
        taskType === 'source'
          ? (detail?.pipeline_profile === 'kg_source_vuln_scan' ? 'kg-source-security-detail' : 'source-security-detail')
          : taskType === 'binary_module'
            ? 'binary-module-security-detail'
            : 'binary-security-detail',
      taskId,
      taskType,
    });
    clearExecutionReturnContext();
    if (item.stage_name === 'firmware_unpack') {
      sessionStorage.setItem('secflow:firmwareUnpackerTaskId', downstreamTaskId);
      window.dispatchEvent(new CustomEvent('chimera-navigate-view', {
        detail: {
          view: 'pentest-exec-firmware-unpacker',
          firmwareUnpackerTaskId: downstreamTaskId,
        },
      }));
      return;
    }
    if (item.stage_name === 'system_analysis') {
      window.dispatchEvent(new CustomEvent('chimera-navigate-view', { detail: { view: 'system-analysis-detail', systemAnalysisTaskId: downstreamTaskId } }));
      return;
    }
    if (item.stage_name === 'binary_to_source') {
      window.dispatchEvent(new CustomEvent('chimera-navigate-view', { detail: { view: 'pentest-exec-b2s-detail', b2sTaskId: downstreamTaskId } }));
      return;
    }
    if (item.stage_name === 'entry_analysis') {
      window.dispatchEvent(new CustomEvent('chimera-navigate-view', { detail: { view: 'entry-analysis-detail', entryAnalysisTaskId: downstreamTaskId } }));
      return;
    }
    if (item.stage_name === 'dataflow_vuln_scan') {
      window.dispatchEvent(new CustomEvent('chimera-navigate-view', { detail: { view: 'dataflow-vuln-scan-detail', dataflowVulnScanTaskId: downstreamTaskId } }));
      return;
    }
  };

  const renderDownstreamDetail = (item: BinarySecurityTaskDetail['stage_items'][number]) => {
    const state = downstreamByItemId[item.id];
    const stateMatchesCurrent = state?.downstreamTaskId === item.downstream_task_id;
    if (item.downstream_task_id && state?.loading && stateMatchesCurrent) {
      return <div className="rounded-xl bg-theme-surface px-3 py-3 text-xs text-theme-text-muted">正在加载下游任务详情...</div>;
    }
    if (state?.error && stateMatchesCurrent) {
      return <div className="rounded-xl border border-rose-500/20 bg-rose-500/15 px-3 py-3 text-xs font-semibold text-rose-400">{state.error}</div>;
    }
    if (!state?.detail || !stateMatchesCurrent) {
      return item.downstream_task_id
        ? <div className="rounded-xl bg-theme-surface px-3 py-3 text-xs text-theme-text-muted">展开详情后按需加载下游任务摘要。</div>
        : <div className="rounded-xl bg-theme-surface px-3 py-3 text-xs text-theme-text-muted">{stageItemMissingDownstreamReason(item)}</div>;
    }

    const detailState = state.detail;
    if (detailState.kind === 'firmware_unpack') {
      const task = detailState.data;
      return (
        <div className="grid grid-cols-1 gap-3 text-xs text-theme-text-secondary xl:grid-cols-2">
          <div style={detailPanelTone}>固件路径：{task.firmware_path || '-'}</div>
          <div style={detailPanelTone}>输出目录：{task.output_path || '-'}</div>
          <div style={detailPanelTone}>结果状态：{task.result_status || '-'}</div>
          <div style={detailPanelTone}>结果信息：{task.result_message || task.error_message || '-'}</div>
        </div>
      );
    }
    if (detailState.kind === 'system_analysis') {
      const task = detailState.data;
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 text-xs text-theme-text-secondary xl:grid-cols-2">
            <div style={detailPanelTone}>输入目录：{task.input_path || '-'}</div>
            <div style={detailPanelTone}>输出目录：{task.output_path || '-'}</div>
          </div>
          <DownstreamSummaryGrid payload={task.result_json} preferredKeys={RESULT_SUMMARY_KEYS} />
        </div>
      );
    }
    if (detailState.kind === 'binary_to_source') {
      const task = detailState.data;
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 text-xs text-theme-text-secondary xl:grid-cols-2">
            <div style={detailPanelTone}>总项目数：{task.total_items}</div>
            <div style={detailPanelTone}>成功/失败：{task.success_items} / {task.failed_items}</div>
          </div>
          <div className="space-y-2">
            {task.items.slice(0, 4).map((taskItem) => (
              <div key={taskItem.id} className="rounded-xl border border-theme-border bg-theme-surface px-3 py-3 text-xs text-theme-text-secondary">
                <div className="font-bold text-theme-text-primary">{taskItem.elf_path}</div>
                <div className="mt-2 grid grid-cols-1 gap-2 xl:grid-cols-3">
                  <div className="rounded-lg bg-theme-bg-app px-2.5 py-2">阶段：{taskItem.phase_label || taskItem.phase || '-'}</div>
                  <div className="rounded-lg bg-theme-bg-app px-2.5 py-2">状态：{taskItem.status}</div>
                  <div className="rounded-lg bg-theme-bg-app px-2.5 py-2">输出：{taskItem.output_dir}</div>
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
          <div className="grid grid-cols-1 gap-3 text-xs text-theme-text-secondary xl:grid-cols-2">
            <div style={detailPanelTone}>输入目录：{task.input_path || '-'}</div>
            <div style={detailPanelTone}>输出目录：{task.output_path || '-'}</div>
          </div>
          <DownstreamSummaryGrid payload={task.result_json} preferredKeys={RESULT_SUMMARY_KEYS} />
        </div>
      );
    }
    if (detailState.kind === 'dataflow_vuln_scan') {
      const task = detailState.data;
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 text-xs text-theme-text-secondary xl:grid-cols-2">
            <div style={detailPanelTone}>输入目录：{task.input_path || '-'}</div>
            <div style={detailPanelTone}>输出目录：{task.output_path || '-'}</div>
          </div>
          <DownstreamSummaryGrid payload={task.result_json} preferredKeys={RESULT_SUMMARY_KEYS} />
        </div>
      );
    }
    return null;
  };

  const renderModuleTable = (
    rows: Array<{
      module: BinarySecurityModuleContract;
      moduleKey: string;
      sourceTags: string[];
      candidate: boolean;
      selected: boolean;
    }>,
    emptyText: string,
  ) => (
 <section className="binary-security-modules-table rounded-[1.75rem] border border-theme-border bg-theme-bg-app">
      <div className="flex flex-col gap-3 border-b border-theme-border px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-sm font-semibold text-theme-text-primary">{isBinaryModuleTask ? '模块输入表' : '全部模块表'}</div>
          <div className="mt-1 text-xs text-theme-text-muted">
            用统一表格展示系统分析产出的全部模块、候选推进模块和已确认模块；确认态可直接勾选后继续推进。
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] font-bold">
          <span className="rounded-full border border-theme-border bg-theme-bg-app px-3 py-1.5 text-theme-text-secondary">总计 {rows.length}</span>
          <span className="rounded-full border border-rose-500/20 bg-rose-500/15 px-3 py-1.5 text-rose-400">候选 {rows.filter((row) => row.candidate).length}</span>
          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/15 px-3 py-1.5 text-emerald-400">已选 {rows.filter((row) => row.selected).length}</span>
          {requiresModuleConfirmation ? (
            <span className="rounded-full border border-amber-500/20 bg-amber-500/15 px-3 py-1.5 text-amber-400">已勾选 {selectedModuleKeys.length}</span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-3 border-b border-theme-border px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-center">
          <input
            value={moduleTableNameFilter}
            onChange={(event) => setModuleTableNameFilter(event.target.value)}
            placeholder="按模块名/模块键快速筛选"
            className="w-full rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text-secondary outline-none lg:max-w-sm"
          />
          <select
            value={moduleTableRiskFilter}
            onChange={(event) => setModuleTableRiskFilter(event.target.value as 'all' | '高' | '中' | '低')}
            className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-bold text-theme-text-secondary outline-none"
          >
            <option value="all">全部风险</option>
            <option value="高">高</option>
            <option value="中">中</option>
            <option value="低">低</option>
          </select>
          <select
            value={moduleTableSourceFilter}
            onChange={(event) => setModuleTableSourceFilter(event.target.value as 'all' | '系统分析' | '候选' | '已选')}
            className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-bold text-theme-text-secondary outline-none"
          >
            <option value="all">全部来源</option>
            <option value="系统分析">系统分析</option>
            <option value="候选">候选</option>
            <option value="已选">已选</option>
          </select>
          {requiresModuleConfirmation ? (
            <>
              <button
                type="button"
                onClick={selectAllVisibleModules}
                disabled={selectableFilteredModuleKeys.length === 0}
                className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-bold text-theme-text-secondary outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                一键全选
              </button>
              <button
                type="button"
                onClick={clearAllSelectedModules}
                disabled={selectedModuleKeys.length === 0}
                className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-bold text-theme-text-secondary outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                一键清除全选
              </button>
            </>
          ) : null}
        </div>
        <div className="text-xs font-bold text-theme-text-muted">当前显示 {filteredAndSortedModuleRows.length} / {rows.length}</div>
      </div>
      {filteredAndSortedModuleRows.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-theme-text-muted">{emptyText}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-theme-border text-left text-xs">
            <thead className="bg-theme-bg-app text-[11px] font-semibold uppercase tracking-[0.12em] text-theme-text-muted">
              <tr>
                {requiresModuleConfirmation ? <th className="w-16 px-4 py-3">勾选</th> : null}
                <th className="min-w-[220px] px-4 py-3">
                  <button type="button" onClick={() => { setModuleTableSortKey('module_name'); setModuleTableSortDirection((current) => moduleTableSortKey === 'module_name' && current === 'asc' ? 'desc' : 'asc'); }} className="font-semibold text-theme-text-muted hover:text-theme-text-primary">模块</button>
                </th>
                <th className="w-28 px-4 py-3">
                  <button type="button" onClick={() => { setModuleTableSortKey('risk_level'); setModuleTableSortDirection((current) => moduleTableSortKey === 'risk_level' && current === 'asc' ? 'desc' : 'asc'); }} className="font-semibold text-theme-text-muted hover:text-theme-text-primary">风险高危程度</button>
                </th>
                <th className="w-44 px-4 py-3">模块归类</th>
                <th className="w-36 px-4 py-3">模块报告</th>
                <th className="w-24 px-4 py-3">
                  <button type="button" onClick={() => { setModuleTableSortKey('risk_score'); setModuleTableSortDirection((current) => moduleTableSortKey === 'risk_score' && current === 'asc' ? 'desc' : 'asc'); }} className="font-semibold text-theme-text-muted hover:text-theme-text-primary">分数</button>
                </th>
                <th className="w-24 px-4 py-3">
                  <button type="button" onClick={() => { setModuleTableSortKey('file_count'); setModuleTableSortDirection((current) => moduleTableSortKey === 'file_count' && current === 'asc' ? 'desc' : 'asc'); }} className="font-semibold text-theme-text-muted hover:text-theme-text-primary">文件数</button>
                </th>
                <th className="min-w-[220px] px-4 py-3">
                  <button type="button" onClick={() => { setModuleTableSortKey('module_key'); setModuleTableSortDirection((current) => moduleTableSortKey === 'module_key' && current === 'asc' ? 'desc' : 'asc'); }} className="font-semibold text-theme-text-muted hover:text-theme-text-primary">模块键</button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-border bg-theme-bg-app">
              {filteredAndSortedModuleRows.map(({ module, moduleKey, sourceTags, candidate, selected }) => {
                const checked = selectedModuleKeys.includes(moduleKey);
                const fileCount = moduleContractNumber(module, 'file_count');
                const selectable = requiresModuleConfirmation && candidate;
                const cachedReport = moduleReportCache[moduleKey];
                const rowActive = selectedModuleReportTarget?.moduleKey === moduleKey && moduleReportDialogOpen;
                const reportStatusLabel = cachedReport
                  ? cachedReport.available
                    ? '可查看报告'
                    : cachedReport.error_message
                      ? '报告缺失'
                      : '查看报告'
                  : (moduleContractText(module, 'module_report') || moduleContractText(module, 'module_dir') || moduleContractText(module, 'source_dir'))
                    ? '点击查看'
                    : '待检查';
                return (
                  <tr
                    key={moduleKey}
                    onClick={() => void openModuleReportDialog(moduleKey, moduleContractText(module, 'module_name') || moduleKey)}
                    className={`cursor-pointer transition hover:bg-sky-50/70 ${
                      rowActive ? 'bg-sky-50/80 ring-1 ring-inset ring-sky-500/20' : checked ? 'bg-amber-50/60' : selected ? 'bg-emerald-50/40' : 'bg-theme-bg-app'
                    }`}
                  >
                    {requiresModuleConfirmation ? (
                      <td className="px-4 py-3 align-top">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!selectable}
                          onClick={(event) => event.stopPropagation()}
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
                      <div className="font-bold text-theme-text-primary">{moduleContractText(module, 'module_name') || moduleKey}</div>
                      <div className="mt-1 text-[11px] text-theme-text-muted">{moduleContractText(module, 'module_type', 'language') || '-'}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span style={{ display: 'inline-flex', borderRadius: '9999px', border: '1px solid', padding: '4px 8px', fontWeight: 600, ...statusTone(moduleContractText(module, 'risk_level') || 'pending'), borderColor: statusTone(moduleContractText(module, 'risk_level') || 'pending').borderColor }}>
                        {moduleContractText(module, 'risk_level') || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap gap-1.5">
                        {sourceTags.map((tag) => (
                          <span
                            key={`${moduleKey}-${tag}`}
                            className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-bold ${
                              tag === '候选'
                                ? 'border-rose-500/20 bg-rose-500/15 text-rose-400'
                                : tag === '已选'
                                  ? 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400'
                                  : 'border-theme-border bg-theme-bg-app text-theme-text-secondary'
                            }`}
                          >
                            {tag}
                          </span>
                        ))}
                        {!selectable && requiresModuleConfirmation ? (
                          <span className="inline-flex rounded-full border border-theme-border bg-theme-bg-app px-2 py-1 text-[11px] font-semibold text-theme-text-muted">
                            不可勾选
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="inline-flex items-center gap-2 rounded-full border border-theme-border bg-theme-bg-app px-2.5 py-1 text-[11px] font-bold text-theme-text-secondary">
                        <FileText size={12} />
                        {reportStatusLabel}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top font-bold text-theme-text-secondary">{moduleContractNumber(module, 'risk_score') ?? '-'}</td>
                    <td className="px-4 py-3 align-top font-bold text-theme-text-secondary">{fileCount ?? '-'}</td>
                    <td className="px-4 py-3 align-top font-mono text-[11px] text-theme-text-muted">{moduleKey}</td>
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
    return <div className="px-8 pb-10 pt-8 text-sm text-theme-text-muted">未指定任务。</div>;
  }

  const tabs: Array<{ key: DetailTab; label: string; hint: string }> = [
    { key: 'overview', label: '总览', hint: '任务基础信息与阶段任务' },
    { key: 'strategy', label: '任务策略', hint: '仅影响后续阶段与下次运行' },
    { key: 'modules', label: '全部模块', hint: '系统分析全部模块、候选与确认操作' },
    { key: 'orchestration', label: '编排观测', hint: 'Reducer、事件队列、锁与归档健康' },
    { key: 'runtime_health', label: '线程与协程健康', hint: '任务 scoped 运行单元健康' },
    { key: 'timeline', label: '事件时间线', hint: '编排事件记录' },
    { key: 'api_keys', label: 'API 密钥', hint: '任务级密钥与阶段 work key' },
  ];
  const modalAction = blockingAction || pendingBlockingAction;
  const modalCopy = modalAction ? BLOCKING_ACTION_COPY[modalAction] : null;
  const modalRunning = Boolean(blockingAction);

  return (
    <div className="binary-security-detail-shell px-8 pb-10 pt-8 space-y-6">
      {moduleReportDialogOpen && selectedModuleReportTarget ? (
        <div className="fixed inset-0 z-[125] bg-slate-950/55 backdrop-blur-sm" onClick={() => setModuleReportDialogOpen(false)}>
          <div className="flex h-full w-full items-center justify-center p-4 sm:p-6">
            <div
              className="flex max-h-[calc(100vh-2.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-theme-border bg-theme-surface"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-theme-border bg-slate-50/80 px-6 py-5 sm:px-8">
                <div>
                  <h3 className="text-2xl font-bold tracking-tight text-theme-text-primary">{selectedModuleReportDetail?.module_name || selectedModuleReportTarget.moduleName}</h3>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold">
                    <span className="rounded-full border border-theme-border bg-theme-bg-app px-3 py-1 text-theme-text-secondary">{selectedModuleReportTarget.moduleKey}</span>
                    {selectedModuleReportDetail?.risk_level ? <span className="rounded-full border border-rose-500/20 bg-rose-500/15 px-3 py-1 text-rose-400">风险 {selectedModuleReportDetail.risk_level}</span> : null}
                    {selectedModuleReportDetail?.risk_score !== undefined && selectedModuleReportDetail?.risk_score !== null ? <span className="rounded-full border border-theme-border bg-theme-bg-app px-3 py-1 text-theme-text-secondary">分数 {selectedModuleReportDetail.risk_score}</span> : null}
                    {selectedModuleReportDetail?.file_count !== undefined && selectedModuleReportDetail?.file_count !== null ? <span className="rounded-full border border-theme-border bg-theme-bg-app px-3 py-1 text-theme-text-secondary">文件 {selectedModuleReportDetail.file_count}</span> : null}
                    {(selectedModuleReportDetail?.source_tags || []).map((tag) => (
                      <span key={`${selectedModuleReportTarget.moduleKey}-${tag}`} className="rounded-full border border-sky-500/20 bg-sky-500/15 px-3 py-1 text-sky-400">{tag}</span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void copyTextValue(selectedModuleReportTarget.moduleKey, '模块键已复制')}
                    className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-xs font-bold text-theme-text-secondary hover:bg-theme-elevated"
                  >
                    <Copy size={14} />
                    复制模块键
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyTextValue(selectedModuleReportDetail?.module_report_path || '', '报告路径已复制')}
                    className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-xs font-bold text-theme-text-secondary hover:bg-theme-elevated"
                  >
                    <Copy size={14} />
                    复制路径
                  </button>
                  <button
                    type="button"
                    onClick={() => setModuleReportDialogOpen(false)}
                    className="inline-flex items-center gap-2 rounded-xl bg-theme-surface px-3 py-2 text-xs font-bold text-white hover:bg-theme-elevated"
                  >
                    <X size={14} />
                    关闭
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-6 sm:px-8">
                {moduleReportLoading ? (
                  <div className="flex min-h-[240px] items-center justify-center gap-3 rounded-xl border border-theme-border bg-theme-surface text-theme-text-muted">
                    <Loader2 size={18} className="animate-spin" />
                    正在加载模块报告...
                  </div>
                ) : moduleReportError ? (
                  <div className="rounded-xl border border-rose-500/20 bg-rose-500/15 px-6 py-8 text-sm text-rose-400">{moduleReportError}</div>
                ) : selectedModuleReportDetail?.available && selectedModuleReportDetail.module_report_markdown ? (
                  <div className="space-y-4">
                    {selectedModuleReportDetail.warning ? (
                      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/15 px-4 py-3 text-sm text-amber-400">{selectedModuleReportDetail.warning}</div>
                    ) : null}
                    {selectedModuleReportDetail.module_report_path ? (
                      <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 text-xs text-theme-text-secondary">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">报告路径</div>
                        <div className="mt-2 break-all font-mono">{selectedModuleReportDetail.module_report_path}</div>
                      </div>
                    ) : null}
                    <div className="markdown-body break-words rounded-xl border border-theme-border bg-theme-surface px-6 py-6 text-sm leading-7 text-theme-text-secondary">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {selectedModuleReportDetail.module_report_markdown}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {selectedModuleReportDetail?.module_report_path ? (
                      <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 text-xs text-theme-text-secondary">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">报告路径</div>
                        <div className="mt-2 break-all font-mono">{selectedModuleReportDetail.module_report_path}</div>
                      </div>
                    ) : null}
                    <div className="rounded-xl border border-dashed border-theme-border bg-theme-surface px-6 py-10 text-center text-sm text-theme-text-muted">
                      {selectedModuleReportDetail?.error_message || '该模块尚未生成可展示的系统分析报告'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {modalAction && modalCopy ? (
        <div className="fixed inset-0 z-[120] bg-slate-950/50 backdrop-blur-sm">
          <div className="flex h-full w-full items-center justify-center p-4 sm:p-6">
            <div className="flex w-full max-w-5xl max-h-[calc(100vh-3rem)] flex-col overflow-hidden rounded-2xl border border-theme-border bg-theme-surface sm:max-h-[calc(100vh-4rem)]">
              <div className="border-b border-theme-border bg-slate-50/80 px-6 py-5 sm:px-8">
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-theme-text-muted">Task Action</div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="rounded-2xl bg-sky-500/15 p-3 text-sky-400">
                    <Loader2 size={24} className={modalRunning ? 'animate-spin' : ''} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold tracking-tight text-theme-text-primary">
                      {modalRunning ? modalCopy.progressTitle : modalCopy.confirmTitle}
                    </h3>
                    <p className="mt-1 text-sm text-theme-text-muted">
                      {taskDetailViewLabel(taskType)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-auto px-6 py-6 sm:px-8 sm:py-8">
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_320px]">
                  <div className="rounded-xl border border-theme-border bg-theme-surface p-5 sm:p-6">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-theme-text-muted">
                      {modalRunning ? '执行中' : '确认操作'}
                    </div>
                    <p className="mt-4 text-base leading-7 text-theme-text-secondary">
                      {modalRunning ? modalCopy.progressMessage : modalCopy.confirmMessage}
                    </p>
                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl bg-theme-surface px-4 py-3 text-sm text-theme-text-secondary">
                        <div className="text-xs font-bold uppercase tracking-[0.14em] text-theme-text-muted">任务</div>
                        <div className="mt-2 break-all font-mono text-xs text-theme-text-secondary">{taskId}</div>
                      </div>
                      <div className="rounded-2xl bg-theme-surface px-4 py-3 text-sm text-theme-text-secondary">
                        <div className="text-xs font-bold uppercase tracking-[0.14em] text-theme-text-muted">当前阶段</div>
                        <div className="mt-2 font-bold text-theme-text-primary">
                          {STAGE_LABELS[detail?.current_stage || ''] || detail?.current_stage || '-'}
                        </div>
                      </div>
                    </div>
                    <div className="mt-6 rounded-2xl border border-sky-500/20 bg-sky-500/15 px-4 py-3 text-sm text-sky-400">
                      {modalRunning
                        ? '请求正在提交，接口返回后页面会立即恢复，由后台继续完成准备。'
                        : '确认后接口会立即受理，后台准备完成后任务会自动重新排队。'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-theme-border bg-slate-50/80 p-5 sm:p-6">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-theme-text-muted">状态</div>
                    <div className="mt-4 space-y-3">
                      <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
                        <div className="text-xs font-bold text-theme-text-muted">任务名称</div>
                        <div className="mt-1 text-sm font-semibold text-theme-text-primary">{detail?.name || '-'}</div>
                      </div>
                      <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
                        <div className="text-xs font-bold text-theme-text-muted">当前状态</div>
                        <div className="mt-2">
                          <span style={{ display: 'inline-flex', borderRadius: '9999px', border: '1px solid', padding: '4px 12px', fontSize: '12px', fontWeight: 600, ...statusTone(taskDisplayStatus(detail?.status, detail?.manual_operation_state)), borderColor: statusTone(taskDisplayStatus(detail?.status, detail?.manual_operation_state)).borderColor }}>
                            {formatBinarySecurityStatus(taskDisplayStatus(detail?.status, detail?.manual_operation_state))}
                          </span>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
                        <div className="text-xs font-bold text-theme-text-muted">操作类型</div>
                        <div className="mt-1 text-sm font-semibold text-theme-text-primary">
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
                      className="rounded-xl border border-theme-border bg-theme-surface px-5 py-3 text-sm font-bold text-theme-text-secondary transition hover:bg-theme-elevated"
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
                    className="inline-flex items-center gap-2 rounded-xl bg-theme-surface px-5 py-3 text-sm font-bold text-white transition hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-60"
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
      <PageHeader
        title={detail ? detail.name : '任务详情'}
        description={detail ? <span className="break-all font-mono text-xs text-theme-text-muted">{detail.id}</span> : undefined}
        back={{ label: '返回任务列表', onClick: onBack }}
        actions={
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => void refreshActiveTab()}
              disabled={detailRefreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-4 py-2.5 text-sm font-bold text-theme-text-secondary hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-60"
            >
              {detailRefreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              {detailRefreshing ? '刷新中...' : '刷新'}
            </button>
            <button
              type="button"
              onClick={() => void syncDownstreamStatus()}
              title={manualOperationState?.blocking_reason || undefined}
              disabled={actionLoading !== '' || isManualOperationInProgress}
              className="inline-flex items-center gap-2 rounded-xl border border-sky-500/20 bg-sky-500/15 px-4 py-2.5 text-sm font-bold text-sky-400 disabled:opacity-60"
            >
              <RefreshCw size={16} />
              同步下游状态
            </button>
            <button type="button" title={taskCancelSupported ? undefined : (manualOperationState?.blocking_reason || '当前任务不可取消')} onClick={() => void runAction('cancel')} disabled={actionLoading !== '' || !taskCancelSupported || isManualOperationInProgress} className="rounded-xl border border-rose-500/20 bg-rose-500/15 px-4 py-2.5 text-sm font-bold text-rose-400 disabled:opacity-60">取消</button>
            <button
              type="button"
              title={taskRetrySupported ? undefined : taskRetryReason}
              onClick={() => setPendingBlockingAction('retry')}
              disabled={actionLoading !== '' || !taskRetrySupported || isManualOperationInProgress}
              className="rounded-xl border border-theme-border bg-theme-elevated px-4 py-2.5 text-sm font-bold text-theme-text-secondary disabled:opacity-60"
            >
              清空并从头开始
            </button>
            <button
              type="button"
              title="清理悬挂 operation / owner / lease，并将任务恢复为待调度"
              onClick={() => void runAction('force-reset')}
              disabled={actionLoading !== '' || loading}
              className="rounded-xl border border-amber-500/20 bg-amber-500/15 px-4 py-2.5 text-sm font-bold text-amber-300 disabled:opacity-60"
            >
              {actionLoading === 'force-reset' ? '重置中...' : '强制重置状态'}
            </button>
            <button
              type="button"
              title={taskRetryFailedItemsSupported ? undefined : taskRetryFailedItemsReason}
              onClick={() => setPendingBlockingAction('retry_failed_items')}
              disabled={actionLoading !== '' || !taskRetryFailedItemsSupported || isManualOperationInProgress}
              className="rounded-xl border border-emerald-500/20 bg-emerald-500/15 px-4 py-2.5 text-sm font-bold text-emerald-400 disabled:opacity-60"
            >
              {actionLoading === 'retry_failed_items' ? '重试中...' : '重试失败项'}
            </button>
            <button type="button" title={taskDeleteSupported ? undefined : (manualOperationState?.blocking_reason || '当前任务不可删除')} onClick={() => void runAction('delete')} disabled={actionLoading !== '' || !taskDeleteSupported || isManualOperationInProgress} className="rounded-xl border border-rose-300 bg-theme-surface px-4 py-2.5 text-sm font-bold text-rose-400 disabled:opacity-60">删除</button>
            <button
              type="button"
              title={taskDeleteSupported ? '忽略下游删除失败并强制删除主任务' : (manualOperationState?.blocking_reason || '当前任务不可强制删除')}
              onClick={() => void runAction('delete', { force: true })}
              disabled={actionLoading !== '' || !taskDeleteSupported || isManualOperationInProgress}
              className="rounded-xl border border-rose-500 bg-rose-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              强制删除
            </button>
          </div>
        }
      />

      {notice && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/15 px-4 py-3 text-sm font-semibold text-emerald-400">{notice}</div>}
      {error && <div className="rounded-xl border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-400">{error}</div>}

      {loading && !detail ? (
        <div className="text-sm text-theme-text-muted">加载中...</div>
      ) : detail ? (
        <>
 <section className="rounded-[1.75rem] border border-theme-border bg-theme-bg-app p-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)] xl:items-start">
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight text-theme-text-primary">{detail.name}</h1>
                <div className="mt-2 break-all font-mono text-xs text-theme-text-muted">{detail.id}</div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span style={{ borderRadius: '9999px', border: '1px solid', padding: '4px 12px', fontSize: '12px', fontWeight: 600, ...statusTone(displayTaskStatus), borderColor: statusTone(displayTaskStatus).borderColor }}>{formatBinarySecurityStatus(displayTaskStatus)}</span>
                  <span className="text-sm text-theme-text-muted">当前阶段：{STAGE_LABELS[detail.current_stage || ''] || detail.current_stage || '-'}</span>
                </div>
                {runtimeOwner ? (
                  <div className="mt-4 rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-theme-text-muted">{runtimeOwner.label}</div>
                    <div className="mt-1 break-all font-mono text-xs font-bold text-theme-text-primary">{runtimeOwner.value}</div>
                    <div className="mt-1 text-[11px] text-theme-text-muted">{runtimeOwner.hint}</div>
                  </div>
                ) : null}
                {manualOperationState?.operation_in_progress && manualOperationState?.operation_type === 'continue' ? (
                  <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-400">
                    正在继续任务准备。后台正在定位下一个可执行阶段并清理必要结果。
                  </div>
                ) : null}
                {manualOperationState?.operation_in_progress && manualOperationState?.operation_type === 'retry' ? (
                  <div className="mt-4 rounded-2xl border border-orange-500/20 bg-orange-500/15 px-4 py-3 text-sm text-orange-400">
                    正在准备重试。后台正在按当前选择的重试类型清理阶段、归档和下游任务，完成后会自动重新排队。
                  </div>
                ) : null}
                {detail.abnormal_reason && !requiresModuleConfirmation ? (
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
                {cleanupPartialFailed ? (
                  <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/15 px-4 py-3 text-sm text-amber-300">
                    <div className="font-semibold">下游清理部分失败，系统会后台重试，不影响当前分析结果</div>
                    <div className="mt-1 text-xs text-amber-400">
                      待补偿下游任务数：{cleanupDeferredCount}；最近错误：{cleanupState?.last_error || '-'}；下次重试：{fmt(cleanupState?.next_retry_at)}
                    </div>
                  </div>
                ) : null}
                <div className="mt-4 grid gap-2">
                  <div className="rounded-2xl bg-theme-surface px-3 py-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-theme-text-muted">{isSourceTask ? '源码目录' : isBinaryModuleTask ? '模块输入目录' : '输入目录'}</div>
                    <div className="mt-1 break-all font-mono text-xs text-theme-text-secondary">{detail.firmware_path}</div>
                  </div>
                  <div className="rounded-2xl bg-theme-surface px-3 py-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-theme-text-muted">产物目录</div>
                    <div className="mt-1 break-all font-mono text-xs text-theme-text-secondary">{detail.output_root}</div>
                  </div>
                  <div className="rounded-2xl bg-theme-surface px-3 py-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-theme-text-muted">推进模式</div>
                    <div className="mt-1 text-xs font-semibold text-theme-text-primary">{pipelineModeLabel(detail.policy?.pipeline_mode)}</div>
                    <div className="mt-1 text-xs text-theme-text-muted">{pipelineModeHint(detail.policy?.pipeline_mode)}</div>
                  </div>
                  <div className="rounded-2xl bg-theme-surface px-3 py-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-theme-text-muted">{isBinaryModuleTask ? '模块输入' : '模块策略'}</div>
                    <div className="mt-1 text-xs text-theme-text-secondary">
                      {isBinaryModuleTask
                        ?`模块级直接输入 · 模块名：${String((detail.summary as any)?.module_input?.module_name || detail.name || '-').trim() || '-'}`
                        :`${detail.module_selection_mode === 'manual_confirm' ? '系统分析后人工确认' : '按风险自动推进'} · 风险等级：${(detail.selected_risk_levels || []).join(' / ') || '-'}`}
                    </div>
                  </div>
                </div>
              </div>
              <div className="min-w-0 grid grid-cols-2 gap-2">
                <div className="min-w-0 rounded-2xl bg-theme-surface px-3 py-2.5 text-xs text-theme-text-secondary">
                  <div className="text-theme-text-muted">创建时间</div>
                  <div className="mt-1 break-words font-bold text-theme-text-primary">{fmt(detail.created_at)}</div>
                </div>
                <div className="min-w-0 rounded-2xl bg-theme-surface px-3 py-2.5 text-xs text-theme-text-secondary">
                  <div className="text-theme-text-muted">完成时间</div>
                  <div className="mt-1 break-words font-bold text-theme-text-primary">{fmt(detail.finished_at)}</div>
                </div>
                <div className="min-w-0 rounded-2xl bg-theme-surface px-3 py-2.5 text-xs text-theme-text-secondary">
                  <div className="text-theme-text-muted">{isSourceTask ? '源码文件数' : isBinaryModuleTask ? 'ELF 数量' : '固件数量'}</div>
                  <div className="mt-1 break-words text-lg font-semibold text-theme-text-primary">{detail.firmware_item_count}</div>
                </div>
                <div className="min-w-0 rounded-2xl bg-theme-surface px-3 py-2.5 text-xs text-theme-text-secondary">
                  <div className="text-theme-text-muted">
                    {isSourceTask
                      ? (detail.pipeline_profile === 'kg_source_vuln_scan' ? '已选知识图谱入口' : '入口数量')
                      : isBinaryModuleTask ? '当前模式' : '已解包/失败'}
                  </div>
                  <div className="mt-1 break-words text-lg font-semibold text-theme-text-primary">
                    {isSourceTask
                      ? (detail.pipeline_profile === 'kg_source_vuln_scan' ? (detail.selected_entry_count || detail.entry_count) : detail.entry_count)
                      : isBinaryModuleTask ? '模块级' :`${detail.unpacked_firmware_count} / ${detail.failed_firmware_count}`}
                  </div>
                </div>
                <div className="min-w-0 rounded-2xl bg-theme-surface px-3 py-2.5 text-xs text-theme-text-secondary">
                  <div className="text-theme-text-muted">
                    {isBinaryModuleTask ? '模块数量' : isSourceTask && detail.pipeline_profile === 'kg_source_vuln_scan' ? '识别总数' : '已选模块'}
                  </div>
                  <div className="mt-1 break-words text-lg font-semibold text-theme-text-primary">
                    {isBinaryModuleTask
                      ? Math.max(1, detail.selected_module_count || 1)
                      : isSourceTask && detail.pipeline_profile === 'kg_source_vuln_scan'
                        ? (detail.knowledge_graph_analysis_total || detail.knowledge_graph_raw_entry_count || detail.candidate_entry_count || 0)
                        : detail.selected_module_count}
                  </div>
                </div>
                <div className="min-w-0 rounded-2xl bg-theme-surface px-3 py-2.5 text-xs text-theme-text-secondary">
                  <div className="text-theme-text-muted">
                    {isBinaryModuleTask ? '候选模块' : isSourceTask && detail.pipeline_profile === 'kg_source_vuln_scan' ? '待识别入口' : '全部模块'}
                  </div>
                  <div className="mt-1 break-words text-lg font-semibold text-theme-text-primary">
                    {isBinaryModuleTask
                      ? Math.max(1, detail.candidate_module_count || 1)
                      : isSourceTask && detail.pipeline_profile === 'kg_source_vuln_scan'
                        ? (detail.knowledge_graph_analysis_pending || 0)
                        : detail.high_risk_module_count}
                  </div>
                </div>
                {isSourceTask && detail.pipeline_profile === 'kg_source_vuln_scan' ? (
                  <>
                    <div className="min-w-0 rounded-2xl bg-theme-surface px-3 py-2.5 text-xs text-theme-text-secondary">
                      <div className="text-theme-text-muted">图谱状态</div>
                      <div className="mt-1 break-words font-semibold text-theme-text-primary">{detail.knowledge_graph_graph_status || '-'}</div>
                    </div>
                    <div className="min-w-0 rounded-2xl bg-theme-surface px-3 py-2.5 text-xs text-theme-text-secondary">
                      <div className="text-theme-text-muted">识别状态</div>
                      <div className="mt-1 break-words font-semibold text-theme-text-primary">
                        {detail.knowledge_graph_identification_state || '-'}{detail.knowledge_graph_attack_status ? ` / ${detail.knowledge_graph_attack_status}` : ''}
                      </div>
                    </div>
                  </>
                ) : null}
                <div className="min-w-0 rounded-2xl bg-theme-surface px-3 py-2.5 text-xs text-theme-text-secondary">
                  <div className="text-theme-text-muted">漏洞结果</div>
                  <div className="mt-1 break-words text-lg font-semibold text-theme-text-primary">{detail.vuln_result_count}</div>
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-theme-border bg-slate-50/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-text-muted">下游同步总览</div>
                  <div className="mt-1 text-sm text-theme-text-secondary">区分最近一次尝试、最近一次成功和最近一次失败，避免把“很久没同步”和“最近同步失败”混在一起。</div>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                  <span className="inline-flex rounded-full border border-rose-500/20 bg-rose-500/15 px-3 py-1 text-rose-400">
                    活跃错误 {detail.active_sync_error_item_count || 0}
                  </span>
                  <span className="inline-flex rounded-full border border-amber-500/20 bg-amber-500/15 px-3 py-1 text-amber-400">
                    从未成功 {detail.never_synced_item_count || 0}
                  </span>
                  <span className="inline-flex rounded-full border border-sky-500/20 bg-sky-500/15 px-3 py-1 text-sky-400">
                    同步陈旧 {detail.stale_synced_item_count || 0}
                  </span>
                </div>
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-3">
                <div className="rounded-2xl border border-theme-border bg-theme-surface px-3 py-3 text-xs text-theme-text-secondary">
                  <div className="text-theme-text-muted">最近尝试</div>
                  <div className="mt-1 break-words font-mono font-bold text-theme-text-primary">{fmt(detail.last_sync_attempt_at)}</div>
                </div>
                <div className="rounded-2xl border border-theme-border bg-theme-surface px-3 py-3 text-xs text-theme-text-secondary">
                  <div className="text-theme-text-muted">最近成功</div>
                  <div className="mt-1 break-words font-mono font-bold text-theme-text-primary">{fmt(detail.last_successful_downstream_sync_at)}</div>
                </div>
                <div className="rounded-2xl border border-theme-border bg-theme-surface px-3 py-3 text-xs text-theme-text-secondary">
                  <div className="text-theme-text-muted">最近失败</div>
                  <div className="mt-1 break-words font-mono font-bold text-theme-text-primary">{fmt(detail.last_sync_error_at)}</div>
                  <div className="mt-1 break-all text-[11px] text-theme-text-muted">
                    {detail.last_sync_error_type || detail.last_sync_error_message
                      ?`${detail.last_sync_error_type || 'sync_error'}${detail.last_sync_error_message ?` · ${detail.last_sync_error_message}` : ''}`
                      : '暂无失败记录'}
                  </div>
                </div>
              </div>
            </div>
          </section>

 <section className="rounded-xl border border-theme-border bg-theme-surface p-2">
            <div
              className="grid grid-flow-col auto-cols-[minmax(220px,1fr)] gap-2 overflow-x-auto"
              style={{ gridTemplateColumns:`repeat(${tabs.length}, minmax(220px, 1fr))` }}
            >
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-[1.2rem] px-4 py-3 text-left transition ${
                    activeTab === tab.key
 ? 'bg-theme-surface text-white shadow-slate-200'
                      : 'bg-theme-bg-app text-theme-text-secondary hover:bg-theme-elevated'
                  }`}
                >
                  <div className="text-sm font-semibold">{tab.label}</div>
                  <div className={`mt-1 text-[11px] ${activeTab === tab.key ? 'text-theme-text-faint' : 'text-theme-text-muted'}`}>{tab.hint}</div>
                </button>
              ))}
            </div>
          </section>

          {activeTab === 'strategy' && strategyDraft ? (
            <section className="space-y-6">
 <section className="rounded-xl border border-theme-border bg-theme-surface p-6">
                <div>
                  <div>
                    <h2 className="text-xl font-semibold text-theme-text-primary">任务策略</h2>
                    <p className="mt-2 text-sm text-theme-text-muted">
                      任务策略只会影响尚未开始的阶段、继续任务、阶段重试和清空重跑后的重新调度，不会改写已完成阶段或正在运行中的阶段项。
                    </p>
                  </div>
                </div>
                <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
                  strategyEditable
                    ? 'border-sky-500/20 bg-sky-500/15 text-sky-400'
                    : 'border-amber-500/20 bg-amber-500/15 text-amber-400'
                }`}>
                  {strategyEditable
                    ?`任务级并发配置、阶段启停${isBinaryModuleTask ? '' : '和模块推进策略'}按分块保存；保存后不会修改已完成阶段，也不会实时改写正在运行中的子任务池。`
                    : strategyBlockedReason}
                </div>
                {strategyDirty ? (
                  <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/15 px-4 py-3 text-sm text-amber-400">
                    当前存在未保存的策略修改。请在对应模块内分别保存。
                  </div>
                ) : null}
                <div className="mt-5 rounded-2xl border border-theme-border bg-theme-bg-app px-4 py-3 text-sm">
                  <div className="font-semibold text-theme-text-primary">当前推进模式：{pipelineModeLabel(detail.policy?.pipeline_mode)}</div>
                  <div className="mt-1 text-theme-text-muted">{pipelineModeHint(detail.policy?.pipeline_mode)}</div>
                </div>
              </section>

 <section className="rounded-xl border border-theme-border bg-theme-surface p-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-theme-elevated p-3 text-theme-text-secondary">
                      <SlidersHorizontal size={18} />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-theme-text-primary">阶段启停</h3>
                      <p className="mt-1 text-sm text-theme-text-muted">控制当前任务后续阶段是否继续参与流程；已完成阶段仅做展示，修改只对后续执行生效。</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => resetStrategySection('stage_options')}
                      disabled={!stageOptionsDirty || Boolean(strategySavingSection)}
                      className="rounded-xl border border-theme-border bg-theme-surface px-4 py-2.5 text-sm font-bold text-theme-text-secondary transition hover:bg-theme-elevated disabled:opacity-60"
                    >
                      重置阶段启停
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveTaskPolicySection('stage_options')}
                      disabled={!strategyEditable || !stageOptionsDirty || Boolean(strategySavingSection)}
                      className="inline-flex items-center gap-2 rounded-xl bg-theme-surface px-4 py-2.5 text-sm font-bold text-white transition hover:bg-theme-elevated disabled:opacity-60"
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
                    const stageFinished = ['success', 'partial_success', 'failed', 'cancelled', 'skipped', 'downstream_missing'].includes(summaryStatus);
                    const stageActive = ['running', 'dispatching', 'queued', 'pending', 'waiting_confirmation'].includes(summaryStatus);
                    const stageMessage = stageActive
                      ? '运行中，本次修改仅影响后续/下次'
                      : stageFinished
                        ? '已完成，不受本次修改影响'
                        : '尚未开始，修改会在后续执行时生效';
                    return (
                      <label key={stageName} className="rounded-xl border border-theme-border bg-theme-surface px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-theme-text-primary">{STAGE_LABELS[stageName] || stageName}</div>
                            <div className="mt-1 text-xs text-theme-text-muted">当前状态：{formatBinarySecurityStatus(summaryStatus || 'pending')}</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={strategyDraft.stage_options[stageName]?.enabled !== false}
                            disabled={!strategyEditable || Boolean(strategySavingSection)}
                            onChange={(event) => updateStrategyStageEnabled(stageName, event.target.checked)}
                          />
                        </div>
                        <div className="mt-4 grid gap-1 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-xs text-theme-text-secondary">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-theme-text-muted">开始时间</span>
                            <span className="font-mono text-right text-theme-text-secondary">{fmt(summary?.started_at)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-theme-text-muted">结束时间</span>
                            <span className="font-mono text-right text-theme-text-secondary">{fmt(summary?.finished_at)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-theme-text-muted">耗时</span>
                            <span className="text-right font-semibold text-theme-text-primary">{durationLabel(summary?.started_at, summary?.finished_at)}</span>
                          </div>
                        </div>
                        <div className="mt-4 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-xs text-theme-text-secondary">
                          {stageMessage}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </section>

              {!isBinaryModuleTask ? (
 <section className="rounded-xl border border-theme-border bg-theme-surface p-6">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-theme-text-primary">模块推进策略</h3>
                      <p className="mt-1 text-sm text-theme-text-muted">与创建任务页保持一致，只影响后续模块筛选、人工确认与自动推进行为。</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => resetStrategySection('module_strategy')}
                        disabled={!moduleStrategyDirty || Boolean(strategySavingSection)}
                        className="rounded-xl border border-theme-border bg-theme-surface px-4 py-2.5 text-sm font-bold text-theme-text-secondary transition hover:bg-theme-elevated disabled:opacity-60"
                      >
                        重置模块策略
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveTaskPolicySection('module_strategy')}
                        disabled={!strategyEditable || !moduleStrategyDirty || Boolean(strategySavingSection)}
                        className="inline-flex items-center gap-2 rounded-xl bg-theme-surface px-4 py-2.5 text-sm font-bold text-white transition hover:bg-theme-elevated disabled:opacity-60"
                      >
                        {strategySavingSection === 'module_strategy' ? <Loader2 size={16} className="animate-spin" /> : null}
                        {strategySavingSection === 'module_strategy' ? '保存中...' : '保存模块策略'}
                      </button>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-5 xl:grid-cols-2">
                    <div>
                      <div className="text-sm font-bold text-theme-text-primary">推进方式</div>
                      <div className="mt-3 grid gap-2">
                        {MODULE_SELECTION_OPTIONS.map((option) => (
                          <label key={option.value} className="flex items-center gap-3 rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-sm font-semibold text-theme-text-secondary">
                            <input
                              type="radio"
                              name="taskStrategyModuleSelection"
                              checked={strategyDraft.module_selection_mode === option.value}
                              disabled={!strategyEditable || Boolean(strategySavingSection)}
                              onChange={() => setStrategyDraft((current) => {
                                if (!current) return current;
                                const nextMode = option.value as 'auto' | 'manual_confirm';
                                return {
                                  ...current,
                                  module_selection_mode: nextMode,
                                  module_risk_levels: nextMode === 'manual_confirm' ? [...MODULE_RISK_OPTIONS] : current.module_risk_levels,
                                };
                              })}
                            />
                            {option.label}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-bold text-theme-text-primary">风险等级</div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {MODULE_RISK_OPTIONS.map((risk) => (
                          <label key={risk} className="flex items-center justify-center gap-2 rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-sm font-semibold text-theme-text-secondary">
                            <input
                              type="checkbox"
                              checked={strategyDraft.module_risk_levels.includes(risk)}
                              disabled={!strategyEditable || Boolean(strategySavingSection) || strategyDraft.module_selection_mode === 'manual_confirm'}
                              onChange={(event) => {
                                setStrategyDraft((current) => {
                                  if (!current) return current;
                                  if (current.module_selection_mode === 'manual_confirm') {
                                    return { ...current, module_risk_levels: [...MODULE_RISK_OPTIONS] };
                                  }
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
                      <div className="mt-2 text-xs text-theme-text-muted">
                        {strategyDraft.module_selection_mode === 'manual_confirm'
                          ? '人工确认模块时默认展示全部高中低风险模块，风险等级筛选不再生效。'
                          : '至少选择一个风险等级；系统会按所选风险等级自动推进模块。'}
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}

              {!isSourceTask ? (
 <section className="rounded-xl border border-theme-border bg-theme-surface p-6">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-theme-text-primary">入口推进策略</h3>
                      <p className="mt-1 text-sm text-theme-text-muted">控制入口分析产出的入口函数是自动进入下游，还是先由人工确认后再继续。</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => resetStrategySection('entry_strategy')}
                        disabled={!entryStrategySectionDirty || Boolean(strategySavingSection)}
                        className="rounded-xl border border-theme-border bg-theme-surface px-4 py-2.5 text-sm font-bold text-theme-text-secondary transition hover:bg-theme-elevated disabled:opacity-60"
                      >
                        重置入口策略
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveTaskPolicySection('entry_strategy')}
                        disabled={!strategyEditable || !entryStrategySectionDirty || Boolean(strategySavingSection)}
                        className="inline-flex items-center gap-2 rounded-xl bg-theme-surface px-4 py-2.5 text-sm font-bold text-white transition hover:bg-theme-elevated disabled:opacity-60"
                      >
                        {strategySavingSection === 'entry_strategy' ? <Loader2 size={16} className="animate-spin" /> : null}
                        {strategySavingSection === 'entry_strategy' ? '保存中...' : '保存入口策略'}
                      </button>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-2">
                    {[
                      { value: 'auto', label: '自动选择入口函数', description: '入口分析结果直接进入数据流分析与后续漏洞扫描。' },
                      { value: 'manual_confirm', label: '人工确认入口函数', description: '入口分析后暂停，需手动选择候选入口再继续。' },
                    ].map((option) => (
                      <label key={option.value} className="flex items-center gap-3 rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-sm font-semibold text-theme-text-secondary">
                        <input
                          type="radio"
                          name="taskStrategyEntrySelection"
                          checked={strategyDraft.entry_selection_mode === option.value}
                          disabled={!strategyEditable || Boolean(strategySavingSection)}
                          onChange={() => setStrategyDraft((current) => (current ? { ...current, entry_selection_mode: option.value as 'auto' | 'manual_confirm' } : current))}
                        />
                        <div>
                          <div className="font-bold text-theme-text-primary">{option.label}</div>
                          <div className="text-xs text-theme-text-muted">{option.description}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </section>
              ) : null}

 <section className="rounded-xl border border-theme-border bg-theme-surface p-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-theme-text-primary">任务并发与失败处理</h3>
                    <p className="mt-1 text-sm text-theme-text-muted">这里配置的是任务级阶段并发，不是服务全局并发；仅影响尚未开始的阶段、继续、阶段重试与清空重跑。</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => resetStrategySection('execution_policy')}
                      disabled={!executionPolicyDirty || Boolean(strategySavingSection)}
                      className="rounded-xl border border-theme-border bg-theme-surface px-4 py-2.5 text-sm font-bold text-theme-text-secondary transition hover:bg-theme-elevated disabled:opacity-60"
                    >
                      重置并发策略
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveTaskPolicySection('execution_policy')}
                      disabled={!strategyEditable || !executionPolicyDirty || Boolean(strategySavingSection)}
                      className="inline-flex items-center gap-2 rounded-xl bg-theme-surface px-4 py-2.5 text-sm font-bold text-white transition hover:bg-theme-elevated disabled:opacity-60"
                    >
                      {strategySavingSection === 'execution_policy' ? <Loader2 size={16} className="animate-spin" /> : null}
                      {strategySavingSection === 'execution_policy' ? '保存中...' : '保存并发策略'}
                    </button>
                  </div>
                </div>
                <div className="mt-4 rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 text-xs text-theme-text-secondary">
                  阶段并发按当前任务流程分别生效；源码任务只展示源码流程阶段，二进制任务展示完整流程阶段，模块任务展示模块级四阶段流程。
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {stageSequence.map((stageName) => (
                    <label key={stageName} className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
                      <span className="block text-sm font-semibold text-theme-text-primary">{STAGE_LABELS[stageName] || stageName}</span>
                      <span className="mt-1 block text-xs text-theme-text-muted">任务级阶段并发，范围 1-32</span>
                      <input
                        type="number"
                        min={1}
                        max={32}
                        value={strategyDraft.stage_parallelism[stageName] ?? 1}
                        disabled={!strategyEditable || Boolean(strategySavingSection)}
                        onChange={(event) => updateStrategyStageParallelism(stageName, Number(event.target.value || 1))}
                        className="mt-3 w-full rounded-xl border border-theme-border bg-theme-surface px-3 py-2.5 text-sm font-bold text-theme-text-primary outline-none focus:border-slate-400"
                      />
                    </label>
                  ))}
                  <label className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-4">
                    <span className="block text-sm font-semibold text-theme-text-primary">子任务重试次数</span>
                    <span className="mt-1 block text-xs text-theme-text-muted">范围 0-20</span>
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
                      className="mt-3 w-full rounded-xl border border-theme-border bg-theme-surface px-3 py-2.5 text-sm font-bold text-theme-text-primary outline-none focus:border-slate-400"
                    />
                  </label>
                </div>
                <label className="mt-4 flex items-center gap-3 rounded-2xl border border-theme-border bg-theme-surface px-4 py-4 text-sm font-semibold text-theme-text-secondary">
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
                    <label key={field.key} className="flex items-center gap-3 rounded-2xl border border-theme-border bg-theme-surface px-4 py-4 text-sm font-semibold text-theme-text-secondary">
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
 <section className="rounded-xl border border-theme-border bg-theme-surface p-6">
              <div>
                <div>
                  <h2 className="text-xl font-semibold text-theme-text-primary">任务总览</h2>
                  <p className="mt-2 text-sm text-theme-text-muted">总览包含任务主详情、阶段流转和下游子任务；事件记录和编排观测会在打开对应 Tab 后再请求后端。</p>
                  <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 text-sm">
                      <div className="text-xs font-bold text-theme-text-muted">任务类型</div>
                      <div className="mt-1 font-semibold text-theme-text-primary">{taskTypeLabel(taskType)}</div>
                    </div>
                    <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 text-sm">
                      <div className="text-xs font-bold text-theme-text-muted">执行代次</div>
                      <div className="mt-1 font-semibold text-theme-text-primary">第 {detail.execution_epoch} 轮</div>
                    </div>
                    <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 text-sm">
                      <div className="text-xs font-bold text-theme-text-muted">阶段数</div>
                      <div className="mt-1 font-semibold text-theme-text-primary">{stageSequence.length}</div>
                    </div>
                    <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 text-sm">
                      <div className="text-xs font-bold text-theme-text-muted">当前状态</div>
                      <div className="mt-1 font-semibold text-theme-text-primary">{formatBinarySecurityStatus(displayTaskStatus)}</div>
                    </div>
                    <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 text-sm">
                      <div className="text-xs font-bold text-theme-text-muted">队列位置</div>
                      <div className="mt-1 font-semibold text-theme-text-primary">{detail.is_queued ?`第 ${detail.queue_position || '-'} 位` : '未排队'}</div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {activeTab === 'runtime_health' ? (
            <BinarySecurityRuntimeHealthTab
              detail={detail || null}
              runtimeHealthSummary={runtimeHealthSummary}
              runtimeHealthUnits={runtimeHealthUnits}
              runtimeHealthSpotlight={runtimeHealthSpotlight}
              runtimeHealthGroups={runtimeHealthGroups}
              runtimeHealthAlerts={runtimeHealthAlerts}
              runtimeHealthSnapshotCards={runtimeHealthSnapshotCards}
              runtimeHealthRelatedLoops={runtimeHealthRelatedLoops}
              runtimeHealthHotLoops={runtimeHealthHotLoops}
              runtimeOwnerTopology={runtimeOwnerTopology}
              runtimeDiagnoses={runtimeDiagnoses}
              runtimeHealthExpanded={runtimeHealthExpanded}
              visibleRuntimeHealthUnits={visibleRuntimeHealthUnits}
              onToggleExpanded={() => setRuntimeHealthExpanded((current) => !current)}
              fmt={fmt}
            />
          ) : null}

          {activeTab === 'overview' && cleanupSnapshot && (cleanupDownstreamRefs.length > 0 || Object.keys(cleanupCounts).length > 0) ? (
 <section className="rounded-xl border border-orange-500/20 bg-orange-50/60 p-6">
              <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-theme-text-primary">严格清理快照</h3>
                  <p className="mt-1 text-sm text-theme-text-secondary">本次“清空并从头开始”会先删除旧执行世界，再进入新的执行代次。</p>
                </div>
                <div className="text-xs font-semibold text-theme-text-muted">{cleanupSnapshot.requested_at ?`记录时间：${fmt(cleanupSnapshot.requested_at)}` : '记录时间：-'}</div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-orange-500/20 bg-theme-surface px-4 py-3 text-sm">
                  <div className="text-xs font-bold text-theme-text-muted">上一执行代次</div>
                  <div className="mt-1 font-semibold text-theme-text-primary">第 {cleanupSnapshot.previous_epoch ?? '-'} 轮</div>
                </div>
                <div className="rounded-2xl border border-orange-500/20 bg-theme-surface px-4 py-3 text-sm">
                  <div className="text-xs font-bold text-theme-text-muted">下游清理目标</div>
                  <div className="mt-1 font-semibold text-theme-text-primary">{cleanupDownstreamRefs.length}</div>
                </div>
                <div className="rounded-2xl border border-orange-500/20 bg-theme-surface px-4 py-3 text-sm">
                  <div className="text-xs font-bold text-theme-text-muted">阶段子任务删除</div>
                  <div className="mt-1 font-semibold text-theme-text-primary">{cleanupCounts.stage_items_deleted ?? '-'}</div>
                </div>
                <div className="rounded-2xl border border-orange-500/20 bg-theme-surface px-4 py-3 text-sm">
                  <div className="text-xs font-bold text-theme-text-muted">归档记录删除</div>
                  <div className="mt-1 font-semibold text-theme-text-primary">{cleanupCounts.archive_jobs_deleted ?? '-'}</div>
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-orange-500/20 bg-theme-surface px-4 py-3 text-sm">
                  <div className="text-xs font-bold text-theme-text-muted">阶段运行记录删除</div>
                  <div className="mt-1 font-semibold text-theme-text-primary">{cleanupCounts.stage_runs_deleted ?? '-'}</div>
                </div>
                <div className="rounded-2xl border border-orange-500/20 bg-theme-surface px-4 py-3 text-sm">
                  <div className="text-xs font-bold text-theme-text-muted">时间线事件删除</div>
                  <div className="mt-1 font-semibold text-theme-text-primary">{cleanupCounts.timeline_events_deleted ?? '-'}</div>
                </div>
                <div className="rounded-2xl border border-orange-500/20 bg-theme-surface px-4 py-3 text-sm">
                  <div className="text-xs font-bold text-theme-text-muted">状态事件删除</div>
                  <div className="mt-1 font-semibold text-theme-text-primary">{cleanupCounts.state_events_deleted ?? '-'}</div>
                </div>
              </div>
            </section>
          ) : null}

          {activeTab === 'overview' ? (
            <>
 <section className="rounded-xl border border-theme-border bg-theme-surface p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-theme-text-primary">阶段概览</h2>
                <p className="mt-1 text-sm text-theme-text-muted">点击阶段筛选下方子任务；阶段重试会重跑当前阶段全部子任务，并尽量复用当前阶段旧下游任务，后续阶段会等待当前阶段完成后重新推进。</p>
              </div>
            </div>
            {!detail.task_retry_supported && detail.task_retry_reason ? (
              <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/15 px-4 py-3 text-sm text-amber-400">
                总任务“清空并从头开始”不可用：{detail.task_retry_reason}
              </div>
            ) : null}

            <div ref={stageFlowRef} className="mt-6 overflow-x-auto">
              {overviewLoading && stageDisplayNodes.length === 0 ? (
                <div className="flex min-h-[160px] items-center justify-center rounded-2xl border border-dashed border-theme-border bg-theme-surface text-sm font-semibold text-theme-text-muted">
                  正在加载阶段总览与归档节点…
                </div>
              ) : null}
              {!overviewLoading && overviewLoaded && stageDisplayNodes.length === 0 ? (
                <div className="flex min-h-[160px] items-center justify-center rounded-2xl border border-dashed border-theme-border bg-theme-surface text-sm font-semibold text-theme-text-muted">
                  当前暂无可展示的阶段总览节点
                </div>
              ) : null}
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
                        title={stage.kind === 'archive' ?`产物归档 · ${STAGE_LABELS[stage.stage_name] || stage.stage_name} · ${archiveStatusLabel(stage.status)}` : undefined}
                        aria-label={stage.kind === 'archive' ?`产物归档 ${STAGE_LABELS[stage.stage_name] || stage.stage_name} ${archiveStatusLabel(stage.status)}` : undefined}
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
 className={`rounded-[1.75rem] border text-left transition hover:-translate-y-0.5 focus:outline-none ${
                          stage.kind === 'archive'
                            ? stageFlowLayout.mode === 'horizontal'
                              ? 'flex min-h-[172px] flex-col justify-between p-4'
                              : 'mx-auto flex min-h-[172px] w-full max-w-[260px] flex-col justify-between p-4'
                            : stageFlowLayout.mode === 'horizontal'
                              ? 'p-4'
                              : 'w-full p-4'
                        } ${stageNodeTone(stage.stage_name, stage.kind, stage.status, selectedStage === stage.stage_name && selectedNodeKind === stage.kind, stage.sequence_no)}`}
                      >
                        {stage.abnormal_reason ? (
                          <div className="mb-2">
 <span className="inline-flex max-w-full rounded-full border border-current/15 bg-theme-bg-app px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
                              <span className="truncate">{stage.abnormal_reason.code}</span>
                            </span>
                          </div>
                        ) : null}
                        {stage.kind === 'archive' ? (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-60">Archive</div>
                              <div className="h-2.5 w-2.5 rounded-full border border-current bg-current/15" />
                            </div>
                            <div className="space-y-1">
                              <div className="text-sm font-semibold leading-none">产物归档</div>
                              <div className="text-[11px] font-semibold leading-tight opacity-75">{STAGE_LABELS[stage.stage_name] || stage.stage_name}</div>
                            </div>
                            <div className="mt-3 space-y-1 rounded-2xl border border-current/15 bg-slate-100/105 px-3 py-2 text-[10px] font-semibold leading-4">
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
                                <span className="shrink-0 whitespace-nowrap text-right font-semibold">{durationLabel(stage.started_at, stage.finished_at)}</span>
                              </div>
                            </div>
 <div className="rounded-full border border-current/20 bg-theme-bg-app px-2 py-1 text-center text-[10px] font-medium leading-none">
                              {formatBinarySecurityStatus(stage.status_label || archiveStatusLabel(stage.status))}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] opacity-60">
                                  {`Stage ${stage.sequence_no}`}
                                </div>
                                <div className="mt-2 text-base font-semibold">{stage.label}</div>
                              </div>
                              <div className="h-3 w-3 rounded-full border border-current bg-current/15" />
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-semibold">
                              <div>总数 {(stage.detail as any)?.total_items ?? 0}</div>
                              <div>成功 {(stage.detail as any)?.success_items ?? 0}</div>
                              <div>编排失败 {(stage.detail as any)?.orchestration_failed_items ?? (stage.detail as any)?.failed_items ?? 0}</div>
                              <div>运行 {(stage.detail as any)?.running_items ?? 0}</div>
                            </div>
                            <div className="mt-3 grid gap-1 rounded-2xl border border-current/15 bg-slate-100/105 px-3 py-2 text-[10px] font-semibold leading-4">
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
                                <span className="shrink-0 whitespace-nowrap text-right font-semibold">{durationLabel(stage.started_at, stage.finished_at)}</span>
                              </div>
                            </div>
 <div className="mt-3 rounded-full border border-current/20 bg-theme-bg-app px-3 py-1 text-center text-[11px] font-medium">
                              {formatBinarySecurityStatus(stage.status_label || stage.status)}
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-2">
                              {staleStages.has(stage.stage_name) ? (
                                <span className="rounded-full border border-amber-500/20 bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-400">
                                  结果已过期
                                </span>
                              ) : (
                                <span className="text-[11px] font-semibold opacity-70">点击查看子任务</span>
                              )}
                            </div>
                            {shouldShowStageRetryReason(stage.status, stage.retryable, stage.retry_reason) ? (
                              <div className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/15 px-3 py-2 text-[11px] font-semibold text-amber-400">
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

 <section className="rounded-xl border border-theme-border bg-theme-surface p-6">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-theme-text-primary">{selectedNodeKind === 'archive' ? '产物归档任务' : '阶段子任务'}</h2>
                <p className="mt-1 text-sm text-theme-text-muted">
                  当前筛选：
                  <span className="ml-2 font-bold text-theme-text-primary">{STAGE_LABELS[selectedStage] || selectedStage}</span>
                  {selectedNodeKind === 'archive' ? <span className="ml-2 text-theme-text-muted">/ 产物归档</span> : null}
                </p>
              </div>
            </div>

	            {selectedNodeKind === 'business' && selectedBusinessStageNode ? (
                <>
	              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
                  <div className="text-xs font-bold text-theme-text-muted">阶段状态</div>
                  <div className="mt-1">
                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(selectedBusinessStageNode.status)}`}>
                      {formatBinarySecurityStatus(selectedBusinessStageNode.status_label || selectedBusinessStageNode.status)}
                    </span>
                  </div>
                </div>
                <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
                  <div className="text-xs font-bold text-theme-text-muted">开始时间</div>
                  <div className="mt-1 text-sm font-semibold text-theme-text-primary">{fmt(selectedBusinessStageNode.started_at)}</div>
                </div>
                <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
                  <div className="text-xs font-bold text-theme-text-muted">结束时间</div>
                  <div className="mt-1 text-sm font-semibold text-theme-text-primary">{fmt(selectedBusinessStageNode.finished_at)}</div>
                </div>
                <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
                  <div className="text-xs font-bold text-theme-text-muted">阶段耗时</div>
                  <div className="mt-1 text-sm font-semibold text-theme-text-primary">{durationLabel(selectedBusinessStageNode.started_at, selectedBusinessStageNode.finished_at)}</div>
                </div>
                <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
                  <div className="text-xs font-bold text-theme-text-muted">子任务</div>
                  <div className="mt-1 text-sm font-semibold text-theme-text-primary">
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
                        <div className="text-sm font-semibold text-theme-text-muted">
                          归档阶段支持“重试失败项”和“阶段完全重试”，都不会重跑业务子任务。
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            title={archiveRetryFailedReason}
                            className={`rounded-full px-4 py-2 text-sm font-semibold ${
                              archiveRetryFailedSupported && actionLoading === ''
                                ? 'bg-emerald-600 text-white'
                                : 'bg-theme-elevated text-theme-text-muted'
                            }`}
                            onClick={() => {
                              if (!archiveRetryFailedSupported || actionLoading !== '') return;
                              void retryArchiveStageFailedItems(selectedStage);
                            }}
                            disabled={!archiveRetryFailedSupported || actionLoading !== ''}
                          >
                            {actionLoading ===`archive-stage-failed:${selectedStage}` ? '归档重试中' : '重试失败项'}
                          </button>
                          <button
                            type="button"
                            title={archiveRetryFullReason}
                            className={`rounded-full px-4 py-2 text-sm font-semibold ${
                              archiveRetryFullSupported && actionLoading === ''
                                ? 'bg-theme-surface text-white'
                                : 'bg-theme-elevated text-theme-text-muted'
                            }`}
                            onClick={() => {
                              if (!archiveRetryFullSupported || actionLoading !== '') return;
                              void retryArchiveStageFull(selectedStage);
                            }}
                            disabled={!archiveRetryFullSupported || actionLoading !== ''}
                          >
                            {actionLoading ===`archive-stage-full:${selectedStage}` ? '归档清理中' : '阶段完全重试'}
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                        <div className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
                          <div className="text-xs font-bold text-theme-text-muted">归档任务</div>
                          <div className="mt-1 text-lg font-semibold text-theme-text-primary">{(selectedArchiveNode.detail as any)?.job_count ?? 0}</div>
                        </div>
                        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/15 px-4 py-3">
                          <div className="text-xs font-bold text-emerald-500">完成</div>
                          <div className="mt-1 text-lg font-semibold text-emerald-400">{(selectedArchiveNode.detail as any)?.success_count ?? 0}</div>
                        </div>
                        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/15 px-4 py-3">
                          <div className="text-xs font-bold text-rose-500">失败</div>
                          <div className="mt-1 text-lg font-semibold text-rose-400">{(selectedArchiveNode.detail as any)?.failed_count ?? 0}</div>
                        </div>
                        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/15 px-4 py-3">
                          <div className="text-xs font-bold text-blue-500">总耗时</div>
                          <div className="mt-1 text-lg font-semibold text-blue-400">{durationLabel((selectedArchiveNode.detail as any)?.first_created_at, (selectedArchiveNode.detail as any)?.last_updated_at)}</div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {selectedArchiveJobs.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-theme-border bg-theme-surface px-6 py-10 text-center text-sm text-theme-text-muted">
                      当前阶段暂无归档记录，等待下游阶段产物归档。
                    </div>
                  ) : selectedArchiveJobs.map((job) => (
                    <div key={job.id} className={`rounded-xl border p-5 ${stageNodeTone(job.stage_name, 'archive', job.archive_status === 'archived' || job.archive_status === 'applying' ? 'running' : job.archive_status, false)}`}>
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(job.archive_status === 'archived' || job.archive_status === 'applying' ? 'running' : job.archive_status)}`}>
                              {archiveStatusLabel(job.archive_status)}
                            </span>
                            <span className="rounded-full border border-theme-border bg-theme-bg-app px-2.5 py-1 text-[11px] font-bold text-theme-text-muted">
                              尝试 {job.attempts || 0}
                            </span>
                          </div>
                          <div className="mt-3 break-all text-base font-semibold text-theme-text-primary">{job.item_key || job.item_id}</div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <button
                            type="button"
                            title={
                              !manualOperationState?.can_retry_archive
                                ? (manualOperationState?.blocking_reason || '当前任务暂不可进行归档重试')
                                : (job.retry_reason || undefined)
                            }
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              job.retry_supported && manualOperationState?.can_retry_archive !== false && actionLoading === ''
                                ? 'bg-theme-surface text-white'
                                : 'bg-theme-elevated text-theme-text-muted'
                            }`}
                            onClick={() => {
                              if (!job.retry_supported || manualOperationState?.can_retry_archive === false || actionLoading !== '') return;
                              void retryArchiveJob(job);
                            }}
                            disabled={!job.retry_supported || manualOperationState?.can_retry_archive === false || actionLoading !== ''}
                          >
                            {actionLoading ===`archive-job:${job.id}` ? '重试中' : '重试归档'}
                          </button>
 <div className="whitespace-nowrap rounded-xl border border-theme-border bg-theme-surface px-3 py-2 font-mono text-xs text-theme-text-secondary">
                            {fmt(job.created_at)} {'->'} {fmt(job.completed_at || job.updated_at)}
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-1 gap-3 text-xs text-theme-text-secondary xl:grid-cols-2">
 <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2">
                          <span className="text-theme-text-muted">下游服务</span>
                          <div className="mt-1 font-mono text-theme-text-primary">{job.downstream_service || '-'}</div>
                        </div>
 <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2">
                          <span className="text-theme-text-muted">下游任务 ID</span>
                          <div className="mt-1 break-all font-mono text-theme-text-primary">{job.downstream_task_id || '-'}</div>
                        </div>
 <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2 xl:col-span-2">
                          <span className="text-theme-text-muted">归档源路径</span>
                          <div className="mt-1">
                            <ProjectDirectoryValue path={archiveJobSourcePath(job)} projectId={projectId} />
                          </div>
                        </div>
                        {(job.archive_source_paths || []).length > 1 ? (
 <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2 xl:col-span-2">
                            <span className="text-theme-text-muted">归档源路径（全部）</span>
                            <div className="mt-1 space-y-1">
                              {(job.archive_source_paths || []).map((path, index) => (
                                <ProjectDirectoryValue key={`${job.id}-archive-source-${index}`} path={path} projectId={projectId} />
                              ))}
                            </div>
                          </div>
                        ) : null}
 <div className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2 xl:col-span-2">
                          <span className="text-theme-text-muted">归档路径</span>
                          <div className="mt-1">
                            <ProjectDirectoryValue path={job.archive_root} projectId={projectId} />
                          </div>
                        </div>
                      </div>
                      {job.copy_stats ? (
 <div className="mt-3 rounded-xl border border-theme-border bg-theme-surface p-3">
                          <div className="grid grid-cols-2 gap-2 text-xs text-theme-text-secondary xl:grid-cols-4">
                            <div>
                              <div className="text-theme-text-muted">文件</div>
                              <div className="mt-1 font-semibold text-theme-text-primary">{job.copy_stats.copied_files || 0}</div>
                            </div>
                            <div>
                              <div className="text-theme-text-muted">目录</div>
                              <div className="mt-1 font-semibold text-theme-text-primary">{job.copy_stats.copied_dirs || 0}</div>
                            </div>
                            <div>
                              <div className="text-theme-text-muted">符号链接</div>
                              <div className="mt-1 font-semibold text-theme-text-primary">{job.copy_stats.copied_symlinks || 0}</div>
                            </div>
                            <div>
                              <div className="text-theme-text-muted">跳过错误</div>
                              <div className={`mt-1 font-semibold ${(job.copy_stats.skipped_errors || 0) > 0 ? 'text-amber-400' : 'text-theme-text-primary'}`}>
                                {job.copy_stats.skipped_errors || 0}
                              </div>
                            </div>
                          </div>
                          {(job.copy_stats.errors || []).length > 0 ? (
                            <div className="mt-3 space-y-2">
                              {(job.copy_stats.errors || []).slice(0, 5).map((error, index) => (
                                <div key={`${job.id}-copy-error-${index}`} className="rounded-lg border border-amber-500/20 bg-amber-500/15 px-3 py-2 text-xs text-amber-400">
                                  <div className="break-all font-mono">{error.source || '-'}</div>
                                  <div className="mt-1 break-all text-amber-400">{error.error || '-'}</div>
                                </div>
                              ))}
                              {job.copy_stats.error_truncated || (job.copy_stats.errors || []).length > 5 ? (
                                <div className="text-xs font-semibold text-amber-400">仅显示部分归档错误，完整明细请查看事件 payload。</div>
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
                        <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-400">
                          {job.error_message}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </>
	              ) : (
	                <>
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="text-sm font-semibold text-theme-text-muted">
                    {manualOperationState?.can_retry_stage_failed_items === false
                      ? (manualOperationState?.blocking_reason || '当前阶段失败项正在自动恢复中，暂不建议手工重试。')
                      : '业务阶段支持“重试失败项”和“阶段完全重试”；会重跑当前阶段子任务，并在完成后重新评估后续阶段推进。'}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      title={
                        manualOperationState?.can_retry_stage_failed_items === false
                          ? (manualOperationState?.blocking_reason || '当前任务暂不可重试失败项')
                          : (selectedBusinessStageNode?.retry_failed_reason || undefined)
                      }
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        selectedBusinessStageNode?.retry_failed_supported && manualOperationState?.can_retry_stage_failed_items !== false && actionLoading === ''
                          ? 'bg-emerald-600 text-white'
                          : 'bg-theme-elevated text-theme-text-muted'
                      }`}
                      onClick={() => {
                        if (!selectedBusinessStageNode?.retry_failed_supported || manualOperationState?.can_retry_stage_failed_items === false || actionLoading !== '') return;
                        void retryStageFailedItems(selectedStage);
                      }}
                      disabled={!selectedBusinessStageNode?.retry_failed_supported || manualOperationState?.can_retry_stage_failed_items === false || actionLoading !== ''}
                    >
                      {actionLoading ===`stage-failed:${selectedStage}` ? '重试中' : '重试失败项'}
                    </button>
                    <button
                      type="button"
                      title={
                        manualOperationState?.can_retry_stage_full === false
                          ? (manualOperationState?.blocking_reason || '当前任务暂不可完全重试')
                          : (selectedBusinessStageNode?.retry_full_reason || undefined)
                      }
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        selectedBusinessStageNode?.retry_full_supported && manualOperationState?.can_retry_stage_full !== false && actionLoading === ''
                          ? 'bg-theme-surface text-white'
                          : 'bg-theme-elevated text-theme-text-muted'
                      }`}
                      onClick={() => {
                        if (!selectedBusinessStageNode?.retry_full_supported || manualOperationState?.can_retry_stage_full === false || actionLoading !== '') return;
                        void retryStageFull(selectedStage);
                      }}
                      disabled={!selectedBusinessStageNode?.retry_full_supported || manualOperationState?.can_retry_stage_full === false || actionLoading !== ''}
                    >
                      {actionLoading ===`stage-full:${selectedStage}` ? '重试中' : '阶段完全重试'}
                    </button>
                  </div>
                </div>
	              <div className="flex flex-col gap-3 rounded-xl border border-theme-border bg-slate-50/80 px-4 py-4 xl:flex-row xl:items-center xl:justify-between">
	                <div className="flex flex-wrap items-center gap-2">
	                  <button
	                    type="button"
	                    onClick={() => setStageStatusFilter('all')}
	                    className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
	                      stageStatusFilter === 'all'
	                        ? 'border-theme-border bg-theme-surface text-white'
	                        : 'border-theme-border bg-theme-bg-app text-theme-text-secondary hover:bg-theme-elevated'
	                    }`}
	                  >
	                    全部 {stageItemsTotal}
	                  </button>
	                  {stageStatusOptions.map((option) => (
	                    <button
	                      key={option.status}
	                      type="button"
	                      onClick={() => setStageStatusFilter(option.status)}
	                      className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
	                        stageStatusFilter === option.status
	                          ? 'border-theme-border bg-theme-surface text-white'
	                          : 'border-theme-border bg-theme-bg-app text-theme-text-secondary hover:bg-theme-elevated'
	                      }`}
	                    >
	                      {formatBinarySecurityStatus(option.status)} {option.count}
	                    </button>
	                  ))}
	                </div>
	                <div className="flex flex-wrap items-center gap-2 text-xs">
	                  <span className="rounded-full border border-theme-border bg-theme-bg-app px-3 py-2 font-bold text-theme-text-secondary">
	                    已选 {selectedVisibleStageItems.length} / 当前页 {visibleStageItems.length}
	                  </span>
	                  <button
	                    type="button"
	                    disabled={visibleStageItems.length === 0}
	                    onClick={() => setSelectedStageItemIds(visibleStageItems.map((item) => item.id))}
	                    className="rounded-full border border-theme-border bg-theme-bg-app px-3 py-2 font-semibold text-theme-text-secondary disabled:opacity-50"
	                  >
	                    全选当前页
	                  </button>
	                  <button
	                    type="button"
	                    disabled={selectedStageItemIds.length === 0}
	                    onClick={() => setSelectedStageItemIds([])}
	                    className="rounded-full border border-theme-border bg-theme-bg-app px-3 py-2 font-semibold text-theme-text-secondary disabled:opacity-50"
	                  >
	                    清空选择
	                  </button>
	                  <button
	                    type="button"
	                    disabled={actionLoading !== '' || selectedSyncableStageItems.length === 0}
	                    onClick={() => void batchSyncSelectedStageItems()}
	                    className="rounded-full border border-sky-500/20 bg-sky-500/15 px-3 py-2 font-semibold text-sky-400 disabled:opacity-50"
	                  >
	                    {actionLoading === 'sync-selected-items' ? '同步中...' :`批量同步状态 ${selectedSyncableStageItems.length > 0 ?`(${selectedSyncableStageItems.length})` : ''}`}
	                  </button>
	                </div>
	              </div>
                <div className="flex flex-col gap-3 rounded-xl border border-theme-border bg-theme-surface px-4 py-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="text-sm text-theme-text-muted">
                    阶段子任务分页：
                    <span className="ml-2 font-bold text-theme-text-primary">第 {stageItemsCurrentPage} / {stageItemsTotalPages} 页</span>
                    <span className="ml-2 text-theme-text-muted">共 {stageItemsTotal} 条，每页 {stageItemsPerPage} 条</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-2 rounded-full border border-theme-border bg-theme-bg-app px-3 py-2 text-xs font-semibold text-theme-text-secondary">
                      每页
                      <select
                        value={stageItemsPerPage}
                        onChange={(event) => {
                          const next = Number(event.target.value) || DEFAULT_STAGE_ITEMS_PER_PAGE;
                          setStageItemsPerPage(next);
                        }}
                        className="rounded-lg border border-theme-border bg-theme-bg-app px-2 py-1 text-xs font-bold text-theme-text-primary outline-none"
                      >
                        {STAGE_ITEMS_PER_PAGE_OPTIONS.map((size) => (
                          <option key={size} value={size}>{size}</option>
                        ))}
                      </select>
                      条
                    </label>
                    <button
                      type="button"
                      disabled={stageItemsPageLoading || stageItemsCurrentPage <= 1}
                      onClick={() => setStageItemsCurrentPage((current) => Math.max(1, current - 1))}
                      className="rounded-full border border-theme-border bg-theme-bg-app px-3 py-2 text-xs font-semibold text-theme-text-secondary disabled:opacity-50"
                    >
                      上一页
                    </button>
                    <button
                      type="button"
                      disabled={stageItemsPageLoading || stageItemsCurrentPage >= stageItemsTotalPages}
                      onClick={() => setStageItemsCurrentPage((current) => Math.min(stageItemsTotalPages, current + 1))}
                      className="rounded-full border border-theme-border bg-theme-bg-app px-3 py-2 text-xs font-semibold text-theme-text-secondary disabled:opacity-50"
                    >
                      下一页
                    </button>
                  </div>
                </div>
                {stageItemsPageError ? (
                  <div className="rounded-2xl border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-400">
                    {stageItemsPageError}
                  </div>
                ) : null}
	              {staleStages.has(selectedStage) ? (
	                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-400">
	                  由于上游阶段 {STAGE_LABELS[detail.summary?.stale_from_stage || ''] || detail.summary?.stale_from_stage || '-'} 已重试，当前阶段结果基于旧上游产物。
	                </div>
	              ) : null}
	              {visibleStageItems.length === 0 ? (
	                <div className="rounded-2xl border border-dashed border-theme-border bg-theme-surface px-6 py-10 text-center text-sm text-theme-text-muted">
	                  {stageItemsTotal === 0 ? '当前阶段暂无子任务' : '当前筛选下本页暂无子任务'}
	                </div>
	              ) : (
	                <div className="overflow-hidden rounded-xl border border-theme-border">
	                  <div className="overflow-x-auto">
	                    <table className="min-w-[1200px] w-full divide-y divide-theme-border text-left text-xs">
	                      <thead className="bg-theme-bg-app text-[11px] font-semibold uppercase tracking-[0.12em] text-theme-text-muted">
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
	                          <th className="w-28 px-3 py-3">
                              <div>编排状态</div>
                              {renderStageItemFilterSelect(stageStatusFilter, setStageStatusFilter, stageStatusOptions, formatBinarySecurityStatus)}
                            </th>
                          <th className="w-28 px-3 py-3">
                            <div>下游状态</div>
                            {renderStageItemFilterSelect(stageDownstreamStatusFilter, setStageDownstreamStatusFilter, stageDownstreamStatusOptions, formatDownstreamStatus)}
                          </th>
	                          <th className="min-w-[260px] px-3 py-3">子任务</th>
                          <th className="w-28 px-3 py-3">总重试</th>
                          {isSystemAnalysisStageTable ? (
                            <>
                              <th className="w-28 px-3 py-3">高风险模块</th>
                              <th className="w-28 px-3 py-3">中风险模块</th>
                              <th className="w-28 px-3 py-3">低风险模块</th>
                            </>
                          ) : null}
                          {isEntryAnalysisStageTable ? <th className="w-24 px-3 py-3">入口数量</th> : null}
                          <th className="w-44 px-3 py-3">{renderSortableStageItemHeader('首次开始', 'started_at')}</th>
                          <th className="w-44 px-3 py-3">{renderSortableStageItemHeader('结束时间', 'finished_at')}</th>
                          <th className="w-28 px-3 py-3">{renderSortableStageItemHeader('耗时', 'duration')}</th>
                          <th className="w-44 px-3 py-3">{renderSortableStageItemHeader('最近尝试', 'last_sync_attempt_at')}</th>
                          <th className="w-44 px-3 py-3">{renderSortableStageItemHeader('最近成功', 'last_sync_success_at')}</th>
                          <th className="w-44 px-3 py-3">{renderSortableStageItemHeader('最近失败', 'last_sync_error_at')}</th>
                          <th className="w-32 px-3 py-3">
                            <div>同步状态</div>
                            {renderStageItemFilterSelect(stageSyncStatusFilter, setStageSyncStatusFilter, stageSyncStatusOptions, formatStageItemSyncStatus)}
                          </th>
                          <th className="w-52 px-3 py-3 text-right">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-theme-border bg-theme-bg-app">
	                        {visibleStageItems.map((item) => {
	                          const detailSupport = downstreamDetailSupport(item.stage_name, item.downstream_task_id, stageItemMissingDownstreamReason(item));
	                          const expanded = expandedStageItemId === item.id;
	                          const checked = selectedStageItemIds.includes(item.id);
                            const riskCounts = systemAnalysisRiskCountLabels(item, downstreamByItemId[item.id]);
                            const contractRows = stageItemContractRows(item);
                            const inputContractRows = stageItemInputContractRows(item);
	                          return (
	                            <React.Fragment key={item.id}>
	                              <tr className="align-top transition hover:bg-slate-100/80">
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
	                                    <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(item.status)}`}>
                                      {formatBinarySecurityStatus(item.status)}
	                                    </span>
	                                  </div>
	                                </td>
                                  <td className="px-3 py-3">
                                    <div className="flex flex-col gap-2">
                                      <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(stageItemDownstreamToneStatus(item))}`}>
                                        {stageItemDisplayDownstreamStatus(item)}
                                      </span>
                                      {!item.downstream_task_id && item.downstream_binding_message ? (
                                        <span className="inline-flex w-fit rounded-full border border-theme-border bg-theme-bg-app px-2.5 py-1 text-[11px] font-bold text-theme-text-secondary">
                                          {item.downstream_binding_message}
                                        </span>
                                      ) : null}
                                      {item.status === 'failed' && String(item.downstream_status || '').toLowerCase() === 'passed' ? (
                                        <span className="inline-flex w-fit rounded-full border border-amber-500/20 bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-400">
                                          父任务保留失败快照
                                        </span>
                                      ) : null}
                                      {item.status === 'downstream_missing' ? (
                                        <span className="inline-flex w-fit rounded-full border border-orange-500/20 bg-orange-500/15 px-2.5 py-1 text-[11px] font-bold text-orange-400">
                                          当前引用下游任务不可观测
                                        </span>
                                      ) : null}
                                    </div>
                                  </td>
                                <td className="px-3 py-3">
                                  <div className="min-w-0">
                                    <div className="break-all text-sm font-semibold text-theme-text-primary">
                                      {item.item_name || item.item_key}
                                    </div>
                                    <div className="mt-1 break-all font-mono text-[11px] text-theme-text-muted">
                                      {item.item_key}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-3">
                                  <div className="font-bold text-theme-text-secondary">{item.total_retry_count || 0}</div>
                                  <div className="mt-1 text-[11px] text-theme-text-muted">
                                    自动 {item.auto_retry_count || 0} / 重跑 {item.rerun_count || 0}
                                  </div>
                                </td>
                                {isSystemAnalysisStageTable ? (
                                  <>
                                    <td className="px-3 py-3 font-semibold text-theme-text-primary">{riskCounts.high}</td>
                                    <td className="px-3 py-3 font-semibold text-theme-text-primary">{riskCounts.medium}</td>
                                    <td className="px-3 py-3 font-semibold text-theme-text-primary">{riskCounts.low}</td>
                                  </>
                                ) : null}
                                {isEntryAnalysisStageTable ? (
                                  <td className="px-3 py-3 font-semibold text-theme-text-primary">{stageItemEntryCountLabel(item, entryAnalysisEntryCountByItemKey)}</td>
                                ) : null}
                                <td className="whitespace-nowrap px-3 py-3 font-mono text-[11px] text-theme-text-secondary">{fmt(item.first_started_at || item.started_at)}</td>
                                <td className="whitespace-nowrap px-3 py-3 font-mono text-[11px] text-theme-text-secondary">{fmt(item.finished_at)}</td>
                                <td className="px-3 py-3 font-semibold text-theme-text-primary">{durationLabel(item.latest_started_at || item.started_at, item.finished_at)}</td>
                                <td className="whitespace-nowrap px-3 py-3 font-mono text-[11px] text-theme-text-secondary">
                                  {displayStageItemSyncTime(item.last_sync_attempt_at, item.downstream_task_id ? '未尝试' : '不适用')}
                                </td>
                                <td className="whitespace-nowrap px-3 py-3 font-mono text-[11px] text-theme-text-secondary">
                                  {displayStageItemSyncTime(item.last_sync_success_at || item.last_synced_at, item.downstream_task_id ? '从未成功' : '不适用')}
                                </td>
                                <td className="whitespace-nowrap px-3 py-3 font-mono text-[11px] text-theme-text-secondary">
                                  {displayStageItemSyncTime(item.last_sync_error_at, item.downstream_task_id ? '暂无失败' : '不适用')}
                                </td>
                                <td className="px-3 py-3">
                                  <div className="flex flex-col gap-2">
                                    <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(stageItemSyncFreshnessTone(item))}`}>
                                      {formatStageItemSyncFreshness(item.sync_freshness_state, item)}
                                    </span>
                                    <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(
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
                                  </div>
                                </td>
                                <td className="px-3 py-3">
                                  <div className="flex flex-wrap items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setExpandedStageItemId(expanded ? null : item.id)}
                                      className="rounded-full border border-theme-border bg-theme-bg-app px-3 py-2 text-[11px] font-medium text-theme-text-secondary transition hover:bg-theme-elevated"
                                    >
                                      {expanded ? '收起详情' : '查看详情'}
                                    </button>
                                    {item.downstream_task_id ? (
                                      <button
                                        type="button"
                                        className="rounded-full border border-sky-500/20 bg-sky-500/15 px-3 py-2 text-[11px] font-medium text-sky-400 disabled:opacity-60"
                                        disabled={actionLoading !== ''}
                                        onClick={() => void syncDownstreamStatus({ stageName: item.stage_name, itemId: item.id })}
                                      >
                                        同步状态
                                      </button>
                                    ) : null}
                                    {isRetryableCreateFailure(item) ? (
                                      <button
                                        type="button"
                                        className="rounded-full border border-amber-500/20 bg-amber-500/15 px-3 py-2 text-[11px] font-medium text-amber-400 disabled:opacity-60"
                                        disabled={actionLoading !== ''}
                                        onClick={() => void syncDownstreamStatus({ stageName: item.stage_name, itemId: item.id, force: true })}
                                      >
                                        重试创建
                                      </button>
                                    ) : null}
                                    {detailSupport.supported ? (
                                      <button
                                        type="button"
                                        className="rounded-full border border-theme-border bg-theme-surface px-3 py-2 text-[11px] font-medium text-white"
                                        onClick={() => openDownstreamTaskDetail(item)}
                                      >
                                        查看任务详情
                                      </button>
                                    ) : (
                                      <span
                                        className="inline-flex items-center gap-1 rounded-full border border-theme-border bg-theme-bg-app px-3 py-2 text-[11px] font-bold text-theme-text-muted"
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
 <aside className="rounded-2xl border border-theme-border bg-theme-surface p-4">
                                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-theme-text-muted">下游任务</div>
                                          <div className="mt-3 space-y-3 text-xs text-theme-text-secondary">
                                            <div>
                                              <div className="text-theme-text-muted">服务</div>
                                              <div className="mt-1 break-all font-mono text-theme-text-primary">{item.downstream_service || '-'}</div>
                                            </div>
                                            <div>
                                              <div className="text-theme-text-muted">任务 ID</div>
                                              <div className="mt-1 break-all font-mono text-theme-text-primary">{item.downstream_task_id || '-'}</div>
                                            </div>
                                            {!item.downstream_task_id ? (
                                              <div>
                                                <div className="text-theme-text-muted">绑定状态</div>
                                                <div className="mt-1 text-theme-text-primary">{stageItemDisplayDownstreamStatus(item)}</div>
                                              </div>
                                            ) : null}
                                            {!item.downstream_task_id && item.downstream_create_attempts ? (
                                              <div>
                                                <div className="text-theme-text-muted">创建尝试次数</div>
                                                <div className="mt-1 text-theme-text-primary">{item.downstream_create_attempts}</div>
                                              </div>
                                            ) : null}
                                            {!item.downstream_task_id && item.downstream_create_next_retry_at ? (
                                              <div>
                                                <div className="text-theme-text-muted">下次重试时间</div>
                                                <div className="mt-1 font-mono text-theme-text-primary">{fmt(item.downstream_create_next_retry_at)}</div>
                                              </div>
                                            ) : null}
                                          </div>
                                          {!detailSupport.supported ? (
                                            <div className="mt-3 rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-xs font-semibold text-theme-text-secondary">
                                              {detailSupport.reason}
                                            </div>
                                          ) : null}
                                          <div className="mt-3 rounded-xl border border-theme-border bg-theme-surface px-3 py-3 text-xs text-theme-text-secondary">
                                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-theme-text-muted">同步诊断</div>
                                            <div className="mt-3 space-y-3">
                                              <div>
                                                <div className="text-theme-text-muted">首次开始</div>
                                                <div className="mt-1 font-mono text-theme-text-primary">{fmt(item.first_started_at || item.started_at)}</div>
                                              </div>
                                              <div>
                                                <div className="text-theme-text-muted">本轮开始</div>
                                                <div className="mt-1 font-mono text-theme-text-primary">{fmt(item.latest_started_at || item.started_at)}</div>
                                              </div>
                                              <div>
                                                <div className="text-theme-text-muted">重试统计</div>
                                                <div className="mt-1 text-theme-text-primary">
                                                  总计 {item.total_retry_count || 0}，自动重试 {item.auto_retry_count || 0}，重跑 {item.rerun_count || 0}
                                                </div>
                                              </div>
                                              <div>
                                                <div className="text-theme-text-muted">当前同步结论</div>
                                                <div className="mt-1 text-theme-text-primary">{formatStageItemSyncFreshness(item.sync_freshness_state, item)}</div>
                                              </div>
                                              <div>
                                                <div className="text-theme-text-muted">最近尝试</div>
                                                <div className="mt-1 font-mono text-theme-text-primary">{displayStageItemSyncTime(item.last_sync_attempt_at, item.downstream_task_id ? '未尝试' : '不适用')}</div>
                                              </div>
                                              <div>
                                                <div className="text-theme-text-muted">最近成功</div>
                                                <div className="mt-1 font-mono text-theme-text-primary">{displayStageItemSyncTime(item.last_sync_success_at || item.last_synced_at, item.downstream_task_id ? '从未成功' : '不适用')}</div>
                                              </div>
                                              <div>
                                                <div className="text-theme-text-muted">最近失败</div>
                                                <div className="mt-1 font-mono text-theme-text-primary">{displayStageItemSyncTime(item.last_sync_error_at, item.downstream_task_id ? '暂无失败' : '不适用')}</div>
                                              </div>
                                              <div>
                                                <div className="text-theme-text-muted">最近错误类型</div>
                                                <div className="mt-1 text-theme-text-primary">{item.last_sync_error_type || item.sync_observation_error_type || '-'}</div>
                                              </div>
                                              <div>
                                                <div className="text-theme-text-muted">最近错误摘要</div>
                                                <div className="mt-1 break-all text-theme-text-primary">{item.last_sync_error_message || item.sync_observation_error_message || '-'}</div>
                                              </div>
                                            </div>
                                          </div>
                                        </aside>
                                        <div>
                                          {item.abnormal_reason ? (
                                            <div className="mb-4">
                                              <AbnormalReasonCard reason={item.abnormal_reason} />
                                            </div>
                                          ) : null}
                                          {item.error_message ? (
                                            <div className="rounded-xl border border-rose-500/20 bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-400">
                                              {item.error_message}
                                            </div>
                                          ) : null}
                                          {(inputContractRows.length > 0 || contractRows.output.length > 0) ? (
                                            <div className={`grid gap-4 ${item.error_message ? 'mt-4' : 'mt-4'} xl:grid-cols-2`}>
 <div className="rounded-2xl border border-theme-border bg-theme-surface p-4">
                                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-theme-text-muted">输入 Contract</div>
                                                <div className="mt-1 text-[11px] text-theme-text-muted">直接展示当前阶段子任务记录的原始输入合约，不做字段推断。</div>
                                                <div className="mt-3 space-y-2">
                                                  {inputContractRows.length > 0 ? inputContractRows.map((row) => (
                                                    <div key={`${item.id}-input-${row.label}`} className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2">
                                                      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-theme-text-muted">{row.label}</div>
                                                      {renderStageItemDetailValue(row.label, row.value, projectId)}
                                                    </div>
                                                  )) : (
                                                    <div className="rounded-xl border border-dashed border-theme-border bg-theme-surface px-3 py-3 text-xs text-theme-text-muted">
                                                      当前子任务未记录结构化输入 Contract。
                                                    </div>
                                                  )}
                                                </div>
                                                {inputContractRows.length > 0 ? (
                                                  <details className="mt-3">
                                                    <summary className="cursor-pointer text-xs font-bold text-theme-text-muted hover:text-theme-text-primary">
                                                      查看原始 JSON
                                                    </summary>
                                                    <pre className="mt-2 max-h-72 overflow-auto rounded-xl border border-theme-border bg-theme-surface px-3 py-3 text-xs leading-6 text-theme-text-primary">
                                                      {JSON.stringify(item.input_ref, null, 2)}
                                                    </pre>
                                                  </details>
                                                ) : null}
                                              </div>
 <div className="rounded-2xl border border-theme-border bg-theme-surface p-4">
                                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-theme-text-muted">输出 Contract</div>
                                                <div className="mt-1 text-[11px] text-theme-text-muted">展示当前阶段子任务记录的结构化输出合约；原始 JSON 见下方。</div>
                                                <div className="mt-3 space-y-2">
                                                  {contractRows.output.length > 0 ? contractRows.output.map((row) => (
                                                    <div key={`${item.id}-output-${row.label}`} className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2">
                                                      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-theme-text-muted">{row.label}</div>
                                                      {renderStageItemDetailValue(row.label, row.value, projectId)}
                                                    </div>
                                                  )) : (
                                                    <div className="rounded-xl border border-dashed border-theme-border bg-theme-surface px-3 py-3 text-xs text-theme-text-muted">
                                                      当前子任务未记录结构化输出 Contract。
                                                    </div>
                                                  )}
                                                </div>
                                                {(item.output_ref || item.result) ? (
                                                  <details className="mt-3">
                                                    <summary className="cursor-pointer text-xs font-bold text-theme-text-muted hover:text-theme-text-primary">
                                                      查看原始 JSON
                                                    </summary>
                                                    <div className="mt-2 space-y-2">
                                                      {item.output_ref ? (
                                                        <div>
                                                          <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-theme-text-muted">output_ref</div>
                                                          <pre className="max-h-56 overflow-auto rounded-xl border border-theme-border bg-theme-surface px-3 py-3 text-xs leading-6 text-theme-text-primary">
                                                            {JSON.stringify(item.output_ref, null, 2)}
                                                          </pre>
                                                        </div>
                                                      ) : null}
                                                      {item.result ? (
                                                        <div>
                                                          <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-theme-text-muted">result</div>
                                                          <pre className="max-h-56 overflow-auto rounded-xl border border-theme-border bg-theme-surface px-3 py-3 text-xs leading-6 text-theme-text-primary">
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
            effectiveDetail ? <OrchestrationObservabilityPanel detail={effectiveDetail} /> : null
          ) : null}

          {activeTab === 'modules' ? (
            <div className="space-y-6">
 <section className={`binary-security-modules-confirmation rounded-xl border p-6 ${requiresModuleConfirmation ? 'border-amber-500/20 bg-amber-50/70' : 'border-theme-border bg-theme-surface'}`}>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-theme-text-primary">{isBinaryModuleTask ? '模块输入' : '模块确认'}</h2>
                    <p className="mt-1 text-sm text-theme-text-secondary">
                      {isBinaryModuleTask
                        ? '当前任务绕过系统分析，直接以手工输入的单模块多 ELF 作为后续阶段的统一输入。'
                        : requiresModuleConfirmation
                        ? '系统分析已经产出可推进模块。请确认需要继续推进的数据范围，确认后任务会继续进入后续阶段。'
                        : '展示系统分析产出的全部模块、候选推进模块和当前已确认模块。'}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-2xl bg-theme-surface px-3 py-2.5 text-xs text-theme-text-secondary">
                      <div className="text-theme-text-muted">全部模块</div>
                      <div className="mt-1 text-lg font-semibold text-theme-text-primary">{systemAnalysisModuleCount}</div>
                    </div>
                    <div className="rounded-2xl bg-theme-surface px-3 py-2.5 text-xs text-theme-text-secondary">
                      <div className="text-theme-text-muted">候选模块</div>
                      <div className="mt-1 text-lg font-semibold text-theme-text-primary">{candidateModules.length || detail.candidate_module_count || 0}</div>
                    </div>
                    <div className="rounded-2xl bg-theme-surface px-3 py-2.5 text-xs text-theme-text-secondary">
                      <div className="text-theme-text-muted">已选模块</div>
                      <div className="mt-1 text-lg font-semibold text-theme-text-primary">{selectedModules.length || detail.selected_module_count || 0}</div>
                    </div>
                    <div className="rounded-2xl bg-theme-surface px-3 py-2.5 text-xs text-theme-text-secondary">
                      <div className="text-theme-text-muted">风险等级</div>
                      <div className="mt-1 text-sm font-semibold text-theme-text-primary">{moduleRiskLevels.join(' / ') || '-'}</div>
                    </div>
                  </div>
                </div>
                {requiresModuleConfirmation ? (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <span className="rounded-full border border-amber-500/20 bg-theme-bg-app px-3 py-2 text-xs font-bold text-amber-400">
                      当前已勾选 {selectedModuleKeys.length} 个模块
                    </span>
                    <button
                      type="button"
                      onClick={selectAllVisibleModules}
                      disabled={selectableModuleKeys.length === 0}
                      className="rounded-full border border-theme-border bg-theme-bg-app px-3 py-2 text-xs font-semibold text-theme-text-secondary"
                    >
                      全选全部模块
                    </button>
                    <button
                      type="button"
                      onClick={clearAllSelectedModules}
                      disabled={selectedModuleKeys.length === 0}
                      className="rounded-full border border-theme-border bg-theme-bg-app px-3 py-2 text-xs font-semibold text-theme-text-secondary"
                    >
                      清空勾选
                    </button>
                    <button
                      type="button"
                      onClick={() => void confirmModuleSelection()}
                      title={moduleConfirmSupported ? undefined : (manualOperationState?.blocking_reason || '当前任务暂不可确认模块')}
                      disabled={actionLoading !== '' || selectedModuleKeys.length === 0 || !moduleConfirmSupported}
                      className="rounded-xl bg-theme-surface px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                    >
                      {actionLoading === 'confirm-modules' ? '确认中...' : '确认并继续'}
                    </button>
                  </div>
                ) : null}
              </section>

              {moduleSelectionLoading ? (
 <section className="rounded-xl border border-theme-border bg-theme-surface p-6 text-sm text-theme-text-muted">正在加载模块确认信息...</section>
              ) : !moduleSelection ? (
 <section className="rounded-xl border border-dashed border-theme-border bg-theme-surface px-6 py-12 text-center text-sm text-theme-text-muted">
                  {isBinaryModuleTask ? '当前任务未生成额外模块表数据，可继续通过总览与阶段详情查看该模块的 ELF 输入和执行进度。' : '当前任务尚未生成可展示的模块确认数据。'}
                </section>
              ) : (
                renderModuleTable(
                  overviewModuleRows,
                  isBinaryModuleTask ? '当前任务未生成可展示的模块输入表。' : '当前任务尚未生成可展示的全部模块表。',
                )
              )}
            </div>
          ) : null}

          {activeTab === 'modules' && (detail?.status === 'pending_entry_confirmation' || entrySelection) ? (
 <section className="rounded-xl border border-amber-500/20 bg-amber-50/70 p-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-theme-text-primary">入口确认</h2>
                  <p className="mt-1 text-sm text-theme-text-secondary">入口分析已完成，当前需要确认候选入口函数后，任务才会继续进入数据流分析。</p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-2xl bg-theme-surface px-3 py-2.5 text-xs text-theme-text-secondary">
                    <div className="text-theme-text-muted">候选入口</div>
                    <div className="mt-1 text-lg font-semibold text-theme-text-primary">{entrySelection?.candidate_entries.length || detail?.candidate_entry_count || 0}</div>
                  </div>
                  <div className="rounded-2xl bg-theme-surface px-3 py-2.5 text-xs text-theme-text-secondary">
                    <div className="text-theme-text-muted">已勾选</div>
                    <div className="mt-1 text-lg font-semibold text-theme-text-primary">{selectedEntryKeys.length}</div>
                  </div>
                  <div className="rounded-2xl bg-theme-surface px-3 py-2.5 text-xs text-theme-text-secondary">
                    <div className="text-theme-text-muted">选择模式</div>
                    <div className="mt-1 text-sm font-semibold text-theme-text-primary">{entrySelection?.selection_mode === 'manual_confirm' ? '人工确认' : '自动选择'}</div>
                  </div>
                  <div className="rounded-2xl bg-theme-surface px-3 py-2.5 text-xs text-theme-text-secondary">
                    <div className="text-theme-text-muted">状态</div>
                    <div className="mt-1 text-sm font-semibold text-theme-text-primary">{entrySelectionLoading ? '加载中...' : (entrySelection?.requires_confirmation ? '等待确认' : '自动推进')}</div>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => setSelectedEntryKeys((entrySelection?.candidate_entries || []).map((item) => String(item.entry_key || '').trim()).filter(Boolean))} className="rounded-full border border-theme-border bg-theme-bg-app px-3 py-2 text-xs font-semibold text-theme-text-secondary">全选候选入口</button>
                <button type="button" onClick={() => setSelectedEntryKeys([])} className="rounded-full border border-theme-border bg-theme-bg-app px-3 py-2 text-xs font-semibold text-theme-text-secondary">清空勾选</button>
                <button type="button" onClick={() => void confirmEntrySelection()} disabled={actionLoading === 'confirm-entries' || selectedEntryKeys.length === 0 || !entryConfirmSupported} className="rounded-xl bg-theme-surface px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
                  {actionLoading === 'confirm-entries' ? '确认中...' : '确认并继续'}
                </button>
              </div>
              <div className="mt-4 grid gap-3">
                {(entrySelection?.candidate_entries || []).map((entry) => {
                  const key = String(entry.entry_key || '').trim();
                  const checked = selectedEntryKeys.includes(key);
                  return (
                    <label key={key ||`${entry.module_key}-${entry.function_name}`} className="rounded-2xl border border-theme-border bg-theme-surface px-4 py-3">
                      <div className="flex items-start gap-3">
                        <input type="checkbox" checked={checked} onChange={(event) => setSelectedEntryKeys((current) => event.target.checked ? (current.includes(key) ? current : current.concat(key)) : current.filter((item) => item !== key))} />
                        <div className="min-w-0">
                          <div className="font-semibold text-theme-text-primary">{entry.function_name || '-'}</div>
                          <div className="mt-1 text-xs text-theme-text-muted break-all">{entry.module_name || '-'} · {entry.definition_file || entry.file_name || '-'}{entry.definition_line ?`:${entry.definition_line}` : ''}</div>
                          <div className="mt-2 text-xs text-theme-text-secondary">{entry.entry_reason || '-'}</div>
                        </div>
                      </div>
                    </label>
                  );
                })}
                {entrySelectionLoading || (entrySelection?.candidate_entries || []).length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-theme-border bg-theme-surface px-6 py-10 text-center text-sm text-theme-text-muted">
                    {entrySelectionLoading ? '正在加载入口候选...' : '暂无入口候选'}
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {activeTab === 'timeline' ? (
 <section className="rounded-xl border border-theme-border bg-theme-surface p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-theme-text-primary">事件时间线</h2>
                <p className="mt-1 text-sm text-theme-text-muted">按时间顺序展示最近 80 条编排事件</p>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <div className="rounded-2xl border border-theme-border bg-theme-surface px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-theme-text-muted">总事件数</div>
                  <div className="mt-1 text-lg font-semibold text-theme-text-primary">{timelineTotal}</div>
                </div>
                <div className="rounded-2xl border border-theme-border bg-theme-surface px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-theme-text-muted">展示区间</div>
                  <div className="mt-1 text-sm font-bold text-theme-text-secondary">{pagedTimelineItems.length > 0 ?`${fmtTime(pagedTimelineItems[0].created_at)} -> ${fmtTime(pagedTimelineItems[pagedTimelineItems.length - 1].created_at)}` : '-'}</div>
                </div>
                <div className="rounded-2xl border border-theme-border bg-theme-surface px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-theme-text-muted">分页</div>
                  <div className="mt-1 text-sm font-bold text-theme-text-secondary">
                    {timelineRangeStart}-{timelineRangeEnd} / {timelineTotal}
                  </div>
                </div>
                <label className="rounded-2xl border border-theme-border bg-theme-surface px-3 py-2 text-xs font-bold text-theme-text-muted">
                  <span className="mr-2 uppercase tracking-[0.16em] text-theme-text-muted">每页</span>
                  <select
                    value={timelinePageSize}
                    onChange={(event) => {
                      const next = Math.min(2000, Math.max(200, Number(event.target.value) || 200));
                      setTimelinePageSize(next);
                    }}
                    className="rounded-lg border border-theme-border bg-theme-bg-app px-2 py-1 text-sm font-bold text-theme-text-secondary outline-none"
                  >
                    {[200, 500, 1000, 2000].map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => void loadTimeline(timelinePage, timelinePageSize)}
                  disabled={timelineClearing || timelineLoading}
                  className="inline-flex items-center gap-2 rounded-2xl border border-theme-border bg-theme-surface px-4 py-3 text-sm font-semibold text-theme-text-secondary transition hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {timelineLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  刷新时间线
                </button>
                <button
                  type="button"
                  onClick={() => void clearTimeline()}
                  disabled={timelineClearing || timelineLoading || timelineTotal === 0}
                  className="inline-flex items-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-400 transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {timelineClearing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  清空时间线
                </button>
              </div>
            </div>

            <div className="mt-4">
              {timelineLoading ? (
                <div className="rounded-2xl border border-theme-border bg-theme-surface px-6 py-10 text-center text-sm text-theme-text-muted">
                  正在加载事件时间线...
                </div>
              ) : timelineItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-theme-border bg-theme-surface px-6 py-10 text-center text-sm text-theme-text-muted">
                  暂无事件
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-theme-border">
                  <div className="overflow-x-auto">
                    <table className="min-w-[1080px] w-full divide-y divide-theme-border text-left text-xs">
                      <thead className="bg-theme-bg-app text-[11px] font-semibold uppercase tracking-[0.12em] text-theme-text-muted">
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
                      <tbody className="divide-y divide-theme-border bg-theme-bg-app">
                        {pagedTimelineItems.map((event) => {
                          const expanded = expandedEventKey === event._key;
                          const isAbnormalReasonEvent = event.event_type === 'abnormal_reason_recorded';
                          return (
                            <React.Fragment key={event._key}>
                              <tr className={`align-middle hover:bg-slate-100/80 ${isAbnormalReasonEvent ? 'bg-amber-50/40' : ''}`}>
                                <td className="px-3 py-2 font-mono text-[11px] font-bold text-theme-text-muted">#{event._index}</td>
                                <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] font-semibold text-theme-text-secondary">
                                  {fmt(event.created_at)}
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex max-w-[220px] flex-wrap items-center gap-1">
                                    {event._eventCategory ? (
                                      <span className={`inline-flex max-w-[120px] items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${event._eventCategory.tone}`}>
                                        <span className="truncate">{event._eventCategory.label}</span>
                                      </span>
                                    ) : null}
                                    <span className={`inline-flex max-w-[160px] items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                                      isAbnormalReasonEvent
                                        ? 'border-amber-500/20 bg-amber-500/15 text-amber-400'
                                        : event._eventCategory?.tone || 'border-sky-500/20 bg-sky-500/15 text-sky-400'
                                    }`}>
                                      <span className="truncate">{event._eventLabel}</span>
                                    </span>
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  {event.stage_name ? (
                                    <span className="inline-flex max-w-[110px] rounded-full border border-theme-border bg-theme-bg-app px-2 py-0.5 text-[11px] font-bold text-theme-text-secondary">
                                      <span className="truncate">{STAGE_LABELS[event.stage_name] || event.stage_name}</span>
                                    </span>
                                  ) : (
                                    <span className="text-theme-text-muted">-</span>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  <span className={`inline-flex max-w-[90px] rounded-full border px-2 py-0.5 text-[11px] font-bold ${timelineLevelTone(event.level)}`}>
                                    <span className="truncate">{formatTimelineLevelLabel(event.level)}</span>
                                  </span>
                                </td>
                                <td className="max-w-[360px] px-3 py-2">
                                  <div className="truncate font-bold text-theme-text-primary" title={event.message || '系统事件'}>
                                    {event.message || '系统事件'}
                                    {event._isCompressed ? (
                                      <span className="ml-2 rounded-full border border-amber-500/20 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                                        x{event._repeatCount}
                                      </span>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-[11px] text-theme-text-muted">
                                  <div className="space-y-1">
                                    <div className="truncate font-mono" title={event._recorderName}>
                                      记录者: {event._recorderName}{event._recorderRole ? ` · ${event._recorderRole}` : ''}
                                    </div>
                                    {event._recorderNode ? (
                                      <div className="truncate" title={event._recorderNode}>
                                        节点: {event._recorderNode}
                                      </div>
                                    ) : null}
                                    {event._showOrigin ? (
                                      <div className="truncate font-mono" title={event._originName || '-'}>
                                        来源: {event._originName || '-'}{event._originRole ? ` · ${event._originRole}` : ''}
                                      </div>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <div className="flex items-center justify-end gap-3">
                                    <button
                                      type="button"
                                      onClick={() => setExpandedEventKey(expanded ? null : event._key)}
                                      className="text-[11px] font-semibold text-theme-text-muted transition hover:text-theme-text-primary"
                                    >
                                      {expanded ? '收起' : '查看'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void deleteTimelineEvent(event.id, event._key)}
                                      disabled={deletingEventId === event.id || timelineClearing}
                                      className="text-[11px] font-semibold text-rose-400 transition hover:text-rose-400 disabled:opacity-40"
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
              {timelineTotal > 0 ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-theme-text-muted">
                    第 {normalizedTimelinePage} / {timelineTotalPages} 页{timelineHasMore ? ' · 后续仍有更多事件' : ''}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setTimelinePage((current) => Math.max(1, current - 1))}
                      disabled={normalizedTimelinePage <= 1}
                      className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-bold text-theme-text-secondary disabled:opacity-40"
                    >
                      上一页
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimelinePage((current) => Math.min(timelineTotalPages, current + 1))}
                      disabled={normalizedTimelinePage >= timelineTotalPages}
                      className="rounded-xl border border-theme-border bg-theme-surface px-3 py-2 text-sm font-bold text-theme-text-secondary disabled:opacity-40"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
          ) : null}

          {activeTab === 'api_keys' ? (
            <ApiKeysPanel detail={detail} stageSequence={stageSequence} onCopy={copyTextValue} />
          ) : null}
        </>
      ) : null}
    </div>
  );
};
