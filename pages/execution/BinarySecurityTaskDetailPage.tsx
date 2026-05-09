import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, Info, Loader2, PauseCircle, RefreshCw, Sparkles, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { BinarySecurityModuleSelection, BinarySecurityTaskDetail, BinarySecurityTaskType } from '../../clients/binarySecurity';
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
  dataflow_analysis: { supported: false, reason: '数据流分析微服务当前未实现独立任务详情页面，仅提供任务列表内嵌详情。' },
  vuln_scan: { supported: true },
};

function downstreamDetailSupport(stageName: string, downstreamTaskId?: string | null) {
  if (!downstreamTaskId?.trim()) {
    return { supported: false, reason: '该阶段子任务尚未创建下游微服务任务。' };
  }
  return DOWNSTREAM_DETAIL_SUPPORT[stageName] || { supported: false, reason: '该阶段尚未配置可跳转的微服务详情页面。' };
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
const detailCodeTone = 'max-h-56 overflow-auto rounded-xl border border-slate-200 bg-slate-950 px-3 py-3 text-xs text-slate-100';

const fmt = (value?: string | null) => (value ? new Date(value).toLocaleString() : '-');
const fmtTime = (value?: string | null) => (value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-');

const timelineGreenTone = {
  line: 'from-emerald-200 via-emerald-300 to-emerald-100',
  node: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  glow: 'shadow-emerald-100/80',
};

const inferTimelineTone = (event: any) => {
  const raw = `${event?.event_type || ''} ${event?.message || ''}`.toLowerCase();
  if (raw.includes('fail') || raw.includes('error')) {
    return {
      icon: CheckCircle2,
      ...timelineGreenTone,
    };
  }
  if (raw.includes('cancel')) {
    return {
      icon: CheckCircle2,
      ...timelineGreenTone,
    };
  }
  if (raw.includes('success') || raw.includes('complete') || raw.includes('finish')) {
    return {
      icon: CheckCircle2,
      ...timelineGreenTone,
    };
  }
  if (raw.includes('running') || raw.includes('dispatch') || raw.includes('start') || raw.includes('retry')) {
    return {
      icon: CheckCircle2,
      ...timelineGreenTone,
    };
  }
  if (raw.includes('stale')) {
    return {
      icon: CheckCircle2,
      ...timelineGreenTone,
    };
  }
  return {
    icon: Sparkles,
    ...timelineGreenTone,
  };
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

type DetailTab = 'overview' | 'stages' | 'timeline' | 'artifacts';

export const BinarySecurityTaskDetailPage: React.FC<Props> = ({ projectId, taskId, taskType, onBack }) => {
  const executionApi = api.domains.execution;
  const navigate = useNavigate();
  const stageFlowRef = useRef<HTMLDivElement | null>(null);
  const [detail, setDetail] = useState<BinarySecurityTaskDetail | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [artifacts, setArtifacts] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [moduleSelectionLoading, setModuleSelectionLoading] = useState(false);
  const [moduleSelection, setModuleSelection] = useState<BinarySecurityModuleSelection | null>(null);
  const [selectedModuleKeys, setSelectedModuleKeys] = useState<string[]>([]);
  const [actionLoading, setActionLoading] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [selectedStage, setSelectedStage] = useState<string>(DEFAULT_BINARY_STAGE_SEQUENCE[0]);
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
    if (activeTab !== 'stages' || !detail || !projectId || !selectedStage) return;
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
  }, [activeTab, detail, projectId, selectedStage]);

  useEffect(() => {
    const node = stageFlowRef.current;
    if (!node) return;

    const updateLayout = () => {
      const width = node.clientWidth;
      if (!width) return;
      if (isSourceTask) {
        const compactCardWidth = 156;
        const compactConnectorWidth = 28;
        const compactTotalWidth = compactCardWidth * stageSequence.length + compactConnectorWidth * Math.max(0, stageSequence.length - 1);
        if (width < Math.min(760, compactTotalWidth)) {
          setStageFlowLayout({
            mode: 'vertical',
            cardWidth: Math.max(0, width),
            connectorWidth: 32,
          });
          return;
        }
        setStageFlowLayout({
          mode: 'horizontal',
          cardWidth: compactCardWidth,
          connectorWidth: compactConnectorWidth,
        });
        return;
      }
      const compactCardWidth = 156;
      const compactConnectorWidth = 28;
      const compactTotalWidth = compactCardWidth * stageSequence.length + compactConnectorWidth * Math.max(0, stageSequence.length - 1);
      if (width < compactTotalWidth) {
        setStageFlowLayout({
          mode: 'vertical',
          cardWidth: Math.max(0, width),
          connectorWidth: 32,
        });
        return;
      }

      setStageFlowLayout({
        mode: 'horizontal',
        cardWidth: compactCardWidth,
        connectorWidth: compactConnectorWidth,
      });
    };

    updateLayout();
    const observer = new ResizeObserver(() => updateLayout());
    observer.observe(node);
    return () => observer.disconnect();
  }, [activeTab, isSourceTask, stageSequence]);

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

  const stageCards = useMemo(() => {
    const summaryMap = new Map((detail?.stage_summaries || []).map((stage) => [stage.stage_name, stage]));
    const itemStats = detail?.item_stats || {};
    return stageSequence.map((stageName, index) => {
      const summary = summaryMap.get(stageName);
      const counts = itemStats[stageName] || {};
      const inferredStatus = counts.total && counts.failed && !counts.running
        ? 'failed'
        : counts.total && counts.success === counts.total
          ? 'success'
          : detail?.status === 'running' && detail?.current_stage === stageName
            ? 'running'
            : 'pending';
      return {
        stage_name: stageName,
        sequence_no: index + 1,
        label: STAGE_LABELS[stageName] || stageName,
        status: summary?.status || inferredStatus,
        total_items: summary?.total_items ?? counts.total ?? 0,
        success_items: summary?.success_items ?? counts.success ?? 0,
        failed_items: summary?.failed_items ?? counts.failed ?? 0,
        skipped_items: summary?.skipped_items ?? counts.skipped ?? 0,
        running_items: summary?.running_items ?? counts.running ?? 0,
        last_error: summary?.last_error ?? null,
        has_run: Boolean(summary),
        retryable: Boolean(summary?.retry_supported),
        retry_reason: summary?.retry_reason ?? null,
        stale: staleStages.has(stageName),
      };
    });
  }, [detail, stageSequence]);

  const selectedStageCard = useMemo(
    () => stageCards.find((stage) => stage.stage_name === selectedStage) || null,
    [selectedStage, stageCards],
  );
  const requiresModuleConfirmation = detail?.status === 'pending_module_confirmation' && Boolean(moduleSelection?.requires_confirmation);

  const filteredStageItems = useMemo(() => {
    if (!detail) return [];
    return detail.stage_items.filter((item) => item.stage_name === selectedStage);
  }, [detail, selectedStage]);

  const timelineItems = useMemo(() => {
    const events = timeline.slice(-80);
    return events.map((event, index) => ({
      ...event,
      _key: event.id || `${event.event_type || 'event'}-${event.created_at || index}-${index}`,
      _index: index + 1,
      _tone: inferTimelineTone(event),
    }));
  }, [timeline]);

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
          <pre className={detailCodeTone}>{JSON.stringify(task.result_json || {}, null, 2)}</pre>
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
          <pre className={detailCodeTone}>{JSON.stringify(task.result_json || {}, null, 2)}</pre>
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
          <pre className={detailCodeTone}>{JSON.stringify(task.result_json || {}, null, 2)}</pre>
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
        <pre className={detailCodeTone}>{JSON.stringify(task.task_metadata || {}, null, 2)}</pre>
      </div>
    );
  };

  if (!taskId) {
    return <div className="px-8 pb-10 pt-8 text-sm text-slate-500">未指定任务。</div>;
  }

  const tabs: Array<{ key: DetailTab; label: string; hint: string }> = [
    { key: 'overview', label: '总览', hint: '任务基础信息与模块确认' },
    { key: 'stages', label: '阶段任务', hint: '阶段图与下游子任务' },
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
            <div className="grid gap-2 md:grid-cols-4">
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
              <p className="mt-2 text-sm text-slate-500">当前页只加载任务主详情。阶段子任务、事件记录和产物文件会在打开对应 Tab 后再请求后端。</p>
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

          {activeTab === 'stages' ? (
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
                {stageCards.map((stage, index) => (
                  <React.Fragment key={stage.stage_name}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedStage(stage.stage_name)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedStage(stage.stage_name);
                        }
                      }}
                      style={stageFlowLayout.mode === 'horizontal' ? { width: `${stageFlowLayout.cardWidth}px` } : undefined}
                      className={`rounded-[1.75rem] border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none ${stageFlowLayout.mode === 'horizontal' ? 'shrink-0' : 'w-full'} ${stageNodeTone(stage.status, selectedStage === stage.stage_name)}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-black uppercase tracking-[0.24em] opacity-60">Stage {stage.sequence_no}</div>
                          <div className="mt-2 text-base font-black">{stage.label}</div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <div className="h-3 w-3 rounded-full border border-current bg-current/15" />
                          {stage.stale ? (
                            <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">
                              已过期
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-semibold">
                        <div>总数 {stage.total_items}</div>
                        <div>成功 {stage.success_items}</div>
                        <div>失败 {stage.failed_items}</div>
                        <div>运行 {stage.running_items}</div>
                      </div>
                      <div className="mt-3 rounded-full border border-current/20 bg-white/60 px-3 py-1 text-center text-[11px] font-black">
                        {stage.status}
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
                          title={stage.retryable ? undefined : stage.retry_reason || '当前阶段不可安全重试'}
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
                      {!stage.retryable && stage.retry_reason ? (
                        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
                          {stage.retry_reason}
                        </div>
                      ) : null}
                    </div>
                    {index < stageCards.length - 1 ? (
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
                <h2 className="text-xl font-black text-slate-900">阶段子任务</h2>
                <p className="mt-1 text-sm text-slate-500">
                  当前筛选：
                  <span className="ml-2 font-bold text-slate-900">{STAGE_LABELS[selectedStage] || selectedStage}</span>
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
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
                  title={detailSupport.supported ? '打开微服务任务详情' : detailSupport.reason}
                  onClick={detailSupport.supported ? () => openDownstreamTaskDetail(item) : undefined}
                  onKeyDown={detailSupport.supported ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openDownstreamTaskDetail(item);
                    }
                  } : undefined}
                  className={`rounded-[1.5rem] border p-5 transition ${detailSupport.supported ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md focus:outline-none' : ''} ${stageItemTone(item.stage_name === selectedStage)}`}
                >
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                              {STAGE_LABELS[item.stage_name] || item.stage_name}
                            </span>
                            <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusTone(item.status)}`}>{item.status}</span>
                          </div>
                          <div className="mt-3 text-base font-black text-slate-900">
                            {item.item_name || item.item_key}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                            {fmt(item.started_at)} {'->'} {fmt(item.finished_at)}
                          </div>
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
                              查看微服务详情
                            </button>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-500"
                              title={detailSupport.reason}
                            >
                              <Info className="h-3.5 w-3.5" />
                              不支持跳转详情
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-1 gap-3 text-xs text-slate-600 xl:grid-cols-2">
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <span className="text-slate-400">下游服务</span>
                          <div className="mt-1 font-mono text-slate-800">{item.downstream_service || '-'}</div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <span className="text-slate-400">下游任务 ID</span>
                          <div className="mt-1 break-all font-mono text-slate-800">{item.downstream_task_id || '-'}</div>
                        </div>
                      </div>
                      {item.error_message ? (
                        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                          {item.error_message}
                        </div>
                      ) : null}
                      {!detailSupport.supported ? (
                        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                          {detailSupport.reason}
                        </div>
                      ) : null}
                      <div className="mt-4">
                        {renderDownstreamDetail(item)}
                      </div>
                    </div>
                  </div>
                </div>
                );
              })}
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
              <div className="flex flex-wrap gap-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">总事件数</div>
                  <div className="mt-1 text-lg font-black text-slate-900">{timeline.length}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">展示区间</div>
                  <div className="mt-1 text-sm font-bold text-slate-700">{timelineItems.length > 0 ? `${fmtTime(timelineItems[0].created_at)} -> ${fmtTime(timelineItems[timelineItems.length - 1].created_at)}` : '-'}</div>
                </div>
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
                <div className="relative pl-2">
                  <div className="absolute bottom-0 left-[19px] top-0 w-px bg-gradient-to-b from-slate-200 via-slate-300 to-slate-200" />
                  <div className="space-y-2.5">
                    {timelineItems.map((event) => {
                      const tone = event._tone;
                      const Icon = tone.icon;
                      const isRunningTone = Icon === Loader2;
                      return (
                        <div key={event._key} className="relative flex gap-3">
                          <div className="relative z-10 flex w-10 shrink-0 justify-center">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-2xl border shadow-lg ${tone.node} ${tone.glow}`}>
                              <Icon size={14} className={isRunningTone ? 'animate-spin' : ''} />
                            </div>
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className={`rounded-[1.25rem] border bg-white px-4 py-2.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md`}>
                              <div className="flex items-center gap-2.5">
                                <div className="min-w-0 flex flex-1 items-center gap-2 overflow-hidden">
                                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${tone.badge}`}>
                                      {event.event_type || 'event'}
                                    </span>
                                    {event.stage_name ? (
                                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                                        {STAGE_LABELS[event.stage_name] || event.stage_name}
                                      </span>
                                    ) : null}
                                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500">
                                      #{event._index}
                                    </span>
                                  </div>
                                  <div className="min-w-0 truncate text-sm font-black text-slate-900">
                                    {event.message || '系统事件'}
                                  </div>
                                </div>
                                <div className="shrink-0 text-right">
                                  <div className="text-xs font-black text-slate-700">{fmtTime(event.created_at)}</div>
                                  <div className="text-[10px] text-slate-500">{fmt(event.created_at)}</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
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
